import { BridgedDeviceBasicInformationServer } from '@matter/main/behaviors/bridged-device-basic-information'
import { ThermostatServer } from '@matter/main/behaviors/thermostat'
import { Thermostat } from '@matter/main/clusters/thermostat'
import { ExtendedColorLightDevice } from '@matter/main/devices/extended-color-light'
import { FanDevice } from '@matter/main/devices/fan'
import { OnOffLightDevice } from '@matter/main/devices/on-off-light'
import { OnOffPlugInUnitDevice } from '@matter/main/devices/on-off-plug-in-unit'
import { ThermostatDevice } from '@matter/main/devices/thermostat'
import { Endpoint } from '@matter/main/node'
import { type Result, err, ok } from 'neverthrow'

import type { Device } from '../db/schema'
import type { DeviceState } from '../integrations/types'

// ─── Error types ─────────────────────────────────────────────────────────────

export class FactoryError extends Error {
	readonly deviceType: string

	constructor(message: string, deviceType: string) {
		super(message)
		this.name = 'FactoryError'
		this.deviceType = deviceType
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// 0-100 brightness → 0-254 matter level
function toMatterLevel(brightness: number): number {
	return Math.round(Math.min(100, Math.max(0, brightness)) * 2.54)
}

// 0-100 fan speed → 0-100 matter percent (same scale, just clamped)
function toFanPercent(speed: number): number {
	return Math.round(Math.min(100, Math.max(0, speed)))
}

// our mode string → matter SystemMode enum value
function toThermostatSystemMode(mode?: string): number {
	switch (mode) {
		case 'heat':
			return 4 // Heating
		case 'cool':
			return 3 // Cooling
		case 'auto':
			return 1 // Auto
		case 'off':
			return 0 // Off
		default:
			return 1 // default to auto
	}
}

// celsius → matter temperature (celsius * 100, fixed-point)
function toMatterTemp(celsius: number): number {
	return Math.round(celsius * 100)
}

// kelvin → mireds (micro reciprocal degrees)
function kelvinToMired(kelvin: number): number {
	return Math.round(1_000_000 / Math.max(1, kelvin))
}

// ─── Device type detection ───────────────────────────────────────────────────

function isColorTempLight(state: DeviceState): boolean {
	return state.brightness !== undefined || state.colorTemp !== undefined
}

// ─── Endpoint builders ───────────────────────────────────────────────────────

function createOnOffLight(device: Device, state: DeviceState): Endpoint {
	return new Endpoint(
		OnOffLightDevice.with(BridgedDeviceBasicInformationServer),
		{
			id: device.id,
			bridgedDeviceBasicInformation: {
				nodeLabel: device.name,
				reachable: device.online,
			},
			onOff: {
				onOff: state.on ?? false,
			},
		},
	)
}

// elgato range: 2900–7000K → ~143–345 mireds
const CT_PHYSICAL_MIN_MIREDS = 143
const CT_PHYSICAL_MAX_MIREDS = 345

function createColorTempLight(device: Device, state: DeviceState): Endpoint {
	const mireds = state.colorTemp ? kelvinToMired(state.colorTemp) : 250
	return new Endpoint(
		ExtendedColorLightDevice.with(BridgedDeviceBasicInformationServer),
		{
			id: device.id,
			bridgedDeviceBasicInformation: {
				nodeLabel: device.name,
				reachable: device.online,
			},
			onOff: {
				onOff: state.on ?? false,
			},
			levelControl: {
				currentLevel: state.brightness ? toMatterLevel(state.brightness) : 254,
			},
			colorControl: {
				colorMode: 2, // ColorTemperatureMireds
				colorTemperatureMireds: mireds,
				colorTempPhysicalMinMireds: CT_PHYSICAL_MIN_MIREDS,
				colorTempPhysicalMaxMireds: CT_PHYSICAL_MAX_MIREDS,
				coupleColorTempToLevelMinMireds: CT_PHYSICAL_MIN_MIREDS,
			},
		},
	)
}

function createFan(device: Device, state: DeviceState): Endpoint {
	return new Endpoint(
		FanDevice.with(BridgedDeviceBasicInformationServer),
		{
			id: device.id,
			bridgedDeviceBasicInformation: {
				nodeLabel: device.name,
				reachable: device.online,
			},
			fanControl: {
				fanMode: state.on ? 3 : 0, // 0=Off, 3=High — simplified
				percentSetting: state.fanSpeed ? toFanPercent(state.fanSpeed) : 0,
				percentCurrent: state.fanSpeed ? toFanPercent(state.fanSpeed) : 0,
			},
		},
	)
}

// thermostat cluster isn't included by default — must add ThermostatServer with feature flags
const BridgedThermostat = ThermostatDevice.with(
	BridgedDeviceBasicInformationServer,
	ThermostatServer.with(Thermostat.Feature.Heating, Thermostat.Feature.Cooling),
)

function createThermostat(device: Device, state: DeviceState): Endpoint {
	return new Endpoint(BridgedThermostat, {
		id: device.id,
		bridgedDeviceBasicInformation: {
			nodeLabel: device.name,
			reachable: device.online,
		},
		thermostat: {
			systemMode: toThermostatSystemMode(state.mode),
			localTemperature: state.temperature ? toMatterTemp(state.temperature) : 2100,
			occupiedHeatingSetpoint: state.targetTemperature ? toMatterTemp(state.targetTemperature) : 2100,
			occupiedCoolingSetpoint: state.targetTemperature ? toMatterTemp(state.targetTemperature) : 2600,
		},
	})
}

function createOnOffPlugIn(device: Device, state: DeviceState): Endpoint {
	return new Endpoint(
		OnOffPlugInUnitDevice.with(BridgedDeviceBasicInformationServer),
		{
			id: device.id,
			bridgedDeviceBasicInformation: {
				nodeLabel: device.name,
				reachable: device.online,
			},
			onOff: {
				onOff: state.on ?? false,
			},
		},
	)
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createMatterEndpoint(device: Device, state: DeviceState): Result<Endpoint, FactoryError> {
	switch (device.type) {
		case 'light':
			return ok(
				isColorTempLight(state) ? createColorTempLight(device, state) : createOnOffLight(device, state),
			)

		case 'air_purifier':
			return ok(createFan(device, state))

		case 'thermostat':
			return ok(createThermostat(device, state))

		case 'vacuum':
			return ok(createOnOffPlugIn(device, state))

		default:
			return err(new FactoryError(`unsupported device type for matter: ${device.type}`, device.type))
	}
}
