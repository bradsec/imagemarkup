import type { Scene } from '../core/types';
import { parseScene, serializeScene, type SerializedScene } from '../core/serialize';
import type { Store } from './store';

export const AUTOSAVE_KEY = 'imagemarkup-autosave';
const DB_NAME = 'imagemarkup';
const STORE_NAME = 'autosave';

export interface AutosaveStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface AutosaveOptions {
  delay?: number;
  key?: string;
  onError?: (error: unknown) => void;
}

export function startAutosave(
  store: Pick<Store<Scene>, 'get' | 'subscribe'>,
  storage: Pick<AutosaveStorage, 'setItem'>,
  { delay = 500, key = AUTOSAVE_KEY, onError = console.error }: AutosaveOptions = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void storage.setItem(key, serializeScene(store.get())).catch(onError);
    }, delay);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

export async function loadAutosave(storage: Pick<AutosaveStorage, 'getItem'>, key = AUTOSAVE_KEY): Promise<SerializedScene | null> {
  const json = await storage.getItem(key);
  return json === null ? null : parseScene(json);
}

export function createAutosaveStorage(factory: IDBFactory): AutosaveStorage {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  async function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await database;
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const result = run(transaction.objectStore(STORE_NAME));
      let value: T;
      result.onsuccess = () => { value = result.result; };
      result.onerror = () => reject(result.error);
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error ?? new Error('Autosave transaction aborted'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Autosave transaction failed'));
    });
  }

  return {
    getItem: async (key) => (await request('readonly', (store) => store.get(key))) as string | null ?? null,
    setItem: async (key, value) => { await request('readwrite', (store) => store.put(value, key)); },
    removeItem: async (key) => { await request('readwrite', (store) => store.delete(key)); },
  };
}
