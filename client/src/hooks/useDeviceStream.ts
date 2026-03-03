import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import type { Device, SSEEvent } from '../types'

export type StreamStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

const STREAM_STATUS_KEY = ['stream:status'] as const

export function useDeviceStream() {
	const queryClient = useQueryClient()
	const esRef = useRef<EventSource | null>(null)
	const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const retryCount = useRef(0)

	const connect = useCallback(() => {
		if (esRef.current) esRef.current.close()

		// In dev, connect directly to the API port — Vite's proxy buffers streaming
		// responses and corrupts the Content-Type for SSE. In production the client
		// is served from the same origin as the API so we use a relative URL.
		const sseUrl = import.meta.env.DEV ? 'http://localhost:3001/api/events' : '/api/events'
		const es = new EventSource(sseUrl)
		esRef.current = es

		es.onopen = () => {
			queryClient.setQueryData<StreamStatus>(STREAM_STATUS_KEY, 'connected')
			retryCount.current = 0
		}

		es.onmessage = (e: MessageEvent<string>) => {
			const event = JSON.parse(e.data) as SSEEvent

			switch (event.type) {
				case 'snapshot':
					queryClient.setQueryData(['devices'], event.devices)
					break
				case 'device:update':
					queryClient.setQueryData(['devices'], (prev: Device[] = []) =>
						// eslint-disable-next-line sonarjs/no-nested-functions -- map inside SSE callback chain (5 levels deep by necessity)
						prev.map((d) =>
							d.id === event.deviceId
								? {
										...d,
										...(event.state ? { state: event.state } : {}),
										...(event.online !== undefined ? { online: event.online } : {}),
									}
								: d,
						),
					)
					break
				case 'device:offline':
					queryClient.setQueryData(['devices'], (prev: Device[] = []) =>
						// eslint-disable-next-line sonarjs/no-nested-functions -- map inside SSE callback chain (5 levels deep by necessity)
						prev.map((d) => (d.id === event.deviceId ? { ...d, online: false } : d)),
					)
					break
				case 'heartbeat':
					// keep-alive — no state update needed
					break
			}
		}

		es.onerror = () => {
			es.close()
			esRef.current = null
			queryClient.setQueryData<StreamStatus>(STREAM_STATUS_KEY, 'reconnecting')

			// Exponential backoff: 1s, 2s, 4s, 8s … max 30s
			const delay = Math.min(1000 * 2 ** retryCount.current, 30_000)
			retryCount.current++
			// eslint-disable-next-line react-hooks/immutability -- connect ref is stable via useCallback
			retryRef.current = setTimeout(connect, delay)
		}
	}, [queryClient])

	useEffect(() => {
		connect()
		return () => {
			esRef.current?.close()
			if (retryRef.current) clearTimeout(retryRef.current)
		}
	}, [connect])

}

/** read-only hook for stream connection status */
export function useStreamStatus(): StreamStatus {
	const { data } = useQuery<StreamStatus>({
		queryKey: STREAM_STATUS_KEY,
		queryFn: () => 'connecting' as StreamStatus,
		initialData: 'connecting',
		staleTime: Infinity,
		gcTime: Infinity,
	})
	return data
}
