import rough from "roughjs"
import type { DrawingElement } from "./types"
import { drawElement, getDashArray, getHatchFill, getImage, getPencilGeometry, getRoughCanvas } from "./drawing-utils"
import { getShapeGeometry, headPathData } from "./shapes"
import { getCommonBounds } from "./geometry"
import { LINE_HEIGHT, resolveFontFamily } from "./fonts"

const PADDING = 32

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function timestampedName(ext: string) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `sketchneko-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`
}

/** Render elements to a canvas cropped to their bounds. `background` null = transparent. */
export function exportToCanvas(elements: DrawingElement[], background: string | null, scale = 2) {
  const bounds = getCommonBounds(elements)
  if (!bounds) return null
  const width = bounds.maxX - bounds.minX + PADDING * 2
  const height = bounds.maxY - bounds.minY + PADDING * 2

  // Keep within browser canvas limits
  const maxSide = 16384
  const s = Math.min(scale, maxSide / width, maxSide / height)

  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(width * s)
  canvas.height = Math.ceil(height * s)
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.setTransform(s, 0, 0, s, (PADDING - bounds.minX) * s, (PADDING - bounds.minY) * s)
  const rc = getRoughCanvas(canvas)
  for (const el of elements) drawElement(ctx, rc, el)
  return canvas
}

export async function exportToPngBlob(elements: DrawingElement[], background: string | null) {
  const canvas = exportToCanvas(elements, background)
  if (!canvas) return null
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const n = (v: number) => Math.round(v * 100) / 100

export function exportToSvg(elements: DrawingElement[], background: string | null): string | null {
  const bounds = getCommonBounds(elements)
  if (!bounds) return null
  const width = bounds.maxX - bounds.minX + PADDING * 2
  const height = bounds.maxY - bounds.minY + PADDING * 2
  const gen = rough.generator()
  const parts: string[] = []

  elements.forEach((el, index) => {
    const opacity = el.opacity < 100 ? ` opacity="${el.opacity / 100}"` : ""
    const dash = getDashArray(el)
    const dashAttr = dash ? ` stroke-dasharray="${dash.map(n).join(" ")}"` : ""
    const inner: string[] = []

    switch (el.type) {
      case "pencil": {
        const geo = getPencilGeometry(el)
        const d = geo.points.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`).join(" ")
        if (geo.kind === "fill") inner.push(`<path d="${d} Z" fill="${el.strokeColor}"/>`)
        else
          inner.push(
            `<path d="${d}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`,
          )
        break
      }
      case "text": {
        const fontSize = el.fontSize ?? 20
        const lineHeight = fontSize * LINE_HEIGHT
        const family = esc(resolveFontFamily(el.fontFamily))
        const tspans = (el.text ?? "")
          .split("\n")
          .map((line, i) => `<tspan x="${n(el.x1)}" y="${n(el.y1 + i * lineHeight + lineHeight / 2)}">${esc(line) || " "}</tspan>`)
          .join("")
        inner.push(
          `<text font-family="${family}" font-size="${fontSize}" font-weight="${el.fontWeight ?? "normal"}" font-style="${el.fontStyle ?? "normal"}" fill="${el.strokeColor}" dominant-baseline="central" xml:space="preserve">${tspans}</text>`,
        )
        break
      }
      case "image": {
        if (!el.src) break
        inner.push(
          `<image href="${esc(el.src)}" x="${n(Math.min(el.x1, el.x2))}" y="${n(Math.min(el.y1, el.y2))}" width="${n(Math.abs(el.x2 - el.x1))}" height="${n(Math.abs(el.y2 - el.y1))}" preserveAspectRatio="none"/>`,
        )
        break
      }
      default: {
        const g = getShapeGeometry(el)
        if (g.closed && el.backgroundColor !== "transparent") {
          if (el.fillStyle === "solid") {
            inner.push(`<path d="${g.d}" fill="${el.backgroundColor}" stroke="none"/>`)
          } else {
            const hatch = getHatchFill(el)
            if (hatch) {
              // Clip hatch lines to the outline, matching the canvas rendering
              const clipId = `clip-${index}`
              const lines = hatch.sets
                .filter((set) => set.type === "fillSketch")
                .map((set) => gen.opsToPath(set, 2))
                .join(" ")
              inner.push(
                `<clipPath id="${clipId}"><path d="${g.d}"/></clipPath>`,
                `<path d="${lines}" clip-path="url(#${clipId})" fill="none" stroke="${el.backgroundColor}" stroke-width="${hatch.options.fillWeight}" stroke-linecap="round"/>`,
              )
            }
          }
        }
        inner.push(
          `<path d="${g.d}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`,
        )
        if (g.head) {
          // Arrowheads are always solid
          inner.push(
            `<path d="${headPathData(g.head)}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
          )
        }
      }
    }
    if (inner.length) parts.push(`<g${opacity}>${inner.join("")}</g>`)
  })

  const bg = background ? `<rect x="${n(bounds.minX - PADDING)}" y="${n(bounds.minY - PADDING)}" width="${n(width)}" height="${n(height)}" fill="${background}"/>` : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${n(bounds.minX - PADDING)} ${n(bounds.minY - PADDING)} ${n(width)} ${n(height)}">${bg}${parts.join("")}</svg>`
}

/** Copy the drawing as PNG to the clipboard (where supported). */
export async function copyPngToClipboard(elements: DrawingElement[], background: string | null) {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("Clipboard not supported")
  const blob = exportToPngBlob(elements, background).then((b) => {
    if (!b) throw new Error("Nothing to copy")
    return b
  })
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
}

/**
 * Ensure every image used by `elements` has finished decoding before we rasterize
 * (otherwise exported PNGs could contain empty image placeholders).
 */
export async function waitForImages(elements: DrawingElement[]) {
  await Promise.all(
    elements
      .filter((el) => el.type === "image" && el.src)
      .map(
        (el) =>
          new Promise<void>((resolve) => {
            if (getImage(el.src!)) return resolve()
            const img = new Image()
            img.onload = () => resolve()
            img.onerror = () => resolve()
            img.src = el.src!
          }),
      ),
  )
}

