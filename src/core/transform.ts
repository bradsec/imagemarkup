import { annotationVisualBounds, rectFromPoints } from './annotations';
import type { Point, Rect } from './geometry';
import { isPathAnnotation, type Annotation } from './types';

export type FrameTransform = 'rotate-left' | 'rotate-right' | 'flip-horizontal' | 'flip-vertical';

export function transformPoint(point: Point, transform: FrameTransform, width: number, height: number): Point {
  if (transform === 'rotate-left') return { x: point.y, y: width - point.x };
  if (transform === 'rotate-right') return { x: height - point.y, y: point.x };
  if (transform === 'flip-horizontal') return { x: width - point.x, y: point.y };
  return { x: point.x, y: height - point.y };
}

function transformRect(rect: Rect, transform: FrameTransform, width: number, height: number): Rect {
  return rectFromPoints(
    transformPoint({ x: rect.x, y: rect.y }, transform, width, height),
    transformPoint({ x: rect.x + rect.w, y: rect.y + rect.h }, transform, width, height),
  );
}

export function transformAnnotation(object: Annotation, transform: FrameTransform, width: number, height: number): Annotation {
  if (object.type === 'image' || object.type === 'symbol') {
    const center = transformPoint({ x: object.rect.x + object.rect.w / 2, y: object.rect.y + object.rect.h / 2 }, transform, width, height);
    const base = { ...object, rect: { x: center.x - object.rect.w / 2, y: center.y - object.rect.h / 2, w: object.rect.w, h: object.rect.h } };
    if (transform === 'rotate-left' || transform === 'rotate-right') return { ...base, rotation: (object.rotation ?? 0) + (transform === 'rotate-right' ? Math.PI / 2 : -Math.PI / 2) };
    return transform === 'flip-horizontal'
      ? { ...base, rotation: -(object.rotation ?? 0), flipX: !object.flipX }
      : { ...base, rotation: -(object.rotation ?? 0), flipY: !object.flipY };
  }
  if (object.type === 'text') {
    const base = { ...object, position: transformPoint(object.position, transform, width, height) };
    if (transform === 'rotate-left' || transform === 'rotate-right') return { ...base, rotation: (object.rotation ?? 0) + (transform === 'rotate-right' ? Math.PI / 2 : -Math.PI / 2) };
    return transform === 'flip-horizontal'
      ? { ...base, rotation: -(object.rotation ?? 0), flipX: !object.flipX }
      : { ...base, rotation: -(object.rotation ?? 0), flipY: !object.flipY };
  }
  const rotation = transform.startsWith('flip-') && object.rotation ? { rotation: -object.rotation } : {};
  if ('rect' in object) return { ...object, ...rotation, rect: transformRect(object.rect, transform, width, height) };
  if ('start' in object) return { ...object, ...rotation, start: transformPoint(object.start, transform, width, height), end: transformPoint(object.end, transform, width, height) };
  if (isPathAnnotation(object)) return { ...object, ...rotation, points: object.points.map((point) => transformPoint(point, transform, width, height)) };
  return { ...object, ...rotation, position: transformPoint(object.position, transform, width, height) };
}

export function scaleAnnotation(object: Annotation, sx: number, sy: number): Annotation {
  const factor = (sx + sy) / 2;
  const style = { ...object.style, width: object.style.width * factor };
  if ('rect' in object) return { ...object, style, rect: { x: object.rect.x * sx, y: object.rect.y * sy, w: object.rect.w * sx, h: object.rect.h * sy } };
  if ('start' in object) return { ...object, style, start: { x: object.start.x * sx, y: object.start.y * sy }, end: { x: object.end.x * sx, y: object.end.y * sy } };
  if (isPathAnnotation(object)) return { ...object, style, points: object.points.map((point) => ({ x: point.x * sx, y: point.y * sy })) };
  if (object.type === 'counter') return { ...object, style, position: { x: object.position.x * sx, y: object.position.y * sy }, radius: object.radius * factor, fontSize: object.fontSize === undefined ? undefined : object.fontSize * factor };
  return { ...object, style, position: { x: object.position.x * sx, y: object.position.y * sy }, fontSize: Math.ceil(object.fontSize * factor) };
}

export function translateAnnotation(object: Annotation, dx: number, dy: number): Annotation {
  if ('rect' in object) return { ...object, rect: { ...object.rect, x: object.rect.x + dx, y: object.rect.y + dy } };
  if ('start' in object) return { ...object, start: { x: object.start.x + dx, y: object.start.y + dy }, end: { x: object.end.x + dx, y: object.end.y + dy } };
  if (isPathAnnotation(object)) return { ...object, points: object.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  return { ...object, position: { x: object.position.x + dx, y: object.position.y + dy } };
}

export function cropAnnotations(objects: Annotation[], crop: Rect): Annotation[] {
  return objects
    .filter((object) => {
      const bounds = annotationVisualBounds(object);
      return bounds.x < crop.x + crop.w && bounds.x + bounds.w > crop.x
        && bounds.y < crop.y + crop.h && bounds.y + bounds.h > crop.y;
    })
    .map((object) => translateAnnotation(object, -crop.x, -crop.y));
}
