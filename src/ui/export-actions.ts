import type { Scene } from '../core/types';
import { downloadBlob, exportScene, type ExportFormat } from '../render/export';
import type { Store } from '../state/store';

export function mountExportActions(root: HTMLElement, store: Store<Scene>, statusEl: HTMLElement, overflowButton: HTMLButtonElement, openDialog: (dialog: HTMLDialogElement, invoker: HTMLElement) => void): HTMLButtonElement {
  const dialog = root.querySelector<HTMLDialogElement>('#export-dialog')!;
  const formatSelect = dialog.querySelector<HTMLSelectElement>('[name="format"]')!;
  const qualityInput = dialog.querySelector<HTMLInputElement>('[name="quality"]')!;
  const qualityOutput = dialog.querySelector<HTMLOutputElement>('[data-value="jpg-quality"]')!;
  const overflowNote = dialog.querySelector<HTMLElement>('[data-export-overflow-note]')!;
  const qualityLabel = qualityInput.closest('label')!;
  const syncQuality = () => { qualityOutput.value = `${qualityInput.value}%`; };
  const syncExportOptions = () => {
    const isJpeg = formatSelect.value === 'jpeg';
    qualityLabel.hidden = !isJpeg;
    qualityInput.disabled = !isJpeg;
    overflowNote.hidden = !store.get().showOverflow;
    overflowNote.textContent = isJpeg
      ? 'Overflow expands the export; JPG fills transparent areas with white.'
      : 'Overflow expands the export with a transparent background.';
  };
  formatSelect.addEventListener('change', syncExportOptions);
  qualityInput.addEventListener('input', syncQuality);
  syncQuality();
  syncExportOptions();
  overflowButton.addEventListener('click', () => {
    const showOverflow = !store.get().showOverflow;
    store.set({ showOverflow });
    statusEl.textContent = showOverflow ? 'Overflow visible and included in export' : 'Overflow hidden';
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="export"]')) button.addEventListener('click', (event) => {
    if (store.get().image) { syncExportOptions(); openDialog(dialog, event.currentTarget as HTMLElement); }
  });
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'download') return;
    const form = new FormData(dialog.querySelector('form')!);
    const format = form.get('format') as ExportFormat;
    try {
      const quality = format === 'jpeg' ? Number(form.get('quality')) / 100 : undefined;
      const blob = await exportScene(store.get(), format, Number(form.get('scale')), quality);
      downloadBlob(blob, `imagemarkup.${format === 'jpeg' ? 'jpg' : 'png'}`);
      statusEl.textContent = 'Image exported';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Export failed';
    }
  });

  const copyButton = root.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  copyButton.addEventListener('click', async () => {
    try {
      const blob = await exportScene(store.get(), 'png');
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        downloadBlob(blob, 'imagemarkup.png');
        statusEl.textContent = 'Clipboard unavailable, downloaded PNG';
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      statusEl.textContent = 'Image copied';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Copy failed';
    }
  });
  return copyButton;
}
