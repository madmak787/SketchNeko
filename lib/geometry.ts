import type { Bounds, DrawingElement, ElementType, HandleId, Point } from "./types"
import { buildFont, LINE_HEIGHT } from "./fonts"

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

export const BOX_TYPES: ElementType[] = ["rectangle", "ellipse", "diamond", "image", "text"]
export const LINEAR_TYPES: ElementType[] = ["line", "arrow"]

export const isLinear = (el: DrawingElement) => el.type === "line" || el.type === "arrow"
export const canFill = (type: ElementType) => type === "rectangle" || type === "ellipse" || type === "diamond"

export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31)
}

export function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function distSq(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function distanceToSegment(p: Point, a: Point, b: Point) {
  const l2 = distSq(a, b)
  if (l2 === 0) return Math.sqrt(distSq(p, a))
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.sqrt(distSq(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }))
}

function pointInPolygon(p: Point, poly: Point[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

// ---------------------------------------------------------------------------
// Text measurement
// ---------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null = null
const measureCache = new Map<string, { width: number; height: number }>()

/** Must be called when web fonts finish loading so cached widths are recomputed. */
export function clearTextMeasureCache() {
  measureCache.clear()
}

export function measureText(el: Pick<DrawingElement, "text" | "fontSize" | "fontFamily" | "fontWeight" | "fontStyle">) {
  const fontSize = el.fontSize ?? 20
  const font = buildFont(fontSize, el.fontFamily, el.fontWeight, el.fontStyle)
  const text = el.text ?? ""
  const key = `${font}\u0000${text}`
  const cached = measureCache.get(key)
  if (cached) return cached

  const lines = text.split("\n")
  const lineHeight = fontSize * LINE_HEIGHT
  let width = 0
  if (typeof document !== "undefined") {
    measureCtx ??= document.createElement("canvas").getContext("2d")
    if (measureCtx) {
      measureCtx.font = font
      for (const line of lines) width = Math.max(width, measureCtx.measureText(line).width)
    }
  } else {
    width = Math.max(...lines.map((l) => l.length)) * fontSize * 0.6
  }
  const result = { width: Math.max(width, 1), height: lines.length * lineHeight }
  measureCache.set(key, result)
  return result
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export function getElementBounds(el: DrawingElement): Bounds {
  if (el.type === "text") {
    const { width, height } = measureText(el)
    return { minX: el.x1, minY: el.y1, maxX: el.x1 + width, maxY: el.y1 + height }
  }
  if (el.type === "pencil" && el.points && el.points.length > 0) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of el.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return { minX, minY, maxX, maxY }
  }
  return {
    minX: Math.min(el.x1, el.x2),
    minY: Math.min(el.y1, el.y2),
    maxX: Math.max(el.x1, el.x2),
    maxY: Math.max(el.y1, el.y2),
  }
}

export function getCommonBounds(elements: DrawingElement[]): Bounds | null {
  if (elements.length === 0) return null
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const el of elements) {
    const eb = getElementBounds(el)
    b.minX = Math.min(b.minX, eb.minX)
    b.minY = Math.min(b.minY, eb.minY)
    b.maxX = Math.max(b.maxX, eb.maxX)
    b.maxY = Math.max(b.maxY, eb.maxY)
  }
  return b
}

export function boundsIntersect(a: Bounds, b: Bounds) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

export function boundsContain(outer: Bounds, inner: Bounds) {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
}

export function pointInBounds(p: Point, b: Bounds, pad = 0) {
  return p.x >= b.minX - pad && p.x <= b.maxX + pad && p.y >= b.minY - pad && p.y <= b.maxY + pad
}

// ---------------------------------------------------------------------------
// Hit testing (shape-accurate, with a tolerance in world units)
// ---------------------------------------------------------------------------

function diamondPoints(b: Bounds): Point[] {
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return [
    { x: cx, y: b.minY },
    { x: b.maxX, y: cy },
    { x: cx, y: b.maxY },
    { x: b.minX, y: cy },
  ]
}

export function hitTestElement(el: DrawingElement, p: Point, tolerance: number): boolean {
  const tol = tolerance + el.strokeWidth / 2
  const b = getElementBounds(el)
  if (!pointInBounds(p, b, tol)) return false

  const filled = el.backgroundColor !== "transparent"

  switch (el.type) {
    case "text":
    case "image":
      return true

    case "rectangle": {
      if (filled) return true
      const inner = pointInBounds(p, { minX: b.minX + tol, minY: b.minY + tol, maxX: b.maxX - tol, maxY: b.maxY - tol })
      return !inner
    }

    case "ellipse": {
      const rx = (b.maxX - b.minX) / 2
      const ry = (b.maxY - b.minY) / 2
      if (rx < 1 || ry < 1) return true
      const cx = b.minX + rx
      const cy = b.minY + ry
      const norm = Math.sqrt(((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2)
      if (filled && norm <= 1) return true
      // Approximate distance from the outline
      return Math.abs(norm - 1) * Math.min(rx, ry) <= tol
    }

    case "diamond": {
      const poly = diamondPoints(b)
      if (filled && pointInPolygon(p, poly)) return true
      for (let i = 0; i < 4; i++) {
        if (distanceToSegment(p, poly[i], poly[(i + 1) % 4]) <= tol) return true
      }
      return false
    }

    case "line":
    case "arrow":
      return distanceToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= tol

    case "pencil": {
      const pts = el.points ?? []
      if (pts.length === 1) return Math.sqrt(distSq(p, pts[0])) <= tol
      for (let i = 1; i < pts.length; i++) {
        if (distanceToSegment(p, pts[i - 1], pts[i]) <= tol) return true
      }
      return false
    }
  }
}

export function getElementAtPosition(p: Point, elements: DrawingElement[], tolerance: number): DrawingElement | null {
  // Topmost first
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTestElement(elements[i], p, tolerance)) return elements[i]
  }
  return null
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

export function moveElement(el: DrawingElement, dx: number, dy: number): DrawingElement {
  return {
    ...el,
    x1: el.x1 + dx,
    y1: el.y1 + dy,
    x2: el.x2 + dx,
    y2: el.y2 + dy,
    points: el.points?.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  }
}

/** Normalize a freshly drawn element so box types have x1<=x2 / y1<=y2 and pencil bounds match points. */
export function normalizeElement(el: DrawingElement): DrawingElement {
  if (isLinear(el)) return el
  if (el.type === "text") {
    const { width, height } = measureText(el)
    return { ...el, x2: el.x1 + width, y2: el.y1 + height }
  }
  const b = getElementBounds(el)
  return { ...el, x1: b.minX, y1: b.minY, x2: b.maxX, y2: b.maxY }
}

/** True if a newly drawn element is too small to be intentional (i.e. a stray click). */
export function isDegenerate(el: DrawingElement) {
  if (el.type === "pencil") return false // a single click with the pencil leaves a dot
  if (el.type === "text") return !el.text || el.text.trim() === ""
  if (isLinear(el)) return Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 3
  return Math.abs(el.x2 - el.x1) < 3 || Math.abs(el.y2 - el.y1) < 3
}

/** Snap a line angle to 15° increments (used while holding Shift). */
export function snapAngle(origin: Point, p: Point): Point {
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  const len = Math.hypot(dx, dy)
  const step = Math.PI / 12
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: origin.x + len * Math.cos(angle), y: origin.y + len * Math.sin(angle) }
}

/** Constrain a box drag to a square (used while holding Shift). */
export function constrainSquare(origin: Point, p: Point): Point {
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: origin.x + Math.sign(dx || 1) * size, y: origin.y + Math.sign(dy || 1) * size }
}

// ---------------------------------------------------------------------------
// Resize handles
// ---------------------------------------------------------------------------

export const HANDLE_SIZE = 9 // screen px

export function getHandles(el: DrawingElement, zoom: number): { id: HandleId; x: number; y: number }[] {
  if (isLinear(el)) {
    return [
      { id: "start", x: el.x1, y: el.y1 },
      { id: "end", x: el.x2, y: el.y2 },
    ]
  }
  const pad = 6 / zoom
  const b = getElementBounds(el)
  const minX = b.minX - pad
  const minY = b.minY - pad
  const maxX = b.maxX + pad
  const maxY = b.maxY + pad
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const corners: { id: HandleId; x: number; y: number }[] = [
    { id: "nw", x: minX, y: minY },
    { id: "ne", x: maxX, y: minY },
    { id: "se", x: maxX, y: maxY },
    { id: "sw", x: minX, y: maxY },
  ]
  // Text scales uniformly, so it only gets corner handles. Tiny elements hide edge handles.
  const showEdges = el.type !== "text" && (maxX - minX) * zoom > 40 && (maxY - minY) * zoom > 40
  if (!showEdges) return corners
  return [
    ...corners,
    { id: "n", x: cx, y: minY },
    { id: "e", x: maxX, y: cy },
    { id: "s", x: cx, y: maxY },
    { id: "w", x: minX, y: cy },
  ]
}

export function getHandleAtPosition(el: DrawingElement, p: Point, zoom: number): HandleId | null {
  const r = (HANDLE_SIZE / 2 + 3) / zoom
  for (const h of getHandles(el, zoom)) {
    if (Math.abs(p.x - h.x) <= r && Math.abs(p.y - h.y) <= r) return h.id
  }
  return null
}

/** The exact (unpadded) point a handle controls. Resizing moves this point by the pointer delta. */
export function getHandleAnchor(el: DrawingElement, handle: HandleId): Point {
  if (handle === "start") return { x: el.x1, y: el.y1 }
  if (handle === "end") return { x: el.x2, y: el.y2 }
  const b = getElementBounds(el)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return {
    x: handle.includes("w") ? b.minX : handle.includes("e") ? b.maxX : cx,
    y: handle.includes("n") ? b.minY : handle.includes("s") ? b.maxY : cy,
  }
}

export const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  start: "move",
  end: "move",
}

/**
 * Resize `original` by dragging `handle` to `p`. `keepAspect` locks the aspect ratio
 * (Shift for shapes; always on for images and text).
 */
export function resizeElement(original: DrawingElement, handle: HandleId, p: Point, keepAspect: boolean): DrawingElement {
  if (isLinear(original)) {
    if (handle === "start") {
      const target = keepAspect ? snapAngle({ x: original.x2, y: original.y2 }, p) : p
      return { ...original, x1: target.x, y1: target.y }
    }
    const target = keepAspect ? snapAngle({ x: original.x1, y: original.y1 }, p) : p
    return { ...original, x2: target.x, y2: target.y }
  }

  const b = getElementBounds(original)
  const w0 = Math.max(b.maxX - b.minX, 1)
  const h0 = Math.max(b.maxY - b.minY, 1)
  let { minX, minY, maxX, maxY } = b

  if (handle.includes("w")) minX = p.x
  if (handle.includes("e")) maxX = p.x
  if (handle.includes("n")) minY = p.y
  if (handle.includes("s")) maxY = p.y

  const lockAspect = keepAspect || original.type === "image" || original.type === "text"
  if (lockAspect && handle.length === 2) {
    // Corner: scale uniformly, anchored at the opposite corner
    const w = maxX - minX
    const h = maxY - minY
    const scale = Math.max(Math.abs(w) / w0, Math.abs(h) / h0)
    const nw = w0 * scale * Math.sign(w || 1)
    const nh = h0 * scale * Math.sign(h || 1)
    if (handle.includes("w")) minX = maxX - nw
    else maxX = minX + nw
    if (handle.includes("n")) minY = maxY - nh
    else maxY = minY + nh
  }

  const nb = {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  }

  if (original.type === "text") {
    const scale = Math.max((nb.maxY - nb.minY) / h0, 0.05)
    const fontSize = Math.max(4, Math.round((original.fontSize ?? 20) * scale * 10) / 10)
    const resized = { ...original, fontSize, x1: nb.minX, y1: nb.minY }
    return normalizeElement(resized)
  }

  if (original.type === "pencil") {
    const sx = (nb.maxX - nb.minX) / w0
    const sy = (nb.maxY - nb.minY) / h0
    const flipX = maxX < minX
    const flipY = maxY < minY
    const points = (original.points ?? []).map((pt) => ({
      ...pt,
      x: flipX ? nb.maxX - (pt.x - b.minX) * sx : nb.minX + (pt.x - b.minX) * sx,
      y: flipY ? nb.maxY - (pt.y - b.minY) * sy : nb.minY + (pt.y - b.minY) * sy,
    }))
    return { ...original, points, x1: nb.minX, y1: nb.minY, x2: nb.maxX, y2: nb.maxY }
  }

  return { ...original, x1: nb.minX, y1: nb.minY, x2: nb.maxX, y2: nb.maxY }
}

// ---------------------------------------------------------------------------
// Loading / migration
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set<ElementType>(["rectangle", "ellipse", "diamond", "arrow", "line", "pencil", "text", "image"])

/** Validate and upgrade elements from storage or imported files (older versions lacked some fields). */
export function sanitizeElements(raw: unknown): DrawingElement[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: DrawingElement[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const e = item as Partial<DrawingElement>
    if (!e.type || !VALID_TYPES.has(e.type)) continue
    if (![e.x1, e.y1, e.x2, e.y2].every((n) => typeof n === "number" && Number.isFinite(n))) continue
    if (e.type === "text" && !e.text?.trim()) continue
    if (e.type === "image" && !e.src) continue

    let id = typeof e.id === "string" && e.id ? e.id : generateId()
    if (seen.has(id)) id = generateId()
    seen.add(id)

    out.push({
      id,
      type: e.type,
      x1: e.x1!,
      y1: e.y1!,
      x2: e.x2!,
      y2: e.y2!,
      strokeColor: e.strokeColor ?? "#1e1e2e",
      backgroundColor: e.backgroundColor ?? "transparent",
      fillStyle: e.fillStyle ?? "solid",
      strokeWidth: e.strokeWidth ?? 2,
      strokeStyle: e.strokeStyle ?? "solid",
      roughness: e.roughness ?? 1,
      opacity: e.opacity ?? 100,
      seed: e.seed ?? randomSeed(),
      points: Array.isArray(e.points) ? e.points : undefined,
      text: e.text,
      fontSize: e.fontSize,
      fontFamily: e.fontFamily,
      fontWeight: e.fontWeight,
      fontStyle: e.fontStyle,
      src: e.src,
    })
  }
  return out
}
