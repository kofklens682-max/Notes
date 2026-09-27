'use strict';
/* Drawings in notes. The pen button opens a sheet of paper to draw on with a finger:
   - Draw a shape and keep your finger still at the end for a moment: it becomes a perfect line,
     circle, oval, triangle, rectangle or square.
   - Write a sum and then "=": the answer appears after it, in handwriting (the drawing is read by
     the AI helper; the app works the answer out itself, so it's always right).
   - Tap ✨ (next to a drawing, or in the toolbar and then on a drawing): it becomes a clean
     picture at once, and a moment later a neat AI drawing in your drawing's shape.
   The drawing is kept in the note as a picture (what the note shows) plus its parts (strokes,
   pictures, answers — for drawing on it again), both stored like photos, locked with the note. */

const AI_URL = 'https://notes-ai.kofklens682.workers.dev';
const DRAW_W = 1000; // drawings are worked on in a 1000-wide space, whatever the screen
const INKS = [['#1C1C1E', 'Black'], ['#0A84FF', 'Blue'], ['#FF3B30', 'Red'], ['#34C759', 'Green'], ['#FF9500', 'Orange'], ['#AF52DE', 'Purple']];
const SIZES = [4, 8, 16];
const HOLD_MS = 650;       // finger still this long at the end of a line → perfect shape
const ANSWER_C = '#E8890C'; // maths answers, like Math Notes
const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const HAND_FONT = '"Caveat", "Ink Free", cursive';

let DR = null;
let drSeq = 0;
const nid = () => 'd' + Date.now().toString(36) + (drSeq++).toString(36);

// ---------- Geometry ----------
const pairs = (p) => { const o = []; for (let i = 0; i < p.length; i += 2) o.push([p[i], p[i + 1]]); return o; };
const flat = (P) => P.flatMap((q) => q);
function bboxOf(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    if (it.t === 's') { for (let i = 0; i < it.p.length; i += 2) { const x = it.p[i], y = it.p[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } const h = it.w / 2; x0 -= h; y0 -= h; x1 += h; y1 += h; }
    else { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
function pathLen(P) { let l = 0; for (let i = 1; i < P.length; i++) l += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return l; }
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function rdp(P, eps) {
  if (P.length < 3) return P.slice();
  let k = 0, dmax = 0;
  for (let i = 1; i < P.length - 1; i++) { const d = segDist(P[i], P[0], P[P.length - 1]); if (d > dmax) { dmax = d; k = i; } }
  if (dmax <= eps) return [P[0], P[P.length - 1]];
  return rdp(P.slice(0, k + 1), eps).slice(0, -1).concat(rdp(P.slice(k), eps));
}
function resample(P, n) {
  const L = pathLen(P), step = L / (n - 1), out = [P[0]];
  let acc = 0;
  for (let i = 1; i < P.length && out.length < n; i++) {
    let a = P[i - 1];
    const b = P[i];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(q);
      a = q;
      d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      acc = 0;
    }
    acc += d;
  }
  while (out.length < n) out.push(P[P.length - 1]);
  return out;
}
const ellipsePts = (cx, cy, a, b, n = 72) => Array.from({ length: n + 1 }, (_, i) => { const t = (i / n) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(t) * a, cy + Math.sin(t) * b]; });
const angleDeg = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

// A rough line drawn by hand → the perfect shape it was meant to be, or null.
function perfectShape(p) {
  const P = pairs(p);
  if (P.length < 4) return null;
  const bb = bboxOf([{ t: 's', p, w: 0 }]), diag = Math.hypot(bb.w, bb.h);
  if (diag < 24) return null;
  const L = pathLen(P), a = P[0], z = P[P.length - 1], chord = Math.hypot(z[0] - a[0], z[1] - a[1]);
  // A straight line (snapped level/upright when nearly so).
  if (chord > 0.8 * L) {
    let dev = 0;
    for (const q of P) dev = Math.max(dev, segDist(q, a, z));
    if (dev < Math.max(7, 0.06 * chord)) {
      const ang = angleDeg(a, z), snap = [0, 90, 180, -90, -180, 45, -45, 135, -135].find((s) => Math.abs(ang - s) < 7);
      let b = z;
      if (snap !== undefined) { const r = (snap * Math.PI) / 180; b = [a[0] + Math.cos(r) * chord, a[1] + Math.sin(r) * chord]; }
      return { kind: 'line', p: flat([a, b]) };
    }
    return null;
  }
  // Closed shapes: the end comes back near the start.
  if (Math.hypot(z[0] - a[0], z[1] - a[1]) > Math.max(28, 0.3 * diag) || L < 1.8 * diag) return null;
  const R = resample(P, 64);
  // Corners: simplify the outline and count the turns.
  const simp = rdp(R.concat([R[0]]), 0.075 * diag);
  let V = simp.slice(0, -1);
  V = V.filter((v, i) => { const w = V[(i + 1) % V.length]; return Math.hypot(v[0] - w[0], v[1] - w[1]) > 0.12 * diag; });
  // Corners count only where the line really turns (> 30°).
  V = V.filter((v, i) => {
    const u = V[(i - 1 + V.length) % V.length], w = V[(i + 1) % V.length];
    const d = Math.abs(((angleDeg(u, v) - angleDeg(v, w) + 540) % 360) - 180);
    return d > 30;
  });
  const polyErr = (poly) => { let e = 0; for (const q of R) { let m = Infinity; for (let i = 0; i < poly.length; i++) m = Math.min(m, segDist(q, poly[i], poly[(i + 1) % poly.length])); e += m; } return e / R.length / diag; };
  // Ellipse fit around the middle of the box.
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, ea = bb.w / 2, eb = bb.h / 2;
  const rr = R.map((q) => Math.hypot((q[0] - cx) / ea, (q[1] - cy) / eb));
  const mean = rr.reduce((s, v) => s + v, 0) / rr.length, sd = Math.sqrt(rr.reduce((s, v) => s + (v - mean) ** 2, 0) / rr.length);
  if ((V.length === 3 || V.length === 4) && polyErr(V) < 0.035) {
    if (V.length === 3) return { kind: 'triangle', p: flat(V.concat([V[0]])) };
    const sides = V.map((v, i) => Math.hypot(V[(i + 1) % 4][0] - v[0], V[(i + 1) % 4][1] - v[1]));
    const tilted = V.map((v, i) => { const g = ((angleDeg(v, V[(i + 1) % 4]) % 90) + 90) % 90; return Math.min(g, 90 - g); });
    if (tilted.every((g) => g < 12)) {
      // Level: a rectangle from the box (a square when the sides are about the same).
      let w = bb.w, h = bb.h;
      if (Math.abs(w - h) / Math.max(w, h) < 0.14) w = h = (w + h) / 2;
      const x0 = cx - w / 2, y0 = cy - h / 2;
      return { kind: w === h ? 'square' : 'rectangle', p: flat([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h], [x0, y0]]) };
    }
    const even = Math.max(...sides) / Math.min(...sides) < 1.15;
    return { kind: even ? 'square' : 'quad', p: flat(V.concat([V[0]])) };
  }
  if (sd < 0.11 && Math.abs(mean - 1) < 0.18) {
    if (Math.abs(ea - eb) / Math.max(ea, eb) < 0.16) { const r = (ea + eb) / 2; return { kind: 'circle', p: flat(ellipsePts(cx, cy, r, r)) }; }
    return { kind: 'oval', p: flat(ellipsePts(cx, cy, ea, eb)) };
  }
  return null;
}

// (Maths: see mathsolve.js — solveMath())

// ---------- The AI helper ----------
async function aiCall(path, body, ms) {
  if (!navigator.onLine) throw new Error('offline');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(AI_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'ai');
    return j;
  } finally { clearTimeout(t); }
}
// A picture of just these strokes (dark ink on white), for the AI to look at.
function cropPng(items, max = 512, pad = 24) {
  const bb = bboxOf(items), side = Math.max(bb.w, bb.h) + pad * 2, k = Math.min(1, max / side) * (side < 200 ? 2 : 1);
  const w = Math.round((bb.w + pad * 2) * k), h = Math.round((bb.h + pad * 2) * k);
  const c = document.createElement('canvas');
  c.width = Math.max(32, w);
  c.height = Math.max(32, h);
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.setTransform(k, 0, 0, k, (pad - bb.x0) * k, (pad - bb.y0) * k);
  const minW = Math.max(bb.w, bb.h) / 70; // thin pen on a big sum is hard to read
  items.forEach((it) => paintItem(x, { ...it, c: it.t === 's' ? '#1C1C1E' : it.c, w: it.t === 's' ? Math.max(it.w, minW) : it.w }, 1));
  return c.toDataURL('image/png');
}

// ---------- Painting ----------
const imgCache = new Map(); // item id → Image (AI drawings)
// Handwriting is smoothed into curves; a perfect polygon (line, triangle, rectangle…) keeps its corners.
const SHARP = new Set(['line', 'triangle', 'rectangle', 'square', 'quad']);
function strokePath(ctx, p, sharp) {
  ctx.beginPath();
  if (sharp) { ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); return; }
  if (p.length === 2) { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 0.01, p[1]); return; }
  ctx.moveTo(p[0], p[1]);
  if (p.length === 4) { ctx.lineTo(p[2], p[3]); return; }
  for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  ctx.lineTo(p[p.length - 2], p[p.length - 1]);
}
function paintItem(ctx, it, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha * (it.fade == null ? 1 : it.fade);
  if (it.t === 's') {
    ctx.strokeStyle = it.c;
    ctx.lineWidth = it.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(ctx, it.p, SHARP.has(it.shape));
    ctx.stroke();
  } else if (it.t === 'e') {
    const s = Math.min(it.w, it.h);
    ctx.font = `${Math.round(s * 0.86)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.ch, it.x + it.w / 2, it.y + it.h / 2 + s * 0.04);
  } else if (it.t === 'i') {
    const im = imgCache.get(it.id);
    if (im && im.complete && im.naturalWidth) {
      ctx.globalCompositeOperation = 'multiply'; // the picture's white background disappears into the paper
      ctx.drawImage(im, it.x, it.y, it.w, it.h);
    }
  } else if (it.t === 'a') {
    ctx.fillStyle = it.c || ANSWER_C;
    ctx.font = `600 ${Math.round(it.size)}px ${HAND_FONT}`;
    ctx.textBaseline = 'middle';
    const lines = String(it.s).split('\n'), lh = it.lh || it.h / lines.length;
    lines.forEach((l, k) => ctx.fillText(l, it.x, it.y + lh * (k + 0.5)));
  }
  ctx.restore();
}
function loadItemImages(items, then) {
  let waiting = 0;
  for (const it of items) {
    if (it.t !== 'i' || imgCache.has(it.id)) continue;
    const im = new Image();
    waiting++;
    im.onload = im.onerror = () => { if (--waiting === 0 && then) then(); };
    im.src = it.src;
    imgCache.set(it.id, im);
  }
  if (!waiting && then) then();
}
// The picture the note shows: just the drawn part (with a margin), twice as sharp as the paper's
// units; its width tells the note how wide to show it (see sizeDrawings), so it keeps its size.
function renderPng(d) {
  return new Promise((done) => loadItemImages(d.items, () => {
    const b = bboxOf(d.items), m = 40;
    const x0 = Math.max(0, Math.floor(b.x0 - m)), y0 = Math.max(0, Math.floor(b.y0 - m));
    const x1 = Math.min(d.w, Math.ceil(b.x1 + m)), y1 = Math.min(d.h, Math.ceil(b.y1 + m));
    const w = Math.max(160, x1 - x0), h = Math.max(120, y1 - y0), k = 2;
    const c = document.createElement('canvas');
    c.width = w * k;
    c.height = h * k;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    d.items.forEach((it) => paintItem(x, it));
    c.toBlob((bl) => done(bl), 'image/png');
  }));
}
// A drawing in a note is shown as wide, relative to the note, as it was on the paper.
function sizeDrawing(img) {
  const set = () => { if (img.naturalWidth) img.style.width = `${Math.min(100, (img.naturalWidth / (2 * DRAW_W)) * 100).toFixed(1)}%`; };
  if (img.complete) set(); else img.addEventListener('load', set, { once: true });
}

// ---------- The drawing sheet ----------
function openDrawing(data, onDone) {
  if (DR) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (document.fonts) document.fonts.load(`600 60px ${HAND_FONT}`).catch(() => {}); // for the answers
  const wrap = document.createElement('div');
  wrap.className = 'dr-wrap';
  wrap.innerHTML = `
    <header class="dr-top">
      <button class="dr-t" data-dr="cancel">Cancel</button>
      <div class="dr-mid"><button data-dr="undo" aria-label="Undo" disabled>${glyph('undo')}</button><button data-dr="redo" aria-label="Redo" disabled>${glyph('redo')}</button></div>
      <button class="dr-t strong" data-dr="done">Done</button>
    </header>
    <div class="dr-stage"><div class="dr-paper"><canvas class="dr-base"></canvas><canvas class="dr-live"></canvas><div class="dr-float"></div></div></div>
    <div class="dr-hint">Hold still at the end of a shape to make it perfect · write a sum or an equation with “=” for the answer · ✨ makes a drawing neat · tap a picture to move it</div>
    <footer class="dr-tools">
      <div class="dr-inks">${INKS.map(([c, n], i) => `<button class="ink${i ? '' : ' on'}" data-dr="ink" data-v="${c}" style="--c:${c}" aria-label="${n}"></button>`).join('')}</div>
      <button class="dr-tool" data-dr="size" aria-label="Pen size"><i class="dot" style="--s:8px"></i></button>
      <button class="dr-tool" data-dr="eraser" aria-label="Eraser">${glyph('eraser')}</button>
      <button class="dr-tool magic" data-dr="magic" aria-label="Make a drawing neat">${glyph('sparkles')}</button>
      <button class="dr-tool" data-dr="clear" aria-label="Clear">${glyph('trash')}</button>
    </footer>`;
  document.body.appendChild(wrap);
  const stage = $('.dr-stage', wrap), paper = $('.dr-paper', wrap);
  // The page fills the space between the bars; a drawing opened again keeps its own shape.
  const sw = stage.clientWidth - 24, sh = stage.clientHeight - 24;
  const w = DRAW_W, h = data ? data.h : Math.round(DRAW_W * Math.min(1.6, Math.max(0.75, sh / sw)));
  const scale = Math.min(sw / w, sh / h);
  paper.style.width = `${Math.round(w * scale)}px`;
  paper.style.height = `${Math.round(h * scale)}px`;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const base = $('.dr-base', wrap), live = $('.dr-live', wrap);
  [base, live].forEach((c) => { c.width = Math.round(w * scale * dpr); c.height = Math.round(h * scale * dpr); });
  DR = {
    wrap, paper, base, live, w, h, k: scale * dpr, scale, onDone,
    bx: base.getContext('2d'), lx: live.getContext('2d'), // (not 'desynchronized': on Android that paints the paper black)
    items: data ? data.items.map((it) => ({ ...it })) : [], hist: [], hi: -1,
    ink: INKS[0][0], size: 1, tool: 'pen', magic: false, stroke: null, busy: new Set(), timers: {},
  };
  requestAnimationFrame(() => wrap.classList.add('show'));
  loadItemImages(DR.items, () => redraw());
  drHist();
  redraw();
  bindDrawing();
  const close = () => closeDrawing(false);
  DR.layer = close;
  layers.push(close);
  buzz(10);
}
function closeDrawing(keep) {
  if (!DR) return;
  const d = DR;
  DR = null;
  const i = layers.indexOf(d.layer);
  if (i >= 0) layers.splice(i, 1);
  Object.values(d.timers).forEach((t) => clearTimeout(t));
  d.wrap.classList.remove('show');
  setTimeout(() => d.wrap.remove(), 300);
  if (keep && d.onDone) d.onDone(d.items.length ? { v: 1, w: d.w, h: d.h, items: d.items.map(({ fade, ...it }) => it) } : null);
}
function redraw() {
  if (!DR) return;
  const { bx, k, w, h } = DR;
  bx.setTransform(1, 0, 0, 1, 0, 0);
  bx.clearRect(0, 0, DR.base.width, DR.base.height);
  bx.setTransform(k, 0, 0, k, 0, 0);
  DR.items.forEach((it) => paintItem(bx, it));
  void w; void h;
}
function liveClear() { DR.lx.setTransform(1, 0, 0, 1, 0, 0); DR.lx.clearRect(0, 0, DR.live.width, DR.live.height); DR.lx.setTransform(DR.k, 0, 0, DR.k, 0, 0); }
function drHist() {
  if (!DR) return;
  const snap = DR.items.slice();
  const top = DR.hist[DR.hi];
  if (top && top.length === snap.length && top.every((it, i) => it === snap[i])) return;
  DR.hist.length = DR.hi + 1;
  DR.hist.push(snap);
  if (DR.hist.length > 80) DR.hist.shift();
  DR.hi = DR.hist.length - 1;
  drButtons();
}
function drButtons() {
  $('[data-dr="undo"]', DR.wrap).disabled = DR.hi <= 0;
  $('[data-dr="redo"]', DR.wrap).disabled = DR.hi >= DR.hist.length - 1;
}
const toPaper = (e) => { const r = DR.base.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * DR.w, ((e.clientY - r.top) / r.height) * DR.h]; };

function bindDrawing() {
  const d = DR, cv = d.live;
  cv.addEventListener('pointerdown', (e) => {
    if (!DR || d.stroke || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    hideChip();
    deselect();
    const q = toPaper(e);
    if (d.magic) { d.magic = false; magicMode(false); magicAt(q); return; }
    if (d.tool === 'eraser') { d.stroke = { id: e.pointerId, erase: true }; eraseAt(q); return; }
    Object.values(d.timers).forEach((t) => clearTimeout(t));
    d.stroke = { id: e.pointerId, p: [q[0], q[1]], c: d.ink, w: SIZES[d.size], still: q, snapped: null, t0: performance.now() };
    holdTimer();
    drawLive();
  });
  cv.addEventListener('pointermove', (e) => {
    const s = d.stroke;
    if (!s || e.pointerId !== s.id) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const q = toPaper(ev);
      if (s.erase) { eraseAt(q); continue; }
      if (s.snapped) continue;
      const lx = s.p[s.p.length - 2], ly = s.p[s.p.length - 1];
      if (Math.hypot(q[0] - lx, q[1] - ly) < 1.5) continue;
      s.p.push(q[0], q[1]);
      if (Math.hypot(q[0] - s.still[0], q[1] - s.still[1]) > 9) { s.still = q; holdTimer(); }
    }
    if (!s.erase) drawLive();
  });
  const end = (e) => {
    const s = d.stroke;
    if (!s || e.pointerId !== s.id) return;
    d.stroke = null;
    clearTimeout(d.timers.hold);
    if (s.erase) { drHist(); return; }
    liveClear();
    if (!s.snapped && performance.now() - s.t0 < 350 && pathLen(pairs(s.p)) < 12) {
      const hit = itemAt([s.p[0], s.p[1]]);
      if (hit) { selectItem(hit.id); buzz(6); hint('Drag it anywhere · pull the round corner to resize · × removes it'); return; }
    }
    const it = { t: 's', id: nid(), c: s.c, w: s.w, p: s.snapped ? s.snapped.p : s.p };
    if (s.snapped) it.shape = s.snapped.kind;
    d.items = d.items.concat([it]);
    redraw();
    drHist();
    afterStroke(it);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  d.wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dr]');
    if (!b || !DR) return;
    const a = b.dataset.dr;
    if (a === 'cancel') {
      if (DR.hi > 0) { ask({ title: 'Throw away this drawing?', ok: 'Discard', destructive: true }).then((ok) => { if (ok) closeDrawing(false); }); return; }
      closeDrawing(false);
    }
    if (a === 'done') closeDrawing(true);
    if (a === 'undo' || a === 'redo') {
      const i = DR.hi + (a === 'undo' ? -1 : 1);
      if (!DR.hist[i]) return;
      DR.hi = i;
      DR.items = DR.hist[i].slice();
      hideChip();
      deselect();
      redraw();
      drButtons();
    }
    if (a === 'ink') { DR.ink = b.dataset.v; DR.tool = 'pen'; toolUi(); }
    if (a === 'size') { DR.size = (DR.size + 1) % SIZES.length; DR.tool = 'pen'; toolUi(); }
    if (a === 'eraser') { DR.tool = DR.tool === 'eraser' ? 'pen' : 'eraser'; deselect(); toolUi(); }
    if (a === 'magic') { DR.magic = !DR.magic; magicMode(DR.magic); }
    if (a === 'clear' && DR.items.length) {
      ask({ title: 'Clear the whole drawing?', ok: 'Clear', destructive: true }).then((ok) => { if (ok && DR) { DR.items = []; hideChip(); deselect(); redraw(); drHist(); } });
    }
    if (a === 'chip') { hideChip(); makeNeat(DR.items.filter((it) => (b._ids || []).includes(it.id))); }
  });
}
function toolUi() {
  const w = DR.wrap;
  $$('.ink', w).forEach((b) => b.classList.toggle('on', DR.tool === 'pen' && b.dataset.v === DR.ink));
  $('[data-dr="eraser"]', w).classList.toggle('on', DR.tool === 'eraser');
  const dot = $('[data-dr="size"] .dot', w);
  dot.style.setProperty('--s', `${[5, 9, 15][DR.size]}px`);
  dot.style.background = DR.ink;
}
function magicMode(on) {
  DR.wrap.classList.toggle('magic', on);
  $('[data-dr="magic"]', DR.wrap).classList.toggle('on', on);
  hint(on ? 'Now tap the drawing you want to make neat' : null);
}
function hint(text) {
  const h = $('.dr-hint', DR.wrap);
  if (!h._def) h._def = h.textContent;
  h.textContent = text || h._def;
  h.classList.toggle('now', !!text);
}
function drawLive() {
  const s = DR.stroke;
  liveClear();
  if (!s || s.erase) return;
  paintItem(DR.lx, { t: 's', c: s.c, w: s.w, p: s.snapped ? s.snapped.p : s.p, shape: s.snapped && s.snapped.done ? s.snapped.kind : null });
}
// Finger kept still → try to turn the line into a perfect shape (with a short morph).
function holdTimer() {
  clearTimeout(DR.timers.hold);
  DR.timers.hold = setTimeout(() => {
    const s = DR && DR.stroke;
    if (!s || s.erase || s.snapped || s.p.length < 8) return;
    const shape = perfectShape(s.p);
    if (!shape) return;
    buzz(12);
    const from = resample(pairs(s.p), 72), to = resample(pairs(shape.p), 72), t0 = performance.now();
    s.snapped = { kind: shape.kind, p: flat(from) };
    const step = (now) => {
      if (!DR || DR.stroke !== s) return;
      const t = Math.min(1, (now - t0) / 180), e = 1 - (1 - t) ** 3;
      s.snapped.p = flat(from.map((q, i) => [q[0] + (to[i][0] - q[0]) * e, q[1] + (to[i][1] - q[1]) * e]));
      drawLive();
      if (t < 1) requestAnimationFrame(step);
      else { s.snapped.p = shape.p; s.snapped.done = true; drawLive(); }
    };
    requestAnimationFrame(step);
  }, HOLD_MS);
}
function eraseAt(q) {
  const r = 14 + SIZES[DR.size];
  const hit = (it) => {
    if (it.t === 's') { const P = pairs(it.p); if (P.length === 1) return Math.hypot(P[0][0] - q[0], P[0][1] - q[1]) < r + it.w; for (let i = 1; i < P.length; i++) if (segDist(q, P[i - 1], P[i]) < r + it.w / 2) return true; return false; }
    return q[0] >= it.x - r && q[0] <= it.x + it.w + r && q[1] >= it.y - r && q[1] <= it.y + it.h + r;
  };
  const keep = DR.items.filter((it) => !hit(it));
  if (keep.length !== DR.items.length) { DR.items = keep; redraw(); buzz(6); }
}

// ---------- After each stroke: maths, and the ✨ chip ----------
// Strokes near each other form one drawing.
function groupOf(it, pool = DR.items) {
  const strokes = pool.filter((x) => x.t === 's');
  const grow = (b, m) => ({ x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m });
  const meets = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  const group = [it], boxes = new Map(strokes.map((s) => [s, bboxOf([s])]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of strokes) {
      if (group.includes(s)) continue;
      if (group.some((g) => meets(grow(boxes.get(g) || bboxOf([g]), 26), boxes.get(s)))) { group.push(s); changed = true; }
    }
  }
  return group;
}
const isFlat = (it) => { if (it.t !== 's') return false; const b = bboxOf([{ ...it, w: 0 }]); return b.w > 18 && b.w < 420 && b.h < b.w * 0.45; };
// Two flat strokes one above the other make "=".
function eqPair(s1, s2) {
  if (!isFlat(s1) || !isFlat(s2)) return null;
  const [a, b] = [s1, s2].map((s) => bboxOf([{ ...s, w: 0 }]));
  const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), len = Math.max(a.w, b.w);
  const gap = Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  if (ov < 0.3 * Math.min(a.w, b.w) || Math.min(a.w, b.w) < 0.35 * len || gap < 5 || gap > 1.3 * len) return null;
  return { ids: [s1.id, s2.id], box: { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }, len };
}
// The last two strokes are "=" (a sum waiting for its answer).
function equalsSign() {
  const S2 = DR.items.filter((x) => x.t === 's').slice(-2);
  return S2.length < 2 ? null : eqPair(S2[0], S2[1]);
}
// Everything written on the same line as this stroke (close together, left to right).
function lineOf(it) {
  const strokes = DR.items.filter((x) => x.t === 's');
  const line = [it];
  let box = bboxOf([it]), changed = true;
  while (changed) {
    changed = false;
    const lh = Math.max(50, box.h);
    for (const s of strokes) {
      if (line.includes(s)) continue;
      const b = bboxOf([s]), cy = (b.y0 + b.y1) / 2;
      if (cy > box.y0 - 0.35 * lh && cy < box.y1 + 0.35 * lh && b.x0 < box.x1 + 1.6 * lh && b.x1 > box.x0 - 1.6 * lh) {
        line.push(s);
        box = bboxOf(line);
        changed = true;
      }
    }
  }
  return line.sort((a, b) => bboxOf([a]).x0 - bboxOf([b]).x0);
}
// An "=" with writing on both sides of it (an equation like x + 2 = 15).
function innerEquals(line) {
  const flats = line.filter(isFlat);
  for (let i = 0; i < flats.length; i++) {
    for (let j = i + 1; j < flats.length; j++) {
      const e = eqPair(flats[i], flats[j]);
      if (!e) continue;
      const left = line.some((s) => !e.ids.includes(s.id) && bboxOf([s]).x1 < e.box.x0 + 12);
      const right = line.some((s) => !e.ids.includes(s.id) && bboxOf([s]).x0 > e.box.x1 - 12);
      if (left && right) return e;
    }
  }
  return null;
}
function afterStroke(it) {
  clearTimeout(DR.timers.math);
  clearTimeout(DR.timers.chip);
  const eq = equalsSign();
  if (eq) { DR.timers.math = setTimeout(() => answerFor(eq), 700); return; }
  // A line with "=" inside it is an equation: solved when you stop writing for a moment.
  const line = lineOf(it);
  if (line.length >= 3 && innerEquals(line)) { DR.timers.math = setTimeout(() => solveLine(line.map((x) => x.id)), 1300); return; }
  // Changing a sum that already has an answer: work it out again.
  const ans = DR.items.filter((x) => x.t === 'a' && x.eq);
  const b = bboxOf([it]);
  const redo = ans.find((a) => b.y1 > a.band[0] && b.y0 < a.band[1] && b.x1 < a.eqx + 10);
  if (redo) { DR.timers.math = setTimeout(() => answerFor(redo.eq, redo), 900); return; }
  if (!it.shape) DR.timers.chip = setTimeout(() => showChip(it), 1300);
}
// How wide a line of handwriting is.
const measureCtx = document.createElement('canvas').getContext('2d');
function handWidth(s, size) { measureCtx.font = `600 ${Math.round(size)}px ${HAND_FONT}`; return measureCtx.measureText(s).width; }
// An answer as handwriting: after the sum ('after') or under the line ('below'), kept on the paper.
function answerItem(res, box, where, extra = {}) {
  const lines = res.lines, c = res.kind === 'check' ? (res.ok ? '#34C759' : '#FF3B30') : ANSWER_C;
  const size = where === 'after' ? Math.max(40, Math.min(220, box.h * 0.95)) : Math.max(38, Math.min(150, box.h * 0.75));
  const lh = size * 1.1, w = Math.max(...lines.map((l) => handWidth(l, size))), h = lh * lines.length;
  let x = where === 'after' ? box.x1 + size * 0.3 : box.x0, y = where === 'after' ? (box.y0 + box.y1) / 2 - h / 2 : box.y1 + size * 0.2;
  if (where === 'after' && x + w > DR.w - 10) { x = box.x0; y = box.y1 + size * 0.2; }
  x = Math.max(10, Math.min(x, DR.w - 10 - w));
  if (y + h > DR.h - 10) y = Math.max(10, box.y0 - h - size * 0.2);
  return { t: 'a', id: nid(), s: lines.join('\n'), x, y, w, h, size, lh, c, ...extra };
}
// Read a picture of maths (a second reader tries when the first can't be worked out).
async function readMath(items) {
  const img = cropPng(items);
  let r = await aiCall('/read', { img, hint: 'math' }, 15000);
  let res = r.kind === 'math' ? solveMath(r.expression) : null;
  if (!res && DR) {
    const r2 = await aiCall('/read', { img, hint: 'math', alt: true }, 15000);
    const res2 = r2.kind === 'math' ? solveMath(r2.expression) : null;
    if (res2 || r.kind !== 'math') { r = r2; res = res2; }
  }
  return { r, res };
}
const hasLetters = (s) => /[a-z]/i.test(String(s || '').replace(/sqrt|cbrt|abs|sin|cos|tan|log|ln|exp|pi/gi, ''));
function putAnswer(a, isSame) {
  DR.items = DR.items.filter((x) => !(x.t === 'a' && isSame(x))).concat([a]);
  fadeIn(a);
  drHist();
  buzz(10);
}
// A sum ending in "=": its value, written after the "=".
async function answerFor(eq, old) {
  if (!DR) return;
  const eqItems = DR.items.filter((x) => eq.ids.includes(x.id));
  if (eqItems.length < 2) return;
  const cy = (eq.box.y0 + eq.box.y1) / 2, L = eq.len;
  const band = [cy - 2.4 * L, cy + 2.4 * L];
  const sum = DR.items.filter((x) => x.t === 's' && !eq.ids.includes(x.id) && (() => { const b = bboxOf([x]); return b.y1 > band[0] && b.y0 < band[1] && b.x1 < eq.box.x0 + 12 && b.x0 > eq.box.x0 - 14 * L; })());
  if (!sum.length) return;
  const key = eq.ids.join();
  if (DR.busy.has(key)) return;
  DR.busy.add(key);
  const d = DR;
  const work = sparkle(bboxOf(sum.concat(eqItems)));
  try {
    const { r, res } = await readMath(sum.concat(eqItems));
    if (DR !== d) return;
    if (!res) {
      // (Letters before the "=" mean an equation is being written — it's solved when it's finished.)
      if (!old && !hasLetters(r.expression)) toast("Couldn't read that sum — try writing it a little bigger");
      return;
    }
    const sb = bboxOf(sum), box = { x0: eq.box.x0, x1: eq.box.x1, y0: Math.min(sb.y0, eq.box.y0), y1: Math.max(sb.y1, eq.box.y1), h: sb.h };
    const a = answerItem(res, res.kind === 'value' ? { ...box, y0: cy - sb.h / 2, y1: cy + sb.h / 2 } : { ...bboxOf(sum.concat(eqItems)), h: sb.h },
      res.kind === 'value' ? 'after' : 'below', { eq, eqx: eq.box.x0, band, read: r.expression });
    putAnswer(a, (x) => x === old || (x.eq && x.eq.ids.join() === key));
  } catch (e) {
    if (DR === d && !old) toast(navigator.onLine ? "Couldn't work it out just now — try again" : 'Answers to sums need the internet');
  } finally {
    d.busy.delete(key);
    work();
  }
}
// A whole line with "=" inside (x + 2 = 15, x² − 5x + 6 = 0 …): the answer goes under it.
async function solveLine(ids) {
  if (!DR) return;
  const line = DR.items.filter((x) => ids.includes(x.id));
  if (line.length < 3 || !innerEquals(line)) return;
  const key = 'L' + ids.slice().sort().join();
  if (DR.busy.has(key)) return;
  DR.busy.add(key);
  const d = DR, lb = bboxOf(line);
  const work = sparkle(lb);
  try {
    const { r, res } = await readMath(line);
    if (DR !== d) return;
    if (!res) { if (r.kind === 'math') toast("Couldn't solve that one — check it's written clearly"); return; }
    const a = answerItem(res, lb, res.kind === 'check' ? 'after' : 'below', { line: ids, read: r.expression });
    putAnswer(a, (x) => x.line && x.line.some((id) => ids.includes(id)));
  } catch (e) {
    if (DR === d) toast(navigator.onLine ? "Couldn't solve it just now — try again" : 'Solving needs the internet');
  } finally {
    d.busy.delete(key);
    work();
  }
}
// A soft glow over the part being looked at.
function sparkle(b) {
  const f = $('.dr-float', DR.wrap), el = document.createElement('div');
  el.className = 'dr-glow';
  const s = DR.scale;
  Object.assign(el.style, { left: `${(b.x0 - 10) * s}px`, top: `${(b.y0 - 10) * s}px`, width: `${(b.w + 20) * s}px`, height: `${(b.h + 20) * s}px` });
  f.appendChild(el);
  return () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
}
function fadeIn(it, ms = 320) {
  const t0 = performance.now();
  it.fade = 0;
  const step = (now) => {
    if (!DR) return;
    it.fade = Math.min(1, (now - t0) / ms);
    redraw();
    if (it.fade < 1) requestAnimationFrame(step); else delete it.fade;
  };
  requestAnimationFrame(step);
}
function showChip(it) {
  if (!DR || !DR.items.includes(it)) return;
  const g = groupOf(it);
  const b = bboxOf(g);
  if (g.length < 2 && b.w < 90 && b.h < 90) return; // a dot or a tiny mark
  hideChip();
  const s = DR.scale, chip = document.createElement('button');
  chip.className = 'dr-chip';
  chip.dataset.dr = 'chip';
  chip._ids = g.map((x) => x.id);
  chip.setAttribute('aria-label', 'Make this drawing neat');
  chip.innerHTML = glyph('sparkles');
  chip.style.left = `${Math.min(DR.w - 40, b.x1) * s}px`;
  chip.style.top = `${Math.max(0, b.y0 - 30) * s}px`;
  $('.dr-float', DR.wrap).appendChild(chip);
  DR.timers.chipHide = setTimeout(hideChip, 6000);
}
function hideChip() { if (!DR) return; $$('.dr-chip', DR.wrap).forEach((c) => c.remove()); clearTimeout(DR.timers.chipHide); }
function magicAt(q) {
  const near = DR.items.filter((x) => x.t === 's').map((x) => ({ x, d: Math.min(...pairs(x.p).map((p) => Math.hypot(p[0] - q[0], p[1] - q[1]))) })).sort((a, b) => a.d - b.d)[0];
  if (!near || near.d > 60) { toast('Tap right on a drawing'); return; }
  makeNeat(groupOf(near.x));
}
// ✨ A drawing → at once a clean picture of what it is, then a neat AI drawing in its shape.
async function makeNeat(group) {
  if (!DR || !group.length) return;
  const d = DR, key = group.map((x) => x.id).join();
  if (d.busy.has(key)) return;
  d.busy.add(key);
  const b = bboxOf(group), img = cropPng(group);
  const work = sparkle(b);
  let read;
  try {
    read = await aiCall('/read', { img, hint: 'object' }, 15000);
  } catch (e) {
    work();
    d.busy.delete(key);
    if (DR === d) toast(navigator.onLine ? "Couldn't reach the drawing helper — try again" : 'Making drawings neat needs the internet');
    return;
  }
  if (DR !== d) return;
  if (read.kind === 'math') {
    // ✨ on a sum: the answer is written on the paper, after it.
    work();
    d.busy.delete(key);
    const res = solveMath(read.expression);
    if (!res) { toast("Couldn't work that out — try writing it a little bigger"); return; }
    const ids = group.map((x) => x.id);
    const shown = res.kind === 'value' ? { ...res, lines: [`= ${res.lines[0]}`] } : res;
    const a = answerItem(shown, b, res.kind === 'value' || res.kind === 'check' ? 'after' : 'below', { line: ids, read: read.expression });
    putAnswer(a, (x) => x.line && x.line.some((id) => ids.includes(id)));
    return;
  }
  if (read.kind !== 'object' || !read.name) {
    work();
    d.busy.delete(key);
    toast(read.kind === 'text' && read.text ? `That looks like writing: “${read.text}”` : "Couldn't tell what that is — try drawing it a little clearer");
    return;
  }
  const side = Math.max(b.w, b.h);
  const box = { x: (b.x0 + b.x1) / 2 - side / 2, y: (b.y0 + b.y1) / 2 - side / 2, w: side, h: side };
  let placed = null;
  if (read.emoji) {
    placed = { t: 'e', id: nid(), ch: read.emoji, name: read.name, ...box };
    swapIn(group, placed);
    selectItem(placed.id);
    buzz(10);
  }
  hint(`${read.name[0].toUpperCase()}${read.name.slice(1)} — drawing it neatly…`);
  try {
    const r = await aiCall('/redraw', { img, name: read.name }, 70000); // (the drawing model is sometimes busy)
    if (DR !== d) return;
    const still = placed ? DR.items.some((x) => x.id === placed.id) : group.every((g) => DR.items.includes(g));
    if (!still) return;
    const it = { t: 'i', id: nid(), src: r.img, name: read.name, x: b.x0 - 24, y: b.y0 - 24, w: b.w + 48, h: b.h + 48 };
    // The AI picture is square around the sketch (with the same margin as the crop).
    const s2 = Math.max(it.w, it.h);
    Object.assign(it, { x: (b.x0 + b.x1) / 2 - s2 / 2, y: (b.y0 + b.y1) / 2 - s2 / 2, w: s2, h: s2 });
    await new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = it.src; imgCache.set(it.id, im); });
    if (DR !== d) return;
    const was = placed && DR.items.find((x) => x.id === placed.id); // it may have been moved or resized meanwhile
    if (was) Object.assign(it, { x: was.x + (was.w - was.w * (it.w / placed.w)) / 2, y: was.y + (was.h - was.h * (it.h / placed.h)) / 2, w: was.w * (it.w / placed.w), h: was.h * (it.h / placed.h) });
    const picked = placed && DR.sel === placed.id;
    swapIn(was ? [was] : group, it);
    if (picked) selectItem(it.id);
  } catch (e) {
    if (DR === d && !placed) toast("Couldn't draw it just now — try again");
  } finally {
    work();
    d.busy.delete(key);
    if (DR === d) hint(null);
  }
}
// Replace some parts with a new one: the old ones fade out as the new one fades in.
function swapIn(old, it) {
  const t0 = performance.now(), ms = 380;
  DR.items = DR.items.filter((x) => !old.includes(x)).concat([it]);
  const ghosts = old.map((x) => ({ ...x }));
  it.fade = 0;
  const step = (now) => {
    if (!DR) return;
    const t = Math.min(1, (now - t0) / ms);
    it.fade = t;
    redraw();
    ghosts.forEach((g) => paintItem(DR.bx, g, 1 - t));
    if (t < 1) requestAnimationFrame(step); else { delete it.fade; redraw(); drHist(); if (DR.sel) selFrame(); }
  };
  requestAnimationFrame(step);
}

// ---------- Moving pictures and answers ----------
// Tap a clean picture or an answer to pick it up: drag it anywhere, pull the round corner to make
// it bigger or smaller, or tap × to remove it. A picture that has just been made neat is picked up
// by itself.
const movable = (it) => it && (it.t === 'e' || it.t === 'i' || it.t === 'a');
function itemAt(q) {
  for (let k = DR.items.length - 1; k >= 0; k--) {
    const it = DR.items[k];
    if (movable(it) && q[0] >= it.x - 14 && q[0] <= it.x + it.w + 14 && q[1] >= it.y - 14 && q[1] <= it.y + it.h + 14) return it;
  }
  return null;
}
function selectItem(id) { if (!DR) return; DR.sel = id; selFrame(); }
function deselect() { if (DR && DR.sel) { DR.sel = null; selFrame(); } }
function selFrame() {
  let f = $('.dr-sel', DR.wrap);
  const it = DR.items.find((x) => x.id === DR.sel);
  if (!it) { if (f) f.remove(); DR.sel = null; return; }
  if (!f) {
    f = document.createElement('div');
    f.className = 'dr-sel';
    f.innerHTML = `<button class="dr-sel-x" aria-label="Remove">${glyph('x')}</button><i class="dr-sel-r" aria-hidden="true"></i>`;
    $('.dr-float', DR.wrap).appendChild(f);
    bindSel(f);
  }
  const s = DR.scale, pad = 8;
  Object.assign(f.style, { left: `${it.x * s - pad}px`, top: `${it.y * s - pad}px`, width: `${it.w * s + pad * 2}px`, height: `${it.h * s + pad * 2}px` });
}
function bindSel(f) {
  let st = null;
  f.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.dr-sel-x')) return;
    const it = DR && DR.items.find((x) => x.id === DR.sel);
    if (!it) return;
    e.preventDefault();
    e.stopPropagation();
    f.setPointerCapture(e.pointerId);
    st = { id: e.pointerId, q0: toPaper(e), it, resize: !!e.target.closest('.dr-sel-r'), moved: false };
    f.classList.add('moving');
    hideChip();
  });
  f.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id || !DR) return;
    const q = toPaper(e), dx = q[0] - st.q0[0], dy = q[1] - st.q0[1], o = st.it;
    if (!st.moved && Math.hypot(dx, dy) < 3) return;
    st.moved = true;
    let n;
    if (st.resize) {
      const k = Math.max(50 / Math.min(o.w, o.h), Math.min(DR.w / o.w, (o.w + Math.max(dx, (dy * o.w) / o.h)) / o.w));
      n = { ...o, w: o.w * k, h: o.h * k };
      if (o.t === 'a') Object.assign(n, { size: o.size * k, lh: (o.lh || o.size * 1.1) * k });
    } else {
      n = { ...o, x: Math.max(-o.w / 2, Math.min(DR.w - o.w / 2, o.x + dx)), y: Math.max(-o.h / 2, Math.min(DR.h - o.h / 2, o.y + dy)) };
    }
    DR.items = DR.items.map((x) => (x.id === o.id ? n : x));
    redraw();
    selFrame();
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const moved = st.moved;
    st = null;
    f.classList.remove('moving');
    if (moved) { drHist(); buzz(6); }
  };
  f.addEventListener('pointerup', end);
  f.addEventListener('pointercancel', end);
  $('.dr-sel-x', f).addEventListener('click', (e) => {
    e.stopPropagation();
    if (!DR) return;
    DR.items = DR.items.filter((x) => x.id !== DR.sel);
    deselect();
    redraw();
    drHist();
    buzz(8);
  });
}

// ---------- In the note ----------
// Drawing blocks: <div class="ph dr"><img data-blob="picture" data-vec="parts"></div>
async function readVec(id) {
  try {
    const p = await readPhoto(id);
    if (!p) return null;
    const v = JSON.parse(await p.blob.text());
    return v && Array.isArray(v.items) ? v : null;
  } catch (e) { return null; }
}
async function saveDrawingBlobs(data, locked) {
  const png = await renderPng(data), pid = uid(), vid = uid();
  const key = locked ? LOCK.key : null;
  await putPhoto(pid, png, key);
  await putPhoto(vid, new Blob([JSON.stringify(data)], { type: 'application/json' }), key);
  const url = URL.createObjectURL(png);
  photoUrls.set(pid, { url, locked: !!locked });
  return { pid, vid, url };
}
ACTIONS['ed-draw'] = () => {
  if (!ED) return;
  const r0 = ED.range;
  if (r0 && ED.ed.contains(r0.startContainer) && cellOf(r0.startContainer)) { toast('Put the cursor outside the table to add a drawing'); return; }
  const me = ED, range = r0 && ED.ed.contains(r0.startContainer) ? r0.cloneRange() : null;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // the keyboard goes away
  openDrawing(null, async (data) => {
    if (!data || ED !== me) return;
    const n = noteOf(me.id);
    const { pid, vid, url } = await saveDrawingBlobs(data, n && n.locked);
    if (ED !== me) return;
    const ph = document.createElement('div');
    ph.className = 'ph dr';
    ph.contentEditable = 'false';
    ph.innerHTML = `<img data-blob="${pid}" data-vec="${vid}" src="${url}" alt="Drawing">`;
    sizeDrawing($('img', ph));
    if (range) ED.range = range;
    histNow();
    insertBlock(ph);
    afterCmd();
    saveEditor();
  });
};
// Tap a drawing in a note to draw on it again.
async function editDrawing(img) {
  if (!ED || DR) return;
  const me = ED, vec = await readVec(img.dataset.vec);
  if (!vec) { openViewer(img); return; }
  openDrawing(vec, async (data) => {
    if (ED !== me) return;
    const ph = img.closest('.ph');
    if (!data) { histNow(); ph.remove(); afterCmd(); saveEditor(); return; }
    const n = noteOf(me.id);
    const { pid, vid, url } = await saveDrawingBlobs(data, n && n.locked);
    if (ED !== me || !img.isConnected) return;
    histNow();
    img.dataset.blob = pid;
    img.dataset.vec = vid;
    img.src = url;
    sizeDrawing(img);
    afterCmd();
    saveEditor();
  });
}
