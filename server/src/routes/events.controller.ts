import Elysia, { sse } from 'elysia'

import type { DeviceEvent } from '../integrations/types'

import { db } from '../db'
import { devices } from '../db/schema'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { sanitizeDevice } from '../lib/sanitize'

type HeartbeatEvent = { type: 'heartbeat'; timestamp: number }
type QueueItem = DeviceEvent | HeartbeatEvent

export const eventsController = new Elysia({ prefix: '/api' })

	/**
	 * SSE endpoint — streams device events to all connected browser clients.
	 * On connect: immediately sends current state snapshot.
	 * Ongoing: forwards events from the internal event bus.
	 *
	 * Uses Elysia's built-in sse() utility + async generator:
	 * - Content-Type: text/event-stream is set automatically
	 * - Generator is cancelled automatically when the client disconnects
	 */
	.get('/events', async function* ({ set }) {
		// eslint-disable-next-line sonarjs/pseudo-random -- log correlation ID only, not security-sensitive
		const clientId = Math.random().toString(36).slice(2, 8)
		log.info('sse connect', { clientId })

		// Must be set before the first yield
		set.headers['X-Accel-Buffering'] = 'no'

		// Send initial state snapshot immediately (metadata stripped)
		const snapshot = db
			.select()
			.from(devices)
			.all()
			.map(sanitizeDevice)
		yield sse({ data: { type: 'snapshot', devices: snapshot, timestamp: Date.now() } })
		log.info('sse snapshot sent', { clientId, deviceCount: snapshot.length })

		// Shared queue for device events + heartbeats
		const queue: QueueItem[] = []
		let notify: (() => void) | null = null
		const enqueue = (item: QueueItem) => {
			queue.push(item)
			notify?.()
			notify = null
		}

		const handler = (event: DeviceEvent) => {
			log.debug('sse event', { clientId, type: event.type, deviceId: event.deviceId })
			enqueue(event)
		}
		const heartbeat = setInterval(() => enqueue({ type: 'heartbeat', timestamp: Date.now() }), 30_000)
		eventBus.on('device:update', handler)
		eventBus.on('device:new', handler)

		try {
			// Loop forever — Elysia calls generator.return() on client disconnect,
			// which jumps to the finally block for cleanup.
			while (true) {
				const item = queue.shift()
				if (item !== undefined) {
					yield sse({ data: item })
					continue
				}
				// Park until a device event or heartbeat arrives
				await new Promise<void>((resolve) => {
					notify = resolve
				})
			}
		} finally {
			clearInterval(heartbeat)
			eventBus.off('device:update', handler)
			eventBus.off('device:new', handler)
			log.info('sse disconnect', { clientId })
		}
	})
