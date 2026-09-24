"use client"

import type React from "react"
import { useRef, useState } from "react"
import {
  ClipboardCopy,
  FileCode2,
  FileImage,
  FolderOpen,
  Grid3x3,
  HelpCircle,
  Info,
  Keyboard,
  Menu,
  Save,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Logo } from "@/components/brand"
import { ThemeSegmented, ThemeToggleButton } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

export type ExportFormat = "png" | "svg" | "json" | "clipboard"

interface MenuBarProps {
  onClear: () => void
  onExport: (format: ExportFormat) => void
  onImport: (file: File) => void
  onHelp: () => void
  onAbout: () => void
  onToggleGrid: () => void
  showGrid: boolean
  hasElements: boolean
  mod: string
}

export const ISLAND = "rounded-xl border bg-card shadow-island"

const iconButton = cn(
  "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors",
  "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "data-[state=open]:bg-accent data-[state=open]:text-foreground",
)

export function MenuBar({ onClear, onExport, onImport, onHelp, onAbout, onToggleGrid, showGrid, hasElements, mod }: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onImport(file)
    // Reset so choosing the same file again still triggers onChange
    e.target.value = ""
  }

  return (
    <>
      {/* Top-left: main menu + brand */}
      <div className={cn(ISLAND, "absolute left-3 top-3 z-30 flex items-center gap-1 p-1 pr-3")}>
        <DropdownMenu>
          <DropdownMenuTrigger className={iconButton} aria-label="Main menu">
            <Menu className="size-[18px]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="w-64 rounded-xl p-1.5">
            <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
              <FolderOpen />
              Open…
              <DropdownMenuShortcut>{mod}O</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("json")} disabled={!hasElements}>
              <Save />
              Save to file
              <DropdownMenuShortcut>{mod}S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onExport("png")} disabled={!hasElements}>
              <FileImage />
              Export as PNG
              <DropdownMenuShortcut>{mod}⇧E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("svg")} disabled={!hasElements}>
              <FileCode2 />
              Export as SVG
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("clipboard")} disabled={!hasElements}>
              <ClipboardCopy />
              Copy as PNG
              <DropdownMenuShortcut>{mod}⇧C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">Theme</DropdownMenuLabel>
            <ThemeSegmented className="mx-1 mb-1.5" />
            <DropdownMenuCheckboxItem checked={showGrid} onCheckedChange={onToggleGrid}>
              <Grid3x3 />
              Show grid
              <DropdownMenuShortcut>{mod}&apos;</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem onSelect={onHelp}>
              <Keyboard />
              Keyboard shortcuts
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onAbout}>
              <Info />
              About SketchNeko
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConfirmClear(true)} disabled={!hasElements} variant="destructive">
              <Trash2 />
              Clear canvas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onAbout}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="About SketchNeko"
        >
          <Logo className="hidden sm:flex" />
          <Logo className="sm:hidden" showName={false} />
        </button>
      </div>

      {/* Top-right: theme + help */}
      <div className={cn(ISLAND, "absolute right-3 top-3 z-30 flex items-center gap-0.5 p-1")}>
        <ThemeToggleButton />
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button type="button" className={iconButton} onClick={onHelp} aria-label="Help and shortcuts">
              <HelpCircle className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Help &amp; shortcuts (?)</TooltipContent>
        </Tooltip>
      </div>

      <input
        ref={fileInputRef}
        id="sketchneko-open-file"
        type="file"
        accept=".json,.sketchneko,application/json"
        onChange={handleFileChange}
        className="hidden"
      />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent className="rounded-xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every element from the board. You can bring it back with Undo ({mod}Z).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onClear}>
              Clear canvas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
