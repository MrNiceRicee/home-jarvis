import { Button as AriaButton } from 'react-aria-components'
import { tv, type VariantProps } from 'tailwind-variants'

const terminalButton = tv({
	base: [
		'inline-flex items-center font-ioskeley uppercase text-2xs tracking-wider cursor-pointer',
		'px-1 py-0.5 rounded-sm transition-colors',
		'focus:outline-none focus-visible:ring-1 focus-visible:ring-display-text/30 focus-visible:ring-offset-0',
		'disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none',
	],
	variants: {
		variant: {
			default: [
				'text-display-text/70',
				'hover:text-display-text hover:bg-display-text/10',
				'pressed:text-display-text pressed:bg-display-text/20',
			],
			destructive: [
				'text-red-400/70',
				'hover:text-red-400 hover:bg-red-400/10',
				'pressed:text-red-400 pressed:bg-red-400/20',
			],
		},
	},
	defaultVariants: {
		variant: 'default',
	},
})

type TerminalButtonVariants = VariantProps<typeof terminalButton>

type TerminalButtonProps = Readonly<{
	label: string
	onPress: () => void
	variant?: TerminalButtonVariants['variant']
	isDisabled?: boolean
}>

export function TerminalButton({ label, onPress, variant, isDisabled }: TerminalButtonProps) {
	return (
		<AriaButton
			aria-label={label}
			className={terminalButton({ variant })}
			isDisabled={isDisabled}
			onPress={() => onPress()}
		>
			[{label}]
		</AriaButton>
	)
}
