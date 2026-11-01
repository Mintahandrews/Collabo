export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type Vec2 = [number, number];

export type ElementType =
  | "stroke"
  | "line"
  | "rect"
  | "ellipse"
  | "image"
  | "text"
  | "wall"
  | "door"
  | "window"
  | "dimension"
  | "room";

interface BaseElement {
  id: string;
  createdBy?: string;
  timestamp?: number;
}

export interface StrokeElement extends BaseElement {
  type: "stroke";
  path: Vec2[];
  color: Rgba;
  lineWidth: number;
  eraser?: boolean;
}

export interface ShapeElement extends BaseElement {
  type: "line" | "rect" | "ellipse";
  from: Vec2;
  to: Vec2;
  color: Rgba;
  fillColor?: Rgba;
  lineWidth: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  at: Vec2;
  width: number;
  height: number;
  base64: string;
}

export interface TextElement extends BaseElement {
  type: "text";
  at: Vec2;
  text: string;
  fontSize: number;
  color: Rgba;
}

export interface WallElement extends BaseElement {
  type: "wall";
  path: Vec2[];
  thickness: number;
  height: number;
  material?: string;
}

export interface OpeningElement extends BaseElement {
  type: "door" | "window";
  wallId: string;
  offset: number;
  width: number;
  sillHeight?: number;
}

export interface DimensionElement extends BaseElement {
  type: "dimension";
  from: Vec2;
  to: Vec2;
  offset: number;
}

export interface RoomElement extends BaseElement {
  type: "room";
  polygon: Vec2[];
  name: string;
}

export type DesignElement =
  | StrokeElement
  | ShapeElement
  | ImageElement
  | TextElement
  | WallElement
  | OpeningElement
  | DimensionElement
  | RoomElement;

export type ElementPatch = Record<string, unknown> & {
  id?: never;
  type?: never;
};

export type ElementOp =
  | { kind: "add"; element: DesignElement }
  | { kind: "update"; id: string; patch: ElementPatch }
  | { kind: "delete"; id: string };
