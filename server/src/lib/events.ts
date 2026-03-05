import { EventEmitter } from 'events'

import type { DeviceEvent } from '../integrations/types'

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
