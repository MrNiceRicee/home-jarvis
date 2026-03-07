import { cn } from '../../lib/cn'
import { displayTemp } from '../../lib/temperature'
import { usePreferencesStore } from '../../stores/preferences-store'
import type { Device } from '../../types'
import { ReadoutDisplay } from '../ui/readout-display'
import { TwoPositionToggle } from '../ui/two-position-toggle'

interface FridgeCardProps {
	device: Device
	variant?: 'compact' | 'full'
}

export function FridgeCard({ device, variant = 'compact' }: Readonly<FridgeCardProps>) {
	const state = device.state
	const isFull = variant === 'full'
	const unit = usePreferencesStore((s) => s.temperatureUnit)
	const setUnit = usePreferencesStore((s) => s.setTemperatureUnit)
	const doorOpen = state.extras?.doorOpen === true
	const unitSuffix = unit === 'F' ? '°F' : '°C'

	const hasCooler = state.temperature !== undefined || state.targetCoolTemp !== undefined
	const hasFreezer = state.targetFreezeTemp !== undefined

	const readoutLabel =
		[
			state.temperature !== undefined &&
				`Fridge ${displayTemp(state.temperature, unit)}${unitSuffix}`,
			state.targetFreezeTemp !== undefined &&
				`Freezer ${displayTemp(state.targetFreezeTemp, unit)}${unitSuffix}`,
			doorOpen && 'Door open',
		]
			.filter(Boolean)
			.join(', ') || 'Refrigerator'

	return (
		<div className="space-y-3">
			{/* dual compartment readout */}
			<div className={cn('grid gap-2', hasCooler && hasFreezer ? 'grid-cols-2' : 'grid-cols-1')}>
				{hasCooler && (
					<CompartmentReadout
						label="FRIDGE"
						temp={state.temperature}
						unit={unit}
						tint="#60a5fa"
						ariaLabel={readoutLabel}
					/>
				)}
				{hasFreezer && (
					<CompartmentReadout
						label="FREEZER"
						temp={state.targetFreezeTemp}
						unit={unit}
						tint="#93c5fd"
					/>
				)}
			</div>

			{isFull && (
				<TwoPositionToggle
					label="UNIT"
					options={['°F', '°C'] as const}
					value={unit === 'F' ? '°F' : '°C'}
					onChange={(v) => setUnit(v === '°F' ? 'F' : 'C')}
				/>
			)}
		</div>
	)
}

// ── Compartment readout ──────────────────────────────────────────────────

interface CompartmentReadoutProps {
	label: string
	temp: number | undefined
	unit: 'C' | 'F'
	tint: string
	ariaLabel?: string
}

function CompartmentReadout({
	label,
	temp,
	unit,
	tint,
	ariaLabel,
}: Readonly<CompartmentReadoutProps>) {
	const unitSuffix = unit === 'F' ? '°F' : '°C'
	return (
		<div>
			<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1 block">
				{label}
			</span>
			<ReadoutDisplay
				size="lg"
				glowIntensity={0.4}
				aria-label={ariaLabel}
				className="w-full justify-center"
			>
				{temp !== undefined ? (
					<span style={{ color: tint, textShadow: `0 0 10px ${tint}40` }}>
						{displayTemp(temp, unit)}
						<span className="text-sm ml-0.5">{unitSuffix}</span>
					</span>
				) : (
					<span className="text-display-text/30">--</span>
				)}
			</ReadoutDisplay>
		</div>
	)
}
