import type { Accessory } from '@homebridge/hap-nodejs'
import type { ResultAsync } from 'neverthrow'

import type { Device } from '../db/schema'

export type DeviceType = 'light' | 'switch' | 'thermostat' | 'air_purifier' | 'sensor'

export interface DeviceState {
	on?: boolean
	brightness?: number // 0–100
	colorTemp?: number // Kelvin
	color?: { r: number; g: number; b: number }
	temperature?: number // Celsius (for thermostats/sensors)
	humidity?: number // 0–100
	fanSpeed?: number // 0–100 (air purifiers)
	airQuality?: number // 0–5 (AQI category)
	targetTemperature?: number
	mode?: string // thermostat mode: 'heat' | 'cool' | 'auto' | 'off'
	[key: string]: unknown // brand-specific extras
}

export interface DiscoveredDevice {
	externalId: string // brand-native device ID
	name: string
	type: DeviceType
	state: DeviceState
	online: boolean
	metadata?: Record<string, unknown>
}

export interface DeviceAdapter {
	readonly brand: string
	readonly displayName: string
	readonly discoveryMethod: 'local' | 'cloud' | 'both'

	/** Validate credentials — Returns Err with a human-readable message if invalid */
	validateCredentials(config: Record<string, string>): ResultAsync<void, Error>

	/** Return all devices known to this integration */
	discover(): ResultAsync<DiscoveredDevice[], Error>

	/** Fetch current state for one device */
	getState(externalId: string): ResultAsync<DeviceState, Error>

	/** Apply a partial state change */
	setState(externalId: string, state: Partial<DeviceState>): ResultAsync<void, Error>

	/**
	 * Create a HAP Accessory for this device.
	 * Return null for adapters that should NOT be bridged to HomeKit (e.g. Aqara — already native).
	 */
	toHomeKitAccessory(device: Device): Accessory | null
}

/** Metadata fields stored with each credential form entry */
export interface IntegrationMeta {
	brand: string
	displayName: string
	/** Credential fields to show in the setup form */
	fields: CredentialField[]
	/** If true, show OAuth button instead of credential fields (LG) */
	oauthFlow?: boolean
}

export interface CredentialField {
	key: string
	label: string
	type: 'text' | 'password' | 'url'
	placeholder?: string
	hint?: string
}

/** Internal SSE event emitted when device state changes */
export interface DeviceEvent {
	type: 'device:update' | 'device:online' | 'device:offline' | 'discovery:complete'
	deviceId?: string
	brand?: string
	state?: DeviceState
	online?: boolean
	timestamp: number
}
