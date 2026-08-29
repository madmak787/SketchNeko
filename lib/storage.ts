import type { DrawingElement, DrawingSettings, AppState } from "./types"

const STORAGE_KEY = "sketchneko-data"

interface StorageData {
  elements: DrawingElement[]
  settings: DrawingSettings
  appState: Partial<AppState>
}

export function saveToLocalStorage(elements: DrawingElement[], settings: DrawingSettings, appState: AppState) {
  try {
    const data: StorageData = {
      elements,
      settings,
      appState: {
        zoom: appState.zoom,
        panOffset: appState.panOffset,
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error("Failed to save to localStorage:", error)
  }
}

export function loadFromLocalStorage(): StorageData {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      return JSON.parse(data)
    }
  } catch (error) {
    console.error("Failed to load from localStorage:", error)
  }

  return {
    elements: [],
    settings: {
      strokeColor: "#000000",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      fontSize: 20,
      fontFamily: "Fredoka",
    },
    appState: {
      zoom: 100,
      panOffset: { x: 0, y: 0 },
    },
  }
}

export function clearLocalStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error("Failed to clear localStorage:", error)
  }
}
