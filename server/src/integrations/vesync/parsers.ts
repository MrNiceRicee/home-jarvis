import type { DeviceState, DeviceType } from '../types'

/** derive air quality level (1-4) from PM2.5 ug/m3 using WHO thresholds */
function pm25ToAirQuality(pm25: number): number {
	if (pm25 < 12) return 1 // good
	if (pm25 < 35) return 2 // moderate
	if (pm25 < 55) return 3 // unhealthy
	return 4 // very unhealthy
}

export function parseAirPurifierState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = result.result as Record<string, unknown> | undefined

	if (r) {
		if ('enabled' in r) state.on = r.enabled === true
		if ('switch_on' in r) state.on = r.switch_on === true
		if ('fan_level' in r) state.fanSpeed = (r.fan_level as number) * 20 // 1-5 → 0-100
		if ('air_quality_value' in r) {
			const pm25 = r.air_quality_value as number
			state.pm25 = pm25
			state.airQuality = pm25ToAirQuality(pm25)
		}
		if ('filter_life' in r) state.filterLife = r.filter_life as number
		if ('mode' in r) state.mode = r.mode as string
	}

	return state
}

export function parseSwitchState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = result.result as Record<string, unknown> | undefined

	if (r) {
		if ('enabled' in r) state.on = r.enabled === true
		if ('switch_on' in r) state.on = r.switch_on === true
	}

	return state
}

export function parseLightState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = result.result as Record<string, unknown> | undefined

	if (r) {
		if ('enabled' in r) state.on = r.enabled === true
		if ('brightness' in r) state.brightness = r.brightness as number
		if ('colorTemp' in r) state.colorTemp = r.colorTemp as number
	}

	return state
}

export function getStatusMethod(deviceType: DeviceType): string {
	switch (deviceType) {
		case 'air_purifier':
			return 'getPurifierStatus'
		case 'switch':
			return 'getOutletStatus'
		case 'light':
			return 'getLightStatus'
		default:
			return 'getPurifierStatus'
	}
}

export function parseStateByType(deviceType: DeviceType, result: Record<string, unknown>): DeviceState {
	switch (deviceType) {
		case 'air_purifier':
			return parseAirPurifierState(result)
		case 'switch':
			return parseSwitchState(result)
		case 'light':
			return parseLightState(result)
		default:
			return parseAirPurifierState(result)
	}
}

export function mapVeSyncType(deviceType: string, type: string): DeviceType {
	const dt = deviceType.toLowerCase()
	const t = type.toLowerCase()

	if (dt.includes('wifi-air') || t.startsWith('core') || t.startsWith('lav') || t.startsWith('vital')) return 'air_purifier'
	if (dt.includes('wifi-switch') || t.startsWith('esw')) return 'switch'
	if (dt.includes('wifi-humid') || t.startsWith('luh') || t.startsWith('oasis')) return 'air_purifier'
	if (t.startsWith('esl') || t.startsWith('xyd')) return 'light'
	return 'switch'
}
