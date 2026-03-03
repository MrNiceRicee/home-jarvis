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
		<ModalOverlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out">
			<AriaModal
				className={cn(
					'w-full max-w-md mx-4',
					'bg-linear-to-b from-white to-gray-50/80',
					'rounded-2xl',
					'border border-white/60',
					'shadow-[0_8px_40px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]',
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
