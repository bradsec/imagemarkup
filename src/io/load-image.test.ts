import { describe, it, expect, vi } from 'vitest';
import { decodeImageFile, isImageFile, fileFromDataTransfer, validateDecodedImage } from './load-image';

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

  it('reports unsupported, decode, and dimension errors without raw browser errors', async () => {
    await expect(decodeImageFile(fakeFile('a.txt', 'text/plain'))).rejects.toThrow('Unsupported image type');
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('raw decoder details')));
    await expect(decodeImageFile(fakeFile('a.png', 'image/png'))).rejects.toThrow('Could not decode that image');
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 32_769, height: 1, close }));
    await expect(decodeImageFile(fakeFile('a.png', 'image/png'))).rejects.toThrow('Image dimensions are too large');
    expect(close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
