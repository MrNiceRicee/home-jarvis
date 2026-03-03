import Elysia, { sse } from 'elysia'

import type { ScanEvent } from '../integrations/types'

import { SCANNABLE_BRANDS, runStreamingScan } from '../discovery/local-scanner'
import { log } from '../lib/logger'

type QueueItem = ScanEvent

export const scanController = new Elysia({ prefix: '/api' })

	/** SSE — streams scan results progressively as each brand completes */
	.get('/scan', async function* ({ set }) {
		set.headers['X-Accel-Buffering'] = 'no'

		const queue: QueueItem[] = []
		let notify: (() => void) | null = null
		const enqueue = (item: QueueItem) => {
			queue.push(item)
			notify?.()
			notify = null
		}

		const brands = SCANNABLE_BRANDS
		log.info('scan:start', { brands })
		enqueue({ type: 'scan:start', brands })

		let totalDevices = 0
		const scanPromise = runStreamingScan({
			onDevice: (device) => {
				totalDevices++
				enqueue({ type: 'scan:device', device })
			},
			onBrandComplete: (brand, count, error) => {
				enqueue({ type: 'scan:complete', brand, count, error })
			},
		})

		// drain events until scan finishes
		let done = false
		void scanPromise.then(() => {
			enqueue({ type: 'scan:done', totalDevices })
			done = true
		})

		while (!done || queue.length > 0) {
			const item = queue.shift()
			if (item !== undefined) {
				yield sse({ data: item })
				if (item.type === 'scan:done') return
				continue
			}
			await new Promise<void>((resolve) => { notify = resolve })
		}
	})

	/** Single-brand scan — regular JSON response for per-integration dialogs */
	.get('/scan/:brand', async ({ params: { brand }, set }) => {
		set.headers['Cache-Control'] = 'no-store'
		if (!SCANNABLE_BRANDS.includes(brand)) {
			set.status = 400
			return { error: `Unknown brand: ${brand}. Scannable: ${SCANNABLE_BRANDS.join(', ')}` }
		}
		log.info('scan:brand', { brand })
		const devices = await runStreamingScan(
			{ onDevice: () => {}, onBrandComplete: () => {} },
			[brand],
		)
		log.info('scan:brand done', { brand, count: devices.length })
		return devices
	})
