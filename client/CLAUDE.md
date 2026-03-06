# Client — home-jarvis client

React 19 + Vite + TanStack Router/Query + React Aria Components + Tailwind CSS v4 + Zustand.

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
import type { Device, Integration, MatterConfig } from 'home-jarvis-server/src/db/schema'

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

## State Management

### Zustand stores (`src/stores/`)

SSE-driven and app-wide state lives in zustand stores:

```ts
// device data — populated by SSE via useDeviceStream hook
import { useDeviceStore } from '@/stores/device-store'
const devices = useDeviceStore((s) => s.devices)

// connection status
import { useConnectionStore } from '@/stores/connection-store'
const status = useConnectionStore((s) => s.status)

// scan state — populated by scan SSE via useScanStream hook
import { useScanStore } from '@/stores/scan-store'

// navbar readout strip
import { useReadoutStore } from '@/stores/readout-store'
```

Optimistic updates use `useDeviceStore.getState().updateDevice()` with `addPending`/`removePending` to suppress SSE overwrites during in-flight mutations.

### React Query (server-fetched data only)

React Query manages data that comes from API fetches, not SSE:

- `['integrations']` — integration list
- `['sections']` — dashboard sections
- `['matter']` — bridge status (10s poll)
- `['matter', 'qr']` — QR code data

After integration mutations, invalidate: `queryClient.invalidateQueries({ queryKey: ['integrations'] })`

## Routes

- `__root.tsx` — QueryClientProvider, Toaster (sonner), TanStack devtools
- `index.tsx` — Dashboard: device grid, state mutations, sections
- `integrations.tsx` — Integration management (add/remove), scan
- `matter.tsx` — Matter bridge status, QR pairing

## Lint Rules

- `sonarjs/prefer-read-only-props`: wrap prop types with `Readonly<Props>`
- `perfectionist/sort-imports`: `@tanstack/*` imports must be sorted alphabetically

## Gotchas

- Tailwind CSS v4: CSS-first config (`@import 'tailwindcss'`) — no `tailwind.config.js`
- Device state is SSE-driven via zustand — never use `useQuery` for device data
- Optimistic updates for device state changes are fine; SSE will confirm the real value shortly after
- EventSource refs live in hooks (`useDeviceStream`, `useScanStream`), NOT in zustand state
