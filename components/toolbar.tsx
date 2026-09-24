"use client"

import type React from "react"
import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  ImagePlus,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  Type,
} from "lucide-react"
import type { Tool } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

interface ToolbarProps {
  selectedTool: Tool
  onToolChange: (tool: Tool) => void
}

interface ToolDef {
  icon: React.ReactNode
  value: Tool
  label: string
  shortcut: string
  hint?: string
}

const ICON = "size-[18px]"

// Ordered by how often they're used while drawing; number keys follow this order top to bottom.
const TOOL_GROUPS: ToolDef[][] = [
  [
    { icon: <MousePointer2 className={ICON} />, value: "selection", label: "Select", shortcut: "V", hint: "1" },
    { icon: <Hand className={ICON} />, value: "hand", label: "Pan", shortcut: "H" },
  ],
  [
    { icon: <Pencil className={ICON} />, value: "pencil", label: "Draw", shortcut: "P", hint: "2" },
    { icon: <Eraser className={ICON} />, value: "eraser", label: "Eraser", shortcut: "E", hint: "3" },
  ],
  [
    { icon: <Square className={ICON} />, value: "rectangle", label: "Rectangle", shortcut: "R", hint: "4" },
    { icon: <Circle className={ICON} />, value: "ellipse", label: "Ellipse", shortcut: "O", hint: "5" },
    { icon: <Diamond className={ICON} />, value: "diamond", label: "Diamond", shortcut: "D", hint: "6" },
  ],
  [
    { icon: <ArrowRight className={ICON} />, value: "arrow", label: "Arrow", shortcut: "A", hint: "7" },
    { icon: <Minus className={ICON} />, value: "line", label: "Line", shortcut: "L", hint: "8" },
  ],
  [
    { icon: <Type className={ICON} />, value: "text", label: "Text", shortcut: "T", hint: "9" },
    { icon: <ImagePlus className={ICON} />, value: "image", label: "Insert image", shortcut: "I", hint: "0" },
  ],
]

const Divider = () => <div className="mx-1 h-5 w-px shrink-0 bg-border" />

function ToolButton({
  active,
  onClick,
  label,
  shortcut,
  hint,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  shortcut?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active && "bg-brand-soft text-primary hover:bg-brand-soft hover:text-primary",
          )}
        >
          {children}
          {hint && (
            <span className="pointer-events-none absolute bottom-[3px] right-[4px] text-[9px] font-medium leading-none opacity-55">
              {hint}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
        {shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

export function Toolbar({ selectedTool, onToolChange }: ToolbarProps) {
  const renderTool = (tool: ToolDef) => (
    <ToolButton
      key={tool.value}
      active={selectedTool === tool.value}
      onClick={() => onToolChange(tool.value)}
      label={tool.label}
      shortcut={tool.hint ? `${tool.shortcut} or ${tool.hint}` : tool.shortcut}
      hint={tool.hint}
    >
      {tool.icon}
    </ToolButton>
  )

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="horizontal"
      className={cn(
        "absolute left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border bg-card p-1 shadow-island",
        // Top-center on desktop; bottom (thumb reach) on phones
        "bottom-3 md:bottom-auto md:top-3",
      )}
    >
      {TOOL_GROUPS.map((group, i) => (
        <div key={i} className="contents">
          {i > 0 && <Divider />}
          {group.map(renderTool)}
        </div>
      ))}
    </div>
  )
}
