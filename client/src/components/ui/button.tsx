import { type ReactNode, forwardRef } from 'react'
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components'
import { tv, type VariantProps } from 'tailwind-variants'

const button = tv({
	base: 'inline-flex items-center justify-center gap-1.5 font-medium cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40 disabled:pointer-events-none',
	variants: {
		variant: {
			raised: [
				'bg-linear-to-b from-[#fffdf8] to-stone-50',
				'border border-stone-200/70',
				'text-stone-700',
				'[box-shadow:var(--shadow-raised),var(--shadow-inner-glow)]',
				'hover:shadow-[var(--shadow-raised-hover)]',
				'hover:from-[#fffdf8] hover:to-stone-100/80',
				'pressed:shadow-[var(--shadow-raised-active)]',
				'pressed:translate-y-px',
				'pressed:from-stone-50 pressed:to-stone-100',
				'focus-visible:ring-stone-400',
			],
			primary: [
				'bg-linear-to-b from-stone-700 to-stone-800',
				'border border-stone-600/50',
				'text-white',
				'shadow-[0_1px_3px_rgba(87,75,60,0.2),0_4px_12px_rgba(87,75,60,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]',
				'hover:from-stone-600 hover:to-stone-700',
				'pressed:from-stone-800 pressed:to-stone-900',
				'pressed:translate-y-px',
				'pressed:shadow-[0_0_0_rgba(0,0,0,0),inset_0_1px_3px_rgba(87,75,60,0.3)]',
				'focus-visible:ring-stone-500',
			],
			ghost: [
				'text-stone-500',
				'hover:text-stone-700 hover:bg-stone-100/60',
				'pressed:bg-stone-200/60',
				'focus-visible:ring-stone-400',
			],
			danger: [
				'bg-linear-to-b from-red-500 to-red-600',
				'border border-red-600/50',
				'text-white',
				'shadow-[0_1px_3px_rgba(220,38,38,0.2),0_4px_12px_rgba(220,38,38,0.15),inset_0_1px_0_rgba(255,255,255,0.15)]',
				'hover:from-red-600 hover:to-red-700',
				'pressed:from-red-700 pressed:to-red-800',
				'pressed:translate-y-px',
				'focus-visible:ring-red-500',
			],
			amber: [
				'bg-linear-to-b from-amber-500 to-amber-600',
				'border border-amber-600/50',
				'text-white',
				'shadow-[0_1px_3px_rgba(217,119,6,0.2),0_4px_12px_rgba(217,119,6,0.15),inset_0_1px_0_rgba(255,255,255,0.15)]',
				'hover:from-amber-600 hover:to-amber-700',
				'pressed:from-amber-700 pressed:to-amber-800',
				'pressed:translate-y-px',
				'focus-visible:ring-amber-500',
			],
		},
		size: {
			sm: 'text-xs px-2.5 py-1 rounded-lg',
			md: 'text-sm px-3 py-1.5 rounded-lg',
		},
	},
	defaultVariants: {
		variant: 'raised',
		size: 'md',
	},
})

type ButtonVariants = VariantProps<typeof button>

interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
	variant?: ButtonVariants['variant']
	size?: ButtonVariants['size']
	className?: string
	children: ReactNode
}

export const RaisedButton = forwardRef<HTMLButtonElement, Readonly<ButtonProps>>(
	function RaisedButton({ variant, size, className, children, ...props }, ref) {
		return (
			<AriaButton
				ref={ref}
				className={button({ variant, size, className })}
				{...props}
			>
				{children}
			</AriaButton>
		)
	},
)
