import type { Scene } from '../core/types';
import { MAX_PROJECT_FILE_BYTES, parseScene, serializeScene, type SerializedScene } from '../core/serialize';
import { sceneSources } from '../core/history';
import { createAutosaveStorage, loadAutosave, startAutosave } from '../state/autosave';
import type { Store } from '../state/store';
import { downloadBlob } from '../render/export';
import { mountCanvasHost } from '../ui/canvas-host';
import { decodeImageDataUrl } from './load-image';

export function mountProjectIo(deps: { root: HTMLElement; store: Store<Scene>; canvasHost: ReturnType<typeof mountCanvasHost>; statusEl: HTMLElement; uploadedFontsReady: Promise<void>; autosaveAvailable: () => void; autosaveUnavailable: () => void }): void {
  const { root, store, canvasHost, statusEl, uploadedFontsReady, autosaveAvailable, autosaveUnavailable } = deps;
  function closeSource(source: CanvasImageSource | undefined): void {
    (source as ImageBitmap | undefined)?.close?.();
  }

  async function restore(dto: SerializedScene, canApply: () => boolean = () => true, undoable = false): Promise<boolean> {
    await uploadedFontsReady;
    const decoded: CanvasImageSource[] = [];
    const decode = async (dataUrl: string): Promise<CanvasImageSource> => {
      const source = (await decodeImageDataUrl(dataUrl)).source;
      decoded.push(source);
      return source;
    };
    try {
      const image = dto.image ? { ...dto.image, source: await decode(dto.image.dataUrl) } : null;
      const objects: Scene['objects'] = [];
      for (const object of dto.objects) objects.push(object.type === 'image'
        ? { ...object, source: await decode(object.dataUrl) }
        : object);
      const watermark = dto.watermark?.kind === 'image'
        ? { ...dto.watermark, source: await decode(dto.watermark.dataUrl) }
        : dto.watermark;
      if (!canApply()) return false;
      canvasHost.setScene({ ...dto, image, objects, watermark, showOverflow: dto.showOverflow ?? false, arrowStartHead: dto.arrowStartHead ?? 'none', arrowEndHead: dto.arrowEndHead ?? 'open', fontStyle: dto.fontStyle ?? 'normal', textUnderline: dto.textUnderline ?? false, letterSpacing: dto.letterSpacing ?? 0, lineHeight: dto.lineHeight ?? 1.2, symbolPoints: dto.symbolPoints ?? 5, symbolInnerRatio: dto.symbolInnerRatio ?? 0.43, symbolSides: dto.symbolSides ?? 6, counterFormat: dto.counterFormat ?? 'numeric', counterNext: dto.counterNext ?? Math.max(1, ...dto.objects.filter((object) => object.type === 'counter').map((object) => object.n + 1)), counterFontSize: dto.counterFontSize ?? dto.counterSize ?? 18, counterFontFamily: dto.counterFontFamily ?? 'system-ui', counterTextColor: dto.counterTextColor ?? '#ffffff', selectedId: null, selectedIds: [], marquee: null }, undoable);
      return true;
    } finally {
      const retained = new Set(sceneSources(store.get()));
      for (const source of decoded) if (!retained.has(source)) closeSource(source);
    }
  }

  try {
    const autosave = createAutosaveStorage(indexedDB);
    startAutosave(store, autosave, { onError: autosaveUnavailable, onSuccess: autosaveAvailable });
    void (async () => {
      const startupScene = store.get();
      try {
        const saved = await loadAutosave(autosave);
        if (saved && store.get() === startupScene) await restore(saved, () => store.get() === startupScene);
      } catch (error) {
        statusEl.textContent = `Autosave restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    })().catch(autosaveUnavailable);
  } catch {
    autosaveUnavailable();
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="save-project"]')) button.addEventListener('click', () => {
    try {
      downloadBlob(new Blob([serializeScene(store.get())], { type: 'application/json' }), 'imagemarkup.imgmarkup');
      statusEl.textContent = 'Project saved';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Could not save project';
    }
  });
  const projectInput = document.createElement('input');
  projectInput.type = 'file';
  projectInput.accept = '.imgmarkup,application/json';
  projectInput.hidden = true;
  root.appendChild(projectInput);
  root.querySelector<HTMLButtonElement>('[data-action="open-project"]')!.addEventListener('click', () => { projectInput.value = ''; projectInput.click(); });
  projectInput.addEventListener('change', async () => {
    const file = projectInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('Project file is too large');
      const project = parseScene(await file.text());
      const scene = store.get();
      if ((scene.image || scene.objects.length) && !window.confirm('Open a project? This replaces the current image and markup.')) return;
      statusEl.textContent = await restore(project, () => store.get() === scene, true) ? 'Project opened' : 'Project open cancelled because the canvas changed';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Could not open project';
    }
  });

}
