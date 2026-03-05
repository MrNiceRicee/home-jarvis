import { cn } from '../../lib/cn'

interface ReadoutDisplayProps {
	children: React.ReactNode
	/** lg = focal hero readout (IoskeleyMono, larger), sm = compact secondary value */
	size?: 'lg' | 'sm'
	/** CSS color for a subtle outer glow — used on LightCard to reflect the light's color */
	glow?: string
	/** 0–1 intensity for text glow (0 = off, 1 = full brightness) */
	glowIntensity?: number
	/** accessible label for screen readers */
	'aria-label'?: string
	className?: string
}

function buildBoxShadow(glow?: string): string {
	const base = [
		// outer bezel — bottom highlight makes display look recessed
		'0 1px 0 rgba(255,255,255,0.2)',
		// inset cavity
		'inset 0 2px 6px rgba(0,0,0,0.5)',
		'inset 0 0 2px rgba(0,0,0,0.3)',
	]
	if (glow) {
		base.push(`0 0 14px 3px color-mix(in srgb, ${glow} 35%, transparent)`)
	}
	return base.join(', ')
}

export function ReadoutDisplay({ children, size = 'sm', glow, glowIntensity = 0, className, ...rest }: Readonly<ReadoutDisplayProps>) {
	const textGlow = glowIntensity > 0
		? `0 0 8px rgba(250,240,220,${(0.4 * glowIntensity).toFixed(2)}), 0 0 20px rgba(250,240,220,${(0.15 * glowIntensity).toFixed(2)})`
		: undefined

	return (
		<div
			role={rest['aria-label'] ? 'status' : undefined}
			aria-label={rest['aria-label']}
			className={cn(
				'relative inline-flex items-center rounded-md overflow-hidden',
				'bg-[#2a2924] text-[#faf0dc]',
				'border border-[#1a1914]',
				size === 'lg'
					? 'font-ioskeley text-2xl px-3 py-2.5 tracking-tight'
					: 'font-ioskeley text-sm px-2 py-1 tracking-tight',
				className,
			)}
			style={{
				boxShadow: buildBoxShadow(glow),
				textShadow: textGlow,
			}}
		>
			{/* glass pane — top highlight edge */}
			<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
			{/* glass pane — vertical gradient for depth under glass */}
			<div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-transparent pointer-events-none rounded-md" />
			{/* glass pane — subtle bottom edge darkening */}
			<div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
			{children}
		</div>
	)
}
