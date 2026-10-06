'use strict';
/* Notes tab: your notes as cards (pinned first) with folder chips, search, and the hold menu
   (pin, move, delete). The note editor is in editor.js. */

const folderOf = (id) => S.folders.find((f) => f.id === id);
const noteOf = (id) => S.notes.find((n) => n.id === id);
const notesIn = (fid) => S.notes.filter((n) => fid === 'all' || n.folder === fid);
const noteTitle = (n) => n.title || 'New Note';
const folderName = (fid) => (fid === 'all' ? 'All Notes' : (folderOf(fid) || { name: 'Notes' }).name);

function sortNotes(list) {
  const k = S.settings.noteSort;
  const by = k === 'title' ? (a, b) => noteTitle(a).localeCompare(noteTitle(b))
    : k === 'created' ? (a, b) => b.created - a.created
      : (a, b) => b.edited - a.edited;
  return list.slice().sort(by);
}
const noteTime = (n) => (S.settings.noteSort === 'created' ? n.created : n.edited);
function noteWhen(ms) {
  const n = daysFromToday(dateOf(ms));
  if (n === 0) return hm(ms);
  if (n === -1) return 'Yesterday';
  if (n > -7) return DOW_LONG[new Date(ms).getDay()];
  const x = new Date(ms);
  return `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)}`;
}
function dateGroup(ms) {
  const n = -daysFromToday(dateOf(ms));
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n <= 7) return 'Previous 7 Days';
  if (n <= 30) return 'Previous 30 Days';
  const d = new Date(ms);
  return d.getFullYear() === new Date().getFullYear() ? MONTHS[d.getMonth()] : String(d.getFullYear());
}
// ---------- Notes home: your notes as cards, folders as chips ----------
// The Notes tab opens on Today's helpers (today.js), then your notes as cards: the title, two lines
// of text, the folder's colour, the date, how much of a checklist is ticked and the first photo.
// Pinned first, then by when they were edited. The chips at the top show one folder at a time.
// Hold a card for Pin / Move / Delete, a folder chip to rename, recolour or delete the folder.
// Long lists draw the first cards at once and the rest as you scroll.
const NOTES_PAGE = 80;
const FOLDER_COLORS = ['#3B82F6', '#22C55E', '#A855F7', '#EF4444', '#F59E0B', '#14B8A6', '#EC4899', '#6366F1', '#84CC16', '#0EA5E9'];
function folderColor(id) {
  const f = folderOf(id);
  if (!f) return '#8E8E93';
  if (f.color) return f.color;
  if (f.id === 'notes') return '#8E8E93';
  return FOLDER_COLORS[S.folders.filter((x) => x.id !== 'notes').indexOf(f) % FOLDER_COLORS.length];
}
const fdot = (id) => `<i class="fdot" style="--c:${folderColor(id)}"></i>`;
function noteCard(n, showFolder) {
  const img = !n.locked && n.blobs.length ? `<img class="nc-img" data-photo="${esc(n.blobs[0])}" alt="">` : '';
  const text = n.locked ? `<p class="lk">${glyph('lock', 'inl')}Locked</p>` : n.preview ? `<p>${esc(n.preview)}</p>` : '';
  const td = !n.locked && n.todo && n.todo[1] ? `<span class="nc-td${n.todo[0] === n.todo[1] ? ' all' : ''}">${glyph('check', 'inl')}${n.todo[0]}/${n.todo[1]}</span>` : '';
  const ft = `${showFolder ? `<span class="nc-f">${fdot(n.folder)}${esc(folderName(n.folder))}</span>` : ''}<span>${noteWhen(noteTime(n))}</span>${n.notif ? `<span class="nc-bell">${glyph('bell', 'inl')}</span>` : ''}${td}`;
  return `<button class="ncard${img ? ' has-img' : ''}" data-act="open-note" data-id="${n.id}" data-hold="note"><span class="nc-tx"><b>${esc(noteTitle(n))}</b>${text}<span class="nc-ft">${ft}</span></span>${img}</button>`;
}
// When a note was last changed, in a few words: the sections of the list.
function whenGroup(ms) {
  const n = -daysFromToday(dateOf(ms));
  return n <= 0 ? 'Today' : n <= 6 ? 'This Week' : n <= 30 ? 'This Month' : 'Earlier';
}
// Pinned notes get their own section at the top; the rest follow in sections by date
// (or one "Notes" section when sorted by title, and none for search results).
function cardsHtml(list, limit, fid, flat) {
  const pinned = list.filter((n) => n.pinned), rest = list.filter((n) => !n.pinned);
  const cards = (arr) => `<div class="nlist">${arr.map((n) => noteCard(n, fid === 'all')).join('')}</div>`;
  const shownPins = pinned.slice(0, limit), shownRest = rest.slice(0, Math.max(0, limit - shownPins.length));
  let html = pinned.length ? `<h2 class="sec nsec">${glyph('pin', 'inl')}Pinned</h2>${cards(shownPins)}` : '';
  if (flat || S.settings.noteSort === 'title') {
    if (shownRest.length) html += (pinned.length && !flat ? '<h2 class="sec nsec">Notes</h2>' : '') + cards(shownRest);
  } else {
    const groups = [];
    for (const n of shownRest) {
      const g = whenGroup(noteTime(n));
      if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g, items: [] });
      groups[groups.length - 1].items.push(n);
    }
    html += groups.map((x) => `<h2 class="sec nsec">${x.g}</h2>${cards(x.items)}`).join('');
  }
  return html + (list.length > limit ? '<button class="add-link muted more-notes" data-act="more-notes">Show more notes</button>' : '');
}
// A short note in one line: type it at the top of the Notes screen and press Enter — it is saved
// without opening the editor. The microphone opens a new note with voice typing on.
const quickNoteHtml = () => `<div class="qn"><span class="qn-ic">${glyph('compose')}</span><input class="qn-in" placeholder="Quick note — Enter saves it" enterkeyhint="done" autocapitalize="sentences" maxlength="1000" aria-label="Quick note"><button class="qn-mic" data-act="qn-voice" aria-label="New note by voice">${glyph('mic')}</button></div>`;
function bindQuickNote(el, e) {
  const input = $('.qn-in', el);
  if (!input) return;
  const add = () => {
    const text = input.value.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const n = newNote(e.folder && e.folder !== 'all' ? e.folder : 'notes');
    n.html = `<div>${esc(text)}</div>`;
    n.title = text.slice(0, 120);
    n.text = text;
    save(n);
    input.value = '';
    buzz();
    showResults(el, e);
    const card = $(`.ncard[data-id="${n.id}"]`, el);
    if (card) card.classList.add('flash');
    toast('Note saved');
  };
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); input.blur(); } });
}
ACTIONS['qn-voice'] = () => {
  ACTIONS['new-note']();
  setTimeout(() => { if (ED) ACTIONS['ed-mic'](); }, 500);
};
function notesGridHtml(fid, limit = NOTES_PAGE) {
  const list = sortNotes(notesIn(fid));
  if (!list.length) return empty('note', 'No Notes', fid === 'all' ? 'Tap the pencil button to write one.' : 'Nothing in this folder yet — tap the pencil button to write here.');
  return cardsHtml(list, limit, fid) + `<div class="count">${plural(list.length, 'note')} · hold a note to pin, move or delete it</div>`;
}
const GREETINGS = [[5, 'Good night'], [12, 'Good morning'], [17, 'Good afternoon'], [22, 'Good evening'], [24, 'Good night']];
const greeting = () => { const h = new Date().getHours(); return GREETINGS.find(([to]) => h < to)[1]; };
function searchResults(q, fid) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (n) => {
    const hay = `${n.title || ''}\n${n.locked ? '' : n.text || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const list = sortNotes(notesIn(fid).filter(hit));
  if (!list.length) return empty('search', 'No Results', `Nothing matches “${esc(q)}”.`);
  return `<h2 class="sec nsec">${plural(list.length, 'Note')} Found</h2>` + cardsHtml(list, 400, fid, true);
}
function folderChips(sel) {
  const chip = (id, name) => `<button class="fchip${sel === id ? ' on' : ''}" data-act="pick-folder" data-id="${id}" data-hold="folder">${id === 'all' ? '' : fdot(id)}${esc(name)}</button>`;
  return `<div class="fchips">${chip('all', 'All')}${S.folders.map((f) => chip(f.id, f.name)).join('')}<button class="fchip add" data-act="new-folder" aria-label="New folder">${glyph('folderPlus')}</button></div>`;
}
// Once a month: one tap sends a backup file to Telegram / Drive (safe even if the phone is lost).
function backupNudge() {
  const last = S.settings.lastBackup;
  if (S.notes.length + S.tasks.length + S.habits.length < 5 || (last && Date.now() - last < 30 * 864e5)) return '';
  return `<button class="hint-btn nudge" data-act="backup-save">${glyph('share')}<span><b>Time for a backup</b>${last ? 'Your last one was over a month ago.' : "You haven't saved one yet."} Tap to send it to Telegram or Drive.</span></button>`;
}
const homeResults = (e) => (e.q && e.q.trim() ? searchResults(e.q.trim(), e.folder) : notesGridHtml(e.folder, e.limit));
SCREENS.folders = {
  render(e) {
    if (e.folder !== 'all' && !folderOf(e.folder)) e.folder = 'all';
    return page({
      title: 'Notes', big: greeting(), sub: longDate(todayIso()), right: navBtn('notes-menu', 'more', 'Sort, folders and settings'),
      body: `${todayHtml()}${searchField(e.q, 'Search')}${backupNudge()}${quickNoteHtml()}${folderChips(e.folder)}<div class="results">${homeResults(e)}</div>`,
    });
  },
  mount(el, e) { bindSearch(el, e); bindQuickNote(el, e); fillPhotos(el); watchMoreNotes(el, e); },
  sig: () => S.notes.map((n) => n.id + n.edited + (n.pinned ? 'p' : '') + n.folder + (n.locked ? 'l' : '') + n.blobs.length + (n.notif ? 'b' : '') + (n.todo || '')).join() + '|' + JSON.stringify(S.folders) + '|' + (S.settings.noteSort || '') + '|' + (S.settings.lastBackup || '') + '|' + todaySig(),
  fab: () => ({ g: 'compose', act: 'new-note', label: 'New note' }),
};
function bindSearch(el, e) {
  const input = $('.search input', el);
  input.addEventListener('input', () => {
    if (!bodiesLoaded) { wakeBodies(); bodiesReady.then(() => { if (e.q && e.q.trim() && input.isConnected) input.dispatchEvent(new Event('input')); }); }
    e.q = input.value;
    showResults(el, e);
  });
}
function showResults(el, e) {
  $('.results', el).innerHTML = homeResults(e);
  fillPhotos($('.results', el));
  watchMoreNotes(el, e);
}
// The "Show more notes" button loads the next cards by itself when it comes near the screen.
function watchMoreNotes(el, e) {
  if (el._moreObs) el._moreObs.disconnect();
  const b = $('.more-notes', el), scr = $('.scroll', el);
  if (!b || !scr || !('IntersectionObserver' in window)) return;
  el._moreObs = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) moreNotes(el, e); }, { root: scr, rootMargin: '0px 0px 800px 0px' });
  el._moreObs.observe(b);
}
// The next cards are added under the ones already there (the cards above are not drawn again, so
// scrolling never jumps): the new part of the list is drawn on its own and the sections that
// continue are joined up.
function moreNotes(el, e) {
  if (e.q && e.q.trim()) return;
  const from = e.limit || NOTES_PAGE;
  e.limit = from + NOTES_PAGE;
  const r = $('.results', el), btn = $('.more-notes', el);
  if (!r || !btn) { showResults(el, e); return; }
  if (el._moreObs) el._moreObs.disconnect();
  const tmp = document.createElement('div');
  tmp.innerHTML = notesGridHtml(e.folder, e.limit);
  const lists = $$('.nlist', r), last = lists[lists.length - 1];
  const known = new Set($$('.ncard', r).map((c) => c.dataset.id));
  $$('.ncard', tmp).forEach((c) => { if (known.has(c.dataset.id)) c.remove(); });
  $$('.nlist', tmp).forEach((x) => { if (!x.children.length) { const h = x.previousElementSibling; if (h && h.classList.contains('nsec')) h.remove(); x.remove(); } });
  const tail = $$('.more-notes, .count', tmp);
  tail.forEach((x) => x.remove());
  fillPhotos(tmp);
  // the first new section may continue the last one already shown
  const heads = $$('.nsec', r), lastHead = heads.length ? heads[heads.length - 1].textContent : null;
  const h0 = tmp.firstElementChild;
  if (last && h0 && h0.classList.contains('nsec') && h0.textContent === lastHead && h0.nextElementSibling) {
    const cont = h0.nextElementSibling;
    h0.remove();
    last.append(...cont.children);
    cont.remove();
  } else if (last && h0 && h0.classList.contains('nlist')) { last.append(...h0.children); h0.remove(); }
  tmp.append(...tail);
  btn.remove();
  const count = $('.count', r);
  if (count) count.remove();
  r.append(...tmp.children);
  watchMoreNotes(el, e);
}
ACTIONS['more-notes'] = (b) => { const el = b.closest('.screen'); if (el) moreNotes(el, cur()); };
// Tap a folder chip: its notes slide in from the side of the chip that was tapped. (Swiping
// sideways on the screen changes tab — see bindTabSwipe in core.js.)
ACTIONS['pick-folder'] = (b) => {
  const e = cur(), el = curEl();
  if (e.folder === b.dataset.id) return;
  const ids = folderIds(), dir = Math.sign(ids.indexOf(b.dataset.id) - ids.indexOf(e.folder));
  pickFolder(el, e, b.dataset.id);
  const r = $('.results', el);
  if (r && dir && !reduceMotion()) { r.classList.remove('from-r', 'from-l'); void r.offsetWidth; r.classList.add(dir > 0 ? 'from-r' : 'from-l'); }
  // the chosen folder's notes come into view (the helpers above stay where they are)
  const scr = $('.scroll', el), chips = $('.fchips', el);
  if (scr && chips && chips.offsetTop - 60 < scr.scrollTop) scr.scrollTo({ top: chips.offsetTop - 64, behavior: reduceMotion() ? 'auto' : 'smooth' });
};
// All, then your folders in order (the order of the chips).
const folderIds = () => ['all', ...S.folders.map((f) => f.id)];
function pickFolder(el, e, id) {
  e.folder = id;
  e.limit = NOTES_PAGE;
  $$('.fchip', el).forEach((c) => c.classList.toggle('on', c.dataset.id === id));
  showResults(el, e);
  // the chosen chip comes into view in the row of chips
  const chip = $(`.fchip[data-id="${id}"]`, el), row = chip && chip.parentElement;
  if (row) {
    const x = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, x), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }
}
ACTIONS['new-folder'] = async () => {
  const name = await askText({ title: 'New Folder', msg: 'Enter a name for this folder.', placeholder: 'Name', ok: 'Save' });
  if (!name) return;
  if (S.folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) { toast('A folder with that name already exists'); return; }
  const f = { id: uid(), name };
  S.folders.push(f);
  save();
  const e = cur();
  if (e.s === 'folders') { e.folder = f.id; e.limit = NOTES_PAGE; }
  render();
};
async function renameFolder(id) {
  const f = folderOf(id);
  if (!f) return;
  const name = await askText({ title: 'Rename Folder', value: f.name, ok: 'Save' });
  if (!name) return;
  f.name = name;
  save();
  render();
}
async function deleteFolder(id) {
  const f = folderOf(id);
  if (!f || id === 'notes') return false;
  const n = notesIn(id).length;
  const ok = await ask({ title: `Delete “${f.name}”?`, msg: n ? `Its ${plural(n, 'note')} will move to the Notes folder.` : '', ok: 'Delete Folder', destructive: true });
  if (!ok) return false;
  S.notes.forEach((x) => { if (x.folder === id) x.folder = 'notes'; });
  S.folders = S.folders.filter((x) => x.id !== id);
  const e = cur();
  if (e.s === 'folders' && e.folder === id) e.folder = 'all';
  save();
  render();
  return true;
}
ACTIONS['notes-menu'] = async (el) => {
  const e = cur();
  const k = S.settings.noteSort;
  const custom = e.folder !== 'all' && e.folder !== 'notes';
  const items = [
    { id: 'sort:edited', label: 'Sort by Date Edited', check: k === 'edited' },
    { id: 'sort:created', label: 'Sort by Date Created', check: k === 'created' },
    { id: 'sort:title', label: 'Sort by Title', check: k === 'title' },
  ];
  if (custom) items.push('-', { id: 'rename', label: `Rename “${folderName(e.folder)}”`, g: 'pencil' }, { id: 'delete', label: 'Delete Folder', g: 'trash', danger: true });
  items.push('-', { id: 'settings', label: 'Settings', g: 'gear' });
  const v = await menu(el, items);
  if (!v) return;
  if (v.startsWith('sort:')) { S.settings.noteSort = v.slice(5); save(); render(); return; }
  if (v === 'rename') renameFolder(e.folder);
  if (v === 'delete') deleteFolder(e.folder);
  if (v === 'settings') ACTIONS.settings();
};
// A folder's colour (the dot on its chip and on its notes).
let FC = null;
function folderColorSheet(id) {
  FC = id;
  const html = () => `${sheetHead('Folder Colour', '', '<button class="strong" data-act="close-sheet">Done</button>')}
    <div class="sheet-body"><div class="card pad fc-prev"><span class="fchip on-c">${fdot(FC)}${esc(folderName(FC))}</span></div>
    <div class="card pad">${swatches('folder-color', folderColor(FC))}</div></div>`;
  folderColorSheet.html = html;
  openSheet(html());
}
ACTIONS['folder-color'] = (el) => {
  const f = folderOf(FC);
  if (!f) return;
  f.color = el.dataset.v;
  save();
  refreshSheet(folderColorSheet.html());
  render();
};
// Hold a card or a folder chip for its options (a right-click works too).
const HOLD = {
  note: async (el) => {
    const n = noteOf(el.dataset.id);
    if (!n) return;
    const v = await menu(el, [
      { id: 'pin', label: n.pinned ? 'Unpin' : 'Pin', g: n.pinned ? 'unpin' : 'pin' },
      ...(n.locked ? [] : [{ id: 'notif', label: n.notif ? 'Remove from Lock Screen' : 'Show on Lock Screen', g: 'bell' }]),
      { id: 'move', label: 'Move to Folder', g: 'folderMove' },
      '-',
      { id: 'del', label: 'Delete', g: 'trash', danger: true },
    ]);
    if (v === 'notif') { await noteNotifToggle(n); render(); }
    if (v === 'pin') ACTIONS['note-pin']({ dataset: { id: n.id } });
    if (v === 'move') moveSheet(n.id);
    if (v === 'del') { deleteNote(n.id); render(); }
  },
  folder: async (el) => {
    const id = el.dataset.id;
    if (id === 'all') return;
    const items = [{ id: 'color', label: 'Colour', g: 'palette' }];
    if (id !== 'notes') items.push({ id: 'rename', label: 'Rename Folder', g: 'pencil' }, { id: 'delete', label: 'Delete Folder', g: 'trash', danger: true });
    const v = await menu(el, items);
    if (v === 'color') folderColorSheet(id);
    if (v === 'rename') renameFolder(id);
    if (v === 'delete') deleteFolder(id);
  },
};
let holdT = 0, heldAt = 0;
function hold(el) {
  clearTimeout(holdT);
  if (Date.now() - heldAt < 600) return;
  heldAt = Date.now();
  buzz(15);
  HOLD[el.dataset.hold](el);
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-hold]');
  clearTimeout(holdT);
  if (!el || e.button > 0) return;
  const x0 = e.clientX, y0 = e.clientY;
  const cancel = () => { clearTimeout(holdT); window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', cancel, true); window.removeEventListener('pointercancel', cancel, true); };
  const move = (ev) => { if (Math.abs(ev.clientX - x0) > 10 || Math.abs(ev.clientY - y0) > 10) cancel(); };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', cancel, true);
  window.addEventListener('pointercancel', cancel, true);
  holdT = setTimeout(() => { cancel(); hold(el); }, 480);
});
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-hold]');
  if (!el) return;
  e.preventDefault();
  hold(el);
});
// The finger lifting after a hold must not also open the note.
document.addEventListener('click', (e) => {
  if (Date.now() - heldAt < 700 && e.target.closest('[data-hold]')) { e.stopPropagation(); e.preventDefault(); }
}, true);

// ---------- Note actions ----------
function newNote(folder) {
  const now = Date.now();
  const n = { id: uid(), folder: folderOf(folder) ? folder : 'notes', html: '', title: '', preview: '', text: '', blobs: [], pinned: false, locked: false, enc: null, created: now, edited: now };
  S.notes.push(n);
  return n;
}
ACTIONS['new-note'] = () => {
  const e = cur();
  const n = newNote(e.s === 'folders' && e.folder && e.folder !== 'all' ? e.folder : 'notes');
  if (UI.tab !== 'notes') goTab('notes', true);
  push({ s: 'note', id: n.id, fresh: true });
};
ACTIONS['open-note'] = async (el) => {
  const n = noteOf(el.dataset.id);
  if (!n) return;
  if (n.locked && !(await needKey())) return;
  push({ s: 'note', id: n.id });
};
ACTIONS['note-pin'] = (el) => {
  const n = noteOf(el.dataset.id);
  if (!n) return;
  n.pinned = !n.pinned;
  save();
  render();
};
function deleteNote(id) {
  const i = S.notes.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [n] = S.notes.splice(i, 1);
  save();
  undoToast('Note deleted', () => { S.notes.splice(Math.min(i, S.notes.length), 0, n); });
}
ACTIONS['note-del'] = (el) => { deleteNote(el.dataset.id); render(); };
function moveSheet(id, after) {
  const n = noteOf(id);
  if (!n) return;
  openSheet(`${sheetHead('Move to Folder', '', '<button data-act="close-sheet">Cancel</button>')}
    <div class="sheet-body"><div class="card">${S.folders.map((f) => `<button class="row" data-act="note-move-to" data-id="${n.id}" data-v="${f.id}">${glyph('folder', 'row-g')}<span class="lbl">${esc(f.name)}</span>${f.id === n.folder ? glyph('check', 'tick') : ''}</button>`).join('')}</div>
    <button class="add-link" data-act="new-folder-move" data-id="${n.id}">${glyph('folderPlus')}New Folder</button></div>`);
  moveSheet.after = after;
}
ACTIONS['note-move'] = (el) => moveSheet(el.dataset.id);
ACTIONS['note-move-to'] = (el) => {
  const n = noteOf(el.dataset.id);
  if (!n) return;
  n.folder = el.dataset.v;
  save();
  closeSheet();
  render();
  if (moveSheet.after) moveSheet.after();
  toast(`Moved to ${folderName(n.folder)}`);
};
ACTIONS['new-folder-move'] = async (el) => {
  const name = await askText({ title: 'New Folder', msg: 'Enter a name for this folder.', placeholder: 'Name', ok: 'Save' });
  if (!name) return;
  const f = { id: uid(), name };
  S.folders.push(f);
  ACTIONS['note-move-to']({ dataset: { id: el.dataset.id, v: f.id } });
};
ACTIONS.settings = () => push({ s: 'settings' });
