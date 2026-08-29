"use client"

import { Button } from "@/components/ui/button"
import { Minus, Plus, Maximize2 } from "lucide-react"

interface ZoomControlsProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

export function ZoomControls({ zoom, onZoomChange }: ZoomControlsProps) {
  const handleZoomIn = () => {
    onZoomChange(Math.min(zoom + 10, 200))
  }

  const handleZoomOut = () => {
    onZoomChange(Math.max(zoom - 10, 10))
  }

  const handleResetZoom = () => {
    onZoomChange(100)
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card border-2 border-primary/20 rounded-2xl p-2 shadow-lg">
      <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-10 w-10 rounded-xl hover:bg-primary/10">
        <Minus className="h-5 w-5" />
      </Button>

      <button
        onClick={handleResetZoom}
        className="px-4 py-2 text-sm font-medium hover:bg-primary/10 rounded-xl transition-colors min-w-[80px]"
      >
        {zoom}%
      </button>

      <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-10 w-10 rounded-xl hover:bg-primary/10">
        <Plus className="h-5 w-5" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        variant="ghost"
        size="icon"
        onClick={handleResetZoom}
        className="h-10 w-10 rounded-xl hover:bg-primary/10"
      >
        <Maximize2 className="h-5 w-5" />
      </Button>
    </div>
  )
}
