import { Button } from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

import { cn } from '../../lib/cn'

const STATUS_STYLES: Record<string, string> = {
	cleaning: 'text-blue-700 bg-blue-50',
	docked: 'text-emerald-700 bg-emerald-50',
	returning: 'text-amber-700 bg-amber-50',
	paused: 'text-yellow-700 bg-yellow-50',
	error: 'text-red-700 bg-red-50',
}

interface VacuumCardProps {
	device: Device
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function VacuumCard({ device, onStateChange }: Readonly<VacuumCardProps>) {
	const state = device.state
	const status = state.status ?? 'docked'
	const battery = state.battery

	async function sendCommand(cmd: 'start' | 'pause' | 'dock') {
		if (!onStateChange) return
		await onStateChange(device.id, { status: cmd })
	}

	const statusColor = STATUS_STYLES[status] ?? 'text-stone-600 bg-stone-100'

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', statusColor)}>
					{status}
				</span>
				{battery !== undefined && (
					<div className="flex items-center gap-1.5">
						<div className="w-16 h-2 rounded-full bg-stone-200 overflow-hidden">
							<div
								className={cn('h-full rounded-full transition-all', battery > 20 ? 'bg-emerald-400' : 'bg-red-400')}
								style={{ width: `${battery}%` }}
							/>
						</div>
						<span className="text-xs text-stone-400">{battery}%</span>
					</div>
				)}
			</div>

			<div className="flex gap-1.5">
				<Button
					onPress={() => { void sendCommand('start') }}
					isDisabled={!device.online || status === 'cleaning'}
					className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 pressed:bg-blue-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-default transition-colors"
				>
					Start
				</Button>
				<Button
					onPress={() => { void sendCommand('pause') }}
					isDisabled={!device.online || status !== 'cleaning'}
					className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 pressed:bg-yellow-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-default transition-colors"
				>
					Pause
				</Button>
				<Button
					onPress={() => { void sendCommand('dock') }}
					isDisabled={!device.online || status === 'docked'}
					className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 pressed:bg-stone-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-default transition-colors"
				>
					Dock
				</Button>
			</div>
		</div>
	)
}
