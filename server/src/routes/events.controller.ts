import Elysia from 'elysia'

import type { DeviceEvent } from '../integrations/types'

import { db } from '../db'
import { devices } from '../db/schema'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { parseJson } from '../lib/parse-json'

export const eventsController = new Elysia({ prefix: '/api' })

	/**
	 * SSE endpoint — streams device events to all connected browser clients.
	 * On connect: immediately sends current state snapshot.
	 * Ongoing: forwards events from the internal event bus.
	 */
	.get('/events', ({ request }) => {
		// eslint-disable-next-line sonarjs/pseudo-random -- log correlation ID only, not security-sensitive
		const clientId = Math.random().toString(36).slice(2, 8)
		log.info('sse connect', { clientId })

		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
		const writer = writable.getWriter()
		const encoder = new TextEncoder()

		const send = (data: unknown) => {
			const payload = `data: ${JSON.stringify(data)}\n\n`
			writer.write(encoder.encode(payload)).catch(() => {})
		}

		// Send initial state snapshot immediately
		const snapshot = db
			.select()
			.from(devices)
			.all()
			.map((d) => ({ ...d, state: parseJson<Record<string, unknown>>(d.state).unwrapOr({}) }))
		send({ type: 'snapshot', devices: snapshot, timestamp: Date.now() })
		log.info('sse snapshot sent', { clientId, deviceCount: snapshot.length })

		// Subscribe to device events
		const handler = (event: DeviceEvent) => {
			log.debug('sse event', { clientId, type: event.type, deviceId: event.deviceId })
			send(event)
		}
		eventBus.on('device:update', handler)

		// Heartbeat every 30s to keep connection alive
		const heartbeat = setInterval(() => send({ type: 'heartbeat', timestamp: Date.now() }), 30_000)

		// Clean up when client disconnects
		request.signal.addEventListener('abort', () => {
			clearInterval(heartbeat)
			eventBus.off('device:update', handler)
			writer.close().catch(() => {})
			log.info('sse disconnect', { clientId })
		})

		return new Response(readable as unknown as ReadableStream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
			},
		})
	})
