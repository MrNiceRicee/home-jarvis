import { Radio, RadioGroup } from 'react-aria-components'

import { cn } from '../../lib/cn'
import { PanelButton } from './panel-button'

interface ToggleBankOption {
	key: string
	label: string
	ledColor?: string
}

interface ToggleBankProps {
	label: string
	options: readonly ToggleBankOption[]
	value: string | null
	onChange: (key: string) => void
	mode: 'selection' | 'action'
	disabled?: boolean
}

export function ToggleBank({ label, options, value, onChange, mode, disabled }: Readonly<ToggleBankProps>) {
	if (mode === 'selection') {
		return (
			<div>
				<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block">{label}</span>
				<RadioGroup
					value={value ?? ''}
					onChange={onChange}
					isDisabled={disabled}
					className="flex flex-wrap gap-x-3 gap-y-2"
					aria-label={label}
				>
					{options.map((opt) => (
						<Radio key={opt.key} value={opt.key} className="outline-none focus-visible:[&>div:first-child]:ring-2 focus-visible:[&>div:first-child]:ring-stone-400 focus-visible:[&>div:first-child]:ring-offset-1" aria-label={opt.label}>
							{({ isSelected }) => (
								<ToggleBankItem
									label={opt.label}
									ledColor={opt.ledColor}
									isActive={isSelected}
									disabled={disabled}
								/>
							)}
						</Radio>
					))}
				</RadioGroup>
			</div>
		)
	}

	return (
		<div>
			<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block">{label}</span>
			<div className="flex flex-wrap gap-x-3 gap-y-2" role="toolbar" aria-label={label}>
				{options.map((opt) => (
					<ToggleBankActionItem
						key={opt.key}
						label={opt.label}
						ledColor={opt.ledColor}
						isActive={value === opt.key}
						disabled={disabled}
						onPress={() => onChange(opt.key)}
					/>
				))}
			</div>
		</div>
	)
}

function ToggleBankItem({ label, ledColor, isActive, disabled }: Readonly<{
	label: string
	ledColor?: string
	isActive: boolean
	disabled?: boolean
}>) {
	return (
		<div className="flex flex-col items-center gap-1 cursor-pointer">
			<div
				className={cn(
					'w-7 h-7 relative flex items-center justify-center',
					'rounded-sm border border-stone-300',
					'bg-stone-100 text-stone-600 text-xs font-medium',
					'transition-all duration-100',
					isActive
						? 'shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)] bg-stone-150'
						: 'shadow-[0_1px_2px_rgba(0,0,0,0.1),_inset_0_1px_0_rgba(255,255,255,0.6)]',
					disabled && 'opacity-40',
				)}
			>
				<span
					className={cn('absolute top-1 right-1 w-1.5 h-1.5 rounded-full', !isActive && !ledColor && 'bg-stone-400/30')}
					style={isActive ? {
						backgroundColor: ledColor ?? 'rgb(52,211,153)',
						boxShadow: `0 0 4px ${ledColor ?? 'rgb(52,211,153)'}, 0 0 8px color-mix(in srgb, ${ledColor ?? 'rgb(52,211,153)'} 40%, transparent)`,
					} : ledColor ? {
						backgroundColor: `color-mix(in srgb, ${ledColor} 60%, #78716c)`,
						boxShadow: `0 0 2px color-mix(in srgb, ${ledColor} 30%, transparent)`,
					} : undefined}
				/>
			</div>
			<span className="font-michroma text-2xs uppercase tracking-wider text-stone-400">{label}</span>
		</div>
	)
}

function ToggleBankActionItem({ label, ledColor, isActive, disabled, onPress }: Readonly<{
	label: string
	ledColor?: string
	isActive: boolean
	disabled?: boolean
	onPress: () => void
}>) {
	return (
		<PanelButton
			size="sm"
			label={label}
			led={isActive ? 'on' : 'off'}
			ledColor={ledColor}
			isDisabled={disabled}
			onPress={onPress}
		/>
	)
}
