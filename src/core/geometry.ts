export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Viewport transform: screen = image * scale + translate. */
export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export function imageToScreen(p: Point, v: Viewport): Point {
  return { x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty };
}

export function screenToImage(p: Point, v: Viewport): Point {
  return { x: (p.x - v.tx) / v.scale, y: (p.y - v.ty) / v.scale };
}
