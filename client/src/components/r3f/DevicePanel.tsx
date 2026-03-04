import { Text } from '@react-three/drei'
import { Suspense, type ReactNode } from 'react'

import type { Device, DeviceState } from '../../types'

import { CHARS_LABEL, COLORS, DISPLAY_INSET, FONT_MICHROMA, PANEL_DEPTH, PANEL_HEIGHT, PANEL_RADIUS, PANEL_WIDTH } from './constants'
import { PowerLED } from './controls/PowerLED'
import { chassisMaterial, glassMaterial } from './materials'

interface DevicePanelProps {
	readonly device: Device
	readonly position: [number, number, number]
	readonly onStateChange: (id: string, state: Partial<DeviceState>) => void
	readonly onExpand: (device: Device) => void
	readonly children?: ReactNode
}

export function DevicePanel({ device, position, onStateChange, onExpand, children }: DevicePanelProps) {
	const isOnline = device.online
	const isOn = device.state.on !== false
	const hasPower = device.state.on !== undefined

	return (
		<group position={position}>
			{/* chassis body */}
			<mesh
				material={chassisMaterial}
				castShadow
				receiveShadow
				dispose={null}
			>
				<boxGeometry args={[PANEL_WIDTH, PANEL_HEIGHT, PANEL_DEPTH]} />
			</mesh>

			{/* rounded edge highlight — top */}
			<mesh
				position={[0, PANEL_HEIGHT / 2 - 0.01, PANEL_DEPTH / 2 + 0.001]}
				material={chassisMaterial}
				dispose={null}
			>
				<planeGeometry args={[PANEL_WIDTH - PANEL_RADIUS * 2, 0.02]} />
			</mesh>

			{/* display window recess */}
			<mesh
				position={[0, -0.05, PANEL_DEPTH / 2 - DISPLAY_INSET / 2 + 0.001]}
				material={glassMaterial}
				dispose={null}
			>
				<boxGeometry args={[PANEL_WIDTH * 0.7, PANEL_HEIGHT * 0.45, DISPLAY_INSET]} />
			</mesh>

			{/* power LED — left of name */}
			{hasPower && (
				<PowerLED
					on={isOnline && isOn}
					position={[-PANEL_WIDTH / 2 + 0.18, PANEL_HEIGHT / 2 - 0.14, PANEL_DEPTH / 2 + 0.01]}
					onToggle={() => onStateChange(device.id, { on: !isOn })}
				/>
			)}

			{/* device name */}
			<Suspense fallback={null}>
				<Text
					font={FONT_MICHROMA}
					fontSize={0.08}
					letterSpacing={0.08}
					color={COLORS.textEtched}
					anchorX="left"
					anchorY="middle"
					position={[
						-PANEL_WIDTH / 2 + (hasPower ? 0.3 : 0.15),
						PANEL_HEIGHT / 2 - 0.14,
						PANEL_DEPTH / 2 + 0.01,
					]}
					characters={CHARS_LABEL}
					maxWidth={PANEL_WIDTH * 0.6}
				>
					{device.name}
				</Text>
			</Suspense>

			{/* expand button — top-right */}
			<mesh
				position={[PANEL_WIDTH / 2 - 0.18, PANEL_HEIGHT / 2 - 0.14, PANEL_DEPTH / 2 + 0.005]}
				onClick={(e) => {
					e.stopPropagation()
					onExpand(device)
				}}
				onPointerOver={(e) => {
					e.stopPropagation()
					document.body.style.cursor = 'pointer'
				}}
				onPointerOut={() => {
					document.body.style.cursor = 'auto'
				}}
			>
				<circleGeometry args={[0.06, 24]} />
				<meshStandardMaterial
					color={COLORS.knobGunmetal}
					roughness={0.4}
					metalness={0.8}
				/>
			</mesh>

			{/* expand button symbol */}
			<Suspense fallback={null}>
				<Text
					font={FONT_MICHROMA}
					fontSize={0.05}
					color={COLORS.textEtched}
					anchorX="center"
					anchorY="middle"
					position={[PANEL_WIDTH / 2 - 0.18, PANEL_HEIGHT / 2 - 0.14, PANEL_DEPTH / 2 + 0.015]}
					characters={CHARS_LABEL}
				>
					{'◎'}
				</Text>
			</Suspense>

			{/* dim overlay for offline devices */}
			{!isOnline && (
				<mesh position={[0, 0, PANEL_DEPTH / 2 + 0.002]}>
					<planeGeometry args={[PANEL_WIDTH, PANEL_HEIGHT]} />
					<meshBasicMaterial color="black" transparent opacity={0.4} />
				</mesh>
			)}

			{/* face slot — per-type controls */}
			{children}
		</group>
	)
}
