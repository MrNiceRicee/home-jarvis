import { useEffect, useState } from 'react'
import { Button, Label, Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

import { cn } from '../../lib/cn'

const AQI_LEVELS = [
	{ max: 1, label: 'Good', color: 'text-emerald-700 bg-emerald-50' },
	{ max: 2, label: 'Fair', color: 'text-yellow-700 bg-yellow-50' },
	{ max: 4, label: 'Poor', color: 'text-orange-700 bg-orange-50' },
	{ max: 5, label: 'Hazardous', color: 'text-red-700 bg-red-50' },
] as const

function aqiLabel(value: number): { label: string; color: string } {
	return AQI_LEVELS.find((l) => value <= l.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1]
}

interface AirPurifierCardProps {
	device: Device
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function AirPurifierCard({ device, onStateChange }: Readonly<AirPurifierCardProps>) {
	const [toggling, setToggling] = useState(false)
	const [fanSpeed, setFanSpeed] = useState(device.state.fanSpeed ?? 50)
	const state = device.state
	const isOn = state.on ?? false

	useEffect(() => {
		setFanSpeed(device.state.fanSpeed ?? 50)
	}, [device.state.fanSpeed])

	async function handlePowerToggle() {
		if (!onStateChange) return
		setToggling(true)
		try {
			await onStateChange(device.id, { on: !isOn })
		} finally {
			setToggling(false)
		}
	}

	const aqi = state.airQuality !== undefined ? aqiLabel(state.airQuality) : null
	const powerLabel = isOn ? 'Turn Off' : 'Turn On'
	const buttonLabel = toggling ? 'Updating…' : powerLabel

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<span className={cn('text-xs font-medium', isOn ? 'text-blue-600' : 'text-stone-400')}>
					{isOn ? 'On' : 'Off'}
				</span>
				{aqi && (
					<span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', aqi.color)}>
						{aqi.label}
					</span>
				)}
			</div>

			{device.online && (
				<Button
					onPress={handlePowerToggle}
					isDisabled={toggling}
					className={cn(
						'w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-default',
						isOn
							? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 pressed:bg-blue-200'
							: 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 pressed:bg-stone-300',
						'disabled:opacity-40',
					)}
				>
					{buttonLabel}
				</Button>
			)}

			{state.fanSpeed !== undefined && device.online && (
				<Slider
					value={fanSpeed}
					minValue={0}
					maxValue={100}
					onChange={setFanSpeed}
					onChangeEnd={(v) => { void onStateChange?.(device.id, { fanSpeed: v }) }}
				>
					<div className="flex items-center justify-between mb-1">
						<Label className="text-xs text-stone-500">Fan Speed</Label>
						<SliderOutput className="text-xs text-stone-400" />
					</div>
					<SliderTrack className="relative flex items-center h-5 w-full">
						{({ state: sliderState }) => (
							<>
								<div className="absolute h-1.5 w-full rounded-full bg-stone-200" />
								<div
									className="absolute h-1.5 rounded-full bg-blue-400"
									style={{ width: `${sliderState.getThumbPercent(0) * 100}%` }}
								/>
								<SliderThumb className="w-4 h-4 rounded-full bg-white border-2 border-blue-400 shadow-sm cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" />
							</>
						)}
					</SliderTrack>
				</Slider>
			)}
		</div>
	)
}
