import { describe, it, expect } from 'vitest';
import { isImageFile, fileFromDataTransfer, validateDecodedImage } from './load-image';

function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('image input normalization', () => {
  it('accepts image mime types', () => {
    expect(isImageFile(fakeFile('a.png', 'image/png'))).toBe(true);
    expect(isImageFile(fakeFile('a.txt', 'text/plain'))).toBe(false);
  });

  it('picks the first image file from a FileList-like payload', () => {
    const img = fakeFile('a.png', 'image/png');
    const txt = fakeFile('b.txt', 'text/plain');
    const list = [txt, img] as unknown as FileList;
    expect(fileFromDataTransfer(null, list)?.name).toBe('a.png');
  });

  it('returns null when no image present', () => {
    const list = [fakeFile('b.txt', 'text/plain')] as unknown as FileList;
    expect(fileFromDataTransfer(null, list)).toBeNull();
  });

  it('rejects decoded images outside the project allocation budget', () => {
    expect(() => validateDecodedImage(32_768, 8_178)).not.toThrow();
    expect(() => validateDecodedImage(32_769, 1)).toThrow('Image dimensions are too large');
    expect(() => validateDecodedImage(20_000, 20_000)).toThrow('Image dimensions are too large');
    expect(() => validateDecodedImage(0, 10)).toThrow('Image dimensions are too large');
  });
});
