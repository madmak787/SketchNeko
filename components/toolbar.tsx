"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { MousePointer2, Hand, Square, Circle, Minus, Pencil, Type, Triangle, ArrowRight, ImageIcon } from "lucide-react"
import type { Tool } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

interface ToolbarProps {
  selectedTool: Tool
  onToolChange: (tool: Tool) => void
}

export function Toolbar({ selectedTool, onToolChange }: ToolbarProps) {
  const tools: { icon: React.ReactNode; value: Tool; label: string }[] = [
    { icon: <MousePointer2 className="h-5 w-5" />, value: "selection", label: "Selection (V)" },
    { icon: <Hand className="h-5 w-5" />, value: "hand", label: "Hand (H)" },
    { icon: <Square className="h-5 w-5" />, value: "rectangle", label: "Rectangle (R)" },
    { icon: <Circle className="h-5 w-5" />, value: "ellipse", label: "Ellipse (O)" },
    { icon: <Triangle className="h-5 w-5" />, value: "diamond", label: "Diamond (D)" },
    { icon: <ArrowRight className="h-5 w-5" />, value: "arrow", label: "Arrow (A)" },
    { icon: <Minus className="h-5 w-5" />, value: "line", label: "Line (L)" },
    { icon: <Pencil className="h-5 w-5" />, value: "pencil", label: "Draw (P)" },
    { icon: <Type className="h-5 w-5" />, value: "text", label: "Text (T)" },
    { icon: <ImageIcon className="h-5 w-5" />, value: "image", label: "Image (I)" },
  ]

  return (
    <div className="absolute top-20 left-4 z-10 flex flex-col gap-1 bg-card border-2 border-primary/20 rounded-2xl p-2 shadow-lg">
      {tools.map((tool) => (
        <Tooltip key={tool.value}>
          <TooltipTrigger asChild>
            <Button
              variant={selectedTool === tool.value ? "default" : "ghost"}
              size="icon"
              onClick={() => onToolChange(tool.value)}
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={selectedTool === tool.value}
              className={cn(
                "h-12 w-12 rounded-xl transition-all hover:scale-110",
                selectedTool === tool.value && "bg-primary text-primary-foreground shadow-md",
              )}
            >
              {tool.icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>{tool.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
