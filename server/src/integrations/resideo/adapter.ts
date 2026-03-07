import { ResultAsync, okAsync } from 'neverthrow'

import type { DeviceAdapter, DeviceState, DiscoveredDevice } from '../types'

import { log } from '../../lib/logger'
import { parseJson } from '../../lib/parse-json'
import { apiToCelsius, celsiusToApi, type TemperatureUnit } from '../../lib/unit-conversions'
import { getOAuthConfig } from '../registry'

const DATA_TIMEOUT = 10_000
const TOKEN_TIMEOUT = 15_000
const BASE_URL = 'https://api.honeywellhome.com'

// ─── Session type ────────────────────────────────────────────────────────────

interface ResideoSession {
	accessToken: string
	refreshToken: string
	expiresAt: number // unix ms
}

// ─── API response types ──────────────────────────────────────────────────────

interface ResideoLocation {
	locationID: number
	name: string
	devices: ResideoDevice[]
}

interface ResideoDevice {
	deviceID: string
	deviceClass: string
	deviceModel: string
	userDefinedDeviceName: string
	name: string
	isAlive: boolean
	indoorTemperature: number
	indoorHumidity: number
	units: string
	allowedModes: string[]
	minHeatSetpoint: number
	maxHeatSetpoint: number
	minCoolSetpoint: number
	maxCoolSetpoint: number
	deadband: number
	changeableValues: {
		mode: string
		heatSetpoint: number
		coolSetpoint: number
		autoChangeoverActive: boolean
		thermostatSetpointStatus?: string
		heatCoolMode?: string
	}
}

interface TokenResponse {
	access_token: string
	refresh_token: string
	expires_in: number | string
}

type ResideoDeviceClass = 'tcc' | 'lcc' | 'unknown'

// ─── Helpers ─────────────────────────────────────────────────────────────────

class TokenExpiredError extends Error {
	constructor(message = 'Resideo refresh token invalid — re-authorization required') {
		super(message)
		this.name = 'TokenExpiredError'
	}
}

class HttpError extends Error {
	status: number
	constructor(status: number, message?: string) {
		super(message ?? `HTTP ${status}`)
		this.name = 'HttpError'
		this.status = status
	}
}

function classifyDevice(deviceModel: string): ResideoDeviceClass {
	switch (deviceModel) {
		case 'Round':
		case 'D6':
			return 'tcc'
		case 'Unknown':
			return 'unknown'
		default:
			return 'lcc'
	}
}

function parseExternalId(externalId: string): { locationId: string; deviceId: string } {
	const idx = externalId.indexOf('::')
	if (idx === -1) throw new Error(`Invalid externalId format: ${externalId}`)
	return { locationId: externalId.slice(0, idx), deviceId: externalId.slice(idx + 2) }
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class ResideoAdapter implements DeviceAdapter {
	readonly brand = 'resideo'
	readonly displayName = 'Resideo (Honeywell Home)'
	readonly discoveryMethod = 'cloud' as const

	private _session: ResideoSession | null
	private refreshLock: Promise<void> | null = null

	constructor(_config: Record<string, string>, session?: string | null) {
		this._session = this.parseSession(session ?? null)
	}

	get session(): string | null {
		return this._session ? JSON.stringify(this._session) : null
	}

	validateCredentials(): ResultAsync<void, Error> {
		// oauth brands don't have manual credentials — this is a no-op
		return okAsync(undefined)
	}

	discover(): ResultAsync<DiscoveredDevice[], Error> {
		return ResultAsync.fromPromise(
			this.fetchDevices(),
			(e) => new Error(`Resideo discovery failed: ${(e as Error).message}`),
		)
	}

	getState(externalId: string): ResultAsync<DeviceState, Error> {
		return ResultAsync.fromPromise(
			this.fetchDeviceState(externalId),
			(e) => new Error(`Resideo state error: ${(e as Error).message}`),
		)
	}

	setState(externalId: string, state: Partial<DeviceState>): ResultAsync<void, Error> {
		return ResultAsync.fromPromise(
			this.controlDevice(externalId, state),
			(e) => {
				if (e instanceof TokenExpiredError) {
					return new Error(`resideo:auth_error:${e.message}`)
				}
				return new Error(`Resideo control error: ${(e as Error).message}`)
			},
		)
	}

	// ─── Private: session management ─────────────────────────────────────────

	private parseSession(raw: string | null): ResideoSession | null {
		if (!raw) return null
		const result = parseJson<ResideoSession>(raw)
		if (result.isErr()) return null
		const s = result.value
		if (!s.accessToken || !s.refreshToken || typeof s.expiresAt !== 'number') return null
		return s
	}

	private shouldRefresh(): boolean {
		if (!this._session) return false
		// refresh when less than 2 minutes remain
		return Date.now() >= this._session.expiresAt - 120_000
	}

	private async ensureValidToken(): Promise<void> {
		if (!this._session) throw new TokenExpiredError('No session — re-authorization required')

		if (!this.shouldRefresh()) return

		try {
			await this.acquireAndRefresh()
		} catch (e) {
			// if access token is still valid, continue — retry refresh next cycle
			if (this._session && Date.now() < this._session.expiresAt) {
				log.warn('resideo: proactive refresh failed, continuing with current token', {
					error: e instanceof Error ? e.message : String(e),
				})
				return
			}
			throw e
		}
	}

	private async acquireAndRefresh(): Promise<void> {
		if (this.refreshLock) {
			await this.refreshLock
			return
		}
		this.refreshLock = this.doRefresh()
		try {
			await this.refreshLock
		} finally {
			this.refreshLock = null
		}
	}

	private async doRefresh(): Promise<void> {
		const oauth = getOAuthConfig('resideo')
		if (!oauth || !this._session) {
			throw new TokenExpiredError('Cannot refresh — missing OAuth config or session')
		}

		const basicAuth = Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString('base64')
		const res = await fetch(oauth.tokenUrl, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${basicAuth}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: this._session.refreshToken,
			}),
			signal: AbortSignal.timeout(TOKEN_TIMEOUT),
		})

		if (!res.ok) {
			const body = await res.text()
			if (res.status === 400 && body.includes('invalid_grant')) {
				this._session = null
				throw new TokenExpiredError()
			}
			throw new Error(`Token refresh failed: ${res.status} ${body}`)
		}

		const data = (await res.json()) as TokenResponse
		const expiresIn = typeof data.expires_in === 'string' ? Number.parseInt(data.expires_in, 10) : data.expires_in

		this._session = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() + expiresIn * 1000,
		}
	}

	private async withTokenRetry<T>(fn: (session: ResideoSession) => Promise<T>): Promise<T> {
		await this.ensureValidToken()
		const session = this._session!

		try {
			return await fn(session)
		} catch (e) {
			if (e instanceof TokenExpiredError) throw e

			if (e instanceof HttpError && e.status === 401) {
				await this.acquireAndRefresh()
				return fn(this._session!)
			}

			throw e
		}
	}

	private apiKey(): string {
		return getOAuthConfig('resideo')?.clientId ?? ''
	}

	private locationsUrl(): string {
		return `${BASE_URL}/v2/locations?apikey=${this.apiKey()}`
	}

	private thermostatUrl(deviceId: string, locationId: string): string {
		return `${BASE_URL}/v2/devices/thermostats/${deviceId}?apikey=${this.apiKey()}&locationId=${locationId}`
	}

	// ─── Private: API calls ──────────────────────────────────────────────────

	private async fetchDevices(): Promise<DiscoveredDevice[]> {
		return this.withTokenRetry(async (session) => {
			const res = await fetch(
				this.locationsUrl(),
				{
					headers: { Authorization: `Bearer ${session.accessToken}` },
					signal: AbortSignal.timeout(DATA_TIMEOUT),
				},
			)

			if (res.status === 401) throw new HttpError(401)
			if (!res.ok) throw new Error(`Resideo locations error: ${res.status}`)

			const locations = (await res.json()) as ResideoLocation[]
			const results: DiscoveredDevice[] = []

			for (const location of locations) {
				for (const device of location.devices) {
					if (device.deviceClass !== 'Thermostat') continue

					const units = (device.units ?? 'Fahrenheit') as TemperatureUnit
					const mode = device.changeableValues?.mode?.toLowerCase() ?? 'off'

					// pick the right setpoint based on mode
					let targetRaw: number
					if (mode === 'cool') {
						targetRaw = device.changeableValues?.coolSetpoint ?? 0
					} else {
						targetRaw = device.changeableValues?.heatSetpoint ?? 0
					}

					const state: DeviceState = {
						on: mode !== 'off',
						temperature: apiToCelsius(device.indoorTemperature, units),
						humidity: device.indoorHumidity ?? undefined,
						targetTemperature: apiToCelsius(targetRaw, units),
						mode,
					}

					results.push({
						externalId: `${location.locationID}::${device.deviceID}`,
						name: device.userDefinedDeviceName || device.name,
						type: 'thermostat',
						state,
						online: device.isAlive,
						metadata: {
							locationId: String(location.locationID),
							deviceId: device.deviceID,
							deviceModel: device.deviceModel,
							units,
						},
					})
				}
			}

			return results
		})
	}

	private async fetchDeviceState(externalId: string): Promise<DeviceState> {
		return this.withTokenRetry(async (session) => {
			const { locationId, deviceId } = parseExternalId(externalId)

			const res = await fetch(
				this.thermostatUrl(deviceId, locationId),
				{
					headers: { Authorization: `Bearer ${session.accessToken}` },
					signal: AbortSignal.timeout(DATA_TIMEOUT),
				},
			)

			if (res.status === 401) throw new HttpError(401)
			if (!res.ok) throw new Error(`Resideo device state error: ${res.status}`)

			const device = (await res.json()) as ResideoDevice
			const units = (device.units ?? 'Fahrenheit') as TemperatureUnit
			const mode = device.changeableValues?.mode?.toLowerCase() ?? 'off'

			let targetRaw: number
			if (mode === 'cool') {
				targetRaw = device.changeableValues?.coolSetpoint ?? 0
			} else {
				targetRaw = device.changeableValues?.heatSetpoint ?? 0
			}

			return {
				on: mode !== 'off',
				temperature: apiToCelsius(device.indoorTemperature, units),
				humidity: device.indoorHumidity ?? undefined,
				targetTemperature: apiToCelsius(targetRaw, units),
				mode,
			}
		})
	}

	private async controlDevice(externalId: string, state: Partial<DeviceState>): Promise<void> {
		await this.withTokenRetry(async (session) => {
			const { locationId, deviceId } = parseExternalId(externalId)

			// GET current state to build the full payload
			const getRes = await fetch(
				this.thermostatUrl(deviceId, locationId),
				{
					headers: { Authorization: `Bearer ${session.accessToken}` },
					signal: AbortSignal.timeout(DATA_TIMEOUT),
				},
			)

			if (getRes.status === 401) throw new HttpError(401)
			if (!getRes.ok) throw new Error(`Resideo GET state error: ${getRes.status}`)

			const device = (await getRes.json()) as ResideoDevice
			const units = (device.units ?? 'Fahrenheit') as TemperatureUnit
			const cv = device.changeableValues
			const deviceClass = classifyDevice(device.deviceModel)

			// start with current values
			const payload: Record<string, unknown> = {
				mode: state.mode ? capitalize(state.mode) : cv.mode,
				heatSetpoint: cv.heatSetpoint,
				coolSetpoint: cv.coolSetpoint,
				autoChangeoverActive: cv.autoChangeoverActive,
			}

			// update setpoints if targetTemperature provided
			if (state.targetTemperature !== undefined) {
				const apiValue = celsiusToApi(state.targetTemperature, units)
				const effectiveMode = (payload.mode as string).toLowerCase()

				if (effectiveMode === 'cool') {
					payload.coolSetpoint = Math.max(device.minCoolSetpoint, Math.min(device.maxCoolSetpoint, apiValue))
				} else {
					// heat, auto, or off — set heat setpoint
					payload.heatSetpoint = Math.max(device.minHeatSetpoint, Math.min(device.maxHeatSetpoint, apiValue))
				}
			}

			// handle auto mode via autoChangeoverActive for TCC
			const effectiveMode = (payload.mode as string).toLowerCase()
			if (effectiveMode === 'auto' && deviceClass === 'tcc') {
				payload.autoChangeoverActive = true
			}

			// device-class-specific fields
			if (deviceClass === 'lcc') {
				payload.thermostatSetpointStatus = 'PermanentHold'
			}
			// TCC: do NOT send thermostatSetpointStatus

			// POST the update
			const postRes = await fetch(
				this.thermostatUrl(deviceId, locationId),
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${session.accessToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(payload),
					signal: AbortSignal.timeout(DATA_TIMEOUT),
				},
			)

			if (postRes.status === 401) throw new HttpError(401)
			if (!postRes.ok) {
				const body = await postRes.text()
				throw new Error(`Resideo setState error: ${postRes.status} ${body}`)
			}
		})
	}
}
