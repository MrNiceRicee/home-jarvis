import { useMemo } from 'react'

type BridgeStatus = 'running' | 'starting' | 'error' | 'stopped'

interface MatterData {
	status: string
	paired: boolean
	deviceCount: number
	port: number
}

interface OrbGradient {
	highlight: string
	mid: string
	edge: string
}

interface OrbitalData {
	status: BridgeStatus
	paired: boolean
	deviceCount: number
	port: number
	orbGradient: OrbGradient
	shouldPulse: boolean
	statusLabel: string
}

const GRADIENTS: Record<BridgeStatus, OrbGradient> = {
	running: { highlight: '#6ee7b7', mid: '#34d399', edge: '#059669' },
	starting: { highlight: '#fde68a', mid: '#fbbf24', edge: '#d97706' },
	error: { highlight: '#fca5a5', mid: '#ef4444', edge: '#dc2626' },
	stopped: { highlight: '#d6d3cd', mid: '#a8a29e', edge: '#78716c' },
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
			orbGradient: GRADIENTS[status],
			shouldPulse: status === 'running',
			statusLabel,
		}
	}, [matterData?.status, matterData?.paired, matterData?.deviceCount, matterData?.port])
}
