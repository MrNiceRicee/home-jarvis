import { Text } from '@react-three/drei'
import { Suspense } from 'react'

import { CHARS_LABEL, COLORS, FILLER_HEIGHT, FONT_MICHROMA, PANEL_DEPTH, PANEL_WIDTH } from './constants'
import { utilityMaterial } from './materials'

interface RackUtilityPanelProps {
	readonly position: [number, number, number]
	readonly onAddSection: () => void
}

export function RackUtilityPanel({ position, onAddSection }: RackUtilityPanelProps) {
	return (
		<group position={position}>
			<mesh material={utilityMaterial} dispose={null}>
				<boxGeometry args={[PANEL_WIDTH, FILLER_HEIGHT, PANEL_DEPTH * 0.6]} />
			</mesh>

			{/* add section button */}
			<mesh
				position={[0, 0, PANEL_DEPTH * 0.3 + 0.005]}
				onClick={(e) => {
					e.stopPropagation()
					onAddSection()
				}}
				onPointerOver={(e) => {
					e.stopPropagation()
					document.body.style.cursor = 'pointer'
				}}
				onPointerOut={() => {
					document.body.style.cursor = 'auto'
				}}
			>
				<circleGeometry args={[0.1, 24]} />
				<meshStandardMaterial
					color={COLORS.knobGunmetal}
					roughness={0.4}
					metalness={0.8}
				/>
			</mesh>

			{/* + symbol */}
			<Suspense fallback={null}>
				<Text
					font={FONT_MICHROMA}
					fontSize={0.1}
					color={COLORS.textEtched}
					anchorX="center"
					anchorY="middle"
					position={[0, 0, PANEL_DEPTH * 0.3 + 0.015]}
					characters={CHARS_LABEL}
				>
					{'+'}
				</Text>
			</Suspense>
		</group>
	)
}
