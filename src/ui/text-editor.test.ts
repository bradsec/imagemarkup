// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationHistory } from '../core/history';
import { createScene, type Annotation } from '../core/types';
import { Store } from '../state/store';
import { createInlineTextEditor } from './text-editor';

function setup() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const text: Annotation = {
    id: 't', type: 'text', position: { x: 10, y: 20 }, text: 'Hello', fontFamily: 'Kalam', fontSize: 32, letterSpacing: 0, lineHeight: 1.2,
    fontWeight: 'normal', fontStyle: 'normal', underline: false, align: 'left', style: { color: '#ff0000', width: 2, opacity: 1 },
  } as Annotation;
  const store = new Store({ ...createScene(), objects: [text] });
  const editor = createInlineTextEditor({ host, store, history: new AnnotationHistory(), draw: () => {}, onEscape: () => {} });
  return { host, store, editor };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ font: '', measureText: (value: string) => ({ width: value.length * 10 }) } as unknown as CanvasRenderingContext2D);
});

describe('createInlineTextEditor', () => {
  it('commits edited text when the user clicks outside', () => {
    const { host, store, editor } = setup();
    editor.edit('t');
    host.querySelector('textarea')!.value = 'Changed';
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(store.get().objects[0]).toMatchObject({ text: 'Changed' });
    expect(editor.editingId()).toBeNull();
  });

  it('discards a cancelled editor without committing on a later outside click', () => {
    const { host, store, editor } = setup();
    editor.edit('t');
    host.querySelector('textarea')!.value = 'Cancelled';
    editor.discard();
    expect(host.querySelector('textarea')).toBeNull();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    editor.finish();
    expect(store.get().objects[0]).toMatchObject({ text: 'Hello' });
  });
});
