import type { useMatterOrbitalData } from '../hooks/useMatterOrbitalData'

import { TextArtOrb } from './ui/text-art-orb'

type OrbitalData = ReturnType<typeof useMatterOrbitalData>

interface MatterOrbitalProps {
	data: OrbitalData
}

// metadata readout labels positioned along the ring
function MetadataLabel({ x, y, label, value }: Readonly<{
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
				className="fill-console-text-dim"
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

	// uptime placeholder — shown as dashes since we don't track actual uptime
	const uptimeDisplay = data.status === 'running' ? 'LIVE' : '--'

	return (
		<div className="w-full max-w-[500px] mx-auto aspect-square">
			<svg
				viewBox="0 0 500 500"
				className="w-full h-full"
				role="img"
				aria-label={statusLabel}
			>
				<defs>
					{/* phosphor bloom — tight inner glow + wider outer glow */}
					<filter id="phosphor-bloom">
						<feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur1" />
						<feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="blur2" />
						<feMerge>
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
				<g className="metadata-ring-group">
					<circle
						cx={250}
						cy={250}
						r={100}
						fill="none"
						stroke="#6b6356"
						strokeWidth={1.5}
						strokeDasharray="4 8"
					/>
				</g>

				{/* metadata readout labels (static, outside ring) */}
				<MetadataLabel x={250} y={120} label="PORT" value={port || '—'} />
				<MetadataLabel x={370} y={310} label="PAIRED" value={paired ? 'YES' : 'NO'} />
				<MetadataLabel x={130} y={310} label="UPTIME" value={uptimeDisplay} />

				{/* layer 1: glow halo */}
				<circle cx={250} cy={250} r={55} fill="url(#orb-glow)" />

				{/* layer 1: text-art orb */}
				<TextArtOrb orbColor={orbColor} shouldAnimate={shouldAnimate} />

				{/* center device count */}
				{paired && (
					<text
						x={250}
						y={254}
						textAnchor="middle"
						dominantBaseline="middle"
						className="fill-console-bg"
						style={{ fontSize: '16px', fontFamily: 'IoskeleyMono, monospace', fontWeight: 600 }}
					>
						{deviceCount}
					</text>
				)}
			</svg>

			{/* screen reader summary */}
			<div className="sr-only">
				<p>{statusLabel}</p>
				<p>Port: {port || 'not set'}</p>
				<p>Paired: {paired ? 'yes' : 'no'}</p>
				<p>Bridged devices: {deviceCount}</p>
			</div>
		</div>
	)
}
