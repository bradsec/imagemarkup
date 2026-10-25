import type { Point, Rect } from './geometry';
import { isPathAnnotation, type Annotation, type AnnotationStyle } from './types';
import { textLineHeight, textWidth } from './text-layout';

export type AnnotationHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end' | 'rotate';
export interface ResizeOptions {
  constrainProportions?: boolean;
  fromCenter?: boolean;
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function createAnnotation(id: string, type: Annotation['type'], start: Point, style: AnnotationStyle): Annotation {
  if (type === 'rect' || type === 'ellipse') {
    return { id, type, rect: { x: start.x, y: start.y, w: 0, h: 0 }, style: { ...style } };
  }
  if (type === 'pen' || type === 'highlighter') return { id, type, points: [start], style: { ...style } };
  if (type === 'text') return { id, type, position: start, text: '', fontFamily: 'Kalam', fontSize: 32, letterSpacing: 0, lineHeight: 1.2, fontWeight: 'normal', fontStyle: 'normal', underline: false, align: 'left', style: { ...style } };
  if (type === 'counter') return { id, type, position: start, n: 1, radius: 18, style: { ...style } };
  if (type === 'redaction') return { id, type, rect: { x: start.x, y: start.y, w: 0, h: 0 }, mode: 'pixelate', strength: 10, style: { ...style } };
  if (type === 'symbol') return { id, type, paint: 'separate', rect: { x: start.x - 20, y: start.y - 20, w: 40, h: 40 }, name: 'check', style: { ...style } };
  if (type === 'image') return { id, type, rect: { x: start.x, y: start.y, w: 0, h: 0 }, dataUrl: '', style: { ...style } };
  return { id, type, start, end: start, style: { ...style } };
}

export function resizeAnnotation(object: Annotation, start: Point, end: Point): Annotation {
  if ('rect' in object) return { ...object, rect: rectFromPoints(start, end) };
  if (isPathAnnotation(object)) return { ...object, points: [...object.points, end] };
  if ('start' in object) return { ...object, start, end };
  return object;
}

export function resizeAnnotationToBounds(object: Annotation, width: number, height: number): Annotation {
  const bounds = annotationBounds(object);
  const nextWidth = Math.max(0.01, width);
  const nextHeight = Math.max(0.01, height);
  if ('rect' in object) return { ...object, rect: { ...object.rect, w: nextWidth, h: nextHeight } };
  const sx = bounds.w > 0 ? nextWidth / bounds.w : 1;
  const sy = bounds.h > 0 ? nextHeight / bounds.h : 1;
  const map = (point: Point): Point => ({ x: bounds.x + (point.x - bounds.x) * sx, y: bounds.y + (point.y - bounds.y) * sy });
  if ('start' in object) return { ...object, start: map(object.start), end: map(object.end) };
  if (isPathAnnotation(object)) return { ...object, points: object.points.map(map) };
  const widthChanged = Math.abs(nextWidth - bounds.w) > Math.abs(nextHeight - bounds.h);
  const factor = widthChanged ? sx : sy;
  if (object.type === 'counter') return { ...object, radius: object.radius * factor };
  return { ...object, position: map(object.position), fontSize: object.fontSize * factor };
}

export function appendPathPoints(object: Annotation, points: Point[], minimumDistance = 0.5): Annotation {
  if (!isPathAnnotation(object) || points.length === 0) return object;
  const next = [...object.points];
  for (const point of points) {
    const previous = next[next.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= minimumDistance) next.push(point);
  }
  return { ...object, points: next };
}

export function moveAnnotation(object: Annotation, dx: number, dy: number): Annotation {
  if ('rect' in object) {
    return { ...object, rect: { ...object.rect, x: object.rect.x + dx, y: object.rect.y + dy } };
  }
  if (isPathAnnotation(object)) return { ...object, points: object.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  if ('position' in object) return { ...object, position: { x: object.position.x + dx, y: object.position.y + dy } };
  return {
    ...object,
    start: { x: object.start.x + dx, y: object.start.y + dy },
    end: { x: object.end.x + dx, y: object.end.y + dy },
  };
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitTest(objects: Annotation[], point: Point, tolerance: number): Annotation | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const object = objects[i];
    if (object.locked || object.hidden) continue;
    const test = pointInObjectSpace(object, point);
    if ('rect' in object && object.type !== 'ellipse') {
      const { x, y, w, h } = object.rect;
      const padding = object.type === 'symbol' && object.style.stroke !== false ? object.style.width / 2 : 0;
      if (test.x >= x - tolerance - padding && test.x <= x + w + tolerance + padding && test.y >= y - tolerance - padding && test.y <= y + h + tolerance + padding) return object;
    } else if (object.type === 'ellipse') {
      const { x, y, w, h } = object.rect;
      const rx = w / 2 + tolerance;
      const ry = h / 2 + tolerance;
      if (rx > 0 && ry > 0 && ((test.x - x - w / 2) / rx) ** 2 + ((test.y - y - h / 2) / ry) ** 2 <= 1) return object;
    } else if ('start' in object && pointSegmentDistance(test, object.start, object.end) <= tolerance + object.style.width / 2) {
      return object;
    } else if (isPathAnnotation(object) && (object.points.length === 1
      ? Math.hypot(test.x - object.points[0].x, test.y - object.points[0].y) <= tolerance + object.style.width / 2
      : object.points.some((start, index) => index > 0 && pointSegmentDistance(test, object.points[index - 1], start) <= tolerance + object.style.width / 2))) {
      return object;
    } else if ('position' in object) {
      const bounds = annotationBounds(object);
      if (test.x >= bounds.x - tolerance && test.x <= bounds.x + bounds.w + tolerance && test.y >= bounds.y - tolerance && test.y <= bounds.y + bounds.h + tolerance) return object;
    }
  }
  return null;
}

let textMeasureContext: CanvasRenderingContext2D | null | undefined;

function fallbackTextWidth(text: string, fontSize: number, bold: boolean): number {
  let units = 0;
  for (const character of text) {
    if (/\s/.test(character)) units += .32;
    else if (/[ilI.,'`!:;|]/.test(character)) units += .28;
    else if (/[MW@%&#]/.test(character)) units += .9;
    else if (/[A-Z0-9]/.test(character)) units += .62;
    else units += .54;
  }
  return units * fontSize * (bold ? 1.05 : 1);
}

function textBounds(object: Extract<Annotation, { type: 'text' }>): Rect {
  const lines = object.text.split('\n');
  if (textMeasureContext === undefined) {
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    textMeasureContext = canvas?.getContext('2d') ?? null;
  }
  const context = textMeasureContext;
  let width = 0;
  let ascent = 0;
  let descent = 0;
  if (context) {
    context.font = `${object.fontStyle ?? 'normal'} ${object.fontWeight} ${object.fontSize}px "${object.fontFamily}"`;
    for (const line of lines) {
      const metrics = context.measureText(line);
      width = Math.max(width, textWidth(line, object.fontSize, object.letterSpacing, (value) => context.measureText(value).width));
      if (line) {
        ascent = Math.max(ascent, metrics.actualBoundingBoxAscent);
        descent = Math.max(object.underline ? object.fontSize * .13 : 0, metrics.actualBoundingBoxDescent);
      }
    }
  } else {
    width = Math.max(0, ...lines.map((line) => textWidth(line, object.fontSize, object.letterSpacing, (value) => fallbackTextWidth(value, object.fontSize, object.fontWeight === 'bold'))));
  }
  if (ascent + descent === 0) { ascent = object.fontSize * .8; descent = object.fontSize * .2; }
  width = Math.max(2, width);
  const x = object.align === 'center' ? object.position.x - width / 2 : object.align === 'right' || object.align === 'end' ? object.position.x - width : object.position.x;
  return { x, y: object.position.y - ascent, w: width, h: ascent + descent + Math.max(0, lines.length - 1) * textLineHeight(object.fontSize, object.lineHeight) };
}

export function annotationBounds(object: Annotation): Rect {
  if ('rect' in object) return object.rect;
  if ('start' in object) return rectFromPoints(object.start, object.end);
  if (isPathAnnotation(object)) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const point of object.points) {
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
  if (object.type === 'counter') return { x: object.position.x - object.radius, y: object.position.y - object.radius, w: object.radius * 2, h: object.radius * 2 };
  return textBounds(object);
}

export function annotationVisualBounds(object: Annotation): Rect {
  const bounds = annotationBounds(object);
  const padding = object.type === 'text' || object.type === 'image' || object.style.stroke === false ? 0 : object.style.width / 2;
  const expanded = { x: bounds.x - padding, y: bounds.y - padding, w: bounds.w + padding * 2, h: bounds.h + padding * 2 };
  const rotation = object.rotation ?? 0;
  if (!rotation) return expanded;
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const corners = [
    { x: expanded.x, y: expanded.y },
    { x: expanded.x + expanded.w, y: expanded.y },
    { x: expanded.x + expanded.w, y: expanded.y + expanded.h },
    { x: expanded.x, y: expanded.y + expanded.h },
  ].map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return { x: center.x + dx * Math.cos(rotation) - dy * Math.sin(rotation), y: center.y + dx * Math.sin(rotation) + dy * Math.cos(rotation) };
  });
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function annotationHandles(object: Annotation): { handle: AnnotationHandle; point: Point }[] {
  if ('start' in object) {
    const bounds = annotationBounds(object);
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    const dx = object.end.x - object.start.x;
    const dy = object.end.y - object.start.y;
    const length = Math.hypot(dx, dy) || 1;
    const rotateDistance = object.style.width / 2 + 24;
    const handles: { handle: AnnotationHandle; point: Point }[] = [
      { handle: 'start', point: object.start },
      { handle: 'end', point: object.end },
      { handle: 'rotate', point: { x: center.x + dy / length * rotateDistance, y: center.y - dx / length * rotateDistance } },
    ];
    if (!object.rotation && !object.flipX && !object.flipY) return handles;
    return handles.map(({ handle, point }) => {
      const offsetX = (point.x - center.x) * (object.flipX ? -1 : 1);
      const offsetY = (point.y - center.y) * (object.flipY ? -1 : 1);
      const rotation = object.rotation ?? 0;
      return { handle, point: { x: center.x + offsetX * Math.cos(rotation) - offsetY * Math.sin(rotation), y: center.y + offsetX * Math.sin(rotation) + offsetY * Math.cos(rotation) } };
    });
  }
  const { x, y, w, h } = annotationBounds(object);
  const rotatePadding = object.type === 'text' || object.type === 'image' || object.style.stroke === false ? 0 : object.style.width / 2;
  const handles: { handle: AnnotationHandle; point: Point }[] = [
    { handle: 'nw', point: { x, y } },
    { handle: 'n', point: { x: x + w / 2, y } },
    { handle: 'ne', point: { x: x + w, y } },
    { handle: 'e', point: { x: x + w, y: y + h / 2 } },
    { handle: 'se', point: { x: x + w, y: y + h } },
    { handle: 's', point: { x: x + w / 2, y: y + h } },
    { handle: 'sw', point: { x, y: y + h } },
    { handle: 'w', point: { x, y: y + h / 2 } },
    { handle: 'rotate', point: { x: x + w / 2, y: y - rotatePadding - 24 } },
  ];
  if (!object.rotation && !object.flipX && !object.flipY) return handles;
  const center = { x: x + w / 2, y: y + h / 2 };
  return handles.map(({ handle, point }) => {
    const dx = (point.x - center.x) * (object.flipX ? -1 : 1);
    const dy = (point.y - center.y) * (object.flipY ? -1 : 1);
    const rotation = object.rotation ?? 0;
    return { handle, point: { x: center.x + dx * Math.cos(rotation) - dy * Math.sin(rotation), y: center.y + dx * Math.sin(rotation) + dy * Math.cos(rotation) } };
  });
}

export function hitHandle(object: Annotation, point: Point, tolerance: number): AnnotationHandle | null {
  return annotationHandles(object).find(({ point: handle }) => Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance)?.handle ?? null;
}

function constrainLineEnd(anchor: Point, point: Point): Point {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return { x: anchor.x + Math.cos(angle) * length, y: anchor.y + Math.sin(angle) * length };
}

export function resizeFromHandle(object: Annotation, handle: AnnotationHandle, point: Point, options: ResizeOptions = {}): Annotation {
  if (handle === 'rotate') return object;
  if ('start' in object) {
    const movingStart = handle === 'start';
    const transformedHandles = annotationHandles(object);
    const visualStart = transformedHandles.find((item) => item.handle === 'start')!.point;
    const visualEnd = transformedHandles.find((item) => item.handle === 'end')!.point;
    let nextStart: Point;
    let nextEnd: Point;
    if (options.fromCenter) {
      const center = { x: (visualStart.x + visualEnd.x) / 2, y: (visualStart.y + visualEnd.y) / 2 };
      const next = options.constrainProportions ? constrainLineEnd(center, point) : point;
      const opposite = { x: center.x * 2 - next.x, y: center.y * 2 - next.y };
      nextStart = movingStart ? next : opposite;
      nextEnd = movingStart ? opposite : next;
    } else {
      const anchor = movingStart ? visualEnd : visualStart;
      const next = options.constrainProportions ? constrainLineEnd(anchor, point) : point;
      nextStart = movingStart ? next : visualStart;
      nextEnd = movingStart ? visualEnd : next;
    }
    const center = { x: (nextStart.x + nextEnd.x) / 2, y: (nextStart.y + nextEnd.y) / 2 };
    const toLocal = (visual: Point): Point => {
      const dx = visual.x - center.x;
      const dy = visual.y - center.y;
      const rotation = object.rotation ?? 0;
      let x = center.x + dx * Math.cos(rotation) + dy * Math.sin(rotation);
      let y = center.y - dx * Math.sin(rotation) + dy * Math.cos(rotation);
      if (object.flipX) x = center.x * 2 - x;
      if (object.flipY) y = center.y * 2 - y;
      return { x, y };
    };
    return { ...object, start: toLocal(nextStart), end: toLocal(nextEnd) };
  }
  point = pointInObjectSpace(object, point);
  const bounds = annotationBounds(object);
  let { x: left, y: top } = bounds;
  let right = left + bounds.w;
  let bottom = top + bounds.h;
  const horizontal = handle.includes('w') || handle.includes('e');
  const vertical = handle.includes('n') || handle.includes('s');
  const center = { x: left + bounds.w / 2, y: top + bounds.h / 2 };
  if (options.fromCenter) {
    if (horizontal) {
      const halfWidth = Math.abs(point.x - center.x);
      left = center.x - halfWidth;
      right = center.x + halfWidth;
    }
    if (vertical) {
      const halfHeight = Math.abs(point.y - center.y);
      top = center.y - halfHeight;
      bottom = center.y + halfHeight;
    }
  } else {
    if (handle.includes('w')) left = point.x;
    if (handle.includes('e')) right = point.x;
    if (handle.includes('n')) top = point.y;
    if (handle.includes('s')) bottom = point.y;
  }
  let resized = rectFromPoints({ x: left, y: top }, { x: right, y: bottom });
  if (options.constrainProportions && bounds.w > 0 && bounds.h > 0) {
    const ratio = bounds.w / bounds.h;
    if (horizontal && vertical) {
      const anchor = options.fromCenter ? center : {
        x: handle.includes('w') ? bounds.x + bounds.w : bounds.x,
        y: handle.includes('n') ? bounds.y + bounds.h : bounds.y,
      };
      const signX = handle.includes('w') ? -1 : 1;
      const signY = handle.includes('n') ? -1 : 1;
      const diagonal = Math.hypot(bounds.w, bounds.h);
      const unit = { x: signX * bounds.w / diagonal, y: signY * bounds.h / diagonal };
      const distance = Math.max(0, (point.x - anchor.x) * unit.x + (point.y - anchor.y) * unit.y);
      const multiplier = options.fromCenter ? 2 : 1;
      resized.w = distance * bounds.w / diagonal * multiplier;
      resized.h = resized.w / ratio;
      resized.x = options.fromCenter ? center.x - resized.w / 2 : (handle.includes('w') ? anchor.x - resized.w : anchor.x);
      resized.y = options.fromCenter ? center.y - resized.h / 2 : (handle.includes('n') ? anchor.y - resized.h : anchor.y);
    } else if (horizontal) {
      resized.h = resized.w / ratio;
      resized.y = center.y - resized.h / 2;
    } else if (vertical) {
      resized.w = resized.h * ratio;
      resized.x = center.x - resized.w / 2;
    }
  }
  if ('rect' in object) return { ...object, rect: resized };
  const sx = bounds.w ? resized.w / bounds.w : 1;
  const sy = bounds.h ? resized.h / bounds.h : 1;
  const map = (value: Point): Point => ({ x: resized.x + (value.x - bounds.x) * sx, y: resized.y + (value.y - bounds.y) * sy });
  if (isPathAnnotation(object)) return { ...object, points: object.points.map(map) };
  if (object.type === 'counter') return { ...object, position: map(object.position), radius: object.radius * (sx + sy) / 2 };
  return { ...object, position: map(object.position), fontSize: Math.ceil(object.fontSize * (sx + sy) / 2) };
}

export function pointInObjectSpace(object: Annotation, point: Point): Point {
  if (!object.rotation && !object.flipX && !object.flipY) return point;
  const bounds = annotationBounds(object);
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const rotation = object.rotation ?? 0;
  const local = {
    x: center.x + dx * Math.cos(rotation) + dy * Math.sin(rotation),
    y: center.y - dx * Math.sin(rotation) + dy * Math.cos(rotation),
  };
  if (object.flipX) local.x = center.x * 2 - local.x;
  if (object.flipY) local.y = center.y * 2 - local.y;
  return local;
}
