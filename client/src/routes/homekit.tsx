import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from 'react-aria-components'

import type { HomekitConfig } from '../types'

export const Route = createFileRoute('/homekit')({ component: HomeKit })

function HomeKit() {
	const [config, setConfig] = useState<HomekitConfig | null>(null)
	const [loading, setLoading] = useState(true)

	async function load() {
		const res = await fetch('/api/homekit')
		const data = (await res.json()) as HomekitConfig | null
		setConfig(data)
		setLoading(false)
	}

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount pattern
		void load()
	}, [])

	if (loading) {
		return (
			<div className="flex items-center justify-center py-24">
				<div className="text-sm text-gray-400">Loading…</div>
			</div>
		)
	}

	return (
		<div>
			<div className="mb-6">
				<h1 className="text-xl font-semibold text-gray-900">HomeKit</h1>
				<p className="text-sm text-gray-400 mt-0.5">Pair your devices with Apple Home</p>
			</div>

			{config ? (
				<div className="max-w-sm">
					<div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
						{config.paired ? (
							<>
								<span className="text-5xl">✅</span>
								<h2 className="text-base font-semibold text-gray-900 mt-3">Bridge Paired</h2>
								<p className="text-sm text-gray-500 mt-1">
									Your Home Jarvis bridge is connected to Apple Home.
								</p>
								<p className="text-xs text-gray-400 mt-3">
									Ensure a HomePod or Apple TV is set as Home Hub for remote access.
								</p>
							</>
						) : (
							<>
								<div className="w-32 h-32 bg-gray-100 rounded-xl mx-auto mb-4 flex items-center justify-center text-gray-300 text-sm">
									QR Code
									<br />
									(Phase 5)
								</div>
								<p className="text-sm font-mono text-gray-700 tracking-widest">{config.pin}</p>
								<p className="text-xs text-gray-400 mt-2">
									Open Apple Home → + → Add Accessory → enter PIN above
								</p>
							</>
						)}
					</div>
					<div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
						<p className="text-xs text-gray-500">
							<span className="font-medium text-gray-700">Bridge port:</span> {config.port}
						</p>
					</div>
				</div>
			) : (
				<div className="max-w-sm bg-white rounded-xl border border-gray-200 p-6 text-center">
					<span className="text-4xl">🔒</span>
					<h2 className="text-base font-semibold text-gray-900 mt-3">HomeKit Not Set Up</h2>
					<p className="text-sm text-gray-500 mt-1 mb-4">
						The HAP bridge will be configured in Phase 5.
					</p>
					<Button
						isDisabled
						className="px-4 py-2 text-sm bg-gray-100 text-gray-400 rounded-lg cursor-default"
					>
						Set Up Bridge (Phase 5)
					</Button>
				</div>
			)}
		</div>
	)
}
