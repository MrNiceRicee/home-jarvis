import { Radio, RadioGroup } from 'react-aria-components'

import { cn } from '../../lib/cn'

interface TransportKeyOption {
	key: string
	label: string
	ledColor?: string
}

interface TransportKeyBankProps {
	label: string
	options: readonly TransportKeyOption[]
	value: string
	onChange: (key: string) => void
	disabled?: boolean
}

export function TransportKeyBank({ label, options, value, onChange, disabled }: Readonly<TransportKeyBankProps>) {
	return (
		<div>
			<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block">{label}</span>
			<RadioGroup
				value={value}
				onChange={onChange}
				isDisabled={disabled}
				className="inline-flex rounded-sm overflow-hidden border border-stone-300"
				aria-label={label}
			>
				{options.map((opt, i) => (
					<Radio
						key={opt.key}
						value={opt.key}
						className="outline-none"
						aria-label={opt.label}
					>
						{({ isSelected }) => (
							<TransportKey
								label={opt.label}
								ledColor={opt.ledColor}
								isActive={isSelected}
								disabled={disabled}
								isFirst={i === 0}
								isLast={i === options.length - 1}
							/>
						)}
					</Radio>
				))}
			</RadioGroup>
		</div>
	)
}

function getKeyBorderRadius(isFirst: boolean, isLast: boolean): string {
	if (isFirst && isLast) return '3px'
	if (isFirst) return '3px 0 0 3px'
	if (isLast) return '0 3px 3px 0'
	return '0'
}

function TransportKey({ label, ledColor, isActive, disabled, isFirst, isLast }: Readonly<{
	label: string
	ledColor?: string
	isActive: boolean
	disabled?: boolean
	isFirst: boolean
	isLast: boolean
}>) {
	return (
		<div
			className={cn(
				'relative flex items-center justify-center cursor-pointer select-none',
				'w-12 h-8',
				'transition-all duration-75',
				!isFirst && 'border-l border-stone-300',
				disabled && 'opacity-40 cursor-default',
			)}
			style={{
				background: isActive
					? 'linear-gradient(180deg, #d4d0ca 0%, #ddd9d3 100%)'
					: 'linear-gradient(180deg, #f5f3f0 0%, #e8e5e0 50%, #ddd9d3 100%)',
				boxShadow: isActive
					? 'inset 0 2px 4px rgba(0,0,0,0.15), inset 0 1px 2px rgba(0,0,0,0.1)'
					: '0 1px 2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
				borderRadius: getKeyBorderRadius(isFirst, isLast),
			}}
		>
			{/* led edge — top edge illumination when active */}
			{isActive && ledColor && (
				<div
					className="absolute inset-x-0 top-0 h-[2px]"
					style={{
						background: ledColor,
						boxShadow: `0 0 4px ${ledColor}, 0 1px 6px ${ledColor}`,
					}}
				/>
			)}

			<span
				className={cn(
					'font-michroma text-2xs uppercase tracking-wider',
					isActive ? 'text-stone-700 font-medium' : 'text-stone-400',
				)}
			>
				{label}
			</span>
		</div>
	)
}
