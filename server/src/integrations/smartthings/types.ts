// SmartThings REST API v1 response shapes

export interface SmartThingsCapabilityRef {
	id: string
	version: number
}

export interface SmartThingsComponent {
	id: string
	label?: string
	capabilities: SmartThingsCapabilityRef[]
}

export interface SmartThingsDevice {
	deviceId: string
	name: string
	label: string
	manufacturerName?: string
	presentationId?: string
	deviceManufacturerCode?: string
	locationId?: string
	roomId?: string
	components: SmartThingsComponent[]
}

export interface SmartThingsDeviceListResponse {
	items: SmartThingsDevice[]
	_links?: { next?: { href: string } }
}

// status response: components → capabilityId → attributeName → { value, unit?, timestamp? }
export interface SmartThingsAttributeValue {
	value: unknown
	unit?: string
	timestamp?: string
}

export type SmartThingsCapabilityStatus = Record<string, SmartThingsAttributeValue>
export type SmartThingsComponentStatus = Record<string, SmartThingsCapabilityStatus>

export interface SmartThingsDeviceStatus {
	components: Record<string, SmartThingsComponentStatus>
}

export interface SmartThingsDeviceHealth {
	deviceId: string
	state: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'
	lastUpdatedDate?: string
}
