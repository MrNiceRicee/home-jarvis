import { MinusIcon, PlusIcon, SpeakerHighIcon, SpeakerLowIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button, Label, Slider, SliderThumb, SliderTrack } from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

import { cn } from '../../lib/cn'
import { ReadoutDisplay } from '../ui/readout-display'

// brushed aluminum knob — matches LightCard fader thumb
const FADER_THUMB_STYLE = {
	backgroundColor: '#d4d0ca',
	backgroundImage: 'linear-gradient(90deg, #e8e4de 0%, #d4d0ca 40%, #c0bcb6 60%, #d4d0ca 100%)',
} as const

// volume detent ticks — endpoints taller than midpoints
const VOL_DETENTS: { value: number; width: string }[] = [
	{ value: 0, width: 'w-2.5' },
	{ value: 10, width: 'w-1' },
	{ value: 20, width: 'w-1.5' },
	{ value: 30, width: 'w-1' },
	{ value: 40, width: 'w-1.5' },
	{ value: 50, width: 'w-2' },
	{ value: 60, width: 'w-1.5' },
	{ value: 70, width: 'w-1' },
	{ value: 80, width: 'w-1.5' },
	{ value: 90, width: 'w-1' },
	{ value: 100, width: 'w-2.5' },
]

interface MediaCardProps {
	device: Device
	variant?: 'compact' | 'full'
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function MediaCard({ device, variant = 'compact', onStateChange }: Readonly<MediaCardProps>) {
	const state = device.state
	const isOn = state.on ?? false
	const isFull = variant === 'full'
	const [volume, setVolume] = useState(state.volume ?? 0)
	const disabled = !device.online || !isOn

	useEffect(() => { setVolume(state.volume ?? 0) }, [state.volume])

	const readoutText = isOn
		? (state.track ?? 'ON')
		: 'OFF'

	const trackSuffix = state.track ? `, ${state.track}` : ''
	const readoutLabel = isOn
		? `Volume ${volume}${trackSuffix}`
		: 'TV off'

	const commitVolume = (v: number) => { void onStateChange?.(device.id, { volume: v }) }

	if (isFull) {
		return (
			<div className="flex gap-3 min-h-52">
				{/* box 1: volume track + controls */}
				{state.volume !== undefined && (
					<div className="flex gap-2 items-stretch">
						<VolumeFader volume={volume} isFull disabled={disabled} onChange={setVolume} onChangeEnd={commitVolume} />
						<div className="flex flex-col items-center justify-between">
							<VolumeStepButton
								icon={<PlusIcon size={12} weight="bold" />}
								label="Volume up"
								disabled={disabled || volume >= 100}
								onPress={() => { const n = Math.min(100, volume + 1); setVolume(n); commitVolume(n) }}
							/>
							<ReadoutDisplay size="sm" glowIntensity={1} aria-label={`Volume ${volume}`} className="aspect-square justify-center">
								<span className={cn('text-xs', !isOn && 'text-display-text/30')}>{volume}</span>
							</ReadoutDisplay>
							<VolumeStepButton
								icon={<MinusIcon size={12} weight="bold" />}
								label="Volume down"
								disabled={disabled || volume <= 0}
								onPress={() => { const n = Math.max(0, volume - 1); setVolume(n); commitVolume(n) }}
							/>
						</div>
					</div>
				)}
				{/* box 2: readout + rest */}
				<div className="flex-1 min-w-0 space-y-3">
					<ReadoutDisplay size="lg" glowIntensity={1} aria-label={readoutLabel} className="w-full justify-center">
						<span className={cn(!isOn && 'text-display-text/30')}>{readoutText}</span>
					</ReadoutDisplay>
				</div>
			</div>
		)
	}

	return (
		<div className="flex gap-3">
			{/* box 1: volume track + controls */}
			{state.volume !== undefined && (
				<div className="flex gap-2 items-stretch">
					<VolumeFader volume={volume} isFull={false} disabled={disabled} onChange={setVolume} onChangeEnd={commitVolume} />
					<div className="flex flex-col items-center justify-between">
						<VolumeStepButton
							icon={<PlusIcon size={12} weight="bold" />}
							label="Volume up"
							disabled={disabled || volume >= 100}
							onPress={() => { const n = Math.min(100, volume + 1); setVolume(n); commitVolume(n) }}
						/>
						<ReadoutDisplay size="sm" glowIntensity={1} aria-label={`Volume ${volume}`} className="aspect-square justify-center">
							<span className={cn('text-xs', !isOn && 'text-display-text/30')}>{volume}</span>
						</ReadoutDisplay>
						<VolumeStepButton
							icon={<MinusIcon size={12} weight="bold" />}
							label="Volume down"
							disabled={disabled || volume <= 0}
							onPress={() => { const n = Math.max(0, volume - 1); setVolume(n); commitVolume(n) }}
						/>
					</div>
				</div>
			)}
			{/* box 2: readout */}
			<div className="flex-1 min-w-0">
				<ReadoutDisplay size="lg" glowIntensity={1} aria-label={readoutLabel} className="w-full justify-center">
					<span className={cn(!isOn && 'text-display-text/30')}>{readoutText}</span>
				</ReadoutDisplay>
			</div>
		</div>
	)
}

// ── Volume step button ──────────────────────────────────────────────────

interface VolumeStepButtonProps {
	icon: React.ReactNode
	label: string
	disabled: boolean
	onPress: () => void
}

function VolumeStepButton({ icon, label, disabled, onPress }: Readonly<VolumeStepButtonProps>) {
	return (
		<Button
			aria-label={label}
			isDisabled={disabled}
			onPress={onPress}
			className={cn(
				'w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-all',
				'border border-stone-300/60',
				'bg-linear-to-b from-white to-stone-50',
				'shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.8)]',
				'text-stone-500',
				'hover:from-stone-50 hover:to-stone-100 pressed:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)]',
				'disabled:opacity-30 disabled:cursor-default',
			)}
		>
			{icon}
		</Button>
	)
}

// ── Volume fader ────────────────────────────────────────────────────────

interface VolumeFaderProps {
	volume: number
	isFull: boolean
	disabled: boolean
	onChange: (v: number) => void
	onChangeEnd: (v: number) => void
}

function VolumeFader({ volume, isFull, disabled, onChange, onChangeEnd }: Readonly<VolumeFaderProps>) {
	return (
		<Slider
			orientation="vertical"
			value={volume}
			minValue={0}
			maxValue={100}
			onChange={onChange}
			onChangeEnd={onChangeEnd}
			isDisabled={disabled}
			className={cn(isFull && 'self-stretch')}
		>
			<Label className="sr-only">Volume</Label>
			<div className={cn('flex flex-col items-center gap-1', isFull && 'h-full')}>
				<SpeakerHighIcon size={10} weight="fill" className="text-stone-400 shrink-0" />
				<div className={cn('relative', isFull ? 'flex-1' : 'h-32')}>
					{/* detent ticks — left side */}
					<div className="absolute inset-y-0 right-[calc(50%+8px)] flex flex-col justify-between">
						{VOL_DETENTS.map((d) => (
							<div key={d.value} className={cn('h-px bg-stone-300/80 ml-auto', d.width)} />
						))}
					</div>
					{/* detent ticks — right side */}
					<div className="absolute inset-y-0 left-[calc(50%+8px)] flex flex-col justify-between">
						{VOL_DETENTS.map((d) => (
							<div key={d.value} className={cn('h-px bg-stone-300/80', d.width)} />
						))}
					</div>
					{/* slider track — routed groove */}
					<SliderTrack className="relative h-full w-5.5">
						{({ state: s }) => (
							<>
								{/* routed channel */}
								<div
									className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 rounded-full"
									style={{
										background: 'linear-gradient(180deg, #d5d0c8 0%, #e0dbd3 100%)',
										boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15), inset 0 0 2px rgba(0,0,0,0.1), 0 0.5px 0 rgba(255,255,255,0.8)',
									}}
								/>
								{/* filled portion */}
								<div
									className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 rounded-full"
									style={{
										height: `${s.getThumbPercent(0) * 100}%`,
										background: 'linear-gradient(180deg, #a8a29e 0%, #78716c 100%)',
										boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
									}}
								/>
								{/* thumb — translate: none prevents Tailwind v4 from doubling React Aria's transform */}
								<SliderThumb
									className="z-10 h-3 w-5.5 rounded-[3px] border border-stone-400/60 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 shadow-[0_1px_3px_rgba(0,0,0,0.15),inset_0_0.5px_0_rgba(255,255,255,0.6)] relative after:absolute after:content-[''] after:inset-y-0.5 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-stone-400/40"
									style={{ ...FADER_THUMB_STYLE, translate: 'none', left: '50%' }}
								/>
							</>
						)}
					</SliderTrack>
				</div>
				<SpeakerLowIcon size={10} weight="fill" className="text-stone-400 shrink-0" />
			</div>
		</Slider>
	)
}
