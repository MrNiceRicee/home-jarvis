import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { Button } from 'react-aria-components'
import { toast } from 'sonner'

import { CreateSectionDialog } from '../components/CreateSectionDialog'
import { DeviceDetailDialog } from '../components/DeviceDetailDialog'
import { LightMultiSelectBar } from '../components/LightMultiSelectBar'
import { SectionGroup } from '../components/SectionGroup'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { BRAND_LABEL } from '../lib/device-constants'
import { useConnectionStore } from '../stores/connection-store'
import { useDeviceStore } from '../stores/device-store'
import type { Device, DeviceState, Section } from '../types'

export const Route = createFileRoute('/')({ component: Dashboard })

function applyPositionUpdates(updates: Pick<Device, 'id' | 'sectionId' | 'position'>[]) {
	const posMap = new Map(updates.map((u) => [u.id, u]))
	useDeviceStore.setState((prev) => ({
		devices: prev.devices.map((d) => {
			const update = posMap.get(d.id)
			return update ? { ...d, sectionId: update.sectionId, position: update.position } : d
		}),
	}))
}

function Dashboard() {
	const queryClient = useQueryClient()
	const status = useConnectionStore((s) => s.status)
	const devices = useDeviceStore((s) => s.devices)
	const [expandedDevice, setExpandedDevice] = useState<Device | null>(null)
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [showHidden, setShowHidden] = useState(false)

	const { data: sections = [] } = useQuery<Section[]>({
		queryKey: ['sections'],
		queryFn: async () => {
			const { data, error } = await api.api.sections.get()
			if (error) throw error
			return data
		},
	})

	const { data: hiddenDevices = [] } = useQuery<Device[]>({
		queryKey: ['devices', 'hidden'],
		queryFn: async () => {
			const { data, error } = await api.api.devices.get({ query: { all: 'true' } })
			if (error) throw error
			return (data as Device[]).filter((d) => d.hidden)
		},
		enabled: showHidden,
	})

	const stateMutation = useMutation({
		mutationFn: async ({ id, state }: { id: string; state: Partial<DeviceState> }) => {
			await api.api.devices({ id }).state.patch(state)
		},
		onMutate: ({ id, state }) => {
			const device = useDeviceStore.getState().devices.find((d) => d.id === id)
			const previousValues = device ? { ...device.state } : undefined

			// suppress SSE updates for these properties while mutation is in-flight
			const properties = Object.keys(state)
			useDeviceStore.getState().addPending(id, properties)

			// optimistic update
			useDeviceStore.getState().updateDevice(id, { state })

			return { id, previousValues, properties }
		},
		onError: (_err, _vars, context) => {
			if (context?.previousValues) {
				// surgical rollback — only revert the properties we changed
				useDeviceStore.getState().updateDevice(context.id, { state: context.previousValues })
			}
			toast.error('Device is offline or unreachable')
		},
		onSettled: (_data, _err, _vars, context) => {
			if (context) {
				useDeviceStore.getState().removePending(context.id, context.properties)
			}
		},
	})

	const handleStateChange = useCallback(
		async (id: string, state: Partial<DeviceState>) => {
			await stateMutation.mutateAsync({ id, state })
		},
		[stateMutation],
	)

	const handleMatterToggle = useCallback(async (deviceId: string, enabled: boolean) => {
		const { error } = await api.api.devices({ id: deviceId }).matter.patch({ enabled })
		if (error) {
			toast.error('Failed to toggle Matter bridge')
			return
		}
		useDeviceStore.getState().updateDevice(deviceId, {})
		// matter toggle updates matterEnabled, not state — update directly
		useDeviceStore.setState((prev) => ({
			devices: prev.devices.map((d) => (d.id === deviceId ? { ...d, matterEnabled: enabled } : d)),
		}))
	}, [])

	async function handleAddSection(name: string) {
		const { error } = await api.api.sections.post({ name })
		if (error) throw error
		await queryClient.invalidateQueries({ queryKey: ['sections'] })
	}

	const handleRenameSection = useCallback(
		async (sectionId: string, name: string) => {
			const { error } = await api.api.sections({ id: sectionId }).patch({ name })
			if (error) {
				toast.error('Failed to rename section')
				throw error
			}
			await queryClient.invalidateQueries({ queryKey: ['sections'] })
		},
		[queryClient],
	)

	const handleDeleteSection = useCallback(
		async (sectionId: string) => {
			const { error } = await api.api.sections({ id: sectionId }).delete()
			if (error) {
				toast.error('Cannot delete section — move devices out first')
				return
			}
			await queryClient.invalidateQueries({ queryKey: ['sections'] })
		},
		[queryClient],
	)

	const handleReorder = useCallback(
		(updates: Array<{ id: string; sectionId: string; position: number }>) => {
			// snapshot order for rollback
			const snapshot = useDeviceStore.getState().devices.map((d) => ({
				id: d.id,
				sectionId: d.sectionId,
				position: d.position,
			}))

			// optimistic reorder
			applyPositionUpdates(updates)

			void api.api.devices.positions.patch(updates).then(({ error }) => {
				if (error) {
					toast.error('Failed to save device order')
					applyPositionUpdates(snapshot)
				}
			})
		},
		[],
	)

	const handleToggleSelect = useCallback((deviceId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev)
			if (next.has(deviceId)) {
				next.delete(deviceId)
			} else {
				next.add(deviceId)
			}
			return next
		})
	}, [])

	// keep expanded device in sync with SSE updates
	const liveExpandedDevice = expandedDevice
		? (devices.find((d) => d.id === expandedDevice.id) ?? expandedDevice)
		: null

	// skeleton loading while SSE connects
	if (devices.length === 0 && status !== 'connected') {
		return (
			<div>
				<div className="mb-6">
					<StreamStatusBadge status={status} />
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{Array.from({ length: 6 }, (_, i) => (
						<SkeletonCard key={i} />
					))}
				</div>
			</div>
		)
	}

	if (devices.length === 0 && status === 'connected') {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<span className="text-5xl mb-4">🏠</span>
				<h2 className="text-lg font-michroma text-stone-900 mb-1">No devices yet</h2>
				<p className="text-sm font-michroma text-stone-500 mb-6">
					Add an integration to start discovering your smart home devices.
				</p>
				<Link
					to="/integrations"
					className="inline-flex items-center px-4 py-2 text-sm font-michroma rounded-lg bg-linear-to-b from-stone-700 to-stone-800 text-white border border-stone-600/50 shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] hover:from-stone-600 hover:to-stone-700 transition-all"
				>
					Add Integration →
				</Link>
			</div>
		)
	}

	// group devices by section, with a fallback "Home" for unsectioned devices
	const devicesBySection = new Map<string, Device[]>()
	for (const device of devices) {
		const sid = device.sectionId ?? 'home'
		const list = devicesBySection.get(sid) ?? []
		list.push(device)
		devicesBySection.set(sid, list)
	}

	// sort devices within each section by position
	for (const list of devicesBySection.values()) {
		list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
	}

	// build ordered section list — use DB sections, adding a fallback "Home" if needed
	const orderedSections: Section[] =
		sections.length > 0
			? [...sections].sort((a, b) => a.position - b.position)
			: [{ id: 'home', name: 'Home', position: 0, createdAt: 0, updatedAt: 0 }]

	return (
		<div>
			{status !== 'connected' && (
				<div className="mb-6">
					<StreamStatusBadge status={status} />
				</div>
			)}

			<div className="space-y-8">
				{orderedSections.map((section) => {
					const sectionDevices = devicesBySection.get(section.id) ?? []
					if (sectionDevices.length === 0 && !sections.some((s) => s.id === section.id)) {
						return null
					}
					return (
						<SectionGroup
							key={section.id}
							section={section}
							devices={sectionDevices}
							selectedIds={selectedIds}
							onToggleSelect={handleToggleSelect}
							onExpand={setExpandedDevice}
							onMatterToggle={handleMatterToggle}
							onReorder={handleReorder}
							onStateChange={handleStateChange}
							onRename={handleRenameSection}
							onDelete={handleDeleteSection}
						/>
					)
				})}
			</div>

			<div className="mt-8 flex items-center justify-center gap-4">
				<CreateSectionDialog onSubmit={handleAddSection} />
				<Button
					className="text-2xs font-michroma uppercase tracking-wider text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
					onPress={() => setShowHidden((v) => !v)}
				>
					{showHidden ? 'Hide hidden' : 'Show hidden'}
				</Button>
			</div>

			{showHidden && hiddenDevices.length > 0 && (
				<HiddenDevicesSection
					devices={hiddenDevices}
					onUnhide={async (id) => {
						await api.api.devices({ id }).hidden.patch({ hidden: false })
						await queryClient.invalidateQueries({ queryKey: ['devices', 'hidden'] })
					}}
				/>
			)}

			<DeviceDetailDialog
				device={liveExpandedDevice}
				onClose={() => setExpandedDevice(null)}
				onStateChange={handleStateChange}
			/>

			<LightMultiSelectBar
				selectedIds={selectedIds}
				devices={devices}
				onClear={() => setSelectedIds(new Set())}
				onStateChange={handleStateChange}
			/>
		</div>
	)
}

function SkeletonCard() {
	return (
		<Card className="animate-pulse p-4 space-y-3">
			<div className="flex items-center gap-3">
				<div className="flex-1">
					<div className="w-24 h-3.5 rounded bg-stone-200/60 mb-1.5" />
					<div className="w-16 h-2.5 rounded bg-stone-200/40" />
				</div>
				<div className="w-3 h-3 rounded-full bg-stone-200/60" />
			</div>
			<div className="w-full h-10 rounded-md bg-stone-200/30" />
			<div className="w-full h-6 rounded bg-stone-200/20" />
		</Card>
	)
}

function HiddenDevicesSection({
	devices,
	onUnhide,
}: Readonly<{ devices: Device[]; onUnhide: (id: string) => Promise<void> }>) {
	return (
		<div className="mt-8 opacity-50">
			<h3 className="text-2xs font-michroma uppercase tracking-wider text-stone-400 mb-3">
				Hidden devices
			</h3>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{devices.map((d) => (
					<Card key={d.id} className="p-3 flex items-center justify-between">
						<div className="min-w-0">
							<p className="text-xs font-michroma text-stone-600 truncate">{d.name}</p>
							<p className="text-2xs font-michroma text-stone-400 uppercase">
								{BRAND_LABEL[d.brand] ?? d.brand} · {d.type}
							</p>
						</div>
						<Button
							className="text-2xs font-michroma uppercase tracking-wider text-stone-500 hover:text-stone-800 transition-colors cursor-pointer px-2 py-1"
							onPress={() => void onUnhide(d.id)}
						>
							Unhide
						</Button>
					</Card>
				))}
			</div>
		</div>
	)
}

function StreamStatusBadge({ status }: Readonly<{ status: string }>) {
	if (status === 'connected') return null
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 text-2xs font-michroma uppercase tracking-wider px-2.5 py-1 rounded-full',
				'bg-linear-to-b from-white to-stone-50',
				'border border-stone-200/80',
				'shadow-[var(--shadow-raised),var(--shadow-inner-glow)]',
				status === 'reconnecting' ? 'text-amber-700' : 'text-stone-500',
			)}
		>
			<span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
			{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
		</span>
	)
}
