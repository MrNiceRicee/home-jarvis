# Client — home-jarvis client

React 19 + Vite + TanStack Router/Query + React Aria Components + Tailwind CSS v4.

## Commands

```bash
bun run dev         # vite dev server (port 5173)
bun run typecheck   # tsc -b
bun run lint:fix    # eslint --fix
```

## Types — Source of Truth

All types must derive from the server package. The `home-jarvis-server` workspace dependency is available for imports.

**Do not hand-write types that already exist on the server.** Import them:

```ts
// Entity types — from Drizzle schema
import type { Device, Integration, HomekitConfig } from 'home-jarvis-server/src/db/schema'

// Domain types — from integrations layer
import type { DeviceState, DeviceType, IntegrationMeta, CredentialField } from 'home-jarvis-server/src/integrations/types'

// API response/request types — derive from Eden Treaty
import type { InferRouteBody } from '@elysiajs/eden'
import type { App } from 'home-jarvis-server'
```

Client-only types (UI state, component props) belong in `src/types.ts` but must not re-declare anything the server already owns. When in doubt, import and re-export rather than redeclare.

## API Calls — Eden Treaty

Always use Eden Treaty. Never raw `fetch`.

```ts
import { api } from '@/lib/api'

// In a query
queryFn: async () => {
  const { data, error } = await api.api.integrations.get()
  if (error) throw error
  return data
}

// In a mutation — body passed directly, NOT { body: ... }
mutationFn: (payload) => api.api.integrations.post(payload)
```

## Device State (SSE)

Device data is populated by SSE, never by a queryFn:

```ts
// useDeviceStream.ts writes to query cache
queryClient.setQueryData(['devices'], devices)

// Components read from cache — never trigger a fetch
const { data: devices } = useQuery({ queryKey: ['devices'], staleTime: Infinity, gcTime: Infinity })
```

After integration mutations, invalidate: `queryClient.invalidateQueries({ queryKey: ['integrations'] })`

## Routes

- `__root.tsx` — QueryClientProvider, Toaster (sonner), TanStack devtools
- `index.tsx` — Dashboard: device grid, discover/homekit/state mutations
- `integrations.tsx` — Integration management (add/remove)
- `homekit.tsx` — HomeKit QR pairing

## Lint Rules

- `sonarjs/prefer-read-only-props`: wrap prop types with `Readonly<Props>`
- `perfectionist/sort-imports`: `@tanstack/*` imports must be sorted alphabetically

## Gotchas

- Tailwind CSS v4: CSS-first config (`@import 'tailwindcss'`) — no `tailwind.config.js`
- Device query has `staleTime: Infinity` — SSE is source of truth, do not refetch
- Optimistic updates for device state changes are fine; SSE will confirm the real value shortly after
