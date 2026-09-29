'use strict';
/* Maths in a note (handwritten maths is in draw.js).
   - Type a question on a line — a sum, an equation, "Σ k² for k = 1 to 10", "sd of 4, 8, 15",
     "d/dx (x³ + 2x)", "∫ x² dx", or a question in words — and tap ✨ Solve at the end of the line
     (or Maths → Solve this line). The answer appears in a green box under the line; Steps shows how.
   - Photo → Solve a Question…: the photo goes into the note, the answer (one box per question) under it.
   The app works maths out itself (mathsolve.js: exact, instant, works offline). Words and photos go to
   the AI helper, which also writes the question as maths; the app works that out too and checks the
   helper's answer with it ("✓ checked"). The box says how the question was understood, so a misreading
   shows. Changing the question turns its answer pale until ✨ is tapped again.
   In the note an answer is <div class="mq" data-q="the question" data-a="{…}">the answer as text</div>;
   data-a: m answer, s second line, u understood as, r read from the photo, st steps, ok checked,
   w still working, e couldn't. */

const MQ = { chip: null, t: 0, busy: new WeakSet() };

// ---------- Stored answers ----------
const mqStr = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
// The answer's data, made safe (used when the note is cleaned) — or null.
function mqData(json) {
  let a;
  try { a = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return null; }
  if (!a || typeof a !== 'object') return null;
  const o = { m: mqStr(a.m, 300), s: mqStr(a.s, 300), u: mqStr(a.u, 200), r: mqStr(a.r, 600), st: (Array.isArray(a.st) ? a.st : []).map((s) => mqStr(s, 300)).filter(Boolean).slice(0, 8) };
  if (a.ok) o.ok = 1;
  if (a.w) o.w = 1;
  if (a.e) o.e = 1;
  if (!o.m && !o.w && !o.e) return null;
  return o;
}
// What search and the note's preview see.
const mqPlain = (a) => (a.w || a.e ? '' : [a.m, a.s].filter(Boolean).join(' · '));
const mqOf = (box) => mqData(box.getAttribute('data-a')) || { m: '', st: [], e: 1 };
function mqHtml(a, photo) {
  if (a.w) return `<div class="mq-wait"><i class="mq-dots"><b></b><b></b><b></b></i>${photo ? 'Reading the question…' : 'Working it out…'}</div>`;
  if (a.e) return `<div class="mq-err"><span>${photo ? "Couldn't read a question in the photo" : "Couldn't work that out"}</span><button class="mq-btn" data-mq="retry">Try again</button><button class="mq-btn" data-mq="del">Remove</button></div>`;
  const read = a.r ? `<div class="mq-und">Read from the photo: <b>${esc(a.r)}</b></div>` : a.u ? `<div class="mq-und">Understood as: <b>${esc(a.u)}</b></div>` : '';
  const more = `${a.r && a.u ? `<p class="mq-und2">Understood as: <b>${esc(a.u)}</b></p>` : ''}${a.st.length ? `<ol>${a.st.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}<div class="mq-foot">${a.ok ? `<span class="mq-ok">${glyph('check')}Checked by the app</span>` : '<span></span>'}<button class="mq-btn" data-mq="del">Remove answer</button></div>`;
  return `${read}<div class="mq-row"><span class="mq-v">${esc(a.m)}${a.s ? ` <small>${esc(a.s)}</small>` : ''}</span><button class="mq-st" data-mq="steps" aria-label="${a.st.length ? 'Steps' : 'More'}">${a.st.length ? 'Steps' : ''}${glyph('chevD')}</button></div>
    <div class="mq-more"><div class="mq-in">${more}</div></div>`;
}
function mqRender(box) {
  const a = mqOf(box), photo = (box.getAttribute('data-q') || '').startsWith('photo:');
  box.contentEditable = 'false';
  box.classList.toggle('wait', !!a.w);
  box.classList.toggle('err', !!a.e);
  box.innerHTML = mqHtml(a, photo);
}
// (called when a note opens)
function mqPrepare(ed) {
  $$('.mq', ed).forEach(mqRender);
  mqStale(ed, false);
  // an answer that was still being worked out when the app closed
  $$('.mq.wait', ed).forEach((b) => { b.setAttribute('data-a', JSON.stringify({ e: 1 })); mqRender(b); });
}

// ---------- The question on a line ----------
const mqText = (el) => (el ? (el.innerText || el.textContent || '').replace(/[ ​]/g, ' ').replace(/\s+/g, ' ').trim() : '');
// The line with the cursor (a plain line or a heading; not a list, table or picture).
function mqLine() {
  if (!ED) return null;
  const sel = getSelection();
  if (!sel.rangeCount || !ED.ed.contains(sel.anchorNode)) return null;
  const b = topBlock(sel.anchorNode);
  if (!b || !/^(DIV|P|H1|H2|H3|BLOCKQUOTE)$/.test(b.tagName) || b.classList.contains('ph') || b.classList.contains('mq')) return null;
  return b;
}
// Does this line look like something to work out? (✨ Solve appears at its end.)
function looksLikeMath(s) {
  s = s.trim();
  if (s.length < 3 || s.length > 600) return false;
  if (/^\+?[\d\s()-]{7,}$/.test(s) || /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s) || /^\d{1,2}:\d{2}/.test(s)) return false; // phone numbers, dates, times
  if (/[Σ∑∫√π∏]|\bd\/d[a-z]\b|d²\/d|\b(?:sd|qd|iqr|nCr|gcd|lcm|hcf)\s*\(/i.test(s)) return true;
  if (/=\s*\??\s*$/.test(s) && /\d/.test(s)) return true; // ends with "="
  if (/^(?:find|calculate|compute|work out|evaluate|solve|simplify|expand|factori[sz]e|what(?:'s| is)|how (?:many|much|old|long|far|fast)|the\s+)?\s*(?:mean|average|median|mode|range|variance|standard deviation|quartiles?|lower quartile|upper quartile|interquartile|quartile deviation|derivative|differentiate|integral|integrate|sum of|product of|probability)\b/i.test(s) && /\d/.test(s)) return true;
  if (/^(?:solve|simplify|expand|factori[sz]e|evaluate|calculate|work out)\b/i.test(s) && /\d|[a-z]\s*[+\-=^]/.test(s)) return true;
  if (/[=<>≤≥]/.test(s) && /\d/.test(s) && s.length < 90 && unknownsIn(s).length && unknownsIn(s).length <= 2 && !/\b[a-z]{4,}\b/i.test(s.replace(/\b(?:sqrt|sin|cos|tan|log)\b/gi, ''))) return true; // 2x + 3 = 7
  if (/\?\s*$/.test(s) && (s.match(/\d+(?:[.,]\d+)?/g) || []).length >= 2) return true; // a word problem
  if (/^[\d\s+\-−*×÷/^().,%!²³√π]+$/.test(s) && /\d\s*[+\-−*×÷/^]\s*[\d(√π]/.test(s)) return true; // 12 × 7 + 3
  return false;
}

// ---------- ✨ Solve at the end of the line ----------
function mqScroller() { return ED && ED.ed.closest('.scroll'); }
function mqChipFor(line) {
  const scr = mqScroller();
  if (!scr) return;
  let c = MQ.chip;
  if (!c || c.parentElement !== scr) {
    if (c) c.remove(); // (it was in another note's screen)
    c = document.createElement('button');
    c.className = 'mq-chip';
    c.setAttribute('aria-label', 'Solve');
    c.innerHTML = `${glyph('sparkles')}<span>Solve</span>`;
    c.addEventListener('mousedown', (e) => e.preventDefault()); // (the keyboard stays up)
    c.addEventListener('click', (e) => { e.preventDefault(); const l = MQ.line; mqHideChip(); if (l && l.isConnected) mqSolve(l); });
    scr.appendChild(c);
    MQ.chip = c;
    c.getBoundingClientRect();
  }
  MQ.line = line;
  // just after the last letter of the line (or under its end when there's no room)
  const r = mqEndRect(line), sr = scr.getBoundingClientRect(), w = c.offsetWidth || 86, h = c.offsetHeight || 30;
  let x = r.right - sr.left + scr.scrollLeft + 8, y = r.top - sr.top + scr.scrollTop + (r.height - h) / 2;
  if (x + w > scr.clientWidth - 10) { x = scr.clientWidth - w - 14; y = r.bottom - sr.top + scr.scrollTop + 4; }
  const pos = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (!c.classList.contains('show')) { c.style.transition = 'none'; c.style.transform = pos; c.getBoundingClientRect(); c.style.transition = ''; requestAnimationFrame(() => c.classList.add('show')); } else c.style.transform = pos;
}
function mqEndRect(line) {
  const tw = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.textContent.trim()) last = n;
  if (last) {
    const r = document.createRange();
    const end = last.textContent.replace(/\s+$/, '').length;
    r.setStart(last, Math.max(0, end - 1));
    r.setEnd(last, end);
    const rs = r.getClientRects();
    if (rs.length) return rs[rs.length - 1];
  }
  return line.getBoundingClientRect();
}
function mqHideChip() {
  const c = MQ.chip;
  MQ.line = null;
  if (c) c.classList.remove('show');
}
// After typing or moving the cursor: ✨ on a maths line that has no up-to-date answer yet.
function mqCheck() {
  clearTimeout(MQ.t);
  MQ.t = setTimeout(() => {
    if (!ED || document.activeElement !== ED.ed) { mqHideChip(); return; }
    const sel = getSelection(), line = mqLine();
    const text = mqText(line);
    const next = line && line.nextElementSibling, fresh = next && next.classList.contains('mq') && !next.classList.contains('stale') && next.getAttribute('data-q') === text;
    if (line && sel.isCollapsed && !fresh && looksLikeMath(text)) mqChipFor(line); else mqHideChip();
  }, 220);
}

// ---------- Working it out ----------
function mqBox(after, q, a) {
  let box = after.nextElementSibling;
  const same = box && box.classList.contains('mq') && (box.getAttribute('data-q') === q || !q.startsWith('photo:'));
  if (same) {
    box.setAttribute('data-q', q);
    box.setAttribute('data-a', JSON.stringify(a));
    box.classList.remove('stale', 'open');
    mqSwap(box);
    return box;
  }
  box = document.createElement('div');
  box.className = 'mq new';
  box.setAttribute('data-q', q);
  box.setAttribute('data-a', JSON.stringify(a));
  mqRender(box);
  // the lines under it make room by gliding down
  const below = mqBelow(after), tops = mqTops(below);
  after.after(box);
  mqSlide(below, tops);
  setTimeout(() => box.classList.remove('new'), 400);
  return box;
}
// Smooth even on a slow phone: something changes size at once, and the lines under it glide from
// where they were (only transforms move — nothing is laid out again frame by frame); a box that
// grew is uncovered downwards.
const MQ_EASE = 'cubic-bezier(.2, .9, .3, 1)', MQ_MS = 300;
function mqBelow(el, extra = 0) {
  const scr = mqScroller(), sr = scr ? scr.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  const vt = Math.max(sr.top, 0) - 40, vb = Math.min(sr.bottom, innerHeight) + 40 + extra, out = [];
  for (let n = el.nextElementSibling; n && out.length < 60; n = n.nextElementSibling) {
    const r = n.getBoundingClientRect();
    if (r.top > vb) break;
    if (r.bottom >= vt) out.push(n);
  }
  return out;
}
const mqTops = (els) => els.map((n) => n.getBoundingClientRect().top);
function mqSlide(els, tops) {
  const o = { duration: MQ_MS, easing: MQ_EASE };
  els.forEach((n, i) => { const d = n.getBoundingClientRect().top - tops[i]; if (Math.abs(d) > 1) n.animate([{ transform: `translateY(${-d}px)` }, { transform: 'translateY(0)' }], o); });
}
function mqGlide(box, change) {
  const below = mqBelow(box, 240), tops = mqTops(below), h0 = box.getBoundingClientRect().height;
  change();
  if (!box.isConnected) return;
  const h1 = box.getBoundingClientRect().height;
  mqSlide(below, tops);
  if (h1 - h0 > 1) box.animate([{ clipPath: `inset(0 0 ${h1 - h0}px 0 round 12px)` }, { clipPath: 'inset(0 0 0 0 round 12px)' }], { duration: MQ_MS, easing: MQ_EASE });
}
// Shrinking: first glide (the part going away is covered up, the lines under it move up), then
// change — so nothing jumps.
function mqCollapse(box, d, extra, done) {
  const o = { duration: 260, easing: MQ_EASE, fill: 'forwards' };
  const an = [box.animate([{ clipPath: 'inset(0 0 0 0 round 12px)' }, { clipPath: `inset(0 0 ${d}px 0 round 12px)` }], o)]
    .concat(mqBelow(box, d).map((n) => n.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-d}px)` }], o)), extra || []);
  Promise.all(an.map((a) => a.finished)).catch(() => {}).then(() => { done(); an.forEach((a) => a.cancel()); });
}
// New content in a box: it fades in, and the lines under it glide to make (or give back) room.
function mqSwap(box) {
  if (!box.isConnected || box.classList.contains('new')) { mqRender(box); return; }
  mqGlide(box, () => mqRender(box));
  if (box.firstElementChild) box.firstElementChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
}
function mqSaved() { histNow(); queueSave(); }
function mqShow(box) {
  const scr = mqScroller();
  if (!scr || !box.isConnected) return;
  const r = box.getBoundingClientRect(), sr = scr.getBoundingClientRect(), bottom = Math.min(sr.bottom, innerHeight) - 90;
  if (r.bottom > bottom) scr.scrollBy({ top: Math.min(r.bottom - bottom, r.top - sr.top - 60), behavior: 'smooth' });
}
// The answer as the app worked it out.
const mqLocal = (r) => ({ m: r.main, s: r.sub, st: r.steps });
// The numbers in a piece of text (11/36, −4, 2,65 …).
function mqNums(s) {
  return (String(s).replace(/[−–]/g, '-').match(/-?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?/g) || []).map((t) => {
    const [a, b] = t.split('/').map((x) => parseFloat(x.replace(',', '.')));
    return b ? a / b : a;
  }).filter(Number.isFinite);
}
const mqPretty = (s) => String(s == null ? '' : s).replace(/\^\(?(-?\d+)\)?/g, (m, d) => supNum(d)).replace(/\*/g, '×').replace(/sqrt\(/g, '√(').replace(/(\s)-(\s)/g, '$1−$2').replace(/(^|[\s(=])-(?=\d)/g, '$1−');
// The helper's answer, checked with the app's own sums where it wrote the question as maths.
function mqFromAI(it, photo) {
  const a = { u: mqPretty(it.understood || ''), st: (it.steps || []).map(mqPretty) };
  if (photo) a.r = mqPretty(it.q || '');
  const math = Array.isArray(it.math) ? it.math : it.math ? [it.math] : [];
  let loc = null;
  try {
    if (math.length === 2 && math.every((m) => /=/.test(m)) && unknownsIn(math.join(' ')).length === 2) {
      const s = solveSystem(math[0], math[1]);
      if (s) loc = { main: s.lines.join(' · '), sub: '', steps: [] };
    } else if (math.length) {
      const rs = math.map((m) => solveQuestion(m));
      if (rs.every(Boolean)) loc = { main: rs.map((r) => r.main).join(' · '), sub: rs.map((r) => r.sub).filter(Boolean).join(' · '), steps: rs.flatMap((r) => r.steps) };
    }
  } catch (e) { loc = null; }
  if (!loc) { a.m = mqPretty(it.answer); return a; }
  const mine = mqNums(loc.main), theirs = mqNums(it.answer);
  const agree = mine.length > 0 && mine.every((v) => theirs.some((w) => Math.abs(v - w) <= Math.max(0.006, 0.005 * Math.abs(v))));
  // in words or with units ("Ann is 10", "80 km/h", "$8"), the helper's answer reads better
  const wordy = /[a-zа-яёʻ']{3,}|[$€£¥₽%]|\b(?:km|cm|mm|kg|m|g|h|s|l|ml|m²|cm²)\b/i.test(String(it.answer).replace(/\b(?:sin|cos|tan|ln|log|sqrt|dx|dy)\b/g, ''));
  a.ok = 1;
  if (agree && wordy && it.answer) a.m = mqPretty(it.answer);
  else { a.m = loc.main; a.s = loc.sub; if (!agree && loc.steps.length) a.st = loc.steps; }
  return a;
}
async function mqSolve(line) {
  if (!ED || !line || !line.isConnected || MQ.busy.has(line)) return;
  const q = mqText(line);
  if (!q) return;
  const me = ED;
  let local = null;
  try { local = solveQuestion(q); } catch (e) { local = null; }
  if (local) {
    const box = mqBox(line, q, mqLocal(local));
    mqAfter(line);
    setTimeout(() => mqShow(box), 60);
    buzz(8);
    return;
  }
  // words (or something the app can't do by itself): the AI helper
  if (!navigator.onLine) { toast('Questions in words need the internet — sums and formulas work without it'); return; }
  MQ.busy.add(line);
  const box = mqBox(line, q, { w: 1 });
  mqAfter(line);
  try {
    const r = await aiCall('/solve', { text: q }, 75000);
    const it = r && r.items && r.items[0];
    if (!it) throw new Error('none');
    if (ED !== me || !box.isConnected) { mqStore(me.id, q, [mqFromAI(it)]); return; }
    box.setAttribute('data-a', JSON.stringify(mqFromAI(it)));
    mqSwap(box);
    setTimeout(() => mqShow(box), 60);
    buzz(8);
  } catch (e) {
    if (ED === me && box.isConnected) { box.setAttribute('data-a', JSON.stringify({ e: 1 })); mqSwap(box); }
    aiFail(e, "Couldn't work that out just now — try again", 'Questions in words need the internet');
  } finally {
    MQ.busy.delete(line);
    if (ED === me) mqSaved();
  }
}
// After an answer: the cursor goes to a line under it, to keep writing.
function mqAfter(line) {
  let box = line.nextElementSibling;
  while (box && box.nextElementSibling && box.nextElementSibling.classList.contains('mq')) box = box.nextElementSibling;
  let next = box && box.nextElementSibling;
  if (!next || next.classList.contains('ph') || next.classList.contains('mq') || /^(TABLE|HR|UL|OL)$/.test(next.tagName) || mqText(next)) {
    next = document.createElement('div');
    next.innerHTML = '<br>';
    (box || line).after(next);
  }
  if (document.activeElement === ED.ed) caretAt(next, 0);
  else { const r = document.createRange(); r.setStart(next, 0); r.collapse(true); ED.range = r; }
  mqSaved();
}

// ---------- Photos of questions ----------
async function mqPhoto(file) {
  if (!ED) return;
  const me = ED;
  const phs = await addPhotos([file]);
  const ph = phs && phs[0];
  if (!ph || ED !== me) return;
  const id = $('img', ph).dataset.blob;
  const box = mqBox(ph, 'photo:' + id, { w: 1 });
  mqSaved();
  mqReadPhoto(box, ph, file);
}
async function mqReadPhoto(box, ph, file) {
  const me = ED;
  try {
    if (!file) { const url = await photoUrl($('img', ph).dataset.blob); file = url && (await (await fetch(url)).blob()); }
    if (!file) throw new Error('no photo');
    const small = await shrinkImage(file, 1400);
    const img = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(small); });
    const r = await aiCall('/solve', { img }, 100000);
    const items = (r && r.items) || [];
    if (!items.length) throw new Error('none');
    const q = box.getAttribute('data-q'), datas = items.map((it) => mqFromAI(it, true));
    if (ED !== me || !box.isConnected) { mqStore(me.id, q, datas); return; }
    mqFill(box, q, datas);
    setTimeout(() => mqShow(box), 60);
    buzz(8);
  } catch (e) {
    if (ED === me && box.isConnected) { box.setAttribute('data-a', JSON.stringify({ e: 1 })); mqSwap(box); }
    if (e && (e.message === 'none' || e.message === 'no photo')) return;
    aiFail(e, "Couldn't read the photo just now — try again", 'Solving a photo needs the internet');
  } finally {
    if (ED === me) mqSaved();
  }
}

// The answers for one question (a photo can hold several): the waiting box gets the first, and a box
// for each of the others follows it.
function mqFill(box, q, datas) {
  const root = box.parentElement;
  [...root.children].filter((b) => b !== box && b.classList.contains('mq') && b.getAttribute('data-q') === q).forEach((b) => b.remove());
  box.setAttribute('data-a', JSON.stringify(datas[0]));
  if (box.isConnected && ED && ED.ed.contains(box)) mqSwap(box); else mqRender(box);
  let last = box;
  for (const a of datas.slice(1)) {
    const b = document.createElement('div');
    b.className = 'mq new';
    b.setAttribute('data-q', q);
    b.setAttribute('data-a', JSON.stringify(a));
    last.after(b);
    mqRender(b);
    setTimeout(() => b.classList.remove('new'), 400);
    last = b;
  }
}
// An answer that arrives after you've left the note still goes into it (into the open editor if
// you've come back to it, otherwise into the saved note) — so nothing has to be asked twice.
function mqStore(id, q, datas) {
  if (ED && ED.id === id) {
    const box = $$('.mq', ED.ed).find((b) => b.getAttribute('data-q') === q);
    if (box) { mqFill(box, q, datas); mqSaved(); }
    return;
  }
  const n = noteOf(id);
  if (!n || n.locked || !n.html) return;
  const body = parseBody(n.html);
  const box = $$('.mq', body).find((b) => b.getAttribute('data-q') === q);
  if (!box) return;
  mqFill(box, q, datas);
  const html = cleanBody(body).innerHTML, info = noteInfo(html);
  n.html = html;
  n.preview = info.preview;
  n.text = info.text;
  save(n);
}

// ---------- In the note: Steps, Remove, Try again; keeping answers with their questions ----------
function mqRemove(box, auto) {
  if (box.classList.contains('gone')) return;
  if (!auto) histNow();
  box.classList.add('gone');
  box.style.pointerEvents = 'none';
  const next = box.nextElementSibling, r = box.getBoundingClientRect();
  const d = next ? next.getBoundingClientRect().top - r.top : r.height, o = { duration: 260, easing: MQ_EASE, fill: 'forwards' };
  const an = [box.animate([{ opacity: 1, clipPath: 'inset(0 0 0 0 round 12px)' }, { opacity: 0, clipPath: `inset(0 0 ${r.height}px 0 round 12px)` }], o)]
    .concat(mqBelow(box, d).map((n) => n.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-d}px)` }], o)));
  Promise.all(an.map((x) => x.finished)).catch(() => {}).then(() => {
    box.remove();
    an.forEach((x) => x.cancel());
    if (auto) queueSave(); else mqSaved();
  });
}
function mqToggle(box) {
  const more = $('.mq-more', box), inner = $('.mq-in', box);
  if (!more || box._busy) return;
  if (!box.classList.contains('open')) {
    mqGlide(box, () => box.classList.add('open'));
    if (inner) inner.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280, easing: 'ease-out' });
  } else {
    box._busy = true;
    const d = more.getBoundingClientRect().height;
    mqCollapse(box, d, inner ? [inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' })] : [], () => { box.classList.remove('open'); box._busy = false; });
  }
  buzz(4);
}
function mqClick(ev) {
  const b = ev.target.closest('[data-mq]');
  const box = ev.target.closest('.mq');
  if (!box || !ED || !ED.ed.contains(box)) return false;
  ev.preventDefault();
  if (!b) return true;
  const act = b.dataset.mq, q = box.getAttribute('data-q') || '';
  if (act === 'steps') mqToggle(box);
  if (act === 'del') mqRemove(box);
  if (act === 'retry') {
    if (q.startsWith('photo:')) {
      const ph = $$('.ph', ED.ed).find((p) => { const i = $('img', p); return i && i.dataset.blob === q.slice(6); });
      if (!ph) { mqRemove(box); return true; }
      box.setAttribute('data-a', JSON.stringify({ w: 1 }));
      mqSwap(box);
      mqReadPhoto(box, ph, null);
    } else {
      const line = box.previousElementSibling;
      if (line && mqText(line) === q) mqSolve(line); else toast('The question has changed — tap ✨ Solve on it again');
    }
  }
  return true;
}
// Answers whose question has changed turn pale (✨ works it out again); if the question is gone
// altogether, its answer goes too.
function mqStale(ed, tidy = true) {
  $$('.mq:not(.gone)', ed).forEach((box) => {
    const q = box.getAttribute('data-q') || '';
    if (q.startsWith('photo:')) return;
    let prev = box.previousElementSibling;
    while (prev && prev.classList.contains('mq')) prev = prev.previousElementSibling;
    const t = mqText(prev);
    if (!prev || prev.classList.contains('ph') || !t) { if (tidy && !box.classList.contains('wait')) mqRemove(box, true); else box.classList.add('stale'); return; }
    box.classList.toggle('stale', t !== q);
  });
}
// Enter at the end of a question: the new line goes under its answer, not between them.
function mqAfterEnter() {
  const line = mqLine();
  if (!line || mqText(line)) return;
  const prev = line.previousElementSibling, next = line.nextElementSibling;
  if (!prev || !next || !next.classList.contains('mq') || mqText(prev) !== next.getAttribute('data-q')) return;
  let last = next;
  while (last.nextElementSibling && last.nextElementSibling.classList.contains('mq')) last = last.nextElementSibling;
  last.after(line);
  caretAt(line, 0);
}
// Backspace at the start of the line under an answer goes back to the end of the question
// (an empty line goes away) instead of deleting the answer.
function mqBackspace(ev) {
  const sel = getSelection();
  const line = mqLine();
  if (!line || !sel.isCollapsed) return false;
  const before = document.createRange();
  before.selectNodeContents(line);
  before.setEnd(sel.anchorNode, sel.anchorOffset);
  if (before.toString() !== '') return false;
  const box = line && line.previousElementSibling;
  if (!box || !box.classList.contains('mq')) return false;
  if (!ev.cancelable) return false;
  ev.preventDefault();
  let q = box;
  while (q && q.classList.contains('mq')) q = q.previousElementSibling;
  if (!mqText(line) && !line.querySelector('img')) line.remove();
  if (q && !q.classList.contains('ph')) {
    const r = document.createRange();
    r.selectNodeContents(q);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  mqSaved();
  return true;
}
// Delete at the end of a question doesn't pull its answer into it.
function mqDeleteForward(ev) {
  const line = mqLine(), sel = getSelection();
  if (!line || !sel.isCollapsed || !ev.cancelable) return false;
  const next = line.nextElementSibling;
  if (!next || !next.classList.contains('mq')) return false;
  const r = document.createRange();
  r.selectNodeContents(line);
  r.setStart(sel.anchorNode, sel.anchorOffset);
  if (r.toString().trim()) return false;
  ev.preventDefault();
  return true;
}
function mqBind(me) {
  const ed = me.ed;
  ed.addEventListener('click', (ev) => { if (mqClick(ev)) ev.stopImmediatePropagation(); }, true);
  ed.addEventListener('input', (ev) => {
    if (ev.inputType === 'insertParagraph') mqAfterEnter();
    clearTimeout(me.mqT);
    me.mqT = setTimeout(() => { if (ED === me) mqStale(ed); }, 350);
    mqCheck();
  });
  ed.addEventListener('blur', () => setTimeout(() => { if (!ED || document.activeElement !== ED.ed) mqHideChip(); }, 120));
}
document.addEventListener('selectionchange', () => { if (ED) mqCheck(); });

// ---------- The Maths panel ----------
const MQ_KEYS = [
  [['Σ', 'Σ '], ['∫', '∫ '], ['d/dx', 'd/dx '], ['√', '√'], ['x²', '²'], ['xⁿ', '^']],
  [['π', 'π'], ['×', '×'], ['÷', '÷'], ['(', '('], [')', ')'], ['=', '=']],
  [['mean', 'mean of '], ['median', 'median of '], ['SD', 'SD of '], ['quartiles', 'quartiles of ']],
];
const mqPanelHtml = () => `
  <div class="mqp" hidden>
    ${MQ_KEYS.map((row, i) => `<div class="fmt-row"${i ? '' : ' style="margin-top:0"'}><div class="fmt-group">${row.map(([l, v]) => `<button data-act="mq-key" data-v="${esc(v)}" class="${/^[a-z]/i.test(l) && l.length > 1 ? 'w' : ''}" aria-label="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>`).join('')}
    <button class="mqp-go" data-act="mq-go">${glyph('sparkles')}Solve this line</button>
    <p class="mqp-tip">Words work too — “mean of 3, 5, 9”, “derivative of x³”, or a question in words</p>
  </div>`;
function mqPanel(open) {
  if (!ED) return;
  const p = $('.mqp', ED.el);
  if (!p) return;
  p.hidden = !open;
  $('[data-act="ed-maths"]', ED.el).classList.toggle('on', open);
  if (open) {
    const f = $('.fmt', ED.el);
    if (f && !f.hidden) { f.hidden = true; $('[data-act="ed-fmt"]', ED.el).classList.remove('on'); }
    const t = $('.tbp', ED.el);
    if (t) t.hidden = true;
  }
}
ACTIONS['ed-maths'] = () => { const p = ED && $('.mqp', ED.el); if (p) mqPanel(p.hidden); };
ACTIONS['mq-key'] = (el) => {
  restoreSel();
  document.execCommand('insertText', false, el.dataset.v);
  mqCheck();
};
ACTIONS['mq-go'] = () => {
  restoreSel();
  const line = mqLine();
  if (!line) { toast(ED && caretLi() ? 'Put the question on its own line (not in a list)' : 'Put the cursor on the line with the question'); return; }
  if (!mqText(line)) { toast('Write the question first'); return; }
  mqSolve(line);
};
