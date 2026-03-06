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
					'rounded-xl',
					'entering:animate-in entering:zoom-in-95',
					'exiting:animate-out exiting:zoom-out-95',
					className,
				)}
				style={{
					background: 'linear-gradient(to bottom, #d6d3cc, #c4c0b8)',
					border: '1px solid rgba(168, 151, 125, 0.25)',
					boxShadow: '0 8px 40px rgba(80, 60, 30, 0.12), 0 2px 8px rgba(80, 60, 30, 0.08), inset 0 1px 0 rgba(255,255,255,0.5)',
				}}
			>
				<Dialog className="p-6 outline-none">
					{children}
				</Dialog>
			</AriaModal>
		</ModalOverlay>
	)
}
