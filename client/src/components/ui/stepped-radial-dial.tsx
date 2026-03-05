import { useCallback, useRef } from 'react'
import { Radio, RadioGroup } from 'react-aria-components'

import { cn } from '../../lib/cn'

interface SteppedRadialDialProps {
	label: string
	options: readonly { key: string; label: string }[]
	value: string
	onChange: (key: string) => void
	disabled?: boolean
	/** accent color for active detent label glow (default: emerald) */
	accentColor?: string
}

// dial geometry — standard potentiometer arc (7:30 → 4:30 through 12:00)
// angles in CSS convention: 0° = up, positive = clockwise
const START_ANGLE = -135
const END_ANGLE = 135
const SWEEP = END_ANGLE - START_ANGLE // 270°
const LABEL_RADIUS = 48
const TICK_INNER = 30
const TICK_OUTER = 36
const KNOB_SIZE = 40
const DIAL_SIZE = 130

function detentAngle(index: number, count: number): number {
	return START_ANGLE + (index / (count - 1)) * SWEEP
}

// convert CSS angle (0°=up, CW+) to screen coordinates
function angleToXY(angleDeg: number, radius: number): { x: number; y: number } {
	const rad = (angleDeg * Math.PI) / 180
	return { x: Math.sin(rad) * radius, y: -Math.cos(rad) * radius }
}

// normalize angle to -180..180
function normalizeAngle(a: number): number {
	let n = a % 360
	if (n > 180) n -= 360
	if (n < -180) n += 360
	return n
}

export function SteppedRadialDial({
	label, options, value, onChange, disabled,
	accentColor = '#34d399',
}: Readonly<SteppedRadialDialProps>) {
	const count = options.length
	const activeIdx = options.findIndex((o) => o.key === value)
	const markerAngle = activeIdx >= 0 ? detentAngle(activeIdx, count) : START_ANGLE
	const containerRef = useRef<HTMLDivElement>(null)

	// snap a pointer position to the nearest detent
	const snapToDetent = useCallback((clientX: number, clientY: number) => {
		const el = containerRef.current
		if (!el || disabled) return
		const rect = el.getBoundingClientRect()
		const cx = rect.left + rect.width / 2
		const cy = rect.top + rect.height / 2
		const dx = clientX - cx
		const dy = clientY - cy

		// CSS angle: atan2(x, -y) gives 0°=up, CW positive
		const pointerAngle = Math.atan2(dx, -dy) * (180 / Math.PI)

		// dead zone check: if angle is outside the arc (bottom gap), snap to nearest end
		const normalized = normalizeAngle(pointerAngle)
		if (Math.abs(normalized) > END_ANGLE) {
			// in dead zone — snap to whichever end is closer
			const key = normalized > 0 ? options[count - 1].key : options[0].key
			if (key !== value) onChange(key)
			return
		}

		// find nearest detent
		let nearestIdx = 0
		let minDist = Infinity
		for (let i = 0; i < count; i++) {
			const dist = Math.abs(normalized - detentAngle(i, count))
			if (dist < minDist) { minDist = dist; nearestIdx = i }
		}

		const key = options[nearestIdx].key
		if (key !== value) onChange(key)
	}, [count, disabled, onChange, options, value])

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		if (disabled) return
		// prevent DnD sortable from capturing this interaction
		e.stopPropagation()
		e.currentTarget.setPointerCapture(e.pointerId)
		snapToDetent(e.clientX, e.clientY)
	}, [disabled, snapToDetent])

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
		snapToDetent(e.clientX, e.clientY)
	}, [snapToDetent])

	// SVG tick marks along the arc
	const ticks = options.map((_, i) => {
		const angle = detentAngle(i, count)
		const inner = angleToXY(angle, TICK_INNER)
		const outer = angleToXY(angle, TICK_OUTER)
		return { inner, outer, active: i === activeIdx }
	})

	return (
		<div>
			{label && (
				<span className="font-michroma text-2xs uppercase tracking-widest text-display-text/40 mb-1 block text-center">{label}</span>
			)}
			<RadioGroup
				value={value}
				onChange={onChange}
				isDisabled={disabled}
				aria-label={label || 'Dial'}
				className="relative flex items-center justify-center"
				style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
			>
				{/* invisible drag surface over the knob area */}
				<div
					ref={containerRef}
					className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing touch-none"
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					style={{ borderRadius: '50%' }}
				/>

				{/* arc track + tick marks */}
				<svg
					className="absolute inset-0 pointer-events-none"
					width={DIAL_SIZE}
					height={DIAL_SIZE}
					viewBox={`${-DIAL_SIZE / 2} ${-DIAL_SIZE / 2} ${DIAL_SIZE} ${DIAL_SIZE}`}
				>
					{/* subtle arc track */}
					<circle
						cx="0" cy="0" r="33"
						fill="none"
						stroke="rgba(255,255,255,0.06)"
						strokeWidth="2"
						strokeDasharray={`${(SWEEP / 360) * 2 * Math.PI * 33} ${((360 - SWEEP) / 360) * 2 * Math.PI * 33}`}
						strokeDashoffset={((90 + START_ANGLE) / 360) * 2 * Math.PI * 33}
						strokeLinecap="round"
					/>
					{/* tick marks at each detent */}
					{ticks.map((t, i) => (
						<line
							key={i}
							x1={t.inner.x} y1={t.inner.y}
							x2={t.outer.x} y2={t.outer.y}
							stroke={t.active ? accentColor : 'rgba(255,255,255,0.3)'}
							strokeWidth={t.active ? 2 : 1}
							strokeLinecap="round"
						/>
					))}
				</svg>

				{/* knob body — metallic look with edge ring */}
				<div
					className="absolute rounded-full pointer-events-none"
					style={{
						width: KNOB_SIZE + 4,
						height: KNOB_SIZE + 4,
						top: `calc(50% - ${(KNOB_SIZE + 4) / 2}px)`,
						left: `calc(50% - ${(KNOB_SIZE + 4) / 2}px)`,
						background: 'conic-gradient(from 180deg, #8a8680, #a8a49e, #c8c4be, #a8a49e, #8a8680)',
						boxShadow: '0 3px 10px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.25)',
						borderRadius: '50%',
					}}
				>
					{/* inner knob face */}
					<div
						className="absolute rounded-full"
						style={{
							inset: 2,
							backgroundImage: 'radial-gradient(circle at 38% 32%, #e0dcd6 0%, #d0ccc6 25%, #b8b4ae 55%, #a8a4a0 75%, #bab6b0 100%)',
							boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.15)',
						}}
					/>
					{/* indicator line — points to active detent */}
					<div
						className="absolute w-0.5 h-3 rounded-full transition-transform duration-200"
						style={{
							top: 5,
							left: `calc(50% - 1px)`,
							backgroundColor: accentColor,
							transformOrigin: `center ${(KNOB_SIZE + 4) / 2 - 5}px`,
							transform: `rotate(${markerAngle}deg)`,
							boxShadow: `0 0 6px ${accentColor}`,
						}}
					/>
				</div>

				{/* detent labels arranged in arc */}
				{options.map((opt, i) => {
					const angle = detentAngle(i, count)
					const { x, y } = angleToXY(angle, LABEL_RADIUS)
					const isActive = opt.key === value

					return (
						<Radio
							key={opt.key}
							value={opt.key}
							className={cn(
								'absolute flex items-center justify-center cursor-pointer outline-none z-20',
								'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 rounded',
								'min-w-[44px] min-h-[44px]',
							)}
							style={{
								left: `calc(50% + ${x}px - 22px)`,
								top: `calc(50% + ${y}px - 22px)`,
							}}
							aria-label={opt.label}
						>
							<span
								className="font-michroma text-2xs uppercase tracking-wider transition-all duration-200"
								style={isActive ? {
									color: accentColor,
									textShadow: `0 0 8px ${accentColor}, 0 0 16px color-mix(in srgb, ${accentColor} 40%, transparent)`,
								} : {
									color: 'rgba(250,240,220,0.55)',
								}}
							>
								{opt.label}
							</span>
						</Radio>
					)
				})}
			</RadioGroup>
		</div>
	)
}
