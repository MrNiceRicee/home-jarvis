import { Radio, RadioGroup } from 'react-aria-components'

import { cn } from '../../lib/cn'

interface SteppedRadialDialProps {
	label: string
	options: readonly { key: string; label: string }[]
	value: string
	onChange: (key: string) => void
	disabled?: boolean
}

export function SteppedRadialDial({ label, options, value, onChange, disabled }: Readonly<SteppedRadialDialProps>) {
	const count = options.length
	// spread detent positions across the top arc (-135° to +135°, 270° sweep)
	const startAngle = -135
	const sweep = 270
	const radius = 52 // px from center to detent label

	// find active index for knob marker rotation
	const activeIdx = options.findIndex((o) => o.key === value)
	const markerAngle = activeIdx >= 0
		? startAngle + (activeIdx / (count - 1)) * sweep
		: startAngle

	return (
		<div>
			<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block">{label}</span>
			<RadioGroup
				value={value}
				onChange={onChange}
				isDisabled={disabled}
				aria-label={label}
				className="relative flex items-center justify-center"
				style={{ width: 120, height: 120 }}
			>
				{/* center knob body */}
				<div
					className="absolute w-12 h-12 rounded-full pointer-events-none"
					style={{
						top: 'calc(50% - 24px)',
						left: 'calc(50% - 24px)',
						backgroundImage: 'linear-gradient(180deg, #e8e4de, #d4d0ca, #c0bcb6, #d4d0ca)',
						boxShadow: '0 2px 6px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.3)',
					}}
				>
					{/* knob marker — line pointing to active detent */}
					<div
						className="absolute w-0.5 h-3 bg-stone-600 rounded-full left-1/2 -translate-x-1/2 origin-[center_24px] transition-transform duration-200"
						style={{ top: 2, transform: `translateX(-50%) rotate(${markerAngle}deg)` }}
					/>
				</div>

				{/* detent positions arranged in arc */}
				{options.map((opt, i) => {
					const angle = startAngle + (i / (count - 1)) * sweep
					const rad = (angle * Math.PI) / 180
					const x = Math.cos(rad) * radius
					const y = Math.sin(rad) * radius
					const isActive = opt.key === value

					return (
						<Radio
							key={opt.key}
							value={opt.key}
							className={cn(
								'absolute flex items-center justify-center cursor-default outline-none',
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
								className={cn(
									'font-michroma text-2xs uppercase tracking-wider transition-colors',
									isActive ? 'text-stone-700 font-medium' : 'text-stone-400',
								)}
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
