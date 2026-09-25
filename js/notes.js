'use strict';
/* Notes tab: folders, the notes list (pinned first, then grouped by date), search, and swipe
   actions (right: pin, left: move / delete). The note editor is in editor.js. */

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
const section = (title, inner, g = '') => `${title ? `<h2 class="sec">${g ? glyph(g) : ''}${esc(title)}</h2>` : ''}<div class="card">${inner}</div>`;

function noteRow(n, showFolder) {
  const sub = n.locked ? `${glyph('lock', 'inl')}Locked` : esc(n.preview || 'No additional text');
  const thumb = !n.locked && n.blobs.length ? `<img class="thumb" data-photo="${esc(n.blobs[0])}" alt="">` : '';
  const inner = `<button class="nrow" data-act="open-note" data-id="${n.id}">
      <span class="nr-main"><span class="nr-title">${esc(noteTitle(n))}</span>
      <span class="nr-sub"><b>${noteWhen(noteTime(n))}</b>${sub}</span>
      ${showFolder ? `<span class="nr-folder">${glyph('folder')}${esc(folderName(n.folder))}</span>` : ''}</span>${thumb}</button>`;
  return swipeRow(inner, {
    left: swBtn('note-pin', n.id, n.pinned ? 'Unpin' : 'Pin', n.pinned ? 'unpin' : 'pin', 'var(--orange)'),
    right: swBtn('note-move', n.id, 'Move', 'folderMove', 'var(--purple)') + swBtn('note-del', n.id, 'Delete', 'trash', 'var(--red)'),
  });
}
// Long lists draw the first notes straight away and the rest as you scroll towards them.
const NOTES_PAGE = 80;
function notesListHtml(fid, limit = NOTES_PAGE) {
  const list = sortNotes(notesIn(fid));
  if (!list.length) return empty('note', 'No Notes', 'Tap the pencil button to write one.');
  const all = fid === 'all';
  const ordered = [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)].slice(0, limit);
  const pinned = ordered.filter((n) => n.pinned), rest = ordered.filter((n) => !n.pinned);
  const more = list.length > limit ? `<button class="add-link muted more-notes" data-act="more-notes">Show more notes</button>` : '';
  let html = pinned.length ? section('Pinned', pinned.map((n) => noteRow(n, all)).join(''), 'pin') : '';
  if (S.settings.noteSort === 'title') {
    if (rest.length) html += section(pinned.length ? 'Notes' : '', rest.map((n) => noteRow(n, all)).join(''));
    return html + more;
  }
  const groups = [];
  for (const n of rest) {
    const g = dateGroup(noteTime(n));
    if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g, items: [] });
    groups[groups.length - 1].items.push(n);
  }
  return html + groups.map((x) => section(x.g, x.items.map((n) => noteRow(n, all)).join(''))).join('') + more;
}
// The "Show more notes" button loads the next notes by itself when it comes near the screen.
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
  $('.results', el).innerHTML = notesListHtml(e.folder, e.limit);
  fillPhotos($('.results', el));
  watchMoreNotes(el, e);
}
ACTIONS['more-notes'] = (b) => { const el = b.closest('.screen'); if (el) moreNotes(el, cur()); };
function searchResults(q, fid) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (n) => {
    const hay = `${n.title || ''}\n${n.locked ? '' : n.text || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const list = sortNotes(notesIn(fid).filter(hit));
  if (!list.length) return empty('search', 'No Results', `Nothing matches “${esc(q)}”.`);
  return section(plural(list.length, 'Note') + ' Found', list.map((n) => noteRow(n, fid === 'all')).join(''));
}
function bindSearch(el, e, fid, plain) {
  const input = $('.search input', el);
  input.addEventListener('input', () => {
    if (!bodiesLoaded) { wakeBodies(); bodiesReady.then(() => { if (e.q && e.q.trim() && input.isConnected) input.dispatchEvent(new Event('input')); }); }
    e.q = input.value;
    $('.results', el).innerHTML = e.q.trim() ? searchResults(e.q.trim(), fid) : plain();
    fillPhotos($('.results', el));
    watchMoreNotes(el, e);
  });
}

// ---------- Folders ----------
// Once a month: one tap sends a backup file to Telegram / Drive (safe even if the phone is lost).
function backupNudge() {
  const last = S.settings.lastBackup;
  if (S.notes.length + S.tasks.length + S.habits.length < 5 || (last && Date.now() - last < 30 * 864e5)) return '';
  return `<button class="hint-btn nudge" data-act="backup-save">${glyph('share')}<span><b>Time for a backup</b>${last ? 'Your last one was over a month ago.' : "You haven't saved one yet."} Tap to send it to Telegram or Drive.</span></button>`;
}
function folderList() {
  const row = (id, name, g, custom) => {
    const inner = `<button class="row" data-act="open-folder" data-id="${id}">${glyph(g, 'row-g')}<span class="lbl">${esc(name)}</span><span class="val">${notesIn(id).length}</span>${glyph('chevR', 'chev')}</button>`;
    return custom ? swipeRow(inner, { right: swBtn('folder-rename', id, 'Rename', 'pencil', 'var(--gray)') + swBtn('folder-del', id, 'Delete', 'trash', 'var(--red)') }) : inner;
  };
  return `${backupNudge()}<div class="card">${row('all', 'All Notes', 'tray')}${S.folders.map((f) => row(f.id, f.name, 'folder', f.id !== 'notes')).join('')}</div>
    <button class="add-link" data-act="new-folder">${glyph('folderPlus')}New Folder</button>`;
}
SCREENS.folders = {
  render(e) {
    return page({
      title: 'Folders', right: navBtn('settings', 'gear', 'Settings'),
      body: `${searchField(e.q, 'Search all notes')}<div class="results">${e.q && e.q.trim() ? searchResults(e.q.trim(), 'all') : folderList()}</div>`,
    });
  },
  mount(el, e) { bindSearch(el, e, 'all', folderList); fillPhotos(el); },
  fab: () => ({ g: 'compose', act: 'new-note', label: 'New note' }),
};
ACTIONS['open-folder'] = (el) => push({ s: 'notes', folder: el.dataset.id });
ACTIONS['new-folder'] = async () => {
  const name = await askText({ title: 'New Folder', msg: 'Enter a name for this folder.', placeholder: 'Name', ok: 'Save' });
  if (!name) return;
  if (S.folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) { toast('A folder with that name already exists'); return; }
  S.folders.push({ id: uid(), name });
  save();
  render();
};
ACTIONS['folder-rename'] = async (el) => {
  const f = folderOf(el.dataset.id);
  if (!f) return;
  const name = await askText({ title: 'Rename Folder', value: f.name, ok: 'Save' });
  if (!name) { render(); return; }
  f.name = name;
  save();
  render();
};
async function deleteFolder(id) {
  const f = folderOf(id);
  if (!f || id === 'notes') return false;
  const n = notesIn(id).length;
  const ok = await ask({ title: `Delete “${f.name}”?`, msg: n ? `Its ${plural(n, 'note')} will move to the Notes folder.` : '', ok: 'Delete Folder', destructive: true });
  if (!ok) { render(); return false; }
  S.notes.forEach((x) => { if (x.folder === id) x.folder = 'notes'; });
  S.folders = S.folders.filter((x) => x.id !== id);
  save();
  return true;
}
ACTIONS['folder-del'] = async (el) => { if (await deleteFolder(el.dataset.id)) render(); };

// ---------- Notes list ----------
SCREENS.notes = {
  render(e) {
    if (e.folder !== 'all' && !folderOf(e.folder)) e.folder = 'notes';
    const n = notesIn(e.folder).length;
    return page({
      title: folderName(e.folder), back: 'Folders', right: navBtn('notes-menu', 'more', 'More'),
      body: `${searchField(e.q, 'Search')}<div class="results">${e.q && e.q.trim() ? searchResults(e.q.trim(), e.folder) : notesListHtml(e.folder, e.limit)}</div>
        ${n ? `<div class="count">${plural(n, 'Note')}</div>` : ''}`,
    });
  },
  mount(el, e) { bindSearch(el, e, e.folder, () => notesListHtml(e.folder, e.limit)); fillPhotos(el); watchMoreNotes(el, e); },
  fab: () => ({ g: 'compose', act: 'new-note', label: 'New note' }),
};
ACTIONS['notes-menu'] = async (el) => {
  const e = cur();
  const k = S.settings.noteSort;
  const custom = e.folder !== 'all' && e.folder !== 'notes';
  const items = [
    { id: 'sort:edited', label: 'Sort by Date Edited', check: k === 'edited' },
    { id: 'sort:created', label: 'Sort by Date Created', check: k === 'created' },
    { id: 'sort:title', label: 'Sort by Title', check: k === 'title' },
  ];
  if (custom) items.push('-', { id: 'rename', label: 'Rename Folder', g: 'pencil' }, { id: 'delete', label: 'Delete Folder', g: 'trash', danger: true });
  const v = await menu(el, items);
  if (!v) return;
  if (v.startsWith('sort:')) { S.settings.noteSort = v.slice(5); save(); render(); return; }
  if (v === 'rename') {
    const f = folderOf(e.folder);
    const name = await askText({ title: 'Rename Folder', value: f.name, ok: 'Save' });
    if (name) { f.name = name; save(); render(); }
  }
  if (v === 'delete' && (await deleteFolder(e.folder))) pop();
};

// ---------- Note actions ----------
function newNote(folder) {
  const now = Date.now();
  const n = { id: uid(), folder: folderOf(folder) ? folder : 'notes', html: '', title: '', preview: '', text: '', blobs: [], pinned: false, locked: false, enc: null, created: now, edited: now };
  S.notes.push(n);
  return n;
}
ACTIONS['new-note'] = () => {
  const e = cur();
  const n = newNote(e.s === 'notes' && e.folder !== 'all' ? e.folder : 'notes');
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
