import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { db } from './db'
import { integrations, devices, homekitConfig } from './db/schema'
import path from 'path'

const app = new Elysia()
  .use(cors({ origin: true }))
  .decorate('db', db)

  // ── Integrations ──────────────────────────────────────────────────────────
  .get('/api/integrations', ({ db }) => {
    return db.select().from(integrations).all()
  })
  .post('/api/integrations', ({ db, body }) => {
    // TODO Phase 3: validate credentials via adapter before saving
    return { message: 'Not yet implemented' }
  })
  .delete('/api/integrations/:id', ({ db, params }) => {
    // TODO Phase 3: remove integration and its devices
    return { message: 'Not yet implemented' }
  })

  // ── Devices ───────────────────────────────────────────────────────────────
  .get('/api/devices', ({ db }) => {
    return db.select().from(devices).all()
  })
  .post('/api/devices/discover', ({ db }) => {
    // TODO Phase 2: trigger discovery across all enabled adapters
    return { message: 'Not yet implemented' }
  })
  .patch('/api/devices/:id/homekit', ({ db, params, body }) => {
    // TODO Phase 5: toggle homekitEnabled and add/remove from HAP bridge
    return { message: 'Not yet implemented' }
  })
  .patch('/api/devices/:id/state', ({ db, params, body }) => {
    // TODO Phase 2: call adapter.setState() and persist to DB
    return { message: 'Not yet implemented' }
  })

  // ── HomeKit ───────────────────────────────────────────────────────────────
  .get('/api/homekit', ({ db }) => {
    const config = db.select().from(homekitConfig).get()
    return config ?? null
  })
  .post('/api/homekit/setup', ({ db }) => {
    // TODO Phase 5: init HAP bridge, generate PIN, store config
    return { message: 'Not yet implemented' }
  })

  // ── Events (SSE) ──────────────────────────────────────────────────────────
  .get('/api/events', function* ({ db }) {
    // TODO Phase 2: yield device state updates as SSE events
    yield { type: 'connected', timestamp: Date.now() }
  })

  // ── Health ────────────────────────────────────────────────────────────────
  .get('/api/health', () => ({ ok: true, timestamp: Date.now() }))

  .listen(3001)

console.log(`🏠 Home Jarvis server running at http://localhost:${app.server?.port}`)

export type App = typeof app
