import type { Point, Viewport } from './geometry';

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 40;

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/**
 * Scale around a screen-space anchor so the image point currently under the
 * anchor stays under it. `factor` is applied then clamped; translate uses the
 * effective (post-clamp) ratio so a clamped zoom does not drift.
 */
export function zoomAt(v: Viewport, anchor: Point, factor: number): Viewport {
  const scale = clampScale(v.scale * factor);
  const k = scale / v.scale;
  return {
    scale,
    tx: anchor.x - (anchor.x - v.tx) * k,
    ty: anchor.y - (anchor.y - v.ty) * k,
  };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { scale: v.scale, tx: v.tx + dx, ty: v.ty + dy };
}

/** Scale to fit (with padding) and center the image in the canvas. */
export function fitViewport(iw: number, ih: number, cw: number, ch: number, pad = 0.92): Viewport {
  const scale = clampScale(Math.min(cw / iw, ch / ih) * pad);
  return {
    scale,
    tx: (cw - iw * scale) / 2,
    ty: (ch - ih * scale) / 2,
  };
}
