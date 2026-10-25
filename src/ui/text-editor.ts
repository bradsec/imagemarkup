import type { Point } from '../core/geometry';
import type { AnnotationHistory } from '../core/history';
import { textLineHeight, textSpacing, textWidth } from '../core/text-layout';
import type { Scene } from '../core/types';
import type { Store } from '../state/store';

export interface InlineTextEditorOptions {
  host: HTMLElement;
  store: Store<Scene>;
  history: AnnotationHistory;
  draw: () => void;
  /** Runs after Escape closes the editor, before the tool resets to Move. */
  onEscape: () => void;
}

export interface InlineTextEditor {
  /** Id of the text object being edited, or null. */
  editingId(): string | null;
  edit(id: string, checkpoint?: boolean, caretPoint?: Point): void;
  sync(): void;
  finish(): void;
  /** Drops the editor element without committing, as a cancelled gesture does. */
  discard(): void;
}

export function createInlineTextEditor({ host, store, history, draw, onEscape }: InlineTextEditorOptions): InlineTextEditor {
  let editingId: string | null = null;
  let syncCurrent: (() => void) | null = null;
  let finishCurrent: (() => void) | null = null;

  function edit(id: string, checkpoint = true, caretPoint?: Point): void {
    const before = store.get();
    const object = before.objects.find((item) => item.id === id);
    if (!object || object.type !== 'text') return;
    finishCurrent?.();
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
      const visualFontSize = current.fontSize * scale;
      const editorScale = window.matchMedia?.('(any-pointer: coarse)').matches ? Math.min(1, visualFontSize / 16) : 1;
      const lineHeight = textLineHeight(visualFontSize, current.lineHeight);
      textarea.style.fontFamily = current.fontFamily;
      textarea.style.fontSize = `${visualFontSize / editorScale}px`;
      textarea.style.transformOrigin = editorScale < 1 ? 'top left' : '';
      textarea.style.transform = editorScale < 1 ? `scale(${editorScale})` : '';
      textarea.style.fontWeight = current.fontWeight;
      textarea.style.fontStyle = current.fontStyle ?? 'normal';
      textarea.style.textDecoration = current.underline ? 'underline' : 'none';
      textarea.style.color = current.style.color;
      textarea.style.opacity = String(current.style.opacity);
      textarea.style.textAlign = current.align;
      textarea.style.lineHeight = `${lineHeight / editorScale}px`;
      textarea.style.letterSpacing = `${textSpacing(visualFontSize, current.letterSpacing) / editorScale}px`;
      textarea.style.top = `${screen.y - visualFontSize * 0.8}px`;
      measure.font = `${current.fontStyle ?? 'normal'} ${current.fontWeight} ${visualFontSize}px "${current.fontFamily}"`;
      const lines = textarea.value.split('\n');
      const measuredWidth = Math.max(2, ...lines.map((line) => textWidth(line || ' ', visualFontSize, current.letterSpacing, (value) => measure.measureText(value).width) + 2));
      const editorWidth = Math.min(measuredWidth, Math.max(2, host.clientWidth - 16));
      textarea.style.width = `${editorWidth / editorScale}px`;
      textarea.style.height = `${Math.max(lineHeight, lines.length * lineHeight) / editorScale}px`;
      const left = current.align === 'center' ? screen.x - editorWidth / 2 : current.align === 'right' || current.align === 'end' ? screen.x - editorWidth : screen.x;
      textarea.style.left = `${Math.max(4, Math.min(left, host.clientWidth - editorWidth - 4))}px`;
    };
    syncCurrent = resizeEditor;
    resizeEditor();
    textarea.addEventListener('input', resizeEditor);
    const finish = () => {
      if (finished) return;
      finished = true;
      const text = textarea.value.trimEnd();
      if (checkpoint && text !== object.text) history.record(before);
      document.removeEventListener('pointerdown', finishFromOutside, true);
      document.removeEventListener('focusin', finishFromFocus, true);
      editingId = null;
      syncCurrent = null;
      finishCurrent = null;
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
    finishCurrent = finish;
    document.addEventListener('pointerdown', finishFromOutside, true);
    document.addEventListener('focusin', finishFromFocus, true);
    textarea.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      escaped = true;
      finish();
      onEscape();
      store.set({ activeTool: 'select', selectedId: null, selectedIds: [], crop: null, marquee: null });
    });
    editingId = id;
    store.set({ selectedId: id, selectedIds: [], marquee: null });
    draw();
    textarea.focus();
    let caret = textarea.value.length;
    if (caretPoint) {
      const scene = store.get();
      const current = scene.objects.find((item) => item.id === id);
      if (current?.type === 'text') {
        const scale = scene.viewport.scale;
        const lineHeight = textLineHeight(current.fontSize * scale, current.lineHeight);
        const lines = textarea.value.split('\n');
        const top = Number.parseFloat(textarea.style.top);
        const left = Number.parseFloat(textarea.style.left);
        const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor((caretPoint.y - top) / lineHeight)));
        const line = lines[lineIndex];
        const editorWidth = textarea.getBoundingClientRect().width;
        const lineWidth = textWidth(line, current.fontSize * scale, current.letterSpacing, (value) => measure.measureText(value).width);
        const textOffset = current.align === 'center' ? (editorWidth - lineWidth) / 2 : current.align === 'right' || current.align === 'end' ? editorWidth - lineWidth : 0;
        const x = caretPoint.x - left - textOffset;
        let column = 0;
        while (column < line.length && textWidth(line.slice(0, column + 1), current.fontSize * scale, current.letterSpacing, (value) => measure.measureText(value).width) < x) column++;
        caret = lines.slice(0, lineIndex).reduce((total, value) => total + value.length + 1, 0) + column;
      }
    }
    textarea.setSelectionRange(caret, caret);
  }

  return {
    editingId: () => editingId,
    edit,
    sync: () => syncCurrent?.(),
    finish: () => finishCurrent?.(),
    discard() {
      editingId = null;
      host.querySelector('.text-editor')?.remove();
    },
  };
}
