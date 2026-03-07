import { ResultAsync, errAsync, okAsync } from 'neverthrow'

import type { DeviceAdapter, DeviceState, DiscoveredDevice } from '../types'
import type { SmartHQDeviceDetail, SmartHQDeviceListResponse, SmartHQSession } from './types'

import { log } from '../../lib/logger'
import { mapSmartHQDeviceType, parseSmartHQDeviceState } from './parsers'

const API_BASE = 'https://client.mysmarthq.com'
const IAM_BASE = 'https://accounts.brillion.geappliances.com'
const FETCH_TIMEOUT = 15_000
const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000

export class SmartHQAdapter implements DeviceAdapter {
	readonly brand = 'ge'
	readonly displayName = 'GE SmartHQ'
	readonly discoveryMethod = 'cloud' as const

	private _session: SmartHQSession | null
	private refreshLock: Promise<void> | null = null
	private onSessionChange?: (session: string) => void

	constructor(
		_config: Record<string, string>,
		session?: string | null,
		onSessionChange?: (session: string) => void,
	) {
		this._session = this.parseSession(session ?? null)
		this.onSessionChange = onSessionChange
	}

	get session(): string | null {
		return this._session ? JSON.stringify(this._session) : null
	}

	// ── DeviceAdapter interface ───────────────────────────────────────────

	validateCredentials(_config: Record<string, string>): ResultAsync<void, Error> {
		return okAsync(undefined)
	}

	discover(): ResultAsync<DiscoveredDevice[], Error> {
		return this.ensureValidToken().andThen(() => this.fetchDevices())
	}

	getState(externalId: string): ResultAsync<DeviceState, Error> {
		return this.ensureValidToken().andThen(() => this.fetchDeviceDetail(externalId))
	}

	setState(_externalId: string, _state: Partial<DeviceState>): ResultAsync<void, Error> {
		return errAsync(new Error('SmartHQ integration is read-only (status monitoring only)'))
	}

	// ── Discovery ─────────────────────────────────────────────────────────

	private fetchDevices(): ResultAsync<DiscoveredDevice[], Error> {
		return ResultAsync.fromPromise(
			this.apiFetch<SmartHQDeviceListResponse>('/v2/device?perpage=100'),
			(e) => new Error(`SmartHQ device list failed: ${(e as Error).message}`),
		).andThen((response) => {
			const discovered: DiscoveredDevice[] = []
			for (const d of response.devices) {
				const type = mapSmartHQDeviceType(d.deviceType)
				if (!type) continue

				discovered.push({
					externalId: d.deviceId,
					name: d.nickname || d.model || 'GE Appliance',
					type,
					state: { on: false, cycleStatus: 'idle' },
					online: d.presence === 'ONLINE',
					metadata: {
						model: d.model,
						room: d.room,
						deviceType: d.deviceType,
					},
				})
			}
			return okAsync(discovered)
		})
	}

	private fetchDeviceDetail(externalId: string): ResultAsync<DeviceState, Error> {
		return ResultAsync.fromPromise(
			this.apiFetch<SmartHQDeviceDetail>(`/v2/device/${externalId}`),
			(e) => new Error(`SmartHQ device detail failed: ${(e as Error).message}`),
		).map((detail) => parseSmartHQDeviceState(detail))
	}

	// ── Token management ──────────────────────────────────────────────────

	private parseSession(raw: string | null): SmartHQSession | null {
		if (!raw) return null
		try {
			const parsed = JSON.parse(raw) as SmartHQSession
			if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) return null
			return parsed
		} catch {
			return null
		}
	}

	private ensureValidToken(): ResultAsync<void, Error> {
		if (!this._session) {
			return errAsync(new Error('SmartHQ not authenticated — please complete OAuth flow'))
		}

		if (Date.now() < this._session.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
			return okAsync(undefined)
		}

		return this.acquireAndRefresh()
	}

	private acquireAndRefresh(): ResultAsync<void, Error> {
		if (this.refreshLock) {
			return ResultAsync.fromPromise(this.refreshLock, (e) => e as Error)
		}

		const promise = this.doRefresh()
		this.refreshLock = promise.then(() => {}).catch(() => {})
		void promise.finally(() => { this.refreshLock = null })

		return ResultAsync.fromPromise(promise, (e) => e as Error)
	}

	private async doRefresh(): Promise<void> {
		const session = this._session
		if (!session) throw new Error('No session to refresh')

		const clientId = process.env.SMARTHQ_CLIENT_ID
		const clientSecret = process.env.SMARTHQ_CLIENT_SECRET
		if (!clientId || !clientSecret) {
			throw new Error('SMARTHQ_CLIENT_ID and SMARTHQ_CLIENT_SECRET must be set')
		}

		const res = await fetch(`${IAM_BASE}/oauth2/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: clientId,
				client_secret: clientSecret,
				refresh_token: session.refreshToken,
			}),
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
		})

		if (!res.ok) {
			const body = await res.text()
			throw new Error(`Token refresh failed (${res.status}): ${body}`)
		}

		const data = (await res.json()) as {
			access_token: string
			refresh_token?: string
			expires_in: number
		}

		this._session = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? session.refreshToken,
			expiresAt: Date.now() + data.expires_in * 1000,
		}

		log.debug('smarthq token refreshed', { expiresAt: this._session.expiresAt })
		this.onSessionChange?.(JSON.stringify(this._session))
	}

	// ── API helpers ───────────────────────────────────────────────────────

	private async apiFetch<T>(path: string): Promise<T> {
		if (!this._session) throw new Error('Not authenticated')

		const res = await fetch(`${API_BASE}${path}`, {
			headers: { Authorization: `Bearer ${this._session.accessToken}` },
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
		})

		if (res.status === 401) {
			await this.doRefresh()

			const retry = await fetch(`${API_BASE}${path}`, {
				headers: { Authorization: `Bearer ${this._session.accessToken}` },
				signal: AbortSignal.timeout(FETCH_TIMEOUT),
			})
			if (!retry.ok) throw new Error(`SmartHQ API error (${retry.status})`)
			return retry.json() as Promise<T>
		}

		if (!res.ok) throw new Error(`SmartHQ API error (${res.status})`)
		return res.json() as Promise<T>
	}
}
