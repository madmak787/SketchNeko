"use client"

import type React from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useTheme } from "next-themes"
import { Toolbar } from "./toolbar"
import { PropertiesPanel, type LayerAction, type StylePatch } from "./properties-panel"
import { MenuBar, type ExportFormat } from "./menu-bar"
import { ZoomControls } from "./zoom-controls"
import { WelcomeDialog, type HelpTab } from "./welcome-dialog"
import { TextEditor } from "./text-editor"
import { useHistory } from "@/hooks/use-history"
import type { AppState, Bounds, DrawingElement, DrawingSettings, ElementType, HandleId, Point, Tool } from "@/lib/types"
import { renderScene, setImageLoadListener } from "@/lib/drawing-utils"
import {
  boundsContain,
  canFill,
  clearTextMeasureCache,
  constrainSquare,
  generateId,
  getCommonBounds,
  getElementAtPosition,
  getElementBounds,
  getHandleAnchor,
  getHandleAtPosition,
  HANDLE_CURSORS,
  isDegenerate,
  isLinear,
  moveElement,
  normalizeElement,
  pointInBounds,
  randomSeed,
  resizeElement,
  sanitizeElements,
  snapAngle,
} from "@/lib/geometry"
import { LINE_HEIGHT } from "@/lib/fonts"
import {
  DEFAULT_SETTINGS,
  loadFromLocalStorage,
  sanitizeSettings,
  saveToLocalStorage,
} from "@/lib/storage"
import {
  copyPngToClipboard,
  downloadBlob,
  exportToPngBlob,
  exportToSvg,
  timestampedName,
  waitForImages,
} from "@/lib/export"
import { loadImageFile } from "@/lib/image"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ZOOM = 10
const MAX_ZOOM = 400
const ZOOM_STEPS = [10, 25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400]
const DRAW_TOOLS: Tool[] = ["pencil", "rectangle", "ellipse", "diamond", "arrow", "line", "text"]
const EXPORT_BACKGROUND = "#ffffff"
const GRID_COLOR = { light: "rgba(24, 24, 27, 0.16)", dark: "rgba(244, 244, 245, 0.13)" }
const CLIPBOARD_MARKER = "sketchneko/clipboard"
const FILE_TYPE = "sketchneko"
const DRAG_THRESHOLD = 3 // screen px before a press becomes a drag

// Letter shortcuts are mnemonic; number keys follow the toolbar order top to bottom
const TOOL_KEYS: Record<string, Tool> = {
  v: "selection",
  "1": "selection",
  h: "hand",
  p: "pencil",
  "2": "pencil",
  e: "eraser",
  "3": "eraser",
  r: "rectangle",
  "4": "rectangle",
  o: "ellipse",
  "5": "ellipse",
  d: "diamond",
  "6": "diamond",
  a: "arrow",
  "7": "arrow",
  l: "line",
  "8": "line",
  t: "text",
  "9": "text",
  i: "image",
  "0": "image",
}

const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="7" fill="white" fill-opacity="0.6" stroke="#1e1e2e" stroke-width="1.5"/></svg>',
)}") 10 10, crosshair`

const TOOL_CURSORS: Partial<Record<Tool, string>> = {
  selection: "default",
  hand: "grab",
  text: "text",
  eraser: ERASER_CURSOR,
}

type Interaction =
  | { kind: "none" }
  | { kind: "pan"; startX: number; startY: number; startPan: Point }
  | { kind: "create"; id: string; origin: Point }
  | { kind: "move"; start: Point; originals: DrawingElement[]; moved: boolean; clickedId: string | null; shift: boolean }
  | { kind: "resize"; start: Point; original: DrawingElement; handle: HandleId; anchor: Point }
  | { kind: "marquee"; start: Point; base: string[] }
  | { kind: "erase"; last: Point }
  | { kind: "pinch"; startDist: number; startMid: Point; startZoom: number; startPan: Point }

interface TextDraft {
  element: DrawingElement
  isNew: boolean
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  )
}

const cloneElements = (els: DrawingElement[], dx: number, dy: number) =>
  els.map((el) => ({ ...moveElement(el, dx, dy), id: generateId() }))

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DrawingBoard() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Elements + undo history. `elementsRef` is always current (safe inside event handlers).
  const history = useHistory<DrawingElement[]>([])
  const elements = history.value
  const elementsRef = history.ref
  const { reset, setLive, begin, end, cancel, commit, undo: historyUndo, redo: historyRedo } = history

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedRef = useRef<string[]>([])
  const setSelection = useCallback((ids: string[]) => {
    if (sameIds(ids, selectedRef.current)) return
    selectedRef.current = ids
    setSelectedIds(ids)
  }, [])

  const [tool, setToolState] = useState<Tool>("selection")
  const toolRef = useRef<Tool>("selection")
  /** Select newly added elements, but only when already using the Select tool — the active tool never changes by itself. */
  const selectIfSelecting = useCallback(
    (ids: string[]) => {
      if (toolRef.current === "selection") setSelection(ids)
    },
    [setSelection],
  )

  const [settings, setSettings] = useState<DrawingSettings>(DEFAULT_SETTINGS)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Canvas colors follow the UI theme (elements keep their light-theme colors in storage)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  const darkRef = useRef(dark)
  darkRef.current = dark

  const [appState, setAppState] = useState<AppState>({
    zoom: 100,
    panOffset: { x: 0, y: 0 },
    showWelcome: false,
    showGrid: true,
  })
  // The view is mirrored in a ref so rapid wheel/pointer events never compute from stale values
  const viewRef = useRef({ zoom: 100, pan: { x: 0, y: 0 } as Point })
  const showGridRef = useRef(true)
  showGridRef.current = appState.showGrid

  const [textDraft, setTextDraftState] = useState<TextDraft | null>(null)
  const textDraftRef = useRef<TextDraft | null>(null)
  const setTextDraft = useCallback((d: TextDraft | null) => {
    textDraftRef.current = d
    setTextDraftState(d)
  }, [])

  const [loaded, setLoaded] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [mod, setMod] = useState("Ctrl")
  const [helpTab, setHelpTab] = useState<HelpTab>("shortcuts")

  const interactionRef = useRef<Interaction>({ kind: "none" })
  const pointersRef = useRef(new Map<number, Point>()) // active pointers, canvas-local coords
  const marqueeRef = useRef<Bounds | null>(null)
  const erasingRef = useRef<Set<string>>(new Set())
  const sizeRef = useRef({ width: 0, height: 0 })
  const lastPointerRef = useRef<Point | null>(null) // world coords, for paste placement
  const clipboardRef = useRef<DrawingElement[]>([])
  const frameRef = useRef<number | null>(null)
  const saveFailedRef = useRef(false)

  // -------------------------------------------------------------------------
  // View helpers
  // -------------------------------------------------------------------------

  const openHelp = (tab: HelpTab) => {
    setHelpTab(tab)
    setAppState((prev) => ({ ...prev, showWelcome: true }))
  }

  const setView = useCallback((zoom: number, pan: Point) => {
    viewRef.current = { zoom, pan }
    setAppState((prev) => ({ ...prev, zoom, panOffset: pan }))
  }, [])

  const toLocal = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
  }, [])

  const localToWorld = useCallback((p: Point): Point => {
    const { zoom, pan } = viewRef.current
    return { x: (p.x - pan.x) / (zoom / 100), y: (p.y - pan.y) / (zoom / 100) }
  }, [])

  const toWorld = useCallback(
    (clientX: number, clientY: number) => localToWorld(toLocal(clientX, clientY)),
    [localToWorld, toLocal],
  )

  const viewportCenterWorld = useCallback(
    () => localToWorld({ x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }),
    [localToWorld],
  )

  /** Zoom to `next` percent, keeping the canvas-local `focal` point fixed on screen. */
  const zoomTo = useCallback(
    (next: number, focal?: Point) => {
      const { zoom, pan } = viewRef.current
      const z = clamp(next, MIN_ZOOM, MAX_ZOOM)
      const f = focal ?? { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }
      const ratio = z / zoom
      setView(z, { x: f.x - (f.x - pan.x) * ratio, y: f.y - (f.y - pan.y) * ratio })
    },
    [setView],
  )

  const zoomStep = useCallback(
    (dir: 1 | -1) => {
      const z = viewRef.current.zoom
      const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.5) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.5)
      zoomTo(next ?? (dir > 0 ? MAX_ZOOM : MIN_ZOOM))
    },
    [zoomTo],
  )

  const zoomToFit = useCallback(
    (target?: DrawingElement[]) => {
      const els = target ?? elementsRef.current
      const b = getCommonBounds(els)
      const { width, height } = sizeRef.current
      if (!b || width === 0) {
        setView(100, { x: 0, y: 0 })
        return
      }
      const pad = 80
      const w = Math.max(b.maxX - b.minX, 1)
      const h = Math.max(b.maxY - b.minY, 1)
      const z = clamp(Math.min((width - pad * 2) / w, (height - pad * 2) / h) * 100, MIN_ZOOM, 200)
      const cx = (b.minX + b.maxX) / 2
      const cy = (b.minY + b.maxY) / 2
      setView(z, { x: width / 2 - cx * (z / 100), y: height / 2 - cy * (z / 100) })
    },
    [elementsRef, setView],
  )

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  const renderNow = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width, height } = sizeRef.current
    const draft = textDraftRef.current
    const interaction = interactionRef.current.kind
    renderScene(canvas, {
      elements: elementsRef.current,
      zoom: viewRef.current.zoom / 100,
      pan: viewRef.current.pan,
      width,
      height,
      dpr: window.devicePixelRatio || 1,
      selectedIds: new Set(selectedRef.current),
      hiddenIds: draft ? new Set([draft.element.id]) : undefined,
      fadedIds: erasingRef.current,
      marquee: marqueeRef.current,
      showGrid: showGridRef.current,
      gridColor: darkRef.current ? GRID_COLOR.dark : GRID_COLOR.light,
      dark: darkRef.current,
      showHandles: toolRef.current === "selection" && interaction !== "move" && interaction !== "marquee",
    })
  }, [elementsRef])

  const requestRender = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      renderNow()
    })
  }, [renderNow])

  useEffect(() => {
    requestRender()
  }, [elements, selectedIds, appState.zoom, appState.panOffset, appState.showGrid, textDraft, tool, dark, requestRender])

  // Size the canvas to its container (not the window) at device resolution
  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      sizeRef.current = { width: rect.width, height: rect.height }
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      renderNow()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    // DPR changes when the window moves between displays
    window.addEventListener("resize", resize)
    resize()
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", resize)
    }
  }, [renderNow])

  // Re-render when images decode / web fonts load (text widths change)
  useEffect(() => {
    setImageLoadListener(requestRender)
    document.fonts?.ready.then(() => {
      clearTextMeasureCache()
      setLive((prev) => [...prev]) // new array → text editor & bounds recompute
      requestRender()
    })
    return () => setImageLoadListener(null)
  }, [requestRender, setLive])

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  useEffect(() => {
    const saved = loadFromLocalStorage()
    reset(saved.elements)
    setSettings(saved.settings)
    viewRef.current = { zoom: saved.appState.zoom, pan: saved.appState.panOffset }
    setAppState((prev) => ({
      ...prev,
      zoom: saved.appState.zoom,
      panOffset: saved.appState.panOffset,
      showGrid: saved.appState.showGrid,
    }))
    setMod(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl")
    setLoaded(true)
  }, [reset])

  const saveNow = useCallback(() => {
    const ok = saveToLocalStorage(elementsRef.current, settingsRef.current, {
      ...appState,
      zoom: viewRef.current.zoom,
      panOffset: viewRef.current.pan,
    })
    if (!ok && !saveFailedRef.current) {
      toast.error("Couldn't auto-save — browser storage is full", {
        description: "Use Menu → Save to file to keep your work. Large images use the most space.",
        duration: 8000,
      })
    }
    saveFailedRef.current = !ok
  }, [appState, elementsRef])

  // Debounced auto-save (never before the initial load, or we'd overwrite saved work)
  useEffect(() => {
    if (!loaded) return
    const id = setTimeout(saveNow, 400)
    return () => clearTimeout(id)
  }, [loaded, elements, settings, appState.zoom, appState.panOffset, appState.showGrid, saveNow])

  useEffect(() => {
    if (!loaded) return
    const flush = () => saveNow()
    window.addEventListener("pagehide", flush)
    return () => window.removeEventListener("pagehide", flush)
  }, [loaded, saveNow])

  // -------------------------------------------------------------------------
  // Tools & element factory
  // -------------------------------------------------------------------------

  const setTool = useCallback(
    (t: Tool) => {
      if (t === "image") {
        imageInputRef.current?.click()
        return
      }
      toolRef.current = t
      setToolState(t)
      if (t !== "selection") setSelection([])
    },
    [setSelection],
  )

  const createElement = useCallback((type: ElementType, p: Point, extra?: Partial<DrawingElement>): DrawingElement => {
    const s = settingsRef.current
    return {
      id: generateId(),
      type,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      strokeColor: s.strokeColor,
      backgroundColor: canFill(type) ? s.backgroundColor : "transparent",
      fillStyle: s.fillStyle,
      strokeWidth: s.strokeWidth,
      strokeStyle: s.strokeStyle,
      roughness: s.roughness,
      opacity: s.opacity,
      seed: randomSeed(),
      ...(type === "text"
        ? { text: "", fontSize: s.fontSize, fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontStyle: s.fontStyle }
        : {}),
      ...extra,
    }
  }, [])

  const selectedElements = useMemo(() => {
    const ids = new Set(selectedIds)
    return elements.filter((el) => ids.has(el.id))
  }, [elements, selectedIds])

  // -------------------------------------------------------------------------
  // Text editing
  // -------------------------------------------------------------------------

  const startTextEdit = useCallback(
    (element: DrawingElement, isNew: boolean) => {
      setTextDraft({ element, isNew })
      setSelection(isNew ? [] : [element.id])
    },
    [setSelection, setTextDraft],
  )

  const updateDraft = useCallback(
    (patch: Partial<DrawingElement>) => {
      const d = textDraftRef.current
      if (!d) return
      setTextDraft({ ...d, element: { ...d.element, ...patch } })
    },
    [setTextDraft],
  )

  const finishTextEdit = useCallback(() => {
    const d = textDraftRef.current
    if (!d) return
    setTextDraft(null)
    const text = (d.element.text ?? "").replace(/\s+$/, "")
    const el = normalizeElement({ ...d.element, text })
    const empty = text.trim() === ""

    if (d.isNew) {
      if (!empty) {
        commit((prev) => [...prev, el])
        selectIfSelecting([el.id])
      }
    } else if (empty) {
      commit((prev) => prev.filter((e) => e.id !== el.id))
      setSelection([])
    } else {
      commit((prev) => prev.map((e) => (e.id === el.id ? el : e)))
      selectIfSelecting([el.id])
    }
  }, [commit, selectIfSelecting, setSelection, setTextDraft])

  const createTextAt = useCallback(
    (p: Point) => {
      const fontSize = settingsRef.current.fontSize
      // Center the first line on the click point
      const el = createElement("text", { x: p.x, y: p.y - (fontSize * LINE_HEIGHT) / 2 })
      startTextEdit(el, true)
    },
    [createElement, startTextEdit],
  )

  // -------------------------------------------------------------------------
  // Editing operations
  // -------------------------------------------------------------------------

  const deleteSelected = useCallback(() => {
    const ids = new Set(selectedRef.current)
    if (ids.size === 0) return
    commit((prev) => prev.filter((el) => !ids.has(el.id)))
    setSelection([])
  }, [commit, setSelection])

  const duplicateSelected = useCallback(() => {
    const ids = new Set(selectedRef.current)
    const source = elementsRef.current.filter((el) => ids.has(el.id))
    if (source.length === 0) return
    const clones = cloneElements(source, 16, 16)
    commit((prev) => [...prev, ...clones])
    setSelection(clones.map((c) => c.id))
  }, [commit, elementsRef, setSelection])

  const copySelected = useCallback(() => {
    const ids = new Set(selectedRef.current)
    const source = elementsRef.current.filter((el) => ids.has(el.id))
    if (source.length === 0) return false
    clipboardRef.current = source
    // Also put it on the system clipboard so it can be pasted into another tab
    navigator.clipboard
      ?.writeText(JSON.stringify({ type: CLIPBOARD_MARKER, elements: source }))
      .catch(() => undefined)
    return true
  }, [elementsRef])

  const pasteElements = useCallback(
    (source: DrawingElement[]) => {
      const b = getCommonBounds(source)
      if (!b) return
      const target = lastPointerRef.current ?? viewportCenterWorld()
      const clones = cloneElements(source, target.x - (b.minX + b.maxX) / 2, target.y - (b.minY + b.maxY) / 2)
      commit((prev) => [...prev, ...clones])
      selectIfSelecting(clones.map((c) => c.id))
    },
    [commit, selectIfSelecting, viewportCenterWorld],
  )

  const reorder = useCallback(
    (action: LayerAction) => {
      const ids = new Set(selectedRef.current)
      if (ids.size === 0) return
      commit((prev) => {
        const arr = prev.slice()
        if (action === "front") return [...arr.filter((e) => !ids.has(e.id)), ...arr.filter((e) => ids.has(e.id))]
        if (action === "back") return [...arr.filter((e) => ids.has(e.id)), ...arr.filter((e) => !ids.has(e.id))]
        if (action === "forward") {
          for (let i = arr.length - 2; i >= 0; i--) {
            if (ids.has(arr[i].id) && !ids.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
          }
        } else {
          for (let i = 1; i < arr.length; i++) {
            if (ids.has(arr[i].id) && !ids.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]
          }
        }
        return arr.every((e, i) => e === prev[i]) ? prev : arr
      })
    },
    [commit],
  )

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const ids = new Set(selectedRef.current)
      if (ids.size === 0) return
      commit((prev) => prev.map((el) => (ids.has(el.id) ? moveElement(el, dx, dy) : el)), "nudge")
    },
    [commit],
  )

  const undo = useCallback(() => {
    finishTextEdit()
    if (historyUndo()) {
      const existing = new Set(elementsRef.current.map((e) => e.id))
      setSelection(selectedRef.current.filter((id) => existing.has(id)))
    }
  }, [elementsRef, finishTextEdit, historyUndo, setSelection])

  const redo = useCallback(() => {
    finishTextEdit()
    if (historyRedo()) {
      const existing = new Set(elementsRef.current.map((e) => e.id))
      setSelection(selectedRef.current.filter((id) => existing.has(id)))
    }
  }, [elementsRef, finishTextEdit, historyRedo, setSelection])

  /** Apply a style change to the selection (or text being edited) and remember it for new elements. */
  const applyStyle = useCallback(
    (patch: StylePatch) => {
      setSettings((prev) => ({ ...prev, ...patch }) as DrawingSettings)

      const draft = textDraftRef.current
      if (draft) {
        updateDraft(patch)
        return
      }

      const ids = new Set(selectedRef.current)
      if (ids.size === 0) return
      const key = `style:${Object.keys(patch).sort().join(",")}`
      commit(
        (prev) =>
          prev.map((el) => {
            if (!ids.has(el.id)) return el
            const p: StylePatch = { ...patch }
            if (!canFill(el.type)) {
              delete p.backgroundColor
              delete p.fillStyle
            }
            if (el.type !== "text") {
              delete p.fontSize
              delete p.fontFamily
              delete p.fontWeight
              delete p.fontStyle
            }
            if (Object.keys(p).length === 0) return el
            const next = { ...el, ...p }
            return el.type === "text" ? normalizeElement(next) : next
          }),
        key,
      )
    },
    [commit, updateDraft],
  )

  const insertImage = useCallback(
    async (file: File, at?: Point) => {
      let data: { src: string; width: number; height: number }
      try {
        data = await loadImageFile(file)
      } catch {
        toast.error("Couldn't load that image", { description: "Try a PNG, JPEG, GIF, WebP or SVG file." })
        return
      }
      const zoom = viewRef.current.zoom / 100
      const maxW = Math.min(480, (sizeRef.current.width * 0.6) / zoom)
      const maxH = Math.min(480, (sizeRef.current.height * 0.6) / zoom)
      const scale = Math.min(1, maxW / data.width, maxH / data.height)
      const w = data.width * scale
      const h = data.height * scale
      const c = at ?? viewportCenterWorld()
      const el = createElement("image", { x: c.x - w / 2, y: c.y - h / 2 }, {
        x2: c.x + w / 2,
        y2: c.y + h / 2,
        src: data.src,
        opacity: 100,
      })
      commit((prev) => [...prev, el])
      selectIfSelecting([el.id])
    },
    [commit, createElement, selectIfSelecting, viewportCenterWorld],
  )

  // -------------------------------------------------------------------------
  // File operations
  // -------------------------------------------------------------------------

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const els = elementsRef.current
      if (els.length === 0) {
        toast("Nothing to export yet", { description: "Draw something first!" })
        return
      }
      try {
        if (format === "json") {
          const data = JSON.stringify({ type: FILE_TYPE, version: 2, elements: els, settings: settingsRef.current }, null, 2)
          downloadBlob(new Blob([data], { type: "application/json" }), timestampedName("json"))
          return
        }
        await waitForImages(els)
        if (format === "png") {
          const blob = await exportToPngBlob(els, EXPORT_BACKGROUND)
          if (blob) downloadBlob(blob, timestampedName("png"))
        } else if (format === "svg") {
          const svg = exportToSvg(els, EXPORT_BACKGROUND)
          if (svg) downloadBlob(new Blob([svg], { type: "image/svg+xml" }), timestampedName("svg"))
        } else if (format === "clipboard") {
          await copyPngToClipboard(els, EXPORT_BACKGROUND)
          toast.success("Copied to clipboard as PNG")
        }
      } catch (err) {
        console.error(err)
        toast.error(format === "clipboard" ? "Your browser blocked clipboard access" : "Export failed")
      }
    },
    [elementsRef],
  )

  const handleImport = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string)
          if (!Array.isArray(data) && !Array.isArray(data?.elements)) throw new Error("Not a SketchNeko file")
          const imported = sanitizeElements(Array.isArray(data) ? data : data.elements)
          finishTextEdit()
          commit(imported)
          if (data?.settings) setSettings(sanitizeSettings(data.settings))
          setSelection([])
          zoomToFit(imported)
          toast.success(`Opened ${file.name}`, {
            description: `${imported.length} element${imported.length === 1 ? "" : "s"} loaded. Undo to go back.`,
          })
        } catch {
          toast.error("Couldn't open that file", { description: "Make sure it's a drawing saved from SketchNeko." })
        }
      }
      reader.onerror = () => toast.error("Couldn't read that file")
      reader.readAsText(file)
    },
    [commit, finishTextEdit, setSelection, zoomToFit],
  )

  const handleClear = useCallback(() => {
    finishTextEdit()
    commit([])
    setSelection([])
  }, [commit, finishTextEdit, setSelection])

  // -------------------------------------------------------------------------
  // Pointer interaction
  // -------------------------------------------------------------------------

  const updateHoverCursor = (p: Point) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const t = toolRef.current
    if (spaceHeld) {
      canvas.style.cursor = "grab"
      return
    }
    if (t !== "selection") {
      canvas.style.cursor = TOOL_CURSORS[t] ?? "crosshair"
      return
    }
    const zoom = viewRef.current.zoom / 100
    const els = elementsRef.current
    const sel = selectedRef.current
    if (sel.length === 1) {
      const el = els.find((e) => e.id === sel[0])
      const handle = el && getHandleAtPosition(el, p, zoom)
      if (handle) {
        canvas.style.cursor = HANDLE_CURSORS[handle]
        return
      }
    }
    const selBounds = sel.length ? getCommonBounds(els.filter((e) => sel.includes(e.id))) : null
    const over = getElementAtPosition(p, els, 6 / zoom) || (selBounds && pointInBounds(p, selBounds, 6 / zoom))
    canvas.style.cursor = over ? "move" : "default"
  }

  const cancelInteraction = () => {
    const kind = interactionRef.current.kind
    if (kind === "create" || kind === "move" || kind === "resize" || kind === "erase") cancel()
    interactionRef.current = { kind: "none" }
    marqueeRef.current = null
    erasingRef.current = new Set()
    requestRender()
  }

  const eraseAlong = (from: Point, to: Point) => {
    const zoom = viewRef.current.zoom / 100
    const tol = 8 / zoom
    const dist = Math.hypot(to.x - from.x, to.y - from.y) * zoom
    const steps = Math.max(1, Math.ceil(dist / 4))
    const els = elementsRef.current
    let changed = false
    for (let s = 0; s <= steps; s++) {
      const p = { x: from.x + ((to.x - from.x) * s) / steps, y: from.y + ((to.y - from.y) * s) / steps }
      for (let i = els.length - 1; i >= 0; i--) {
        const el = els[i]
        if (erasingRef.current.has(el.id)) continue
        if (getElementAtPosition(p, [el], tol)) {
          erasingRef.current.add(el.id)
          changed = true
        }
      }
    }
    if (changed) requestRender()
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const local = toLocal(e.clientX, e.clientY)
    pointersRef.current.set(e.pointerId, local)

    // Two fingers on a touch screen: pinch-zoom / pan (cancels whatever one finger started)
    if (e.pointerType === "touch" && pointersRef.current.size === 2) {
      cancelInteraction()
      const [a, b] = [...pointersRef.current.values()]
      interactionRef.current = {
        kind: "pinch",
        startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        startZoom: viewRef.current.zoom,
        startPan: viewRef.current.pan,
      }
      return
    }
    if (pointersRef.current.size > 1 || interactionRef.current.kind !== "none") return
    if (e.button === 2) return

    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      // not supported
    }

    // Clicking the canvas while editing text just finishes the edit
    if (textDraftRef.current) {
      finishTextEdit()
      return
    }

    const p = toWorld(e.clientX, e.clientY)
    lastPointerRef.current = p
    const zoom = viewRef.current.zoom / 100
    const t = e.button === 5 ? "eraser" : toolRef.current // button 5 = stylus eraser end

    // Panning: hand tool, space+drag, or middle mouse
    if (t === "hand" || spaceHeld || e.button === 1) {
      interactionRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, startPan: viewRef.current.pan }
      canvas.style.cursor = "grabbing"
      return
    }
    if (e.button !== 0 && e.button !== 5) return

    if (t === "selection") {
      const els = elementsRef.current
      const sel = selectedRef.current

      // 1. Resize handle of a single selected element
      if (sel.length === 1) {
        const el = els.find((x) => x.id === sel[0])
        const handle = el && getHandleAtPosition(el, p, zoom)
        if (el && handle) {
          begin()
          interactionRef.current = { kind: "resize", start: p, original: el, handle, anchor: getHandleAnchor(el, handle) }
          return
        }
      }

      // 2. Element under the pointer (or inside the current selection's box)
      const hit = getElementAtPosition(p, els, 6 / zoom)
      let ids = sel
      if (hit) {
        if (e.shiftKey) {
          ids = sel.includes(hit.id) ? sel.filter((id) => id !== hit.id) : [...sel, hit.id]
          setSelection(ids)
          if (!ids.includes(hit.id)) return
        } else if (!sel.includes(hit.id)) {
          ids = [hit.id]
          setSelection(ids)
        }
      } else {
        const selBounds = sel.length ? getCommonBounds(els.filter((x) => sel.includes(x.id))) : null
        const insideSelection = !e.shiftKey && selBounds && pointInBounds(p, selBounds, 6 / zoom)
        if (!insideSelection) {
          // 3. Empty space: rubber-band selection
          if (!e.shiftKey) setSelection([])
          interactionRef.current = { kind: "marquee", start: p, base: e.shiftKey ? sel : [] }
          return
        }
      }

      begin()
      let originals = els.filter((x) => ids.includes(x.id))
      if (e.altKey) {
        // Alt+drag: leave the originals in place and drag copies
        const clones = cloneElements(originals, 0, 0)
        setLive((prev) => [...prev, ...clones])
        setSelection(clones.map((c) => c.id))
        originals = clones
      }
      interactionRef.current = {
        kind: "move",
        start: p,
        originals,
        moved: false,
        clickedId: hit?.id ?? null,
        shift: e.shiftKey,
      }
      return
    }

    if (t === "eraser") {
      begin()
      erasingRef.current = new Set()
      interactionRef.current = { kind: "erase", last: p }
      eraseAlong(p, p)
      return
    }

    if (t === "text") {
      // Suppress the follow-up mousedown so it can't move focus away from the new editor
      e.preventDefault()
      const hit = getElementAtPosition(p, elementsRef.current, 6 / zoom)
      if (hit?.type === "text") startTextEdit(hit, false)
      else createTextAt(p)
      return
    }

    if (DRAW_TOOLS.includes(t)) {
      begin()
      const pressure = e.pointerType === "pen" ? e.pressure : undefined
      const el = createElement(t as ElementType, p, t === "pencil" ? { points: [{ x: p.x, y: p.y, pressure }] } : {})
      setLive((prev) => [...prev, el])
      interactionRef.current = { kind: "create", id: el.id, origin: p }
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const local = toLocal(e.clientX, e.clientY)
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, local)
    const p = localToWorld(local)
    lastPointerRef.current = p
    const it = interactionRef.current
    const zoom = viewRef.current.zoom / 100

    switch (it.kind) {
      case "none":
        if (e.buttons === 0) updateHoverCursor(p)
        return

      case "pinch": {
        const pts = [...pointersRef.current.values()]
        if (pts.length < 2) return
        const [a, b] = pts
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const z = clamp((it.startZoom * dist) / it.startDist, MIN_ZOOM, MAX_ZOOM)
        const worldX = (it.startMid.x - it.startPan.x) / (it.startZoom / 100)
        const worldY = (it.startMid.y - it.startPan.y) / (it.startZoom / 100)
        setView(z, { x: mid.x - worldX * (z / 100), y: mid.y - worldY * (z / 100) })
        return
      }

      case "pan":
        setView(viewRef.current.zoom, {
          x: it.startPan.x + e.clientX - it.startX,
          y: it.startPan.y + e.clientY - it.startY,
        })
        return

      case "move": {
        let dx = p.x - it.start.x
        let dy = p.y - it.start.y
        if (!it.moved) {
          if (Math.hypot(dx, dy) * zoom < DRAG_THRESHOLD) return
          it.moved = true
        }
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        const moved = new Map(it.originals.map((o) => [o.id, moveElement(o, dx, dy)]))
        setLive((prev) => prev.map((el) => moved.get(el.id) ?? el))
        return
      }

      case "resize": {
        const target = { x: it.anchor.x + p.x - it.start.x, y: it.anchor.y + p.y - it.start.y }
        const updated = resizeElement(it.original, it.handle, target, e.shiftKey)
        setLive((prev) => prev.map((el) => (el.id === updated.id ? updated : el)))
        return
      }

      case "marquee": {
        const m = {
          minX: Math.min(it.start.x, p.x),
          minY: Math.min(it.start.y, p.y),
          maxX: Math.max(it.start.x, p.x),
          maxY: Math.max(it.start.y, p.y),
        }
        marqueeRef.current = m
        const hits = elementsRef.current.filter((el) => boundsContain(m, getElementBounds(el))).map((el) => el.id)
        setSelection([...new Set([...it.base, ...hits])])
        requestRender()
        return
      }

      case "erase":
        eraseAlong(it.last, p)
        it.last = p
        return

      case "create": {
        const id = it.id
        setLive((prev) => {
          const idx = prev.length - 1
          const el = prev[idx]
          if (!el || el.id !== id) return prev
          let next: DrawingElement

          if (el.type === "pencil") {
            // Coalesced events give every sample the hardware captured, for smoother strokes
            const events = e.nativeEvent.getCoalescedEvents?.() ?? []
            const samples = events.length > 0 ? events : [e.nativeEvent]
            const points = (el.points ?? []).slice()
            const minDist = 0.75 / zoom
            for (const ev of samples) {
              const wp = toWorld(ev.clientX, ev.clientY)
              const last = points[points.length - 1]
              if (last && Math.hypot(wp.x - last.x, wp.y - last.y) < minDist) continue
              points.push({ x: wp.x, y: wp.y, pressure: e.pointerType === "pen" ? ev.pressure : undefined })
            }
            if (points.length === el.points?.length) return prev
            const lastPt = points[points.length - 1]
            next = { ...el, points, x2: lastPt.x, y2: lastPt.y }
          } else if (isLinear(el)) {
            const target = e.shiftKey ? snapAngle(it.origin, p) : p
            next = { ...el, x2: target.x, y2: target.y }
          } else {
            const target = e.shiftKey ? constrainSquare(it.origin, p) : p
            // Alt: draw outward from the starting point as the center
            const origin = e.altKey ? { x: 2 * it.origin.x - target.x, y: 2 * it.origin.y - target.y } : it.origin
            next = { ...el, x1: origin.x, y1: origin.y, x2: target.x, y2: target.y }
          }

          const arr = prev.slice()
          arr[idx] = next
          return arr
        })
        return
      }
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId)
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    const it = interactionRef.current

    if (it.kind === "pinch") {
      // Wait until all fingers lift before accepting new input
      if (pointersRef.current.size === 0) interactionRef.current = { kind: "none" }
      return
    }
    interactionRef.current = { kind: "none" }

    switch (it.kind) {
      case "create": {
        const el = elementsRef.current.find((x) => x.id === it.id)
        if (!el || isDegenerate(el)) {
          cancel()
          break
        }
        const final = normalizeElement(el)
        setLive((prev) => prev.map((x) => (x.id === final.id ? final : x)))
        end()

        break
      }
      case "move":
        end()
        // A plain click on one element of a multi-selection selects just that element
        if (!it.moved && !it.shift && it.clickedId && selectedRef.current.length > 1) setSelection([it.clickedId])
        break
      case "resize":
        end()
        break
      case "marquee":
        marqueeRef.current = null
        break
      case "erase": {
        const ids = erasingRef.current
        erasingRef.current = new Set()
        if (ids.size > 0) {
          setLive((prev) => prev.filter((el) => !ids.has(el.id)))
          setSelection(selectedRef.current.filter((id) => !ids.has(id)))
          end()
        } else {
          cancel()
        }
        break
      }
    }

    requestRender()
    const p = toWorld(e.clientX, e.clientY)
    updateHoverCursor(p)
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId)
    if (interactionRef.current.kind === "pinch") {
      if (pointersRef.current.size === 0) interactionRef.current = { kind: "none" }
      return
    }
    cancelInteraction()
  }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolRef.current !== "selection" || textDraftRef.current) return
    const p = toWorld(e.clientX, e.clientY)
    const hit = getElementAtPosition(p, elementsRef.current, 6 / (viewRef.current.zoom / 100))
    if (hit?.type === "text") startTextEdit(hit, false)
    else if (!hit) createTextAt(p)
  }

  // -------------------------------------------------------------------------
  // Global listeners (keyboard, wheel, paste). They call through `handlers` so
  // they always see the latest render's state without re-subscribing.
  // -------------------------------------------------------------------------

  const handlers = useRef({
    keyDown: (_e: KeyboardEvent) => {},
    keyUp: (_e: KeyboardEvent) => {},
    wheel: (_e: WheelEvent) => {},
    paste: (_e: ClipboardEvent) => {},
    copy: (_e: ClipboardEvent) => {},
    cut: (_e: ClipboardEvent) => {},
  })

  const dialogOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')

  handlers.current.keyDown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target) || textDraftRef.current) return
    if (dialogOpen()) return
    const meta = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

    if (key === " " && !meta) {
      e.preventDefault()
      // Don't let Space re-click the toolbar button that was clicked last
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
      if (!spaceHeld) setSpaceHeld(true)
      return
    }

    if (meta) {
      switch (key) {
        case "z":
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
          return
        case "y":
          e.preventDefault()
          redo()
          return
        case "a":
          e.preventDefault()
          toolRef.current = "selection"
          setToolState("selection")
          setSelection(elementsRef.current.map((el) => el.id))
          return
        case "d":
          e.preventDefault()
          duplicateSelected()
          return
        case "c":
          if (e.shiftKey) {
            e.preventDefault()
            handleExport("clipboard")
          }
          return // plain copy handled by the "copy" event
        case "e":
          if (e.shiftKey) {
            e.preventDefault()
            handleExport("png")
          }
          return
        case "s":
          e.preventDefault()
          handleExport("json")
          return
        case "o":
          e.preventDefault()
          document.getElementById("sketchneko-open-file")?.click()
          return
        case "=":
        case "+":
          e.preventDefault()
          zoomStep(1)
          return
        case "-":
          e.preventDefault()
          zoomStep(-1)
          return
        case "0":
          e.preventDefault()
          zoomTo(100)
          return
        case "'":
          e.preventDefault()
          setAppState((prev) => ({ ...prev, showGrid: !prev.showGrid }))
          return
        case "]":
        case "}":
          e.preventDefault()
          reorder(e.shiftKey ? "front" : "forward")
          return
        case "[":
        case "{":
          e.preventDefault()
          reorder(e.shiftKey ? "back" : "backward")
          return
      }
      return
    }

    if (e.altKey) return

    switch (e.key) {
      case "Escape":
        // Release focus from panel controls so single-key shortcuts work again
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
          document.activeElement.blur()
        if (interactionRef.current.kind !== "none") cancelInteraction()
        else if (selectedRef.current.length) setSelection([])
        else setTool("selection")
        return
      case "Delete":
      case "Backspace":
        e.preventDefault()
        deleteSelected()
        return
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight": {
        // A focused slider uses the arrow keys itself
        if ((e.target as HTMLElement).getAttribute?.("role") === "slider") return
        if (!selectedRef.current.length) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        nudge(
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        )
        return
      }
      case "?":
        openHelp("shortcuts")
        return
      case "!": // Shift+1
        zoomToFit()
        return
    }

    const next = !e.shiftKey ? TOOL_KEYS[key] : undefined
    if (next && interactionRef.current.kind === "none") setTool(next)
  }

  handlers.current.keyUp = (e: KeyboardEvent) => {
    if (e.key === " ") setSpaceHeld(false)
  }

  handlers.current.wheel = (e: WheelEvent) => {
    e.preventDefault()
    const local = toLocal(e.clientX, e.clientY)
    // Normalize line/page deltas to pixels
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sizeRef.current.height : 1
    const dx = e.deltaX * unit
    const dy = e.deltaY * unit
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels with large ones
      const factor = Math.exp(-clamp(dy, -50, 50) * 0.01)
      zoomTo(viewRef.current.zoom * factor, local)
      return
    }
    const { zoom, pan } = viewRef.current
    if (e.shiftKey && dx === 0) setView(zoom, { x: pan.x - dy, y: pan.y })
    else setView(zoom, { x: pan.x - dx, y: pan.y - dy })
  }

  handlers.current.copy = (e: ClipboardEvent) => {
    if (isEditableTarget(e.target) || textDraftRef.current) return
    if (copySelected()) e.preventDefault()
  }

  handlers.current.cut = (e: ClipboardEvent) => {
    if (isEditableTarget(e.target) || textDraftRef.current) return
    if (copySelected()) {
      e.preventDefault()
      deleteSelected()
    }
  }

  handlers.current.paste = (e: ClipboardEvent) => {
    if (isEditableTarget(e.target) || textDraftRef.current || dialogOpen()) return
    const data = e.clipboardData
    const image = Array.from(data?.files ?? []).find((f) => f.type.startsWith("image/"))
    if (image) {
      e.preventDefault()
      insertImage(image, lastPointerRef.current ?? undefined)
      return
    }
    const text = data?.getData("text/plain") ?? ""
    if (text) {
      e.preventDefault()
      try {
        const parsed = JSON.parse(text)
        if (parsed?.type === CLIPBOARD_MARKER) {
          const els = sanitizeElements(parsed.elements)
          if (els.length) pasteElements(els)
          return
        }
      } catch {
        // not our JSON — paste as a text element
      }
      const at = lastPointerRef.current ?? viewportCenterWorld()
      const el = normalizeElement(createElement("text", at, { text: text.replace(/\r\n?/g, "\n").trimEnd() }))
      commit((prev) => [...prev, el])
      selectIfSelecting([el.id])
      return
    }
    if (clipboardRef.current.length) pasteElements(clipboardRef.current)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handlers.current.keyDown(e)
    const onKeyUp = (e: KeyboardEvent) => handlers.current.keyUp(e)
    const onPaste = (e: ClipboardEvent) => handlers.current.paste(e)
    const onCopy = (e: ClipboardEvent) => handlers.current.copy(e)
    const onCut = (e: ClipboardEvent) => handlers.current.cut(e)
    const onBlur = () => setSpaceHeld(false)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("paste", onPaste)
    window.addEventListener("copy", onCopy)
    window.addEventListener("cut", onCut)
    window.addEventListener("blur", onBlur)

    const container = containerRef.current
    const onWheel = (e: WheelEvent) => {
      // Let scrollable overlays (e.g. the properties panel) scroll normally
      if (e.target !== canvasRef.current) return
      handlers.current.wheel(e)
    }
    const preventGesture = (e: Event) => e.preventDefault() // Safari trackpad pinch
    container?.addEventListener("wheel", onWheel, { passive: false })
    container?.addEventListener("gesturestart", preventGesture)
    container?.addEventListener("gesturechange", preventGesture)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("paste", onPaste)
      window.removeEventListener("copy", onCopy)
      window.removeEventListener("cut", onCut)
      window.removeEventListener("blur", onBlur)
      container?.removeEventListener("wheel", onWheel)
      container?.removeEventListener("gesturestart", preventGesture)
      container?.removeEventListener("gesturechange", preventGesture)
    }
  }, [])

  // Keep the canvas cursor in sync with tool / space changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || interactionRef.current.kind !== "none") return
    canvas.style.cursor = spaceHeld ? "grab" : (TOOL_CURSORS[tool] ?? "crosshair")
  }, [tool, spaceHeld])

  // -------------------------------------------------------------------------
  // Drag & drop (images and saved drawings)
  // -------------------------------------------------------------------------

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type.startsWith("image/")) insertImage(file, toWorld(e.clientX, e.clientY))
    else if (file.type === "application/json" || /\.(json|sketchneko)$/i.test(file.name)) handleImport(file)
    else toast.error("Unsupported file", { description: "Drop an image or a SketchNeko .json file." })
  }

  // -------------------------------------------------------------------------
  // Derived UI state
  // -------------------------------------------------------------------------

  const panelTypes: ElementType[] = textDraft
    ? ["text"]
    : selectedElements.length
      ? [...new Set(selectedElements.map((el) => el.type))]
      : DRAW_TOOLS.includes(tool)
        ? [tool as ElementType]
        : []

  const panelSource = textDraft?.element ?? selectedElements[0]
  const panelValues = {
    strokeColor: panelSource?.strokeColor ?? settings.strokeColor,
    backgroundColor:
      panelSource && canFill(panelSource.type) ? panelSource.backgroundColor : settings.backgroundColor,
    fillStyle: panelSource?.fillStyle ?? settings.fillStyle,
    strokeWidth: panelSource?.strokeWidth ?? settings.strokeWidth,
    strokeStyle: panelSource?.strokeStyle ?? settings.strokeStyle,
    roughness: panelSource?.roughness ?? settings.roughness,
    opacity: panelSource?.opacity ?? settings.opacity,
    fontSize: panelSource?.fontSize ?? settings.fontSize,
    fontFamily: panelSource?.fontFamily ?? settings.fontFamily,
    fontWeight: panelSource?.fontWeight ?? settings.fontWeight,
    fontStyle: panelSource?.fontStyle ?? settings.fontStyle,
  }

  const hint = (() => {
    if (textDraft) return `Esc or ${mod} Enter to finish · Enter for a new line`
    if (spaceHeld) return "Drag to pan"
    switch (tool) {
      case "selection":
        if (selectedIds.length === 1)
          return "Drag to move · Drag handles to resize (Shift keeps proportions) · Alt+drag duplicates"
        if (selectedIds.length > 1) return "Drag to move · Shift+click to add or remove · Del to delete"
        return "Click to select · Drag to box-select · Double-click to add text"
      case "hand":
        return `Drag to pan · ${mod}+scroll to zoom`
      case "rectangle":
      case "ellipse":
      case "diamond":
        return "Drag to draw · Shift for a perfect shape · Alt to draw from the center"
      case "arrow":
      case "line":
        return "Drag to draw · Shift snaps to 15° angles"
      case "pencil":
        return "Draw freely · Pressure-sensitive with a stylus"
      case "text":
        return "Click anywhere to add text"
      case "eraser":
        return "Click or drag over elements to erase them"
      default:
        return ""
    }
  })()

  const zoom = appState.zoom / 100

  return (
    <div
      ref={containerRef}
      className="relative h-dvh w-screen overflow-hidden bg-canvas select-none"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className="sketch-canvas absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />

      {textDraft && (
        <TextEditor
          element={textDraft.element}
          zoom={zoom}
          pan={appState.panOffset}
          dark={dark}
          onChange={(text) => updateDraft({ text })}
          onCommit={finishTextEdit}
        />
      )}

      {loaded && elements.length === 0 && !textDraft && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xs text-center">
            <p className="font-display text-xl font-medium text-foreground/70">Start sketching</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Pick a tool from the toolbar, or drop an image here.
              <span className="hidden md:inline">
                {" "}
                Press <kbd className="rounded border bg-card px-1 font-sans text-xs">?</kbd> for shortcuts.
              </span>
            </p>
          </div>
        </div>
      )}

      <MenuBar
        onClear={handleClear}
        onExport={handleExport}
        onImport={handleImport}
        onHelp={() => openHelp("shortcuts")}
        onAbout={() => openHelp("about")}
        onToggleGrid={() => setAppState((prev) => ({ ...prev, showGrid: !prev.showGrid }))}
        showGrid={appState.showGrid}
        hasElements={elements.length > 0}
        mod={mod}
      />

      <Toolbar
        selectedTool={tool}
        onToolChange={setTool}
      />

      {panelTypes.length > 0 && (
        <PropertiesPanel
          values={panelValues}
          types={panelTypes}
          selectionCount={textDraft ? 0 : selectedElements.length}
          onChange={applyStyle}
          onDelete={deleteSelected}
          onDuplicate={duplicateSelected}
          onLayer={reorder}
          dark={dark}
        />
      )}

      <ZoomControls
        zoom={appState.zoom}
        onZoomIn={() => zoomStep(1)}
        onZoomOut={() => zoomStep(-1)}
        onZoomReset={() => zoomTo(100)}
        onZoomToFit={() => zoomToFit()}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        mod={mod}
      />

      {hint && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden max-w-[50vw] -translate-x-1/2 truncate text-xs text-muted-foreground lg:block">
          {hint}
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) insertImage(file)
          e.target.value = ""
        }}
      />

      <WelcomeDialog
        open={appState.showWelcome}
        tab={helpTab}
        onTabChange={setHelpTab}
        mod={mod}
        onOpenChange={(open) => {
          setAppState((prev) => ({ ...prev, showWelcome: open }))
        }}
      />
    </div>
  )
}
