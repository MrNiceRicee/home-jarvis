import type { DeviceState, DeviceType } from '../types'

/** derive air quality level (1-4) from PM2.5 ug/m3 using WHO thresholds */
function pm25ToAirQuality(pm25: number): number {
	if (pm25 < 12) return 1 // good
	if (pm25 < 35) return 2 // moderate
	if (pm25 < 55) return 3 // unhealthy
	return 4 // very unhealthy
}

function extractResult(result: Record<string, unknown>): Record<string, unknown> | undefined {
	return result.result as Record<string, unknown> | undefined
}

/** detect camelCase V2 response format (Vital 100S/200S, Everest, newer devices) */
function isV2Response(r: Record<string, unknown>): boolean {
	return 'powerSwitch' in r || 'workMode' in r || 'fanSpeedLevel' in r
}

/** map mode + level to our fanSpeed convention: auto=0, sleep=20, manual 1/2/3/4=40/60/80/100 */
function parseFanSpeed(r: Record<string, unknown>): { mode?: string; fanSpeed?: number } {
	const mode = typeof r.mode === 'string' ? r.mode : undefined
	if (mode === 'auto') return { mode, fanSpeed: 0 }
	if (mode === 'sleep') return { mode, fanSpeed: 20 }

	let level: number | undefined
	if (typeof r.level === 'number') level = r.level
	else if (typeof r.fan_level === 'number') level = r.fan_level
	const fanSpeed = level !== undefined ? (level + 1) * 20 : undefined
	return { mode, fanSpeed }
}

/** V2 camelCase fan speed — Vital 200S uses workMode + fanSpeedLevel */
function parseFanSpeedV2(r: Record<string, unknown>): { mode?: string; fanSpeed?: number } {
	const mode = typeof r.workMode === 'string' ? r.workMode : undefined
	if (mode === 'auto') return { mode, fanSpeed: 0 }
	if (mode === 'sleep') return { mode, fanSpeed: 20 }
	if (mode === 'pet') return { mode, fanSpeed: 0 }

	const level = typeof r.fanSpeedLevel === 'number' ? r.fanSpeedLevel : undefined
	// fanSpeedLevel 255 means auto/unknown in V2 protocol
	if (level === 255) return { mode, fanSpeed: 0 }
	const fanSpeed = level !== undefined ? (level + 1) * 20 : undefined
	return { mode, fanSpeed }
}

/** parse V2 camelCase response (Vital 100S/200S, Everest, newer devices) */
function parseAirPurifierStateV2(r: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}

	if ('powerSwitch' in r) state.on = r.powerSwitch === 1
	if ('PM25' in r && typeof r.PM25 === 'number') {
		state.pm25 = r.PM25
		state.airQuality = pm25ToAirQuality(r.PM25)
	}
	if ('filterLifePercent' in r && typeof r.filterLifePercent === 'number') {
		state.filterLife = r.filterLifePercent
	}

	const fan = parseFanSpeedV2(r)
	state.mode = fan.mode
	state.fanSpeed = fan.fanSpeed

	return state
}

export function parseAirPurifierState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = extractResult(result)
	if (!r) return state

	// V2 camelCase format (Vital 100S/200S, Everest, newer VS_ devices)
	if (isV2Response(r)) return parseAirPurifierStateV2(r)

	// V1 snake_case format (Core, LV-PUR, older devices)
	if ('enabled' in r) state.on = r.enabled === true
	if ('switch_on' in r) state.on = r.switch_on === true
	if ('air_quality_value' in r && typeof r.air_quality_value === 'number') {
		state.pm25 = r.air_quality_value
		state.airQuality = pm25ToAirQuality(r.air_quality_value)
	}
	if ('filter_life' in r && typeof r.filter_life === 'number') state.filterLife = r.filter_life

	// mode determines fanSpeed: auto=0, sleep=20, manual 1/2/3=40/60/80
	const fan = parseFanSpeed(r)
	state.mode = fan.mode
	state.fanSpeed = fan.fanSpeed

	return state
}

export function parseSwitchState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = extractResult(result)
	if (!r) return state

	if ('enabled' in r) state.on = r.enabled === true
	if ('switch_on' in r) state.on = r.switch_on === true

	return state
}

export function parseLightState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = extractResult(result)
	if (!r) return state

	if ('enabled' in r) state.on = r.enabled === true
	if ('brightness' in r && typeof r.brightness === 'number') state.brightness = r.brightness
	if ('colorTemp' in r && typeof r.colorTemp === 'number') state.colorTemp = r.colorTemp

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

	// `type` is the VeSync category (e.g. "wifi-air"), `deviceType` is the model (e.g. "LAP-C302S-WUSB")
	if (t.includes('wifi-air') || dt.startsWith('lap') || dt.startsWith('core') || dt.startsWith('lav') || dt.startsWith('vital')) return 'air_purifier'
	if (t.includes('wifi-switch') || dt.startsWith('esw')) return 'switch'
	if (t.includes('wifi-humid') || dt.startsWith('luh') || dt.startsWith('oasis')) return 'air_purifier'
	if (dt.startsWith('esl') || dt.startsWith('xyd')) return 'light'
	return 'switch'
}
