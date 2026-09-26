'use strict';
/* The note editor: rich text (title/heading/body, bold…, lists), checklists, photos and voice
   typing. The first line of a note is its title. Saves itself as you type. */

let ED = null; // { el, ed, id, range, t, dirty, wasFocused }

// ---------- Cleaning & reading note HTML ----------
const KEEP_TAGS = new Set(['DIV', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'IMG']);
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
      if (tag === 'DIV' && ch.classList.contains('ph')) keep.push(['class', 'ph']);
      if (tag === 'IMG') {
        const id = ch.getAttribute('data-blob') || '';
        if (!/^[a-z0-9]{4,40}$/i.test(id)) { ch.remove(); continue; }
        keep.push(['data-blob', id]);
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
  const blobs = $$('img[data-blob]', body).map((i) => i.getAttribute('data-blob'));
  $$('br', body).forEach((b) => b.replaceWith('\n'));
  $$('div, p, h1, h2, h3, li', body).forEach((b) => b.append('\n'));
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
    const right = `<button class="ntext done-btn" data-act="ed-done">Done</button>${navBtn('note-menu', 'more', 'More')}`;
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
      </div>
      <div class="ed-bar">
        <button data-act="ed-fmt" class="ed-style" aria-label="Text style"><span class="aa">Aa</span><span class="st-name">Body</span></button>
        <button data-act="ed-check" aria-label="Checklist">${glyph('checklist')}</button>
        <button data-act="ed-photo" aria-label="Add photo">${glyph('camera')}</button>
        <button data-act="ed-mic" aria-label="Voice typing">${glyph('mic')}</button>
        <button data-act="ed-new" aria-label="New note">${glyph('compose')}</button>
      </div>`;
    return page({ title: '', back: editorBackLabel(), right, body, big: false, after });
  },
  mount(el, e) { mountEditor(el, e); },
  hide() { stopVoice(); saveEditor(); },
  leave(e) {
    const n = noteOf(e.id);
    if (n && !n.locked && !n.title && !n.blobs.length) { S.notes = S.notes.filter((x) => x !== n); save(); }
    ED = null;
  },
};

function mountEditor(el, e) {
  const n = noteOf(e.id);
  const ed = $('.ed', el);
  ED = { el, ed, id: e.id, range: null, t: 0, dirty: false, wasFocused: false };
  const me = ED;
  // Keep the keyboard open (and the selection) when tapping the toolbars.
  $$('.ed-bar, .fmt, .voice, .nav', el).forEach((b) => b.addEventListener('mousedown', (ev) => { if (!ev.target.closest('input')) ev.preventDefault(); }));
  ed.addEventListener('input', () => { queueSave(); });
  ed.addEventListener('focus', () => el.classList.add('editing'));
  ed.addEventListener('blur', () => { el.classList.remove('editing'); saveEditor(); });
  ed.addEventListener('paste', (ev) => {
    ev.preventDefault();
    const text = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  ed.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') setTimeout(() => { const li = caretLi(); if (li && !li.textContent.trim()) li.classList.remove('done'); }, 0);
  });
  // A new line keeps the style you were writing in (Title, Heading, Subheading) — the phone would
  // otherwise switch back to Body. Change it with Aa.
  ed.addEventListener('beforeinput', (ev) => { if (ev.inputType === 'insertParagraph') me.keepTag = caretStyle(); });
  ed.addEventListener('input', (ev) => {
    if (ev.inputType !== 'insertParagraph' || !me.keepTag) return;
    const tag = me.keepTag;
    me.keepTag = null;
    if (/^h[1-3]$/.test(tag) && caretStyle() !== tag && !caretLi()) { document.execCommand('formatBlock', false, tag); afterCmd(); }
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
      if (!ED.wasFocused) ed.blur();
      return;
    }
    const img = ev.target.closest('.ph img');
    if (img) openViewer(img);
  });
  const load = (html) => {
    if (ED !== me) return;
    ed.innerHTML = cleanHtml(html) || '<h1><br></h1>';
    prepareEd();
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
  $$('.ph', ED.ed).forEach((p) => { p.contentEditable = 'false'; });
  $$('.ph img', ED.ed).forEach(async (img) => {
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
  const li = ev.target.closest && ev.target.closest('li');
  if (!li || !ED.ed.contains(li) || !li.parentElement.classList.contains('cl')) return null;
  const x = ev.clientX - li.getBoundingClientRect().left;
  return x >= -6 && x < 32 ? li : null;
}
function afterCmd() {
  prepareEd();
  queueSave();
  updateFmt();
  styleLabel();
  const sel = getSelection();
  if (sel.rangeCount && ED.ed.contains(sel.anchorNode)) ED.range = sel.getRangeAt(0).cloneRange();
}
// The style of the line the cursor is on: 'h1' Title, 'h2' Heading, 'h3' Subheading, 'div' Body.
function caretStyle() {
  if (!ED) return 'div';
  const sel = getSelection();
  let n = sel.rangeCount ? sel.anchorNode : null;
  while (n && n !== ED.ed) {
    if (n.nodeType === 1 && /^H[1-3]$/.test(n.tagName)) return n.tagName.toLowerCase();
    n = n.parentNode;
  }
  return 'div';
}
const STYLE_NAMES = { h1: 'Title', h2: 'Heading', h3: 'Subheading', div: 'Body' };
// The toolbar's Aa button names the style you're writing in.
function styleLabel() {
  if (!ED) return;
  const sel = getSelection();
  if (!sel.rangeCount || !ED.ed.contains(sel.anchorNode)) return;
  const t = $('.ed-style .st-name', ED.el), name = STYLE_NAMES[caretStyle()];
  if (t && t.textContent !== name) t.textContent = name;
}
document.addEventListener('selectionchange', () => { if (ED) styleLabel(); });

// ---------- Toolbar ----------
ACTIONS['ed-done'] = () => { if (ED) { ED.ed.blur(); saveEditor(); } };
ACTIONS['ed-fmt'] = () => {
  const f = $('.fmt', ED.el);
  f.hidden = !f.hidden;
  $('[data-act="ed-fmt"]', ED.el).classList.toggle('on', !f.hidden);
  if (!f.hidden) updateFmt();
};
ACTIONS['ed-block'] = (el) => {
  restoreSel();
  document.execCommand('formatBlock', false, el.dataset.v);
  afterCmd();
};
ACTIONS['ed-cmd'] = (el) => {
  restoreSel();
  document.execCommand(el.dataset.v, false, null);
  afterCmd();
};
ACTIONS['ed-list'] = (el) => {
  restoreSel();
  const li = caretLi(), list = li && li.parentElement;
  if (el.dataset.v === 'ul' && list && list.tagName === 'UL' && list.classList.contains('cl')) list.classList.remove('cl');
  else document.execCommand(el.dataset.v === 'ul' ? 'insertUnorderedList' : 'insertOrderedList', false, null);
  afterCmd();
};
ACTIONS['ed-check'] = () => {
  restoreSel();
  const li = caretLi(), list = li && li.parentElement;
  if (list && list.tagName === 'UL' && list.classList.contains('cl')) document.execCommand('insertUnorderedList', false, null);
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
  let block = '';
  try { block = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch (e) { /* ignore */ }
  $$('[data-act="ed-block"]', f).forEach((b) => b.classList.toggle('on', b.dataset.v === block || (b.dataset.v === 'div' && !/^h[1-3]$/.test(block))));
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
  const emptyLine = (b) => b && !b.classList.contains('ph') && !b.textContent.trim() && !b.querySelector('img');
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
