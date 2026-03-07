# SmartHQ Developer API — Research Spike

**Date**: 2026-03-07
**Goal**: Evaluate the official SmartHQ Developer API for status monitoring of GE appliances (combo washer, oven, dishwasher).
**Verdict**: Viable for status monitoring. Standard OAuth2 + REST + WebSocket pubsub. No reverse engineering needed.

---

## API Overview

Three specs compose the SmartHQ Developer Platform:

| Spec | Server | Purpose |
|------|--------|---------|
| IAM | `accounts.brillion.geappliances.com` | OAuth2 auth code flow, token exchange |
| Digital Twin | `client.mysmarthq.com` | REST API for devices, services, commands, history |
| Event Stream | (AsyncAPI) | WebSocket pubsub for real-time state changes |

## Authentication

Standard OAuth2 Authorization Code flow — no reverse engineering, no form scraping.

### Setup
1. Create an App in the [SmartHQ Developer Portal](https://developer.smarthq.com)
2. Get `client_id` and `client_secret`
3. Set a `redirect_uri` (callback URL)

### Flow
```
1. Redirect user → GET /oauth2/auth
     ?client_id=...&redirect_uri=...&response_type=code&access_type=offline
2. User logs in with SmartHQ credentials, grants permission
3. Redirect back → callback?code=AUTH_CODE
4. Server exchanges → POST /oauth2/token
     grant_type=authorization_code&client_id=...&client_secret=...&code=AUTH_CODE&redirect_uri=...
5. Response: { access_token, refresh_token, expires_in: 3600, token_type: "Bearer" }
```

Setting `access_type=offline` in step 1 returns a refresh token for long-lived sessions. Refresh via `grant_type=refresh_token`.

### Security
- `client_secret` stays server-side only (form-urlencoded POST body, not URL params)
- Bearer token auth on all Digital Twin API calls
- No API key headers needed — just `Authorization: Bearer <token>`

## Device Model

### Device List
```
GET /v2/device?page=1&perpage=50
→ { kind: "device#list", devices: Device[], total, page, perpage }
```

### Device Object
```ts
interface SmartHQDevice {
  deviceId: string        // hex hash identifier
  deviceType: string      // e.g. "cloud.smarthq.device.washer", "cloud.smarthq.device.oven"
  nickname: string        // user-assigned name
  model: string           // model number
  manufacturer: string    // "GE Appliances"
  presence: string        // "ONLINE" | "OFFLINE"
  room: string            // "Kitchen", "Laundry"
  macAddress: string
  lastSyncTime: string    // ISO 8601
  lastPresenceTime: string
  createdDateTime: string
  icon: string            // e.g. "cloud.smarthq.icon.unknown"
  adapterId: string
  gatewayId: string
}
```

### Device Detail (with services)
```
GET /v2/device/{deviceId}
→ DeviceResponse (includes services array)
```

Each device exposes **services** — composable state/control units:

```ts
interface Service {
  serviceId: string
  serviceType: string        // e.g. "cloud.smarthq.service.laundry.mode.v1"
  domainType: string         // e.g. "cloud.smarthq.domain.power"
  serviceDeviceType: string  // e.g. "cloud.smarthq.device.washer"
  state: Record<string, unknown>  // current state (e.g. { on: true })
  config: Record<string, unknown>
  supportedCommands: string[]
  lastSyncTime: string
  lastStateTime: string
}
```

## Relevant Device Types

For our three appliances:

| Appliance | deviceType | Relevant Services |
|-----------|-----------|-------------------|
| Combo Washer | `cloud.smarthq.device.combilaundry` or `cloud.smarthq.device.washer` | `laundry.mode.v1`, `laundry.toggle.v2`, `laundry.commercial.v1` |
| Oven | `cloud.smarthq.device.oven` (+ `.oven.upper`, `.oven.lower`) | `cooking.mode.v1`, `cooking.state.v1`, `cooking.mode.multistage` |
| Dishwasher | `cloud.smarthq.device.dishwasher` | `dishwasher.mode.v1`, `dishwasher.state.v1`, `dishwasher.favorites` |

### Service State Examples

**Laundry (washer/dryer)**
- State: `{ on: boolean }`
- Mode options: temperature (cold/warm/hot/extrahot), dryness level, stain type
- Commands: `laundry.mode.v1.set` — sets temperature, dryness, stain

**Oven**
- State: `{ on: boolean }` + cooking mode details
- Mode options: cavityFahrenheit/Celsius, cookTimeSeconds, probeFahrenheit, donenessLevel, powerLevel
- Commands: `cooking.mode.v1.start`, `.set`, `.stop`, `.pause`, `.resume`, `adjust.timer`

**Dishwasher**
- State: `{ on: boolean }`
- Mode options: washZone (upper/lower/both), boostTemperature, steam, heatedDry, sani, bottleWash
- Commands: `dishwasher.state.v1.start`, `.pause`, `.stop`, `dishwasher.mode.v1.set`

### Service Detail
```
GET /v2/device/{deviceId}/service/{serviceId}
→ { serviceType, state, config, supportedCommands, lastStateTime }
```

The `config` object likely contains device-specific capabilities (available modes, temp ranges, etc.).

## Real-Time Updates

### WebSocket PubSub
```
1. POST /v2/pubsub → { kind: "user#pubsub", pubsub: true, services: true, presence: true }
   (subscribes to all device state + presence changes)

2. GET /v2/websocket → { endpoint: "wss://...", kind: "websocket#endpoint" }
   (get WebSocket URL)

3. Connect to WebSocket with Bearer token
   → receive state change events for all subscribed devices
```

Can also subscribe per-device:
```
POST /v2/device/{deviceId}/pubsub
```

This is the real-time channel — equivalent to our SSE event bus but for SmartHQ cloud state.

## What We Need (Status Monitoring Only)

For read-only status monitoring, we only need:

| Permission | Purpose |
|------------|---------|
| `device:read` | List devices, get device details |
| `service:read` | Read service state (on/off, mode, temperature) |

We do NOT need command permissions for status-only monitoring.

### Real-Time via WebSocket (Primary)

SmartHQ provides WebSocket pubsub for instant state changes — no polling needed:

```
1. POST /v2/pubsub → subscribe to services + presence for all devices
2. GET /v2/websocket → get wss:// endpoint URL
3. Connect with Bearer token → receive state change events
4. On message → parse state → eventBus.publish → SSE → client
```

This mirrors our existing SSE event bus pattern, just with a WebSocket upstream. Use `GET /v2/device` only for initial device discovery and hydration, not ongoing state.

## State Mapping to DeviceState

```ts
// combo washer → DeviceType = 'washer'
{
  on: boolean           // from toggle service state
  mode: string          // wash cycle / dryer mode
  status: string        // "running" | "idle" | "complete" | "paused"
  // future: timeRemaining, temperature, etc.
}

// oven → DeviceType = 'oven'
{
  on: boolean           // from cooking state
  mode: string          // "bake" | "broil" | "convection" etc.
  targetTemperature: number  // cavityFahrenheit
  status: string        // "preheating" | "cooking" | "idle"
  // future: cookTimeRemaining, probeTemperature
}

// dishwasher → DeviceType = 'dishwasher'
{
  on: boolean           // from toggle service state
  mode: string          // wash cycle name
  status: string        // "running" | "idle" | "complete"
  // future: timeRemaining
}
```

Note: The exact state fields available depend on what each device's services report. We'll discover the real shape once we connect actual devices.

## Matter/HomeKit Bridging

**matter.js v0.16 fully supports appliance device types.** Confirmed in `@matter/node`:

| Appliance | Matter Device Type | Device ID | Mandatory Cluster | Optional Clusters |
|-----------|-------------------|-----------|-------------------|-------------------|
| Washer | `LaundryWasherDevice` | 115 | `OperationalState` | `OnOff`, `LaundryWasherMode`, `LaundryWasherControls`, `TemperatureControl` |
| Dishwasher | `DishwasherDevice` | 117 | `OperationalState` | `OnOff`, `DishwasherMode`, `DishwasherAlarm`, `TemperatureControl` |
| Oven | `OvenDevice` (composed) | 123 | (none — parent) | `Identify` |
| Oven cavity | `CookSurfaceDevice` (child) | 119 | (none) | `TemperatureControl`, `TemperatureMeasurement`, `OnOff` |

### OperationalState Cluster (the key one)

All appliances share the `OperationalState` cluster for status monitoring:

```ts
// OperationalStateEnum
enum OperationalStateEnum {
  Stopped = 0,   // idle
  Running = 1,   // active cycle
  Paused = 2,    // paused mid-cycle
  Error = 3      // fault
}

// Key attributes
phaseList: string[] | null       // e.g. ["Wash", "Rinse", "Spin"]
currentPhase: number | null      // index into phaseList
countdownTime: number | null     // seconds remaining (optional)
operationalState: OperationalStateEnum
operationalStateList: { operationalStateId, operationalStateLabel }[]

// Events
operationalError: { errorStateId, errorStateLabel, errorStateDetails }
operationCompletion: { completionErrorCode, totalOperationalTime, pausedTime }
```

This maps directly to our status monitoring use case — we push SmartHQ state into these attributes and HomeKit/Google Home renders the appliance status.

### Oven is a Composed Device

The `OvenDevice` is a parent endpoint (like our air purifier bridge). It contains child endpoints:
- `CookSurfaceDevice` — per-cavity, exposes `TemperatureControl` (setpoint, min, max) and `TemperatureMeasurement` (current temp)
- Oven also uses `OvenCavityOperationalState` and `OvenMode` clusters

### HomeKit Caveat

Apple Home's support for Matter appliance device types (washer, dishwasher, oven) is still limited as of mid-2025. These may show as "unsupported" in the Home app even though they're valid Matter devices. Google Home has broader appliance support. Worth testing — worst case, the devices work in Google Home but not Apple Home yet.

**Decision**: Bridge these to Matter using `OperationalState` for status. Even if HomeKit doesn't render them today, Google Home will, and Apple will catch up.

## Implementation Plan (When Ready)

### Adapter Structure
```
server/src/integrations/smarthq/
  adapter.ts     — DeviceAdapter implementation
  auth.ts        — OAuth2 flow (redirect, token exchange, refresh)
  parsers.ts     — map SmartHQ service state → DeviceState
  types.ts       — SmartHQ-specific API response types
```

### OAuth Flow in Jarvis
1. User clicks "Add SmartHQ" in integrations page
2. Server generates OAuth URL → redirects to SmartHQ login
3. SmartHQ redirects back with `code` → server exchanges for tokens
4. Store `access_token` + `refresh_token` in integration config/session
5. Auto-refresh before expiry (1h tokens)

### Key Decisions Still Needed
- [ ] Create App in SmartHQ Developer Portal (get `client_id`/`client_secret`)
- [ ] Determine callback URL format (`http://localhost:3001/api/integrations/smarthq/callback`)
- [ ] Test actual device responses to confirm state shape
- [ ] Add `washer`, `oven`, `dishwasher` to DeviceType union
- [ ] Design dashboard cards for appliance status display

## Alternative: gehomesdk (Reverse-Engineered)

The `simbaja/gehomesdk` Python library uses a reverse-engineered approach:
- HTML form scraping for OAuth (fragile)
- WebSocket "MQTT" protocol with ERD hex codes for device properties
- More feature-complete but zero official support, breaks on GE API changes

**We chose the official API because**:
- Standard OAuth2 — no scraping
- REST + WebSocket — clean protocol
- OpenAPI specs with full documentation
- Stability guarantee from GE's developer program
- Sufficient for our status-monitoring use case

## References

- [SmartHQ Developer Portal](https://developer.smarthq.com)
- [SmartHQ Docs](https://docs.smarthq.com)
- IAM spec: `accounts.brillion.geappliances.com` — OAuth2 endpoints
- Digital Twin spec: `client.mysmarthq.com` — device/service REST API
- Event Stream spec: AsyncAPI — WebSocket pubsub format
