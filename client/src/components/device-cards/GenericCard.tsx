import { useState } from 'react'
import { Button } from 'react-aria-components'

import { cn } from '../../lib/cn'
import type { Device, DeviceState } from '../../types'

interface GenericCardProps {
	device: Device
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function GenericCard({ device, onStateChange }: Readonly<GenericCardProps>) {
	const [toggling, setToggling] = useState(false)
	const state = device.state
	const isOn = state.on ?? false
	const isSwitch = device.type === 'switch'

	async function handlePowerToggle() {
		if (!onStateChange) return
		setToggling(true)
		try {
			await onStateChange(device.id, { on: !isOn })
		} finally {
			setToggling(false)
		}
	}

	// Show meaningful state keys (skip internal/unknown ones)
	const powerLabel = isOn ? 'Turn Off' : 'Turn On'
	const buttonLabel = toggling ? 'Updating…' : powerLabel

	const stateEntries = Object.entries(state).filter(
		([k, v]) => !['on'].includes(k) && v !== undefined && v !== null,
	)

	return (
		<div className="space-y-2">
			{isSwitch && (
				<div className="flex items-center gap-2 mb-2">
					<span className={cn('text-xs font-medium', isOn ? 'text-amber-600' : 'text-stone-400')}>
						{isOn ? 'On' : 'Off'}
					</span>
				</div>
			)}

			{isSwitch && device.online && (
				<Button
					onPress={handlePowerToggle}
					isDisabled={toggling}
					className={cn(
						'w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
						isOn
							? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 pressed:bg-amber-200'
							: 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 pressed:bg-stone-300',
						'disabled:opacity-40',
					)}
				>
					{buttonLabel}
				</Button>
			)}

			{stateEntries.length > 0 && (
				<dl className="space-y-0.5">
					{stateEntries.map(([key, value]) => (
						<div key={key} className="flex justify-between gap-2">
							<dt className="text-xs text-stone-400 truncate">{key}</dt>
							<dd className="text-xs text-stone-600 font-medium truncate">
								{typeof value === 'object' ? JSON.stringify(value) : String(value)}
							</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	)
}
