import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core'
import {
	SortableContext,
	arrayMove,
	rectSortingStrategy,
	useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { memo, useRef, useState } from 'react'
import { Button } from 'react-aria-components'

import type { Device, DeviceState, Section } from '../types'

import { cn } from '../lib/cn'
import { DeviceCard } from './DeviceCard'

interface SectionGroupProps {
	section: Section
	devices: Device[]
	onExpand?: (device: Device) => void
	onMatterToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onReorder?: (updates: Array<{ id: string; sectionId: string; position: number }>) => void
	onStateChange: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
	onRename?: (sectionId: string, name: string) => Promise<void>
	onDelete?: (sectionId: string) => Promise<void>
	selectedIds?: Set<string>
	onToggleSelect?: (deviceId: string) => void
}

export function SectionGroup({ section, devices, onExpand, onMatterToggle, onReorder, onStateChange, onRename, onDelete, selectedIds, onToggleSelect }: Readonly<SectionGroupProps>) {
	const [editing, setEditing] = useState(false)
	const [editName, setEditName] = useState(section.name)
	const [activeId, setActiveId] = useState<string | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor),
	)

	async function commitRename() {
		const trimmed = editName.trim()
		if (!trimmed || trimmed === section.name) {
			setEditName(section.name)
			setEditing(false)
			return
		}
		try {
			await onRename?.(section.id, trimmed)
		} catch {
			setEditName(section.name)
		}
		setEditing(false)
	}

	function handleDragStart(event: DragStartEvent) {
		setActiveId(String(event.active.id))
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		setActiveId(null)

		if (!over || active.id === over.id || !onReorder) return

		const ids = devices.map((d) => d.id)
		const oldIndex = ids.indexOf(String(active.id))
		const newIndex = ids.indexOf(String(over.id))
		if (oldIndex === -1 || newIndex === -1) return

		const reordered = arrayMove(ids, oldIndex, newIndex)
		onReorder(reordered.map((id, i) => ({ id, sectionId: section.id, position: i })))
	}

	const activeDevice = activeId ? devices.find((d) => d.id === activeId) : null

	return (
		<section>
			<div className="group flex items-center gap-2 mb-3 border-b border-stone-200/60 pb-2">
				{editing ? (
					<input
						ref={inputRef}
						value={editName}
						onChange={(e) => setEditName(e.target.value)}
						onBlur={() => { void commitRename() }}
						onKeyDown={(e) => {
							if (e.key === 'Enter') { void commitRename() }
							if (e.key === 'Escape') { setEditName(section.name); setEditing(false) }
						}}
						className="font-michroma text-xs uppercase tracking-wider text-stone-700 bg-transparent border-b border-amber-400 outline-none py-0.5 px-0"
						autoFocus
					/>
				) : (
					<button
						type="button"
						onClick={() => { if (onRename) { setEditing(true) } }}
						className={cn(
							'font-michroma text-xs uppercase tracking-wider text-stone-400',
							onRename && 'hover:text-stone-600 cursor-text',
						)}
					>
						{section.name}
					</button>
				)}

				{/* actions — visible on hover */}
				{onDelete && devices.length === 0 && (
					<Button
						onPress={() => { void onDelete(section.id) }}
						className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-stone-400 hover:text-red-500 cursor-pointer ml-auto"
						aria-label={`Delete section ${section.name}`}
					>
						×
					</Button>
				)}
			</div>

			{devices.length === 0 ? (
				<p className="text-xs font-michroma text-stone-400 italic py-4">No devices in this section</p>
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
				>
					<SortableContext items={devices.map((d) => d.id)} strategy={rectSortingStrategy}>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{devices.map((device) => {
								const isLight = device.type === 'light'
								return (
									<SortableDeviceCard
										key={device.id}
										device={device}
										isSelected={selectedIds?.has(device.id)}
										onExpand={onExpand}
										onMatterToggle={onMatterToggle}
										onStateChange={onStateChange}
										onToggleSelect={isLight && onToggleSelect ? () => onToggleSelect(device.id) : undefined}
									/>
								)
							})}
						</div>
					</SortableContext>
					<DragOverlay>
						{activeDevice ? (
							<div className="opacity-80 pointer-events-none">
								<DeviceCard device={activeDevice} />
							</div>
						) : null}
					</DragOverlay>
				</DndContext>
			)}
		</section>
	)
}

interface SortableDeviceCardProps {
	device: Device
	isSelected?: boolean
	onExpand?: (device: Device) => void
	onMatterToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
	onToggleSelect?: () => void
}

const SortableDeviceCard = memo(function SortableDeviceCard({ device, isSelected, onExpand, onMatterToggle, onStateChange, onToggleSelect }: Readonly<SortableDeviceCardProps>) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: device.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(isDragging && 'opacity-30')}
			{...attributes}
			{...listeners}
		>
			<DeviceCard
				device={device}
				isSelected={isSelected}
				onExpand={onExpand}
				onMatterToggle={onMatterToggle}
				onStateChange={onStateChange}
				onToggleSelect={onToggleSelect}
			/>
		</div>
	)
})
