import type { DrawingElement, Point } from "./types"
import { getElementBounds } from "./geometry"

/**
 * Clean hand-drawn outlines for shapes, lines and arrows.
 *
 * Every outline is a single stroke made of cubic Bézier segments:
 * - Architect (roughness 0): mathematically exact shapes.
 * - Artist / Cartoonist: each edge gets a gentle, seeded bow (and corners a tiny wobble at
 *   Cartoonist), but corners always meet exactly and ellipses close seamlessly — no doubled
 *   strokes, overshoots or closure spurs.
 *
 * The same geometry drives canvas rendering, hatch-fill clipping and SVG export.
 */

type Cubic = [Point, Point, Point, Point]

export interface ShapeGeometry {
  /** SVG path data for the outline (closed for rectangle/ellipse/diamond). */
  d: string
  closed: boolean
  /** Outline sampled into a polygon (used to generate hatch fills). */
  polygon: Point[]
  /** Arrowhead polyline, drawn solid even on dashed arrows. */
  head?: Point[]
}

// Small, fast, seedable PRNG so a given element always looks the same
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const n = (v: number) => Math.round(v * 100) / 100

function toPathData(segments: Cubic[], closed: boolean) {
  if (segments.length === 0) return ""
  const [start] = segments[0]
  let d = `M${n(start.x)} ${n(start.y)}`
  for (const [, c1, c2, p] of segments) d += ` C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p.x)} ${n(p.y)}`
  return closed ? d + " Z" : d
}

function sample(segments: Cubic[], steps = 8): Point[] {
  const out: Point[] = []
  segments.forEach(([p0, c1, c2, p1], si) => {
    for (let i = si === 0 ? 0 : 1; i <= steps; i++) {
      const t = i / steps
      const u = 1 - t
      out.push({
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
      })
    }
  })
  return out
}

/**
 * A single edge from a to b with a gentle bow. The bow is proportional to the edge length
 * (capped) so long edges look hand-drawn and short ones stay tidy.
 */
function edge(a: Point, b: Point, roughness: number, rand: () => number): Cubic {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (roughness <= 0 || len < 1) {
    return [a, { x: a.x + dx / 3, y: a.y + dy / 3 }, { x: a.x + (2 * dx) / 3, y: a.y + (2 * dy) / 3 }, b]
  }
  const nx = -dy / len
  const ny = dx / len
  const maxBow = Math.min(len * 0.012, 2.2) * roughness
  const bow1 = (rand() * 2 - 1) * maxBow
  // Slightly different bow on each control point gives a natural, uneven curve
  const bow2 = bow1 * (0.6 + rand() * 0.8)
  return [
    a,
    { x: a.x + dx / 3 + nx * bow1, y: a.y + dy / 3 + ny * bow1 },
    { x: a.x + (2 * dx) / 3 + nx * bow2, y: a.y + (2 * dy) / 3 + ny * bow2 },
    b,
  ]
}

function jitter(p: Point, amount: number, rand: () => number): Point {
  if (amount <= 0) return p
  return { x: p.x + (rand() * 2 - 1) * amount, y: p.y + (rand() * 2 - 1) * amount }
}

function polygonOutline(corners: Point[], roughness: number, rand: () => number): Cubic[] {
  // Corners wobble only at Cartoonist level; adjacent edges share the corner, so it stays closed
  const wobble = Math.max(0, roughness - 1) * 1.2
  const pts = corners.map((c) => jitter(c, wobble, rand))
  return pts.map((p, i) => edge(p, pts[(i + 1) % pts.length], roughness, rand))
}

const KAPPA = 0.5522847498 // cubic Bézier approximation of a quarter circle

function ellipseOutline(cx: number, cy: number, rx: number, ry: number, roughness: number, rand: () => number): Cubic[] {
  if (roughness <= 0) {
    const kx = rx * KAPPA
    const ky = ry * KAPPA
    const top = { x: cx, y: cy - ry }
    const right = { x: cx + rx, y: cy }
    const bottom = { x: cx, y: cy + ry }
    const left = { x: cx - rx, y: cy }
    return [
      [top, { x: cx + kx, y: cy - ry }, { x: cx + rx, y: cy - ky }, right],
      [right, { x: cx + rx, y: cy + ky }, { x: cx + kx, y: cy + ry }, bottom],
      [bottom, { x: cx - kx, y: cy + ry }, { x: cx - rx, y: cy + ky }, left],
      [left, { x: cx - rx, y: cy - ky }, { x: cx - kx, y: cy - ry }, top],
    ]
  }

  // Sample the ellipse with a smooth, low-frequency radius wobble, then fit a closed
  // Catmull-Rom spline through the samples. Because the spline wraps around, the end joins
  // the start with matching tangents — no overlap, no gap.
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
  const count = Math.max(12, Math.min(40, Math.round(perimeter / 28)))
  const amp = 0.012 * roughness
  const freq = 2 + Math.floor(rand() * 2)
  const phase = rand() * Math.PI * 2
  const rotate = rand() * Math.PI * 2
  const pts: Point[] = []
  for (let i = 0; i < count; i++) {
    const t = rotate + (i / count) * Math.PI * 2
    const f = 1 + amp * Math.sin(freq * t + phase) + (rand() * 2 - 1) * amp * 0.25
    pts.push({ x: cx + Math.cos(t) * rx * f, y: cy + Math.sin(t) * ry * f })
  }
  const segs: Cubic[] = []
  for (let i = 0; i < count; i++) {
    const p0 = pts[(i - 1 + count) % count]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % count]
    const p3 = pts[(i + 2) % count]
    segs.push([
      p1,
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    ])
  }
  return segs
}

function arrowHeadFor(tip: Point, from: Point, strokeWidth: number, length: number): Point[] | undefined {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  if (Math.hypot(dx, dy) < 0.01 || length < 1) return undefined
  const angle = Math.atan2(dy, dx)
  const head = Math.min(12 + strokeWidth * 3, length * 0.5)
  const spread = Math.PI / 7
  return [
    { x: tip.x - head * Math.cos(angle - spread), y: tip.y - head * Math.sin(angle - spread) },
    tip,
    { x: tip.x - head * Math.cos(angle + spread), y: tip.y - head * Math.sin(angle + spread) },
  ]
}

const cache = new WeakMap<DrawingElement, ShapeGeometry>()

export function getShapeGeometry(el: DrawingElement): ShapeGeometry {
  const cached = cache.get(el)
  if (cached) return cached

  const rand = mulberry32(el.seed)
  const r = Math.max(0, el.roughness)
  const b = getElementBounds(el)
  let segments: Cubic[] = []
  let closed = true
  let head: Point[] | undefined

  switch (el.type) {
    case "rectangle":
      segments = polygonOutline(
        [
          { x: b.minX, y: b.minY },
          { x: b.maxX, y: b.minY },
          { x: b.maxX, y: b.maxY },
          { x: b.minX, y: b.maxY },
        ],
        r,
        rand,
      )
      break
    case "diamond": {
      const cx = (b.minX + b.maxX) / 2
      const cy = (b.minY + b.maxY) / 2
      segments = polygonOutline(
        [
          { x: cx, y: b.minY },
          { x: b.maxX, y: cy },
          { x: cx, y: b.maxY },
          { x: b.minX, y: cy },
        ],
        r,
        rand,
      )
      break
    }
    case "ellipse":
      segments = ellipseOutline(
        (b.minX + b.maxX) / 2,
        (b.minY + b.maxY) / 2,
        (b.maxX - b.minX) / 2,
        (b.maxY - b.minY) / 2,
        r,
        rand,
      )
      break
    case "line":
    case "arrow": {
      closed = false
      const start = { x: el.x1, y: el.y1 }
      const end = { x: el.x2, y: el.y2 }
      const seg = edge(start, end, r, rand)
      segments = [seg]
      if (el.type === "arrow") {
        // Point the head along the curve's final tangent so it lines up with a bowed shaft
        const from = Math.hypot(seg[2].x - end.x, seg[2].y - end.y) > 0.5 ? seg[2] : start
        head = arrowHeadFor(end, from, el.strokeWidth, Math.hypot(end.x - start.x, end.y - start.y))
      }
      break
    }
  }

  const geometry: ShapeGeometry = { d: toPathData(segments, closed), closed, polygon: sample(segments), head }
  cache.set(el, geometry)
  return geometry
}

export function headPathData(head: Point[]) {
  return head.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`).join(" ")
}
