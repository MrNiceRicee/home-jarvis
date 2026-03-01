// ─── Device ──────────────────────────────────────────────────────────────────

export type DeviceType = 'light' | 'switch' | 'thermostat' | 'air_purifier' | 'sensor'

export interface DeviceState {
  on?: boolean
  brightness?: number      // 0–100
  colorTemp?: number       // Kelvin
  color?: { r: number; g: number; b: number }
  temperature?: number     // Celsius
  humidity?: number
  fanSpeed?: number        // 0–100
  airQuality?: number
  targetTemperature?: number
  mode?: string
  [key: string]: unknown
}

export interface Device {
  id: string
  integrationId: string | null
  brand: string
  externalId: string
  name: string
  type: DeviceType
  state: DeviceState
  online: boolean
  homekitEnabled: boolean
  homekitUuid: string | null
  lastSeen: number | null
  createdAt: number
  updatedAt: number
}

// ─── Integration ─────────────────────────────────────────────────────────────

export interface Integration {
  id: string
  brand: string
  config: string   // JSON — never expose raw to UI
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface CredentialField {
  key: string
  label: string
  type: 'text' | 'password' | 'url'
  placeholder?: string
  hint?: string
}

export interface IntegrationMeta {
  brand: string
  displayName: string
  fields: CredentialField[]
  oauthFlow?: boolean
}

export interface IntegrationsResponse {
  configured: Integration[]
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

// ─── HomeKit ─────────────────────────────────────────────────────────────────

export interface HomekitConfig {
  id: string
  pin: string
  username: string
  port: number
  paired: boolean
  createdAt: number
}
