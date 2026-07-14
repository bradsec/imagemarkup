const DB_NAME = 'imagemarkup-uploads';
const STORE_NAME = 'fonts';

export interface UploadedFont {
  family: string;
  data: ArrayBuffer;
}

export function fontFamilyFromFilename(name: string): string {
  return name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[^a-z0-9 _-]/gi, '').trim() || 'Uploaded Font';
}

export function isFontFile(file: File): boolean {
  return /\.(ttf|otf|woff2?)$/i.test(file.name) && file.size <= 20 * 1024 * 1024;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'family' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function register(font: UploadedFont): Promise<void> {
  const face = new FontFace(font.family, font.data);
  await face.load();
  document.fonts.add(face);
}

function transactionResult<T>(transaction: IDBTransaction, request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let value: T;
    request.onsuccess = () => { value = request.result; };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(transaction.error ?? new Error('Font storage transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Font storage transaction failed'));
  });
}

export async function saveUploadedFont(file: File): Promise<string> {
  if (!isFontFile(file)) throw new Error('Choose a TTF, OTF, WOFF, or WOFF2 font under 20 MB');
  const font = { family: fontFamilyFromFilename(file.name), data: await file.arrayBuffer() };
  await register(font);
  const db = await database();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    await transactionResult(transaction, transaction.objectStore(STORE_NAME).put(font));
  } finally {
    db.close();
  }
  return font.family;
}

export async function loadUploadedFonts(): Promise<string[]> {
  const db = await database();
  let fonts: UploadedFont[];
  try {
    const transaction = db.transaction(STORE_NAME);
    fonts = await transactionResult(transaction, transaction.objectStore(STORE_NAME).getAll());
  } finally {
    db.close();
  }
  await Promise.all(fonts.map(register));
  return fonts.map((font) => font.family);
}
