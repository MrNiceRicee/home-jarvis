import { EventEmitter } from 'events'
import type { DeviceEvent } from '../integrations/types'

class DeviceEventBus extends EventEmitter {
  emit(event: 'device:update', payload: DeviceEvent): boolean
  emit(event: string, payload: unknown): boolean {
    return super.emit(event, payload)
  }

  on(event: 'device:update', listener: (payload: DeviceEvent) => void): this
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }

  off(event: 'device:update', listener: (payload: DeviceEvent) => void): this
  off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener)
  }

  publish(payload: DeviceEvent) {
    this.emit('device:update', payload)
  }
}

export const eventBus = new DeviceEventBus()
eventBus.setMaxListeners(100) // support many concurrent SSE clients
