import type { ResultAsync } from 'neverthrow'

import type { Device as SchemaDevice } from '../db/schema'

export type DeviceType =
	| 'light'
	| 'switch'
	| 'thermostat'
	| 'air_purifier'
	| 'sensor'
	| 'vacuum'
	| 'washer_dryer'
	| 'dishwasher'
	| 'oven'
	| 'fridge'
	| 'tv'
	| 'media_player'

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

	// Vacuum
	status?: string // 'cleaning' | 'docked' | 'returning' | 'paused' | 'error'
	battery?: number // 0–100

	// Media / TV
	volume?: number // 0–100
	playing?: boolean
	track?: string // currently playing track name

	// Appliances (washer, dishwasher, oven)
	cycleStatus?: string // 'running' | 'paused' | 'done' | 'idle'
	timeRemaining?: number // minutes
	doorLocked?: boolean

	// Fridge
	targetCoolTemp?: number // fridge target °C
	targetFreezeTemp?: number // freezer target °C

	// Air purifier metrics
	pm25?: number // ug/m3
	filterLife?: number // 0-100 percentage

	extras?: Record<string, unknown> // brand-specific extras
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
}

/** Metadata fields stored with each credential form entry */
export interface IntegrationMeta {
	brand: string
	displayName: string
	/** Credential fields to show in the setup form */
	fields: CredentialField[]
	/** If true, show OAuth button instead of credential fields (LG) */
	oauthFlow?: boolean
	/** true for brands discovered locally without credentials (e.g. Elgato) */
	discoveryOnly?: boolean
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
	type: 'device:update' | 'device:new' | 'device:online' | 'device:offline' | 'discovery:complete'
	deviceId?: string
	brand?: string
	state?: DeviceState
	online?: boolean
	timestamp: number
	source?: 'dashboard' | 'poller' | 'matter' | 'scan'
	device?: SanitizedDevice
}

/** Device payload with metadata stripped (safe for SSE) */
export type SanitizedDevice = Omit<SchemaDevice, 'metadata' | 'state'> & {
	state: DeviceState
}

// ─── Scan SSE events ────────────────────────────────────────────────────────

export interface ScanStartEvent {
	type: 'scan:start'
	brands: string[]
}

export interface ScanDeviceEvent {
	type: 'scan:device'
	device: {
		brand: string
		label: string
		details: Record<string, string>
		via: 'upnp' | 'mdns' | 'udp'
	}
}

export interface ScanBrandCompleteEvent {
	type: 'scan:complete'
	brand: string
	count: number
	error?: string
}

export interface ScanDoneEvent {
	type: 'scan:done'
	totalDevices: number
}

export type ScanEvent = ScanStartEvent | ScanDeviceEvent | ScanBrandCompleteEvent | ScanDoneEvent
