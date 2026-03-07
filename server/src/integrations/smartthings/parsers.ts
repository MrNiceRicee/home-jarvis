import type { DeviceState, DeviceType } from '../types'
import type { SmartThingsComponentStatus, SmartThingsDeviceStatus } from './types'

import { fToC } from '../../lib/unit-conversions'

// capabilities that identify device type
const TV_CAPS = ['audioVolume', 'mediaPlayback', 'tvChannel', 'mediaInputSource']
const FRIDGE_CAPS = ['refrigeration', 'custom.fridgeMode']
const THERMOSTAT_CAPS = ['thermostatMode', 'thermostatHeatingSetpoint']
const LIGHT_CAPS = ['switchLevel', 'colorControl', 'colorTemperature']
const AIR_PURIFIER_CAPS = ['airQualitySensor', 'dustSensor']

function hasAny(caps: Set<string>, targets: string[]): boolean {
	return targets.some((t) => caps.has(t))
}

export function mapSmartThingsType(capabilityIds: string[]): DeviceType | null {
	const caps = new Set(capabilityIds)

	if (hasAny(caps, TV_CAPS)) return 'tv'
	if (hasAny(caps, FRIDGE_CAPS)) return 'fridge'
	if (hasAny(caps, THERMOSTAT_CAPS)) return 'thermostat'
	if (hasAny(caps, AIR_PURIFIER_CAPS)) return 'air_purifier'
	if (hasAny(caps, LIGHT_CAPS)) return 'light'
	if (caps.has('switch')) return 'switch'
	return null
}

/** extract all capability IDs across all components */
export function flatCapabilityIds(components: Array<{ capabilities: Array<{ id: string }> }>): string[] {
	return components.flatMap((c) => c.capabilities.map((cap) => cap.id))
}

// helper to safely read an attribute value from a component status
function attr<T>(component: SmartThingsComponentStatus | undefined, capability: string, attribute: string): T | undefined {
	return component?.[capability]?.[attribute]?.value as T | undefined
}

function attrUnit(component: SmartThingsComponentStatus | undefined, capability: string, attribute: string): string | undefined {
	return component?.[capability]?.[attribute]?.unit
}

export function parseSmartThingsState(status: SmartThingsDeviceStatus, type: DeviceType): DeviceState {
	const main = status.components.main
	const state: DeviceState = {}

	// common: on/off
	const switchVal = attr<string>(main, 'switch', 'switch')
	if (switchVal !== undefined) state.on = switchVal === 'on'

	switch (type) {
		case 'tv':
			parseTvState(main, state)
			break
		case 'fridge':
			parseFridgeState(status, state)
			break
		case 'thermostat':
			parseThermostatState(main, state)
			break
		case 'light':
			parseLightState(main, state)
			break
		case 'air_purifier':
			parseAirPurifierState(main, state)
			break
	}

	return state
}

function parseTvState(main: SmartThingsComponentStatus | undefined, state: DeviceState) {
	const volume = attr<number>(main, 'audioVolume', 'volume')
	if (typeof volume === 'number') state.volume = volume

	const playback = attr<string>(main, 'mediaPlayback', 'playbackStatus')
	if (playback) state.playing = playback === 'playing'

	const channel = attr<string>(main, 'tvChannel', 'tvChannel')
	if (channel) state.track = `CH ${channel}`
}

function parseFridgeState(status: SmartThingsDeviceStatus, state: DeviceState) {
	// samsung fridges use multi-component: cooler + freezer
	const cooler = status.components.cooler ?? status.components.main
	const freezer = status.components.freezer

	const coolTemp = attr<number>(cooler, 'temperatureMeasurement', 'temperature')
	if (typeof coolTemp === 'number') {
		const unit = attrUnit(cooler, 'temperatureMeasurement', 'temperature')
		state.temperature = unit === 'F' ? fToC(coolTemp) : coolTemp
	}

	const coolTarget = attr<number>(cooler, 'thermostatCoolingSetpoint', 'coolingSetpoint')
	if (typeof coolTarget === 'number') {
		const unit = attrUnit(cooler, 'thermostatCoolingSetpoint', 'coolingSetpoint')
		state.targetCoolTemp = unit === 'F' ? fToC(coolTarget) : coolTarget
	}

	if (freezer) {
		const freezeTemp = attr<number>(freezer, 'temperatureMeasurement', 'temperature')
		if (typeof freezeTemp === 'number') {
			const unit = attrUnit(freezer, 'temperatureMeasurement', 'temperature')
			state.targetFreezeTemp = unit === 'F' ? fToC(freezeTemp) : freezeTemp
		}
	}

	// door sensor
	const door = attr<string>(status.components.main, 'contactSensor', 'contact')
	if (door) state.extras = { ...state.extras, doorOpen: door === 'open' }
}

function parseThermostatState(main: SmartThingsComponentStatus | undefined, state: DeviceState) {
	const temp = attr<number>(main, 'temperatureMeasurement', 'temperature')
	if (typeof temp === 'number') {
		const unit = attrUnit(main, 'temperatureMeasurement', 'temperature')
		state.temperature = unit === 'F' ? fToC(temp) : temp
	}

	const mode = attr<string>(main, 'thermostatMode', 'thermostatMode')
	if (mode) state.mode = mode

	const heatTarget = attr<number>(main, 'thermostatHeatingSetpoint', 'heatingSetpoint')
	if (typeof heatTarget === 'number') {
		const unit = attrUnit(main, 'thermostatHeatingSetpoint', 'heatingSetpoint')
		state.targetTemperature = unit === 'F' ? fToC(heatTarget) : heatTarget
	}

	const coolTarget = attr<number>(main, 'thermostatCoolingSetpoint', 'coolingSetpoint')
	if (typeof coolTarget === 'number' && state.targetTemperature === undefined) {
		const unit = attrUnit(main, 'thermostatCoolingSetpoint', 'coolingSetpoint')
		state.targetTemperature = unit === 'F' ? fToC(coolTarget) : coolTarget
	}

	const humidity = attr<number>(main, 'relativeHumidityMeasurement', 'humidity')
	if (typeof humidity === 'number') state.humidity = humidity
}

function parseLightState(main: SmartThingsComponentStatus | undefined, state: DeviceState) {
	const level = attr<number>(main, 'switchLevel', 'level')
	if (typeof level === 'number') state.brightness = level

	const colorTemp = attr<number>(main, 'colorTemperature', 'colorTemperature')
	if (typeof colorTemp === 'number' && colorTemp > 0) state.colorTemp = colorTemp

	const hue = attr<number>(main, 'colorControl', 'hue')
	const sat = attr<number>(main, 'colorControl', 'saturation')
	if (typeof hue === 'number' && typeof sat === 'number') {
		state.color = hslToRgb(hue, sat, 50)
	}
}

function parseAirPurifierState(main: SmartThingsComponentStatus | undefined, state: DeviceState) {
	const fanSpeed = attr<number>(main, 'fanSpeed', 'fanSpeed')
	if (typeof fanSpeed === 'number') state.fanSpeed = fanSpeed

	const pm25 = attr<number>(main, 'dustSensor', 'fineDustLevel')
		?? attr<number>(main, 'airQualitySensor', 'airQuality')
	if (typeof pm25 === 'number') state.pm25 = pm25
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	// smartthings hue is 0-100, saturation is 0-100
	const hNorm = (h / 100) * 360
	const sNorm = s / 100
	const lNorm = l / 100

	const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
	const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1))
	const m = lNorm - c / 2

	let r = 0
	let g = 0
	let b = 0

	if (hNorm < 60) { r = c; g = x }
	else if (hNorm < 120) { r = x; g = c }
	else if (hNorm < 180) { g = c; b = x }
	else if (hNorm < 240) { g = x; b = c }
	else if (hNorm < 300) { r = x; b = c }
	else { r = c; b = x }

	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255),
	}
}
