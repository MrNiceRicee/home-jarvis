import { cn } from '../../lib/cn'

export function StatusLed({ status }: Readonly<{ status: string }>) {
	const color =
		status === 'running' ? 'bg-emerald-400 shadow-emerald-400/50'
		: status === 'starting' ? 'bg-amber-400 shadow-amber-400/50 animate-pulse'
		: status === 'error' ? 'bg-red-400 shadow-red-400/50'
		: 'bg-stone-300 shadow-stone-300/30'

	return (
		<div className="relative flex items-center justify-center w-10 h-10">
			{/* bezel ring */}
			<div
				className={cn(
					'absolute inset-0 rounded-full',
					'bg-linear-to-b from-stone-200 to-stone-300',
					'shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),0_1px_0_rgba(255,255,255,0.6)]',
				)}
			/>
			{/* inset well */}
			<div
				className={cn(
					'absolute inset-[3px] rounded-full',
					'bg-linear-to-b from-stone-700 to-stone-800',
					'shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]',
				)}
			/>
			{/* LED dot */}
			<div className={cn('relative w-3.5 h-3.5 rounded-full', color, 'shadow-[0_0_6px_currentColor]')} />
		</div>
	)
}
