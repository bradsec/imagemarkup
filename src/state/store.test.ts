import { describe, it, expect, vi } from 'vitest';
import { Store } from './store';

describe('Store', () => {
  it('returns current state', () => {
    const s = new Store({ n: 1 });
    expect(s.get()).toEqual({ n: 1 });
  });

  it('merges a patch and notifies subscribers', () => {
    const s = new Store({ n: 1, m: 2 });
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ n: 5 });
    expect(s.get()).toEqual({ n: 5, m: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('supports functional update', () => {
    const s = new Store({ n: 1 });
    s.update((st) => ({ n: st.n + 10 }));
    expect(s.get().n).toBe(11);
  });

  it('stops notifying after unsubscribe', () => {
    const s = new Store({ n: 0 });
    const fn = vi.fn();
    const off = s.subscribe(fn);
    off();
    s.set({ n: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});
