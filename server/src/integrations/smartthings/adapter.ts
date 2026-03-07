import { err, errAsync, ok, okAsync, ResultAsync } from 'neverthrow'

import { toErrorMessage } from '../../lib/error-utils'
import { log } from '../../lib/logger'
import type { DeviceAdapter, DeviceState, DeviceType, DiscoveredDevice } from '../types'
import { isDeviceType } from '../types'
import { flatCapabilityIds, mapSmartThingsType, parseSmartThingsState } from './parsers'
import type {
	SmartThingsDevice,
	SmartThingsDeviceHealth,
	SmartThingsDeviceListResponse,
	SmartThingsDeviceStatus,
} from './types'

const API_BASE = 'https://api.smartthings.com/v1'
const TIMEOUT = 15_000
const CONCURRENCY = 3

export class SmartThingsAdapter implements DeviceAdapter {
	readonly brand = 'smartthings'
	readonly displayName = 'SmartThings'
	readonly discoveryMethod = 'cloud' as const

	private pat: string

	constructor(config: Record<string, string>) {
		this.pat = config.pat ?? ''
	}

	private headers(): Record<string, string> {
		return { Authorization: `Bearer ${this.pat}` }
	}

	// ── DeviceAdapter interface ───────────────────────────────────────────

	validateCredentials(config: Record<string, string>): ResultAsync<void, Error> {
		const pat = config.pat
		if (!pat)
			return errAsync(
				new Error('Personal Access Token is required — get one from account.smartthings.com'),
			)

		return ResultAsync.fromPromise(
			fetch(`${API_BASE}/devices?page=0&pageSize=1`, {
				headers: { Authorization: `Bearer ${pat}` },
				signal: AbortSignal.timeout(TIMEOUT),
			}),
			(e) => new Error(`SmartThings unreachable: ${toErrorMessage(e)}`),
		).andThen((res) => {
			if (res.status === 401 || res.status === 403)
				return err(new Error('Invalid or expired Personal Access Token'))
			if (!res.ok) return err(new Error(`SmartThings API returned ${res.status}`))
			return ok(undefined)
		})
	}

	discover(): ResultAsync<DiscoveredDevice[], Error> {
		return this.fetchAllDevices().andThen((devices) =>
			ResultAsync.fromPromise(
				this.fetchStatesForDevices(devices),
				(e) => new Error(`State fetch failed: ${toErrorMessage(e)}`),
			),
		)
	}

	getState(externalId: string): ResultAsync<DeviceState, Error> {
		// externalId stores deviceId::deviceType
		const { deviceId, deviceType } = parseExternalId(externalId)

		return ResultAsync.fromPromise(
			Promise.all([
				this.apiFetch<SmartThingsDeviceStatus>(`/devices/${encodeURIComponent(deviceId)}/status`),
				this.apiFetch<SmartThingsDeviceHealth>(
					`/devices/${encodeURIComponent(deviceId)}/health`,
				).catch(() => null),
			]),
			(e) => new Error(`SmartThings status failed: ${toErrorMessage(e)}`),
		).map(([status, health]) => {
			const state = parseSmartThingsState(status, deviceType)
			// samsung TVs report stale switch:"on" when powered off — health is the real signal
			if (health?.state === 'OFFLINE') state.on = false
			return state
		})
	}

	setState(externalId: string, state: Partial<DeviceState>): ResultAsync<void, Error> {
		const { deviceId } = parseExternalId(externalId)
		const commands = buildCommands(state)
		if (commands.length === 0) return okAsync(undefined)

		return ResultAsync.fromPromise(
			this.apiFetch<unknown>(`/devices/${encodeURIComponent(deviceId)}/commands`, {
				method: 'POST',
				body: JSON.stringify({ commands }),
			}),
			(e) => new Error(`SmartThings command failed: ${toErrorMessage(e)}`),
		).map(() => undefined)
	}

	// ── Discovery ─────────────────────────────────────────────────────────

	private fetchAllDevices(): ResultAsync<SmartThingsDevice[], Error> {
		return ResultAsync.fromPromise(
			this.paginateDevices(),
			(e) => new Error(`Device list failed: ${toErrorMessage(e)}`),
		)
	}

	private async paginateDevices(): Promise<SmartThingsDevice[]> {
		const all: SmartThingsDevice[] = []
		let url: string | null = `/devices`

		while (url) {
			const data: SmartThingsDeviceListResponse =
				await this.apiFetch<SmartThingsDeviceListResponse>(url)
			all.push(...data.items)
			url = data._links?.next?.href ?? null
			// next href is full URL — extract path
			if (url?.startsWith('http')) {
				url = new URL(url).pathname + new URL(url).search
			}
		}

		return all
	}

	private async fetchStatesForDevices(devices: SmartThingsDevice[]): Promise<DiscoveredDevice[]> {
		const results: DiscoveredDevice[] = []

		for (let i = 0; i < devices.length; i += CONCURRENCY) {
			const batch = devices.slice(i, i + CONCURRENCY)
			const settled = await Promise.allSettled(
				batch.map(async (d) => {
					const capIds = flatCapabilityIds(d.components)
					const type = mapSmartThingsType(capIds)
					if (!type) return null

					const externalId = buildExternalId(d.deviceId, type)
					const base: DiscoveredDevice = {
						externalId,
						name: d.label || d.name,
						type,
						state: {},
						online: true,
						metadata: {
							manufacturer: d.manufacturerName,
							components: d.components.map((c) => c.id),
							capabilities: capIds,
						},
					}

					try {
						const [status, health] = await Promise.all([
							this.apiFetch<SmartThingsDeviceStatus>(
								`/devices/${encodeURIComponent(d.deviceId)}/status`,
							),
							this.apiFetch<SmartThingsDeviceHealth>(
								`/devices/${encodeURIComponent(d.deviceId)}/health`,
							).catch(() => null),
						])
						base.state = parseSmartThingsState(status, type)
						if (health?.state === 'OFFLINE') {
							base.online = false
							base.state.on = false
						}
					} catch (e) {
						log.warn('smartthings: state fetch failed for device', {
							deviceId: d.deviceId,
							error: toErrorMessage(e),
						})
					}

					return base
				}),
			)

			for (const result of settled) {
				if (result.status === 'fulfilled' && result.value) results.push(result.value)
			}
		}

		return results
	}

	// ── API helpers ───────────────────────────────────────────────────────

	private async apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
		const url = path.startsWith('/') ? `${API_BASE}${path}` : `${API_BASE}/${path}`
		const res = await fetch(url, {
			...init,
			headers: {
				...this.headers(),
				...(init?.body ? { 'Content-Type': 'application/json' } : {}),
				...(init?.headers as Record<string, string> | undefined),
			},
			signal: AbortSignal.timeout(TIMEOUT),
		})

		if (!res.ok) throw new Error(`SmartThings API error (${res.status})`)
		return res.json() as Promise<T>
	}
}

// ── External ID encoding ─────────────────────────────────────────────────────
// format: deviceUUID::deviceType — encodes type so getState can parse without re-fetching capabilities

function buildExternalId(deviceId: string, type: DeviceType): string {
	return `${deviceId}::${type}`
}

function parseExternalId(externalId: string): { deviceId: string; deviceType: DeviceType } {
	const idx = externalId.indexOf('::')
	const raw = externalId.slice(idx + 2)
	if (!isDeviceType(raw)) throw new Error(`Unknown device type in externalId: ${raw}`)
	return { deviceId: externalId.slice(0, idx), deviceType: raw }
}

// ── Command builders ─────────────────────────────────────────────────────────

interface SmartThingsCommand {
	component: string
	capability: string
	command: string
	arguments?: unknown[]
}

function buildCommands(state: Partial<DeviceState>): SmartThingsCommand[] {
	const cmds: SmartThingsCommand[] = []

	if (state.on !== undefined) {
		cmds.push({
			component: 'main',
			capability: 'switch',
			command: state.on ? 'on' : 'off',
		})
	}

	if (state.volume !== undefined) {
		cmds.push({
			component: 'main',
			capability: 'audioVolume',
			command: 'setVolume',
			arguments: [state.volume],
		})
	}

	if (state.brightness !== undefined) {
		cmds.push({
			component: 'main',
			capability: 'switchLevel',
			command: 'setLevel',
			arguments: [state.brightness],
		})
	}

	if (state.colorTemp !== undefined) {
		cmds.push({
			component: 'main',
			capability: 'colorTemperature',
			command: 'setColorTemperature',
			arguments: [state.colorTemp],
		})
	}

	return cmds
}
