import type { TemperatureUnit } from '../../lib/temperature'

import { cn } from '../../lib/cn'
import { displayTemp } from '../../lib/temperature'

// fixed HVAC range in celsius
const MIN_C = 7
const MAX_C = 35
const RANGE_C = MAX_C - MIN_C

// mode color map
const MODE_COLORS = {
	heat: { fill: 'rgb(249,115,22)', glow: 'rgba(249,115,22,0.5)', gradientTop: 'rgb(253,186,116)', gradientBottom: 'rgb(194,65,12)' },
	cool: { fill: 'rgb(59,130,246)', glow: 'rgba(59,130,246,0.5)', gradientTop: 'rgb(147,197,253)', gradientBottom: 'rgb(29,78,216)' },
	auto: { fill: 'rgb(52,211,153)', glow: 'rgba(52,211,153,0.5)', gradientTop: 'rgb(167,243,208)', gradientBottom: 'rgb(5,150,105)' },
	off: { fill: 'rgb(87,83,78)', glow: 'none', gradientTop: 'rgb(120,113,108)', gradientBottom: 'rgb(68,64,60)' },
} as const

type ThermostatMode = keyof typeof MODE_COLORS

// tick marks at 5° intervals in the display unit
function generateTicks(unit: TemperatureUnit): { celsius: number; label: string }[] {
	const ticks: { celsius: number; label: string }[] = []
	if (unit === 'F') {
		for (let f = 45; f <= 95; f += 5) {
			const c = ((f - 32) * 5) / 9
			ticks.push({ celsius: c, label: `${f}` })
		}
	} else {
		for (let c = 10; c <= 35; c += 5) {
			ticks.push({ celsius: c, label: `${c}` })
		}
	}
	return ticks
}

function clampFill(celsius: number): number {
	if (!Number.isFinite(celsius)) return 0
	return Math.max(0, Math.min(1, (celsius - MIN_C) / RANGE_C))
}

interface MercuryColumnProps {
	temperatureCelsius: number
	mode: ThermostatMode
	variant: 'compact' | 'full'
	targetCelsius?: number
	unit: TemperatureUnit
	className?: string
}

export function MercuryColumn({
	temperatureCelsius,
	mode,
	variant,
	unit,
	className,
}: Readonly<MercuryColumnProps>) {
	const colors = MODE_COLORS[mode]
	const fillPct = clampFill(temperatureCelsius) * 100
	const isFull = variant === 'full'
	const isOff = mode === 'off'
	const ticks = isFull ? generateTicks(unit) : []

	return (
		<div className={cn('flex', isFull ? 'gap-1.5' : '', className)}>
			{/* tick labels — full view only, rendered on left side */}
			{isFull && (
				<div className="relative shrink-0 w-7" style={{ marginTop: 4, marginBottom: 16 }}>
					{ticks.map((t) => {
						const pct = (1 - clampFill(t.celsius)) * 100
						return (
							<span
								key={t.celsius}
								className="absolute right-0 font-michroma text-[8px] text-stone-400 -translate-y-1/2 tabular-nums"
								style={{ top: `${pct}%` }}
							>
								{t.label}
							</span>
						)
					})}
				</div>
			)}

			{/* tick marks — full view only */}
			{isFull && (
				<div className="relative shrink-0 w-2" style={{ marginTop: 4, marginBottom: 16 }}>
					{ticks.map((t) => {
						const pct = (1 - clampFill(t.celsius)) * 100
						return (
							<div
								key={t.celsius}
								className="absolute right-0 w-1.5 h-px bg-stone-500"
								style={{ top: `${pct}%` }}
							/>
						)
					})}
				</div>
			)}

			{/* glass tube column */}
			<div className="flex flex-col items-center gap-0">
				<div
					className={cn(
						'relative overflow-hidden',
						isFull ? 'w-7 flex-1 rounded-t-lg' : 'w-6 flex-1 rounded-t-md',
					)}
					style={{
						background: 'linear-gradient(180deg, #2e2d27 0%, #272620 50%, #23221c 100%)',
						border: '1px solid #1a1914',
						boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.7), inset 0 1px 4px rgba(0,0,0,0.5), inset 2px 0 4px rgba(0,0,0,0.15), inset -2px 0 4px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.3)',
						minHeight: isFull ? 200 : 60,
					}}
					role="meter"
					aria-label={`Temperature: ${displayTemp(temperatureCelsius, unit)}°${unit}`}
					aria-valuemin={MIN_C}
					aria-valuemax={MAX_C}
					aria-valuenow={Number.isFinite(temperatureCelsius) ? temperatureCelsius : undefined}
				>
					{/* mercury fill */}
					<div
						className="absolute inset-x-0 bottom-0 transition-all duration-500"
						style={{
							height: `${fillPct}%`,
							background: `linear-gradient(to top, ${colors.gradientBottom}, ${colors.gradientTop})`,
							boxShadow: isOff ? 'none' : `0 0 8px ${colors.glow}, inset 0 0 6px ${colors.glow}`,
						}}
					/>

					{/* glass overlays */}
					<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
					<div className="absolute inset-0 bg-gradient-to-b from-white/[0.07] via-white/[0.02] to-transparent pointer-events-none" />
					<div
						className="absolute inset-0 pointer-events-none"
						style={{
							opacity: 0.04,
							backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.5) 1px, rgba(255,255,255,0.5) 2px)',
						}}
					/>
					<div
						className="absolute inset-0 pointer-events-none"
						style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.15) 100%)' }}
					/>
				</div>

				{/* bulb */}
				<div
					className={cn(
						'rounded-full border flex-shrink-0',
						isFull ? 'w-5 h-5 -mt-1' : 'w-4 h-4 -mt-0.5',
					)}
					style={{
						borderColor: isOff ? '#44403c' : colors.fill,
						background: isOff
							? 'radial-gradient(circle at 35% 30%, #3a3733 0%, #292524 100%)'
							: `radial-gradient(circle at 35% 30%, ${colors.gradientTop} 0%, ${colors.fill} 60%, ${colors.gradientBottom} 100%)`,
						boxShadow: isOff ? 'none' : `0 0 8px ${colors.glow}, 0 0 16px ${colors.glow}`,
					}}
				/>
			</div>
		</div>
	)
}

export { MODE_COLORS, MIN_C, MAX_C, RANGE_C, clampFill, generateTicks }
export type { ThermostatMode }
