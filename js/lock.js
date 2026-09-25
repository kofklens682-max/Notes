'use strict';
/* Locked notes and photos. A locked note is encrypted (AES-GCM) with a key made from the
   4-digit notes code (PBKDF2), so its text and photos can't be read from the phone's storage
   without the code. The note's title stays visible in the list, like on iPhone. After the
   code is entered, locked notes stay open until the app has been in the background for a
   minute (or "Lock Now" in Settings). */

const LOCK = { key: null };
const te = new TextEncoder(), td = new TextDecoder();
const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const CHECK = 'notes-lock-ok';

async function deriveKey(pin, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(salt), iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, ct: new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) };
}
async function encText(key, str) { const { iv, ct } = await encBytes(key, te.encode(str)); return { iv: toB64(iv), ct: toB64(ct) }; }
async function decText(key, e) { return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(e.iv) }, key, fromB64(e.ct))); }

async function tryPin(pin) {
  const L = S.settings.lock;
  if (!L) return null;
  try {
    const key = await deriveKey(pin, L.salt);
    if ((await decText(key, L.check)) === CHECK) return key;
  } catch (e) { /* wrong code */ }
  return null;
}
async function makeLock(pin) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(pin, salt);
  return { lock: { salt, check: await encText(key, CHECK) }, key };
}
const lockedNotes = () => S.notes.filter((n) => n.locked);

// Resolves to the key, asking for the code (or creating one) when needed; null if cancelled.
function needKey(sub = 'to open locked notes') {
  if (LOCK.key) return Promise.resolve(LOCK.key);
  return new Promise((resolve) => {
    if (!S.settings.lock) { newCodeFlow('Create a notes code', 'Choose 4 digits for locking notes', resolve); return; }
    pinPad({
      title: 'Enter notes code', sub,
      onCancel: () => resolve(null),
      onDone: async (code, c) => {
        c.busy('Checking…');
        const key = await tryPin(code);
        if (key) { LOCK.key = key; c.close(); resolve(key); } else c.reset('Wrong code', true);
      },
      onForgot: async (c) => {
        const n = lockedNotes().length;
        const ok = await ask({
          title: 'Forgot the notes code?',
          msg: `Locked notes are encrypted, so nobody can open them without the code — not even this app. You can remove the code, which permanently deletes ${plural(n, 'locked note')}.`,
          ok: n ? `Delete ${plural(n, 'locked note')}` : 'Remove code', destructive: true,
        });
        if (!ok) return;
        removeLockedNotes();
        c.close();
        resolve(null);
        render();
        toast('Code removed');
      },
    });
  });
}
function newCodeFlow(title, sub, resolve) {
  let first = null;
  pinPad({
    title, sub,
    onCancel: () => resolve(null),
    onDone: async (code, c) => {
      if (!first) { first = code; c.setTitle('Repeat the code', 'Enter the same 4 digits again'); c.reset(); return; }
      if (code !== first) { first = null; c.setTitle(title, "The codes didn't match — try again"); c.reset(null, true); return; }
      c.busy('Setting up…');
      const { lock, key } = await makeLock(code);
      S.settings.lock = lock;
      LOCK.key = key;
      save();
      c.close();
      resolve(key);
    },
  });
}
function removeLockedNotes() {
  S.notes = S.notes.filter((n) => !n.locked);
  S.settings.lock = null;
  forgetKey();
  save();
}
// Close locked notes: forget the key and the decrypted photos.
function forgetKey() {
  LOCK.key = null;
  for (const [id, v] of photoUrls) if (v.locked) { URL.revokeObjectURL(v.url); photoUrls.delete(id); }
}
// Settings → Change code: re-encrypts every locked note and photo with the new code.
async function changeCode() {
  const oldKey = await new Promise((resolve) => {
    pinPad({
      title: 'Enter current code', onCancel: () => resolve(null),
      onDone: async (code, c) => { c.busy('Checking…'); const k = await tryPin(code); if (k) { c.close(); resolve(k); } else c.reset('Wrong code', true); },
    });
  });
  if (!oldKey) return false;
  let fresh = null;
  const newKey = await new Promise((resolve) => {
    let first = null;
    pinPad({
      title: 'New code', sub: 'Enter 4 new digits', onCancel: () => resolve(null),
      onDone: async (code, c) => {
        if (!first) { first = code; c.setTitle('Repeat the new code'); c.reset(); return; }
        if (code !== first) { first = null; c.setTitle('New code', "The codes didn't match — try again"); c.reset(null, true); return; }
        c.busy('Re-locking notes…');
        fresh = await makeLock(code);
        c.close();
        resolve(fresh.key);
      },
    });
  });
  if (!newKey) return false;
  wakeBodies();
  await bodiesReady;
  for (const n of lockedNotes()) {
    if (!n.enc) continue;
    n.enc = await encText(newKey, await decText(oldKey, n.enc));
    dirtyBodies.add(n.id);
    for (const id of n.blobs) await rekeyPhoto(id, oldKey, newKey);
  }
  S.settings.lock = fresh.lock;
  forgetKey();
  LOCK.key = newKey;
  save();
  return true;
}

// ---------- Photos ----------
// Saved as { type, data: Blob }, or in a locked note as { type, iv, ct } (encrypted bytes).
const photoUrls = new Map(); // id → { url, locked }
async function putPhoto(id, blob, key) {
  if (key) {
    const { iv, ct } = await encBytes(key, new Uint8Array(await blob.arrayBuffer()));
    await dbPut('blobs', id, { type: blob.type, iv, ct: ct.buffer });
  } else await dbPut('blobs', id, { type: blob.type, data: blob });
}
async function readPhoto(id, key = LOCK.key) {
  const rec = await dbGet('blobs', id);
  if (!rec) return null;
  if (rec.data) return { blob: rec.data, locked: false };
  if (!key) return null;
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.ct);
  return { blob: new Blob([bytes], { type: rec.type }), locked: true };
}
async function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id).url;
  let p = null;
  try { p = await readPhoto(id); } catch (e) { /* missing or can't decrypt */ }
  if (!p) return '';
  const url = URL.createObjectURL(p.blob);
  photoUrls.set(id, { url, locked: p.locked });
  return url;
}
async function lockPhoto(id, key) { const rec = await dbGet('blobs', id); if (rec && rec.data) await putPhoto(id, rec.data, key); }
async function unlockPhoto(id, key) { const p = await readPhoto(id, key); if (p && p.locked) await putPhoto(id, p.blob, null); }
async function rekeyPhoto(id, oldKey, newKey) { const p = await readPhoto(id, oldKey); if (p && p.locked) await putPhoto(id, p.blob, newKey); }
// Fill <img data-photo="id"> placeholders.
function fillPhotos(root) {
  $$('img[data-photo]', root).forEach(async (img) => {
    const url = await photoUrl(img.dataset.photo);
    if (url) img.src = url; else img.remove();
  });
}
// Remove photos no note uses any more (deleted notes, photos removed from a note).
async function cleanPhotos() {
  const used = new Set(S.notes.flatMap((n) => n.blobs || []));
  for (const k of await dbKeys('blobs')) if (!used.has(k)) await dbDel('blobs', k);
}

// Lock or unlock one note. `html` is the note's current content.
async function lockNote(n, html) {
  const key = await needKey('to lock this note');
  if (!key) return false;
  n.enc = await encText(key, html);
  n.html = ''; n.preview = ''; n.text = '';
  n.locked = true;
  for (const id of n.blobs) await lockPhoto(id, key);
  save(n);
  return true;
}
async function unlockNote(n) {
  const key = await needKey('to remove the lock');
  if (!key) return null;
  const html = await decText(key, n.enc);
  for (const id of n.blobs) await unlockPhoto(id, key);
  n.enc = null;
  n.locked = false;
  return html;
}
