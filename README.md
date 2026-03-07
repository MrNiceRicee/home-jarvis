# Home Jarvis

Personal IoT hub — discover, control, and bridge smart home devices to Matter from a single self-hosted server.

## Features

- **Multi-brand**: Philips Hue, Govee, Elgato Key Light, VeSync, SmartThings, Resideo, SmartHQ (GE)
- **Auto-detection**: mDNS and UDP LAN scanning for local devices (Hue, Govee, Elgato)
- **Real-time UI**: SSE-driven live state via zustand — no polling, no page refresh
- **Matter bridge**: Expose non-Matter devices to Apple Home, Google Home, Alexa via matter.js
- **Single binary**: Production build is one `./jarvis` — no Node, no runtime required

## Design

Sony Making Modern + terminal aesthetic. Warm champagne surfaces, dark LCD readout windows with scanline overlays, brushed aluminum dials, CRT power-on animations, and a braille pixel renderer for the Matter orbital HUD. Two-font system: IoskeleyMono (readouts) + Michroma (engraved labels). Every page has a distinct personality — dashboard is a device grid, integrations is a eurorack module rack, Matter is a full-viewport mission-control HUD.

See [`docs/solutions/ui-design/design-system-sony-terminal-aesthetic.md`](docs/solutions/ui-design/design-system-sony-terminal-aesthetic.md) for the full design system reference.

## Stack

| Layer | Technology |
|-------|-----------|
| Server | Bun + Elysia (port 3001) |
| Client | React 19 + Vite + TanStack Router/Query + React Aria + Zustand + Tailwind v4 |
| Database | SQLite via Drizzle ORM (`bun:sqlite`) |
| API contract | Elysia × Eden Treaty — fully type-safe end-to-end |
| Real-time | Server-Sent Events (SSE) → zustand stores |
| Matter | matter.js v0.16 (`@matter/main` + `@matter/nodejs`) |

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
│       ├── index.ts                      # app entry + Eden Treaty App type
│       ├── routes/                       # controllers (devices, events, integrations, scan)
│       ├── integrations/                 # per-brand adapters
│       │   ├── types.ts                  # DeviceAdapter interface, DeviceState, DeviceType
│       │   ├── registry.ts               # brand → adapter mapping + IntegrationMeta
│       │   ├── hue/adapter.ts            # Philips Hue (mDNS + N-UPnP + CLIP API)
│       │   └── elgato/adapter.ts         # Elgato Key Light (mDNS + local HTTP)
│       ├── discovery/                    # device scanning
│       │   ├── local-scanner.ts          # unified scan: Hue, Govee UDP, Aqara, Elgato mDNS
│       │   ├── mdns-scanner.ts           # low-level mDNS via bonjour-hap
│       │   └── cloud-poller.ts           # scheduled polling for cloud integrations
│       ├── lib/                          # shared utilities
│       │   ├── events.ts                 # SSE event bus
│       │   ├── logger.ts                 # structured logging
│       │   └── parse-json.ts             # safe JSON parsing
│       ├── db/                           # Drizzle schema + SQLite instance
│       └── generated/client-manifest.ts  # stub in dev; embedded client in prod
├── client/              # React + Vite SPA
│   └── src/
│       ├── routes/                       # TanStack Router file-based pages
│       ├── components/
│       │   ├── DeviceCard.tsx            # dispatcher → type-specific sub-cards
│       │   ├── device-cards/             # LightCard, ThermostatCard, VacuumCard, …
│       │   ├── IntegrationForm.tsx       # dynamic credential form per brand
│       │   └── LightMultiSelectBar.tsx   # batch light control
│       ├── hooks/
│       │   ├── useDeviceStream.ts          # SSE → zustand device store
│       │   ├── useScanStream.ts            # scan SSE → zustand scan store
│       │   └── useReducedMotion.ts         # prefers-reduced-motion hook
│       ├── stores/                         # zustand state management
│       │   ├── device-store.ts             # SSE-driven device state
│       │   ├── connection-store.ts         # SSE connection status
│       │   ├── scan-store.ts               # network scan state
│       │   └── readout-store.ts            # navbar readout strip
│       └── lib/
│           ├── api.ts                      # Eden Treaty client
│           └── color-utils.ts              # color conversion helpers
├── docs/solutions/                         # compounded knowledge (design system, solutions)
└── scripts/
    └── gen-client-manifest.ts              # codegen: client/dist/ → embedded TS module
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

| Brand | Discovery | Auth type | Status |
|-------|-----------|-----------|--------|
| Philips Hue | mDNS `_hue._tcp` + N-UPnP cloud | Local API key (press bridge button) | Working |
| Elgato Key Light | mDNS `_elg._tcp` | None (unauthenticated local HTTP) | Working |
| Govee | UDP LAN `239.255.255.250:4003` | Cloud API key | Working |
| VeSync (Levoit) | Manual | Email + password | Working |
| Resideo (Honeywell) | Manual | API key + OAuth token | Working |
| SmartThings | Manual | Personal Access Token | Working |
| SmartHQ (GE) | Manual | Email + password | Working |

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
- Entity types from `server/src/db/schema.ts` (`Device`, `Integration`, `MatterConfig`)
- Domain types from `server/src/integrations/types.ts` (`DeviceState`, `DeviceType`, `IntegrationMeta`)
- API request/response types inferred via Eden Treaty from `export type App = typeof app`

Never hand-write types the server already owns — import them.

### Real-time state
Device state is managed exclusively via SSE → zustand, never by polling:
- `GET /api/events` streams a snapshot on connect, then device updates as they happen
- `useDeviceStream` hook writes to zustand `device-store` via `updateDevice()`
- Components subscribe to `useDeviceStore((s) => s.devices)` — reactive, no fetch, no flicker
- Optimistic updates use `addPending`/`removePending` to suppress SSE overwrites during mutations

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
