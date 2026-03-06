---
title: "feat: Integrations Page — Mission Control Console Refinement"
type: feat
status: completed
date: 2026-03-05
origin: docs/brainstorms/2026-03-05-integrations-page-refinement-brainstorm.md
deepened: 2026-03-05
---

# Integrations Page — Mission Control Console Refinement

## Enhancement Summary

**Deepened on:** 2026-03-05
**Agents used:** TypeScript reviewer, performance oracle, architecture strategist, pattern recognition specialist, code simplicity reviewer, frontend race conditions reviewer, spec flow analyzer, best practices researcher
**Context7 docs:** React Aria Button, use-scramble range API

### Key Improvements from Deepening
1. Fixed plan contradiction: error timeout (3s flash vs persistent) — resolved to persistent-until-retry
2. Added RESCAN SSE race condition mitigation (scan session ID)
3. Added `scanlineIntensity` prop to ReadoutDisplay instead of className override hack
4. Specified `unicode-range` @font-face fallback for braille glyphs
5. Verified WCAG AA: stone-600 on #fffdf8 = 7.50:1 contrast — passes AAA
6. Added accessibility gaps: BrailleWave `aria-hidden`, ScrambleText live region debouncing, TerminalButton bracket exclusion from accessible name
7. Simplified error tracking from `Set<string>` to `failedBrand: string | null`
8. Added per-brand `connectingBrands` state to handle concurrent mutation feedback
9. Specified ScanLog entry keys as brand-only (not brand-status) for ScrambleText stability
10. Added `transition-[border-color,background]` instead of `transition-all` on ModulePanel

### Resolved Questions
- BrailleWave stays as separate `ui/` component (3 consumers justified: ScanLog, potential loader reuse, separation of concern for reduced-motion handling)
- TerminalButton: new component (correct — wildly different visual from RaisedButton)
- ConsolePanelLabel: update in place (WCAG fix benefits all consumers)
- Error state: page-level state (appropriate — transient UI, clears on navigation)
- Scan is sequential per brand (one BrailleWave active at a time in ScanLog)

---

## Overview

Refine the integrations page to capture the Sony Making Modern / 80s retro industrial aesthetic established in the dashboard. The current implementation uses the right typography but lacks surface treatments, physical metaphors, and character — it reads as "geometric fonts on a web app" rather than a mission control console.

## Problem Statement

Phase 4 shipped functional integrations with ScanLog + ModulePanel, but:
- Module panels are too flat and generic (aspect-[3/4] portrait cards with centered icon)
- Section headers fail WCAG color contrast (`text-stone-400` at 9px)
- Scan log lacks personality — no scramble animations, no wave indicators
- Buttons are plain web controls — no console/terminal character
- Brand icons are just stamps floating on the card

## Proposed Solution

Transform every surface element to feel like it belongs on a 1970s-80s mission control console:
1. **ScanLog** -> Fallout-style terminal with braille wave animation, useScramble, blinking cursor
2. **ModulePanel** -> CRT screen station with recessed LED well, engraved labels, terminal buttons
3. **Controls** -> Terminal-style `[BUTTON]` inverse text
4. **Headers** -> Engraved into surface (stone-600 + inset text-shadow)

(See brainstorm: `docs/brainstorms/2026-03-05-integrations-page-refinement-brainstorm.md`)

---

## Pre-Implementation: RESCAN SSE Race Fix

**Before starting Phase 1**, fix the existing race condition in `useScanStream.ts`.

When `startScan()` is called while a scan is active, `cancel()` closes the old EventSource. However, already-buffered SSE events can still fire on the old `onmessage` handler after the store is reset, injecting stale brand results into the fresh scan.

**Fix:** Null out the old EventSource's `onmessage` before calling `.close()`:

```ts
const cancel = () => {
  const es = esRef.current
  if (es) {
    es.onmessage = null   // prevent buffered events from firing
    es.onerror = null
    es.close()
    esRef.current = null
  }
}
```

Alternative: tag each scan session with a monotonic counter and have `onmessage` drop events from stale sessions.

**Acceptance criteria:**
- [x] Rapid RESCAN does not show phantom entries from previous scan
- [x] `bun run system:check --force` passes

---

## Implementation Phases

### Phase 1: Foundation — TerminalButton + BrailleWave + Engraved Headers

New primitives that both ScanLog and ModulePanel will consume.

#### 1.1 TerminalButton Component

**New component:** `client/src/components/ui/terminal-button.tsx`

Interactive inverse-text element styled as a terminal command. Uses React Aria `Button` for keyboard accessibility (Enter/Space).

```
[RESCAN]  [CONFIGURE]  [REMOVE]  [CONNECT]
```

**Styling (use `tailwind-variants` tv() for variant management, consistent with RaisedButton pattern):**
- IoskeleyMono font, uppercase
- Brackets rendered as part of the visual label (literal `[` and `]` characters)
- Default: `text-display-text/70` on transparent — subtle but readable
- Hover: `text-display-text bg-display-text/10` — inverse highlight brightens
- Press: `text-display-text bg-display-text/20` — deeper inverse
- Disabled: `text-display-text/30 cursor-default` — dimmed, non-interactive
- Destructive variant (for [REMOVE]): `text-red-400/70`, hover `text-red-400 bg-red-400/10`
- Focus: `ring-1 ring-display-text/30 ring-offset-0` — minimal, stays in the terminal world

**Props:**
```ts
type TerminalButtonProps = Readonly<{
  label: string            // text between brackets
  onPress: () => void
  variant?: 'default' | 'destructive'
  isDisabled?: boolean
}>
```

**Render:** `<AriaButton aria-label={label}>[{label}]</AriaButton>` — brackets are visual only. The `aria-label` excludes brackets so screen readers announce "RESCAN" not "left bracket RESCAN right bracket".

**React Aria `onPress` signature note:** React Aria Button's `onPress` expects `(e: PressEvent) => void`. Wrap the consumer's `() => void` callback: `onPress={() => props.onPress()}` to avoid type mismatch.

**No `forwardRef` needed** — TerminalButton triggers actions directly, never serves as a DialogTrigger anchor.

### Research Insights: TerminalButton

**React Aria Button accessibility:**
- Supports `Enter` and `Space` key activation out of the box
- `onPress` fires on pointer up (not down), matching native button behavior
- `isDisabled` prop handles `aria-disabled` and pointer-events automatically
- Focus ring: React Aria exposes `isFocusVisible` render prop for keyboard-only focus rings. Use `composeRenderProps` for conditional focus styling if needed, or keep the simpler `focus-visible:ring-1` Tailwind approach.

#### 1.2 BrailleWave Component

**New component:** `client/src/components/ui/braille-wave.tsx`

Rolling dot-matrix wave animation using braille height progression.

**Braille height levels (simplified from 6 to 4 — visual difference at 12px font is negligible):**
```
U+2800 (empty)
U+28C0 (bottom row)
U+28F6 (bottom 3 rows)
U+28FF (all 8 dots, full)
```

**Wave shape:** 9-character symmetric pulse that scrolls right:
```
frame 0: ⠀⣀⣶⣿⣶⣀⠀⠀⠀
frame 1: ⠀⠀⣀⣶⣿⣶⣀⠀⠀
frame 2: ⠀⠀⠀⣀⣶⣿⣶⣀⠀  (wraps)
```

**Animation:** `useEffect` with `setInterval` at ~120ms per frame. The wave array shifts by 1 position each tick, wrapping around.

**Interval cleanup — three cases handled by one `useEffect`:**
1. `isActive` becomes `true` — start interval
2. `isActive` becomes `false` — clear interval via cleanup return
3. Component unmounts while `isActive` — clear interval via cleanup return

The `useEffect` depends on `[isActive]`. The cleanup function calls `clearInterval`. This single pattern covers all three cases.

**Props:**
```ts
type BrailleWaveProps = Readonly<{
  isActive: boolean     // renamed from `active` to match codebase boolean prop convention (isOn, isDisabled, isActive)
  className?: string
}>
```

**Reduced motion:** When `prefers-reduced-motion: reduce`, render static `SCANNING...` text instead of animated braille. Remove animation entirely — do not slow it down (users with vestibular disorders need zero motion, not reduced motion).

**Font fallback for braille glyphs:** IoskeleyMono may not include the U+2800-U+28FF range. Add to `index.css`:

```css
@font-face {
  font-family: 'BrailleFallback';
  src: local('DejaVu Sans'), local('Segoe UI Symbol'), local('Apple Braille');
  unicode-range: U+2800-28FF;
}
```

Then on the BrailleWave component: `font-family: 'IoskeleyMono', 'BrailleFallback', monospace`. Or apply the fallback inline on the wave span element only.

**Accessibility:** The braille characters are decorative. Wrap in `aria-hidden="true"` with a visually hidden `<span className="sr-only">Scanning</span>` for screen readers.

### Research Insights: BrailleWave

**setInterval vs requestAnimationFrame:**
- At 8fps for a text-character swap, `setInterval` is simpler and appropriate. rAF would require a manual timestamp accumulator to throttle to 8fps — added complexity for zero benefit at this frame rate.
- In background tabs, `setInterval` is throttled by browsers (Chrome: 1s, eventually 1min). This is fine — the wave is not visible anyway.
- Scan is sequential (one brand at a time), so typically only one BrailleWave is active at once. No concern about multiple competing intervals.

**Performance:** ~8 re-renders/second of a 9-character text span is trivially cheap. No layout, no DOM measurement, just text node updates.

#### 1.3 Engraved Section Headers

**Update `ConsolePanelLabel` in place** (do not create a separate EngravedLabel — WCAG fix benefits all consumers):

- Text color: `text-stone-600` (up from `text-stone-400` for WCAG AA)
- Inset text-shadow: `text-shadow: 0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)` — dark shadow above + bright highlight below simulates stamped-into-surface
- Keep Michroma font, uppercase, letter-spacing
- Keep divider line

Apply to both section headers ("NETWORK SCAN", "INTEGRATIONS", "ADDITIONAL DEVICES") on the integrations page.

### Research Insights: Engraved Headers

**WCAG contrast verification:**
- stone-600 (#57534e) on #fffdf8 = **7.50:1 contrast ratio**
- Passes WCAG AA (4.5:1) and AAA (7:1) for normal text
- At 10px (0.625rem), text is NOT "large text" per WCAG (large = 18pt/24px or 14pt/18.5px bold). Requires the stricter 4.5:1 ratio. We pass easily.
- **text-shadow is NOT factored into WCAG contrast calculations** per the spec. Measured foreground vs background only.

**Letterpress text-shadow:**
- Two-shadow approach (`0 -1px 0 dark` + `0 1px 0 light`) is stronger than single highlight
- `blur-radius: 0` for crisp stamped edges
- On light backgrounds: dark shadow UP, light shadow DOWN

**Acceptance criteria:**
- [x] TerminalButton renders with bracket notation and `aria-label` excluding brackets
- [x] TerminalButton uses tv() for variant management
- [x] TerminalButton destructive variant shows red tint
- [x] BrailleWave animates a rolling 9-char wave with 4 height levels
- [x] BrailleWave respects prefers-reduced-motion (static "SCANNING..." text)
- [x] BrailleWave has `aria-hidden="true"` with sr-only text alternative
- [x] BrailleWave renders correctly even if IoskeleyMono lacks braille glyphs (fallback font)
- [x] ConsolePanelLabel updated with engraved text-shadow
- [x] Section headers pass WCAG AA contrast (7.50:1 verified)
- [x] `bun run system:check --force` passes

---

### Phase 2: ScanLog Redesign

Rewrite `client/src/components/ScanLog.tsx` with terminal personality.

#### 2.1 ReadoutDisplay Scanline Enhancement

The ReadoutDisplay already has scanline texture at 0.04 opacity. For the ScanLog, we need slightly more visible phosphor-tinted scanlines.

**Instead of className override (won't work — scanlines are inline `style` on an inner div), add a `scanlineIntensity` prop to ReadoutDisplay:**

```ts
interface ReadoutDisplayProps {
  // ... existing props
  scanlineIntensity?: number  // default 0.04, ScanLog passes 0.06
  scanlineTint?: string       // default 'rgba(255,255,255,0.5)', ScanLog passes phosphor green
}
```

ScanLog passes: `scanlineIntensity={0.06} scanlineTint="rgba(180, 240, 200, 0.06)"`

This keeps the ReadoutDisplay primitive self-contained and avoids leaking implementation details.

### Research Insights: Scanlines

**Performance:** `repeating-linear-gradient` is rasterized once and cached as a paint layer. Multiple instances may share cached tiles. At 0.06 alpha on 2px stripes, this is cheaper than an image texture. No concern.

#### 2.2 Log Line Format with useScramble

Each log line uses ScrambleText for its text content. When a new brand starts scanning, the line text scrambles then resolves. When the brand completes, the count value scrambles in.

**Line format per brand:**

| State | Left column | Right column |
|-------|-------------|--------------|
| Scanning | `scanning {brand}...` | `<BrailleWave />` (9 chars) |
| Found | `scanning {brand}` | `{count} found` (scrambled in) |
| Error | `scanning {brand}` | `ERROR` (red, scrambled in) |
| Done | `scan complete` | (no count — clean) |

**"scan complete" line:** Colored emerald (`text-emerald-400`). No count appended — just the clean statement.

**All-brands-errored case:** If every `scan:complete` event arrives with an error, show `scan failed` in `text-red-400` instead of emerald "scan complete". Check `brandResults.every(r => r.error)`.

**Incomplete brands on SSE drop:** When `es.onerror` fires, brands that never received `scan:complete` should be marked as errored in the ScanLog. Add to the `buildLogEntries` logic: if `status === 'error'` and a brand has no result, render it as error state.

**Key stability for ScrambleText:** Use `entry.brand` as the key (not `${entry.brand}-${entry.status}`). Status changes should trigger prop updates to ScrambleText, not remounts — this preserves the useScramble hook state and allows smooth text transitions.

**Blinking cursor:** Render `U+2588` after the last active scanning line. CSS animation:
```css
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.scan-cursor { animation: cursor-blink 1s step-end infinite; }
```

Only visible during `status === 'scanning'`. Pure CSS, zero JS cost, runs on compositor thread.

**ScrambleText and aria-live:** The ScanLog has `aria-live="polite"`. ScrambleText animates intermediate characters rapidly. To prevent screen reader flooding:
- ScrambleText's animated span already has `aria-hidden="true"`
- The `<span className="sr-only" aria-live="polite">` renders the final text
- This existing pattern is correct — verify it works when multiple ScrambleText instances update simultaneously

#### 2.3 Inline [RESCAN] Terminal Button

At the bottom of the log, render a `TerminalButton` with label "RESCAN":
- Visible in all states (idle, done, error, scanning)
- During scanning: `isDisabled={true}` (dimmed, non-interactive)
- On press: calls `onRescan()` callback prop

**ScanLog prop change:** Add `onRescan?: () => void` as an optional prop. When provided, the [RESCAN] button renders. When absent, no button. This preserves backward compatibility if ScanLog is ever used in a read-only context.

Replaces the external "Scan Again" `RaisedButton` that currently sits above the log.

#### 2.4 Zero-Result Help Text

When scan completes with 0 total devices, show help text below the ReadoutDisplay (outside the CRT window):
```
No new devices detected. Make sure your hubs are powered on and connected to the network.
```
Style: `font-ioskeley text-2xs text-stone-400 tracking-wide` — same as current.

**Acceptance criteria:**
- [x] ReadoutDisplay accepts `scanlineIntensity` and `scanlineTint` props
- [x] Scan log uses enhanced scanlines via props (not className hack)
- [x] Each brand line uses ScrambleText with brand-only keys
- [x] BrailleWave appears in the right column while a brand is scanning
- [x] Wave resolves to count/error when brand completes
- [x] Blinking cursor visible during active scan
- [x] "scan complete" in emerald, no count; "scan failed" in red when all brands error
- [x] Incomplete brands on SSE drop render as error
- [x] [RESCAN] inline at bottom via optional `onRescan` prop, disabled during scan
- [x] Zero-result scan shows help text
- [x] Re-scan clears log and restarts (no phantom entries from prior scan)
- [x] Screen reader users get clean announcements (no scramble gibberish)
- [x] `bun run system:check --force` passes

---

### Phase 3: ModulePanel Redesign — CRT Station

Rewrite `client/src/components/ModulePanel.tsx` as a mission control station.

#### 3.1 Module Layout

Remove `aspect-[3/4]`. Content determines height. Internal padding keeps modules consistent.

```
+-----------------------------+
|  o (recessed LED well)      |
|                             |
|  +-------------------------+|
|  |   brand icon            ||  <- CRT screen
|  |   6 devices             ||    (ReadoutDisplay)
|  |   CONNECTED             ||
|  +-------------------------+|
|                             |
|  HUE ---------------------- |  <- engraved label
|  [CONFIGURE]  [REMOVE]      |  <- terminal buttons
+-----------------------------+
```

**Performance: replace `transition-all` with explicit properties.** `transition-all` on an element with 7-layer `box-shadow` forces expensive per-frame shadow repainting. Use:
```
transition-[border-color,background,opacity] duration-300
```
Only transition properties that actually change between powered/unpowered states.

#### 3.2 Recessed LED Well

Replace the current flat `ModuleLed` with a recessed indicator. Extract as a named internal component `RecessedLed` (not inline JSX) for maintainability:

```tsx
function RecessedLed({ lit, error }: Readonly<{ lit: boolean; error?: boolean }>) {
  // dark well with inset shadow + LED dot with radial gradient
}
```

The LED dot sits inside a dark inset ring that looks like a panel-mount indicator socket. Same radial-gradient specular highlight as nav LED dots.

**Style details:**
- Well: `background: '#23221c'`, `boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.3)'`
- Dot: radial-gradient with specular highlight, conditional glow shadow when lit

#### 3.3 CRT Screen Window

A ReadoutDisplay container as the module's primary info display, with enhanced scanlines via the `scanlineIntensity` prop from Phase 2.1.

**CRT content by state:**

| State | Icon | Count | Status |
|-------|------|-------|--------|
| Connected, devices > 0 | Full opacity | `{count}` | `CONNECTED` |
| Connected, 0 devices | Full opacity | `0` | `NO DEVICES` |
| Available | `opacity-40` | `--` | (empty) |
| Error | `opacity-40` | `--` | `ERROR` in red |

Note: "Connected, 0 devices" is NOT a separate discriminated variant — it is the `connected` branch with `props.deviceCount === 0`, rendered as conditional text.

**Error state:** When a discovery-only `[CONNECT]` fails, the CRT shows `ERROR` in red (`text-red-400`) with a `[RETRY]` terminal button below. **The error state persists until the user retries or navigates away — no auto-dismiss timeout.** No toast needed — feedback stays within the console paradigm.

```ts
// ModulePanel discriminated union — third variant for error
type ModulePanelProps = Readonly<
  | { state: 'connected'; integration: ConfiguredIntegration; deviceCount: number; meta: IntegrationMeta; onConfigure: () => void; onRemove: () => void }
  | { state: 'available'; meta: IntegrationMeta; onSubmit: (brand: string, config: Record<string, string>) => Promise<void> }
  | { state: 'error'; meta: IntegrationMeta; errorMessage: string; onRetry: () => void }
>
```

The `errorMessage` field allows displaying context beyond generic "ERROR" — useful for screen reader `aria-live` regions or future tooltip expansion.

**CRT accessibility:** Add `aria-label` to the ReadoutDisplay summarizing the module state: e.g. "Hue: 6 devices connected" or "Elgato: connection error". This exposes module state to assistive technology.

**Powered vs unpowered CRT surface:**
- Powered: standard ReadoutDisplay glow (warm cream text, backlit LCD)
- Unpowered: same dark cavity but `glowIntensity={0}` — text is dimmer, no backlight warmth

#### 3.4 Engraved Faceplate Label

Brand name below the CRT screen, using the updated ConsolePanelLabel:
- `font-michroma text-2xs text-stone-600 uppercase tracking-[0.15em]`
- `text-shadow: 0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)`
- Divider line after the label (ConsolePanelLabel pattern)

#### 3.5 Terminal Button Actions

Below the engraved label, render terminal buttons:

**Connected module:**
- `[CONFIGURE]` — opens modal (hidden for `discoveryOnly` brands)
- `[REMOVE]` — destructive variant, opens confirmation modal

**Available module:**
- `[CONNECT]` — opens modal (or triggers direct connect for discoveryOnly)

**Error module:**
- `[RETRY]` — clears error, re-attempts connect

**Layout:** `flex gap-2` — buttons sit inline, left-aligned.

**Stabilize callback references:** The `onRetry`, `onConfigure`, and `onRemove` callbacks defined inline in `.map()` create new references every render. When `failedBrand` state changes, all ModulePanels re-render. Use `useCallback` with brand-keyed closures or extract a `ModulePanelWrapper` component.

#### 3.6 Module Surface

Keep the warm panel surface from the current implementation:
- Powered: `linear-gradient(to bottom, #fffdf8, #f8f5ee)` with subtle border
- Unpowered: slightly dimmer gradient, softer border
- Transition between states: `transition-[border-color,background,opacity] duration-300` (NOT `transition-all`)

No `aspect-[3/4]` — height is determined by content. Modules in the same grid row will align to the tallest module (CSS grid `align-items: stretch`).

**Grid:** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4` (unchanged).

### Research Insights: ModulePanel

**ReadoutDisplay layer count:** With the CRT screen added, each module has ~2 ReadoutDisplays (CRT + count readout). At 10 modules = ~20 instances = ~120 overlay divs. On desktop this is fine. Consider whether the small `size="sm"` count readout inside the CRT still needs all 6 overlay layers — scanlines and vignette are invisible at 20px height. A future optimization could skip some overlays at `size="sm"`, but not blocking for this plan.

**Concurrent mutations:** If user clicks [CONNECT] on brand A and B simultaneously, `useMutation` tracks only the latest call's state. Track per-brand in-flight state explicitly (see Phase 5.4).

**Acceptance criteria:**
- [x] Module panels have no fixed aspect ratio
- [x] `transition-[border-color,background,opacity]` instead of `transition-all`
- [x] RecessedLed extracted as named component with inset shadow
- [x] CRT screen shows brand icon + count + status inside ReadoutDisplay with `scanlineIntensity`
- [x] CRT has `aria-label` summarizing module state
- [x] Powered CRT glows, unpowered CRT is dim
- [x] 0-device connected state shows "NO DEVICES" (same connected branch, conditional text)
- [x] Error state shows ERROR in red with [RETRY], persists until retry or navigation
- [x] Error variant includes `errorMessage: string` field
- [x] Engraved label with two-shadow text-shadow
- [x] [CONFIGURE] hidden for discoveryOnly brands
- [x] Terminal buttons work with keyboard (Enter/Space)
- [x] `bun run system:check --force` passes

---

### Phase 4: Additional Devices Section Restyle

The "Additional Devices" section (devices from already-connected brands found during scan) stays but gets the terminal treatment.

#### 4.1 Terminal-Style Device Entries

Replace the current `AdditionalDeviceCard` (emerald gradient card) with a simpler terminal-style row:

```
  * Elgato Key Light Air                          [ADD]
```

- Left: braille dot `*` as a bullet
- Middle: device label in IoskeleyMono
- Right: `[ADD]` terminal button

Render inside a subtle container (not a full Card — just a row with bottom border):
```tsx
<div className="flex items-center justify-between py-2 border-b border-stone-200/40">
```

**Error handling for [ADD]:** The current `addDeviceMutation` has no error UI. When [ADD] fails, show inline `ERROR` text (red, IoskeleyMono) on the affected row replacing the [ADD] button, with a [RETRY] button. This matches the console paradigm — no toast.

#### 4.2 Section Header

Uses the updated ConsolePanelLabel from Phase 1.3: `ADDITIONAL DEVICES`

**Acceptance criteria:**
- [x] Additional devices render as terminal rows, not gradient cards
- [x] [ADD] terminal button triggers device addition
- [x] [ADD] failure shows inline ERROR + [RETRY] on the row
- [x] Engraved section header
- [x] `bun run system:check --force` passes

---

### Phase 5: Page Layout + Wiring

Update `client/src/routes/integrations.tsx` to wire everything together.

#### 5.1 Remove External Scan Button

The `RaisedButton` "Scan Again" above the ScanLog is removed. The inline `[RESCAN]` inside ScanLog handles this via `onRescan` prop.

#### 5.2 Section Headers

Replace all `<span className="font-michroma text-[9px] text-stone-400 ...">` with `ConsolePanelLabel` component (now engraved from Phase 1.3).

#### 5.3 Configure Modal Flow

When a connected module's `[CONFIGURE]` is pressed, open the same `IntegrationFormInner` modal. The current `configuringBrand` state + `DialogTrigger` pattern is preserved.

#### 5.4 Error and Loading State for Discovery-Only Connect

**Simplified error tracking (from `Set<string>` to single brand):**

```ts
const [failedBrand, setFailedBrand] = useState<{ brand: string; message: string } | null>(null)
```

Given this is a personal IoT hub with 2-3 available brands, concurrent connects are not realistic. A single `failedBrand` is simpler than a `Set<string>` and avoids the immutability trap (React's `Object.is` comparison doesn't detect Set mutations — every update requires creating a new Set).

**Per-brand connecting state (for button feedback):**

```ts
const [connectingBrand, setConnectingBrand] = useState<string | null>(null)
```

When `[CONNECT]` is pressed:
1. Set `connectingBrand` to the brand
2. Fire `addMutation.mutateAsync`
3. On success: clear `connectingBrand`, invalidate queries
4. On error: clear `connectingBrand`, set `failedBrand`

The module CRT can show a brief "CONNECTING..." status while `connectingBrand` matches.

**Clear errors on rescan:** When `[RESCAN]` fires, clear `failedBrand` so error states don't persist across scan sessions.

When error is set for a brand, render `ModulePanel` with `state="error"`, `errorMessage`, and `onRetry` that clears the error and retries.

#### 5.5 Clean Up `as` Casts

While restructuring `integrations.tsx`, fix the existing `as` casts on Eden Treaty error values (lines 25, 48):

```ts
// Before
(error.value as { message?: string })?.message

// After — use unknown + type narrowing
const msg = typeof error.value === 'object' && error.value !== null && 'message' in error.value
  ? (error.value as { message: string }).message
  : 'Failed to fetch integrations'
```

Or extract a small utility: `extractErrorMessage(error.value): string`.

**Acceptance criteria:**
- [x] External "Scan Again" button removed
- [x] All section headers use engraved ConsolePanelLabel
- [x] Configure modal works from [CONFIGURE]
- [x] Discovery-only [CONNECT] shows CONNECTING... state on CRT
- [x] Connection failure shows CRT error with [RETRY] (persistent, no timeout)
- [x] [RESCAN] clears failedBrand error state
- [x] Callback references stabilized (useCallback or wrapper component)
- [x] `as` casts replaced with type-safe narrowing
- [x] Full page layout matches console aesthetic
- [x] `bun run system:check --force` passes

---

## CSS Additions

Add to `client/src/index.css`:

```css
/* braille font fallback for BrailleWave */
@font-face {
  font-family: 'BrailleFallback';
  src: local('DejaVu Sans'), local('Segoe UI Symbol'), local('Apple Braille');
  unicode-range: U+2800-28FF;
}

/* blinking terminal cursor */
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.scan-cursor {
  animation: cursor-blink 1s step-end infinite;
}

@media (prefers-reduced-motion: reduce) {
  .scan-cursor { animation: none; opacity: 1; }
}
```

---

## System-Wide Impact

### Interaction Graph

- Scan SSE -> scan store -> ScanLog (braille wave, line scramble, cursor)
- [RESCAN] press -> `onRescan()` callback -> `startScan()` -> null old onmessage -> cancel existing SSE -> new SSE -> scan store reset -> ScanLog re-renders
- [CONNECT] press -> `setConnectingBrand` -> CRT shows CONNECTING... -> addMutation -> success: query invalidation + clear connectingBrand -> ModulePanel state change
- [CONNECT] failure -> `setFailedBrand` -> CRT error state with [RETRY] (persistent until retry or navigation)
- [RETRY] press -> clear failedBrand -> re-attempt addMutation
- [CONFIGURE] press -> `setConfiguringBrand` -> DialogTrigger -> modal
- [REMOVE] press -> confirmation modal -> removeMutation -> query invalidation

### Error Propagation

- Scan SSE error: scan store -> `status: 'error'` -> ScanLog shows error, incomplete brands marked as error, [RESCAN] enabled
- All brands errored: "scan failed" in red instead of emerald "scan complete"
- Discovery-only connect failure: CRT error state with [RETRY] — no toast, stays within console paradigm
- Credential connect failure: error shown inside IntegrationFormInner modal (existing behavior)
- Integration fetch failure: existing error state in page component (unchanged)
- [ADD] device failure: inline ERROR + [RETRY] on the row (new)

### State Lifecycle

- **BrailleWave interval cleanup:** `useEffect` with `[isActive]` dependency, `clearInterval` in cleanup return. Covers unmount, active->false, and active->true transitions.
- **Error state lifetime:** `failedBrand` lives in page-level `useState`. Clears on navigation (component unmount) and on [RESCAN]. Persistent until user retries or leaves.
- **ScrambleText key stability:** Log entries keyed by `entry.brand` alone (not `${entry.brand}-${entry.status}`). Status transitions trigger prop updates, not remounts, preserving useScramble animation state.
- **Shared reduced-motion listener:** Consider extracting the `prefers-reduced-motion` media query check into a shared hook (currently each ScrambleText creates its own listener). Not blocking, but good cleanup.

---

## Acceptance Criteria

### Functional Requirements

- [x] RESCAN SSE race fixed (no phantom entries from prior scan)
- [x] ScanLog streams events with ScrambleText animation per line (brand-only keys)
- [x] BrailleWave rolls during brand scanning, resolves to count
- [x] Blinking cursor visible during active scan
- [x] "scan complete" in emerald; "scan failed" in red when all brands error
- [x] Incomplete brands on SSE drop render as error
- [x] [RESCAN] inline in log via optional prop, disabled during scan
- [x] Module panels show CRT screen with icon + count + status
- [x] CRT has `aria-label` summarizing module state
- [x] Recessed LED well as named `RecessedLed` component
- [x] Engraved faceplate labels with two-shadow text-shadow
- [x] Terminal buttons [CONFIGURE] [REMOVE] [CONNECT] [RETRY]
- [x] [CONFIGURE] hidden for discoveryOnly brands
- [x] Discovery-only connect failure -> persistent CRT error with [RETRY]
- [x] [CONNECT] shows CONNECTING... state on CRT while in-flight
- [x] [ADD] failure shows inline ERROR + [RETRY] on device row
- [x] Additional devices section restyled as terminal rows
- [x] All section headers pass WCAG AA contrast (7.50:1)
- [x] [RESCAN] clears failedBrand error state

### Non-Functional Requirements

- [x] `prefers-reduced-motion` disables braille wave (static text), cursor blink (static visible), scramble text
- [x] BrailleWave has `aria-hidden="true"` + sr-only text alternative
- [x] TerminalButton `aria-label` excludes bracket characters
- [x] Terminal buttons accessible via keyboard (Enter/Space)
- [x] Module panel tab order: LED -> CRT -> buttons (natural DOM order)
- [x] `transition-[border-color,background,opacity]` on ModulePanel (not `transition-all`)
- [x] Braille font fallback via `unicode-range` @font-face
- [x] No `as any` or untyped casts; existing `as` casts cleaned up
- [x] Callback references stabilized (no inline closures in .map())
- [x] `bun run system:check --force` passes after every phase

---

## Dependencies & Prerequisites

- **use-scramble v2.2.15** — already installed. Supports `range: [0x2800, 0x28FF]` for braille character scramble. Also natively respects `prefers-reduced-motion: reduce`.
- **react-aria-components** — already used. Button for terminal button accessibility.
- No new dependencies required.
- No server changes required.

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| IoskeleyMono lacks braille glyphs | Medium | High (broken wave) | `unicode-range` @font-face fallback to DejaVu Sans / Apple Braille |
| RESCAN SSE race (phantom entries) | High | Medium | Null old onmessage before close; or scan session counter |
| ScrambleText remount on status change | Medium | Medium | Use brand-only keys, not brand-status keys |
| useScramble writes to null ref on rapid remount | Low | Medium | Test: start scan, slam RESCAN, check console for errors |
| `transition-all` on complex box-shadow | High | Medium | Replace with explicit `transition-[border-color,background,opacity]` |
| Error timeout contradiction in plan | Fixed | N/A | Resolved: persistent until retry, no auto-dismiss |

---

## Implementation Order

Phases are sequential — each builds on the previous:

0. **Pre-implementation: RESCAN SSE race fix** (prerequisite)
1. **Phase 1: Foundation** — TerminalButton + BrailleWave + Engraved Headers (primitives)
2. **Phase 2: ScanLog** — depends on Phase 1 (TerminalButton, BrailleWave, ReadoutDisplay scanlineIntensity prop)
3. **Phase 3: ModulePanel** — depends on Phase 1 (TerminalButton, engraved labels)
4. **Phase 4: Additional Devices** — depends on Phase 1 (TerminalButton, engraved labels)
5. **Phase 5: Page Layout** — depends on all previous phases

Commit each phase separately with conventional messages.

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-05-integrations-page-refinement-brainstorm.md](docs/brainstorms/2026-03-05-integrations-page-refinement-brainstorm.md)
  - Key decisions: Mission control console metaphor, CRT screen per module, braille wave animation, terminal buttons, engraved headers

### Internal References

- ReadoutDisplay scanline texture: `client/src/components/ui/readout-display.tsx:67`
- ScrambleText / use-scramble config: `client/src/components/ui/scramble-text.tsx:26`
- Current ScanLog: `client/src/components/ScanLog.tsx`
- Current ModulePanel: `client/src/components/ModulePanel.tsx`
- ConsolePanelLabel pattern: `client/src/components/ui/console-panel.tsx:20`
- StatusLed bezel ring: `client/src/components/ui/status-led.tsx`
- RaisedButton variants: `client/src/components/ui/button.tsx`
- CSS tokens: `client/src/index.css`
- useScanStream hook: `client/src/hooks/useScanStream.ts`
- Scan store: `client/src/stores/scan-store.ts`

### External Research

- [W3C: Understanding SC 1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) — text-shadow not in contrast calc
- [React Aria: Button component](https://react-aria.adobe.com/Button) — onPress, isDisabled, focus ring
- [use-scramble: range API](https://github.com/tol-is/use-scramble) — `range: [0x2800, 0x28FF]` for braille
- [MDN: unicode-range @font-face](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/unicode-range)
- [web.dev: prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion) — remove decorative animations entirely
