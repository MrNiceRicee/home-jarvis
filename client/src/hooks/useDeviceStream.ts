import { useEffect, useRef, useState, useCallback } from 'react'
import type { Device, SSEEvent } from '../types'

export type StreamStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

export function useDeviceStream() {
  const [devices, setDevices] = useState<Device[]>([])
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const esRef = useRef<EventSource | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCount = useRef(0)

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()

    const es = new EventSource('/api/events')
    esRef.current = es

    es.onopen = () => {
      setStatus('connected')
      retryCount.current = 0
    }

    es.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as SSEEvent

      switch (event.type) {
        case 'snapshot':
          setDevices(event.devices)
          break
        case 'device:update':
          setDevices(prev =>
            prev.map(d =>
              d.id === event.deviceId
                ? {
                    ...d,
                    ...(event.state ? { state: event.state } : {}),
                    ...(event.online !== undefined ? { online: event.online } : {}),
                  }
                : d
            )
          )
          break
        case 'device:offline':
          setDevices(prev => prev.map(d => d.id === event.deviceId ? { ...d, online: false } : d))
          break
        case 'heartbeat':
          // keep-alive — no state update needed
          break
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      setStatus('reconnecting')

      // Exponential backoff: 1s, 2s, 4s, 8s … max 30s
      const delay = Math.min(1000 * 2 ** retryCount.current, 30_000)
      retryCount.current++
      retryRef.current = setTimeout(connect, delay)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [connect])

  return { devices, status }
}
