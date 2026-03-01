import type { App } from 'home-jarvis-server'

import { treaty } from '@elysiajs/eden'

/**
 * Eden Treaty client — fully typed from the server's App type.
 * All routes, request bodies, and responses are inferred at compile time.
 *
 * Usage:
 *   const { data, error } = await api.api.devices.get()
 *   const { data, error } = await api.api.integrations.post({ body: { brand, config } })
 */
export const api = treaty<App>('localhost:3001')
