import rough from "roughjs"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughCanvas } from "roughjs/bin/canvas"
import type { Bounds, DrawingElement, Point } from "./types"
import { buildFont, LINE_HEIGHT } from "./fonts"
import { adaptColor } from "./colors"
import { getShapeGeometry, headPathData } from "./shapes"
import { boundsIntersect, getElementBounds, getHandles, HANDLE_SIZE, isLinear } from "./geometry"

export const SELECTION_COLOR = "#7c5cff"

const generator = rough.generator()

// ---------------------------------------------------------------------------
// Shapes: clean hand-drawn outlines (lib/shapes.ts) + rough.js hatch fills.
// Fills are cached per element object — elements are immutable, so a changed
// element is a new object and gets regenerated automatically.
// ---------------------------------------------------------------------------

// Separate caches per theme, since drawables bake in their colors
const fillCache = { light: new WeakMap<DrawingElement, Drawable | null>(), dark: new WeakMap<DrawingElement, Drawable | null>() }
const pathCache = new WeakMap<DrawingElement, { outline: Path2D; head: Path2D | null }>()

export function getDashArray(el: DrawingElement): number[] | undefined {
  if (el.strokeStyle === "dashed") return [8 + el.strokeWidth * 1.5, 6 + el.strokeWidth * 1.5]
  if (el.strokeStyle === "dotted") return [1.5, 5 + el.strokeWidth * 1.5]
  return undefined
}

/** Hatched / cross-hatched fill for a shape, or null for solid/no fill. */
export function getHatchFill(el: DrawingElement, dark = false): Drawable | null {
  if (el.backgroundColor === "transparent" || el.fillStyle === "solid") return null
  const cache = dark ? fillCache.dark : fillCache.light
  const cached = cache.get(el)
  if (cached !== undefined) return cached

  const { polygon } = getShapeGeometry(el)
  const options: Options = {
    seed: el.seed,
    // Hatch lines stay lightly sketchy but never scribbly
    roughness: Math.min(el.roughness, 1) * 0.7,
    bowing: 0.5,
    stroke: "none",
    fill: adaptColor(el.backgroundColor, dark),
    fillStyle: el.fillStyle,
    fillWeight: Math.max(0.5, el.strokeWidth / 2),
    hachureGap: 4 + el.strokeWidth * 2,
    disableMultiStrokeFill: true,
  }
  const drawable = polygon.length > 2 ? generator.polygon(polygon.map((p) => [p.x, p.y] as [number, number]), options) : null
  cache.set(el, drawable)
  return drawable
}

function getShapePaths(el: DrawingElement) {
  let paths = pathCache.get(el)
  if (!paths) {
    const g = getShapeGeometry(el)
    paths = { outline: new Path2D(g.d), head: g.head ? new Path2D(headPathData(g.head)) : null }
    pathCache.set(el, paths)
  }
  return paths
}

function drawShape(ctx: CanvasRenderingContext2D, rc: RoughCanvas, el: DrawingElement, dark: boolean) {
  const { outline, head } = getShapePaths(el)
  const closed = el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond"

  if (closed && el.backgroundColor !== "transparent") {
    if (el.fillStyle === "solid") {
      ctx.fillStyle = adaptColor(el.backgroundColor, dark)
      ctx.fill(outline)
    } else {
      const hatch = getHatchFill(el, dark)
      if (hatch) {
        // Clip so hatch lines never poke outside the outline
        ctx.save()
        ctx.clip(outline)
        rc.draw(hatch)
        ctx.restore()
      }
    }
  }

  ctx.strokeStyle = adaptColor(el.strokeColor, dark)
  ctx.lineWidth = el.strokeWidth
  ctx.setLineDash(getDashArray(el) ?? [])
  ctx.stroke(outline)
  if (head) {
    // Arrowheads are always solid so they stay legible on dashed/dotted arrows
    ctx.setLineDash([])
    ctx.stroke(head)
  }
}

// ---------------------------------------------------------------------------
// Freehand strokes
// ---------------------------------------------------------------------------

function catmullRom(points: Point[]): Point[] {
  if (points.length < 3) return points.slice()
  const out: Point[] = []
  const pts = [points[0], ...points, points[points.length - 1]]
  for (let i = 0; i < pts.length - 3; i++) {
    const [p0, p1, p2, p3] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]]
    // Adaptive subdivision: long segments get more samples, tiny ones get none
    const segments = Math.max(1, Math.min(8, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3)))
    for (let j = 0; j < segments; j++) {
      const t = j / segments
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      const pr = (p: Point) => p.pressure ?? 0.5
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), pressure: f(pr(p0), pr(p1), pr(p2), pr(p3)) })
    }
  }
  out.push(points[points.length - 1])
  return out
}

function pressureWidth(pressure: number | undefined, base: number) {
  const p = Math.max(0.05, Math.min(1, pressure ?? 0.5))
  return Math.max(0.5, base * (0.4 + 1.4 * Math.pow(p, 0.7)))
}

/**
 * Geometry for a freehand stroke. Mouse/touch strokes are a smoothed centerline stroked at
 * constant width; pen strokes (with real pressure) become a filled variable-width outline.
 * Either way the stroke is a single path, so opacity doesn't double up where it overlaps.
 */
export function getPencilGeometry(el: DrawingElement): { kind: "stroke" | "fill"; points: Point[] } {
  const raw = el.points ?? []
  if (raw.length === 0) return { kind: "stroke", points: [{ x: el.x1, y: el.y1 }] }
  const smooth = catmullRom(raw)
  const hasPressure = raw.some((p) => p.pressure !== undefined)
  if (!hasPressure || el.strokeStyle !== "solid" || smooth.length < 2) return { kind: "stroke", points: smooth }

  const left: Point[] = []
  const right: Point[] = []
  const normals: Point[] = []
  for (let i = 0; i < smooth.length; i++) {
    const prev = smooth[Math.max(0, i - 1)]
    const next = smooth[Math.min(smooth.length - 1, i + 1)]
    let dx = next.x - prev.x
    let dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const n = { x: -dy, y: dx }
    normals.push(n)
    const r = pressureWidth(smooth[i].pressure, el.strokeWidth) / 2
    left.push({ x: smooth[i].x + n.x * r, y: smooth[i].y + n.y * r })
    right.push({ x: smooth[i].x - n.x * r, y: smooth[i].y - n.y * r })
  }

  const cap = (center: Point, n: Point, r: number, start: boolean): Point[] => {
    const base = Math.atan2(n.y, n.x)
    const pts: Point[] = []
    for (let k = 1; k < 8; k++) {
      const a = start ? base + Math.PI + (Math.PI * k) / 8 : base - (Math.PI * k) / 8
      pts.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r })
    }
    return pts
  }
  const last = smooth.length - 1
  const outline = [
    ...left,
    ...cap(smooth[last], normals[last], pressureWidth(smooth[last].pressure, el.strokeWidth) / 2, false),
    ...right.reverse(),
    ...cap(smooth[0], normals[0], pressureWidth(smooth[0].pressure, el.strokeWidth) / 2, true),
  ]
  return { kind: "fill", points: outline }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>()
let onImageLoaded: (() => void) | null = null

/** Register a callback to re-render once an image finishes decoding. */
export function setImageLoadListener(fn: (() => void) | null) {
  onImageLoaded = fn
}

export function getImage(src: string): HTMLImageElement | null {
  let img = imageCache.get(src)
  if (!img) {
    img = new Image()
    img.onload = () => onImageLoaded?.()
    img.src = src
    imageCache.set(src, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

// ---------------------------------------------------------------------------
// Element rendering
// ---------------------------------------------------------------------------

export function drawElement(ctx: CanvasRenderingContext2D, rc: RoughCanvas, el: DrawingElement, dark = false) {
  const color = adaptColor(el.strokeColor, dark)
  ctx.save()
  ctx.globalAlpha *= Math.max(0, Math.min(1, el.opacity / 100))
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  switch (el.type) {
    case "pencil": {
      const geo = getPencilGeometry(el)
      ctx.beginPath()
      geo.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      if (geo.kind === "fill") {
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
      } else {
        if (geo.points.length === 1) ctx.lineTo(geo.points[0].x + 0.01, geo.points[0].y) // draw a dot
        ctx.strokeStyle = color
        ctx.lineWidth = el.strokeWidth
        ctx.setLineDash(getDashArray(el) ?? [])
        ctx.stroke()
      }
      break
    }

    case "text": {
      if (!el.text) break
      const fontSize = el.fontSize ?? 20
      ctx.font = buildFont(fontSize, el.fontFamily, el.fontWeight, el.fontStyle)
      ctx.fillStyle = color
      ctx.textBaseline = "alphabetic"
      const lineHeight = fontSize * LINE_HEIGHT
      // Position the baseline the way CSS does (half-leading around ascent+descent) so the
      // canvas rendering lines up exactly with the DOM text editor.
      const m = ctx.measureText("Hg")
      const ascent = m.fontBoundingBoxAscent ?? fontSize * 0.8
      const descent = m.fontBoundingBoxDescent ?? fontSize * 0.2
      const baseline = (lineHeight - (ascent + descent)) / 2 + ascent
      el.text.split("\n").forEach((line, i) => ctx.fillText(line, el.x1, el.y1 + baseline + i * lineHeight))
      break
    }

    case "image": {
      const b = getElementBounds(el)
      const img = el.src ? getImage(el.src) : null
      if (img) {
        ctx.drawImage(img, b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
      } else {
        ctx.fillStyle = "rgba(127,127,127,0.12)"
        ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
      }
      break
    }

    default:
      drawShape(ctx, rc, el, dark)
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Scene rendering
// ---------------------------------------------------------------------------

export interface SceneState {
  elements: DrawingElement[]
  zoom: number // 1 = 100%
  pan: Point
  width: number // CSS px
  height: number
  dpr: number
  selectedIds: Set<string>
  hiddenIds?: Set<string> // e.g. the text element currently being edited
  fadedIds?: Set<string> // e.g. elements about to be erased
  marquee?: Bounds | null
  showGrid: boolean
  gridColor: string
  showHandles: boolean
  dark: boolean
}

function drawGrid(ctx: CanvasRenderingContext2D, s: SceneState) {
  let step = 20
  while (step * s.zoom < 12) step *= 5
  const r = Math.max(0.6, Math.min(1.2, s.zoom)) / s.zoom
  const x0 = Math.floor(-s.pan.x / s.zoom / step) * step
  const y0 = Math.floor(-s.pan.y / s.zoom / step) * step
  const x1 = (s.width - s.pan.x) / s.zoom
  const y1 = (s.height - s.pan.y) / s.zoom
  ctx.fillStyle = s.gridColor
  ctx.beginPath()
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
    }
  }
  ctx.fill()
}

function drawSelection(ctx: CanvasRenderingContext2D, s: SceneState) {
  const selected = s.elements.filter((el) => s.selectedIds.has(el.id) && !s.hiddenIds?.has(el.id))
  if (selected.length === 0) return

  const z = s.zoom
  ctx.save()
  ctx.strokeStyle = SELECTION_COLOR
  ctx.lineWidth = 1.25 / z

  const single = selected.length === 1 ? selected[0] : null

  if (single && isLinear(single)) {
    // Lines/arrows: just a thin guide along the segment plus endpoint handles
    ctx.setLineDash([4 / z, 4 / z])
    ctx.beginPath()
    ctx.moveTo(single.x1, single.y1)
    ctx.lineTo(single.x2, single.y2)
    ctx.stroke()
  } else {
    const pad = 6 / z
    // Individual outlines for multi-selection
    if (!single) {
      ctx.setLineDash([3 / z, 3 / z])
      for (const el of selected) {
        const b = getElementBounds(el)
        ctx.strokeRect(b.minX - pad / 2, b.minY - pad / 2, b.maxX - b.minX + pad, b.maxY - b.minY + pad)
      }
    }
    ctx.setLineDash(single ? [] : [6 / z, 4 / z])
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const el of selected) {
      const b = getElementBounds(el)
      minX = Math.min(minX, b.minX)
      minY = Math.min(minY, b.minY)
      maxX = Math.max(maxX, b.maxX)
      maxY = Math.max(maxY, b.maxY)
    }
    ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2)
  }

  if (single && s.showHandles) {
    ctx.setLineDash([])
    ctx.fillStyle = s.dark ? "#1c1c21" : "#ffffff"
    ctx.lineWidth = 1.5 / z
    const size = HANDLE_SIZE / z
    for (const h of getHandles(single, z)) {
      ctx.beginPath()
      if (isLinear(single)) ctx.arc(h.x, h.y, size / 2 + 1 / z, 0, Math.PI * 2)
      else ctx.roundRect(h.x - size / 2, h.y - size / 2, size, size, 2 / z)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

// One RoughCanvas per <canvas> element
const roughCanvases = new WeakMap<HTMLCanvasElement, RoughCanvas>()
export function getRoughCanvas(canvas: HTMLCanvasElement) {
  let rc = roughCanvases.get(canvas)
  if (!rc) {
    rc = rough.canvas(canvas)
    roughCanvases.set(canvas, rc)
  }
  return rc
}

export function renderScene(canvas: HTMLCanvasElement, s: SceneState) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const rc = getRoughCanvas(canvas)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(s.dpr * s.zoom, 0, 0, s.dpr * s.zoom, s.pan.x * s.dpr, s.pan.y * s.dpr)

  if (s.showGrid) drawGrid(ctx, s)

  // Only draw what's on screen
  const margin = 50 / s.zoom
  const viewport: Bounds = {
    minX: -s.pan.x / s.zoom - margin,
    minY: -s.pan.y / s.zoom - margin,
    maxX: (s.width - s.pan.x) / s.zoom + margin,
    maxY: (s.height - s.pan.y) / s.zoom + margin,
  }

  for (const el of s.elements) {
    if (s.hiddenIds?.has(el.id)) continue
    if (!boundsIntersect(getElementBounds(el), viewport)) continue
    if (s.fadedIds?.has(el.id)) {
      ctx.save()
      ctx.globalAlpha = 0.25
      drawElement(ctx, rc, el, s.dark)
      ctx.restore()
    } else {
      drawElement(ctx, rc, el, s.dark)
    }
  }

  drawSelection(ctx, s)

  if (s.marquee) {
    const m = s.marquee
    ctx.save()
    ctx.fillStyle = "rgba(124, 92, 255, 0.08)"
    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = 1 / s.zoom
    ctx.fillRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY)
    ctx.strokeRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY)
    ctx.restore()
  }
}
