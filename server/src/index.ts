import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

import { db } from './db'
import { startAllPolling } from './discovery/cloud-poller'
import { log } from './lib/logger'
import { devicesController } from './routes/devices.controller'
import { eventsController } from './routes/events.controller'
import { integrationsController } from './routes/integrations.controller'
import { scanController } from './routes/scan.controller'

const app = new Elysia()
	.use(cors({ origin: true }))
	// ── Request / response logging ──────────────────────────────────────────
	.onRequest((ctx) => {
		log.info('request', {
			method: ctx.request.method,
			url: new URL(ctx.request.url).pathname,
		})
	})
	.onAfterHandle((ctx) => {
		log.info('response', {
			method: ctx.request.method,
			url: new URL(ctx.request.url).pathname,
			status: ctx.set.status ?? 200,
		})
	})
	.onError((ctx) => {
		log.error('unhandled error', {
			method: ctx.request.method,
			url: new URL(ctx.request.url).pathname,
			status: ctx.set.status ?? 500,
			error: ctx.error instanceof Error ? ctx.error.message : String(ctx.error),
		})
	})
	// ── Controllers ─────────────────────────────────────────────────────────
	.use(integrationsController)
	.use(devicesController)
	.use(eventsController)
	.use(scanController)
	.get('/api/health', () => ({ ok: true, timestamp: Date.now() }))
	.listen(3001)

// Start polling for all configured integrations
startAllPolling(db).catch((err: unknown) => {
	log.error('startAllPolling failed', { error: err instanceof Error ? err.message : String(err) })
})

log.info('server started', { port: app.server?.port, url: `http://localhost:${app.server?.port}` })

export type App = typeof app
