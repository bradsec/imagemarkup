export function textLineHeight(fontSize: number, multiplier = 1.2): number {
  return fontSize * multiplier;
}

export function textSpacing(fontSize: number, tracking = 0): number {
  return fontSize * tracking / 1000;
}

export function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map(({ segment }) => segment);
  return Array.from(value);
}

export function textWidth(value: string, fontSize: number, tracking: number | undefined, measure: (value: string) => number): number {
  return measure(value) + Math.max(0, graphemes(value).length - 1) * textSpacing(fontSize, tracking);
}
