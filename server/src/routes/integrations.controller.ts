import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { eq } from 'drizzle-orm'
import Elysia, { status, t } from 'elysia'

import type { Integration } from '../db/schema'

import { db } from '../db'
import { integrations } from '../db/schema'
import { startPolling, stopPolling } from '../discovery/cloud-poller'
import { discoverHueBridges, createHueApiKey } from '../integrations/hue/adapter'
import { INTEGRATION_META, createAdapter, getOAuthConfig } from '../integrations/registry'
import { log } from '../lib/logger'
import { isPrivateIp } from '../lib/validate-ip'

// signing key for OAuth state CSRF tokens — separate from consumer secrets
const STATE_SIGNING_KEY = process.env.OAUTH_STATE_SECRET ?? randomBytes(32).toString('hex')
const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes
const TOKEN_TIMEOUT = 15_000
const CLIENT_BASE = 'http://localhost:5173'

function signState(payload: string): string {
	const sig = createHmac('sha256', STATE_SIGNING_KEY).update(payload).digest('base64url')
	return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

function verifyState(state: string): { brand: string; ts: number; nonce: string } | null {
	const dotIdx = state.indexOf('.')
	if (dotIdx === -1) return null

	const payloadB64 = state.slice(0, dotIdx)
	const sig = state.slice(dotIdx + 1)

	const payload = Buffer.from(payloadB64, 'base64url').toString()
	const expected = createHmac('sha256', STATE_SIGNING_KEY).update(payload).digest('base64url')

	// constant-time comparison to prevent timing attacks
	const sigBuf = Buffer.from(sig)
	const expectedBuf = Buffer.from(expected)
	if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null

	try {
		const data = JSON.parse(payload) as { brand: string; ts: number; nonce: string }
		if (Date.now() - data.ts > STATE_MAX_AGE_MS) return null
		return data
	} catch {
		return null
	}
}

/** strip sensitive fields (config contains credentials, session contains auth tokens) */
function stripSensitive({ config: _config, session: _session, ...safe }: Integration): Omit<Integration, 'config' | 'session'> {
	return safe
}

export const integrationsController = new Elysia({ prefix: '/api/integrations' })
	.decorate('db', db)

	/** List all configured integrations + available brand metadata */
	.get('', ({ db }) => {
		const configured = db.select().from(integrations).all()
		return {
			configured: configured.map(stripSensitive),
			available: Object.values(INTEGRATION_META),
		}
	})

	/** Add a new integration (validates credentials first) */
	.post(
		'',
		async ({ db, body }) => {
			const { brand, config } = body

			const meta = INTEGRATION_META[brand]
			if (!meta) {
				log.warn('addIntegration unknown brand', { brand })
				return status(400, { error: `Unknown brand: ${brand}` })
			}

			// Skip validation for OAuth brands (LG) and discovery-only brands (Elgato)
			if (!meta.oauthFlow && !meta.discoveryOnly) {
				log.info('addIntegration validating credentials', { brand })
				const adapterResult = createAdapter(brand, config)
				if (adapterResult.isErr()) {
					log.error('addIntegration adapter error', { brand, error: adapterResult.error.message })
					return status(400, { error: adapterResult.error.message })
				}
				const credResult = await adapterResult.value.validateCredentials(config)
				if (credResult.isErr()) {
					log.warn('addIntegration credential validation failed', { brand, error: credResult.error.message })
					return status(422, { error: credResult.error.message })
				}
				log.info('addIntegration credentials valid', { brand })
			}

			// Upsert — if brand already exists, update config
			const existing = db.select().from(integrations).where(eq(integrations.brand, brand)).get()
			const now = Date.now()

			if (existing) {
				// clear session + authError on config change — forces re-auth on next poll
				db.update(integrations)
					.set({ config: JSON.stringify(config), session: null, authError: null, enabled: true, updatedAt: now })
					.where(eq(integrations.brand, brand))
					.run()

				const updated = db.select().from(integrations).where(eq(integrations.brand, brand)).get()!

				// restart polling with new config (session cleared)
				stopPolling(existing.id)
				startPolling(db, updated)

				log.info('addIntegration updated', { brand, integrationId: existing.id })
				return stripSensitive(updated)
			}

			const id = randomUUID()
			db.insert(integrations)
				.values({
					id,
					brand,
					config: JSON.stringify(config),
					enabled: true,
					createdAt: now,
					updatedAt: now,
				})
				.run()

			const inserted = db.select().from(integrations).where(eq(integrations.id, id)).get()!

			// Start polling
			startPolling(db, inserted)

			log.info('addIntegration created', { brand, integrationId: id })
			return stripSensitive(inserted)
		},
		{
			body: t.Object({
				brand: t.String(),
				config: t.Record(t.String(), t.String()),
			}),
		},
	)

	/** Remove an integration and all its devices */
	.delete('/:id', ({ db, params }) => {
		const integration = db.select().from(integrations).where(eq(integrations.id, params.id)).get()
		if (!integration) {
			log.warn('removeIntegration not found', { integrationId: params.id })
			return status(404, { error: 'Not found' })
		}

		log.info('removeIntegration', { brand: integration.brand, integrationId: params.id })
		stopPolling(params.id)

		// cascade delete handles device rows; integration removal is sufficient
		db.delete(integrations).where(eq(integrations.id, params.id)).run()
		log.info('removeIntegration ok', { brand: integration.brand })
		return { ok: true }
	})

	/** Hue-specific: discover bridges on local network */
	.get('/hue/discover-bridges', async () => {
		log.info('hue discoverBridges')
		const result = await discoverHueBridges()
		return result.match(
			(bridges) => {
				log.info('hue discoverBridges ok', { count: bridges.length, ips: bridges.map((b) => b.internalipaddress) })
				return bridges
			},
			(err) => {
				log.warn('hue discoverBridges failed', { error: err.message })
				return []
			},
		)
	})

	/** Hue-specific: create an API key by pressing the button */
	.post(
		'/hue/link',
		async ({ body }) => {
			const { bridgeIp } = body
			if (!isPrivateIp(bridgeIp)) {
				return status(400, { error: 'Invalid IP address: must be a private network address' })
			}
			log.info('hue link', { bridgeIp })
			const result = await createHueApiKey(bridgeIp)
			if (result.isErr()) {
				log.warn('hue link failed', { bridgeIp, error: result.error.message })
				return status(422, { error: result.error.message })
			}
			log.info('hue link ok', { bridgeIp })
			return { apiKey: result.value }
		},
		{
			body: t.Object({ bridgeIp: t.String() }),
		},
	)

	/** OAuth: start authorization flow — returns the redirect URL.
	 *  Uses `:id` param (brand name) to share the dynamic segment with DELETE /:id */
	.get('/:id/oauth/start', ({ params, redirect }) => {
		const brand = params.id
		const oauth = getOAuthConfig(brand)
		if (!oauth) {
			log.warn('oauth start: no config', { brand })
			return status(400, { error: `OAuth not configured for ${brand}` })
		}

		const nonce = randomBytes(8).toString('hex')
		const payload = JSON.stringify({ brand, ts: Date.now(), nonce })
		const state = signState(payload)

		const callbackUri = `http://localhost:3001/api/integrations/${brand}/oauth/callback`
		const url = new URL(oauth.authorizeUrl)
		url.searchParams.set('response_type', 'code')
		url.searchParams.set('client_id', oauth.clientId)
		url.searchParams.set('redirect_uri', callbackUri)
		url.searchParams.set('state', state)

		if (oauth.extraAuthorizeParams) {
			for (const [key, value] of Object.entries(oauth.extraAuthorizeParams)) {
				url.searchParams.set(key, value)
			}
		}

		log.info('oauth start', { brand })
		return redirect(url.toString())
	})

	/** OAuth: callback from provider — exchanges code for tokens, upserts integration, redirects to client.
	 *  This is a GET that mutates state (required by OAuth spec — the provider redirects the browser here).
	 *  Uses `:id` param (brand name) to share the dynamic segment with DELETE /:id */
	.get('/:id/oauth/callback', async ({ params, query, db, redirect }) => {
		const brand = params.id
		const errorUrl = (error: string) =>
			`${CLIENT_BASE}/integrations?oauth=error&brand=${brand}&error=${error}`

		// user denied consent
		if (query.error) {
			log.warn('oauth callback: user denied', { brand, error: query.error })
			return redirect(errorUrl('access_denied'))
		}

		// verify state CSRF token
		const stateParam = query.state
		if (!stateParam || typeof stateParam !== 'string') {
			log.warn('oauth callback: missing state', { brand })
			return redirect(errorUrl('invalid_state'))
		}

		const stateData = verifyState(stateParam)
		if (!stateData) {
			log.warn('oauth callback: invalid or expired state', { brand })
			return redirect(errorUrl('invalid_state'))
		}

		if (stateData.brand !== brand) {
			log.warn('oauth callback: brand mismatch', { expected: brand, got: stateData.brand })
			return redirect(errorUrl('brand_mismatch'))
		}

		// extract authorization code
		const code = query.code
		if (!code || typeof code !== 'string') {
			log.warn('oauth callback: missing code', { brand })
			return redirect(errorUrl('missing_code'))
		}

		const oauth = getOAuthConfig(brand)
		if (!oauth) {
			log.error('oauth callback: config disappeared', { brand })
			return redirect(errorUrl('exchange_failed'))
		}

		// exchange code for tokens
		const callbackUri = `http://localhost:3001/api/integrations/${brand}/oauth/callback`

		let tokenRes: Response
		try {
			const useBodyAuth = oauth.tokenAuthMethod === 'body'
			const headers: Record<string, string> = {
				'Content-Type': 'application/x-www-form-urlencoded',
			}
			if (!useBodyAuth) {
				const credentials = `${oauth.clientId}:${oauth.clientSecret}`
				headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`
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

		if (!tokenRes.ok) {
			const body = await tokenRes.text()
			log.error('oauth callback: token exchange failed', { brand, status: tokenRes.status, body })
			return redirect(errorUrl(body.includes('invalid_grant') ? 'code_expired' : 'exchange_failed'))
		}

		const tokenData = (await tokenRes.json()) as {
			access_token: string
			refresh_token: string
			expires_in: number | string
		}

		const expiresIn =
			typeof tokenData.expires_in === 'string'
				? Number.parseInt(tokenData.expires_in, 10)
				: tokenData.expires_in

		const session = JSON.stringify({
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token,
			expiresAt: Date.now() + expiresIn * 1000,
		})

		// upsert integration row
		const now = Date.now()
		const existing = db.select().from(integrations).where(eq(integrations.brand, brand)).get()

		if (existing) {
			db.update(integrations)
				.set({ session, authError: null, enabled: true, updatedAt: now })
				.where(eq(integrations.brand, brand))
				.run()

			stopPolling(existing.id)
			const updated = db.select().from(integrations).where(eq(integrations.brand, brand)).get()!
			startPolling(db, updated)

			log.info('oauth callback: integration updated', { brand, integrationId: existing.id })
		} else {
			const id = randomUUID()
			db.insert(integrations)
				.values({
					id,
					brand,
					config: '{}',
					session,
					enabled: true,
					createdAt: now,
					updatedAt: now,
				})
				.run()

			const inserted = db.select().from(integrations).where(eq(integrations.id, id)).get()!
			startPolling(db, inserted)

			log.info('oauth callback: integration created', { brand, integrationId: id })
		}

		return redirect(`${CLIENT_BASE}/integrations?oauth=success&brand=${brand}`)
	})
