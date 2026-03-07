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
// In dev (Vite), the server runs on :3001. In production, client is served from
// the same Elysia server, so we use the current page's host.
const apiHost = import.meta.env.DEV ? 'localhost:3001' : ''
export const api = treaty<App>(apiHost)
