# Matter Page: Full-Viewport HUD Layout

**Date:** 2026-03-05
**Status:** Complete
**Context:** Redesign matter.tsx paired view from "orbital + cards below" to full-viewport mission-control HUD
**Wireframe:** User-provided sketch — bordered viewport, brutalist text readouts at corners and edges, orb + ring centered

## What We're Changing

The current paired view has:
- Orbital SVG (500x500 viewBox, max-w-500px) at top
- DarkConsolePanel "BRIDGE STATUS" card below with gauges (DEVICES, PORT, LINK)
- Empty space around the orbital

The new layout:
- **Full viewport** — the entire page IS the HUD, dark background edge-to-edge, fills `100vh - navbar`
- **No cards/panels** — remove DarkConsolePanel, DarkGauge components from paired view
- **Brutalist text readouts** — raw text positioned at corners and edges, bordered by lines
- **Dynamic sizing** — orbital SVG scales to fill available space, not fixed 500px
- **Center** — braille orb + dashed ring (existing, stays)

## Wireframe Interpretation

```
+--[TOP-LEFT]----------[TOP-BAR-LABEL]----------[TOP-RIGHT]--+
|                                                              |
|                                                              |
|                        [PORT/5540]                           |
|                     .  .  .  .  .  .                         |
|                  .        orb        .                        |
|   [UPTIME]    .     braille sphere    .    [PAIRED/YES]      |
|                  .                   .                        |
|                     .  .  .  .  .  .                         |
|                                                              |
|                                                              |
|                                                              |
+--[BOTTOM-LEFT]-------------------------------[BOTTOM-RIGHT]--+
```

### Blue boxes from wireframe → data readouts:
- **Top bar** (wide): page title "MATTER BRIDGE" or status headline
- **Top-left corner**: could be bridge status LED + label (RUNNING / OFFLINE)
- **Top-right corner**: could be error indicator or mode
- **Around ring** (3 readouts): PORT, PAIRED, UPTIME — already in MatterOrbital
- **Bottom-left corner**: device count or link status
- **Bottom-right corner**: uptime or diagnostics

### Lines/borders:
- Thin lines framing the viewport edges — think technical drawing borders
- Corner marks or registration marks for the brutalist/blueprint feel
- Lines connecting readouts to the orbital ring (optional, maybe too busy)

## Key Design Decisions

1. **Remove all cards** — no DarkConsolePanel, no DarkGauge, no rounded corners, no gradients. Raw text on dark background. Info lives as positioned labels.

2. **Viewport-filling** — the dark background extends full viewport. The SVG orbital scales to fill the center space. Use `h-[calc(100vh-3.5rem)]` for the page container.

3. **Brutalist typography** — Michroma for labels (dim), IoskeleyMono for values (bright). No surfaces, no shadows. Just text + lines.

4. **Corner readouts** — absolute-positioned text at the four corners. Each shows a label + value pair. No background, just text.

5. **Border frame** — thin lines around the viewport edge, possibly with corner marks (L-shaped registration marks).

## Orb Improvements (from user feedback)

### Flares
- Increase SPIKE_MAX_LENGTH from 0.3 to 0.5+
- Increase spike density/intensity
- More dramatic pulsing — spikes should feel like solar prominences

### Phosphor bloom
- Current: SVG feGaussianBlur filter on the `<g>` group
- Desired: bloom based on actual pixels — individual bright dots should glow
- Approach: increase blur stdDeviation, maybe add a third blur layer
- Or: apply bloom per-row `<text>` element instead of on the group

### Label contrast
- Current metadata labels (PORT, PAIRED, UPTIME) use `fill-console-text-dim` (#6b6356)
- Too low contrast — bump to `fill-console-text-muted` (#a89b82) or brighter
- Values already use `fill-console-text` (#faf0dc) — good

## Open Questions

1. What data goes in each corner? User's wireframe shows 6 blue boxes outside the ring + 3 around the ring. Candidates: status, devices, port, link, uptime, error count.
2. Should the border frame be SVG (inside the orbital viewBox) or CSS (on the page container)?
3. Should corner readouts be part of the SVG or HTML elements positioned absolutely?

## Files to Change

- `client/src/routes/matter.tsx` — major rewrite of paired view layout
- `client/src/components/MatterOrbital.tsx` — make responsive to container size, increase label contrast
- `client/src/components/ui/text-art-orb.tsx` — increase flares, tune bloom
- `client/src/index.css` — frame border styles, full-viewport layout
