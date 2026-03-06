---
title: "feat: Matter Orbital Text-Art HAL Eye"
type: feat
status: active
date: 2026-03-05
origin: docs/brainstorms/2026-03-05-matter-orbital-text-art-brainstorm.md
---

# Matter Orbital Text-Art HAL Eye

## Enhancement Summary

**Deepened on:** 2026-03-05
**Research agents used:** Frontend design specialist, SVG/braille best practices researcher, TypeScript reviewer, Performance oracle, Pattern recognition specialist, Frontend races reviewer, Code simplicity reviewer
**Technical review on:** 2026-03-05 — 15 findings addressed (3 P1, 7 P2, 5 P3)

### Key Improvements

1. **SVG `<text>` instead of `foreignObject`** — Safari has persistent positioning bugs with foreignObject; SVG `<text>` rows avoid the entire class of cross-browser issues
2. **Stippling-inspired rendering** — 17x15 grid with 5 density tiers and directional edge braille for convincing spherical illusion
3. **Radial wave shimmer** — sin-wave propagation from center outward replaces random character mutation for organic plasma feel
4. **Refs + direct DOM mutation** — bypasses React reconciliation for 200+ character updates; `textContent` assignment on 15 `<span>`-equivalent `<text>` elements is sub-millisecond
5. **Cancel token pattern** — effect-scoped cancel tokens protect against unmount-during-timer and StrictMode double-fire
6. **Timer starts from `onAnimationComplete`** — prevents AnimatePresence exit animation from swallowing the 2s commissioned hold
7. **Drop `hasInitialRender`** — broken under StrictMode; viewRef comparison handles initial load naturally
8. **Phosphor bloom SVG filter** — double feGaussianBlur creates CRT glow on the stippled characters
9. **Keep radial gradient glow halo** — soft colored halo behind the orb sells phosphor light emission
10. **Breathing tuned to scale(1.03), 4s** — avoids character pixel-jumping at edges; custom bezier for organic feel
11. **Extract `useReducedMotion` hook** — deduplicates pattern already in BrailleWave and ScrambleText
12. **LINK gauge checks `paired`** — not `status === 'running'` (a running-but-unpaired bridge has no link)
13. **Clean dead fields** — remove `orbGradient`, `shouldPulse` from OrbitalData; use `orbColor` + `shouldAnimate`

## Overview

Replace the static SVG gradient orb at the center of the Matter orbital with a **stippled text-art sphere** composed entirely of braille characters (`U+2800`-`U+28FF`). The approach is inspired by [stippling](https://en.wikipedia.org/wiki/Stippling) — varying dot density creates the illusion of 3D form. Braille's 2x4 dot matrix provides 256 density levels from `⠀` (empty) to `⣿` (all 8 dots, practically solid at small font sizes). One Unicode block, one font concern, one consistent visual texture — pure dot-based stippling.

Fix the transition state machine bug that prevents the paired view from ever appearing. Add CSS keyframe animations for ring rotation and orb breathing.

## Problem Statement

The Matter page orbital visualization is stuck: (1) a transition bug in the `useEffect` prevents advancement from "COMMISSIONED" to "paired" view, so the orbital never renders; (2) the core orb is a static SVG gradient circle with no character or animation — it reads as a placeholder, not a living system monitor.

## Proposed Solution

Four phases, smallest-to-largest blast radius:

1. **Fix transition bug** — restructure the `useEffect` with cancel tokens and `onAnimationComplete` timer
2. **Build text-art orb** — new `TextArtOrb` component: stippled character grid + radial wave shimmer
3. **Integrate + animate** — swap into `MatterOrbital`, add CSS keyframes, phosphor bloom filter
4. **Polish** — fix LINK gauge, extract `useReducedMotion`, accessibility audit

(see brainstorm: `docs/brainstorms/2026-03-05-matter-orbital-text-art-brainstorm.md`)

## Technical Approach

### Phase 1: Fix Transition State Machine

**File:** `client/src/routes/matter.tsx` (lines 69-90)

**Bug:** The effect depends on `[isPaired, view]`. When `setView('commissioned')` fires, `view` changes, the effect re-runs, and `clearTimeout(commissionTimerRef.current)` on line 74 kills the 2-second timer. The page gets permanently stuck at "COMMISSIONED."

**Fix:** Remove `view` from the dependency array. Use a ref to track current view, and an effect-scoped cancel token to protect against unmount and StrictMode double-fire:

```ts
const viewRef = useRef<ViewState>(isPaired ? 'paired' : 'unpaired')

useEffect(() => {
  const cancelToken = { canceled: false }

  if (isPaired && viewRef.current === 'unpaired') {
    viewRef.current = 'commissioned'
    setView('commissioned')
    useReadoutStore.getState().pushNotification('bridge: paired')
    // timer is started from onAnimationComplete on the commissioned motion.div
    // NOT here — prevents AnimatePresence exit from swallowing the hold
  } else if (!isPaired && viewRef.current !== 'unpaired') {
    clearTimeout(commissionTimerRef.current)
    viewRef.current = 'unpaired'
    setView('unpaired')
    useReadoutStore.getState().pushNotification('bridge: disconnected')
  }

  return () => {
    cancelToken.canceled = true
    clearTimeout(commissionTimerRef.current)
  }
}, [isPaired])
```

**Timer in `onAnimationComplete`:** The 2-second hold timer starts after the commissioned view's enter animation completes, not when `setView` is called. This prevents the timer from expiring while AnimatePresence is still running the exit animation of the previous view:

```tsx
{view === 'commissioned' && (
  <motion.div
    key="commissioned"
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.3 }}
    onAnimationComplete={() => {
      commissionTimerRef.current = setTimeout(() => {
        if (viewRef.current !== 'commissioned') return
        viewRef.current = 'paired'
        setView('paired')
      }, 2_000)
    }}
  >
    {/* ... commissioned checkmark */}
  </motion.div>
)}
```

> **Research insight — drop `hasInitialRender`.** The original plan used a `hasInitialRender` ref, but under StrictMode, the ref gets consumed on the first (loading) render when `isPaired` is false, so it never fires for the initial-load case. The `viewRef` comparison naturally handles this: when the query cache is warm (user navigated away and back), `isPaired` is `true` on first render, `viewRef` initializes to `'paired'`, and `viewRef.current === 'unpaired'` is false — the effect is a no-op. When the cache is cold, `isPaired` starts `false`, `viewRef` is `'unpaired'`, and the commissioned flow fires correctly when data arrives.

**Acceptance criteria:**
- [ ] Commissioned → paired transition completes after 2 seconds
- [ ] Timer starts after commissioned enter animation completes (not before exit finishes)
- [ ] Paired → unpaired reverse transition works
- [ ] Interruption during commissioned hold cancels timer and returns to unpaired
- [ ] Navigating to `/matter` when already paired shows orbital immediately (no 2s delay)
- [ ] Component unmount during 2s hold doesn't call setView on unmounted component
- [ ] `bun run system:check --force` passes

---

### Phase 2: Build Text-Art Orb Component

**New file:** `client/src/components/ui/text-art-orb.tsx`

A stippling renderer that creates a spherical illusion from braille characters only (`U+2800`-`U+28FF`).

#### Braille Dot Matrix Reference

Each braille character is a 2x4 dot grid. The 8 dot positions are numbered:

```
┌───┐
│ 1 4 │
│ 2 5 │
│ 3 6 │
│ 7 8 │
└───┘
```

The Unicode code point is computed from which dots are raised: `U+2800 + (dot1 * 1) + (dot2 * 2) + (dot3 * 4) + (dot4 * 8) + (dot5 * 16) + (dot6 * 32) + (dot7 * 64) + (dot8 * 128)`. This gives us 256 patterns (2^8), each a unique "pixel variant."

**Complete density map — every braille character grouped by dot count:**

| Dots | Count | Characters | Notes |
|------|-------|------------|-------|
| 0 | 1 | `⠀` | blank — used for empty cells outside radius |
| 1 | 8 | `⠁⠂⠄⠈⠐⠠⡀⢀` | single dot — feathered edge, 8 directional variants |
| 2 | 28 | `⠃⠅⠉⠑⠡⡁⢁⠆⠊⠒⠢⡂⢂⠌⠔⠤⡄⢄⠘⠨⡈⢈⠰⡐⢐⡠⢠` | sparse — outer stipple |
| 3 | 56 | `⠇⠋⠓⠣⡃⢃⠍⠕⠥⡅⢅⠙⠩⡉⢉⠱⡑⢑⡡⢡⠎⠖⠦⡆⢆⠜⠬⡌⢌⠴⡔⢔⡤⢤⠚⠪⡊⢊⠲⡒⢒⡢⢢⠮⡎⢎⠶⡖⢖⡦⢦⠸⡘⢘⡨⢨⡰⢰⡠⢠` | sparse-mid |
| 4 | 70 | (70 patterns) | mid density — core transition zone |
| 5 | 56 | (56 patterns) | dense-mid |
| 6 | 28 | (28 patterns — inverses of 2-dot) | dense — inner ring |
| 7 | 8 | `⣿` minus one dot each: `⣾⣽⣻⣷⣯⣟⡿⢿` | near-solid — one hole per character |
| 8 | 1 | `⣿` | solid — all dots raised |

**Key insight for the renderer:** The 1-dot characters (`⠁⠂⠄⠈⠐⠠⡀⢀`) each have their dot in a different position of the 2x4 matrix. At the orb edge, we can select the 1-dot variant whose dot is closest to the orb center — this creates the directional stipple effect where edge marks "point inward."

**Dot position → direction mapping (for directional edge selection):**

| Character | Dot position | Points toward |
|-----------|-------------|---------------|
| `⠁` | top-left | right/down |
| `⠂` | mid-left | right |
| `⠄` | lower-left | right/up |
| `⠈` | top-right | left/down |
| `⠐` | mid-right | left |
| `⠠` | lower-right | left/up |
| `⡀` | bottom-left | right/up |
| `⢀` | bottom-right | left/up |

For a cell at angle θ from center, pick the 1-dot character whose dot position is closest to the center direction. Same logic extends to 2-dot and 3-dot characters — prefer patterns with dots biased toward the center.

#### Stippling Grid Algorithm

Rectangular grid (**17 columns x 15 rows**) with circular distance masking. 17 columns compensates for braille characters being taller than wide (~2:1 aspect ratio in monospace). Apply horizontal aspect ratio correction:

```ts
// distance calculation with aspect ratio correction
const adjustedDist = Math.sqrt(
  (row - centerY) ** 2 + ((col - centerX) * 0.55) ** 2
)
const d = adjustedDist / maxRadius  // normalized: 0 at center, 1 at edge
```

**5 density tiers** mapped to braille dot counts:

| Tier | Distance (d) | Dots | Pool | Visual role |
|------|-------------|------|------|-------------|
| 0 | d < 0.20 | 8 | `⣿` (1 char) | solid core, never shimmers |
| 1 | d < 0.40 | 6-7 | 7-dot: `⣷⣾⣻⣽⣯⣟⡿⢿` + 28 6-dot chars (36 total) | dense inner |
| 2 | d < 0.60 | 4-5 | 70 4-dot + 56 5-dot chars (126 total) | mid transition |
| 3 | d < 0.80 | 2-3 | 28 2-dot + 56 3-dot chars, directionally selected (84 total) | sparse outer |
| 4 | d < 1.00 | 1 | `⠁⠂⠄⠈⠐⠠⡀⢀` directionally selected (8 total) | single-dot feather |

Beyond `d >= 1.0`: `⠀` (`U+2800`, blank braille — same monospace width, prevents layout shift).

**Directional selection (tiers 3-4):** Each cell's angle from center determines which character variant is chosen from its tier pool. A cell at 3-o'clock gets a character with dots on the left side of the 2x4 matrix (pointing inward toward center). Pre-computed per-cell in the `CELL_MAP`. This is the key stippling technique that sells the spherical illusion — marks radiate inward.

**Shimmer character pools:** During shimmer, a tier-N character can shift to an adjacent tier (N-1 or N+1). The shimmer pool for each cell is the union of its own tier's characters and the adjacent tier's characters. Tier 0 never shimmers. Tier 4 can only shift to tier 3 (not to blank).

The cell map is a **module-level constant** — pure geometry computed once, never changes:

```ts
interface Cell {
  row: number
  col: number
  tier: number           // 0-4 density tier
  dots: number           // dot count of baseChar (1-8)
  normalizedDistance: number  // 0 at center, 1 at edge
  angle: number          // radians from center (for directional selection)
  baseChar: string       // the braille character for this cell at rest
  shimmerPool: string[]  // adjacent-tier characters this cell can shift to
  isCore: boolean        // tier 0 — never shimmers
}

// pre-computed at module level — pure geometry, never changes
const CELL_MAP: Cell[] = buildCellMap(17, 15)

// helper: count raised dots in a braille character
function dotCount(char: string): number {
  const code = char.codePointAt(0)! - 0x2800
  let count = 0
  for (let i = 0; i < 8; i++) count += (code >> i) & 1
  return count
}

// helper: generate all braille chars with N dots
function brailleByDotCount(n: number): string[] {
  const chars: string[] = []
  for (let code = 0; code < 256; code++) {
    let bits = 0
    for (let i = 0; i < 8; i++) bits += (code >> i) & 1
    if (bits === n) chars.push(String.fromCodePoint(0x2800 + code))
  }
  return chars
}
```

The `brailleByDotCount` function generates every braille character at a specific density level. The full character palette is computed once at import time:

```ts
const PALETTE = {
  8: brailleByDotCount(8),  // 1 char:  ⣿
  7: brailleByDotCount(7),  // 8 chars: ⣷⣾⣻⣽⣯⣟⡿⢿
  6: brailleByDotCount(6),  // 28 chars
  5: brailleByDotCount(5),  // 56 chars
  4: brailleByDotCount(4),  // 70 chars
  3: brailleByDotCount(3),  // 56 chars
  2: brailleByDotCount(2),  // 28 chars
  1: brailleByDotCount(1),  // 8 chars: ⠁⠂⠄⠈⠐⠠⡀⢀
  0: brailleByDotCount(0),  // 1 char:  ⠀
}
```

For directional selection, each character's dot positions are scored against the cell's angle. The character whose raised dots are most biased toward the center of the orb wins. This scoring function examines the 2x4 matrix positions:

```ts
// dot positions in the 2x4 grid (col 0-1, row 0-3)
const DOT_POSITIONS: [number, number][] = [
  [0, 0], [0, 1], [0, 2],  // dots 1, 2, 3 (left column)
  [1, 0], [1, 1], [1, 2],  // dots 4, 5, 6 (right column)
  [0, 3], [1, 3],           // dots 7, 8 (bottom row)
]
```

#### Rendering Strategy: SVG `<text>` Elements

> **Research insight — abandon foreignObject.** Safari has persistent bugs: ignores `x`/`y` positioning attributes, breaks CSS `transform` on the element, and has inconsistent `position: absolute` behavior inside it. All iOS browsers are affected (WebKit). SVG `<text>` elements avoid the entire class of cross-browser issues.

Each row of the character grid is a single `<text>` element positioned with `x`/`y` attributes in SVG viewBox coordinates. This mirrors the existing `MetadataLabel` pattern already in `MatterOrbital.tsx`:

```tsx
<g className="text-art-orb" aria-hidden="true">
  {rows.map((row, i) => (
    <text
      key={i}
      ref={el => { rowRefs.current[i] = el }}
      x={250}
      y={startY + i * lineHeight}
      textAnchor="middle"
      fill={orbColor}
      style={{
        fontSize: '5.5px',
        fontFamily: "'IoskeleyMono', 'BrailleFallback', monospace",
        letterSpacing: '0.8px',
      }}
    >
      {row}
    </text>
  ))}
</g>
```

**Font size sweet spot: 5-6px.** At this size, braille characters read as texture/stipple marks rather than individual glyphs. Below 4px, dots collapse into noise. Above 7px, individual characters become too legible and break the illusion. The density gradient does the visual work, not character legibility.

**Breathing animation** applies to the `<g>` wrapper via CSS `transform`, using the same `transform-origin: 250px 250px` pattern already in `.core-orb`. Keeping it on the SVG `<g>` (not inside HTML) ensures compositor-thread optimization.

#### Color

Single flat color per status via SVG `fill` attribute on the `<g>` or individual `<text>` elements. Uses the `mid` value from the existing `GRADIENTS` map:

| Status | Color | Hex |
|--------|-------|-----|
| running | emerald | `#34d399` |
| starting | amber | `#fbbf24` |
| error | red | `#ef4444` |
| stopped | stone | `#a8a29e` |

The stipple density gradient creates visual depth without needing a color gradient.

#### Phosphor Bloom: SVG Filter

> **Research insight — CRT glow via double feGaussianBlur.** A single blur looks flat. Two layered blurs — a tight inner glow (0.4px) that sharpens character edges, and a wider outer glow (1.2px) that bleeds between characters — produce authentic phosphor bloom.

```svg
<filter id="phosphor-bloom">
  <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur1" />
  <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="blur2" />
  <feMerge>
    <feMergeNode in="blur1" />
    <feMergeNode in="blur2" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>
```

Applied to the `<g className="text-art-orb">` wrapper. Keep `stdDeviation` low — at 5.5px font size, values above 2 turn the orb into a blurred blob. The goal is a soft haze around each character, not obliteration of detail.

> **Do NOT add scanlines to the orb.** The braille rows already create a natural horizontal rhythm that reads as scan-like. Artificial scanlines would double the frequency and look noisy.

#### Radial Gradient Glow Halo

> **Research insight — keep the glow circle.** The existing `<radialGradient id="orb-glow">` should stay. It creates the impression that the orb emits light rather than sitting flat on the surface. Modify to use the flat `orbColor`:

```tsx
<radialGradient id="orb-glow">
  <stop offset="0%" stopColor={orbColor} stopOpacity="0.25" />
  <stop offset="60%" stopColor={orbColor} stopOpacity="0.08" />
  <stop offset="100%" stopColor={orbColor} stopOpacity="0" />
</radialGradient>

<circle cx={250} cy={250} r={55} fill="url(#orb-glow)" />
```

The glow extends just beyond the text-art boundary (r=55 vs ~r=40 visual extent of the character grid). Reads as phosphor bloom — light bleeding from the stippled characters.

#### Shimmer Animation: Radial Wave

> **Research insight — radial wave, not random selection.** Random 20-30% character mutation looks like television static. A sin-wave propagating outward from center creates an organic ripple — like the surface of a star or HAL's iris adjusting.

**Implementation: refs + direct DOM mutation, not React state.**

```ts
const rowRefs = useRef<(SVGTextElement | null)[]>([])
const wavePhase = useRef(0)

useEffect(() => {
  if (!shouldAnimate || reducedMotion) return

  const id = setInterval(() => {
    wavePhase.current = (wavePhase.current + 0.15) % (Math.PI * 2)

    for (let r = 0; r < ROWS; r++) {
      let rowStr = ''
      for (const cell of CELL_MAP.filter(c => c.row === r)) {
        if (cell.isCore) {
          rowStr += cell.baseChar
          continue
        }
        const wave = Math.sin(cell.normalizedDistance * 6 - wavePhase.current)
        const waveStrength = cell.normalizedDistance * 0.8
        const shouldShift = wave > (1 - waveStrength * 0.5)

        if (shouldShift) {
          const shiftDir = wave > 0 ? 1 : -1
          rowStr += getCharFromTier(cell.tier + shiftDir, cell)
        } else {
          rowStr += cell.baseChar
        }
      }
      const el = rowRefs.current[r]
      if (el && el.textContent !== rowStr) {
        el.textContent = rowStr
      }
    }
  }, 200)

  return () => clearInterval(id)
}, [shouldAnimate, reducedMotion, orbColor])
```

> **Research insight — performance.** Direct `textContent` assignment on 15 SVG `<text>` elements is sub-millisecond. Zero React re-renders during shimmer. Only bridge status changes (poll every 10s) trigger React re-renders. The shimmer runs at 200ms ticks (5/sec) — well within the 16.7ms frame budget per tick.
>
> **Why 200ms, not 150ms.** BrailleWave uses 120ms for a 9-character strip. For a 225-character 2D grid, 150ms produces uncomfortably fast flickering. 200ms gives the eye time to track the wave motion.

The `wavePhase.current + 0.15` controls wave speed. `cell.normalizedDistance * 6` controls how many visible ripple rings appear. Tier 0 (`⣿`, all 8 dots) never shimmers — the solid core is the visual anchor.

#### Breathing Animation

> **Research insight — tuned parameters.** `scale(1.05)` at 5.5px font size causes visible character pixel-jumping at edges. `scale(1.03)` is perceptible as breathing but stays below the threshold. Custom bezier spends more time at extremes for organic feel. 4s instead of 3s avoids beat frequency interference with the 200ms shimmer.

Reuse the existing `core-pulse` keyframe name (it's the same animation concept, just with tuned values):

```css
@keyframes core-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
.text-art-orb {
  animation: core-pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  transform-origin: 250px 250px;
  will-change: transform;
}
```

When bridge is not running, skip the class (no `.text-art-orb-static` override needed — just don't apply the animation class).

#### Reduced Motion: Extract Shared Hook

> **Research insight — deduplication.** BrailleWave and ScrambleText both duplicate the same 8-line `prefers-reduced-motion` subscription. Extract to a shared hook.

**New file:** `client/src/hooks/useReducedMotion.ts`

```ts
import { useEffect, useState } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return reduced
}
```

Used by `TextArtOrb`, and optionally refactor `BrailleWave` + `ScrambleText` to use it too.

When `reducedMotion` is true:
- Shimmer `setInterval` does not start (early return in effect)
- CSS breathing animation disabled via existing `@media (prefers-reduced-motion: reduce)` block
- Static text-art orb still renders (communicates status via color)

**Acceptance criteria:**
- [ ] Text-art orb renders as braille characters in a circular stippled shape
- [ ] 17x15 grid with 5 density tiers visible: dense core → sparse feathered edges
- [ ] Directional edge braille (dots bias toward center)
- [ ] Single flat color reflects bridge status via SVG `fill`
- [ ] Phosphor bloom filter creates CRT character glow
- [ ] Glow halo circle radiates behind the orb
- [ ] Radial wave shimmer propagates outward from center
- [ ] Shimmer uses refs + direct DOM mutation (no React state per tick)
- [ ] Breathing animation scales at 1.03x / 4s with custom bezier
- [ ] `useReducedMotion` hook extracted and used
- [ ] Reduced motion disables shimmer and breathing
- [ ] Braille characters render correctly (BrailleFallback font)

---

### Phase 3: Integrate into MatterOrbital + CSS Animations

**Files:**
- `client/src/components/MatterOrbital.tsx` — swap gradient orb for TextArtOrb
- `client/src/hooks/useMatterOrbitalData.ts` — simplify interface
- `client/src/index.css` — update CSS keyframes

#### MatterOrbital Changes

Replace the two SVG circles (glow + gradient orb) and the `feGaussianBlur` filter with the `TextArtOrb` `<g>` group. The glow halo circle stays (modified to use flat `orbColor`).

**Keep:**
- Metadata ring (`<g className="metadata-ring-group">` with dashed circle)
- MetadataLabel components (PORT, PAIRED, UPTIME)
- SVG `viewBox`, `role="img"`, `aria-label`
- Screen reader summary `<div className="sr-only">`
- Glow halo `<circle>` (modified gradient)

**Remove:**
- `<radialGradient id={gradientId}>` (3-stop gradient) — replaced by flat `orbColor`
- `<filter id={filterId}>` (old feGaussianBlur) — replaced by phosphor bloom filter
- Core orb `<circle>` — replaced by text-art group
- Centered device count `<text>` — device count lives in the BRIDGE STATUS console panel below

**Add:**
- `<filter id="phosphor-bloom">` in `<defs>`
- `TextArtOrb` component rendering the `<g>` with `<text>` rows
- Modified `<radialGradient id="orb-glow">` using `orbColor`

#### Data Hook Changes

> **Research insight — don't add redundant fields.** The original plan added `shouldShimmer`, `shouldAnimate`, `orbColor` — but `shouldShimmer` and `shouldAnimate` are identical to existing `shouldPulse`, and `orbColor` is just `orbGradient.mid`.

Simplify: rename `shouldPulse` → `shouldAnimate` (the pulse concept is gone; animation is the broader concept). Add `orbColor` as a convenience field (extracts `mid` from gradient). Remove `orbGradient` (the 3-stop gradient is dead — no SVG gradient circle uses it anymore).

```ts
interface OrbitalData {
  status: BridgeStatus
  paired: boolean
  deviceCount: number
  port: number
  shouldAnimate: boolean  // renamed from shouldPulse; true when status === 'running'
  orbColor: string        // flat color: GRADIENTS[status].mid
  statusLabel: string
}
```

One field for animation gating. One field for color. Clean.

#### CSS Keyframes

Update `core-pulse` with tuned values (scale 1.03, 4s, custom bezier). Add `.text-art-orb` class. Verify ring rotation — if SVG `<g>` transform doesn't animate, add `transform-box: fill-box`:

```css
@keyframes core-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}

.text-art-orb {
  animation: core-pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  transform-origin: 250px 250px;
}

.metadata-ring-group {
  animation: ring-rotate 60s linear infinite;
  transform-box: fill-box;
  transform-origin: center;
}

@media (prefers-reduced-motion: reduce) {
  .core-orb,
  .text-art-orb,
  .metadata-ring-group { animation: none; }
}
```

> **Research insight — drop `will-change`.** CSS keyframe animations already get compositor promotion. Explicit `will-change` is redundant for active animations and wasteful when animations are off.

**Acceptance criteria:**
- [ ] Text-art orb renders at center of orbital SVG as `<text>` elements
- [ ] Phosphor bloom filter applied to orb group
- [ ] Glow halo circle uses flat `orbColor`
- [ ] Metadata ring rotates slowly (60s cycle)
- [ ] All animations stop when bridge is not running
- [ ] Dead fields cleaned from `OrbitalData` interface
- [ ] Old gradient/filter SVG elements removed
- [ ] `bun run system:check --force` passes

---

### Phase 4: Polish

#### LINK Gauge Fix

`client/src/routes/matter.tsx` line 224 — hardcoded `value="OK"`.

> **Research insight — check `paired`, not `status === 'running'`.** A running-but-unpaired bridge has no link. The unpaired `StatusPanel` already does this correctly.

```tsx
<DarkGauge
  label="LINK"
  value={isPaired ? 'OK' : '—'}
  valueClass={isPaired ? 'text-emerald-400' : undefined}
/>
```

#### Accessibility

- `aria-hidden="true"` on the `<g className="text-art-orb">` — prevents screen readers from reading hundreds of braille characters
- Keep the existing `<div className="sr-only">` summary
- Verify `aria-label` on the SVG `role="img"` matches current state

#### Error State Orb

When `status === 'error'`:
- Orb color turns red (`#ef4444`)
- No shimmer, no breathing (static red stippled orb)
- Ring rotation stops
- Error panel renders below orbital (already implemented)
- Glow halo turns red (automatic — uses `orbColor`)

The static red orb communicates "something is wrong" clearly against the dark console background.

#### Implementation Sequence

Build in this order to iterate on the visual before wiring animations:

1. **Grid generation function** — pure function, returns 2D cell array. Log to console and verify the stippled sphere shape in monospace text.
2. **Render as SVG `<text>` elements** — no animation, no filter. Tune font size (5-6px), letter spacing (0.6-1.0px), line height until the orb looks like a solid stippled sphere at rest.
3. **Add phosphor bloom filter** — adjust `stdDeviation` until the glow feels right without obliterating character detail.
4. **Add glow halo circle** — tune opacity behind the text group.
5. **Add breathing CSS animation** — verify scale(1.03) looks smooth at the text's small size.
6. **Add shimmer last** — the radial wave is the most complex piece and most likely to need iteration.

**Acceptance criteria:**
- [ ] LINK gauge shows "OK" only when paired
- [ ] Text-art orb group has `aria-hidden="true"`
- [ ] Screen reader summary is accurate
- [ ] Error state shows static red stippled orb
- [ ] All bridge states visually correct: running, starting, error, stopped
- [ ] `useReducedMotion` hook works in TextArtOrb
- [ ] `bun run system:check --force` passes

---

## System-Wide Impact

### Interaction Graph

- Matter poll (React Query, 10s) → `useMatterOrbitalData` → `MatterOrbital` re-render → `TextArtOrb` receives new `orbColor`/`shouldAnimate`
- `isPaired` change → transition effect → view state machine → `AnimatePresence` enter/exit
- `setInterval` in `TextArtOrb` → direct DOM `textContent` mutation (no React involvement)
- CSS keyframes (ring rotation, orb breathing) → compositor thread (no React involvement)
- `onAnimationComplete` on commissioned view → starts 2s hold timer

### State Lifecycle Risks

- **Timer leak on unmount:** Effect-scoped cancel token prevents `setView` on unmounted component. `clearTimeout` in cleanup handles the timer ref.
- **Shimmer interval leak:** `clearInterval(id)` in `useEffect` cleanup. Standard pattern.
- **StrictMode double-fire:** Cancel token is scoped per effect invocation. StrictMode mount → effect → unmount → cleanup (cancels token) → remount → new effect (new token). Safe.
- **Stale poll data:** React Query retains last-known data on error. Orbital shows stale state for up to 10-20s. Acceptable for a dashboard.
- **AnimatePresence queue:** If `isPaired` toggles during an exit animation, `mode="wait"` queues the transitions. With a 10s poll interval, rapid toggling is unlikely. The cancel token in the timeout callback guards against stale transitions.

### Error Propagation

- Bridge poll error → React Query retry (1x) → matter page shows last-known data → readout strip shows "bridge: error"
- Font load failure → BrailleFallback chain (DejaVu Sans → Segoe UI Symbol → Apple Braille → monospace) — braille characters still render
- Phosphor bloom filter cost → only applied to the 15-element `<text>` group (not 225 individual elements), cost is bounded

---

## Acceptance Criteria

### Functional Requirements

- [ ] Transition bug fixed: commissioned → paired completes
- [ ] Timer starts from `onAnimationComplete` (not before exit animation finishes)
- [ ] Initial page load when already paired skips commissioned interstitial
- [ ] Text-art orb renders stippled braille characters in circular pattern
- [ ] 17x15 grid with 5 density tiers, directional edge braille
- [ ] Orb color reflects bridge status (emerald/amber/red/stone)
- [ ] Radial wave shimmer propagates outward when bridge is running
- [ ] Breathing animation pulses orb when bridge is running
- [ ] Metadata ring rotates when bridge is running
- [ ] All animations stop when bridge is not running
- [ ] LINK gauge reflects paired state (not just running state)
- [ ] Phosphor bloom filter creates CRT glow on characters
- [ ] Glow halo radiates behind orb

### Non-Functional Requirements

- [ ] `prefers-reduced-motion` disables shimmer (JS) and breathing/rotation (CSS)
- [ ] `useReducedMotion` hook extracted and shared
- [ ] Text-art orb group is `aria-hidden="true"` with sr-only summary
- [ ] Braille characters render via BrailleFallback font stack
- [ ] Shimmer uses refs + DOM mutation (no React state per tick)
- [ ] No `as any`, no `@ts-ignore`
- [ ] `bun run system:check --force` passes after every phase

### Quality Gates

- [ ] Screenshot each bridge state (running, starting, error, stopped)
- [ ] Test transition: unpaired → commissioned (2s hold, visible) → paired
- [ ] Test reverse transition: paired → unpaired
- [ ] Test interruption: commissioned → unpaired
- [ ] Test component unmount during 2s hold (no console warnings)
- [ ] Verify ring rotation works cross-browser (test with `transform-box: fill-box`)
- [ ] Profile shimmer — verify <2ms per tick in Chrome DevTools Performance

---

## Dependencies & Prerequisites

- No new dependencies. Uses existing: braille characters (Unicode), BrailleFallback font, CSS keyframes, motion/react (for view transitions)
- Builds on existing components: `MatterOrbital.tsx`, `useMatterOrbitalData.ts`, `BrailleWave` pattern
- No server changes required

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-05-matter-orbital-text-art-brainstorm.md](docs/brainstorms/2026-03-05-matter-orbital-text-art-brainstorm.md) — key decisions: text-art orb over SVG gradient, braille-only stippling, single flat color, dual shimmer + breathing animation, 2 layers only

### Internal References

- Transition bug: `client/src/routes/matter.tsx:69-90`
- Current orbital: `client/src/components/MatterOrbital.tsx`
- Data hook: `client/src/hooks/useMatterOrbitalData.ts`
- BrailleWave pattern: `client/src/components/ui/braille-wave.tsx`
- ScrambleText pattern: `client/src/components/ui/scramble-text.tsx`
- BrailleFallback font: `client/src/index.css:98-102`
- CSS keyframes: `client/src/index.css:52-76`
- Reduced motion rules: `client/src/index.css:78-95`
- Console color tokens: `client/src/index.css:36-41`
- Parent plan (Phase 5): `docs/plans/2026-03-05-feat-ui-redesign-navbar-integrations-matter-plan.md`

### Research Findings

- SVG foreignObject has persistent Safari positioning bugs — use SVG `<text>` instead
- Braille at 5-6px reads as texture/stipple, not individual dots — correct for this use case
- Direct DOM `textContent` mutation: <1ms for 15 elements vs ~5ms for React reconciliation of 225 nodes
- CSS `transform` animations on SVG `<g>` elements get compositor-thread optimization
- Double feGaussianBlur (0.4 + 1.2 stdDeviation) produces authentic CRT phosphor bloom
- Radial wave shimmer (sin-based propagation) looks organic vs random mutation (TV static)
- `scale(1.03)` avoids character pixel-jumping at small font sizes; `scale(1.05)` causes visible artifacts
- Effect-scoped cancel tokens are safer than `clearTimeout` alone for StrictMode and unmount scenarios
