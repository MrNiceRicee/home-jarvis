import { useCallback, useRef, useState } from 'react'

import type { DetectedDevice, ScanEvent } from '../types'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

export interface BrandResult {
	brand: string
	count: number
	error?: string
}

interface ScanState {
	status: ScanStatus
	devices: DetectedDevice[]
	/** all brands being scanned (from scan:start) */
	brands: string[]
	/** per-brand results as they complete */
	brandResults: BrandResult[]
	error?: string
}

export function useScanStream() {
	const [state, setState] = useState<ScanState>({
		status: 'idle',
		devices: [],
		brands: [],
		brandResults: [],
	})
	const esRef = useRef<EventSource | null>(null)

	const cancel = useCallback(() => {
		esRef.current?.close()
		esRef.current = null
		setState((prev) => ({ ...prev, status: prev.status === 'scanning' ? 'idle' : prev.status }))
	}, [])

	const startScan = useCallback(() => {
		cancel()
		setState({ status: 'scanning', devices: [], brands: [], brandResults: [] })

		const sseUrl = import.meta.env.DEV ? 'http://localhost:3001/api/scan' : '/api/scan'
		const es = new EventSource(sseUrl)
		esRef.current = es

		es.onmessage = (e: MessageEvent<string>) => {
			const event = JSON.parse(e.data) as ScanEvent

			switch (event.type) {
				case 'scan:start':
					setState((prev) => ({ ...prev, brands: event.brands }))
					break
				case 'scan:device':
					setState((prev) => ({
						...prev,
						devices: [...prev.devices, event.device as DetectedDevice],
					}))
					break
				case 'scan:complete':
					setState((prev) => ({
						...prev,
						brandResults: [
							...prev.brandResults,
							{ brand: event.brand, count: event.count, error: event.error },
						],
					}))
					break
				case 'scan:done':
					setState((prev) => ({ ...prev, status: 'done' }))
					es.close()
					esRef.current = null
					break
			}
		}

		es.onerror = () => {
			es.close()
			esRef.current = null
			setState((prev) => ({ ...prev, status: 'error', error: 'Scan connection failed' }))
		}
	}, [cancel])

	return { ...state, startScan, cancel }
}
