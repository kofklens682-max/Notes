'use strict';
/* The note editor: rich text (title/heading/body, bold…, lists, highlights, quotes, dividers),
   checklists, photos and voice typing, with its own undo/redo. The first line of a note is its
   title. Saves itself as you type. */

let ED = null; // { el, ed, id, range, t, dirty, wasFocused }

// ---------- Cleaning & reading note HTML ----------
const KEEP_TAGS = new Set(['DIV', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'IMG', 'MARK', 'BLOCKQUOTE', 'HR', 'TABLE', 'TBODY', 'TR', 'TH', 'TD']);
// Highlight colours (class hl-…): yellow, green, blue, pink, purple.
const HL = ['y', 'g', 'b', 'p', 'v'];
const HL_NAMES = { y: 'Yellow', g: 'Green', b: 'Blue', p: 'Pink', v: 'Purple' };
const hlSwatches = () => fmtBtn('ed-hl', '', '<i class="hl-none"></i>', 'No highlight') + HL.map((c) => fmtBtn('ed-hl', c, `<i class="hl-${c}">Aa</i>`, HL_NAMES[c] + ' highlight')).join('');
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TEMPLATE', 'SVG', 'MATH', 'NOSCRIPT', 'CANVAS', 'VIDEO', 'AUDIO', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'FORM', 'TITLE', 'HEAD']);
const parseBody = (html) => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html').body;
// Only simple formatting survives: no styles, links, scripts or outside images. Cleans in place.
function cleanBody(body) {
  const walk = (node) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) continue;
      if (ch.nodeType !== 1) { ch.remove(); continue; }
      const tag = ch.tagName.toUpperCase();
      if (DROP_TAGS.has(tag)) { ch.remove(); continue; }
      walk(ch);
      if (!KEEP_TAGS.has(tag)) { ch.replaceWith(...ch.childNodes); continue; }
      const keep = [];
      if (tag === 'UL' && ch.classList.contains('cl')) keep.push(['class', 'cl']);
      if (tag === 'LI' && ch.classList.contains('done')) keep.push(['class', 'done']);
      if (tag === 'DIV' && ch.classList.contains('ph')) {
        // a photo or drawing (dr): fl/fr = at the side with text next to it, data-w = its width (% of the note)
        const dr = ch.classList.contains('dr'), side = ['fl', 'fr'].find((x) => ch.classList.contains(x));
        keep.push(['class', `ph${dr ? ' dr' : ''}${side ? ' ' + side : ''}`]);
        const w = +ch.getAttribute('data-w');
        if (w >= 15 && w <= 100) keep.push(['data-w', String(Math.round(w))]);
      }
      if (tag === 'TABLE') { const c = ['num', 'zebra', 'fc', 'tc'].filter((x) => ch.classList.contains(x)).join(' '); if (c) keep.push(['class', c]); }
      if (tag === 'TD' && ch.classList.contains('tk')) keep.push(['class', ch.classList.contains('done') ? 'tk done' : 'tk']);
      if (tag === 'MARK') keep.push(['class', HL.map((c) => 'hl-' + c).find((c) => ch.classList.contains(c)) || 'hl-y']);
      if (tag === 'IMG') {
        const id = ch.getAttribute('data-blob') || '';
        if (!/^[a-z0-9]{4,40}$/i.test(id)) { ch.remove(); continue; }
        keep.push(['data-blob', id]);
        const vec = ch.getAttribute('data-vec') || ''; // a drawing's parts (see draw.js)
        if (/^[a-z0-9]{4,40}$/i.test(vec)) keep.push(['data-vec', vec]);
      }
      for (const a of [...ch.attributes]) ch.removeAttribute(a.name);
      for (const [k, v] of keep) ch.setAttribute(k, v);
    }
  };
  walk(body);
  $$('div.ph', body).forEach((p) => { if (!p.querySelector('img')) p.remove(); });
  $$('img', body).forEach((img) => {
    if (img.parentElement.classList.contains('ph') && img.parentElement.children.length === 1) return;
    const ph = document.createElement('div');
    ph.className = 'ph';
    img.replaceWith(ph);
    ph.appendChild(img);
  });
  return body;
}
const cleanHtml = (html) => cleanBody(parseBody(html || '')).innerHTML;
// Title (first line), preview (the rest), plain text for search, and the photos used.
// Changes the body it's given.
function infoOf(body) {
  // Pictures first (a card shows the first one), then drawings' parts — all kept and locked with the note.
  const blobs = $$('img[data-blob]', body).map((i) => i.getAttribute('data-blob')).concat($$('img[data-vec]', body).map((i) => i.getAttribute('data-vec')));
  $$('br', body).forEach((b) => b.replaceWith('\n'));
  $$('div, p, h1, h2, h3, li, blockquote, td, th', body).forEach((b) => b.append('\n'));
  const lines = body.textContent.replace(/ /g, ' ').split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { title: (lines[0] || '').slice(0, 120), preview: lines.slice(1).join(' ').slice(0, 160), text: lines.join('\n'), blobs };
}
const noteInfo = (html) => infoOf(parseBody(html));
// The editor's content, cleaned, plus its title/preview/text — read in one pass.
function readEditor(ed) {
  const body = cleanBody(parseBody(ed.innerHTML));
  const html = body.innerHTML;
  return { html, info: infoOf(body) };
}

// ---------- Screen ----------
function editorBackLabel() {
  const st = UI.stacks.notes, prev = st[st.length - 2];
  return prev && prev.s === 'folders' && prev.folder && prev.folder !== 'all' ? folderName(prev.folder) : 'Notes';
}
function fullDate(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${hm(ms)}`;
}
const fmtBtn = (act, v, inner, label) => `<button data-act="${act}" data-v="${v}" aria-label="${label}">${inner}</button>`;
SCREENS.note = {
  bar: false, plain: true, keep: true,
  render(e) {
    const n = noteOf(e.id);
    const right = `<span class="undo-btns">${navBtn('ed-undo', 'undo', 'Undo', 'disabled')}${navBtn('ed-redo', 'redo', 'Redo', 'disabled')}</span><button class="ntext done-btn" data-act="ed-done">Done</button>${navBtn('note-menu', 'more', 'More')}`;
    const body = `<div class="ed-date">${n ? `${n.locked ? glyph('lock', 'inl') : ''}${fullDate(n.edited)}` : ''}</div>
      <div class="ed" contenteditable="true" spellcheck="true" autocapitalize="sentences" role="textbox" aria-multiline="true" aria-label="Note"></div>`;
    const after = `
      <div class="voice" hidden><span class="v-dot"></span><span class="v-text">Listening…</span><button class="v-lang" data-act="ed-voice-lang"></button><button class="v-stop" data-act="ed-mic">Stop</button></div>
      <div class="fmt" hidden>
        <div class="fmt-styles">
          ${fmtBtn('ed-block', 'h1', 'Title', 'Title')}${fmtBtn('ed-block', 'h2', 'Heading', 'Heading')}${fmtBtn('ed-block', 'h3', 'Subheading', 'Subheading')}${fmtBtn('ed-block', 'div', 'Body', 'Body')}
        </div>
        <div class="fmt-row">
          <div class="fmt-group">${fmtBtn('ed-cmd', 'bold', '<b>B</b>', 'Bold')}${fmtBtn('ed-cmd', 'italic', '<i>I</i>', 'Italic')}${fmtBtn('ed-cmd', 'underline', '<u>U</u>', 'Underline')}${fmtBtn('ed-cmd', 'strikeThrough', '<s>S</s>', 'Strikethrough')}</div>
          <div class="fmt-group">${fmtBtn('ed-list', 'ul', glyph('listBullet'), 'Bulleted list')}${fmtBtn('ed-list', 'ol', glyph('listNum'), 'Numbered list')}${fmtBtn('ed-cmd', 'outdent', glyph('outdent'), 'Outdent')}${fmtBtn('ed-cmd', 'indent', glyph('indent'), 'Indent')}</div>
        </div>
        <div class="fmt-row">
          <div class="fmt-group fmt-hl hlsw">${hlSwatches()}</div>
          <div class="fmt-group fmt-blk">${fmtBtn('ed-quote', 'q', glyph('quote'), 'Quote')}${fmtBtn('ed-hr', 'hr', glyph('divider'), 'Divider line')}</div>
        </div>
      </div>
      <div class="hlq hlsw" hidden>${hlSwatches()}</div>
      <div class="tbp" hidden>
        <div class="tbp-row"><span class="tbp-l">Row</span><div class="fmt-group">${fmtBtn('tb-row', 'above', `${glyph('plus')}Above`, 'Add a row above')}${fmtBtn('tb-row', 'below', `${glyph('plus')}Below`, 'Add a row below')}${fmtBtn('tb-row', 'del', `${glyph('minus')}Delete`, 'Delete this row')}</div></div>
        <div class="tbp-row"><span class="tbp-l">Column</span><div class="fmt-group">${fmtBtn('tb-col', 'left', `${glyph('plus')}Left`, 'Add a column on the left')}${fmtBtn('tb-col', 'right', `${glyph('plus')}Right`, 'Add a column on the right')}${fmtBtn('tb-tick', 't', `${glyph('check')}Ticks`, 'Tick boxes in this column')}${fmtBtn('tb-col', 'del', `${glyph('minus')}Delete`, 'Delete this column')}</div></div>
        <div class="tbp-row"><span class="tbp-l">Table</span><div class="fmt-group tbp-sets">${fmtBtn('tb-set', 'header', 'Header', 'Header row')}${fmtBtn('tb-set', 'num', 'Numbers', 'Number the rows')}${fmtBtn('tb-set', 'zebra', 'Stripes', 'Striped rows')}${fmtBtn('tb-set', 'fc', 'Bold 1st', 'Bold first column')}</div></div>
        <div class="tbp-row"><span class="tbp-l"></span><div class="fmt-group">${fmtBtn('tb-sort', 's', `${glyph('sort')}Sort A–Z`, 'Sort the rows by this column')}${fmtBtn('tb-del', 'x', `${glyph('trash')}Delete table`, 'Delete the table')}</div></div>
      </div>
      <div class="ed-bar">
        <button data-act="ed-fmt" class="ed-style" aria-label="Text style"><span class="aa">Aa</span><span class="st-name">Body</span></button>
        <button data-act="ed-check" aria-label="Checklist">${glyph('checklist')}</button>
        <button data-act="ed-table" aria-label="Table">${glyph('table')}</button>
        <button data-act="ed-photo" aria-label="Add photo">${glyph('camera')}</button>
        <button data-act="ed-draw" aria-label="Draw">${glyph('draw')}</button>
        <button data-act="ed-mic" aria-label="Voice typing">${glyph('mic')}</button>
        <button data-act="ed-new" aria-label="New note">${glyph('compose')}</button>
      </div>`;
    return page({ title: '', back: editorBackLabel(), right, body, big: false, after });
  },
  mount(el, e) { mountEditor(el, e); },
  hide() { stopVoice(); hideDrawBox(); saveEditor(); },
  leave(e) {
    hideDrawBox();
    const n = noteOf(e.id);
    if (n && !n.locked && !n.title && !n.blobs.length) { S.notes = S.notes.filter((x) => x !== n); save(); }
    ED = null;
  },
};

function mountEditor(el, e) {
  const n = noteOf(e.id);
  const ed = $('.ed', el);
  ED = { el, ed, id: e.id, range: null, t: 0, dirty: false, wasFocused: false, hist: [], hi: -1, ht: 0 };
  const me = ED;
  // Keep the keyboard open (and the selection) when tapping the toolbars.
  $$('.ed-bar, .fmt, .hlq, .tbp, .voice, .nav', el).forEach((b) => b.addEventListener('mousedown', (ev) => { if (!ev.target.closest('input')) ev.preventDefault(); }));
  ed.addEventListener('input', () => { queueSave(); histSoon(); hideDrawBox(); });
  ed.addEventListener('focus', () => el.classList.add('editing'));
  ed.addEventListener('blur', () => { el.classList.remove('editing'); saveEditor(); });
  ed.addEventListener('paste', (ev) => {
    ev.preventDefault();
    const text = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  ed.addEventListener('beforeinput', (ev) => {
    if (tableBeforeInput(ev, me)) return;
    // A new line keeps the style you were writing in (Heading, Subheading); after the Title it
    // becomes a Heading. The phone would otherwise switch back to Body. Change it with Aa.
    if (ev.inputType === 'insertParagraph') { me.keepTag = caretStyle(); me.atStart = atLineStart(); }
    // Backspace at the start of a checklist/bullet/number line removes only the circle (or
    // bullet) and keeps the words. Some keyboards don't let us stop the normal Backspace; then
    // it's undone right after (see 'input').
    if (ev.inputType === 'deleteContentBackward') {
      // Backspace at the start of the line after a drawing doesn't delete the drawing: it picks it
      // up (its bar has Delete); a second Backspace then deletes it.
      const ph = phBeforeCaret();
      if (ph && ev.cancelable) {
        ev.preventDefault();
        if (DBX && DBX.ph === ph) deleteDrawing(ph);
        else showDrawBox(ph);
        return;
      }
      const li = liAtStart();
      if (!li) return;
      if (ev.cancelable) { ev.preventDefault(); histNow(); unlistAtCaret(li); afterCmd(); return; }
      me.redoUnlist = { html: ed.innerHTML, path: pathOf(li) };
    }
  });
  ed.addEventListener('input', (ev) => {
    if (tableInput(me)) return;
    if (me.redoUnlist) {
      const { html, path } = me.redoUnlist;
      me.redoUnlist = null;
      ed.innerHTML = html;
      const li = nodeAt(path);
      if (li && li.tagName === 'LI') { unlistAtCaret(li); afterCmd(); }
      return;
    }
    if (ev.inputType === 'insertParagraph') {
      const tag = me.keepTag;
      me.keepTag = null;
      const li = caretLi();
      if (li && !li.textContent.trim()) li.classList.remove('done'); // a new checklist line starts unticked
      const want = tag === 'h1' ? 'h2' : tag;
      // Enter at the start of a line only pushes it down: both lines keep their style.
      if (/^h[1-3]$/.test(want) && caretStyle() !== want && !li && !me.atStart) { document.execCommand('formatBlock', false, want); afterCmd(); }
      return;
    }
    if (ev.inputType === 'insertText' && / $/.test(ev.data || '')) quickList();
    // An emptied note starts again with a Title.
    if (!ed.textContent.trim() && !ed.querySelector('img, hr, li, h1, table')) {
      ed.innerHTML = '<h1><br></h1>';
      caretAt(ed.firstChild, 0);
      styleLabel();
    }
  });
  ed.addEventListener('pointerdown', (ev) => {
    if (checkboxHit(ev)) { ED.wasFocused = document.activeElement === ed; ev.preventDefault(); }
  });
  ed.addEventListener('click', (ev) => {
    const li = checkboxHit(ev);
    if (li) {
      ev.preventDefault();
      li.classList.toggle('done');
      buzz();
      queueSave();
      histNow();
      if (!ED.wasFocused) ed.blur();
      return;
    }
    const img = ev.target.closest('.ph img');
    if (img && img.closest('.dr') && img.dataset.vec) drawingTap(img);
    else if (img) photoTap(img);
  });
  const load = (html) => {
    if (ED !== me) return;
    ed.innerHTML = cleanHtml(html) || '<h1><br></h1>';
    prepareEd();
    histNow();
    if (e.fresh) {
      delete e.fresh;
      ed.focus();
      const r = document.createRange();
      r.setStart(ed.firstChild, 0);
      r.collapse(true);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };
  if (!n) { load(''); return; }
  if (!bodiesLoaded && !e.fresh) { wakeBodies(); bodiesReady.then(() => { if (ED === me) openBody(n, load); }); return; }
  openBody(n, load);
}
function openBody(n, load) {
  if (n.locked) {
    if (!LOCK.key) { setTimeout(() => pop(), 0); return; }
    decText(LOCK.key, n.enc).then(load, () => { toast("Couldn't open this note"); pop(); });
  } else load(n.html);
}
// Photos can't be typed into; fill in their pictures.
function prepareEd() {
  $$('.ph, td.tk', ED.ed).forEach((p) => { p.contentEditable = 'false'; });
  fitTables(ED.ed);
  $$('.ph img', ED.ed).forEach(async (img) => {
    sizeDrawing(img);
    if (img.src) return;
    const url = await photoUrl(img.dataset.blob);
    if (url) img.src = url;
  });
}
document.addEventListener('selectionchange', () => {
  if (!ED) return;
  const sel = getSelection();
  if (sel.rangeCount && ED.ed.contains(sel.anchorNode)) {
    ED.range = sel.getRangeAt(0).cloneRange();
    if (!$('.fmt', ED.el).hidden) updateFmt();
  }
});
function queueSave() {
  if (!ED) return;
  ED.dirty = true;
  clearTimeout(ED.t);
  ED.t = setTimeout(saveEditor, 600);
}
async function saveEditor() {
  if (!ED || !ED.dirty) return;
  const me = ED;
  clearTimeout(me.t);
  me.dirty = false;
  const n = noteOf(me.id);
  if (!n) return;
  const { html, info } = readEditor(me.ed);
  n.title = info.title;
  n.blobs = info.blobs;
  n.edited = Date.now();
  if (n.locked) {
    if (!LOCK.key) return;
    n.enc = await encText(LOCK.key, html);
    n.html = ''; n.preview = ''; n.text = '';
  } else {
    n.html = html; n.preview = info.preview; n.text = info.text;
  }
  save(n);
  const d = $('.ed-date', me.el);
  if (d) d.innerHTML = `${n.locked ? glyph('lock', 'inl') : ''}${fullDate(n.edited)}`;
}
// The note's current HTML (saving first).
async function editorHtml() {
  await saveEditor();
  return readEditor(ED.ed).html;
}

// ---------- Selection helpers ----------
function restoreSel() {
  const ed = ED.ed;
  if (document.activeElement !== ed) ed.focus({ preventScroll: true });
  const sel = getSelection();
  if (ED.range && ed.contains(ED.range.startContainer)) { sel.removeAllRanges(); sel.addRange(ED.range); }
  else if (!sel.rangeCount || !ed.contains(sel.anchorNode)) caretToEnd(true);
  histNow();
}
function caretToEnd(focus) {
  const ed = ED.ed;
  let last = ed.lastElementChild;
  if (!last || last.classList.contains('ph')) { last = document.createElement('div'); last.innerHTML = '<br>'; ed.appendChild(last); }
  const r = document.createRange();
  r.selectNodeContents(last);
  r.collapse(false);
  ED.range = r.cloneRange();
  if (focus) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
}
const topBlock = (node) => {
  while (node && node.parentNode !== ED.ed) node = node.parentNode;
  return node && node.parentNode === ED.ed ? node : null;
};
function caretLi() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  let n = sel.anchorNode;
  if (n && n.nodeType === 3) n = n.parentNode;
  const li = n && n.closest ? n.closest('li') : null;
  return li && ED.ed.contains(li) ? li : null;
}
function checkboxHit(ev) {
  const tk = ev.target.closest && ev.target.closest('td.tk'); // a tick box in a table
  if (tk && ED.ed.contains(tk)) return tk;
  const li = ev.target.closest && ev.target.closest('li');
  if (!li || !ED.ed.contains(li) || !li.parentElement.classList.contains('cl')) return null;
  const x = ev.clientX - li.getBoundingClientRect().left;
  return x >= -6 && x < 32 ? li : null;
}
// The phone sometimes wraps a new list in an extra line box; unwrap it so each list is a line of its own.
function liftLists() {
  const sel = getSelection();
  const keep = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
  let moved = false;
  for (const d of $$(':scope > div', ED.ed)) {
    const els = [...d.children].filter((c) => c.tagName !== 'BR');
    if (els.length !== 1 || !/^(UL|OL)$/.test(els[0].tagName) || d.textContent.trim() !== els[0].textContent.trim()) continue;
    d.replaceWith(els[0]);
    moved = true;
  }
  if (moved && keep && ED.ed.contains(keep[0])) { try { sel.setBaseAndExtent(...keep); } catch (e) { /* ignore */ } }
}
function afterCmd() {
  liftLists();
  prepareEd();
  queueSave();
  histNow();
  updateFmt();
  styleLabel();
  const sel = getSelection();
  if (sel.rangeCount && ED.ed.contains(sel.anchorNode)) ED.range = sel.getRangeAt(0).cloneRange();
}
// The style of the line the cursor is on: 'h1' Title, 'h2' Heading, 'h3' Subheading, 'blockquote', 'div' Body.
function caretStyle() {
  if (!ED) return 'div';
  const sel = getSelection();
  let n = sel.rangeCount ? sel.anchorNode : null;
  while (n && n !== ED.ed) {
    if (n.nodeType === 1 && /^(H[1-3]|BLOCKQUOTE)$/.test(n.tagName)) return n.tagName.toLowerCase();
    n = n.parentNode;
  }
  return 'div';
}
const STYLE_NAMES = { h1: 'Title', h2: 'Heading', h3: 'Subheading', blockquote: 'Quote', div: 'Body' };

// ---------- List lines ----------
const caretAt = (node, off) => {
  const r = document.createRange();
  r.setStart(node, off);
  r.collapse(true);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  ED.range = r.cloneRange();
};
// Is the cursor at the very start of its line (with words after it)?
function atLineStart() {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const b = caretLi() || topBlock(sel.anchorNode);
  if (!b || !b.textContent.trim()) return false;
  const r = document.createRange();
  r.selectNodeContents(b);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  return r.toString() === '';
}
// The list line whose very start the cursor is at (for Backspace), or null.
function liAtStart() {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return null;
  const li = caretLi();
  if (!li) return null;
  const r = document.createRange();
  r.selectNodeContents(li);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  return r.toString() === '' && !r.cloneContents().querySelector('img') ? li : null;
}
// The drawing or photo just before the cursor's line, when the cursor is at the very start of that line.
function phBeforeCaret() {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed || caretLi()) return null;
  const block = topBlock(sel.anchorNode), prev = block && block.previousElementSibling;
  if (!prev || !prev.classList.contains('ph')) return null;
  const r = document.createRange();
  r.selectNodeContents(block);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  return r.toString() === '' && !r.cloneContents().querySelector('img') ? prev : null;
}
// Is this list line indented (inside another list)?
const indented = (li) => !!li.parentElement.parentElement.closest('ul, ol, li');
// Take one line out of its list — the words stay, the circle/bullet/number goes. The list is
// split around it. An indented line is first moved all the way left. Returns the new line.
function unlistLi(li, tag = 'div') {
  for (let i = 0; i < 4 && indented(li); i++) {
    caretAt(li, 0);
    document.execCommand('outdent', false, null);
    li = caretLi();
    if (!li) return null;
  }
  const list = li.parentElement;
  const line = document.createElement(tag);
  while (li.firstChild) line.appendChild(li.firstChild);
  $$('h1, h2, h3, div, p, blockquote', line).forEach((x) => x.replaceWith(...x.childNodes));
  if (!line.textContent && !line.querySelector('br')) line.innerHTML = '<br>';
  const rest = document.createElement(list.tagName);
  if (list.className) rest.className = list.className;
  while (li.nextSibling) rest.appendChild(li.nextSibling);
  li.remove();
  list.after(line);
  if (rest.childNodes.length) line.after(rest);
  if (!list.children.length) list.remove();
  return line;
}
// Backspace at the start of a list line: an indented line moves one step left, otherwise it
// leaves the list.
function unlistAtCaret(li) {
  if (indented(li)) { caretAt(li, 0); document.execCommand('outdent', false, null); return; }
  const line = unlistLi(li);
  if (line) caretAt(line, 0);
}
// The list lines touched by the selection (not the ones inside another list line).
function selectedLis() {
  const sel = getSelection();
  if (!sel.rangeCount) return [];
  const r = sel.getRangeAt(0), one = caretLi();
  if (r.collapsed) return one ? [one] : [];
  return $$('li', ED.ed).filter((li) => r.intersectsNode(li) && !li.parentElement.closest('li'));
}
// Turn the selected list lines into ordinary lines of the given style, keeping the cursor where it was.
function unlistSelected(tag) {
  const sel = getSelection(), r = sel.getRangeAt(0);
  const a = [r.startContainer, r.startOffset], b = [r.endContainer, r.endOffset];
  selectedLis().forEach((li) => unlistLi(li, tag));
  try {
    const nr = document.createRange();
    nr.setStart(a[0], a[1]);
    nr.setEnd(b[0], b[1]);
    sel.removeAllRanges();
    sel.addRange(nr);
  } catch (e) { /* the cursor's line moved; leave it */ }
}
// Typing "- ", "1. " or "[] " at the start of a line turns it into a list / numbered list / checklist.
const QUICK_LISTS = { '- ': 'ul', '* ': 'ul', '• ': 'ul', '1. ': 'ol', '[] ': 'cl', '[ ] ': 'cl' };
function quickList() {
  const sel = getSelection();
  if (!sel.rangeCount || caretLi()) return;
  const block = topBlock(sel.anchorNode);
  if (!block || !/^(DIV|P)$/.test(block.tagName) || block.classList.contains('ph')) return;
  const r = document.createRange();
  r.selectNodeContents(block);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  const kind = QUICK_LISTS[r.toString().replace(/ /g, ' ')];
  if (!kind) return;
  r.deleteContents();
  if (!block.textContent && !block.querySelector('br')) block.innerHTML = '<br>';
  caretAt(block, 0);
  document.execCommand(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList', false, null);
  if (kind === 'cl') { const li = caretLi(); if (li) li.parentElement.classList.add('cl'); }
  afterCmd();
}

// ---------- Undo / redo ----------
// Our own history of the note (the phone's undo can't follow the toolbar's changes): one step per
// pause in typing, and one per button.
const pathOf = (node) => {
  const p = [];
  while (node && node !== ED.ed) {
    if (!node.parentNode) return null;
    p.unshift([...node.parentNode.childNodes].indexOf(node));
    node = node.parentNode;
  }
  return node ? p : null;
};
const nodeAt = (p) => (p || []).reduce((n, i) => n && n.childNodes[i], ED.ed);
function histSoon() {
  if (!ED) return;
  clearTimeout(ED.ht);
  ED.ht = setTimeout(histNow, 700);
}
function histNow() {
  if (!ED) return;
  clearTimeout(ED.ht);
  const html = ED.ed.innerHTML, top = ED.hist[ED.hi];
  const sel = getSelection();
  const where = sel.rangeCount && ED.ed.contains(sel.focusNode) ? { p: pathOf(sel.focusNode), o: sel.focusOffset } : null;
  if (top && top.html === html) { if (where) top.where = where; return; }
  ED.hist.length = ED.hi + 1;
  ED.hist.push({ html, where });
  if (ED.hist.length > 150) ED.hist.shift();
  ED.hi = ED.hist.length - 1;
  undoButtons();
}
function histGo(step) {
  histNow();
  const i = ED.hi + step, h = ED.hist[i];
  if (!h) return;
  hideDrawBox();
  ED.hi = i;
  ED.ed.innerHTML = h.html;
  prepareEd();
  const n = h.where && nodeAt(h.where.p);
  if (n) { try { caretAt(n, Math.min(h.where.o, n.nodeType === 3 ? n.length : n.childNodes.length)); } catch (e) { /* ignore */ } }
  queueSave();
  updateFmt();
  styleLabel();
  undoButtons();
}
function undoButtons() {
  if (!ED) return;
  const u = $('[data-act="ed-undo"]', ED.el), r = $('[data-act="ed-redo"]', ED.el);
  if (u) u.disabled = ED.hi <= 0;
  if (r) r.disabled = ED.hi >= ED.hist.length - 1;
}
ACTIONS['ed-undo'] = () => { if (ED) { restoreSel(); histGo(-1); } };
ACTIONS['ed-redo'] = () => { if (ED) { restoreSel(); histGo(1); } };

// ---------- Highlights, quotes, divider lines ----------
// Colour the selected words (cls 'hl-y'…) or clear them (''). With no selection it changes or
// clears the highlight the cursor is in.
function highlight(cls) {
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if (!ED.ed.contains(r.commonAncestorContainer)) return;
  const markOf = (n) => { const m = (n.nodeType === 3 ? n.parentElement : n).closest('mark'); return m && ED.ed.contains(m) ? m : null; };
  if (r.collapsed) {
    const m = markOf(r.startContainer);
    if (!m) { toast('Select some words first, then pick a colour'); return; }
    if (cls) m.className = cls;
    else m.replaceWith(...m.childNodes);
    return;
  }
  let sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
  if (ec.nodeType === 3 && eo > 0 && eo < ec.length) ec.splitText(eo);
  if (sc.nodeType === 3 && so > 0 && so < sc.length) {
    const tail = sc.splitText(so);
    if (ec === sc) { ec = tail; eo -= so; }
    sc = tail;
    so = 0;
  }
  const range = document.createRange();
  range.setStart(sc, so);
  range.setEnd(ec, eo);
  const texts = [];
  const tw = document.createTreeWalker(ED.ed, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    if (!t.length || t.parentElement.closest('.ph')) continue;
    if (t.parentNode === ED.ed || /^(UL|OL)$/.test(t.parentNode.tagName)) continue; // spaces between lines
    if (range.comparePoint(t, 0) === 0 && range.comparePoint(t, t.length) === 0) texts.push(t);
  }
  if (!texts.length) return;
  const inside = new Set(texts);
  const wrap = (t, c) => { const m = document.createElement('mark'); m.className = c; t.before(m); m.appendChild(t); };
  // Old highlights under the selection come off; their parts outside it keep their colour.
  for (const m of new Set(texts.map(markOf).filter(Boolean))) {
    const c = m.className, keep = [];
    const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) if (!inside.has(t) && t.length) keep.push(t);
    m.replaceWith(...m.childNodes);
    keep.forEach((t) => wrap(t, c));
  }
  if (cls) texts.forEach((t) => wrap(t, cls));
  $$('mark', ED.ed).forEach((m) => {
    let nx = m.nextSibling;
    while (nx && nx.nodeName === 'MARK' && nx.className === m.className) { m.append(...nx.childNodes); nx.remove(); nx = m.nextSibling; }
  });
  const last = texts[texts.length - 1], nr = document.createRange();
  nr.setStart(texts[0], 0);
  nr.setEnd(last, last.length);
  sel.removeAllRanges();
  sel.addRange(nr);
}
ACTIONS['ed-hl'] = (el) => {
  restoreSel();
  highlight(el.dataset.v ? 'hl-' + el.dataset.v : '');
  afterCmd();
};
ACTIONS['ed-quote'] = () => {
  restoreSel();
  if (!notInTable()) return;
  if (caretStyle() === 'blockquote') document.execCommand('formatBlock', false, 'div');
  else if (selectedLis().length) unlistSelected('blockquote');
  else document.execCommand('formatBlock', false, 'blockquote');
  afterCmd();
};
ACTIONS['ed-hr'] = () => {
  restoreSel();
  if (!notInTable()) return;
  const li = caretLi(), line = li && unlistLi(li);
  if (line) caretAt(line, line.childNodes.length);
  const sel = getSelection();
  if (sel.rangeCount) ED.range = sel.getRangeAt(0).cloneRange();
  insertBlock(document.createElement('hr'));
  caretAt(ED.range.startContainer, ED.range.startOffset);
  afterCmd();
};
// The toolbar's Aa button names the style you're writing in.
function styleLabel() {
  if (!ED) return;
  const sel = getSelection();
  if (!sel.rangeCount || !ED.ed.contains(sel.anchorNode)) return;
  const t = $('.ed-style .st-name', ED.el), name = STYLE_NAMES[caretStyle()];
  if (t && t.textContent !== name) t.textContent = name;
}
document.addEventListener('selectionchange', () => { if (ED) { styleLabel(); quickHl(); } });
// The colour the cursor/selection is in gets a ring (in the Aa panel and the quick bar).
function hlState() {
  const sel = getSelection();
  const a = sel.rangeCount ? sel.anchorNode : null, m = a && (a.nodeType === 3 ? a.parentElement : a).closest('mark');
  const hl = m && ED.ed.contains(m) ? m.className.replace('hl-', '') : null;
  $$('[data-act="ed-hl"]', ED.el).forEach((b) => b.classList.toggle('on', hl !== null && b.dataset.v === hl));
}
// Select some words and the highlight colours appear above the toolbar — one tap colours them.
function quickHl() {
  const q = ED && $('.hlq', ED.el);
  if (!q) return;
  const sel = getSelection();
  const show = !!sel.rangeCount && !sel.isCollapsed && ED.ed.contains(sel.anchorNode) && $('.fmt', ED.el).hidden && $('.tbp', ED.el).hidden;
  if (q.hidden === show) q.hidden = !show;
  if (show) hlState();
}

// ---------- Toolbar ----------
// Styles, lists, quotes and dividers stay outside tables; in a cell B, I, U, S and highlights work.
function notInTable() {
  if (!caretCell()) return true;
  toast('In a table cell you can use B, I, U, S and highlights');
  return false;
}
ACTIONS['ed-done'] = () => { if (ED) { ED.ed.blur(); saveEditor(); } };
ACTIONS['ed-fmt'] = () => {
  const f = $('.fmt', ED.el);
  f.hidden = !f.hidden;
  $('[data-act="ed-fmt"]', ED.el).classList.toggle('on', !f.hidden);
  if (!f.hidden) { $('.tbp', ED.el).hidden = true; tableMarks(); updateFmt(); }
  quickHl();
};
ACTIONS['ed-block'] = (el) => {
  restoreSel();
  if (!notInTable()) return;
  // On a checklist/list line the style takes the line out of the list.
  if (selectedLis().length) unlistSelected(el.dataset.v);
  else document.execCommand('formatBlock', false, el.dataset.v);
  afterCmd();
};
ACTIONS['ed-cmd'] = (el) => {
  restoreSel();
  if (/dent$/.test(el.dataset.v) && !notInTable()) return;
  document.execCommand(el.dataset.v, false, null);
  afterCmd();
};
ACTIONS['ed-list'] = (el) => {
  restoreSel();
  if (!notInTable()) return;
  const li = caretLi(), list = li && li.parentElement;
  if (el.dataset.v === 'ul' && list && list.tagName === 'UL' && list.classList.contains('cl')) list.classList.remove('cl');
  else document.execCommand(el.dataset.v === 'ul' ? 'insertUnorderedList' : 'insertOrderedList', false, null);
  afterCmd();
};
ACTIONS['ed-check'] = () => {
  restoreSel();
  if (!notInTable()) return;
  const li = caretLi(), list = li && li.parentElement;
  if (list && list.tagName === 'UL' && list.classList.contains('cl')) unlistSelected('div'); // only these lines lose their circles
  else if (list && list.tagName === 'UL') list.classList.add('cl');
  else {
    if (list && list.tagName === 'OL') document.execCommand('insertOrderedList', false, null);
    document.execCommand('insertUnorderedList', false, null);
    const nli = caretLi();
    if (nli) nli.parentElement.classList.add('cl');
  }
  afterCmd();
};
function updateFmt() {
  if (!ED) return;
  const f = $('.fmt', ED.el);
  if (!f || f.hidden) return;
  const st = caretStyle();
  $$('[data-act="ed-block"]', f).forEach((b) => b.classList.toggle('on', b.dataset.v === st));
  $('[data-act="ed-quote"]', f).classList.toggle('on', st === 'blockquote');
  hlState();
  $$('[data-act="ed-cmd"]', f).forEach((b) => {
    if (b.dataset.v === 'indent' || b.dataset.v === 'outdent') return;
    let on = false;
    try { on = document.queryCommandState(b.dataset.v); } catch (e) { /* ignore */ }
    b.classList.toggle('on', on);
  });
  const li = caretLi(), list = li && li.parentElement;
  $('[data-v="ul"]', f).classList.toggle('on', !!list && list.tagName === 'UL' && !list.classList.contains('cl'));
  $('[data-v="ol"]', f).classList.toggle('on', !!list && list.tagName === 'OL');
}
ACTIONS['ed-new'] = async () => {
  await saveEditor();
  const e = cur(), old = noteOf(e.id);
  const n = newNote(old ? old.folder : 'notes');
  SCREENS.note.hide();
  SCREENS.note.leave(e);
  UI.stacks.notes[UI.stacks.notes.length - 1] = { s: 'note', id: n.id, fresh: true };
  show('push');
};

// ---------- Note menu ----------
ACTIONS['note-menu'] = async (el) => {
  const n = noteOf(cur().id);
  if (!n) return;
  const v = await menu(el, [
    { id: 'pin', label: n.pinned ? 'Unpin Note' : 'Pin Note', g: n.pinned ? 'unpin' : 'pin' },
    { id: 'lock', label: n.locked ? 'Remove Lock' : 'Lock Note', g: n.locked ? 'unlock' : 'lock' },
    { id: 'move', label: 'Move Note', g: 'folderMove' },
    '-',
    { id: 'delete', label: 'Delete Note', g: 'trash', danger: true },
  ]);
  if (!v || !ED) return;
  if (v === 'pin') { n.pinned = !n.pinned; save(); toast(n.pinned ? 'Pinned' : 'Unpinned'); }
  if (v === 'move') { await saveEditor(); moveSheet(n.id, () => { const b = $('.back span', ED && ED.el); if (b) b.textContent = editorBackLabel(); }); }
  if (v === 'delete') {
    await saveEditor();
    deleteNote(n.id);
    pop();
  }
  if (v === 'lock') {
    const html = await editorHtml();
    if (!n.locked) {
      if (!noteInfo(html).title && !n.blobs.length) { toast('Write something first'); return; }
      if (await lockNote(n, html)) { toast('Locked — the title stays visible in the list'); refreshDate(n); }
    } else {
      const plain = await unlockNote(n);
      if (plain != null) {
        const info = noteInfo(plain);
        n.html = plain; n.preview = info.preview; n.text = info.text;
        save(n);
        toast('Lock removed');
        refreshDate(n);
      }
    }
  }
};
function refreshDate(n) {
  const d = ED && $('.ed-date', ED.el);
  if (d) d.innerHTML = `${n.locked ? glyph('lock', 'inl') : ''}${fullDate(n.edited)}`;
}

// ---------- Photos ----------
ACTIONS['ed-photo'] = async (el) => {
  const v = await menu(el, [
    { id: 'take', label: 'Take Photo', g: 'camera' },
    { id: 'pick', label: 'Choose from Gallery', g: 'image' },
  ]);
  if (v) $(v === 'take' ? '#take-photo' : '#pick-photo').click();
};
async function shrinkImage(file, max = 1600) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w = src.width, h = src.height, s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.82));
}
async function addPhotos(files) {
  if (!ED || !files.length) return;
  const me = ED, n = noteOf(me.id);
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    let blob;
    try { blob = await shrinkImage(f); } catch (e) { toast("Couldn't read that picture"); continue; }
    const id = uid();
    await putPhoto(id, blob, n && n.locked ? LOCK.key : null);
    if (ED !== me) return;
    const url = URL.createObjectURL(blob);
    photoUrls.set(id, { url, locked: !!(n && n.locked) });
    const ph = document.createElement('div');
    ph.className = 'ph';
    ph.contentEditable = 'false';
    ph.innerHTML = `<img data-blob="${id}" src="${url}" alt="">`;
    insertBlock(ph);
  }
  queueSave();
  saveEditor();
}
// Put a block (a photo) after the line with the cursor, with an empty line below to keep typing.
function insertBlock(node) {
  const ed = ED.ed, r = ED.range;
  const block = r && ed.contains(r.startContainer) ? topBlock(r.startContainer) : null;
  const emptyLine = (b) => b && !b.classList.contains('ph') && !/^(HR|TABLE)$/.test(b.tagName) &&!b.textContent.trim() && !b.querySelector('img');
  if (block && emptyLine(block)) block.replaceWith(node);
  else if (block) block.after(node);
  else ed.appendChild(node);
  let next = node.nextElementSibling;
  if (!emptyLine(next)) { next = document.createElement('div'); next.innerHTML = '<br>'; node.after(next); }
  const nr = document.createRange();
  nr.setStart(next, 0);
  nr.collapse(true);
  ED.range = nr;
}
['#pick-photo', '#take-photo'].forEach((s) => {
  document.addEventListener('change', (e) => {
    if (!e.target.matches(s)) return;
    const files = [...e.target.files];
    e.target.value = '';
    addPhotos(files);
  });
});
function openViewer(img) {
  const wrap = document.createElement('div');
  wrap.className = 'viewer';
  wrap.innerHTML = `<div class="viewer-bar"><button data-v="close" aria-label="Close">${glyph('x')}</button><button data-v="del" aria-label="Delete photo">${glyph('trash')}</button></div><div class="viewer-img"><img src="${img.src}" alt=""></div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  const close = () => {
    const i = layers.indexOf(close);
    if (i >= 0) layers.splice(i, 1);
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 250);
  };
  layers.push(close);
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) { if (!e.target.closest('img')) close(); return; }
    if (b.dataset.v === 'close') close();
    if (b.dataset.v === 'del') {
      close();
      const ok = await ask({ title: 'Delete this photo?', ok: 'Delete Photo', destructive: true });
      if (ok && ED) { img.closest('.ph').remove(); queueSave(); }
    }
  });
}

// ---------- Voice typing ----------
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const VOICE_LANGS = [['en-US', 'EN', 'English'], ['ru-RU', 'RU', 'Русский'], ['uz-UZ', 'UZ', "O'zbekcha"]];
let voice = null;
ACTIONS['ed-mic'] = () => {
  if (voice) { stopVoice(); return; }
  if (!SpeechRec) { toast("Voice typing isn't available here — use the mic on your keyboard"); return; }
  if (!ED.range || !ED.ed.contains(ED.range.startContainer)) caretToEnd(false);
  if (document.activeElement === ED.ed) ED.ed.blur(); // hide the keyboard while talking
  voice = { on: true, rec: null };
  voiceUi(true);
  listen();
};
ACTIONS['ed-voice-lang'] = () => {
  const i = VOICE_LANGS.findIndex((l) => l[0] === S.settings.voiceLang);
  S.settings.voiceLang = VOICE_LANGS[(i + 1) % VOICE_LANGS.length][0];
  save();
  voiceUi(true);
  if (voice && voice.rec) { const r = voice.rec; voice.rec = null; try { r.abort(); } catch (e) { /* ignore */ } setTimeout(listen, 200); }
};
function voiceUi(on) {
  if (!ED) return;
  const v = $('.voice', ED.el);
  v.hidden = !on;
  $('[data-act="ed-mic"]', $('.ed-bar', ED.el)).classList.toggle('on', on);
  if (on) {
    const l = VOICE_LANGS.find((x) => x[0] === S.settings.voiceLang) || VOICE_LANGS[0];
    $('.v-lang', v).textContent = l[1];
    $('.v-lang', v).setAttribute('aria-label', `Language: ${l[2]}. Tap to change`);
    $('.v-text', v).textContent = `Listening… (${l[2]})`;
  }
}
// One long listening session instead of one per sentence: each new session makes Android play its
// microphone sound and loses the words said while it restarts. It only restarts after a long pause.
function listen() {
  if (!voice || !voice.on || !ED) return;
  const rec = new SpeechRec();
  voice.rec = rec;
  rec.lang = S.settings.voiceLang;
  rec.interimResults = true;
  rec.continuous = true;
  let said = ''; // what this session has written so far (some phones repeat it at the start of each new result)
  const seen = new Map(); // result number → text already written
  rec.onstart = () => { if (voice && !voice.started) { voice.started = true; buzz(25); } };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], text = r[0].transcript;
      if (!r.isFinal) { interim += text; continue; }
      if (seen.get(i) === text) continue;
      seen.set(i, text);
      let add = text.trim();
      if (said && add.toLowerCase().startsWith(said.toLowerCase())) add = add.slice(said.length).trim();
      said = (said + ' ' + add).trim();
      if (add) speak(add);
    }
    const t = ED && $('.v-text', ED.el);
    if (t) t.textContent = interim || 'Listening…';
  };
  rec.onerror = (e) => {
    const msg = { 'not-allowed': 'Allow the microphone for this app to use voice typing', 'service-not-allowed': 'Voice typing is turned off on this phone', 'audio-capture': 'No microphone found', network: 'Voice typing needs an internet connection', 'language-not-supported': "This language isn't available for voice typing" }[e.error];
    if (msg) { stopVoice(); toast(msg); }
  };
  rec.onend = () => { if (voice && voice.on && voice.rec === rec) setTimeout(listen, 120); };
  try { rec.start(); } catch (err) { stopVoice(); }
}
function stopVoice() {
  if (!voice) return;
  voice.on = false;
  const r = voice.rec;
  voice = null;
  try { if (r) r.stop(); } catch (e) { /* ignore */ }
  buzz(25); // a short vibration instead of a sound when it stops
  voiceUi(false);
}
// Insert what was said at the cursor, with sensible spaces and capitals.
function speak(text) {
  text = String(text || '').trim();
  if (!text || !ED) return;
  const ed = ED.ed;
  let r = ED.range;
  if (!r || !ed.contains(r.startContainer)) { caretToEnd(false); r = ED.range; }
  r = r.cloneRange();
  r.deleteContents();
  const pre = document.createRange();
  const block = topBlock(r.startContainer) || ed;
  pre.selectNodeContents(block);
  pre.setEnd(r.startContainer, r.startOffset);
  const before = pre.toString();
  if (!before.trim() || /[.!?]\s*$/.test(before)) text = text[0].toUpperCase() + text.slice(1);
  if (before && !/\s$/.test(before)) text = ' ' + text;
  const node = document.createTextNode(text);
  r.insertNode(node);
  r.setStartAfter(node);
  r.collapse(true);
  ED.range = r;
  if (document.activeElement === ed) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  const t = $('.v-text', ED.el);
  if (t) t.textContent = 'Listening…';
  queueSave();
}
