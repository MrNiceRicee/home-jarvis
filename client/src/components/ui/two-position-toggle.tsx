import { Radio, RadioGroup } from 'react-aria-components'

import { cn } from '../../lib/cn'

interface TwoPositionToggleProps {
	label: string
	options: readonly [string, string]
	value: string
	onChange: (value: string) => void
	disabled?: boolean
}

export function TwoPositionToggle({ label, options, value, onChange, disabled }: Readonly<TwoPositionToggleProps>) {
	return (
		<div>
			<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block">{label}</span>
			<RadioGroup
				value={value}
				onChange={onChange}
				isDisabled={disabled}
				className="inline-flex rounded-sm border border-stone-300 overflow-hidden"
				aria-label={label}
			>
				{options.map((opt, i) => (
					<Radio
						key={opt}
						value={opt}
						className={cn(
							'outline-none cursor-default px-3 py-1.5 font-michroma text-2xs uppercase tracking-wider transition-all',
							'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-inset',
							i === 0 && 'border-r border-stone-300',
							value === opt
								? 'bg-stone-200 text-stone-800 font-medium shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)]'
								: 'bg-stone-50 text-stone-500',
						)}
					>
						{opt}
					</Radio>
				))}
			</RadioGroup>
		</div>
	)
}
