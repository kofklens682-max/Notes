'use strict';
/* IndexedDB on this phone. "state" holds one record with all notes, lists, tasks and habits;
   "blobs" holds photos; "meta" holds small things the service worker also writes (which
   reminders were already shown, this device's id). Used by the page and the service worker. */

const DB_NAME = 'notes-app';
let dbP = null;
function openDB() {
  if (dbP) return dbP;
  dbP = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['state', 'blobs', 'meta']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbP = null; };
      db.onclose = () => { dbP = null; };
      resolve(db);
    };
    r.onerror = () => { dbP = null; reject(r.error); };
    r.onblocked = () => { dbP = null; reject(new Error('Storage is busy, close other copies of the app')); };
  });
  return dbP;
}
async function idb(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    let out;
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage error'));
  });
}
const dbGet = (store, key) => idb(store, 'readonly', (s) => s.get(key));
const dbPut = (store, key, val) => idb(store, 'readwrite', (s) => s.put(val, key));
const dbDel = (store, key) => idb(store, 'readwrite', (s) => s.delete(key));
const dbKeys = (store) => idb(store, 'readonly', (s) => s.getAllKeys());
const dbClear = (store) => idb(store, 'readwrite', (s) => s.clear());
