import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

import { db } from './db'
import { startAllPolling } from './discovery/cloud-poller'
import { devicesController } from './routes/devices.controller'
import { eventsController } from './routes/events.controller'
import { integrationsController } from './routes/integrations.controller'
import { scanController } from './routes/scan.controller'

const app = new Elysia()
	.use(cors({ origin: true }))
	.use(integrationsController)
	.use(devicesController)
	.use(eventsController)
	.use(scanController)
	.get('/api/health', () => ({ ok: true, timestamp: Date.now() }))
	.listen(3001)

// Start polling for all configured integrations
startAllPolling(db).catch(console.error)

console.log(`🏠 Home Jarvis server running at http://localhost:${app.server?.port}`)

export type App = typeof app
