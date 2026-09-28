'use strict';
/* One account for Budget and Notes: an online copy that comes back on a new phone.
   THE SAME FILE is in both apps (Budget/js/account.js and Notes/js/account.js) — change both.
   Both apps live on the same web address, so signing in in one signs in the other too.

   Everything is locked on the phone before it's sent (AES-GCM with a random "data key"). The
   data key itself is stored online only locked twice: with a key made from the password and with
   one made from the recovery code (PBKDF2, 310 000 rounds). The server gets only keys made from
   them (it keeps their SHA-256), never the password, the code or the data key.
   Each app gives its own adapter (Acct.use): what to save, how to put a copy back, etc.
   Newest copy wins: an upload carries the version it was based on; if another phone saved a newer
   one since, the server refuses and this phone takes that copy (after keeping its own as a copy). */
(function () {
  const URL0 = 'https://apps-sync.kofklens682.workers.dev';
  const K_ACCT = 'acct-v1', K_DEV = 'acct-dev';
  const USER_RE = /^[a-z0-9][a-z0-9_.-]{2,29}$/;
  const TE = new TextEncoder(), TD = new TextDecoder();
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full */ } };
  const sha = async (u8) => new Uint8Array(await crypto.subtle.digest('SHA-256', u8));

  // ---------- Keys ----------
  const normUser = (u) => String(u || '').trim().toLowerCase();
  const normCode = (c) => String(c || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function newCode() {
    const r = crypto.getRandomValues(new Uint8Array(15));
    let bits = '', out = '';
    for (const b of r) bits += b.toString(2).padStart(8, '0');
    for (let i = 0; i < 120; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
    return out.match(/.{4}/g).join('-');
  }
  // From a password (or recovery code): the key the server checks, and the key that locks the data key.
  async function derive(secret, user, kind) {
    const salt = await sha(TE.encode(`kofk-apps-v1:${kind}:${user}`));
    const base = await crypto.subtle.importKey('raw', TE.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const u = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, 512));
    return { auth: hex(u.slice(0, 32)), key: await crypto.subtle.importKey('raw', u.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']) };
  }
  async function aesEnc(key, u8) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, u8));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv);
    out.set(ct, 12);
    return out;
  }
  const aesDec = async (key, u8) => new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, key, u8.slice(12)));
  const wrapDk = async (key, raw) => b64(await aesEnc(key, raw));
  const unwrapDk = async (key, w) => aesDec(key, unb64(w));
  let dkCache = null;
  async function dataKey() {
    const a = lsGet(K_ACCT);
    if (!a) throw Object.assign(new Error('signed out'), { code: 'signedout' });
    if (!dkCache || dkCache.b !== a.dk) dkCache = { b: a.dk, k: await crypto.subtle.importKey('raw', unb64(a.dk), 'AES-GCM', false, ['encrypt', 'decrypt']) };
    return dkCache.k;
  }
  // ---------- Packing: [kind][…] locked with the data key ----------
  const hasGzip = typeof CompressionStream === 'function';
  const pipe = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  async function pack(obj) {
    const json = TE.encode(JSON.stringify(obj));
    const body = hasGzip ? await pipe(json, new CompressionStream('gzip')) : json;
    const plain = new Uint8Array(body.length + 1);
    plain[0] = hasGzip ? 1 : 0;
    plain.set(body, 1);
    return aesEnc(await dataKey(), plain);
  }
  async function unpack(u8) {
    const plain = await aesDec(await dataKey(), u8);
    const body = plain.slice(1);
    return JSON.parse(TD.decode(plain[0] === 1 ? await pipe(body, new DecompressionStream('gzip')) : body));
  }
  async function packBlob(header, data) {
    const h = TE.encode(JSON.stringify(header));
    const plain = new Uint8Array(5 + h.length + data.length);
    plain[0] = 2;
    new DataView(plain.buffer).setUint32(1, h.length);
    plain.set(h, 5);
    plain.set(data, 5 + h.length);
    return aesEnc(await dataKey(), plain);
  }
  async function unpackBlob(u8) {
    const plain = await aesDec(await dataKey(), u8);
    const n = new DataView(plain.buffer).getUint32(1);
    return { header: JSON.parse(TD.decode(plain.slice(5, 5 + n))), data: plain.slice(5 + n) };
  }
  const hashOf = async (obj) => hex(await sha(TE.encode(JSON.stringify(obj))));

  // ---------- Talking to the server ----------
  const MSG = {
    name: 'Use 3–30 letters or numbers (no spaces).', taken: 'That name is taken — choose another, or tap “I have one”.',
    wrong: 'Wrong name, password or code.', nouser: 'No account with that name.', wait: 'Too many tries — wait 15 minutes and try again.',
    offline: 'No internet — try again when you’re online.', broken: 'That didn’t work — check the password.', signedout: 'You were signed out.',
  };
  async function api(method, path, { user, token, body, raw } = {}) {
    const a = lsGet(K_ACCT);
    const u = user || (a && a.user);
    const t = token || (a && a.token);
    const headers = { 'x-user': u };
    if (t) headers.authorization = 'Bearer ' + t;
    if (body) headers['content-type'] = 'application/json';
    let r;
    try { r = await fetch(URL0 + path, { method, headers, body: raw || (body ? JSON.stringify(body) : undefined), cache: 'no-store' }); } catch (e) { throw Object.assign(new Error(MSG.offline), { code: 'offline' }); }
    const ct = r.headers.get('content-type') || '';
    const out = ct.includes('json') ? await r.json().catch(() => ({})) : new Uint8Array(await r.arrayBuffer());
    if (!r.ok) throw Object.assign(new Error(MSG[out.error] || 'Something went wrong — try again.'), { code: out.error || 'server', status: r.status, data: out });
    return out;
  }
  const dev = () => { let d = lsGet(K_DEV); if (!d) { d = hex(crypto.getRandomValues(new Uint8Array(8))); lsSet(K_DEV, d); } return d; };

  // ---------- Signing in and out ----------
  const APPS = ['budget', 'notes'];
  const forgetSync = () => APPS.forEach((k) => lsSet('acct-sync-' + k, null));
  function checkUser(u) { if (!USER_RE.test(u)) throw Object.assign(new Error(MSG.name), { code: 'name' }); }
  function checkPw(pw) { if (String(pw || '').length < 8) throw Object.assign(new Error('The password needs at least 8 characters.'), { code: 'short' }); }
  async function signUp(user, pw) {
    user = normUser(user);
    checkUser(user);
    checkPw(pw);
    const dk = crypto.getRandomValues(new Uint8Array(32)), code = newCode();
    const p = await derive(pw, user, 'pw'), r = await derive(normCode(code), user, 'rc');
    const res = await api('POST', '/signup', { user, body: { auth: p.auth, rauth: r.auth, wrapPw: await wrapDk(p.key, dk), wrapRc: await wrapDk(r.key, dk) } });
    forgetSync();
    lsSet(K_ACCT, { user, token: res.token, dk: b64(dk), since: Date.now() });
    return code;
  }
  async function signIn(user, pw) {
    user = normUser(user);
    checkUser(user);
    const p = await derive(pw, user, 'pw');
    const res = await api('POST', '/login', { user, body: { auth: p.auth } });
    let dk;
    try { dk = await unwrapDk(p.key, res.wrap); } catch (e) { throw Object.assign(new Error(MSG.broken), { code: 'broken' }); }
    forgetSync();
    lsSet(K_ACCT, { user, token: res.token, dk: b64(dk), since: Date.now() });
  }
  // Forgot the password: the recovery code opens the account, and a new password is set at once.
  async function recover(user, code, newPw) {
    user = normUser(user);
    checkUser(user);
    checkPw(newPw);
    const r = await derive(normCode(code), user, 'rc');
    const res = await api('POST', '/login', { user, body: { rauth: r.auth } });
    let dk;
    try { dk = await unwrapDk(r.key, res.wrap); } catch (e) { throw Object.assign(new Error(MSG.broken), { code: 'broken' }); }
    const p = await derive(newPw, user, 'pw');
    await api('POST', '/password', { user, token: res.token, body: { auth: p.auth, wrapPw: await wrapDk(p.key, dk) } });
    forgetSync();
    lsSet(K_ACCT, { user, token: res.token, dk: b64(dk), since: Date.now() });
  }
  async function changePassword(oldPw, newPw) {
    const a = lsGet(K_ACCT);
    if (!a) throw Object.assign(new Error(MSG.signedout), { code: 'signedout' });
    checkPw(newPw);
    const o = await derive(oldPw, a.user, 'pw');
    const res = await api('POST', '/login', { user: a.user, body: { auth: o.auth } }); // proves the old password
    const p = await derive(newPw, a.user, 'pw');
    await api('POST', '/password', { user: a.user, token: res.token, body: { auth: p.auth, wrapPw: await wrapDk(p.key, unb64(a.dk)) } });
    await api('POST', '/logout', { user: a.user, token: a.token }).catch(() => {});
    lsSet(K_ACCT, { ...a, token: res.token });
  }
  async function signOut() {
    const a = lsGet(K_ACCT);
    if (a) await api('POST', '/logout', {}).catch(() => {});
    lsSet(K_ACCT, null);
    forgetSync();
    dkCache = null;
    setStatus('idle');
  }

  // ---------- Keeping the online copy up to date ----------
  let app = null, timer = 0, chain = Promise.resolve(), quietN = 0, retryT = 0;
  const ST = { status: 'idle', at: 0, msg: '' };
  const syncKey = () => 'acct-sync-' + app.key;
  const getSt = () => ({ base: 0, dirty: 0, hash: '', linked: false, blobs: [], ...(lsGet(syncKey()) || {}) });
  const putSt = (s) => lsSet(syncKey(), s);
  function setStatus(s, msg = '') {
    ST.status = s;
    ST.msg = msg;
    if (s === 'ok') ST.at = Date.now();
    if (app && app.onStatus) { try { app.onStatus(); } catch (e) { /* the page will show it later */ } }
  }
  // Call after every change the person makes (the app's save()).
  function changed() {
    if (!app || quietN || !lsGet(K_ACCT)) return;
    const s = getSt();
    if (!s.dirty) { s.dirty = Date.now(); putSt(s); }
    schedule(app.wait || 3000);
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => sync(), ms); }
  const sync = (opts = {}) => (chain = chain.catch(() => {}).then(() => runSync(opts)));
  async function download(key) {
    const bytes = await api('GET', '/obj?key=' + encodeURIComponent(key));
    return unpack(bytes);
  }
  // Take the online copy: photos first (Notes), then everything else.
  async function takeOnline(m, obj, why) {
    if (!obj) obj = await download(app.key);
    const ids = app.blobIdsOf ? app.blobIdsOf(obj) : [];
    let n = 0;
    for (const id of ids) {
      if (await app.hasBlob(id)) continue;
      try { const b = await unpackBlob(await api('GET', '/obj?key=' + encodeURIComponent('blob:' + id))); await app.writeBlob(id, b.header, b.data); } catch (e) { if (e.code === 'offline') throw e; /* a photo that's gone online: skip it */ }
      if (++n % 5 === 0) setStatus('down', `Bringing back photos… ${n}/${ids.length}`);
    }
    quietN++;
    try { await app.apply(obj, why); } finally { quietN--; }
    const s = getSt();
    Object.assign(s, { base: m.at, dirty: 0, hash: '', linked: true, blobs: ids });
    putSt(s);
  }
  async function upload(m, force) {
    const s0 = getSt(), dirtyAt = s0.dirty;
    const obj = await app.collect();
    const h = await hashOf(obj);
    if (!force && m && m.at === s0.base && h === s0.hash) { const s = getSt(); if (s.dirty === dirtyAt) s.dirty = 0; s.linked = true; putSt(s); return; }
    // Photos first, so the copy never points at a picture that isn't online yet.
    if (app.blobIds) {
      const want = app.blobIds(), have = new Set(s0.blobs);
      for (const id of want) {
        if (have.has(id)) continue;
        const b = await app.readBlob(id);
        if (!b) continue;
        await api('PUT', `/obj?key=${encodeURIComponent('blob:' + id)}&at=1&dev=${dev()}&base=0&force=1`, { raw: await packBlob(b.header, b.data) });
        have.add(id);
        const s = getSt(); s.blobs = [...have]; putSt(s);
      }
    }
    const at = Date.now();
    await api('PUT', `/obj?key=${app.key}&at=${at}&dev=${dev()}&base=${s0.base || 0}${force ? '&force=1' : ''}`, { raw: await pack(obj) });
    const s = getSt();
    s.base = at;
    s.hash = h;
    s.linked = true;
    if (s.dirty === dirtyAt) s.dirty = 0; // (changes made while uploading go next time)
    putSt(s);
    if (app.blobIds && s.blobs.length) {
      const keep = new Set(app.blobIds());
      if (s.blobs.some((id) => !keep.has(id))) {
        await api('POST', '/keep', { body: { keep: [...keep].map((id) => 'blob:' + id) } }).catch(() => {});
        const t = getSt(); t.blobs = t.blobs.filter((id) => keep.has(id)); putSt(t);
      }
    }
    if (s.dirty) schedule(app.wait || 3000);
  }
  async function runSync({ quietUi } = {}) {
    if (!app || !lsGet(K_ACCT)) return;
    clearTimeout(timer);
    clearTimeout(retryT);
    try {
      setStatus('busy');
      const meta = await api('GET', '/meta');
      const m = meta.objs[app.key];
      const s = getSt();
      if (!s.linked) {
        // First time on this phone for this app.
        if (!m) await upload(null, false);
        else if (app.isEmpty()) { setStatus('down', 'Bringing your data back…'); await takeOnline(m, null, 'first'); }
        else {
          const obj = await download(app.key);
          const pick = await app.askWhich({ onlineAt: m.at, online: app.summary(obj), phone: app.localSummary(), obj });
          if (pick === 'online') await takeOnline(m, obj, 'chosen');
          else await upload(m, true);
        }
      } else if (m && m.at !== s.base && m.dev !== dev()) {
        await takeOnline(m, null, 'newer'); // saved from another phone since: that copy is newer
      } else if (s.dirty || !m) {
        try { await upload(m, false); } catch (e) {
          if (e.code !== 'newer') throw e;
          await takeOnline({ at: e.data.at }, null, 'newer');
        }
      }
      setStatus('ok');
    } catch (e) {
      if (e.code === 'signedout' || e.code === 'nouser') { lsSet(K_ACCT, null); forgetSync(); setStatus('idle'); if (app.onSignedOut) app.onSignedOut(); return; }
      setStatus(e.code === 'offline' ? 'offline' : 'error', e.message);
      if (getSt().dirty) retryT = setTimeout(() => sync(), e.code === 'offline' ? 30000 : 120000);
    }
  }
  function use(adapter) {
    app = adapter;
    document.addEventListener('visibilitychange', () => { if (!lsGet(K_ACCT)) return; if (document.hidden) { if (getSt().dirty) sync(); } else sync(); });
    window.addEventListener('online', () => { if (lsGet(K_ACCT)) sync(); });
    // Signed in or out in the other app (same site).
    window.addEventListener('storage', (e) => { if (e.key === K_ACCT) { dkCache = null; if (lsGet(K_ACCT)) sync(); else setStatus('idle'); } });
  }
  window.Acct = {
    use, changed, sync, signUp, signIn, recover, changePassword, signOut,
    user: () => (lsGet(K_ACCT) || {}).user || null,
    signedIn: () => !!lsGet(K_ACCT),
    status: () => ({ ...ST, dirty: !!(app && getSt().dirty) }),
    quiet: (f) => { quietN++; try { return f(); } finally { quietN--; } },
    code: newCode,
  };
})();
