"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Menu, Download, Upload, Trash2, Undo, HelpCircle } from "lucide-react"
import { useRef } from "react"
import Image from "next/image"

interface MenuBarProps {
  onClear: () => void
  onUndo: () => void
  onExport: (format: "png" | "svg" | "json") => void
  onImport: (file: File) => void
  canUndo: boolean
  onHelp?: () => void
}

export function MenuBar({ onClear, onUndo, onExport, onImport, canUndo }: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onImport(file)
    }
  }

  return (
    <div className="h-16 border-b-2 border-primary/20 bg-card flex items-center justify-between px-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8">
            <Image src="/logo.jpg" alt="SketchNeko" fill className="object-contain" unoptimized />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
            SketchNeko
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} className="rounded-xl">
          <Undo className="h-4 w-4 mr-2" />
          Undo
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl">
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            <DropdownMenuItem onClick={handleImportClick}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport("png")}>
              <Download className="h-4 w-4 mr-2" />
              Export as PNG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("json")}>
              <Download className="h-4 w-4 mr-2" />
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Canvas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl"
          onClick={() => onHelp?.()}
          aria-label="Help"
          title="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </div>

      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
    </div>
  )
}
