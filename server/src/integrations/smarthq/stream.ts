import { eq } from 'drizzle-orm'

import type { DB } from '../../db'
import { devices, integrations } from '../../db/schema'
import { toErrorMessage } from '../../lib/error-utils'
import { eventBus } from '../../lib/events'
import { log } from '../../lib/logger'
import { parseJson } from '../../lib/parse-json'
import type { DeviceState } from '../types'
import { SmartHQAdapter } from './adapter'
import type { SmartHQSession, SmartHQWebSocketEndpoint } from './types'

const RECONNECT_BASE_MS = 10_000
const RECONNECT_MAX_MS = 5 * 60_000
const DEBOUNCE_MS = 1_000

class SmartHQStream {
	private ws: WebSocket | null = null
	private db: DB | null = null
	private integrationId: string | null = null
	private adapter: SmartHQAdapter | null = null
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private reconnectDelay = RECONNECT_BASE_MS
	private stopped = false
	private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()

	async start(db: DB, integrationId: string, session: string | null) {
		this.db = db
		this.integrationId = integrationId
		this.stopped = false

		if (!session) {
			log.warn('smarthq stream: no session, skipping')
			return
		}

		this.adapter = new SmartHQAdapter({}, session, (newSession) => {
			if (!this.db || !this.integrationId) return
			this.db
				.update(integrations)
				.set({ session: newSession, updatedAt: Date.now() })
				.where(eq(integrations.id, this.integrationId))
				.run()
			log.debug('smarthq stream: session persisted to DB')
		})

		await this.subscribe()
		await this.connect()
	}

	stop() {
		this.stopped = true
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		for (const timer of this.refreshTimers.values()) clearTimeout(timer)
		this.refreshTimers.clear()

		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
		this.adapter = null
		log.info('smarthq stream stopped')
	}

	private async subscribe() {
		if (!this.adapter) return

		const session = this.adapter.session
		if (!session) return

		const parsed = parseJson<SmartHQSession>(session)
		if (parsed.isErr()) {
			log.error('failed to parse SmartHQ session', { error: parsed.error.message })
			return
		}
		const smarthqSession = parsed.value

		try {
			const res = await fetch('https://client.mysmarthq.com/v2/pubsub', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${smarthqSession.accessToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					kind: 'user#pubsub',
					pubsub: true,
					services: true,
					presence: true,
				}),
				signal: AbortSignal.timeout(15_000),
			})

			if (!res.ok) {
				log.error('smarthq pubsub subscribe failed', { status: res.status })
				return
			}
			log.info('smarthq pubsub subscribed')
		} catch (e) {
			log.error('smarthq pubsub subscribe error', { error: toErrorMessage(e) })
		}
	}

	private async connect() {
		if (this.stopped || !this.adapter) return

		try {
			const session = this.adapter.session
			if (!session) {
				log.warn('smarthq websocket: no session')
				this.scheduleReconnect()
				return
			}

			const parsed = parseJson<SmartHQSession>(session)
			if (parsed.isErr()) {
				log.error('failed to parse SmartHQ session', { error: parsed.error.message })
				this.scheduleReconnect()
				return
			}
			const smarthqSession = parsed.value

			const res = await fetch('https://client.mysmarthq.com/v2/websocket', {
				headers: { Authorization: `Bearer ${smarthqSession.accessToken}` },
				signal: AbortSignal.timeout(15_000),
			})

			if (!res.ok) {
				log.error('smarthq websocket endpoint failed', { status: res.status })
				this.scheduleReconnect()
				return
			}

			const data = (await res.json()) as SmartHQWebSocketEndpoint
			const wsUrl = data.endpoint

			if (!wsUrl?.startsWith('wss://')) {
				log.error('smarthq websocket: invalid endpoint URL', { url: wsUrl })
				this.scheduleReconnect()
				return
			}

			log.info('smarthq websocket connecting')
			this.ws = new WebSocket(wsUrl)

			this.ws.onopen = () => {
				log.info('smarthq websocket connected')
				this.reconnectDelay = RECONNECT_BASE_MS
			}

			this.ws.onmessage = (event) => {
				if (typeof event.data === 'string') this.handleMessage(event.data)
			}

			this.ws.onclose = () => {
				log.info('smarthq websocket closed')
				this.ws = null
				if (!this.stopped) this.scheduleReconnect()
			}

			this.ws.onerror = (event) => {
				log.error('smarthq websocket error', { error: String(event) })
			}
		} catch (e) {
			log.error('smarthq websocket connect failed', { error: toErrorMessage(e) })
			this.scheduleReconnect()
		}
	}

	private handleMessage(raw: string) {
		if (!this.db) return

		const parsed = parseJson<Record<string, unknown>>(raw)
		if (parsed.isErr()) {
			log.warn('failed to parse WebSocket message', { error: parsed.error.message })
			return
		}
		const msg = parsed.value

		const deviceId = typeof msg.deviceId === 'string' ? msg.deviceId : undefined
		if (!deviceId) return

		const device = this.db.select().from(devices).where(eq(devices.externalId, deviceId)).get()

		if (!device) return

		if (msg.kind === 'device#presence') {
			const online = msg.presence === 'ONLINE'
			this.db
				.update(devices)
				.set({ online, updatedAt: Date.now(), lastSeen: Date.now() })
				.where(eq(devices.id, device.id))
				.run()

			eventBus.publish({
				type: online ? 'device:online' : 'device:offline',
				deviceId: device.id,
				brand: 'ge',
				online,
				timestamp: Date.now(),
				source: 'stream',
			})
			return
		}

		if (msg.kind === 'service#state' || msg.kind === 'device#state') {
			const existing = this.refreshTimers.get(device.id)
			if (existing) clearTimeout(existing)

			this.refreshTimers.set(
				device.id,
				setTimeout(() => {
					this.refreshTimers.delete(device.id)
					void this.refreshDeviceState(device.id, deviceId)
				}, DEBOUNCE_MS),
			)
		}
	}

	private async refreshDeviceState(jarvisDeviceId: string, externalId: string) {
		if (!this.db || !this.adapter) return

		try {
			const result = await this.adapter.getState(externalId)
			if (result.isErr()) {
				log.error('smarthq state refresh failed', {
					deviceId: jarvisDeviceId,
					error: result.error.message,
				})
				return
			}

			const newState = result.value
			const device = this.db.select().from(devices).where(eq(devices.id, jarvisDeviceId)).get()
			if (!device) return

			const currentState = parseJson<DeviceState>(device.state).unwrapOr({})
			const merged = { ...currentState, ...newState }
			const now = Date.now()

			this.db
				.update(devices)
				.set({ state: JSON.stringify(merged), online: true, lastSeen: now, updatedAt: now })
				.where(eq(devices.id, jarvisDeviceId))
				.run()

			eventBus.publish({
				type: 'device:update',
				deviceId: jarvisDeviceId,
				brand: 'ge',
				state: merged,
				timestamp: now,
				source: 'stream',
			})
		} catch (e) {
			log.error('smarthq state refresh error', { error: toErrorMessage(e) })
		}
	}

	private scheduleReconnect() {
		if (this.stopped || this.reconnectTimer) return

		const jitter =
			this.reconnectDelay * 0.25 * ((crypto.getRandomValues(new Float32Array(1))[0] ?? 0) * 2 - 1)
		const delay = Math.round(this.reconnectDelay + jitter)

		log.info('smarthq websocket reconnecting', { delayMs: delay })
		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null
			await this.subscribe()
			await this.connect()
		}, delay)

		this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
	}
}

export const smartHQStream = new SmartHQStream()
