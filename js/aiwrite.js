'use strict';
/* AI helpers for writing, at the top of a note's ••• menu:
   Check Writing — IELTS-style marking of the note (Task 2 · Task 1 · Letter) or just corrections;
   Make Vocabulary — words, phrasal verbs and collocations for a topic and level, added as a table;
   Photo to Text — the words in a photo (a page, the board, handwriting) typed into the note.
   They use the AI helper (aiCall in draw.js) and its free daily allowance. */

const aiWords = (s) => String(s || '').split(/\s+/).filter((w) => /[A-Za-z0-9À-ɏЀ-ӿ]/.test(w)).length;
const aiHash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
// Glide the note down to something just added (after the sheet has slid away).
function glideTo(node, wait = 480) {
  setTimeout(() => {
    const scr = node && node.isConnected && node.closest('.scroll');
    if (!scr) return;
    const y = node.getBoundingClientRect().top - scr.getBoundingClientRect().top;
    if (y > 60 && y < scr.clientHeight - 120) return; // already in view
    scr.scrollTo({ top: Math.max(0, scr.scrollTop + y - 12), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, wait);
}
const needNet = (what) => { if (navigator.onLine) return true; toast(`${what} needs the internet`); return false; };

// ---------- Check Writing ----------
// Task 1 and letters are not offered: only Task 2 marking has been checked against IELTS examiners' bands.
const CW_TASKS = [['t2', 'Task 2 Essay'], ['none', 'Correct only']];
const CW_NAMES = { tr: 'Task Response', ta: 'Task Achievement', cc: 'Coherence & Cohesion', lr: 'Lexical Resource', gra: 'Grammar Range & Accuracy' };
const CW_FEEDBACK = /^Writing check\b/; // the heading of feedback already added to the note
const CW_QUESTION = /\?\s*$|to what extent|agree or disagree|both (these )?views|your (own )?opinion|advantages|disadvantages|outweigh|positive or (a )?negative|give reasons|write a letter|the (chart|graph|table|diagram|map)s? (below )?shows?/i;
let CW = null;
const cwDone = new Map(); // what was already checked (task + text) → the answer, so opening the sheet again is free

// The note as plain text: one line per paragraph. Photos, drawings, tables, answers and feedback
// already added by Check Writing are left out.
function cwLines() {
  const lines = [];
  for (const b of ED ? ED.ed.children : []) {
    if (b.matches('.ph, .mq, table, hr')) continue;
    if (/^H[1-3]$/.test(b.tagName) && CW_FEEDBACK.test(b.textContent.trim())) break;
    if (b.matches('ul, ol')) { for (const li of b.querySelectorAll(':scope > li')) { const t = li.textContent.trim(); if (t) lines.push(t); } continue; }
    const t = (b.innerText || b.textContent || '').replace(/ /g, ' ').replace(/\n{2,}/g, '\n').trim();
    if (t) lines.push(t);
  }
  return lines;
}
// The task question (the first lines, if they are one) is sent apart from the answer: it isn't
// marked, it only shows the examiner what was asked. A short title line is left out.
function cwSplit(lines) {
  let from = 0;
  if (lines.length > 1 && aiWords(lines[0]) <= 8 && !/[.?!]$/.test(lines[0]) && !CW_QUESTION.test(lines[0])) from = 1;
  for (let n = Math.min(from + 4, lines.length - 1); n > from; n--) {
    const head = lines.slice(from, n);
    if (CW_QUESTION.test(head[head.length - 1]) && aiWords(head.join(' ')) <= 140 && aiWords(lines.slice(n).join(' ')) >= 40) return { question: head.join(' '), text: lines.slice(n).join('\n') };
  }
  return { question: '', text: lines.slice(from).join('\n') };
}
const cwKey = () => `${CW.task}|${aiHash(CW.question + '\n' + CW.text)}`;
function cwRead() {
  const { question, text } = cwSplit(cwLines());
  CW.question = question;
  CW.text = text;
  CW.words = aiWords(text);
  const r = cwDone.get(cwKey());
  if (r) { CW.state = 'done'; CW.res = r; } else if (CW.state !== 'busy') { CW.state = 'idle'; CW.res = null; }
}

function checkWriting() {
  if (!ED) return;
  CW = { id: ED.id, task: S.settings.cwTask === 'none' ? 'none' : 't2', state: 'idle', res: null, err: '', note: '' };
  cwRead();
  openSheet(cwSheetHtml(), cwMount, 'tall cw-sheet');
}
function cwSheetHtml() {
  return `${sheetHead('Check Writing', '<button data-act="close-sheet">Done</button>', '')}
    <div class="sheet-body">
      <div class="seg cw-seg">${segButtons('cw-task', CW_TASKS, CW.task)}</div>
      <div class="cw-main">${cwMainHtml()}</div>
    </div>`;
}
function cwMount() { /* all taps go through ACTIONS */ }
// Swap what the sheet shows, gliding to the new height.
function cwView() {
  const sh = sheet && sheet.sh;
  const m = sh && $('.cw-main', sh);
  if (!m || !CW) return;
  const seg = $('.cw-seg', sh);
  seg.classList.toggle('off', CW.state === 'busy');
  smoothHeight(m, () => { m.innerHTML = cwMainHtml(); });
  m.classList.remove('in');
  void m.offsetWidth;
  m.classList.add('in');
  if (CW.state === 'busy') requestAnimationFrame(() => requestAnimationFrame(() => { const b = $('.cw-prog i', m); if (b) b.style.width = '92%'; }));
}

// The band is always shown as a half-band range, on the strict side (the user's choice, 2026-10-02: when in doubt
// the lower band, so a student aims higher): it ends at the marking's average rounded down to a half band.
function cwBandText(avg) {
  const q = Math.round(avg * 4) / 4, hi = Math.max(1, Math.floor(q * 2) / 2), lo = hi - 0.5;
  const f = (v) => (v % 1 ? v.toFixed(1) : String(v));
  return { big: f(lo) + '–' + f(hi), lo, hi };
}
// One correction as it reads in the essay: words that stay are plain, what goes is struck through and what comes in
// is bold — "she go" → "she go<b>es</b>", "however I" → "however<b>,</b> I".
function cwDiffHtml(from, to) {
  const a = from.split(/\s+/), b = to.split(/\s+/);
  const L = a.map(() => Array(b.length + 1).fill(0)).concat([Array(b.length + 1).fill(0)]);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0, del = [], ins = [];
  const flush = () => {
    if (del.length === 1 && ins.length === 1) { // one word changed: show just the letters that differ
      const x = del[0], y = ins[0];
      let p = 0; while (p < x.length && p < y.length && x[p] === y[p]) p++;
      let s = 0; while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
      out.push(esc(x.slice(0, p)) + (x.length - s > p ? `<s>${esc(x.slice(p, x.length - s))}</s>` : '') + (y.length - s > p ? `<b>${esc(y.slice(p, y.length - s))}</b>` : '') + esc(x.slice(x.length - s)));
    } else {
      if (del.length) out.push(`<s>${esc(del.join(' '))}</s>`);
      if (ins.length) out.push(`<b>${esc(ins.join(' '))}</b>`);
    }
    del = []; ins = [];
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { flush(); out.push(esc(a[i])); i++; j++; }
    else if (j < b.length && (i >= a.length || L[i][j + 1] >= L[i + 1][j])) ins.push(b[j++]);
    else del.push(a[i++]);
  }
  flush();
  return out.join(' ');
}
// The essay with every mistake marked where it is (the first place each wrong phrase appears that no other mark
// already covers). Tap a mark to see why.
function cwMarks(text, fixes) {
  const marks = [];
  fixes.forEach((f, i) => {
    // any run of spaces or line breaks in the essay matches a space in the correction
    const re = new RegExp(f.from.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'g');
    for (let m; f.from.trim() && (m = re.exec(text));) {
      const at = m.index, end = at + m[0].length;
      if (!marks.some((x) => at < x.end && end > x.at)) { marks.push({ at, end, i }); break; }
      re.lastIndex = at + 1;
    }
  });
  return marks.sort((x, y) => x.at - y.at);
}
function cwMarkedHtml(text, fixes) {
  let h = '', k = 0;
  for (const m of cwMarks(text, fixes)) {
    h += esc(text.slice(k, m.at)) + `<span class="cw-m" data-act="cw-why" data-i="${m.i}">${cwDiffHtml(fixes[m.i].from, fixes[m.i].to)}</span>`;
    k = m.end;
  }
  h += esc(text.slice(k));
  // A line that doesn't end a sentence was broken by the page (a photo, or typed line by line): join it to the next.
  const ends = (p) => /[.!?:"”)]\s*(<\/(b|s|span)>\s*)*$/.test(p);
  const paras = h.split('\n').filter((p) => p.trim()).reduce((ps, l) => {
    if (ps.length && !ends(ps[ps.length - 1])) ps[ps.length - 1] += ' ' + l.trim(); else ps.push(l.trim());
    return ps;
  }, []);
  return paras.map((p) => `<p>${p}</p>`).join('');
}
const CW_KINDS = { word: 'word', collocation: 'collocation', phrasal: 'phrasal verb' };
function cwMainHtml() {
  const c = CW, none = c.task === 'none';
  const cost = 'Takes about 15 seconds and uses about 1% of today\'s AI allowance.';
  const info = `<div class="cw-info"><b>${c.words.toLocaleString('en-US')} word${c.words === 1 ? '' : 's'}</b>${c.question ? `<span>Question: ${esc(c.question.length > 150 ? c.question.slice(0, 150) + '…' : c.question)}</span>` : ''}${c.note ? `<span class="cw-hint">${esc(c.note)}</span>` : ''}</div>`;
  if (c.state === 'busy') {
    return `<div class="card cw-wait">${info}<div class="cw-prog"><i></i></div><div class="cw-wt">${none ? 'Finding the mistakes…' : 'Marking it like an examiner…'}</div></div>`;
  }
  if (c.state === 'done' && c.res) return cwResultHtml(c.res);
  const photo = `<button class="cw-alt" data-act="cw-photo">${glyph('camera')}Check a Photo of Writing</button>`;
  if (c.state === 'error') return `<div class="card cw-idle">${info}</div><p class="cw-err">${esc(c.err)}</p><button class="cw-go" data-act="cw-go">Try Again</button>${photo}`;
  if (c.words < 30) return `<div class="card cw-idle">${info}</div><p class="cw-note">Write (or paste) the essay in this note first — at least a few sentences. You can put the task question on the first line.</p>${photo}`;
  return `<div class="card cw-idle">${info}</div>
    <button class="cw-go" data-act="cw-go">${none ? 'Find the Mistakes' : 'Check'}</button>${photo}
    <p class="cw-note">${cost}${none ? '' : ' Marked against the official IELTS band descriptors and essays scored by IELTS examiners — an estimate, not an official score.'}</p>`;
}
function cwResultHtml(r) {
  const none = r.task === 'none';
  let h = '';
  if (!none && r.avg != null) {
    const b = cwBandText(r.avg);
    h += `<div class="card cw-band"><div class="big">${b.big}</div><div class="t"><b>Estimated band</b>Marked on the strict side — a real examiner may give up to half a band more.${r.words < (r.task === 't2' ? 250 : 150) ? ` Under ${r.task === 't2' ? 250 : 150} words (${r.words}) — this lowers the score.` : ''}</div></div>
`;
    if (r.weak && r.weak.length) h += `<h2 class="sec">Key weaknesses</h2><div class="card">${r.weak.map((t) => `<div class="cw-fix cw-weak">${esc(t)}</div>`).join('')}</div>`;
    h += `<h2 class="sec">The four criteria</h2><div class="card">`;
    for (const k of ['tr', 'ta', 'cc', 'lr', 'gra']) {
      const c = r.crit[k];
      if (!c) continue;
      h += `<div class="cw-crit"><b>${CW_NAMES[k]}</b><span class="n">${c.band}</span><span class="why">${esc(c.why)}${c.quote ? ` <q>${esc(c.quote)}</q>` : ''}</span></div>`;
    }
    h += '</div>';
  }
  const marked = r.text ? cwMarks(r.text, r.fixes).length : 0;
  if (marked) h += `<h2 class="sec">Your essay, marked</h2><div class="card cw-essay">${cwMarkedHtml(r.text, r.fixes)}<small>${marked} mistake${marked === 1 ? '' : 's'} · tap one to see why</small></div>`;
  if (r.vocab && r.vocab.length) {
    h += `<h2 class="sec">Vocabulary to upgrade</h2><div class="card cw-voc"><div class="cw-vr cw-vh"><span>In your essay</span><span>Try instead</span></div>${r.vocab.map((v) => `<div class="cw-vr"><span>${esc(v.used)}</span><span><b>${esc(v.better)}</b><small>${CW_KINDS[v.kind] || 'word'}</small></span></div>`).join('')}</div>`;
  }
  if (r.fixes.length) {
    const top = r.fixes.slice(0, 12), more = r.fixes.length - top.length;
    h += `<h2 class="sec">Corrections</h2><div class="card">${top.map((f) => `<div class="cw-fix"><s>${esc(f.from)}</s> → <ins>${esc(f.to)}</ins>${f.why ? `<small>${esc(f.why)}</small>` : ''}</div>`).join('')}${more > 0 ? `<div class="cw-fix cw-more">${more} more ${marked ? 'marked in your essay above' : 'in the feedback'}</div>` : ''}</div>`;
  } else h += `<h2 class="sec">Corrections</h2><div class="card"><div class="cw-fix">No mistakes found.</div></div>`;
  if (r.tips && r.tips.length) h += `<h2 class="sec">To score higher</h2><div class="card">${r.tips.map((t) => `<div class="cw-fix">${esc(t)}</div>`).join('')}</div>`;
  h += `<button class="cw-go" data-act="cw-add">Add Feedback to the Note</button>`;
  return h;
}

ACTIONS['check-writing'] = () => checkWriting();
ACTIONS['cw-task'] = (el) => {
  if (!CW || CW.state === 'busy') return;
  CW.task = el.dataset.v;
  S.settings.cwTask = CW.task;
  save();
  const seg = el.closest('.seg');
  if (seg) seg.innerHTML = segButtons('cw-task', CW_TASKS, CW.task);
  CW.state = 'idle';
  CW.note = '';
  cwRead();
  cwView();
};
ACTIONS['cw-go'] = async () => {
  if (!CW || CW.state === 'busy' || !needNet('Checking writing')) return;
  const me = CW, key = cwKey();
  me.state = 'busy';
  cwView();
  try {
    const r = await aiCall('/write', { text: me.text, question: me.question || undefined, task: me.task }, 150000);
    if (!r || (me.task !== 'none' && (!r.crit || Object.keys(r.crit).length < 4))) throw new Error('ai');
    r.fixes = Array.isArray(r.fixes) ? r.fixes : [];
    r.vocab = Array.isArray(r.vocab) ? r.vocab : [];
    r.text = me.text; // the marks in "Your essay, marked" are found in exactly this text
    cwDone.set(key, r);
    if (CW !== me) return; // the sheet was closed: the answer is kept for next time
    me.state = 'done';
    me.res = r;
    const b = sheet && $('.cw-prog i', sheet.sh);
    if (b) { b.style.transition = 'width .25s ease-out'; b.style.width = '100%'; await new Promise((ok) => setTimeout(ok, 260)); }
    cwView();
    buzz(8);
  } catch (e) {
    if (CW !== me) { if (!(e && e.message === 'quota')) aiFail(e, "Couldn't check the writing just now", 'Checking writing needs the internet'); return; }
    me.state = 'error';
    me.err = e && e.message === 'quota' ? `Today's AI allowance is used up — it's back at ${hm(nextUtcMidnight())}.` : !navigator.onLine ? 'Checking writing needs the internet.' : "Couldn't check it just now — please try again in a moment.";
    cwView();
  }
};
// The feedback goes at the end of the note, under a "Writing check" heading.
ACTIONS['cw-add'] = () => {
  if (!CW || !CW.res || !ED || ED.id !== CW.id) return;
  const r = CW.res, none = r.task === 'none';
  const b = !none && r.avg != null ? cwBandText(r.avg) : null;
  const frag = document.createDocumentFragment();
  const add = (tag, html) => { const n = document.createElement(tag); n.innerHTML = html; frag.appendChild(n); return n; };
  add('h2', `Writing check${b ? ` — band ${b.big}` : ''}`);
  if (r.weak && r.weak.length) { add('div', '<b>Key weaknesses</b>'); add('ul', r.weak.map((t) => `<li>${esc(t)}</li>`).join('')); }
  if (!none) add('ul', ['tr', 'ta', 'cc', 'lr', 'gra'].filter((k) => r.crit[k]).map((k) => `<li><b>${CW_NAMES[k]} ${r.crit[k].band}</b> — ${esc(r.crit[k].why)}</li>`).join(''));
  // A copy of the essay with the corrections in place (the essay itself above stays as written).
  if (r.text && cwMarks(r.text, r.fixes).length) {
    add('div', '<b>Your essay, corrected</b>');
    const tmp = document.createElement('div');
    tmp.innerHTML = cwMarkedHtml(r.text, r.fixes);
    for (const p of tmp.children) add('div', p.innerHTML.replace(/<span[^>]*>|<\/span>/g, ''));
  }
  let vt = null;
  if (r.vocab && r.vocab.length) {
    add('div', '<b>Vocabulary to upgrade</b>');
    vt = document.createElement('table');
    const body = document.createElement('tbody');
    vt.className = 'fc';
    vt.appendChild(body);
    const row = (tag, cells) => { const tr = document.createElement('tr'); for (const c of cells) { const td = newCell(tag); td.textContent = c; tr.appendChild(td); } body.appendChild(tr); };
    row('th', ['In your essay', 'Try instead']);
    for (const v of r.vocab) row('td', [v.used, `${v.better} (${CW_KINDS[v.kind] || 'word'})`]);
    frag.appendChild(vt);
  }
  if (r.fixes.length) {
    add('div', '<b>Corrections</b>');
    add('ul', r.fixes.map((f) => `<li><s>${esc(f.from)}</s> → <b>${esc(f.to)}</b>${f.why ? ` (${esc(f.why)})` : ''}</li>`).join(''));
  }
  if (r.tips && r.tips.length) { add('div', '<b>To score higher</b>'); add('ul', r.tips.map((t) => `<li>${esc(t)}</li>`).join('')); }
  add('div', '<br>');
  histNow();
  const first = frag.firstChild;
  ED.ed.appendChild(frag);
  if (vt) fitTables(ED.ed);
  queueSave();
  saveEditor();
  closeSheet();
  glideTo(first);
  toast('Feedback added to the end of the note');
};
// Tap a marked mistake in "Your essay, marked": why it's wrong.
ACTIONS['cw-why'] = (el) => {
  const f = CW && CW.res && CW.res.fixes[+el.dataset.i];
  if (!f) return;
  for (const m of el.parentElement.querySelectorAll('.cw-m.on')) m.classList.remove('on');
  el.classList.add('on');
  toast(`${f.from} → ${f.to}${f.why ? ' — ' + f.why : ''}`);
};
// A photo of handwritten (or printed) writing: its words go into the note first, so you can fix any
// word that was read wrongly before it's marked.
ACTIONS['cw-photo'] = async (el) => {
  if (!CW || CW.state === 'busy') return;
  const v = await menu(el, [{ id: 'take', label: 'Take Photo', g: 'camera' }, { id: 'pick', label: 'Choose from Gallery', g: 'image' }]);
  if (v) { AIP.forCheck = true; $(v === 'take' ? '#ocr-take' : '#ocr-pick').click(); }
};

// ---------- Photo to Text ----------
const AIP = { forCheck: false, busy: false };
async function photoToText(file) {
  if (!ED || AIP.busy || !needNet('Reading a photo')) return;
  const me = ED, forCheck = AIP.forCheck;
  AIP.forCheck = false;
  AIP.busy = true;
  if (forCheck && CW) { CW.state = 'busy'; CW.note = ''; cwView(); const t = sheet && $('.cw-wt', sheet.sh); if (t) t.textContent = 'Reading the photo…'; }
  else toast('Reading the photo…');
  try {
    const blob = await shrinkImage(file, 2000);
    const img = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });
    const r = await aiCall('/ocr', { img }, 90000);
    const text = String((r && r.text) || '').trim();
    if (ED !== me) return;
    if (!text) {
      if (forCheck && CW) { CW.state = 'idle'; CW.note = 'No writing was found in that photo.'; cwRead(); cwView(); } else toast('No text found in that photo');
      return;
    }
    histNow();
    const blocks = textBlocks(text);
    if (forCheck) { for (const b of blocks) ED.ed.appendChild(b); } // the essay goes into the note
    else { let at = null; for (const b of blocks) { if (!at) insertBlock(b); else at.after(b); at = b; } }
    queueSave();
    saveEditor();
    if (forCheck && CW) { CW.state = 'idle'; CW.note = 'Read from the photo and added to the note. Compare it with the paper: fix words read wrongly, and put back any spelling mistakes the reader corrected (it sometimes does) — then tap Check.'; cwRead(); cwView(); }
    else { glideTo(blocks[0], 60); toast('Text added — you can edit it'); }
  } catch (e) {
    if (forCheck && CW && ED === me) { CW.state = 'error'; CW.err = e && e.message === 'quota' ? `Today's AI allowance is used up — it's back at ${hm(nextUtcMidnight())}.` : "Couldn't read that photo — please try again."; cwView(); }
    else aiFail(e, "Couldn't read that photo", 'Reading a photo needs the internet');
  } finally { AIP.busy = false; }
}
// Lines of text → note lines ("- …" and "1. …" become lists).
function textBlocks(text) {
  const out = [];
  let list = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const m = line.match(/^(?:([-•*])|(\d+)[.)])\s+(.*)$/);
    if (m) {
      const tag = m[1] ? 'UL' : 'OL';
      if (!list || list.tagName !== tag) { list = document.createElement(tag); out.push(list); }
      const li = document.createElement('li');
      li.textContent = m[3];
      list.appendChild(li);
      continue;
    }
    list = null;
    const d = document.createElement('div');
    if (line) d.textContent = line; else d.innerHTML = '<br>';
    if (line || (out.length && out[out.length - 1].textContent)) out.push(d);
  }
  while (out.length && !out[out.length - 1].textContent) out.pop();
  return out;
}
ACTIONS['photo-text'] = async (el) => {
  if (!needNet('Reading a photo')) return;
  const v = await menu(el, [{ id: 'take', label: 'Take Photo', g: 'camera' }, { id: 'pick', label: 'Choose from Gallery', g: 'image' }]);
  if (v) { AIP.forCheck = false; $(v === 'take' ? '#ocr-take' : '#ocr-pick').click(); }
};
document.addEventListener('change', (e) => {
  if (!e.target.matches('#ocr-take, #ocr-pick')) return;
  const f = e.target.files[0];
  e.target.value = '';
  if (f && /^image\//.test(f.type)) photoToText(f);
  else AIP.forCheck = false;
});

// ---------- Make Vocabulary ----------
const MV_LEVELS = ['A2', 'B1', 'B2', 'C1', 'IELTS'];
const MV_KINDS = [['word', 'Words'], ['phrasal', 'Phrasal verbs'], ['colloc', 'Collocations']];
let MV = null;
function makeVocab() {
  if (!ED) return;
  const n = noteOf(ED.id), title = n ? noteInfo(n.html || '').title || '' : '';
  MV = { id: ED.id, topic: MV && MV.id === ED.id ? MV.topic : (aiWords(title) <= 4 ? title : ''), level: S.settings.vocabLevel || 'B2', items: MV && MV.id === ED.id ? MV.items : [], busy: '' };
  openSheet(mvHtml(), mvMount, 'tall mv-sheet');
}
const mvItem = (it, i) => `<div class="mv-v${it.fresh ? ' in' : ''}" data-i="${i}"><b>${esc(it.term)}<span>${esc(it.meaning)}</span></b><span class="ex">${esc(it.example)}</span><button class="re" data-act="mv-swap" data-i="${i}" aria-label="Another one">${glyph('repeat')}</button></div>`;
function mvListHtml() {
  if (!MV.items.length) return MV.busy ? '<div class="mv-wait"><div class="cw-prog"><i></i></div><span>Finding words…</span></div>' : '';
  return MV_KINDS.map(([k, name]) => {
    const list = MV.items.map((it, i) => [it, i]).filter(([it]) => it.kind === k);
    return list.length ? `<div class="mv-h"><h4>${name}</h4></div><div class="card">${list.map(([it, i]) => mvItem(it, i)).join('')}</div>` : '';
  }).join('') + `<div class="mv-more"><button data-act="mv-more">${glyph('plus')}More</button><button data-act="mv-new">${glyph('repeat')}New set</button></div>
    <p class="cw-note">↻ swaps one item. "Add" puts them into the note as a Vocabulary table.</p>`;
}
function mvHtml() {
  return `${sheetHead('Make Vocabulary', '<button data-act="close-sheet">Cancel</button>', `<button class="strong" data-act="mv-add" ${MV.items.length ? '' : 'disabled'}>Add</button>`)}
    <div class="sheet-body">
      <div class="card"><div class="mv-in"><input name="mv-topic" placeholder="Topic — e.g. Travel, Environment" value="${esc(MV.topic)}" autocomplete="off" enterkeyhint="go"></div>
        <div class="mv-chips">${MV_LEVELS.map((l) => `<button class="mv-chip${l === MV.level ? ' on' : ''}" data-act="mv-level" data-v="${l}">${l}</button>`).join('')}</div></div>
      ${MV.items.length ? '' : `<button class="cw-go" data-act="mv-make">Make Vocabulary</button>`}
      <div class="mv-list">${mvListHtml()}</div>
    </div>`;
}
function mvMount(sh) {
  const i = $('input[name="mv-topic"]', sh);
  i.addEventListener('input', () => { MV.topic = i.value; });
  i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { i.blur(); if (!MV.items.length) ACTIONS['mv-make'](); } });
}
function mvRefresh() {
  const sh = sheet && sheet.sh;
  if (!sh || !MV) return;
  const l = $('.mv-list', sh), go = $('[data-act="mv-make"]', sh), add = $('[data-act="mv-add"]', sh);
  if (add) add.disabled = !MV.items.length;
  if (go && MV.items.length) go.remove();
  if (go) { go.disabled = !!MV.busy; go.classList.toggle('off', !!MV.busy); }
  smoothHeight(l, () => { l.innerHTML = mvListHtml(); });
  if (MV.busy && !MV.items.length) requestAnimationFrame(() => requestAnimationFrame(() => { const b = $('.cw-prog i', l); if (b) b.style.width = '92%'; }));
  MV.items.forEach((it) => { it.fresh = false; });
}
async function mvAsk(body) {
  const topic = MV.topic.trim();
  if (!topic) { toast('Type a topic first'); const i = sheet && $('input[name="mv-topic"]', sheet.sh); if (i) i.focus(); return null; }
  if (!needNet('Making vocabulary')) return null;
  try {
    const r = await aiCall('/vocab', { topic, level: MV.level, exclude: MV.items.map((it) => it.term), ...body }, 60000);
    return (r && Array.isArray(r.items) ? r.items : []).filter((it) => it && it.term);
  } catch (e) { aiFail(e, "Couldn't make vocabulary just now", 'Making vocabulary needs the internet'); return null; }
}
ACTIONS['make-vocab'] = () => makeVocab();
ACTIONS['mv-level'] = (el) => {
  if (!MV) return;
  MV.level = el.dataset.v;
  S.settings.vocabLevel = MV.level;
  save();
  $$('.mv-chip', sheet.sh).forEach((c) => c.classList.toggle('on', c.dataset.v === MV.level));
};
ACTIONS['mv-make'] = async () => {
  if (!MV || MV.busy) return;
  if (!MV.topic.trim()) { toast('Type a topic first'); return; }
  MV.busy = 'make';
  mvRefresh();
  const me = MV, items = await mvAsk({ n: 3 });
  if (MV !== me) return;
  MV.busy = '';
  if (items && items.length) MV.items = items.map((it) => ({ ...it, fresh: true }));
  mvRefresh();
};
ACTIONS['mv-new'] = async () => {
  if (!MV || MV.busy) return;
  MV.busy = 'new';
  const me = MV, items = await mvAsk({ n: 3 });
  if (MV !== me) return;
  MV.busy = '';
  if (items && items.length) { MV.items = items.map((it) => ({ ...it, fresh: true })); mvRefresh(); }
};
ACTIONS['mv-more'] = async (el) => {
  if (!MV || MV.busy) return;
  MV.busy = 'more';
  el.classList.add('off');
  const me = MV, items = await mvAsk({ n: 2 });
  if (MV !== me) return;
  MV.busy = '';
  el.classList.remove('off');
  if (items && items.length) { MV.items.push(...items.map((it) => ({ ...it, fresh: true }))); mvRefresh(); }
};
ACTIONS['mv-swap'] = async (el) => {
  if (!MV || MV.busy) return;
  const i = +el.dataset.i, old = MV.items[i];
  if (!old) return;
  MV.busy = 'swap';
  const row = el.closest('.mv-v');
  row.classList.add('busy');
  const me = MV, items = await mvAsk({ n: 1, kinds: [old.kind] });
  if (MV !== me) return;
  MV.busy = '';
  row.classList.remove('busy');
  const it = items && items.find((x) => x.kind === old.kind);
  if (!it) return;
  MV.items[i] = it;
  row.classList.add('out');
  setTimeout(() => {
    if (!row.isConnected) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = mvItem(it, i);
    const nr = tmp.firstChild;
    nr.classList.add('in');
    row.replaceWith(nr);
  }, 160);
};
ACTIONS['mv-add'] = () => {
  if (!MV || !MV.items.length || !ED || ED.id !== MV.id) return;
  const t = document.createElement('table'), body = document.createElement('tbody');
  t.className = 'fc';
  t.appendChild(body);
  const row = (tag, cells) => { const tr = document.createElement('tr'); for (const s of cells) { const c = newCell(tag); c.textContent = s; tr.appendChild(c); } body.appendChild(tr); };
  row('th', ['Word', 'Meaning', 'Example']);
  for (const it of MV.items) row('td', [it.term, it.meaning, it.example]);
  closeSheet();
  ED.ed.focus({ preventScroll: true });
  histNow();
  insertBlock(t);
  fitTables(ED.ed);
  queueSave();
  saveEditor();
  glideTo(t);
  toast(`${MV.items.length} item${MV.items.length === 1 ? '' : 's'} added`);
  MV.items = [];
};
