import type { Device } from '../../types'
import { ReadoutDisplay } from '../ui/readout-display'

interface SensorCardProps {
	device: Device
}

export function SensorCard({ device }: Readonly<SensorCardProps>) {
	const state = device.state

	return (
		<div className="flex items-center gap-3">
			{state.temperature !== undefined && (
				<ReadoutDisplay size="sm">{state.temperature.toFixed(1)}°C</ReadoutDisplay>
			)}
			{state.humidity !== undefined && (
				<ReadoutDisplay size="sm">{state.humidity}% RH</ReadoutDisplay>
			)}
		</div>
	)
}
