import { screenToImage, type Point } from '../core/geometry';
import type { Annotation, LoadedImage, Scene } from '../core/types';
import { annotationBounds, annotationHandles, appendPathPoints, hitHandle, hitTest, moveAnnotation, rectFromPoints, resizeAnnotation, resizeFromHandle, type AnnotationHandle } from '../core/annotations';
import { AnnotationHistory, sceneSources } from '../core/history';
import type { Store } from '../state/store';
import { renderScene, type Surface } from '../render/renderer';
import { panBy, zoomAt } from '../core/viewport';
import { translateAnnotation } from '../core/transform';
import { clampCrop, cropFromDrag, moveCrop } from '../core/crop-geometry';

import { createInlineTextEditor } from './text-editor';
import { createToolPreview } from './tool-preview';
import { createImageInput } from './image-input';
import { HANDLE_CURSORS, constrainRotation, drawBounds, isTypingTarget, makeToolAnnotation, pinchViewport, rectsIntersect, wheelZoom } from './canvas-interaction';


export interface CanvasHostOptions {
  host: HTMLElement;
  store: Store<Scene>;
  onStatus?: (text: string) => void;
}

export interface CanvasHost {
  setImage(img: LoadedImage): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  checkpoint(): void;
  checkpointScene(): void;
  setScene(scene: Scene, undoable?: boolean): void;
  pickColor(callback: (color: string) => void): void;
  openImage(intent?: 'replace' | 'place'): void;
  duplicateSelected(): void;
  deleteSelected(): void;
  setCropRatio(ratio?: number): void;
  cancelGesture(): void;
}

export function mountCanvasHost({ host, store, onStatus }: CanvasHostOptions): CanvasHost {
  const canvas = document.createElement('canvas');
  host.insertBefore(canvas, host.firstChild);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const preview = document.createElement('canvas');
  preview.className = 'tool-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.dataset.visible = 'false';
  canvas.after(preview);
  const toolPreview = createToolPreview(preview);

  const emptyState = host.querySelector<HTMLElement>('.empty-state');

  const surface = (): Surface => ({ width: canvas.width, height: canvas.height, ctx });
  const draw = () => {
    textEditor.sync();
    const scene = store.get();
    const editingTextId = textEditor.editingId();
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
  const imageInput = createImageInput({ host, canvas, store, history, emptyState, replaceScene: (next, undoable) => replaceScene(next, undoable), onStatus });
  const textEditor = createInlineTextEditor({
    host, store, history, draw: () => draw(),
    onEscape: () => { colorCallback = null; delete host.dataset.eyedropper; },
  });
  let canvasSize: { width: number; height: number } | null = null;

  function replaceScene(next: Scene, undoable = false): void {
    gesture = null;
    const previous = new Set([...sceneSources(store.get()), ...history.sources()]);
    if (undoable) history.record(store.get());
    else history.clear();
    store.update(() => ({ ...next, crop: null, marquee: null, selectedId: null, selectedIds: [] }));
    const retained = new Set([...sceneSources(store.get()), ...history.sources()]);
    for (const source of previous) if (!retained.has(source)) (source as ImageBitmap).close?.();
  }

  function restore(snapshot: Pick<Scene, 'image' | 'viewport' | 'objects' | 'crop' | 'border' | 'watermark'> | null): void {
    gesture = null;
    if (snapshot) store.set({ ...snapshot, crop: null, selectedId: null, selectedIds: [], marquee: null });
  }

  function undo(): void {
    clearGesture();
    restore(history.undo(store.get()));
    store.set({ crop: null, marquee: null, selectedId: null, selectedIds: [] });
  }

  function redo(): void {
    clearGesture();
    restore(history.redo(store.get()));
    store.set({ crop: null, marquee: null, selectedId: null, selectedIds: [] });
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
    preview.width = next.width;
    preview.height = next.height;
    preview.style.width = `${next.width}px`;
    preview.style.height = `${next.height}px`;
    requestPreview();
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

  host.addEventListener('wheel', (e) => {
    if (!store.get().image) return;
    e.preventDefault();
    store.set({ viewport: wheelZoom(store.get(), anchorFromEvent(e), e.deltaY, e.ctrlKey) });
  }, { passive: false });

  type Gesture =
    | { kind: 'pan'; last: Point }
    | { kind: 'pinch'; points: [Point, Point] }
    | { kind: 'draw'; id: string; start: Point; before: Scene }
    | { kind: 'crop'; start: Point }
    | { kind: 'crop-move'; last: Point }
    | { kind: 'crop-resize'; handle: AnnotationHandle; rect: NonNullable<Scene['crop']> }
    | { kind: 'move'; ids: string[]; last: Point; before: Scene; changed: boolean }
    | { kind: 'marquee'; start: Point; additive: string[] }
    | { kind: 'resize'; id: string; handle: AnnotationHandle; object: Annotation; before: Scene; changed: boolean }
    | { kind: 'rotate'; id: string; object: Annotation; center: Point; startAngle: number; before: Scene; changed: boolean };
  let gesture: Gesture | null = null;
  let cropRatio: number | undefined;
  function clearGesture(): void {
    const current = gesture;
    gesture = null;
    pointers.clear();
    if (current && 'before' in current) store.update(() => current.before);
  }
  let colorCallback: ((color: string) => void) | null = null;
  const pointers = new Map<number, Point>();
  let spaceDown = false;
  let pointerOverStage = false;
  let hoverPoint: Point | null = null;
  let previewFrame = 0;

  function requestPreview(): void {
    if (!previewFrame) previewFrame = requestAnimationFrame(() => { previewFrame = 0; toolPreview.draw(store.get(), hoverPoint, Boolean(gesture) || spaceDown); });
  }


  const resetSpace = () => {
    spaceDown = false;
    delete host.dataset.spacePan;
    if (gesture?.kind === 'pan') gesture = null;
    requestPreview();
  };
  host.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') pointerOverStage = true; });
  host.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { pointerOverStage = false; hoverPoint = null; requestPreview(); } });
  host.addEventListener('pointerdown', (e) => {
    if (!spaceDown || e.pointerType === 'touch' || e.button !== 0 || !store.get().image) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const screen = anchorFromEvent(e);
    pointers.set(e.pointerId, screen);
    host.setPointerCapture(e.pointerId);
    gesture = { kind: 'pan', last: screen };
    host.dataset.spacePan = 'dragging';
    requestPreview();
  }, true);

  function pointerPair(): [Point, Point] | null {
    const points = [...pointers.values()];
    return points.length >= 2 ? [points[0], points[1]] : null;
  }

  function defaultPlacement(scene: Scene, point: Point): { start: Point; end: Point } {
    const w = Math.min(120, scene.image!.width);
    const h = Math.min(80, scene.image!.height);
    const x = Math.max(0, Math.min(scene.image!.width - w, point.x - w / 2));
    const y = Math.max(0, Math.min(scene.image!.height - h, point.y - h / 2));
    return { start: { x, y }, end: { x: x + w, y: y + h } };
  }

  function placeFromKeyboard(scene: Scene, point: Point): void {
    if (scene.activeTool === 'crop') {
      if (scene.crop) return;
      const { start, end } = defaultPlacement(scene, point);
      store.set({ crop: cropFromDrag(start, end, scene.image!.width, scene.image!.height, cropRatio), selectedId: null, selectedIds: [] });
      onStatus?.('Crop area placed');
      return;
    }
    const id = crypto.randomUUID();
    let object = makeToolAnnotation(id, scene, point);
    if (['rect', 'ellipse', 'line', 'arrow', 'redaction'].includes(object.type)) {
      const { start, end } = defaultPlacement(scene, point);
      object = resizeAnnotation(object, start, end);
    }
    history.record(scene);
    store.set({ objects: [...scene.objects, object], counterNext: object.type === 'counter' ? scene.counterNext + 1 : scene.counterNext, selectedId: object.type === 'text' ? null : id, selectedIds: [] });
    if (object.type === 'text') queueMicrotask(() => textEditor.edit(id, false));
    onStatus?.(object.type === 'text' ? 'Text editor opened' : `${object.type} placed`);
  }

  function commitGesture(): void {
    const current = gesture;
    gesture = null;
    if (!current) return;
    if (current.kind === 'marquee') { store.set({ marquee: null }); return; }
    if (current.kind === 'crop') {
      const scene = store.get();
      if (scene.image && scene.crop && (scene.crop.w < 1 || scene.crop.h < 1)) {
        const { start, end } = defaultPlacement(scene, current.start);
        store.set({ crop: cropFromDrag(start, end, scene.image.width, scene.image.height, cropRatio) });
      }
      return;
    }
    if (current.kind === 'draw') {
      const scene = store.get();
      const object = scene.objects.find((item) => item.id === current.id);
      if (object && object.type !== 'text') {
        const min = 4 / scene.viewport.scale;
        const bounds = annotationBounds(object);
        const negligible = object.type === 'pen' || object.type === 'highlighter'
          ? object.points.length < 2
          : bounds.w < min && bounds.h < min;
        // A click that produced no meaningful shape never leaves an invisible zero-size
        // object: strokes are dropped, other shapes get a default size.
        if (negligible) {
          if (object.type === 'pen' || object.type === 'highlighter') {
            store.set({ objects: scene.objects.filter((item) => item.id !== current.id), selectedId: null, selectedIds: [] });
            return;
          }
          const { start, end } = defaultPlacement(scene, current.start);
          store.set({ objects: scene.objects.map((item) => item.id === current.id ? resizeAnnotation(item, start, end) : item) });
        }
      }
      history.record(current.before);
      const selectAfterDraw = object && object.type !== 'pen' && object.type !== 'highlighter' && object.type !== 'text';
      // New text being typed stays selected so formatting controls apply to it, not only to the next text.
      const editingNewText = object?.type === 'text' && textEditor.editingId() === current.id;
      store.set({ selectedId: selectAfterDraw || editingNewText ? current.id : null, selectedIds: [] });
      return;
    }
    if ((current.kind === 'move' || current.kind === 'resize' || current.kind === 'rotate') && current.changed) history.record(current.before);
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
    hoverPoint = null;
    requestPreview();
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
        textEditor.edit(existing.id, true, screen);
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
      const crop = scene.crop;
      const tolerance = (e.pointerType === 'touch' ? 18 : 8) / scene.viewport.scale;
      const fake = crop && { id: 'crop', type: 'rect' as const, rect: crop, style: scene.toolStyle };
      const handle = fake && annotationHandles(fake).filter((item) => item.handle !== 'rotate').find(({ point }) => Math.hypot(point.x - image.x, point.y - image.y) <= tolerance)?.handle;
      if (handle && crop) gesture = { kind: 'crop-resize', handle, rect: crop };
      else if (crop && image.x >= crop.x && image.x <= crop.x + crop.w && image.y >= crop.y && image.y <= crop.y + crop.h) gesture = { kind: 'crop-move', last: image };
      else {
        store.set({ crop: { x: image.x, y: image.y, w: 0, h: 0 }, selectedId: null, selectedIds: [], marquee: null });
        gesture = { kind: 'crop', start: image };
      }
    } else if (scene.activeTool === 'image') {
      imageInput.openImage('place');
      return;
    } else {
      const id = crypto.randomUUID();
      const object = makeToolAnnotation(id, scene, image);
      const nextOpacity = scene.activeTool === 'highlighter' ? .5 : 1;
      store.set({ objects: [...scene.objects, object], counterNext: object.type === 'counter' ? scene.counterNext + 1 : scene.counterNext, toolStyle: { ...scene.toolStyle, opacity: nextOpacity }, selectedId: null, selectedIds: [] });
      gesture = { kind: 'draw', id, start: image, before: scene };
      if (object.type === 'text') queueMicrotask(() => textEditor.edit(id, false));
    }
  });
  function updateHoverCursor(e: PointerEvent): void {
    const scene = store.get();
    if (scene.activeTool === 'crop' && scene.image) {
      const image = screenToImage(anchorFromEvent(e), scene.viewport);
      const crop = scene.crop;
      const fake = crop && { id: 'crop', type: 'rect' as const, rect: crop, style: scene.toolStyle };
      const handle = fake && annotationHandles(fake).filter((item) => item.handle !== 'rotate').find(({ point }) => Math.hypot(point.x - image.x, point.y - image.y) <= (e.pointerType === 'touch' ? 18 : 8) / scene.viewport.scale)?.handle;
      canvas.style.cursor = handle ? HANDLE_CURSORS[handle] : crop && image.x >= crop.x && image.x <= crop.x + crop.w && image.y >= crop.y && image.y <= crop.y + crop.h ? 'move' : 'crosshair';
      return;
    }
    if (scene.activeTool !== 'select' || !scene.image) { canvas.style.cursor = ''; return; }
    const selected = scene.objects.find((object) => object.id === scene.selectedId);
    const image = screenToImage(anchorFromEvent(e), scene.viewport);
    const tolerance = (e.pointerType === 'touch' ? 14 : 8) / scene.viewport.scale;
    const handle = selected ? hitHandle(selected, image, tolerance) : null;
    const insideArtboard = scene.showOverflow || (image.x >= 0 && image.y >= 0 && image.x <= scene.image.width && image.y <= scene.image.height);
    canvas.style.cursor = handle ? HANDLE_CURSORS[handle] : (insideArtboard && hitTest(scene.objects, image, tolerance) ? 'move' : '');
  }
  host.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') {
      const scene = store.get();
      const point = screenToImage(anchorFromEvent(e), scene.viewport);
      hoverPoint = scene.image && point.x >= 0 && point.y >= 0 && point.x <= scene.image.width && point.y <= scene.image.height ? point : null;
      requestPreview();
    }
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
      store.set({ crop: cropFromDrag(current.start, image, scene.image!.width, scene.image!.height, cropRatio ?? (e.shiftKey ? scene.image!.width / scene.image!.height : undefined)) });
    } else if (current.kind === 'crop-move' && scene.crop) {
      store.set({ crop: moveCrop(scene.crop, image.x - current.last.x, image.y - current.last.y, scene.image!.width, scene.image!.height) });
      current.last = image;
    } else if (current.kind === 'crop-resize') {
      const fake = { id: 'crop', type: 'rect' as const, rect: current.rect, style: scene.toolStyle };
      const bounded = { x: Math.max(0, Math.min(scene.image!.width, image.x)), y: Math.max(0, Math.min(scene.image!.height, image.y)) };
      const resized = resizeFromHandle(fake, current.handle, bounded, { constrainProportions: Boolean(cropRatio || e.shiftKey) });
      if ('rect' in resized) {
        let next = resized.rect;
        if (cropRatio) {
          const horizontal = current.handle.includes('w') || current.handle.includes('e');
          const vertical = current.handle.includes('n') || current.handle.includes('s');
          if (horizontal && vertical) {
            const anchor = {
              x: current.handle.includes('w') ? current.rect.x + current.rect.w : current.rect.x,
              y: current.handle.includes('n') ? current.rect.y + current.rect.h : current.rect.y,
            };
            next = cropFromDrag(anchor, bounded, scene.image!.width, scene.image!.height, cropRatio);
          } else if (horizontal) {
            next = { ...next, h: next.w / cropRatio, y: current.rect.y + (current.rect.h - next.w / cropRatio) / 2 };
          } else if (vertical) {
            next = { ...next, w: next.h * cropRatio, x: current.rect.x + (current.rect.w - next.h * cropRatio) / 2 };
          }
        }
        store.set({ crop: clampCrop(next, scene.image!.width, scene.image!.height) });
      }
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
    } else if (current.kind === 'rotate') {
      const freeRotation = (current.object.rotation ?? 0) + Math.atan2(image.y - current.center.y, image.x - current.center.x) - current.startAngle;
      const rotation = e.shiftKey ? constrainRotation(freeRotation) : freeRotation;
      store.set({ objects: scene.objects.map((object) => object.id === current.id ? { ...object, rotation } : object) });
      current.changed = true;
    }
  });
  const stopGesture = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    commitGesture();
    if (spaceDown) host.dataset.spacePan = 'held';
    requestPreview();
  };
  const cancelGesture = (e: PointerEvent) => {
    if (e.target instanceof Element && e.target.closest('.text-editor')) return;
    pointers.delete(e.pointerId);
    const current = gesture;
    if (current && 'before' in current) store.update(() => current.before);
    if (current?.kind === 'marquee') store.set({ marquee: null });
    gesture = null;
    textEditor.discard();
    draw();
  };
  host.addEventListener('pointerup', stopGesture);
  host.addEventListener('pointercancel', cancelGesture);

  host.addEventListener('pointerdown', (event) => {
    if (event.target === canvas && !host.querySelector('.text-editor')) host.focus({ preventScroll: true });
  });

  window.addEventListener('keydown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const editingTarget = target?.closest('input, select, textarea, [contenteditable]');
    const typing = editingTarget && isTypingTarget(editingTarget.tagName, editingTarget instanceof HTMLInputElement ? editingTarget.type : '', editingTarget.hasAttribute('contenteditable'));
    const scene = store.get();
    const canvasFocused = document.activeElement === host;
    if ((e.key === 'Enter' || e.key === ' ' || e.code === 'Space') && canvasFocused && scene.image && !e.metaKey && !e.ctrlKey && !e.altKey
      && ['rect', 'ellipse', 'line', 'arrow', 'redaction', 'counter', 'symbol', 'text', 'crop'].includes(scene.activeTool)
      && !(scene.activeTool === 'crop' && scene.crop)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      placeFromKeyboard(scene, screenToImage({ x: canvas.width / 2, y: canvas.height / 2 }, scene.viewport));
      return;
    }
    if (e.code === 'Space' && !typing && (spaceDown || pointerOverStage || document.activeElement === host || document.activeElement === document.body)) {
      e.preventDefault();
      if (!e.repeat) { spaceDown = true; host.dataset.spacePan = 'held'; requestPreview(); }
      return;
    }
    if (editingTarget) return;
    // Escape belongs to an open dialog or menu; a closed menu that merely holds focus must not swallow it.
    const openOverlay = 'dialog[open], details.app-menu[open], .context-menu:not([hidden])';
    if (e.key === 'Escape' && (e.defaultPrevented || target?.closest(openOverlay) || document.activeElement?.closest(openOverlay))) return;
    if (e.key === 'Escape') {
      clearGesture();
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
    if (tool && scene.image && canvasFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      clearGesture();
      store.set({ activeTool: tool, crop: null, marquee: null, selectedId: null, selectedIds: [] });
      return;
    }
    if ((e.key === '+' || e.key === '=') && scene.image && canvasFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      store.set({ viewport: zoomAt(scene.viewport, { x: canvas.width / 2, y: canvas.height / 2 }, 1.2) });
      return;
    }
    if (e.key === '-' && scene.image && canvasFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
    if (direction && canvasFocused && scene.activeTool === 'crop' && scene.crop && scene.image) {
      e.preventDefault();
      const distance = e.shiftKey ? 10 : 1;
      store.set({ crop: moveCrop(scene.crop, direction.x * distance, direction.y * distance, scene.image.width, scene.image.height) });
      return;
    }
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
  }, true);
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && spaceDown) { e.preventDefault(); resetSpace(); }
  }, true);
  window.addEventListener('blur', resetSpace);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetSpace(); });
  host.addEventListener('dblclick', (e) => {
    if (e.target instanceof Element && e.target.closest('.text-editor')) return;
    const scene = store.get();
    const screen = anchorFromEvent(e);
    const object = hitTest(scene.objects, screenToImage(screen, scene.viewport), 8 / scene.viewport.scale);
    if (object?.type === 'text') textEditor.edit(object.id, true, screen);
  });
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(host);
  store.subscribe(() => { draw(); requestPreview(); });
  resize();

  return {
    setImage(img) {
      imageInput.setImage(img);
    },
    undo,
    redo,
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    checkpoint() {
      if (selectionIds(store.get()).length) history.record(store.get());
    },
    checkpointScene() {
      history.record(store.get());
    },
    setScene(scene, undoable = false) {
      replaceScene(scene, undoable);
      if (emptyState) emptyState.style.display = scene.image ? 'none' : '';
    },
    pickColor(callback) {
      colorCallback = colorCallback ? null : callback;
      if (colorCallback) host.dataset.eyedropper = 'true';
      else delete host.dataset.eyedropper;
    },
    openImage: imageInput.openImage,
    duplicateSelected() {
      duplicateSelected();
    },
    deleteSelected() {
      deleteSelected();
    },
    setCropRatio(ratio) { cropRatio = ratio; },
    cancelGesture: clearGesture,
  };
}
