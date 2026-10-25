import type { AnnotationHistory } from '../core/history';
import { MAX_PROJECT_IMAGE_DATA_LENGTH, projectImageDataLength } from '../core/serialize';
import type { LoadedImage, Scene } from '../core/types';
import { fitViewport } from '../core/viewport';
import { decodeImageFile, fileFromDataTransfer } from '../io/load-image';
import type { Store } from '../state/store';

export interface ImageInputOptions {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  store: Store<Scene>;
  history: AnnotationHistory;
  emptyState: HTMLElement | null;
  replaceScene: (next: Scene, undoable?: boolean) => void;
  onStatus?: (text: string) => void;
}

export interface ImageInput {
  openImage(intent?: 'replace' | 'place'): void;
  /** Opens a decoded image as the new document, after confirming any replacement. */
  setImage(img: LoadedImage): void;
}

/** Owns image file picking, drag-drop, paste, decoding, and the load error notice. */
export function createImageInput({ host, canvas, store, history, emptyState, replaceScene, onStatus }: ImageInputOptions): ImageInput {
  const errorNotice = host.querySelector<HTMLElement>('.load-error')!;
  const errorText = errorNotice.querySelector<HTMLElement>('[role="alert"]')!;
  const clearError = () => { errorNotice.hidden = true; errorText.textContent = ''; };
  const showError = (message: string) => { errorNotice.hidden = false; errorText.textContent = message; };
  errorNotice.querySelector('button')!.addEventListener('click', clearError);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;
  host.appendChild(fileInput);
  let fileIntent: 'replace' | 'place' = 'replace';
  const openImage = (intent: 'replace' | 'place' = 'replace') => {
    fileIntent = intent;
    fileInput.value = '';
    fileInput.click();
  };
  let loadGeneration = 0;

  function centerImage(img: LoadedImage): boolean {
    const scene = store.get();
    if ((scene.image || scene.objects.length) && !window.confirm('Open a new image? This replaces the current image and markup.')) return false;
    const rect = host.getBoundingClientRect();
    replaceScene({ ...scene,
      image: img,
      viewport: fitViewport(img.width, img.height, rect.width || canvas.width, rect.height || canvas.height),
      objects: [],
      selectedId: null,
      selectedIds: [],
      marquee: null,
      crop: null,
      border: null,
      watermark: null,
    }, true);
    return true;
  }

  async function load(file: File, intent: 'replace' | 'place'): Promise<void> {
    const generation = ++loadGeneration;
    onStatus?.('Loading image...');
    try {
      const img = await decodeImageFile(file, intent === 'place'
        ? MAX_PROJECT_IMAGE_DATA_LENGTH - projectImageDataLength(store.get())
        : MAX_PROJECT_IMAGE_DATA_LENGTH);
      if (generation !== loadGeneration) {
        (img.source as ImageBitmap).close?.();
        return;
      }
      const scene = store.get();
      if (scene.image && intent === 'place') {
        if (projectImageDataLength(scene) + img.dataUrl.length > MAX_PROJECT_IMAGE_DATA_LENGTH) {
          (img.source as ImageBitmap).close?.();
          throw new Error('Image data is too large for a project');
        }
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
        clearError();
        return;
      }
      if (!centerImage(img)) {
        (img.source as ImageBitmap).close?.();
        onStatus?.('Image open cancelled');
        return;
      }
      if (emptyState) emptyState.style.display = 'none';
      clearError();
      onStatus?.(`${img.width} x ${img.height}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      showError(['Unsupported image type', 'Choose an image under 100 MB', 'Image dimensions are too large', 'Image data is too large for a project', 'Could not decode that image', 'Could not read that image'].includes(message) ? message : 'Could not load that image');
      onStatus?.('Image load failed');
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileFromDataTransfer(null, fileInput.files) ?? fileInput.files?.[0];
    if (file) await load(file, fileIntent);
  });

  host.addEventListener('dragover', (e) => e.preventDefault());
  host.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types.includes('Files')) host.classList.add('dragover');
  });
  host.addEventListener('dragleave', (e) => {
    if (!(e.relatedTarget instanceof Node) || !host.contains(e.relatedTarget)) host.classList.remove('dragover');
  });
  host.addEventListener('dragend', () => host.classList.remove('dragover'));
  host.addEventListener('drop', async (e) => {
    e.preventDefault();
    host.classList.remove('dragover');
    const file = fileFromDataTransfer(e.dataTransfer?.items ?? null, e.dataTransfer?.files ?? null) ?? e.dataTransfer?.files?.[0];
    if (file) await load(file, store.get().image && store.get().activeTool === 'image' ? 'place' : 'replace');
  });

  window.addEventListener('paste', async (e) => {
    const file = fileFromDataTransfer(e.clipboardData?.items ?? null, null);
    if (file) await load(file, store.get().image && store.get().activeTool === 'image' ? 'place' : 'replace');
  });

  return {
    openImage,
    setImage(img) {
      if (!centerImage(img)) return;
      if (emptyState) emptyState.style.display = 'none';
      clearError();
    },
  };
}
