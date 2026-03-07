import type { Device } from '../db/schema'
import type { DeviceState, SanitizedDevice } from '../integrations/types'

import { parseJson } from './parse-json'

/** strip metadata from device payloads before sending over SSE */
export function sanitizeDevice(device: Device): SanitizedDevice {
	return {
		id: device.id,
		integrationId: device.integrationId,
		brand: device.brand,
		externalId: device.externalId,
		name: device.name,
		type: device.type,
		state: parseJson<DeviceState>(device.state).unwrapOr({}),
		online: device.online,
		hidden: device.hidden,
		matterEnabled: device.matterEnabled,
		matterEndpointId: device.matterEndpointId,
		sectionId: device.sectionId,
		position: device.position,
		lastSeen: device.lastSeen,
		createdAt: device.createdAt,
		updatedAt: device.updatedAt,
	}
}
