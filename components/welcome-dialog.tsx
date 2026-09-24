"use client"

import { Download, Keyboard, Layers, MoonStar, PenTool, Shapes, ShieldCheck, Undo2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogoMark } from "@/components/brand"

export type HelpTab = "shortcuts" | "about"

interface WelcomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: HelpTab
  onTabChange: (tab: HelpTab) => void
  mod: string
}

const FEATURES = [
  { icon: Shapes, title: "Shapes, arrows & text", body: "Hand-drawn rectangles, ellipses, diamonds, lines and arrows. Add text and images anywhere." },
  { icon: PenTool, title: "Expressive freehand", body: "Smooth pencil strokes that respond to stylus pressure, and an eraser for whole strokes." },
  { icon: Layers, title: "Precise editing", body: "Resize with handles, snap with Shift, nudge with arrow keys, reorder layers, duplicate." },
  { icon: Undo2, title: "Undo anything", body: "Every move, resize, style change and delete can be undone — even clearing the canvas." },
  { icon: Download, title: "Export your work", body: "Download PNG or SVG, copy to the clipboard, or save to a file to keep editing later." },
  { icon: Keyboard, title: "Keyboard-first", body: "Every tool has a shortcut. Space to pan, scroll to zoom, ? to open this dialog." },
]

export function WelcomeDialog({ open, onOpenChange, tab, onTabChange, mod }: WelcomeDialogProps) {
  const groups: { title: string; items: [string, string[]][] }[] = [
    {
      title: "Tools",
      items: [
        ["Select", ["V", "1"]],
        ["Pan", ["H"]],
        ["Draw", ["P", "2"]],
        ["Eraser", ["E", "3"]],
        ["Rectangle", ["R", "4"]],
        ["Ellipse", ["O", "5"]],
        ["Diamond", ["D", "6"]],
        ["Arrow", ["A", "7"]],
        ["Line", ["L", "8"]],
        ["Text", ["T", "9"]],
        ["Image", ["I", "0"]],
      ],
    },
    {
      title: "Editing",
      items: [
        ["Undo, redo", [`${mod} Z`, `${mod} Shift Z`]],
        ["Copy, cut, paste", [`${mod} C`, `${mod} X`, `${mod} V`]],
        ["Duplicate", [`${mod} D`]],
        ["Select all", [`${mod} A`]],
        ["Delete", ["Del"]],
        ["Nudge", ["←↑→↓"]],
        ["Layer up, down", [`${mod} ]`, `${mod} [`]],
        ["Finish text", ["Esc"]],
      ],
    },
    {
      title: "View & modifiers",
      items: [
        ["Pan", ["Space + drag"]],
        ["Zoom", [`${mod} + scroll`]],
        ["Zoom in, out", [`${mod} +`, `${mod} −`]],
        ["Reset zoom", [`${mod} 0`]],
        ["Zoom to fit", ["Shift 1"]],
        ["Constrain shape", ["Shift"]],
        ["Draw from center", ["Alt"]],
        ["Duplicate on drag", ["Alt + drag"]],
      ],
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto rounded-xl p-0 sm:max-w-3xl">
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as HelpTab)} className="gap-0">
          <DialogHeader className="gap-3 border-b px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-lg font-semibold">{tab === "about" ? "About SketchNeko" : "Keyboard shortcuts"}</DialogTitle>
            <DialogDescription className="sr-only">Keyboard shortcuts and information about SketchNeko</DialogDescription>
            <TabsList className="w-full sm:w-64">
              <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>
          </DialogHeader>

          <TabsContent value="shortcuts" className="px-6 pb-6 pt-5">
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
              {groups.map((group) => (
                <section key={group.title}>
                  <h3 className="mb-2.5 text-xs font-medium text-muted-foreground">{group.title}</h3>
                  <ul className="space-y-2">
                    {group.items.map(([label, keys]) => (
                      <li key={label} className="flex items-center justify-between gap-3 text-sm">
                        <span>{label}</span>
                        <span className="flex shrink-0 gap-1">
                          {keys.map((k) => (
                            <Kbd key={k} className="h-auto min-h-5 border bg-muted/60 py-0.5 text-[11px] text-foreground/80">
                              {k}
                            </Kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Tip: drop or paste images straight onto the canvas, and double-click empty space to add text.
            </p>
          </TabsContent>

          <TabsContent value="about" className="px-6 pb-6 pt-5">
            <div className="flex items-start gap-3">
              <LogoMark className="size-10" />
              <div>
                <p className="font-display text-lg font-semibold leading-tight">SketchNeko</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  A hand-drawn whiteboard for diagrams, wireframes and quick notes. Free, no sign-up, runs entirely in
                  your browser.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-lg border p-3.5">
                  <span className="flex size-8 items-center justify-center rounded-md bg-brand-soft text-primary">
                    <Icon className="size-4" />
                  </span>
                  <h3 className="mt-3 text-sm font-medium">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex gap-3 rounded-lg bg-muted/60 p-3.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Private by design.</span> Drawings are saved only in
                  this browser — no accounts, no servers, no tracking. Use Save to file for backups or to move a drawing
                  to another device.
                </p>
              </div>
              <div className="flex gap-3 rounded-lg bg-muted/60 p-3.5">
                <MoonStar className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Light or dark.</span> Follows your system theme, or pick
                  one in the menu. Colors adapt on the dark canvas; exports always keep the originals.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
