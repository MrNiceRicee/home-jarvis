---
title: "Scanner Refactor + Design Refresh"
type: feat
status: ready
date: 2026-03-02
---

# Scanner Refactor + Design Refresh

## Context

Two issues motivate this work:

1. **Silent scan failures** — `local-scanner.ts` uses `try/catch` that swallows errors (the `bonjour-hap` missing dependency hid for days). The rest of the codebase uses `neverthrow` for typed error handling. The scan also blocks for 5+ seconds before returning anything — converting to SSE lets devices stream in as they're found.

2. **Flat UI** — the app works but feels generic. The user wants the raised-surface / neo-skeuomorphic aesthetic (subtle gradients, layered shadows, inner glows, tactile press states) inspired by the React Aria docs.

---

## Phase 1: Scanner Refactor (neverthrow + SSE streaming)

### 1A. Add scan event types
**File:** `server/src/integrations/types.ts`

Add discriminated union types below existing `DeviceEvent`:
- `ScanStartEvent` — `{ type: 'scan:start', brands: string[] }`
- `ScanDeviceEvent` — `{ type: 'scan:device', device: DetectedDevice }`
- `ScanBrandCompleteEvent` — `{ type: 'scan:complete', brand, count, error? }`
- `ScanDoneEvent` — `{ type: 'scan:done', totalDevices }`

### 1B. Refactor `local-scanner.ts` to neverthrow
**File:** `server/src/discovery/local-scanner.ts`

- Each scan function returns `ResultAsync<DetectedDevice[], ScanError>` instead of `Promise<DetectedDevice[]>`
- Use `ResultAsync.fromPromise()` to wrap the existing Promises (same pattern as `hue/adapter.ts`)
- Use `.orElse(() => ok([]))` per scan so one brand failing doesn't block others
- Add `ScanCallbacks` interface + `runStreamingScan(callbacks)` for progressive emission
- Keep `runLocalScan()` as backward-compatible wrapper (calls `runStreamingScan` with no-op callbacks)

### 1C. Convert scan controller to SSE
**File:** `server/src/routes/scan.controller.ts`

- Replace blocking `GET /api/scan` with SSE async generator (same pattern as `events.controller.ts`)
- Uses queue + notify pattern for event delivery
- Finite stream — closes after `scan:done` (no heartbeat needed)
- Reference: `server/src/routes/events.controller.ts` lines 25-77

### 1D. Client scan types
**File:** `client/src/types.ts`

Export `ScanEvent` types for client consumption (re-export from server or mirror types).

### 1E. New `useScanStream` hook
**New file:** `client/src/hooks/useScanStream.ts`

- EventSource-based hook (pattern from `useDeviceStream.ts`)
- Finite lifecycle — connects once, closes after `scan:done`
- Returns `{ status, devices, completedBrands, totalBrands, startScan, cancel }`
- Devices added to state array incrementally as `scan:device` events arrive

### 1F. Update integrations page
**File:** `client/src/routes/integrations.tsx`

- Replace `useQuery(['scan'])` with `useScanStream()`
- Show progressive scan progress: "Scanning (2/4)..."
- Devices appear incrementally in the "Detected on Your Network" section

### Phase 1 checkpoint
- `bun run system:check --force`
- Start server, hit `/integrations`, verify devices stream in progressively
- Verify scan errors are logged with `ScanError` details (not swallowed)

---

## Phase 2: Design Refresh (raised surface / neo-skeuomorphic)

### 2A. Design tokens
**File:** `client/src/index.css`

Add `@theme` block with CSS custom properties:
- `--shadow-raised` / `--shadow-raised-hover` / `--shadow-raised-active` — layered box-shadows
- `--shadow-inner-glow` — `inset 0 1px 0 rgba(255,255,255,0.7)` for raised edge
- `--gradient-surface` / `--gradient-nav` / `--gradient-btn-primary` / `--gradient-btn-secondary`
- `--border-raised` — semi-transparent border
- `--bg-page` — warm off-white (`#f5f3f0`) with subtle radial gradient

Add `@layer components` block with reusable button classes:
- `.btn-raised` — secondary button (white gradient, raised shadow, `[data-pressed]` pushes in)
- `.btn-raised-primary` — dark button (dark gradient, inner highlight, press state)

### 2B. Navigation
**File:** `client/src/routes/__root.tsx`

- Nav bar: gradient background + inner glow shadow
- Active nav item: raised white pill with shadow (replaces flat black bg)
- Page background: warm off-white from theme

### 2C. Card shell
**File:** `client/src/components/DeviceCard.tsx`

- `CardShell`: gradient surface + layered shadow + inner glow + semi-transparent border
- Footer: subtle gradient instead of flat white
- Maintains existing semantic accent colors (amber for lights, etc.)

### 2D. Buttons across app
**Files:** `IntegrationForm.tsx`, `LightCard.tsx`, `ThermostatCard.tsx`, `index.tsx`, `integrations.tsx`

- Replace flat `bg-gray-100` / `bg-gray-900` buttons with `btn-raised` / `btn-raised-primary`
- React Aria `[data-pressed]` attribute handles the press state automatically

### 2E. Integration cards + modals
**File:** `client/src/components/IntegrationForm.tsx`

- Integration cards: raised surface treatment
- Quick Connect cards: warm gradient with amber shadow tint
- Modals: frosted glass backdrop (`backdrop-blur-sm`) + raised modal surface with prominent shadow

### 2F. Form inputs
**File:** `client/src/components/IntegrationForm.tsx`

- Inset shadow on inputs (opposite of raised — inputs feel recessed)
- Subtle gradient (gray-top to white-bottom)

### 2G. Dashboard layout
**File:** `client/src/routes/index.tsx`

- Brand section headers: add gradient divider line
- Stream status badge: raised pill treatment

### 2H. Multi-select bar
**File:** `client/src/components/LightMultiSelectBar.tsx`

- Enhanced frosted glass: increased blur + saturation + more prominent inner glow
- Semi-transparent white border

### Phase 2 checkpoint
- `bun run system:check --force`
- Visual QA: page bg warm, nav has depth, cards lift off bg, buttons press in, modals have glass backdrop
- Verify semantic colors (amber/blue/emerald) still work with the new surface treatment
- Keyboard navigation still works (React Aria accessibility preserved)

---

## Key files

| File | Change |
|------|--------|
| `server/src/integrations/types.ts` | Add `ScanEvent` union types |
| `server/src/discovery/local-scanner.ts` | neverthrow refactor + streaming callbacks |
| `server/src/routes/scan.controller.ts` | SSE async generator |
| `client/src/types.ts` | Export scan event types |
| `client/src/hooks/useScanStream.ts` | New SSE hook |
| `client/src/routes/integrations.tsx` | Use scan stream |
| `client/src/index.css` | Design tokens + button classes |
| `client/src/routes/__root.tsx` | Nav + page background |
| `client/src/components/DeviceCard.tsx` | Card shell raised surface |
| `client/src/components/IntegrationForm.tsx` | Cards, modals, forms, buttons |
| `client/src/routes/index.tsx` | Dashboard layout |
| `client/src/components/LightMultiSelectBar.tsx` | Frosted glass bar |
| Device card files | Button class updates |

## Verification

1. `bun run system:check --force` passes
2. Scan streams devices progressively (not blocked 5s)
3. Scan errors logged with context (not silently swallowed)
4. UI has visible depth — cards, nav, buttons feel tactile
5. Press states animate (translateY + reduced shadow)
6. All React Aria keyboard navigation preserved
7. No `as any`, no `@ts-ignore`
