import Elysia, { sse } from 'elysia'

import type { DeviceEvent } from '../integrations/types'

import { db } from '../db'
import { devices } from '../db/schema'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { parseJson } from '../lib/parse-json'

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
	.get('/events', async function* ({ set, request }) {
		// eslint-disable-next-line sonarjs/pseudo-random -- log correlation ID only, not security-sensitive
		const clientId = Math.random().toString(36).slice(2, 8)
		log.info('sse connect', { clientId })

		// Must be set before the first yield
		set.headers['X-Accel-Buffering'] = 'no'

		// Send initial state snapshot immediately
		const snapshot = db
			.select()
			.from(devices)
			.all()
			.map((d) => ({ ...d, state: parseJson<Record<string, unknown>>(d.state).unwrapOr({}) }))
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

		try {
			while (!request.signal.aborted) {
				const item = queue.shift()
				if (item !== undefined) {
					yield sse({ data: item })
					continue
				}
				// Park until a new event arrives or client disconnects
				await new Promise<void>((resolve) => {
					notify = resolve
					request.signal.addEventListener('abort', () => resolve(), { once: true })
				})
			}
		} finally {
			clearInterval(heartbeat)
			eventBus.off('device:update', handler)
			log.info('sse disconnect', { clientId })
		}
	})
