import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../core/types';
import { parseScene } from '../core/serialize';
import { Store } from './store';
import { AUTOSAVE_KEY, loadAutosave, startAutosave } from './autosave';

afterEach(() => vi.useRealTimers());

describe('autosave', () => {
  it('debounces writes to injected async storage', async () => {
    vi.useFakeTimers();
    const store = new Store(createScene());
    const setItem = vi.fn(async (_key: string, _value: string) => undefined);
    const stop = startAutosave(store, { setItem }, { delay: 100 });

    store.set({ activeTool: 'rect' });
    vi.advanceTimersByTime(50);
    store.set({ activeTool: 'arrow' });
    vi.advanceTimersByTime(99);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][0]).toBe(AUTOSAVE_KEY);
    expect(parseScene(setItem.mock.calls[0][1]).activeTool).toBe('arrow');
    stop();
  });

  it('loads and validates a saved project', async () => {
    const json = JSON.stringify({ ...JSON.parse(JSON.stringify(createScene())), version: 1 });
    await expect(loadAutosave({ getItem: async () => json })).resolves.toMatchObject({ version: 1, activeTool: 'select' });
    await expect(loadAutosave({ getItem: async () => '{' })).rejects.toThrow('Invalid imagemarkup project JSON');
  });
});
