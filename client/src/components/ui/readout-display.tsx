import { cn } from '../../lib/cn'

interface ReadoutDisplayProps {
	children: React.ReactNode
	/** lg = focal hero readout (IoskeleyMono, larger), sm = compact secondary value */
	size?: 'lg' | 'sm'
	className?: string
}

export function ReadoutDisplay({ children, size = 'sm', className }: Readonly<ReadoutDisplayProps>) {
	return (
		<div
			className={cn(
				'inline-flex items-center rounded-md',
				'bg-[#0a0a0a] text-[#faf0dc]',
				'shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)]',
				size === 'lg'
					? 'font-ioskeley text-2xl px-3 py-2 tracking-tight'
					: 'font-ioskeley text-sm px-2 py-1 tracking-tight',
				className,
			)}
		>
			{children}
		</div>
	)
}
