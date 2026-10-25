import { cropAnnotations, scaleAnnotation, transformAnnotation, type FrameTransform } from '../core/transform';
import { fitCropToRatio } from '../core/crop-geometry';
import { fitViewport } from '../core/viewport';
import type { LoadedImage, Scene } from '../core/types';
import type { Store } from '../state/store';
import { mountCanvasHost } from './canvas-host';

export function mountImageTransforms(root: HTMLElement, store: Store<Scene>, canvasHost: ReturnType<typeof mountCanvasHost>, statusEl: HTMLElement, stageHost: HTMLElement, openDialog: (dialog: HTMLDialogElement, invoker: HTMLElement) => void): () => void {
  function imageFromCanvas(canvas: HTMLCanvasElement): LoadedImage {
    return { source: canvas, width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL('image/png') };
  }

  function applyCrop(): void {
    const scene = store.get();
    const image = scene.image;
    const crop = scene.crop;
    if (!image || !crop || crop.w < 1 || crop.h < 1) { statusEl.textContent = 'Draw a crop area first'; return; }
    if (crop.w * crop.h > 134_000_000) { statusEl.textContent = 'Crop dimensions are too large'; return; }
    canvasHost.cancelGesture();
    store.set({ crop: null, marquee: null, selectedId: null, selectedIds: [] });
    canvasHost.checkpointScene();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(crop.w);
    canvas.height = Math.round(crop.h);
    canvas.getContext('2d')!.drawImage(image.source, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    store.set({
      image: imageFromCanvas(canvas),
      objects: cropAnnotations(scene.objects, crop),
      crop: null,
      activeTool: 'select',
      selectedId: null,
      selectedIds: [],
      marquee: null,
      viewport: fitViewport(canvas.width, canvas.height, stageHost.clientWidth, stageHost.clientHeight),
    });
    statusEl.textContent = `Cropped to ${canvas.width} x ${canvas.height}`;
  }
  root.querySelector<HTMLButtonElement>('[data-action="apply-crop"]')!.addEventListener('click', applyCrop);
  root.querySelector<HTMLButtonElement>('[data-action="cancel-crop"]')!.addEventListener('click', () => { canvasHost.cancelGesture(); store.set({ crop: null, marquee: null, selectedId: null, selectedIds: [], activeTool: 'select' }); });
  const cropRatioInput = root.querySelector<HTMLSelectElement>('[data-style="crop-ratio"]')!;
  let cropOrientationSwapped = false;
  const swapCropButton = root.querySelector<HTMLButtonElement>('[data-action="swap-crop-ratio"]')!;
  const updateCropRatio = () => {
    const scene = store.get();
    const image = scene.image;
    const values: Record<string, number> = { '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9 };
    const base = cropRatioInput.value === 'original' ? image && image.width / image.height : values[cropRatioInput.value];
    const ratio = base ? cropOrientationSwapped ? 1 / base : base : undefined;
    canvasHost.setCropRatio(ratio);
    swapCropButton.disabled = !base || base === 1;
    swapCropButton.setAttribute('aria-pressed', String(cropOrientationSwapped));
    // Apply the ratio to the visible crop now, not only to the next drag.
    if (ratio && image && scene.activeTool === 'crop') store.set({ crop: fitCropToRatio(scene.crop, ratio, image.width, image.height) });
  };
  cropRatioInput.addEventListener('change', () => { cropOrientationSwapped = false; updateCropRatio(); });
  swapCropButton.addEventListener('click', () => { cropOrientationSwapped = !cropOrientationSwapped; updateCropRatio(); });
  updateCropRatio();
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && document.activeElement === stageHost && store.get().activeTool === 'crop') { event.preventDefault(); applyCrop(); }
  });

  function transformedImage(transform: FrameTransform): LoadedImage | null {
    const image = store.get().image;
    if (!image) return null;
    const rotated = transform.startsWith('rotate');
    const canvas = document.createElement('canvas');
    canvas.width = rotated ? image.height : image.width;
    canvas.height = rotated ? image.width : image.height;
    const ctx = canvas.getContext('2d')!;
    if (transform === 'rotate-right') { ctx.translate(image.height, 0); ctx.rotate(Math.PI / 2); }
    if (transform === 'rotate-left') { ctx.translate(0, image.width); ctx.rotate(-Math.PI / 2); }
    if (transform === 'flip-horizontal') { ctx.translate(image.width, 0); ctx.scale(-1, 1); }
    if (transform === 'flip-vertical') { ctx.translate(0, image.height); ctx.scale(1, -1); }
    ctx.drawImage(image.source, 0, 0, image.width, image.height);
    return imageFromCanvas(canvas);
  }

  const transformDialog = root.querySelector<HTMLDialogElement>('#transform-dialog')!;
  const resizeWidthInput = transformDialog.querySelector<HTMLInputElement>('[name="resizeWidth"]')!;
  const resizeHeightInput = transformDialog.querySelector<HTMLInputElement>('[name="resizeHeight"]')!;
  const lockAspectInput = transformDialog.querySelector<HTMLInputElement>('[name="lockAspect"]')!;
  let transformAspectRatio = 1;
  const resizeDimension = (value: number): number => Math.max(1, Math.min(16_384, Math.round(value)));
  const syncResizeDimension = (source: 'width' | 'height') => {
    if (!lockAspectInput.checked) return;
    if (source === 'width') {
      const nextWidth = Number(resizeWidthInput.value);
      if (Number.isFinite(nextWidth) && nextWidth > 0) resizeHeightInput.value = String(resizeDimension(nextWidth / transformAspectRatio));
    } else {
      const height = Number(resizeHeightInput.value);
      if (Number.isFinite(height) && height > 0) resizeWidthInput.value = String(resizeDimension(height * transformAspectRatio));
    }
  };
  resizeWidthInput.addEventListener('input', () => syncResizeDimension('width'));
  resizeHeightInput.addEventListener('input', () => syncResizeDimension('height'));
  // Enter would otherwise submit the first button in the form (Rotate left) and rotate the image.
  const resizeButton = transformDialog.querySelector<HTMLButtonElement>('button[value="resize"]')!;
  for (const input of [resizeWidthInput, resizeHeightInput]) input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    transformDialog.querySelector('form')!.requestSubmit(resizeButton);
  });
  lockAspectInput.addEventListener('change', () => syncResizeDimension('width'));
  root.querySelector<HTMLButtonElement>('[data-action="transform"]')!.addEventListener('click', (event) => {
    const image = store.get().image;
    if (!image) { statusEl.textContent = 'Load an image first'; return; }
    transformAspectRatio = image.width / image.height;
    resizeWidthInput.value = String(image.width);
    resizeHeightInput.value = String(image.height);
    transformDialog.returnValue = '';
    openDialog(transformDialog, event.currentTarget as HTMLElement);
  });
  transformDialog.addEventListener('close', () => {
    const action = transformDialog.returnValue;
    if (!['resize', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical'].includes(action) || !store.get().image) return;
    const scene = store.get();
    const image = scene.image!;
    canvasHost.cancelGesture();
    store.set({ crop: null, marquee: null, selectedId: null, selectedIds: [] });
    canvasHost.checkpointScene();
    if (action === 'resize') {
      const form = new FormData(transformDialog.querySelector('form')!);
      const resizeWidth = Math.max(1, Math.min(16_384, Math.round(Number(form.get('resizeWidth')))));
      const height = Math.max(1, Math.min(16_384, form.get('lockAspect') === 'on' ? Math.round(resizeWidth * image.height / image.width) : Math.round(Number(form.get('resizeHeight')))));
      if (resizeWidth * height > 134_000_000) { statusEl.textContent = 'Resize dimensions are too large'; return; }
      const canvas = document.createElement('canvas');
      canvas.width = resizeWidth; canvas.height = height;
      const resizeCtx = canvas.getContext('2d')!;
      resizeCtx.imageSmoothingQuality = 'high';
      resizeCtx.drawImage(image.source, 0, 0, resizeWidth, height);
      store.set({ image: imageFromCanvas(canvas), objects: scene.objects.map((object) => scaleAnnotation(object, resizeWidth / image.width, height / image.height)), crop: null, marquee: null, selectedId: null, selectedIds: [], viewport: fitViewport(resizeWidth, height, stageHost.clientWidth, stageHost.clientHeight) });
      return;
    }
    const transform = action as FrameTransform;
    const nextImage = transformedImage(transform)!;
    store.set({ image: nextImage, objects: scene.objects.map((object) => transformAnnotation(object, transform, image.width, image.height)), crop: null, marquee: null, selectedId: null, selectedIds: [], viewport: fitViewport(nextImage.width, nextImage.height, stageHost.clientWidth, stageHost.clientHeight) });
  });  return updateCropRatio;
}
