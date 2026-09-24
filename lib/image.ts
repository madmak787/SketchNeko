const MAX_SIDE = 1600
const MAX_BYTES = 800 * 1024

function readAsDataURL(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function decode(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not decode image"))
    img.src = src
  })
}

/**
 * Read an image file into a data URL, downscaling large images so drawings stay small
 * enough for localStorage (which is typically capped around 5 MB).
 */
export async function loadImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image")
  const original = await readAsDataURL(file)
  const img = await decode(original)
  const width = img.naturalWidth || 300
  const height = img.naturalHeight || 150

  // SVGs and small raster images are kept as-is
  if (file.type === "image/svg+xml" || (Math.max(width, height) <= MAX_SIDE && file.size <= MAX_BYTES)) {
    return { src: original, width, height }
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) return { src: original, width, height }
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  // WebP keeps transparency at a fraction of PNG's size; fall back if the browser can't encode it
  let src = canvas.toDataURL("image/webp", 0.9)
  if (!src.startsWith("data:image/webp")) {
    src = file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png")
  }
  return { src, width, height }
}
