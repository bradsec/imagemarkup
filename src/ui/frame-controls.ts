import { MAX_PROJECT_IMAGE_DATA_LENGTH, projectImageDataLength } from '../core/serialize';
import type { Scene } from '../core/types';
import { decodeImageFile } from '../io/load-image';
import type { Store } from '../state/store';
import { mountCanvasHost } from './canvas-host';

export function mountFrameControls(root: HTMLElement, store: Store<Scene>, canvasHost: ReturnType<typeof mountCanvasHost>, statusEl: HTMLElement, openDialog: (dialog: HTMLDialogElement, invoker: HTMLElement) => void, watermarkFont: HTMLSelectElement): void {
  const frameDialog = root.querySelector<HTMLDialogElement>('#frame-dialog')!;
  const borderWidthInput = frameDialog.querySelector<HTMLInputElement>('[name="borderWidth"]')!;
  const borderColorInput = frameDialog.querySelector<HTMLInputElement>('[name="borderColor"]')!;
  const watermarkTextInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkText"]')!;
  const watermarkBoldInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkBold"]')!;
  const watermarkItalicInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkItalic"]')!;
  const watermarkBoldButton = frameDialog.querySelector<HTMLButtonElement>('[data-action="toggle-watermark-bold"]')!;
  const watermarkItalicButton = frameDialog.querySelector<HTMLButtonElement>('[data-action="toggle-watermark-italic"]')!;
  const watermarkFileInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkImage"]')!;
  const watermarkColorInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkColor"]')!;
  const watermarkSizeInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkSize"]')!;
  const watermarkOpacityInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkOpacity"]')!;
  const watermarkScaleInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkScale"]')!;
  const watermarkAngleInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkAngle"]')!;
  const watermarkTileInput = frameDialog.querySelector<HTMLInputElement>('[name="watermarkTile"]')!;
  const watermarkAngleOutput = frameDialog.querySelector<HTMLOutputElement>('[data-value="watermark-angle"]')!;
  const syncWatermarkAngle = () => { watermarkAngleOutput.value = `${watermarkAngleInput.value}°`; };
  const syncWatermarkFormat = () => {
    watermarkBoldButton.setAttribute('aria-pressed', String(watermarkBoldInput.checked));
    watermarkItalicButton.setAttribute('aria-pressed', String(watermarkItalicInput.checked));
  };
  watermarkBoldButton.addEventListener('click', () => { watermarkBoldInput.checked = !watermarkBoldInput.checked; syncWatermarkFormat(); });
  watermarkItalicButton.addEventListener('click', () => { watermarkItalicInput.checked = !watermarkItalicInput.checked; syncWatermarkFormat(); });
  watermarkAngleInput.addEventListener('input', syncWatermarkAngle);
  root.querySelector<HTMLButtonElement>('[data-action="frame"]')!.addEventListener('click', (event) => {
    const scene = store.get();
    const watermark = scene.watermark;
    borderWidthInput.value = String(scene.border?.width ?? 0);
    borderColorInput.value = scene.border?.color ?? '#12161f';
    watermarkTextInput.value = watermark?.kind === 'text' ? watermark.text : '';
    watermarkFont.value = watermark?.kind === 'text' ? watermark.fontFamily ?? 'system-ui' : 'system-ui';
    watermarkBoldInput.checked = watermark?.kind === 'text' && watermark.fontWeight === 'bold';
    watermarkItalicInput.checked = watermark?.kind === 'text' && watermark.fontStyle === 'italic';
    watermarkFileInput.value = '';
    watermarkColorInput.value = watermark?.kind === 'text' ? watermark.color : '#ffffff';
    watermarkSizeInput.value = String(watermark?.kind === 'text' ? watermark.size : 32);
    watermarkOpacityInput.value = String(Math.round((watermark?.opacity ?? .35) * 100));
    watermarkScaleInput.value = String(Math.round((watermark?.kind === 'image' ? watermark.scale : .25) * 100));
    watermarkAngleInput.value = String(watermark?.angle ?? -30);
    watermarkTileInput.checked = watermark?.tile ?? false;
    syncWatermarkAngle();
    syncWatermarkFormat();
    openDialog(frameDialog, event.currentTarget as HTMLElement);
  });
  frameDialog.addEventListener('close', async () => {
    if (frameDialog.returnValue === 'remove-watermark') {
      canvasHost.checkpointScene();
      store.set({ watermark: null });
      statusEl.textContent = 'Watermark removed';
      return;
    }
    if (frameDialog.returnValue !== 'apply') return;
    try {
      const form = new FormData(frameDialog.querySelector('form')!);
      const borderWidth = Math.max(0, Number(form.get('borderWidth')));
      const watermarkText = String(form.get('watermarkText') ?? '').trim();
      const watermarkFile = form.get('watermarkImage');
      const frameScene = store.get();
      const remainingImageData = MAX_PROJECT_IMAGE_DATA_LENGTH - projectImageDataLength({ ...frameScene, watermark: null });
      const watermarkImage = watermarkFile instanceof File && watermarkFile.size ? await decodeImageFile(watermarkFile, remainingImageData) : null;
      if (store.get() !== frameScene) {
        (watermarkImage?.source as ImageBitmap | undefined)?.close?.();
        statusEl.textContent = 'Frame settings cancelled because the canvas changed';
        return;
      }
      if (watermarkImage && projectImageDataLength({ ...store.get(), watermark: { kind: 'image', dataUrl: watermarkImage.dataUrl, opacity: 1, scale: 1, tile: false } }) > MAX_PROJECT_IMAGE_DATA_LENGTH) {
        (watermarkImage.source as ImageBitmap).close?.();
        throw new Error('Project image data is too large');
      }
      const currentWatermark = store.get().watermark;
      const existingImage = currentWatermark?.kind === 'image' ? currentWatermark : null;
      const angle = Math.max(-180, Math.min(180, Number(form.get('watermarkAngle'))));
      const watermarkOpacity = Number(form.get('watermarkOpacity')) / 100;
      const tile = form.get('watermarkTile') === 'on';
      canvasHost.checkpointScene();
      store.set({
        border: borderWidth ? { width: borderWidth, color: String(form.get('borderColor')) } : null,
        watermark: watermarkImage ? {
          kind: 'image', dataUrl: watermarkImage.dataUrl, source: watermarkImage.source,
          scale: Number(form.get('watermarkScale')) / 100, opacity: watermarkOpacity, tile, angle,
        } : watermarkText ? {
          kind: 'text', text: watermarkText, size: Math.max(8, Number(form.get('watermarkSize'))), color: String(form.get('watermarkColor')),
          opacity: watermarkOpacity, tile, angle, fontFamily: String(form.get('watermarkFont')), fontWeight: form.get('watermarkBold') === 'on' ? 'bold' : 'normal',
          fontStyle: form.get('watermarkItalic') === 'on' ? 'italic' : 'normal',
        } : existingImage ? { ...existingImage, scale: Number(form.get('watermarkScale')) / 100, opacity: watermarkOpacity, tile, angle } : null,
      });
      statusEl.textContent = 'Frame settings applied';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Could not apply frame settings';
    }
  });

}
