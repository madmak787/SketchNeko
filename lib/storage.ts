import type { DrawingElement, DrawingSettings, AppState } from "./types"
import { sanitizeElements } from "./geometry"

const STORAGE_KEY = "sketchneko-data"

export const DEFAULT_SETTINGS: DrawingSettings = {
  strokeColor: "#1e1e2e",
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  fontSize: 24,
  fontFamily: "Fredoka",
  fontWeight: "normal",
  fontStyle: "normal",
}

export interface StorageData {
  elements: DrawingElement[]
  settings: DrawingSettings
  appState: Pick<AppState, "zoom" | "panOffset" | "showGrid">
}

/** Returns false if the save failed (usually because the storage quota is exceeded). */
export function saveToLocalStorage(elements: DrawingElement[], settings: DrawingSettings, appState: AppState): boolean {
  try {
    const data: StorageData = {
      elements,
      settings,
      appState: { zoom: appState.zoom, panOffset: appState.panOffset, showGrid: appState.showGrid },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (error) {
    console.error("Failed to save to localStorage:", error)
    return false
  }
}

export function sanitizeSettings(raw: unknown): DrawingSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? (raw as Partial<DrawingSettings>) : {}) }
  // Legacy default was pure black, which is harsh on the new palette
  if (s.strokeColor === "#000000") s.strokeColor = DEFAULT_SETTINGS.strokeColor
  return s
}

export function loadFromLocalStorage(): StorageData {
  const fallback: StorageData = {
    elements: [],
    settings: DEFAULT_SETTINGS,
    appState: { zoom: 100, panOffset: { x: 0, y: 0 }, showGrid: true },
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const data = JSON.parse(raw)
    const zoom = Number(data?.appState?.zoom)
    const pan = data?.appState?.panOffset
    return {
      elements: sanitizeElements(data?.elements),
      settings: sanitizeSettings(data?.settings),
      appState: {
        zoom: Number.isFinite(zoom) && zoom >= 10 && zoom <= 400 ? zoom : 100,
        panOffset:
          pan && Number.isFinite(pan.x) && Number.isFinite(pan.y) ? { x: pan.x, y: pan.y } : fallback.appState.panOffset,
        showGrid: data?.appState?.showGrid ?? true,
      },
    }
  } catch (error) {
    console.error("Failed to load from localStorage:", error)
    return fallback
  }
}
