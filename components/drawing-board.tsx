"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Toolbar } from "./toolbar"
import { PropertiesPanel } from "./properties-panel"
import { MenuBar } from "./menu-bar"
import { ZoomControls } from "./zoom-controls"
import { WelcomeDialog } from "./welcome-dialog"
import type { DrawingElement, Tool, Point, DrawingSettings, AppState } from "@/lib/types"
import { drawElement, getElementAtPosition, adjustElementCoordinates } from "@/lib/drawing-utils"
import { saveToLocalStorage, loadFromLocalStorage } from "@/lib/storage"

export function DrawingBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [elements, setElements] = useState<DrawingElement[]>([])
  const [selectedTool, setSelectedTool] = useState<Tool>("selection")
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectedElement, setSelectedElement] = useState<DrawingElement | null>(null)
  const [settings, setSettings] = useState<DrawingSettings>({
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    roughness: 1,
    opacity: 100,
    fontSize: 20,
    fontFamily: "Fredoka",
  })
  const [appState, setAppState] = useState<AppState>({
    zoom: 100,
    panOffset: { x: 0, y: 0 },
    showWelcome: true,
  })
  const [action, setAction] = useState<"drawing" | "moving" | "resizing" | "none">("none")
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  const [panStart, setPanStart] = useState<Point | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadFromLocalStorage()
    if (saved.elements.length > 0) {
      setElements(saved.elements)
    }
    if (saved.settings) {
      setSettings(saved.settings)
    }
    if (saved.appState) {
      setAppState((prev) => ({ ...prev, ...saved.appState, showWelcome: true }))
    }
  }, [])

  // Save to localStorage whenever elements or settings change
  useEffect(() => {
    if (elements.length > 0 || Object.keys(settings).length > 0) {
      saveToLocalStorage(elements, settings, appState)
    }
  }, [elements, settings, appState])

  // Keyboard shortcuts: tool switching, undo (Cmd/Ctrl+Z), and help (?)
  useEffect(() => {
    const isTyping = (el: Element | null) => {
      if (!el) return false
      const tag = (el as HTMLElement).tagName
      return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable
    }

    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement
      if (isTyping(active)) return

      const key = e.key.toLowerCase()
      const meta = e.metaKey || e.ctrlKey

      switch (key) {
        case "v":
          setSelectedTool("selection")
          break
        case "h":
          setSelectedTool("hand")
          break
        case "r":
          setSelectedTool("rectangle")
          break
        case "o":
          setSelectedTool("ellipse")
          break
        case "d":
          setSelectedTool("diamond")
          break
        case "a":
          setSelectedTool("arrow")
          break
        case "l":
          setSelectedTool("line")
          break
        case "p":
          setSelectedTool("pencil")
          break
        case "t":
          setSelectedTool("text")
          break
        case "i":
          setSelectedTool("image")
          break
        case "?":
          setAppState((prev) => ({ ...prev, showWelcome: true }))
          break
        case "z":
          if (meta) {
            e.preventDefault()
            setElements((prev) => prev.slice(0, -1))
          }
          break
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setSelectedTool, setAppState, setElements])

  // Static/offscreen canvas for finalized elements to improve realtime performance
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Rebuild the static canvas (draw all elements into the offscreen canvas)
  const rebuildStaticCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const staticCanvas = staticCanvasRef.current || document.createElement("canvas")
    staticCanvasRef.current = staticCanvas

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const width = window.innerWidth
    const height = window.innerHeight

    staticCanvas.style.width = `${width}px`
    staticCanvas.style.height = `${height}px`
    staticCanvas.width = Math.floor(width * dpr)
    staticCanvas.height = Math.floor(height * dpr)

    const sctx = staticCanvas.getContext("2d")
    if (!sctx) return

    // Clear static canvas
    sctx.setTransform(1, 0, 0, 1, 0, 0)
    sctx.clearRect(0, 0, staticCanvas.width, staticCanvas.height)

    // Apply same world transform used when drawing elements
    sctx.setTransform(
      dpr * (appState.zoom / 100),
      0,
      0,
      dpr * (appState.zoom / 100),
      appState.panOffset.x * dpr,
      appState.panOffset.y * dpr,
    )

    // Draw all elements into static canvas
    for (let i = 0; i < elements.length; i++) {
      drawElement(sctx, elements[i], false)
    }
  }

  // Redraw canvas whenever elements or zoom changes (handle DPR and resize)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1

    // Ensure static canvas exists
    if (!staticCanvasRef.current) {
      staticCanvasRef.current = document.createElement("canvas")
    }

    const draw = () => {
      const width = window.innerWidth
      const height = window.innerHeight

      // CSS size
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      // Backing store size for crisp rendering on high-DPI
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)

      // Draw static canvas first (finalized elements)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const staticCanvas = staticCanvasRef.current
      if (staticCanvas) {
        // If static canvas size doesn't match, update it
        if (staticCanvas.width !== canvas.width || staticCanvas.height !== canvas.height) {
          // Rebuild static so sizes match
          rebuildStaticCanvas()
        }
        // Draw static bitmap (already contains transformed pixels)
        ctx.drawImage(staticCanvas, 0, 0, canvas.width, canvas.height)
      }

      // Draw the in-progress element (the last one) on top
      if (isDrawing && elements.length > 0) {
        // Apply world transform for live drawing
        ctx.setTransform(
          dpr * (appState.zoom / 100),
          0,
          0,
          dpr * (appState.zoom / 100),
          appState.panOffset.x * dpr,
          appState.panOffset.y * dpr,
        )

        const last = elements[elements.length - 1]
        if (last) drawElement(ctx, last, last === selectedElement)
      }

      // If not drawing, still show selected element outline on top of static
      if (!isDrawing && selectedElement) {
        ctx.setTransform(
          dpr * (appState.zoom / 100),
          0,
          0,
          dpr * (appState.zoom / 100),
          appState.panOffset.x * dpr,
          appState.panOffset.y * dpr,
        )
        drawElement(ctx, selectedElement, true)
      }
    }

    // If not drawing, rebuild static canvas (so static contains current elements)
    if (!isDrawing) rebuildStaticCanvas()

    draw()
    window.addEventListener("resize", draw)
    return () => window.removeEventListener("resize", draw)
  }, [elements, selectedElement, appState.zoom, appState.panOffset, isDrawing])

  // Pointer-aware coordinate sampling (returns pressure when available)
  const getPointerCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - appState.panOffset.x) / (appState.zoom / 100)
    const y = (e.clientY - rect.top - appState.panOffset.y) / (appState.zoom / 100)

    return { x, y, pressure: e.pressure ?? 0.5 }
  }

  const activePointerId = useRef<number | null>(null)

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getPointerCoordinates(e)

    // Capture pointer so we continue receiving events outside the canvas while drawing
    const canvas = canvasRef.current
    try {
      canvas?.setPointerCapture(e.pointerId)
      activePointerId.current = e.pointerId
    } catch (err) {
      // ignore if capture not supported
    }

    if (selectedTool === "hand") {
      setPanStart({ x: e.clientX - appState.panOffset.x, y: e.clientY - appState.panOffset.y })
      return
    }

    if (selectedTool === "selection") {
      const element = getElementAtPosition(point, elements)
      if (element) {
        setSelectedElement(element)
        setAction("moving")
        setStartPoint(point)
      } else {
        setSelectedElement(null)
      }
      return
    }

    // Start drawing
    setIsDrawing(true)
    setAction("drawing")
    setStartPoint(point)

    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: selectedTool === "text" ? "text" : selectedTool,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      strokeColor: settings.strokeColor,
      backgroundColor: settings.backgroundColor,
      fillStyle: settings.fillStyle,
      strokeWidth: settings.strokeWidth,
      roughness: settings.roughness,
      opacity: settings.opacity,
      text: selectedTool === "text" ? "" : undefined,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      // For freehand (pencil) tool, track points to render a continuous path (include pressure)
      points: selectedTool === "pencil" ? [{ x: point.x, y: point.y, pressure: point.pressure }] : undefined,
    }

    setElements((prev) => [...prev, newElement])
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // If we have an active pointer id, ignore other pointers
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return

    const point = getPointerCoordinates(e)

    if (selectedTool === "hand" && panStart) {
      setAppState((prev) => ({
        ...prev,
        panOffset: {
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        },
      }))
      return
    }

    if (action === "moving" && selectedElement && startPoint) {
      const dx = point.x - startPoint.x
      const dy = point.y - startPoint.y

      setElements((prev) =>
        prev.map((el) =>
          el.id === selectedElement.id ? { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy } : el,
        ),
      )
      setStartPoint(point)
      return
    }

    if (!isDrawing || !startPoint) return

    // Throttle/simplify sampling: if pencil, append only when distance exceeds a small threshold to reduce points
    setElements((prev) => {
      const newElements = [...prev]
      const currentElement = newElements[newElements.length - 1]

      // For pencil, record full path points for freehand drawing (include pressure)
      if (currentElement.type === "pencil") {
        const lastPoint = currentElement.points ? currentElement.points[currentElement.points.length - 1] : null
        const dx = lastPoint ? point.x - lastPoint.x : Infinity
        const dy = lastPoint ? point.y - lastPoint.y : Infinity
        const distSq = dx * dx + dy * dy
        const threshold = 2 // pixel threshold
        if (!lastPoint || distSq > threshold * threshold) {
          const p = { x: point.x, y: point.y, pressure: point.pressure }
          currentElement.points = currentElement.points ? [...currentElement.points, p] : [p]
          currentElement.x2 = point.x
          currentElement.y2 = point.y
        }
      } else {
        currentElement.x2 = point.x
        currentElement.y2 = point.y
      }

      return newElements
    })
  }

  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
    // Release pointer capture if we set it
    try {
      if (canvasRef.current && (e as any)?.pointerId != null) {
        canvasRef.current.releasePointerCapture((e as any).pointerId)
      }
    } catch (err) {
      // ignore
    }

    activePointerId.current = null

    if (selectedTool === "hand") {
      setPanStart(null)
      return
    }

    if (isDrawing) {
      // Finalize last element coordinates for shapes
      setElements((prev) => {
        const newElements = [...prev]
        const lastElement = newElements[newElements.length - 1]

        if (lastElement.type === "rectangle" || lastElement.type === "ellipse") {
          const adjusted = adjustElementCoordinates(lastElement)
          newElements[newElements.length - 1] = adjusted
        }

        // Also composite the finalized last element into the static/offscreen canvas for performance
        try {
          const staticCanvas = staticCanvasRef.current
          const canvas = canvasRef.current
          if (staticCanvas && canvas) {
            const sctx = staticCanvas.getContext("2d")
            if (sctx && lastElement) {
              const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
              // Ensure static canvas size
              staticCanvas.width = canvas.width
              staticCanvas.height = canvas.height

              // Apply world transform and draw element into static canvas
              sctx.setTransform(
                dpr * (appState.zoom / 100),
                0,
                0,
                dpr * (appState.zoom / 100),
                appState.panOffset.x * dpr,
                appState.panOffset.y * dpr,
              )

              drawElement(sctx, lastElement, false)
            }
          }
        } catch (err) {
          // If anything goes wrong, fall back to rebuilding static on next render
          console.warn("Failed to composite to static canvas:", err)
        }

        return newElements
      })
    }

    setIsDrawing(false)
    setAction("none")
    setStartPoint(null)
  }

  const handleClearCanvas = () => {
    setElements([])
    setSelectedElement(null)
  }

  // Attach pointer cancel/leave handlers to ensure capture is released
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onCancel = (ev: PointerEvent) => handlePointerUp(ev)
    canvas.addEventListener("pointercancel", onCancel)
    canvas.addEventListener("pointerout", onCancel)
    return () => {
      canvas.removeEventListener("pointercancel", onCancel)
      canvas.removeEventListener("pointerout", onCancel)
    }
  }, [canvasRef.current, isDrawing])

  const handleUndo = () => {
    setElements((prev) => prev.slice(0, -1))
    setSelectedElement(null)
  }

  const handleExport = (format: "png" | "svg" | "json") => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (format === "png") {
      const link = document.createElement("a")
      link.download = `sketchneko-${Date.now()}.png`
      link.href = canvas.toDataURL()
      link.click()
    } else if (format === "json") {
      const data = JSON.stringify({ elements, settings }, null, 2)
      const blob = new Blob([data], { type: "application/json" })
      const link = document.createElement("a")
      link.download = `sketchneko-${Date.now()}.json`
      link.href = URL.createObjectURL(blob)
      link.click()
    }
  }

  const handleImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.elements) {
          setElements(data.elements)
        }
        if (data.settings) {
          setSettings(data.settings)
        }
      } catch (error) {
        console.error("Failed to import file:", error)
      }
    }
    reader.readAsText(file)
  }

  const canvasClassName = `canvas-container ${
    selectedTool === "hand" ? "hand-tool" : selectedTool === "selection" ? "selection-tool" : ""
  }`

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <MenuBar
        onClear={handleClearCanvas}
        onUndo={handleUndo}
        onExport={handleExport}
        onImport={handleImport}
        canUndo={elements.length > 0}
        onHelp={() => setAppState((prev) => ({ ...prev, showWelcome: true }))}
      />

      <div className="flex-1 flex relative">
        <Toolbar selectedTool={selectedTool} onToolChange={setSelectedTool} />

        <canvas
          ref={canvasRef}
          className={canvasClassName}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        <PropertiesPanel
          settings={settings}
          onSettingsChange={setSettings}
          selectedElement={selectedElement}
          onDeleteElement={() => {
            if (selectedElement) {
              setElements((prev) => prev.filter((el) => el.id !== selectedElement.id))
              setSelectedElement(null)
            }
          }}
        />
      </div>

      <ZoomControls zoom={appState.zoom} onZoomChange={(zoom) => setAppState((prev) => ({ ...prev, zoom }))} />

      <WelcomeDialog
        open={appState.showWelcome}
        onOpenChange={(open) => setAppState((prev) => ({ ...prev, showWelcome: open }))}
      />
    </div>
  )
}
