import Elysia from 'elysia'

import { runLocalScan } from '../discovery/local-scanner'
import { log } from '../lib/logger'

export const scanController = new Elysia({ prefix: '/api' })
	/** Scan the local network for supported device hubs/bridges */
	.get('/scan', async ({ set }) => {
		set.headers['Cache-Control'] = 'no-store'
		log.info('localScan started')
		const detected = await runLocalScan()
		log.info('localScan finished', { count: detected.length, brands: [...new Set(detected.map((d) => d.brand))] })
		return detected
	})
