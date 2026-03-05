import { useRef } from 'react'
import * as THREE from 'three'

import { COLORS } from '../constants'

interface PowerLEDProps {
	readonly on: boolean
	readonly position: [number, number, number]
	readonly onToggle: () => void
}

const ledOnMaterial = new THREE.MeshStandardMaterial({
	color: COLORS.powerGreen,
	emissive: COLORS.powerGreen,
	emissiveIntensity: 2.5,
	toneMapped: false,
	roughness: 0.2,
	metalness: 0.1,
})

const ledOffMaterial = new THREE.MeshStandardMaterial({
	color: '#1a1a1a',
	emissive: '#000000',
	emissiveIntensity: 0,
	roughness: 0.6,
	metalness: 0.2,
})

export function PowerLED({ on, position, onToggle }: PowerLEDProps) {
	const meshRef = useRef<THREE.Mesh>(null)

	return (
		<mesh
			ref={meshRef}
			position={position}
			material={on ? ledOnMaterial : ledOffMaterial}
			onClick={(e) => {
				e.stopPropagation()
				onToggle()
			}}
			onPointerOver={(e) => {
				e.stopPropagation()
				document.body.style.cursor = 'pointer'
			}}
			onPointerOut={() => {
				document.body.style.cursor = 'auto'
			}}
			dispose={null}
		>
			<sphereGeometry args={[0.04, 16, 16]} />
		</mesh>
	)
}
