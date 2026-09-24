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
    locked: !!(n.locked && n.enc && typeof n.enc.iv === 'string' && typeof n.enc.ct === 'string'),
    enc: n.locked && n.enc ? { iv: str(n.enc.iv, 100), ct: str(n.enc.ct, 1e7) } : null,
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
    return {
      id: h.id, name: str(h.name, 80) || 'Habit', g: G[h.g] ? h.g : 'flame', c: HEX_RE.test(h.c) ? h.c : '#FF9500',
      days: Array.isArray(h.days) && h.days.length === 7 && h.days.some(Boolean) ? h.days.map((x) => (x ? 1 : 0)) : [1, 1, 1, 1, 1, 1, 1],
      target: clamp(Math.round(+h.target) || 1, 1, 50),
      remind: TIME_RE.test(h.remind) ? h.remind : null,
      snooze: h.snooze && DATE_RE.test(h.snooze.date) ? { date: h.snooze.date, at: +h.snooze.at || 0 } : null,
      log, start: DATE_RE.test(h.start) ? h.start : todayIso(),
    };
  });
  return out;
}
async function loadState() {
  try { S = normalize(await dbGet('state', 'S')); } catch (e) { S = blank(); storageBroken = e; }
}
let storageBroken = null;
let saveT = 0;
function save() {
  S.rev++;
  clearTimeout(saveT);
  saveT = setTimeout(flush, 250);
  if (typeof remindSoon === 'function') remindSoon();
}
async function flush() {
  clearTimeout(saveT);
  saveT = 0;
  try { await dbPut('state', 'S', S); } catch (e) { toast("Couldn't save — " + ((e && e.message) || e)); }
}

// ---------- Screens & navigation ----------
// SCREENS[name] = { render(e) → html, mount(el, e), hide(e, el), leave(e), fab(e), tint(e), bar, plain, keep }
const SCREENS = {};
const ACTIONS = {}; // data-act → (el, event)
const UI = { tab: 'notes', stacks: { notes: [{ s: 'folders' }], planner: [{ s: 'planner' }] } };
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

function paint(el, e) {
  const sc = SCREENS[e.s];
  el.innerHTML = sc.render(e);
  const tint = sc.tint ? sc.tint(e) : null;
  if (tint) el.style.setProperty('--tint', tint); else el.style.removeProperty('--tint');
  const scr = $('.scroll', el);
  if (scr) scr.addEventListener('scroll', () => navState(el), { passive: true });
  if (sc.mount) sc.mount(el, e);
}
function navState(el) {
  const scr = $('.scroll', el), big = $('.big', el);
  const y = scr ? scr.scrollTop : 0;
  el.classList.toggle('scrolled', y > 2);
  el.classList.toggle('titled', !big || y > big.offsetTop + big.offsetHeight - 52);
}
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
      setTimeout(() => { old.remove(); el.classList.remove(dir + '-in'); }, 460);
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
  show('fade');
  syncHistory();
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
  const sw = row.parentElement, R = $(':scope > .sw-acts.r', sw), L = $(':scope > .sw-acts.l', sw);
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
  `<div class="sw ${cls}" ${attrs}>${left ? `<div class="sw-acts l">${left}</div>` : ''}${right ? `<div class="sw-acts r">${right}</div>` : ''}<div class="sw-row">${inner}</div></div>`;
const swBtn = (act, id, label, g, color) => `<button data-act="${act}" data-id="${esc(id)}" style="--c:${color}">${glyph(g)}<span>${esc(label)}</span></button>`;

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
