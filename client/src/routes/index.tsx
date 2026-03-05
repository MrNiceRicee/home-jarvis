import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'

import type { Device, DeviceState, Section } from '../types'

import { SectionGroup } from '../components/SectionGroup'
import { useStreamStatus } from '../hooks/useDeviceStream'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
	const queryClient = useQueryClient()
	const status = useStreamStatus()

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

	async function handleAddSection() {
		const name = window.prompt('Section name:')
		if (!name?.trim()) return
		await api.api.sections.post({ name: name.trim() })
		await queryClient.invalidateQueries({ queryKey: ['sections'] })
	}

	if (devices.length === 0 && status === 'connected') {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<span className="text-5xl mb-4">🏠</span>
				<h2 className="text-lg font-semibold text-stone-900 mb-1">No devices yet</h2>
				<p className="text-sm text-stone-500 mb-6">
					Add an integration to start discovering your smart home devices.
				</p>
				<Link
					to="/integrations"
					className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-linear-to-b from-stone-700 to-stone-800 text-white border border-stone-600/50 shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] hover:from-stone-600 hover:to-stone-700 transition-all"
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
					// skip empty sections that aren't from the DB
					if (sectionDevices.length === 0 && !sections.some((s) => s.id === section.id)) {
						return null
					}
					return (
						<SectionGroup
							key={section.id}
							section={section}
							devices={sectionDevices}
							onStateChange={handleStateChange}
						/>
					)
				})}
			</div>

			<div className="mt-8 flex justify-center">
				<button
					type="button"
					onClick={() => { void handleAddSection() }}
					className={cn(
						'px-4 py-2 text-sm rounded-lg transition-all',
						'text-stone-500 hover:text-stone-700',
						'border border-dashed border-stone-300 hover:border-stone-400',
						'hover:bg-white/50',
					)}
				>
					+ Add Section
				</button>
			</div>
		</div>
	)
}

function StreamStatusBadge({ status }: Readonly<{ status: string }>) {
	if (status === 'connected') return null
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full',
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
