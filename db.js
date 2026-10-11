// Kis IndexedDB-réteg. Minden adat csak ezen az eszközön, ebben a böngészőben él.

const DB_NAME = 'protein';
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        db.createObjectStore('entries', { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('weights')) db.createObjectStore('weights', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const put = (store, obj) => tx(store, 'readwrite', (s) => s.put(obj));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));

export function putMany(store, list) {
  return tx(store, 'readwrite', (s) => { for (const o of list) s.put(o); });
}

export async function getKV(key, fallback) {
  const r = await tx('kv', 'readonly', (s) => s.get(key));
  return r === undefined ? fallback : r.value;
}

export const setKV = (key, value) => put('kv', { key, value });

export async function exportAll() {
  const [entries, weights, kv] = await Promise.all([getAll('entries'), getAll('weights'), getAll('kv')]);
  return { app: 'protein', version: 1, exportedAt: new Date().toISOString(), entries, weights, kv };
}

export async function importAll(data) {
  if (!data || data.app !== 'protein') throw new Error('Ez nem a Protein app mentése.');
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['entries', 'weights', 'kv'], 'readwrite');
    for (const name of ['entries', 'weights', 'kv']) {
      const s = t.objectStore(name);
      s.clear();
      for (const o of data[name] || []) s.put(o);
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
