'use strict';
/* 20 Nov 2026: his 8 requests (Notes 4.3). Loaded after next.js; wraps older functions, never edits them.
   1. Voice typing makes no sound: the app records by itself and the AI server writes the words (Chrome's own
      voice typing beeps on Android every time it starts and stops, and that cannot be switched off).
   2. Bold, Italic, Underline and Strikethrough turn off again (on an Android keyboard Chrome forgot the "off"
      and kept writing into the bold part).
   3. Selecting words shows an iPhone-style bar: Cut, Copy, Paste, Select all, B I U S and the highlight colors.
   4. Folders like iPhone Notes: folders inside folders, notes grouped Today / Yesterday / Previous 7 days /
      Previous 30 days / months, hold a note and drag it onto a folder.
   5. Live spelling check: wrong words get a red wavy line; tap one to fix it.
   7. Typewriter writing: the line you write on stays in the middle of the screen, never under the keyboard. */

const ZW = '​';
const N20_TAGS = { bold: ['B', 'STRONG'], italic: ['I', 'EM'], underline: ['U'], strikeThrough: ['S', 'STRIKE', 'DEL'] };
const N20_MAKE = { bold: 'b', italic: 'i', underline: 'u', strikeThrough: 's' };
const N20_INLINE = /^(B|STRONG|I|EM|U|S|STRIKE|DEL|MARK)$/;

/* ---------- 2. Bold / Italic / Underline / Strikethrough ---------- */
function n20Fmt(node, cmd) {
  const tags = N20_TAGS[cmd];
  for (let p = node && (node.nodeType === 3 ? node.parentElement : node); p && ED && p !== ED.ed; p = p.parentElement) if (tags.includes(p.tagName)) return p;
  return null;
}
function n20Texts(r) {
  const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
  const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) if (r.intersectsNode(t) && t.data.replace(/​/g, '').trim()) out.push(t);
  if (!out.length && root.nodeType === 3) out.push(root);
  return out;
}
function n20FmtOn(cmd) {
  const sel = getSelection();
  if (!ED || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  if (!ED.ed.contains(r.startContainer)) return false;
  if (sel.isCollapsed) return !!n20Fmt(r.startContainer, cmd);
  const ts = n20Texts(r);
  return ts.length > 0 && ts.every((t) => n20Fmt(t, cmd));
}
function n20Toggle(cmd) {
  if (!ED) return;
  restoreSel();
  const sel = getSelection();
  if (!sel.rangeCount || !ED.ed.contains(sel.anchorNode)) return;
  if (!sel.isCollapsed) {
    const on = n20FmtOn(cmd);
    document.execCommand(cmd, false, null);
    if (on && sel.rangeCount && n20FmtOn(cmd)) { // (still on: unwrap it by hand)
      const r = sel.getRangeAt(0), els = new Set();
      n20Texts(r).forEach((t) => { const e = n20Fmt(t, cmd); if (e) els.add(e); });
      els.forEach((e) => e.replaceWith(...e.childNodes));
    }
    afterCmd();
    n20SelSync();
    return;
  }
  // No words selected: the next letters go in (or out of) the format. A zero-width mark holds the cursor in the
  // right place, so the keyboard cannot carry on writing in bold.
  const r = sel.getRangeAt(0), t = document.createTextNode(ZW);
  const el = n20Fmt(r.startContainer, cmd);
  if (el) {
    let holder = t;
    for (let p = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer; p && p !== el; p = p.parentElement) {
      if (N20_INLINE.test(p.tagName)) { const c = p.cloneNode(false); c.appendChild(holder); holder = c; } // (italic inside the bold goes on)
    }
    const tail = document.createRange();
    tail.setStart(r.startContainer, r.startOffset);
    tail.setEndAfter(el);
    const rest = tail.extractContents();
    el.after(holder);
    if (rest.textContent.replace(/​/g, '')) holder.after(rest);
    if (!el.textContent.replace(/​/g, '') && !el.querySelector('img')) el.remove();
  } else {
    const w = document.createElement(N20_MAKE[cmd]);
    w.appendChild(t);
    r.insertNode(w);
  }
  const nr = document.createRange();
  nr.setStart(t, 1);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
  ED.range = nr.cloneRange();
  afterCmd();
  n20SelSync();
}
{
  const _cmd = ACTIONS['ed-cmd'];
  ACTIONS['ed-cmd'] = function (el) { if (N20_TAGS[el.dataset.v]) return n20Toggle(el.dataset.v); return _cmd.apply(this, arguments); };
  const _uf = updateFmt;
  updateFmt = function () {
    _uf.apply(this, arguments);
    const f = ED && $('.fmt', ED.el);
    if (f && !f.hidden) $$('[data-act="ed-cmd"]', f).forEach((b) => { if (N20_TAGS[b.dataset.v]) b.classList.toggle('on', n20FmtOn(b.dataset.v)); });
  };
  // The zero-width marks never reach the saved note, its preview or search.
  const _re = readEditor;
  readEditor = function (ed) {
    const o = _re(ed);
    o.html = o.html.replace(/​/g, '').replace(/<(b|i|u|s|strong|em)><\/\1>/g, '');
    for (const k of ['title', 'preview', 'text']) if (typeof o.info[k] === 'string') o.info[k] = o.info[k].replace(/​/g, '');
    if (Array.isArray(o.info.open)) o.info.open = o.info.open.map((s) => s.replace(/​/g, ''));
    return o;
  };
}
// When you leave the note, the marks and empty formats are taken out of the page too.
function n20Tidy(ed) {
  const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT), ts = [];
  for (let t = w.nextNode(); t; t = w.nextNode()) if (t.data.includes(ZW)) ts.push(t);
  ts.forEach((t) => { t.data = t.data.replace(/​/g, ''); let p = t.parentElement; if (!t.data) t.remove(); while (p && p !== ed && N20_INLINE.test(p.tagName) && !p.textContent && !p.querySelector('img')) { const q = p.parentElement; p.remove(); p = q; } });
}

/* ---------- 3. The iPhone-style bar for selected words ---------- */
const N20_HLC = ['y', 'g', 'b', 'p', 'v'];
function n20SelHtml() {
  const f = (cmd, inner, label) => `<button data-act="n20-f" data-v="${cmd}" aria-label="${label}">${inner}</button>`;
  return `<div class="n20-sel" aria-hidden="true">
    <div class="n20-r1"><button data-act="n20-cut">Cut</button><button data-act="n20-copy">Copy</button><button data-act="n20-paste">Paste</button><button data-act="n20-all">Select all</button></div>
    <div class="n20-r2">${f('bold', '<b>B</b>', 'Bold')}${f('italic', '<i>I</i>', 'Italic')}${f('underline', '<u>U</u>', 'Underline')}${f('strikeThrough', '<s>S</s>', 'Strikethrough')}<span class="n20-sep"></span>
      <span class="n20-hl hlsw"><button data-act="n20-hl" data-v="" aria-label="No highlight"><i class="hl-none"></i></button>${N20_HLC.map((c) => `<button data-act="n20-hl" data-v="${c}" aria-label="${HL_NAMES[c]} highlight"><i class="hl-${c}"></i></button>`).join('')}</span></div>
  </div>`;
}
let n20SelRaf = 0;
function n20SelSync() {
  cancelAnimationFrame(n20SelRaf);
  n20SelRaf = requestAnimationFrame(() => {
    const bar = ED && $('.n20-sel', ED.el);
    if (!bar) return;
    const sel = getSelection();
    const show = !!sel.rangeCount && !sel.isCollapsed && ED.ed.contains(sel.anchorNode) && ED.ed.contains(sel.focusNode)
      && $('.fmt', ED.el).hidden && $('.tbp', ED.el).hidden && !VR;
    if (bar.classList.contains('on') !== show) { bar.classList.toggle('on', show); bar.setAttribute('aria-hidden', show ? 'false' : 'true'); }
    if (!show) return;
    $$('[data-act="n20-f"]', bar).forEach((b) => b.classList.toggle('on', n20FmtOn(b.dataset.v)));
    const a = sel.anchorNode, m = a && (a.nodeType === 3 ? a.parentElement : a).closest('mark');
    const hl = m && ED.ed.contains(m) ? m.className.replace('hl-', '') : null;
    $$('[data-act="n20-hl"]', bar).forEach((b) => b.classList.toggle('on', hl !== null && b.dataset.v === hl));
  });
}
document.addEventListener('selectionchange', () => { if (ED) n20SelSync(); });
function n20SelText() {
  const sel = getSelection();
  if (!sel.rangeCount) return { text: '', html: '' };
  const d = document.createElement('div');
  d.appendChild(sel.getRangeAt(0).cloneContents());
  return { text: sel.toString().replace(/​/g, ''), html: d.innerHTML.replace(/​/g, '') };
}
async function n20Copy() {
  const { text, html } = n20SelText();
  if (!text) return false;
  try {
    if (window.ClipboardItem && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      return true;
    }
  } catch (e) { /* plain text below */ }
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* old way below */ }
  try { return document.execCommand('copy'); } catch (e) { return false; }
}
ACTIONS['n20-copy'] = async () => { restoreSel(); if (await n20Copy()) { buzz(8); toast('Copied'); } else toast("Couldn't copy"); };
ACTIONS['n20-cut'] = async () => {
  restoreSel();
  if (!(await n20Copy())) { toast("Couldn't cut"); return; }
  restoreSel();
  document.execCommand('delete', false, null);
  afterCmd();
  buzz(8);
};
ACTIONS['n20-paste'] = async () => {
  restoreSel();
  let t = '';
  try { t = await navigator.clipboard.readText(); } catch (e) { toast('Hold the text and tap Paste on the phone’s menu'); return; }
  if (!t) { toast('Nothing to paste'); return; }
  restoreSel();
  document.execCommand('insertText', false, t);
  afterCmd();
};
ACTIONS['n20-all'] = () => {
  if (!ED) return;
  ED.ed.focus({ preventScroll: true });
  const r = document.createRange();
  r.selectNodeContents(ED.ed);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  ED.range = r.cloneRange();
  buzz(6);
};
ACTIONS['n20-f'] = (el) => { n20Toggle(el.dataset.v); buzz(6); };
ACTIONS['n20-hl'] = (el) => {
  // tapping the color the words already have takes the highlight off
  const v = el.classList.contains('on') ? '' : el.dataset.v;
  ACTIONS['ed-hl']({ dataset: { v } });
  buzz(6);
  n20SelSync();
};

/* ---------- 7. Typewriter writing ---------- */
let n20TwRaf = 0;
function n20Center() {
  cancelAnimationFrame(n20TwRaf);
  n20TwRaf = requestAnimationFrame(() => {
    if (!ED || document.activeElement !== ED.ed) return;
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed || !ED.ed.contains(sel.anchorNode)) return;
    const scr = $('.scroll', ED.el);
    if (!scr) return;
    const r = sel.getRangeAt(0);
    let rect = null;
    const rs = r.getClientRects();
    if (rs.length && rs[rs.length - 1].height) rect = rs[rs.length - 1];
    if (!rect) { const n = r.startContainer, e = n.nodeType === 3 ? n.parentElement : n.childNodes[r.startOffset] && n.childNodes[r.startOffset].nodeType === 1 ? n.childNodes[r.startOffset] : n; if (e && e.getBoundingClientRect) rect = e.getBoundingClientRect(); }
    if (!rect || !rect.height) return;
    const sr = scr.getBoundingClientRect(), nav = $('.nav', ED.el), bar = $('.ed-bar', ED.el);
    const top = nav ? nav.getBoundingClientRect().bottom : sr.top;
    const bottom = bar ? bar.getBoundingClientRect().top : sr.bottom;
    const mid = top + (bottom - top) * 0.5;
    const y = rect.top + Math.min(rect.height, 30) / 2;
    // The line goes up to the middle and stays there as you write. (A line you tapped higher up stays where it is.)
    let d = 0;
    if (y > mid + 4) d = y - mid;
    else if (rect.top < top + 4) d = rect.top - top - 12;
    if (Math.abs(d) >= 2) scr.scrollBy({ top: d, behavior: 'smooth' });
  });
}
window.addEventListener('resize', () => { if (ED && document.activeElement === ED.ed) setTimeout(n20Center, 60); });
if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (ED && document.activeElement === ED.ed) setTimeout(n20Center, 60); });

/* ---------- 1. Voice typing with no sound ---------- */
let VR = null;
const N20_JUNK = /^(thank you\.?|thanks for watching!?|you|bye\.?|\.+|subtitles by .*|продолжение следует\.*|спасибо\.?)$/i;
function n20VoiceText(s) { const t = ED && $('.v-text', ED.el); if (t) t.textContent = s; }
ACTIONS['ed-mic'] = () => { if (VR) n20VoiceStop(); else n20VoiceStart(); };
stopVoice = function () { n20VoiceStop(); };
async function n20VoiceStart() {
  if (!ED) return;
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { toast("Voice typing isn't available here — use the mic on your keyboard"); return; }
  if (navigator.onLine === false) { toast('Voice typing needs the internet'); return; }
  if (!ED.range || !ED.ed.contains(ED.range.startContainer)) caretToEnd(false);
  if (document.activeElement === ED.ed) ED.ed.blur(); // (the keyboard goes down while you talk)
  const me = ED;
  VR = { on: true, me, pre: [], seg: null, q: Promise.resolve(), busy: 0, floor: 0.004 };
  voiceUi(true);
  n20SelSync();
  n20VoiceText('Starting…');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    n20VoiceStop(true);
    toast(err && /NotAllowed|Security/.test(err.name) ? 'Allow the microphone for this app to use voice typing' : 'No microphone found');
    return;
  }
  if (!VR || !VR.on || VR.me !== me) { stream.getTracks().forEach((t) => t.stop()); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);
  Object.assign(VR, { stream, ctx, src, proc, mute, rate: ctx.sampleRate });
  proc.onaudioprocess = (e) => n20VoiceChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
  buzz(25);
  n20VoiceText(n20Listening());
}
const n20Listening = () => { const l = VOICE_LANGS.find((x) => x[0] === S.settings.voiceLang) || VOICE_LANGS[0]; return `Listening… (${l[2]})`; };
// Each piece of sound (about 0.1 s): is someone speaking? A pause after speech sends what was said.
function n20VoiceChunk(buf) {
  if (!VR || !VR.on) return;
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  const rms = Math.sqrt(s / buf.length), ms = (buf.length / VR.rate) * 1000;
  if (!VR.seg) VR.floor = Math.min(0.03, VR.floor * 0.97 + rms * 0.03); // (the room's own noise, learned while nobody speaks)
  const loud = rms > Math.max(0.012, VR.floor * 2.6);
  const dot = ED && $('.v-dot', ED.el);
  if (dot) dot.style.transform = `scale(${1 + Math.min(1.2, rms * 18)})`;
  if (!VR.seg) {
    VR.pre.push(buf);
    if (VR.pre.length > 4) VR.pre.shift();
    if (loud) { VR.seg = { bufs: VR.pre.slice(), speech: ms, quiet: 0, len: 0 }; VR.pre = []; VR.seg.len = VR.seg.bufs.reduce((a, b) => a + b.length, 0); }
    return;
  }
  const g = VR.seg;
  g.bufs.push(buf);
  g.len += buf.length;
  if (loud) { g.speech += ms; g.quiet = 0; } else g.quiet += ms;
  const secs = g.len / VR.rate;
  if ((g.quiet > 750 && g.speech > 350) || secs > 24) n20VoiceSend();
  else if (g.quiet > 750) VR.seg = null; // (a short noise, not words)
}
function n20VoiceSend() {
  const g = VR && VR.seg;
  if (!g) return;
  VR.seg = null;
  if (g.speech < 350) return;
  const wav = n20Wav(g.bufs, VR.rate), me = VR.me, lang = (S.settings.voiceLang || 'en-US').slice(0, 2);
  const prompt = me && me.ed ? me.ed.textContent.replace(/​/g, '').slice(-160) : '';
  VR.busy++;
  if (VR.on) n20VoiceText('Writing…');
  const job = n20Hear(wav, lang, prompt);
  const v = VR;
  v.q = v.q.then(async () => {
    const text = await job;
    v.busy--;
    if (text && !N20_JUNK.test(text.trim()) && ED === me) speak(text);
    if (VR === v && v.on) n20VoiceText(v.busy ? 'Writing…' : n20Listening());
  });
}
async function n20Hear(b64, lang, prompt) {
  try {
    const r = await fetch(AI_URL + '/hear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64, lang, prompt }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) { toast("Today's free voice allowance is used up. It comes back tomorrow"); return ''; }
    if (!r.ok) { toast("Couldn't hear that. Try again"); return ''; }
    return String(j.text || '').trim();
  } catch (e) {
    toast('Voice typing needs the internet');
    return '';
  }
}
// 16 kHz mono WAV in base64 (small and understood by every speech model).
function n20Wav(bufs, rate) {
  const len = bufs.reduce((a, b) => a + b.length, 0), all = new Float32Array(len);
  let o = 0;
  for (const b of bufs) { all.set(b, o); o += b.length; }
  const step = rate / 16000, n = Math.floor(len / step), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step), b = Math.min(len, Math.floor((i + 1) * step));
    let s = 0; for (let k = a; k < b; k++) s += all[k];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const head = new DataView(new ArrayBuffer(44)), w = (p, s) => { for (let i = 0; i < s.length; i++) head.setUint8(p + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); head.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
  head.setUint32(24, 16000, true); head.setUint32(28, 32000, true); head.setUint16(32, 2, true); head.setUint16(34, 16, true); w(36, 'data'); head.setUint32(40, n * 2, true);
  const bytes = new Uint8Array(44 + n * 2);
  bytes.set(new Uint8Array(head.buffer), 0);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function n20VoiceStop(quiet) {
  const v = VR;
  if (!v) return;
  if (v.seg && v.on) n20VoiceSend(); // (what you said before Stop is still written)
  v.on = false;
  VR = null;
  try { if (v.proc) { v.proc.onaudioprocess = null; v.proc.disconnect(); } if (v.src) v.src.disconnect(); if (v.mute) v.mute.disconnect(); } catch (e) { /* gone */ }
  if (v.stream) v.stream.getTracks().forEach((t) => t.stop());
  if (v.ctx) v.ctx.close().catch(() => {});
  if (!quiet) buzz(25);
  if (ED && ED === v.me) voiceUi(false);
  if (v.busy && !quiet) toast('Writing what you said…');
}

/* ---------- 5. Live spelling check ---------- */
const SP = { bad: new Map(), done: new Map(), t: 0, raf: 0, ok: new Set() };
try { JSON.parse(localStorage.getItem('notes-spell-ok') || '[]').forEach((w) => SP.ok.add(w)); } catch (e) { /* none */ }
const spellOn = () => { try { return localStorage.getItem('notes-spell') !== 'off'; } catch (e) { return true; } };
const spellLang = (t) => (/[а-яё]/i.test(t) && !/[a-z]{3}/i.test(t) ? 'ru' : 'en');
function n20Blocks() {
  if (!ED) return [];
  const out = [];
  for (const b of ED.ed.children) {
    if (b.classList.contains('ph') || b.classList.contains('mq') || b.tagName === 'HR') continue;
    if (/^(UL|OL|TABLE)$/.test(b.tagName)) b.querySelectorAll('li, td, th').forEach((x) => { if (!x.querySelector('li')) out.push(x); });
    else out.push(b);
  }
  return out;
}
const spKey = (t) => t.replace(/​/g, '').replace(/\s+/g, ' ').trim();
async function n20SpellRun(all) {
  if (!ED || !spellOn() || navigator.onLine === false || !(window.CSS && CSS.highlights)) return;
  const me = ED, sel = getSelection();
  const here = sel.rangeCount && me.ed.contains(sel.anchorNode) ? topBlock(sel.anchorNode) : null;
  let list = n20Blocks().map((b) => spKey(b.textContent)).filter((t) => t.length >= 3 && /\p{L}{2}/u.test(t) && !SP.done.has(t));
  if (here) { const k = spKey(here.textContent); list.sort((a, b) => (b === k) - (a === k)); }
  list = [...new Set(list)].slice(0, all ? 8 : 2);
  for (const text of list) {
    SP.done.set(text, Date.now());
    try {
      const r = await fetch(AI_URL + '/spell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang: spellLang(text) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (r.status !== 429) SP.done.delete(text); break; }
      (j.m || []).forEach((e) => { if (!SP.ok.has(e.w.toLowerCase())) SP.bad.set(e.w, e.s); });
    } catch (e) { SP.done.delete(text); break; }
    if (ED !== me) return;
    n20SpellPaint();
  }
}
const n20Esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function n20SpellPaint() {
  cancelAnimationFrame(SP.raf);
  SP.raf = requestAnimationFrame(() => {
    if (!(window.CSS && CSS.highlights)) return;
    if (!ED || !SP.bad.size || !spellOn()) { CSS.highlights.delete('n20-spell'); return; }
    const re = new RegExp(`(?<![\\p{L}'’])(${[...SP.bad.keys()].sort((a, b) => b.length - a.length).map(n20Esc).join('|')})(?![\\p{L}'’])`, 'gu');
    const sel = getSelection(), cn = sel.rangeCount && sel.isCollapsed ? sel.anchorNode : null, co = cn ? sel.anchorOffset : -1;
    const ranges = [], w = document.createTreeWalker(ED.ed, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      re.lastIndex = 0;
      for (let m = re.exec(t.data); m; m = re.exec(t.data)) {
        if (t === cn && co === m.index + m[0].length && document.activeElement === ED.ed) continue; // (the word you are still typing)
        const r = new Range(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length); ranges.push(r);
      }
    }
    if (ranges.length) CSS.highlights.set('n20-spell', new Highlight(...ranges)); else CSS.highlights.delete('n20-spell');
  });
}
function n20SpellAt() { // the underlined word under the cursor, if any
  if (!(window.CSS && CSS.highlights) || !CSS.highlights.has('n20-spell')) return null;
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return null;
  const n = sel.anchorNode, o = sel.anchorOffset;
  for (const r of CSS.highlights.get('n20-spell')) if (r.startContainer === n && o >= r.startOffset && o <= r.endOffset) return r;
  return null;
}
function n20SpellPop() {
  n20SpellHide();
  const r = n20SpellAt();
  if (!r || !ED) return;
  const word = r.toString(), sugg = SP.bad.get(word) || [];
  if (!sugg.length) return;
  const box = document.createElement('div');
  box.className = 'n20-sp';
  box.innerHTML = sugg.map((s) => `<button data-act="n20-fix" data-v="${esc(s)}">${esc(s)}</button>`).join('') + `<button class="ig" data-act="n20-ignore" data-v="${esc(word)}">Ignore</button>`;
  ED.el.appendChild(box);
  box.addEventListener('mousedown', (e) => e.preventDefault());
  const rect = r.getBoundingClientRect(), host = ED.el.getBoundingClientRect();
  const bw = box.offsetWidth, bh = box.offsetHeight;
  let x = rect.left + rect.width / 2 - bw / 2 - host.left;
  x = Math.max(8, Math.min(host.width - bw - 8, x));
  let y = rect.top - host.top - bh - 10;
  if (y < 60) y = rect.bottom - host.top + 10;
  box.style.left = x + 'px';
  box.style.top = y + 'px';
  SP.pop = { box, range: r.cloneRange(), word };
  requestAnimationFrame(() => box.classList.add('on'));
}
function n20SpellHide() { if (SP.pop) { const b = SP.pop.box; SP.pop = null; b.classList.remove('on'); setTimeout(() => b.remove(), 160); } }
ACTIONS['n20-fix'] = (el) => {
  const p = SP.pop;
  if (!p || !ED) return;
  n20SpellHide();
  ED.ed.focus({ preventScroll: true });
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(p.range);
  document.execCommand('insertText', false, el.dataset.v);
  buzz(8);
  afterCmd();
  n20SpellPaint();
};
ACTIONS['n20-ignore'] = (el) => {
  const w = el.dataset.v;
  SP.bad.delete(w);
  SP.ok.add(w.toLowerCase());
  try { localStorage.setItem('notes-spell-ok', JSON.stringify([...SP.ok].slice(-500))); } catch (e) { /* full */ }
  n20SpellHide();
  n20SpellPaint();
};

/* ---------- the editor: put the new parts in ---------- */
{
  const _m = SCREENS.note.mount;
  SCREENS.note.mount = function (el, e) {
    _m.apply(this, arguments);
    if (!$('.n20-sel', el)) el.insertAdjacentHTML('beforeend', n20SelHtml());
    const bar = $('.n20-sel', el);
    bar.addEventListener('mousedown', (ev) => ev.preventDefault()); // (the words stay selected and the keyboard stays up)
    bar.addEventListener('pointerdown', (ev) => { if (ev.pointerType !== 'mouse') ev.preventDefault(); });
    const ed = $('.ed', el);
    ed.addEventListener('input', () => {
      n20Center();
      n20SpellHide();
      n20SpellPaint();
      clearTimeout(SP.t);
      SP.t = setTimeout(() => n20SpellRun(false), 1300);
    });
    ed.addEventListener('focus', () => setTimeout(n20Center, 350));
    ed.addEventListener('blur', () => { n20SelSync(); n20Tidy(ed); n20SpellHide(); });
    ed.addEventListener('click', () => setTimeout(n20SpellPop, 0));
    $('.scroll', el).addEventListener('scroll', () => { if (SP.pop) n20SpellHide(); }, { passive: true });
    setTimeout(() => { if (ED && ED.el === el) { n20SpellPaint(); n20SpellRun(true); } }, 1500); // (the words already in the note)
  };
  const _h = SCREENS.note.hide;
  SCREENS.note.hide = function () { n20SpellHide(); if (window.CSS && CSS.highlights) CSS.highlights.delete('n20-spell'); return _h.apply(this, arguments); };
  const _fmt = ACTIONS['ed-fmt'];
  ACTIONS['ed-fmt'] = function () { const r = _fmt.apply(this, arguments); n20SelSync(); return r; };
}

/* ---------- 4. Folders like iPhone Notes ---------- */
// The notes list: Today, Yesterday, Previous 7 days, Previous 30 days, then each month, then each year.
whenGroup = function (ms) {
  const n = -daysFromToday(dateOf(ms));
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n <= 7) return 'Previous 7 days';
  if (n <= 30) return 'Previous 30 days';
  const d = new Date(ms);
  return d.getFullYear() === new Date().getFullYear() ? MONTHS[d.getMonth()] : String(d.getFullYear());
};
const fKids = (id) => S.folders.filter((f) => f.id !== 'notes' && (f.parent || null) === id);
function fDesc(id) { const out = []; const walk = (p) => fKids(p).forEach((f) => { out.push(f.id); walk(f.id); }); walk(id); return out; }
const fCount = (id) => { const ids = new Set([id, ...fDesc(id)]); return S.notes.filter((n) => ids.has(n.folder)).length; };
const fPath = (id) => { const names = []; for (let f = folderOf(id), k = 0; f && k < 8; f = f.parent ? folderOf(f.parent) : null, k++) names.unshift(f.name); return names.join(' › '); };
function fRow(f, depth) {
  const kids = fKids(f.id).length;
  const inner = `<button class="row n20-frow" data-act="nx-folder" data-id="${f.id}" data-hold="nxfolder">${depth ? `<span class="n20-ind" style="width:${depth * 22}px"></span>` : ''}${tile(kids ? 'folder' : 'folder', folderColor(f.id), 'round')}<span class="lbl">${esc(f.name)}</span><span class="val">${fCount(f.id)}</span>${glyph('chevR', 'chev')}</button>`;
  return f.id === 'notes' ? inner : swipeRow(inner, { right: swBtn('nx-fren', f.id, 'Rename', 'pencil', 'var(--gray)') + swBtn('nx-fdel', f.id, 'Delete', 'trash', 'var(--red)') });
}
const fTree = (parent, depth) => fKids(parent).map((f) => fRow(f, depth) + (depth < 4 ? fTree(f.id, depth + 1) : '')).join('');
SCREENS.nxfolders.render = function () {
  const locked = S.notes.filter((n) => n.locked).length, trash = (S.trash || []).length;
  let body = backupNudge();
  body += `<div class="card">${folderRow('all', 'All Notes', S.notes.length, 'note', '#FFCC00')}</div>`;
  body += tsec('Folders', '', `<button class="sec-btn" data-act="new-folder">New folder</button>`);
  const notes = S.folders.find((f) => f.id === 'notes');
  body += `<div class="card">${notes ? fRow(notes, 0) : ''}${fTree(null, 0)}</div>`;
  body += `<div class="card nx-gap">${folderRow('__locked', 'Locked', locked, 'lock', '#8E8E93')}<button class="row" data-act="nx-trash">${tile('trash', '#8E8E93', 'round')}<span class="lbl">Recently Deleted</span><span class="val">${trash}</span>${glyph('chevR', 'chev')}</button></div>`;
  body += '<p class="foot">Hold a folder to move it into another folder.</p>';
  return page({ title: 'Folders', big: 'Folders', right: navBtn('settings', 'gear', 'Settings'), body });
};
SCREENS.nxfolders.sig = () => JSON.stringify(S.folders) + '|' + S.notes.map((n) => n.folder + (n.locked ? 'l' : '')).join() + '|' + (S.trash || []).length + '|' + (S.settings.lastBackup || '');
// Inside a folder: its folders first (like iPhone), then its notes.
{
  const _r = SCREENS.folders.render;
  SCREENS.folders.render = function (e) {
    const h = _r.apply(this, arguments);
    const f = folderOf(e.folder);
    if (!f || f.id === 'notes') return h;
    const kids = fKids(f.id);
    const add = `<div class="n20-sub">${kids.length ? `<div class="card">${kids.map((k) => fRow(k, 0)).join('')}</div>` : ''}<button class="add-link n20-newsub" data-act="n20-newsub" data-id="${f.id}">${glyph('folderPlus')}New folder inside</button></div>`;
    return h.replace('<div class="results">', add + '<div class="results">');
  };
}
async function n20AskFolder(parent) {
  const name = await askText({ title: 'New folder', msg: parent ? `Inside “${folderName(parent)}”` : 'Enter a name for this folder.', placeholder: 'Name', ok: 'Save' });
  if (!name || !name.trim()) return null;
  if (S.folders.some((f) => (f.parent || null) === (parent || null) && f.name.toLowerCase() === name.trim().toLowerCase())) { toast('A folder with that name is already here'); return null; }
  const f = { id: uid(), name: name.trim() };
  if (parent) f.parent = parent;
  S.folders.push(f);
  save();
  return f;
}
ACTIONS['new-folder'] = async () => { const f = await n20AskFolder(null); if (f) { render(); toast(`“${f.name}” added`); } };
ACTIONS['n20-newsub'] = async (el) => { const f = await n20AskFolder(el.dataset.id); if (f) { render(); toast(`“${f.name}” added`); } };
ACTIONS['new-folder-move'] = async (el) => { const f = await n20AskFolder(null); if (f) ACTIONS['note-move-to']({ dataset: { id: el.dataset.id, v: f.id } }); };
// Deleting a folder: its notes go to Notes (and wait there), the folders inside it move up one level.
deleteFolder = async function (id) {
  const f = folderOf(id);
  if (!f || id === 'notes') return false;
  const n = S.notes.filter((x) => x.folder === id).length, kids = fKids(id);
  const parts = [n ? `Its ${plural(n, 'note')} will move to the Notes folder.` : '', kids.length ? `The ${plural(kids.length, 'folder')} inside it will move ${f.parent ? `into “${folderName(f.parent)}”` : 'to the top'}.` : ''].filter(Boolean);
  if (!(await ask({ title: `Delete “${f.name}”?`, msg: parts.join(' '), ok: 'Delete folder', destructive: true }))) return false;
  const moved = S.notes.filter((x) => x.folder === id);
  moved.forEach((x) => { x.folder = 'notes'; });
  kids.forEach((k) => { if (f.parent) k.parent = f.parent; else delete k.parent; });
  const i = S.folders.indexOf(f);
  S.folders.splice(i, 1);
  UI.stacks.notes = UI.stacks.notes.filter((p) => !(p.s === 'folders' && p.folder === id));
  if (!UI.stacks.notes.length) UI.stacks.notes = [{ s: 'nxfolders' }];
  save();
  render();
  undoToast('Folder deleted', () => {
    S.folders.splice(Math.min(i, S.folders.length), 0, f);
    moved.forEach((x) => { x.folder = id; });
    kids.forEach((k) => { k.parent = id; });
  });
  return true;
};
// Hold a folder: color, rename, move it into another folder, delete.
HOLD.nxfolder = async (el) => {
  const id = el.dataset.id, f = folderOf(id);
  if (!f) return;
  const items = [{ id: 'color', label: 'Color', g: 'palette' }];
  if (id !== 'notes') items.push({ id: 'rename', label: 'Rename', g: 'pencil' }, { id: 'move', label: 'Move into a folder', g: 'folderMove' }, { id: 'sub', label: 'New folder inside', g: 'folderPlus' }, '-', { id: 'delete', label: 'Delete folder', g: 'trash', danger: true });
  const v = await menu(el, items);
  if (v === 'color') folderColorSheet(id);
  if (v === 'rename') renameFolder(id);
  if (v === 'move') n20MoveFolder(id);
  if (v === 'sub') ACTIONS['n20-newsub']({ dataset: { id } });
  if (v === 'delete') deleteFolder(id);
};
function n20FolderPicker(skip, current, act, extra) {
  const rows = [];
  const walk = (p, d) => fKids(p).forEach((f) => { if (skip.has(f.id)) return; rows.push(`<button class="row" data-act="${act}" data-v="${f.id}" ${extra}>${d ? `<span class="n20-ind" style="width:${d * 20}px"></span>` : ''}${glyph('folder', 'row-g')}<span class="lbl">${esc(f.name)}</span>${f.id === current ? glyph('check', 'tick') : ''}</button>`); if (d < 4) walk(f.id, d + 1); });
  walk(null, 0);
  return rows.join('');
}
function n20MoveFolder(id) {
  const f = folderOf(id);
  if (!f) return;
  const skip = new Set([id, ...fDesc(id)]);
  openSheet(`${sheetHead('Move folder', '', '<button data-act="close-sheet">Cancel</button>')}
    <div class="sheet-body"><p class="foot" style="margin-top:0">Move “${esc(f.name)}” into:</p><div class="card"><button class="row" data-act="n20-fmove" data-v="" data-id="${id}">${glyph('folder', 'row-g')}<span class="lbl">Top level</span>${!f.parent ? glyph('check', 'tick') : ''}</button>${n20FolderPicker(skip, f.parent, 'n20-fmove', `data-id="${id}"`)}</div></div>`);
}
ACTIONS['n20-fmove'] = (el) => {
  const f = folderOf(el.dataset.id);
  if (!f) return;
  if (el.dataset.v) f.parent = el.dataset.v; else delete f.parent;
  save();
  closeSheet();
  render();
  buzz(8);
  toast(el.dataset.v ? `Moved into “${folderName(el.dataset.v)}”` : 'Moved to the top');
};
// Moving a note: the folders as a tree.
moveSheet = function (id, after) {
  const n = noteOf(id);
  if (!n) return;
  const notes = S.folders.find((f) => f.id === 'notes');
  openSheet(`${sheetHead('Move to folder', '', '<button data-act="close-sheet">Cancel</button>')}
    <div class="sheet-body"><div class="card">${notes ? `<button class="row" data-act="note-move-to" data-id="${n.id}" data-v="notes">${glyph('folder', 'row-g')}<span class="lbl">Notes</span>${n.folder === 'notes' ? glyph('check', 'tick') : ''}</button>` : ''}${n20FolderPicker(new Set(), n.folder, 'note-move-to', `data-id="${n.id}"`)}</div>
    <button class="add-link" data-act="new-folder-move" data-id="${n.id}">${glyph('folderPlus')}New folder</button></div>`);
  moveSheet.after = after;
};
// The ••• menu inside a folder also makes a folder inside it and moves the folder.
{
  const _nm = ACTIONS['notes-menu'];
  ACTIONS['notes-menu'] = async function (el) {
    const e = cur();
    const custom = e.folder !== 'all' && e.folder !== 'notes' && e.folder !== '__locked' && folderOf(e.folder);
    if (!custom) return _nm.apply(this, arguments);
    const k = S.settings.noteSort;
    const v = await menu(el, [
      { id: 'sort:edited', label: 'Sort by date edited', check: k === 'edited' },
      { id: 'sort:created', label: 'Sort by date created', check: k === 'created' },
      { id: 'sort:title', label: 'Sort by title', check: k === 'title' },
      '-',
      { id: 'sub', label: 'New folder inside', g: 'folderPlus' },
      { id: 'move', label: 'Move this folder', g: 'folderMove' },
      { id: 'rename', label: `Rename “${folderName(e.folder)}”`, g: 'pencil' },
      { id: 'delete', label: 'Delete folder', g: 'trash', danger: true },
    ]);
    if (!v) return;
    if (v.startsWith('sort:')) { S.settings.noteSort = v.slice(5); save(); render(); return; }
    if (v === 'sub') ACTIONS['n20-newsub']({ dataset: { id: e.folder } });
    if (v === 'move') n20MoveFolder(e.folder);
    if (v === 'rename') renameFolder(e.folder);
    if (v === 'delete') deleteFolder(e.folder);
  };
}

/* ---------- 4b. Hold a note and drag it onto a folder ---------- */
const N20P = { down: false, type: '', x: 0, y: 0 };
document.addEventListener('pointerdown', (e) => { N20P.down = true; N20P.type = e.pointerType; N20P.x = e.clientX; N20P.y = e.clientY; }, true);
['pointerup', 'pointercancel'].forEach((k) => document.addEventListener(k, () => { N20P.down = false; }, true));
let N20D = null;
{
  const _hn = HOLD.note;
  HOLD.note = (el) => {
    if (!N20P.down || !el.closest('.screen[data-s="folders"]')) return _hn(el);
    n20Lift(el, () => _hn(el));
  };
}
function n20Lift(el, menuFn) {
  if (N20D) return;
  const id = el.dataset.id, n = noteOf(id);
  if (!n) return menuFn();
  el.classList.add('n20-lift');
  N20D = { el, id, n, x0: N20P.x, y0: N20P.y, drag: false, menuFn, target: null };
  const touch = N20P.type === 'touch';
  const mv = (x, y, ev) => {
    if (!N20D) return;
    if (ev && ev.cancelable) ev.preventDefault(); // (the list doesn't scroll while a note is held)
    if (!N20D.drag && Math.hypot(x - N20D.x0, y - N20D.y0) > 12) n20DragStart();
    if (N20D.drag) n20DragMove(x, y);
  };
  const up = (x, y) => { off(); n20Drop(x, y); };
  const tm = (e) => mv(e.touches[0].clientX, e.touches[0].clientY, e);
  const te = (e) => { const t = e.changedTouches[0]; up(t.clientX, t.clientY); };
  const pm = (e) => mv(e.clientX, e.clientY, e);
  const pu = (e) => up(e.clientX, e.clientY);
  const off = () => { document.removeEventListener('touchmove', tm, { passive: false }); document.removeEventListener('touchend', te); document.removeEventListener('touchcancel', te); window.removeEventListener('pointermove', pm, true); window.removeEventListener('pointerup', pu, true); };
  if (touch) { document.addEventListener('touchmove', tm, { passive: false }); document.addEventListener('touchend', te); document.addEventListener('touchcancel', te); }
  else { window.addEventListener('pointermove', pm, true); window.addEventListener('pointerup', pu, true); }
}
function n20DragStart() {
  const d = N20D;
  d.drag = true;
  buzz(10);
  const r = d.el.getBoundingClientRect();
  const g = d.el.cloneNode(true);
  g.className = 'ncard n20-ghost';
  g.style.width = r.width + 'px';
  g.style.left = r.left + 'px';
  g.style.top = r.top + 'px';
  document.body.appendChild(g);
  d.ghost = g;
  d.dx = d.x0 - r.left;
  d.dy = d.y0 - r.top;
  d.gx = r.left; d.gy = r.top;
  d.el.classList.add('n20-away');
  const list = [S.folders.find((f) => f.id === 'notes'), ...(() => { const out = []; const walk = (p) => fKids(p).forEach((f) => { out.push(f); walk(f.id); }); walk(null); return out; })()].filter((f) => f && f.id !== d.n.folder);
  const dock = document.createElement('div');
  dock.className = 'n20-dock';
  dock.innerHTML = `<div class="n20-dock-t">Drop on a folder</div><div class="n20-dock-l">${list.map((f) => `<div class="n20-dt" data-f="${f.id}"><span class="tile round" style="--c:${folderColor(f.id)}">${glyph('folder')}</span><span>${esc(f.parent ? fPath(f.id) : f.name)}</span></div>`).join('') || '<div class="n20-dock-e">Make another folder first</div>'}</div>`;
  document.body.appendChild(dock);
  d.dock = dock;
  requestAnimationFrame(() => { dock.classList.add('on'); g.classList.add('on'); });
}
function n20DragMove(x, y) {
  const d = N20D;
  d.gx = x - d.dx; d.gy = y - d.dy;
  d.ghost.style.transform = `translate3d(${d.gx - parseFloat(d.ghost.style.left)}px, ${d.gy - parseFloat(d.ghost.style.top)}px, 0) scale(.92)`;
  const hit = document.elementFromPoint(x, y), t = hit && hit.closest('.n20-dt');
  if (t !== d.target) { if (d.target) d.target.classList.remove('hot'); d.target = t; if (t) { t.classList.add('hot'); buzz(6); } }
  // (near the edge of the folder row: it scrolls sideways)
  const l = d.dock.querySelector('.n20-dock-l');
  if (l && y > d.dock.getBoundingClientRect().top) { if (x < 40) l.scrollLeft -= 8; else if (x > innerWidth - 40) l.scrollLeft += 8; }
}
function n20Drop() {
  const d = N20D;
  N20D = null;
  if (!d) return;
  heldAt = Date.now(); // (the finger lifting doesn't also open the note)
  d.el.classList.remove('n20-lift');
  if (!d.drag) { d.menuFn(); return; }
  const fid = d.target && d.target.dataset.f;
  const end = () => { if (d.ghost) d.ghost.remove(); if (d.dock) d.dock.remove(); d.el.classList.remove('n20-away'); };
  if (d.dock) d.dock.classList.remove('on');
  if (fid && d.n) {
    const was = d.n.folder;
    d.n.folder = fid;
    save(d.n);
    buzz(12);
    d.ghost.classList.add('gone');
    setTimeout(() => { end(); render(); }, 220);
    undoToast(`Moved to ${folderName(fid)}`, () => { d.n.folder = was; save(d.n); });
  } else {
    d.ghost.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1), opacity .22s';
    d.ghost.style.transform = 'translate3d(0,0,0) scale(1)';
    setTimeout(end, 230);
  }
}

/* ---------- Settings: the spelling check can be switched off ---------- */
{
  const _sr = SCREENS.settings.render;
  SCREENS.settings.render = function () {
    const h = _sr.apply(this, arguments);
    return h.replace('<h2 class="sec">AI helper</h2>', `<h2 class="sec">Spelling</h2><div class="card"><label class="row">${tile('sparkles', '#FF3B30')}<span class="lbl">Check spelling as I type<small>Wrong words get a red line. Tap one to fix it</small></span>${toggle('n20spell', spellOn(), 'Check spelling as I type')}</label></div><h2 class="sec">AI helper</h2>`);
  };
  document.addEventListener('change', (e) => {
    if (e.target.name !== 'n20spell') return;
    try { localStorage.setItem('notes-spell', e.target.checked ? 'on' : 'off'); } catch (err) { /* ignore */ }
    toast(e.target.checked ? 'Spelling check is on' : 'Spelling check is off');
  });
}
