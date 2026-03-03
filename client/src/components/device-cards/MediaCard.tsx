import { useEffect, useState } from 'react'
import { Button, Label, Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

import { cn } from '../../lib/cn'

interface MediaCardProps {
	device: Device
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function MediaCard({ device, onStateChange }: Readonly<MediaCardProps>) {
	const [toggling, setToggling] = useState(false)
	const [volume, setVolume] = useState(device.state.volume ?? 50)
	const state = device.state
	const isOn = state.on ?? false

	useEffect(() => {
		setVolume(device.state.volume ?? 50)
	}, [device.state.volume])

	async function handlePowerToggle() {
		if (!onStateChange) return
		setToggling(true)
		try {
			await onStateChange(device.id, { on: !isOn })
		} finally {
			setToggling(false)
		}
	}

	async function handlePlayPause() {
		if (!onStateChange) return
		await onStateChange(device.id, { playing: !state.playing })
	}

	const powerLabel = isOn ? 'Turn Off' : 'Turn On'
	const buttonLabel = toggling ? 'Updating…' : powerLabel

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<Button
					onPress={handlePowerToggle}
					isDisabled={!device.online || toggling}
					className={cn(
						'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-default',
						isOn
							? 'bg-stone-800 text-stone-100 hover:bg-stone-700 border border-stone-700 pressed:bg-stone-600'
							: 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 pressed:bg-stone-300',
						'disabled:opacity-40',
					)}
				>
					{buttonLabel}
				</Button>
				{state.playing !== undefined && device.online && (
					<Button
						onPress={handlePlayPause}
						isDisabled={!isOn}
						className="w-9 h-9 rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 pressed:bg-stone-300 disabled:opacity-40 cursor-default flex items-center justify-center text-sm"
					>
						{state.playing ? '⏸' : '▶'}
					</Button>
				)}
			</div>

			{state.track && (
				<p className="text-xs text-stone-500 truncate">
					<span className="text-stone-400">Now playing: </span>
					{state.track}
				</p>
			)}

			{state.volume !== undefined && device.online && (
				<Slider
					value={volume}
					minValue={0}
					maxValue={100}
					onChange={setVolume}
					onChangeEnd={(v) => { void onStateChange?.(device.id, { volume: v }) }}
				>
					<div className="flex items-center justify-between mb-1">
						<Label className="text-xs text-stone-500">Volume</Label>
						<SliderOutput className="text-xs text-stone-400" />
					</div>
					<SliderTrack className="relative flex items-center h-5 w-full">
						{({ state: sliderState }) => (
							<>
								<div className="absolute h-1.5 w-full rounded-full bg-stone-200" />
								<div
									className="absolute h-1.5 rounded-full bg-stone-500"
									style={{ width: `${sliderState.getThumbPercent(0) * 100}%` }}
								/>
								<SliderThumb className="w-4 h-4 rounded-full bg-white border-2 border-stone-500 shadow-sm cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500" />
							</>
						)}
					</SliderTrack>
				</Slider>
			)}
		</div>
	)
}
