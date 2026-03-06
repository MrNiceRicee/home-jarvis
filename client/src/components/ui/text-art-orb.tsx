import { useEffect, useRef } from 'react'

import { useReducedMotion } from '../../hooks/useReducedMotion'

// ── braille pixel engine ─────────────────────────────────────────────────────

const COLS = 17
const ROWS = 15
const FB_WIDTH = COLS * 2   // 34 pixels
const FB_HEIGHT = ROWS * 4  // 60 pixels

// bit weight for each dot position in a 2x4 braille cell
// indexed as PIXEL_BIT[x][y] where x=0..1, y=0..3
const PIXEL_BIT = [
	[0x01, 0x02, 0x04, 0x40], // left column: dots 1,2,3,7
	[0x08, 0x10, 0x20, 0x80], // right column: dots 4,5,6,8
]

// 256-entry lookup: codepoint offset → braille character string
const BRAILLE_CHARS = Array.from({ length: 256 }, (_, i) =>
	String.fromCodePoint(0x2800 + i),
)

// bayer 4x4 ordered dither matrix (normalized 0..1)
const BAYER_4x4 = [
	[0 / 16, 8 / 16, 2 / 16, 10 / 16],
	[12 / 16, 4 / 16, 14 / 16, 6 / 16],
	[3 / 16, 11 / 16, 1 / 16, 9 / 16],
	[15 / 16, 7 / 16, 13 / 16, 5 / 16],
]

function renderSphere(
	fb: Uint8Array,
	width: number,
	height: number,
	phase: number,
) {
	const cx = (width - 1) / 2
	const cy = (height - 1) / 2
	const radius = Math.min(cx, cy) - 1

	for (let py = 0; py < height; py++) {
		for (let px = 0; px < width; px++) {
			const nx = (px - cx) / radius
			const ny = (py - cy) / radius
			const dist2 = nx * nx + ny * ny

			if (dist2 > 1.0) {
				fb[py * width + px] = 0
				continue
			}

			// lambert cosine shading — nz is surface normal z-component
			const nz = Math.sqrt(1.0 - dist2)
			const dist = Math.sqrt(dist2)

			// base density from sphere shading
			let density = nz

			// radial wave shimmer — edges shimmer more, center stays solid
			if (phase !== 0) {
				const wave = Math.sin(dist * Math.PI * 3 - phase)
				density += wave * 0.12 * dist
			}

			// bayer ordered dither
			const threshold = BAYER_4x4[py % 4][px % 4]
			fb[py * width + px] = density > threshold ? 1 : 0
		}
	}
}

function encodeToBraille(
	fb: Uint8Array,
	cols: number,
	rows: number,
): string[] {
	const fbWidth = cols * 2
	const lines: string[] = []

	for (let row = 0; row < rows; row++) {
		let line = ''
		for (let col = 0; col < cols; col++) {
			let code = 0
			for (let dy = 0; dy < 4; dy++) {
				for (let dx = 0; dx < 2; dx++) {
					const px = col * 2 + dx
					const py = row * 4 + dy
					if (fb[py * fbWidth + px]) {
						code |= PIXEL_BIT[dx][dy]
					}
				}
			}
			line += BRAILLE_CHARS[code]
		}
		lines.push(line)
	}

	return lines
}

// pre-compute static frame (phase=0, no shimmer)
const STATIC_FB = new Uint8Array(FB_WIDTH * FB_HEIGHT)
renderSphere(STATIC_FB, FB_WIDTH, FB_HEIGHT, 0)
const STATIC_LINES = encodeToBraille(STATIC_FB, COLS, ROWS)

// ── component ────────────────────────────────────────────────────────────────

const FONT_SIZE = 5.5
const LINE_HEIGHT = 6.6 // fontSize * 1.2 — makes braille dots approximately square

type TextArtOrbProps = Readonly<{
	orbColor: string
	shouldAnimate: boolean
	cx?: number
	cy?: number
}>

export function TextArtOrb({
	orbColor,
	shouldAnimate,
	cx = 250,
	cy = 250,
}: TextArtOrbProps) {
	const rowRefs = useRef<(SVGTextElement | null)[]>([])
	const wavePhase = useRef(0)
	const framebuffer = useRef(new Uint8Array(FB_WIDTH * FB_HEIGHT))
	const reducedMotion = useReducedMotion()

	// shimmer animation loop — refs + direct DOM mutation, no React state
	useEffect(() => {
		if (!shouldAnimate || reducedMotion) return

		const id = setInterval(() => {
			wavePhase.current = (wavePhase.current + 0.15) % (Math.PI * 2)

			renderSphere(framebuffer.current, FB_WIDTH, FB_HEIGHT, wavePhase.current)
			const lines = encodeToBraille(framebuffer.current, COLS, ROWS)

			for (let r = 0; r < ROWS; r++) {
				const el = rowRefs.current[r]
				if (el && el.textContent !== lines[r]) {
					el.textContent = lines[r]
				}
			}
		}, 200)

		return () => clearInterval(id)
	}, [shouldAnimate, reducedMotion])

	// reset to static frame when animation stops
	useEffect(() => {
		if (shouldAnimate && !reducedMotion) return
		wavePhase.current = 0
		for (let r = 0; r < ROWS; r++) {
			const el = rowRefs.current[r]
			if (el && el.textContent !== STATIC_LINES[r]) {
				el.textContent = STATIC_LINES[r]
			}
		}
	}, [shouldAnimate, reducedMotion])

	const startY = cy - ((ROWS - 1) * LINE_HEIGHT) / 2

	return (
		<g
			className={shouldAnimate ? 'text-art-orb' : undefined}
			aria-hidden="true"
			filter="url(#phosphor-bloom)"
		>
			{STATIC_LINES.map((line, i) => (
				<text
					key={i}
					ref={(el) => { rowRefs.current[i] = el }}
					x={cx}
					y={startY + i * LINE_HEIGHT}
					textAnchor="middle"
					fill={orbColor}
					style={{
						fontSize: `${FONT_SIZE}px`,
						fontFamily: "'IoskeleyMono', 'BrailleFallback', monospace",
						letterSpacing: '0.5px',
					}}
				>
					{line}
				</text>
			))}
		</g>
	)
}
