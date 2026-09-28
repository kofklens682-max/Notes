'use strict';
/* Tables in notes. The table button opens "New Table": ready-made layouts (Vocabulary, Homework…),
   size and settings with a live preview. In a table you tap a cell and type; Enter goes to the next
   cell (and makes a new row at the end); Enter on an empty last row leaves the table. With the
   cursor in a table the table button opens the panel for rows, columns and settings.
   Saved as plain HTML: the first row is the header when its cells are <th>; the table's classes
   are its settings (num = numbered rows, zebra = striped rows, fc = bold first column); a
   <td class="tk"> is a tick box (class "done" when ticked). */

const TABLE_OPTS = [
  ['num', 'Number the rows', 'listNum', '#007AFF'],
  ['zebra', 'Striped rows', 'list', '#34C759'],
  ['fc', 'Bold first column', 'star', '#FF9500'],
];
// side: words already written down the first column. tc: the T-chart look (one line under the
// headings, one down the middle).
const TABLE_TPLS = [
  { id: 'blank', name: 'Blank', g: 'table', c: '#8E8E93', heads: ['', ''], rows: 3 },
  { id: 'vocab', name: 'Vocabulary', g: 'book', c: '#FF9500', heads: ['Word', 'Meaning', 'Example'], rows: 5, fc: 1 },
  { id: 'hw', name: 'Homework', g: 'checkCircle', c: '#34C759', heads: ['Task', 'Due', 'Done'], ticks: [2], rows: 4 },
  { id: 'marks', name: 'Marks', g: 'gradcap', c: '#007AFF', heads: ['Name', 'Mark', 'Comment'], rows: 6, num: 1, zebra: 1 },
  { id: 'plan', name: 'Lesson plan', g: 'clock', c: '#AF52DE', heads: ['Time', 'Activity', 'Materials'], rows: 4, fc: 1 },
  { id: 'tchart', name: 'T-chart', g: 'tchart', c: '#FF2D55', heads: ['', ''], rows: 6, tc: 1, desc: 'Two sides to compare' },
  { id: 'pros', name: 'Pros & Cons', g: 'plusminus', c: '#30B0C7', heads: ['Pros', 'Cons'], rows: 5, tc: 1 },
  { id: 'kwl', name: 'KWL chart', g: 'bulb', c: '#FFCC00', heads: ['Know', 'Want to know', 'Learned'], rows: 4 },
  { id: 'cornell', name: 'Cornell notes', g: 'cornell', c: '#A2845E', heads: ['Questions', 'Notes'], rows: 5, fc: 1 },
  { id: 'forms', name: 'Word forms', g: 'letters', c: '#5856D6', heads: ['Noun', 'Verb', 'Adjective', 'Adverb'], rows: 5 },
  { id: 'verbs', name: 'Irregular verbs', g: 'repeat', c: '#FF9F0A', heads: ['Verb', 'Past simple', 'Past participle', 'Meaning'], rows: 6, fc: 1 },
  { id: 'tenses', name: 'Tenses', g: 'today', c: '#0A84FF', heads: ['Tense', '+', '−', '?'], rows: 4, fc: 1, side: ['Present simple', 'Present continuous', 'Past simple', 'Future (will)'] },
  { id: 'mistakes', name: 'Mistakes', g: 'bang', c: '#FF3B30', heads: ['Mistake', 'Correct', 'Why'], rows: 4 },
  { id: 'attend', name: 'Attendance', g: 'users', c: '#00C7BE', heads: ['Name', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ticks: [1, 2, 3, 4, 5], rows: 6, num: 1 },
  { id: 'week', name: 'Timetable', g: 'calendar', c: '#BF5AF2', heads: ['Time', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], rows: 5, fc: 1 },
  { id: 'dead', name: 'Deadlines', g: 'flag', c: '#FF6482', heads: ['Module', 'Task', 'Due', 'Done'], ticks: [3], rows: 4 },
  { id: 'ielts', name: 'IELTS Speaking', g: 'star', c: '#64D2FF', heads: ['Student', 'FC', 'LR', 'GRA', 'P', 'Band'], rows: 5, num: 1, zebra: 1, desc: 'Fluency · Vocabulary · Grammar · Pronunciation' },
];

const cellOf = (n) => {
  if (!n || !ED) return null;
  const e = n.nodeType === 3 ? n.parentElement : n;
  const c = e && e.closest ? e.closest('td, th') : null;
  return c && ED.ed.contains(c) ? c : null;
};
function caretCell() {
  const sel = getSelection();
  return sel.rangeCount ? cellOf(sel.anchorNode) : null;
}
const isTick = (c) => !!c && c.classList.contains('tk');
const newCell = (tag, tick) => {
  const c = document.createElement(tag);
  if (tick) { c.className = 'tk'; c.contentEditable = 'false'; } else c.innerHTML = '<br>';
  return c;
};
const hasHeader = (t) => !!t.rows[0] && !!t.rows[0].cells[0] && t.rows[0].cells[0].tagName === 'TH';
const colCount = (t) => Math.max(...[...t.rows].map((r) => r.cells.length));
// A column is a tick-box column when its (non-header) cells are tick boxes.
const tickCols = (t) => {
  const s = new Set();
  [...t.rows].forEach((r) => [...r.cells].forEach((c, i) => { if (isTick(c)) s.add(i); }));
  return s;
};
function newRow(t) {
  const tr = document.createElement('tr'), ticks = tickCols(t);
  for (let k = 0; k < colCount(t); k++) tr.appendChild(newCell('td', ticks.has(k)));
  return tr;
}
// Put the cursor in a cell (at the end of what's written there).
function caretIn(cell, atStart) {
  const r = document.createRange();
  r.selectNodeContents(cell);
  r.collapse(!!atStart);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  ED.range = r.cloneRange();
  cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
// After changing rows/columns: only the first row is a header (if the table has one) and every
// row has the same number of cells (new cells in a tick column are tick boxes).
function tidyTable(t, header) {
  const n = colCount(t), ticks = tickCols(t);
  [...t.rows].forEach((row, ri) => {
    const head = header && ri === 0;
    [...row.cells].forEach((c) => {
      const want = head ? 'TH' : 'TD', tick = !head && isTick(c);
      if (c.tagName === want && isTick(c) === tick) return;
      const nc = newCell(want.toLowerCase(), tick);
      if (!tick && !isTick(c)) { nc.innerHTML = ''; while (c.firstChild) nc.appendChild(c.firstChild); if (!nc.firstChild) nc.innerHTML = '<br>'; }
      if (tick && c.classList.contains('done')) nc.classList.add('done');
      c.replaceWith(nc);
    });
    while (row.cells.length < n) row.appendChild(newCell(head ? 'th' : 'td', !head && ticks.has(row.cells.length)));
  });
}
// The line right after a table (made if missing), with the cursor in it.
function leaveTable(t) {
  let next = t.nextElementSibling;
  if (!next || /^(TABLE|UL|OL|HR)$/.test(next.tagName) || next.classList.contains('ph')) {
    next = document.createElement('div');
    next.innerHTML = '<br>';
    t.after(next);
  }
  caretAt(next, 0);
}

// ---------- New Table sheet ----------
let TB = null; // { tpl, cols, rows, header, num, zebra, fc, tc, heads, ticks, side }
function tableSheet() {
  restoreSel();
  const li = caretLi(), line = li && unlistLi(li);
  if (line) caretAt(line, line.childNodes.length);
  const sel = getSelection();
  if (sel.rangeCount) ED.range = sel.getRangeAt(0).cloneRange();
  TB = { header: 1, num: 0, zebra: 0, fc: 0 };
  useTemplate(S.settings.tableTpl && TABLE_TPLS.find((x) => x.id === S.settings.tableTpl) || TABLE_TPLS[0]);
  TB.range = ED.range && ED.range.cloneRange();
  openSheet(tableSheetHtml(), mountTableSheet, 'tall');
}
function useTemplate(tp) {
  Object.assign(TB, { tpl: tp.id, cols: tp.heads.length, rows: tp.rows, heads: [...tp.heads], ticks: tp.ticks || [], side: tp.side || [], header: 1, num: tp.num || 0, zebra: tp.zebra || 0, fc: tp.fc || 0, tc: tp.tc || 0 });
}
// The words already written in a row's first cell (Tenses: "Present simple" …).
const sideText = (r, i) => (i === 0 && TB.side[r]) || '';
// A small picture of the table that will be made, drawn with the real table styles. It stays on
// the screen while you change things: switches only change its classes (so stripes, numbers and
// bold fade in and out), and new rows/columns fade in.
const tbPrevRows = () => Math.min(TB.rows, 4);
function tablePreviewBody(oldRows = Infinity, oldCols = Infinity) {
  const shown = tbPrevRows(), inn = (r, i) => (r >= oldRows || i >= oldCols ? ' in' : '');
  let h = `<tr class="hd">${Array.from({ length: TB.cols }, (_, i) => `<th class="${inn(-1, i)}">${esc(TB.heads[i] || '')}</th>`).join('')}</tr>`;
  for (let r = 0; r < shown; r++) h += `<tr>${Array.from({ length: TB.cols }, (_, i) => (TB.ticks.includes(i) ? `<td class="tk${r === 0 ? ' done' : ''}${inn(r, i)}"></td>` : `<td class="${inn(r, i)}">${esc(sideText(r, i))}</td>`)).join('')}</tr>`;
  return h;
}
const tbPrevClass = () => ['num', 'zebra', 'fc', 'tc'].filter((k) => TB[k]).concat(TB.header ? [] : ['nohead']).join(' ');
const tbMoreText = () => (TB.rows > tbPrevRows() ? `+ ${TB.rows - tbPrevRows()} more row${TB.rows - tbPrevRows() > 1 ? 's' : ''}` : '');
function tablePreview() {
  return `<div class="ed tb-prev" aria-hidden="true"><table class="${tbPrevClass()}" data-cols="${TB.cols}" data-rows="${tbPrevRows()}" data-tpl="${TB.tpl}"><tbody>${tablePreviewBody()}</tbody></table></div>
    <div class="tb-more">${tbMoreText()}</div>`;
}
// Change a box's content while its height glides from the old size to the new one.
function smoothHeight(el, change) {
  const h0 = el.getBoundingClientRect().height;
  el.style.height = '';
  el.style.transition = '';
  change();
  const h1 = el.getBoundingClientRect().height;
  if (Math.abs(h1 - h0) < 1 || reduceMotion()) return;
  el.style.height = h0 + 'px';
  void el.offsetHeight;
  el.style.transition = 'height .3s cubic-bezier(.2, .9, .3, 1)';
  el.style.height = h1 + 'px';
  clearTimeout(el._ht);
  el._ht = setTimeout(() => { el.style.height = ''; el.style.transition = ''; }, 320);
}
// Bring the New Table sheet up to date without redrawing it.
function syncTableSheet() {
  const sh = sheet && sheet.sh;
  if (!sh || !TB || !$('.tb-prev', sh)) return;
  $$('.tb-tpl', sh).forEach((b) => b.classList.toggle('on', b.dataset.v === TB.tpl));
  const setStep = (act, v, min, max) => {
    const st = $(`[data-act="${act}"]`, sh).parentElement, num = $('b', st);
    if (num.textContent !== String(v)) { num.textContent = v; num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump'); }
    st.firstElementChild.disabled = v <= min;
    st.lastElementChild.disabled = v >= max;
  };
  setStep('tbs-cols', TB.cols, 1, 6);
  setStep('tbs-rows', TB.rows, 1, 30);
  $$('.switch input[name^="tb-"]', sh).forEach((i) => { const on = !!TB[i.name.slice(3)]; if (i.checked !== on) i.checked = on; });
  const card = $('.tb-prev-card', sh), t = $('.tb-prev table', sh);
  smoothHeight(card, () => {
    t.className = tbPrevClass();
    const oc = +t.dataset.cols, or = +t.dataset.rows, swap = t.dataset.tpl !== TB.tpl;
    if (swap || oc !== TB.cols || or !== tbPrevRows()) {
      t.tBodies[0].innerHTML = swap ? tablePreviewBody() : tablePreviewBody(or, oc);
      Object.assign(t.dataset, { cols: TB.cols, rows: tbPrevRows(), tpl: TB.tpl });
      if (swap) { t.classList.remove('swap'); void t.offsetWidth; t.classList.add('swap'); }
    }
    $('.tb-more', sh).textContent = tbMoreText();
  });
}
const tbStepper = (act, v, min, max) => `<div class="stepper"><button data-act="${act}" data-v="-1" ${v <= min ? 'disabled' : ''} aria-label="Fewer">${glyph('minus')}</button><b>${v}</b><button data-act="${act}" data-v="1" ${v >= max ? 'disabled' : ''} aria-label="More">${glyph('plus')}</button></div>`;
const tbOption = (k, label, g, c, on) => `<div class="frow">${tile(g, c)}<span class="lbl">${label}</span>${toggle('tb-' + k, on, label)}</div>`;
function tableSheetHtml() {
  return `${sheetHead('New Table', '<button data-act="close-sheet">Cancel</button>', '<button class="strong" data-act="tbs-add">Add</button>')}
    <div class="sheet-body">
      <div class="tb-tpls">${TABLE_TPLS.map((tp) => `<button class="tb-tpl ${TB.tpl === tp.id ? 'on' : ''}" data-act="tbs-tpl" data-v="${tp.id}" style="--c:${tp.c}">
        <span class="tb-tpl-ic">${glyph(tp.g)}</span><b>${tp.name}</b><small>${tp.desc || (tp.id === 'blank' ? 'Empty grid' : tp.heads.join(' · '))}</small></button>`).join('')}</div>
      <div class="card tb-prev-card">${tablePreview()}</div>
      <div class="card form">
        <div class="frow">${tile('table', '#8E8E93')}<span class="lbl">Columns</span>${tbStepper('tbs-cols', TB.cols, 1, 6)}</div>
        <div class="frow">${tile('listDash', '#8E8E93')}<span class="lbl">Rows</span>${tbStepper('tbs-rows', TB.rows, 1, 30)}</div>
      </div>
      <div class="card form">
        ${tbOption('header', 'Header row', 'thead', '#FFCC00', TB.header)}
        ${TABLE_OPTS.map(([k, l, g, c]) => tbOption(k, l, g, c, TB[k])).join('')}
      </div>
      <p class="tb-hint">Tip: in the table, Enter jumps to the next cell and adds rows by itself.</p>
    </div>`;
}
function mountTableSheet(sh) {
  const on = $('.tb-tpl.on', sh);
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  sheetOn(sh, 'change', (e) => {
    const k = (e.target.name || '').replace(/^tb-/, '');
    if (!TB || !(k in TB)) return;
    TB[k] = e.target.checked ? 1 : 0;
    syncTableSheet();
  });
}
ACTIONS['tbs-tpl'] = (el) => {
  useTemplate(TABLE_TPLS.find((x) => x.id === el.dataset.v));
  syncTableSheet();
  el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
};
ACTIONS['tbs-cols'] = (el) => {
  TB.cols = clamp(TB.cols + +el.dataset.v, 1, 6);
  TB.ticks = TB.ticks.filter((i) => i < TB.cols);
  syncTableSheet();
};
ACTIONS['tbs-rows'] = (el) => { TB.rows = clamp(TB.rows + +el.dataset.v, 1, 30); syncTableSheet(); };
ACTIONS['tbs-add'] = () => {
  const o = TB;
  closeSheet();
  if (!ED) return;
  S.settings.tableTpl = o.tpl;
  save();
  const t = document.createElement('table'), body = document.createElement('tbody');
  const cls = ['num', 'zebra', 'fc', 'tc'].filter((k) => o[k]);
  if (cls.length) t.className = cls.join(' ');
  t.appendChild(body);
  if (o.header) {
    const tr = document.createElement('tr');
    for (let i = 0; i < o.cols; i++) { const c = newCell('th'); if (o.heads[i]) c.textContent = o.heads[i]; tr.appendChild(c); }
    body.appendChild(tr);
  }
  for (let r = 0; r < o.rows; r++) {
    const tr = document.createElement('tr');
    for (let i = 0; i < o.cols; i++) {
      const c = newCell('td', o.ticks.includes(i));
      if (i === 0 && o.side[r] && !o.ticks.includes(0)) c.textContent = o.side[r];
      tr.appendChild(c);
    }
    body.appendChild(tr);
  }
  ED.ed.focus({ preventScroll: true });
  if (o.range && ED.ed.contains(o.range.startContainer)) ED.range = o.range;
  histNow();
  insertBlock(t);
  // Start typing in the first empty cell (below the header when it's already filled in).
  const first = [...t.querySelectorAll('th, td:not(.tk)')].find((c) => !c.textContent.trim());
  if (first) caretIn(first, true);
  afterCmd();
};

// ---------- Typing in a table ----------
// The next cell you can type in after this one (left to right, then down), or null.
function nextTextCell(cell) {
  const t = cell.closest('table'), all = [...t.querySelectorAll('th, td')];
  return all.slice(all.indexOf(cell) + 1).find((c) => !isTick(c)) || null;
}
// Enter: the next cell to the right, then the next row; at the very end a new row is added.
// Enter in the first cell of an empty last row removes that row and leaves the table.
function cellEnter(cell) {
  const t = cell.closest('table'), rows = [...t.rows], row = cell.parentElement, r = rows.indexOf(row);
  const firstText = [...row.cells].find((c) => !isTick(c));
  const empty = (tr) => ![...tr.cells].some((c) => c.textContent.trim() || c.querySelector('img') || c.classList.contains('done'));
  if (r === rows.length - 1 && r > 0 && cell === firstText && empty(row)) {
    row.remove();
    leaveTable(t);
    afterCmd();
    return;
  }
  const next = nextTextCell(cell);
  if (next) { caretIn(next); return; }
  const nr = newRow(t);
  row.after(nr);
  const c = [...nr.cells].find((x) => !isTick(x));
  if (c) caretIn(c);
  else leaveTable(t);
  afterCmd();
}
// Called from the editor's key handling. Returns true when the table took care of the key.
function tableBeforeInput(ev, me) {
  const sel = getSelection(), cell = caretCell();
  if (ev.inputType === 'insertParagraph' || ev.inputType === 'insertLineBreak') {
    if (!cell) return false;
    if (ev.cancelable) { ev.preventDefault(); histNow(); cellEnter(cell); }
    else me.redoCell = { html: ED.ed.innerHTML, path: pathOf(cell) }; // undone and redone in tableInput
    return true;
  }
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = document.createRange();
  if (cell && (ev.inputType === 'deleteContentBackward' || ev.inputType === 'deleteContentForward')) {
    // Deleting never joins two cells or pulls text out of the table.
    r.selectNodeContents(cell);
    if (ev.inputType === 'deleteContentBackward') r.setEnd(sel.anchorNode, sel.anchorOffset);
    else r.setStart(sel.anchorNode, sel.anchorOffset);
    if (r.toString() === '' && !r.cloneContents().querySelector('img')) { if (ev.cancelable) ev.preventDefault(); return true; }
    return false;
  }
  if (!cell && ev.inputType === 'deleteContentBackward') {
    // Backspace at the start of the line under a table: an empty line goes away and the cursor
    // moves into the table; a line with words stays as it is.
    const block = topBlock(sel.anchorNode), prev = block && block.previousElementSibling;
    if (!prev || prev.tagName !== 'TABLE') return false;
    r.selectNodeContents(block);
    r.setEnd(sel.anchorNode, sel.anchorOffset);
    if (r.toString() !== '') return false;
    if (!ev.cancelable) return true;
    ev.preventDefault();
    if (!block.textContent.trim() && !block.querySelector('img')) { histNow(); block.remove(); afterCmd(); }
    const cells = [...prev.querySelectorAll('th, td')].filter((c) => !isTick(c));
    if (cells.length) caretIn(cells[cells.length - 1]);
    return true;
  }
  return false;
}
function tableInput(me) {
  if (!me.redoCell) return false;
  const { html, path } = me.redoCell;
  me.redoCell = null;
  ED.ed.innerHTML = html;
  prepareEd();
  const cell = nodeAt(path);
  if (cell && /^T[DH]$/.test(cell.tagName)) cellEnter(cell);
  return true;
}

// ---------- The table panel ----------
function tablePanel(open) {
  if (!ED) return;
  const p = $('.tbp', ED.el);
  p.hidden = !open;
  if (open) { const f = $('.fmt', ED.el); f.hidden = true; $('[data-act="ed-fmt"]', ED.el).classList.remove('on'); }
  tableMarks();
  quickHl();
}
ACTIONS['ed-table'] = () => {
  restoreSel();
  if (caretCell()) { tablePanel($('.tbp', ED.el).hidden); return; }
  tableSheet();
};
// Every panel button works on the cell with the cursor: its row, its column, its table.
function tableEdit(fn) {
  restoreSel();
  const cell = caretCell();
  if (!cell) { tablePanel(false); return; }
  const t = cell.closest('table'), row = cell.parentElement;
  const where = { t, cell, row, r: [...t.rows].indexOf(row), i: [...row.cells].indexOf(cell), header: hasHeader(t) };
  const back = fn(where);
  if (back === false) return;
  if (t.isConnected) {
    tidyTable(t, where.header);
    const rows = [...t.rows];
    const [rr, ii] = back || [where.r, where.i];
    const to = rows[Math.min(rr == null ? where.r : rr, rows.length - 1)];
    if (to) {
      const cells = [...to.cells], want = Math.max(0, Math.min(ii, cells.length - 1));
      // Tick boxes can't hold the cursor: use the nearest cell you can type in.
      const c = !isTick(cells[want]) ? cells[want] : cells.slice(want).concat(cells.slice(0, want).reverse()).find((x) => !isTick(x));
      if (c) caretIn(c);
      else leaveTable(t);
    }
  }
  afterCmd();
  tableMarks();
}
ACTIONS['tb-row'] = (el) => tableEdit(({ t, row, r, i, header }) => {
  const v = el.dataset.v;
  if (v === 'del') {
    if (t.rows.length === 1) { removeTable(t); return null; }
    row.remove();
    return [r, i];
  }
  const nr = newRow(t);
  // A new row above the header goes under it instead: the header stays on top.
  if (v === 'above' && !(header && r === 0)) { row.before(nr); return [r, i]; }
  row.after(nr);
  return [r + 1, i];
});
ACTIONS['tb-col'] = (el) => tableEdit(({ t, i, header }) => {
  const v = el.dataset.v;
  if (v === 'del') {
    if (colCount(t) === 1) { removeTable(t); return null; }
    [...t.rows].forEach((row) => { if (row.cells[i]) row.cells[i].remove(); });
    return [null, i];
  }
  if (colCount(t) >= 8) { toast('A table can have up to 8 columns'); return false; }
  const at = v === 'left' ? i : i + 1;
  [...t.rows].forEach((row, ri) => {
    const c = newCell(ri === 0 && header ? 'th' : 'td');
    if (row.cells[at]) row.cells[at].before(c);
    else row.appendChild(c);
  });
  return [null, at];
});
// Turn the cursor's column into tick boxes (or back into text — put the cursor in its header).
ACTIONS['tb-tick'] = async () => {
  restoreSel();
  const cell = caretCell();
  if (!cell) return;
  const t = cell.closest('table'), i = [...cell.parentElement.cells].indexOf(cell);
  const body = [...t.rows].slice(hasHeader(t) ? 1 : 0).map((r) => r.cells[i]).filter(Boolean);
  const ticks = body.some(isTick);
  if (!ticks && body.some((c) => c.textContent.trim())) {
    const ok = await ask({ title: 'Turn this column into tick boxes?', msg: 'The words in this column will be removed. You can Undo it.', ok: 'Tick Boxes' });
    if (!ok || !ED) return;
    restoreSel();
  }
  tableEdit(({ header }) => {
    body.forEach((c) => c.replaceWith(newCell('td', !ticks)));
    if (!header && !ticks) toast('Tip: turn on the header row to name this column');
    return [null, i];
  });
};
// Sort the rows by the cursor's column: A→Z, or Z→A when it's already A→Z. Empty cells go last;
// in a tick column the unticked rows come first.
ACTIONS['tb-sort'] = () => tableEdit(({ t, row, i, header }) => {
  const rows = [...t.rows].slice(header ? 1 : 0);
  const key = (tr) => { const c = tr.cells[i]; if (!c) return ''; return isTick(c) ? (c.classList.contains('done') ? '2' : '1') : c.textContent.trim(); };
  const cmp = (a, b) => {
    const x = key(a), y = key(b);
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
  };
  const asc = rows.every((tr, k) => !k || cmp(rows[k - 1], tr) <= 0);
  let sorted = [...rows].sort(asc ? (a, b) => cmp(b, a) : cmp);
  if (asc) sorted = [...sorted.filter((tr) => key(tr)), ...sorted.filter((tr) => !key(tr))];
  sorted.forEach((tr) => t.tBodies[0].appendChild(tr));
  toast(asc ? 'Sorted Z → A' : 'Sorted A → Z');
  return [[...t.rows].indexOf(row), i];
});
function removeTable(t) {
  const next = t.nextElementSibling;
  t.remove();
  if (next && !/^(TABLE|UL|OL|HR)$/.test(next.tagName)) caretAt(next, 0);
  else caretToEnd(true);
  tablePanel(false);
}
ACTIONS['tb-del'] = () => {
  restoreSel();
  const cell = caretCell();
  if (!cell) return;
  removeTable(cell.closest('table'));
  afterCmd();
  toast('Table deleted — Undo is at the top');
};
// Settings of the table with the cursor: header row, numbers, stripes, bold first column.
ACTIONS['tb-set'] = (el) => tableEdit((w) => {
  const k = el.dataset.v;
  if (k === 'header') w.header = !w.header;
  else w.t.classList.toggle(k);
  if (!w.t.className) w.t.removeAttribute('class');
});

// The cell with the cursor gets a ring; with the panel open its row and column are tinted too,
// so it's clear what "Row" and "Column" will change. Done with a style rule, not by touching the
// note. The panel's switches show the table's settings.
function tableMarks() {
  if (!ED) return;
  let st = $('#tb-marks');
  if (!st) { st = document.createElement('style'); st.id = 'tb-marks'; document.head.appendChild(st); }
  const cell = caretCell(), btn = $('[data-act="ed-table"]', ED.el), p = $('.tbp', ED.el);
  if (btn) btn.classList.toggle('on', !!cell);
  if (!cell) { st.textContent = ''; if (!p.hidden) p.hidden = true; return; }
  const t = cell.closest('table');
  const ti = $$(':scope > table', ED.ed).indexOf(t) + 1, row = cell.parentElement;
  const r = [...t.rows].indexOf(row) + 1, i = [...row.cells].indexOf(cell) + 1;
  const open = !p.hidden;
  if (open) {
    $$('[data-act="tb-set"]', p).forEach((b) => b.classList.toggle('on', b.dataset.v === 'header' ? hasHeader(t) : t.classList.contains(b.dataset.v)));
    const tickCol = [...t.rows].some((tr) => isTick(tr.cells[i - 1]));
    $('[data-act="tb-tick"]', p).classList.toggle('on', tickCol);
  }
  if (ti < 1) { st.textContent = ''; return; }
  const T = `.screen .ed > table:nth-of-type(${ti})`;
  st.textContent = `${T} tr:nth-child(${r}) > :nth-child(${i}) { box-shadow: inset 0 0 0 2px var(--tint); }`
    + (open ? `${T} tr:nth-child(${r}) > *, ${T} tr > :nth-child(${i}) { background-color: color-mix(in srgb, var(--tint) 12%, var(--paper)); }` : '');
}
document.addEventListener('selectionchange', () => {
  if (!ED) return;
  const sel = getSelection();
  if (sel.rangeCount && ED.ed.contains(sel.anchorNode)) tableMarks();
});
