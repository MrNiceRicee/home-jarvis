import { useRef, useState } from 'react'
import { Button } from 'react-aria-components'

import type { Device, DeviceState, Section } from '../types'

import { cn } from '../lib/cn'
import { DeviceCard } from './DeviceCard'

interface SectionGroupProps {
	section: Section
	devices: Device[]
	onStateChange: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
	onRename?: (sectionId: string, name: string) => Promise<void>
	onDelete?: (sectionId: string) => Promise<void>
}

export function SectionGroup({ section, devices, onStateChange, onRename, onDelete }: Readonly<SectionGroupProps>) {
	const [editing, setEditing] = useState(false)
	const [editName, setEditName] = useState(section.name)
	const inputRef = useRef<HTMLInputElement>(null)

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
						className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-stone-400 hover:text-red-500 cursor-default ml-auto"
						aria-label={`Delete section ${section.name}`}
					>
						×
					</Button>
				)}
			</div>

			{devices.length === 0 ? (
				<p className="text-sm font-commit text-stone-400 italic py-4">No devices in this section</p>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{devices.map((device) => (
						<DeviceCard
							key={device.id}
							device={device}
							onStateChange={onStateChange}
						/>
					))}
				</div>
			)}
		</section>
	)
}
