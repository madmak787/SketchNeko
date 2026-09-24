/**
 * Font families available for text elements. `next/font` generates hashed family names,
 * so the canvas can't use the literal name "Fredoka" — we resolve the CSS variable that
 * next/font sets on <body> to get the real family stack.
 */
export const FONT_OPTIONS: { value: string; label: string; cssVar?: string; fallback: string }[] = [
  { value: "Fredoka", label: "Fredoka", cssVar: "--font-fredoka", fallback: "ui-rounded, system-ui, sans-serif" },
  { value: "Caveat", label: "Handwritten", cssVar: "--font-caveat", fallback: "cursive" },
  { value: "System", label: "Sans", fallback: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { value: "Serif", label: "Serif", fallback: "Georgia, 'Times New Roman', serif" },
  { value: "Mono", label: "Mono", fallback: "ui-monospace, SFMono-Regular, Menlo, monospace" },
]

const resolved = new Map<string, string>()

export function resolveFontFamily(family: string | undefined): string {
  const key = family || "Fredoka"
  const cached = resolved.get(key)
  if (cached) return cached

  const option = FONT_OPTIONS.find((f) => f.value === key)
  // Unknown (legacy) families like "Arial" are passed through as-is.
  if (!option) return key

  let stack = option.fallback
  if (option.cssVar && typeof document !== "undefined") {
    const fromVar = getComputedStyle(document.body).getPropertyValue(option.cssVar).trim()
    if (fromVar) stack = `${fromVar}, ${option.fallback}`
    else return stack // body not styled yet; don't cache the fallback
  }
  resolved.set(key, stack)
  return stack
}

export function buildFont(
  fontSize: number,
  family: string | undefined,
  weight: string | undefined = "normal",
  style: string | undefined = "normal",
) {
  return `${style} ${weight} ${fontSize}px ${resolveFontFamily(family)}`
}

export const LINE_HEIGHT = 1.25
