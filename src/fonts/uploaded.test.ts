import { describe, expect, it } from 'vitest';
import { fontFamilyFromFilename, isFontFile } from './uploaded';

describe('uploaded fonts', () => {
  it('validates font files and derives a safe family name', () => {
    expect(fontFamilyFromFilename('My Font!.woff2')).toBe('My Font');
    expect(isFontFile(new File(['font'], 'notes.txt'))).toBe(false);
    expect(isFontFile(new File(['font'], 'Marker.otf'))).toBe(true);
  });
});
