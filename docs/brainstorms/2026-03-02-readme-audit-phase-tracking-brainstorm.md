---
title: "README Audit + Phase Tracking Update"
type: chore
status: draft
date: 2026-03-02
---

# README Audit + Phase Tracking Update

## What We're Building

Audit the README against actual code, fix drift, and update the master plan to reflect completed phases. The repo moved from WSL to macOS development — verify all docs are Mac-accurate.

## Why This Matters

Docs were written during initial planning. Three phases of implementation have happened since, adding features (Elgato adapter, device card dispatcher, local scanner) that aren't reflected in the project structure diagram or plan checkboxes.

---

## README Audit Findings

### Accurate (no changes needed)

- Stack table (Bun + Elysia port 3001, React 19, etc.)
- Prerequisites (Bun >= 1.3)
- Setup commands and dev URLs
- Production build pipeline description
- macOS deployment section (launchd, paths, Bonjour note)
- Environment variables and DB path resolution
- Features list (all 4 scan types are implemented in `local-scanner.ts`)
- WSL mDNS warning note

### Issues Found

#### 1. Project structure diagram is outdated

**Missing from server tree:**
- `lib/` directory — `events.ts` (SSE bus), `logger.ts`, `parse-json.ts`
- `discovery/local-scanner.ts` — unified scan (Hue cloud+mDNS, Govee UDP, Aqara mDNS, Elgato mDNS)
- `integrations/elgato/adapter.ts` — not shown

**Missing from client tree:**
- `components/device-cards/` — 9 type-specific card components (LightCard, ThermostatCard, etc.)
- `components/LightMultiSelectBar.tsx` — multi-select batch control
- `lib/color-utils.ts` — color conversion helpers
- `types.ts` — client-side type helpers

#### 2. Adapter pattern code example uses stale signatures

README shows `Promise<void>` return types but actual code uses `ResultAsync<void, Error>` (neverthrow). The architecture section should match the real interface.

#### 3. Integrations table doesn't distinguish implemented vs planned

All 9 brands listed identically. Only Hue and Elgato have working adapters. Users could expect all to work.

#### 4. DeviceState example is minimal

README shows 5 fields; Phase 4a expanded to ~15+ fields (vacuum, media, appliance, fridge states). The code snippet is a simplification — acceptable but worth noting.

---

## Master Plan Audit Findings

File: `docs/plans/2026-02-28-feat-home-jarvis-iot-portal-plan.md`

### Issues

1. **Port mismatch**: Non-functional criteria says "Elysia on port 3000" — actual code uses 3001
2. **All checkboxes unchecked**: Phases 1, 2 are fully complete but every task shows `[ ]`
3. **Elgato adapter missing**: Not in the original plan, but fully implemented
4. **Phase 4a not referenced**: Completed but not mentioned in the master plan
5. **Client file structure**: Plan shows `pages/` directory; actual uses TanStack Router `routes/`
6. **Elgato needs testing**: User notes the Elgato adapter hasn't been tested yet

---

## Key Decisions

1. **Update README project structure** to match actual code tree
2. **Update adapter code example** in README to use `ResultAsync` signatures
3. **Add status column to integrations table** — distinguish "Working" vs "Planned"
4. **Update master plan checkboxes** for completed phases
5. **Add Elgato as a completed bonus item** in the plan
6. **Reference Phase 4a doc** from the master plan
7. **Fix port 3000 → 3001** in master plan non-functional criteria
8. **Note Elgato testing status** — implemented but needs verification

---

## Resolved Questions

- **Is the README Mac-accurate?** — Yes. The macOS deployment section (launchd, Bonjour, paths) is solid. No WSL-first artifacts remain.
- **Does the server serve the client?** — Yes. The `build:prod` pipeline embeds client assets into the binary. The `GET /*` catch-all serves them in production. This is accurately documented.
- **What phase are we in?** — Between Phase 2 and Phase 3. Phases 1, 2, and 4a are complete. Elgato adapter done (needs testing). Next up: Phase 3 cloud integrations (Govee, VeSync, Resideo).
