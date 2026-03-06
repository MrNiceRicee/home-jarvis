import { cn } from '../../lib/cn'

interface ReadoutDisplayProps {
	children: React.ReactNode
	/** lg = focal hero readout (IoskeleyMono, larger), sm = compact secondary value */
	size?: 'lg' | 'sm'
	/** CSS color for a subtle outer glow — used on LightCard to reflect the light's color */
	glow?: string
	/** 0–1 intensity for text glow (0 = off, 1 = full brightness) */
	glowIntensity?: number
	/** scanline overlay opacity (default 0.04) */
	scanlineIntensity?: number
	/** scanline stripe color (default 'rgba(255,255,255,0.5)') */
	scanlineTint?: string
	/** accessible label for screen readers */
	'aria-label'?: string
	className?: string
}

function buildBoxShadow(glow?: string): string {
	const base = [
		// outer bezel — bright highlight below = sunk into panel
		'0 1px 0 rgba(255,255,255,0.3)',
		'0 2px 0 rgba(255,255,255,0.06)',
		// deep inset cavity — dark edges all around
		'inset 0 4px 10px rgba(0,0,0,0.7)',
		'inset 0 1px 4px rgba(0,0,0,0.5)',
		'inset 0 -1px 3px rgba(0,0,0,0.2)',
		'inset 2px 0 4px rgba(0,0,0,0.15)',
		'inset -2px 0 4px rgba(0,0,0,0.15)',
	]
	if (glow) {
		base.push(`0 0 14px 3px color-mix(in srgb, ${glow} 35%, transparent)`)
	}
	return base.join(', ')
}

export function ReadoutDisplay({ children, size = 'sm', glow, glowIntensity = 0, scanlineIntensity = 0.04, scanlineTint = 'rgba(255,255,255,0.5)', className, ...rest }: Readonly<ReadoutDisplayProps>) {
	// constant backlit glow — always visible like an illuminated LCD, intensity scales brightness
	const baseGlow = 0.15
	const effectiveIntensity = Math.max(baseGlow, glowIntensity)
	const textGlow = `0 0 8px rgba(250,240,220,${(0.4 * effectiveIntensity).toFixed(2)}), 0 0 20px rgba(250,240,220,${(0.15 * effectiveIntensity).toFixed(2)})`

	return (
		<div
			role={rest['aria-label'] ? 'status' : undefined}
			aria-label={rest['aria-label']}
			className={cn(
				'relative inline-flex items-center overflow-hidden',
				'text-display-text',
				size === 'lg'
					? 'font-ioskeley text-2xl px-3 py-2.5 tracking-tight rounded-lg'
					: 'font-ioskeley text-sm px-2 py-1 tracking-tight rounded-md',
				className,
			)}
			style={{
				// LCD cavity — slightly lighter than faceplate for glass distinction
				background: 'linear-gradient(180deg, #2e2d27 0%, #272620 50%, #23221c 100%)',
				border: '1px solid #1a1914',
				boxShadow: buildBoxShadow(glow),
				textShadow: textGlow,
			}}
		>
			{/* glass pane — strong top highlight edge (glass catch-light) */}
			<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
			{/* glass pane — secondary highlight just below the edge */}
			<div className="absolute inset-x-2 top-[1px] h-px bg-gradient-to-r from-transparent via-white/8 to-transparent pointer-events-none" />
			{/* glass pane — top-down depth gradient (light entering glass) */}
			<div className="absolute inset-0 bg-gradient-to-b from-white/[0.07] via-white/[0.02] to-transparent pointer-events-none" />
			{/* glass pane — scanline texture for LCD feel */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					opacity: scanlineIntensity,
					backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 1px, ${scanlineTint} 1px, ${scanlineTint} 2px)`,
				}}
			/>
			{/* glass pane — bottom edge darkening (glass thickness shadow) */}
			<div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
			{/* glass pane — corner vignette */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.15) 100%)',
				}}
			/>
			{children}
		</div>
	)
}
