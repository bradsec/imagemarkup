import { annotationBounds } from '../core/annotations';
import type { Point } from '../core/geometry';
import type { Scene } from '../core/types';
import { drawRedaction } from '../render/redaction';
import { drawAnnotation, drawArtwork } from '../render/renderer';
import { makeToolAnnotation } from './canvas-interaction';

export interface ToolPreview {
  /** Draws the hover preview for the active tool; `suppressed` hides it during gestures and space-pan. */
  draw(scene: Scene, hoverPoint: Point | null, suppressed: boolean): void;
}

export function createToolPreview(preview: HTMLCanvasElement): ToolPreview {
  const previewCtx = preview.getContext('2d')!;
  // Redaction previews reuse the composited source and tile until the scene or tool settings change.
  let redactionSource: CanvasImageSource | null = null;
  let sourceImage: Scene['image'] = null;
  let sourceObjects: Scene['objects'] | null = null;
  let redactionKey = '';
  let redactionTile: HTMLCanvasElement | null = null;

  function draw(scene: Scene, hoverPoint: Point | null, suppressed: boolean): void {
    previewCtx.clearRect(0, 0, preview.width, preview.height);
    const tool = scene.activeTool;
    preview.dataset.previewTool = tool;
    if (!scene.image) { redactionSource = null; redactionTile = null; sourceImage = null; sourceObjects = null; }
    if (!scene.image || suppressed || !['pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'redaction', 'text', 'counter', 'symbol'].includes(tool) || !hoverPoint) {
      preview.dataset.visible = 'false';
      return;
    }
    const point = hoverPoint;
    const object = makeToolAnnotation('preview', scene, point, true);
    const { scale, tx, ty } = scene.viewport;
    previewCtx.save();
    previewCtx.setTransform(scale, 0, 0, scale, tx, ty);
    previewCtx.beginPath();
    previewCtx.rect(0, 0, scene.image.width, scene.image.height);
    previewCtx.clip();
    if (object.type === 'redaction') {
      if (sourceImage !== scene.image || sourceObjects !== scene.objects || !redactionSource) {
        if (scene.objects.some((item) => !item.hidden)) {
          const snapshot = document.createElement('canvas');
          snapshot.width = scene.image.width;
          snapshot.height = scene.image.height;
          drawArtwork(snapshot.getContext('2d')!, scene, false);
          redactionSource = snapshot;
        } else {
          redactionSource = scene.image.source;
        }
        sourceImage = scene.image;
        sourceObjects = scene.objects;
        redactionKey = '';
      }
      const key = `${object.mode}:${object.strength}:${object.style.fill}:${object.rect.x}:${object.rect.y}:${object.rect.w}:${object.rect.h}`;
      if (key !== redactionKey || !redactionTile) {
        redactionTile = document.createElement('canvas');
        redactionTile.width = Math.ceil(object.rect.w);
        redactionTile.height = Math.ceil(object.rect.h);
        const bleed = 200;
        const origin = { x: object.rect.x - bleed, y: object.rect.y - bleed };
        const source = document.createElement('canvas');
        source.width = redactionTile.width + bleed * 2;
        source.height = redactionTile.height + bleed * 2;
        source.getContext('2d')!.drawImage(redactionSource, -origin.x, -origin.y);
        const tileCtx = redactionTile.getContext('2d')!;
        tileCtx.translate(-object.rect.x, -object.rect.y);
        tileCtx.drawImage(source, origin.x, origin.y);
        drawRedaction(tileCtx, object, source, origin);
        redactionKey = key;
      }
      previewCtx.drawImage(redactionTile, object.rect.x, object.rect.y);
      previewCtx.strokeStyle = '#ffffff';
      previewCtx.lineWidth = 1 / scale;
      previewCtx.strokeRect(object.rect.x, object.rect.y, object.rect.w, object.rect.h);
    } else if (object.type === 'counter' || object.type === 'symbol' || object.type === 'text') {
      drawAnnotation(previewCtx, { ...object, style: { ...object.style, opacity: object.style.opacity * .6 } });
    } else {
      const radius = Math.max(1, scene.toolStyle.width / 2);
      previewCtx.strokeStyle = scene.toolStyle.color;
      previewCtx.fillStyle = scene.toolStyle.color;
      previewCtx.globalAlpha = scene.toolStyle.opacity;
      previewCtx.lineWidth = 1 / scale;
      previewCtx.beginPath();
      previewCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      if (tool === 'pen' || tool === 'highlighter') previewCtx.fill();
      previewCtx.stroke();
      if (tool !== 'pen' && tool !== 'highlighter') {
        const arm = Math.max(radius + 5 / scale, 10 / scale);
        previewCtx.beginPath();
        previewCtx.moveTo(point.x - arm, point.y); previewCtx.lineTo(point.x + arm, point.y);
        previewCtx.moveTo(point.x, point.y - arm); previewCtx.lineTo(point.x, point.y + arm);
        previewCtx.stroke();
        if ((tool === 'rect' || tool === 'ellipse') && scene.toolStyle.fill) {
          previewCtx.fillStyle = scene.toolStyle.fill;
          previewCtx.globalAlpha = scene.toolStyle.opacity * .35;
          previewCtx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
        }
      }
    }
    if (matchMedia('(forced-colors: active)').matches) {
      const bounds = annotationBounds(object);
      const box = object.type === 'pen' || object.type === 'highlighter' || object.type === 'line' || object.type === 'arrow' || object.type === 'rect' || object.type === 'ellipse'
        ? { x: point.x - Math.max(5, scene.toolStyle.width), y: point.y - Math.max(5, scene.toolStyle.width), w: Math.max(10, scene.toolStyle.width * 2), h: Math.max(10, scene.toolStyle.width * 2) }
        : bounds;
      previewCtx.strokeStyle = 'CanvasText';
      previewCtx.lineWidth = 2 / scale;
      previewCtx.strokeRect(box.x, box.y, box.w, box.h);
    }
    previewCtx.restore();
    preview.dataset.visible = 'true';
  }

  return { draw };
}
