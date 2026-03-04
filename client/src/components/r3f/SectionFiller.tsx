import { Text } from '@react-three/drei'
import { Suspense } from 'react'

import type { Section } from '../../types'

import { CHARS_LABEL, COLORS, FILLER_HEIGHT, FONT_MICHROMA, PANEL_DEPTH, PANEL_WIDTH } from './constants'
import { utilityMaterial } from './materials'

interface SectionFillerProps {
	readonly section: Section
	readonly position: [number, number, number]
}

export function SectionFiller({ section, position }: SectionFillerProps) {
	return (
		<group position={position}>
			<mesh material={utilityMaterial} castShadow dispose={null}>
				<boxGeometry args={[PANEL_WIDTH, FILLER_HEIGHT, PANEL_DEPTH * 0.6]} />
			</mesh>

			{/* section name — etched into filler */}
			<Suspense fallback={null}>
				<Text
					font={FONT_MICHROMA}
					fontSize={0.1}
					letterSpacing={0.12}
					color={COLORS.textEtched}
					anchorX="left"
					anchorY="middle"
					position={[-PANEL_WIDTH / 2 + 0.15, 0, PANEL_DEPTH * 0.3 + 0.01]}
					characters={CHARS_LABEL}
					maxWidth={PANEL_WIDTH * 0.8}
				>
					{section.name.toUpperCase()}
				</Text>
			</Suspense>

			{/* thin accent line along the bottom edge */}
			<mesh
				position={[0, -FILLER_HEIGHT / 2 + 0.005, PANEL_DEPTH * 0.3 + 0.01]}
				dispose={null}
			>
				<planeGeometry args={[PANEL_WIDTH * 0.9, 0.004]} />
				<meshStandardMaterial
					color={COLORS.activeAmber}
					emissive={COLORS.activeAmber}
					emissiveIntensity={1.5}
					toneMapped={false}
				/>
			</mesh>
		</group>
	)
}
