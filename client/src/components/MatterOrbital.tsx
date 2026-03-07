import type { useMatterOrbitalData } from '../hooks/useMatterOrbitalData'
import { useOrbTier } from '../hooks/useOrbTier'
import { TextArtOrb } from './ui/text-art-orb'

type OrbitalData = ReturnType<typeof useMatterOrbitalData>

interface MatterOrbitalProps {
	data: OrbitalData
}

// metadata readout labels positioned along the ring
function MetadataLabel({
	x,
	y,
	label,
	value,
}: Readonly<{
	x: number
	y: number
	label: string
	value: string | number
}>) {
	return (
		<g>
			<text
				x={x}
				y={y - 8}
				textAnchor="middle"
				className="fill-console-text-muted"
				style={{ fontSize: '8px', fontFamily: 'Michroma, sans-serif', letterSpacing: '0.15em' }}
			>
				{label}
			</text>
			<text
				x={x}
				y={y + 8}
				textAnchor="middle"
				className="fill-console-text"
				style={{ fontSize: '14px', fontFamily: 'IoskeleyMono, monospace' }}
			>
				{value}
			</text>
		</g>
	)
}

export function MatterOrbital({ data }: Readonly<MatterOrbitalProps>) {
	const { orbColor, shouldAnimate, statusLabel, port, paired, deviceCount } = data
	const { cols, rows, size } = useOrbTier()

	const center = size / 2
	const ringRadius = size * 0.2

	// uptime placeholder — shown as dashes since we don't track actual uptime
	const uptimeDisplay = data.status === 'running' ? 'LIVE' : '--'

	return (
		<div className="w-full h-full flex items-center justify-center">
			<div style={{ width: size }} className="aspect-square">
				<svg
					viewBox={`0 0 ${size} ${size}`}
					className="w-full h-full"
					role="img"
					aria-label={statusLabel}
				>
					<defs>
						{/* phosphor bloom — 3-layer: ambient glow + character bleed + tight edge */}
						<filter id="phosphor-bloom">
							<feGaussianBlur in="SourceGraphic" stdDeviation="3.0" result="bloom" />
							<feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur1" />
							<feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="blur2" />
							<feMerge>
								<feMergeNode in="bloom" />
								<feMergeNode in="blur1" />
								<feMergeNode in="blur2" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>

						{/* glow halo behind the orb */}
						<radialGradient id="orb-glow">
							<stop offset="0%" stopColor={orbColor} stopOpacity="0.25" />
							<stop offset="60%" stopColor={orbColor} stopOpacity="0.08" />
							<stop offset="100%" stopColor={orbColor} stopOpacity="0" />
						</radialGradient>
					</defs>

					{/* layer 2: metadata ring (animated rotation) */}
					<g className="metadata-ring-group" style={{ transformOrigin: `${center}px ${center}px` }}>
						<circle
							cx={center}
							cy={center}
							r={ringRadius}
							fill="none"
							stroke="#6b6356"
							strokeWidth={1.5}
							strokeDasharray="4 8"
						/>
					</g>

					{/* metadata readout labels (static, outside ring) */}
					<MetadataLabel
						x={center}
						y={center - ringRadius * 1.3}
						label="PORT"
						value={port || '—'}
					/>
					<MetadataLabel
						x={center + ringRadius * 1.2}
						y={center + ringRadius * 0.6}
						label="PAIRED"
						value={paired ? 'YES' : 'NO'}
					/>
					<MetadataLabel
						x={center - ringRadius * 1.2}
						y={center + ringRadius * 0.6}
						label="UPTIME"
						value={uptimeDisplay}
					/>

					{/* layer 1: glow halo */}
					<circle cx={center} cy={center} r={ringRadius} fill="url(#orb-glow)" />

					{/* layer 1: text-art orb (device count rendered as negative space) */}
					<TextArtOrb
						orbColor={orbColor}
						shouldAnimate={shouldAnimate}
						deviceCount={deviceCount}
						cols={cols}
						rows={rows}
						cx={center}
						cy={center}
					/>
				</svg>

				{/* screen reader summary */}
				<div className="sr-only">
					<p>{statusLabel}</p>
					<p>Port: {port || 'not set'}</p>
					<p>Paired: {paired ? 'yes' : 'no'}</p>
					<p>Bridged devices: {deviceCount}</p>
				</div>
			</div>
		</div>
	)
}
