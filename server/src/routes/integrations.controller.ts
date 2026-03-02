import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import Elysia, { t } from 'elysia'

import { db } from '../db'
import { integrations } from '../db/schema'
import { startPolling, stopPolling } from '../discovery/cloud-poller'
import { discoverHueBridges, createHueApiKey } from '../integrations/hue/adapter'
import { INTEGRATION_META, createAdapter } from '../integrations/registry'
import { log } from '../lib/logger'

export const integrationsController = new Elysia({ prefix: '/api/integrations' })
	.decorate('db', db)

	/** List all configured integrations + available brand metadata */
	.get('', ({ db }) => {
		const configured = db.select().from(integrations).all()
		return {
			// Omit config blob (contains API keys/passwords) — client only needs id, brand, enabled
			configured: configured.map(({ config: _config, ...rest }) => rest),
			available: Object.values(INTEGRATION_META),
		}
	})

	/** Add a new integration (validates credentials first) */
	.post(
		'',
		async ({ db, body }) => {
			const { brand, config } = body

			const meta = INTEGRATION_META[brand]
			if (!meta) {
				log.warn('addIntegration unknown brand', { brand })
				return new Response(JSON.stringify({ error: `Unknown brand: ${brand}` }), { status: 400 })
			}

			// Skip validation for OAuth brands (LG) — token comes from callback
			if (!meta.oauthFlow) {
				log.info('addIntegration validating credentials', { brand })
				const adapterResult = createAdapter(brand, config)
				if (adapterResult.isErr()) {
					log.error('addIntegration adapter error', { brand, error: adapterResult.error.message })
					return new Response(JSON.stringify({ error: adapterResult.error.message }), { status: 400 })
				}
				const credResult = await adapterResult.value.validateCredentials(config)
				if (credResult.isErr()) {
					log.warn('addIntegration credential validation failed', { brand, error: credResult.error.message })
					return new Response(JSON.stringify({ error: credResult.error.message }), { status: 422 })
				}
				log.info('addIntegration credentials valid', { brand })
			}

			// Upsert — if brand already exists, update config
			const existing = db.select().from(integrations).where(eq(integrations.brand, brand)).get()
			const now = Date.now()

			if (existing) {
				db.update(integrations)
					.set({ config: JSON.stringify(config), enabled: true, updatedAt: now })
					.where(eq(integrations.brand, brand))
					.run()

				// Restart polling with new config
				stopPolling(existing.id)
				startPolling(db, existing.id, brand, config)

				log.info('addIntegration updated', { brand, integrationId: existing.id })
				return db.select().from(integrations).where(eq(integrations.brand, brand)).get()
			}

			const id = randomUUID()
			db.insert(integrations)
				.values({
					id,
					brand,
					config: JSON.stringify(config),
					enabled: true,
					createdAt: now,
					updatedAt: now,
				})
				.run()

			// Start polling
			startPolling(db, id, brand, config)

			log.info('addIntegration created', { brand, integrationId: id })
			return db.select().from(integrations).where(eq(integrations.id, id)).get()
		},
		{
			body: t.Object({
				brand: t.String(),
				config: t.Record(t.String(), t.String()),
			}),
		},
	)

	/** Remove an integration and all its devices */
	.delete('/:id', ({ db, params }) => {
		const integration = db.select().from(integrations).where(eq(integrations.id, params.id)).get()
		if (!integration) {
			log.warn('removeIntegration not found', { integrationId: params.id })
			return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
		}

		log.info('removeIntegration', { brand: integration.brand, integrationId: params.id })
		stopPolling(params.id)
		// TODO Phase 5: also remove HomeKit accessories for devices from this integration

		db.delete(integrations).where(eq(integrations.id, params.id)).run()
		log.info('removeIntegration ok', { brand: integration.brand })
		return { ok: true }
	})

	/** Hue-specific: discover bridges on local network */
	.get('/hue/discover-bridges', async () => {
		log.info('hue discoverBridges')
		const result = await discoverHueBridges()
		return result.match(
			(bridges) => {
				log.info('hue discoverBridges ok', { count: bridges.length, ips: bridges.map((b) => b.internalipaddress) })
				return bridges
			},
			(err) => {
				log.warn('hue discoverBridges failed', { error: err.message })
				return []
			},
		)
	})

	/** Hue-specific: create an API key by pressing the button */
	.post(
		'/hue/link',
		async ({ body }) => {
			const { bridgeIp } = body
			log.info('hue link', { bridgeIp })
			const result = await createHueApiKey(bridgeIp)
			return result.match(
				(apiKey) => {
					log.info('hue link ok', { bridgeIp })
					return { apiKey }
				},
				(e) => {
					log.warn('hue link failed', { bridgeIp, error: e.message })
					return new Response(JSON.stringify({ error: e.message }), { status: 422 })
				},
			)
		},
		{
			body: t.Object({ bridgeIp: t.String() }),
		},
	)
