import { type Result, err, ok } from 'neverthrow'

import type { DeviceAdapter, IntegrationMeta } from './types'

import { ElgatoAdapter } from './elgato/adapter'
import { GoveeAdapter } from './govee/adapter'
import { HueAdapter } from './hue/adapter'
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
		displayName: 'GE Cync / SmartHQ',
		fields: [
			{ key: 'email', label: 'GE Account Email', type: 'text', placeholder: 'you@example.com' },
			{ key: 'password', label: 'Password', type: 'password', placeholder: '' },
		],
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
		fields: [
			{
				key: 'apiKey',
				label: 'API Key',
				type: 'password',
				placeholder: 'From developer.resideo.com',
			},
			{
				key: 'accessToken',
				label: 'OAuth Access Token',
				type: 'password',
				placeholder: 'From Resideo OAuth flow',
			},
		],
	},
	elgato: {
		brand: 'elgato',
		displayName: 'Elgato Key Light',
		fields: [],
		discoveryOnly: true,
	},
}

/** Create an adapter instance from a brand + config stored in DB */
export function createAdapter(brand: string, config: Record<string, string>, session?: string | null): Result<DeviceAdapter, Error> {
	switch (brand) {
		case 'elgato':
			return ok(new ElgatoAdapter(config))
		case 'govee':
			return ok(new GoveeAdapter(config))
		case 'hue':
			return ok(new HueAdapter(config))
		case 'vesync':
			return ok(new VeSyncAdapter(config, session))
		default:
			return err(new Error(`Adapter not yet implemented for brand: ${brand}`))
	}
}
