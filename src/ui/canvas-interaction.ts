import type { Point, Viewport } from '../core/geometry';
import type { Annotation, Scene } from '../core/types';
import { createAnnotation, type AnnotationHandle, type ResizeOptions } from '../core/annotations';
import { panBy, zoomAt } from '../core/viewport';

const WHEEL_STEP = 0.0015;
const WHEEL_STEP_FINE = 0.0005;
const ROTATE_CURSOR_PATHS = '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />';
// Two strokes keep the Lucide rotate icon visible over light and dark images.
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="white" stroke-width="4">${ROTATE_CURSOR_PATHS}</g><g stroke="#171a1f" stroke-width="2">${ROTATE_CURSOR_PATHS}</g></svg>`)}") 12 12, crosshair`;

export function wheelZoom(scene: Scene, anchor: Point, deltaY: number, fine: boolean): Viewport {
  return zoomAt(scene.viewport, anchor, Math.exp(-deltaY * (fine ? WHEEL_STEP_FINE : WHEEL_STEP)));
}

export function pinchViewport(viewport: Viewport, previous: [Point, Point], next: [Point, Point]): Viewport {
  const midpoint = ([a, b]: [Point, Point]): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = ([a, b]: [Point, Point]): number => Math.hypot(b.x - a.x, b.y - a.y);
  const from = midpoint(previous);
  const to = midpoint(next);
  const zoomed = zoomAt(viewport, from, distance(next) / Math.max(1, distance(previous)));
  return panBy(zoomed, to.x - from.x, to.y - from.y);
}

export const HANDLE_CURSORS: Record<AnnotationHandle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  rotate: ROTATE_CURSOR, start: 'move', end: 'move',
};

export function rectsIntersect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Constrain a drag end point: square for rects, 45deg steps for lines. */
export function constrainDrawPoint(type: Annotation['type'], start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (type === 'line' || type === 'arrow') {
    const step = Math.PI / 4;
    const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
    const length = Math.hypot(dx, dy);
    return { x: start.x + Math.cos(snapped) * length, y: start.y + Math.sin(snapped) * length };
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -size : size), y: start.y + (dy < 0 ? -size : size) };
}

export function drawBounds(type: Annotation['type'], start: Point, pointer: Point, options: ResizeOptions = {}): { start: Point; end: Point } {
  const end = options.constrainProportions ? constrainDrawPoint(type, start, pointer) : pointer;
  if (!options.fromCenter) return { start, end };
  return { start: { x: start.x * 2 - end.x, y: start.y * 2 - end.y }, end };
}

export function constrainRotation(angle: number, step = Math.PI / 4): number {
  return Math.round(angle / step) * step;
}

export function isTypingTarget(tagName: string, inputType: string, contentEditable: boolean): boolean {
  return contentEditable || tagName === 'TEXTAREA' || tagName === 'SELECT'
    || (tagName === 'INPUT' && !['button', 'checkbox', 'color', 'file', 'radio', 'range', 'reset', 'submit'].includes(inputType));
}

export function makeToolAnnotation(id: string, scene: Scene, point: Point): Annotation {
  let object = createAnnotation(id, scene.activeTool as Annotation['type'], point, scene.toolStyle);
  if (object.type === 'counter') object = {
    ...object, n: scene.counterNext, radius: scene.counterSize, shape: scene.counterShape,
    format: scene.counterFormat, paint: 'separate', fontSize: scene.counterFontSize,
    fontFamily: scene.counterFontFamily, textColor: scene.counterTextColor,
    fontWeight: scene.counterFontWeight, fontStyle: scene.counterFontStyle, underline: scene.counterUnderline,
    // An unset fill (a style inherited from a stroke-only tool) falls back to a solid counter so it is never invisible.
    style: object.style.fill === undefined ? { ...object.style, fill: object.style.color, stroke: false } : object.style,
  };
  if (object.type === 'symbol') object = { ...object, name: scene.symbolName, points: scene.symbolPoints, innerRatio: scene.symbolInnerRatio, sides: scene.symbolSides };
  if (object.type === 'arrow') object = { ...object, startHead: scene.arrowStartHead, endHead: scene.arrowEndHead };
  if (object.type === 'text') object = { ...object, text: '', fontFamily: scene.fontFamily, fontSize: scene.fontSize, letterSpacing: scene.letterSpacing, lineHeight: scene.lineHeight, fontWeight: scene.fontWeight, fontStyle: scene.fontStyle, underline: scene.textUnderline, align: scene.textAlign };
  if (object.type === 'redaction') object = { ...object, mode: scene.redactionMode, strength: scene.redactionStrength,
    style: scene.redactionMode === 'solid' ? { ...object.style, fill: object.style.fill ?? '#000000' } : object.style };
  return object;
}
