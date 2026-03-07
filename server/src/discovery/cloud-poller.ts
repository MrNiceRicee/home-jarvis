import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'

import type { DB } from '../db'
import type { Device, Integration } from '../db/schema'
import { devices, integrations } from '../db/schema'
import { createAdapter, INTEGRATION_META } from '../integrations/registry'
import { smartHQStream } from '../integrations/smarthq/stream'
import type { DeviceState, DeviceType } from '../integrations/types'
import { toErrorMessage } from '../lib/error-utils'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { nextPosition } from '../lib/next-position'
import { parseJson } from '../lib/parse-json'
import { sanitizeDevice } from '../lib/sanitize'
import { isPrivateIp } from '../lib/validate-ip'

interface PollConfig {
	/** State poll interval in ms (default 60s) */
	stateIntervalMs: number
	/** Device list poll interval in ms (default 5min) */
	discoverIntervalMs: number
}

const DEFAULTS: Record<string, PollConfig> = {
	hue: { stateIntervalMs: 30_000, discoverIntervalMs: 5 * 60_000 },
	govee: { stateIntervalMs: 120_000, discoverIntervalMs: 5 * 60_000 },
	vesync: { stateIntervalMs: 30_000, discoverIntervalMs: 5 * 60_000 },
	lg: { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 },
	ge: { stateIntervalMs: 0, discoverIntervalMs: 15 * 60_000 },
	aqara: { stateIntervalMs: 30_000, discoverIntervalMs: 5 * 60_000 },
	smartthings: { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 },
	resideo: { stateIntervalMs: 5 * 60_000, discoverIntervalMs: 15 * 60_000 },
	elgato: { stateIntervalMs: 15_000, discoverIntervalMs: 5 * 60_000 },
}

const CONCURRENCY = 5
const GRACE_PERIOD_MS = 60_000

const timers = new Map<string, ReturnType<typeof setInterval>>()

/** read session from an adapter instance (only cloud adapters expose this) */
export function adapterSession(adapter: { session?: string | null }): string | null {
	return typeof adapter.session === 'string' ? adapter.session : null
}

/** persist session + authError back to the integrations row */
function persistSession(
	db: DB,
	integrationId: string,
	session: string | null,
	authError: string | null,
) {
	db.update(integrations)
		.set({ session, authError, updatedAt: Date.now() })
		.where(eq(integrations.id, integrationId))
		.run()
}

/** persist adapter session if tokens were refreshed during an operation */
export function persistAdapterSession(
	db: DB,
	adapter: { session?: string | null },
	integration: { id: string; session: string | null },
) {
	const updatedSession = adapterSession(adapter)
	if (updatedSession && updatedSession !== integration.session) {
		db.update(integrations)
			.set({ session: updatedSession, updatedAt: Date.now() })
			.where(eq(integrations.id, integration.id))
			.run()
	}
}

/** Start polling for a single integration */
export function startPolling(db: DB, integration: Integration) {
	const { id: integrationId, brand } = integration
	const config = parseJson<Record<string, string>>(integration.config).unwrapOr({})

	stopPolling(integrationId, brand)

	// SmartHQ uses WebSocket stream instead of polling
	if (brand === 'ge') {
		void smartHQStream.start(db, integration.id, integration.session)
		runDiscovery(db, integrationId, brand, config, integration.session ?? null).catch(
			(err: unknown) => {
				log.error('ge initial discovery failed', { brand, error: toErrorMessage(err) })
			},
		)
		return
	}

	const pollCfg = DEFAULTS[brand] ?? { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 }
	log.info('poller start', { brand, integrationId, discoverIntervalMs: pollCfg.discoverIntervalMs })

	const doDiscovery = async () => {
		const latest = db
			.select({ session: integrations.session })
			.from(integrations)
			.where(eq(integrations.id, integrationId))
			.get()
		const currentSession = latest?.session ?? null
		await runDiscovery(db, integrationId, brand, config, currentSession)
	}

	const doStatePoll = async () => {
		const latest = db
			.select({ session: integrations.session })
			.from(integrations)
			.where(eq(integrations.id, integrationId))
			.get()
		const currentSession = latest?.session ?? null
		await runStatePoll(db, integrationId, brand, config, currentSession)
	}

	doDiscovery().catch((err: unknown) => {
		log.error('poller runDiscovery unexpected error', {
			brand,
			error: toErrorMessage(err),
		})
	})

	const discoverTimer = setInterval(
		() =>
			doDiscovery().catch((err: unknown) => {
				log.error('poller runDiscovery unexpected error', {
					brand,
					error: toErrorMessage(err),
				})
			}),
		pollCfg.discoverIntervalMs,
	)
	timers.set(`${integrationId}:discover`, discoverTimer)

	// state poll: more frequent than discovery for responsive UI
	// discovery-only brands handle this in runDiscovery already (per-device poll)
	const meta = INTEGRATION_META[brand]
	if (!meta?.discoveryOnly && pollCfg.stateIntervalMs < pollCfg.discoverIntervalMs) {
		const stateTimer = setInterval(
			() =>
				doStatePoll().catch((err: unknown) => {
					log.error('poller runStatePoll unexpected error', {
						brand,
						error: toErrorMessage(err),
					})
				}),
			pollCfg.stateIntervalMs,
		)
		timers.set(`${integrationId}:state`, stateTimer)
		log.info('poller state poll', {
			brand,
			integrationId,
			stateIntervalMs: pollCfg.stateIntervalMs,
		})
	}
}

/** Stop all timers for an integration */
export function stopPolling(integrationId: string, brand: string) {
	if (brand === 'ge') smartHQStream.stop()
	let stopped = 0
	for (const key of [`${integrationId}:discover`, `${integrationId}:state`]) {
		const t = timers.get(key)
		if (t) {
			clearInterval(t)
			timers.delete(key)
			stopped++
		}
	}
	if (stopped > 0) log.info('poller stop', { integrationId })
}

/** Upsert a single discovered device — update if exists, insert if new */
function upsertDevice(
	db: DB,
	integrationId: string,
	brand: string,
	d: {
		externalId: string
		name: string
		type: DeviceType
		state: DeviceState
		metadata?: Record<string, unknown>
		online: boolean
	},
	now: number,
) {
	const existing = db.select().from(devices).where(eq(devices.externalId, d.externalId)).get()

	if (existing) {
		const newStateStr = JSON.stringify(d.state)
		const stateChanged = newStateStr !== (existing.state ?? '{}')
		const onlineChanged = d.online !== existing.online

		// always update lastSeen; only write state/online if changed
		const updates: Record<string, unknown> = { lastSeen: now }
		if (stateChanged) {
			updates.state = newStateStr
			updates.updatedAt = now
		}
		if (onlineChanged) {
			updates.online = d.online
			updates.updatedAt = now
		}
		if (d.name !== existing.name) {
			updates.name = d.name
			updates.updatedAt = now
		}
		if (d.type !== existing.type) {
			updates.type = d.type
			updates.updatedAt = now
		}
		if (d.metadata) {
			updates.metadata = JSON.stringify(d.metadata)
		}

		db.update(devices).set(updates).where(eq(devices.id, existing.id)).run()

		if (stateChanged || onlineChanged) {
			log.debug('poller device updated', {
				brand,
				deviceId: existing.id,
				deviceName: d.name,
				online: d.online,
			})
			eventBus.publish({
				type: 'device:update',
				deviceId: existing.id,
				brand,
				state: d.state,
				online: d.online,
				timestamp: now,
				source: 'poller',
			})
		}
		return
	}

	const id = randomUUID()
	const position = nextPosition(db, 'home')
	db.insert(devices)
		.values({
			id,
			integrationId,
			brand,
			externalId: d.externalId,
			name: d.name,
			type: d.type,
			state: JSON.stringify(d.state),
			metadata: d.metadata ? JSON.stringify(d.metadata) : null,
			online: d.online,
			sectionId: 'home',
			position,
			lastSeen: now,
			createdAt: now,
			updatedAt: now,
		})
		.run()

	const inserted = db.select().from(devices).where(eq(devices.id, id)).get()
	log.info('poller device discovered', { brand, deviceId: id, deviceName: d.name, type: d.type })
	if (inserted) {
		eventBus.publish({
			type: 'device:new',
			deviceId: id,
			brand,
			state: d.state,
			online: true,
			timestamp: now,
			source: 'poller',
			device: sanitizeDevice(inserted),
		})
	}
}

/** Mark devices not seen this cycle as offline */
function markAbsentDevicesOffline(
	db: DB,
	integrationId: string,
	brand: string,
	seenExternalIds: Set<string>,
	now: number,
) {
	const allDevices = db.select().from(devices).where(eq(devices.integrationId, integrationId)).all()

	for (const device of allDevices) {
		if (!seenExternalIds.has(device.externalId) && device.online) {
			db.update(devices)
				.set({ online: false, updatedAt: now })
				.where(eq(devices.id, device.id))
				.run()
			log.warn('poller device offline', { brand, deviceId: device.id, deviceName: device.name })
			eventBus.publish({
				type: 'device:offline',
				deviceId: device.id,
				brand,
				online: false,
				timestamp: now,
				source: 'poller',
			})
		}
	}
}

interface StatePollResult {
	deviceId: string
	state: DeviceState
	stateStr: string
	stateChanged: boolean
	onlineChanged: boolean
}

/** commit poll results to DB in a single transaction and emit SSE events */
function flushPollResults(db: DB, brand: string, results: StatePollResult[], now: number) {
	db.transaction((tx) => {
		for (const { deviceId, stateStr, stateChanged, onlineChanged } of results) {
			const updates: Record<string, unknown> = { lastSeen: now }
			if (stateChanged) {
				updates.state = stateStr
				updates.updatedAt = now
			}
			if (onlineChanged) {
				updates.online = true
				updates.updatedAt = now
			}
			tx.update(devices).set(updates).where(eq(devices.id, deviceId)).run()
		}
	})

	for (const { deviceId, state, stateChanged, onlineChanged } of results) {
		if (stateChanged || onlineChanged) {
			eventBus.publish({
				type: 'device:update',
				deviceId,
				brand,
				state,
				online: true,
				timestamp: now,
				source: 'poller',
			})
		}
	}
}

/** Lightweight state poll — fetch per-device state only, no upsert/offline logic. Returns updated session. */
async function runStatePoll(
	db: DB,
	integrationId: string,
	brand: string,
	config: Record<string, string>,
	session: string | null,
): Promise<string | null> {
	const adapterResult = createAdapter(brand, config, session)
	if (adapterResult.isErr()) return session

	const adapter = adapterResult.value

	// query existing DB devices for this integration
	const deviceRows = db.select().from(devices).where(eq(devices.integrationId, integrationId)).all()
	if (deviceRows.length === 0) return session

	const now = Date.now()
	let hasDeviceError = false
	const pollResults: StatePollResult[] = []

	// bounded concurrency — poll each device individually
	for (let i = 0; i < deviceRows.length; i += CONCURRENCY) {
		const batch = deviceRows.slice(i, i + CONCURRENCY)
		const results = await Promise.allSettled(
			batch.map(async (existing): Promise<StatePollResult | null> => {
				const stateResult = await adapter.getState(existing.externalId)
				if (stateResult.isErr()) {
					hasDeviceError = true
					return null
				}
				const state = stateResult.value
				const stateStr = JSON.stringify(state)
				return {
					deviceId: existing.id,
					state,
					stateStr,
					stateChanged: stateStr !== (existing.state ?? '{}'),
					onlineChanged: !existing.online,
				}
			}),
		)

		for (const r of results) {
			if (r.status === 'fulfilled' && r.value) pollResults.push(r.value)
		}
	}

	flushPollResults(db, brand, pollResults, now)

	// persist session after adapter operations
	const updatedSession = adapterSession(adapter) ?? session
	if (hasDeviceError) {
		persistSession(db, integrationId, updatedSession, 'state poll failed for one or more devices')
	} else {
		persistSession(db, integrationId, updatedSession, null)
	}

	return updatedSession
}

/** Run device discovery + upsert results into DB. Returns updated session. */
export async function runDiscovery(
	db: DB,
	integrationId: string,
	brand: string,
	config: Record<string, string>,
	session: string | null,
): Promise<string | null> {
	const meta = INTEGRATION_META[brand]

	// discovery-only brands: poll each device individually from stored metadata (no session needed)
	if (meta?.discoveryOnly) {
		const deviceRows = db
			.select()
			.from(devices)
			.where(eq(devices.integrationId, integrationId))
			.all()
		await pollDevicesIndividually(db, brand, deviceRows)
		return session
	}

	// standard integration-level discovery
	const adapterResult = createAdapter(brand, config, session)
	if (adapterResult.isErr()) {
		log.debug('poller adapter unavailable', { brand })
		return session
	}

	const adapter = adapterResult.value
	log.debug('poller discovery run', { brand })
	const discoveredResult = await adapter.discover()

	// persist session after adapter operation
	const updatedSession = adapterSession(adapter) ?? session

	if (discoveredResult.isErr()) {
		log.error('poller discovery failed', { brand, error: discoveredResult.error.message })
		persistSession(db, integrationId, updatedSession, discoveredResult.error.message)
		return updatedSession
	}

	// clear authError on success
	persistSession(db, integrationId, updatedSession, null)

	const discovered = discoveredResult.value
	log.info('poller discovery ok', { brand, deviceCount: discovered.length })

	const now = Date.now()
	const seenExternalIds = new Set<string>()

	for (const d of discovered) {
		seenExternalIds.add(d.externalId)
		upsertDevice(db, integrationId, brand, d, now)
	}

	markAbsentDevicesOffline(db, integrationId, brand, seenExternalIds, now)
	eventBus.publish({ type: 'discovery:complete', brand, timestamp: now, source: 'poller' })

	return updatedSession
}

interface IndividualPollResult {
	deviceId: string
	state: DeviceState
	online: boolean
	brand: string
	skippedGrace?: boolean
}

/** commit per-device poll results with change detection and emit SSE only when state differs */
function flushIndividualResults(
	db: DB,
	existingMap: Map<string, { state: string; online: boolean }>,
	results: IndividualPollResult[],
	now: number,
) {
	db.transaction((tx) => {
		for (const { deviceId, state, online } of results) {
			const existing = existingMap.get(deviceId)
			const stateStr = Object.keys(state).length > 0 ? JSON.stringify(state) : null
			const stateChanged = stateStr !== null && stateStr !== existing?.state
			const onlineChanged = online !== existing?.online

			const updates: Record<string, unknown> = { online, lastSeen: now }
			if (stateChanged && stateStr) updates.state = stateStr
			if (stateChanged || onlineChanged) updates.updatedAt = now
			tx.update(devices).set(updates).where(eq(devices.id, deviceId)).run()
		}
	})

	for (const result of results) {
		if (result.skippedGrace) continue
		const existing = existingMap.get(result.deviceId)
		const stateStr = Object.keys(result.state).length > 0 ? JSON.stringify(result.state) : null
		const stateChanged = stateStr !== null && stateStr !== existing?.state
		const onlineChanged = result.online !== existing?.online
		if (!stateChanged && !onlineChanged) continue

		eventBus.publish({
			type: result.online ? 'device:update' : 'device:offline',
			deviceId: result.deviceId,
			brand: result.brand,
			state: Object.keys(result.state).length > 0 ? result.state : undefined,
			online: result.online,
			timestamp: now,
			source: 'poller',
		})
	}
}

/** Poll each device individually using its stored metadata (for discovery-only brands) */
async function pollDevicesIndividually(db: DB, brand: string, deviceRows: Device[]) {
	const withMetadata = deviceRows.filter((d) => d.metadata)
	if (withMetadata.length === 0) {
		log.debug('poller no devices with metadata', { brand })
		return
	}

	log.debug('poller per-device poll', { brand, deviceCount: withMetadata.length })

	const now = Date.now()
	const results: IndividualPollResult[] = []

	// bounded concurrency
	for (let i = 0; i < withMetadata.length; i += CONCURRENCY) {
		const batch = withMetadata.slice(i, i + CONCURRENCY)
		const batchResults = await Promise.allSettled(
			batch.map(async (device): Promise<IndividualPollResult> => {
				const meta = parseJson<{ ip: string; port?: number }>(device.metadata ?? '{}').unwrapOr(
					null,
				)
				if (!meta?.ip) {
					return { deviceId: device.id, state: {}, online: false, brand }
				}

				if (!isPrivateIp(meta.ip)) {
					log.warn('poller skipped device: non-private IP', { brand, ip: meta.ip })
					return { deviceId: device.id, state: {}, online: false, brand }
				}

				const adapterResult = createAdapter(brand, { ip: meta.ip })
				if (adapterResult.isErr()) {
					return { deviceId: device.id, state: {}, online: false, brand }
				}

				const stateResult = await adapterResult.value.getState(device.externalId)
				if (stateResult.isErr()) {
					if (device.createdAt && now - device.createdAt < GRACE_PERIOD_MS) {
						return {
							deviceId: device.id,
							state: {},
							online: device.online,
							brand,
							skippedGrace: true,
						}
					}
					return { deviceId: device.id, state: {}, online: false, brand }
				}

				return { deviceId: device.id, state: stateResult.value, online: true, brand }
			}),
		)

		for (const result of batchResults) {
			if (result.status === 'fulfilled') {
				results.push(result.value)
			}
		}
	}

	const existingMap = new Map(withMetadata.map((d) => [d.id, { state: d.state, online: d.online }]))
	flushIndividualResults(db, existingMap, results, now)
}

/** Start polling for ALL enabled integrations (called on server startup) */
export async function startAllPolling(db: DB) {
	const allIntegrations = db.select().from(integrations).all()
	const enabled = allIntegrations.filter((i) => i.enabled)
	log.info('startAllPolling', {
		total: allIntegrations.length,
		enabled: enabled.length,
		brands: enabled.map((i) => i.brand),
	})
	for (const integration of enabled) {
		startPolling(db, integration)
	}
}
