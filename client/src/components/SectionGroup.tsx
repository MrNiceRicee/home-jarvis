import type { Device, DeviceState, Section } from '../types'

import { DeviceCard } from './DeviceCard'

interface SectionGroupProps {
	section: Section
	devices: Device[]
	onStateChange: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function SectionGroup({ section, devices, onStateChange }: Readonly<SectionGroupProps>) {
	return (
		<section>
			<h2 className="font-michroma text-xs uppercase tracking-wider text-stone-400 mb-3 border-b border-stone-200/60 pb-2">
				{section.name}
			</h2>
			{devices.length === 0 ? (
				<p className="text-sm text-stone-400 italic py-4">No devices in this section</p>
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
