import { useQuery } from '@tanstack/react-query'
import { useMatch } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useDeviceStore } from '../stores/device-store'
import { useReadoutStore } from '../stores/readout-store'
import { useScanStore } from '../stores/scan-store'

function scanStatusLabel(status: string): string {
	if (status === 'scanning') return 'scanning...'
	if (status === 'done') return 'scan complete'
	if (status === 'error') return 'scan error'
	return 'idle'
}

export function useReadoutContext() {
	const isDashboard = useMatch({ from: '/', shouldThrow: false })
	const isIntegrations = useMatch({ from: '/integrations', shouldThrow: false })
	const isMatter = useMatch({ from: '/matter', shouldThrow: false })

	const deviceCount = useDeviceStore((s) => s.devices.length)
	const onlineCount = useDeviceStore((s) => s.devices.reduce((n, d) => n + (d.online ? 1 : 0), 0))

	const scanStatus = useScanStore((s) => s.status)

	const { data: bridge } = useQuery<{ status: string; paired: boolean; deviceCount: number }>({
		queryKey: ['matter'],
		enabled: false,
	})

	const setSlot1 = useReadoutStore((s) => s.setSlot1)
	const setSlot2 = useReadoutStore((s) => s.setSlot2)

	useEffect(() => {
		if (isDashboard) {
			setSlot1(`${deviceCount} devices`)
			setSlot2(`${onlineCount} online`)
		} else if (isIntegrations) {
			setSlot1(`${deviceCount} connected`)
			setSlot2(scanStatusLabel(scanStatus))
		} else if (isMatter) {
			const status = bridge?.status ?? '--'
			const bridged = bridge?.deviceCount ?? '--'
			setSlot1(`bridge: ${status}`)
			setSlot2(`${bridged} bridged`)
		}
	}, [isDashboard, isIntegrations, isMatter, deviceCount, onlineCount, scanStatus, bridge, setSlot1, setSlot2])
}
