import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { ResultAsync, errAsync } from 'neverthrow'
import { join } from 'path'

import type { DeviceAdapter, DeviceState, DeviceType, DiscoveredDevice } from '../types'

const BASE_URL = 'https://smartapi.vesync.com'
const TIMEOUT = 15_000
const TOKEN_EXPIRED_CODE = -11001000

// pyvesync-aligned constants
const APP_VERSION = '5.6.60'
const APP_ID = 'eldodkfj'
const PHONE_BRAND = 'pyvesync'
const PHONE_OS = 'Android'
const CLIENT_TYPE = 'vesyncApp'
const DEFAULT_TZ = 'America/New_York'
const DEFAULT_LANG = 'en'
const DEFAULT_REGION = 'US'
const BYPASS_HEADERS = {
	'Content-Type': 'application/json; charset=UTF-8',
	'User-Agent': 'okhttp/3.12.1',
}

// ─── VeSync API types ─────────────────────────────────────────────────────────

interface VeSyncSession {
	token: string
	accountID: string
	countryCode: string
	expiresAt: number
}

interface VeSyncAuthStep1Response {
	result: {
		authorizeCode: string
		accountID: string
	}
	code: number
	msg: string
}

interface VeSyncAuthStep2Response {
	result: {
		token: string
		accountID: string
		countryCode: string
	}
	code: number
	msg: string
}

interface VeSyncDevice {
	cid: string
	uuid: string
	deviceName: string
	deviceType: string
	type: string
	configModule: string
	deviceRegion: string
	connectionStatus: string
}

interface VeSyncDeviceListResponse {
	result: {
		list: VeSyncDevice[]
		total: number
	}
	code: number
}

interface VeSyncBypassResponse {
	result: {
		result?: Record<string, unknown>
		code?: number
		msg?: string
	}
	code: number
	msg: string
}

interface VeSyncDeviceMeta {
	cid: string
	uuid: string
	configModule: string
	deviceType: string
	deviceRegion: string
}

// ─── Session cache (persisted to disk, survives hot reloads) ─────────────────

const SESSION_FILE = join(import.meta.dir, '../../../data/vesync-sessions.json')

const sessionCache = new Map<string, VeSyncSession>(loadSessionsFromDisk())

function loadSessionsFromDisk(): Array<[string, VeSyncSession]> {
	try {
		if (!existsSync(SESSION_FILE)) return []
		const raw = readFileSync(SESSION_FILE, 'utf-8')
		const entries = JSON.parse(raw) as Array<[string, VeSyncSession]>
		// filter out expired sessions
		return entries.filter(([, s]) => Date.now() < s.expiresAt)
	} catch {
		return []
	}
}

function persistSessions(): void {
	try {
		writeFileSync(SESSION_FILE, JSON.stringify([...sessionCache.entries()]))
	} catch {
		// non-fatal — worst case we re-login next restart
	}
}

function sessionKey(email: string, password: string): string {
	return `${email}:${md5(password)}`
}

function md5(input: string): string {
	// eslint-disable-next-line sonarjs/hashing -- vesync API requires MD5-hashed passwords
	return createHash('md5').update(input).digest('hex')
}

function terminalId(): string {
	return `2${crypto.randomUUID().replace(/-/g, '')}`
}

function traceId(): string {
	return String(Math.floor(Date.now() / 1000))
}

async function login(email: string, password: string): Promise<VeSyncSession> {
	const passwordHash = md5(password)
	const tid = terminalId()

	// step 1: get authorize code
	const step1Res = await fetch(`${BASE_URL}/globalPlatform/api/accountAuth/v1/authByPWDOrOTM`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			acceptLanguage: DEFAULT_LANG,
			accountID: '',
			appID: APP_ID,
			authProtocolType: 'generic',
			clientInfo: PHONE_BRAND,
			clientType: CLIENT_TYPE,
			clientVersion: `VeSync ${APP_VERSION}`,
			debugMode: false,
			email,
			method: 'authByPWDOrOTM',
			osInfo: PHONE_OS,
			password: passwordHash,
			sourceAppID: APP_ID,
			terminalId: tid,
			timeZone: DEFAULT_TZ,
			token: '',
			traceId: traceId(),
			userCountryCode: DEFAULT_REGION,
		}),
		signal: AbortSignal.timeout(TIMEOUT),
	})

	if (!step1Res.ok) throw new Error(`VeSync auth step 1 failed: ${step1Res.status}`)
	const step1 = (await step1Res.json()) as VeSyncAuthStep1Response
	if (step1.code !== 0) throw new Error(`VeSync auth failed: ${step1.msg || 'invalid credentials'}`)

	const { authorizeCode } = step1.result

	// step 2: exchange authorize code for token
	const step2Res = await fetch(`${BASE_URL}/user/api/accountManage/v1/loginByAuthorizeCode4Vesync`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			acceptLanguage: DEFAULT_LANG,
			accountID: '',
			authorizeCode,
			clientInfo: PHONE_BRAND,
			clientType: CLIENT_TYPE,
			clientVersion: `VeSync ${APP_VERSION}`,
			debugMode: false,
			emailSubscriptions: false,
			method: 'loginByAuthorizeCode4Vesync',
			osInfo: PHONE_OS,
			terminalId: tid,
			timeZone: DEFAULT_TZ,
			token: '',
			traceId: traceId(),
			userCountryCode: DEFAULT_REGION,
		}),
		signal: AbortSignal.timeout(TIMEOUT),
	})

	if (!step2Res.ok) throw new Error(`VeSync auth step 2 failed: ${step2Res.status}`)
	const step2 = (await step2Res.json()) as VeSyncAuthStep2Response
	if (step2.code !== 0) throw new Error(`VeSync auth step 2 failed: ${step2.msg}`)

	return {
		token: step2.result.token,
		accountID: step2.result.accountID,
		countryCode: step2.result.countryCode ?? DEFAULT_REGION,
		expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
	}
}

async function getSession(email: string, password: string): Promise<VeSyncSession> {
	const key = sessionKey(email, password)
	const cached = sessionCache.get(key)
	if (cached && Date.now() < cached.expiresAt) return cached

	const session = await login(email, password)
	sessionCache.set(key, session)
	persistSessions()
	return session
}

function invalidateSession(email: string, password: string): void {
	sessionCache.delete(sessionKey(email, password))
	persistSessions()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapVeSyncType(deviceType: string, type: string): DeviceType {
	const dt = deviceType.toLowerCase()
	const t = type.toLowerCase()

	if (dt.includes('wifi-air') || t.startsWith('core') || t.startsWith('lav') || t.startsWith('vital')) return 'air_purifier'
	if (dt.includes('wifi-switch') || t.startsWith('esw')) return 'switch'
	if (dt.includes('wifi-humid') || t.startsWith('luh') || t.startsWith('oasis')) return 'air_purifier'
	if (t.startsWith('esl') || t.startsWith('xyd')) return 'light'
	return 'switch'
}

function buildDeviceListPayload(session: VeSyncSession): string {
	return JSON.stringify({
		acceptLanguage: DEFAULT_LANG,
		accountID: session.accountID,
		appVersion: APP_VERSION,
		method: 'devices',
		pageNo: 1,
		pageSize: 100,
		phoneBrand: PHONE_BRAND,
		phoneOS: PHONE_OS,
		timeZone: DEFAULT_TZ,
		token: session.token,
		traceId: traceId(),
	})
}

function buildBypassPayload(
	session: VeSyncSession,
	meta: VeSyncDeviceMeta,
	method: string,
	data: Record<string, unknown> = {},
): string {
	return JSON.stringify({
		acceptLanguage: DEFAULT_LANG,
		accountID: session.accountID,
		appVersion: APP_VERSION,
		cid: meta.cid,
		configModule: meta.configModule,
		configModel: meta.configModule,
		debugMode: false,
		deviceId: meta.cid,
		deviceRegion: meta.deviceRegion,
		method: 'bypassV2',
		payload: {
			data,
			method,
			source: 'APP',
		},
		phoneBrand: PHONE_BRAND,
		phoneOS: PHONE_OS,
		timeZone: DEFAULT_TZ,
		token: session.token,
		traceId: traceId(),
		userCountryCode: DEFAULT_REGION,
		uuid: meta.uuid,
	})
}

function parseAirPurifierState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = result.result as Record<string, unknown> | undefined

	if (r) {
		if ('enabled' in r) state.on = r.enabled === true
		if ('switch_on' in r) state.on = r.switch_on === true
		if ('fan_level' in r) state.fanSpeed = (r.fan_level as number) * 20 // 1-5 → 0-100
		if ('air_quality_value' in r) state.airQuality = r.air_quality_value as number
		if ('filter_life' in r) state.humidity = r.filter_life as number // reuse field for filter %
		if ('mode' in r) state.mode = r.mode as string
	}

	return state
}

function parseSwitchState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = result.result as Record<string, unknown> | undefined

	if (r) {
		if ('enabled' in r) state.on = r.enabled === true
		if ('switch_on' in r) state.on = r.switch_on === true
	}

	return state
}

function parseLightState(result: Record<string, unknown>): DeviceState {
	const state: DeviceState = {}
	const r = result.result as Record<string, unknown> | undefined

	if (r) {
		if ('enabled' in r) state.on = r.enabled === true
		if ('brightness' in r) state.brightness = r.brightness as number
		if ('colorTemp' in r) state.colorTemp = r.colorTemp as number
	}

	return state
}

function getStatusMethod(deviceType: DeviceType): string {
	switch (deviceType) {
		case 'air_purifier':
			return 'getPurifierStatus'
		case 'switch':
			return 'getOutletStatus'
		case 'light':
			return 'getLightStatus'
		default:
			return 'getPurifierStatus'
	}
}

function parseStateByType(deviceType: DeviceType, result: Record<string, unknown>): DeviceState {
	switch (deviceType) {
		case 'air_purifier':
			return parseAirPurifierState(result)
		case 'switch':
			return parseSwitchState(result)
		case 'light':
			return parseLightState(result)
		default:
			return parseAirPurifierState(result)
	}
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class VeSyncAdapter implements DeviceAdapter {
	readonly brand = 'vesync'
	readonly displayName = 'VeSync (Levoit)'
	readonly discoveryMethod = 'cloud' as const

	private email: string
	private password: string

	constructor(config: Record<string, string>) {
		this.email = config.email ?? ''
		this.password = config.password ?? ''
	}

	validateCredentials(config: Record<string, string>): ResultAsync<void, Error> {
		const email = config.email
		const password = config.password
		if (!email) return errAsync(new Error('Email is required'))
		if (!password) return errAsync(new Error('Password is required'))

		return ResultAsync.fromPromise(
			login(email, password),
			(e) => new Error(`VeSync login failed: ${(e as Error).message}`),
		).map(() => undefined)
	}

	discover(): ResultAsync<DiscoveredDevice[], Error> {
		return ResultAsync.fromPromise(
			this.fetchDevices(),
			(e) => new Error(`VeSync discovery failed: ${(e as Error).message}`),
		)
	}

	getState(externalId: string): ResultAsync<DeviceState, Error> {
		return ResultAsync.fromPromise(
			this.fetchDeviceState(externalId),
			(e) => new Error(`VeSync state error: ${(e as Error).message}`),
		)
	}

	setState(externalId: string, state: Partial<DeviceState>): ResultAsync<void, Error> {
		return ResultAsync.fromPromise(
			this.controlDevice(externalId, state),
			(e) => new Error(`VeSync control error: ${(e as Error).message}`),
		)
	}

	// ─── Private ────────────────────────────────────────────────────────────────

	private async fetchDevices(): Promise<DiscoveredDevice[]> {
		const session = await getSession(this.email, this.password)
		const res = await fetch(`${BASE_URL}/cloud/v1/deviceManaged/devices`, {
			method: 'POST',
			headers: BYPASS_HEADERS,
			body: buildDeviceListPayload(session),
			signal: AbortSignal.timeout(TIMEOUT),
		})

		if (!res.ok) throw new Error(`VeSync device list error: ${res.status}`)
		const data = (await res.json()) as VeSyncDeviceListResponse
		if (data.code !== 0) throw new Error(`VeSync device list error code: ${data.code}`)

		const deviceList = data.result?.list ?? []
		const results: DiscoveredDevice[] = []
		const concurrency = 3

		for (let i = 0; i < deviceList.length; i += concurrency) {
			const batch = deviceList.slice(i, i + concurrency)
			const settled = await Promise.allSettled(
				batch.map(async (d) => {
					const type = mapVeSyncType(d.deviceType, d.type)
					const online = d.connectionStatus === 'online'
					const meta: VeSyncDeviceMeta = {
						cid: d.cid,
						uuid: d.uuid,
						configModule: d.configModule,
						deviceType: d.deviceType,
						deviceRegion: d.deviceRegion,
					}

					const discovered: DiscoveredDevice = {
						externalId: d.cid,
						name: d.deviceName,
						type,
						state: {},
						online,
						metadata: { ...meta },
					}

					if (online) {
						try {
							discovered.state = await this.fetchDeviceStateWithMeta(meta, type, session)
						} catch {
							// state fetch failed — keep empty state, device still shows as online
						}
					}

					return discovered
				}),
			)

			for (const result of settled) {
				if (result.status === 'fulfilled') results.push(result.value)
			}
		}

		return results
	}

	private async fetchDeviceState(externalId: string): Promise<DeviceState> {
		return this.withTokenRetry(async (session) => {
			const res = await fetch(`${BASE_URL}/cloud/v1/deviceManaged/devices`, {
				method: 'POST',
				headers: BYPASS_HEADERS,
				body: buildDeviceListPayload(session),
				signal: AbortSignal.timeout(TIMEOUT),
			})

			if (!res.ok) throw new Error(`VeSync device list error: ${res.status}`)
			const data = (await res.json()) as VeSyncDeviceListResponse
			const device = data.result?.list?.find((d) => d.cid === externalId)
			if (!device) throw new Error(`Device ${externalId} not found`)

			const type = mapVeSyncType(device.deviceType, device.type)
			const meta: VeSyncDeviceMeta = {
				cid: device.cid,
				uuid: device.uuid,
				configModule: device.configModule,
				deviceType: device.deviceType,
				deviceRegion: device.deviceRegion,
			}

			return this.fetchDeviceStateWithMeta(meta, type, session)
		})
	}

	private async fetchDeviceStateWithMeta(
		meta: VeSyncDeviceMeta,
		type: DeviceType,
		session: VeSyncSession,
	): Promise<DeviceState> {
		const method = getStatusMethod(type)
		const payload = buildBypassPayload(session, meta, method)

		const res = await fetch(`${BASE_URL}/cloud/v2/deviceManaged/bypassV2`, {
			method: 'POST',
			headers: BYPASS_HEADERS,
			body: payload,
			signal: AbortSignal.timeout(TIMEOUT),
		})

		if (!res.ok) throw new Error(`VeSync bypass error: ${res.status}`)
		const data = (await res.json()) as VeSyncBypassResponse

		if (data.code === TOKEN_EXPIRED_CODE) throw new TokenExpiredError()
		if (data.code !== 0) throw new Error(`VeSync bypass error: ${data.msg || data.code}`)

		return parseStateByType(type, data.result as Record<string, unknown>)
	}

	private async controlDevice(externalId: string, state: Partial<DeviceState>): Promise<void> {
		await this.withTokenRetry(async (session) => {
			const res = await fetch(`${BASE_URL}/cloud/v1/deviceManaged/devices`, {
				method: 'POST',
				headers: BYPASS_HEADERS,
				body: buildDeviceListPayload(session),
				signal: AbortSignal.timeout(TIMEOUT),
			})

			if (!res.ok) throw new Error(`VeSync device list error: ${res.status}`)
			const data = (await res.json()) as VeSyncDeviceListResponse
			const device = data.result?.list?.find((d) => d.cid === externalId)
			if (!device) throw new Error(`Device ${externalId} not found`)

			const meta: VeSyncDeviceMeta = {
				cid: device.cid,
				uuid: device.uuid,
				configModule: device.configModule,
				deviceType: device.deviceType,
				deviceRegion: device.deviceRegion,
			}

			if (state.on !== undefined) {
				await this.sendBypass(session, meta, 'setSwitch', { enabled: state.on, id: 0 })
			}
			if (state.fanSpeed !== undefined) {
				const level = Math.max(1, Math.min(5, Math.round(state.fanSpeed / 20)))
				await this.sendBypass(session, meta, 'setLevel', { level, id: 0, type: 'wind' })
			}
			if (state.brightness !== undefined) {
				await this.sendBypass(session, meta, 'setLightStatus', { brightness: state.brightness })
			}
		})
	}

	private async sendBypass(
		session: VeSyncSession,
		meta: VeSyncDeviceMeta,
		method: string,
		data: Record<string, unknown>,
	): Promise<void> {
		const payload = buildBypassPayload(session, meta, method, data)
		const res = await fetch(`${BASE_URL}/cloud/v2/deviceManaged/bypassV2`, {
			method: 'POST',
			headers: BYPASS_HEADERS,
			body: payload,
			signal: AbortSignal.timeout(TIMEOUT),
		})

		if (!res.ok) throw new Error(`VeSync control error: ${res.status}`)
		const result = (await res.json()) as VeSyncBypassResponse
		if (result.code === TOKEN_EXPIRED_CODE) throw new TokenExpiredError()
		if (result.code !== 0) throw new Error(`VeSync control failed: ${result.msg || result.code}`)
	}

	private async withTokenRetry<T>(fn: (session: VeSyncSession) => Promise<T>): Promise<T> {
		const session = await getSession(this.email, this.password)
		try {
			return await fn(session)
		} catch (e) {
			if (e instanceof TokenExpiredError) {
				invalidateSession(this.email, this.password)
				const freshSession = await getSession(this.email, this.password)
				return fn(freshSession)
			}
			throw e
		}
	}
}

class TokenExpiredError extends Error {
	constructor() {
		super('VeSync token expired')
		this.name = 'TokenExpiredError'
	}
}
