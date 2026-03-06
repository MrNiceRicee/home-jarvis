import { useCallback, useEffect, useRef } from 'react'

import type { DetectedDevice, ScanEvent } from '../types'

import { useScanStore } from '../stores/scan-store'

export function useScanStream() {
	const esRef = useRef<EventSource | null>(null)
	const state = useScanStore()

	const cancel = useCallback(() => {
		const es = esRef.current
		if (es) {
			es.onmessage = null
			es.onerror = null
			es.close()
		}
		esRef.current = null
		useScanStore.getState().setScanState((prev) => ({
			...prev,
			status: prev.status === 'scanning' ? 'idle' : prev.status,
		}))
	}, [])

	const startScan = useCallback(() => {
		cancel()
		useScanStore.getState().setScanState(() => ({
			status: 'scanning',
			devices: [],
			brands: [],
			brandResults: [],
		}))

		const sseUrl = import.meta.env.DEV ? 'http://localhost:3001/api/scan' : '/api/scan'
		const es = new EventSource(sseUrl)
		esRef.current = es

		es.onmessage = (e: MessageEvent<string>) => {
			const event = JSON.parse(e.data) as ScanEvent
			const update = useScanStore.getState().setScanState

			switch (event.type) {
				case 'scan:start':
					update((prev) => ({ ...prev, brands: event.brands }))
					break
				case 'scan:device':
					update((prev) => ({
						...prev,
						devices: [...prev.devices, event.device as DetectedDevice],
					}))
					break
				case 'scan:complete':
					update((prev) => ({
						...prev,
						brandResults: [
							...prev.brandResults,
							{ brand: event.brand, count: event.count, error: event.error },
						],
					}))
					break
				case 'scan:done':
					update((prev) => ({ ...prev, status: 'done' }))
					es.close()
					esRef.current = null
					break
			}
		}

		es.onerror = () => {
			es.close()
			esRef.current = null
			useScanStore.getState().setScanState((prev) => ({
				...prev,
				status: 'error',
				error: 'Scan connection failed',
			}))
		}
	}, [cancel])

	// cleanup on unmount — prevent zombie connections
	useEffect(() => {
		return () => {
			const es = esRef.current
			if (es) {
				es.onmessage = null
				es.onerror = null
				es.close()
			}
			esRef.current = null
		}
	}, [])

	return {
		status: state.status,
		devices: state.devices,
		brands: state.brands,
		brandResults: state.brandResults,
		error: state.error,
		startScan,
		cancel,
	}
}
