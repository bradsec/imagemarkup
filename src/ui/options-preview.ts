import type { Annotation, Scene, Tool } from '../core/types';
import { drawAnnotation } from '../render/renderer';
import { drawRedaction } from '../render/redaction';
import { makeToolAnnotation } from './canvas-host';

const SIZE = 80;
const PREVIEW_TOOLS: Tool[] = ['pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'text', 'counter', 'symbol', 'redaction'];

export interface PreviewScene {
  object: Annotation;
  scale: number;
  widthLabel: string | null;
}

export function buildPreviewScene(scene: Scene, selected: Annotation | undefined): PreviewScene | null {
  if (selected?.locked) return null;
  const tool = selected?.type ?? scene.activeTool;
  if (!PREVIEW_TOOLS.includes(tool)) return null;
  const initial = makeToolAnnotation('options-preview', { ...scene, activeTool: tool }, { x: 40, y: 40 }, true);
  const source = selected ?? initial;
  const object: Annotation = (() => {
    switch (source.type) {
      case 'pen': case 'highlighter':
        return { ...source, points: [{ x: 12, y: 52 }, { x: 21, y: 24 }, { x: 40, y: 27 }, { x: 59, y: 56 }, { x: 68, y: 28 }] };
      case 'line': case 'arrow': return { ...source, start: { x: 20, y: 59 }, end: { x: 60, y: 21 } };
      case 'rect': case 'ellipse': case 'symbol': return { ...source, rect: { x: 20, y: 20, w: 40, h: 40 } };
      case 'text': return { ...source, position: { x: 16, y: 34 }, text: 'Aa\nAa' };
      case 'counter': return { ...source, position: { x: 40, y: 40 } };
      case 'redaction': return { ...source, rect: { x: 8, y: 8, w: 64, h: 64 } };
      default: return source;
    }
  })();
  const width = object.style.width;
  const extent = object.type === 'counter' ? object.radius * 2
    : object.type === 'text' ? Math.max(object.fontSize * (object.lineHeight ?? 1.2) * 2, object.fontSize * 2.5 + Math.max(0, object.letterSpacing ?? 0) * 2)
    : object.type === 'arrow' ? 52 + width * 6
    : 52 + width;
  const scale = Math.min(1, 68 / extent);
  return { object, scale, widthLabel: width > 24 && object.type !== 'text' && object.type !== 'counter' && object.type !== 'redaction' ? `${Math.round(width)} px` : null };
}

export function mountOptionsPreview(tile: HTMLElement, canvas: HTMLCanvasElement, getScene: () => Scene, getSelected: () => Annotation | undefined): () => void {
  const ctx = canvas.getContext('2d')!;
  let frame = 0;
  let redactionKey = '';
  let redactionSample: HTMLCanvasElement | null = null;

  function draw(): void {
    frame = 0;
    const preview = buildPreviewScene(getScene(), getSelected());
    tile.hidden = !preview;
    if (!preview) return;
    const dpr = window.devicePixelRatio || 1;
    const pixels = Math.round(SIZE * dpr);
    if (canvas.width !== pixels || canvas.height !== pixels) { canvas.width = pixels; canvas.height = pixels; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const { object, scale } = preview;
    if (object.type === 'redaction') {
      const key = `${object.mode}:${object.strength}:${object.style.fill}:${pixels}`;
      if (key !== redactionKey || !redactionSample) {
        redactionSample = document.createElement('canvas');
        redactionSample.width = redactionSample.height = pixels;
        const sampleCtx = redactionSample.getContext('2d')!;
        sampleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sampleCtx.fillStyle = '#ffffff'; sampleCtx.fillRect(0, 0, SIZE, SIZE);
        sampleCtx.fillStyle = '#1d2630'; sampleCtx.font = 'bold 14px sans-serif';
        sampleCtx.fillText('Sample', 9, 32); sampleCtx.fillText('123 ABC', 9, 51);
        sampleCtx.fillStyle = '#e96655'; sampleCtx.fillRect(8, 59, 30, 9);
        sampleCtx.fillStyle = '#3a83bc'; sampleCtx.fillRect(40, 59, 32, 9);
        const source = document.createElement('canvas');
        source.width = source.height = pixels;
        source.getContext('2d')!.drawImage(redactionSample, 0, 0);
        sampleCtx.setTransform(1, 0, 0, 1, 0, 0);
        drawRedaction(sampleCtx, { ...object, rect: { x: 8 * dpr, y: 8 * dpr, w: 64 * dpr, h: 64 * dpr }, strength: object.strength * dpr }, source);
        redactionKey = key;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(redactionSample, 0, 0);
      return;
    }
    if (object.type === 'highlighter') {
      ctx.fillStyle = '#26333f'; ctx.font = 'bold 18px sans-serif';
      ctx.fillText('Sample', 8, 46);
    }
    ctx.save();
    ctx.translate(40, 40);
    ctx.scale(scale, scale);
    ctx.translate(-40, -40);
    drawAnnotation(ctx, object);
    ctx.restore();
    if (preview.widthLabel) {
      ctx.fillStyle = '#26333f'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(preview.widthLabel, 76, 76);
    }
  }

  return () => { if (!frame) frame = requestAnimationFrame(draw); };
}
