import { cn } from '../../lib/cn'

interface ReadoutDisplayProps {
	children: React.ReactNode
	/** lg = focal hero readout (IoskeleyMono, larger), sm = compact secondary value */
	size?: 'lg' | 'sm'
	/** CSS color for a subtle outer glow — used on LightCard to reflect the light's color */
	glow?: string
	/** accessible label for screen readers */
	'aria-label'?: string
	className?: string
}

export function ReadoutDisplay({ children, size = 'sm', glow, className, ...rest }: Readonly<ReadoutDisplayProps>) {
	return (
		<div
			role={rest['aria-label'] ? 'status' : undefined}
			aria-label={rest['aria-label']}
			className={cn(
				'inline-flex items-center rounded-md',
				'bg-[#0a0a0a] text-[#faf0dc]',
				'shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)]',
				size === 'lg'
					? 'font-ioskeley text-2xl px-3 py-2 tracking-tight'
					: 'font-ioskeley text-sm px-2 py-1 tracking-tight',
				className,
			)}
			style={glow ? { boxShadow: `inset 0 1px 4px rgba(0,0,0,0.5), 0 0 12px 2px color-mix(in srgb, ${glow} 30%, transparent)` } : undefined}
		>
			{children}
		</div>
	)
}
