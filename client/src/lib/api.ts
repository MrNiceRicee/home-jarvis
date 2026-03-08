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
// in dev, proxy handles /api routing — use current page host (works with any port)
// in prod, client is served from the same Elysia server
const apiHost = ''
export const api = treaty<App>(apiHost)
