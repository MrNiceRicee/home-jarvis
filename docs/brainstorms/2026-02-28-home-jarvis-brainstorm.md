# Home Jarvis — IoT Integration Portal Brainstorm

**Date:** 2026-02-28
**Status:** Draft

---

## What We're Building

A locally-hosted web portal that acts as a unified hub for all smart home devices. It auto-discovers devices across brands, provides a central management UI, and bridges them into Apple HomeKit via a HAP bridge running on the same server.

The app lives entirely on the home network. Apple HomeKit handles remote control (via HomePod/Apple TV as Home Hub). The portal is an admin/setup tool — not a day-to-day remote control app.

---

## Why This Approach

- **Local-only** keeps the app simple, fast, and private. No cloud hosting, no Tailscale required for v1. Remote control is delegated to Apple's infrastructure via HomeKit.
- **HAP bridge (hap-nodejs)** is the proven pattern — it's what Homebridge is built on. Run it alongside the Bun server, pair once via QR code in the Apple Home app.
- **Pluggable adapter architecture** is the only sane way to support 8+ brands. Each integration implements a common interface; adding a new brand is just a new adapter.
- **SQLite** is the right database for a single-user home server — zero setup, single file, works natively with Bun.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Deployment | Home server, local network only | Simplest; HomeKit handles remote access |
| Remote access | None for v1 (add Tailscale later if needed) | Portal is admin-only, rarely needed remotely |
| Auth | None for v1 | Local network = trusted environment |
| HomeKit UX | Manual toggle per device | Keeps Apple Home clean; mirrors Homebridge UX |
| Database | SQLite + Drizzle ORM | Zero setup, Bun-native, type-safe |
| HomeKit bridge | hap-nodejs | TypeScript-native, battle-tested |
| Integration pattern | Pluggable adapters (common interface) | Extensible, isolated per brand |
| Discovery | Hybrid: local mDNS/UPnP + cloud APIs | Required — brands use both |

---

## Tech Stack

**Server**
- Runtime: Bun
- Language: TypeScript
- Framework: Elysia (Bun-native, end-to-end type safety, built-in WebSocket/SSE)
- Database: SQLite via Drizzle ORM
- HomeKit: hap-nodejs

**Frontend**
- React + Tailwind CSS + react-aria
- Build: Vite

---

## Integrations (v1)

| Brand | Discovery Method | API Type | Notes |
|---|---|---|---|
| Philips Hue | Local mDNS | Local REST | Best local API; no cloud needed |
| Govee | Cloud API | REST + MQTT | Requires Govee API key |
| LG | Cloud API | ThinQ REST | Requires LG account credentials |
| GE (Cync/SmartHQ) | Cloud API | REST | Requires GE account |
| Aqara | Local mDNS / Cloud | Local or cloud | Already HomeKit-native; show in portal for visibility only — do NOT re-bridge to HomeKit |
| SmartThings | Cloud API | REST | v1 — not fully active yet but included as motivation to set up |
| Resideo (Honeywell Home) | Cloud API | REST | Thermostats/sensors; requires Resideo account |
| VeSync | Cloud API | REST | Levoit air purifiers; requires VeSync account |

### Adapter Interface (concept)
Each integration implements:
```
discover() → Device[]
getState(deviceId) → DeviceState
setState(deviceId, state) → void
toHomeKitAccessory(device) → HAPAccessory
```

---

## Core Portal Features

1. **Integration setup** — Add API keys / credentials per brand (stored plaintext in SQLite for v1)
2. **Device discovery** — Scan local network + poll cloud APIs; show all found devices
3. **Device dashboard** — Live device state via SSE/WebSocket (Elysia built-in)
4. **HomeKit toggle** — Per-device switch to expose/unexpose via HAP bridge
5. **HomeKit pairing** — Display QR code / PIN for initial Apple Home pairing

---

## Architecture Overview

```
Home Network
┌─────────────────────────────────────────┐
│  Home Server                            │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │  Bun Server  │  │   HAP Bridge    │  │
│  │  (REST API)  │  │  (hap-nodejs)   │  │
│  └──────┬───────┘  └────────┬────────┘  │
│         │                   │           │
│  ┌──────▼───────────────────▼────────┐  │
│  │         SQLite (Drizzle)          │  │
│  └───────────────────────────────────┘  │
└───────────┬─────────────────────────────┘
            │
     ┌──────▼──────┐        ┌─────────────┐
     │ Local devices│        │ Cloud APIs  │
     │ (Hue, Aqara) │        │(Govee, LG,  │
     └─────────────┘        │GE, VeSync.. │
                            └─────────────┘

Remote control:
Apple Home app → Apple servers → HomePod/Apple TV → HAP Bridge
```

---

## Resolved Questions

| Question | Decision |
|---|---|
| Server framework | **Elysia** — Bun-native, better TypeScript ergonomics, built-in SSE/WebSocket |
| SmartThings | **Standard integration** — include in v1 as motivation to get it set up |
| Credential storage | **Plaintext SQLite for v1** — home server is trusted; encrypt later if needed |
| Real-time device state | **Live via SSE/WebSocket** — Elysia handles this well out of the box |
| Aqara HomeKit handling | **Portal visibility only** — already HomeKit-native, don't re-bridge |

## Open Questions

None — all decisions resolved.
