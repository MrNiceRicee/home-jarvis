# Server — home-jarvis-server

Bun + Elysia on port 3001. SQLite via Drizzle ORM.

## Commands

```bash
bun run dev          # hot-reload dev server (bun --hot src/index.ts)
bun run typecheck    # tsc --noEmit
bun run lint:fix     # eslint --fix
bun run db:push      # drizzle-kit push (apply schema changes)
bun run db:studio    # drizzle-kit studio (visual DB browser)
```

## Architecture

```
src/
  index.ts                      # Elysia app entry; exports `App` type for Eden Treaty
  routes/
    devices.controller.ts
    events.controller.ts        # SSE endpoint (/api/events)
    integrations.controller.ts
    scan.controller.ts
  integrations/
    registry.ts                 # central integration registry
    types.ts                    # DeviceAdapter interface, DeviceState, IntegrationMeta
    hue/adapter.ts
  discovery/
    cloud-poller.ts
    local-scanner.ts
  db/
    index.ts                    # Drizzle + bun:sqlite instance
    schema.ts                   # source of truth for all entity types
  lib/
    events.ts                   # SSE event bus
```

## Key Patterns

- **Framework**: Elysia — not Express, not bare `Bun.serve()`
- **ORM**: Drizzle + `bun:sqlite` (`better-sqlite3` in devDeps is a type shim only)
- **SSE**: `lib/events.ts` emits device events; clients subscribe at `GET /api/events`
- **Type export**: `export type App = typeof app` at the bottom of `src/index.ts` — this is what Eden Treaty consumes on the client
- **Trailing slashes**: Elysia routes must NOT have trailing slashes

## Source-of-Truth Types

`src/db/schema.ts` is the canonical source for entity types:

```ts
export type Device = typeof devices.$inferSelect
export type Integration = typeof integrations.$inferSelect
export type MatterConfig = typeof matterConfig.$inferSelect
```

`src/integrations/types.ts` owns `DeviceState`, `DeviceType`, `IntegrationMeta`, `CredentialField`.

Never duplicate these types elsewhere — import from the schema or `integrations/types.ts`.
