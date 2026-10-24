import { describe, expect, it } from 'vitest';
import { textLineHeight, textWidth } from './text-layout';

describe('text layout', () => {
  it('uses leading and tracking without trailing spacing', () => {
    const measure = (value: string) => value.length * 10;
    expect(textLineHeight(20, 2)).toBe(40);
    expect(textWidth('ABC', 20, 200, measure)).toBe(38);
    expect(textWidth('A', 20, 200, measure)).toBe(10);
  });

  it('counts graphemes rather than code points', () => {
    expect(textWidth('👩‍💻A', 20, 200, () => 20)).toBe(24);
  });

  it('falls back when Intl.Segmenter is unavailable', () => {
    const segmenter = Intl.Segmenter;
    try {
      Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true });
      expect(textWidth('😀A', 20, 200, () => 20)).toBe(24);
    } finally {
      Object.defineProperty(Intl, 'Segmenter', { value: segmenter, configurable: true });
    }
  });
});
