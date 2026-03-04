import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'

import type { DB } from '../db'
import type { Device } from '../db/schema'

import { devices, integrations } from '../db/schema'
import { INTEGRATION_META, createAdapter } from '../integrations/registry'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { parseJson } from '../lib/parse-json'

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
	ge: { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 },
	aqara: { stateIntervalMs: 30_000, discoverIntervalMs: 5 * 60_000 },
	smartthings: { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 },
	resideo: { stateIntervalMs: 5 * 60_000, discoverIntervalMs: 15 * 60_000 },
	elgato: { stateIntervalMs: 15_000, discoverIntervalMs: 5 * 60_000 },
}

const CONCURRENCY = 5
const GRACE_PERIOD_MS = 60_000

const timers = new Map<string, ReturnType<typeof setInterval>>()

/** Start polling for a single integration */
export function startPolling(
	db: DB,
	integrationId: string,
	brand: string,
	config: Record<string, string>,
) {
	stopPolling(integrationId)

	const pollCfg = DEFAULTS[brand] ?? { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 }
	log.info('poller start', { brand, integrationId, discoverIntervalMs: pollCfg.discoverIntervalMs })

	runDiscovery(db, integrationId, brand, config).catch((err: unknown) => {
		log.error('poller runDiscovery unexpected error', { brand, error: err instanceof Error ? err.message : String(err) })
	})

	const discoverTimer = setInterval(
		() =>
			runDiscovery(db, integrationId, brand, config).catch((err: unknown) => {
				log.error('poller runDiscovery unexpected error', { brand, error: err instanceof Error ? err.message : String(err) })
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
				runStatePoll(db, integrationId, brand, config).catch((err: unknown) => {
					log.error('poller runStatePoll unexpected error', { brand, error: err instanceof Error ? err.message : String(err) })
				}),
			pollCfg.stateIntervalMs,
		)
		timers.set(`${integrationId}:state`, stateTimer)
		log.info('poller state poll', { brand, integrationId, stateIntervalMs: pollCfg.stateIntervalMs })
	}
}

/** Stop all timers for an integration */
export function stopPolling(integrationId: string) {
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
	d: { externalId: string; name: string; type: string; state: Record<string, unknown>; metadata?: Record<string, unknown>; online: boolean },
	now: number,
) {
	const existing = db.select().from(devices).where(eq(devices.externalId, d.externalId)).get()

	if (existing) {
		db.update(devices)
			.set({
				name: d.name,
				state: JSON.stringify(d.state),
				metadata: d.metadata ? JSON.stringify(d.metadata) : existing.metadata,
				online: d.online,
				lastSeen: now,
				updatedAt: now,
			})
			.where(eq(devices.id, existing.id))
			.run()

		log.debug('poller device updated', { brand, deviceId: existing.id, deviceName: d.name, online: d.online })
		eventBus.publish({ type: 'device:update', deviceId: existing.id, brand, state: d.state, online: d.online, timestamp: now, source: 'poller' })
		return
	}

	const id = randomUUID()
	db.insert(devices)
		.values({
			id, integrationId, brand, externalId: d.externalId,
			name: d.name, type: d.type, state: JSON.stringify(d.state),
			metadata: d.metadata ? JSON.stringify(d.metadata) : null,
			online: d.online, lastSeen: now, createdAt: now, updatedAt: now,
		})
		.run()

	log.info('poller device discovered', { brand, deviceId: id, deviceName: d.name, type: d.type })
	eventBus.publish({ type: 'device:update', deviceId: id, brand, state: d.state, online: true, timestamp: now, source: 'poller' })
}

/** Mark devices not seen this cycle as offline */
function markAbsentDevicesOffline(db: DB, integrationId: string, brand: string, seenExternalIds: Set<string>, now: number) {
	const allDevices = db.select().from(devices).where(eq(devices.integrationId, integrationId)).all()

	for (const device of allDevices) {
		if (!seenExternalIds.has(device.externalId) && device.online) {
			db.update(devices).set({ online: false, updatedAt: now }).where(eq(devices.id, device.id)).run()
			log.warn('poller device offline', { brand, deviceId: device.id, deviceName: device.name })
			eventBus.publish({ type: 'device:offline', deviceId: device.id, brand, online: false, timestamp: now, source: 'poller' })
		}
	}
}

/** Lightweight state poll — update existing devices only, no upsert/offline logic */
async function runStatePoll(
	db: DB,
	integrationId: string,
	brand: string,
	config: Record<string, string>,
) {
	const adapterResult = createAdapter(brand, config)
	if (adapterResult.isErr()) return

	const discoveredResult = await adapterResult.value.discover()
	if (discoveredResult.isErr()) {
		log.debug('poller state poll failed', { brand, error: discoveredResult.error.message })
		return
	}

	const now = Date.now()
	const knownDevices = db.select().from(devices).where(eq(devices.integrationId, integrationId)).all()
	const knownByExternalId = new Map(knownDevices.map((d) => [d.externalId, d]))

	for (const d of discoveredResult.value) {
		const existing = knownByExternalId.get(d.externalId)
		if (!existing) continue // new devices handled by runDiscovery

		db.update(devices)
			.set({ state: JSON.stringify(d.state), online: d.online, lastSeen: now, updatedAt: now })
			.where(eq(devices.id, existing.id))
			.run()

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
}

/** Run device discovery + upsert results into DB */
async function runDiscovery(
	db: DB,
	integrationId: string,
	brand: string,
	config: Record<string, string>,
) {
	const meta = INTEGRATION_META[brand]

	// discovery-only brands: poll each device individually from stored metadata
	if (meta?.discoveryOnly) {
		const deviceRows = db.select().from(devices)
			.where(eq(devices.integrationId, integrationId)).all()
		await pollDevicesIndividually(db, brand, deviceRows)
		return
	}

	// standard integration-level discovery
	const adapterResult = createAdapter(brand, config)
	if (adapterResult.isErr()) {
		log.debug('poller adapter unavailable', { brand })
		return
	}

	log.debug('poller discovery run', { brand })
	const discoveredResult = await adapterResult.value.discover()
	if (discoveredResult.isErr()) {
		log.error('poller discovery failed', { brand, error: discoveredResult.error.message })
		return
	}

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
}

/** Poll each device individually using its stored metadata (for discovery-only brands) */
async function pollDevicesIndividually(db: DB, brand: string, deviceRows: Device[]) {
	const withMetadata = deviceRows.filter((d) => d.metadata)
	if (withMetadata.length === 0) {
		log.debug('poller no devices with metadata', { brand })
		return
	}

	log.debug('poller per-device poll', { brand, deviceCount: withMetadata.length })

	type PollResult = {
		deviceId: string
		state: Record<string, unknown>
		online: boolean
		brand: string
		skippedGrace?: boolean
	}

	const now = Date.now()
	const results: PollResult[] = []

	// bounded concurrency
	for (let i = 0; i < withMetadata.length; i += CONCURRENCY) {
		const batch = withMetadata.slice(i, i + CONCURRENCY)
		const batchResults = await Promise.allSettled(
			batch.map(async (device): Promise<PollResult> => {
				const meta = parseJson<{ ip: string; port?: number }>(device.metadata!).unwrapOr(null)
				if (!meta?.ip) {
					return { deviceId: device.id, state: {}, online: false, brand }
				}

				const adapterResult = createAdapter(brand, { ip: meta.ip })
				if (adapterResult.isErr()) {
					return { deviceId: device.id, state: {}, online: false, brand }
				}

				const stateResult = await adapterResult.value.getState(device.externalId)
				if (stateResult.isErr()) {
					// grace period: don't mark newly-added devices offline
					if (device.createdAt && now - device.createdAt < GRACE_PERIOD_MS) {
						return { deviceId: device.id, state: {}, online: device.online, brand, skippedGrace: true }
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

	// batch DB writes in a single transaction
	db.transaction((tx) => {
		for (const { deviceId, state, online } of results) {
			const updates: Record<string, unknown> = { online, lastSeen: now, updatedAt: now }
			if (Object.keys(state).length > 0) {
				updates.state = JSON.stringify(state)
			}
			tx.update(devices)
				.set(updates)
				.where(eq(devices.id, deviceId))
				.run()
		}
	})

	// emit SSE events outside the transaction
	for (const result of results) {
		if (result.skippedGrace) continue
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

/** Start polling for ALL enabled integrations (called on server startup) */
export async function startAllPolling(db: DB) {
	const allIntegrations = db.select().from(integrations).all()
	const enabled = allIntegrations.filter((i) => i.enabled)
	log.info('startAllPolling', { total: allIntegrations.length, enabled: enabled.length, brands: enabled.map((i) => i.brand) })
	for (const integration of enabled) {
		const config = parseJson<Record<string, string>>(integration.config).unwrapOr({})
		startPolling(db, integration.id, integration.brand, config)
	}
}
