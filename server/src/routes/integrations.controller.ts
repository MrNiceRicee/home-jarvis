import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import Elysia, { status, t } from 'elysia'

import type { Integration } from '../db/schema'

import { db } from '../db'
import { integrations } from '../db/schema'
import { startPolling, stopPolling } from '../discovery/cloud-poller'
import { discoverHueBridges, createHueApiKey } from '../integrations/hue/adapter'
import { INTEGRATION_META, createAdapter } from '../integrations/registry'
import { log } from '../lib/logger'
import { isPrivateIp } from '../lib/validate-ip'

/** strip sensitive fields (config contains credentials, session contains auth tokens) */
function stripSensitive({ config: _config, session: _session, ...safe }: Integration): Omit<Integration, 'config' | 'session'> {
	return safe
}

export const integrationsController = new Elysia({ prefix: '/api/integrations' })
	.decorate('db', db)

	/** List all configured integrations + available brand metadata */
	.get('', ({ db }) => {
		const configured = db.select().from(integrations).all()
		return {
			configured: configured.map(stripSensitive),
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
				return status(400, { error: `Unknown brand: ${brand}` })
			}

			// Skip validation for OAuth brands (LG) and discovery-only brands (Elgato)
			if (!meta.oauthFlow && !meta.discoveryOnly) {
				log.info('addIntegration validating credentials', { brand })
				const adapterResult = createAdapter(brand, config)
				if (adapterResult.isErr()) {
					log.error('addIntegration adapter error', { brand, error: adapterResult.error.message })
					return status(400, { error: adapterResult.error.message })
				}
				const credResult = await adapterResult.value.validateCredentials(config)
				if (credResult.isErr()) {
					log.warn('addIntegration credential validation failed', { brand, error: credResult.error.message })
					return status(422, { error: credResult.error.message })
				}
				log.info('addIntegration credentials valid', { brand })
			}

			// Upsert — if brand already exists, update config
			const existing = db.select().from(integrations).where(eq(integrations.brand, brand)).get()
			const now = Date.now()

			if (existing) {
				// clear session + authError on config change — forces re-auth on next poll
				db.update(integrations)
					.set({ config: JSON.stringify(config), session: null, authError: null, enabled: true, updatedAt: now })
					.where(eq(integrations.brand, brand))
					.run()

				const updated = db.select().from(integrations).where(eq(integrations.brand, brand)).get()!

				// restart polling with new config (session cleared)
				stopPolling(existing.id)
				startPolling(db, updated)

				log.info('addIntegration updated', { brand, integrationId: existing.id })
				return stripSensitive(updated)
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

			const inserted = db.select().from(integrations).where(eq(integrations.id, id)).get()!

			// Start polling
			startPolling(db, inserted)

			log.info('addIntegration created', { brand, integrationId: id })
			return stripSensitive(inserted)
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
			return status(404, { error: 'Not found' })
		}

		log.info('removeIntegration', { brand: integration.brand, integrationId: params.id })
		stopPolling(params.id)

		// cascade delete handles device rows; integration removal is sufficient
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
			if (!isPrivateIp(bridgeIp)) {
				return status(400, { error: 'Invalid IP address: must be a private network address' })
			}
			log.info('hue link', { bridgeIp })
			const result = await createHueApiKey(bridgeIp)
			if (result.isErr()) {
				log.warn('hue link failed', { bridgeIp, error: result.error.message })
				return status(422, { error: result.error.message })
			}
			log.info('hue link ok', { bridgeIp })
			return { apiKey: result.value }
		},
		{
			body: t.Object({ bridgeIp: t.String() }),
		},
	)
