import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface CardProps {
	children: ReactNode
	className?: string
	/** optional accent border color (CSS value) */
	accent?: string
	/** dims the card */
	muted?: boolean
	/** highlight ring */
	selected?: boolean
}

export function Card({ children, className, accent, muted, selected }: Readonly<CardProps>) {
	return (
		<div
			className={cn(
				'relative rounded-xl overflow-hidden',
				'bg-linear-to-b from-white to-gray-50/80',
				'border',
				'shadow-[var(--shadow-raised)]',
				'[box-shadow:var(--shadow-raised),var(--shadow-inner-glow)]',
				'transition-all',
				muted && 'opacity-60',
				selected && 'ring-2 ring-blue-500 ring-offset-1',
				className,
			)}
			style={{
				borderColor: accent ?? (muted ? '#f3f4f6' : 'rgba(0,0,0,0.06)'),
				...(accent ? { borderWidth: '2px' } : {}),
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
		<div
			className={cn(
				'px-4 py-2.5 border-t border-gray-100/80',
				'bg-linear-to-b from-gray-50/30 to-gray-50/60',
				'flex items-center justify-between',
				className,
			)}
		>
			{children}
		</div>
	)
}
