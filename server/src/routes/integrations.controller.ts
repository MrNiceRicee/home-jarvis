import Elysia, { t } from 'elysia'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from '../db'
import { integrations } from '../db/schema'
import { INTEGRATION_META, createAdapter } from '../integrations/registry'
import { startPolling, stopPolling } from '../discovery/cloud-poller'
import { discoverHueBridges, createHueApiKey } from '../integrations/hue/adapter'

export const integrationsController = new Elysia({ prefix: '/api/integrations' })
  .decorate('db', db)

  /** List all configured integrations + available brand metadata */
  .get('/', ({ db }) => {
    const configured = db.select().from(integrations).all()
    return {
      configured,
      available: Object.values(INTEGRATION_META),
    }
  })

  /** Add a new integration (validates credentials first) */
  .post('/', async ({ db, body }) => {
    const { brand, config } = body

    const meta = INTEGRATION_META[brand]
    if (!meta) return new Response(JSON.stringify({ error: `Unknown brand: ${brand}` }), { status: 400 })

    // Skip validation for OAuth brands (LG) — token comes from callback
    if (!meta.oauthFlow) {
      try {
        const adapter = createAdapter(brand, config)
        await adapter.validateCredentials(config)
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 422 })
      }
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

      return db.select().from(integrations).where(eq(integrations.brand, brand)).get()
    }

    const id = randomUUID()
    db.insert(integrations)
      .values({ id, brand, config: JSON.stringify(config), enabled: true, createdAt: now, updatedAt: now })
      .run()

    // Start polling
    startPolling(db, id, brand, config)

    return db.select().from(integrations).where(eq(integrations.id, id)).get()
  }, {
    body: t.Object({
      brand: t.String(),
      config: t.Record(t.String(), t.String()),
    }),
  })

  /** Remove an integration and all its devices */
  .delete('/:id', ({ db, params }) => {
    const integration = db.select().from(integrations).where(eq(integrations.id, params.id)).get()
    if (!integration) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

    stopPolling(params.id)
    // TODO Phase 5: also remove HomeKit accessories for devices from this integration

    db.delete(integrations).where(eq(integrations.id, params.id)).run()
    return { ok: true }
  })

  /** Hue-specific: discover bridges on local network */
  .get('/hue/discover-bridges', async () => {
    const bridges = await discoverHueBridges()
    return bridges
  })

  /** Hue-specific: create an API key by pressing the button */
  .post('/hue/link', async ({ body }) => {
    const { bridgeIp } = body
    try {
      const apiKey = await createHueApiKey(bridgeIp)
      return { apiKey }
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 422 })
    }
  }, {
    body: t.Object({ bridgeIp: t.String() }),
  })
