import { Button as AriaButton } from 'react-aria-components'

import { cn } from '../../lib/cn'

interface PowerButtonProps {
	isOn: boolean
	isDisabled?: boolean
	isToggling?: boolean
	onToggle: () => void
}

export function PowerButton({ isOn, isDisabled, isToggling, onToggle }: Readonly<PowerButtonProps>) {
	const glowing = isOn && !isToggling
	const iconColor = glowing ? 'rgb(52,211,153)' : '#a8a29e'

	return (
		<div className="flex flex-col items-center gap-1">
			<AriaButton
				onPress={onToggle}
				isDisabled={isDisabled}
				aria-label={isOn ? 'Turn off' : 'Turn on'}
				className={cn(
					'w-7 h-7 relative flex items-center justify-center',
					'rounded-sm border border-stone-300 cursor-default',
					'bg-stone-100',
					'transition-all duration-100',
					'shadow-[0_1px_2px_rgba(0,0,0,0.1),_inset_0_1px_0_rgba(255,255,255,0.6)]',
					'pressed:shadow-[inset_0_1px_3px_rgba(0,0,0,0.15)]',
					'disabled:opacity-40',
					'outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1',
					isToggling && 'animate-pulse',
				)}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 12 12"
					fill="none"
					stroke={iconColor}
					strokeWidth="1.5"
					strokeLinecap="round"
					style={glowing ? {
						filter: 'drop-shadow(0 0 3px rgba(52,211,153,0.7)) drop-shadow(0 0 6px rgba(52,211,153,0.4))',
					} : undefined}
				>
					<path d="M6 1v4" />
					<path d="M9.5 3.5a4.5 4.5 0 1 1-7 0" />
				</svg>
			</AriaButton>
			<span className="font-michroma text-2xs uppercase tracking-wider text-stone-400">PWR</span>
		</div>
	)
}
