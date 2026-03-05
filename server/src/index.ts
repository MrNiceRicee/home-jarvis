import { cors } from '@elysiajs/cors'
import { eq } from 'drizzle-orm'
import { Elysia } from 'elysia'

import { db } from './db'
import { devices, integrations, sections } from './db/schema'
import { startAllPolling } from './discovery/cloud-poller'
import { clientAssets, hasClientAssets } from './generated/client-manifest'
import { createAdapter } from './integrations/registry'
import { eventBus } from './lib/events'
import { log } from './lib/logger'
import { parseJson } from './lib/parse-json'
import { matterBridge } from './matter/bridge'
import { devicesController } from './routes/devices.controller'
import { eventsController } from './routes/events.controller'
import { integrationsController } from './routes/integrations.controller'
import { matterController } from './routes/matter.controller'
import { scanController } from './routes/scan.controller'
import { sectionsController } from './routes/sections.controller'

const PORT = Number(process.env.PORT ?? 3001)

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
	.use(matterController)
	.use(sectionsController)
	.get('/api/health', () => ({ ok: true, timestamp: Date.now() }))
	// ── Embedded client (production only — dev uses Vite on :5173) ───────────
	.get('/*', ({ request }) => {
		if (!hasClientAssets) return new Response('Not found', { status: 404 })
		const pathname = new URL(request.url).pathname
		// SPA fallback: unknown routes serve index.html for client-side routing
		const asset = clientAssets[pathname] ?? clientAssets['/index.html'] ?? clientAssets['/']
		if (!asset) return new Response('Not found', { status: 404 })
		const body = asset.binary ? Buffer.from(asset.content, 'binary') : asset.content
		return new Response(body, {
			headers: {
				'Content-Type': asset.contentType,
				'Cache-Control': pathname === '/' || pathname.endsWith('.html') ? 'no-cache' : 'max-age=31536000,immutable',
			},
		})
	})
	.listen(PORT)

// seed default "Home" section if no sections exist
const now = Date.now()
db.insert(sections)
	.values({ id: 'home', name: 'Home', position: 0, createdAt: now, updatedAt: now })
	.onConflictDoNothing()
	.run()

// Start polling for all configured integrations
startAllPolling(db).catch((err: unknown) => {
	log.error('startAllPolling failed', { error: err instanceof Error ? err.message : String(err) })
})

// Start Matter bridge
matterBridge.start(db).catch((err: unknown) => {
	log.error('matter bridge start failed', { error: err instanceof Error ? err.message : String(err) })
})

// Forward inbound Matter commands to physical devices
matterBridge.onCommand((deviceId, state) => {
	const device = db.select().from(devices).where(eq(devices.id, deviceId)).get()
	if (!device?.integrationId) return

	const integration = db.select().from(integrations).where(eq(integrations.id, device.integrationId)).get()
	if (!integration) return

	const config = parseJson<Record<string, string>>(integration.config).unwrapOr({})
	const adapterResult = createAdapter(integration.brand, config, integration.session)
	if (adapterResult.isErr()) return

	// fire-and-forget — SSE already updated the dashboard, this forwards to the physical device
	void adapterResult.value.setState(device.externalId, state).match(
		() => {
			// update DB state to match
			const currentState = parseJson<Record<string, unknown>>(device.state).unwrapOr({})
			const newState = { ...currentState, ...state }
			db.update(devices)
				.set({ state: JSON.stringify(newState), updatedAt: Date.now() })
				.where(eq(devices.id, deviceId))
				.run()
			log.info('matter inbound forwarded', { deviceId, brand: device.brand })
		},
		(error) => {
			log.error('matter inbound forward failed', { deviceId, brand: device.brand, error: error.message })
		},
	)
})

// Sync device state changes to Matter bridge (skip events originating from matter)
eventBus.on('device:update', (event) => {
	if (event.source === 'matter') return
	if (event.deviceId && event.state) {
		void matterBridge.updateDeviceState(event.deviceId, event.state)
	}
})

// Clean shutdown
process.on('SIGTERM', () => void matterBridge.stop())
process.on('SIGINT', () => void matterBridge.stop())

log.info('server started', {
	port: app.server?.port,
	url: `http://localhost:${app.server?.port}`,
	embeddedClient: hasClientAssets,
})

export type App = typeof app
