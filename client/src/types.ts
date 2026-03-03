import type { Device as ServerDevice, Integration, MatterConfig } from 'home-jarvis-server/src/db/schema'
import type { DetectedDevice } from 'home-jarvis-server/src/discovery/local-scanner'
import type {
	DeviceState,
	DeviceType,
	IntegrationMeta,
	CredentialField,
	ScanStartEvent,
	ScanDeviceEvent,
	ScanBrandCompleteEvent,
	ScanDoneEvent,
	ScanEvent,
} from 'home-jarvis-server/src/integrations/types'

// Re-export server types so consumers import from a single location: '../types'
export type {
	Integration,
	MatterConfig,
	DeviceState,
	DeviceType,
	IntegrationMeta,
	CredentialField,
	DetectedDevice,
	ScanStartEvent,
	ScanDeviceEvent,
	ScanBrandCompleteEvent,
	ScanDoneEvent,
	ScanEvent,
}

// ─── Device ──────────────────────────────────────────────────────────────────
// Server schema's Device has state: string (JSON blob). The API parses it
// before sending, so the over-the-wire type has state: DeviceState.
export type Device = Omit<ServerDevice, 'state'> & { state: DeviceState }

// ─── Client-only composites ───────────────────────────────────────────────────

export interface IntegrationsResponse {
	// config blob is stripped server-side (contains credentials)
	configured: Omit<Integration, 'config'>[]
	available: IntegrationMeta[]
}

// ─── SSE Events ──────────────────────────────────────────────────────────────

export interface SnapshotEvent {
	type: 'snapshot'
	devices: Device[]
	timestamp: number
}

export interface DeviceUpdateEvent {
	type: 'device:update'
	deviceId: string
	brand?: string
	state?: DeviceState
	online?: boolean
	timestamp: number
}

export interface DeviceOfflineEvent {
	type: 'device:offline'
	deviceId: string
	timestamp: number
}

export interface HeartbeatEvent {
	type: 'heartbeat'
	timestamp: number
}

export type SSEEvent = SnapshotEvent | DeviceUpdateEvent | DeviceOfflineEvent | HeartbeatEvent
