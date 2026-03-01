import { eq } from 'drizzle-orm'
import Elysia, { status, t } from 'elysia'

import type { DeviceState } from '../integrations/types'

import { db } from '../db'
import { devices, integrations } from '../db/schema'
import { createAdapter } from '../integrations/registry'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { parseJson } from '../lib/parse-json'

let discoveryInFlight = false

export const devicesController = new Elysia({ prefix: '/api/devices' })
	.decorate('db', db)

	/** List all devices with their current state */
	.get('', ({ db }) => {
		const rows = db.select().from(devices).all()
		return rows.map((d) => ({
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
				fanSpeed: t.Optional(t.Number()),
				targetTemperature: t.Optional(t.Number()),
				mode: t.Optional(t.String()),
				volume: t.Optional(t.Number()),
				status: t.Optional(t.String()),
			}),
		},
	)

	/** Toggle HomeKit exposure (stub — Phase 5 wires this to HAP bridge) */
	.patch(
		'/:id/homekit',
		async ({ db, params, body }) => {
			const device = db.select().from(devices).where(eq(devices.id, params.id)).get()
			if (!device) {
				log.warn('setHomeKit device not found', { deviceId: params.id })
				return status(404, { error: 'Device not found' })
			}

			if (device.brand === 'aqara') {
				log.warn('setHomeKit aqara native', { deviceId: params.id, deviceName: device.name })
				return status(400, { error: 'Aqara supports HomeKit natively. Add via the Apple Home app.' })
			}

			log.info('setHomeKit', { deviceId: params.id, deviceName: device.name, enabled: body.enabled })

			const now = Date.now()
			db.update(devices)
				.set({ homekitEnabled: body.enabled, updatedAt: now })
				.where(eq(devices.id, params.id))
				.run()

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
