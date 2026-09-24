"use client"

import { useLayoutEffect, useRef } from "react"
import type { DrawingElement, Point } from "@/lib/types"
import { LINE_HEIGHT, resolveFontFamily } from "@/lib/fonts"
import { measureText } from "@/lib/geometry"
import { adaptColor } from "@/lib/colors"

interface TextEditorProps {
  element: DrawingElement
  zoom: number // 1 = 100%
  pan: Point
  dark: boolean
  onChange: (text: string) => void
  onCommit: () => void
}

/**
 * WYSIWYG text editor: a transparent textarea positioned exactly over where the canvas
 * renders the text, using the same font metrics, so what you type is what you get.
 */
export function TextEditor({ element, zoom, pan, dark, onChange, onCommit }: TextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const ta = ref.current
    if (!ta) return
    // Focus synchronously so no keystroke typed right after the click is lost. (The board
    // cancels the opening pointerdown's default, so the click can't steal focus back.)
    ta.focus({ preventScroll: true })
    const len = ta.value.length
    ta.setSelectionRange(len, len)
    // Only when a different element starts being edited
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id])

  const fontSize = element.fontSize ?? 24
  const { width, height } = measureText({ ...element, text: element.text || " " })

  return (
    <textarea
      ref={ref}
      value={element.text ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          onCommit()
        }
      }}
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      wrap="off"
      aria-label="Text"
      className="absolute z-10 m-0 resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 outline-none"
      style={{
        left: pan.x + element.x1 * zoom,
        top: pan.y + element.y1 * zoom,
        // Extra room for the caret so the text never scrolls inside the box
        width: (width + fontSize) * zoom,
        height: height * zoom,
        fontSize: fontSize * zoom,
        lineHeight: LINE_HEIGHT,
        fontFamily: resolveFontFamily(element.fontFamily),
        fontWeight: element.fontWeight ?? "normal",
        fontStyle: element.fontStyle ?? "normal",
        color: adaptColor(element.strokeColor, dark),
        opacity: element.opacity / 100,
        caretColor: adaptColor(element.strokeColor, dark),
      }}
    />
  )
}
