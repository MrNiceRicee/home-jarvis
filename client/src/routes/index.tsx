import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import type { Device, DeviceState, Section } from '../types'

import { CreateSectionDialog } from '../components/CreateSectionDialog'
import { DeviceDetailDialog } from '../components/DeviceDetailDialog'
import { LightMultiSelectBar } from '../components/LightMultiSelectBar'
import { SectionGroup } from '../components/SectionGroup'
import { useStreamStatus } from '../hooks/useDeviceStream'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
	const queryClient = useQueryClient()
	const status = useStreamStatus()
	const [expandedDevice, setExpandedDevice] = useState<Device | null>(null)
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

	const { data: devices = [] } = useQuery<Device[]>({
		queryKey: ['devices'],
		queryFn: () => [],
		staleTime: Infinity,
		gcTime: Infinity,
	})

	const { data: sections = [] } = useQuery<Section[]>({
		queryKey: ['sections'],
		queryFn: async () => {
			const { data, error } = await api.api.sections.get()
			if (error) throw error
			return data
		},
	})

	const stateMutation = useMutation({
		mutationFn: async ({ id, state }: { id: string; state: Partial<DeviceState> }) => {
			await api.api.devices({ id }).state.patch(state)
		},
		onMutate: ({ id, state }) => {
			queryClient.setQueryData(['devices'], (prev: Device[] = []) =>
				prev.map((d) => (d.id === id ? { ...d, state: { ...d.state, ...state } } : d)),
			)
		},
	})

	async function handleStateChange(id: string, state: Partial<DeviceState>) {
		stateMutation.mutate({ id, state })
	}

	async function handleAddSection(name: string) {
		const { error } = await api.api.sections.post({ name })
		if (error) throw error
		await queryClient.invalidateQueries({ queryKey: ['sections'] })
	}

	async function handleRenameSection(sectionId: string, name: string) {
		const { error } = await api.api.sections({ id: sectionId }).patch({ name })
		if (error) {
			toast.error('Failed to rename section')
			throw error
		}
		await queryClient.invalidateQueries({ queryKey: ['sections'] })
	}

	async function handleDeleteSection(sectionId: string) {
		const { error } = await api.api.sections({ id: sectionId }).delete()
		if (error) {
			toast.error('Cannot delete section — move devices out first')
			return
		}
		await queryClient.invalidateQueries({ queryKey: ['sections'] })
	}

	function handleReorder(updates: Array<{ id: string; sectionId: string; position: number }>) {
		// optimistic: update positions in query cache
		queryClient.setQueryData(['devices'], (prev: Device[] = []) => {
			const posMap = new Map(updates.map((u) => [u.id, u]))
			return prev.map((d) => {
				const update = posMap.get(d.id)
				return update ? { ...d, sectionId: update.sectionId, position: update.position } : d
			})
		})
		void api.api.devices.positions.patch(updates).then(({ error }) => {
			if (error) toast.error('Failed to save device order')
		})
	}

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
		? devices.find((d) => d.id === expandedDevice.id) ?? expandedDevice
		: null

	if (devices.length === 0 && status === 'connected') {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<span className="text-5xl mb-4">🏠</span>
				<h2 className="text-lg font-commit font-medium text-stone-900 mb-1">No devices yet</h2>
				<p className="text-sm font-commit text-stone-500 mb-6">
					Add an integration to start discovering your smart home devices.
				</p>
				<Link
					to="/integrations"
					className="inline-flex items-center px-4 py-2 text-sm font-commit font-medium rounded-lg bg-linear-to-b from-stone-700 to-stone-800 text-white border border-stone-600/50 shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] hover:from-stone-600 hover:to-stone-700 transition-all"
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
	const orderedSections: Section[] = sections.length > 0
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
							onReorder={handleReorder}
							onStateChange={handleStateChange}
							onRename={handleRenameSection}
							onDelete={handleDeleteSection}
						/>
					)
				})}
			</div>

			<div className="mt-8 flex justify-center">
				<CreateSectionDialog onSubmit={handleAddSection} />
			</div>

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

function StreamStatusBadge({ status }: Readonly<{ status: string }>) {
	if (status === 'connected') return null
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 text-xs font-commit px-2.5 py-1 rounded-full',
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
