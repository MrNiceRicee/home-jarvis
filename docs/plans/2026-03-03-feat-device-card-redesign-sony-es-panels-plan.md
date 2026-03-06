---
title: "feat: Device Card Redesign — Sony ES Retro 3D Panels"
type: feat
status: superseded
date: 2026-03-03
deepened: 2026-03-03
reviewed: 2026-03-03
origin: docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md
---

# feat: Device Card Redesign — Sony ES Retro 3D Panels

## Enhancement Summary

**Deepened on:** 2026-03-03
**Reviewed on:** 2026-03-03 — 10 P1 corrections applied + Context7 verification
**Sections enhanced:** All 5 phases + system-wide impact
**Research agents used:** 11 (TypeScript reviewer, performance oracle, architecture strategist, frontend races reviewer, security sentinel, code simplicity reviewer, data integrity guardian, pattern recognition specialist, R3F best practices researcher, R3F accessibility researcher, R3F DnD patterns researcher)
**Context7 verified:** TanStack Query v5 cache subscriber shape, drei `useFont.preload` vs `<Text>` font loading, @react-three/a11y role support

### Critical Fixes (P0 — must address before implementation)

1. **Fake smoked glass, not MeshPhysicalMaterial transmission** — transmission adds 50-100 extra render passes. Use `MeshStandardMaterial` with `opacity: 0.85` + `envMap` reflection instead.
2. **Emissive edge strips, not PointLights per panel** — 40+ point lights destroys performance. Use emissive materials on edge geometry with bloom.
3. **DeviceState index signature** — `[key: string]: unknown` undermines all type safety. Replace with explicit `extras?: Record<string, unknown>`.
4. **Fix `device.matterId` reference** — field doesn't exist. Use `device.matterEnabled` / `device.matterEndpointId`.
5. **Sections schema fixes** — drop `mode: 'timestamp_ms'`, use plain `integer()`. Make `sectionId` `.notNull()` with auto-assign to "Home". Wrap batch position updates in `db.transaction()`.
6. **Manual spring in useFrame** — `@react-spring/three` has persistent bug #1707 with `frameloop="demand"`. Implement damped harmonic oscillator directly.
7. **Materials must be singletons** — one material instance shared across all panels to avoid duplicate shader compilations.

### Structural Improvements

- Move InstancedMesh from Phase 7 → Phase 2 (draw call reduction is foundational)
- Use `.ts` not `.tsx` for hooks and materials files (no JSX in those files)
- SSE coalescing buffer (accumulator map + 100ms flush, snapshots exempt — NOT naive debounce)
- `useRackInvalidate` must use `queryCache.subscribe()`, not `useQuery`
- Per-panel `<Suspense>` boundaries (not scene-level)
- Guard every `useFrame` with dirty-flag early exit
- `@react-three/a11y` has zustand v3 dependency — may need fork for React 19
- No `role="slider"` in a11y lib — use hidden `<input type="range">` via drei `<Html>` for knobs/faders
- Standard `<Bloom>` only, never `SelectiveBloom` (worse performance)
- `luminanceThreshold={1}` + `toneMapped={false}` on emissive materials is the correct bloom pattern

### P1 Review Corrections (applied 2026-03-03)

Corrections from technical review (10 P1 findings, verified against Context7 docs):

1. **Server-side section auto-assignment** — sectionId assigned at INSERT time on server, not client SSE handler
2. **SSE coalescing buffer** — accumulator map + 100ms flush, NOT naive debounce. Exempt `snapshot` events
3. **fanSpeed range reconciliation** — keep 0-100 in DeviceState (existing contract), UI maps to 5 snap positions
4. **Remove position `.default(0)`** — compute `MAX(position) + 1` at insert time to prevent collisions
5. **TanStack Query v5 cache subscriber** — ✅ already correct (`event.type === 'updated'`, `event.query.queryKey[0]`)
6. **Adapter audit before index signature removal** — audit all adapters for dynamic property access first
7. **SSE snapshot metadata leak** — `sanitizeDevice()` strips metadata from snapshot AND `device:new` payloads
8. **Batch position validation** — array length ≤ 200, position ≥ 0, valid sectionId FK, no duplicate device IDs
9. **@react-three/a11y fallback plan** — concrete spike + fallback to custom DOM overlay if incompatible
10. **Fader override state machine** — confirm-on-SSE-match (not fixed 2s timer)
11. **[Context7] `useFont.preload` fix** — `useFont.preload()` is for `Text3D` (THREE.Font), NOT `<Text>` (troika). Use `characters` prop on `<Text>` instead

### Simplification Opportunities (consider during implementation)

- Build only LightFace + AirPurifierFace + GenericFace for MVP (defer Thermostat, Switch)
- Auto-assign new devices to "Home" section instead of mandatory dialog
- Start with 3-step DnD (idle → drag with lerp → drop with snap), add choreography later
- Inline single-use controls (VUBar, TransportButtons can start as inline code)

---

## Overview

Replace the entire dashboard device card system with React Three Fiber 3D panels styled after Sony ES-series rack equipment. Single Canvas rendering all devices as uniform champagne gold brushed-metal panels with smoked glass readouts, rotary knobs, horizontal faders, VU meters, and transport buttons. User-defined sections with rack bay filler panels. 3D drag-and-drop for reordering. Full-control detail dialogs that animate out of the rack.

This is a full breaking change on the dashboard UI. No migration path from the current HTML cards — they are replaced entirely.

(see brainstorm: `docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md`)

## Problem Statement

The current device cards are flat HTML+CSS components grouped by brand. They lack:
- Visual cohesion across device types (each card body is different)
- Direct controls on the card surface (most require navigating to a detail view)
- User-defined organization (hard-coded brand grouping, no reordering)
- Air purifier metrics (PM2.5, filter life, AQ level not surfaced)
- A distinctive, memorable aesthetic

The redesign solves all of these with a uniform 3D rack system where every device shares the same chassis but exposes type-appropriate controls directly on the faceplate.

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Dashboard Route (index.tsx)                     │
│  ┌───────────────────────────────────────────┐  │
│  │  <Canvas frameloop="demand">              │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  <RackScene>                        │  │  │
│  │  │    <Environment preset="studio" />  │  │  │
│  │  │    <RackLighting />                 │  │  │
│  │  │                                     │  │  │
│  │  │    sections.map(section =>          │  │  │
│  │  │      <SectionFiller />              │  │  │
│  │  │      devices.map(device =>          │  │  │
│  │  │        <A11y>                       │  │  │
│  │  │          <DevicePanel>              │  │  │
│  │  │            <LightFace />            │  │  │
│  │  │            — or —                   │  │  │
│  │  │            <AirPurifierFace />      │  │  │
│  │  │            — or —                   │  │  │
│  │  │            <GenericFace />          │  │  │
│  │  │          </DevicePanel>             │  │  │
│  │  │        </A11y>                      │  │  │
│  │  │      )                              │  │  │
│  │  │    )                                │  │  │
│  │  │    <RackUtilityPanel />             │  │  │
│  │  │                                     │  │  │
│  │  │    <EffectComposer>                 │  │  │
│  │  │      <Bloom />                      │  │  │
│  │  │    </EffectComposer>                │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│  <A11yAnnouncer />                               │
│  <DetailDialog />  (HTML overlay)                │
└─────────────────────────────────────────────────┘
```

**Data flow**: SSE → `useDeviceStream` coalescing buffer (100ms flush, snapshots bypass) → React Query cache → R3F components read via `useQuery` → Three.js materials update imperatively via refs. `frameloop="demand"` + `invalidate()` on state changes keeps GPU idle when nothing changes.

### Research Insights: Architecture

**RackScene split** (architecture review): Split into outer `RackSceneShell` (DOM context — Canvas, ErrorBoundary, A11yAnnouncer) and inner `RackSceneContent` (Canvas context — lighting, panels, effects). This prevents DOM-level concerns from leaking into the render loop.

**No Zustand** (architecture review): Do NOT introduce Zustand for R3F state. React Query is the correct single source of truth. The only mutable refs should be animation state inside `useFrame`.

**ErrorBoundary** (architecture review): Wrap `<Canvas>` in an ErrorBoundary in Phase 2, not as polish. WebGL context loss and R3F crashes need graceful degradation from the start.

**Canvas sizing** (architecture review): Use page-height Canvas (Canvas sized to content height via CSS) — simpler than drei `<ScrollControls>`, avoids scroll-within-scroll UX issues.

### Implementation Phases

---

#### Phase 1: Foundation (Schema + API + Dependencies)

Server-side schema changes, new API endpoints, client dependency installation. No UI changes yet — just the plumbing.

##### 1.1 Schema Changes

**File: `server/src/db/schema.ts`**

Add `sections` table:
```ts
export const sections = sqliteTable('sections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
})
```

Add columns to `devices` table:
```ts
sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'restrict' }),
position: integer('position').notNull(), // NO .default(0) — compute MAX(position)+1 at insert time
```

**Position assignment** (P1-4): Do NOT use `.default(0)` — multiple devices inserted with position 0 creates ordering collisions. Server must compute `MAX(position) + 1` within the target section at insert time. This applies to both discovery flows and the add-from-scan endpoint.

**Default section seeding**: On server startup, if no sections exist, insert a default "Home" section with deterministic ID `'home'` using `onConflictDoNothing()`. This ensures the section assignment always has at least one option.

Add `pm25` and `filterLife` to `DeviceState` in `server/src/integrations/types.ts`:
```ts
pm25?: number        // ug/m3
filterLife?: number  // 0-100 percentage
```

**DeviceState index signature fix** (P0): Replace `[key: string]: unknown` with explicit `extras?: Record<string, unknown>`. The index signature undermines all type narrowing — any property access on DeviceState returns `unknown`, defeating type safety.

**Adapter audit prerequisite** (P1-6): Before removing the index signature, audit ALL adapters (Hue, Elgato, Govee, VeSync) for dynamic property assignment patterns. The VeSync adapter currently uses `state.humidity = r.filter_life` as a hack (line 293) — this must be migrated to the new `filterLife` field first. Any adapter writing to arbitrary string keys must be updated to use named fields or `extras`.

Run `bun run db:push` — fresh start, no migration needed.

##### Research Insights: Schema

**Data integrity** (data integrity review):
- `sectionId` MUST be `.notNull()` — nullable FK creates an "unsorted" twilight zone. Auto-assign to "Home" at insert time instead.
- `createdAt` must use plain `integer()`, not `mode: 'timestamp_ms'` — the existing schema uses raw integers for timestamps; mixing modes creates inconsistency.
- Add `updatedAt` column to sections for cache invalidation and conflict detection.
- Section `name` should have a `.unique()` constraint to prevent duplicate section names.
- Default `position: 0` creates collisions when multiple devices are added — compute `MAX(position) + 1` at insert time.
- Use deterministic ID `'home'` for the seed section with `onConflictDoNothing()` to prevent race conditions.
- Add composite index `(sectionId, position)` for efficient position queries.

**Pattern consistency** (pattern recognition review):
- Plan references `device.matterId` but that field doesn't exist — should be `device.matterEnabled` (boolean) and/or `device.matterEndpointId` (nullable text).
- Missing `Section` and `NewSection` type exports from schema.
- Missing `Section` re-export in `client/src/types.ts`.
- Missing `.use(sectionsController)` registration in server app.

##### 1.2 Sections Controller

**New file: `server/src/routes/sections.controller.ts`**

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/sections` | GET | — | List all sections ordered by position |
| `/api/sections` | POST | `{ name }` | Create section, auto-position at end |
| `/api/sections/:id` | PATCH | `{ name?, position? }` | Rename or reorder |
| `/api/sections/:id` | DELETE | — | Delete (must be empty) |

**Security** (security review):
- Section name validation: `maxLength(50)`, character pattern `[a-zA-Z0-9 _-]`, trim whitespace. Prevents XSS via section name injection into 3D text.
- Batch position endpoint (P1-8): Full input validation required:
  - Array length ≤ 200 items (reject larger payloads)
  - Each item: `id` is non-empty string, `sectionId` is non-empty string, `position` is integer ≥ 0
  - No duplicate device IDs in the batch array
  - All `sectionId` values must reference existing sections (FK check before update)
  - All `id` values must reference existing devices (reject phantom IDs)
  - Wrap entire batch in `db.transaction()` — validates all, then applies all

**File: `server/src/routes/devices.controller.ts`**

Add endpoint:
| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/devices/:id/position` | PATCH | `{ sectionId, position }` | Update device placement (DnD persistence) |
| `/api/devices/positions` | PATCH | `[{ id, sectionId, position }]` | Batch update positions (section reorder moves all devices) |

**Data integrity** (data integrity review): Batch position update MUST be wrapped in `db.transaction()`. Without it, a crash mid-batch leaves position assignments inconsistent. Single-device PATCH is fine outside a transaction.

Update `GET /api/devices` to include `sectionId` and `position` in response.

##### 1.2b SSE New Device Event

**File: `server/src/integrations/types.ts`** — add `'device:new'` to `DeviceEvent` type.

**Server-side auto-assignment** (P1-1): When inserting a new device row, the SERVER must assign `sectionId` to the "Home" section and compute `position = MAX(position) + 1` within that section. Do NOT rely on client-side SSE handlers for assignment — if the client is disconnected, new devices would have no section.

**File: `server/src/routes/devices.controller.ts`** — in `add-from-scan` and discovery flows:
1. Look up the "Home" section ID (deterministic `'home'`)
2. Compute `MAX(position) + 1` for devices in the Home section
3. Insert device row with `sectionId` and `position` set
4. Emit `device:new` event (not `device:update`) with sanitized device payload (metadata stripped)

**File: `client/src/hooks/useDeviceStream.ts`** — handle `device:new` event type. When received, append to devices cache and show toast (sonner): "New device discovered: [name]". No client-side assignment logic — server already assigned section+position.

**Race condition** (frontend races review): Multiple `device:new` SSE events can arrive in rapid succession during discovery. The coalescing buffer (see Phase 2.9) handles this automatically — multiple new-device events within the 100ms window are batched into a single cache update.

**Client types** (TypeScript review): Add `DeviceNewEvent` variant to the SSEEvent discriminated union in `client/src/types.ts`.

**SSE metadata leak** (P1-7): Create `sanitizeDevice()` helper in `server/src/lib/sanitize.ts` — strips `metadata` field from device payloads. Apply to:
1. `device:new` SSE event payload
2. SSE snapshot (`events.controller.ts` line 38 — currently sends full `db.select().from(devices).all()` including metadata)
3. Any `device:update` events that include full device objects

```ts
// server/src/lib/sanitize.ts
export function sanitizeDevice<T extends { metadata?: unknown }>(device: T): Omit<T, 'metadata'> {
  const { metadata: _metadata, ...safe } = device
  return safe
}
```

##### 1.3 VeSync Adapter — Air Purifier Metrics

**File: `server/src/integrations/vesync/adapter.ts`**

Update `getState` to parse and return:
- `pm25` from `air_quality_value`
- `filterLife` from `filter_life` (remove the `humidity` hack at line 293)
- `fanSpeed` stays as 0-100 range (existing contract — see reconciliation below)
- `airQuality` derived separately as level (1-4) based on PM2.5 thresholds

**TypeScript** (TypeScript review): `air_quality_value` currently maps to both `airQuality` (which implies a level) and could be confused with `pm25` (which is a raw number). Derive `airQuality` from PM2.5 value using WHO thresholds: 1 (good, <12), 2 (moderate, 12-35), 3 (unhealthy, 35-55), 4 (very unhealthy, >55).

**fanSpeed range reconciliation** (P1-3): The DeviceState contract defines `fanSpeed` as 0-100. The VeSync adapter already normalizes correctly: `fan_level * 20` (1-5 → 20/40/60/80/100) on read, `Math.round(fanSpeed / 20)` on write (line 538). Do NOT change this to raw 1-3 — it would break the existing contract and any client code using the 0-100 range. Instead:
- **Server**: Keep `fanSpeed` as 0-100 in DeviceState (no change to adapter)
- **UI (RotaryKnob)**: Map 0-100 to 5 snap positions: Auto(0) / Sleep(20) / Low(40) / Med(60) / High(80/100). The knob's `onChange` emits the corresponding 0-100 value
- **Rationale**: VeSync Levoit Core series has 1-5 levels; other brands may have different ranges. 0-100 is the universal normalization layer

##### 1.4 Client Dependencies

```bash
cd client && bun add three @react-three/fiber @react-three/drei @react-three/a11y @react-three/postprocessing postprocessing web-haptics && bun add -d @types/three
```

**@react-three/a11y compatibility** (P1-9, verified via Context7): `@react-three/a11y` v3.0.0 (last release May 2022) has critical compatibility concerns:
- **zustand v3 dependency**: Uses `import create from 'zustand'` — breaks with zustand v5 (current). Pin `zustand@^3.7.2` or fork.
- **React 19 StrictMode**: Crash on mount (issue #52) — not fixed upstream.
- **Limited roles**: Only `role="content"` and `role="button"` documented (Context7). No `role="slider"` — faders/knobs MUST use hidden `<input type="range">` via drei `<Html>`.

**Concrete spike plan**: In Phase 2 (before building controls), run a compatibility spike:
1. Install `@react-three/a11y` with `zustand@^3.7.2` peer dependency
2. Test `<A11y role="button">` + `<A11yAnnouncer>` in React 19 StrictMode
3. Verify `useA11y()` hook returns `{ focus, hover, pressed }` correctly

**Fallback if spike fails**: Replace `@react-three/a11y` with a custom DOM overlay approach:
- Hidden `<div>` layer positioned over the Canvas with `pointer-events: none`
- For each panel, render an absolutely-positioned focusable `<div>` with `role="group"` and `aria-label`
- Power buttons get `<button>` elements, faders get `<input type="range">`
- Use `pointer-events: auto` on interactive elements only
- Sync focus state to R3F via a shared ref (focus ring renders in 3D via `<Outlines>`)
- This is more work but has zero dependency risk

##### 1.5 Font Registration

**File: `client/src/index.css`** — add `@font-face` declarations:
```css
@font-face {
  font-family: 'Michroma';
  src: url('/fonts/Michroma-Regular.ttf') format('truetype');
  font-display: swap;
}
@font-face {
  font-family: 'DSEG7';
  src: url('/fonts/DSEG7Classic-Regular.ttf') format('truetype');
  font-display: swap;
}
```

Fonts already in `client/public/fonts/` (Michroma-Regular.ttf, DSEG7Classic-Regular.ttf).

**Font loading** (Context7 verified): `useFont.preload()` is for `Text3D` (THREE.FontLoader / `.typeface.json`), NOT for drei `<Text>` (troika-3d-text / `.ttf`). The `<Text>` component handles its own font loading via Suspense. To reduce SDF atlas size and avoid FOUC, pass the `characters` prop on each `<Text>` component:
```tsx
<Text font="/fonts/Michroma-Regular.ttf" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-_%/:°">
  {label}
</Text>
<Text font="/fonts/DSEG7Classic-Regular.ttf" characters="0123456789.-:°% ">
  {value}
</Text>
```
Wrap each `<Text>` usage in per-panel `<Suspense>` boundaries (Phase 2.5) so font loading doesn't blank the entire scene.

**Acceptance criteria:**
- [ ] `sections` table exists with id, name, position, createdAt, updatedAt
- [ ] `devices` table has sectionId (FK, notNull) and position columns
- [ ] `DeviceState` has `pm25` and `filterLife` optional fields, no `[key: string]: unknown`
- [ ] VeSync adapter populates pm25, filterLife, fanSpeed (0-100 normalized), derived airQuality
- [ ] VeSync adapter removes `humidity = filter_life` hack (migrated to `filterLife` field)
- [ ] All 5 section endpoints work via Eden Treaty
- [ ] Section name validation rejects invalid characters and enforces maxLength
- [ ] Device position PATCH endpoint works, batch PATCH uses db.transaction()
- [ ] Default "Home" section seeded on startup (deterministic ID `'home'`, `onConflictDoNothing()`)
- [ ] New devices auto-assigned to "Home" section at server INSERT time (MAX+1 position)
- [ ] `sanitizeDevice()` strips metadata from SSE snapshot AND `device:new` payloads
- [ ] Adapter audit complete — all dynamic property access migrated before removing `[key: string]: unknown`
- [ ] R3F dependencies installed, TypeScript types resolve
- [ ] @react-three/a11y compatibility spike passes (or fallback plan activated)
- [ ] `bun run system:check --force` passes

---

#### Phase 2: R3F Scene Shell + InstancedMesh Foundation

The Canvas, scene lighting, chassis component, grid layout, and instanced geometry. Renders placeholder panels to validate the 3D pipeline end-to-end.

##### 2.1 Directory Structure

```
client/src/components/r3f/
  RackSceneShell.tsx        — ErrorBoundary + Canvas wrapper (DOM context)
  RackSceneContent.tsx      — scene config, camera, lighting (Canvas context)
  DevicePanel.tsx           — uniform 3D chassis (RoundedBox, screws, materials)
  SectionFiller.tsx         — half-height section divider panel
  RackUtilityPanel.tsx      — bottom utility panel (+, gear)
  controls/
    RotaryKnob.tsx          — reusable 3D knob with snap positions
    HorizontalFader.tsx     — reusable fader with notched track
    VUBar.tsx               — segmented VU meter bar
    TransportButtons.tsx    — cassette-style mode push-keys
    PowerLED.tsx            — green LED with bloom
    ExpandButton.tsx        — recessed circular push-button (◎)
    ToggleSwitch.tsx        — mechanical 3D toggle
    ReadoutWindow.tsx       — smoked glass display with DSEG7 text
  faces/
    LightFace.tsx           — light card face layout
    AirPurifierFace.tsx     — air purifier face layout
    GenericFace.tsx         — fallback for all other types
  dialogs/
    DetailDialog.tsx        — expand animation + dialog container
    LightDetail.tsx         — full light controls (color wheel, faders)
    AirPurifierDetail.tsx   — full purifier controls
  hooks/
    usePanelDrag.ts         — 3D drag interaction (grip zone, lift, slide)
    useGridLayout.ts        — compute panel positions from sections + devices
    useRackInvalidate.ts    — bridge SSE updates to R3F invalidate()
    useSpring3D.ts          — manual damped spring for animations
  materials.ts              — ALL shared material configs (singletons)
  constants.ts              — dimensions, colors, spring configs
```

**File extensions** (TypeScript review): Hooks and materials files use `.ts` not `.tsx` — they contain no JSX. Only face/control/scene files that render JSX use `.tsx`.

##### 2.2 Materials (Singletons)

**File: `client/src/components/r3f/materials.ts`**

All materials MUST be module-level singletons. Creating materials per component causes duplicate shader compilations — the #1 hidden performance cost in R3F scenes.

```ts
import * as THREE from 'three'

// champagne gold brushed metal — shared by ALL panel chassis
export const chassisMaterial = new THREE.MeshStandardMaterial({
  color: '#c4a265',
  roughness: 0.35,
  metalness: 0.8,
  envMapIntensity: 0.6,
})

// fake smoked glass — MeshStandardMaterial, NOT MeshPhysicalMaterial
// MeshPhysicalMaterial transmission adds 50-100 extra render passes per mesh
export const glassMaterial = new THREE.MeshStandardMaterial({
  color: '#1a1a1a',
  transparent: true,
  opacity: 0.85,
  roughness: 0.05,
  metalness: 0.3,
  envMapIntensity: 0.8,
})

// gunmetal for knobs, faders, screws
export const knobMaterial = new THREE.MeshStandardMaterial({
  color: '#3a3a3a',
  roughness: 0.4,
  metalness: 0.9,
})
```

**Performance** (performance oracle): Materials MUST be singletons. R3F auto-disposes materials on unmount — use `dispose={null}` on meshes sharing these materials, or manage lifecycle manually.

##### 2.3 RackSceneShell + RackSceneContent

**File: `client/src/components/r3f/RackSceneShell.tsx`** (DOM context)

```tsx
<ErrorBoundary fallback={<HTMLFallbackDashboard />}>
  <Canvas
    frameloop="demand"
    dpr={[1, 2]}
    camera={{ position: [0, 0, 10], fov: 45 }}
    gl={{ antialias: true }}
    style={{ background: '#1a1612', touchAction: 'none' }}
    performance={{ min: 0.5 }}
  >
    <Suspense fallback={null}>
      <RackSceneContent ... />
    </Suspense>
  </Canvas>
  <A11yAnnouncer />
</ErrorBoundary>
```

**File: `client/src/components/r3f/RackSceneContent.tsx`** (Canvas context)

```tsx
<RackLighting />
<Environment preset="studio" background={false} environmentIntensity={0.3} />
{/* panels rendered here, each with per-panel Suspense */}
<EffectComposer>
  <Bloom mipmapBlur luminanceThreshold={1} intensity={1.5} />
</EffectComposer>
```

Key decisions:
- `frameloop="demand"` — GPU idles until SSE state update triggers `invalidate()`
- `dpr={[1, 2]}` — retina support, capped at 2x
- `performance={{ min: 0.5 }}` — auto-downsample under load
- `touchAction: 'none'` on canvas — prevents browser scroll interference during touch drag
- Dark walnut background via CSS on the canvas element
- `luminanceThreshold={1}` — only materials with `emissiveIntensity > 1` and `toneMapped={false}` will bloom. Standard `<Bloom>`, never `SelectiveBloom` (worse performance).

##### 2.4 RackLighting

**File: `client/src/components/r3f/RackLighting.tsx`**

- Warm key directional light (~3200K, `#ffcc88`) from upper-left, intensity ~1.2
- Soft fill from lower-right, intensity ~0.3
- Ambient light, intensity ~0.15 (just enough to read labels in shadow areas)
- Contact shadows or AO via Environment map

**Performance** (performance oracle): NO PointLights per panel edge. Use emissive edge strips with bloom instead. PointLights are O(n) per fragment — 40+ lights in a scene will tank frame rate.

##### 2.5 DevicePanel (Chassis)

**File: `client/src/components/r3f/DevicePanel.tsx`**

The uniform chassis shared by ALL device types. Props: `device`, `position`, `onStateChange`, `onExpand`.

Structure:
- `<RoundedBox>` — main body, uses shared `chassisMaterial`
- Corner screws — InstancedMesh (see 2.6)
- Recessed display window area — inset geometry with shared `glassMaterial`
- Power LED — left of device name (green emissive sphere with bloom)
- Expand button — top-right recessed circular button (◎)
- Device name — drei `<Text>` with Michroma font, embossed look (etched champagne color)
- Face slot — children prop renders per-type face layout

**Offline device treatment**: When `device.online === false`, the panel chassis drops to lower opacity (~0.6), the power LED goes dark (no emissive), the display window shows dim text only (no glow), and all controls are non-interactive (pointer events disabled on faders/knobs). The panel is still visible and positioned in the grid — it doesn't disappear.

**Sensor devices (no power state)**: Sensors have no on/off toggle. The PowerLED component is hidden (not rendered) for devices where power control doesn't apply. The expand button still works.

**Empty state (no devices)**: If no devices exist, render the Canvas with the dark walnut background, the default "Home" section filler panel, and the rack utility panel. No placeholder device panels.

Font rendering uses drei `<Text>` (troika-3d-text). Pass `characters` prop on each `<Text>` component to limit SDF atlas and prevent FOUC (see Phase 1.5). No module-level `useFont.preload` — that API is for `Text3D`, not `<Text>`.

**Per-panel Suspense** (frontend races review): Wrap each `<DevicePanel>` in its own `<Suspense>` boundary, not a single scene-level Suspense. This prevents font preload delays from blanking the entire scene — panels render progressively as their fonts resolve.

##### 2.6 Instanced Geometry (Screws)

**Moved from Phase 7 → Phase 2** (performance oracle): Draw call reduction is foundational, not polish. 4 screws × N panels = 4N draw calls without instancing.

```tsx
import { Instances, Instance } from '@react-three/drei'

// in RackSceneContent, one Instances block for ALL screws
<Instances limit={200} material={knobMaterial}>
  <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
  {panels.flatMap(panel =>
    SCREW_OFFSETS.map((offset, i) => (
      <Instance
        key={`${panel.id}-screw-${i}`}
        position={[panel.x + offset[0], panel.y + offset[1], panel.z + 0.01]}
      />
    ))
  )}
</Instances>
```

##### 2.7 Grid Layout

**Hook: `client/src/components/r3f/hooks/useGridLayout.ts`**

Computes 3D positions for all panels from sections + devices data:
- Fixed aspect ratio panels (e.g., 3:2 → 2.4 × 1.6 units)
- Responsive columns (viewport width → 1/2/3/4 columns)
- Section filler panels span full row width
- Gap between panels ~0.2 units
- Rack utility panel always last

**TypeScript** (TypeScript review): Return type should use a discriminated union:
```ts
type GridItem =
  | { type: 'device'; id: string; position: [number, number, number]; device: Device }
  | { type: 'section'; id: string; position: [number, number, number]; section: Section }
  | { type: 'utility'; id: 'utility'; position: [number, number, number] }
```

##### 2.8 Dashboard Integration

**File: `client/src/routes/index.tsx`**

Replace the HTML grid with:
```tsx
<RackSceneShell
  devices={devices}
  sections={sections}
  onStateChange={stateMutation.mutate}
  onExpand={setExpandedDevice}
/>
```

Add sections query:
```ts
const { data: sections } = useQuery({
  queryKey: ['sections'],
  queryFn: async () => {
    const { data, error } = await api.api.sections.get()
    if (error) throw error
    return data
  },
})
```

##### 2.9 SSE → R3F Invalidation Bridge

**Hook: `client/src/components/r3f/hooks/useRackInvalidate.ts`**

With `frameloop="demand"`, the Canvas only renders when `invalidate()` is called.

**Implementation** (TypeScript review + architecture review): Must use `queryCache.subscribe()`, NOT `useQuery`. `useQuery` triggers React re-renders; the bridge needs to call `invalidate()` imperatively without re-rendering the hook's host component.

```ts
import { useQueryClient } from '@tanstack/react-query'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

export function useRackInvalidate() {
  const queryClient = useQueryClient()
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        (event.query.queryKey[0] === 'devices' || event.query.queryKey[0] === 'sections')
      ) {
        invalidate()
      }
    })
    return unsubscribe
  }, [queryClient, invalidate])
}
```

**SSE coalescing buffer** (P1-2, performance oracle + frontend races review): Do NOT use naive debounce — use an accumulator map + flush pattern. Multiple SSE events arriving in rapid succession must be merged, not dropped:

```ts
// coalescing buffer pattern for useDeviceStream
const pendingUpdates = useRef(new Map<string, Partial<Device>>())
const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

function enqueueUpdate(deviceId: string, patch: Partial<Device>) {
  const existing = pendingUpdates.current.get(deviceId) ?? {}
  pendingUpdates.current.set(deviceId, { ...existing, ...patch })

  if (!flushTimer.current) {
    flushTimer.current = setTimeout(() => {
      const updates = new Map(pendingUpdates.current)
      pendingUpdates.current.clear()
      flushTimer.current = null

      queryClient.setQueryData(['devices'], (prev: Device[] = []) =>
        prev.map(d => {
          const patch = updates.get(d.id)
          return patch ? { ...d, ...patch } : d
        })
      )
    }, 100) // 100ms flush window
  }
}
```

Key rules:
- `snapshot` events are EXEMPT from the buffer — apply immediately (they replace the full cache)
- `device:new` events bypass the buffer — append to cache immediately + show toast
- Only `device:update` and `device:offline` events go through the coalescing buffer
- Multiple updates to the same device within the window are merged (last write wins per field)

**useFrame guard** (performance oracle): Every `useFrame` callback MUST check a dirty flag and early-return when there's nothing to animate. Otherwise `invalidate()` triggers a frame that runs ALL useFrame callbacks even if only one panel changed.

**Acceptance criteria:**
- [ ] ErrorBoundary wraps Canvas with HTML fallback
- [ ] Single Canvas renders on the dashboard with dark walnut background
- [ ] Warm studio lighting visible on panels
- [ ] DevicePanel chassis renders with shared singleton chassisMaterial
- [ ] Corner screws use InstancedMesh (single draw call for all screws)
- [ ] Device names render in Michroma font with preloaded character set
- [ ] Panels arranged in responsive grid by section
- [ ] Power LED glows green for online devices (with bloom via `toneMapped={false}`)
- [ ] Power LED hidden for sensor devices (no power state)
- [ ] Offline devices show dimmed panel (opacity ~0.6, dark LED, no glow)
- [ ] Expand button visible on each panel
- [ ] Empty state: Canvas with section filler + utility panel only
- [ ] `frameloop="demand"` — GPU idle when no state changes
- [ ] SSE device updates via coalescing buffer (100ms flush, snapshots bypass) trigger `invalidate()`
- [ ] Per-panel Suspense boundaries prevent scene-wide blank during font load
- [ ] Materials are module-level singletons (not per-component)
- [ ] All `.ts` files have no JSX, all `.tsx` files have JSX

---

#### Phase 3: Device Face Panels

Per-type face layouts with interactive controls. Each face is a child of DevicePanel, rendered inside the chassis.

##### 3.1 Reusable Controls

Build these first — they're shared across face types:

**ReadoutWindow** (`controls/ReadoutWindow.tsx`):
- Recessed geometry (inset ~2mm)
- Shared `glassMaterial` (MeshStandardMaterial, NOT MeshPhysicalMaterial)
- DSEG7 text behind glass (emissive warm cream `#faf0dc`, `toneMapped={false}`, `emissiveIntensity > 1`)
- Props: `value: string`, `position`, `width`, `height`

**HorizontalFader** (`controls/HorizontalFader.tsx`):
- Recessed channel geometry with etched notch marks (Michroma font for scale labels)
- Gunmetal thumb handle (draggable along X-axis via pointer events)
- Props: `value: number`, `min`, `max`, `step`, `notches: Array<{value, label}>`, `onChange`
- Optional: `illuminated: boolean` — track emissive for brightness/CCT gradient
- Drag: `onPointerDown` → `setPointerCapture` → `onPointerMove` clamps to track bounds → `onPointerUp` → fires `onChange`
- **Accessibility** (R3F accessibility research): Add hidden `<input type="range">` via drei `<Html>` for screen reader access. `@react-three/a11y` has NO `role="slider"` support. Use visually-hidden input with `aria-label`, `aria-valuenow`, `aria-valuetext`.

**RotaryKnob** (`controls/RotaryKnob.tsx`):
- Darker gunmetal cylinder with concentric grooves (normal map)
- White indicator line with emissive tip
- Snap positions via angle quantization
- Props: `value: number`, `positions: Array<{value, label}>`, `onChange`
- Drag: circular gesture — compute angle from pointer position relative to knob center
- Haptic snap: `trigger('nudge')` on each position change
- **Accessibility**: Hidden `<input type="range">` via `<Html>` with step matching snap positions

**VUBar** (`controls/VUBar.tsx`):
- Horizontal row of rectangular segments
- Each segment: emissive material, `toneMapped={false}`, `emissiveIntensity={2}`, color per level (green → amber → red)
- Lit segments glow with bloom, unlit segments are dark
- Props: `level: number` (0-4), `segments: number`

**TransportButtons** (`controls/TransportButtons.tsx`):
- Row of recessed rectangular push-keys
- Active button glows amber (emissive), others dark with embossed labels
- Props: `options: Array<{value, label}>`, `active: string`, `onChange`
- Press animation: button depresses ~1mm on click (manual spring, see useSpring3D)

**PowerLED** (`controls/PowerLED.tsx`):
- Small sphere, soft green (`#4ade80`) with `emissive`, `emissiveIntensity={2}`, `toneMapped={false}`
- Dark when off
- Clickable — toggles device power
- Props: `on: boolean`, `onToggle`

**ExpandButton** (`controls/ExpandButton.tsx`):
- Recessed circular geometry (~32px), engraved ◎ symbol
- Amber glow on hover, depresses on click
- Props: `onExpand`

**ToggleSwitch** (`controls/ToggleSwitch.tsx`):
- 3D mechanical toggle, flips up/down
- ON/OFF embossed labels
- Props: `on: boolean`, `onToggle`

##### 3.2 Light Face

**File: `client/src/components/r3f/faces/LightFace.tsx`**

Layout:
- **Top row**: PowerLED (left of name) + device name (Michroma) + ExpandButton (top-right)
- **Center-left**: Two HorizontalFaders stacked
  - Brightness: 0-100, notches at 0/25/50/75/100, track illuminated proportionally
  - CCT: 2700-6500K, notches at 2700/3500/4500/6500, track is warm→cool gradient
- **Center-right**: ReadoutWindow showing brightness % (DSEG7) + color temp K (DSEG7)
- **Reactive lighting** (Phase 5):
  - Display window emissive color = light's actual CCT
  - Edge bleed = emissive edge strips matching light color/intensity (NOT PointLights)
  - Fader track gradient emissive

State mapping:
- `device.state.brightness` → brightness fader value + readout
- `device.state.colorTemp` → CCT fader value + readout
- `device.state.on` → PowerLED state
- Fader `onChange` → `onStateChange({ brightness })` or `onStateChange({ colorTemp })`

**Fader override state machine** (P1-10, frontend races review): When user is dragging a fader, SSE updates must NOT yank the slider position. Use a confirm-on-SSE-match pattern instead of a fixed timer:

```ts
// per-fader override state
type FaderOverride =
  | { state: 'idle' }                                    // no override, follow SSE
  | { state: 'active'; sentValue: number }               // user interacting, ignore SSE
  | { state: 'confirming'; sentValue: number; timeout: ReturnType<typeof setTimeout> }
    // waiting for SSE to confirm our value

// on pointerDown → { state: 'active', sentValue: current }
// on pointerUp + onChange fires → { state: 'confirming', sentValue: submitted, timeout: 2s }
// on SSE arrives:
//   - if SSE value === sentValue → { state: 'idle' } (server confirmed our value)
//   - if SSE value !== sentValue AND state === 'confirming' → stay confirming (still waiting)
// on timeout fires → { state: 'idle' } (fallback — accept whatever SSE says)
```

This prevents the 2-second blind spot where the fader ignores ALL SSE updates even if the server confirms the value instantly. The fader returns to SSE-following as soon as the server echoes back the submitted value.

##### 3.3 Air Purifier Face

**File: `client/src/components/r3f/faces/AirPurifierFace.tsx`**

Layout:
- **Top row**: PowerLED + name + ExpandButton
- **Center-left**: ReadoutWindow showing PM2.5 value (DSEG7, e.g., "12")
- **Center**: VUBar showing AQ level (4 segments, green→amber→red)
- **Center-right**: RotaryKnob with 5 snap positions mapping to fanSpeed 0-100: Auto(0) / Sleep(20) / Low(40) / Med(60) / High(80)
- **Bottom**: Filter life thin bar spanning full width + percentage label

State mapping:
- `device.state.pm25` → PM2.5 readout
- `device.state.airQuality` → VU bar level (1-4)
- `device.state.mode` → knob position
- `device.state.fanSpeed` → knob position (if no mode)
- `device.state.filterLife` → filter bar width + label
- `device.state.on` → PowerLED

##### 3.4 Generic Face (Fallback)

**File: `client/src/components/r3f/faces/GenericFace.tsx`**

For ALL device types without a dedicated face (thermostat, switch, vacuum, media, appliance, fridge, sensor):
- **Top row**: PowerLED + name + ExpandButton
- **Center**: ReadoutWindow showing device type label + primary state value
- If device has `on` state: ToggleSwitch below readout
- Falls back gracefully — better to have a panel with limited info than no panel

**Simplification** (simplicity review): MVP builds only LightFace + AirPurifierFace + GenericFace. ThermostatFace and SwitchFace are deferred — GenericFace handles them adequately. Add dedicated faces when user feedback demands it.

**Face dispatch** (TypeScript review): Use a discriminated union or simple switch, not a registry object:
```ts
function getFaceComponent(type: DeviceType) {
  switch (type) {
    case 'light': return LightFace
    case 'air_purifier': return AirPurifierFace
    default: return GenericFace
  }
}
```

**Acceptance criteria:**
- [ ] All reusable controls render correctly with shared singleton materials
- [ ] HorizontalFader drag works (pointer capture, clamped to track bounds)
- [ ] HorizontalFader has hidden `<input type="range">` for screen reader access
- [ ] RotaryKnob circular drag with snap positions + haptic feedback
- [ ] VUBar segments glow with bloom (emissiveIntensity > 1, toneMapped={false})
- [ ] TransportButtons active state glows amber, press animation uses manual spring
- [ ] Light face: brightness + CCT faders control device state via API
- [ ] Light face: fader override state machine (confirm-on-SSE-match) prevents SSE yanking during interaction
- [ ] Air purifier face: PM2.5 readout, VU bar, mode knob all display correct values
- [ ] Generic face: renders for all device types with power toggle if applicable
- [ ] DSEG7 font renders in readout windows behind fake smoked glass
- [ ] Michroma font renders for all panel labels
- [ ] State changes optimistic (immediate visual feedback, SSE confirms)

---

#### Phase 4: Sections & Organization + Drag-and-Drop

Section filler panels, section management, rack utility panel, new device placement, and full DnD interaction.

##### 4.1 Section Filler Panel

**File: `client/src/components/r3f/SectionFiller.tsx`**

- Half-height panel, same shared `chassisMaterial`
- Section name in Michroma, embossed small-caps, letter-spaced
- Subtle horizontal vent pattern (normal map or geometry)
- Spans full row width
- Clickable name text → inline editing (drei `<Text>` swapped for an HTML input overlay positioned via CSS `pointer-events`)
- Draggable (same grip zone as device panels — uses corner screws)

##### 4.2 Rack Utility Panel

**File: `client/src/components/r3f/RackUtilityPanel.tsx`**

- Always last in the rack
- Same chassis, slightly darker tint
- "+" recessed push-button → creates new section (POST /api/sections)

##### 4.3 New Device Auto-Assignment

Triggered by `device:new` SSE event (added in Phase 1.2b). The SERVER already assigned the device to the "Home" section with a computed position (P1-1, see Phase 1.2b). The client simply appends the new device to its cache and shows a toast (sonner): "New device discovered: [name]."

User can drag devices between sections after discovery — no mandatory assignment dialog.

**Simplification** (simplicity + architecture review): The mandatory section assignment dialog adds complexity for minimal value. Server-side auto-assign to "Home" is simpler and lets users organize at their own pace via drag-and-drop.

##### 4.4 useSpring3D Hook

**File: `client/src/components/r3f/hooks/useSpring3D.ts`**

Manual damped harmonic oscillator for ALL animations. Do NOT use `@react-spring/three` — it has persistent bug #1707 with `frameloop="demand"`.

```ts
// damped spring per axis:
// force = -stiffness * (position - target) - damping * velocity
// velocity += force * dt
// position += velocity * dt
// clamp dt to 0.064 to avoid instability after tab switches
// snap when displacement < 0.001 && speed < 0.001
```

Frame-rate independent damping alternative (simpler, no oscillation):
```ts
position = position + (target - position) * (1 - Math.exp(-speed * delta))
```

Spring config presets:
```ts
export const SPRING = {
  snappy:     { stiffness: 300, damping: 30, mass: 1 },    // no bounce
  gentle:     { stiffness: 120, damping: 26, mass: 1.5 },  // slow slide
  microBounce: { stiffness: 250, damping: 16, mass: 0.8 }, // drop settle
  springyLift: { stiffness: 200, damping: 12, mass: 0.6 }, // panel lift
}
```

##### 4.5 usePanelDrag Hook

**File: `client/src/components/r3f/hooks/usePanelDrag.ts`**

**Drag implementation** (R3F DnD research): Use raw pointer capture with `THREE.Plane` intersection, not drei `DragControls`. Drei DragControls is designed for free-form positioning; grid reorder needs custom slot computation.

Core pattern:
1. `onPointerDown` → `setPointerCapture(e.pointerId)`, compute drag plane at panel Z, store offset between intersection and panel center
2. `onPointerMove` → `e.ray.intersectPlane(dragPlane, intersection)`, add offset, update panel position directly via ref
3. `onPointerUp` → `releasePointerCapture`, snap to nearest grid slot, persist position

**Simplified choreography** (simplicity review — start with 3 steps, add polish later):
1. **Idle**: No visual indicator
2. **Drag**: Panel lifts Z ~4mm (spring), follows pointer with exponential damping, neighbors shuffle via spring animation to make room
3. **Drop**: Panel settles into slot with micro-bounce spring, persist via `PATCH /api/devices/positions`

**Cancellation**: Escape key or releasing before crossing a section boundary → spring back to original position.

**Touch safety** (R3F DnD research): Guard against multi-touch — R3F `setPointerCapture` doesn't support multiple active pointers. Track `activePtrRef` and ignore events from other fingers.

**Race conditions** (frontend races review):
- **RACE 1 (HIGH)**: SSE during drag — freeze layout snapshot at drag start. Don't apply position changes from SSE while dragging. Restore subscription on drop.
- **RACE 7 (HIGH)**: Section delete mid-drag — freeze sections list at drag start, validate drop target still exists on drop. If deleted, cancel drag and return to original position.

**State machine** (architecture review): Model drag as a `useReducer` with discriminated union phases:
```ts
type DragPhase =
  | { type: 'idle' }
  | { type: 'pressing'; pointerId: number; startTime: number }
  | { type: 'dragging'; pointerId: number; originSlot: number; frozenLayout: GridItem[] }
  | { type: 'settling'; targetSlot: number }
```

Props: `deviceId`, `currentPosition`, `sectionId`
Returns: `{ meshProps, isDragging }`

Uses `useFrame` for smooth animation (spring interpolation), never `setState` during drag.

##### 4.6 Section Reordering

Section filler panels are also draggable (same grip zone mechanic). Dragging a section filler moves the entire section (filler + all devices) as a unit. On drop, uses `PATCH /api/devices/positions` (batch endpoint) to update all device positions atomically within a `db.transaction()`.

##### 4.7 Position Persistence

On drop:
1. Optimistic update to React Query cache (`['devices']` and `['sections']`)
2. Single device move: `PATCH /api/devices/:id/position` with `{ sectionId, position }`
3. Section reorder: `PATCH /api/sections/:id` with `{ position }` + `PATCH /api/devices/positions` for all devices in affected sections
4. On error: rollback optimistic update to previous positions (stored in mutation's `onMutate`)

**Race condition** (frontend races review): Optimistic rollback must be partial — only roll back position fields, not device state. A full cache rollback would clobber SSE state updates that arrived during the mutation.

##### 4.8 Section Queries

```ts
// sections query
const { data: sections } = useQuery({
  queryKey: ['sections'],
  queryFn: async () => {
    const { data, error } = await api.api.sections.get()
    if (error) throw error
    return data
  },
})

// section mutations with optimistic updates
const createSection = useMutation({...})
const renameSection = useMutation({...})
const reorderSection = useMutation({...})
const deleteSection = useMutation({...})
```

**Acceptance criteria:**
- [ ] Section filler panels render between device groups with embossed section names
- [ ] Clicking section name enables inline editing
- [ ] Rack utility panel renders at bottom with "+" button
- [ ] "+" creates a new section (appears in rack, immediately editable)
- [ ] New device discovery auto-assigns to "Home" section with toast notification
- [ ] Manual spring animations work (useSpring3D) — no react-spring dependency
- [ ] Drag uses raw pointer capture + Plane intersection (not drei DragControls)
- [ ] Panel lifts on drag, neighbors shuffle with spring animation
- [ ] Drop: micro-bounce settle, position persisted to database
- [ ] SSE events frozen during drag (RACE 1 mitigation)
- [ ] Section delete during drag handled gracefully (RACE 7 mitigation)
- [ ] Optimistic rollback only affects position fields (not device state)
- [ ] Section filler panels draggable (moves whole section)
- [ ] Batch position updates use db.transaction()
- [ ] Touch drag works (single-finger only, multi-touch guarded)
- [ ] Sections persist to database, survive page refresh

---

#### Phase 5: Detail Dialog + Polish & Effects

Expand button triggers panel-slides-forward animation into a full-control view. Reactive lighting, bloom, haptics, accessibility.

##### 5.1 Expand Animation

**File: `client/src/components/r3f/dialogs/DetailDialog.tsx`**

Choreography:
1. Expand button depresses (click animation via useSpring3D, haptic `trigger('nudge')`)
2. Panel slides forward on Z-axis (toward viewer) and scales up (useSpring3D)
3. Background panels dim (reduce opacity / darken ambient)
4. HTML dialog fades in over the expanded panel position
5. Close: reverse animation — HTML dialog fades out, panel slides back, background restores

Implementation: **HTML overlay** (Option A). The expand animation plays in R3F (panel slides forward + dims background), then the HTML dialog fades in over it. Close reverses. This is simpler for complex controls (color wheel, text inputs) and avoids Three.js text input challenges.

Dialog styled to match rack aesthetic: champagne background, Michroma/DSEG7 fonts, amber accents.

**Race condition** (frontend races review): Route change during expand animation → use `useEffect` cleanup to cancel spring animations and dismiss dialog. Check mounted ref before state updates in animation callbacks.

##### 5.2 Per-Type Detail Dialogs

**LightDetail** (`dialogs/LightDetail.tsx`):
- Larger brightness + CCT faders (HTML sliders styled as faders)
- Color wheel for RGB-capable lights (React Aria ColorPicker, restyled)
- Power toggle
- Matter bridge toggle (see 5.4)

**AirPurifierDetail** (`dialogs/AirPurifierDetail.tsx`):
- Full-size VU meter with segment labels
- PM2.5 + AQ level readout (larger)
- Mode/fan knob (HTML-styled rotary or button group)
- Filter life bar with percentage
- Power toggle
- Matter bridge toggle

##### 5.3 Matter Bridge Toggle

All detail dialogs include a **Matter bridge toggle** — a small switch at the bottom of the dialog that controls whether this device is exposed to the Matter bridge (and thus visible to Apple Home, Google Home, etc.). Styled as a miniature rack toggle with "MATTER" label in Michroma. Reads `device.matterEnabled` (boolean) to determine state. Calls the existing Matter API endpoint to include/exclude.

This is the only place the Matter toggle lives — not on the compact card face (too noisy for the faceplate aesthetic).

##### 5.4 LightMultiSelectBar Disposition

The current `LightMultiSelectBar` (HTML floating bar for batch light operations) is **removed** in this redesign. Batch operations don't fit the single-panel rack metaphor. If batch control is needed later, it can be re-introduced as a rack utility panel feature or a section-level action.

##### 5.5 Reactive Lighting (Light Panels)

**Display window glow**: ReadoutWindow emissive color derived from `device.state.colorTemp` using `tempToColor()` (adapt from `client/src/lib/color-utils.ts:24-42` for Three.js Color). Emissive intensity proportional to `device.state.brightness`. Light off = intensity 0, faint text only.

**Fader track illumination**: Brightness fader track emissive from left edge to thumb position. CCT fader track uses a gradient texture (warm amber → cool white).

**Edge light bleed**: Emissive edge strips (thin geometry at panel edges) with color = light's CCT mapped to RGB, emissive intensity proportional to brightness. Combined with Bloom, this creates the ambient cross-panel illumination effect WITHOUT PointLights.

##### 5.6 Bloom Post-Processing

Already set up in Phase 2. Ensure all glowing elements use:
- `emissiveIntensity > 1` + `toneMapped={false}`
- Power LEDs, VU segments, active transport buttons, readout text, fader track illumination, edge strips

**Performance** (performance oracle + R3F performance research):
- NEVER use `SelectiveBloom` — it's slower than standard `<Bloom>` on all benchmarks
- Use `luminanceThreshold={1}` so only intentionally bright materials bloom
- Mobile: reduce bloom resolution to 128px, desktop: 256px
- Low-end device detection: check `gl.capabilities.maxTextureSize < 4096` and disable bloom entirely

##### 5.7 Haptics Integration

Trigger points using `useWebHaptics()` from web-haptics:
- **Knob snap positions**: `trigger('nudge')` on each detent
- **DnD lift**: `trigger('buzz')` on panel lift
- **DnD drop**: `trigger('success')` on settle
- **Transport button press**: `trigger(50)` — short tap
- **Toggle switch flip**: `trigger([50, 30, 50])` — double tap
- **Expand button**: `trigger('nudge')`

Gate with `WebHaptics.isSupported` — silent no-op on desktop/iOS.

##### 5.8 Accessibility

All panels wrapped in `<A11y>` from react-three-a11y:
- `role="content"` for informational panels
- `role="button"` for power LED, expand button
- `role="togglebutton"` for toggle switch
- Dynamic `description` reflecting device state (e.g., "Living Room Lamp — on, 75% brightness, 3200K")
- `activationMsg` / `deactivationMsg` for toggles
- `<A11ySection label="Living Room">` wrapping each section group
- `<A11yAnnouncer>` outside Canvas (required)

**Accessibility research findings:**
- `A11ySection` works as expected — creates `<section aria-label="...">` in DOM, groups A11y children
- `useA11y()` hook exposes `{ focus, hover, pressed }` — use for visual focus ring (amber outline on chassis via drei `<Outlines>`)
- `A11yUserPreferences` / `useUserPreferences` provides `prefersReducedMotion` boolean — use to skip spring animations
- No `blurCall` prop exists (issue #51) — only `focusCall`
- For continuous value changes (fader drag), build a custom debounced live region (aria-live="polite") since A11yAnnouncer only announces on button activation

Keyboard navigation:
- Tab cycles through panels (focus ring = amber outline via `<Outlines>` driven by `useA11y().focus`)
- Enter/Space activates power toggle
- Arrow keys on focused knob/fader adjust value (via hidden `<input type="range">`)

Respect `prefers-reduced-motion`: disable slide animations (set spring `immediate: true`), skip DnD lift/drop physics, use instant position swaps.

**Acceptance criteria:**
- [ ] Expand button click triggers slide-forward animation (useSpring3D)
- [ ] Background panels dim during dialog
- [ ] Detail dialog renders with rack-matching styling (HTML overlay)
- [ ] Light detail: color wheel works for RGB lights
- [ ] Air purifier detail: all metrics and controls visible
- [ ] Matter bridge toggle visible in all detail dialogs (reads `device.matterEnabled`)
- [ ] Close animation: panel slides back, background restores
- [ ] Haptic feedback on expand/close, knob snap, DnD, button press
- [ ] LightMultiSelectBar removed from codebase
- [ ] Light panels glow with actual color temp (warm amber → cool white)
- [ ] Edge emissive strips illuminate neighboring panels (no PointLights)
- [ ] Bloom visible on LEDs, VU segments, active buttons, readouts
- [ ] All panels keyboard-navigable via Tab with amber focus outline
- [ ] Screen reader announces device state on focus
- [ ] Hidden `<input type="range">` provides slider semantics for faders/knobs
- [ ] `prefers-reduced-motion` disables spring animations (instant snap)
- [ ] GPU idle when dashboard is static (no continuous rendering)
- [ ] 60fps during drag interactions with 20+ panels
- [ ] Bloom disabled on low-end devices (maxTextureSize < 4096)

---

## Race Condition Inventory

Comprehensive list from frontend races review. Priority indicates implementation order.

| # | Race | Severity | Mitigation |
|---|------|----------|------------|
| 1 | SSE position update during drag | HIGH | Freeze layout snapshot at drag start |
| 2 | Multiple `device:new` SSE events | HIGH | 500ms debounce settle window |
| 3 | Optimistic rollback clobbers state | HIGH | Partial rollback (position fields only) |
| 4 | SSE echo after setState | MEDIUM | Source tagging on DeviceEvent |
| 5 | `invalidate()` in useFrame storm | LOW | Gate on animation dirty flag |
| 6 | Font preload blank scene | MEDIUM | Per-panel Suspense boundaries |
| 7 | Section delete mid-drag | HIGH | Freeze sections + validate on drop |
| 8 | Dialog slider yanked by SSE | MEDIUM | Fader override state machine (confirm-on-SSE-match, 2s fallback) |
| 9 | Concurrent setState clobber | MEDIUM | SSE coalescing buffer (accumulator map + 100ms flush) |
| 10 | Route change mid-animation | MEDIUM | Mounted guard + cancel timers |

---

## System-Wide Impact

### Interaction Graph

SSE event → `useDeviceStream` (coalescing buffer — accumulator map + 100ms flush; snapshots bypass) → `queryClient.setQueryData(['devices'])` → `queryCache.subscribe` fires (event type `'updated'`, verified v5 shape) → `useRackInvalidate` calls `invalidate()` → Three.js render frame → materials update imperatively via refs

User interaction → pointer event on 3D mesh → component handler → `api.api.devices[id].state.patch(...)` → optimistic cache update → SSE confirms real value

DnD interaction → `onPointerDown` → `setPointerCapture` → freeze layout snapshot → pointer move updates position via ref → `onPointerUp` → `releasePointerCapture` → spring settle → PATCH position → optimistic update → SSE confirms

### State Lifecycle Risks

- **DnD position save failure**: Optimistic update shows new position, API call fails → need rollback. Store previous positions (not full cache) in mutation's `onMutate`, restore only position fields in `onError`.
- **Section deletion with devices**: API must reject deletion of non-empty sections (FK constraint with `onDelete: 'restrict'`). Frontend disables delete button for non-empty sections.
- **Concurrent SSE updates during drag**: Layout snapshot frozen at drag start. SSE state updates (brightness, power) still apply to materials but NOT to positions.
- **Batch position partial failure**: `db.transaction()` ensures all-or-nothing. If transaction fails, full optimistic rollback of positions.

### Error Propagation

- Font load failure → per-panel Suspense fallback → individual panels render without text, others are fine
- WebGL context loss → Canvas goes blank → ErrorBoundary catches, shows HTML fallback dashboard
- R3F component error → ErrorBoundary around Canvas catches, shows HTML fallback
- Network error on position save → optimistic rollback + sonner toast error message

## Dependencies & Prerequisites

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `three` | latest | Core 3D engine |
| `@types/three` | latest (dev) | TypeScript types |
| `@react-three/fiber` | latest | React renderer for Three.js |
| `@react-three/drei` | latest | Helper components (Text, RoundedBox, Instances, Outlines, Html) |
| `@react-three/a11y` | latest | 3D accessibility (Tab nav, screen reader) — may need zustand v3 pin |
| `@react-three/postprocessing` | latest | Bloom effect |
| `postprocessing` | latest | Peer dep for above |
| `web-haptics` | latest | Touch haptic feedback |

Fonts (already in repo):
- `client/public/fonts/Michroma-Regular.ttf`
- `client/public/fonts/DSEG7Classic-Regular.ttf`

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| R3F performance with many panels (50+) | Choppy interactions | InstancedMesh from Phase 2, singleton materials, frameloop="demand", dpr auto-scaling, bloom disable on low-end |
| MeshPhysicalMaterial transmission | 50-100 extra render passes | Use fake smoked glass (MeshStandardMaterial + opacity) |
| PointLight per panel edge | 40+ lights destroys framerate | Emissive edge strips + bloom |
| @react-spring/three + frameloop="demand" | Bug #1707 breaks animations | Manual spring in useFrame (useSpring3D hook) |
| @react-three/a11y zustand v3 dependency | Breaks with zustand v5 | Pin zustand@^3.7.2 or fork the library |
| @react-three/a11y React 19 StrictMode | Crash on mount (issue #52) | Test early, patch if needed |
| SSE race conditions during drag | Position corruption | Freeze layout snapshot at drag start |
| Three.js text rendering quality | Blurry fonts at small sizes | drei `<Text>` uses SDF rendering, preload character sets, `sdfGlyphSize={128}` for small text |
| Mobile touch conflicts (scroll vs drag) | Accidental interactions | `touchAction: 'none'` on Canvas, pointer capture for drags, single-finger guard |
| WebGL not supported (rare) | Blank dashboard | ErrorBoundary with HTML fallback (from Phase 2) |
| Material memory leaks | Growing GPU memory | R3F auto-disposes; use `dispose={null}` for shared singleton materials |

## Open Questions (Defer to Implementation)

- **Grid aspect ratio**: 3:2 vs 16:9 vs custom — prototype both early in Phase 2 (see brainstorm)
- **Canvas scrolling**: Use page-height Canvas (recommended by architecture review) — Canvas sized to content height. Revisit if performance suffers with very tall scenes.
- **LightMultiSelectBar**: Removed — batch operations don't fit the single-panel rack metaphor (see Phase 5.4).
- **Dedicated Thermostat/Switch faces**: Deferred to post-MVP. GenericFace handles them for now.
- **Keyboard DnD**: Deferred to post-MVP. Focus on pointer DnD first, add keyboard reorder later.
- **Section reorder via gear dialog**: Deferred. DnD-based reorder is the primary mechanism.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md](docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md) — Key decisions: Sony ES aesthetic, uniform chassis, two-layer interaction, 3D DnD, user-defined sections, Michroma + DSEG7 fonts, reactive lighting on light panels

### Internal References

- Device schema: `server/src/db/schema.ts:12-37`
- Current card dispatcher: `client/src/components/DeviceCard.tsx:60-93`
- SSE device stream: `client/src/hooks/useDeviceStream.ts`
- Color temp → RGB utility: `client/src/lib/color-utils.ts:24-42`
- Dashboard route: `client/src/routes/index.tsx`
- VeSync adapter: `server/src/integrations/vesync/adapter.ts`
- DeviceState interface: `server/src/integrations/types.ts:17-48`
- EventBus: `server/src/lib/events.ts`

### External References

- [@react-three/fiber docs](https://r3f.docs.pmnd.rs/) — Canvas, events, performance, pointer capture
- [@react-three/drei docs](https://drei.docs.pmnd.rs/) — Text, RoundedBox, Instances, Outlines, Html, useFont
- [react-three-a11y](https://github.com/pmndrs/react-three-a11y) — A11y, A11yAnnouncer, A11ySection, useA11y, A11yUserPreferences
- [@react-three/postprocessing](https://docs.pmnd.rs/react-postprocessing) — Bloom setup (standard only, never SelectiveBloom)
- [web-haptics](https://github.com/lochie/web-haptics) — haptic trigger patterns
- [DSEG font](https://github.com/keshikan/DSEG) — 7-segment display font
- [Michroma](https://fonts.google.com/specimen/Michroma) — geometric extended sans-serif

### Research Sources (from deepening)

- [Spring animation physics](https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/) — damped harmonic oscillator formula
- [R3F pointer capture behavior](https://github.com/pmndrs/react-three-fiber/discussions/673) — capture adds to hit results, doesn't replace
- [react-spring bug #1707](https://github.com/pmndrs/react-spring/issues/1707) — broken with frameloop="demand"
- [R3F event ordering with capture](https://github.com/pmndrs/react-three-fiber/issues/2553) — multi-touch limitations
- [a11y StrictMode crash](https://github.com/pmndrs/react-three-a11y/issues/52) — React 19 compatibility
- [ARIA slider role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/slider_role) — hidden input pattern for 3D controls
