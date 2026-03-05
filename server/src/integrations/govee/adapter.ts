import { ResultAsync, err, errAsync, ok } from 'neverthrow'

import type { DeviceAdapter, DeviceState, DeviceType, DiscoveredDevice } from '../types'

const BASE_URL = 'https://openapi.api.govee.com'
const TIMEOUT = 10_000

// ─── Govee API response types ─────────────────────────────────────────────────

interface GoveeCapability {
	type: string
	instance: string
	parameters?: {
		range?: { min: number; max: number }
		options?: Array<{ name: string; value: unknown }>
	}
}

interface GoveeDevice {
	sku: string
	device: string // MAC address
	deviceName: string
	type: string
	capabilities: GoveeCapability[]
}

interface GoveeDeviceListResponse {
	code: number
	message: string
	data: GoveeDevice[]
}

interface GoveeCapabilityState {
	type: string
	instance: string
	state: { value: unknown }
}

interface GoveeStateResponse {
	code: number
	message: string
	payload: {
		capabilities: GoveeCapabilityState[]
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExternalId(externalId: string): { device: string; sku: string } {
	const idx = externalId.indexOf('::')
	return { device: externalId.slice(0, idx), sku: externalId.slice(idx + 2) }
}

function mapGoveeType(type: string): DeviceType {
	if (type.includes('light')) return 'light'
	if (type.includes('socket') || type.includes('plug')) return 'switch'
	if (type.includes('air_purifier')) return 'air_purifier'
	if (type.includes('humidifier')) return 'air_purifier'
	return 'light'
}

function unpackRgb(packed: number): { r: number; g: number; b: number } {
	return {
		r: (packed >> 16) & 0xff,
		g: (packed >> 8) & 0xff,
		b: packed & 0xff,
	}
}

function packRgb(color: { r: number; g: number; b: number }): number {
	return (color.r << 16) | (color.g << 8) | color.b
}

function parseCapabilityStates(capabilities: GoveeCapabilityState[]): { state: DeviceState; online: boolean } {
	const state: DeviceState = {}
	let online = true

	for (const cap of capabilities) {
		const v = cap.state?.value
		switch (cap.instance) {
			case 'powerSwitch':
				state.on = v === 1
				break
			case 'brightness':
				if (typeof v === 'number') state.brightness = v
				break
			case 'colorRgb':
				if (typeof v === 'number') state.color = unpackRgb(v)
				break
			case 'colorTemperatureK':
				if (typeof v === 'number') state.colorTemp = v
				break
			case 'online':
				online = v === true || v === 1
				break
		}
	}

	return { state, online }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class GoveeAdapter implements DeviceAdapter {
	readonly brand = 'govee'
	readonly displayName = 'Govee'
	readonly discoveryMethod = 'cloud' as const

	private apiKey: string

	constructor(config: Record<string, string>) {
		this.apiKey = config.apiKey ?? ''
	}

	private headers(): Record<string, string> {
		return { 'Govee-API-Key': this.apiKey, 'Content-Type': 'application/json' }
	}

	validateCredentials(config: Record<string, string>): ResultAsync<void, Error> {
		const key = config.apiKey
		if (!key) return errAsync(new Error('API key is required — get one from developer.govee.com'))

		return ResultAsync.fromPromise(
			fetch(`${BASE_URL}/router/api/v1/user/devices`, {
				headers: { 'Govee-API-Key': key },
				signal: AbortSignal.timeout(TIMEOUT),
			}),
			(e) => new Error(`Govee API unreachable: ${(e as Error).message}`),
		).andThen((res) => {
			if (res.status === 401) return err(new Error('Invalid API key'))
			if (!res.ok) return err(new Error(`Govee API returned ${res.status}`))
			return ok(undefined)
		})
	}

	discover(): ResultAsync<DiscoveredDevice[], Error> {
		return this.fetchDeviceList().andThen((devices) => {
			// fetch state for each device with bounded concurrency
			return ResultAsync.fromPromise(
				this.fetchStatesForDevices(devices),
				(e) => new Error(`State fetch failed: ${(e as Error).message}`),
			)
		})
	}

	getState(externalId: string): ResultAsync<DeviceState, Error> {
		const { device, sku } = parseExternalId(externalId)

		return ResultAsync.fromPromise(
			fetch(`${BASE_URL}/router/api/v1/device/state`, {
				method: 'POST',
				headers: this.headers(),
				body: JSON.stringify({
					requestId: crypto.randomUUID(),
					payload: { sku, device },
				}),
				signal: AbortSignal.timeout(TIMEOUT),
			}),
			(e) => new Error(`Network error: ${(e as Error).message}`),
		).andThen((res) => {
			if (res.status === 429) return err(new Error('Govee rate limit exceeded — retry next cycle'))
			if (!res.ok) return err(new Error(`Govee state error: ${res.status}`))
			return ResultAsync.fromPromise(
				res.json() as Promise<GoveeStateResponse>,
				() => new Error('Failed to parse state response'),
			)
		}).map((data) => {
			const { state } = parseCapabilityStates(data.payload.capabilities)
			return state
		})
	}

	setState(externalId: string, state: Partial<DeviceState>): ResultAsync<void, Error> {
		const { device, sku } = parseExternalId(externalId)
		const commands = this.buildControlCommands(state)
		if (commands.length === 0) return ResultAsync.fromSafePromise(Promise.resolve(undefined))

		// govee requires one capability per request — sequential calls
		let chain: ResultAsync<void, Error> = ResultAsync.fromSafePromise(Promise.resolve(undefined))
		for (const cmd of commands) {
			chain = chain.andThen(() =>
				ResultAsync.fromPromise(
					fetch(`${BASE_URL}/router/api/v1/device/control`, {
						method: 'POST',
						headers: this.headers(),
						body: JSON.stringify({
							requestId: crypto.randomUUID(),
							payload: { sku, device, capability: cmd },
						}),
						signal: AbortSignal.timeout(TIMEOUT),
					}),
					(e) => new Error(`Control error: ${(e as Error).message}`),
				).andThen((res) => {
					if (res.status === 429) return err(new Error('Govee rate limit exceeded'))
					if (!res.ok) return err(new Error(`Govee control error: ${res.status}`))
					return ok(undefined)
				}),
			)
		}
		return chain
	}

	// ─── Private ────────────────────────────────────────────────────────────────

	private fetchDeviceList(): ResultAsync<GoveeDevice[], Error> {
		return ResultAsync.fromPromise(
			fetch(`${BASE_URL}/router/api/v1/user/devices`, {
				headers: this.headers(),
				signal: AbortSignal.timeout(TIMEOUT),
			}),
			(e) => new Error(`Network error: ${(e as Error).message}`),
		).andThen((res) => {
			if (res.status === 429) return err(new Error('Govee rate limit exceeded'))
			if (!res.ok) return err(new Error(`Govee API error: ${res.status}`))
			return ResultAsync.fromPromise(
				res.json() as Promise<GoveeDeviceListResponse>,
				() => new Error('Failed to parse device list'),
			)
		}).map((data) => data.data ?? [])
	}

	private async fetchStatesForDevices(devices: GoveeDevice[]): Promise<DiscoveredDevice[]> {
		const results: DiscoveredDevice[] = []
		const concurrency = 3

		for (let i = 0; i < devices.length; i += concurrency) {
			const batch = devices.slice(i, i + concurrency)
			const settled = await Promise.allSettled(
				batch.map(async (d) => {
					const externalId = `${d.device}::${d.sku}`
					const base: DiscoveredDevice = {
						externalId,
						name: d.deviceName,
						type: mapGoveeType(d.type),
						state: {},
						online: true,
						metadata: { sku: d.sku, mac: d.device, capabilities: d.capabilities },
					}

					const stateResult = await this.getState(externalId)
					if (stateResult.isOk()) {
						base.state = stateResult.value
					}
					return base
				}),
			)

			for (const result of settled) {
				if (result.status === 'fulfilled') results.push(result.value)
			}
		}

		return results
	}

	private buildControlCommands(state: Partial<DeviceState>): Array<{ type: string; instance: string; value: unknown }> {
		const cmds: Array<{ type: string; instance: string; value: unknown }> = []

		if (state.on !== undefined) {
			cmds.push({ type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: state.on ? 1 : 0 })
		}
		if (state.brightness !== undefined) {
			cmds.push({ type: 'devices.capabilities.range', instance: 'brightness', value: state.brightness })
		}
		if (state.color) {
			cmds.push({ type: 'devices.capabilities.color_setting', instance: 'colorRgb', value: packRgb(state.color) })
		}
		if (state.colorTemp !== undefined) {
			cmds.push({ type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK', value: state.colorTemp })
		}

		return cmds
	}
}
