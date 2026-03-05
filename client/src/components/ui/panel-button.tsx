import type { ReactNode } from 'react'

import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components'

import { cn } from '../../lib/cn'

interface PanelButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
	led?: 'on' | 'off' | 'pulse'
	ledColor?: string
	size?: 'sm' | 'md'
	label?: string
	className?: string
	children?: ReactNode
}

export function PanelButton({ led, ledColor = 'rgb(52,211,153)', size = 'md', label, className, children, ...props }: Readonly<PanelButtonProps>) {
	const sizeClass = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'

	return (
		<div className="flex flex-col items-center gap-1">
			<AriaButton
				className={cn(
					sizeClass,
					'relative flex items-center justify-center',
					'rounded-sm border border-stone-300 cursor-default',
					'bg-stone-100 text-stone-600 text-xs font-medium',
					'transition-all duration-100',
					'shadow-[0_1px_2px_rgba(0,0,0,0.1),_inset_0_1px_0_rgba(255,255,255,0.6)]',
					'pressed:shadow-[inset_0_1px_3px_rgba(0,0,0,0.15)]',
					'pressed:bg-stone-150',
					'disabled:opacity-40',
					'focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1',
					className,
				)}
				{...props}
			>
				{led && (
					<span
						className={cn(
							'absolute top-1 right-1 w-1.5 h-1.5 rounded-full',
							led === 'pulse' && 'animate-pulse',
							led === 'off' && 'bg-stone-400/30',
						)}
						style={led === 'on' || led === 'pulse' ? {
							backgroundColor: ledColor,
							boxShadow: `0 0 4px ${ledColor}, 0 0 8px color-mix(in srgb, ${ledColor} 40%, transparent)`,
						} : undefined}
					/>
				)}
				{children}
			</AriaButton>
			{label && (
				<span className="font-michroma text-2xs uppercase tracking-wider text-stone-400">{label}</span>
			)}
		</div>
	)
}
