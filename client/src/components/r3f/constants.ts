// panel dimensions (Three.js units)
export const PANEL_WIDTH = 2.4
export const PANEL_HEIGHT = 1.6
export const PANEL_DEPTH = 0.08
export const PANEL_RADIUS = 0.04
export const PANEL_GAP = 0.25

// section filler is half-height
export const FILLER_HEIGHT = 0.6

// screw positions relative to panel center
export const SCREW_RADIUS = 0.03
export const SCREW_OFFSETS: [number, number][] = [
	[-PANEL_WIDTH / 2 + 0.12, PANEL_HEIGHT / 2 - 0.12],
	[PANEL_WIDTH / 2 - 0.12, PANEL_HEIGHT / 2 - 0.12],
	[-PANEL_WIDTH / 2 + 0.12, -PANEL_HEIGHT / 2 + 0.12],
	[PANEL_WIDTH / 2 - 0.12, -PANEL_HEIGHT / 2 + 0.12],
]

// display window
export const DISPLAY_INSET = 0.02

// colors
export const COLORS = {
	chassis: '#c4a265',
	displayBg: '#0d0d0d',
	activeAmber: '#f5a623',
	powerGreen: '#4ade80',
	textCream: '#faf0dc',
	textEtched: '#8a7e6b',
	sceneBg: '#1a1612',
	knobGunmetal: '#3a3a3a',
	utilityDarker: '#a08850',
} as const

// fonts
export const FONT_MICHROMA = '/fonts/Michroma-Regular.ttf'
export const FONT_DSEG7 = '/fonts/DSEG7Classic-Regular.ttf'
export const CHARS_LABEL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-_%/:°'
export const CHARS_READOUT = '0123456789.-:°% '

// spring presets
export const SPRING = {
	snappy: { stiffness: 300, damping: 30, mass: 1 },
	gentle: { stiffness: 120, damping: 26, mass: 1.5 },
	microBounce: { stiffness: 250, damping: 16, mass: 0.8 },
	springyLift: { stiffness: 200, damping: 12, mass: 0.6 },
} as const
