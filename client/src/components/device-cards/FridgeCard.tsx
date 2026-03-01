import type { Device } from '../../types'

interface FridgeCardProps {
	device: Device
}

export function FridgeCard({ device }: Readonly<FridgeCardProps>) {
	const state = device.state

	return (
		<div className="space-y-2">
			{state.temperature !== undefined && (
				<div className="flex items-center justify-between">
					<span className="text-xs text-gray-500">Fridge</span>
					<span className="text-sm font-semibold text-blue-600">{state.temperature.toFixed(1)}°C</span>
				</div>
			)}
			{state.targetFreezeTemp !== undefined && (
				<div className="flex items-center justify-between">
					<span className="text-xs text-gray-500">Freezer</span>
					<span className="text-sm font-semibold text-blue-400">{state.targetFreezeTemp.toFixed(1)}°C</span>
				</div>
			)}
			<p className="text-xs text-gray-400 italic">Read-only</p>
		</div>
	)
}
