"use client"

import type React from "react"
import { useEffect, useState } from "react"
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Italic,
  Trash2,
} from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { FONT_OPTIONS, resolveFontFamily } from "@/lib/fonts"
import { adaptColor } from "@/lib/colors"
import type { DrawingElement, ElementType, FillStyle, StrokeStyle } from "@/lib/types"

export type StylePatch = Partial<
  Pick<
    DrawingElement,
    | "strokeColor"
    | "backgroundColor"
    | "fillStyle"
    | "strokeWidth"
    | "strokeStyle"
    | "roughness"
    | "opacity"
    | "fontSize"
    | "fontFamily"
    | "fontWeight"
    | "fontStyle"
  >
>

export type LayerAction = "front" | "forward" | "backward" | "back"

interface PropertiesPanelProps {
  /** Current values to display (from the first selected element, or the tool defaults). */
  values: Required<StylePatch>
  /** Element types being edited; controls which sections are shown. */
  types: ElementType[]
  /** Number of selected elements (0 = editing tool defaults). */
  selectionCount: number
  onChange: (patch: StylePatch) => void
  onDelete: () => void
  onDuplicate: () => void
  onLayer: (action: LayerAction) => void
  /** Render swatches the way colors appear on the dark canvas. */
  dark: boolean
}

const STROKE_COLORS = ["#1e1e2e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#0c8599", "#e64980"]
const BG_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99", "#eebefa", "#99e9f2", "#fcc2d7"]
const STROKE_WIDTHS = [
  { value: 1, label: "Thin" },
  { value: 2, label: "Regular" },
  { value: 4, label: "Bold" },
  { value: 8, label: "Extra bold" },
]
const FONT_SIZES = [
  { value: 16, label: "S" },
  { value: 24, label: "M" },
  { value: 36, label: "L" },
  { value: 56, label: "XL" },
]
const SLOPPINESS = [
  { value: 0, label: "Architect" },
  { value: 1, label: "Artist" },
  { value: 2, label: "Cartoonist" },
]

const checker = (c: string) =>
  `linear-gradient(45deg,${c} 25%,transparent 25%),linear-gradient(-45deg,${c} 25%,transparent 25%),linear-gradient(45deg,transparent 75%,${c} 75%),linear-gradient(-45deg,transparent 75%,${c} 75%)`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

function OptionButton({
  active,
  onClick,
  label,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex h-8 flex-1 items-center justify-center rounded-md text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active
              ? "bg-brand-soft text-primary ring-1 ring-primary/30"
              : "bg-muted text-foreground/80 hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ColorRow({
  colors,
  value,
  onChange,
  label,
  dark,
}: {
  colors: string[]
  value: string
  onChange: (color: string) => void
  label: string
  dark: boolean
}) {
  const isCustom = !colors.includes(value)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color === "transparent" ? `${label}: none` : `${label}: ${color}`}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          className={cn(
            "size-6 rounded-md ring-1 ring-inset ring-foreground/10 transition-transform hover:scale-110",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === color && "ring-2 ring-primary ring-offset-2 ring-offset-card",
          )}
          style={
            color === "transparent"
              ? {
                  backgroundImage: checker(dark ? "#3f3f46" : "#d4d4d8"),
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
                }
              : { backgroundColor: adaptColor(color, dark) }
          }
        />
      ))}
      <label
        className={cn(
          "relative size-6 cursor-pointer overflow-hidden rounded-md ring-1 ring-inset ring-foreground/10 transition-transform hover:scale-110",
          isCustom && value !== "transparent" && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        )}
        style={{
          background:
            isCustom && value !== "transparent"
              ? adaptColor(value, dark)
              : "conic-gradient(from 90deg, #f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)",
        }}
        title="Custom color"
      >
        <span className="sr-only">{label}: custom color</span>
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  )
}

function StrokeStyleIcon({ style }: { style: StrokeStyle }) {
  const dash = style === "dashed" ? "5 4" : style === "dotted" ? "0.5 4" : undefined
  return (
    <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden>
      <line x1="2" y1="4" x2="26" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  )
}

function FillIcon({ style }: { style: FillStyle }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <defs>
        <clipPath id={`clip-${style}`}>
          <rect x="2" y="2" width="14" height="14" rx="3" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${style})`} stroke="currentColor" strokeWidth="1.2">
        {style === "solid" && <rect x="2" y="2" width="14" height="14" fill="currentColor" stroke="none" />}
        {style !== "solid" && [0, 5, 10, 15, 20, 25].map((o) => <line key={o} x1={o - 8} y1="18" x2={o + 2} y2="0" />)}
        {style === "cross-hatch" && [0, 5, 10, 15, 20, 25].map((o) => <line key={`x${o}`} x1={o - 8} y1="0" x2={o + 2} y2="18" />)}
      </g>
      <rect x="2" y="2" width="14" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function PropertiesPanel({
  values,
  types,
  selectionCount,
  onChange,
  onDelete,
  onDuplicate,
  onLayer,
  dark,
}: PropertiesPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  // Start collapsed on phones so the panel doesn't cover the drawing
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setCollapsed(true)
  }, [])

  const has = (...t: ElementType[]) => types.some((type) => t.includes(type))
  const showStroke = has("rectangle", "ellipse", "diamond", "arrow", "line", "pencil", "text")
  const showFill = has("rectangle", "ellipse", "diamond")
  const showWidth = has("rectangle", "ellipse", "diamond", "arrow", "line", "pencil")
  const showSloppiness = has("rectangle", "ellipse", "diamond", "arrow", "line")
  const showText = has("text")
  const onlyImages = types.length > 0 && types.every((t) => t === "image")

  const title = selectionCount > 1 ? `${selectionCount} selected` : selectionCount === 1 ? "Selection" : "Style"

  return (
    <div
      // Buttons shouldn't steal focus (keeps the text editor open while styling text)
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault()
      }}
      className="absolute left-3 top-[4.25rem] z-20 flex max-h-[calc(100%-9.5rem)] w-56 flex-col rounded-xl border bg-card shadow-island md:max-h-[calc(100%-8rem)]"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={!collapsed}
      >
        {title}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
      </button>

      {!collapsed && (
        <div className="space-y-3.5 overflow-y-auto border-t px-3 pb-3 pt-3">
          {showStroke && !onlyImages && (
            <Section title={has("text") && !showWidth ? "Text color" : "Stroke"}>
              <ColorRow
                colors={STROKE_COLORS}
                value={values.strokeColor}
                onChange={(c) => onChange({ strokeColor: c })}
                label="Stroke color"
                dark={dark}
              />
            </Section>
          )}

          {showFill && (
            <Section title="Background">
              <ColorRow
                colors={BG_COLORS}
                value={values.backgroundColor}
                onChange={(c) => onChange({ backgroundColor: c })}
                label="Background color"
                dark={dark}
              />
            </Section>
          )}

          {showFill && values.backgroundColor !== "transparent" && (
            <Section title="Fill">
              <div className="flex gap-1">
                {(["hachure", "cross-hatch", "solid"] as FillStyle[]).map((f) => (
                  <OptionButton
                    key={f}
                    active={values.fillStyle === f}
                    onClick={() => onChange({ fillStyle: f })}
                    label={f === "hachure" ? "Hatched fill" : f === "cross-hatch" ? "Cross-hatched fill" : "Solid fill"}
                  >
                    <FillIcon style={f} />
                  </OptionButton>
                ))}
              </div>
            </Section>
          )}

          {showWidth && (
            <Section title="Stroke width">
              <div className="flex gap-1">
                {STROKE_WIDTHS.map((w) => (
                  <OptionButton
                    key={w.value}
                    active={values.strokeWidth === w.value}
                    onClick={() => onChange({ strokeWidth: w.value })}
                    label={w.label}
                  >
                    <span className="w-5 rounded-full bg-current" style={{ height: Math.max(1, w.value * 0.75) }} />
                  </OptionButton>
                ))}
              </div>
            </Section>
          )}

          {showWidth && (
            <Section title="Stroke style">
              <div className="flex gap-1">
                {(["solid", "dashed", "dotted"] as StrokeStyle[]).map((s) => (
                  <OptionButton
                    key={s}
                    active={values.strokeStyle === s}
                    onClick={() => onChange({ strokeStyle: s })}
                    label={`${s[0].toUpperCase() + s.slice(1)} line`}
                  >
                    <StrokeStyleIcon style={s} />
                  </OptionButton>
                ))}
              </div>
            </Section>
          )}

          {showSloppiness && (
            <Section title="Sloppiness">
              <div className="flex gap-1">
                {SLOPPINESS.map((s) => (
                  <OptionButton
                    key={s.value}
                    active={values.roughness === s.value}
                    onClick={() => onChange({ roughness: s.value })}
                    label={s.label}
                  >
                    <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden>
                      <path
                        d={
                          s.value === 0
                            ? "M2 6 L22 6"
                            : s.value === 1
                              ? "M2 7 Q7 4 12 6 T22 5"
                              : "M2 8 Q5 2 9 7 T15 5 T22 7"
                        }
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </OptionButton>
                ))}
              </div>
            </Section>
          )}

          {showText && (
            <>
              <Section title="Font">
                <div className="grid grid-cols-5 gap-1">
                  {FONT_OPTIONS.map((f) => (
                    <OptionButton
                      key={f.value}
                      active={values.fontFamily === f.value}
                      onClick={() => onChange({ fontFamily: f.value })}
                      label={f.label}
                      className="text-base"
                    >
                      <span style={{ fontFamily: resolveFontFamily(f.value) }}>Aa</span>
                    </OptionButton>
                  ))}
                </div>
              </Section>
              <Section title="Font size">
                <div className="flex gap-1">
                  {FONT_SIZES.map((s) => (
                    <OptionButton
                      key={s.value}
                      active={values.fontSize === s.value}
                      onClick={() => onChange({ fontSize: s.value })}
                      label={`${s.value}px`}
                      className="text-xs font-semibold"
                    >
                      {s.label}
                    </OptionButton>
                  ))}
                  <OptionButton
                    active={values.fontWeight === "bold"}
                    onClick={() => onChange({ fontWeight: values.fontWeight === "bold" ? "normal" : "bold" })}
                    label="Bold"
                    className="flex-none w-8"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </OptionButton>
                  <OptionButton
                    active={values.fontStyle === "italic"}
                    onClick={() => onChange({ fontStyle: values.fontStyle === "italic" ? "normal" : "italic" })}
                    label="Italic"
                    className="flex-none w-8"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </OptionButton>
                </div>
              </Section>
            </>
          )}

          <Section title={`Opacity · ${values.opacity}%`}>
            <Slider
              value={[values.opacity]}
              onValueChange={([v]) => onChange({ opacity: v })}
              min={10}
              max={100}
              step={5}
              aria-label="Opacity"
              className="py-1"
            />
          </Section>

          {selectionCount > 0 && (
            <>
              <Section title="Layers">
                <div className="flex gap-1">
                  <OptionButton active={false} onClick={() => onLayer("back")} label="Send to back (Ctrl/⌘ Shift [)">
                    <ArrowDownToLine className="h-4 w-4" />
                  </OptionButton>
                  <OptionButton active={false} onClick={() => onLayer("backward")} label="Send backward (Ctrl/⌘ [)">
                    <ChevronsDown className="h-4 w-4" />
                  </OptionButton>
                  <OptionButton active={false} onClick={() => onLayer("forward")} label="Bring forward (Ctrl/⌘ ])">
                    <ChevronsUp className="h-4 w-4" />
                  </OptionButton>
                  <OptionButton active={false} onClick={() => onLayer("front")} label="Bring to front (Ctrl/⌘ Shift ])">
                    <ArrowUpToLine className="h-4 w-4" />
                  </OptionButton>
                </div>
              </Section>
              <Section title="Actions">
                <div className="flex gap-1">
                  <OptionButton active={false} onClick={onDuplicate} label="Duplicate (Ctrl/⌘ D)">
                    <Copy className="h-4 w-4" />
                  </OptionButton>
                  <OptionButton
                    active={false}
                    onClick={onDelete}
                    label="Delete (Del)"
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </OptionButton>
                </div>
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  )
}
