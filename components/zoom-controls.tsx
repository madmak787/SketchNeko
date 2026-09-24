"use client"

import type React from "react"
import { Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomToFit: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  mod: string
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToFit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  mod,
}: ZoomControlsProps) {
  const bar = "flex items-center gap-0.5 rounded-xl border bg-card p-1 shadow-island"
  return (
    // Sits above the toolbar on phones (where the toolbar moves to the bottom)
    <div className="absolute bottom-[4.25rem] left-3 z-20 flex items-center gap-2 md:bottom-3">
      <div className={bar}>
        <IconButton label={`Zoom out (${mod} −)`} onClick={onZoomOut} disabled={zoom <= 10}>
          <Minus className="size-4" />
        </IconButton>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onZoomReset}
              className="h-8 min-w-14 rounded-md px-1.5 text-xs font-medium tabular-nums text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            >
              {Math.round(zoom)}%
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Reset zoom ({mod} 0)</TooltipContent>
        </Tooltip>
        <IconButton label={`Zoom in (${mod} +)`} onClick={onZoomIn} disabled={zoom >= 400}>
          <Plus className="size-4" />
        </IconButton>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <IconButton label="Zoom to fit (Shift 1)" onClick={onZoomToFit}>
          <Maximize className="size-4" />
        </IconButton>
      </div>

      <div className={bar}>
        <IconButton label={`Undo (${mod} Z)`} onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label={`Redo (${mod} Shift Z)`} onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}
