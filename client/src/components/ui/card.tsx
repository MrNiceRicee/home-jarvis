import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface CardProps {
	children: ReactNode
	className?: string
	/** optional accent border color (CSS value) */
	accent?: string
	/** optional ambient edge glow (pre-computed CSS box-shadow value) */
	glowShadow?: string
	/** dims the card */
	muted?: boolean
	/** highlight ring */
	selected?: boolean
}

export function Card({ children, className, accent, glowShadow, muted, selected }: Readonly<CardProps>) {
	// emboss + warm shadow layers for stamped faceplate feel
	const baseShadow = '0 1px 2px rgba(120,90,50,0.05), 0 4px 12px rgba(120,90,50,0.04), 0 8px 24px rgba(120,90,50,0.02), inset 0 0.5px 0 rgba(255,255,255,0.5)'
	const hoverShadow = '0 2px 4px rgba(120,90,50,0.06), 0 8px 20px rgba(120,90,50,0.06), 0 12px 32px rgba(120,90,50,0.03), inset 0 0.5px 0 rgba(255,255,255,0.5)'

	return (
		<div
			className={cn(
				'relative rounded-md overflow-hidden',
				'bg-surface-warm',
				'border border-[rgba(168,151,125,0.12)]',
				'transition-all duration-200',
				muted && 'opacity-60',
				selected && 'ring-2 ring-amber-500/70 ring-offset-1',
				className,
			)}
			style={{
				borderColor: accent ?? (muted ? '#e7e5e0' : 'rgba(168,151,125,0.12)'),
				boxShadow: glowShadow
					? `${baseShadow}, ${glowShadow}`
					: baseShadow,
			}}
			onMouseEnter={(e) => {
				if (!glowShadow) e.currentTarget.style.boxShadow = hoverShadow
			}}
			onMouseLeave={(e) => {
				if (!glowShadow) e.currentTarget.style.boxShadow = baseShadow
			}}
		>
			{children}
		</div>
	)
}

interface CardHeaderProps {
	children: ReactNode
	className?: string
	style?: React.CSSProperties
}

export function CardHeader({ children, className, style }: Readonly<CardHeaderProps>) {
	return (
		<div className={cn('px-4 pt-4 pb-3', className)} style={style}>
			{children}
		</div>
	)
}

export function CardBody({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
	return <div className={cn('px-4 pb-4', className)}>{children}</div>
}

export function CardFooter({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
	return (
		<div className={cn('flex flex-col', className)}>
			{children}
		</div>
	)
}
