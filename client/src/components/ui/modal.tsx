import type { ReactNode } from 'react'

import { Dialog, Modal as AriaModal, ModalOverlay } from 'react-aria-components'

import { cn } from '../../lib/cn'

interface RaisedModalProps {
	children: ReactNode | ((opts: { close: () => void }) => ReactNode)
	className?: string
}

/** frosted glass overlay + raised modal surface */
export function RaisedModal({ children, className }: Readonly<RaisedModalProps>) {
	return (
		<ModalOverlay className="fixed inset-0 bg-stone-900/15 backdrop-blur-sm z-50 flex items-center justify-center entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out">
			<AriaModal
				className={cn(
					'w-full max-w-md mx-4',
					'bg-linear-to-b from-surface-warm to-stone-50/80',
					'rounded-2xl',
					'border border-[rgba(168,151,125,0.15)]',
					'shadow-[0_8px_40px_rgba(120,90,50,0.08),0_2px_8px_rgba(120,90,50,0.06),inset_0_1px_0_rgba(255,253,245,0.8)]',
					'entering:animate-in entering:zoom-in-95',
					'exiting:animate-out exiting:zoom-out-95',
					className,
				)}
			>
				<Dialog className="p-6 outline-none">
					{children}
				</Dialog>
			</AriaModal>
		</ModalOverlay>
	)
}
