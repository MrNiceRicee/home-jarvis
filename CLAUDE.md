# Home Jarvis

IoT device hub. Turborepo + Bun workspaces: `server/` (Elysia API, port 3001) and `client/` (React/Vite, port 5173).

## Commands

```bash
bun run dev                    # start server + client concurrently
bun run system:check --force   # lint + typecheck all packages — run after EVERY change
bun run lint:fix               # auto-fix lint errors across all packages
bun run format                 # biome format
bun run db:push                # push Drizzle schema to SQLite
bun run db:studio              # visual DB browser
```

**Always run `bun run system:check --force` after every code change.**

## Type Safety Rules

- **No `as any`** — never cast to `any`. If a type is genuinely unknown, use `unknown` and narrow it.
- **No type shortcuts** — no `// @ts-ignore`, `// @ts-expect-error` without a documented reason in a comment directly above explaining why it's unavoidable.
- **No `eslint-disable`** without a comment on the same line explaining why: `// eslint-disable-next-line rule-name -- reason`

## API Contract

All client API calls MUST use Eden Treaty — never raw `fetch`:

```ts
import { api } from '@/lib/api'

// Response is always { data, error } — check error before using data
const { data, error } = await api.api.devices.get()

// Body is passed directly (NOT wrapped in { body: ... })
const { data, error } = await api.api.integrations.post({ brand: 'hue', config: '{}' })
```

`api` is `treaty<App>('localhost:3001')` — type-safe end-to-end from server route definitions.
