'use strict';
/* IndexedDB on this phone. "state" holds one small record with lists, tasks, habits and the
   notes' titles; "bodies" holds each note's text separately (so typing saves only that note);
   "blobs" holds photos; "meta" holds small things the service worker also writes (which
   reminders were already shown, this device's id). Used by the page and the service worker. */

const DB_NAME = 'notes-app';
const DB_STORES = ['state', 'bodies', 'blobs', 'meta'];
let dbP = null;
function openDB() {
  if (dbP) return dbP;
  dbP = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of DB_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
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
// Every [key, value] pair of a store, in one read.
async function dbEntries(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly'), st = tx.objectStore(store);
    let keys = [], vals = [];
    st.getAllKeys().onsuccess = (e) => { keys = e.target.result; };
    st.getAll().onsuccess = (e) => { vals = e.target.result; };
    tx.oncomplete = () => resolve(keys.map((k, i) => [k, vals[i]]));
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage error'));
  });
}
// Write several values (or delete, when the value is undefined) in one go.
async function dbPutMany(store, entries) {
  if (!entries.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'), st = tx.objectStore(store);
    for (const [k, v] of entries) { if (v === undefined) st.delete(k); else st.put(v, k); }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage error'));
  });
}
