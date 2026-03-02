import { EventEmitter } from 'events'

import type { DeviceEvent } from '../integrations/types'

class DeviceEventBus extends EventEmitter<{
	'device:update': [DeviceEvent]
}> {
	publish(payload: DeviceEvent) {
		this.emit('device:update', payload)
	}
}

export const eventBus = new DeviceEventBus()
eventBus.setMaxListeners(100) // support many concurrent SSE clients
