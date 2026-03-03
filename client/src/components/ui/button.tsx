import { type ReactNode, forwardRef } from 'react'
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components'
import { tv, type VariantProps } from 'tailwind-variants'

const button = tv({
	base: 'inline-flex items-center justify-center gap-1.5 font-medium cursor-default transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40 disabled:pointer-events-none',
	variants: {
		variant: {
			raised: [
				'bg-linear-to-b from-white to-gray-50',
				'border border-gray-200/80',
				'text-gray-700',
				'[box-shadow:var(--shadow-raised),var(--shadow-inner-glow)]',
				'hover:shadow-[var(--shadow-raised-hover)]',
				'hover:from-white hover:to-gray-100/80',
				'pressed:shadow-[var(--shadow-raised-active)]',
				'pressed:translate-y-px',
				'pressed:from-gray-50 pressed:to-gray-100',
				'focus-visible:ring-gray-400',
			],
			primary: [
				'bg-linear-to-b from-gray-800 to-gray-900',
				'border border-gray-700/50',
				'text-white',
				'shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]',
				'hover:from-gray-700 hover:to-gray-800',
				'pressed:from-gray-900 pressed:to-black',
				'pressed:translate-y-px',
				'pressed:shadow-[0_0_0_rgba(0,0,0,0),inset_0_1px_3px_rgba(0,0,0,0.3)]',
				'focus-visible:ring-gray-500',
			],
			ghost: [
				'text-gray-500',
				'hover:text-gray-700 hover:bg-gray-100/60',
				'pressed:bg-gray-200/60',
				'focus-visible:ring-gray-400',
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
