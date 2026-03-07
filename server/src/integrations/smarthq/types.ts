/** SmartHQ Digital Twin API types — derived from OpenAPI spec at client.mysmarthq.com */

export interface SmartHQSession {
	accessToken: string
	refreshToken: string
	expiresAt: number // unix ms
}

// ─── Device list ─────────────────────────────────────────────────────────────

export interface SmartHQDeviceListResponse {
	kind: 'device#list'
	devices: SmartHQDevice[]
	total: number
	page: number
	perpage: number
}

export interface SmartHQDevice {
	deviceId: string
	deviceType: string // e.g. "cloud.smarthq.device.washer"
	nickname: string
	model: string
	manufacturer: string
	presence: 'ONLINE' | 'OFFLINE'
	room: string
	macAddress: string
	lastSyncTime: string
	lastPresenceTime: string
	createdDateTime: string
	adapterId: string
	gatewayId: string
}

// ─── Device detail (includes services) ───────────────────────────────────────

export interface SmartHQDeviceDetail extends SmartHQDevice {
	kind: 'device#item'
	services: SmartHQService[]
	alertTypes?: string[]
	removable?: boolean
}

export interface SmartHQService {
	serviceId: string
	serviceType: string // e.g. "cloud.smarthq.service.laundry.mode.v1"
	domainType: string // e.g. "cloud.smarthq.domain.power"
	serviceDeviceType: string
	state: Record<string, unknown>
	config: Record<string, unknown>
	supportedCommands: string[]
	lastSyncTime: string
	lastStateTime: string
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

export interface SmartHQWebSocketEndpoint {
	kind: 'websocket#endpoint'
	endpoint: string // wss:// URL
}

// ─── PubSub config ───────────────────────────────────────────────────────────

export interface SmartHQPubSubConfig {
	kind: 'user#pubsub'
	pubsub: boolean
	services?: boolean
	presence?: boolean
	alerts?: boolean
	commands?: boolean
}
