import { treaty } from '@elysiajs/eden'
import type { App } from 'home-jarvis-server'

/**
 * Eden Treaty client — fully typed from the server's App type.
 * All routes, request bodies, and responses are inferred at compile time.
 *
 * Usage:
 *   const { data, error } = await api.api.devices.get()
 *   const { data, error } = await api.api.integrations.post({ body: { brand, config } })
 */
// use current page host — in dev Vite proxies /api to the server, in prod same origin
const apiHost = typeof window !== 'undefined' ? window.location.host : 'localhost:3001'
export const api = treaty<App>(apiHost)
