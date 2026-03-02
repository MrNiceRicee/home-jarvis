# Home Jarvis

Personal IoT hub — discover, control, and bridge smart home devices to HomeKit from a single self-hosted server.

## Features

- **Multi-brand**: Philips Hue, Govee, Elgato Key Light, VeSync, LG ThinQ, GE Cync, Aqara, SmartThings, Resideo
- **Auto-detection**: mDNS and UDP LAN scanning for local devices (Hue, Govee, Elgato, Aqara)
- **Real-time UI**: SSE-based live state — no polling, no page refresh
- **HomeKit bridge**: Expose non-HomeKit devices to Apple Home (Phase 5)
- **Single binary**: Production build is one `./jarvis` — no Node, no runtime required

## Stack

| Layer | Technology |
|-------|-----------|
| Server | Bun + Elysia (port 3001) |
| Client | React 19 + Vite + TanStack Router/Query + React Aria + Tailwind v4 |
| Database | SQLite via Drizzle ORM (`bun:sqlite`) |
| API contract | Elysia × Eden Treaty — fully type-safe end-to-end |
| Real-time | Server-Sent Events (SSE) |

---

## Development

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3

### Setup

```bash
git clone <repo>
cd home-jarvis
bun install
bun run db:push          # create SQLite schema
bun run dev              # server :3001 + client :5173 concurrently
```

Open `http://localhost:3001` (production) or `http://localhost:5173` (dev with hot reload).

### Commands

```bash
bun run dev              # start both packages with hot reload
bun run system:check     # lint + typecheck all packages (run after every change)
bun run lint:fix         # auto-fix lint errors
bun run format           # biome format
bun run db:push          # apply Drizzle schema changes to SQLite
bun run db:studio        # visual database browser
```

### Project structure

```
home-jarvis/
├── server/              # Bun + Elysia API
│   └── src/
│       ├── index.ts                    # app entry + Eden Treaty App type
│       ├── routes/                     # controllers (devices, events, integrations, scan)
│       ├── integrations/               # per-brand adapters (Hue, Elgato, …)
│       ├── discovery/                  # cloud-poller, mDNS/UDP local scanner
│       ├── db/                         # Drizzle schema + SQLite instance
│       └── generated/client-manifest.ts  # stub in dev; embedded client in prod
├── client/              # React + Vite SPA
│   └── src/
│       ├── routes/                     # TanStack Router pages
│       ├── components/                 # device cards, forms, multi-select bar
│       ├── hooks/useDeviceStream.ts    # SSE → TanStack Query cache
│       └── lib/api.ts                  # Eden Treaty client
└── scripts/
    └── gen-client-manifest.ts          # codegen: client/dist/ → embedded TS module
```

---

## Production Build

### How it works

The production build produces a **single self-contained executable**. No separate web server, no static folder to ship alongside it.

Build pipeline:

```
vite build (client)
  → client/dist/
    ↓
scripts/gen-client-manifest.ts
  → server/src/generated/client-manifest.ts
    (all HTML/CSS/JS/assets embedded as string literals)
      ↓
bun build --compile server/src/index.ts
  → dist/jarvis
    (Bun runtime + server code + embedded client — one file)
```

In production the server serves the embedded client files from `GET /*`, with immutable cache headers for hashed assets and SPA fallback to `index.html` for client-side routes. In development the stub manifest (`hasClientAssets = false`) makes that route a no-op — Vite serves the client normally.

### Build

```bash
bun run build:prod
# → dist/jarvis
```

### Run

```bash
./dist/jarvis
# Open http://localhost:3001
```

The `data/` directory and database are auto-created next to the binary on first run.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `DB_PATH` | auto (see below) | Absolute path to SQLite database file |

**DB path resolution:**
- **Development** (`bun run dev`): `server/data/jarvis.db` relative to the repo root
- **Compiled binary**: `./data/jarvis.db` relative to the directory containing the executable
- **Override**: `DB_PATH=/absolute/path/to/jarvis.db ./jarvis`

---

## macOS Deployment

### Run directly

```bash
bun run build:prod
cp dist/jarvis ~/Applications/jarvis/
~/Applications/jarvis/jarvis
```

The database auto-creates at `~/Applications/jarvis/data/jarvis.db`.

### Run on login with launchd

Create `~/Library/LaunchAgents/com.home-jarvis.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.home-jarvis</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/YOUR_USERNAME/Applications/jarvis/jarvis</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USERNAME/Applications/jarvis</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/YOUR_USERNAME/Applications/jarvis/logs/jarvis.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR_USERNAME/Applications/jarvis/logs/jarvis.log</string>
</dict>
</plist>
```

```bash
mkdir -p ~/Applications/jarvis/logs
launchctl load ~/Library/LaunchAgents/com.home-jarvis.plist
```

### Sharing the database between dev and production

Both point at the same file — no sync needed:

```bash
# In ~/.zshrc
export DB_PATH=~/Applications/jarvis/data/jarvis.db
```

Then `bun run dev` and the production binary use the same database. To push schema changes:

```bash
DB_PATH=~/Applications/jarvis/data/jarvis.db bun run db:push
```

---

## Integrations

| Brand | Discovery | Auth type |
|-------|-----------|-----------|
| Philips Hue | mDNS `_hue._tcp` + N-UPnP cloud | Local API key (press bridge button) |
| Govee | UDP LAN `239.255.255.250:4003` | Cloud API key |
| Elgato Key Light | mDNS `_elg._tcp` | None (unauthenticated local HTTP) |
| Aqara | mDNS `_miio._udp` | Access code |
| LG ThinQ | Manual | OAuth 2.0 |
| GE Cync / SmartHQ | Manual | Email + password |
| SmartThings | Manual | Personal Access Token |
| Resideo (Honeywell) | Manual | API key + OAuth token |
| VeSync (Levoit) | Manual | Email + password |

> **Note:** mDNS/UDP auto-detection works on macOS (Bonjour built-in) and Linux (avahi). It does not work inside WSL2 due to multicast limitations — run from a native host or enter the device IP manually.

### Adding an integration

1. Navigate to **Integrations** in the UI
2. Click **Scan** to auto-detect local devices (Hue, Govee, Elgato, Aqara)
3. Click **Quick Connect** on a detected device, or **Connect** on any integration card
4. Enter credentials and submit — the server validates them before saving

---

## Architecture Notes

### Type safety
All types flow from the server to the client without duplication:
- Entity types from `server/src/db/schema.ts` (`Device`, `Integration`, `HomekitConfig`)
- Domain types from `server/src/integrations/types.ts` (`DeviceState`, `DeviceType`, `IntegrationMeta`)
- API request/response types inferred via Eden Treaty from `export type App = typeof app`

Never hand-write types the server already owns — import them.

### Real-time state
Device state is managed exclusively via SSE, never by polling:
- `GET /api/events` streams a snapshot on connect, then device updates as they happen
- `useDeviceStream.ts` writes to TanStack Query cache (`setQueryData(['devices'], ...)`)
- Components read from cache with `staleTime: Infinity` — no fetch, no flicker

### Integration adapter pattern
Each brand implements `DeviceAdapter`:
```ts
interface DeviceAdapter {
  validateCredentials(config): ResultAsync<void, Error>
  discover():              ResultAsync<DiscoveredDevice[], Error>
  getState(externalId):   ResultAsync<DeviceState, Error>
  setState(externalId, state): ResultAsync<void, Error>
}
```
`createAdapter(brand, config)` in `registry.ts` returns `Result<DeviceAdapter, Error>` — all errors are typed, no throws.
