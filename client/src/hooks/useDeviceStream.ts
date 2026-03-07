import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { useConnectionStore } from '../stores/connection-store'
import { useDeviceStore } from '../stores/device-store'
import { useReadoutStore } from '../stores/readout-store'
import type { SSEEvent } from '../types'

export function useDeviceStream() {
	const esRef = useRef<EventSource | null>(null)
	const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const retryCount = useRef(0)
	const aliveRef = useRef(true)

	useEffect(() => {
		aliveRef.current = true

		function connect() {
			if (!aliveRef.current) return
			if (esRef.current) esRef.current.close()

			const sseUrl = import.meta.env.DEV ? 'http://localhost:3001/api/events' : '/api/events'
			const es = new EventSource(sseUrl)
			esRef.current = es

			es.onopen = () => {
				useConnectionStore.getState().setStatus('connected')
				retryCount.current = 0
			}

			es.onmessage = (e: MessageEvent<string>) => {
				// discard updates from dying connection
				if (useConnectionStore.getState().status === 'reconnecting') return

				const event = JSON.parse(e.data) as SSEEvent
				const store = useDeviceStore.getState()

				switch (event.type) {
					case 'snapshot':
						store.setDevices(event.devices)
						break
					case 'device:update':
						store.updateDevice(event.deviceId, {
							state: event.state,
							online: event.online,
						})
						break
					case 'device:new':
						store.addDevice(event.device)
						toast(`New device discovered: ${event.device.name}`)
						useReadoutStore.getState().pushNotification(`new: ${event.device.name}`)
						break
					case 'device:offline':
						store.setOffline(event.deviceId)
						break
					case 'heartbeat':
						break
				}
			}

			es.onerror = () => {
				es.close()
				esRef.current = null
				useConnectionStore.getState().setStatus('reconnecting')

				const delay = Math.min(1000 * 2 ** retryCount.current, 30_000)
				retryCount.current++
				retryRef.current = setTimeout(connect, delay)
			}
		}

		connect()

		return () => {
			aliveRef.current = false
			esRef.current?.close()
			if (retryRef.current) clearTimeout(retryRef.current)
		}
	}, [])
}
