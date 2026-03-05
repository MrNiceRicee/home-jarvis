---
title: "Device Card Layout Redesign"
type: feat
status: complete
date: 2026-03-04
origin: docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md
---

# Device Card Layout Redesign

Soft redesign of the device card component to feel more like a Sony "Making Modern" / Teenage Engineering instrument faceplate. The current card accumulated too many web-app patterns (header accent gradients, footer borders, zone separations) that clash with the retro instrument panel aesthetic.

## What We're Building

A unified-surface card that reads as a single instrument faceplate rather than a web card with header/body/footer zones. The ReadoutDisplay (dark UV glass window) remains the signature focal element. Controls and metadata flow naturally on one warm matte surface, differentiated only by spacing and typography.

## Key Decisions

### 1. Color relationship: Ambient edge glow

The card border subtly glows with the light's current color (like edge-lit acrylic). The card surface itself stays neutral — no header accent backgrounds or tinted zones. The ReadoutDisplay and light bar also reflect color, but the panel surface does not.

**Why:** Edge-lit acrylic is a real physical effect (LED strip behind frosted panel edge). It adds color personality without painting the whole card. Keeps the warm surface clean while still showing device state at a glance.

### 2. Card structure: Unified surface, logical zones

One seamless panel — no header accent background, no footer border-top, no background color shifts between zones. The layout still groups info at top (name label, readout) and controls at bottom (sliders, buttons, Matter, light bar), but separation comes from whitespace and typography weight only.

**Why:** Real instrument panels are one faceplate with regions defined by component placement, not by borders. Think OP-1: one surface, display up top, keys/knobs below, separated by space alone.

**Rejected:** Keeping 3 distinct zones (too web-app) and full merge with no logical grouping (harder to engineer and design around).

### 3. Core elements that feel right

- **ReadoutDisplay** — the dark glass window is the signature element. Stays as-is with glass pane depth and brightness-responsive text glow.
- **Fader sliders with notch marks** — feel grounded and physical. Keep.

### 4. Elements that need refinement

- **POWER button** — the 3D press effect with multi-layer shadows is overengineered. Simplify to match the flat panel feel while keeping tactile press feedback (CSS `pressed:` only).
- **AQI segmented bar** — visually fine but styling should match the unified panel (remove any zone-specific backgrounds).
- **Filter life bar** — same treatment, ensure it sits naturally on the warm surface.
- **Matter toggle + light bar** — currently in a visually separated footer. Move inline to the bottom of the unified surface.

### 5. Fonts: 2 fonts only

- **Michroma** — all non-readout text: device name, section labels (BRT, CCT, FAN, AQI, FILTER), button text (POWER, MATTER), metadata
- **IoskeleyMono** — readout display values only (numbers in the dark glass window)

**Dropped:** Commit Mono. Three fonts created visual noise. Michroma is more deliberate and matches the instrument panel labeling aesthetic (think engraved labels on Sony receivers).

### 6. Surface: Warm matte, no texture

Warm off-white (#fffdf8) matte surface. No CSS texture (too risky at card scale — tends to look like compression artifacts on ~200px cards). Smooth matte matches real TE/Sony devices.

**Rejected:** Dark panel (kills the warm-surface-vs-dark-display contrast that defines the aesthetic), cool neutral (loses the inviting warmth), textured surface (high risk of looking bad at card scale).

### 7. No dark mode pivot

Retro hardware was vibrant — lots of color, warm surfaces, neon indicators on dark displays. The design gets its energy from the contrast between warm light panel and dark instrument window. Going all-dark would look "too modern" and lose that interplay.

## Design Principles (carried forward)

From the original brainstorm (2026-03-03):
- **Sony "Making Modern"** — precision and warmth, not coldness
- **Super Normal** — "special is less useful than normal"
- **Teenage Engineering** — playful instrument panels, deliberate constraints
- ReadoutDisplay is the hero element — everything else supports it

## Open Questions

None — all key decisions resolved through dialogue.

## Next Steps

1. Create implementation plan (`/ce:plan`) for the layout changes
2. Key files to modify: `card.tsx` (remove zone separators), `DeviceCard.tsx` (restructure shell), `LightCard.tsx`, `AirPurifierCard.tsx`, `ThermostatCard.tsx` (update element styling)
3. Drop Commit Mono usage across all card components
4. Implement ambient edge glow on card border for light-type devices

## Sources

- Origin brainstorm: [docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md](../brainstorms/2026-03-03-device-card-redesign-brainstorm.md)
- ReadoutDisplay component: `client/src/components/ui/readout-display.tsx`
- Card primitives: `client/src/components/ui/card.tsx`
- Device card shell: `client/src/components/DeviceCard.tsx`
