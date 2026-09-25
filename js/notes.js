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
// The Notes tab opens straight on the notes (two columns of cards, pinned first). The chips at the
// top show one folder at a time. Hold a card for Pin / Move / Delete, a folder chip to rename or
// delete the folder. Long lists draw the first cards at once and the rest as you scroll.
const NOTES_PAGE = 80;
function noteCard(n, showFolder) {
  const img = !n.locked && n.blobs.length ? `<img class="nc-img" data-photo="${esc(n.blobs[0])}" alt="">` : '';
  const text = n.locked ? `<p class="lk">${glyph('lock', 'inl')}Locked</p>` : `<p>${esc(n.preview || 'No additional text')}</p>`;
  return `<button class="ncard${n.pinned ? ' pin' : ''}${img ? ' has-img' : ''}" data-act="open-note" data-id="${n.id}" data-hold="note">${img}<b>${esc(noteTitle(n))}</b>${text}<span><i>${showFolder ? esc(folderName(n.folder)) : ''}</i><em>${n.pinned ? glyph('pin', 'inl') : ''}${noteWhen(noteTime(n))}</em></span></button>`;
}
function cardsHtml(list, limit, fid) {
  const ordered = [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)];
  return `<div class="ngrid">${ordered.slice(0, limit).map((n) => noteCard(n, fid === 'all')).join('')}</div>`
    + (list.length > limit ? '<button class="add-link muted more-notes" data-act="more-notes">Show more notes</button>' : '');
}
function notesGridHtml(fid, limit = NOTES_PAGE) {
  const list = sortNotes(notesIn(fid));
  if (!list.length) return empty('note', 'No Notes', fid === 'all' ? 'Tap the pencil button to write one.' : 'Nothing in this folder yet — tap the pencil button to write here.');
  return cardsHtml(list, limit, fid) + `<div class="count">${plural(list.length, 'note')} · hold a note to pin, move or delete it</div>`;
}
function searchResults(q, fid) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (n) => {
    const hay = `${n.title || ''}\n${n.locked ? '' : n.text || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const list = sortNotes(notesIn(fid).filter(hit));
  if (!list.length) return empty('search', 'No Results', `Nothing matches “${esc(q)}”.`);
  return `<h2 class="sec">${plural(list.length, 'Note')} Found</h2>` + cardsHtml(list, 400, fid);
}
function folderChips(sel) {
  const chip = (id, name) => `<button class="fchip${sel === id ? ' on' : ''}" data-act="pick-folder" data-id="${id}"${id !== 'all' && id !== 'notes' ? ' data-hold="folder"' : ''}>${esc(name)} <small>${notesIn(id).length}</small></button>`;
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
      title: 'Notes', right: navBtn('notes-menu', 'more', 'Sort and folder') + navBtn('settings', 'gear', 'Settings'),
      body: `${searchField(e.q, 'Search')}${backupNudge()}${folderChips(e.folder)}<div class="results">${homeResults(e)}</div>`,
    });
  },
  mount(el, e) { bindSearch(el, e); fillPhotos(el); watchMoreNotes(el, e); },
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
function moreNotes(el, e) {
  if (e.q && e.q.trim()) return;
  e.limit = (e.limit || NOTES_PAGE) + NOTES_PAGE;
  showResults(el, e);
}
ACTIONS['more-notes'] = (b) => { const el = b.closest('.screen'); if (el) moreNotes(el, cur()); };
ACTIONS['pick-folder'] = (b) => {
  const e = cur(), el = curEl();
  if (e.folder === b.dataset.id) return;
  e.folder = b.dataset.id;
  e.limit = NOTES_PAGE;
  $$('.fchip', el).forEach((c) => c.classList.toggle('on', c === b));
  showResults(el, e);
  const scr = $('.scroll', el), r = $('.results', el);
  if (scr && r && r.offsetTop - 120 < scr.scrollTop) scr.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
};
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
  const v = await menu(el, items);
  if (!v) return;
  if (v.startsWith('sort:')) { S.settings.noteSort = v.slice(5); save(); render(); return; }
  if (v === 'rename') renameFolder(e.folder);
  if (v === 'delete') deleteFolder(e.folder);
};
// Hold a card or a folder chip for its options (a right-click works too).
const HOLD = {
  note: async (el) => {
    const n = noteOf(el.dataset.id);
    if (!n) return;
    const v = await menu(el, [
      { id: 'pin', label: n.pinned ? 'Unpin' : 'Pin', g: n.pinned ? 'unpin' : 'pin' },
      { id: 'move', label: 'Move to Folder', g: 'folderMove' },
      '-',
      { id: 'del', label: 'Delete', g: 'trash', danger: true },
    ]);
    if (v === 'pin') ACTIONS['note-pin']({ dataset: { id: n.id } });
    if (v === 'move') moveSheet(n.id);
    if (v === 'del') { deleteNote(n.id); render(); }
  },
  folder: async (el) => {
    const v = await menu(el, [{ id: 'rename', label: 'Rename Folder', g: 'pencil' }, { id: 'delete', label: 'Delete Folder', g: 'trash', danger: true }]);
    if (v === 'rename') renameFolder(el.dataset.id);
    if (v === 'delete') deleteFolder(el.dataset.id);
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
