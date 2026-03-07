import { EventEmitter } from 'events'

import type { DeviceEvent } from '../integrations/types'

// device:update is the catch-all channel — device:online, device:offline,
// and discovery:complete events are all routed through it via publish()
class DeviceEventBus extends EventEmitter<{
	'device:update': [DeviceEvent]
	'device:new': [DeviceEvent]
}> {
	publish(payload: DeviceEvent) {
		if (payload.type === 'device:new') {
			this.emit('device:new', payload)
		} else {
			this.emit('device:update', payload)
		}
	}
}

export const eventBus = new DeviceEventBus()
eventBus.setMaxListeners(100) // support many concurrent SSE clients
