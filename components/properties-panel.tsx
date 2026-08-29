"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import type { DrawingSettings, DrawingElement } from "@/lib/types"
import { Trash2, Palette } from "lucide-react"

interface PropertiesPanelProps {
  settings: DrawingSettings
  onSettingsChange: (settings: DrawingSettings) => void
  selectedElement: DrawingElement | null
  onDeleteElement: () => void
}

export function PropertiesPanel({
  settings,
  onSettingsChange,
  selectedElement,
  onDeleteElement,
}: PropertiesPanelProps) {
  const colors = [
    "#000000",
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#52B788",
    "#FF8FAB",
    "#A8DADC",
  ]

  const strokeWidths = [1, 2, 4, 8, 12]

  return (
    <div className="absolute top-20 right-4 z-10 w-64 bg-card border-2 border-secondary/30 rounded-2xl p-4 shadow-lg space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b-2 border-secondary/20">
        <Palette className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">Properties</h3>
      </div>

      {selectedElement && (
        <Button variant="destructive" size="sm" onClick={onDeleteElement} className="w-full rounded-xl">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Selected
        </Button>
      )}

      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium mb-2 block">Stroke Color</Label>
          <div className="grid grid-cols-6 gap-2">
            {colors.map((color) => (
              <button
                key={color}
                className="h-8 w-8 rounded-lg border-2 transition-all hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: settings.strokeColor === color ? "#6366f1" : "transparent",
                }}
                onClick={() => onSettingsChange({ ...settings, strokeColor: color })}
              />
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Background</Label>
          <div className="grid grid-cols-6 gap-2">
            <button
              className="h-8 w-8 rounded-lg border-2 transition-all hover:scale-110 bg-white"
              style={{
                borderColor: settings.backgroundColor === "transparent" ? "#6366f1" : "#e5e7eb",
                backgroundImage:
                  "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
              }}
              onClick={() => onSettingsChange({ ...settings, backgroundColor: "transparent" })}
            />
            {colors.slice(1).map((color) => (
              <button
                key={color}
                className="h-8 w-8 rounded-lg border-2 transition-all hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: settings.backgroundColor === color ? "#6366f1" : "transparent",
                }}
                onClick={() => onSettingsChange({ ...settings, backgroundColor: color })}
              />
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Stroke Width</Label>
          <div className="flex gap-2">
            {strokeWidths.map((width) => (
              <button
                key={width}
                className="flex-1 h-10 rounded-lg border-2 transition-all hover:scale-105 flex items-center justify-center"
                style={{
                  borderColor: settings.strokeWidth === width ? "#6366f1" : "#e5e7eb",
                }}
                onClick={() => onSettingsChange({ ...settings, strokeWidth: width })}
              >
                <div className="bg-foreground rounded-full" style={{ width: width * 2, height: width * 2 }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Opacity: {settings.opacity}%</Label>
          <Slider
            value={[settings.opacity]}
            onValueChange={([value]) => onSettingsChange({ ...settings, opacity: value })}
            min={0}
            max={100}
            step={10}
            className="w-full"
          />
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Roughness: {settings.roughness}</Label>
          <Slider
            value={[settings.roughness]}
            onValueChange={([value]) => onSettingsChange({ ...settings, roughness: value })}
            min={0}
            max={3}
            step={0.5}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}
