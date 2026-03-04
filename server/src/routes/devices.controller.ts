import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import Elysia, { status, t } from 'elysia'

import type { DeviceState } from '../integrations/types'

import { db } from '../db'
import { devices, integrations } from '../db/schema'
import { createAdapter } from '../integrations/registry'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { parseJson } from '../lib/parse-json'
import { matterBridge } from '../matter/bridge'

let discoveryInFlight = false

export const devicesController = new Elysia({ prefix: '/api/devices' })
	.decorate('db', db)

	/** List all devices with their current state */
	.get('', ({ db }) => {
		const rows = db.select().from(devices).all()
		return rows.map(({ metadata: _metadata, ...d }) => ({
			...d,
			state: parseJson<DeviceState>(d.state).unwrapOr({}),
		}))
	})

	/** Trigger manual discovery for all enabled integrations */
	.post('/discover', async ({ db }) => {
		if (discoveryInFlight) {
			log.warn('discover skipped', { reason: 'already in progress' })
			return status(429, { error: 'Discovery already in progress' })
		}
		const allIntegrations = db.select().from(integrations).all()
		const enabled = allIntegrations.filter((i) => i.enabled)

		log.info('discover started', { integrationCount: enabled.length, brands: enabled.map((i) => i.brand) })

		// Kick off discovery in background — don't await
		discoveryInFlight = true
		Promise.all(
			enabled.map(async (integration) => {
				const config = parseJson<Record<string, string>>(integration.config).unwrapOr({})
				const adapterResult = createAdapter(integration.brand, config)
				if (adapterResult.isErr()) {
					log.warn('discover adapter unavailable', { brand: integration.brand })
					return
				}
				const result = await adapterResult.value.discover()
				if (result.isErr()) {
					log.error('discover failed', { brand: integration.brand, error: result.error.message })
				} else {
					log.info('discover succeeded', { brand: integration.brand, deviceCount: result.value.length })
				}
			}),
		)
			.catch((err: unknown) => {
				log.error('discover unexpected error', { error: err instanceof Error ? err.message : String(err) })
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
			const addedDevices: { id: string; integrationId: string; brand: string; externalId: string; name: string; type: string; state: Record<string, unknown>; online: boolean }[] = []

			for (const d of discovered.value) {
				const existing = db.select().from(devices).where(eq(devices.externalId, d.externalId)).get()
				if (existing) continue // already in the system

				const id = randomUUID()
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
						lastSeen: now,
						createdAt: now,
						updatedAt: now,
					})
					.run()

				eventBus.publish({
					type: 'device:update',
					deviceId: id,
					brand,
					state: d.state,
					online: true,
					timestamp: now,
				})

				addedDevices.push({
					id, integrationId: integration.id, brand, externalId: d.externalId,
					name: d.name, type: d.type, state: d.state, online: d.online,
				})
				log.info('addFromScan device added', { brand, deviceId: id, deviceName: d.name, ip })
			}

			return { ok: true, added: addedDevices.length, devices: addedDevices }
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

			const adapterResult = createAdapter(integration.brand, config)
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
			})

			log.info('setState ok', { deviceId: params.id, deviceName: device.name, brand: device.brand })
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
			const nativeMatterBrands = new Set(['hue', 'aqara'])
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
			})

			return db.select().from(devices).where(eq(devices.id, params.id)).get()
		},
		{
			body: t.Object({ enabled: t.Boolean() }),
		},
	)
