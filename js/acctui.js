'use strict';
/* Notes' side of the account (account.js does the saving online): what goes online (notes with
   their text, reminders, habits, settings — and photos and drawings, each on its own), putting an
   online copy back, and the screens: Account at the top of Settings, create / sign in / recovery
   code / change password. Loaded after settings.js. */

const acctWhen = (ms) => { const d = new Date(ms); return `${dayName(dateOf(ms), true)}, ${hm(ms)}`; };
const notesSummary = (st) => `${plural((st.notes || []).length, 'note')}, ${plural((st.tasks || []).length, 'reminder')}`;
Acct.use({
  key: 'notes',
  wait: 6000, // (typing makes many small changes: send them together)
  async collect() {
    wakeBodies();
    await bodiesReady;
    if (ED) await saveEditor();
    const st = JSON.parse(JSON.stringify(S));
    delete st.rev;
    return { v: 1, state: st };
  },
  isEmpty: () => !S.notes.length && !S.tasks.length && !S.habits.length && !S.grocery.items.length,
  summary: (o) => notesSummary((o && o.state) || {}),
  localSummary: () => notesSummary(S),
  // Photos and drawings go up one by one (once each), locked like everything else.
  blobIds: () => [...new Set(S.notes.flatMap((n) => n.blobs))],
  blobIdsOf: (o) => [...new Set(((o && o.state && o.state.notes) || []).flatMap((n) => (Array.isArray(n.blobs) ? n.blobs : [])))],
  async readBlob(id) {
    const rec = await dbGet('blobs', id);
    if (!rec) return null;
    if (rec.data) return { header: { type: rec.type }, data: new Uint8Array(await rec.data.arrayBuffer()) };
    return { header: { type: rec.type, iv: toB64(new Uint8Array(rec.iv)) }, data: new Uint8Array(rec.ct) };
  },
  hasBlob: async (id) => !!(await dbGet('blobs', id)),
  async writeBlob(id, h, data) {
    if (!/^[a-z0-9]{4,40}$/i.test(id) || typeof h.type !== 'string') return;
    if (h.iv) await dbPut('blobs', id, { type: h.type, iv: fromB64(h.iv), ct: data.slice().buffer });
    else await dbPut('blobs', id, { type: h.type, data: new Blob([data], { type: h.type }) });
  },
  async askWhich({ onlineAt, online, phone, obj }) {
    const useOnline = await ask({
      title: 'This phone already has notes',
      msg: `Online (saved ${acctWhen(onlineAt)}): ${online}. This phone: ${phone}. Which should stay?`,
      ok: 'Use the online copy', cancel: 'Keep this phone’s',
    });
    if (!useOnline) { try { await dbPut('meta', 'online-before', { at: Date.now(), state: obj.state }); } catch (e) { /* only a spare */ } }
    return useOnline ? 'online' : 'phone';
  },
  async apply(obj, why) {
    // What this phone held is kept aside, just in case.
    wakeBodies();
    await bodiesReady;
    if (ED) await saveEditor();
    try { await dbPut('meta', 'before-online', { at: Date.now(), state: JSON.parse(JSON.stringify(S)) }); } catch (e) { /* only a spare */ }
    const st = normalize(obj.state);
    st.notes.forEach((n) => { n.html = cleanHtml(n.html); });
    st.rev = (S.rev || 0) + 1;
    forgetKey();
    await dbClear('bodies');
    S = st;
    S.notes.forEach((n) => dirtyBodies.add(n.id));
    bodiesLoaded = true;
    await flush();
    applyTheme();
    resetScreens();
    remindSoon();
    toast(why === 'newer' ? 'Brought in the newer copy from your other phone' : why === 'chosen' ? 'Using the online copy' : 'Everything is back ✓');
  },
  onStatus: () => { const el = $('#acct-status'); if (el) el.innerHTML = acctStatusText(); },
  onSignedOut: () => { toast('You were signed out of your account'); if (cur().s === 'settings') render(); },
});

// ---------- Settings: the Account section ----------
function acctAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60e3);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
function acctStatusText() {
  const s = Acct.status();
  if (s.status === 'busy') return 'Saving…';
  if (s.status === 'down') return esc(s.msg || 'Bringing your notes back…');
  if (s.status === 'offline') return 'Waiting for internet';
  if (s.status === 'error') return '<span style="color:var(--red)">Not saved</span>';
  if (s.dirty) return 'Saving soon…';
  if (s.status === 'ok') return `<span style="color:var(--green)">✓ Saved · ${acctAgo(s.at)}</span>`;
  return 'Checking…';
}
function acctSection() {
  if (!Acct.signedIn()) {
    return `<h2 class="sec">Account</h2>
      <div class="card"><button class="row" data-act="acct-open" data-v="new">${tile('shield', '#34C759')}<span class="lbl">Save Online</span>${glyph('chevR', 'chev')}</button>
      <button class="row" data-act="acct-open" data-v="signin">${tile('download', '#007AFF')}<span class="lbl">I Have an Account</span>${glyph('chevR', 'chev')}</button></div>
      <p class="foot">One account for Notes and Budget: everything is saved online by itself, locked with your password. On a new phone, sign in and it all comes back.</p>`;
  }
  return `<h2 class="sec">Account</h2>
    <div class="card">
      <div class="row static">${tile('shield', '#34C759')}<span class="lbl">${esc(Acct.user())}</span><span class="val" id="acct-status">${acctStatusText()}</span></div>
      <button class="row" data-act="acct-now">${tile('upload', '#007AFF')}<span class="lbl">Save Now</span></button>
      <button class="row" data-act="acct-open" data-v="password">${tile('lock', '#8E8E93')}<span class="lbl">Change Password</span>${glyph('chevR', 'chev')}</button>
      <button class="row" data-act="acct-signout">${tile('x', '#FF3B30')}<span class="lbl danger">Sign Out on This Phone</span></button>
    </div>
    <p class="foot">Notes and Budget are saved online by themselves a few seconds after every change — with photos and drawings — locked with your password.</p>`;
}

// ---------- The account sheet ----------
let AC = null; // { mode, user, busy, err, code }
function openAcct(mode) {
  AC = { mode, user: (AC && AC.user) || Acct.user() || '', busy: false, err: '', code: AC && AC.code };
  openSheet(acctHtml(), mountAcct, 'tall');
}
const acctField = (id, label, type = 'text', value = '', extra = '') => `<label class="frow"><span class="lbl">${label}</span><input id="${id}" type="${type}" value="${esc(value)}" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="go" ${extra}></label>`;
function acctHtml() {
  const m = AC.mode, cancel = '<button data-act="close-sheet">Cancel</button>';
  const err = `<p class="foot ac-err">${esc(AC.err)}</p>`;
  const go = (label) => `<button class="ac-btn" data-act="acct-go" ${AC.busy ? 'disabled' : ''}>${AC.busy ? 'Please wait…' : label}</button>`;
  if (m === 'code') {
    return `${sheetHead('Recovery Code', '', '')}<div class="sheet-body">
      <div class="ac-hero">${tile('lock', '#FF9500', 'ac-tile')}<p>If you ever forget your password, this code is the only way back in. Keep it somewhere safe — for example in Telegram “Saved Messages”.</p></div>
      <div class="card ac-code">${esc(AC.code).replace(/^(.{14})-/, '$1<br>')}</div>
      <button class="ac-btn" data-act="acct-share">${glyph('share')}Send It to Telegram…</button>
      <button class="ac-btn grey" data-act="acct-done">I've Saved It</button>
      <p class="foot">Without the password or this code nobody can open your notes — so it can't be reset for you.</p></div>`;
  }
  if (m === 'password') {
    return `${sheetHead('Change Password', cancel, '')}<div class="sheet-body">
      <div class="card form acf">${acctField('ac-old', 'Current', 'password')}${acctField('ac-pw', 'New', 'password')}${acctField('ac-pw2', 'Again', 'password')}</div>
      ${err}${go('Change Password')}</div>`;
  }
  if (m === 'recover') {
    return `${sheetHead('Forgot Password', cancel, '')}<div class="sheet-body">
      <p class="foot" style="margin:0 16px 12px">Type your name and the recovery code you saved when you made the account, then choose a new password.</p>
      <div class="card form acf">${acctField('ac-user', 'Name', 'text', AC.user)}${acctField('ac-code', 'Code', 'text', '', 'placeholder="XXXX-XXXX-…"')}${acctField('ac-pw', 'New password', 'password')}${acctField('ac-pw2', 'Again', 'password')}</div>
      ${err}${go('Open My Account')}</div>`;
  }
  const isNew = m === 'new';
  return `${sheetHead(isNew ? 'Save Online' : 'Sign In', cancel, '')}<div class="sheet-body">
    <div class="ac-hero">${tile('shield', '#34C759', 'ac-tile')}<b>${isNew ? 'One account for both apps' : 'Welcome back'}</b><p>${isNew ? 'Everything is saved online by itself. On a new phone, sign in and it all comes back.' : 'Sign in to bring your Notes and Budget back.'}</p></div>
    <div class="seg">${segButtons('acct-mode', [['new', 'Create Account'], ['signin', 'I Have One']], m)}</div>
    <div class="card form acf" style="margin-top:14px">${acctField('ac-user', 'Name', 'text', AC.user, 'placeholder="e.g. kofklens"')}${acctField('ac-pw', 'Password', 'password')}${isNew ? acctField('ac-pw2', 'Again', 'password') : ''}</div>
    ${err}
    ${isNew ? '<p class="foot">Your notes are locked with this password on the phone before they’re sent, so nobody can read them online — not even the server. At least 8 characters.</p>' : '<button class="add-link" data-act="acct-open" data-v="recover">Forgot password? Use the recovery code</button>'}
    ${go(isNew ? 'Create Account' : 'Sign In')}</div>`;
}
function mountAcct(sh) {
  const u = $('#ac-user', sh);
  if (u) sheetOn(sh, 'input', (e) => { if (e.target.id === 'ac-user') AC.user = e.target.value; });
  $$('input', sh).forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ACTIONS['acct-go'](); } }));
  const first = $('input', sh);
  if (first && !first.value) setTimeout(() => first.focus({ preventScroll: true }), 420);
}
function acctError(msg) {
  AC.busy = false;
  AC.err = msg;
  const e = sheet && $('.ac-err', sheet.sh), b = sheet && $('[data-act="acct-go"]', sheet.sh);
  if (e) { e.textContent = msg; e.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 220 }); }
  if (b) { b.disabled = false; b.textContent = { new: 'Create Account', signin: 'Sign In', recover: 'Open My Account', password: 'Change Password' }[AC.mode]; }
}
ACTIONS['acct-open'] = (el) => openAcct(el.dataset.v || 'new');
ACTIONS['acct-mode'] = (el) => { AC.mode = el.dataset.v; AC.err = ''; refreshSheet(acctHtml(), mountAcct); };
ACTIONS['acct-go'] = async () => {
  if (!AC || AC.busy || !sheet) return;
  const val = (id) => { const i = $('#' + id, sheet.sh); return i ? i.value : ''; };
  const pw = val('ac-pw'), pw2 = val('ac-pw2');
  if (['new', 'recover', 'password'].includes(AC.mode) && pw !== pw2) { acctError('The two passwords are different.'); return; }
  AC.busy = true;
  AC.err = '';
  const b = $('[data-act="acct-go"]', sheet.sh);
  if (b) { b.disabled = true; b.textContent = 'Please wait…'; }
  const e0 = $('.ac-err', sheet.sh);
  if (e0) e0.textContent = '';
  try {
    if (AC.mode === 'new') {
      AC.code = await Acct.signUp(val('ac-user'), pw);
      AC.mode = 'code';
      AC.busy = false;
      refreshSheet(acctHtml(), null);
      Acct.sync();
    } else if (AC.mode === 'signin') {
      await Acct.signIn(val('ac-user'), pw);
      AC = null;
      closeSheet();
      toast('Signed in — bringing your notes…');
      Acct.sync();
      if (cur().s === 'settings') render();
    } else if (AC.mode === 'recover') {
      await Acct.recover(val('ac-user'), val('ac-code'), pw);
      AC = null;
      closeSheet();
      toast('New password saved — you’re signed in');
      Acct.sync();
      if (cur().s === 'settings') render();
    } else if (AC.mode === 'password') {
      await Acct.changePassword(val('ac-old'), pw);
      AC = null;
      closeSheet();
      toast('Password changed');
    }
  } catch (err) { acctError(err.message || 'Something went wrong — try again.'); }
};
ACTIONS['acct-share'] = async () => {
  const text = `Budget & Notes — recovery code for “${Acct.user()}”: ${AC && AC.code}`;
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Copied — paste it into Telegram Saved Messages'); } catch (e) { toast('Write the code down somewhere safe'); }
};
ACTIONS['acct-done'] = () => { AC = null; closeSheet(); if (cur().s === 'settings') render(); toast('Your account is ready — saving online ✓'); };
ACTIONS['acct-now'] = async () => { await Acct.sync(); const s = Acct.status(); toast(s.status === 'ok' ? 'Saved online ✓' : s.msg || 'Will save when you’re online'); };
ACTIONS['acct-signout'] = async () => {
  const ok = await ask({ title: 'Sign out on this phone?', msg: 'Your notes stay on this phone — they just stop being saved online (for Notes and Budget).', ok: 'Sign Out', destructive: true });
  if (!ok) return;
  await Acct.signOut();
  render();
  toast('Signed out');
};
