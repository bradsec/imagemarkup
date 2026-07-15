import { screenToImage, type Point, type Viewport } from '../core/geometry';
import type { Annotation, LoadedImage, Scene } from '../core/types';
import { annotationBounds, appendPathPoints, createAnnotation, hitHandle, hitTest, moveAnnotation, rectFromPoints, resizeAnnotation, resizeFromHandle, type AnnotationHandle, type ResizeOptions } from '../core/annotations';
import { AnnotationHistory } from '../core/history';
import type { Store } from '../state/store';
import { decodeImageFile, fileFromDataTransfer } from '../io/load-image';
import { renderScene, type Surface } from '../render/renderer';
import { fitViewport, panBy, zoomAt } from '../core/viewport';
import { translateAnnotation } from '../core/transform';

const WHEEL_STEP = 0.0015;
const WHEEL_STEP_FINE = 0.0005;
const ROTATE_CURSOR = 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cg stroke=%22white%22 stroke-width=%224%22%3E%3Cpath d=%22M20 11a8 8 0 1 0-2.3 5.7%22/%3E%3Cpath d=%22M20 4v7h-7%22/%3E%3C/g%3E%3Cg stroke=%22%23171a1f%22 stroke-width=%222%22%3E%3Cpath d=%22M20 11a8 8 0 1 0-2.3 5.7%22/%3E%3Cpath d=%22M20 4v7h-7%22/%3E%3C/g%3E%3C/svg%3E") 12 12, crosshair';

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

const HANDLE_CURSORS: Record<AnnotationHandle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  rotate: ROTATE_CURSOR, start: 'move', end: 'move',
};

function rectsIntersect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
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

export interface CanvasHostOptions {
  host: HTMLElement;
  store: Store<Scene>;
  onStatus?: (text: string) => void;
}

export interface CanvasHost {
  setImage(img: LoadedImage): void;
  undo(): void;
  redo(): void;
  checkpoint(): void;
  checkpointScene(): void;
  setScene(scene: Scene): void;
  pickColor(callback: (color: string) => void): void;
  openImage(intent?: 'replace' | 'place'): void;
  duplicateSelected(): void;
  deleteSelected(): void;
}

export function mountCanvasHost({ host, store, onStatus }: CanvasHostOptions): CanvasHost {
  const canvas = document.createElement('canvas');
  host.insertBefore(canvas, host.firstChild);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const emptyState = host.querySelector<HTMLElement>('.empty-state');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;
  host.appendChild(fileInput);

  const surface = (): Surface => ({ width: canvas.width, height: canvas.height, ctx });
  let editingTextId: string | null = null;
  let syncTextEditor: (() => void) | null = null;
  let finishTextEditor: (() => void) | null = null;
  const draw = () => {
    syncTextEditor?.();
    const scene = store.get();
    // Hide the underlying text object while its inline editor is open, so the
    // canvas text and the textarea do not render on top of each other.
    const view = editingTextId
      ? {
          ...scene,
          objects: scene.objects.map((object) => object.id === editingTextId && object.type === 'text' ? { ...object, text: '' } : object),
          selectedId: scene.selectedId === editingTextId ? null : scene.selectedId,
          selectedIds: (scene.selectedIds ?? []).filter((id) => id !== editingTextId),
        }
      : scene;
    renderScene(surface(), view);
  };
  const history = new AnnotationHistory();
  let canvasSize: { width: number; height: number } | null = null;
  let fileIntent: 'replace' | 'place' = 'replace';
  let loadGeneration = 0;

  function restore(snapshot: Pick<Scene, 'image' | 'viewport' | 'objects' | 'crop' | 'border' | 'watermark'> | null): void {
    if (snapshot) store.set({ ...snapshot, selectedId: null, selectedIds: [], marquee: null });
  }

  function undo(): void {
    restore(history.undo(store.get()));
  }

  function redo(): void {
    restore(history.redo(store.get()));
  }

  function selectionIds(scene: Scene): string[] {
    return (scene.selectedIds ?? []).length ? scene.selectedIds : (scene.selectedId ? [scene.selectedId] : []);
  }

  function deleteSelected(): void {
    const scene = store.get();
    const ids = selectionIds(scene);
    if (!ids.length) return;
    const deletable = ids.filter((id) => !scene.objects.find((object) => object.id === id)?.locked);
    if (!deletable.length) { onStatus?.('Unlock the layer before deleting it'); return; }
    history.record(scene);
    const set = new Set(deletable);
    store.set({ objects: scene.objects.filter((object) => !set.has(object.id)), selectedId: null, selectedIds: [] });
    onStatus?.(deletable.length > 1 ? `${deletable.length} objects deleted` : 'Object deleted');
  }

  function duplicateSelected(): void {
    const scene = store.get();
    const selected = new Set(selectionIds(scene));
    if (!selected.size) return;
    const duplicates = scene.objects
      .filter((object) => selected.has(object.id))
      .map((object) => {
        const copy = translateAnnotation(object, 10, 10);
        return { ...copy, id: crypto.randomUUID(), style: { ...copy.style } };
      });
    if (!duplicates.length) return;
    history.record(scene);
    const duplicateIds = duplicates.map((object) => object.id);
    store.set({
      objects: [...scene.objects, ...duplicates],
      selectedId: duplicateIds.length === 1 ? duplicateIds[0] : null,
      selectedIds: duplicateIds.length > 1 ? duplicateIds : [],
      marquee: null,
    });
    onStatus?.(duplicates.length > 1 ? `${duplicates.length} objects duplicated` : 'Object duplicated');
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const next = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
    if (canvasSize?.width === next.width && canvasSize.height === next.height) return;
    const previous = canvasSize;
    canvasSize = next;
    canvas.width = next.width;
    canvas.height = next.height;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    const scene = store.get();
    if (previous && scene.image) {
      store.set({ viewport: panBy(scene.viewport, (next.width - previous.width) / 2, (next.height - previous.height) / 2) });
      return;
    }
    draw();
  }

  function anchorFromEvent(e: Pick<PointerEvent | WheelEvent, 'clientX' | 'clientY'>): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function editText(id: string, checkpoint = true, caretPoint?: Point): void {
    const before = store.get();
    const object = before.objects.find((item) => item.id === id);
    if (!object || object.type !== 'text') return;
    finishTextEditor?.();
    const textarea = document.createElement('textarea');
    let escaped = false;
    let finished = false;
    textarea.className = 'text-editor';
    textarea.setAttribute('aria-label', 'Edit text');
    textarea.value = object.text;
    host.appendChild(textarea);
    const measure = document.createElement('canvas').getContext('2d')!;
    const resizeEditor = () => {
      const scene = store.get();
      const current = scene.objects.find((item) => item.id === id);
      if (!current || current.type !== 'text') return;
      const { scale, tx, ty } = scene.viewport;
      const screen = { x: current.position.x * scale + tx, y: current.position.y * scale + ty };
      const lineHeight = current.fontSize * scale * 1.2;
      textarea.style.fontFamily = current.fontFamily;
      textarea.style.fontSize = `${current.fontSize * scale}px`;
      textarea.style.fontWeight = current.fontWeight;
      textarea.style.fontStyle = current.fontStyle ?? 'normal';
      textarea.style.textDecoration = current.underline ? 'underline' : 'none';
      textarea.style.color = current.style.color;
      textarea.style.opacity = String(current.style.opacity);
      textarea.style.textAlign = current.align;
      textarea.style.lineHeight = `${lineHeight}px`;
      textarea.style.top = `${screen.y - current.fontSize * scale * 0.8}px`;
      measure.font = `${current.fontStyle ?? 'normal'} ${current.fontWeight} ${current.fontSize * scale}px "${current.fontFamily}"`;
      const lines = textarea.value.split('\n');
      const measuredWidth = Math.max(2, ...lines.map((line) => measure.measureText(line || ' ').width + 2));
      const editorWidth = Math.min(measuredWidth, Math.max(2, host.clientWidth - 16));
      textarea.style.width = `${editorWidth}px`;
      textarea.style.height = `${Math.max(lineHeight, lines.length * lineHeight)}px`;
      const left = current.align === 'center' ? screen.x - editorWidth / 2 : current.align === 'right' || current.align === 'end' ? screen.x - editorWidth : screen.x;
      textarea.style.left = `${Math.max(4, Math.min(left, host.clientWidth - editorWidth - 4))}px`;
    };
    syncTextEditor = resizeEditor;
    resizeEditor();
    textarea.addEventListener('input', resizeEditor);
    const finish = () => {
      if (finished) return;
      finished = true;
      const text = textarea.value.trimEnd();
      if (checkpoint && text !== object.text) history.record(before);
      document.removeEventListener('pointerdown', finishFromOutside, true);
      document.removeEventListener('focusin', finishFromFocus, true);
      editingTextId = null;
      syncTextEditor = null;
      finishTextEditor = null;
      store.set({
        objects: text
          ? store.get().objects.map((item) => item.id === id && item.type === 'text' ? { ...item, text } : item)
          : store.get().objects.filter((item) => item.id !== id),
        selectedId: text && !escaped ? id : null,
        selectedIds: [],
      });
      textarea.remove();
    };
    const keepsEditorOpen = (target: EventTarget | null) => target instanceof Element
      && (target === textarea || Boolean(target.closest('.text-editor, .optionsbar')));
    function finishFromOutside(event: PointerEvent): void {
      if (!keepsEditorOpen(event.target)) finish();
    }
    function finishFromFocus(event: FocusEvent): void {
      if (!keepsEditorOpen(event.target)) finish();
    }
    finishTextEditor = finish;
    document.addEventListener('pointerdown', finishFromOutside, true);
    document.addEventListener('focusin', finishFromFocus, true);
    textarea.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      escaped = true;
      finish();
      colorCallback = null;
      delete host.dataset.eyedropper;
      store.set({ activeTool: 'select', selectedId: null, selectedIds: [], crop: null, marquee: null });
    });
    editingTextId = id;
    store.set({ selectedId: id, selectedIds: [], marquee: null });
    draw();
    textarea.focus();
    let caret = textarea.value.length;
    if (caretPoint) {
      const scene = store.get();
      const current = scene.objects.find((item) => item.id === id);
      if (current?.type === 'text') {
        const scale = scene.viewport.scale;
        const lineHeight = current.fontSize * scale * 1.2;
        const lines = textarea.value.split('\n');
        const top = Number.parseFloat(textarea.style.top);
        const left = Number.parseFloat(textarea.style.left);
        const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor((caretPoint.y - top) / lineHeight)));
        const line = lines[lineIndex];
        const editorWidth = Number.parseFloat(textarea.style.width);
        const lineWidth = measure.measureText(line).width;
        const textOffset = current.align === 'center' ? (editorWidth - lineWidth) / 2 : current.align === 'right' || current.align === 'end' ? editorWidth - lineWidth : 0;
        const x = caretPoint.x - left - textOffset;
        let column = 0;
        while (column < line.length && measure.measureText(line.slice(0, column + 1)).width < x) column++;
        caret = lines.slice(0, lineIndex).reduce((total, value) => total + value.length + 1, 0) + column;
      }
    }
    textarea.setSelectionRange(caret, caret);
  }

  function centerImage(img: LoadedImage): void {
    const rect = host.getBoundingClientRect();
    history.clear();
    store.set({
      image: img,
      viewport: fitViewport(img.width, img.height, rect.width || canvas.width, rect.height || canvas.height),
      objects: [],
      selectedId: null,
      selectedIds: [],
      marquee: null,
      crop: null,
      border: null,
      watermark: null,
    });
  }

  async function load(file: File, intent: 'replace' | 'place'): Promise<void> {
    const generation = ++loadGeneration;
    onStatus?.('Loading image...');
    try {
      const img = await decodeImageFile(file);
      if (generation !== loadGeneration) {
        (img.source as ImageBitmap).close?.();
        return;
      }
      const scene = store.get();
      if (scene.image && intent === 'place') {
        const maxWidth = scene.image.width / 2;
        const scale = Math.min(1, maxWidth / img.width);
        const w = img.width * scale;
        const h = img.height * scale;
        history.record(scene);
        const id = crypto.randomUUID();
        store.set({
          objects: [...scene.objects, { id, type: 'image', rect: { x: (scene.image.width - w) / 2, y: (scene.image.height - h) / 2, w, h }, dataUrl: img.dataUrl, source: img.source, style: { ...scene.toolStyle } }],
          selectedId: id,
          selectedIds: [],
          toolStyle: { ...scene.toolStyle, opacity: 1 },
        });
        onStatus?.('Image added');
        return;
      }
      centerImage(img);
      if (emptyState) emptyState.style.display = 'none';
      onStatus?.(`${img.width} x ${img.height}`);
    } catch {
      onStatus?.('Could not load that image');
    }
  }

  host.addEventListener('wheel', (e) => {
    if (!store.get().image) return;
    e.preventDefault();
    store.set({ viewport: wheelZoom(store.get(), anchorFromEvent(e), e.deltaY, e.ctrlKey) });
  }, { passive: false });

  type Gesture =
    | { kind: 'pan'; last: Point }
    | { kind: 'pinch'; points: [Point, Point] }
    | { kind: 'draw'; id: string; start: Point; before: Scene }
    | { kind: 'crop'; start: Point; before: Scene }
    | { kind: 'move'; ids: string[]; last: Point; before: Scene; changed: boolean }
    | { kind: 'marquee'; start: Point; additive: string[] }
    | { kind: 'resize'; id: string; handle: AnnotationHandle; object: Annotation; before: Scene; changed: boolean }
    | { kind: 'rotate'; id: string; object: Annotation; center: Point; startAngle: number; before: Scene; changed: boolean };
  let gesture: Gesture | null = null;
  let colorCallback: ((color: string) => void) | null = null;
  const pointers = new Map<number, Point>();
  let spaceDown = false;

  function pointerPair(): [Point, Point] | null {
    const points = [...pointers.values()];
    return points.length >= 2 ? [points[0], points[1]] : null;
  }

  function commitGesture(): void {
    const current = gesture;
    gesture = null;
    if (!current) return;
    if (current.kind === 'marquee') { store.set({ marquee: null }); return; }
    if (current.kind === 'draw') {
      const scene = store.get();
      const object = scene.objects.find((item) => item.id === current.id);
      if (object && object.type !== 'text') {
        // Drop an accidental click that produced no meaningful shape, so the canvas
        // never fills with invisible zero-size objects.
        const min = 4 / scene.viewport.scale;
        const bounds = annotationBounds(object);
        const negligible = object.type === 'pen' || object.type === 'highlighter'
          ? object.points.length < 2
          : bounds.w < min && bounds.h < min;
        if (negligible) {
          store.set({ objects: scene.objects.filter((item) => item.id !== current.id), selectedId: null, selectedIds: [] });
          return;
        }
      }
      history.record(current.before);
      const selectAfterDraw = object && object.type !== 'pen' && object.type !== 'highlighter' && object.type !== 'text';
      store.set({ selectedId: selectAfterDraw ? current.id : null, selectedIds: [] });
      return;
    }
    if (current.kind === 'crop' || ((current.kind === 'move' || current.kind === 'resize' || current.kind === 'rotate') && current.changed)) history.record(current.before);
  }

  function beginHandleGesture(scene: Scene, image: Point, tolerance: number): boolean {
    const current = scene.objects.find((object) => object.id === scene.selectedId);
    if (!current || current.locked) return false;
    const handle = hitHandle(current, image, tolerance);
    if (!handle) return false;
    if (handle === 'rotate') {
      const bounds = annotationBounds(current);
      const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
      gesture = { kind: 'rotate', id: current.id, object: current, center, startAngle: Math.atan2(image.y - center.y, image.x - center.x), before: scene, changed: false };
    } else {
      gesture = { kind: 'resize', id: current.id, handle, object: current, before: scene, changed: false };
    }
    return true;
  }

  host.addEventListener('pointerdown', (e) => {
    const scene = store.get();
    if (!scene.image) return;
    if (e.target instanceof Element && e.target.closest('.text-editor')) return;
    if (e.target instanceof HTMLElement && e.target.closest('.context-menu')) return;
    if (e.button === 2) {
      const image = screenToImage(anchorFromEvent(e), scene.viewport);
      const tolerance = (e.pointerType === 'touch' ? 14 : 8) / scene.viewport.scale;
      const insideArtboard = scene.showOverflow || (image.x >= 0 && image.y >= 0 && image.x <= scene.image.width && image.y <= scene.image.height);
      store.set({ selectedId: insideArtboard ? hitTest(scene.objects, image, tolerance)?.id ?? null : null, selectedIds: [] });
      return;
    }
    e.preventDefault();
    const screen = anchorFromEvent(e);
    pointers.set(e.pointerId, screen);
    host.setPointerCapture(e.pointerId);
    const pair = pointerPair();
    if (pair) {
      const interrupted = gesture;
      if (interrupted && 'before' in interrupted) store.update(() => interrupted.before);
      gesture = { kind: 'pinch', points: pair };
      return;
    }
    const image = screenToImage(screen, scene.viewport);
    if (colorCallback) {
      if (image.x < 0 || image.y < 0 || image.x >= scene.image.width || image.y >= scene.image.height) {
        onStatus?.('Choose a color inside the image');
        pointers.delete(e.pointerId);
        return;
      }
      const sample = document.createElement('canvas');
      sample.width = 1; sample.height = 1;
      const sampleCtx = sample.getContext('2d')!;
      sampleCtx.drawImage(scene.image.source, Math.floor(image.x), Math.floor(image.y), 1, 1, 0, 0, 1, 1);
      const [r, g, b] = sampleCtx.getImageData(0, 0, 1, 1).data;
      colorCallback(`#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`);
      colorCallback = null;
      delete host.dataset.eyedropper;
      pointers.delete(e.pointerId);
      return;
    }
    const directManipulationTolerance = 14 / scene.viewport.scale;
    if (e.pointerType === 'touch' && beginHandleGesture(scene, image, directManipulationTolerance)) return;
    if (scene.activeTool === 'text') {
      const tolerance = (e.pointerType === 'touch' ? 14 : 8) / scene.viewport.scale;
      const existing = hitTest(scene.objects, image, tolerance);
      if (existing?.type === 'text') {
        pointers.delete(e.pointerId);
        if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
        gesture = null;
        editText(existing.id, true, screen);
        return;
      }
    }
    if (scene.activeTool === 'pan' || spaceDown) {
      gesture = { kind: 'pan', last: screen };
    } else if (scene.activeTool === 'select') {
      const tolerance = (e.pointerType === 'touch' ? 14 : 8) / scene.viewport.scale;
      if (beginHandleGesture(scene, image, tolerance)) return;
      const insideArtboard = scene.showOverflow || (image.x >= 0 && image.y >= 0 && image.x <= scene.image.width && image.y <= scene.image.height);
      const selected = insideArtboard ? hitTest(scene.objects, image, tolerance) : null;
      const currentIds = selectionIds(scene);
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!selected) {
        // Empty space: start a marquee. Without a modifier this also clears the selection.
        if (!additive) store.set({ selectedId: null, selectedIds: [] });
        gesture = { kind: 'marquee', start: image, additive: additive ? currentIds : [] };
      } else if (additive) {
        // Toggle this object in the current multi-selection.
        const next = currentIds.includes(selected.id) ? currentIds.filter((id) => id !== selected.id) : [...currentIds, selected.id];
        store.set({ selectedIds: next, selectedId: next.length === 1 ? next[0] : null });
        gesture = null;
      } else if (currentIds.length > 1 && currentIds.includes(selected.id)) {
        // Drag any member of the group to move the whole group.
        gesture = { kind: 'move', ids: currentIds, last: image, before: scene, changed: false };
      } else {
        store.set({ selectedId: selected.id, selectedIds: [] });
        gesture = { kind: 'move', ids: [selected.id], last: image, before: scene, changed: false };
      }
    } else if (scene.activeTool === 'crop') {
      store.set({ crop: { x: image.x, y: image.y, w: 0, h: 0 }, selectedId: null, selectedIds: [] });
      gesture = { kind: 'crop', start: image, before: scene };
    } else if (scene.activeTool === 'image') {
      fileInput.click();
      return;
    } else {
      const id = crypto.randomUUID();
      let object = createAnnotation(id, scene.activeTool, image, scene.toolStyle);
      if (object.type === 'counter') object = {
        ...object,
        n: scene.counterNext,
        radius: scene.counterSize ?? object.radius,
        shape: scene.counterShape ?? 'circle',
        format: scene.counterFormat ?? 'numeric',
        filled: true,
        fontSize: scene.counterFontSize ?? scene.counterSize ?? object.radius,
        fontFamily: scene.counterFontFamily ?? 'system-ui',
        textColor: scene.counterTextColor ?? '#ffffff',
      };
      if (object.type === 'symbol') object = { ...object, name: scene.symbolName };
      if (object.type === 'arrow') object = { ...object, startHead: scene.arrowStartHead, endHead: scene.arrowEndHead };
      if (object.type === 'text') object = { ...object, fontFamily: scene.fontFamily, fontSize: scene.fontSize, fontWeight: scene.fontWeight, fontStyle: scene.fontStyle, underline: scene.textUnderline, align: scene.textAlign };
      if (object.type === 'redaction') object = { ...object, mode: scene.redactionMode, strength: scene.redactionStrength };
      const nextOpacity = scene.activeTool === 'highlighter' ? .5 : 1;
      store.set({ objects: [...scene.objects, object], counterNext: object.type === 'counter' ? scene.counterNext + 1 : scene.counterNext, toolStyle: { ...scene.toolStyle, opacity: nextOpacity }, selectedId: null, selectedIds: [] });
      gesture = { kind: 'draw', id, start: image, before: scene };
      if (object.type === 'text') queueMicrotask(() => editText(id, false));
    }
  });
  function updateHoverCursor(e: PointerEvent): void {
    const scene = store.get();
    if (scene.activeTool !== 'select' || !scene.image) { canvas.style.cursor = ''; return; }
    const selected = scene.objects.find((object) => object.id === scene.selectedId);
    const image = screenToImage(anchorFromEvent(e), scene.viewport);
    const tolerance = (e.pointerType === 'touch' ? 14 : 8) / scene.viewport.scale;
    const handle = selected ? hitHandle(selected, image, tolerance) : null;
    const insideArtboard = scene.showOverflow || (image.x >= 0 && image.y >= 0 && image.x <= scene.image.width && image.y <= scene.image.height);
    canvas.style.cursor = handle ? HANDLE_CURSORS[handle] : (insideArtboard && hitTest(scene.objects, image, tolerance) ? 'move' : '');
  }
  host.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, anchorFromEvent(e));
    if (!gesture) {
      if (e.pointerType !== 'touch') updateHoverCursor(e);
      return;
    }
    const current = gesture;
    const scene = store.get();
    const screen = anchorFromEvent(e);
    if (current.kind === 'pinch') {
      const pair = pointerPair();
      if (!pair) return;
      store.set({ viewport: pinchViewport(scene.viewport, current.points, pair) });
      current.points = pair;
      return;
    }
    if (current.kind === 'pan') {
      store.set({ viewport: panBy(scene.viewport, screen.x - current.last.x, screen.y - current.last.y) });
      current.last = screen;
      return;
    }
    const image = screenToImage(screen, scene.viewport);
    if (current.kind === 'crop') {
      const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
      const start = { x: clamp(current.start.x, scene.image!.width), y: clamp(current.start.y, scene.image!.height) };
      const end = { x: clamp(image.x, scene.image!.width), y: clamp(image.y, scene.image!.height) };
      store.set({ crop: rectFromPoints(start, end) });
    } else if (current.kind === 'draw') {
      store.set({ objects: scene.objects.map((object) => {
        if (object.id !== current.id) return object;
        if (e.shiftKey && object.type === 'highlighter') return { ...object, points: [current.start, image] };
        if (object.type === 'pen' || object.type === 'highlighter') {
          const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
          const points = events.map((event) => screenToImage(anchorFromEvent(event), scene.viewport));
          return appendPathPoints(object, points, 0.35 / scene.viewport.scale);
        }
        const bounds = drawBounds(object.type, current.start, image, { constrainProportions: e.shiftKey, fromCenter: e.altKey });
        return resizeAnnotation(object, bounds.start, bounds.end);
      }) });
    } else if (current.kind === 'marquee') {
      const box = rectFromPoints(current.start, image);
      const artboard = { x: 0, y: 0, w: scene.image!.width, h: scene.image!.height };
      const ids = scene.objects.filter((object) => {
        if (object.hidden) return false;
        const bounds = annotationBounds(object);
        return !object.locked && rectsIntersect(bounds, box) && (scene.showOverflow || rectsIntersect(bounds, artboard));
      }).map((object) => object.id);
      const merged = current.additive.length ? [...new Set([...current.additive, ...ids])] : ids;
      store.set({ marquee: box, selectedIds: merged, selectedId: merged.length === 1 ? merged[0] : null });
    } else if (current.kind === 'move') {
      const dx = image.x - current.last.x;
      const dy = image.y - current.last.y;
      const moving = new Set(current.ids);
      store.set({ objects: scene.objects.map((object) => moving.has(object.id) ? moveAnnotation(object, dx, dy) : object) });
      current.last = image;
      current.changed = true;
    } else if (current.kind === 'resize') {
      store.set({ objects: scene.objects.map((object) => object.id === current.id ? resizeFromHandle(current.object, current.handle, image, { constrainProportions: e.shiftKey, fromCenter: e.altKey }) : object) });
      current.changed = true;
    } else {
      const freeRotation = (current.object.rotation ?? 0) + Math.atan2(image.y - current.center.y, image.x - current.center.x) - current.startAngle;
      const rotation = e.shiftKey ? constrainRotation(freeRotation) : freeRotation;
      store.set({ objects: scene.objects.map((object) => object.id === current.id ? { ...object, rotation } : object) });
      current.changed = true;
    }
  });
  const stopGesture = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    commitGesture();
  };
  const cancelGesture = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    const current = gesture;
    if (current && 'before' in current) store.update(() => current.before);
    if (current?.kind === 'marquee') store.set({ marquee: null });
    gesture = null;
    editingTextId = null;
    host.querySelector('.text-editor')?.remove();
    draw();
  };
  host.addEventListener('pointerup', stopGesture);
  host.addEventListener('pointercancel', cancelGesture);

  host.addEventListener('pointerdown', (event) => {
    if (event.target === canvas && !host.querySelector('.text-editor')) host.focus({ preventScroll: true });
  });

  window.addEventListener('keydown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const editingTarget = target?.closest('input, select, textarea, [contenteditable="true"]');
    if (editingTarget) return;
    const scene = store.get();
    const canvasFocused = document.activeElement === host;
    if (e.code === 'Space' && canvasFocused) {
      spaceDown = true;
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      colorCallback = null;
      delete host.dataset.eyedropper;
      store.set({ activeTool: 'select', selectedId: null, selectedIds: [], crop: null, marquee: null });
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    const tools: Record<string, Scene['activeTool']> = { v: 'select', r: 'rect', o: 'ellipse', a: 'arrow', l: 'line', p: 'pen', h: 'highlighter', t: 'text', c: 'counter', b: 'redaction' };
    const tool = tools[e.key.toLowerCase()];
    if (tool && canvasFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      store.set({ activeTool: tool });
      return;
    }
    if ((e.key === '+' || e.key === '=') && canvasFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      store.set({ viewport: zoomAt(scene.viewport, { x: canvas.width / 2, y: canvas.height / 2 }, 1.2) });
      return;
    }
    if (e.key === '-' && canvasFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      store.set({ viewport: zoomAt(scene.viewport, { x: canvas.width / 2, y: canvas.height / 2 }, 1 / 1.2) });
      return;
    }
    const movement: Partial<Record<string, Point>> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = movement[e.key];
    const movableIds = selectionIds(scene).filter((id) => !scene.objects.find((object) => object.id === id)?.locked);
    if (direction && canvasFocused && movableIds.length) {
      e.preventDefault();
      if (!e.repeat) history.record(scene);
      const distance = e.shiftKey ? 10 : 1;
      const moving = new Set(movableIds);
      store.set({ objects: scene.objects.map((object) => moving.has(object.id) ? moveAnnotation(object, direction.x * distance, direction.y * distance) : object) });
      onStatus?.(`Moved ${movableIds.length === 1 ? 'selection' : `${movableIds.length} selections`} ${distance} ${distance === 1 ? 'pixel' : 'pixels'}`);
      return;
    }
    const deletePressed = e.key === 'Delete' || e.key === 'Backspace' || e.code === 'Delete' || e.code === 'Backspace';
    if (!deletePressed || selectionIds(scene).length === 0) return;
    e.preventDefault();
    deleteSelected();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceDown = false;
  });
  host.addEventListener('dblclick', (e) => {
    if (e.target instanceof Element && e.target.closest('.text-editor')) return;
    const scene = store.get();
    const screen = anchorFromEvent(e);
    const object = hitTest(scene.objects, screenToImage(screen, scene.viewport), 8 / scene.viewport.scale);
    if (object?.type === 'text') editText(object.id, true, screen);
  });

  emptyState?.style.setProperty('pointer-events', 'auto');
  emptyState?.addEventListener('click', () => {
    fileIntent = 'replace';
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileFromDataTransfer(null, fileInput.files);
    if (file) await load(file, fileIntent);
  });

  host.addEventListener('dragover', (e) => e.preventDefault());
  host.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = fileFromDataTransfer(e.dataTransfer?.items ?? null, e.dataTransfer?.files ?? null);
    if (file) await load(file, store.get().image && store.get().activeTool === 'image' ? 'place' : 'replace');
  });

  window.addEventListener('paste', async (e) => {
    const file = fileFromDataTransfer(e.clipboardData?.items ?? null, null);
    if (file) await load(file, store.get().image && store.get().activeTool === 'image' ? 'place' : 'replace');
  });
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(host);
  store.subscribe(draw);
  resize();

  return {
    setImage(img) {
      centerImage(img);
      if (emptyState) emptyState.style.display = 'none';
    },
    undo,
    redo,
    checkpoint() {
      if (store.get().selectedId) history.record(store.get());
    },
    checkpointScene() {
      history.record(store.get());
    },
    setScene(scene) {
      history.clear();
      store.update(() => scene);
      if (emptyState) emptyState.style.display = scene.image ? 'none' : '';
    },
    pickColor(callback) {
      colorCallback = colorCallback ? null : callback;
      if (colorCallback) host.dataset.eyedropper = 'true';
      else delete host.dataset.eyedropper;
    },
    openImage(intent = 'replace') {
      fileIntent = intent;
      fileInput.value = '';
      fileInput.click();
    },
    duplicateSelected() {
      duplicateSelected();
    },
    deleteSelected() {
      deleteSelected();
    },
  };
}
