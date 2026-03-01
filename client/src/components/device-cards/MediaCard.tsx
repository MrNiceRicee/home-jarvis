import { useEffect, useState } from 'react'
import { Button, Label, Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

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
					className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-default
            ${isOn
						? 'bg-gray-800 text-gray-100 hover:bg-gray-700 border border-gray-700 pressed:bg-gray-600'
						: 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 pressed:bg-gray-300'
					} disabled:opacity-40`}
				>
					{buttonLabel}
				</Button>
				{state.playing !== undefined && device.online && (
					<Button
						onPress={handlePlayPause}
						isDisabled={!isOn}
						className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 pressed:bg-gray-300 disabled:opacity-40 cursor-default flex items-center justify-center text-sm"
					>
						{state.playing ? '⏸' : '▶'}
					</Button>
				)}
			</div>

			{state.track && (
				<p className="text-xs text-gray-500 truncate">
					<span className="text-gray-400">Now playing: </span>
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
						<Label className="text-xs text-gray-500">Volume</Label>
						<SliderOutput className="text-xs text-gray-400" />
					</div>
					<SliderTrack className="relative flex items-center h-5 w-full">
						{({ state: sliderState }) => (
							<>
								<div className="absolute h-1.5 w-full rounded-full bg-gray-200" />
								<div
									className="absolute h-1.5 rounded-full bg-gray-500"
									style={{ width: `${sliderState.getThumbPercent(0) * 100}%` }}
								/>
								<SliderThumb className="w-4 h-4 rounded-full bg-white border-2 border-gray-500 shadow-sm cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500" />
							</>
						)}
					</SliderTrack>
				</Slider>
			)}
		</div>
	)
}
