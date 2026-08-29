import type { DrawingElement, Point } from "./types"

export function drawElement(ctx: CanvasRenderingContext2D, element: DrawingElement, isSelected = false) {
  ctx.save()

  ctx.globalAlpha = element.opacity / 100
  ctx.strokeStyle = element.strokeColor
  ctx.fillStyle = element.backgroundColor
  ctx.lineWidth = element.strokeWidth
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  // Add roughness effect
  if (element.roughness > 0) {
    ctx.setLineDash([element.roughness * 2, element.roughness * 2])
  }

  switch (element.type) {
    case "line":
      drawLine(ctx, element)
      break
    case "rectangle":
      drawRectangle(ctx, element)
      break
    case "ellipse":
      drawEllipse(ctx, element)
      break
    case "diamond":
      drawDiamond(ctx, element)
      break
    case "arrow":
      drawArrow(ctx, element)
      break
    case "pencil":
      drawPencil(ctx, element)
      break
    case "text":
      drawText(ctx, element)
      break
  }

  // Draw selection indicator
  if (isSelected) {
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    const padding = 5
    ctx.strokeRect(
      Math.min(element.x1, element.x2) - padding,
      Math.min(element.y1, element.y2) - padding,
      Math.abs(element.x2 - element.x1) + padding * 2,
      Math.abs(element.y2 - element.y1) + padding * 2,
    )
  }

  ctx.restore()
}

function drawLine(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  ctx.beginPath()
  ctx.moveTo(element.x1, element.y1)
  ctx.lineTo(element.x2, element.y2)
  ctx.stroke()
}

function drawRectangle(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  const width = element.x2 - element.x1
  const height = element.y2 - element.y1

  if (element.backgroundColor !== "transparent") {
    ctx.fillRect(element.x1, element.y1, width, height)
  }
  ctx.strokeRect(element.x1, element.y1, width, height)
}

function drawEllipse(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  const centerX = (element.x1 + element.x2) / 2
  const centerY = (element.y1 + element.y2) / 2
  const radiusX = Math.abs(element.x2 - element.x1) / 2
  const radiusY = Math.abs(element.y2 - element.y1) / 2

  ctx.beginPath()
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)

  if (element.backgroundColor !== "transparent") {
    ctx.fill()
  }
  ctx.stroke()
}

function drawDiamond(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  const centerX = (element.x1 + element.x2) / 2
  const centerY = (element.y1 + element.y2) / 2

  ctx.beginPath()
  ctx.moveTo(centerX, element.y1)
  ctx.lineTo(element.x2, centerY)
  ctx.lineTo(centerX, element.y2)
  ctx.lineTo(element.x1, centerY)
  ctx.closePath()

  if (element.backgroundColor !== "transparent") {
    ctx.fill()
  }
  ctx.stroke()
}

function drawArrow(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  const headLength = 20
  const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1)

  // Draw line
  ctx.beginPath()
  ctx.moveTo(element.x1, element.y1)
  ctx.lineTo(element.x2, element.y2)
  ctx.stroke()

  // Draw arrowhead
  ctx.beginPath()
  ctx.moveTo(element.x2, element.y2)
  ctx.lineTo(
    element.x2 - headLength * Math.cos(angle - Math.PI / 6),
    element.y2 - headLength * Math.sin(angle - Math.PI / 6),
  )
  ctx.moveTo(element.x2, element.y2)
  ctx.lineTo(
    element.x2 - headLength * Math.cos(angle + Math.PI / 6),
    element.y2 - headLength * Math.sin(angle + Math.PI / 6),
  )
  ctx.stroke()
}

// Map raw pressure (0..1) to a stroke width, nonlinear mapping for more expressiveness
function mapPressureToWidth(pressure: number | undefined, baseWidth: number) {
  const p = typeof pressure === "number" ? Math.max(0.01, Math.min(1, pressure)) : 0.5
  const scaled = Math.pow(p, 0.7)
  const minFactor = 0.35
  const maxFactor = 1.8
  const factor = minFactor + (maxFactor - minFactor) * scaled
  return Math.max(1, baseWidth * factor)
}

// Catmull-Rom spline interpolation
function catmullRom(points: Point[], segments = 8): Point[] {
  const out: Point[] = []
  if (points.length < 2) return points.slice()
  const pts = [points[0], ...points, points[points.length - 1]]

  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i]
    const p1 = pts[i + 1]
    const p2 = pts[i + 2]
    const p3 = pts[i + 3]

    for (let j = 0; j <= segments; j++) {
      const t = j / segments
      const t2 = t * t
      const t3 = t2 * t

      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)

      const pr0 = p0.pressure ?? 1
      const pr1 = p1.pressure ?? 1
      const pr2 = p2.pressure ?? 1
      const pr3 = p3.pressure ?? 1
      const pressure = 0.5 * ((2 * pr1) + (-pr0 + pr2) * t + (2 * pr0 - 5 * pr1 + 4 * pr2 - pr3) * t2 + (-pr0 + 3 * pr1 - 3 * pr2 + pr3) * t3)

      out.push({ x, y, pressure })
    }
  }

  return out
}

function drawPencil(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  const pts = element.points ?? []
  if (pts.length < 2) {
    ctx.beginPath()
    ctx.moveTo(element.x1, element.y1)
    ctx.lineTo(element.x2, element.y2)
    ctx.stroke()
    return
  }

  // Smooth points using Catmull-Rom
  const smooth = catmullRom(pts, 6)

  // Draw segments with variable width
  for (let i = 1; i < smooth.length; i++) {
    const a = smooth[i - 1]
    const b = smooth[i]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    const avgPressure = ((a.pressure ?? 1) + (b.pressure ?? 1)) / 2
    ctx.lineWidth = mapPressureToWidth(avgPressure, element.strokeWidth)
    ctx.stroke()
  }
}

function drawText(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  if (!element.text) return

  ctx.font = `${element.fontSize}px ${element.fontFamily}`
  ctx.fillStyle = element.strokeColor
  ctx.fillText(element.text, element.x1, element.y1)
}

export function isPointInElement(point: Point, element: DrawingElement): boolean {
  const minX = Math.min(element.x1, element.x2)
  const maxX = Math.max(element.x1, element.x2)
  const minY = Math.min(element.y1, element.y2)
  const maxY = Math.max(element.y1, element.y2)

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
}

export function getElementAtPosition(point: Point, elements: DrawingElement[]): DrawingElement | null {
  // Check from top to bottom (reverse order)
  for (let i = elements.length - 1; i >= 0; i--) {
    if (isPointInElement(point, elements[i])) {
      return elements[i]
    }
  }
  return null
}

export function resizeElement(element: DrawingElement, x: number, y: number): DrawingElement {
  return {
    ...element,
    x2: x,
    y2: y,
  }
}

export function adjustElementCoordinates(element: DrawingElement): DrawingElement {
  const { x1, y1, x2, y2 } = element
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)

  return {
    ...element,
    x1: minX,
    y1: minY,
    x2: maxX,
    y2: maxY,
  }
}
