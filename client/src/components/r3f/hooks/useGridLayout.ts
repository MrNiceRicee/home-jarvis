import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'

import type { Device, Section } from '../../../types'

import { FILLER_HEIGHT, PANEL_GAP, PANEL_HEIGHT, PANEL_WIDTH } from '../constants'

export type GridItem =
	| { type: 'section'; id: string; position: [number, number, number]; section: Section }
	| { type: 'device'; id: string; position: [number, number, number]; device: Device }
	| { type: 'utility'; id: 'utility'; position: [number, number, number] }

/** compute 3D positions for all panels from sections + devices */
export function useGridLayout(sections: Section[], devices: Device[]): GridItem[] {
	const viewport = useThree((s) => s.viewport)

	return useMemo(() => {
		const cellWidth = PANEL_WIDTH + PANEL_GAP
		const cellHeight = PANEL_HEIGHT + PANEL_GAP

		// responsive columns based on viewport width
		const cols = Math.max(1, Math.floor((viewport.width + PANEL_GAP) / cellWidth))

		// center the grid
		const totalGridWidth = cols * cellWidth - PANEL_GAP
		const offsetX = -totalGridWidth / 2 + PANEL_WIDTH / 2

		const items: GridItem[] = []
		let row = 0

		// sort sections by position
		const sorted = [...sections].sort((a, b) => a.position - b.position)

		for (const section of sorted) {
			// section filler spans full row
			const fillerY = -(row * cellHeight + FILLER_HEIGHT / 2)
			items.push({
				type: 'section',
				id: section.id,
				position: [0, fillerY, 0],
				section,
			})
			row += FILLER_HEIGHT / cellHeight + 0.2 // partial row for filler

			// devices in this section, sorted by position
			const sectionDevices = devices
				.filter((d) => d.sectionId === section.id)
				.sort((a, b) => a.position - b.position)

			let col = 0
			for (const device of sectionDevices) {
				const x = offsetX + col * cellWidth
				const y = -(row * cellHeight + PANEL_HEIGHT / 2)
				items.push({
					type: 'device',
					id: device.id,
					position: [x, y, 0],
					device,
				})
				col++
				if (col >= cols) {
					col = 0
					row++
				}
			}

			// move to next row if we had any devices
			if (col > 0) row++
		}

		// utility panel at the bottom
		const utilY = -(row * cellHeight + FILLER_HEIGHT / 2 + PANEL_GAP)
		items.push({
			type: 'utility',
			id: 'utility',
			position: [0, utilY, 0],
		})

		return items
	}, [sections, devices, viewport.width])
}
