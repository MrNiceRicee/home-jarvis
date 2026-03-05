import { Environment, Instances, Instance } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Suspense } from 'react'

import type { Device, DeviceState, Section } from '../../types'

import { PANEL_DEPTH, SCREW_OFFSETS } from './constants'
import { DevicePanel } from './DevicePanel'
import { useGridLayout } from './hooks/useGridLayout'
import { useRackInvalidate } from './hooks/useRackInvalidate'
import { knobMaterial } from './materials'
import { RackLighting } from './RackLighting'
import { RackUtilityPanel } from './RackUtilityPanel'
import { SectionFiller } from './SectionFiller'

interface RackSceneContentProps {
	readonly sections: Section[]
	readonly devices: Device[]
	readonly onStateChange: (id: string, state: Partial<DeviceState>) => void
	readonly onExpand: (device: Device) => void
	readonly onAddSection: () => void
}

export function RackSceneContent({
	sections,
	devices,
	onStateChange,
	onExpand,
	onAddSection,
}: RackSceneContentProps) {
	useRackInvalidate()

	const items = useGridLayout(sections, devices)
	const deviceItems = items.filter((i) => i.type === 'device')

	return (
		<>
			<RackLighting />
			<Environment preset="studio" background={false} environmentIntensity={0.3} />

			{/* instanced screws — single draw call for all panels */}
			<Instances limit={200} material={knobMaterial} dispose={null}>
				<cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
				{deviceItems.flatMap((item) =>
					SCREW_OFFSETS.map((offset, i) => (
						<Instance
							key={`${item.id}-screw-${String(i)}`}
							position={[
								item.position[0] + offset[0],
								item.position[1] + offset[1],
								item.position[2] + PANEL_DEPTH / 2 + 0.01,
							]}
							rotation={[Math.PI / 2, 0, 0]}
						/>
					)),
				)}
			</Instances>

			{/* render grid items */}
			{items.map((item) => {
				switch (item.type) {
					case 'section':
						return (
							<SectionFiller
								key={item.id}
								section={item.section}
								position={item.position}
							/>
						)
					case 'device':
						return (
							<Suspense key={item.id} fallback={null}>
								<DevicePanel
									device={item.device}
									position={item.position}
									onStateChange={onStateChange}
									onExpand={onExpand}
								/>
							</Suspense>
						)
					case 'utility':
						return (
							<RackUtilityPanel
								key={item.id}
								position={item.position}
								onAddSection={onAddSection}
							/>
						)
				}
			})}

			<EffectComposer>
				<Bloom mipmapBlur luminanceThreshold={1} intensity={1.5} />
			</EffectComposer>
		</>
	)
}
