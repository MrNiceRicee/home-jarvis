import { randomBytes } from 'crypto'

import { log } from './logger'

// centralized env config — single source of truth for all process.env reads

function parseNumber(raw: string | undefined, fallback: number): number {
	if (!raw) return fallback
	const n = Number(raw)
	return Number.isFinite(n) ? n : fallback
}

export const env = {
	PORT: parseNumber(process.env.PORT, 3001),
	DB_PATH: process.env.DB_PATH,
	OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET ?? randomBytes(32).toString('hex'),
	RESIDEO_CONSUMER_KEY: process.env.RESIDEO_CONSUMER_KEY,
	RESIDEO_CONSUMER_SECRET: process.env.RESIDEO_CONSUMER_SECRET,
	SMARTHQ_CLIENT_ID: process.env.SMARTHQ_CLIENT_ID,
	SMARTHQ_CLIENT_SECRET: process.env.SMARTHQ_CLIENT_SECRET,
	MATTER_VENDOR_ID: parseNumber(process.env.MATTER_VENDOR_ID, 0xfff1),
	MATTER_PRODUCT_ID: parseNumber(process.env.MATTER_PRODUCT_ID, 0x8000),
	// eslint-disable-next-line sonarjs/no-clear-text-protocols -- localhost defaults are dev-only, production overrides via env
	CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3001')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean),
	SERVER_URL: process.env.SERVER_URL ?? 'http://localhost:3001',
	CLIENT_URL: process.env.CLIENT_URL ?? 'http://localhost:5173',
}

// warn about missing secrets at startup
if (!process.env.OAUTH_STATE_SECRET) {
	log.warn('OAUTH_STATE_SECRET not set — using random value (will invalidate on restart)')
}
