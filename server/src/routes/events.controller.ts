import Elysia from 'elysia'

import type { DeviceEvent } from '../integrations/types'

import { db } from '../db'
import { devices } from '../db/schema'
import { eventBus } from '../lib/events'

export const eventsController = new Elysia({ prefix: '/api' })

	/**
	 * SSE endpoint — streams device events to all connected browser clients.
	 * On connect: immediately sends current state snapshot.
	 * Ongoing: forwards events from the internal event bus.
	 */
	.get('/events', ({ request }) => {
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
			.map((d) => ({
				...d,
				state: JSON.parse(d.state),
			}))
		send({ type: 'snapshot', devices: snapshot, timestamp: Date.now() })

		// Subscribe to device events
		const handler = (event: DeviceEvent) => send(event)
		eventBus.on('device:update', handler)

		// Heartbeat every 30s to keep connection alive
		const heartbeat = setInterval(() => send({ type: 'heartbeat', timestamp: Date.now() }), 30_000)

		// Clean up when client disconnects
		request.signal.addEventListener('abort', () => {
			clearInterval(heartbeat)
			eventBus.off('device:update', handler)
			writer.close().catch(() => {})
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
