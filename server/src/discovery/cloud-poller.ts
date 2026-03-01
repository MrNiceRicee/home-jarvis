import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'

import type { DB } from '../db'

import { devices, integrations } from '../db/schema'
import { createAdapter } from '../integrations/registry'
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
	govee: { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 },
	vesync: { stateIntervalMs: 30_000, discoverIntervalMs: 5 * 60_000 },
	lg: { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 },
	ge: { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 },
	aqara: { stateIntervalMs: 30_000, discoverIntervalMs: 5 * 60_000 },
	smartthings: { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 },
	resideo: { stateIntervalMs: 5 * 60_000, discoverIntervalMs: 15 * 60_000 }, // 5min hard limit
}

const timers = new Map<string, ReturnType<typeof setInterval>>()

/** Start polling for a single integration */
export function startPolling(
	db: DB,
	integrationId: string,
	brand: string,
	config: Record<string, string>,
) {
	stopPolling(integrationId) // clear any existing timers

	const pollCfg = DEFAULTS[brand] ?? { stateIntervalMs: 60_000, discoverIntervalMs: 5 * 60_000 }
	log.info('poller start', { brand, integrationId, discoverIntervalMs: pollCfg.discoverIntervalMs })

	// Run discovery immediately on start
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

/** Run device discovery + upsert results into DB */
async function runDiscovery(
	db: DB,
	integrationId: string,
	brand: string,
	config: Record<string, string>,
) {
	const adapterResult = createAdapter(brand, config)
	if (adapterResult.isErr()) {
		log.debug('poller adapter unavailable', { brand }) // Adapter not yet implemented — skip silently
		return
	}

	const adapter = adapterResult.value

	log.debug('poller discovery run', { brand })
	const discoveredResult = await adapter.discover()
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

		// Check if device already exists
		const existing = db.select().from(devices).where(eq(devices.externalId, d.externalId)).get()

		if (existing) {
			// Update state + lastSeen
			db.update(devices)
				.set({
					name: d.name,
					state: JSON.stringify(d.state),
					online: d.online,
					lastSeen: now,
					updatedAt: now,
				})
				.where(eq(devices.id, existing.id))
				.run()

			log.debug('poller device updated', { brand, deviceId: existing.id, deviceName: d.name, online: d.online })

			eventBus.publish({
				type: 'device:update',
				deviceId: existing.id,
				brand,
				state: d.state,
				online: d.online,
				timestamp: now,
			})
		} else {
			// Insert new device
			const id = randomUUID()
			db.insert(devices)
				.values({
					id,
					integrationId,
					brand,
					externalId: d.externalId,
					name: d.name,
					type: d.type,
					state: JSON.stringify(d.state),
					online: d.online,
					lastSeen: now,
					createdAt: now,
					updatedAt: now,
				})
				.run()

			log.info('poller device discovered', { brand, deviceId: id, deviceName: d.name, type: d.type })

			eventBus.publish({
				type: 'device:update',
				deviceId: id,
				brand,
				state: d.state,
				online: true,
				timestamp: now,
			})
		}
	}

	// Mark devices not seen this cycle as offline
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
			})
		}
	}

	eventBus.publish({ type: 'discovery:complete', brand, timestamp: now })
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
