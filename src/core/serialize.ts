import type { Annotation, AnnotationStyle, CounterAnnotation, Scene, Tool } from './types';
import type { Point, Rect, Viewport } from './geometry';
import { SYMBOLS } from './symbols';

export const PROJECT_VERSION = 1;
export const MAX_PROJECT_FILE_BYTES = 110_000_000;
export const MAX_PROJECT_IMAGE_DATA_LENGTH = 100_000_000;

export function projectImageDataLength(scene: Pick<Scene, 'image' | 'objects' | 'watermark'>): number {
  return (scene.image?.dataUrl.length ?? 0)
    + scene.objects.reduce((total, object) => total + (object.type === 'image' ? object.dataUrl.length : 0), 0)
    + (scene.watermark?.kind === 'image' ? scene.watermark.dataUrl.length : 0);
}

export interface SerializedScene {
  version: typeof PROJECT_VERSION;
  image: { dataUrl: string; width: number; height: number } | null;
  viewport: Viewport;
  objects: Annotation[];
  activeTool: Tool;
  selectedId: string | null;
  toolStyle: AnnotationStyle;
  crop: Rect | null;
  border: Scene['border'];
  watermark: Scene['watermark'];
  showOverflow?: boolean;
  symbolName: Scene['symbolName'];
  symbolPoints?: number;
  symbolInnerRatio?: number;
  symbolSides?: number;
  arrowStartHead?: Scene['arrowStartHead'];
  arrowEndHead?: Scene['arrowEndHead'];
  fontFamily: string;
  fontSize: number;
  letterSpacing?: number;
  lineHeight?: number;
  fontWeight: Scene['fontWeight'];
  fontStyle?: Scene['fontStyle'];
  textUnderline?: boolean;
  textAlign: Scene['textAlign'];
  redactionMode: Scene['redactionMode'];
  redactionStrength: number;
  counterShape: Scene['counterShape'];
  counterFilled: boolean;
  counterSize: number;
  counterFormat?: Scene['counterFormat'];
  counterNext?: number;
  counterFontSize?: number;
  counterFontFamily?: string;
  counterTextColor?: string;
  counterFontWeight?: Scene['counterFontWeight'];
  counterFontStyle?: Scene['counterFontStyle'];
  counterUnderline?: boolean;
}

const tools: Tool[] = ['select', 'pan', 'rect', 'ellipse', 'line', 'arrow', 'pen', 'highlighter', 'text', 'counter', 'redaction', 'crop', 'image', 'symbol'];
const symbols = Object.keys(SYMBOLS);
const arrowHeads = ['none', 'open', 'triangle', 'stealth', 'circle'];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function point(value: unknown): value is Point {
  return record(value) && finite(value.x) && Math.abs(value.x) <= 1_000_000
    && finite(value.y) && Math.abs(value.y) <= 1_000_000;
}

function rect(value: unknown): value is Rect {
  return record(value) && finite(value.x) && Math.abs(value.x) <= 1_000_000
    && finite(value.y) && Math.abs(value.y) <= 1_000_000
    && finite(value.w) && value.w >= 0 && value.w <= 1_000_000
    && finite(value.h) && value.h >= 0 && value.h <= 1_000_000;
}

function style(value: unknown): value is AnnotationStyle {
  return record(value)
    && typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
    && finite(value.width) && value.width > 0
    && finite(value.opacity) && value.opacity >= 0 && value.opacity <= 1
    && (value.fill === undefined || value.fill === null || (typeof value.fill === 'string' && /^#[0-9a-f]{6}$/i.test(value.fill)))
    && (value.stroke === undefined || typeof value.stroke === 'boolean')
    && (value.lineCap === undefined || value.lineCap === 'butt' || value.lineCap === 'round' || value.lineCap === 'square')
    && (value.lineJoin === undefined || value.lineJoin === 'round' || value.lineJoin === 'miter' || value.lineJoin === 'bevel');
}

function annotation(value: unknown): value is Annotation {
  if (!record(value) || typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 128 || !style(value.style)) return false;
  if ((value.layerName !== undefined && (typeof value.layerName !== 'string' || value.layerName.length > 80))
    || (value.locked !== undefined && typeof value.locked !== 'boolean')
    || (value.hidden !== undefined && typeof value.hidden !== 'boolean')
    || (value.rotation !== undefined && (!finite(value.rotation) || Math.abs(value.rotation) > Math.PI * 100))
    || (value.flipX !== undefined && typeof value.flipX !== 'boolean')
    || (value.flipY !== undefined && typeof value.flipY !== 'boolean')) return false;
  if (value.type === 'rect' || value.type === 'ellipse') return rect(value.rect);
  if (value.type === 'image') return rect(value.rect) && typeof value.dataUrl === 'string' && value.dataUrl.startsWith('data:image/');
  if (value.type === 'symbol') return rect(value.rect) && typeof value.name === 'string' && symbols.includes(value.name)
    && (value.paint === undefined || value.paint === 'separate')
    && (value.points === undefined || finite(value.points)) && (value.innerRatio === undefined || finite(value.innerRatio))
    && (value.sides === undefined || finite(value.sides));
  if (value.type === 'line' || value.type === 'arrow') return point(value.start) && point(value.end)
    && (value.startHead === undefined || arrowHeads.includes(String(value.startHead)))
    && (value.endHead === undefined || arrowHeads.includes(String(value.endHead)));
  if (value.type === 'pen' || value.type === 'highlighter') return Array.isArray(value.points) && value.points.length > 0 && value.points.length <= 100_000 && value.points.every(point);
  if (value.type === 'text') return point(value.position)
    && typeof value.text === 'string' && value.text.length <= 10_000
    && typeof value.fontFamily === 'string' && value.fontFamily.length <= 200
    && finite(value.fontSize) && value.fontSize > 0 && value.fontSize <= 1_000
    && (value.letterSpacing === undefined || finite(value.letterSpacing))
    && (value.lineHeight === undefined || finite(value.lineHeight))
    && (value.fontWeight === 'normal' || value.fontWeight === 'bold')
    && (value.fontStyle === undefined || value.fontStyle === 'normal' || value.fontStyle === 'italic')
    && (value.underline === undefined || typeof value.underline === 'boolean')
    && ['left', 'right', 'center', 'start', 'end', 'justify'].includes(String(value.align));
  if (value.type === 'counter') return point(value.position) && Number.isInteger(value.n) && finite(value.radius) && value.radius > 0
    && (value.shape === undefined || value.shape === 'circle' || value.shape === 'square' || value.shape === 'diamond')
    && (value.filled === undefined || typeof value.filled === 'boolean')
    && (value.fontFamily === undefined || (typeof value.fontFamily === 'string' && value.fontFamily.length <= 200))
    && (value.fontSize === undefined || (finite(value.fontSize) && value.fontSize > 0 && value.fontSize <= 1_000))
    && (value.textColor === undefined || (typeof value.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.textColor)))
    && (value.format === undefined || value.format === 'numeric' || value.format === 'alpha' || value.format === 'roman')
    && (value.paint === undefined || value.paint === 'separate')
    && (value.fontWeight === undefined || value.fontWeight === 'normal' || value.fontWeight === 'bold')
    && (value.fontStyle === undefined || value.fontStyle === 'normal' || value.fontStyle === 'italic')
    && (value.underline === undefined || typeof value.underline === 'boolean');
  if (value.type === 'redaction') return rect(value.rect) && (value.mode === 'pixelate' || value.mode === 'blur' || value.mode === 'solid') && finite(value.strength) && value.strength > 0 && value.strength <= 100;
  return false;
}

function valid(value: unknown): value is SerializedScene {
  if (!record(value) || value.version !== PROJECT_VERSION) return false;
  const image = value.image;
  const validImage = image === null || (record(image)
    && typeof image.dataUrl === 'string' && image.dataUrl.startsWith('data:image/') && image.dataUrl.length <= MAX_PROJECT_IMAGE_DATA_LENGTH
    && finite(image.width) && image.width > 0 && image.width <= 32_768
    && finite(image.height) && image.height > 0 && image.height <= 32_768
    && image.width * image.height <= 268_000_000);
  const validCrop = value.crop === null || (rect(value.crop) && image !== null && record(image)
    && value.crop.x >= 0 && value.crop.y >= 0 && value.crop.x + value.crop.w <= Number(image.width) && value.crop.y + value.crop.h <= Number(image.height));
  if (!Array.isArray(value.objects) || value.objects.length > 10_000) return false;
  const objectIds = value.objects.map((object) => record(object) ? object.id : undefined);
  if (new Set(objectIds).size !== objectIds.length) return false;
  const imageDataLength = (record(image) && typeof image.dataUrl === 'string' ? image.dataUrl.length : 0)
    + value.objects.reduce((total, object) => total + (record(object) && object.type === 'image' && typeof object.dataUrl === 'string' ? object.dataUrl.length : 0), 0)
    + (record(value.watermark) && value.watermark.kind === 'image' && typeof value.watermark.dataUrl === 'string' ? value.watermark.dataUrl.length : 0);
  if (imageDataLength > MAX_PROJECT_IMAGE_DATA_LENGTH) return false;
  return validImage
    && record(value.viewport) && finite(value.viewport.scale) && value.viewport.scale > 0
    && finite(value.viewport.tx) && finite(value.viewport.ty)
    && value.objects.every(annotation)
    && typeof value.activeTool === 'string' && tools.includes(value.activeTool as Tool)
    && (value.selectedId === null || typeof value.selectedId === 'string')
    && style(value.toolStyle)
    && validCrop
    && (value.border === null || (record(value.border) && finite(value.border.width) && value.border.width >= 0 && value.border.width <= 2_000 && typeof value.border.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.border.color)))
    && (value.watermark === null || (record(value.watermark)
      && ((value.watermark.kind === 'text' && typeof value.watermark.text === 'string' && value.watermark.text.length <= 1_000
        && finite(value.watermark.size) && value.watermark.size > 0 && value.watermark.size <= 1_000 && typeof value.watermark.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.watermark.color)
        && (value.watermark.fontFamily === undefined || (typeof value.watermark.fontFamily === 'string' && value.watermark.fontFamily.length <= 200))
        && (value.watermark.fontWeight === undefined || value.watermark.fontWeight === 'normal' || value.watermark.fontWeight === 'bold')
        && (value.watermark.fontStyle === undefined || value.watermark.fontStyle === 'normal' || value.watermark.fontStyle === 'italic'))
        || (value.watermark.kind === 'image' && typeof value.watermark.dataUrl === 'string' && value.watermark.dataUrl.startsWith('data:image/')
          && finite(value.watermark.scale) && value.watermark.scale > 0 && value.watermark.scale <= 1))
      && finite(value.watermark.opacity) && value.watermark.opacity >= 0 && value.watermark.opacity <= 1 && typeof value.watermark.tile === 'boolean'
      && (value.watermark.angle === undefined || (finite(value.watermark.angle) && value.watermark.angle >= -180 && value.watermark.angle <= 180))))
    && (value.showOverflow === undefined || typeof value.showOverflow === 'boolean')
    && typeof value.symbolName === 'string' && symbols.includes(value.symbolName)
    && (value.symbolPoints === undefined || finite(value.symbolPoints))
    && (value.symbolInnerRatio === undefined || finite(value.symbolInnerRatio))
    && (value.symbolSides === undefined || finite(value.symbolSides))
    && (value.arrowStartHead === undefined || arrowHeads.includes(String(value.arrowStartHead)))
    && (value.arrowEndHead === undefined || arrowHeads.includes(String(value.arrowEndHead)))
    && typeof value.fontFamily === 'string' && value.fontFamily.length <= 200
    && finite(value.fontSize) && value.fontSize > 0 && value.fontSize <= 1_000
    && (value.letterSpacing === undefined || finite(value.letterSpacing))
    && (value.lineHeight === undefined || finite(value.lineHeight))
    && (value.fontWeight === 'normal' || value.fontWeight === 'bold')
    && (value.fontStyle === undefined || value.fontStyle === 'normal' || value.fontStyle === 'italic')
    && (value.textUnderline === undefined || typeof value.textUnderline === 'boolean')
    && ['left', 'right', 'center', 'start', 'end', 'justify'].includes(String(value.textAlign))
    && (value.redactionMode === 'pixelate' || value.redactionMode === 'blur' || value.redactionMode === 'solid')
    && finite(value.redactionStrength) && value.redactionStrength > 0 && value.redactionStrength <= 100
    && (value.counterShape === undefined || value.counterShape === 'circle' || value.counterShape === 'square' || value.counterShape === 'diamond')
    && (value.counterFilled === undefined || typeof value.counterFilled === 'boolean')
    && (value.counterSize === undefined || (finite(value.counterSize) && value.counterSize > 0 && value.counterSize <= 200))
    && (value.counterFormat === undefined || value.counterFormat === 'numeric' || value.counterFormat === 'alpha' || value.counterFormat === 'roman')
    && (value.counterNext === undefined || (Number.isInteger(value.counterNext) && finite(value.counterNext) && value.counterNext >= 1 && value.counterNext <= 9_999))
    && (value.counterFontSize === undefined || (finite(value.counterFontSize) && value.counterFontSize > 0 && value.counterFontSize <= 1_000))
    && (value.counterFontFamily === undefined || (typeof value.counterFontFamily === 'string' && value.counterFontFamily.length <= 200))
    && (value.counterTextColor === undefined || (typeof value.counterTextColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.counterTextColor)))
    && (value.counterFontWeight === undefined || value.counterFontWeight === 'normal' || value.counterFontWeight === 'bold')
    && (value.counterFontStyle === undefined || value.counterFontStyle === 'normal' || value.counterFontStyle === 'italic')
    && (value.counterUnderline === undefined || typeof value.counterUnderline === 'boolean');
}

export function serializeScene(scene: Scene): string {
  const dto: SerializedScene = {
    version: PROJECT_VERSION,
    image: scene.image && { dataUrl: scene.image.dataUrl, width: scene.image.width, height: scene.image.height },
    viewport: scene.viewport,
    objects: scene.objects,
    activeTool: scene.activeTool,
    selectedId: scene.selectedId,
    toolStyle: scene.toolStyle,
    crop: scene.crop,
    border: scene.border,
    watermark: scene.watermark,
    showOverflow: scene.showOverflow,
    symbolName: scene.symbolName,
    symbolPoints: scene.symbolPoints,
    symbolInnerRatio: scene.symbolInnerRatio,
    symbolSides: scene.symbolSides,
    arrowStartHead: scene.arrowStartHead,
    arrowEndHead: scene.arrowEndHead,
    fontFamily: scene.fontFamily,
    fontSize: scene.fontSize,
    letterSpacing: scene.letterSpacing,
    lineHeight: scene.lineHeight,
    fontWeight: scene.fontWeight,
    fontStyle: scene.fontStyle,
    textUnderline: scene.textUnderline,
    textAlign: scene.textAlign,
    redactionMode: scene.redactionMode,
    redactionStrength: scene.redactionStrength,
    counterShape: scene.counterShape,
    counterFilled: scene.counterFilled,
    counterSize: scene.counterSize,
    counterFormat: scene.counterFormat,
    counterNext: scene.counterNext,
    counterFontSize: scene.counterFontSize,
    counterFontFamily: scene.counterFontFamily,
    counterTextColor: scene.counterTextColor,
    counterFontWeight: scene.counterFontWeight,
    counterFontStyle: scene.counterFontStyle,
    counterUnderline: scene.counterUnderline,
  };
  dto.objects = dto.objects.map((object) => object.type === 'image' ? { ...object, source: undefined } : object);
  if (dto.watermark?.kind === 'image') dto.watermark = { ...dto.watermark, source: undefined };
  if (projectImageDataLength(scene) > MAX_PROJECT_IMAGE_DATA_LENGTH) throw new Error('Project image data is too large');
  const json = JSON.stringify(dto);
  if (new Blob([json]).size > MAX_PROJECT_FILE_BYTES) throw new Error('Project is too large');
  return json;
}

export function parseScene(json: string): SerializedScene & Pick<Scene, 'arrowStartHead' | 'arrowEndHead' | 'letterSpacing' | 'lineHeight' | 'symbolPoints' | 'symbolInnerRatio' | 'symbolSides' | 'counterFontWeight' | 'counterFontStyle' | 'counterUnderline'> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('Invalid imagemarkup project JSON');
  }
  if (!valid(value)) throw new Error('Invalid or unsupported imagemarkup project');
  return {
    ...value,
    fontSize: Math.ceil(value.fontSize),
    letterSpacing: Math.max(-200, Math.min(1000, Math.round(value.letterSpacing ?? 0))),
    lineHeight: Math.max(0.5, Math.min(3, value.lineHeight ?? 1.2)),
    symbolPoints: Math.max(3, Math.min(24, Math.round(value.symbolPoints ?? 5))),
    symbolInnerRatio: Math.max(0.2, Math.min(0.9, value.symbolInnerRatio ?? 0.43)),
    symbolSides: Math.max(3, Math.min(12, Math.round(value.symbolSides ?? 6))),
    showOverflow: value.showOverflow ?? false,
    arrowStartHead: value.arrowStartHead ?? 'none',
    arrowEndHead: value.arrowEndHead ?? 'open',
    counterFontWeight: value.counterFontWeight ?? 'bold',
    counterFontStyle: value.counterFontStyle ?? 'normal',
    counterUnderline: value.counterUnderline ?? false,
    objects: value.objects.map((object) => object.type === 'counter' ? separateCounterPaint(object) : object.type === 'text'
      ? { ...object, fontSize: Math.ceil(object.fontSize), letterSpacing: Math.max(-200, Math.min(1000, Math.round(object.letterSpacing ?? 0))), lineHeight: Math.max(0.5, Math.min(3, object.lineHeight ?? 1.2)) }
      : object.type === 'symbol'
        ? { ...object, ...(object.points === undefined ? {} : { points: Math.max(3, Math.min(24, Math.round(object.points))) }), ...(object.innerRatio === undefined ? {} : { innerRatio: Math.max(0.2, Math.min(0.9, object.innerRatio)) }), ...(object.sides === undefined ? {} : { sides: Math.max(3, Math.min(12, Math.round(object.sides))) }) }
        : object),
  };
}

/** Converts a legacy single-color counter into the separate fill and border model without changing how it looks. */
function separateCounterPaint(counter: CounterAnnotation): CounterAnnotation {
  if (counter.paint === 'separate') return { ...counter, fontWeight: counter.fontWeight ?? 'bold' };
  const { filled = true, ...rest } = counter;
  return {
    ...rest,
    paint: 'separate',
    fontWeight: counter.fontWeight ?? 'bold',
    textColor: counter.textColor ?? (filled ? '#ffffff' : counter.style.color),
    style: filled
      ? { ...counter.style, fill: counter.style.color, stroke: false }
      : { ...counter.style, fill: null, stroke: true, width: Math.max(2, counter.style.width) },
  };
}
