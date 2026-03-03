import Elysia, { status } from 'elysia'
import QRCode from 'qrcode'

import { log } from '../lib/logger'
import { matterBridge } from '../matter/bridge'

export const matterController = new Elysia({ prefix: '/api/matter' })

	/** bridge status — does not expose passcode or discriminator */
	.get('', () => {
		const info = matterBridge.getStatus()
		return {
			status: info.status,
			paired: info.paired,
			deviceCount: info.deviceCount,
			port: info.port,
		}
	})

	/** QR code for commissioning — only available when bridge is running with a pairing code */
	.get('/qr', async () => {
		const info = matterBridge.getStatus()

		if (info.status !== 'running') {
			log.warn('matter qr requested but bridge not running', { status: info.status })
			return status(503, { error: 'Matter bridge is not running' })
		}

		const qrPayload = matterBridge.getQrPairingCode()
		if (!qrPayload) {
			log.warn('matter qr requested but no pairing code available')
			return status(404, { error: 'No pairing code available' })
		}

		const dataUrl = await QRCode.toDataURL(qrPayload)
		return { qr: dataUrl }
	})
