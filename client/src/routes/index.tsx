import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import type { Device, DeviceState } from '../types'

import { DeviceCard } from '../components/DeviceCard'
import { LightMultiSelectBar } from '../components/LightMultiSelectBar'
import { useDeviceStream } from '../hooks/useDeviceStream'
import { api } from '../lib/api'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
	const queryClient = useQueryClient()
	const { status } = useDeviceStream()

	const { data: devices = [] } = useQuery<Device[]>({
		queryKey: ['devices'],
		queryFn: () => [],
		staleTime: Infinity,
		gcTime: Infinity,
	})

	const [selectedLightIds, setSelectedLightIds] = useState<Set<string>>(new Set())

	function toggleLightSelect(id: string) {
		setSelectedLightIds((prev) => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}
			return next
		})
	}

	const discoverMutation = useMutation({
		mutationFn: () => api.api.devices.discover.post({}),
	})

	const homekitMutation = useMutation({
		mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
			await api.api.devices({ id }).homekit.patch({ enabled })
		},
	})

	const stateMutation = useMutation({
		mutationFn: async ({ id, state }: { id: string; state: Partial<DeviceState> }) => {
			await api.api.devices({ id }).state.patch(state)
		},
		onMutate: ({ id, state }) => {
			// Optimistic update — SSE will confirm the real state shortly
			queryClient.setQueryData(['devices'], (prev: Device[] = []) =>
				prev.map((d) => (d.id === id ? { ...d, state: { ...d.state, ...state } } : d)),
			)
		},
	})

	async function handleStateChange(id: string, state: Partial<DeviceState>) {
		await stateMutation.mutateAsync({ id, state })
	}

	// Group by brand
	const grouped = devices.reduce<Record<string, Device[]>>((acc, d) => {
		const existing = acc[d.brand]
		if (existing) {
			existing.push(d)
		} else {
			acc[d.brand] = [d]
		}
		return acc
	}, {})

	if (devices.length === 0 && status === 'connected') {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<span className="text-5xl mb-4">🏠</span>
				<h2 className="text-lg font-semibold text-gray-900 mb-1">No devices yet</h2>
				<p className="text-sm text-gray-500 mb-6">
					Add an integration to start discovering your smart home devices.
				</p>
				<Link
					to="/integrations"
					className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
				>
					Add Integration →
				</Link>
			</div>
		)
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
					<p className="text-sm text-gray-400 mt-0.5">
						{devices.length} device{devices.length !== 1 ? 's' : ''}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => { void discoverMutation.mutateAsync() }}
						disabled={discoverMutation.isPending}
						className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors"
					>
						{discoverMutation.isPending ? 'Discovering…' : 'Discover Now'}
					</button>
					<StreamStatusBadge status={status} />
				</div>
			</div>

			{Object.entries(grouped).map(([brand, brandDevices]) => (
				<section key={brand} className="mb-8">
					<h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
						{brand}
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
						{brandDevices.map((device) => (
							<DeviceCard
								key={device.id}
								device={device}
								onHomekitToggle={(id, enabled) => homekitMutation.mutateAsync({ id, enabled })}
								onStateChange={handleStateChange}
								isSelected={device.type === 'light' ? selectedLightIds.has(device.id) : undefined}
								onToggleSelect={
									device.type === 'light' ? () => toggleLightSelect(device.id) : undefined
								}
							/>
						))}
					</div>
				</section>
			))}

			<LightMultiSelectBar
				selectedIds={selectedLightIds}
				devices={devices}
				onClear={() => setSelectedLightIds(new Set())}
				onStateChange={handleStateChange}
			/>
		</div>
	)
}

function StreamStatusBadge({ status }: Readonly<{ status: string }>) {
	if (status === 'connected') return null
	return (
		<span
			className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full
      ${status === 'reconnecting' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}
		>
			<span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
			{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
		</span>
	)
}
