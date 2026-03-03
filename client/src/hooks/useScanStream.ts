import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import type { DetectedDevice, ScanEvent } from '../types'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

export interface BrandResult {
	brand: string
	count: number
	error?: string
}

export interface ScanState {
	status: ScanStatus
	devices: DetectedDevice[]
	/** all brands being scanned (from scan:start) */
	brands: string[]
	/** per-brand results as they complete */
	brandResults: BrandResult[]
	error?: string
}

const INITIAL_SCAN_STATE: ScanState = {
	status: 'idle',
	devices: [],
	brands: [],
	brandResults: [],
}

const SCAN_QUERY_KEY = ['scan:state'] as const

/** read scan state from React Query cache — survives navigation */
function useScanState() {
	return useQuery<ScanState>({
		queryKey: SCAN_QUERY_KEY,
		queryFn: () => INITIAL_SCAN_STATE,
		initialData: INITIAL_SCAN_STATE,
		staleTime: Infinity,
		gcTime: Infinity,
	})
}

export function useScanStream() {
	const queryClient = useQueryClient()
	const esRef = useRef<EventSource | null>(null)
	const { data: state } = useScanState()

	function updateScan(updater: (prev: ScanState) => ScanState) {
		queryClient.setQueryData<ScanState>(SCAN_QUERY_KEY, (prev) => updater(prev ?? INITIAL_SCAN_STATE))
	}

	const cancel = useCallback(() => {
		esRef.current?.close()
		esRef.current = null
		updateScan((prev) => ({ ...prev, status: prev.status === 'scanning' ? 'idle' : prev.status }))
		// eslint-disable-next-line react-hooks/exhaustive-deps -- updateScan is stable (uses queryClient ref)
	}, [])

	const startScan = useCallback(() => {
		cancel()
		updateScan(() => ({ status: 'scanning', devices: [], brands: [], brandResults: [] }))

		const sseUrl = import.meta.env.DEV ? 'http://localhost:3001/api/scan' : '/api/scan'
		const es = new EventSource(sseUrl)
		esRef.current = es

		es.onmessage = (e: MessageEvent<string>) => {
			const event = JSON.parse(e.data) as ScanEvent

			switch (event.type) {
				case 'scan:start':
					updateScan((prev) => ({ ...prev, brands: event.brands }))
					break
				case 'scan:device':
					updateScan((prev) => ({
						...prev,
						devices: [...prev.devices, event.device as DetectedDevice],
					}))
					break
				case 'scan:complete':
					updateScan((prev) => ({
						...prev,
						brandResults: [
							...prev.brandResults,
							{ brand: event.brand, count: event.count, error: event.error },
						],
					}))
					break
				case 'scan:done':
					updateScan((prev) => ({ ...prev, status: 'done' }))
					es.close()
					esRef.current = null
					break
			}
		}

		es.onerror = () => {
			es.close()
			esRef.current = null
			updateScan((prev) => ({ ...prev, status: 'error', error: 'Scan connection failed' }))
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- updateScan is stable (uses queryClient ref)
	}, [cancel])

	return { ...(state ?? INITIAL_SCAN_STATE), startScan, cancel }
}
