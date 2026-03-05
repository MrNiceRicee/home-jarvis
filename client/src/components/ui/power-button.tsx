import { PanelButton } from './panel-button'

interface PowerButtonProps {
	isOn: boolean
	isDisabled?: boolean
	isToggling?: boolean
	onToggle: () => void
}

export function PowerButton({ isOn, isDisabled, isToggling, onToggle }: Readonly<PowerButtonProps>) {
	const led = isToggling ? 'pulse' : isOn ? 'on' : 'off'

	return (
		<PanelButton
			led={led}
			ledColor="rgb(52,211,153)"
			size="sm"
			label="PWR"
			onPress={onToggle}
			isDisabled={isDisabled}
			aria-label={isOn ? 'Turn off' : 'Turn on'}
		>
			{/* power icon */}
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
				<path d="M6 1v4" />
				<path d="M9.5 3.5a4.5 4.5 0 1 1-7 0" />
			</svg>
		</PanelButton>
	)
}
