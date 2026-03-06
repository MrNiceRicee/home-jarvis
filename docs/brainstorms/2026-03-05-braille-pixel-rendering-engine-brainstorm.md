# Braille Pixel Rendering Engine — Deep Dive

**Date:** 2026-03-05
**Status:** Complete
**Context:** Rendering engine for the Matter orbital text-art orb
**Supersedes:** Tier-based character selection approach from the HAL eye plan

## The Shift: Tiers to Pixels

The original plan used a **tier-based** approach: classify each character cell by distance, pick a pre-categorized braille character from a density pool, use directional scoring to bias dot positions toward center.

This deep dive explores a **pixel-level** approach instead: treat the entire braille grid as a framebuffer where each dot is an individually addressable pixel. Render a sphere to this framebuffer using standard graphics techniques (distance fields, dithering), then encode each 2x4 pixel block into its corresponding braille codepoint.

Why pixel-level is better for stippling:
- Sub-character resolution: 34x60 pixels vs 17x15 characters
- Pixel-accurate sphere boundary (smooth silhouette, not stair-stepped)
- Continuous density gradient (not quantized to 5 tiers)
- Animation is smoother — individual dots flicker, not whole characters jumping between tiers
- No character pools, no directional scoring algorithm — the math handles everything
- Extensible — same pipeline could render any shape, not just spheres

---

## Braille as a Framebuffer

### The 2x4 Dot Matrix

Each Unicode braille character (U+2800 to U+28FF) encodes a 2-column x 4-row dot grid. The 8 dot positions map to bits:

```
Visual layout:        Dot numbers:       Bit positions:
+-------+            +-------+           +-------+
| .   . |            | 1   4 |           | b0  b3 |
| .   . |            | 2   5 |           | b1  b4 |
| .   . |            | 3   6 |           | b2  b5 |
| .   . |            | 7   8 |           | b6  b7 |
+-------+            +-------+           +-------+
```

Codepoint = `0x2800 + bitfield` where each raised dot contributes its bit weight.

**Critical detail:** the numbering is column-first (top-to-bottom, left-to-right) EXCEPT dots 7 and 8 which are the bottom row. This is the historical braille standard — the bottom row was added later (8-dot braille vs original 6-dot).

### Pixel-to-Bit Lookup Table

For a pixel at position (x, y) within a 2x4 cell, the bit weight is:

```ts
//                  y=0    y=1    y=2    y=3
const PIXEL_BIT = [
  /* x=0 */      [0x01,  0x02,  0x04,  0x40],
  /* x=1 */      [0x08,  0x10,  0x20,  0x80],
]
```

Or as a flat row-major array indexed by `y * 2 + x`:

```ts
const DOT_WEIGHT = [
  0x01, 0x08,   // row 0: dots 1, 4
  0x02, 0x10,   // row 1: dots 2, 5
  0x04, 0x20,   // row 2: dots 3, 6
  0x40, 0x80,   // row 3: dots 7, 8
]
```

This is the entire encoding. No lookup tables of 256 characters, no tier pools, no directional scoring. Just 8 bit weights.

### Framebuffer Dimensions

For a 17-column x 15-row character grid:

```
Pixel width  = 17 cols x 2 dots/col = 34 pixels
Pixel height = 15 rows x 4 dots/row = 60 pixels
Total pixels = 2,040
```

That's our canvas. A `Uint8Array(2040)` where each element is 0 (dot off) or 1 (dot on).

### Encoding: Framebuffer to Braille Strings

```ts
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
      line += String.fromCodePoint(0x2800 + code)
    }
    lines.push(line)
  }

  return lines
}
```

15 rows of 17 characters each. 255 total characters. Each character is the exact braille glyph that represents the 2x4 pixel block at that position.

---

## Pixel Aspect Ratio

### Why This Matters

Braille characters in monospace fonts are taller than wide. If we render a circle in pixel-space without correction, it'll look like a tall oval on screen.

### The Math

For SVG `<text>` at `fontSize` with `lineHeight` spacing between rows:

```
char_width   ~= fontSize * 0.6     (monospace advance width)
line_height  = y-spacing between <text> elements (we control this)

dot_width    = char_width / 2
dot_height   = line_height / 4
pixel_aspect = dot_width / dot_height = (char_width * 4) / (line_height * 2)
```

If we set `lineHeight = fontSize * 1.2` (common default):
```
pixel_aspect = (0.6 * 4) / (1.2 * 2) = 2.4 / 2.4 = 1.0  -- square pixels!
```

If we use tighter spacing, `lineHeight = fontSize * 1.0`:
```
pixel_aspect = (0.6 * 4) / (1.0 * 2) = 2.4 / 2.0 = 1.2  -- wider than tall
```

**Key insight: we can tune the SVG `<text>` y-spacing to make braille dots approximately square.** At `fontSize * 1.2` line spacing, pixels are square and no aspect correction is needed in the sphere math.

### Implementation

```ts
const FONT_SIZE = 5.5    // px — sweet spot: reads as texture, not glyphs
const LINE_HEIGHT = 6.6  // px — fontSize * 1.2, makes dots approximately square
const LETTER_SPACING = 0 // px — start at 0, tune if dots look horizontally gapped
```

letter-spacing affects horizontal dot pitch. At 0, the character advance width governs dot spacing. If the font's braille dots don't fill the character cell width, we might need negative letter-spacing to close horizontal gaps, or positive to match vertical spacing. Tune empirically.

**Fallback if pixels aren't square:** add a single correction constant:

```ts
const PIXEL_ASPECT = 1.0  // tune empirically: > 1 means pixels are wider than tall
// in sphere rendering:
const nx = (px - centerX) * PIXEL_ASPECT / radius
const ny = (py - centerY) / radius
```

---

## Sphere Rendering

### Distance Field Approach

For each pixel, compute distance from sphere center. Pixels inside the sphere get a density value based on Lambert shading (surface normal z-component). Pixels outside are off.

```ts
function renderSphere(
  fb: Uint8Array,
  width: number,       // 34
  height: number,      // 60
  phase: number,       // wave animation phase
) {
  const cx = (width - 1) / 2     // 16.5
  const cy = (height - 1) / 2    // 29.5
  const radius = Math.min(cx, cy) - 1  // ~15.5, leaves 1px margin

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // normalize to unit sphere coordinates
      const nx = (px - cx) / radius
      const ny = (py - cy) / radius
      const dist2 = nx * nx + ny * ny

      if (dist2 > 1.0) {
        fb[py * width + px] = 0
        continue
      }

      // sphere surface normal z-component (facing camera = 1.0, edge = 0.0)
      const nz = Math.sqrt(1.0 - dist2)
      const dist = Math.sqrt(dist2)

      // base density: Lambert cosine law — nz is the dot product of
      // surface normal with view direction (0,0,1)
      let density = nz

      // radial wave modulation (shimmer)
      const wave = Math.sin(dist * Math.PI * 3 - phase)
      density += wave * 0.12 * dist  // edges shimmer more, center stays solid

      // stipple threshold (dithering)
      const threshold = ditherThreshold(px, py)

      fb[py * width + px] = density > threshold ? 1 : 0
    }
  }
}
```

The `nz` value IS the density gradient:
- Center of sphere: `nz = 1.0` (surface faces camera directly) — almost all dots on
- Mid-ring: `nz ~ 0.7` — ~70% of dots on
- Edge of sphere: `nz -> 0.0` (surface faces sideways) — very few dots on
- Outside: no dots

This naturally produces the stippled sphere effect. Dense center, sparse edges, smooth falloff. No tiers needed.

### Why Lambert Shading Works for Stippling

In traditional stippling (pen-and-ink illustration), dot density encodes perceived brightness. Lambert's cosine law gives us exactly the right density gradient for a sphere — it's what human artists use intuitively when stippling a sphere by hand. The math matches the visual intuition.

The density value (0.0 to 1.0) maps directly to the probability that a pixel should be "on". A dithering algorithm converts this continuous value to binary (on/off) while maintaining the visual density.

---

## Dithering: Turning Density into Dots

### Option 1: Bayer Ordered Dithering

Classic CRT/retro aesthetic. The regular pattern reads as "electronic" and "deliberate."

```ts
// 4x4 Bayer threshold matrix (normalized to 0..1)
const BAYER_4x4 = [
  [ 0/16,  8/16,  2/16, 10/16],
  [12/16,  4/16, 14/16,  6/16],
  [ 3/16, 11/16,  1/16,  9/16],
  [15/16,  7/16, 13/16,  5/16],
]

function ditherThreshold(px: number, py: number): number {
  return BAYER_4x4[py % 4][px % 4]
}
```

**Pros:** very CRT — produces visible regular patterns at mid-densities. Fits the mission control aesthetic.
**Cons:** can create visible banding on smooth gradients. The 4x4 matrix only has 16 threshold levels.

For our 34x60 canvas, the 4x4 matrix tiles 8.5 x 15 times. The pattern would be visible. Could use 8x8 Bayer for finer thresholds (64 levels).

### Option 2: Hash-Based (Pseudo-Random)

Organic, stipple-like. Each pixel gets a unique-ish threshold.

```ts
function ditherThreshold(px: number, py: number): number {
  // integer hash — fast, deterministic, good distribution
  let h = px * 374761393 + py * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  h = h ^ (h >> 16)
  return (h & 0xFFFF) / 0x10000
}
```

**Pros:** organic stipple look, no visible patterns, every frame is deterministic (same px,py always gives same threshold).
**Cons:** can look noisy at mid-densities. Might read as "TV static" at the sphere equator.

### Option 3: Blue Noise (Pre-Computed)

Best visual quality for stippling — maximally uniform dot distribution at any density level. Used in professional halftoning.

For a 34x60 canvas, we'd need a pre-computed 34x60 blue noise texture (or tile a smaller one). This is a 2KB array — trivial to embed.

```ts
// pre-computed blue noise texture, values 0..255
// can generate with: https://github.com/MomentsInGraphics/BlueNoise
const BLUE_NOISE_34x60: Uint8Array = new Uint8Array([...])

function ditherThreshold(px: number, py: number): number {
  return BLUE_NOISE_34x60[py * 34 + px] / 255
}
```

**Pros:** best stipple quality — dots are evenly spaced at every density level. Natural, hand-drawn feel.
**Cons:** requires embedding a texture. Overkill? At 5.5px font size, the dots are so small that the difference between hash-based and blue noise might be invisible.

### Recommendation: Bayer 4x4

For the retro CRT aesthetic, Bayer is the right choice:
1. The regular pattern reads as "deliberate electronic display," not "random noise"
2. At 5.5px font size, the individual pattern repetitions are nearly invisible
3. Zero memory overhead — 16 constants
4. The pattern creates subtle moire interference with the braille grid itself — this is a feature, not a bug. It produces the kind of interference patterns you see on real CRT phosphor screens.
5. If banding is visible, upgrade to 8x8 Bayer (64 thresholds) — still just 64 constants

If Bayer looks too mechanical after visual testing, switch to hash-based. It's a one-function swap.

---

## Radial Wave Shimmer (Pixel-Level)

### How It Works

The wave modulates the density threshold at each pixel. As the wave phase advances, a ring of density change propagates outward from center. Pixels near the density boundary flip between on/off as the wave passes through.

```ts
// in renderSphere, the wave calculation:
const wave = Math.sin(dist * Math.PI * RIPPLE_COUNT - phase)
density += wave * WAVE_AMPLITUDE * dist
```

Parameters to tune:

| Parameter | Value | Effect |
|-----------|-------|--------|
| `RIPPLE_COUNT` | 2-4 | visible concentric rings at any moment |
| `WAVE_AMPLITUDE` | 0.08-0.15 | how much density shifts (too high = flashing) |
| `dist` multiplier | built-in | edges shimmer more than center |
| Phase increment | 0.12-0.18 per tick | wave propagation speed |
| Tick interval | 200ms | update rate |

### Why `* dist`?

The `wave * amplitude * dist` term means:
- At center (dist=0): zero modulation — solid core never flickers
- At mid-ring (dist=0.5): moderate shimmer
- At edge (dist=1.0): maximum shimmer

This is critical. The solid core anchors the visual. If the center flickered, the orb would look unstable/broken. The edges shimmer because they're at the density boundary where small changes flip pixels.

### Visible Behavior

With `RIPPLE_COUNT = 3`:
- 3 concentric wave rings visible at any moment
- Each ring is a band where pixels are slightly denser or sparser than rest state
- Rings propagate outward at ~1 ring per second (at 200ms ticks with 0.15 phase increment)
- At the sphere edge, the wavefront causes dots to appear/disappear — the "feathered halo shimmers"
- At mid-ring, dots redistribute — some turn on as neighbors turn off — "plasma surface ripple"

### Phase Increment Math

```
phase_per_tick = 0.15
ticks_per_second = 5 (200ms interval)
phase_per_second = 0.75 radians

time_for_full_cycle = 2*PI / 0.75 = 8.38 seconds
```

One complete wave cycle takes ~8.4 seconds. With 3 visible ripples, a new wavefront appears every ~2.8 seconds. This is slow enough to read as "breathing surface" rather than "vibrating."

---

## The Full Rendering Pipeline

### At Module Load (Once)

```ts
const COLS = 17
const ROWS = 15
const FB_WIDTH = COLS * 2   // 34
const FB_HEIGHT = ROWS * 4  // 60

const PIXEL_BIT: number[][] = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]

const BAYER_4x4 = [
  [ 0/16,  8/16,  2/16, 10/16],
  [12/16,  4/16, 14/16,  6/16],
  [ 3/16, 11/16,  1/16,  9/16],
  [15/16,  7/16, 13/16,  5/16],
]
```

### Per Animation Tick (Every 200ms)

```
1. Advance wavePhase.current += 0.15
2. renderSphere(framebuffer, FB_WIDTH, FB_HEIGHT, wavePhase.current)
   - for each pixel: distance -> density -> wave modulation -> dither -> on/off
3. encodeToBraille(framebuffer, COLS, ROWS)
   - read 2x4 blocks -> bit-pack -> codepoints -> 15 strings
4. for each row, set rowRefs.current[i].textContent = lines[i]
   - direct DOM mutation, no React
```

### Performance Budget

Per tick at 200ms interval:

| Step | Operations | Estimated Time |
|------|-----------|----------------|
| Sphere render | 2,040 pixels x (sqrt + sin + compare) | ~0.3ms |
| Braille encode | 255 chars x 8 bit lookups | ~0.05ms |
| String building | 15 strings of 17 chars | ~0.02ms |
| DOM mutation | 15 textContent assignments | ~0.1ms |
| **Total** | | **~0.5ms** |

Well under the 200ms tick budget. Well under a single 16.7ms frame. Could run at 60fps if we wanted (we don't).

---

## Static Frame (No Animation)

When `shouldAnimate` is false (bridge not running) or `reducedMotion` is true, render a single static frame with `phase = 0`:

```ts
// render once, cache the result
const STATIC_LINES = (() => {
  const fb = new Uint8Array(FB_WIDTH * FB_HEIGHT)
  renderSphere(fb, FB_WIDTH, FB_HEIGHT, 0)
  return encodeToBraille(fb, COLS, ROWS)
})()
```

The static orb still has the stippled sphere appearance — dense center, sparse edges. It just doesn't shimmer.

---

## Concrete Example: What the Output Looks Like

For a small example, a 9x5 character grid (18x20 pixel framebuffer) with a centered sphere:

```
Row  0:  ⠀⠀⠀⠀⣀⠀⠀⠀⠀     (barely anything — top of sphere)
Row  1:  ⠀⠀⣠⣾⣿⣷⣄⠀⠀     (mid-density slopes up)
Row  2:  ⠀⣰⣿⣿⣿⣿⣿⣆⠀     (dense center band)
Row  3:  ⠀⠀⠛⠿⣿⠿⠛⠀⠀     (mid-density slopes down)
Row  4:  ⠀⠀⠀⠀⠉⠀⠀⠀⠀     (barely anything — bottom of sphere)
```

(Approximate — actual output depends on dither pattern and sphere radius.)

At 17x15 with proper Lambert shading and Bayer dithering, the sphere would have:
- ~3 rows of sparse dots at top and bottom (polar caps)
- ~4 rows of increasing density (polar-to-equator transition)
- ~1-2 rows of near-solid center (equator facing camera)
- Smooth left/right falloff within each row (sphere curvature)
- Blank braille (`U+2800`) outside the sphere radius

The Bayer dithering creates a subtle regular texture within the density gradient — at 5.5px, this reads as phosphor grain, not as a visible grid.

---

## Advanced: Lighting Variations

The Lambert model (`density = nz`) assumes a head-on light source (light coming from camera direction). We could shift the light source for more dramatic shading:

```ts
// light from upper-right
const lightDir = { x: 0.4, y: -0.3, z: 0.87 }  // normalized
const nz = Math.sqrt(1.0 - dist2)
const nx_sphere = nx  // surface normal x
const ny_sphere = ny  // surface normal y
const density = Math.max(0, nx_sphere * lightDir.x + ny_sphere * lightDir.y + nz * lightDir.z)
```

This would make one side of the sphere denser (lit) and the other sparser (shadow). Classic sphere lighting.

**Not recommended for v1.** Head-on lighting (density = nz) produces a symmetric orb that looks like a status indicator. Directional lighting makes it look like a 3D render, which fights the flat CRT aesthetic. Save for later if we want the orb to "respond" to something by shifting its light.

---

## Edge Cases and Gotchas

### 1. Blank Braille vs Space Character

`U+2800` (blank braille, `⠀`) is NOT the same as a space character (`U+0020`). In monospace fonts, both are the same width, but:
- Space might collapse in some SVG text rendering
- Blank braille is explicitly part of the braille block and always renders at the correct width
- Use `U+2800` for all "empty" cells to maintain grid alignment

### 2. Font Coverage

Not all fonts have complete braille coverage (U+2800-U+28FF). The BrailleFallback font-family stack handles this:
```css
font-family: 'IoskeleyMono', 'DejaVu Sans', 'Segoe UI Symbol', 'Apple Braille', monospace;
```

All 256 braille patterns are in the Unicode standard. DejaVu Sans and system fonts cover them. The key concern is that all 256 render at the same character width (monospace alignment). In a monospace font, they do.

### 3. Framebuffer Reuse

Allocate the `Uint8Array` once and reuse it across ticks. Don't create a new array every 200ms:

```ts
const framebuffer = useRef(new Uint8Array(FB_WIDTH * FB_HEIGHT))
```

Clear it at the start of each render (or let `renderSphere` overwrite all values — it writes to every pixel, so no explicit clear needed).

### 4. String.fromCodePoint Performance

`String.fromCodePoint` is called 255 times per tick. This is fine — V8 optimizes it. But if we want to be paranoid, pre-compute a 256-entry lookup table:

```ts
const BRAILLE_CHARS = Array.from({ length: 256 }, (_, i) =>
  String.fromCodePoint(0x2800 + i)
)
// then: BRAILLE_CHARS[code] instead of String.fromCodePoint(0x2800 + code)
```

This turns a function call into an array index. Unlikely to matter at 255 calls per 200ms, but it's free to do.

### 5. Sphere Radius vs Grid Size

The sphere radius in pixel-space determines how much of the character grid is filled:

```ts
const radius = Math.min(cx, cy) - 1  // ~15.5 for 34x60, minus margin
```

This fills the narrow dimension (width = 34, so radius = 16). The sphere spans ~32 of 34 horizontal pixels and ~32 of 60 vertical pixels. That's the full width but only the middle 53% of height.

On screen, with approximately square pixels, this renders as a circle (not oval). The top and bottom of the character grid are empty braille — vertical padding that disappears into the dark background.

If we want the sphere to fill more of the vertical space (making it an oval that appears circular due to character aspect ratio), we'd use non-square pixels. But with `lineHeight = fontSize * 1.2`, square pixels and a width-filling radius should produce a circle.

### 6. Even vs Odd Grid Dimensions

17 columns (odd) and 15 rows (odd) mean the center pixel is at (16, 29) in a 34x60 grid — that's a real pixel, not between pixels. This avoids the half-pixel center problem that produces asymmetric spheres.

However, `(width-1)/2 = 16.5` and `(height-1)/2 = 29.5`. The center is between pixels. This is fine — the sphere will be symmetric because the distance calculation uses floating-point coordinates. No pixel sits exactly at center, but the two pixels flanking center get nearly identical density values.

---

## Comparison: Pixel-Level vs Tier-Based

| Aspect | Tier-Based (old plan) | Pixel-Level (this approach) |
|--------|----------------------|----------------------------|
| Resolution | 17x15 character cells | 34x60 pixel dots |
| Sphere boundary | Stair-stepped at character level | Smooth at dot level |
| Density gradient | 5 discrete tiers | Continuous (Lambert) |
| Edge feathering | Directional character scoring | Natural from dithering |
| Animation | Swap between tier pools | Modulate density per-pixel |
| Code complexity | Character pools + scoring + tier maps | Distance field + dither (standard graphics) |
| Pre-computation | CELL_MAP with pools per cell | PIXEL_BIT (8 constants) |
| Extensibility | Sphere-specific | Any shape (just change distance function) |

The pixel-level approach is simpler in concept (it's just a tiny rasterizer) and produces better results. The tier-based approach was a solution for "how do we pick braille characters" — the pixel approach dissolves the question entirely by working at the dot level.

---

## Open Questions

1. **Dither choice**: Start with Bayer 4x4. If it looks too mechanical, try hash-based. If neither works, embed a small blue noise texture. One-function swap.

2. **Line height tuning**: Start with `fontSize * 1.2` for square pixels. If the sphere looks oval, adjust the `PIXEL_ASPECT` constant. This is an empirical tuning step.

3. **Phosphor bloom**: The plan includes a double-feGaussianBlur SVG filter. The stipple density alone might carry enough visual weight without it. Try without first — add bloom only if the orb looks flat. Bloom softens the individual dots, which could undermine the pixel-art crispness.

4. **Sub-pixel density**: Instead of binary on/off, could we use partial density? No — braille dots are binary. But we could use temporal dithering: a pixel that's "50% on" could alternate between on and off across ticks. This would effectively double the density resolution through persistence of vision. Might be too subtle at 200ms ticks. Worth trying if the static frame looks banded.

5. **Wave shape**: `sin` produces symmetric waves. A `sin` with a sharp positive peak and gradual negative trough would produce a "pulse" wave — bright rings propagating outward with gentle dimming between them. Try `Math.pow(Math.sin(...), 3)` or a custom curve if the basic sin looks too uniform.
