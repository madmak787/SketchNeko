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

export type FillStyle = "solid" | "hachure" | "cross-hatch"

export interface Point {
  x: number
  y: number
  // Optional pressure (0-1) for stylus/pen input
  pressure?: number
}

export interface DrawingElement {
  id: string
  type: Tool
  x1: number
  y1: number
  x2: number
  y2: number
  strokeColor: string
  backgroundColor: string
  fillStyle: FillStyle
  strokeWidth: number
  roughness: number
  opacity: number
  points?: Point[]
  text?: string
  fontSize?: number
  fontFamily?: string
}

export interface DrawingSettings {
  strokeColor: string
  backgroundColor: string
  fillStyle: FillStyle
  strokeWidth: number
  roughness: number
  opacity: number
  fontSize: number
  fontFamily: string
}

export interface AppState {
  zoom: number
  panOffset: Point
  showWelcome: boolean
}
