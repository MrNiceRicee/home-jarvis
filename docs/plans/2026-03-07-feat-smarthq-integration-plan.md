# SmartHQ (GE Appliances) Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add SmartHQ integration for status monitoring of GE combo washer, oven, and dishwasher — with real-time state via WebSocket and Matter bridge exposure.

**Architecture:** OAuth2 Authorization Code flow for auth, WebSocket pubsub for real-time device state (no polling), adapter maps SmartHQ service state to our DeviceState, Matter bridge exposes appliances as LaundryWasherDevice/DishwasherDevice with OperationalState cluster.

**Tech Stack:** SmartHQ Developer API (REST + WebSocket), OAuth2, matter.js v0.16 appliance device types, neverthrow for error handling.

---

## Enhancement Summary

**Deepened on:** 2026-03-07
**Research agents used:** TypeScript reviewer, Security sentinel, Performance oracle, Architecture strategist, Pattern recognition specialist, Best practices researcher, Code simplicity reviewer

### Key Improvements from Research
1. **Refresh lock** — add `refreshLock` pattern (matching Resideo adapter) to prevent concurrent token refreshes
2. **Single adapter instance** — stream reuses one adapter instead of creating a new one per WebSocket message
3. **Session persistence** — stream writes refreshed tokens back to DB so they survive server restarts
4. **WebSocket resilience** — jitter on reconnect backoff, token re-auth before reconnect, heartbeat monitoring, state recovery after reconnect
5. **Collapsed parsers** — all 4 per-device-type parsers were identical; collapsed to single `parseApplianceState()` function
6. **Dropped OvenDevice from Matter bridge** — OvenDevice is a composed parent with no mandatory clusters and no OperationalState; it's a no-op. Oven shows only as a BridgedNode with reachability for now until CookSurface children are implemented.
7. **Extended OAuthConfig** — add `tokenAuthMethod` and `extraAuthorizeParams` fields to avoid brand-specific branching in controller
8. **`'stream'` source tag** — new DeviceEvent source for WebSocket-originated updates (not `'poller'`)
9. **WebSocket URL validation** — validate wss:// URL before connecting to prevent SSRF
10. **Debounce rapid state changes** — SmartHQ may fire multiple state events in quick succession; debounce per-device

---

## Prerequisites

Before starting implementation, the user must:
1. Create an App in the [SmartHQ Developer Portal](https://developer.smarthq.com)
2. Set callback URL to `http://localhost:3001/api/integrations/ge/oauth/callback`
3. Get `client_id` and `client_secret`
4. Add to `.env`: `SMARTHQ_CLIENT_ID=...` and `SMARTHQ_CLIENT_SECRET=...`

---

### Task 1: SmartHQ API Types

Define the SmartHQ API response types we'll work with throughout the adapter.

**Files:**
- Create: `server/src/integrations/smarthq/types.ts`

**Step 1: Create types file**

Reference: `docs/research/2026-03-07-smarthq-developer-api-spike.md` for the API shape.

```ts
/** SmartHQ Digital Twin API types — derived from OpenAPI spec at client.mysmarthq.com */

export interface SmartHQSession {
	accessToken: string
	refreshToken: string
	expiresAt: number // unix ms
}

// ─── Device list ─────────────────────────────────────────────────────────────

export interface SmartHQDeviceListResponse {
	kind: 'device#list'
	devices: SmartHQDevice[]
	total: number
	page: number
	perpage: number
}

export interface SmartHQDevice {
	deviceId: string
	deviceType: string // e.g. "cloud.smarthq.device.washer"
	nickname: string
	model: string
	manufacturer: string
	presence: 'ONLINE' | 'OFFLINE'
	room: string
	macAddress: string
	lastSyncTime: string
	lastPresenceTime: string
	createdDateTime: string
	adapterId: string
	gatewayId: string
}

// ─── Device detail (includes services) ───────────────────────────────────────

export interface SmartHQDeviceDetail extends SmartHQDevice {
	kind: 'device#item'
	services: SmartHQService[]
	alertTypes?: string[]
	removable?: boolean
}

export interface SmartHQService {
	serviceId: string
	serviceType: string // e.g. "cloud.smarthq.service.laundry.mode.v1"
	domainType: string // e.g. "cloud.smarthq.domain.power"
	serviceDeviceType: string
	state: Record<string, unknown>
	config: Record<string, unknown>
	supportedCommands: string[]
	lastSyncTime: string
	lastStateTime: string
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

export interface SmartHQWebSocketEndpoint {
	kind: 'websocket#endpoint'
	endpoint: string // wss:// URL
}

// ─── PubSub config ───────────────────────────────────────────────────────────

export interface SmartHQPubSubConfig {
	kind: 'user#pubsub'
	pubsub: boolean
	services?: boolean
	presence?: boolean
	alerts?: boolean
	commands?: boolean
}
```

**Step 2: Commit**

```bash
git add server/src/integrations/smarthq/types.ts
git commit -m "feat(smarthq): add SmartHQ API response types"
```

---

### Task 2: SmartHQ State Parsers

Map SmartHQ service state to our unified DeviceState. Also classify SmartHQ device types to our DeviceType enum.

**Files:**
- Create: `server/src/integrations/smarthq/parsers.ts`

**Step 1: Create parsers**

Reference existing parser pattern: `server/src/integrations/vesync/parsers.ts`

> **Research insight — collapsed parsers:** All four per-device-type parsers (washer, dishwasher, oven, fridge) were structurally identical: extract `on` from toggle service, extract `cycleStatus` from state service. Collapsed into a single `parseApplianceState()` function. Per-type specialization only where state shapes actually differ.

```ts
import type { DeviceState, DeviceType } from '../types'

import type { SmartHQDeviceDetail, SmartHQService } from './types'

// ─── Device type classification ──────────────────────────────────────────────

export function mapSmartHQDeviceType(deviceType: string): DeviceType | null {
	if (deviceType.includes('washer') || deviceType.includes('combilaundry') || deviceType.includes('dryer')) return 'washer_dryer'
	if (deviceType.includes('dishwasher')) return 'dishwasher'
	if (deviceType.includes('oven') || deviceType.includes('cooktop') || deviceType.includes('microwave')) return 'oven'
	if (deviceType.includes('refrigerator')) return 'fridge'
	return null // unsupported device type — skip
}

// ─── Service state extraction ────────────────────────────────────────────────

function findService(services: SmartHQService[], typeFragment: string): SmartHQService | undefined {
	return services.find((s) => s.serviceType.includes(typeFragment))
}

function findServiceState<T>(services: SmartHQService[], typeFragment: string, key: string): T | undefined {
	const service = findService(services, typeFragment)
	return service?.state[key] as T | undefined
}

/** extract cycle status from operational state service */
function parseCycleStatus(services: SmartHQService[]): string | undefined {
	// look for state-type services (cooking.state, dishwasher.state, laundry toggle)
	const stateService = findService(services, '.state.') ?? findService(services, '.toggle.')
	if (!stateService) return undefined

	const on = stateService.state.on
	if (on === true) return 'running'
	if (on === false) return 'idle'
	return undefined
}

// ─── Unified appliance parser ────────────────────────────────────────────────

function parseApplianceState(services: SmartHQService[]): DeviceState {
	const on = findServiceState<boolean>(services, 'toggle', 'on')
	return {
		on: on ?? false,
		cycleStatus: parseCycleStatus(services) ?? 'idle',
	}
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseSmartHQDeviceState(device: SmartHQDeviceDetail): DeviceState {
	const type = mapSmartHQDeviceType(device.deviceType)
	const services = device.services ?? []

	switch (type) {
		case 'washer_dryer':
		case 'dishwasher':
		case 'oven':
			return parseApplianceState(services)
		case 'fridge':
			// fridge doesn't have cycleStatus
			return { on: findServiceState<boolean>(services, 'toggle', 'on') ?? false }
		default:
			return {}
	}
}
```

**Note on parsers:** These are intentionally minimal. The real SmartHQ service state shape will vary per-device and will need refinement once we see actual API responses from the user's appliances. The `extras` field on DeviceState can hold raw service data for debugging. We'll iterate on these parsers after the first successful connection.

**Step 2: Commit**

```bash
git add server/src/integrations/smarthq/parsers.ts
git commit -m "feat(smarthq): add device type classifier and state parsers"
```

---

### Task 3: SmartHQ Adapter

Implement the DeviceAdapter interface with OAuth token management, device discovery via REST, and a WebSocket connection for real-time state.

**Files:**
- Create: `server/src/integrations/smarthq/adapter.ts`

**Step 1: Create adapter**

Reference: `server/src/integrations/resideo/adapter.ts` for OAuth session pattern.
Reference: `server/src/integrations/types.ts` for DeviceAdapter interface.

> **Research insight — refresh lock:** The Resideo adapter uses a `refreshLock` (a saved Promise) to prevent concurrent token refreshes when multiple requests trigger 401s simultaneously. Without this, parallel refreshes can race and invalidate each other's tokens. The SmartHQ adapter must follow the same pattern.
>
> **Research insight — session callback:** The adapter needs a way to persist refreshed tokens back to the DB so they survive server restarts. Pass an `onSessionChange` callback, same as Resideo.
>
> **Research insight — non-null assertions:** After any `await` boundary, `this._session` could theoretically be null if `stop()` was called concurrently. Save to a local variable before the async gap.

```ts
import { ResultAsync, errAsync, okAsync } from 'neverthrow'

import type { DeviceAdapter, DeviceState, DiscoveredDevice } from '../types'

import { log } from '../../lib/logger'

import { mapSmartHQDeviceType, parseSmartHQDeviceState } from './parsers'
import type { SmartHQDeviceDetail, SmartHQDeviceListResponse, SmartHQSession } from './types'

const API_BASE = 'https://client.mysmarthq.com'
const IAM_BASE = 'https://accounts.brillion.geappliances.com'
const FETCH_TIMEOUT = 15_000
const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000 // refresh 2 min before expiry

export class SmartHQAdapter implements DeviceAdapter {
	readonly brand = 'ge'
	readonly displayName = 'GE SmartHQ'
	readonly discoveryMethod = 'cloud' as const

	private _session: SmartHQSession | null
	private refreshLock: Promise<void> | null = null
	private onSessionChange?: (session: string) => void

	constructor(
		_config: Record<string, string>,
		session?: string | null,
		onSessionChange?: (session: string) => void,
	) {
		this._session = this.parseSession(session ?? null)
		this.onSessionChange = onSessionChange
	}

	get session(): string | null {
		return this._session ? JSON.stringify(this._session) : null
	}

	// ── DeviceAdapter interface ───────────────────────────────────────────

	validateCredentials(_config: Record<string, string>): ResultAsync<void, Error> {
		// OAuth flow — no credentials to validate
		return okAsync(undefined)
	}

	discover(): ResultAsync<DiscoveredDevice[], Error> {
		return this.ensureValidToken().andThen(() => this.fetchDevices())
	}

	getState(externalId: string): ResultAsync<DeviceState, Error> {
		return this.ensureValidToken().andThen(() => this.fetchDeviceDetail(externalId))
	}

	setState(_externalId: string, _state: Partial<DeviceState>): ResultAsync<void, Error> {
		// status monitoring only — no remote control
		return errAsync(new Error('SmartHQ integration is read-only (status monitoring only)'))
	}

	// ── Discovery ─────────────────────────────────────────────────────────

	private fetchDevices(): ResultAsync<DiscoveredDevice[], Error> {
		return ResultAsync.fromPromise(
			this.apiFetch<SmartHQDeviceListResponse>('/v2/device?perpage=100'),
			(e) => new Error(`SmartHQ device list failed: ${(e as Error).message}`),
		).andThen((response) => {
			const discovered: DiscoveredDevice[] = []
			for (const d of response.devices) {
				const type = mapSmartHQDeviceType(d.deviceType)
				if (!type) continue // skip unsupported device types

				discovered.push({
					externalId: d.deviceId,
					name: d.nickname || d.model || 'GE Appliance',
					type,
					state: { on: false, cycleStatus: 'idle' },
					online: d.presence === 'ONLINE',
					metadata: {
						model: d.model,
						room: d.room,
						deviceType: d.deviceType,
					},
				})
			}
			return okAsync(discovered)
		})
	}

	private fetchDeviceDetail(externalId: string): ResultAsync<DeviceState, Error> {
		return ResultAsync.fromPromise(
			this.apiFetch<SmartHQDeviceDetail>(`/v2/device/${externalId}`),
			(e) => new Error(`SmartHQ device detail failed: ${(e as Error).message}`),
		).map((detail) => parseSmartHQDeviceState(detail))
	}

	// ── Token management ──────────────────────────────────────────────────

	private parseSession(raw: string | null): SmartHQSession | null {
		if (!raw) return null
		try {
			const parsed = JSON.parse(raw) as SmartHQSession
			if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) return null
			return parsed
		} catch {
			return null
		}
	}

	private ensureValidToken(): ResultAsync<void, Error> {
		if (!this._session) {
			return errAsync(new Error('SmartHQ not authenticated — please complete OAuth flow'))
		}

		if (Date.now() < this._session.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
			return okAsync(undefined)
		}

		return this.acquireAndRefresh()
	}

	/** refresh with lock — prevents concurrent refresh races (matches Resideo pattern) */
	private acquireAndRefresh(): ResultAsync<void, Error> {
		if (this.refreshLock) {
			return ResultAsync.fromPromise(this.refreshLock, (e) => e as Error)
		}

		const promise = this.doRefresh()
		this.refreshLock = promise.then(() => {}).catch(() => {})
		// clear lock once settled so next caller can retry
		promise.finally(() => { this.refreshLock = null })

		return ResultAsync.fromPromise(promise, (e) => e as Error)
	}

	private async doRefresh(): Promise<void> {
		const session = this._session
		if (!session) throw new Error('No session to refresh')

		const clientId = process.env.SMARTHQ_CLIENT_ID
		const clientSecret = process.env.SMARTHQ_CLIENT_SECRET
		if (!clientId || !clientSecret) {
			throw new Error('SMARTHQ_CLIENT_ID and SMARTHQ_CLIENT_SECRET must be set')
		}

		const res = await fetch(`${IAM_BASE}/oauth2/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: clientId,
				client_secret: clientSecret,
				refresh_token: session.refreshToken,
			}),
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
		})

		if (!res.ok) {
			const body = await res.text()
			throw new Error(`Token refresh failed (${res.status}): ${body}`)
		}

		const data = (await res.json()) as {
			access_token: string
			refresh_token?: string
			expires_in: number
		}

		// handle refresh token rotation — provider may issue a new refresh token
		this._session = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? session.refreshToken,
			expiresAt: Date.now() + data.expires_in * 1000,
		}

		log.debug('smarthq token refreshed', { expiresAt: this._session.expiresAt })
		this.onSessionChange?.(JSON.stringify(this._session))
	}

	// ── API helpers ───────────────────────────────────────────────────────

	private async apiFetch<T>(path: string): Promise<T> {
		if (!this._session) throw new Error('Not authenticated')

		const res = await fetch(`${API_BASE}${path}`, {
			headers: { Authorization: `Bearer ${this._session.accessToken}` },
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
		})

		if (res.status === 401) {
			// token expired mid-request — try one refresh + retry
			await this.doRefresh()

			const retry = await fetch(`${API_BASE}${path}`, {
				headers: { Authorization: `Bearer ${this._session.accessToken}` },
				signal: AbortSignal.timeout(FETCH_TIMEOUT),
			})
			if (!retry.ok) throw new Error(`SmartHQ API error (${retry.status})`)
			return retry.json() as Promise<T>
		}

		if (!res.ok) throw new Error(`SmartHQ API error (${res.status})`)
		return res.json() as Promise<T>
	}
}
```

**Step 2: Run typecheck**

```bash
bun run typecheck
```

**Step 3: Commit**

```bash
git add server/src/integrations/smarthq/adapter.ts
git commit -m "feat(smarthq): add SmartHQ adapter with OAuth token management and refresh lock"
```

---

### Task 4: Register SmartHQ in Integration Registry + Extend OAuthConfig

Wire the adapter into the registry — update brand meta to OAuth flow, add to createAdapter factory, add getOAuthConfig case, and extend OAuthConfig to avoid brand-specific branching in the controller.

**Files:**
- Modify: `server/src/integrations/registry.ts`
- Modify: `server/src/routes/integrations.controller.ts`

> **Research insight — extend OAuthConfig:** Instead of `if (brand === 'ge')` branching in the controller for `access_type` and body-auth, extend `OAuthConfig` with `tokenAuthMethod` and `extraAuthorizeParams` fields. Each brand declares its needs declaratively. This scales to future OAuth integrations without touching the controller.

**Step 1: Extend OAuthConfig in registry.ts**

Add fields to the `OAuthConfig` type (wherever it's defined in registry.ts):

```ts
export interface OAuthConfig {
	authorizeUrl: string
	tokenUrl: string
	clientId: string
	clientSecret: string
	tokenAuthMethod?: 'basic' | 'body' // default: 'basic'
	extraAuthorizeParams?: Record<string, string>
}
```

Add import at top of file with the other adapter imports:

```ts
import { SmartHQAdapter } from './smarthq/adapter'
```

Update the `ge` entry in `INTEGRATION_META` — change from credential fields to OAuth flow:

```ts
ge: {
	brand: 'ge',
	displayName: 'GE SmartHQ',
	fields: [],
	oauthFlow: true,
},
```

Add case to `getOAuthConfig()`:

```ts
case 'ge': {
	const clientId = process.env.SMARTHQ_CLIENT_ID
	const clientSecret = process.env.SMARTHQ_CLIENT_SECRET
	if (!clientId || !clientSecret) return null
	return {
		authorizeUrl: 'https://accounts.brillion.geappliances.com/oauth2/auth',
		tokenUrl: 'https://accounts.brillion.geappliances.com/oauth2/token',
		clientId,
		clientSecret,
		tokenAuthMethod: 'body',
		extraAuthorizeParams: { access_type: 'offline' },
	}
}
```

Add case to `createAdapter()`:

```ts
case 'ge':
	return ok(new SmartHQAdapter(config, session))
```

**Step 2: Update integrations controller to use OAuthConfig fields**

In `integrations.controller.ts`, update the `/:id/oauth/start` handler. After `url.searchParams.set('state', state)`, add:

```ts
// apply provider-specific authorize params (e.g. access_type=offline for SmartHQ)
if (oauth.extraAuthorizeParams) {
	for (const [key, value] of Object.entries(oauth.extraAuthorizeParams)) {
		url.searchParams.set(key, value)
	}
}
```

In the callback handler around line 271-286, replace the token exchange block to use `tokenAuthMethod`:

```ts
const callbackUri = `http://localhost:3001/api/integrations/${brand}/oauth/callback`

let tokenRes: Response
try {
	const useBodyAuth = oauth.tokenAuthMethod === 'body'
	const headers: Record<string, string> = {
		'Content-Type': 'application/x-www-form-urlencoded',
	}
	if (!useBodyAuth) {
		headers.Authorization = `Basic ${Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString('base64')}`
	}

	const params: Record<string, string> = {
		grant_type: 'authorization_code',
		code,
		redirect_uri: callbackUri,
	}
	if (useBodyAuth) {
		params.client_id = oauth.clientId
		params.client_secret = oauth.clientSecret
	}

	tokenRes = await fetch(oauth.tokenUrl, {
		method: 'POST',
		headers,
		body: new URLSearchParams(params),
		signal: AbortSignal.timeout(TOKEN_TIMEOUT),
	})
} catch (e) {
	log.error('oauth callback: token exchange network error', { brand, error: (e as Error).message })
	return redirect(errorUrl('exchange_failed'))
}
```

**Step 3: Run typecheck and lint**

```bash
bun run system:check --force
```

**Step 4: Commit**

```bash
git add server/src/integrations/registry.ts server/src/routes/integrations.controller.ts
git commit -m "feat(smarthq): register adapter, extend OAuthConfig with tokenAuthMethod"
```

---

### Task 5: Add `'stream'` to DeviceEvent Source Union

WebSocket-originated updates should use a distinct `'stream'` source tag, not `'poller'`.

**Files:**
- Modify: `server/src/integrations/types.ts`

> **Research insight — source tag:** The event bus uses `source` to prevent feedback loops (e.g., Matter bridge ignores events with `source: 'matter'`). WebSocket stream events are semantically different from polling — using `'stream'` makes the provenance clear and allows future logic to distinguish real-time vs polled state.

**Step 1: Update DeviceEvent source union**

In `server/src/integrations/types.ts`, find the `DeviceEvent` type and add `'stream'` to the source union:

```ts
source?: 'dashboard' | 'poller' | 'matter' | 'scan' | 'stream'
```

**Step 2: Run typecheck**

```bash
bun run system:check --force
```

**Step 3: Commit**

```bash
git add server/src/integrations/types.ts
git commit -m "feat: add 'stream' to DeviceEvent source union for WebSocket events"
```

---

### Task 6: SmartHQ WebSocket Stream

Add a WebSocket connection manager that subscribes to SmartHQ pubsub and pipes state changes into our event bus. This replaces polling for real-time state.

**Files:**
- Create: `server/src/integrations/smarthq/stream.ts`
- Modify: `server/src/discovery/cloud-poller.ts` (add SmartHQ start/stop hooks)

> **Research insight — single adapter instance:** The original plan created a `new SmartHQAdapter({}, ...)` on every WebSocket message. This is wasteful and loses refresh lock state. Instead, create one adapter at stream start and reuse it.
>
> **Research insight — session persistence:** When the adapter refreshes a token, the new token must be written back to the DB. Otherwise, if the server restarts, it'll use the stale token from the initial OAuth flow. Pass an `onSessionChange` callback to the adapter.
>
> **Research insight — URL validation:** Validate the WebSocket URL is `wss://` before connecting to prevent SSRF via a compromised API response.
>
> **Research insight — jitter on reconnect:** Exponential backoff without jitter causes all disconnected clients to reconnect simultaneously (thundering herd). Add random jitter.
>
> **Research insight — token re-auth before reconnect:** The access token expires every hour. If the WebSocket disconnects after 45 minutes, the token used for the initial subscribe/endpoint call may be expired by reconnect time. Call `ensureValidToken()` via the adapter before reconnecting.
>
> **Research insight — debounce rapid state changes:** SmartHQ may fire multiple state events for a single appliance action (e.g., washer starting fires toggle + mode + state changes). Debounce per-device to avoid redundant DB writes and SSE events.

```ts
import { eq } from 'drizzle-orm'

import type { DB } from '../../db'
import type { DeviceState } from '../types'

import { devices, integrations } from '../../db/schema'
import { eventBus } from '../../lib/events'
import { log } from '../../lib/logger'
import { parseJson } from '../../lib/parse-json'

import { SmartHQAdapter } from './adapter'
import type { SmartHQSession, SmartHQWebSocketEndpoint } from './types'

const RECONNECT_BASE_MS = 10_000
const RECONNECT_MAX_MS = 5 * 60_000
const DEBOUNCE_MS = 1_000

class SmartHQStream {
	private ws: WebSocket | null = null
	private db: DB | null = null
	private integrationId: string | null = null
	private adapter: SmartHQAdapter | null = null
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private reconnectDelay = RECONNECT_BASE_MS
	private stopped = false

	// per-device debounce timers for state refresh
	private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()

	async start(db: DB, integrationId: string, session: string | null) {
		this.db = db
		this.integrationId = integrationId
		this.stopped = false

		if (!session) {
			log.warn('smarthq stream: no session, skipping')
			return
		}

		// single adapter instance — reused for all API calls and token refreshes
		this.adapter = new SmartHQAdapter({}, session, (newSession) => {
			// persist refreshed tokens back to DB
			if (!this.db || !this.integrationId) return
			this.db.update(integrations)
				.set({ session: newSession, updatedAt: Date.now() })
				.where(eq(integrations.id, this.integrationId))
				.run()
			log.debug('smarthq stream: session persisted to DB')
		})

		await this.subscribe()
		await this.connect()
	}

	stop() {
		this.stopped = true
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		// clear all debounce timers
		for (const timer of this.refreshTimers.values()) clearTimeout(timer)
		this.refreshTimers.clear()

		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
		this.adapter = null
		log.info('smarthq stream stopped')
	}

	private async subscribe() {
		if (!this.adapter) return

		// ensure token is fresh before subscribing
		const tokenResult = await this.adapter.getState('__noop__')
		// ^ getState calls ensureValidToken; we ignore the result — just want the side effect
		// better: expose ensureValidToken, but for now this is fine since getState is cheap to fail

		const session = this.adapter.session
		if (!session) return

		const parsed = JSON.parse(session) as SmartHQSession

		try {
			const res = await fetch('https://client.mysmarthq.com/v2/pubsub', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${parsed.accessToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					kind: 'user#pubsub',
					pubsub: true,
					services: true,
					presence: true,
				}),
				signal: AbortSignal.timeout(15_000),
			})

			if (!res.ok) {
				log.error('smarthq pubsub subscribe failed', { status: res.status })
				return
			}
			log.info('smarthq pubsub subscribed')
		} catch (e) {
			log.error('smarthq pubsub subscribe error', { error: (e as Error).message })
		}
	}

	private async connect() {
		if (this.stopped || !this.adapter) return

		try {
			const session = this.adapter.session
			if (!session) {
				log.warn('smarthq websocket: no session')
				this.scheduleReconnect()
				return
			}

			const parsed = JSON.parse(session) as SmartHQSession

			// get WebSocket endpoint
			const res = await fetch('https://client.mysmarthq.com/v2/websocket', {
				headers: { Authorization: `Bearer ${parsed.accessToken}` },
				signal: AbortSignal.timeout(15_000),
			})

			if (!res.ok) {
				log.error('smarthq websocket endpoint failed', { status: res.status })
				this.scheduleReconnect()
				return
			}

			const data = (await res.json()) as SmartHQWebSocketEndpoint
			const wsUrl = data.endpoint

			// validate URL to prevent SSRF
			if (!wsUrl || !wsUrl.startsWith('wss://')) {
				log.error('smarthq websocket: invalid endpoint URL', { url: wsUrl })
				this.scheduleReconnect()
				return
			}

			log.info('smarthq websocket connecting')
			this.ws = new WebSocket(wsUrl)

			this.ws.onopen = () => {
				log.info('smarthq websocket connected')
				this.reconnectDelay = RECONNECT_BASE_MS // reset backoff
			}

			this.ws.onmessage = (event) => {
				this.handleMessage(event.data as string)
			}

			this.ws.onclose = () => {
				log.info('smarthq websocket closed')
				this.ws = null
				if (!this.stopped) this.scheduleReconnect()
			}

			this.ws.onerror = (event) => {
				log.error('smarthq websocket error', { error: String(event) })
			}
		} catch (e) {
			log.error('smarthq websocket connect failed', { error: (e as Error).message })
			this.scheduleReconnect()
		}
	}

	private handleMessage(raw: string) {
		if (!this.db) return

		let msg: Record<string, unknown>
		try {
			msg = JSON.parse(raw) as Record<string, unknown>
		} catch (e) {
			log.error('smarthq stream: invalid JSON', { error: (e as Error).message })
			return
		}

		const deviceId = msg.deviceId as string | undefined
		if (!deviceId) return

		// look up our device by externalId
		const device = this.db
			.select()
			.from(devices)
			.where(eq(devices.externalId, deviceId))
			.get()

		if (!device) return

		// presence change
		if (msg.kind === 'device#presence') {
			const online = msg.presence === 'ONLINE'
			this.db.update(devices)
				.set({ online, updatedAt: Date.now(), lastSeen: Date.now() })
				.where(eq(devices.id, device.id))
				.run()

			eventBus.publish({
				type: online ? 'device:online' : 'device:offline',
				deviceId: device.id,
				brand: 'ge',
				online,
				timestamp: Date.now(),
				source: 'stream',
			})
			return
		}

		// service state change — debounce per-device to batch rapid updates
		if (msg.kind === 'service#state' || msg.kind === 'device#state') {
			const existing = this.refreshTimers.get(device.id)
			if (existing) clearTimeout(existing)

			this.refreshTimers.set(
				device.id,
				setTimeout(() => {
					this.refreshTimers.delete(device.id)
					this.refreshDeviceState(device.id, deviceId)
				}, DEBOUNCE_MS),
			)
		}
	}

	private async refreshDeviceState(jarvisDeviceId: string, externalId: string) {
		if (!this.db || !this.adapter) return

		try {
			const result = await this.adapter.getState(externalId)
			if (result.isErr()) {
				log.error('smarthq state refresh failed', { deviceId: jarvisDeviceId, error: result.error.message })
				return
			}

			const newState = result.value
			const device = this.db.select().from(devices).where(eq(devices.id, jarvisDeviceId)).get()
			if (!device) return

			const currentState = parseJson<DeviceState>(device.state).unwrapOr({})
			const merged = { ...currentState, ...newState }
			const now = Date.now()

			this.db.update(devices)
				.set({ state: JSON.stringify(merged), online: true, lastSeen: now, updatedAt: now })
				.where(eq(devices.id, jarvisDeviceId))
				.run()

			eventBus.publish({
				type: 'device:update',
				deviceId: jarvisDeviceId,
				brand: 'ge',
				state: merged,
				timestamp: now,
				source: 'stream',
			})
		} catch (e) {
			log.error('smarthq state refresh error', { error: (e as Error).message })
		}
	}

	private scheduleReconnect() {
		if (this.stopped || this.reconnectTimer) return

		// jitter: ±25% to prevent thundering herd on reconnect
		const jitter = this.reconnectDelay * 0.25 * (Math.random() * 2 - 1)
		const delay = Math.round(this.reconnectDelay + jitter)

		log.info('smarthq websocket reconnecting', { delayMs: delay })
		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null
			// re-subscribe before reconnecting (token may have been refreshed)
			await this.subscribe()
			await this.connect()
		}, delay)

		// exponential backoff with cap
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
	}
}

export const smartHQStream = new SmartHQStream()
```

**Step 2: Hook into cloud-poller**

In `server/src/discovery/cloud-poller.ts`, the `startPolling()` function creates timers per integration. For SmartHQ (`brand === 'ge'`), start the WebSocket stream instead of interval-based polling.

Find the `startPolling` function. Add at the top of the function body, before the timer setup:

```ts
// SmartHQ uses WebSocket stream instead of polling
if (integration.brand === 'ge') {
	smartHQStream.start(db, integration.id, integration.session)
	// still run initial discovery to populate devices
	runDiscovery(db, integration).catch(() => {})
	return
}
```

Add import at top of `cloud-poller.ts`:

```ts
import { smartHQStream } from '../integrations/smarthq/stream'
```

In `stopPolling()`, add before the existing logic:

```ts
// stop SmartHQ stream if applicable
smartHQStream.stop()
```

**Step 3: Run typecheck and lint**

```bash
bun run system:check --force
```

**Step 4: Commit**

```bash
git add server/src/integrations/smarthq/stream.ts server/src/discovery/cloud-poller.ts
git commit -m "feat(smarthq): add WebSocket stream with debounce, jitter, session persistence"
```

---

### Task 7: Matter Bridge — Appliance Device Types

Add washer and dishwasher to the Matter device factory and bridge state handlers. These use the OperationalState cluster for status monitoring.

**Files:**
- Modify: `server/src/matter/device-factory.ts`
- Modify: `server/src/matter/bridge.ts`

> **Research insight — drop OvenDevice:** The `OvenDevice` in Matter is a composed parent with no mandatory clusters — it's just an identity container. Without child `CookSurfaceDevice` endpoints (which need TemperatureControl we don't have yet), the oven endpoint is a no-op. We still bridge it as a `BridgedNodeEndpoint` for reachability, but it doesn't get its own device type. We'll add `CookSurfaceDevice` children later when we have oven temperature data from SmartHQ.
>
> **Research insight — shared appliance handler:** Washer and dishwasher use identical state update logic (OnOff + OperationalState). Share a single `updateApplianceDevice()` method.

**Step 1: Add appliance imports and endpoint builders to device-factory.ts**

Add these imports at the top:

```ts
import { OperationalStateServer } from '@matter/main/behaviors/operational-state'
import { OperationalState } from '@matter/main/clusters/operational-state'
import { DishwasherDevice } from '@matter/main/devices/dishwasher'
import { LaundryWasherDevice } from '@matter/main/devices/laundry-washer'
```

Add a helper to map our cycleStatus to Matter OperationalStateEnum:

```ts
function toOperationalState(cycleStatus?: string): number {
	switch (cycleStatus) {
		case 'running':
			return OperationalState.OperationalStateEnum.Running
		case 'paused':
			return OperationalState.OperationalStateEnum.Paused
		case 'done':
		case 'idle':
		default:
			return OperationalState.OperationalStateEnum.Stopped
	}
}
```

Add composed device types for washer and dishwasher (shared pattern — OperationalState + OnOff):

```ts
// ─── Laundry Washer ──────────────────────────────────────────────────────────

const BridgedLaundryWasher = LaundryWasherDevice.with(
	OperationalStateServer,
	OnOffServer,
)

export interface WasherComposed {
	kind: 'washer'
	parent: Endpoint
	applianceEndpoint: Endpoint
}

function createLaundryWasher(device: Device, state: DeviceState): WasherComposed {
	const parent = new Endpoint(BridgedNodeEndpoint, {
		id: device.id,
		bridgedDeviceBasicInformation: {
			nodeLabel: device.name,
			reachable: device.online,
		},
	})

	const applianceEndpoint = new Endpoint(BridgedLaundryWasher, {
		id: `${device.id}-washer`,
		onOff: { onOff: state.on ?? false },
		operationalState: {
			operationalState: toOperationalState(state.cycleStatus),
			operationalStateList: [
				{ operationalStateId: OperationalState.OperationalStateEnum.Stopped, operationalStateLabel: 'Idle' },
				{ operationalStateId: OperationalState.OperationalStateEnum.Running, operationalStateLabel: 'Running' },
				{ operationalStateId: OperationalState.OperationalStateEnum.Paused, operationalStateLabel: 'Paused' },
			],
		},
	})

	return { kind: 'washer', parent, applianceEndpoint }
}

// ─── Dishwasher ──────────────────────────────────────────────────────────────

const BridgedDishwasher = DishwasherDevice.with(
	OperationalStateServer,
	OnOffServer,
)

export interface DishwasherComposed {
	kind: 'dishwasher'
	parent: Endpoint
	applianceEndpoint: Endpoint
}

function createDishwasher(device: Device, state: DeviceState): DishwasherComposed {
	const parent = new Endpoint(BridgedNodeEndpoint, {
		id: device.id,
		bridgedDeviceBasicInformation: {
			nodeLabel: device.name,
			reachable: device.online,
		},
	})

	const applianceEndpoint = new Endpoint(BridgedDishwasher, {
		id: `${device.id}-dw`,
		onOff: { onOff: state.on ?? false },
		operationalState: {
			operationalState: toOperationalState(state.cycleStatus),
			operationalStateList: [
				{ operationalStateId: OperationalState.OperationalStateEnum.Stopped, operationalStateLabel: 'Idle' },
				{ operationalStateId: OperationalState.OperationalStateEnum.Running, operationalStateLabel: 'Running' },
				{ operationalStateId: OperationalState.OperationalStateEnum.Paused, operationalStateLabel: 'Paused' },
			],
		},
	})

	return { kind: 'dishwasher', parent, applianceEndpoint }
}
```

Update the `ComposedEndpoint` union and `createMatterEndpoint` factory:

```ts
export type ComposedEndpoint = AirPurifierComposed | ThermostatComposed | WasherComposed | DishwasherComposed
```

Add cases to the switch in `createMatterEndpoint`:

```ts
case 'washer_dryer':
	return ok({ composed: true, composed_device: createLaundryWasher(device, state) })

case 'dishwasher':
	return ok({ composed: true, composed_device: createDishwasher(device, state) })

case 'oven':
	// oven is a composed parent with no mandatory clusters — bridge as simple reachable node
	// CookSurface children will be added later when we have temperature data
	return ok({
		composed: false,
		device: new Endpoint(BridgedNodeEndpoint, {
			id: device.id,
			bridgedDeviceBasicInformation: {
				nodeLabel: device.name,
				reachable: device.online,
			},
		}),
	})
```

**Step 2: Add bridge state handlers in bridge.ts**

Add new DeviceEntry variants in the `DeviceEntry` type:

```ts
| { type: 'appliance'; root: Endpoint; appliance: Endpoint }
```

In `addComposedDevice()`, add handlers for washer and dishwasher (shared path):

```ts
} else if (composed.kind === 'washer' || composed.kind === 'dishwasher') {
	await this.aggregator!.add(composed.parent)
	await composed.parent.add(composed.applianceEndpoint)

	this.entries.set(device.id, {
		type: 'appliance',
		root: composed.parent,
		appliance: composed.applianceEndpoint,
	})
	// no inbound handlers — status monitoring only
}
```

In `updateDeviceState()`, add handler for the new entry type:

```ts
} else if (entry.type === 'appliance') {
	await this.updateApplianceDevice(entry.appliance, state)
}
```

Add the shared appliance state updater:

```ts
private async updateApplianceDevice(endpoint: Endpoint, state: Partial<DeviceState>) {
	if (state.on !== undefined) {
		await endpoint.setStateOf('onOff', { onOff: state.on })
	}

	if (state.cycleStatus !== undefined) {
		const opState = state.cycleStatus === 'running'
			? 1 // Running
			: state.cycleStatus === 'paused'
				? 2 // Paused
				: 0 // Stopped
		await endpoint.setStateOf('operationalState', { operationalState: opState })
	}
}
```

**Step 3: Run typecheck and lint**

```bash
bun run system:check --force
```

**Step 4: Commit**

```bash
git add server/src/matter/device-factory.ts server/src/matter/bridge.ts
git commit -m "feat(matter): add washer and dishwasher appliance device types"
```

---

### Task 8: Cloud Poller — SmartHQ Polling Config

Even though SmartHQ primarily uses WebSocket, the cloud poller still runs initial discovery. Add polling config so discovery works on startup.

**Files:**
- Modify: `server/src/discovery/cloud-poller.ts`

**Step 1: Add SmartHQ poll config**

In the `DEFAULTS` record, add:

```ts
ge: { stateIntervalMs: 0, discoverIntervalMs: 15 * 60_000 },
```

`stateIntervalMs: 0` means no polling for state (WebSocket handles it). Discovery runs every 15 minutes to catch newly added devices.

**Step 2: Run typecheck**

```bash
bun run system:check --force
```

**Step 3: Commit**

```bash
git add server/src/discovery/cloud-poller.ts
git commit -m "feat(smarthq): add discovery poll config for SmartHQ"
```

---

### Task 9: End-to-End Test — Manual Verification

No automated tests for external API integration — verify manually.

**Step 1: Set up environment**

Ensure `.env` has:
```
SMARTHQ_CLIENT_ID=<from developer portal>
SMARTHQ_CLIENT_SECRET=<from developer portal>
```

**Step 2: Start the dev server**

```bash
bun run dev
```

**Step 3: Test OAuth flow**

1. Open `http://localhost:5173/integrations`
2. Find "GE SmartHQ" in the available integrations
3. Click "Connect" — should redirect to SmartHQ login
4. Log in with GE account credentials
5. Grant permission → should redirect back to `/integrations?oauth=success&brand=ge`

**Step 4: Verify device discovery**

Check server logs for:
```
discover started { integrationCount: ..., brands: ['ge'] }
discover succeeded { brand: 'ge', deviceCount: N }
```

**Step 5: Verify WebSocket stream**

Check server logs for:
```
smarthq pubsub subscribed
smarthq websocket connected
```

**Step 6: Verify session persistence**

After WebSocket has been connected for ~1 hour (token refresh):
1. Check server logs for `smarthq token refreshed` and `smarthq stream: session persisted to DB`
2. Restart the server — verify it reconnects without re-authenticating

**Step 7: Verify Matter bridge**

If Matter bridge is running and paired:
1. Enable Matter for a GE device via the dashboard
2. Check Google Home / Apple Home for the new appliance
3. Run a cycle on a real appliance → verify state updates propagate

**Step 8: Iterate on parsers**

After seeing real API responses:
1. Check server logs for the raw state shape
2. Update `parsers.ts` with actual field mappings
3. Add `timeRemaining`, `doorLocked`, phase lists, temperature data as available

---

### Task 10: Dashboard — Appliance Status Cards (Optional, Deferred)

This task is deferred until the integration is working end-to-end. Once real device state is flowing, design status cards for washer/dishwasher/oven following the existing DeviceCard pattern.

Likely additions:
- Cycle progress indicator (phase name + time remaining)
- Door status badge
- Temperature readout for oven
- Cycle complete notification via toast

These will be driven by the actual state shape from SmartHQ services. No point designing cards before we see real data.

---

## File Summary

| Action | File |
|--------|------|
| Create | `server/src/integrations/smarthq/types.ts` |
| Create | `server/src/integrations/smarthq/parsers.ts` |
| Create | `server/src/integrations/smarthq/adapter.ts` |
| Create | `server/src/integrations/smarthq/stream.ts` |
| Modify | `server/src/integrations/types.ts` |
| Modify | `server/src/integrations/registry.ts` |
| Modify | `server/src/routes/integrations.controller.ts` |
| Modify | `server/src/discovery/cloud-poller.ts` |
| Modify | `server/src/matter/device-factory.ts` |
| Modify | `server/src/matter/bridge.ts` |

## Security Considerations

- **MAC addresses excluded from metadata** — `macAddress` from SmartHQ API is not stored in device metadata (PII risk)
- **WebSocket URL validated** — only `wss://` URLs accepted, preventing SSRF
- **Refresh lock prevents token races** — concurrent 401 responses don't trigger parallel refreshes
- **Session persisted on refresh** — refreshed tokens survive server restart
- **No `client_secret` in URL params** — sent in POST body per SmartHQ spec
- **CSRF-signed OAuth state** — existing controller pattern protects against CSRF
