---
title: "feat: Card Shell Unified Surface Redesign"
type: feat
status: active
date: 2026-03-04
origin: docs/brainstorms/2026-03-04-device-card-layout-redesign-brainstorm.md
---

# feat: Card Shell Unified Surface Redesign

## Overview

Redesign the device card shell from a 3-zone web card (header/body/footer with distinct backgrounds and borders) into a single unified instrument faceplate. Add ambient edge glow for light devices, consolidate from 3 fonts to 2 (drop Commit Mono), and simplify overengineered button shadows. ReadoutDisplay and fader sliders remain unchanged — they already feel right.

## Problem Statement / Motivation

The card accumulated web-app patterns during iterative development:
- **Header accent background** — gradient tint reflecting light color feels "too modern," like a web app not a physical panel
- **Footer border-top + gradient** — creates a visually distinct zone that breaks the instrument faceplate illusion
- **Three fonts** — Michroma, IoskeleyMono, and Commit Mono create visual noise; Commit Mono doesn't earn its place
- **POWER button shadows** — multi-layer inset/raised shadow system is overengineered for the aesthetic
- The card reads as a styled `<div>` with sections, not as a single physical panel

(see brainstorm: docs/brainstorms/2026-03-04-device-card-layout-redesign-brainstorm.md)

## Proposed Solution

1. **Unified surface** — flat warm white `bg-[#fffdf8]`, no header accent background, no footer border/gradient. Zones separated by whitespace and typography weight only.
2. **Ambient edge glow** — `box-shadow` glow around the card border matching the light's color, intensity proportional to brightness. Non-light devices: neutral border, no glow. Off lights: no glow, neutral border.
3. **2 fonts only** — Michroma (all non-readout text) + IoskeleyMono (readout displays + numeric values). Drop all Commit Mono usage.
4. **Simplified button shadows** — POWER and MATTER buttons: single shadow per state instead of multi-layer stacks.

## Implementation Phases

### Phase 1: Card Surface Unification

Flatten the card into a single visual surface by removing zone separators.

**`client/src/components/ui/card.tsx`**
- [x] `Card`: replace `bg-linear-to-b from-[#fffdf8] to-stone-50/80` with flat `bg-[#fffdf8]`
- [x] `CardFooter`: remove `border-t border-stone-200/80` and `bg-linear-to-b from-stone-50/30 to-stone-50/60` — keep only `px-3 py-2 flex items-center justify-between gap-2`
- [x] `CardHeader`: remove `transition-colors` class (header no longer tinted)

**`client/src/components/DeviceCard.tsx`**
- [x] `CardShell`: remove `style={accent ? { background: accent.headerBackground } : undefined}` from CardHeader — header stays neutral always
- [x] Stop consuming `headerBackground` from accent (will be removed in Phase 2)

**Run:** `bun run system:check --force`

### Phase 2: Ambient Edge Glow

Replace the header accent tinting with a border glow effect for light-type devices.

**`client/src/lib/color-utils.ts`**
- [x] Update `LightAccent` interface: remove `headerBackground`, add `glowShadow: string`
- [x] Update `lightAccentStyle()`:
  - Keep `borderColor` computation (solid border color from light state)
  - Add `glowShadow`: `0 0 14px 3px color-mix(in srgb, {color} {intensity}%, transparent)` where intensity scales with brightness (0% brightness → ~15% color mix, 100% brightness → ~40% color mix)
  - Return `undefined` when light is off (no glow, border falls back to neutral)

**`client/src/components/ui/card.tsx`**
- [x] `Card`: add `glowShadow?: string` prop
- [x] Build box-shadow dynamically: join `var(--shadow-raised)`, the inset white highlight, and `glowShadow` (if provided) into one `boxShadow` style value
- [x] The existing `transition-all duration-200` on Card covers box-shadow transitions

**`client/src/components/DeviceCard.tsx`**
- [x] Pass `glowShadow={accent?.glowShadow}` to `Card`
- [x] Update `handleAccentChange` to work with new `LightAccent` shape (no `headerBackground`)
- [x] DragOverlay: glow renders at 80% opacity on ghost — looks intentional, no suppression needed
- [x] Selection ring (`ring-2 ring-amber-500/70 ring-offset-1`) layers above glow naturally — no changes needed

**Run:** `bun run system:check --force`

### Phase 3: Font Consolidation

Replace all `font-commit` with `font-michroma` across card-related components. IoskeleyMono stays exclusive to ReadoutDisplay internals and numeric output values.

**Mapping:**

| Location | Current | New |
|----------|---------|-----|
| DeviceCard.tsx — brand/type subtitle | `font-commit text-[10px]` | `font-michroma text-[10px] uppercase tracking-wider` |
| DeviceDetailDialog.tsx — device name | `font-commit font-medium` | `font-michroma` |
| DeviceDetailDialog.tsx — brand label | `font-commit text-xs` | `font-michroma text-[10px] uppercase tracking-wider` |
| DeviceDetailDialog.tsx — dialog header border | `border-b border-stone-200/60` | remove (unified surface) |
| LightCard.tsx — scene buttons | `font-commit text-xs` | `font-michroma text-[10px] uppercase tracking-wider` |
| AirPurifierCard.tsx — on/off text | `font-commit font-medium` | `font-michroma` |
| AirPurifierCard.tsx — AQI badge | `font-commit font-medium` | `font-michroma` |
| SectionGroup.tsx — empty section text | `font-commit text-xs` | `font-michroma text-xs` |
| index.tsx — empty state text | `font-commit` | `font-michroma` |
| index.tsx — stream status badge | `font-commit` | `font-michroma` |
| index.tsx — skeleton placeholders | `font-commit` | `font-michroma` |
| CreateSectionDialog.tsx — dialog text | `font-commit` | `font-michroma` |
| LightMultiSelectBar.tsx — labels | plain/no explicit font | `font-michroma` where labels exist |

**Files to update:**
- [x] `client/src/components/DeviceCard.tsx`
- [x] `client/src/components/DeviceDetailDialog.tsx`
- [x] `client/src/components/device-cards/LightCard.tsx`
- [x] `client/src/components/device-cards/AirPurifierCard.tsx`
- [x] `client/src/components/device-cards/ThermostatCard.tsx` (no font-commit found)
- [x] `client/src/components/device-cards/MediaCard.tsx` (no font-commit found)
- [x] `client/src/components/device-cards/VacuumCard.tsx` (no font-commit found)
- [x] `client/src/components/device-cards/GenericCard.tsx` (no font-commit found)
- [x] `client/src/components/SectionGroup.tsx`
- [x] `client/src/components/CreateSectionDialog.tsx`
- [x] `client/src/routes/index.tsx`
- [x] `client/src/components/LightMultiSelectBar.tsx` (no font-commit found)

**Run:** `bun run system:check --force`

### Phase 4: Element Refinement

Simplify overengineered elements to match the flat panel aesthetic.

**POWER button** (LightCard.tsx, AirPurifierCard.tsx):
- [x] Simplify off-state shadow: single `shadow-[0_1px_3px_rgba(0,0,0,0.08)]`
- [x] Simplify on-state shadow: single `shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]`
- [x] Keep `pressed:translate-y-px` and `pressed:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]` feedback
- [x] Keep indicator LED dot with glow (unchanged)

**MATTER toggle** (DeviceCard.tsx):
- [x] Same shadow simplification as POWER button
- [x] Keep native Matter badge styling (already clean)

**AQI inactive segments** (AirPurifierCard.tsx):
- [x] Change `bg-stone-100` to `bg-stone-200/60` for better contrast on flat `#fffdf8`

**Filter life track** (AirPurifierCard.tsx):
- [x] Change `bg-stone-200` to `bg-stone-200/80` for slight transparency on warm surface

**Run:** `bun run system:check --force`

### Phase 5: Dialog & Skeleton Consistency

Ensure DeviceDetailDialog and SkeletonCard match the new visual language.

**`client/src/components/DeviceDetailDialog.tsx`**
- [ ] Remove header `border-b border-stone-200/60` — dialog becomes a unified surface too
- [ ] All font changes already applied in Phase 3
- [ ] Consider passing edge glow to dialog for light devices (subtle — optional)

**`client/src/routes/index.tsx` — SkeletonCard**
- [ ] Update skeleton to remove any implied header/body zone split
- [ ] Match flat `#fffdf8` surface feel
- [ ] Replace any `font-commit` references (covered in Phase 3)

**Run:** `bun run system:check --force`

### Phase 6: Visual Verification

- [ ] Run `bun run system:check --force` — final pass
- [ ] Verify all card types render on unified surface: light (on/off, CCT, RGB), air purifier, thermostat, sensor, media, vacuum, appliance, fridge, generic
- [ ] Test edge glow: power on → glow appears, brightness slider drag → glow intensity changes, power off → glow fades
- [ ] Test multi-select: amber ring renders cleanly over edge glow
- [ ] Test offline: muted opacity, no glow, no interactive controls
- [ ] Test DnD: drag ghost has no glow
- [ ] Test DeviceDetailDialog: opens with unified surface, correct fonts

## Technical Considerations

**CSS box-shadow stacking:** The Card already uses `[box-shadow:var(--shadow-raised),inset_0_1px_0_rgba(255,255,255,0.9)]`. Adding the glow as a third value is standard CSS. The hover state adds its own shadow stack. All shadows transition together via `transition-all duration-200`.

**Glow performance:** `box-shadow` with `color-mix()` is well-supported (Chrome 111+, Safari 16.4+, Firefox 113+). The `color-mix(in srgb, ...)` function is computed once per render, not per frame. No performance concern for a dashboard with <50 cards.

**Michroma at small sizes:** Already proven at `text-[10px] uppercase tracking-wider` across all control labels (BRT, CCT, FAN, etc.). The brand subtitle switching from Commit Mono to Michroma at `text-[10px]` will be slightly wider due to tracking — verify truncation still works with `truncate` class.

**`transition-all` scope:** Currently on Card, this transitions everything including opacity, transform, and box-shadow. If glow transitions cause jank, narrow to `transition-[box-shadow,opacity]`. Unlikely to be an issue at this scale.

## Acceptance Criteria

- [ ] Card renders as a single flat `#fffdf8` surface — no visible zone boundaries (no header accent bg, no footer border/gradient)
- [ ] Light devices show ambient edge glow (colored `box-shadow`) when on, proportional to brightness
- [ ] Edge glow disappears when light is off (smooth transition to neutral border)
- [ ] Only 2 fonts in card components: Michroma and IoskeleyMono — zero `font-commit` references
- [ ] POWER and MATTER buttons use simplified single-layer shadows
- [ ] ReadoutDisplay unchanged (glass pane, text glow, sizes)
- [ ] Fader sliders unchanged (notch marks, metallic thumb)
- [ ] Multi-select ring renders above edge glow without visual conflict
- [ ] Offline devices: muted opacity, no glow
- [ ] DnD ghost: no edge glow
- [ ] DeviceDetailDialog: unified surface, Michroma fonts, no header border
- [ ] SkeletonCard: matches unified surface layout
- [ ] `bun run system:check --force` passes

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-04-device-card-layout-redesign-brainstorm.md](../brainstorms/2026-03-04-device-card-layout-redesign-brainstorm.md) — key decisions: unified surface, ambient edge glow, 2-font consolidation (Michroma + IoskeleyMono), warm matte surface, no dark mode
- **Previous completed plan:** [docs/plans/2026-03-04-feat-device-card-layout-redesign-plan.md](2026-03-04-feat-device-card-layout-redesign-plan.md) — per-type card interior redesign (all phases complete)
- Card primitives: `client/src/components/ui/card.tsx`
- ReadoutDisplay: `client/src/components/ui/readout-display.tsx`
- DeviceCard shell: `client/src/components/DeviceCard.tsx:138-260`
- Color utilities: `client/src/lib/color-utils.ts:61-96`
- Design tokens: `client/src/index.css:22-34`
