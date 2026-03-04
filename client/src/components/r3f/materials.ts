import * as THREE from 'three'

import { COLORS } from './constants'

// all materials are module-level singletons to avoid duplicate shader compilations

// champagne gold brushed metal — shared by ALL panel chassis
export const chassisMaterial = new THREE.MeshStandardMaterial({
	color: COLORS.chassis,
	roughness: 0.35,
	metalness: 0.8,
	envMapIntensity: 0.6,
})

// fake smoked glass — NOT MeshPhysicalMaterial (transmission is too expensive)
export const glassMaterial = new THREE.MeshStandardMaterial({
	color: COLORS.displayBg,
	transparent: true,
	opacity: 0.85,
	roughness: 0.05,
	metalness: 0.3,
	envMapIntensity: 0.8,
})

// gunmetal for knobs, faders, screws
export const knobMaterial = new THREE.MeshStandardMaterial({
	color: COLORS.knobGunmetal,
	roughness: 0.4,
	metalness: 0.9,
})

// slightly darker chassis for utility panel
export const utilityMaterial = new THREE.MeshStandardMaterial({
	color: COLORS.utilityDarker,
	roughness: 0.35,
	metalness: 0.8,
	envMapIntensity: 0.5,
})
