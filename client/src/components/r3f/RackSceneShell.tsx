import { Canvas } from '@react-three/fiber'
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'

import type { Device, DeviceState, Section } from '../../types'

import { COLORS } from './constants'
import { RackSceneContent } from './RackSceneContent'

interface RackSceneShellProps {
	readonly sections: Section[]
	readonly devices: Device[]
	readonly onStateChange: (id: string, state: Partial<DeviceState>) => void
	readonly onExpand: (device: Device) => void
	readonly onAddSection: () => void
}

export function RackSceneShell({
	sections,
	devices,
	onStateChange,
	onExpand,
	onAddSection,
}: RackSceneShellProps) {
	return (
		<ErrorBoundary fallback={<WebGLFallback />}>
			<Canvas
				frameloop="demand"
				dpr={[1, 2]}
				camera={{ position: [0, 0, 10], fov: 45 }}
				gl={{ antialias: true }}
				style={{
					background: COLORS.sceneBg,
					touchAction: 'none',
					width: '100%',
					height: '100vh',
				}}
				performance={{ min: 0.5 }}
			>
				<Suspense fallback={null}>
					<RackSceneContent
						sections={sections}
						devices={devices}
						onStateChange={onStateChange}
						onExpand={onExpand}
						onAddSection={onAddSection}
					/>
				</Suspense>
			</Canvas>
		</ErrorBoundary>
	)
}

// simple fallback when WebGL crashes
function WebGLFallback() {
	return (
		<div className="flex flex-col items-center justify-center py-24 text-center text-stone-500">
			<p className="text-lg font-semibold mb-2">3D rendering unavailable</p>
			<p className="text-sm">Your browser may not support WebGL, or the context was lost.</p>
		</div>
	)
}

// react error boundary for WebGL context loss / R3F crashes
interface ErrorBoundaryProps {
	readonly fallback: ReactNode
	readonly children: ReactNode
}

interface ErrorBoundaryState {
	hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = { hasError: false }
	}

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasError: true }
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('R3F scene error:', error, info.componentStack)
	}

	// eslint-disable-next-line sonarjs/function-return-type -- standard React ErrorBoundary pattern
	render(): ReactNode {
		return this.state.hasError ? this.props.fallback : this.props.children
	}
}
