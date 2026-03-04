import { ResultAsync, ok, err, errAsync } from 'neverthrow'

import type { DeviceAdapter, DiscoveredDevice, DeviceState } from '../types'

interface HueBridgeInfo {
	id: string
	internalipaddress: string
}

interface HueLight {
	uniqueid: string
	name: string
	type: string
	state: {
		on: boolean
		bri?: number // 1–254
		ct?: number // Mired color temp
		hue?: number
		sat?: number
		reachable: boolean
	}
}

// hsv → rgb for hue light color reporting
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
	const c = v * s
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = v - c
	let r = 0, g = 0, b = 0
	if (h < 60) { r = c; g = x }
	else if (h < 120) { r = x; g = c }
	else if (h < 180) { g = c; b = x }
	else if (h < 240) { g = x; b = c }
	else if (h < 300) { r = x; b = c }
	else { r = c; b = x }
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255),
	}
}

export class HueAdapter implements DeviceAdapter {
	readonly brand = 'hue'
	readonly displayName = 'Philips Hue'
	readonly discoveryMethod = 'local' as const

	private bridgeIp: string
	private apiKey: string

	constructor(config: Record<string, string>) {
		this.bridgeIp = config.bridgeIp ?? ''
		this.apiKey = config.apiKey ?? ''
	}

	get baseUrl() {
		return `http://${this.bridgeIp}/api/${this.apiKey}`
	}

	validateCredentials(config: Record<string, string>): ResultAsync<void, Error> {
		const ip = config.bridgeIp
		const key = config.apiKey
		if (!ip) return errAsync(new Error('Bridge IP is required'))
		if (!key) return errAsync(new Error('API key is required — press the button on the bridge first'))

		return ResultAsync.fromPromise(
			fetch(`http://${ip}/api/${key}/config`, { signal: AbortSignal.timeout(5000) }),
			(e) => new Error(`Bridge unreachable: ${(e as Error).message}`),
		).andThen((res) => {
			if (!res.ok) return err(new Error(`Bridge returned ${res.status}`))
			return ResultAsync.fromPromise(
				res.json() as Promise<{ name?: string; error?: { description: string } }>,
				() => new Error('Invalid response from bridge'),
			)
		}).andThen((data) => {
			if ('error' in data || (Array.isArray(data) && data[0]?.error)) {
				return err(new Error((data as { error?: { description: string } }).error?.description ?? 'Invalid API key'))
			}
			return ok(undefined)
		})
	}

	discover(): ResultAsync<DiscoveredDevice[], Error> {
		return ResultAsync.fromPromise(
			fetch(`${this.baseUrl}/lights`, { signal: AbortSignal.timeout(8000) }),
			(e) => new Error(`Network error: ${(e as Error).message}`),
		).andThen((res) => {
			if (!res.ok) return err(new Error(`Hue bridge error: ${res.status}`))
			return ResultAsync.fromPromise(
				res.json() as Promise<Record<string, HueLight>>,
				() => new Error('Failed to parse lights response'),
			)
		}).map((lights) =>
			Object.entries(lights).map(([id, light]) => ({
				externalId: light.uniqueid || id,
				name: light.name,
				type: 'light' as const,
				state: this.parseState(light.state),
				online: light.state.reachable,
			}))
		)
	}

	getState(externalId: string): ResultAsync<DeviceState, Error> {
		return ResultAsync.fromPromise(
			fetch(`${this.baseUrl}/lights`, { signal: AbortSignal.timeout(5000) }),
			(e) => new Error(`Network error: ${(e as Error).message}`),
		).andThen((res) =>
			ResultAsync.fromPromise(
				res.json() as Promise<Record<string, HueLight>>,
				() => new Error('Failed to parse response'),
			)
		).andThen((lights) => {
			const entry = Object.values(lights).find((l) => l.uniqueid === externalId)
			if (!entry) return err(new Error(`Light ${externalId} not found`))
			return ok(this.parseState(entry.state))
		})
	}

	setState(externalId: string, state: Partial<DeviceState>): ResultAsync<void, Error> {
		return ResultAsync.fromPromise(
			fetch(`${this.baseUrl}/lights`, { signal: AbortSignal.timeout(5000) }),
			(e) => new Error(`Network error: ${(e as Error).message}`),
		).andThen((res) =>
			ResultAsync.fromPromise(
				res.json() as Promise<Record<string, HueLight>>,
				() => new Error('Failed to parse response'),
			)
		).andThen((lights) => {
			const entry = Object.entries(lights).find(([, l]) => l.uniqueid === externalId)
			if (!entry) return err(new Error(`Light ${externalId} not found`))
			const [lightId] = entry

			const body: Record<string, unknown> = {}
			if (state.on !== undefined) body.on = state.on
			if (state.brightness !== undefined) body.bri = Math.round((state.brightness / 100) * 253 + 1)
			if (state.colorTemp !== undefined) {
				body.ct = Math.round(1_000_000 / state.colorTemp)
			}
			if (state.color) {
				const { r, g, b } = state.color
				const R = r / 255, G = g / 255, B = b / 255
				const X = R * 0.664511 + G * 0.154324 + B * 0.162028
				const Y = R * 0.283881 + G * 0.668433 + B * 0.047685
				const Z = R * 0.000088 + G * 0.07231 + B * 0.986039
				const sum = X + Y + Z
				body.xy = sum > 0 ? [X / sum, Y / sum] : [0.3127, 0.329]
			}

			return ResultAsync.fromPromise(
				fetch(`${this.baseUrl}/lights/${lightId}/state`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(5000),
				}),
				(e) => new Error(`Failed to set state: ${(e as Error).message}`),
			).map(() => undefined)
		})
	}

	private parseState(s: HueLight['state']): DeviceState {
		const state: DeviceState = {
			on: s.on,
			brightness: s.bri !== undefined ? Math.round(((s.bri - 1) / 253) * 100) : undefined,
			colorTemp: s.ct !== undefined ? Math.round(1_000_000 / s.ct) : undefined,
		}

		// hue (0–65535) + sat (0–254) → RGB for full-color lights
		if (s.hue !== undefined && s.sat !== undefined) {
			const h = (s.hue / 65535) * 360
			const sat = s.sat / 254
			const v = s.bri !== undefined ? s.bri / 254 : 1
			state.color = hsvToRgb(h, sat, v)
		}

		return state
	}
}

/** N-UPnP discovery — returns list of Hue bridges found on the local network */
export function discoverHueBridges(): ResultAsync<HueBridgeInfo[], Error> {
	return ResultAsync.fromPromise(
		fetch('https://discovery.meethue.com/', { signal: AbortSignal.timeout(5000) }),
		(e) => new Error(`Cloud discovery failed: ${(e as Error).message}`),
	).andThen((res) => {
		if (!res.ok) return ResultAsync.fromPromise(Promise.resolve([]), () => new Error())
		return ResultAsync.fromPromise(
			res.json() as Promise<HueBridgeInfo[]>,
			() => new Error('Failed to parse bridge list'),
		)
	})
}

type HueLinkResponse = Array<{
	success?: { username: string }
	error?: { type?: number; description: string }
}>

/**
 * Create an API key by POST-ing to the bridge.
 * Retries automatically for ~30s so the user can press the button after clicking "Link Bridge".
 */
export function createHueApiKey(bridgeIp: string, _retriesLeft = 12): ResultAsync<string, Error> {
	const retriesLeft = _retriesLeft
	return ResultAsync.fromPromise(
		fetch(`http://${bridgeIp}/api`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ devicetype: 'home-jarvis#server' }),
			signal: AbortSignal.timeout(5_000),
		}),
		(e) => new Error(`Could not reach bridge: ${(e as Error).message}`),
	)
		.andThen((res) =>
			ResultAsync.fromPromise(
				res.json() as Promise<HueLinkResponse>,
				() => new Error('Invalid response from bridge'),
			),
		)
		.andThen((data) => {
			if (!Array.isArray(data) || !data[0]) return err(new Error('Unexpected response from bridge'))
			// Error 101 = link button not pressed — retry if we have attempts left
			if (data[0].error?.type === 101 && retriesLeft > 0) {
				return ResultAsync.fromPromise(
					new Promise<void>((r) => setTimeout(r, 2_500)),
					() => new Error('Retry aborted'),
				).andThen(() => createHueApiKey(bridgeIp, retriesLeft - 1))
			}
			if (data[0].error) return err(new Error(data[0].error.description))
			if (!data[0].success?.username) return err(new Error('No username in response'))
			return ok(data[0].success.username)
		})
}
