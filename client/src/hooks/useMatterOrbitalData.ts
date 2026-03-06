import { useMemo } from 'react'

type BridgeStatus = 'running' | 'starting' | 'error' | 'stopped'

interface MatterData {
	status: string
	paired: boolean
	deviceCount: number
	port: number
}

interface OrbitalData {
	status: BridgeStatus
	paired: boolean
	deviceCount: number
	port: number
	orbColor: string
	shouldAnimate: boolean
	statusLabel: string
}

const ORB_COLORS: Record<BridgeStatus, string> = {
	running: '#34d399',
	starting: '#fbbf24',
	error: '#ef4444',
	stopped: '#a8a29e',
}

function normalizeBridgeStatus(status: string): BridgeStatus {
	if (status === 'running' || status === 'starting' || status === 'error') return status
	return 'stopped'
}

export function useMatterOrbitalData(matterData: MatterData | undefined): OrbitalData {
	return useMemo(() => {
		const status = normalizeBridgeStatus(matterData?.status ?? 'stopped')
		const paired = matterData?.paired ?? false
		const deviceCount = matterData?.deviceCount ?? 0
		const port = matterData?.port ?? 0

		let statusLabel = 'Matter bridge stopped'
		if (status === 'running') {
			statusLabel = paired
				? `Matter bridge running, paired, ${deviceCount} bridged devices`
				: 'Matter bridge running, awaiting pairing'
		} else if (status === 'starting') {
			statusLabel = 'Matter bridge starting'
		} else if (status === 'error') {
			statusLabel = 'Matter bridge error'
		}

		return {
			status,
			paired,
			deviceCount,
			port,
			orbColor: ORB_COLORS[status],
			shouldAnimate: status === 'running',
			statusLabel,
		}
	}, [matterData?.status, matterData?.paired, matterData?.deviceCount, matterData?.port])
}
