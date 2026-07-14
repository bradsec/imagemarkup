import type { LoadedImage } from '../core/types';

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
export async function decodeImageFile(file: File): Promise<LoadedImage> {
  if (!isImageFile(file) || file.size > 100 * 1024 * 1024) throw new Error('Choose an image under 100 MB');
  const bitmap = checkedBitmap(await createImageBitmap(file));
  let dataUrl: string;
  try {
    dataUrl = await readAsDataUrl(file);
  } catch (error) {
    bitmap.close();
    throw error;
  }
  return { source: bitmap, width: bitmap.width, height: bitmap.height, dataUrl };
}

export async function decodeImageDataUrl(dataUrl: string): Promise<LoadedImage> {
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > 100_000_000) throw new Error('Invalid image data');
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const bitmap = checkedBitmap(await createImageBitmap(blob));
  return { source: bitmap, width: bitmap.width, height: bitmap.height, dataUrl };
}
