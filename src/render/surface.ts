/** 2D context common to browser canvas, OffscreenCanvas, and @napi-rs/canvas. */
export type Ctx2D = CanvasRenderingContext2D;

export interface Surface {
  width: number;
  height: number;
  ctx: Ctx2D;
}
