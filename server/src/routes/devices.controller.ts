import { randomUUID } from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import Elysia, { status, t } from 'elysia'

import type { DeviceState } from '../integrations/types'

import { db } from '../db'
import { devices, integrations, sections } from '../db/schema'
import { adapterSession, runDiscovery } from '../discovery/cloud-poller'
import { INTEGRATION_META, createAdapter } from '../integrations/registry'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { nextPosition } from '../lib/next-position'
import { parseJson } from '../lib/parse-json'
import { sanitizeDevice } from '../lib/sanitize'
import { isPrivateIp } from '../lib/validate-ip'
import { matterBridge } from '../matter/bridge'

let discoveryInFlight = false
const confirmTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const devicesController = new Elysia({ prefix: '/api/devices' })
	.decorate('db', db)

	/** List all devices with their current state (hidden excluded by default) */
	.get('', ({ db, query }) => {
		let rows = db.select().from(devices).all()
		if (!query.all) rows = rows.filter((d) => !d.hidden)
		return rows.map(({ metadata: _metadata, state, ...d }) => ({
			...d,
			state: parseJson<DeviceState>(state).unwrapOr({}),
		}))
	})

	/** Trigger manual discovery for all enabled integrations (upserts devices + emits SSE) */
	.post('/discover', async ({ db }) => {
		if (discoveryInFlight) {
			log.warn('discover skipped', { reason: 'already in progress' })
			return status(429, { error: 'Discovery already in progress' })
		}
		const allIntegrations = db.select().from(integrations).all()
		const enabled = allIntegrations.filter((i) => i.enabled)

		log.info('discover started', { integrationCount: enabled.length, brands: enabled.map((i) => i.brand) })

		// run discovery in background — upserts devices into DB and emits SSE events
		discoveryInFlight = true
		void Promise.allSettled(
			enabled.map(async (integration) => {
				const config = parseJson<Record<string, string>>(integration.config).unwrapOr({})
				await runDiscovery(db, integration.id, integration.brand, config, integration.session ?? null)
			}),
		)
			.then((results) => {
				for (const r of results) {
					if (r.status === 'rejected') {
						log.error('discover integration error', { error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
					}
				}
			})
			.finally(() => {
				discoveryInFlight = false
				log.info('discover finished')
			})

		return { ok: true, message: `Discovery triggered for ${enabled.length} integration(s)` }
	})

	/** Add a device from scan results — creates adapter at the detected IP, discovers, and upserts */
	.post(
		'/add-from-scan',
		async ({ db, body }) => {
			const { brand, ip } = body

			if (!isPrivateIp(ip)) {
				return status(400, { error: 'Invalid IP address: must be a private network address' })
			}

			// find the existing integration for this brand
			const integration = db.select().from(integrations).where(eq(integrations.brand, brand)).get()
			if (!integration) {
				log.warn('addFromScan no integration', { brand })
				return status(400, { error: `No integration configured for ${brand}` })
			}

			// create adapter pointed at the detected IP
			const adapterResult = createAdapter(brand, { ip })
			if (adapterResult.isErr()) {
				log.error('addFromScan adapter error', { brand, error: adapterResult.error.message })
				return status(500, { error: adapterResult.error.message })
			}

			log.info('addFromScan discovering', { brand, ip })
			const discovered = await adapterResult.value.discover()
			if (discovered.isErr()) {
				log.error('addFromScan discover failed', { brand, ip, error: discovered.error.message })
				return status(500, { error: discovered.error.message })
			}

			const now = Date.now()
			let addedCount = 0

			for (const d of discovered.value) {
				const existing = db.select().from(devices).where(eq(devices.externalId, d.externalId)).get()
				if (existing) continue

				const id = randomUUID()
				const position = nextPosition(db, 'home')
				db.insert(devices)
					.values({
						id,
						integrationId: integration.id,
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
				if (inserted) {
					eventBus.publish({
						type: 'device:new',
						deviceId: id,
						brand,
						state: d.state,
						online: true,
						timestamp: now,
						device: sanitizeDevice(inserted),
					})
				}

				addedCount++
				log.info('addFromScan device added', { brand, deviceId: id, deviceName: d.name, ip })
			}

			return { ok: true, added: addedCount }
		},
		{
			body: t.Object({
				brand: t.String(),
				ip: t.String(),
			}),
		},
	)

	/** Toggle device state (on/off, brightness, etc.) */
	.patch(
		'/:id/state',
		async ({ db, params, body }) => {
			const device = db.select().from(devices).where(eq(devices.id, params.id)).get()
			if (!device) {
				log.warn('setState device not found', { deviceId: params.id })
				return status(404, { error: 'Device not found' })
			}

			if (!device.integrationId) {
				log.warn('setState no integration', { deviceId: params.id, deviceName: device.name })
				return status(422, { error: 'Device has no associated integration' })
			}

			const integration = db
				.select()
				.from(integrations)
				.where(eq(integrations.id, device.integrationId))
				.get()
			if (!integration) {
				log.warn('setState integration not found', { deviceId: params.id, integrationId: device.integrationId })
				return status(404, { error: 'Integration not found' })
			}

			log.info('setState', { deviceId: params.id, deviceName: device.name, brand: device.brand, state: body })

			const config = parseJson<Record<string, string>>(integration.config).unwrapOr({})

			const adapterResult = createAdapter(integration.brand, config, integration.session)
			if (adapterResult.isErr()) {
				log.error('setState adapter error', { brand: integration.brand, error: adapterResult.error.message })
				return status(500, { error: adapterResult.error.message })
			}

			const setResult = await adapterResult.value.setState(device.externalId, body)
			if (setResult.isErr()) {
				log.error('setState failed', { deviceId: params.id, deviceName: device.name, brand: device.brand, error: setResult.error.message })
				return status(500, { error: setResult.error.message })
			}

			const currentState = parseJson<Record<string, unknown>>(device.state).unwrapOr({})
			const newState = { ...currentState, ...body }
			const now = Date.now()

			db.update(devices)
				.set({ state: JSON.stringify(newState), updatedAt: now })
				.where(eq(devices.id, params.id))
				.run()

			eventBus.publish({
				type: 'device:update',
				deviceId: params.id,
				brand: device.brand,
				state: newState,
				timestamp: now,
				source: 'dashboard',
			})

			// persist session if adapter refreshed tokens during setState
			const adapter = adapterResult.value
			const updatedSession = adapterSession(adapter)
			if (updatedSession && updatedSession !== integration.session) {
				db.update(integrations)
					.set({ session: updatedSession, updatedAt: now })
					.where(eq(integrations.id, integration.id))
					.run()
			}

			log.info('setState ok', { deviceId: params.id, deviceName: device.name, brand: device.brand })

			// delayed re-poll: fetch confirmed state from the device after the cloud propagates
			const deviceId = params.id
			const externalId = device.externalId
			const brand = device.brand

			// clear any existing confirm timer for this device
			const existing = confirmTimers.get(deviceId)
			if (existing) clearTimeout(existing)

			const timer = setTimeout(async () => {
				confirmTimers.delete(deviceId)
				try {
					const confirmed = await adapter.getState(externalId)
					if (confirmed.isErr()) return
					const confirmedState = confirmed.value
					const ts = Date.now()
					db.update(devices)
						.set({ state: JSON.stringify(confirmedState), updatedAt: ts })
						.where(eq(devices.id, deviceId))
						.run()
					eventBus.publish({
						type: 'device:update',
						deviceId,
						brand,
						state: confirmedState,
						timestamp: ts,
						source: 'poller',
					})
					log.debug('post-setState confirm', { deviceId, brand })
				} catch { /* ignore re-poll failures — poller will catch up */ }
			}, 5000)
			confirmTimers.set(deviceId, timer)

			return { ...device, state: newState }
		},
		{
			body: t.Object({
				on: t.Optional(t.Boolean()),
				brightness: t.Optional(t.Number()),
				colorTemp: t.Optional(t.Number()),
				color: t.Optional(t.Object({ r: t.Number(), g: t.Number(), b: t.Number() })),
				fanSpeed: t.Optional(t.Number()),
				targetTemperature: t.Optional(t.Number()),
				mode: t.Optional(t.String()),
				volume: t.Optional(t.Number()),
				status: t.Optional(t.String()),
			}),
		},
	)

	/** Toggle Matter bridge exposure for a device */
	.patch(
		'/:id/matter',
		async ({ db, params, body }) => {
			const device = db.select().from(devices).where(eq(devices.id, params.id)).get()
			if (!device) {
				log.warn('setMatter device not found', { deviceId: params.id })
				return status(404, { error: 'Device not found' })
			}

			// brands with native Matter support — don't bridge, avoid duplicates
			const nativeMatterBrands = new Set(
				Object.values(INTEGRATION_META)
					.filter((m) => m.nativeMatter)
					.map((m) => m.brand),
			)
			if (nativeMatterBrands.has(device.brand)) {
				log.warn('setMatter native brand blocked', { deviceId: params.id, brand: device.brand })
				return status(400, { error: `${device.brand} supports Matter natively. Add via your smart home app.` })
			}

			log.info('setMatter', { deviceId: params.id, deviceName: device.name, enabled: body.enabled })

			const now = Date.now()
			db.update(devices)
				.set({ matterEnabled: body.enabled, updatedAt: now })
				.where(eq(devices.id, params.id))
				.run()

			// add/remove from the live matter bridge
			if (body.enabled) {
				const state = parseJson<DeviceState>(device.state).unwrapOr({})
				await matterBridge.addDevice(device, state)
			} else {
				await matterBridge.removeDevice(params.id)
			}

			eventBus.publish({
				type: 'device:update',
				deviceId: params.id,
				brand: device.brand,
				timestamp: now,
				source: 'dashboard',
			})

			const updated = db.select().from(devices).where(eq(devices.id, params.id)).get()
			if (!updated) return { error: 'Device not found' }
			return sanitizeDevice(updated)
		},
		{
			body: t.Object({ enabled: t.Boolean() }),
		},
	)

	/** Toggle device visibility */
	.patch(
		'/:id/hidden',
		({ db, params, body }) => {
			const device = db.select().from(devices).where(eq(devices.id, params.id)).get()
			if (!device) return status(404, { error: 'Device not found' })

			db.update(devices)
				.set({ hidden: body.hidden, updatedAt: Date.now() })
				.where(eq(devices.id, params.id))
				.run()

			log.info('setHidden', { deviceId: params.id, deviceName: device.name, hidden: body.hidden })
			return { ok: true }
		},
		{
			body: t.Object({ hidden: t.Boolean() }),
		},
	)

	/** Update a single device's section + position (DnD persistence) */
	.patch(
		'/:id/position',
		({ db, params, body }) => {
			const device = db.select().from(devices).where(eq(devices.id, params.id)).get()
			if (!device) return status(404, { error: 'Device not found' })

			const section = db.select().from(sections).where(eq(sections.id, body.sectionId)).get()
			if (!section) return status(400, { error: 'Section not found' })

			if (body.position < 0 || !Number.isInteger(body.position)) {
				return status(400, { error: 'Position must be a non-negative integer' })
			}

			db.update(devices)
				.set({ sectionId: body.sectionId, position: body.position, updatedAt: Date.now() })
				.where(eq(devices.id, params.id))
				.run()

			return { ok: true }
		},
		{
			body: t.Object({
				sectionId: t.String(),
				position: t.Number(),
			}),
		},
	)

	/** Batch update positions for multiple devices (section reorder) */
	.patch(
		'/positions',
		({ db, body }) => {
			if (body.length > 200) {
				return status(400, { error: 'Batch size exceeds limit of 200' })
			}

			// validate no duplicate device IDs
			const ids = body.map((i) => i.id)
			if (new Set(ids).size !== ids.length) {
				return status(400, { error: 'Duplicate device IDs in batch' })
			}

			// validate all positions are non-negative integers
			for (const item of body) {
				if (item.position < 0 || !Number.isInteger(item.position)) {
					return status(400, { error: `Invalid position for device ${item.id}` })
				}
			}

			// validate all sectionIds and deviceIds exist
			const sectionIds = [...new Set(body.map((i) => i.sectionId))]
			const existingSections = db.select().from(sections).where(inArray(sections.id, sectionIds)).all()
			if (existingSections.length !== sectionIds.length) {
				return status(400, { error: 'One or more section IDs are invalid' })
			}

			const existingDevices = db.select().from(devices).where(inArray(devices.id, ids)).all()
			if (existingDevices.length !== ids.length) {
				return status(400, { error: 'One or more device IDs are invalid' })
			}

			const now = Date.now()
			db.transaction((tx) => {
				for (const item of body) {
					tx.update(devices)
						.set({ sectionId: item.sectionId, position: item.position, updatedAt: now })
						.where(eq(devices.id, item.id))
						.run()
				}
			})

			log.info('batch positions updated', { count: body.length })
			return { ok: true }
		},
		{
			body: t.Array(
				t.Object({
					id: t.String(),
					sectionId: t.String(),
					position: t.Number(),
				}),
			),
		},
	)
