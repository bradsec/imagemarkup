import { annotationBounds } from '../core/annotations';
import type { Annotation, Scene, Tool } from '../core/types';
import { drawAnnotation } from '../render/renderer';
import { drawRedaction } from '../render/redaction';
import { makeToolAnnotation } from './canvas-interaction';

const SIZE = 80;
const PREVIEW_TOOLS: Tool[] = ['pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'text', 'counter', 'symbol', 'redaction'];

export interface PreviewScene {
  object: Annotation;
  /** Control value shown when the tile cannot draw the sample at true size. */
  sizeLabel: string | null;
}

// Largest sizes the 80px tile can draw at true scale; larger settings are drawn at the cap and labelled.
const WIDTH_CAP: Partial<Record<Tool, number>> = { pen: 20, highlighter: 24, line: 16, arrow: 8, rect: 14, ellipse: 14, symbol: 14 };
const FONT_CAP = 44;
const RADIUS_CAP = 30;

export function buildPreviewScene(scene: Scene, selected: Annotation | undefined): PreviewScene | null {
  if (selected?.locked) return null;
  const tool = selected?.type ?? scene.activeTool;
  if (!PREVIEW_TOOLS.includes(tool)) return null;
  const initial = makeToolAnnotation('options-preview', { ...scene, activeTool: tool }, { x: 40, y: 40 });
  const source = selected ?? initial;
  let label: number | null = null;
  const capped = (value: number, cap: number): number => {
    if (value <= cap) return value;
    label = value;
    return cap;
  };
  const outlined = source.type !== 'symbol' || source.paint !== 'separate' || source.style.stroke === true;
  const widthCap = outlined ? WIDTH_CAP[source.type] : undefined;
  const style = widthCap === undefined ? source.style : { ...source.style, width: capped(source.style.width, widthCap) };
  // Sample geometry never depends on size settings, so only the adjusted property changes in the tile.
  const object: Annotation = (() => {
    switch (source.type) {
      case 'pen':
        return { ...source, style, points: [{ x: 12, y: 52 }, { x: 21, y: 24 }, { x: 40, y: 27 }, { x: 59, y: 56 }, { x: 68, y: 28 }] };
      case 'highlighter': return { ...source, style, points: [{ x: 8, y: 41 }, { x: 72, y: 41 }] };
      case 'line': case 'arrow': return { ...source, style, start: { x: 14, y: 64 }, end: { x: 66, y: 16 } };
      case 'rect': case 'ellipse': case 'symbol': return { ...source, style, rect: { x: 20, y: 20, w: 40, h: 40 } };
      case 'text': return { ...source, position: { x: 16, y: 40 }, text: 'Aa', fontSize: capped(source.fontSize, FONT_CAP) };
      case 'counter': {
        const radius = capped(source.radius, RADIUS_CAP);
        const fontSize = (source.fontSize ?? 18) * radius / source.radius;
        return { ...source, position: { x: 40, y: 40 }, radius, fontSize };
      }
      case 'redaction': return { ...source, rect: { x: 8, y: 8, w: 64, h: 64 } };
      default: return source;
    }
  })();
  if (object.type === 'text') {
    const bounds = annotationBounds(object);
    object.position = { x: object.position.x + 40 - (bounds.x + bounds.w / 2), y: object.position.y + 40 - (bounds.y + bounds.h / 2) };
  }
  return { object, sizeLabel: label === null ? null : `${Math.round(label)} px` };
}

const LIGHT_TILE = '#ffffff';
const DARK_TILE = '#2b3036';

/** Tile background with enough contrast for the sample's main color; light marks get a dark tile. */
export function previewBackground(object: Annotation): string {
  const color = object.type === 'counter' && object.paint === 'separate' && object.style.fill ? object.style.fill : object.style.color;
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return LIGHT_TILE;
  const [r, g, b] = match.slice(1).map((hex) => parseInt(hex, 16) / 255);
  // Rec. 709 luma is enough to tell near-white marks from the rest.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.8 ? DARK_TILE : LIGHT_TILE;
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
    // Redaction and highlighter samples are drawn over dark sample text, so they keep the light tile.
    ctx.fillStyle = preview.object.type === 'redaction' || preview.object.type === 'highlighter' ? LIGHT_TILE : previewBackground(preview.object);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const { object } = preview;
    if (object.type === 'redaction') {
      const key = `${object.mode}:${object.strength}:${object.style.fill}:${pixels}`;
      if (key !== redactionKey || !redactionSample) {
        redactionSample = document.createElement('canvas');
        redactionSample.width = redactionSample.height = pixels;
        const sampleCtx = redactionSample.getContext('2d')!;
        sampleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Large color areas keep strong pixelate and blur settings visible in the tile.
        sampleCtx.fillStyle = '#ffffff'; sampleCtx.fillRect(0, 0, SIZE, SIZE);
        sampleCtx.fillStyle = '#e96655'; sampleCtx.fillRect(8, 40, 32, 32);
        sampleCtx.fillStyle = '#3a83bc'; sampleCtx.fillRect(40, 40, 32, 32);
        sampleCtx.fillStyle = '#1d2630'; sampleCtx.font = 'bold 14px sans-serif';
        sampleCtx.fillText('Sample', 9, 24); sampleCtx.fillText('123', 9, 38);
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
      // Dark sample text under the stroke shows the highlighter's blend and opacity.
      ctx.fillStyle = '#26333f'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Sample', 40, 41);
    }
    ctx.save();
    drawAnnotation(ctx, object);
    ctx.restore();
    if (preview.sizeLabel) {
      // Backing plate keeps the label legible over large or dark samples.
      ctx.font = '600 10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      const labelWidth = ctx.measureText(preview.sizeLabel).width;
      ctx.fillStyle = 'rgba(255, 255, 255, .88)';
      ctx.fillRect(76 - labelWidth - 4, 65, labelWidth + 6, 14);
      ctx.fillStyle = '#26333f';
      ctx.fillText(preview.sizeLabel, 77, 76);
    }
  }

  return () => { if (!frame) frame = requestAnimationFrame(draw); };
}
