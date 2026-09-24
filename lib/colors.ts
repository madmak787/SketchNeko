/**
 * Dark-mode color adaptation for the canvas.
 *
 * Elements always store their light-theme colors (so exports and files look the same
 * everywhere). When rendering in dark mode we invert each color's lightness while keeping
 * its hue and saturation: near-black ink becomes near-white, pastel fills become deep
 * tones, and saturated colors stay recognizable. Images are never adapted.
 */

const cache = new Map<string, string>()

function parseHex(color: string): [number, number, number] | null {
  let hex = color.trim().replace(/^#/, "")
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c)
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h /= 6
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number) {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r = l
  let g = l
  let b = l
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")
}

export function adaptColor(color: string, dark: boolean): string {
  if (!dark || color === "transparent") return color
  const cached = cache.get(color)
  if (cached) return cached
  const rgb = parseHex(color)
  if (!rgb) return color
  const [h, s, l] = rgbToHsl(...rgb)
  // Invert lightness into [0.2, 0.9] so pastel fills stay visible against the dark canvas
  // and dark ink becomes a soft (not pure) white
  const out = hslToHex(h, s * 0.9, 0.2 + 0.7 * (1 - l))
  cache.set(color, out)
  return out
}
