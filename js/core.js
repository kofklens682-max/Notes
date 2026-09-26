'use strict';
/* Core: helpers, the saved state, screens and navigation (including the phone's Back button),
   sheets, menus, dialogs, toasts, swipe actions and the passcode pad. Loaded after store.js and
   remind.js and before the feature files, which register SCREENS and ACTIONS. */

const G = window.GLYPHS || {};
const APP_V = 1;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WK3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WK1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#32ADE6', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#8E8E93'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const plural = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + 's'}`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms = 10) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no haptics */ } };
const glyph = (g, cls = '') => `<svg class="gl ${cls}" viewBox="0 0 24 24" aria-hidden="true">${G[g] || ''}</svg>`;
const tile = (g, c, cls = '') => `<span class="tile ${cls}" style="--c:${c}">${glyph(g)}</span>`;

// ---------- Dates ----------
const hm = (ms) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const dateOf = (ms) => iso(new Date(ms));
const daysFromToday = (s) => Math.round((parseD(s) - parseD(todayIso())) / 864e5);
function dayName(s, long) {
  const n = daysFromToday(s);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const d = parseD(s);
  if (n > 1 && n < 7) return DOW_LONG[d.getDay()];
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return long ? `${DOW_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${y}` : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}${y}`;
}
const longDate = (s) => { const d = parseD(s); return `${DOW_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

// ---------- State ----------
let S = null;
const defaultSettings = () => ({
  theme: 'auto', allDay: '09:00', voiceLang: 'en-US', lock: null, lastBackup: null,
  notify: false, noteSort: 'edited', listSort: {}, showDone: {},
});
function blank() {
  return {
    v: APP_V, rev: 0,
    folders: [{ id: 'notes', name: 'Notes' }],
    notes: [],
    lists: [
      { id: 'personal', name: 'Personal', color: '#007AFF', g: 'list' },
      { id: 'work', name: 'Work', color: '#FF9500', g: 'briefcase' },
    ],
    tasks: [],
    grocery: { items: [], known: {} },
    habits: [],
    settings: defaultSettings(),
  };
}
// Everything loaded (including restored backups) is checked, so a damaged file can't break the app.
const ID_RE = /^[\w-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const str = (x, max = 2000) => (typeof x === 'string' ? x.slice(0, max) : '');
function normalize(d) {
  const b = blank();
  if (!d || typeof d !== 'object') return b;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const okId = (x) => x && typeof x === 'object' && typeof x.id === 'string' && ID_RE.test(x.id);
  const g = d.grocery && typeof d.grocery === 'object' ? d.grocery : {};
  const set = { ...b.settings, ...(d.settings && typeof d.settings === 'object' ? d.settings : {}) };
  if (!['auto', 'light', 'dark'].includes(set.theme)) set.theme = 'auto';
  if (!TIME_RE.test(set.allDay)) set.allDay = '09:00';
  if (!['en-US', 'ru-RU', 'uz-UZ'].includes(set.voiceLang)) set.voiceLang = 'en-US';
  if (!['edited', 'created', 'title'].includes(set.noteSort)) set.noteSort = 'edited';
  for (const k of ['listSort', 'showDone']) if (!set[k] || typeof set[k] !== 'object') set[k] = {};
  if (set.lock && !(typeof set.lock.salt === 'string' && set.lock.check && typeof set.lock.check.iv === 'string')) set.lock = null;
  const out = {
    v: APP_V, rev: +d.rev || 0,
    folders: arr(d.folders).filter(okId).map((f) => ({ id: f.id, name: str(f.name, 80) || 'Folder' })),
    notes: arr(d.notes).filter(okId),
    lists: arr(d.lists).filter(okId).map((l) => ({ id: l.id, name: str(l.name, 80) || 'List', color: HEX_RE.test(l.color) ? l.color : '#007AFF', g: G[l.g] ? l.g : 'list' })),
    tasks: arr(d.tasks).filter(okId),
    grocery: {
      items: arr(g.items).filter(okId).map((i) => ({ id: i.id, name: str(i.name, 80) || 'Item', qty: str(i.qty, 30), sec: str(i.sec, 20), done: !!i.done, doneAt: +i.doneAt || 0, at: +i.at || Date.now() })),
      known: {},
    },
    habits: arr(d.habits).filter(okId),
    settings: set,
  };
  if (g.known && typeof g.known === 'object') {
    for (const [k, v] of Object.entries(g.known)) if (v && typeof v === 'object') out.grocery.known[str(k, 80)] = { name: str(v.name, 80) || k, sec: str(v.sec, 20), n: +v.n || 1, last: +v.last || 0 };
  }
  if (!out.folders.some((f) => f.id === 'notes')) out.folders.unshift(b.folders[0]);
  if (!out.lists.length) out.lists = [b.lists[0]];
  out.notes = out.notes.map((n) => ({
    id: n.id,
    folder: out.folders.some((f) => f.id === n.folder) ? n.folder : 'notes',
    html: str(n.html, 5e6), title: str(n.title, 200), preview: str(n.preview, 300), text: str(n.text, 5e6),
    blobs: arr(n.blobs).filter((x) => typeof x === 'string' && ID_RE.test(x)),
    pinned: !!n.pinned,
    locked: !!n.locked,
    enc: cleanEnc(n.locked && n.enc),
    edited: +n.edited || Date.now(), created: +n.created || +n.edited || Date.now(),
  }));
  out.tasks = out.tasks.map((t) => ({
    id: t.id, title: str(t.title, 300), notes: str(t.notes, 5000),
    list: out.lists.some((l) => l.id === t.list) ? t.list : out.lists[0].id,
    due: DATE_RE.test(t.due) ? t.due : null,
    time: DATE_RE.test(t.due) && TIME_RE.test(t.time) ? t.time : null,
    repeat: DATE_RE.test(t.due) && REPEATS[t.repeat] ? t.repeat : null,
    prio: clamp(Math.round(+t.prio) || 0, 0, 3),
    subs: arr(t.subs).filter(okId).map((s) => ({ id: s.id, title: str(s.title, 300), done: !!s.done })),
    done: !!t.done, doneAt: +t.doneAt || 0, snooze: +t.snooze || 0, created: +t.created || Date.now(),
  }));
  out.habits = out.habits.map((h) => {
    const log = {};
    if (h.log && typeof h.log === 'object') for (const [k, v] of Object.entries(h.log)) if (DATE_RE.test(k) && +v > 0) log[k] = Math.min(50, Math.round(+v));
    const sleep = h.kind === 'sleep';
    // Sleep habits keep bedtime and wake-up per morning: { 'YYYY-MM-DD': { bed: 'HH:MM', wake: 'HH:MM' } }.
    const times = {};
    if (sleep && h.times && typeof h.times === 'object') {
      for (const [k, v] of Object.entries(h.times)) if (DATE_RE.test(k) && v && TIME_RE.test(v.bed) && TIME_RE.test(v.wake)) { times[k] = { bed: v.bed, wake: v.wake }; log[k] = 1; }
    }
    return {
      id: h.id, name: str(h.name, 80) || 'Habit', g: G[h.g] ? h.g : 'flame', c: HEX_RE.test(h.c) ? h.c : '#FF9500',
      kind: sleep ? 'sleep' : 'check', times,
      days: Array.isArray(h.days) && h.days.length === 7 && h.days.some(Boolean) ? h.days.map((x) => (x ? 1 : 0)) : [1, 1, 1, 1, 1, 1, 1],
      target: sleep ? 1 : clamp(Math.round(+h.target) || 1, 1, 50),
      remind: TIME_RE.test(h.remind) ? h.remind : null,
      snooze: h.snooze && DATE_RE.test(h.snooze.date) ? { date: h.snooze.date, at: +h.snooze.at || 0 } : null,
      log, start: DATE_RE.test(h.start) ? h.start : todayIso(),
    };
  });
  return out;
}
const cleanEnc = (e) => (e && typeof e.iv === 'string' && typeof e.ct === 'string' ? { iv: str(e.iv, 100), ct: str(e.ct, 1e7) } : null);

// Notes' text ("bodies": html, text, enc) is saved per note, apart from everything else, so typing
// only rewrites that one note. Bodies are read in the background right after the app appears.
let storageBroken = null;
let bodiesLoaded = false;
let bodiesReady = null; // resolves once every note's text is in memory
let wakeBodies = () => {}; // starts reading the texts (main.js does it right after the first screen)
const dirtyBodies = new Set();
const BODY_KEYS = ['html', 'text', 'enc'];
async function loadState() {
  let d = null;
  try { d = await dbGet('state', 'S'); } catch (e) { storageBroken = e; }
  S = normalize(d);
  // Older versions kept the text inside the state: move it out on the next save.
  if (d && Array.isArray(d.notes) && d.notes.some((n) => n && (n.html || n.enc))) S.notes.forEach((n) => dirtyBodies.add(n.id));
  if (dirtyBodies.size || storageBroken) { bodiesReady = Promise.resolve(); bodiesLoaded = true; return; }
  bodiesReady = new Promise((done) => { wakeBodies = () => { wakeBodies = () => {}; loadBodies().then(done, done); }; });
}
async function loadBodies() {
  let rows = [];
  try { rows = await dbEntries('bodies'); } catch (e) { /* keep what we have */ }
  const byId = new Map(S.notes.map((n) => [n.id, n]));
  for (const [id, b] of rows) {
    const n = byId.get(id);
    if (!n || !b || dirtyBodies.has(id)) continue; // unknown, or already changed since start
    n.html = str(b.html, 5e6);
    n.text = str(b.text, 5e6);
    n.enc = cleanEnc(n.locked && b.enc);
  }
  bodiesLoaded = true;
}
let saveT = 0;
// Call after any change. `note` = the note whose text changed (only that note's text is rewritten).
function save(note) {
  S.rev++;
  if (note) dirtyBodies.add(note.id);
  clearTimeout(saveT);
  saveT = setTimeout(flush, 250);
  if (!note && typeof remindSoon === 'function') remindSoon();
}
const stateRecord = () => ({ ...S, notes: S.notes.map((n) => { const m = { ...n }; BODY_KEYS.forEach((k) => delete m[k]); return m; }) });
async function flush() {
  clearTimeout(saveT);
  saveT = 0;
  const ids = [...dirtyBodies];
  dirtyBodies.clear();
  try {
    const byId = new Map(S.notes.map((n) => [n.id, n]));
    await dbPutMany('bodies', ids.filter((id) => byId.has(id)).map((id) => { const n = byId.get(id); return [id, { html: n.html || '', text: n.text || '', enc: n.enc || null }]; }));
    await dbPut('state', 'S', stateRecord());
  } catch (e) {
    ids.forEach((id) => dirtyBodies.add(id));
    toast("Couldn't save — " + ((e && e.message) || e));
  }
}
// Remove the text of notes that were deleted (kept until the next start so Undo still works).
async function cleanBodies() {
  const ids = new Set(S.notes.map((n) => n.id));
  const gone = (await dbKeys('bodies')).filter((k) => !ids.has(k));
  await dbPutMany('bodies', gone.map((k) => [k, undefined]));
}

// ---------- Screens & navigation ----------
// SCREENS[name] = { render(e) → html, mount(el, e), hide(e, el), leave(e), fab(e), tint(e), bar, plain, keep }
const SCREENS = {};
const ACTIONS = {}; // data-act → (el, event)
const UI = { tab: 'notes', stacks: { notes: [{ s: 'folders', folder: 'all' }], planner: [{ s: 'planner' }] } };
const cur = () => { const st = UI.stacks[UI.tab]; return st[st.length - 1]; };
const curEl = () => $('#stage > .screen.cur');

// Standard screen: nav bar (back, small title, buttons) + scrolling content with a large title.
function page({ title = '', back = '', right = '', body = '', big = true, sub = '', after = '' }) {
  return `<header class="nav">
      <div class="nav-l">${back ? `<button class="back" data-act="back" aria-label="Back to ${esc(back)}">${glyph('chevL')}<span>${esc(back)}</span></button>` : ''}</div>
      <div class="nav-t">${esc(title)}</div>
      <div class="nav-r">${right}</div>
    </header>
    <div class="scroll">${big ? `<h1 class="big">${esc(typeof big === 'string' ? big : title)}</h1>${sub ? `<div class="big-sub">${sub}</div>` : ''}` : ''}${body}<div class="end-space"></div></div>${after}`;
}
const navBtn = (act, g, label, extra = '') => `<button class="nbtn" data-act="${act}" aria-label="${esc(label)}" ${extra}>${glyph(g)}</button>`;
const navText = (act, label, extra = '') => `<button class="ntext" data-act="${act}" ${extra}>${esc(label)}</button>`;

// A screen that fails to draw shows this instead of a blank page (nothing is deleted).
const screenError = (err) => page({
  title: 'Sorry', back: UI.stacks[UI.tab].length > 1 ? 'Back' : '',
  body: empty('bang', "This screen couldn't be shown", `Your notes are safe. Go back, or close the app and open it again.<br><small>${esc((err && err.message) || err)}</small>`),
});
function paint(el, e) {
  const sc = SCREENS[e.s];
  try { el.innerHTML = sc.render(e); } catch (err) { console.error(err); el.innerHTML = screenError(err); el._broken = true; }
  const tint = sc.tint ? sc.tint(e) : null;
  if (tint) el.style.setProperty('--tint', tint); else el.style.removeProperty('--tint');
  const scr = $('.scroll', el);
  el._th = null;
  el._scr = scr;
  if (scr) {
    // At most one update per frame, and the title position is measured only once.
    let raf = 0;
    scr.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; navState(el); }); }, { passive: true });
  }
  if (sc.mount && !el._broken) { try { sc.mount(el, e); } catch (err) { console.error(err); } }
  el._broken = false;
}
function navState(el) {
  const scr = el._scr, y = scr ? scr.scrollTop : 0;
  if (el._th == null) { const big = $('.big', el); el._th = big ? big.offsetTop + big.offsetHeight - 52 : -1; }
  const scrolled = y > 2, titled = el._th < 0 || y > el._th;
  if (el.classList.contains('scrolled') !== scrolled) el.classList.toggle('scrolled', scrolled);
  if (el.classList.contains('titled') !== titled) el.classList.toggle('titled', titled);
}
window.addEventListener('resize', () => { const el = curEl(); if (el) { el._th = null; navState(el); } });
function show(dir) {
  const stage = $('#stage');
  const old = curEl();
  const e = cur();
  const el = document.createElement('section');
  el.className = 'screen cur';
  el.dataset.s = e.s;
  stage.appendChild(el); // on the page first, so the screen can focus a field when it mounts
  paint(el, e);
  const scr = $('.scroll', el);
  if (scr && e.y) scr.scrollTop = e.y;
  navState(el);
  if (old) {
    old.classList.remove('cur');
    old.setAttribute('aria-hidden', 'true');
    old.inert = true;
    if (dir && !reduceMotion()) {
      el.classList.add(dir + '-in');
      old.classList.add(dir + '-out');
      setTimeout(() => { old.remove(); el.classList.remove(dir + '-in'); }, 380);
    } else old.remove();
  }
  chrome();
}
// Repaint the current screen in place (keeps its scroll position).
function render() {
  const el = curEl();
  if (!el) { show(); return; }
  const e = cur(), sc = SCREENS[e.s];
  if (sc.keep) { if (sc.refresh) sc.refresh(el, e); chrome(); return; }
  const scr = $('.scroll', el), y = scr ? scr.scrollTop : 0;
  paint(el, e);
  const s2 = $('.scroll', el);
  if (s2) s2.scrollTop = y;
  navState(el);
  chrome();
}
function rememberScroll() {
  const el = curEl(), scr = el && $('.scroll', el);
  if (scr) cur().y = scr.scrollTop;
}
function hideCur() { const e = cur(), h = SCREENS[e.s].hide; if (h) h(e, curEl()); }
function push(e) {
  rememberScroll();
  hideCur();
  UI.stacks[UI.tab].push(e);
  show('push');
  syncHistory();
}
function pop(n = 1) {
  const st = UI.stacks[UI.tab];
  n = Math.min(n, st.length - 1);
  if (n < 1) return;
  for (let i = 0; i < n; i++) {
    const e = cur(), sc = SCREENS[e.s];
    if (i === 0 && sc.hide) sc.hide(e, curEl());
    st.pop();
    if (sc.leave) sc.leave(e);
  }
  show('pop');
  syncHistory();
}
function goTab(t, keepStack) {
  if (t === UI.tab) {
    if (keepStack) return;
    if (UI.stacks[t].length > 1) pop(UI.stacks[t].length - 1);
    else { const scr = $('.scroll', curEl()); if (scr) scr.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); }
    return;
  }
  rememberScroll();
  hideCur();
  UI.tab = t;
  show(t === 'planner' ? 'tabr' : 'tabl'); // slides in from the side of its tab
  syncHistory();
}

// Tab bar: tap a tab, or press anywhere on the bar and slide — the highlight follows the finger
// and the tab under it opens when you let go (like the iPhone's tab bar).
function bindTabSlide(tabs, go) {
  const ind = $('.tab-ind', tabs);
  const btns = () => $$('[data-tab]', tabs);
  let st = null, slidAt = 0;
  tabs.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    st = { id: e.pointerId, x0: e.clientX, on: false, over: -1 };
  });
  tabs.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.on) {
      if (Math.abs(e.clientX - st.x0) < 8) return;
      st.on = true;
      try { tabs.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      tabs.classList.add('sliding');
    }
    const bs = btns(), r = tabs.getBoundingClientRect(), w = (r.width - 10) / bs.length;
    const x = clamp(e.clientX - r.left - 5 - w / 2, 0, w * (bs.length - 1));
    ind.style.transform = `translateX(${x.toFixed(1)}px) scale(1.05)`;
    const over = clamp(Math.round(x / w), 0, bs.length - 1);
    if (over !== st.over) {
      if (st.over >= 0) buzz(8);
      st.over = over;
      bs.forEach((b, i) => b.classList.toggle('over', i === over));
    }
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    if (!s.on) return;
    slidAt = Date.now();
    const b = btns()[s.over];
    tabs.classList.remove('sliding');
    ind.style.transform = '';
    btns().forEach((x) => x.classList.remove('over'));
    if (e.type === 'pointerup' && b && !b.classList.contains('on')) go(b.dataset.tab);
  };
  tabs.addEventListener('pointerup', end);
  tabs.addEventListener('pointercancel', end);
  // the end of a slide must not also count as a tap
  tabs.addEventListener('click', (e) => { if (e.isTrusted && Date.now() - slidAt < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// Segmented control (Automatic | Light | Dark …). The rounded "thumb" glides from the old choice to
// the new one, and you can press on it and slide along — like the tab bar.
const segMem = {};
function segButtons(act, items, current) {
  const i = items.findIndex(([v]) => String(v) === String(current));
  const from = segMem[act] != null && segMem[act] >= 0 ? segMem[act] : i;
  segMem[act] = i;
  const thumb = i >= 0 ? `<i class="seg-thumb" style="--n:${items.length};--i:${i};--from:${from}"></i>` : '';
  return thumb + items.map(([v, label]) => `<button data-act="${act}" data-v="${esc(v)}" class="${i >= 0 && String(v) === String(current) ? 'on' : ''}">${label}</button>`).join('');
}
function bindSegSlide() {
  let st = null, slidAt = 0;
  document.addEventListener('pointerdown', (e) => {
    const seg = e.button > 0 ? null : e.target.closest('.seg');
    const thumb = seg && $(':scope > .seg-thumb', seg);
    st = thumb ? { seg, thumb, id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, over: -1, x: 0, w: 1 } : null;
  });
  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.on) {
      const dx = Math.abs(e.clientX - st.x0), dy = Math.abs(e.clientY - st.y0);
      if (dy > 10 && dy > dx) { st = null; return; }
      if (dx < 8) return;
      st.on = true;
      try { st.seg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      st.seg.classList.add('sliding');
    }
    const bs = $$(':scope > button', st.seg), r = st.seg.getBoundingClientRect();
    st.w = (r.width - 4) / bs.length;
    st.x = clamp(e.clientX - r.left - 2 - st.w / 2, 0, st.w * (bs.length - 1));
    st.thumb.style.animation = 'none';
    st.thumb.style.transform = `translateX(${st.x.toFixed(1)}px)`;
    const over = clamp(Math.round(st.x / st.w), 0, bs.length - 1);
    if (over !== st.over) {
      if (st.over >= 0) buzz(8);
      st.over = over;
      bs.forEach((b, i) => b.classList.toggle('over', i === over));
    }
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    if (!s.on) return;
    slidAt = Date.now();
    s.seg.classList.remove('sliding');
    const bs = $$(':scope > button', s.seg), b = bs[s.over];
    bs.forEach((x) => x.classList.remove('over'));
    if (e.type !== 'pointerup' || !b || b.classList.contains('on') || !ACTIONS[b.dataset.act]) { s.thumb.style.transform = ''; return; }
    segMem[b.dataset.act] = s.x / s.w; // the new thumb glides on from where the finger left it
    ACTIONS[b.dataset.act](b, e);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('click', (e) => { if (e.isTrusted && Date.now() - slidAt < 350 && e.target.closest('.seg')) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// A row of days where a finger can slide (the Habits week): the highlight follows it and the day
// under it opens when you let go. Days that can't be chosen (the future) are skipped.
// strip: .week; pos: where the highlight sits, counted in days from the first.
function stripPaint(strip, pos, lift) {
  const ind = $('.wd-ind', strip);
  if (!ind) return;
  ind.style.animation = 'none';
  ind.style.transform = `translateX(${(pos * ind.offsetWidth).toFixed(1)}px)${lift ? ' scale(1.08)' : ''}`;
}
function bindWeekSlide(onPick) {
  let st = null, slidAt = 0;
  document.addEventListener('pointerdown', (e) => {
    const strip = e.button > 0 ? null : e.target.closest('.week');
    st = strip && !e.target.closest('.wk-arrow') ? { strip, id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, over: -1, pos: 0 } : null;
  });
  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const days = $$(':scope > .wd', st.strip);
    if (!st.on) {
      const dx = Math.abs(e.clientX - st.x0), dy = Math.abs(e.clientY - st.y0);
      if (dy > 10 && dy > dx) { st = null; return; }
      if (dx < 8) return;
      st.on = true;
      try { st.strip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      st.strip.classList.add('sliding');
    }
    const last = days.reduce((m, b, i) => (b.disabled ? m : i), 0);
    const a = days[0].getBoundingClientRect(), z = days[days.length - 1].getBoundingClientRect(), w = (z.right - a.left) / days.length;
    st.pos = clamp((e.clientX - a.left) / w - 0.5, 0, last);
    stripPaint(st.strip, st.pos, true);
    const over = Math.round(st.pos);
    if (over !== st.over) {
      if (st.over >= 0) buzz(8);
      st.over = over;
      days.forEach((b, i) => b.classList.toggle('over', i === over));
    }
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    if (!s.on) return;
    slidAt = Date.now();
    s.strip.classList.remove('sliding');
    const days = $$(':scope > .wd', s.strip), b = days[s.over];
    days.forEach((x) => x.classList.remove('over'));
    if (e.type === 'pointerup' && b && !b.classList.contains('sel') && s.strip.isConnected) { onPick(b, s.pos); return; }
    const ind = $('.wd-ind', s.strip);
    if (ind) ind.style.transform = '';
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('click', (e) => { if (e.isTrusted && Date.now() - slidAt < 350 && e.target.closest('.week')) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// Round day buttons that tick on and off (a habit's Repeat days): tap one, or press on a day and
// slide across the others to set them all the same way. set(i, on) changes one day; done() runs
// once at the end.
function bindDaysSlide(sel, set, done) {
  let st = null, slidAt = 0;
  document.addEventListener('pointerdown', (e) => {
    const b = e.button > 0 ? null : e.target.closest(`${sel} > button`);
    st = b ? { row: b.parentElement, id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, to: !b.classList.contains('on'), last: $$(':scope > button', b.parentElement).indexOf(b) } : null;
  });
  const paint = (j) => {
    const b = $$(':scope > button', st.row)[j];
    if (!b || b.classList.contains('on') === st.to) return;
    b.classList.toggle('on', st.to);
    set(j, st.to);
    buzz(8);
  };
  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.on) {
      const dx = Math.abs(e.clientX - st.x0), dy = Math.abs(e.clientY - st.y0);
      if (dy > 10 && dy > dx) { st = null; return; }
      if (dx < 8) return;
      st.on = true;
      try { st.row.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      paint(st.last);
    }
    const n = st.row.children.length, r = st.row.getBoundingClientRect();
    const i = clamp(Math.floor(((e.clientX - r.left) / r.width) * n), 0, n - 1);
    for (let j = Math.min(i, st.last); j <= Math.max(i, st.last); j++) paint(j); // a quick slide can skip some
    st.last = i;
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    if (!s.on) return;
    slidAt = Date.now();
    done();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('click', (e) => { if (e.isTrusted && Date.now() - slidAt < 350 && e.target.closest(sel)) { e.stopPropagation(); e.preventDefault(); } }, true);
}
function chrome() {
  const e = cur(), sc = SCREENS[e.s];
  document.body.dataset.tab = UI.tab;
  const bar = sc.bar !== false;
  $('#tabbar').classList.toggle('hide', !bar);
  $$('#tabs [data-tab]').forEach((b) => {
    const on = b.dataset.tab === UI.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#tabs').style.setProperty('--i', UI.tab === 'notes' ? 0 : 1);
  const tint = sc.tint ? sc.tint(e) : null, tb = $('#tabbar');
  if (tint) { tb.style.setProperty('--ftint', tint); tb.style.setProperty('--fab-ink', '#fff'); } else { tb.style.removeProperty('--ftint'); tb.style.removeProperty('--fab-ink'); }
  const f = bar && sc.fab ? sc.fab(e) : null;
  const fab = $('#fab');
  fab.classList.toggle('hide', !f);
  fab.inert = !f;
  $('#tabbar').inert = !bar;
  if (f) {
    fab.dataset.act = f.act;
    fab.innerHTML = glyph(f.g);
    fab.setAttribute('aria-label', f.label);
  }
  themeColor();
}

// The phone's Back button walks back through open sheets and screens. We keep exactly as many
// history entries as there are layers to close.
let owned = 0, skipPops = 0, resync = false;
const wanted = () => UI.stacks[UI.tab].length - 1 + (sheet ? 1 : 0);
function syncHistory() {
  if (skipPops) { resync = true; return; }
  const w = wanted();
  if (owned > w) { skipPops++; const n = owned - w; owned = w; history.go(-n); return; }
  while (owned < w) { owned++; history.pushState({ n: owned }, ''); }
}
window.addEventListener('popstate', () => {
  if (skipPops) {
    skipPops--;
    if (!skipPops && resync) { resync = false; syncHistory(); }
    return;
  }
  owned = Math.max(0, owned - 1);
  if (closeLayer()) { syncHistory(); return; }
  if (sheet) { closeSheetNow(); syncHistory(); return; }
  if (UI.stacks[UI.tab].length > 1) { pop(); return; }
  syncHistory();
});
ACTIONS.back = () => { if (UI.stacks[UI.tab].length > 1) pop(); };

// Small overlays (menus, dialogs, photo viewer) close on Back without their own history entry.
const layers = [];
function closeLayer() {
  const f = layers.pop();
  if (!f) return false;
  f();
  return true;
}

// ---------- Sheets ----------
let sheet = null;
let pendingReload = false;
function sheetHead(title, left, right) {
  return `<div class="sheet-grab"><i></i></div><div class="sheet-head"><div class="l">${left || ''}</div><h3>${title}</h3><div class="r">${right || ''}</div></div>`;
}
function openSheet(html, mount, cls = '') {
  if (sheet) {
    sheet.sh.innerHTML = html;
    sheet.sh.className = 'sheet show ' + cls;
    sheet.sh.classList.remove('swap');
    void sheet.sh.offsetWidth;
    sheet.sh.classList.add('swap');
    if (mount) mount(sheet.sh);
    return;
  }
  const root = $('#sheet-root');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.dataset.act = 'close-sheet';
  const sh = document.createElement('div');
  sh.className = 'sheet ' + cls;
  sh.setAttribute('role', 'dialog');
  sh.setAttribute('aria-modal', 'true');
  sh.innerHTML = html;
  root.append(ov, sh);
  sheet = { ov, sh };
  requestAnimationFrame(() => requestAnimationFrame(() => { ov.classList.add('show'); sh.classList.add('show'); }));
  bindSheetGestures(sh, ov);
  if (mount) mount(sh);
  syncHistory();
}
function refreshSheet(html, mount) {
  if (!sheet) return;
  const b = $('.sheet-body', sheet.sh), top = b ? b.scrollTop : 0;
  sheet.sh.innerHTML = html;
  if (mount) mount(sheet.sh);
  const nb = $('.sheet-body', sheet.sh);
  if (nb) nb.scrollTop = top;
}
function closeSheet() { if (!sheet) return; closeSheetNow(); syncHistory(); }
function closeSheetNow() {
  if (!sheet) return;
  const { ov, sh } = sheet;
  sheet = null;
  if (document.activeElement && sh.contains(document.activeElement)) document.activeElement.blur();
  sh.classList.remove('dragging');
  sh.style.transform = '';
  ov.style.opacity = '';
  ov.classList.remove('show');
  sh.classList.remove('show');
  setTimeout(() => { ov.remove(); sh.remove(); if (pendingReload) location.reload(); }, 450);
}
ACTIONS['close-sheet'] = () => closeSheet();
// Pull a sheet down to close it — from anywhere inside it while its content is scrolled to the top.
function bindSheetGestures(sh, ov) {
  let x0 = 0, y0 = null, t0 = 0, dy = 0, mode = null;
  const skip = (el) => el.closest('input, textarea, select, .switch, .no-drag');
  const begin = (x, y, target) => {
    if (skip(target)) return;
    const body = $('.sheet-body', sh);
    if (body && body.contains(target) && body.scrollTop > 2) return;
    x0 = x; y0 = y; t0 = performance.now(); dy = 0; mode = null;
  };
  const follow = (x, y, e) => {
    if (y0 === null) return;
    const ddx = x - x0, ddy = y - y0;
    if (!mode) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      mode = ddy > 0 && Math.abs(ddy) > Math.abs(ddx) * 1.2 ? 'drag' : 'none';
      if (mode === 'drag') sh.classList.add('dragging');
    }
    if (mode !== 'drag') return;
    if (e.cancelable) e.preventDefault();
    dy = Math.max(0, ddy);
    sh.style.transform = `translateY(${dy}px)`;
    ov.style.opacity = String(Math.max(0.15, 1 - dy / (sh.offsetHeight || 600)));
  };
  const release = () => {
    if (y0 === null) return;
    const wasDrag = mode === 'drag';
    const speed = dy / Math.max(1, performance.now() - t0);
    y0 = null; mode = null;
    if (!wasDrag) return;
    sh.classList.remove('dragging');
    if (dy > Math.min(140, sh.offsetHeight * 0.25) || (speed > 0.55 && dy > 30)) closeSheet();
    else { sh.style.transform = ''; ov.style.opacity = ''; }
  };
  sh.addEventListener('touchstart', (e) => begin(e.touches[0].clientX, e.touches[0].clientY, e.target), { passive: true });
  sh.addEventListener('touchmove', (e) => follow(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
  sh.addEventListener('touchend', release);
  sh.addEventListener('touchcancel', release);
  sh.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || !e.target.closest('.sheet-grab, .sheet-head') || e.target.closest('button')) return;
    begin(e.clientX, e.clientY, e.target);
    const mv = (ev) => follow(ev.clientX, ev.clientY, ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); release(); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
}
const blurOnEnter = (root) => $$('input', root).forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); }));

// ---------- Menus, dialogs, toasts ----------
// A small popup menu under a button, like iOS. items: {id, label, g, danger, check} or '-'.
function menu(anchor, items) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'menu-wrap';
    wrap.innerHTML = `<div class="menu" role="menu">${items.map((it) => (it === '-' ? '<hr>' : `<button role="menuitem" data-id="${esc(it.id)}" class="${it.danger ? 'danger' : ''}">${it.check !== undefined ? `<span class="mck">${it.check ? glyph('check') : ''}</span>` : ''}<span class="ml">${esc(it.label)}</span>${it.g ? glyph(it.g) : ''}</button>`)).join('')}</div>`;
    document.body.appendChild(wrap);
    const m = $('.menu', wrap);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    const left = clamp(r.right - mw, 8, innerWidth - mw - 8);
    let top = r.bottom + 6;
    if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    m.style.transformOrigin = `${r.left + r.width / 2 - left}px ${top > r.top ? 0 : mh}px`;
    requestAnimationFrame(() => m.classList.add('show'));
    let open = true;
    const done = (v) => {
      if (!open) return;
      open = false;
      const i = layers.indexOf(closeFn);
      if (i >= 0) layers.splice(i, 1);
      m.classList.remove('show');
      setTimeout(() => wrap.remove(), 200);
      resolve(v);
    };
    const closeFn = () => done(null);
    layers.push(closeFn);
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button[data-id]');
      done(b ? b.dataset.id : null);
    });
  });
}
// iOS action sheet: a question with one main button and Cancel.
function ask({ title, msg, ok = 'OK', destructive = false, cancel = 'Cancel', more }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dlg-wrap';
    const extra = (more || []).map((b) => `<button data-r="${esc(b.id)}" class="${b.destructive ? 'destructive' : ''}">${esc(b.label)}</button>`).join('');
    wrap.innerHTML = `<div class="overlay"></div><div class="dlg" role="alertdialog"><div class="dlg-box">${title || msg ? `<div class="dlg-msg">${title ? `<b>${esc(title)}</b>` : ''}${esc(msg || '')}</div>` : ''}${extra}<button data-r="1" class="${destructive ? 'destructive' : ''}">${esc(ok)}</button></div><div class="dlg-box dlg-cancel"><button data-r="0">${esc(cancel)}</button></div></div>`;
    $('#dialog-root').appendChild(wrap);
    const ov = $('.overlay', wrap), d = $('.dlg', wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => { ov.classList.add('show'); d.classList.add('show'); }));
    let open = true;
    const done = (v) => {
      if (!open) return;
      open = false;
      const i = layers.indexOf(closeFn);
      if (i >= 0) layers.splice(i, 1);
      ov.classList.remove('show'); d.classList.remove('show');
      setTimeout(() => wrap.remove(), 350);
      resolve(v === '1' ? true : v === '0' || v == null ? false : v);
    };
    const closeFn = () => done('0');
    layers.push(closeFn);
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (b) done(b.dataset.r);
      else if (e.target === ov) done('0');
    });
  });
}
// iOS alert with a text field ("New Folder"). Resolves to the text, or null.
function askText({ title, msg = '', value = '', placeholder = '', ok = 'Save' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-wrap';
    wrap.innerHTML = `<div class="overlay show"></div><div class="alert" role="alertdialog">
      <div class="alert-body"><b>${esc(title)}</b>${msg ? `<p>${esc(msg)}</p>` : ''}<input type="text" maxlength="80" value="${esc(value)}" placeholder="${esc(placeholder)}" enterkeyhint="done" autocapitalize="sentences"></div>
      <div class="alert-btns"><button data-r="0">Cancel</button><button data-r="1" class="strong">${esc(ok)}</button></div></div>`;
    $('#dialog-root').appendChild(wrap);
    const input = $('input', wrap), okB = $('[data-r="1"]', wrap);
    const upd = () => { okB.disabled = !input.value.trim(); };
    upd();
    input.addEventListener('input', upd);
    input.focus();
    input.select();
    let open = true;
    const done = (v) => {
      if (!open) return;
      open = false;
      const i = layers.indexOf(closeFn);
      if (i >= 0) layers.splice(i, 1);
      input.blur();
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 200);
      resolve(v);
    };
    const closeFn = () => done(null);
    layers.push(closeFn);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) done(input.value.trim()); });
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (b) done(b.dataset.r === '1' ? input.value.trim() : null);
    });
  });
}
let toastT;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action.label)}</button>` : ''}`;
  if (action) $('.toast-btn', t).addEventListener('click', () => { t.classList.remove('show'); action.run(); });
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2200);
}
const undoToast = (msg, restore) => toast(msg, { label: 'Undo', run: () => { restore(); save(); render(); } });

// ---------- Swipe actions ----------
// A row is <div class="sw"><div class="sw-acts l">…</div><div class="sw-acts r">…</div><div class="sw-row">…</div></div>.
// A row only carries a short description of its buttons (data-swl / data-swr); they are drawn the
// first time the row is touched, so long lists open quickly.
// Swipe left to show the right-hand buttons (a long swipe runs the last one, e.g. Delete),
// swipe right for the left-hand button (e.g. Pin).
let swOpen = null, swMoved = 0;
function closeSwipe() {
  if (!swOpen) return;
  swOpen.style.transform = '';
  swOpen.parentElement.classList.remove('open', 'full');
  swOpen = null;
}
document.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.sw-row');
  if (swOpen && row !== swOpen && !e.target.closest('.sw-acts')) closeSwipe();
  if (!row || e.button > 0) return;
  const sw = row.parentElement;
  if (!sw.dataset.woke) {
    sw.dataset.woke = '1';
    if (sw.dataset.swr) sw.insertAdjacentHTML('afterbegin', `<div class="sw-acts r">${swHtml(sw.dataset.swr)}</div>`);
    if (sw.dataset.swl) sw.insertAdjacentHTML('afterbegin', `<div class="sw-acts l">${swHtml(sw.dataset.swl)}</div>`);
  }
  const R = $(':scope > .sw-acts.r', sw), L = $(':scope > .sw-acts.l', sw);
  if (!R && !L) return;
  const x0 = e.clientX, y0 = e.clientY, W = row.offsetWidth;
  const rw = R ? R.offsetWidth : 0, lw = L ? L.offsetWidth : 0;
  const base = row === swOpen ? (parseFloat(row.style.transform.replace('translateX(', '')) || 0) : 0;
  let mode = null, dx = base;
  const move = (ev) => {
    const mx = ev.clientX - x0, my = ev.clientY - y0;
    if (!mode) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      mode = Math.abs(mx) > Math.abs(my) * 1.15 ? 'x' : 'y';
      if (mode === 'y') { end(); return; }
      row.classList.add('dragging');
      try { row.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
    }
    dx = base + mx;
    if (!R) dx = Math.max(0, dx);
    if (!L) dx = Math.min(0, dx);
    row.style.transform = `translateX(${dx}px)`;
    sw.classList.toggle('full', dx < -W * 0.6);
    sw.classList.toggle('left', dx > 0);
  };
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  const up = () => {
    end();
    row.classList.remove('dragging');
    if (mode !== 'x') return;
    swMoved = Date.now();
    const run = (b) => { closeSwipe(); row.style.transform = ''; sw.classList.remove('full'); buzz(); swMoved = 0; b.click(); swMoved = Date.now(); };
    if (R && dx < -W * 0.6) { run(R.lastElementChild); return; }
    if (R && dx < -Math.min(rw * 0.45, 70)) { row.style.transform = `translateX(${-rw}px)`; sw.classList.add('open'); swOpen = row; return; }
    if (L && dx > W * 0.45) { run(L.firstElementChild); return; }
    if (L && dx > Math.min(lw * 0.45, 60)) { row.style.transform = `translateX(${lw}px)`; sw.classList.add('open'); swOpen = row; return; }
    row.style.transform = '';
    sw.classList.remove('open', 'full', 'left');
    if (swOpen === row) swOpen = null;
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}, true);
// A swipe (or a tap on an open row) must not also count as a tap on the row.
document.addEventListener('click', (e) => {
  if (Date.now() - swMoved < 350) { e.stopPropagation(); e.preventDefault(); return; }
  const row = e.target.closest('.sw-row');
  if (row && row === swOpen) { e.stopPropagation(); e.preventDefault(); closeSwipe(); }
}, true);
const swipeRow = (inner, { left = '', right = '', cls = '', attrs = '' } = {}) =>
  `<div class="sw ${cls}" ${attrs}${left ? ` data-swl="${left}"` : ''}${right ? ` data-swr="${right}"` : ''}><div class="sw-row">${inner}</div></div>`;
// A swipe button is written down as "action|id|label|icon|colour;" and drawn by swHtml() when needed.
const swBtn = (act, id, label, g, color) => [act, id, label, g, color].map(encodeURIComponent).join('|') + ';';
const swHtml = (spec) => spec.split(';').filter(Boolean).map((b) => {
  const [act, id, label, g, color] = b.split('|').map(decodeURIComponent);
  return `<button data-act="${esc(act)}" data-id="${esc(id)}" style="--c:${esc(color)}">${glyph(g)}<span>${esc(label)}</span></button>`;
}).join('');

// ---------- Small building blocks ----------
function searchField(value, placeholder = 'Search') {
  return `<label class="search">${glyph('search')}<input type="search" value="${esc(value || '')}" placeholder="${esc(placeholder)}" enterkeyhint="search" autocomplete="off"><button class="search-x" data-act="search-clear" aria-label="Clear">${glyph('x')}</button></label>`;
}
ACTIONS['search-clear'] = (el) => {
  const i = $('input', el.closest('.search'));
  i.value = '';
  i.dispatchEvent(new Event('input', { bubbles: true }));
  i.focus();
};
const empty = (g, title, msg = '') => `<div class="empty">${glyph(g)}<b>${esc(title)}</b>${msg ? `<p>${msg}</p>` : ''}</div>`;
function ring(frac, size = 30, stroke = 3.2, cls = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring ${cls}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - clamp(frac, 0, 1))}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
const swatches = (act, current) => `<div class="swatches">${COLORS.map((c) => `<button class="${current === c ? 'on' : ''}" data-act="${act}" data-v="${c}" style="--c:${c}" aria-label="Colour"></button>`).join('')}</div>`;
const toggle = (name, on, label = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} aria-label="${esc(label)}"><i></i></label>`;

// ---------- Theme ----------
function isDark() {
  const t = S && S.settings.theme;
  return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
}
function applyTheme() {
  const t = S.settings.theme, r = document.documentElement;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  themeColor();
}
function themeColor() {
  const e = cur();
  const plain = e && SCREENS[e.s] && SCREENS[e.s].plain;
  const m = $('meta[name=theme-color]');
  if (m) m.content = isDark() ? (plain ? '#000000' : '#000000') : plain ? '#FFFFFF' : '#F2F2F7';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeColor);

// ---------- Passcode pad ----------
function pinPad({ title, sub, onDone, onCancel, onForgot }) {
  const root = $('#lock-root');
  let code = '', busy = false;
  root.innerHTML = `<div class="lock" role="dialog" aria-modal="true">
    <div class="lock-ic">${glyph('lock')}</div>
    <div class="lock-title" id="pt">${esc(title)}</div>
    <div class="lock-sub" id="ps">${esc(sub || '')}</div>
    <div class="dots" id="pd"><i></i><i></i><i></i><i></i></div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
      <button class="ghost" data-k="cancel">${onCancel ? 'Cancel' : ''}</button><button data-k="0">0</button><button class="ghost" data-k="del" aria-label="Delete">${glyph('chevL')}</button></div>
    ${onForgot ? '<button class="link lock-foot" data-k="forgot">Forgot code?</button>' : ''}
  </div>`;
  const dots = $('#pd', root);
  const paintDots = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < code.length));
  const closeFn = () => { if (onCancel) { ctrl.close(); onCancel(); } };
  layers.push(closeFn);
  const ctrl = {
    reset(msg, shake) {
      code = ''; busy = false; paintDots();
      if (msg != null) $('#ps', root).textContent = msg;
      if (shake) { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); buzz([30, 40, 30]); }
    },
    busy(msg) { $('#ps', root).textContent = msg; },
    setTitle(t, s) { $('#pt', root).textContent = t; $('#ps', root).textContent = s || ''; },
    close() {
      const i = layers.indexOf(closeFn);
      if (i >= 0) layers.splice(i, 1);
      document.removeEventListener('keydown', onKey);
      const l = $('.lock', root);
      if (!l) return;
      l.classList.add('out');
      setTimeout(() => { if (root.firstElementChild === l) root.innerHTML = ''; }, 260);
    },
  };
  const press = (k) => {
    if (busy) return;
    if (k === 'del') { code = code.slice(0, -1); paintDots(); return; }
    if (k === 'cancel') { closeFn(); return; }
    if (k === 'forgot') { if (onForgot) onForgot(ctrl); return; }
    if (code.length >= 4) return;
    code += k;
    paintDots();
    if (code.length === 4) { busy = true; setTimeout(() => onDone(code, ctrl), 140); }
  };
  $('.lock', root).addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  const onKey = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Escape') press('cancel'); };
  document.addEventListener('keydown', onKey);
  return ctrl;
}

// ---------- Keyboard ----------
// On a phone, hide the floating tab bar while typing so it doesn't sit on top of the keyboard.
const TYPING = 'input:not([type="checkbox"]):not([type="file"]):not([type="date"]):not([type="time"]), textarea, [contenteditable="true"]';
if (matchMedia('(pointer: coarse)').matches) {
  document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches(TYPING)) document.body.classList.add('kb'); });
  document.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement;
    if (!(a && a.matches && a.matches(TYPING))) document.body.classList.remove('kb');
  }, 50));
}

// ---------- Clicks ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const f = ACTIONS[el.dataset.act];
  if (f) f(el, e);
});
