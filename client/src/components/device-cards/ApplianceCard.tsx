import { cn } from '../../lib/cn'
import type { Device } from '../../types'

const CYCLE_STYLES: Record<string, string> = {
	running: 'text-blue-700 bg-blue-50',
	paused: 'text-amber-700 bg-amber-50',
	done: 'text-emerald-700 bg-emerald-50',
	idle: 'text-stone-500 bg-stone-100',
}

interface ApplianceCardProps {
	device: Device
}

export function ApplianceCard({ device }: Readonly<ApplianceCardProps>) {
	const state = device.state
	const cycleStatus = state.cycleStatus ?? 'idle'
	const cycleColor = CYCLE_STYLES[cycleStatus] ?? 'text-stone-500 bg-stone-100'

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', cycleColor)}>
					{cycleStatus}
				</span>
				{state.doorLocked !== undefined && (
					<span className={cn('text-xs', state.doorLocked ? 'text-emerald-600' : 'text-stone-400')}>
						{state.doorLocked ? '🔒 Locked' : '🔓 Unlocked'}
					</span>
				)}
			</div>

			{state.timeRemaining !== undefined && state.timeRemaining > 0 && (
				<p className="text-xs text-stone-500">
					<span className="font-medium text-stone-700">{state.timeRemaining} min</span> remaining
				</p>
			)}

			<p className="text-xs text-stone-400 italic">Read-only — controls on device</p>
		</div>
	)
}
