---
title: "feat: UI Redesign — Navbar, Integrations, Matter + Zustand Adoption"
type: feat
status: active
date: 2026-03-05
origin: docs/brainstorms/2026-03-05-ui-redesign-navbar-integrations-matter-brainstorm.md
---

# UI Redesign — Navbar, Integrations, Matter + Zustand Adoption

## Enhancement Summary

**Deepened on:** 2026-03-05
**Research agents used:** TypeScript reviewer, Performance oracle, Architecture strategist, Pattern recognition, Frontend races, Code simplicity, Best practices researcher, Frontend design specialist
**Technical review on:** 2026-03-05 — 28 findings addressed (5 P1, 10 P2, 13 P3)

### Key Improvements

1. **Device ID type fix** — store interfaces corrected from `number` to `string` (matches schema)
2. **`DeviceStoreState` naming** — avoids collision with server-owned `DeviceState` type
3. **EventSource contradiction resolved** — refs stay in hooks, NOT in zustand state (Phase 1.7 fixed)
4. **SSE batching dropped** — React 18+ automatic batching is sufficient; connection-aware guard added instead
5. **Pending mutation suppression** — prevents optimistic toggle bounce when SSE overwrites in-flight updates
6. **Notification simplified** — single slot (no queue), timer in component (not store), no state machine
7. **`use-scramble` adopted** — 1kb library replaces DIY RAF loop for ScrambleText
8. **SVG performance fixes** — CSS `transform: rotate()` (not `stroke-dashoffset`), CSS `@keyframes` for orb pulse (not motion), blur filter limited to core orb only
9. **Orbital starts with 2 layers** — core orb + metadata ring first; integration ring is follow-up
10. **Always count badges** — no individual satellite dots; simpler, readable at all viewports
11. **Reverse transition added** — paired → unpaired path with interruption handling
12. **Direct dark background** — class on route container, not generic `data-theme` system
13. **Component extraction** — StatusLed (bezel variant), ConsolePanel, GaugeReadout to `ui/` + LED dot clarified as separate CSS pattern
14. **Motion import path** — confirmed `from 'motion/react'`; motion reserved for state-driven animations only
15. **Accessibility improvements** — `aria-live` on notification region, `prefers-reduced-motion` subscribed (not just checked once), `Readonly<Props>` on all new interfaces

## Overview

Design refresh of the three areas that didn't get the Sony Making Modern treatment during the dashboard card redesign: navbar, integrations page, and matter page. Includes a clean-break zustand adoption replacing all React Query state hacks, a two-font system (dropping Commit Mono), and motion-driven animations for the navbar readout strip.

## Problem Statement

The dashboard cards got the full instrument-panel aesthetic but the surrounding UI — navbar, integrations, matter — still feels like generic Tailwind. State management uses React Query as a hacky global store (dummy queryFns, `staleTime: Infinity`), which works but is the wrong tool. The three fonts (Commit Mono, IoskeleyMono, Michroma) lack clear identity separation since Commit Mono sits in the middle without a strong role.

## Proposed Solution

Five-phase implementation:

1. **Zustand adoption** — foundation for everything else
2. **Font migration** — two-font system (IoskeleyMono + Michroma)
3. **Navbar redesign** — slash-path nav, LED active indicator, contextual readout strip with animations
4. **Integrations page** — scan readout log + module rack catalog
5. **Matter page** — QR panel (unpaired) / HAL solar system (paired)

(see brainstorm: `docs/brainstorms/2026-03-05-ui-redesign-navbar-integrations-matter-brainstorm.md`)

## Technical Approach

### Phase 1: Zustand Adoption (Foundation)

Clean-break migration of three React Query hacks + one new store. React Query stays for actual server-fetched data (`['integrations']`, `['sections']`, `['matter']`, `['matter', 'qr']`).

#### 1.1 Install zustand

```bash
cd client && bun add zustand
mkdir -p client/src/stores
```

> **Note:** `client/src/stores/` is a new directory. All state currently lives in hooks (`client/src/hooks/`). Stores are pure state containers; hooks manage side effects (EventSource lifecycle, etc.) and write to stores.

#### 1.2 Connection Store

Replaces `['stream:status']` query cache hack.

**New file:** `client/src/stores/connection-store.ts`

```ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

type StreamStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

interface ConnectionState {
  status: StreamStatus
  setStatus: (status: StreamStatus) => void
}

export const useConnectionStore = create<ConnectionState>()(
  devtools(
    (set) => ({
      status: 'connecting' satisfies StreamStatus,
      setStatus: (status) => set({ status }),
    }),
    { name: 'ConnectionStore' },
  ),
)
```

> **Research insight:** `subscribeWithSelector` is unnecessary here — single primitive field, no external subscriptions needed. Plain `create` + `devtools` is sufficient. Reserve `subscribeWithSelector` for stores with cross-store subscriptions (readout store).

#### 1.3 Device Store

Replaces `['devices']` query cache hack. The SSE handler writes directly to this store.

**New file:** `client/src/stores/device-store.ts`

```ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Device, DeviceState } from '@/types'

interface DevicePatch {
  state?: Partial<DeviceState>
  online?: boolean
}

interface DeviceStoreState {
  devices: Device[]
  // actions
  setDevices: (devices: Device[]) => void
  updateDevice: (id: string, patch: DevicePatch) => void
  addDevice: (device: Device) => void
  setOffline: (id: string) => void
}
```

> **CRITICAL FIX:** Device ID is `string` (from `text('id').primaryKey()` in schema), not `number`. Using `number` would silently fail — no device would ever match.
>
> **CRITICAL FIX:** The store interface is named `DeviceStoreState` (not `DeviceState`) to avoid collision with the server-owned `DeviceState` type from `integrations/types.ts` which describes device runtime state (brightness, on/off, etc.). Both types are needed in this file — the domain type for `DevicePatch.state` and the store interface for `create<DeviceStoreState>()`.

> **Simplification — skip custom SSE batching:** React 18+ automatic batching already coalesces synchronous zustand state updates within the same microtask. The SSE `onmessage` handler fires synchronously for each event in the event loop — React batches the resulting re-renders automatically. Start with plain `updateDevice()` calls. If profiling shows jank, add custom microtask batching later.
>
> **Connection-aware guard:** The SSE handler should check connection status before applying updates. If `onerror` has fired and set status to `'reconnecting'`, discard any updates that arrive from the dying connection before the new one opens:
>
> ```ts
> es.onmessage = (e) => {
>   if (useConnectionStore.getState().status === 'reconnecting') return
>   // ... parse and apply
> }
> ```

> **Research insight — optimistic rollback:** The current `getSnapshot()`/`rollback()` pattern replaces the entire array, nuking any SSE updates that arrived between snapshot and rollback. Use surgical rollback instead:
>
> ```ts
> // at mutation call site
> const snapshot = { deviceId, previousValues: { on: device.state.on } }
> // on error, revert only the properties that were optimistically set
> store.updateDevice(snapshot.deviceId, { state: snapshot.previousValues })
> ```
>
> This preserves concurrent SSE updates for other properties and other devices.
>
> **Race condition fix — pending mutation suppression:** Without suppression, SSE can overwrite an in-flight optimistic update causing the UI to flicker 3 times (user toggles → optimistic off → SSE says on → API succeeds → SSE confirms off). Add a `pendingMutations: Map<string, Set<string>>` to the device store. While a mutation is in flight for `{deviceId, property}`, SSE updates to that specific property are suppressed. The mutation call site adds the key before the API call and removes it in `finally`. `updateDevice()` checks this map before applying SSE patches.

> **Research insight — selector discipline:** Readout strip selectors must return primitives, not new arrays:
> - `useDeviceStore(s => s.devices.length)` — returns number, stable equality
> - `useDeviceStore(s => s.devices.reduce((n, d) => n + (d.online ? 1 : 0), 0))` — returns number
> - Do NOT use `.filter().length` — creates new array reference every time, fails `Object.is` equality

#### 1.4 Scan Store

Replaces `['scan:state']` query cache hack. Owns the EventSource lifecycle.

**New file:** `client/src/stores/scan-store.ts`

State shape mirrors existing `ScanState` interface. Actions: `startScan()`, `cancel()`, `reset()`.

> **Architecture insight:** The EventSource ref must NOT live in the zustand store state. Zustand's `devtools` middleware serializes state — `EventSource` is not serializable and will throw. Keep the EventSource lifecycle in the `useScanStream` hook (consistent with how `useDeviceStream` manages its EventSource). The scan store should be a pure state container that the hook writes to. This also makes the store trivially testable — no EventSource mocking needed.

#### 1.5 Readout Store (new)

Drives the navbar contextual readout strip and notification queue.

**New file:** `client/src/stores/readout-store.ts`

```ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ReadoutState {
  statusColor: string
  slot1: string
  slot2: string
  activeNotification: string | null  // single slot, not a queue

  // actions
  setSlot1: (value: string) => void
  setSlot2: (value: string) => void
  setStatusColor: (color: string) => void
  pushNotification: (message: string) => void
  dismissNotification: () => void
}
```

> **Simplification — single notification slot, no queue:** One notification at a time. `pushNotification()` sets `activeNotification` to the message string (replaces any existing notification). No queue, no FIFO, no max depth. If a new notification arrives while one is showing, it replaces it. This is a personal dashboard with 3 routes — notification storms don't happen.
>
> **Simplification — timer lives in the component, not the store:** The `ReadoutStrip` component owns the 3-second dismiss `setTimeout`. This ensures the timer starts when the notification becomes *visible* (component reads the store), not when it is pushed (which could happen before mount). The store is a pure state container — no timer IDs, no serialization concerns.
>
> **Simplification — no state machine:** Route changes during a notification are fine — let the notification finish naturally (3s timeout in `ReadoutStrip`), then `ScrambleText` picks up whatever the current slot values are. `AnimatePresence` handles enter/exit transitions. No explicit state machine needed for 3 routes and infrequent notifications.
>
> **Simplification — no conditional debounce:** Use a single consistent approach. No branching between 0ms and 300ms. The initial `"--"` → real value transition animates naturally via `ScrambleText`'s `useEffect` on value change.
>
> **Simplification — named fields, no version counter:** Named fields (`slot1`, `slot2`, `statusColor`) instead of tuple indices. No `version` counter — `ScrambleText` detects value changes via `useEffect` on the `value` prop. Note: if the same value is set twice (e.g., SSE reports "12 devices" twice), no re-animation fires, which is the correct behavior.
>
> **ScrambleText visibility gate:** When `activeNotification` is set, `ScrambleText` components for slot values are either unmounted or have their animation disabled (via a `visible` prop). This prevents hidden scramble animations from burning RAF cycles behind the notification overlay.

**Initial state (before SSE connects):** slots show `"--"` placeholder. First real value triggers a scramble animation from dashes to the actual value.

#### 1.6 Migrate useDeviceStream

Refactor `client/src/hooks/useDeviceStream.ts`:
- Remove all `queryClient.setQueryData` calls
- Import and call `useDeviceStore` and `useConnectionStore` actions directly
- The hook stays in React (runs in `AppShell` for lifecycle cleanup) but writes to zustand
- `toast()` call for `device:new` stays (sonner handles important alerts)
- Also push a readout notification via `useReadoutStore.getState().pushNotification()`

#### 1.7 Migrate useScanStream

Refactor `client/src/hooks/useScanStream.ts`:
- Replace `queryClient.setQueryData(['scan:state'])` with scan store actions
- EventSource ref stays in the hook (NOT in zustand state — see Phase 1.4 architecture insight). The hook manages EventSource lifecycle; the store is a pure state container.
- Hook becomes a thin wrapper that calls `useScanStore` actions
- Add cleanup: close EventSource on unmount to prevent zombie connections when navigating away from integrations page mid-scan

#### 1.8 Migrate consumers

All call sites that read from the old query keys:

| File | Current | Migration |
|------|---------|-----------|
| `routes/index.tsx` | `useQuery(['devices'])` | `useDeviceStore(s => s.devices)` |
| `routes/index.tsx` | optimistic `setQueryData(['devices'])` in `stateMutation` | `useDeviceStore.getState().updateDevice()` / `getSnapshot()` / `rollback()` |
| `routes/index.tsx` | `useStreamStatus()` | `useConnectionStore(s => s.status)` |
| `routes/integrations.tsx` | `useQuery(['devices'])` | `useDeviceStore(s => s.devices)` |
| `routes/index.tsx` | `handleMatterToggle` — `setQueryData(['devices'])` | `useDeviceStore.getState().updateDevice()` — needs surgical rollback on error (currently just toasts, no rollback) |
| `routes/index.tsx` | `handleReorder` — `setQueryData(['devices'])` | `useDeviceStore.getState().setDevices()` — snapshot order array before reorder, restore on error |
| `routes/integrations.tsx` | `useScanStream()` return shape | stays same API, backed by zustand |
| `routes/matter.tsx` | (Phase 5 will need device data for satellites) | `useDeviceStore(s => s.devices)` |
| `hooks/useDeviceStream.ts` | `useStreamStatus()` export | re-export from connection store |

#### 1.9 Cleanup

- Remove `STREAM_STATUS_KEY`, `useStreamStatus()` from `useDeviceStream.ts`
- Remove `['devices']` query setup (the `queryFn: () => []` hack)
- Remove `['scan:state']` query setup
- Verify React Query devtools no longer show the hacked keys
- Zustand devtools middleware provides equivalent visibility
- **Update `client/CLAUDE.md`** — replace documented React Query patterns (`queryClient.setQueryData(['devices'])`) with zustand patterns. The existing documentation will be misleading after migration. Also fix the stale route name in the Routes section: `homekit.tsx` → `matter.tsx`.
- Fix existing bug in `useDeviceStream`: zombie EventSource from retry timeout on unmount. Add a mounted/alive flag checked at the top of `connect()`.

> **Pattern insight — store interface naming:** Use `{Name}StoreState` when the `{Name}State` name is already taken by a domain type (e.g., `DeviceStoreState` since `DeviceState` is the server-owned device runtime type). For stores without collision, `{Name}State` is fine (e.g., `ConnectionState`, `ScanState`, `ReadoutState`). Apply `devtools` middleware uniformly to all stores.

> **Pattern insight — extract StatusLed, ConsolePanel, GaugeReadout** from `matter.tsx` into `client/src/components/ui/` as shared primitives. Do this extraction in Phase 1 as prep work.
>
> **Note:** The extracted `StatusLed` is the full bezel-mounted variant (40px with bezel ring and inset well) from matter.tsx. The navbar LED dot (6px, CSS `::before` pseudo-element) and module panel LED (6px, flat circle) are simpler patterns — just CSS, not the same component. Don't force them to share code.

**Acceptance criteria:**
- [ ] `bun run system:check --force` passes
- [ ] All device state flows work: SSE snapshot, update, new device, offline
- [ ] Optimistic updates work on dashboard (state change, reorder, matter toggle)
- [ ] Scan works on integrations page
- [ ] Stream status displays correctly
- [ ] React Query only manages server-fetched data
- [ ] Zustand devtools visible in browser
- [ ] `StatusLed`, `ConsolePanel`, `GaugeReadout` extracted to `client/src/components/ui/`
- [ ] `client/CLAUDE.md` updated with zustand patterns and `matter.tsx` route name

---

### Phase 2: Font Migration

Drop Commit Mono. Two-font system: IoskeleyMono (mono/body/data) + Michroma (labels/headings).

#### 2.1 Update CSS

In `client/src/index.css`:
- Remove `@font-face` for Commit Mono
- Remove `--font-commit` theme token
- Set `font-family: 'IoskeleyMono', monospace` as the default body font on `html` or `:root`

#### 2.2 Replace font-commit usages

Search and replace all `font-commit` class references with `font-ioskeley`:
- Device names, body text, status text → `font-ioskeley`
- Labels already using `font-michroma` stay as-is

#### 2.3 Remove Commit Mono font file

Delete the woff2 file from `client/public/fonts/` (or wherever it's served from).

**Acceptance criteria:**
- [ ] No references to `font-commit` or `Commit Mono` in codebase
- [ ] All text renders in IoskeleyMono or Michroma
- [ ] `bun run system:check --force` passes

---

### Phase 3: Navbar Redesign

Extract navbar from `__root.tsx` into its own component. Build the readout strip with motion animations.

#### 3.1 Navbar Shell

**New file:** `client/src/components/Navbar.tsx`

Structure:
```
<nav> (elevated, sticky, backdrop-blur)
  <div> (max-w-6xl centered)
    <div> (flex between)
      <!-- left: nav items -->
      <div>
        <NavItem to="/" label="/dashboard" />
        <NavItem to="/integrations" label="/integrations" />
        <NavItem to="/matter" label="/matter" />
      </div>
      <!-- right: readout strip -->
      <ReadoutStrip />
    </div>
  </div>
</nav>
```

**NavItem component:**
- IoskeleyMono, lowercase, `text-sm`
- LED dot: 6px circle to the left of text, uses CSS `::before` pseudo-element
- Active: LED dot colored (emerald), text full opacity
- Inactive: no dot (or dim stone dot), text `text-stone-500`
- `aria-current="page"` on active link (TanStack Router handles active class)

**Elevated feel:**
- Stronger shadow than current: multi-layer warm shadow with more depth
- Subtle bottom border like a bezel edge
- Backdrop blur (12px, already present)

#### 3.2 ReadoutStrip Component

**New file:** `client/src/components/ReadoutStrip.tsx`

Three slots in a horizontal row:
- **Slot 0:** Status dot (8px circle). Color from connection store: connected=emerald, reconnecting=amber (pulsing), connecting=stone (pulsing), error=red.
- **Slot 1:** `<ScrambleText />` — first readout value
- **Slot 2:** `<ScrambleText />` — second readout value

**Page context hook:** `useReadoutContext()` — reads current route from TanStack Router, subscribes to relevant zustand stores, computes slot values:

| Route | Slot 1 | Slot 2 |
|-------|--------|--------|
| `/` (dashboard) | `{count} devices` | `{online} online` |
| `/integrations` | `{count} connected` | scan state (`scanning...` / `scan complete` / `idle`) |
| `/matter` | `bridge: {status}` | `{count} bridged` |

Values update reactively via zustand selectors. When values change, `ScrambleText` detects the prop change via `useEffect` and triggers the scramble animation.

> **Architecture insight — matter data fallback:** The `['matter']` React Query only runs on the matter page (10s poll, only active when route is mounted). On other pages, the readout context hook won't have bridge data. Show `"bridge: --"` / `"-- bridged"` as placeholder until the user visits the matter page. Option: alternatively, move the matter query to `AppShell` so it runs app-wide — but the simpler `"--"` fallback is consistent with the initial SSE placeholder pattern.

**Notification mode:** when `activeNotification` is set in the readout store, slots 1+2 are replaced by the notification message via vertical ticker animation. The `ReadoutStrip` component owns the 3-second dismiss `setTimeout` (starts when it reads a new `activeNotification`, ensuring the timer doesn't fire before mount). After timeout, calls `dismissNotification()`, ticker reverses out, and slots scramble back to page context.

> **Accessibility:** Add `aria-live="polite"` to the notification text region so screen readers announce notifications. The `sr-only` spans on individual `ScrambleText` instances do not cover notification text.

#### 3.3 ScrambleText Component

**New file:** `client/src/components/ui/scramble-text.tsx`

Core animation component. Props: `Readonly<{ value: string; className?: string; visible?: boolean }>`.

**Use `use-scramble` library** (1kb, MIT) instead of DIY RAF:

```bash
cd client && bun add use-scramble
```

The library handles RAF lifecycle, cleanup, direct `textContent` mutation, `ignore` characters (preserve spaces/colons), and `overflow` for smooth morphing. This eliminates the need for custom RAF loops, cancellation tokens, and frame-rate-dependent iteration counting.

Wrapper component:
1. Pass `value` to `useScramble({ text: value })` — the hook manages the scramble animation
2. When `visible` prop is `false` (notification overlay active), skip animation — set text directly
3. `aria-hidden="true"` on the visual scramble container
4. Sibling `<span className="sr-only" aria-live="polite">{value}</span>` announces final value to screen readers
5. IoskeleyMono is monospaced — character widths are fixed, no layout shift

**Font loading:** Show the raw text value immediately (no scramble) as a fallback. Gate scramble animations on font availability using `document.fonts.check('12px IoskeleyMono')` (not `document.fonts.ready` which waits for ALL fonts). If the specific font isn't loaded yet, subscribe to `document.fonts.addEventListener('loadingdone', ...)` with cleanup. Content first, animation second.

**Reduced motion:** Subscribe to `matchMedia('(prefers-reduced-motion: reduce)')` via `addEventListener('change', ...)` (not just checking once on mount). Users can toggle system preferences mid-session. When reduced motion is active, set text directly — no scramble.

> **Performance insight — import path:** Motion v12 React components must be imported from `'motion/react'` (not `'motion'` which is the vanilla JS API, and not `'framer-motion'` which is legacy). Getting this wrong fails at build time or imports the wrong module.

#### 3.4 Vertical Ticker

For notification display. Uses motion `AnimatePresence`:

```tsx
<AnimatePresence mode="wait">
  {activeNotification ? (
    <motion.span
      key={activeNotification.id}
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -12, opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
    >
      {activeNotification.message}
    </motion.span>
  ) : null}
</AnimatePresence>
```

`prefers-reduced-motion`: instant swap (no y-offset animation).

#### 3.5 Update __root.tsx

- Remove inline nav JSX and `NavItem` component
- Import and render `<Navbar />`
- Remove `useStreamStatus` import (now in connection store)

**Acceptance criteria:**
- [ ] Slash-path nav items render in IoskeleyMono
- [ ] LED dot appears on active nav item, green
- [ ] Readout strip shows contextual values per page
- [ ] Segment scramble animates on value change
- [ ] Notifications ticker in, hold 3s, ticker out, scramble back
- [ ] Status dot reflects SSE connection state
- [ ] `prefers-reduced-motion` disables animations
- [ ] Screen readers announce final values only
- [ ] `bun run system:check --force` passes

---

### Phase 4: Integrations Page Redesign

Two sections: scan readout log (instrument) + module rack catalog (hardware aesthetic).

#### 4.1 Scan Readout Log

Replace the current scan progress pills with a dark ReadoutDisplay window.

**New component:** `client/src/components/ScanLog.tsx`

- Wraps `<ReadoutDisplay size="lg">` (existing primitive)
- Streams scan events as IoskeleyMono text lines
- Format: `scanning {brand}...{padding}{count} found` (right-aligned counts)
- Error lines: `scanning {brand}...{padding}ERROR` in red-tinted text
- Final line: `scan complete{padding}{total} devices`
- Fixed height ~120px, overflow-y auto, auto-scrolls to bottom on new entries
- `role="log"` + `aria-live="polite"` for accessibility
- Re-scan clears log and restarts
- Empty scan result (`0 devices`): show help text below the log ("No new devices detected. Make sure your hubs are powered on and connected to the network.")
- **Cap log entries at 200 lines** — safety valve for error retry loops. No virtualization needed at this count.
- **Auto-scroll:** only smooth-scroll to bottom when user is already at bottom (check `scrollTop + clientHeight >= scrollHeight - threshold`). If user has scrolled up to read earlier entries, don't auto-scroll. Debounce the scroll-to-bottom call with 100ms trailing to avoid queuing multiple smooth scroll animations during rapid scan events.

> **Pattern insight — ReadoutDisplay sizing:** The `lg` size is designed for single-line hero readouts (`text-2xl px-3 py-2.5`), not scrollable containers. ScanLog should pass `className` overrides for `h-[120px] overflow-y-auto` rather than relying on size prop to handle scrollable content. This preserves ReadoutDisplay's role as a visual surface primitive.

**Scan controls:**
- "Scan again" button (`RaisedButton` variant) positioned above or beside the log
- Replaces current button+pill layout

#### 4.2 Module Rack: ModulePanel Component

**New component:** `client/src/components/ModulePanel.tsx`

Each integration rendered as a hardware module panel. Based on existing `Card` primitive but with distinct module aesthetic.

**Structure:**
```
<div> (module panel frame)
  <StatusLED /> (top-right corner, recessed)
  <BrandMark /> (centered icon/logo)
  <ReadoutDisplay size="sm"> (device count or dashed placeholder)
  <ActionButton /> (connect / configure)
</div>
```

**Two power states (same form factor):**

| Element | Connected (powered) | Available (unpowered) |
|---------|--------------------|-----------------------|
| Status LED | lit green/amber, glow | dim stone dot, no glow |
| Brand mark | full opacity | `opacity-50` |
| Readout | device count (e.g. `6`) | `--` dashed placeholder |
| Action | "Configure" / "Remove" | "Connect" |
| Surface | warm surface, subtle ambient glow | same surface, no glow, slightly muted |

**Grid layout:** responsive, consistent module sizing
- Mobile: 2 columns
- Tablet: 3 columns
- Desktop: 4 columns
- `gap-4`, modules have `aspect-[3/4]` for consistent portrait proportions (no `min-height` — let the aspect ratio handle sizing at all widths)

**Interactions:**
- "Connect" opens `IntegrationFormInner` in a `RaisedModal` (existing pattern from `DeviceDetailDialog`)
- "Configure" opens same modal with existing config populated
- "Remove" shows confirmation dialog (destructive — states how many devices will be removed)
- Auto-discovered brands (Elgato) that need no config: "Connect" triggers immediate add, no modal
- Keyboard: modules are focusable, Enter/Space activates primary action
- Focus indicator: `ring-2 ring-stone-400 ring-offset-1` (consistent with card system)

> **Pattern insight — compose Card, don't rebuild:** ModulePanel should wrap the existing `Card` primitive (same as `DeviceCard` uses `CardShell`). Use Card's existing `glowShadow` prop for powered glow, `muted` prop for unpowered state. Do not create a parallel surface system.

> **TypeScript insight — discriminated union props:** Use a discriminated union instead of a boolean `powered` prop:
> ```ts
> // ConfiguredIntegration does not exist yet — create a type alias:
> type ConfiguredIntegration = Omit<Integration, 'config' | 'session'>
>
> type ModulePanelProps = Readonly<
>   | { state: 'connected'; integration: ConfiguredIntegration; deviceCount: number }
>   | { state: 'available'; meta: IntegrationMeta }
> >
> ```
> This makes it impossible to render a connected module without device count, eliminating null checks inside the component. Note: wrap all new component prop interfaces with `Readonly<Props>` per lint rules (`sonarjs/prefer-read-only-props`).

> **Accessibility insight:** ModulePanel's interactive surface should use React Aria's `Button` (not a raw `<div>` with `onClick`). This follows the pattern where `DeviceCard` uses React Aria `Button` for its expand trigger. Apply `Readonly<Props>` to all new component prop interfaces per lint rules.

#### 4.3 Page Layout

```
<div>
  <header>
    <Michroma heading> INTEGRATIONS </Michroma heading>
  </header>

  <!-- scan section -->
  <section>
    <ScanLog />
    <RaisedButton> Scan Again </RaisedButton>
  </section>

  <!-- additional devices (if any from connected brands) -->
  {additionalDevices.length > 0 && (
    <section>
      <Michroma label> ADDITIONAL DEVICES </Michroma label>
      <AdditionalDeviceCards />
    </section>
  )}

  <!-- module rack -->
  <section>
    <Michroma label> INTEGRATIONS </Michroma label>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {connectedModules.map(m => <ModulePanel powered />)}
      {availableModules.map(m => <ModulePanel />)}
    </div>
  </section>
</div>
```

Connected modules render first (powered, at the front of the rack), then available modules (unpowered slots).

**Acceptance criteria:**
- [x] Scan log streams events in ReadoutDisplay window
- [x] Error lines render distinctly
- [x] Re-scan clears and restarts log
- [x] Zero-result scan shows help text
- [x] Module panels show correct power state
- [x] Connect opens modal, configure opens modal, remove shows confirmation
- [x] Grid is responsive (2/3/4 columns)
- [x] Keyboard navigation works through modules
- [x] `bun run system:check --force` passes

---

### Phase 5: Matter Page Redesign

Two distinct modes: QR panel (unpaired) and HAL solar system console (paired).

#### 5.1 Unpaired Mode

Keep the current QR code panel approach. Refine styling to match the updated design system:
- Use Michroma for headings, IoskeleyMono for body/readouts
- Dark ReadoutDisplay for QR frame (already CRT-styled)
- Status indicators use the same LED dot pattern as navbar
- Clean up any Commit Mono references

No major structural changes — the existing unpaired UX works well.

#### 5.2 Paired Mode: Solar System Console

**New component:** `client/src/components/MatterOrbital.tsx`

Full-page dark console experience. Background shifts from the app's warm `#f5f2ec` to a dark instrument panel feel for this page only.

**Page background override:** when bridge is paired, the Matter route applies a dark background to the main content area. The navbar stays warm/light (it's elevated above the page).

> **Simplification — direct class, not generic theming:** Only one page uses dark mode. Apply `bg-[#1a1914] transition-colors duration-500` directly to the matter route's outermost `<div>` when paired. No `data-theme` attribute system, no generic mechanism. The matter route component controls its own background — the `<main>` in `__root.tsx` does not need to know about it.

**SVG-based orbital visualization** (SVG chosen over canvas for accessibility + motion animation compatibility):

**Layer 1 — Core orb (center):**
- Radial gradient circle, ~60px diameter
- Color by bridge status: emerald (running), amber (starting), red (error)
- Gentle pulse animation via **CSS `@keyframes`** (not motion — this is decorative, infinite, and should run on the compositor thread):
  ```css
  @keyframes core-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
  .core-orb { animation: core-pulse 3s ease-in-out infinite; transform-origin: 250px 250px; will-change: transform; }
  ```
- Inner glow: use a radial gradient circle behind the orb (not `feGaussianBlur` — reserve blur filter for core orb only to avoid filter cost scaling with node count)

**Layer 2 — Metadata ring:**
- Thin circular path, ~140px radius
- Dashed stroke with subtle animation: use CSS `transform: rotate()` on a `<g>` wrapping the ring (not `stroke-dashoffset` which triggers SVG repaint every frame). `transform: rotate()` is compositor-friendly:
  ```css
  @keyframes ring-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .metadata-ring-group { animation: ring-rotate 60s linear infinite; transform-origin: 250px 250px; }
  ```
- Three readout labels positioned along the ring: PORT, PAIRED, UPTIME
- Values in IoskeleyMono, labels in Michroma (text-2xs)
- Uses SVG `<text>` elements positioned with absolute coordinates

**Layer 3 — Integration ring (follow-up enhancement):**

> **Simplification — start with 2 layers:** Ship core orb + metadata ring first. These communicate bridge status and key metrics — the essential information. The integration ring with planets and count badges is a follow-up phase once the 2-layer version is validated. This cuts the orbital spec roughly in half and avoids planet positioning math, satellite logic, and responsive complexity on the first pass.

When adding Layer 3 later:
- Circular path, ~220px radius
- Integration nodes (planets) positioned evenly around the ring
- Each node: brand icon + label, ~32px diameter circle with brand-colored fill
- Connected integrations only (available ones don't appear here)
- **Always use count badges** (e.g., small `6` in IoskeleyMono on the planet) — skip individual satellite dots. Count badges are readable at all viewport sizes and simpler to implement. Individual dots can be added as a progressive enhancement later if the static version feels too sparse.
- Touch targets: transparent `<circle r="22">` behind each planet for 44px minimum tap area

**Empty state (paired, zero bridged devices):**
- Core orb + metadata ring visible
- (Once Layer 3 is added) Integration ring shows as an empty dashed circle
- Subtle CTA text below the orbital: "Enable devices from the Dashboard to see them here" in IoskeleyMono

**Responsive behavior:**
- The orbital scales proportionally with the container
- Use `viewBox` on the SVG for natural scaling
- On narrow viewports (<640px): orbital shrinks but remains functional; consider hiding device satellites and showing only integration nodes with count badges
- Touch targets for integration planets: minimum 44x44px tap area via transparent hit regions

**Accessibility:**
- `role="img"` on SVG container with `aria-label` describing the full state: "Matter bridge running, paired, 3 integrations with 12 bridged devices"
- Integration nodes: `role="link"` with `aria-label` ("Hue, 6 devices") — clickable, navigates to integrations page
- Device satellites: not individually interactive (decorative)
- Below the orbital: a text-based summary panel for screen readers (hidden visually) listing all bridge info

**Bridge error during paired state:**
- Core orb turns red, stops pulsing (or pulses faster)
- Metadata ring values show last-known data
- Integration/device nodes dim but stay visible
- Error message appears below orbital

> **Performance insight — CSS keyframes for decorative animations:** Use CSS `@keyframes` (not motion JS) for purely decorative animations: ring rotation, core orb pulse. CSS animations run on the compositor thread and don't trigger React re-renders. Reserve motion for interactive/state-driven animations (paired transition, notification ticker).

> **Architecture insight — shared SVG defs:** Define all SVG `<radialGradient>` elements in a single `<defs>` block at the top of the SVG. Reserve `feGaussianBlur` for the core orb only — use radial gradient circles (not blur filters) for any glow effects on integration planets (when Layer 3 is added). This prevents filter cost from scaling with node count.

> **Architecture insight — extract `useMatterOrbitalData` hook:** The orbital component needs to derive ring data, status colors, and (later) planet positions from raw matter + device data. Extract this derivation into a `useMatterOrbitalData(matterData, devices)` hook that returns render-ready geometry. This keeps `MatterOrbital.tsx` as a pure SVG renderer without business logic. The hook also handles the join between poll data and device store data, gracefully handling devices that exist in poll data but have been removed from the device store.

#### 5.3 Transitions: Unpaired ↔ Paired

**Unpaired → Paired:** When the 10-second poll detects `paired: true`:
1. The QR panel fades out (motion `exit={{ opacity: 0 }}`)
2. Brief "COMMISSIONED" confirmation (existing pattern, keep the emerald checkmark)
3. After 2 seconds, orbital fades in (motion `initial={{ opacity: 0, scale: 0.9 }}`)
4. Readout strip notification: "bridge: paired"

**Paired → Unpaired (reverse transition):** If the bridge drops while paired:
1. Orbital fades out (motion `exit={{ opacity: 0, scale: 0.95 }}`)
2. QR panel fades back in
3. Readout strip notification: "bridge: disconnected"

**Interruption handling:** If `paired` flips back to `false` during the 2-second "COMMISSIONED" hold, cancel the timeout and transition directly to the unpaired QR panel. Use a cancel token or `useEffect` cleanup to handle this. `AnimatePresence mode="wait"` handles the mechanical enter/exit transitions — the key concern is cancelling the 2-second hold timer when state changes under it.

#### 5.4 Matter Panels (below orbital)

Below the orbital visualization, keep instrument-style info panels for detailed data:
- `ConsolePanel` wrapper (existing) with Michroma labels
- Bridge status details, port, pairing code
- These use the existing `GaugeReadout` components, updated to two-font system

**Acceptance criteria:**
- [x] Unpaired mode shows QR panel with updated fonts
- [x] Paired mode shows orbital visualization with 2 layers (core orb + metadata ring)
- [x] Core orb color reflects bridge status (emerald/amber/red/stone)
- [x] Core orb pulse uses CSS `@keyframes` (not motion)
- [x] Metadata ring rotation uses CSS `transform: rotate()` (not `stroke-dashoffset`)
- [x] Empty state (zero bridged devices) shows CTA
- [x] Transition from unpaired to paired animates smoothly
- [x] Reverse transition (paired → unpaired) works, including interruption during "COMMISSIONED" hold
- [x] Bridge error shows red orb + error state
- [x] Responsive: SVG scales via viewBox
- [x] Accessible: aria-labels, screen reader summary
- [x] Dark background applied via class on route container (not `data-theme`)
- [x] `bun run system:check --force` passes

---

## System-Wide Impact

### Interaction Graph

- SSE handler → zustand device/connection stores → all pages re-render via selectors
- SSE handler → readout store (notifications) → navbar readout strip re-renders
- Route change → readout context hook → readout store slot updates → scramble animation
- Scan SSE → zustand scan store → integrations page + readout strip
- Matter poll (React Query) → matter page + readout store slot updates
- User mutation → zustand device store (optimistic) → API call → SSE confirms real value

### State Lifecycle Risks

- **Zustand migration must be atomic per store.** If `useDeviceStream` writes to zustand but a consumer still reads from React Query, that consumer sees stale/empty data. The migration checklist in Phase 1.8 prevents this.
- **Optimistic updates use surgical rollback + pending mutation suppression.** Per-device/per-property rollback preserves concurrent SSE updates. `pendingMutations` map suppresses SSE overwrites for in-flight properties, preventing toggle bounce.
- **Notification is single-slot, timer in component.** No queue drain timing issues. Timer starts on display (component mount), not push (store write). If notification is pushed before `ReadoutStrip` mounts, it persists in store until component reads it.

### Error Propagation

- SSE disconnect: connection store → `'reconnecting'` → navbar status dot amber → exponential backoff reconnect
- Scan SSE error: scan store → `'error'` status → log shows error line → readout strip notification
- Bridge poll error: React Query retry (1 attempt) → matter page shows last-known data → readout strip shows `bridge: error`
- Font load failure: IoskeleyMono has `monospace` fallback in font-family stack

---

## Acceptance Criteria

### Functional Requirements

- [ ] Zustand stores replace all React Query state hacks
- [ ] Two-font system applied throughout (no Commit Mono references)
- [ ] Navbar shows slash-path convention with LED active indicator
- [ ] Readout strip shows contextual data per page with scramble animation
- [ ] Notifications display via vertical ticker, hold 3s, return to context
- [ ] Integrations scan section uses ReadoutDisplay log
- [ ] Integration catalog renders as module rack with power states
- [ ] Matter unpaired mode shows QR panel
- [ ] Matter paired mode shows orbital visualization (2 layers: core orb + metadata ring)
- [ ] Orbital shows bridge status + metadata readouts (integration ring is follow-up)

### Non-Functional Requirements

- [ ] `prefers-reduced-motion` disables scramble and ticker animations
- [ ] Screen readers announce final values, not intermediate scramble glyphs
- [ ] `aria-current="page"` on active nav link
- [ ] Module rack keyboard navigable
- [ ] Orbital SVG has proper ARIA roles and labels
- [ ] `bun run system:check --force` passes after every phase
- [ ] No `as any`, no untyped casts

### Quality Gates

- [ ] Screenshot each page state during development (save to `.tmp/screenshots/`)
- [ ] Test rapid SSE events don't cause animation jank
- [ ] Test all connection status states (connected, reconnecting, error)
- [ ] Test scan with 0 results, normal results, and errors
- [ ] Test matter page in unpaired, paired-empty, paired-populated, and error states

---

## Dependencies & Prerequisites

- **zustand** — new dependency, install in Phase 1
- **use-scramble** — new dependency (1kb), install in Phase 3 for ScrambleText
- **motion** v12 — already installed, unused. First real adoption (used only for state-driven animations: notification ticker, paired/unpaired transitions).
- **react-aria-components** — already used throughout. Module rack panels need proper focus management.
- No server changes required. All API endpoints and SSE events remain the same.

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Zustand migration misses a consumer | Medium | High (broken page) | Grep all `['devices']`, `['stream:status']`, `['scan:state']` references. Migration checklist in Phase 1.8. |
| Orbital SVG performance with many devices | Low | Medium | Always count badges (no satellites). Blur filter on core orb only. CSS `transform: rotate()` for ring animation (compositor-friendly). |
| Segment scramble looks janky on slow devices | Low | Medium | Uses `use-scramble` library (handles time-based resolution, cleanup). Respect `prefers-reduced-motion` via subscription. |
| Font removal breaks unexpected component | Low | Low | Global search for `font-commit` and `Commit Mono` before removing. |
| Motion v12 API mismatch (never used before) | Low | Medium | Context7 docs confirm AnimatePresence + exit patterns work in v12. Build ScrambleText in isolation first. |

---

## Implementation Order

Phases are sequential — each builds on the previous:

1. **Phase 1: Zustand** — must complete before Phase 3 (readout strip depends on stores)
2. **Phase 2: Fonts** — independent, can run after Phase 1 or in parallel
3. **Phase 3: Navbar** — depends on Phase 1 (readout store) and Phase 2 (fonts)
4. **Phase 4: Integrations** — depends on Phase 1 (scan store) and Phase 2 (fonts)
5. **Phase 5: Matter** — depends on Phase 2 (fonts), partially on Phase 1 (device store for satellites)

Phases 3 and 4 could run in parallel after Phases 1+2 are done.

---

## Design Defaults (from SpecFlow analysis)

These defaults were identified during spec analysis. They are implementation decisions, not user-facing features:

- **ScrambleText:** uses `use-scramble` library. No custom debounce — `useEffect` on value prop handles changes naturally.
- **Notification:** single slot, 3-second hold. Timer owned by `ReadoutStrip` component (not store). New notification replaces current.
- **Status dot colors:** connected=emerald, reconnecting=amber (pulse), connecting=stone (pulse), error=red (static, no pulse).
- **Initial readout:** `"--"` placeholder, scrambles to real value on first SSE data.
- **Scan log height:** ~120px fixed. Auto-scroll only when user is at bottom; debounce scroll with 100ms trailing.
- **Module grid:** 2/3/4 columns responsive, `aspect-[3/4]` portrait. No blank filler panels.
- **Module connect:** opens `RaisedModal` with `IntegrationFormInner`.
- **Module remove:** confirmation dialog showing device count being removed.
- **Orbital:** ships with 2 layers (core orb + metadata ring). Integration ring with planets is a follow-up.
- **Orbital rotation:** CSS `transform: rotate()` on metadata ring group, 1 revolution per 60s. Core pulse via CSS `@keyframes`.
- **Count badges:** always (no individual satellite dots). Simpler, readable at all viewports.
- **Paired transition:** QR fade out → "COMMISSIONED" 2s → orbital fade in. Reverse transition defined. Interruption during hold cancels and transitions directly.
- **Scan log persistence:** survives navigation (zustand store in memory). "Scan again" clears.
- **Zustand devtools:** enabled in development via `devtools` middleware.
- **SSE batching:** not needed — React 18+ automatic batching suffices. Connection-aware guard discards updates from dying connections.
- **Dark background:** direct class on matter route container, not generic theming.

---

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-03-05-ui-redesign-navbar-integrations-matter-brainstorm.md](docs/brainstorms/2026-03-05-ui-redesign-navbar-integrations-matter-brainstorm.md) — two-font system, slash-path navbar, readout strip, module rack, HAL orbital, zustand adoption scope

### Internal References

- Design language: `docs/plans/2026-03-04-feat-device-card-redesign-2d-pivot-plan.md`
- Instrument controls: `docs/plans/2026-03-04-feat-instrument-panel-controls-plan.md`
- Card shell: `docs/plans/2026-03-04-feat-card-shell-unified-surface-plan.md`
- ReadoutDisplay: `client/src/components/ui/readout-display.tsx`
- Current navbar: `client/src/routes/__root.tsx:28-67`
- SSE handler: `client/src/hooks/useDeviceStream.ts`
- Scan handler: `client/src/hooks/useScanStream.ts`
- Integration cards: `client/src/components/IntegrationForm.tsx`
- Matter page: `client/src/routes/matter.tsx`

### External References

- Zustand v5 docs: createStore, subscribeWithSelector, devtools middleware
- Motion v12 docs: AnimatePresence, exit animations, stagger

---

## Design Addendum — Implementation-Ready Specifications

### Phase 2: Typography Scale (Two-Font System)

The existing system uses `text-2xs` (0.625rem/10px) for Michroma labels. Build a complete scale for both fonts that respects their optical differences — IoskeleyMono reads larger than Michroma at the same size because monospaced fonts have wider x-heights.

**IoskeleyMono scale (body/data/readouts):**

| Token | Size | Use case |
|-------|------|----------|
| `text-2xs` | 10px (0.625rem) | scan log lines, gauge sublabels, tooltip text |
| `text-xs` | 12px (0.75rem) | readout strip values, scan log entries, status text |
| `text-sm` | 14px (0.875rem) | nav items, device names, primary readouts |
| `text-base` | 16px (1rem) | body text (rare — most content is smaller instrument text) |
| `text-lg` | 18px (1.125rem) | gauge hero values, module device counts |
| `text-2xl` | 24px (1.5rem) | ReadoutDisplay `size="lg"` hero readouts |

IoskeleyMono should always use `tracking-tight` or default tracking. Never `tracking-wide` — monospaced fonts already have generous letter spacing built in.

**Michroma scale (labels/headings):**

| Token | Size | Use case |
|-------|------|----------|
| `text-[9px]` | 9px | gauge sub-labels (PORT, LINK — already used in matter.tsx) |
| `text-2xs` | 10px (0.625rem) | control labels (BRT, CCT, FAN), module panel labels |
| `text-xs` | 12px (0.75rem) | section headings (INTEGRATIONS, BRIDGE STATUS), nav sublabels |
| `text-sm` | 14px (0.875rem) | page headings, device name in card header |
| `text-base` | 16px (1rem) | page title (if ever needed — rare) |

Michroma always uses `uppercase tracking-[0.15em]` or wider. The geometric letterforms need generous tracking to breathe — the existing `tracking-[0.2em]` on 9px labels is correct. For section headings at `text-xs`, use `tracking-[0.15em]`.

**Key migration note:** the existing `font-michroma text-sm font-semibold` on device names in `DeviceCard.tsx` is the right pairing. Michroma at 14px with semibold gives enough weight for the geometric face. Do not use Michroma at `text-lg` or larger — it gets too wide and dominates. For anything that needs to be larger than 14px, use IoskeleyMono instead.

---

### Phase 3: Navbar Implementation Details

#### 3.A Elevated Navbar — Shadow & Surface

The current navbar has a single-layer warm shadow that reads flat. The redesign needs depth to feel like a physical control surface floating above the page.

**Multi-layer warm shadow system:**

```css
/* navbar elevated shadow — three layers for realistic depth */
box-shadow:
  /* close shadow — sharp edge separation */
  0 1px 2px rgba(120, 90, 50, 0.06),
  /* mid shadow — primary depth */
  0 4px 16px rgba(120, 90, 50, 0.05),
  /* far shadow — ambient spread */
  0 12px 40px rgba(120, 90, 50, 0.03),
  /* bottom bezel edge — crisp separation line */
  inset 0 -1px 0 rgba(120, 90, 50, 0.08);
```

This follows the existing warm shadow language (`rgba(120,90,50,...)`) from `--shadow-raised` but pushes the spread further. The `inset 0 -1px 0` bottom edge mimics a machined bezel — it is the single most important detail for the "sits above page" feeling.

**Backdrop and background:** keep the existing gradient + `backdrop-filter: blur(12px)` but increase opacity slightly so the navbar surface feels more opaque/solid:

```css
background: linear-gradient(
  to bottom,
  rgba(255, 253, 248, 0.97),  /* was 0.95 — more opaque */
  rgba(245, 242, 236, 0.94)   /* was 0.9 */
);
```

**z-index:** use `z-30` (not `z-10`). The existing system uses `z-50` for modals. The navbar needs to clear any card hover states or tooltips but stay below modals. `z-30` gives room for future intermediate layers.

**Border:** replace the current `border-b border-[rgba(168,151,125,0.12)]` with the inset shadow approach above — the shadow's bottom bezel line is more refined than a CSS border. Remove the explicit border-bottom entirely.

#### 3.B LED Dot Active Indicator

Use CSS `::before` pseudo-element on the active nav link. The dot should feel like a recessed indicator, not a flat colored circle.

**Dimensions and positioning:**
- Dot: `6px` wide, `6px` tall, `border-radius: 50%`
- Position: `left: -14px` from the text start (via `::before` with absolute positioning on the relatively-positioned link)
- Vertical center: `top: 50%; transform: translateY(-50%)`

**Active state (emerald LED lit):**

```css
background: radial-gradient(circle at 35% 30%, #6ee7b7 0%, #34d399 50%, #059669 100%);
box-shadow:
  0 0 4px rgba(52, 211, 153, 0.6),   /* close glow */
  0 0 10px rgba(52, 211, 153, 0.3);  /* far glow */
```

The `radial-gradient` with offset highlight (35% 30%) gives the dot a glass-bead look — a specular highlight on the upper-left as if lit from above. This matches the existing LED bezel pattern in `StatusLed` from matter.tsx.

**Inactive state:** no dot visible. Do not render a dim dot for inactive items — it creates visual noise in a 3-item nav. The active dot is a positive indicator; absence means inactive.

**Transition:** `transition: opacity 150ms ease-out, box-shadow 150ms ease-out`. The dot should appear/disappear cleanly, not slide between positions.

#### 3.C ScrambleText — `use-scramble` Integration

**Use `use-scramble`** (1kb, MIT) instead of a custom RAF loop. The library handles:
- Direct `textContent` mutation (no per-character React state)
- RAF lifecycle and cleanup on unmount/value change
- Time-based resolution (consistent 300-450ms regardless of frame rate)
- `ignore` option to preserve spaces, colons, and other structural characters
- `overflow` option for smooth morphing between old and new text

**Configuration:**

```ts
const { ref } = useScramble({
  text: value,
  speed: 0.6,        // ~400ms total
  tick: 1,            // resolve one character per tick
  step: 2,            // stagger between characters
  scramble: 4,        // scramble cycles before resolving
  seed: 0,            // deterministic scramble
  ignore: [' ', ':'], // preserve structural characters
})
```

**Character set:** `use-scramble` uses alphanumeric by default, which matches the instrument readout aesthetic. Exclude special Unicode, emoji, or box-drawing characters.

**Target total duration:** 300-450ms. Longer than 500ms feels sluggish; shorter than 200ms doesn't give the eye time to read the scramble effect.

**Font loading gate:** check `document.fonts.check('12px IoskeleyMono')` before enabling scramble. If font isn't loaded, show text directly and subscribe to `document.fonts.addEventListener('loadingdone', ...)` to enable scramble for subsequent changes.

**Reduced motion:** subscribe to `matchMedia('(prefers-reduced-motion: reduce)')` via `addEventListener('change', ...)` with cleanup. When active, bypass `use-scramble` and set text directly.

#### 3.D Readout Strip Layout

The strip sits on the right side of the navbar, aligned with the nav items on the left.

**Strip container:**
- `display: flex; align-items: center; gap: 12px` (or `gap-3`)
- `font-ioskeley text-xs` — readout values should be small, secondary to the nav items
- `text-stone-500` default color — readout values are ambient info, not primary content
- `height: 100%` of the navbar — vertically centered naturally

**Status dot (slot 0):**
- 8px diameter circle
- Same radial-gradient glass-bead pattern as the nav LED dot, but with color mapped to connection state
- Connected: emerald gradient + glow
- Reconnecting: amber gradient + `animation: pulse 2s ease-in-out infinite` (Tailwind's `animate-pulse`)
- Connecting: stone gradient + same pulse
- Error: red gradient, no pulse (static red = something is wrong, pulsing red implies recovering)

**Slot separators:** use a thin vertical bar (`|`) character in `text-stone-300` between the status dot and slot 1, and between slot 1 and slot 2. This gives the readout strip a data-display feel without adding DOM complexity.

**Overflow behavior:** on narrow viewports (<640px), hide the readout strip entirely (`hidden sm:flex`). The navbar should collapse to just the nav items on mobile. The readout data is ambient — not critical for navigation.

---

### Phase 4: Module Rack Panel Specifications

#### 4.A Module Panel Sizing & Aspect Ratio

**Target dimensions:** each module panel should feel like a physical unit — taller than wide, like a eurorack module face or a Teenage Engineering PO panel.

- **Aspect ratio:** `aspect-[3/4]` (3:4, portrait) — this gives enough vertical space for the icon, readout, and action button without feeling cramped. No `min-height` — let the aspect ratio handle sizing at all widths. At 2-column mobile (144px wide), 192px tall is perfectly usable.
- **Max content width per module:** let the grid handle it. At 4 columns with `gap-4` on a 1152px container (max-w-6xl), each module is roughly 270px wide, giving 200px tall at 3:4 — feels right

**Grid gaps:**
- `gap-4` (16px) — matches the existing card system spacing
- The gap should feel like the physical spacing between modules in a rack — enough to see the "backplane" (the page background) between units

**Grid definition refinement:**

```
grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4
```

On the 2-column mobile layout, modules will be wider and taller (proportionally) — this is fine. The 3:4 aspect ratio holds at any width.

#### 4.B Module Panel Surface & Power States

**Powered (connected) module surface:**

The module needs to feel distinct from the dashboard `Card` component while sharing the warm surface language. Use a slightly more pronounced border and a subtle inner glow to indicate "powered on."

```css
/* powered module — warm surface with active energy */
background: linear-gradient(to bottom, #fffdf8, #f8f5ee);
border: 1px solid rgba(168, 151, 125, 0.18);  /* slightly stronger than Card's 0.12 */
box-shadow:
  0 1px 2px rgba(120, 90, 50, 0.05),
  0 4px 12px rgba(120, 90, 50, 0.04),
  inset 0 1px 0 rgba(255, 253, 245, 0.8);     /* same inner-glow as Card */
```

**Unpowered (available) module surface:**

Same form factor, muted. Do not use `opacity` to dim — it makes the whole module look broken. Instead, desaturate the surface and reduce shadow depth.

```css
/* unpowered module — idle slot in the rack */
background: linear-gradient(to bottom, #f8f5ee, #f2efea);  /* slightly darker/cooler */
border: 1px solid rgba(168, 151, 125, 0.1);   /* softer border */
box-shadow:
  0 1px 2px rgba(120, 90, 50, 0.03),          /* reduced shadow = less elevation */
  inset 0 1px 0 rgba(255, 253, 245, 0.5);     /* dimmer inner glow */
```

#### 4.C Status LED in Module Panel

The LED should be small and recessed — like a panel-mount indicator, not a button.

- **Size:** 6px circle (same as nav LED dot)
- **Position:** `top-3 right-3` absolute within the module panel
- **Lit (connected):** same radial-gradient as nav LED. Color = emerald for healthy, amber if the integration has errors/warnings
- **Unlit (available):** `bg-stone-300` flat circle, no gradient, no glow. Looks like an empty socket.

#### 4.D Scan Log ReadoutDisplay Sizing

- **Height:** `h-[120px]` (fixed) — enough for ~6-7 lines of `text-xs` IoskeleyMono
- **Width:** full width of the scan section container
- **Overflow:** `overflow-y-auto` with `-webkit-overflow-scrolling: touch` for momentum scrolling on mobile
- **Auto-scroll:** use a `useEffect` with a ref. Only auto-scroll when user is already at bottom (check `scrollTop + clientHeight >= scrollHeight - 20`). If user has scrolled up, don't auto-scroll. Debounce the scroll call with 100ms trailing to avoid queuing multiple smooth animations. Use `scrollBehavior: 'smooth'`.
- **Padding:** use the ReadoutDisplay's existing `px-3 py-2.5` for `size="lg"`. The log entries sit inside this padded cavity.
- **Line format:** use `tabular-nums` on the count values so they right-align cleanly. Consider a CSS grid within each line: `grid-template-columns: 1fr auto` so the brand name is left-aligned and the count/status is right-aligned.

---

### Phase 5: Matter Orbital SVG Specifications

#### 5.A Dark Console Color System

The Matter page needs warm darks — not the cold blue-gray of typical "dark mode." The warm palette should feel like the inside of a 1970s mission control console.

**Warm dark palette:**

| Token | Hex | Use |
|-------|-----|-----|
| `console-bg` | `#1a1914` | page background (already exists as `--color-display-border`) |
| `console-surface` | `#23221c` | panel surfaces, card backgrounds on dark |
| `console-surface-raised` | `#2e2d27` | elevated panels within the dark context |
| `console-border` | `rgba(168, 151, 125, 0.12)` | same border color as light theme — it works in both |
| `console-text` | `#faf0dc` | primary text (already exists as `--color-display-text`) |
| `console-text-muted` | `#a89b82` | secondary labels, metadata |
| `console-text-dim` | `#6b6356` | tertiary, decorative text |

These colors are direct relatives of the existing `--color-display-*` tokens. The ReadoutDisplay already uses `#2e2d27` → `#23221c` gradients and `#1a1914` borders — the dark Matter console is literally "the whole page becomes a ReadoutDisplay."

**Accent colors on dark backgrounds:** the existing emerald/amber/red status colors work on dark backgrounds without modification. Their luminance is high enough for WCAG AA contrast against `#1a1914`.

**Page background transition:** apply `bg-[#1a1914] transition-colors duration-500` directly to the matter route's outermost `<div>` when paired. The navbar stays warm/light (it's in `__root.tsx`, unaffected). No generic theming system — the matter route controls its own background.

#### 5.B SVG Orbital — ViewBox & Responsive Scaling

**ViewBox definition:**

```
viewBox="0 0 500 500"
```

500x500 gives a centered coordinate system where (250, 250) is the origin. All radii are defined relative to this space. The SVG scales naturally via `width: 100%; height: auto; max-width: 500px` on the container.

**Ring radii (in viewBox units):**
- Core orb: `r=30` (60px diameter at 1:1)
- Metadata ring: `r=100` (200px diameter)
- Integration ring: `r=165` (330px diameter)
- Outer edge padding: 500 - 165*2 = 170px total padding, or 85px per side — enough for text labels to not clip

**Responsive container:**

```html
<div class="w-full max-w-[500px] mx-auto aspect-square">
  <svg viewBox="0 0 500 500" class="w-full h-full">
    ...
  </svg>
</div>
```

The `aspect-square` on the container plus `viewBox` on the SVG means it scales perfectly at any width. No JS-based resizing needed.

**Mobile behavior (<640px):** the SVG naturally shrinks. At 320px wide, the orbital is still legible because SVG scales vector-clean. Hide device satellites at this width (they become sub-pixel) and show count badges on integration nodes instead. Use a media query or a container query on the SVG container to toggle satellite visibility:

```css
@media (max-width: 639px) {
  .orbital-satellite { display: none; }
  .orbital-count-badge { display: block; }
}
```

#### 5.C Ring Stroke Patterns

**Metadata ring (inner ring):**
- Stroke: `stroke="#6b6356"` (console-text-dim)
- Stroke width: `1.5` (in viewBox units)
- Dash pattern: `stroke-dasharray="4 8"` — short dashes with generous gaps, creates a tachometer-scale feeling
- Animated rotation: use CSS `transform: rotate()` on a `<g>` wrapping the ring (NOT `stroke-dashoffset` which triggers SVG repaint every frame). `transform: rotate()` is compositor-friendly and runs on the GPU:

```css
@keyframes ring-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.metadata-ring-group {
  animation: ring-rotate 60s linear infinite;
  transform-origin: 250px 250px;
  will-change: transform;
}
```

Wrap the dashed `<circle>` in a `<g class="metadata-ring-group">` so the rotation applies to the group. The visual effect (dashes sliding along the ring) is nearly identical to `stroke-dashoffset` rotation but eliminates the permanent 60fps repaint loop.

**Integration ring (outer ring):**
- Stroke: `stroke="#3d3a33"` (subtle, barely visible)
- Stroke width: `1`
- Dash pattern: `stroke-dasharray="2 6"` — finer, more subtle than metadata ring
- No animation — this ring is a static track for the integration planets

**Empty state ring (paired, zero bridged):**
- Same stroke as integration ring but with `stroke-dasharray="1 12"` — very sparse dots, like an empty track waiting for content
- `opacity: 0.4` to further recede

#### 5.D Node Positioning Math

**Integration planets on the ring:** evenly spaced using angle math.

```
for each integration i of N:
  angle = (i / N) * 2 * PI - PI/2    // start from top (-PI/2)
  x = 250 + 165 * cos(angle)          // center + radius * cos
  y = 250 + 165 * sin(angle)          // center + radius * sin
```

Starting from `-PI/2` (top of circle, 12 o'clock position) is more visually natural than starting from the right (0 radians).

**Device satellites around their parent planet:**

```
for each device j of M (belonging to integration i):
  satelliteAngle = (j / M) * 2 * PI
  satelliteRadius = 18    // cluster radius around the planet center
  sx = planetX + satelliteRadius * cos(satelliteAngle)
  sy = planetY + satelliteRadius * sin(satelliteAngle)
```

`satelliteRadius = 18` in viewBox units keeps clusters tight around their planet without overlapping adjacent planets (minimum inter-planet distance at 3 integrations: `2 * 165 * sin(PI/3) = 286` viewBox units — plenty of room).

**Planet node sizing:**
- Circle: `r=16` (32px diameter at 1:1) — large enough for a brand icon
- Touch target: transparent circle `r=22` behind the visible node for 44px minimum tap area at 1:1 scale

**Satellite dot sizing:**
- Online: `r=3` with glow filter
- Offline: `r=2.5`, `fill="#6b6356"`, no glow

#### 5.E Core Orb (Center)

**Radial gradient for the glowing orb effect:**

```svg
<defs>
  <radialGradient id="core-orb" cx="40%" cy="35%">
    <stop offset="0%" stop-color="#6ee7b7" />    <!-- highlight -->
    <stop offset="50%" stop-color="#34d399" />    <!-- mid -->
    <stop offset="100%" stop-color="#059669" />   <!-- edge -->
  </radialGradient>
  <filter id="core-glow">
    <feGaussianBlur stdDeviation="6" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
</defs>
<circle cx="250" cy="250" r="30" fill="url(#core-orb)" filter="url(#core-glow)" />
```

The off-center gradient origin (`cx=40% cy=35%`) creates the same glass-bead specular highlight as the nav LED and StatusLed components. The `feGaussianBlur` glow simulates light emission.

**Status color mapping:** swap gradient stops for each state:
- Running: emerald (`#6ee7b7` → `#34d399` → `#059669`)
- Starting: amber (`#fde68a` → `#fbbf24` → `#d97706`)
- Error: red (`#fca5a5` → `#ef4444` → `#dc2626`)
- Stopped: stone (`#d6d3cd` → `#a8a29e` → `#78716c`), no glow filter

**Pulse animation (running state):** use CSS `@keyframes` (not motion — decorative, infinite animations should run on the compositor thread):

```css
@keyframes core-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.core-orb {
  animation: core-pulse 3s ease-in-out infinite;
  transform-origin: 250px 250px;
  will-change: transform;
}
```

The 5% scale change is subtle — just enough to read as "alive" without being distracting. Reserve motion for state-driven animations (paired/unpaired transitions) where React state changes drive the animation lifecycle.

**Error state:** either stop the pulse entirely (static red = broken) or increase pulse speed to `duration: 1.5` for urgency. Recommend static — a calm red dot reads as "fault detected, awaiting attention" rather than "actively failing."

---

### Micro-Interaction Details

#### LED Dot Animation

The nav LED dot and module panel LED share the same visual language. Define a reusable pattern:

**Lit LED (CSS):**
```css
.led-lit {
  background: radial-gradient(circle at 35% 30%, var(--led-highlight), var(--led-mid) 50%, var(--led-edge) 100%);
  box-shadow: 0 0 4px var(--led-glow-close), 0 0 10px var(--led-glow-far);
}
```

Color tokens per state:
- Emerald: `--led-highlight: #6ee7b7; --led-mid: #34d399; --led-edge: #059669; --led-glow-close: rgba(52,211,153,0.6); --led-glow-far: rgba(52,211,153,0.3)`
- Amber: `--led-highlight: #fde68a; --led-mid: #fbbf24; --led-edge: #d97706; --led-glow-close: rgba(251,191,36,0.5); --led-glow-far: rgba(251,191,36,0.25)`
- Red: `--led-highlight: #fca5a5; --led-mid: #ef4444; --led-edge: #dc2626; --led-glow-close: rgba(239,68,68,0.5); --led-glow-far: rgba(239,68,68,0.25)`

**Unlit LED:** `background: #a8a29e; box-shadow: none` — flat, no gradient, no glow. Reads as "socket present but unpowered."

#### Status Dot Pulse (Readout Strip)

The connection status dot pulses during `connecting` and `reconnecting` states. Use Tailwind's `animate-pulse` which runs `opacity: [1, 0.5, 1]` over 2 seconds. This is gentler than a scale pulse and works well at 8px size where scale changes are barely perceptible.

Do not pulse the error state — static red is more alarming than pulsing red, which can be mistaken for "recovering."

#### Module Power-State Transition

When a module transitions from unpowered to powered (user connects an integration), animate the change:

1. Status LED: transition from flat stone to lit emerald over 300ms (`transition: background 300ms ease-out, box-shadow 300ms ease-out`)
2. Brand mark: `transition: opacity 300ms ease-out` from 0.5 to 1
3. Readout display: the ScrambleText component handles the `"--"` → `"6"` transition naturally via the scramble animation
4. Surface: border and shadow changes via `transition: border-color 300ms ease-out, box-shadow 300ms ease-out`

These all fire simultaneously — the module "powers on" as a unified event. 300ms is fast enough to feel responsive but slow enough for the eye to register the change.

#### Vertical Ticker (Notification Mode)

The plan specifies `y: 12` for enter/exit offset. Refine this:
- Entry: `initial={{ y: 8, opacity: 0 }}` — 8px is enough vertical travel to read as "sliding up from below" without being theatrical
- Exit: `exit={{ y: -8, opacity: 0 }}` — mirrors entry direction
- Duration: 200ms with `ease: [0.4, 0, 0.2, 1]` (Material's standard easing) — slightly quicker than the plan's 250ms since these are small text elements
- Between notification exit and readout scramble-back: 100ms delay so the slot isn't empty for a perceptible moment. The scramble animation fills the gap naturally.

---

### Color System Consistency Notes

The existing design system is built on a warm stone palette. Key color values to maintain consistency:

- **Page background:** `#f5f2ec` (warm paper)
- **Card surface:** `#fffdf8` (surface-warm, slight cream)
- **Border color:** `rgba(168, 151, 125, 0.12)` (warm taupe at low opacity — used everywhere)
- **Shadow warmth:** all shadows use `rgba(120, 90, 50, ...)` — never use black or cool gray shadows
- **Display cavity:** `#2e2d27` → `#23221c` gradient with `#1a1914` border (ReadoutDisplay)
- **Display text:** `#faf0dc` (warm parchment glow)

The dark Matter console reuses the display cavity colors as the page background. This creates a visual metaphor: the entire page becomes the inside of a ReadoutDisplay. The warm undertone (`27`, `24`, `1c` in the blue channel vs higher values in red/green) prevents the dark theme from feeling cold.

**Do not introduce:**
- Blue-tinted dark backgrounds (`#1a1a2e`, `#0f172a` — these are cold Tailwind defaults)
- Pure black backgrounds (`#000`, `#111`) — too stark, no warmth
- Cool gray shadows (`rgba(0,0,0,...)`) for the dark theme — continue using the warm shadow formula even on dark backgrounds, just increase opacity slightly

The existing `ReadoutDisplay` scanline overlay (`repeating-linear-gradient` at `opacity-[0.04]`) should also be considered for the dark Matter page background — a very subtle scanline texture across the full page at `opacity-[0.02]` would reinforce the console/CRT atmosphere without being distracting.
