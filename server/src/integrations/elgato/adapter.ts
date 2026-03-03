import { ResultAsync, err, errAsync, ok } from 'neverthrow'

import type { DeviceAdapter, DeviceState, DiscoveredDevice } from '../types'

interface ElgatoLight {
	on: number // 0 | 1
	brightness: number // 3–100
	temperature: number // Mired: 143 (6993K) – 344 (2907K)
}

interface ElgatoLightsResponse {
	numberOfLights: number
	lights: ElgatoLight[]
}

interface ElgatoAccessoryInfo {
	displayName: string
	productName: string
}

function miredToKelvin(mired: number): number {
	return Math.round(1_000_000 / mired)
}

function kelvinToMired(kelvin: number): number {
	return Math.round(1_000_000 / kelvin)
}

/** Elgato Key Light / Key Light Air — local HTTP, no auth, port 9123 */
export class ElgatoAdapter implements DeviceAdapter {
	readonly brand = 'elgato'
	readonly displayName = 'Elgato'
	readonly discoveryMethod = 'local' as const

	private ip: string

	constructor(config: Record<string, string>) {
		this.ip = config.ip ?? ''
	}

	get baseUrl() {
		return `http://${this.ip}:9123/elgato`
	}

	validateCredentials(config: Record<string, string>): ResultAsync<void, Error> {
		const ip = config.ip
		if (!ip) return errAsync(new Error('IP address is required'))

		return ResultAsync.fromPromise(
			fetch(`http://${ip}:9123/elgato/accessory-info`, { signal: AbortSignal.timeout(5000) }),
			(e) => new Error(`Device unreachable: ${(e as Error).message}`),
		).andThen((res) => {
			if (!res.ok) return err(new Error(`Device returned ${res.status}`))
			return ok(undefined)
		})
	}

	discover(): ResultAsync<DiscoveredDevice[], Error> {
		return ResultAsync.fromPromise(
			Promise.all([
				fetch(`${this.baseUrl}/lights`, { signal: AbortSignal.timeout(5000) }),
				fetch(`${this.baseUrl}/accessory-info`, { signal: AbortSignal.timeout(5000) }),
			]),
			(e) => new Error(`Network error: ${(e as Error).message}`),
		).andThen(([lightsRes, infoRes]) => {
			if (!lightsRes.ok) return err(new Error(`Elgato lights error: ${lightsRes.status}`))
			return ResultAsync.fromPromise(
				Promise.all([
					lightsRes.json() as Promise<ElgatoLightsResponse>,
					infoRes.ok
						? (infoRes.json() as Promise<ElgatoAccessoryInfo>)
						: Promise.resolve<ElgatoAccessoryInfo>({ displayName: 'Elgato Key Light', productName: 'Key Light' }),
				]),
				() => new Error('Failed to parse Elgato response'),
			)
		}).map(([lightsData, info]) => {
			const displayName = info.displayName || info.productName || 'Elgato Key Light'
			return lightsData.lights.map((light, i) => ({
				externalId: `${this.ip}:${i}`,
				name: lightsData.numberOfLights === 1 ? displayName : `${displayName} ${i + 1}`,
				type: 'light' as const,
				state: {
					on: light.on === 1,
					brightness: light.brightness,
					colorTemp: miredToKelvin(light.temperature),
				},
				online: true,
				metadata: { ip: this.ip, port: 9123 },
			}))
		})
	}

	getState(externalId: string): ResultAsync<DeviceState, Error> {
		const { ip, index } = this.parseExternalId(externalId)
		const url = this.deviceUrl(ip)
		return ResultAsync.fromPromise(
			fetch(`${url}/lights`, { signal: AbortSignal.timeout(5000) }),
			(e) => new Error(`Network error: ${(e as Error).message}`),
		).andThen((res) =>
			ResultAsync.fromPromise(
				res.json() as Promise<ElgatoLightsResponse>,
				() => new Error('Failed to parse response'),
			),
		).andThen((data) => {
			const light = data.lights[index]
			if (!light) return err(new Error(`Light index ${index} not found`))
			return ok<DeviceState>({
				on: light.on === 1,
				brightness: light.brightness,
				colorTemp: miredToKelvin(light.temperature),
			})
		})
	}

	setState(externalId: string, state: Partial<DeviceState>): ResultAsync<void, Error> {
		const { ip, index } = this.parseExternalId(externalId)
		const url = this.deviceUrl(ip)
		// GET current state first so we can fill in missing fields before PUT
		return ResultAsync.fromPromise(
			fetch(`${url}/lights`, { signal: AbortSignal.timeout(5000) }),
			(e) => new Error(`Network error: ${(e as Error).message}`),
		).andThen((res) =>
			ResultAsync.fromPromise(
				res.json() as Promise<ElgatoLightsResponse>,
				() => new Error('Failed to parse response'),
			),
		).andThen((data) => {
			const current = data.lights[index]
			if (!current) return err(new Error(`Light index ${index} not found`))

			const updatedOn = state.on !== undefined ? Number(state.on) : current.on
			const updatedTemp =
				state.colorTemp !== undefined ? kelvinToMired(state.colorTemp) : current.temperature
			const updated: ElgatoLight = {
				on: updatedOn,
				brightness: state.brightness ?? current.brightness,
				temperature: updatedTemp,
			}

			return ResultAsync.fromPromise(
				fetch(`${url}/lights`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ numberOfLights: 1, lights: [updated] }),
					signal: AbortSignal.timeout(5000),
				}),
				(e) => new Error(`Failed to set state: ${(e as Error).message}`),
			).map(() => undefined)
		})
	}

	/** parse "192.168.1.100:0" → { ip: "192.168.1.100", index: 0 } */
	private parseExternalId(externalId: string): { ip: string; index: number } {
		const colonIdx = externalId.lastIndexOf(':')
		if (colonIdx < 0) return { ip: this.ip, index: 0 }
		return {
			ip: externalId.slice(0, colonIdx),
			index: parseInt(externalId.slice(colonIdx + 1), 10),
		}
	}

	private deviceUrl(ip: string): string {
		return `http://${ip}:9123/elgato`
	}
}
