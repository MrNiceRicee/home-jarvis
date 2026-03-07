import { AirQualityServer } from '@matter/main/behaviors/air-quality'
import { BridgedDeviceBasicInformationServer } from '@matter/main/behaviors/bridged-device-basic-information'
import { FanControlServer } from '@matter/main/behaviors/fan-control'
import { HepaFilterMonitoringServer } from '@matter/main/behaviors/hepa-filter-monitoring'
import { OnOffServer } from '@matter/main/behaviors/on-off'
import { Pm25ConcentrationMeasurementServer } from '@matter/main/behaviors/pm25-concentration-measurement'
import { ThermostatServer } from '@matter/main/behaviors/thermostat'
import { AirQuality } from '@matter/main/clusters/air-quality'
import { ConcentrationMeasurement } from '@matter/main/clusters/concentration-measurement'
import { FanControl } from '@matter/main/clusters/fan-control'
import { ResourceMonitoring } from '@matter/main/clusters/resource-monitoring'
import { Thermostat } from '@matter/main/clusters/thermostat'
import { AirPurifierDevice } from '@matter/main/devices/air-purifier'
import { AirQualitySensorDevice } from '@matter/main/devices/air-quality-sensor'
import { ExtendedColorLightDevice } from '@matter/main/devices/extended-color-light'
import { HumiditySensorDevice } from '@matter/main/devices/humidity-sensor'
import { OnOffLightDevice } from '@matter/main/devices/on-off-light'
import { OnOffPlugInUnitDevice } from '@matter/main/devices/on-off-plug-in-unit'
import { ThermostatDevice } from '@matter/main/devices/thermostat'
import { BridgedNodeEndpoint } from '@matter/main/endpoints/bridged-node'
import { Endpoint } from '@matter/main/node'
import { type Result, err, ok } from 'neverthrow'

import type { Device } from '../db/schema'
import type { DeviceState } from '../integrations/types'

import { kelvinToMired, toFanPercent, toMatterAirQuality, toMatterLevel, toMatterTemp } from '../lib/unit-conversions'

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

function toThermostatSystemMode(mode?: string): number {
	switch (mode) {
		case 'heat':
			return 4
		case 'cool':
			return 3
		case 'auto':
			return 1
		case 'off':
			return 0
		default:
			return 1
	}
}

function toFanMode(mode?: string, on?: boolean): number {
	if (!on) return 0 // Off
	switch (mode) {
		case 'auto':
			return 5 // Auto
		case 'sleep':
			return 1 // Low
		default:
			return 3 // High
	}
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

// ─── Air purifier (composed device: fan + air quality sensor) ────────────────

// air purifier with Auto fan mode, OnOff, and HEPA filter condition monitoring
const BridgedAirPurifier = AirPurifierDevice.with(
	FanControlServer.with(FanControl.Feature.Auto),
	OnOffServer,
	HepaFilterMonitoringServer.with(ResourceMonitoring.Feature.Condition),
)

// air quality sensor with numeric PM2.5 + fair/poor/verypoor quality levels
const BridgedAirQualitySensor = AirQualitySensorDevice.with(
	AirQualityServer.with(AirQuality.Feature.Fair, AirQuality.Feature.Moderate, AirQuality.Feature.VeryPoor),
	Pm25ConcentrationMeasurementServer.with(ConcentrationMeasurement.Feature.NumericMeasurement),
)

export interface AirPurifierComposed {
	kind: 'air_purifier'
	parent: Endpoint
	fanEndpoint: Endpoint
	sensorEndpoint: Endpoint
}

export interface ThermostatComposed {
	kind: 'thermostat'
	parent: Endpoint
	thermostatEndpoint: Endpoint
	humidityEndpoint: Endpoint | null
}

export type ComposedEndpoint = AirPurifierComposed | ThermostatComposed

function createAirPurifier(device: Device, state: DeviceState): ComposedEndpoint {
	const fanMode = toFanMode(state.mode, state.on)
	const isAuto = fanMode === 5
	const percent = state.fanSpeed ? toFanPercent(state.fanSpeed) : 0

	// parent bridged node — holds identity info
	const parent = new Endpoint(BridgedNodeEndpoint, {
		id: device.id,
		bridgedDeviceBasicInformation: {
			nodeLabel: device.name,
			reachable: device.online,
		},
	})

	// child 1: air purifier (fan + power + filter)
	const fanEndpoint = new Endpoint(BridgedAirPurifier, {
		id: `${device.id}-fan`,
		onOff: {
			onOff: state.on ?? false,
		},
		fanControl: {
			fanMode,
			fanModeSequence: 2, // Off/Low/Med/High/Auto
			percentSetting: isAuto ? null : percent,
			percentCurrent: percent,
		},
		hepaFilterMonitoring: {
			condition: state.filterLife ?? 100,
			degradationDirection: ResourceMonitoring.DegradationDirection.Down,
			changeIndication: ResourceMonitoring.ChangeIndication.Ok,
		},
	})

	// child 2: air quality sensor (AQ level + PM2.5)
	const sensorEndpoint = new Endpoint(BridgedAirQualitySensor, {
		id: `${device.id}-aq`,
		airQuality: {
			airQuality: toMatterAirQuality(state.airQuality),
		},
		pm25ConcentrationMeasurement: {
			measuredValue: state.pm25 ?? null,
			minMeasuredValue: 0,
			maxMeasuredValue: 500,
			measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ugm3,
			measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
		},
	})

	return { kind: 'air_purifier' as const, parent, fanEndpoint, sensorEndpoint }
}

// ─── Thermostat (composed: thermostat + humidity sensor) ─────────────────────

const BridgedThermostatEndpoint = ThermostatDevice.with(
	ThermostatServer.with(Thermostat.Feature.Heating, Thermostat.Feature.Cooling),
)

// default deadband: 2.5°C in matter's 100ths-of-degree format
const DEADBAND = 250

function thermostatSetpoints(targetCelsius: number | undefined, mode?: string) {
	const target = targetCelsius ? toMatterTemp(targetCelsius) : 2100
	// when in cool mode, set heat setpoint below target; otherwise set cool setpoint above
	if (mode === 'cool') {
		return { occupiedHeatingSetpoint: target - DEADBAND, occupiedCoolingSetpoint: target }
	}
	return { occupiedHeatingSetpoint: target, occupiedCoolingSetpoint: target + DEADBAND }
}

function createThermostat(device: Device, state: DeviceState): ThermostatComposed {
	const { occupiedHeatingSetpoint, occupiedCoolingSetpoint } = thermostatSetpoints(state.targetTemperature, state.mode)

	const parent = new Endpoint(BridgedNodeEndpoint, {
		id: device.id,
		bridgedDeviceBasicInformation: {
			nodeLabel: device.name,
			reachable: device.online,
		},
	})

	const thermostatEndpoint = new Endpoint(BridgedThermostatEndpoint, {
		id: `${device.id}-thermo`,
		thermostat: {
			systemMode: toThermostatSystemMode(state.mode),
			controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
			localTemperature: state.temperature ? toMatterTemp(state.temperature) : 2100,
			occupiedHeatingSetpoint,
			occupiedCoolingSetpoint,
		},
	})

	// humidity sensor — only if the device reports humidity
	let humidityEndpoint: Endpoint | null = null
	if (state.humidity !== undefined) {
		humidityEndpoint = new Endpoint(HumiditySensorDevice, {
			id: `${device.id}-rh`,
			relativeHumidityMeasurement: {
				measuredValue: state.humidity * 100,
				minMeasuredValue: 0,
				maxMeasuredValue: 10000,
			},
		})
	}

	return { kind: 'thermostat', parent, thermostatEndpoint, humidityEndpoint }
}

// ─── Plug ────────────────────────────────────────────────────────────────────

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

export type EndpointResult =
	| { composed: false; endpoint: Endpoint }
	| { composed: true; composed_device: ComposedEndpoint }

export function createMatterEndpoint(device: Device, state: DeviceState): Result<EndpointResult, FactoryError> {
	switch (device.type) {
		case 'light':
			return ok({
				composed: false,
				endpoint: isColorTempLight(state) ? createColorTempLight(device, state) : createOnOffLight(device, state),
			})

		case 'air_purifier':
			return ok({
				composed: true,
				composed_device: createAirPurifier(device, state),
			})

		case 'thermostat':
			return ok({ composed: true, composed_device: createThermostat(device, state) })

		case 'vacuum':
			return ok({ composed: false, endpoint: createOnOffPlugIn(device, state) })

		default:
			return err(new FactoryError(`unsupported device type for matter: ${device.type}`, device.type))
	}
}
