import Elysia from 'elysia'

import { runLocalScan } from '../discovery/local-scanner'

export const scanController = new Elysia({ prefix: '/api' })
	/** Scan the local network for supported device hubs/bridges */
	.get('/scan', async ({ set }) => {
		set.headers['Cache-Control'] = 'no-store'
		const detected = await runLocalScan()
		return detected
	})
