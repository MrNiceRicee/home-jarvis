import { err, ok, type Result } from 'neverthrow'

import { env } from '../lib/env'
import { isPrivateIp } from '../lib/validate-ip'
import { ElgatoAdapter } from './elgato/adapter'
import { GoveeAdapter } from './govee/adapter'
import { HueAdapter } from './hue/adapter'
import { ResideoAdapter } from './resideo/adapter'
import { SmartHQAdapter } from './smarthq/adapter'
import { SmartThingsAdapter } from './smartthings/adapter'
import type { DeviceAdapter, IntegrationMeta } from './types'
import { VeSyncAdapter } from './vesync/adapter'

/** All supported integrations and their credential form metadata */
export const INTEGRATION_META: Record<string, IntegrationMeta> = {
	hue: {
		brand: 'hue',
		displayName: 'Philips Hue',
		nativeMatter: true,
		fields: [
			{
				key: 'bridgeIp',
				label: 'Bridge IP Address',
				type: 'text',
				placeholder: '192.168.1.x',
				hint: 'Run the Hue app → Settings → My Hue System to find the IP',
			},
			{
				key: 'apiKey',
				label: 'API Key',
				type: 'text',
				placeholder: 'Press the bridge button, then click "Link Bridge" below',
				hint: 'Press the physical button on your Hue bridge, then click "Link Bridge"',
			},
		],
	},
	govee: {
		brand: 'govee',
		displayName: 'Govee',
		fields: [
			{
				key: 'apiKey',
				label: 'API Key',
				type: 'password',
				placeholder: 'From developer.govee.com',
				hint: 'Sign up at developer.govee.com and create an API key',
			},
		],
	},
	vesync: {
		brand: 'vesync',
		displayName: 'VeSync (Levoit)',
		fields: [
			{ key: 'email', label: 'VeSync Account Email', type: 'text', placeholder: 'you@example.com' },
			{ key: 'password', label: 'Password', type: 'password', placeholder: '' },
		],
	},
	lg: {
		brand: 'lg',
		displayName: 'LG ThinQ',
		fields: [],
		oauthFlow: true,
	},
	ge: {
		brand: 'ge',
		displayName: 'GE SmartHQ',
		fields: [],
		oauthFlow: true,
	},
	aqara: {
		brand: 'aqara',
		displayName: 'Aqara',
		nativeMatter: true,
		fields: [
			{
				key: 'accessCode',
				label: 'Access Code',
				type: 'password',
				placeholder: 'From Aqara Home app → Profile → Aqara for Developers',
			},
		],
	},
	smartthings: {
		brand: 'smartthings',
		displayName: 'SmartThings',
		fields: [
			{
				key: 'pat',
				label: 'Personal Access Token',
				type: 'password',
				placeholder: 'From account.smartthings.com → Personal Access Tokens',
			},
		],
	},
	resideo: {
		brand: 'resideo',
		displayName: 'Resideo (Honeywell Home)',
		fields: [],
		oauthFlow: true,
	},
	elgato: {
		brand: 'elgato',
		displayName: 'Elgato Key Light',
		fields: [],
		discoveryOnly: true,
	},
}

export interface OAuthConfig {
	authorizeUrl: string
	tokenUrl: string
	clientId: string
	clientSecret: string
	tokenAuthMethod?: 'basic' | 'body'
	extraAuthorizeParams?: Record<string, string>
}

export function getOAuthConfig(brand: string): OAuthConfig | null {
	switch (brand) {
		case 'resideo': {
			const clientId = env.RESIDEO_CONSUMER_KEY
			const clientSecret = env.RESIDEO_CONSUMER_SECRET
			if (!clientId || !clientSecret) return null
			return {
				authorizeUrl: 'https://api.honeywellhome.com/oauth2/authorize',
				tokenUrl: 'https://api.honeywellhome.com/oauth2/token',
				clientId,
				clientSecret,
			}
		}
		case 'ge': {
			const clientId = env.SMARTHQ_CLIENT_ID
			const clientSecret = env.SMARTHQ_CLIENT_SECRET
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
		default:
			return null
	}
}

/** Create an adapter instance from a brand + config stored in DB */
export function createAdapter(
	brand: string,
	config: Record<string, string>,
	session?: string | null,
): Result<DeviceAdapter, Error> {
	switch (brand) {
		case 'elgato':
			if (config.ip && !isPrivateIp(config.ip))
				return err(new Error('Device IP must be a private network address'))
			return ok(new ElgatoAdapter(config))
		case 'govee':
			return ok(new GoveeAdapter(config))
		case 'hue':
			if (config.bridgeIp && !isPrivateIp(config.bridgeIp))
				return err(new Error('Bridge IP must be a private network address'))
			return ok(new HueAdapter(config))
		case 'resideo':
			return ok(new ResideoAdapter(config, session))
		case 'vesync':
			return ok(new VeSyncAdapter(config, session))
		case 'ge':
			return ok(new SmartHQAdapter(config, session))
		case 'smartthings':
			return ok(new SmartThingsAdapter(config))
		default:
			return err(new Error(`Adapter not yet implemented for brand: ${brand}`))
	}
}
