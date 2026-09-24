export type Tool =
  | "selection"
  | "hand"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "line"
  | "pencil"
  | "text"
  | "image"
  | "eraser"

/** Element types that can actually exist on the canvas. */
export type ElementType = "rectangle" | "ellipse" | "diamond" | "arrow" | "line" | "pencil" | "text" | "image"

export type FillStyle = "solid" | "hachure" | "cross-hatch"
export type StrokeStyle = "solid" | "dashed" | "dotted"
export type FontWeight = "normal" | "bold"
export type FontStyle = "normal" | "italic"

export interface Point {
  x: number
  y: number
  // Optional pressure (0-1) for stylus/pen input
  pressure?: number
}

export interface DrawingElement {
  id: string
  type: ElementType
  /**
   * Geometry. For rectangle/ellipse/diamond/image/text these are the bounding box corners
   * (normalized so x1<=x2, y1<=y2 once drawing finishes). For line/arrow they are the two
   * endpoints. For pencil they mirror the first/last point; `points` holds the stroke.
   */
  x1: number
  y1: number
  x2: number
  y2: number
  strokeColor: string
  backgroundColor: string
  fillStyle: FillStyle
  strokeWidth: number
  strokeStyle: StrokeStyle
  roughness: number
  opacity: number
  /** Stable random seed so the hand-drawn look doesn't jitter between renders. */
  seed: number
  points?: Point[]
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  /** Data URL for image elements. */
  src?: string
}

export interface DrawingSettings {
  strokeColor: string
  backgroundColor: string
  fillStyle: FillStyle
  strokeWidth: number
  strokeStyle: StrokeStyle
  roughness: number
  opacity: number
  fontSize: number
  fontFamily: string
  fontWeight: FontWeight
  fontStyle: FontStyle
}

export interface AppState {
  zoom: number
  panOffset: Point
  showWelcome: boolean
  showGrid: boolean
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "start" | "end"
