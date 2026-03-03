import type { Device } from '../../types'

interface SensorCardProps {
	device: Device
}

export function SensorCard({ device }: Readonly<SensorCardProps>) {
	const state = device.state

	return (
		<div className="space-y-2">
			{state.temperature !== undefined && (
				<div className="flex items-center gap-1">
					<span className="text-2xl font-light text-stone-800">{state.temperature.toFixed(1)}</span>
					<span className="text-sm text-stone-400">°C</span>
				</div>
			)}
			{state.humidity !== undefined && (
				<div className="flex items-center gap-1.5">
					<span className="text-lg text-blue-400">💧</span>
					<span className="text-sm text-stone-600">{state.humidity}%</span>
					<span className="text-xs text-stone-400">RH</span>
				</div>
			)}
		</div>
	)
}
