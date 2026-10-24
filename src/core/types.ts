import type { Point, Rect, Viewport } from './geometry';

/** A decoded image ready to draw. `source` is any Canvas2D-drawable. */
export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dataUrl: string;
}

export type Tool = 'select' | 'pan' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'pen' | 'highlighter' | 'text' | 'counter' | 'redaction' | 'crop' | 'image' | 'symbol';
export type SymbolName =
  | 'check' | 'x' | 'star' | 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon'
  | 'exclamation' | 'question' | 'info' | 'warning' | 'plus' | 'minus' | 'heart'
  | 'arrow-up' | 'arrow-down' | 'arrow-left' | 'arrow-right'
  | 'lightning' | 'flag' | 'pin' | 'target' | 'speech' | 'eye'
  | 'hand-stop' | 'hand-point-left' | 'hand-point-right'
  | 'octagon' | 'rounded-square' | 'ring' | 'check-circle' | 'close-circle'
  | 'thumbs-up' | 'thumbs-down' | 'lock' | 'unlock' | 'bug' | 'lightbulb'
  | 'bell' | 'clock' | 'calendar' | 'search' | 'cursor' | 'home' | 'user' | 'mail' | 'link';
export type Watermark =
  | { kind: 'text'; text: string; size: number; color: string; opacity: number; tile: boolean; angle?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold'; fontStyle?: 'normal' | 'italic' }
  | { kind: 'image'; dataUrl: string; source?: CanvasImageSource; scale: number; opacity: number; tile: boolean; angle?: number };

export interface AnnotationStyle {
  color: string;
  width: number;
  opacity: number;
  fill?: string;
  stroke?: boolean;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
}

interface AnnotationBase {
  id: string;
  layerName?: string;
  style: AnnotationStyle;
  locked?: boolean;
  hidden?: boolean;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface ShapeAnnotation extends AnnotationBase {
  type: 'rect' | 'ellipse';
  rect: Rect;
}

export type ArrowHead = 'none' | 'open' | 'triangle' | 'stealth' | 'circle';

export interface LineAnnotation extends AnnotationBase {
  type: 'line' | 'arrow';
  start: Point;
  end: Point;
  startHead?: ArrowHead;
  endHead?: ArrowHead;
}

export interface PathAnnotation extends AnnotationBase {
  type: 'pen' | 'highlighter';
  points: Point[];
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  position: Point;
  text: string;
  fontFamily: string;
  fontSize: number;
  letterSpacing?: number;
  lineHeight?: number;
  fontWeight: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  align: TextAlign;
}

export type TextAlign = 'left' | 'center' | 'right' | 'start' | 'end' | 'justify';

export type CounterShape = 'circle' | 'square' | 'diamond';
export type CounterFormat = 'numeric' | 'alpha' | 'roman';

export interface CounterAnnotation extends AnnotationBase {
  type: 'counter';
  position: Point;
  n: number;
  radius: number;
  shape?: CounterShape;
  filled?: boolean;
  fontFamily?: string;
  fontSize?: number;
  format?: CounterFormat;
  textColor?: string;
}

export interface RedactionAnnotation extends AnnotationBase {
  type: 'redaction';
  rect: Rect;
  mode: 'pixelate' | 'blur';
  strength: number;
}

export interface PlacedImageAnnotation extends AnnotationBase {
  type: 'image';
  rect: Rect;
  dataUrl: string;
  source?: CanvasImageSource;
}

export interface SymbolAnnotation extends AnnotationBase {
  type: 'symbol';
  rect: Rect;
  name: SymbolName;
  points?: number;
  innerRatio?: number;
  sides?: number;
}

export type Annotation = ShapeAnnotation | LineAnnotation | PathAnnotation | TextAnnotation | CounterAnnotation | RedactionAnnotation | PlacedImageAnnotation | SymbolAnnotation;

export function isPathAnnotation(object: Annotation): object is PathAnnotation {
  return object.type === 'pen' || object.type === 'highlighter';
}

export interface Scene {
  image: LoadedImage | null;
  viewport: Viewport;
  objects: Annotation[];
  activeTool: Tool;
  selectedId: string | null;
  selectedIds: string[];
  marquee: Rect | null;
  toolStyle: AnnotationStyle;
  crop: Rect | null;
  border: { width: number; color: string } | null;
  watermark: Watermark | null;
  showOverflow: boolean;
  symbolName: SymbolName;
  symbolPoints: number;
  symbolInnerRatio: number;
  symbolSides: number;
  arrowStartHead: ArrowHead;
  arrowEndHead: ArrowHead;
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textUnderline: boolean;
  textAlign: TextAlign;
  redactionMode: 'pixelate' | 'blur';
  redactionStrength: number;
  counterShape: CounterShape;
  counterFilled: boolean;
  counterSize: number;
  counterFormat: CounterFormat;
  counterNext: number;
  counterFontSize: number;
  counterFontFamily: string;
  counterTextColor: string;
}

export function createScene(): Scene {
  return {
    image: null,
    viewport: { scale: 1, tx: 0, ty: 0 },
    objects: [],
    activeTool: 'select',
    selectedId: null,
    selectedIds: [],
    marquee: null,
    toolStyle: { color: '#ff3b30', width: 6, opacity: 1 },
    crop: null,
    border: null,
    watermark: null,
    showOverflow: false,
    symbolName: 'check',
    symbolPoints: 5,
    symbolInnerRatio: 0.43,
    symbolSides: 6,
    arrowStartHead: 'none',
    arrowEndHead: 'open',
    fontFamily: 'Kalam',
    fontSize: 32,
    letterSpacing: 0,
    lineHeight: 1.2,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textUnderline: false,
    textAlign: 'left',
    redactionMode: 'pixelate',
    redactionStrength: 10,
    counterShape: 'circle',
    counterFilled: true,
    counterSize: 18,
    counterFormat: 'numeric',
    counterNext: 1,
    counterFontSize: 18,
    counterFontFamily: 'system-ui',
    counterTextColor: '#ffffff',
  };
}
