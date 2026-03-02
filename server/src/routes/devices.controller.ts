import { eq } from 'drizzle-orm'
import Elysia, { t } from 'elysia'

import { db } from '../db'
import { devices, integrations } from '../db/schema'
import { createAdapter } from '../integrations/registry'
import { eventBus } from '../lib/events'

export const devicesController = new Elysia({ prefix: '/api/devices' })
	.decorate('db', db)

	/** List all devices with their current state */
	.get('', ({ db }) => {
		const rows = db.select().from(devices).all()
		return rows.map((d) => ({
			...d,
			state: JSON.parse(d.state),
		}))
	})

	/** Trigger manual discovery for all enabled integrations */
	.post('/discover', async ({ db }) => {
		const allIntegrations = db.select().from(integrations).all()
		const enabled = allIntegrations.filter((i) => i.enabled)

		// Kick off discovery in background — don't await
		Promise.all(
			enabled.map(async (integration) => {
				const config = JSON.parse(integration.config) as Record<string, string>
				const adapterResult = createAdapter(integration.brand, config)
				if (adapterResult.isErr()) return // not yet implemented
				const result = await adapterResult.value.discover()
				if (result.isErr()) console.error(`[discover] ${integration.brand} failed:`, result.error)
			}),
		).catch(console.error)

		return { ok: true, message: `Discovery triggered for ${enabled.length} integration(s)` }
	})

	/** Toggle device state (on/off, brightness, etc.) */
	.patch(
		'/:id/state',
		async ({ db, params, body }) => {
			const device = db.select().from(devices).where(eq(devices.id, params.id)).get()
			if (!device)
				return new Response(JSON.stringify({ error: 'Device not found' }), { status: 404 })

			const integration = db
				.select()
				.from(integrations)
				.where(eq(integrations.id, device.integrationId!))
				.get()
			if (!integration)
				return new Response(JSON.stringify({ error: 'Integration not found' }), { status: 404 })

			const config = JSON.parse(integration.config) as Record<string, string>

			const adapterResult = createAdapter(integration.brand, config)
			if (adapterResult.isErr()) {
				return new Response(JSON.stringify({ error: adapterResult.error.message }), { status: 500 })
			}

			const setResult = await adapterResult.value.setState(device.externalId, body)
			if (setResult.isErr()) {
				return new Response(JSON.stringify({ error: setResult.error.message }), { status: 500 })
			}

			const currentState = JSON.parse(device.state) as Record<string, unknown>
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

			return { ...device, state: newState }
		},
		{
			body: t.Object({
				on: t.Optional(t.Boolean()),
				brightness: t.Optional(t.Number()),
				colorTemp: t.Optional(t.Number()),
				fanSpeed: t.Optional(t.Number()),
			}),
		},
	)

	/** Toggle HomeKit exposure (stub — Phase 5 wires this to HAP bridge) */
	.patch(
		'/:id/homekit',
		async ({ db, params, body }) => {
			const device = db.select().from(devices).where(eq(devices.id, params.id)).get()
			if (!device)
				return new Response(JSON.stringify({ error: 'Device not found' }), { status: 404 })

			if (device.brand === 'aqara') {
				return new Response(
					JSON.stringify({ error: 'Aqara supports HomeKit natively. Add via the Apple Home app.' }),
					{ status: 400 },
				)
			}

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
