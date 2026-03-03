/**
 * mDNS scanner using bonjour-hap.
 * Looks for Philips Hue bridges advertising _hue._tcp on the local network.
 */

import Bonjour from 'bonjour-hap'

export interface MdnsDevice {
	brand: string
	name: string
	host: string
	port: number
	ip?: string
}

export async function scanForHueBridges(timeoutMs = 5000): Promise<MdnsDevice[]> {
	const found: MdnsDevice[] = []

	return new Promise((resolve) => {
		try {
			const instance = new Bonjour()
			const browser = instance.find({ type: 'hue' })

			browser.on(
				'up',
				(service: { name: string; host: string; port: number; addresses?: string[] }) => {
					found.push({
						brand: 'hue',
						name: service.name,
						host: service.host,
						port: service.port,
						ip: service.addresses?.[0],
					})
				},
			)

			setTimeout(() => {
				browser.stop()
				instance.destroy()
				resolve(found)
			}, timeoutMs)
		} catch {
			resolve([])
		}
	})
}
