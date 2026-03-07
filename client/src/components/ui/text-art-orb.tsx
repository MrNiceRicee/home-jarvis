import { useEffect, useMemo, useRef } from 'react'

import { useReducedMotion } from '../../hooks/useReducedMotion'

// ── braille pixel engine ─────────────────────────────────────────────────────

// bit weight for each dot position in a 2x4 braille cell
const PIXEL_BIT = [
	[0x01, 0x02, 0x04, 0x40], // left column: dots 1,2,3,7
	[0x08, 0x10, 0x20, 0x80], // right column: dots 4,5,6,8
]

// 256-entry lookup: codepoint offset → braille character
const BRAILLE_CHARS = Array.from({ length: 256 }, (_, i) => String.fromCodePoint(0x2800 + i))

// bayer 4x4 ordered dither matrix (normalized 0..1)
const BAYER_4x4 = [
	[0 / 16, 8 / 16, 2 / 16, 10 / 16],
	[12 / 16, 4 / 16, 14 / 16, 6 / 16],
	[3 / 16, 11 / 16, 1 / 16, 9 / 16],
	[15 / 16, 7 / 16, 13 / 16, 5 / 16],
]

// textLength forces exact char widths, so with charWidth = fontSize*0.6
// and lineHeight = fontSize*1.2, pixel aspect is exactly 1.0
const PIXEL_ASPECT = 1.0

// ── 5x7 bitmap font for negative-space digits ───────────────────────────────

// each row is a 5-bit bitmask, MSB = leftmost pixel
const DIGIT_FONT: number[][] = [
	[0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], // 0
	[0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e], // 1
	[0x0e, 0x11, 0x01, 0x0e, 0x10, 0x10, 0x1f], // 2
	[0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e], // 3
	[0x11, 0x11, 0x11, 0x1f, 0x01, 0x01, 0x01], // 4
	[0x1f, 0x10, 0x10, 0x1e, 0x01, 0x01, 0x1e], // 5
	[0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e], // 6
	[0x1f, 0x01, 0x02, 0x04, 0x04, 0x04, 0x04], // 7
	[0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e], // 8
	[0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e], // 9
]

const DIGIT_W = 5
const DIGIT_H = 7

// ── sphere renderer ──────────────────────────────────────────────────────────

const SPIKE_COUNT = 8
const SPIKE_MAX_LENGTH = 0.55

function sphereDensity(dist2: number, dist: number, wavePhase: number): number {
	const nz = Math.sqrt(1.0 - dist2)
	let density = nz
	if (wavePhase !== 0) {
		density += Math.sin(dist * Math.PI * 3 - wavePhase) * 0.12 * dist
	}
	return density
}

function spikeAt(dist: number, angle: number, spikePhase: number): number {
	const distBeyond = dist - 1.0
	if (distBeyond > SPIKE_MAX_LENGTH) return 0

	for (let i = 0; i < SPIKE_COUNT; i++) {
		const spikeAngle = (i / SPIKE_COUNT) * Math.PI * 2 + Math.sin(spikePhase * 0.7 + i * 1.7) * 0.6
		const spikeLength =
			SPIKE_MAX_LENGTH * (0.3 + 0.7 * Math.max(0, Math.sin(spikePhase * 0.3 + i * 2.1)))
		const spikeWidth = 0.22 + Math.sin(spikePhase * 0.5 + i) * 0.08

		if (distBeyond > spikeLength) continue

		let angleDiff = angle - spikeAngle
		if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
		if (angleDiff < -Math.PI) angleDiff += Math.PI * 2
		if (Math.abs(angleDiff) >= spikeWidth) continue

		const radialFalloff = 1.0 - distBeyond / spikeLength
		const angularFalloff = 1.0 - Math.abs(angleDiff) / spikeWidth
		return 0.8 * radialFalloff * radialFalloff * angularFalloff
	}
	return 0
}

function renderFrame(
	fb: Uint8Array,
	width: number,
	height: number,
	wavePhase: number,
	breathScale: number,
	spikePhase: number,
	deviceCount: number,
) {
	const cx = (width - 1) / 2
	const cy = (height - 1) / 2
	const radius = (Math.min(cx / PIXEL_ASPECT, cy) - 2) * breathScale

	for (let py = 0; py < height; py++) {
		for (let px = 0; px < width; px++) {
			const nx = ((px - cx) * PIXEL_ASPECT) / (radius * PIXEL_ASPECT)
			const ny = (py - cy) / radius
			const dist2 = nx * nx + ny * ny
			const dist = Math.sqrt(dist2)
			const threshold = BAYER_4x4[py % 4][px % 4]

			const density =
				dist2 <= 1.0
					? sphereDensity(dist2, dist, wavePhase)
					: spikeAt(dist, Math.atan2(ny, nx), spikePhase)

			fb[py * width + px] = density > threshold ? 1 : 0
		}
	}

	if (deviceCount >= 0) {
		applyDigitMask(fb, width, height, deviceCount)
	}
}

// render each font pixel as DIGIT_SCALE x DIGIT_SCALE framebuffer pixels
const DIGIT_SCALE = 2

function clearBlock(fb: Uint8Array, width: number, height: number, bx: number, by: number) {
	for (let sy = 0; sy < DIGIT_SCALE; sy++) {
		for (let sx = 0; sx < DIGIT_SCALE; sx++) {
			const px = bx + sx
			const py = by + sy
			if (px >= 0 && px < width && py >= 0 && py < height) {
				fb[py * width + px] = 0
			}
		}
	}
}

function stampDigit(
	fb: Uint8Array,
	width: number,
	height: number,
	bitmap: number[],
	offsetX: number,
	startY: number,
) {
	for (let row = 0; row < DIGIT_H; row++) {
		for (let col = 0; col < DIGIT_W; col++) {
			if (bitmap[row] & (1 << (4 - col))) {
				clearBlock(fb, width, height, offsetX + col * DIGIT_SCALE, startY + row * DIGIT_SCALE)
			}
		}
	}
}

function applyDigitMask(fb: Uint8Array, width: number, height: number, value: number) {
	const digits = String(value)
	const scaledW = DIGIT_W * DIGIT_SCALE
	const scaledH = DIGIT_H * DIGIT_SCALE
	const scaledSpacing = DIGIT_SCALE
	const totalWidth = digits.length * scaledW + (digits.length - 1) * scaledSpacing
	const startX = Math.floor((width - totalWidth) / 2)
	const startY = Math.floor((height - scaledH) / 2)

	for (let d = 0; d < digits.length; d++) {
		const charCode = digits.charCodeAt(d) - 48
		if (charCode < 0 || charCode > 9) continue
		stampDigit(
			fb,
			width,
			height,
			DIGIT_FONT[charCode],
			startX + d * (scaledW + scaledSpacing),
			startY,
		)
	}
}

function encodeToBraille(fb: Uint8Array, cols: number, rows: number): string[] {
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

// ── component ────────────────────────────────────────────────────────────────

const FONT_SIZE = 12
const LINE_HEIGHT = 14.4
const CHAR_WIDTH = FONT_SIZE * 0.6

// animation speeds (per 200ms tick)
const WAVE_SPEED = 0.15
const BREATH_SPEED = 0.04 // ~8s full cycle
const BREATH_AMOUNT = 0.06 // 6% radius oscillation
const SPIKE_SPEED = 0.08 // slow spike drift

type TextArtOrbProps = Readonly<{
	orbColor: string
	shouldAnimate: boolean
	deviceCount: number
	cols?: number
	rows?: number
	cx?: number
	cy?: number
}>

export function TextArtOrb({
	orbColor,
	shouldAnimate,
	deviceCount,
	cols = 23,
	rows = 19,
	cx = 250,
	cy = 250,
}: TextArtOrbProps) {
	const rowRefs = useRef<(SVGTextElement | null)[]>([])
	const time = useRef(0)
	const reducedMotion = useReducedMotion()

	const fbWidth = cols * 2
	const fbHeight = rows * 4
	const textWidth = cols * CHAR_WIDTH

	const framebuffer = useRef(new Uint8Array(fbWidth * fbHeight))

	// resize framebuffer when dimensions change
	useEffect(() => {
		const size = fbWidth * fbHeight
		if (framebuffer.current.length !== size) {
			framebuffer.current = new Uint8Array(size)
		}
	}, [fbWidth, fbHeight])

	// compute static lines for initial render
	const staticLines = useMemo(() => {
		const fb = new Uint8Array(fbWidth * fbHeight)
		renderFrame(fb, fbWidth, fbHeight, 0, 1.0, 0, -1)
		return encodeToBraille(fb, cols, rows)
	}, [cols, rows, fbWidth, fbHeight])

	// combined animation loop: shimmer + breathing + spikes via content
	useEffect(() => {
		if (!shouldAnimate || reducedMotion) return

		const id = setInterval(() => {
			time.current += 1
			const wavePhase = time.current * WAVE_SPEED
			const breathScale = 1.0 + Math.sin(time.current * BREATH_SPEED) * BREATH_AMOUNT
			const spikePhase = time.current * SPIKE_SPEED

			renderFrame(
				framebuffer.current,
				fbWidth,
				fbHeight,
				wavePhase,
				breathScale,
				spikePhase,
				deviceCount,
			)
			const lines = encodeToBraille(framebuffer.current, cols, rows)

			for (let r = 0; r < rows; r++) {
				const el = rowRefs.current[r]
				if (el && el.textContent !== lines[r]) {
					el.textContent = lines[r]
				}
			}
		}, 200)

		return () => clearInterval(id)
	}, [shouldAnimate, reducedMotion, deviceCount, cols, rows, fbWidth, fbHeight])

	// render static frame when not animating
	useEffect(() => {
		if (shouldAnimate && !reducedMotion) return
		time.current = 0
		renderFrame(framebuffer.current, fbWidth, fbHeight, 0, 1.0, 0, deviceCount)
		const lines = encodeToBraille(framebuffer.current, cols, rows)
		for (let r = 0; r < rows; r++) {
			const el = rowRefs.current[r]
			if (el && el.textContent !== lines[r]) {
				el.textContent = lines[r]
			}
		}
	}, [shouldAnimate, reducedMotion, deviceCount, cols, rows, fbWidth, fbHeight])

	const startY = cy - ((rows - 1) * LINE_HEIGHT) / 2

	return (
		<g aria-hidden="true" filter="url(#phosphor-bloom)">
			{staticLines.map((line, i) => (
				<text
					key={`${cols}-${rows}-${i}`}
					ref={(el) => {
						rowRefs.current[i] = el
					}}
					x={cx - textWidth / 2}
					y={startY + i * LINE_HEIGHT}
					textLength={textWidth}
					lengthAdjust="spacing"
					fill={orbColor}
					style={{
						fontSize: `${FONT_SIZE}px`,
						fontFamily: "'IoskeleyMono', 'BrailleFallback', monospace",
					}}
				>
					{line}
				</text>
			))}
		</g>
	)
}
