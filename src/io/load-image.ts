import type { LoadedImage } from '../core/types';
import { MAX_PROJECT_IMAGE_DATA_LENGTH } from '../core/serialize';

export const MAX_IMAGE_DIMENSION = 32_768;
export const MAX_IMAGE_PIXELS = 268_000_000;

export function validateDecodedImage(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION
    || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('Image dimensions are too large');
  }
}

function checkedBitmap(bitmap: ImageBitmap): ImageBitmap {
  try {
    validateDecodedImage(bitmap.width, bitmap.height);
    return bitmap;
  } catch (error) {
    bitmap.close();
    throw error;
  }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** First image File from a paste (items) or drop/file-picker (files) payload. */
export function fileFromDataTransfer(
  items: DataTransferItemList | null,
  files: FileList | null,
): File | null {
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }
  if (files) {
    for (const f of Array.from(files)) {
      if (isImageFile(f)) return f;
    }
  }
  return null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Decode an image file to a drawable bitmap plus a persistable data URL. */
export async function decodeImageFile(file: File, maxDataLength = MAX_PROJECT_IMAGE_DATA_LENGTH): Promise<LoadedImage> {
  if (!isImageFile(file)) throw new Error('Unsupported image type');
  if (file.size > 100 * 1024 * 1024) throw new Error('Choose an image under 100 MB');
  let bitmap: ImageBitmap;
  try { bitmap = checkedBitmap(await createImageBitmap(file)); }
  catch (error) {
    if (error instanceof Error && error.message === 'Image dimensions are too large') throw error;
    throw new Error('Could not decode that image', { cause: error });
  }
  let dataUrl: string;
  try {
    dataUrl = await readAsDataUrl(file);
  } catch {
    bitmap.close();
    throw new Error('Could not read that image');
  }
  if (dataUrl.length > Math.min(maxDataLength, MAX_PROJECT_IMAGE_DATA_LENGTH)) {
    bitmap.close();
    throw new Error('Image data is too large for a project');
  }
  return { source: bitmap, width: bitmap.width, height: bitmap.height, dataUrl };
}

export async function decodeImageDataUrl(dataUrl: string): Promise<LoadedImage> {
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_PROJECT_IMAGE_DATA_LENGTH) throw new Error('Invalid image data');
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const bitmap = checkedBitmap(await createImageBitmap(blob));
  return { source: bitmap, width: bitmap.width, height: bitmap.height, dataUrl };
}
