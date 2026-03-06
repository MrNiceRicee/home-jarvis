# Matter Orbital: Text-Art HAL Eye

**Date:** 2026-03-05
**Status:** Complete
**Branch:** `feat/navbar-integrations-matter-zustand`
**Parent brainstorm:** `docs/brainstorms/2026-03-05-ui-redesign-navbar-integrations-matter-brainstorm.md`

## What We're Building

A living, breathing text-art orb at the center of the Matter page orbital visualization. The orb is the "HAL eye" of the system — friendly, warm, always watching over your devices. It replaces the current static SVG gradient circle with a character-composed sphere that shimmers and pulses.

## Why This Approach

The original plan spec'd a standard SVG radial gradient orb. That's technically correct but visually generic — it could be any dashboard. A text-art orb made of braille dots and block characters is:

- **Distinctive** — no other IoT dashboard looks like this
- **Consistent** — extends the CRT/terminal aesthetic from the ReadoutDisplay, scan log, and braille scramble animations already in the app
- **Characterful** — a shimmering text sprite feels alive in a way a smooth gradient doesn't

## Key Decisions

### 1. Orb Rendering: Braille + Block Characters

The orb is composed of Unicode braille (`⠁` through `⣿`) and block (`░▓█`) characters arranged in a circular pattern, rendered as SVG `<text>` elements.

**Density gradient via character selection (not opacity):**
- **Center:** full blocks (`█`) and dense braille (`⣿⣷⣾`) — solid core
- **Middle:** medium blocks (`▓░`) and mid-density braille (`⠿⠟⠏`) — transition zone
- **Edges:** sparse braille with 1-2 dots (`⠁⠂⠄⠈`) — natural feathering

Braille's 2x4 dot matrix (256 patterns) inherently handles the sparse-to-dense gradient. Each dot position can be toggled independently, so edge characters can have dots that "point inward" toward the center, creating a convincing spherical falloff without opacity tricks.

**Color:** single flat status color applied to all characters via SVG `fill`:
- Emerald (`#34d399`) — running
- Amber (`#fbbf24`) — starting
- Red (`#ef4444`) — error
- Stone (`#a8a29e`) — stopped

### 2. Orb Animation: Shimmer + Breathing

Dual animation for "living sprite" feel:

**Character shimmer:** characters slowly cycle through adjacent braille/block densities. Edge characters shift more than center characters. Creates an unstable, plasma-on-CRT surface effect. Staggered timing so the shimmer ripples outward.

**Breathing:** the whole text cluster scales gently (1.0 to 1.05) on a ~3 second CSS keyframe cycle. Calm, ambient "I'm here" pulse.

Both animations run simultaneously. `prefers-reduced-motion` disables shimmer and reduces breathing to static.

### 3. Metadata Ring: Slow Rotating Dashes

- Thin dashed circle (`stroke-dasharray="4 8"`, `stroke="#6b6356"`)
- CSS `transform: rotate()` animation, 60-second full revolution
- Labels (PORT, PAIRED, UPTIME) stay fixed outside the ring — ring moves behind them
- Existing implementation just needs the CSS keyframe added

### 4. Scope: 2 Layers Only

Core orb + metadata ring. No integration ring (Layer 3) in this pass. Get the HAL eye feeling right first, add planets later.

### 5. Bug Fix: Transition State Machine

The `commissioned -> paired` transition is stuck. The `useEffect` cleanup kills the 2-second timer when `view` changes trigger re-runs. The effect has `[isPaired, view]` as dependencies — when `setView('commissioned')` fires, React re-runs the effect and the cleanup from the previous run clears the timeout.

Fix: move the timer to a ref that persists across effect re-runs, or restructure the effect so `view` isn't a dependency.

## Open Questions

None — all design decisions resolved.

## Next Steps

1. Fix the transition bug so the paired view actually appears
2. Build the text-art orb component (character grid + shimmer animation)
3. Add CSS keyframe animations (breathing, ring rotation)
4. Test all bridge states (running, starting, error, stopped)
