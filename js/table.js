'use strict';
/* Tables in notes. A table is a normal part of the note: tap a cell and type. Enter goes to the
   next cell (and makes a new row at the end); Enter on an empty last row leaves the table. The
   table button opens the table panel for rows, columns, the header row and sorting.
   The first row is the header when its cells are <th>. */

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
const newCell = (tag) => { const c = document.createElement(tag); c.innerHTML = '<br>'; return c; };
const hasHeader = (t) => !!t.rows[0] && t.rows[0].cells[0] && t.rows[0].cells[0].tagName === 'TH';
const colCount = (t) => Math.max(...[...t.rows].map((r) => r.cells.length));
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
// After changing rows/columns: only the first row is a header (if the table has one), and
// every row has the same number of cells.
function tidyTable(t, header) {
  const n = colCount(t);
  [...t.rows].forEach((row, ri) => {
    const want = header && ri === 0 ? 'TH' : 'TD';
    [...row.cells].forEach((c) => {
      if (c.tagName === want) return;
      const nc = document.createElement(want);
      while (c.firstChild) nc.appendChild(c.firstChild);
      if (!nc.firstChild) nc.innerHTML = '<br>';
      c.replaceWith(nc);
    });
    while (row.cells.length < n) row.appendChild(newCell(want.toLowerCase()));
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

// ---------- Making a table ----------
function insertTable() {
  const li = caretLi(), line = li && unlistLi(li);
  if (line) caretAt(line, line.childNodes.length);
  const sel = getSelection();
  if (sel.rangeCount) ED.range = sel.getRangeAt(0).cloneRange();
  const t = document.createElement('table'), body = document.createElement('tbody');
  t.appendChild(body);
  for (let r = 0; r < 3; r++) {
    const row = document.createElement('tr');
    for (let c = 0; c < 2; c++) row.appendChild(newCell(r === 0 ? 'th' : 'td'));
    body.appendChild(row);
  }
  insertBlock(t);
  caretIn(t.rows[0].cells[0], true);
  afterCmd();
  if (!S.settings.tableTip) {
    S.settings.tableTip = 1;
    save();
    toast('Enter jumps to the next cell. The table button adds rows and columns.');
  }
}

// ---------- Typing in a table ----------
// Enter: the next cell to the right, then the next row; at the very end a new row is added.
// Enter in the first cell of an empty last row removes that row and leaves the table.
function cellEnter(cell) {
  const t = cell.closest('table'), rows = [...t.rows];
  const row = cell.parentElement, r = rows.indexOf(row), i = [...row.cells].indexOf(cell);
  const empty = (tr) => ![...tr.cells].some((c) => c.textContent.trim() || c.querySelector('img'));
  if (r === rows.length - 1 && r > 0 && i === 0 && empty(row)) {
    row.remove();
    leaveTable(t);
    afterCmd();
    return;
  }
  if (i < row.cells.length - 1) { caretIn(row.cells[i + 1]); return; }
  if (r < rows.length - 1) { caretIn(rows[r + 1].cells[0]); return; }
  const nr = document.createElement('tr');
  for (let k = 0; k < colCount(t); k++) nr.appendChild(newCell('td'));
  row.after(nr);
  caretIn(nr.cells[0]);
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
    const last = prev.rows[prev.rows.length - 1];
    caretIn(last.cells[last.cells.length - 1]);
    return true;
  }
  return false;
}
function tableInput(me) {
  if (!me.redoCell) return false;
  const { html, path } = me.redoCell;
  me.redoCell = null;
  ED.ed.innerHTML = html;
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
  insertTable();
};
ACTIONS['tb-close'] = () => tablePanel(false);
// Every panel button works on the cell with the cursor: its row, its column, its table.
function tableEdit(fn) {
  restoreSel();
  const cell = caretCell();
  if (!cell) { tablePanel(false); return; }
  const t = cell.closest('table'), row = cell.parentElement;
  const where = { t, row, r: [...t.rows].indexOf(row), i: [...row.cells].indexOf(cell), header: hasHeader(t) };
  const back = fn(where);
  if (t.isConnected) {
    tidyTable(t, where.header);
    const rows = [...t.rows];
    const [rr, ii] = back || [where.r, where.i];
    const to = rows[Math.min(rr == null ? where.r : rr, rows.length - 1)];
    if (to) caretIn(to.cells[Math.max(0, Math.min(ii, to.cells.length - 1))]);
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
  const nr = document.createElement('tr');
  for (let k = 0; k < colCount(t); k++) nr.appendChild(newCell('td'));
  // A new row above the header goes under it instead: the header stays on top.
  if (v === 'above' && !(header && r === 0)) { row.before(nr); return [r, i]; }
  row.after(nr);
  return [r + 1, i];
});
ACTIONS['tb-col'] = (el) => tableEdit(({ t, i }) => {
  const v = el.dataset.v;
  if (v === 'del') {
    if (colCount(t) === 1) { removeTable(t); return null; }
    [...t.rows].forEach((row) => { if (row.cells[i]) row.cells[i].remove(); });
    return [null, i];
  }
  const at = v === 'left' ? i : i + 1;
  [...t.rows].forEach((row, ri) => {
    const c = newCell(ri === 0 && hasHeader(t) ? 'th' : 'td');
    if (row.cells[at]) row.cells[at].before(c);
    else row.appendChild(c);
  });
  return [null, at];
});
ACTIONS['tb-head'] = () => tableEdit((w) => { w.header = !w.header; });
// Sort the rows by the cursor's column: A→Z, or Z→A when it's already A→Z. Empty cells go last.
ACTIONS['tb-sort'] = () => tableEdit(({ t, row, i, header }) => {
  const rows = [...t.rows].slice(header ? 1 : 0);
  const key = (tr) => (tr.cells[i] ? tr.cells[i].textContent.trim() : '');
  const cmp = (a, b) => {
    const x = key(a), y = key(b);
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
  };
  const asc = rows.every((tr, k) => !k || cmp(rows[k - 1], tr) <= 0);
  const sorted = [...rows].sort(asc ? (a, b) => cmp(b, a) || 0 : cmp);
  if (asc) { // keep empty rows at the bottom when reversing too
    const filled = sorted.filter((tr) => key(tr)), blank = sorted.filter((tr) => !key(tr));
    sorted.length = 0;
    sorted.push(...filled, ...blank);
  }
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

// The cell with the cursor gets a ring; with the panel open its row and column are tinted too,
// so it's clear what "Row" and "Column" will change. Done with a style rule, not by touching the note.
function tableMarks() {
  if (!ED) return;
  let st = $('#tb-marks');
  if (!st) { st = document.createElement('style'); st.id = 'tb-marks'; document.head.appendChild(st); }
  const cell = caretCell(), btn = $('[data-act="ed-table"]', ED.el);
  if (btn) btn.classList.toggle('on', !!cell);
  if (!cell) { st.textContent = ''; if (!$('.tbp', ED.el).hidden) $('.tbp', ED.el).hidden = true; return; }
  const t = cell.closest('table');
  const ti = $$(':scope > table', ED.ed).indexOf(t) + 1, row = cell.parentElement;
  const r = [...t.rows].indexOf(row) + 1, i = [...row.cells].indexOf(cell) + 1;
  if (ti < 1) { st.textContent = ''; return; }
  const T = `.ed > table:nth-of-type(${ti})`;
  const open = !$('.tbp', ED.el).hidden;
  const hb = $('[data-act="tb-head"]', ED.el);
  if (hb) hb.classList.toggle('on', hasHeader(t));
  st.textContent = `${T} tr:nth-child(${r}) > :nth-child(${i}) { box-shadow: inset 0 0 0 2px var(--tint); }`
    + (open ? `${T} tr:nth-child(${r}) > *, ${T} tr > :nth-child(${i}) { background-color: color-mix(in srgb, var(--tint) 10%, transparent); }` : '');
}
document.addEventListener('selectionchange', () => {
  if (!ED) return;
  const sel = getSelection();
  if (sel.rangeCount && ED.ed.contains(sel.anchorNode)) tableMarks();
});
