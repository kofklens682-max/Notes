'use strict';
/* Drawings in notes. The pen button opens a sheet of paper to draw on with a finger:
   - Draw a shape and keep your finger still at the end for a moment: it becomes a perfect line,
     circle, oval, triangle, rectangle or square.
   - Write a sum or an equation: a ✨ appears at the end of the line. Nothing is worked out until you
     tap it — then the answer is written UNDER the line, in handwriting (the AI helper reads the
     writing; the app works the answer out itself, so it's always right). Two equations with x and y
     under each other are solved together. Σ, d/dx, ∫ and statistics work too (mathsolve.js), and a
     question written in words goes to the helper (✨ tool on it). Tap an answer, then Steps, to see how.
   - Tap ✨ next to a drawing (or the ✨ tool, then a drawing): the helper guesses what it is and you
     pick the right guess (or type it) and a style, like Image Wand on the iPhone. A neat picture in
     your drawing's shape replaces the sketch; ↻ on it tries again or picks another style.
   - The lasso picks up handwriting to move, resize or delete; a tap picks up a picture or answer.
   The drawing is kept in the note as a picture (what the note shows) plus its parts (strokes,
   pictures, answers — for drawing on it again), both stored like photos, locked with the note.
   In the note a drawing sits at the side with text next to it, or on its own line (tap it). */

const AI_URL = 'https://notes-ai.kofklens682.workers.dev';
const DRAW_W = 1000; // drawings are worked on in a 1000-wide space, whatever the screen
const INKS = [['#1C1C1E', 'Black'], ['#0A84FF', 'Blue'], ['#FF3B30', 'Red'], ['#34C759', 'Green'], ['#FF9500', 'Orange'], ['#AF52DE', 'Purple']];
const SIZES = [4, 8, 16];
const HOLD_MS = 650;       // finger still this long at the end of a line → perfect shape
const ANSWER_C = '#E8890C'; // maths answers, like Math Notes
const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const HAND_FONT = '"Caveat", "Ink Free", cursive';
const DRAW_STYLES = [['cartoon', 'Cartoon'], ['pencil', 'Pencil'], ['paint', 'Paint']];
const drawStyle = () => (DRAW_STYLES.some(([v]) => v === S.settings.drawStyle) ? S.settings.drawStyle : 'cartoon');

let DR = null;
let drSeq = 0;
const nid = () => 'd' + Date.now().toString(36) + (drSeq++).toString(36);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---------- Geometry ----------
const pairs = (p) => { const o = []; for (let i = 0; i < p.length; i += 2) o.push([p[i], p[i + 1]]); return o; };
const flat = (P) => P.flatMap((q) => q);
function bboxOf(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    if (it.t === 's') {
      // (each stroke's own thickness — the box mustn't grow with every stroke added)
      const h = it.w / 2;
      for (let i = 0; i < it.p.length; i += 2) { const x = it.p[i], y = it.p[i + 1]; if (x - h < x0) x0 = x - h; if (x + h > x1) x1 = x + h; if (y - h < y0) y0 = y - h; if (y + h > y1) y1 = y + h; }
    }
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
function pointInPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const boxesMeet = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

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

// (Maths: see mathsolve.js — solveMath(), solveSystem())

// ---------- The AI helper ----------
async function aiCall(path, body, ms) {
  if (!navigator.onLine) throw new Error('offline');
  if (Date.now() < aiRestUntil) throw new Error('quota');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(AI_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json();
    if (j.error === 'quota') { aiRestUntil = nextUtcMidnight(); quotaToast(); const e = new Error('quota'); e.shown = true; throw e; }
    if (!r.ok) throw new Error(j.error || 'ai');
    return j;
  } finally { clearTimeout(t); }
}
// The helper runs on a free plan with a daily allowance; when it's used up it comes back at
// midnight UTC (5:00 in Tashkent) — until then the app says so instead of trying.
let aiRestUntil = 0;
const nextUtcMidnight = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };
const quotaToast = () => toast(`The AI helper has done enough for today — it's back at ${hm(nextUtcMidnight())}`);
// What to say when the helper couldn't be used.
function aiFail(e, busy, offline, again) {
  if (e && e.message === 'quota') { if (!e.shown) quotaToast(); return; }
  if (!navigator.onLine) toast(offline);
  else toast(busy, again ? { label: 'Try again', run: again } : undefined);
}
// A picture of just these strokes on white, for the AI to look at. Maths is sent in dark ink (easiest
// to read); a drawing keeps its colours (a green top on a brown stem is clearly a tree). The picture is
// packed off the main thread (toBlob), so the page doesn't stutter while it's made.
async function cropPng(items, colour = false, max = 512, pad = 24) {
  const bb = bboxOf(items), side = Math.max(bb.w, bb.h) + pad * 2, k = Math.min(1, max / side) * (side < 200 ? 2 : 1);
  const w = Math.round((bb.w + pad * 2) * k), h = Math.round((bb.h + pad * 2) * k);
  const c = document.createElement('canvas');
  c.width = Math.max(32, w);
  c.height = Math.max(32, h);
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.setTransform(k, 0, 0, k, (pad - bb.x0) * k, (pad - bb.y0) * k);
  const minW = Math.max(bb.w, bb.h) / 70; // thin pen on a big drawing is hard to read
  items.forEach((it) => paintItem(x, { ...it, stale: false, fade: null, reveal: null, c: it.t === 's' && !colour ? '#1C1C1E' : it.c, w: it.t === 's' ? Math.max(it.w, minW) : it.w }, 1));
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) return c.toDataURL('image/png');
  return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });
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
    // An answer whose sum was changed since is pale until ✨ works it out again.
    if (it.stale) ctx.globalAlpha *= 0.3;
    // A new answer is written from left to right.
    if (it.reveal != null && it.reveal < 1) { ctx.beginPath(); ctx.rect(it.x - 10, it.y - 10, (it.w + 20) * it.reveal, it.h + 20); ctx.clip(); }
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
// The part of the paper the note shows: what's drawn, with a margin.
function pngBox(d) {
  const b = bboxOf(d.items), m = 40;
  const x0 = Math.max(0, Math.floor(b.x0 - m)), y0 = Math.max(0, Math.floor(b.y0 - m));
  const x1 = Math.min(d.w, Math.ceil(b.x1 + m)), y1 = Math.min(d.h, Math.ceil(b.y1 + m));
  return { x0, y0, w: Math.max(160, x1 - x0), h: Math.max(120, y1 - y0) };
}
// The picture the note shows, twice as sharp as the paper's units; its width tells the note how
// wide to show it (see sizeDrawing), so it keeps its size.
function renderPng(d) {
  return new Promise((done) => loadItemImages(d.items, () => {
    const { x0, y0, w, h } = pngBox(d), k = 2;
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
    <i class="dr-warm" aria-hidden="true">🌳☁️🥦✨</i>
    <div class="dr-hint">Hold still at the end of a shape to make it perfect · ✨ solves a sum and makes a drawing neat · the lasso moves writing</div>
    <footer class="dr-tools">
      <button class="dr-tool on" data-dr="pen" aria-label="Pen">${glyph('draw')}</button>
      <button class="dr-tool" data-dr="eraser" aria-label="Eraser">${glyph('eraser')}</button>
      <button class="dr-tool" data-dr="lasso" aria-label="Lasso: pick up writing to move it">${glyph('lasso')}</button>
      <button class="dr-tool magic" data-dr="magic" aria-label="Solve a sum or make a drawing neat">${glyph('sparkles')}</button>
      <button class="dr-tool" data-dr="clear" aria-label="Clear">${glyph('trash')}</button>
      <button class="dr-color" data-dr="color" aria-label="Pen colour and size"><i></i></button>
      <div class="dr-pop" hidden>
        <div class="dr-pop-inks">${INKS.map(([c, n], i) => `<button class="ink${i ? '' : ' on'}" data-dr="ink" data-v="${c}" style="--c:${c}" aria-label="${n}"></button>`).join('')}</div>
        <div class="dr-pop-sizes">${SIZES.map((s, i) => `<button class="dr-sz${i === 1 ? ' on' : ''}" data-dr="size" data-v="${i}" aria-label="${['Thin', 'Medium', 'Thick'][i]} pen"><i style="--s:${[5, 9, 15][i]}px"></i></button>`).join('')}</div>
      </div>
    </footer>`;
  document.body.appendChild(wrap);
  const stage = $('.dr-stage', wrap), paper = $('.dr-paper', wrap);
  // The page fills the space between the bars; a drawing opened again keeps its own shape.
  const sw = stage.clientWidth - 24, sh = stage.clientHeight - 24;
  const w = DRAW_W, h = data ? data.h : Math.round(DRAW_W * Math.min(1.6, Math.max(0.75, sh / sw)));
  const base = $('.dr-base', wrap), live = $('.dr-live', wrap);
  DR = {
    wrap, paper, base, live, w, h, k: 1, scale: 1, onDone,
    bx: base.getContext('2d'), lx: live.getContext('2d'), // (not 'desynchronized': on Android that paints the paper black)
    items: data ? data.items.map((it) => ({ ...it })) : [], hist: [], hi: -1,
    ink: INKS[0][0], size: 1, tool: 'pen', magic: false, stroke: null, busy: new Set(), timers: {}, glows: [], sel: null,
  };
  layoutPaper();
  requestAnimationFrame(() => wrap.classList.add('show'));
  loadItemImages(DR.items, () => redraw());
  drHist();
  redraw();
  toolUi();
  bindDrawing();
  warmPick();
  const close = () => { if (DR && DR.pick) { closePick(); return; } closeDrawing(false); };
  DR.layer = close;
  layers.push(close);
  buzz(10);
}
// Size the paper to fit the space (its shape is DR.w × DR.h) and its canvases to the screen's pixels.
function layoutPaper() {
  const d = DR, stage = $('.dr-stage', d.wrap);
  const sw = stage.clientWidth - 24, sh = stage.clientHeight - 24;
  d.scale = Math.min(sw / d.w, sh / d.h);
  d.paper.style.width = `${Math.round(d.w * d.scale)}px`;
  d.paper.style.height = `${Math.round(d.h * d.scale)}px`;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  [d.base, d.live].forEach((c) => { c.width = Math.round(d.w * d.scale * dpr); c.height = Math.round(d.h * d.scale * dpr); });
  d.k = d.scale * dpr;
}
// More paper at the bottom (for an answer under the last line): the page grows and gently shrinks
// to fit, so everything stays in view.
function growPaper(h) {
  const d = DR;
  if (!d || h <= d.h) return;
  const r0 = d.paper.getBoundingClientRect();
  d.h = Math.min(Math.ceil(h), DRAW_W * 3);
  layoutPaper();
  redraw();
  hideChip();
  if (d.sel) selFrame();
  d.glows.forEach(placeGlow);
  if (reduceMotion()) return;
  const r1 = d.paper.getBoundingClientRect();
  d.paper.animate([
    { transformOrigin: '0 0', transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(${r0.width / r1.width})` },
    { transformOrigin: '0 0', transform: 'none' },
  ], { duration: 380, easing: 'cubic-bezier(.2, .9, .3, 1)' });
}
function closeDrawing(keep) {
  if (!DR) return;
  const d = DR;
  DR = null;
  const i = layers.indexOf(d.layer);
  if (i >= 0) layers.splice(i, 1);
  Object.values(d.timers).forEach((t) => clearTimeout(t));
  if (d.pick) d.pick.el.remove();
  d.wrap.classList.remove('show');
  setTimeout(() => d.wrap.remove(), 300);
  const clean = ({ fade, reveal, ...it }) => it;
  if (keep && d.onDone) d.onDone(d.items.length ? { v: 1, w: d.w, h: d.h, items: d.items.map(clean) } : null);
}
function redraw() {
  if (!DR) return;
  const { bx, k } = DR;
  bx.setTransform(1, 0, 0, 1, 0, 0);
  bx.clearRect(0, 0, DR.base.width, DR.base.height);
  bx.setTransform(k, 0, 0, k, 0, 0);
  DR.items.forEach((it) => paintItem(bx, it));
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
    penPop(false);
    if (d.pick) closePick();
    deselect();
    const q = toPaper(e);
    if (d.magic) { d.magic = false; magicMode(false); magicAt(q); return; }
    if (d.tool === 'eraser') { d.stroke = { id: e.pointerId, erase: true, gone: [] }; eraseAt(q); return; }
    if (d.tool === 'lasso') { d.stroke = { id: e.pointerId, lasso: true, p: [q[0], q[1]], t0: performance.now() }; return; }
    clearTimeout(d.timers.hold);
    clearTimeout(d.timers.chip);
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
      if (!s.lasso && Math.hypot(q[0] - s.still[0], q[1] - s.still[1]) > 9) { s.still = q; holdTimer(); }
    }
    if (s.lasso) drawLasso(s.p);
    else if (!s.erase) drawLive();
  });
  const end = (e) => {
    const s = d.stroke;
    if (!s || e.pointerId !== s.id) return;
    d.stroke = null;
    clearTimeout(d.timers.hold);
    if (s.erase) { afterErase(s.gone); drHist(); return; }
    liveClear();
    const tap = performance.now() - s.t0 < 350 && pathLen(pairs(s.p)) < 12;
    if (s.lasso) { lassoSelect(s.p, tap); return; }
    if (!s.snapped && tap) {
      const hit = itemAt([s.p[0], s.p[1]]);
      if (hit) { selectIds([hit.id]); buzz(6); hint('Drag it anywhere · pull the round corner to resize · × removes it'); return; }
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
    if (a !== 'color' && a !== 'ink' && a !== 'size') penPop(false);
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
    if (a === 'pen' || a === 'eraser' || a === 'lasso') {
      DR.tool = a === 'pen' || DR.tool !== a ? a : 'pen';
      if (DR.magic) { DR.magic = false; magicMode(false); }
      deselect();
      toolUi();
      if (DR.tool === 'lasso') hint('Draw a loop around the writing you want to move');
      else hint(null);
    }
    if (a === 'color') { const open = $('.dr-pop', DR.wrap).hidden; if (DR.tool !== 'pen') { DR.tool = 'pen'; toolUi(); } penPop(open); }
    if (a === 'ink') { DR.ink = b.dataset.v; DR.tool = 'pen'; toolUi(); setTimeout(() => penPop(false), 140); }
    if (a === 'size') { DR.size = +b.dataset.v; DR.tool = 'pen'; toolUi(); setTimeout(() => penPop(false), 140); }
    if (a === 'magic') { DR.magic = !DR.magic; magicMode(DR.magic); }
    if (a === 'clear' && DR.items.length) {
      ask({ title: 'Clear the whole drawing?', ok: 'Clear', destructive: true }).then((ok) => { if (ok && DR) { DR.items = []; hideChip(); deselect(); redraw(); drHist(); } });
    }
    if (a === 'chip') {
      hideChip();
      const ids = b._ids || [];
      if (b.dataset.kind === 'math') solveLine(ids);
      else makeNeat(DR.items.filter((it) => ids.includes(it.id)));
    }
  });
}
function toolUi() {
  const w = DR.wrap;
  ['pen', 'eraser', 'lasso'].forEach((t) => $(`[data-dr="${t}"]`, w).classList.toggle('on', DR.tool === t && !DR.magic));
  $$('.ink', w).forEach((b) => b.classList.toggle('on', b.dataset.v === DR.ink));
  $$('.dr-sz', w).forEach((b) => { b.classList.toggle('on', +b.dataset.v === DR.size); $('i', b).style.background = DR.ink; });
  const c = $('.dr-color', w);
  c.style.setProperty('--c', DR.ink);
  c.style.setProperty('--s', `${[7, 11, 16][DR.size]}px`);
}
// The colour & size bubble above the colour button.
function penPop(open) {
  const p = DR && $('.dr-pop', DR.wrap);
  if (!p || p.hidden === !open) return;
  if (open) { p.hidden = false; p.classList.remove('out'); buzz(6); return; }
  p.classList.add('out');
  clearTimeout(p._t);
  p._t = setTimeout(() => { if (p.classList.contains('out')) { p.hidden = true; p.classList.remove('out'); } }, 160);
}
function magicMode(on) {
  DR.wrap.classList.toggle('magic', on);
  $('[data-dr="magic"]', DR.wrap).classList.toggle('on', on);
  toolUi();
  hint(on ? 'Now tap a sum or a drawing' : null);
}
function hint(text) {
  const h = $('.dr-hint', DR.wrap);
  if (!h._def) h._def = h.textContent;
  const t = text || (DR.tool === 'lasso' ? 'Draw a loop around the writing you want to move' : h._def);
  if (h.textContent === t) return;
  h.textContent = t;
  h.classList.toggle('now', !!text);
  h.classList.remove('swap');
  void h.offsetWidth;
  h.classList.add('swap');
}
function drawLive() {
  const s = DR.stroke;
  liveClear();
  if (!s || s.erase) return;
  paintItem(DR.lx, { t: 's', c: s.c, w: s.w, p: s.snapped ? s.snapped.p : s.p, shape: s.snapped && s.snapped.done ? s.snapped.kind : null });
}
function drawLasso(p) {
  const x = DR.lx;
  liveClear();
  x.save();
  x.lineWidth = 3 / DR.scale;
  x.setLineDash([10 / DR.scale, 8 / DR.scale]);
  x.strokeStyle = '#0A84FF';
  x.fillStyle = 'rgba(10, 132, 255, .06)';
  x.beginPath();
  x.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]);
  x.closePath();
  x.fill();
  x.stroke();
  x.restore();
}
// Finger kept still → try to turn the line into a perfect shape (with a short morph).
function holdTimer() {
  clearTimeout(DR.timers.hold);
  DR.timers.hold = setTimeout(() => {
    const s = DR && DR.stroke;
    if (!s || s.erase || s.lasso || s.snapped || s.p.length < 8) return;
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
  const gone = DR.items.filter(hit);
  if (!gone.length) return;
  DR.items = DR.items.filter((it) => !gone.includes(it));
  if (DR.stroke && DR.stroke.gone) DR.stroke.gone.push(...gone);
  redraw();
  buzz(6);
}
// After rubbing out: an answer whose sum is all gone goes too; one whose sum changed turns pale.
function afterErase(gone) {
  if (!DR || !gone || !gone.length) return;
  const ids = new Set(gone.map((x) => x.id)), have = new Set(DR.items.map((x) => x.id));
  let changed = false;
  DR.items = DR.items.filter((a) => {
    if (a.t !== 'a') return true;
    const L = ansLine(a);
    if (!L.some((id) => ids.has(id))) return true;
    changed = true;
    if (!L.some((id) => have.has(id))) return false;
    a.stale = true;
    return true;
  });
  if (changed) redraw();
}

// ---------- Lines of writing, sums and "=" ----------
// Strokes near each other form one drawing.
function groupOf(it, pool = DR.items) {
  const strokes = pool.filter((x) => x.t === 's');
  const grow = (b, m) => ({ x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m });
  const group = [it], boxes = new Map(strokes.map((s) => [s, bboxOf([s])]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of strokes) {
      if (group.includes(s)) continue;
      if (group.some((g) => boxesMeet(grow(boxes.get(g) || bboxOf([g]), 26), boxes.get(s)))) { group.push(s); changed = true; }
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
// Is there an "=" on this line (at its end, or with writing on both sides)?
function lineHasEquals(line) {
  const flats = line.filter(isFlat);
  for (let i = 0; i < flats.length; i++) for (let j = i + 1; j < flats.length; j++) if (eqPair(flats[i], flats[j])) return true;
  return false;
}
// The strokes an answer belongs to.
const ansLine = (a) => a.line || (a.eq && a.eq.ids) || [];
function afterStroke(it) {
  clearTimeout(DR.timers.chip);
  if (it.shape) return; // a perfect shape: nothing to offer
  const line = lineOf(it);
  // Writing on a line that already has an answer: the answer turns pale until ✨ is tapped again.
  const ids = new Set(line.map((x) => x.id));
  let pale = false;
  DR.items.forEach((a) => { if (a.t === 'a' && !a.stale && ansLine(a).some((id) => ids.has(id))) { a.stale = true; pale = true; } });
  if (pale) redraw();
  // A sum or an equation: ✨ at the end of its line. Nothing is worked out until it's tapped.
  if (line.length >= 3 && lineHasEquals(line)) { DR.timers.chip = setTimeout(() => mathChip(line.map((x) => x.id)), 450); return; }
  DR.timers.chip = setTimeout(() => showChip(it), 1300);
}
// How wide a line of handwriting is.
const measureCtx = document.createElement('canvas').getContext('2d');
function handWidth(s, size) { measureCtx.font = `600 ${Math.round(size)}px ${HAND_FONT}`; return measureCtx.measureText(s).width; }
// An answer in handwriting, right UNDER the sum it answers (lined up with its start). If the next
// line of writing is close below, it's written smaller to fit in between; only when there's no room
// at all does it go at the end of the line. Near the bottom the paper grows.
function answerBelow(res, lineItems, extra = {}) {
  const lines = res.kind === 'value' ? [`= ${res.lines[0]}`] : res.lines;
  const c = res.kind === 'check' ? (res.ok ? '#34C759' : '#FF3B30') : ANSWER_C;
  const box = bboxOf(lineItems), lineH = Math.max(40, Math.min(170, extra.lineH || box.h));
  const measure = (size) => { const lh = size * 1.1; return { size, lh, w: Math.max(...lines.map((l) => handWidth(l, size))), h: lh * lines.length }; };
  let m = measure(Math.max(34, Math.min(120, lineH * 0.72)));
  let x = Math.max(10, box.x0);
  // not wider than the paper
  if (x + m.w > DR.w - 10) m = measure(Math.max(24, (m.size * (DR.w - 10 - x)) / m.w));
  if (x + m.w > DR.w - 10) x = Math.max(10, DR.w - 10 - m.w);
  const gap = (size) => size * 0.22;
  let y = box.y1 + gap(m.size);
  // the next writing below, in the answer's way
  const inWay = DR.items.filter((o) => !lineItems.includes(o) && !(o.t === 'a' && extra.replaces && extra.replaces(o)))
    .map((o) => bboxOf([o])).filter((b) => b.y0 > box.y1 - 4 && b.x1 > x && b.x0 < x + m.w);
  const next = inWay.length ? Math.min(...inWay.map((b) => b.y0)) : Infinity;
  if (y + m.h > next - 6) {
    const room = next - 6 - box.y1, fit = room / (lines.length * 1.1 + 0.22);
    if (fit >= 24) { m = measure(Math.min(m.size, fit)); y = box.y1 + gap(m.size); } else {
      // no room under it: at the end of the line instead
      const ax = box.x1 + m.size * 0.35;
      if (ax + m.w <= DR.w - 10) { x = ax; y = (box.y0 + box.y1) / 2 - m.h / 2; }
    }
  }
  if (y + m.h > DR.h - 14) growPaper(y + m.h + 60);
  const { replaces, lineH: _, ...rest } = extra;
  return { t: 'a', id: nid(), s: lines.join('\n'), x, y, w: m.w, h: m.h, size: m.size, lh: m.lh, c, line: lineItems.map((s) => s.id), ...rest };
}
// Read a picture of maths (a second reader tries when the first can't be worked out).
async function readMath(items, solve = solveQuestion) {
  const img = await cropPng(items);
  let r = await aiCall('/read', { img, hint: 'math' }, 15000);
  let res = r.kind === 'math' ? solve(r.expression) : null;
  // (an equation with two letters isn't misread — it's waiting for its partner equation)
  const pair = r.kind === 'math' && /=/.test(r.expression) && unknownsIn(r.expression).length === 2;
  if (!res && DR && !pair) {
    const r2 = await aiCall('/read', { img, hint: 'math', alt: true }, 15000).catch(() => ({ kind: 'unknown' }));
    const res2 = r2.kind === 'math' ? solve(r2.expression) : null;
    if (res2 || (r.kind !== 'math' && r2.kind === 'math')) { r = r2; res = res2; }
  }
  return { r, res };
}
// Put an answer on the paper: the old answer for the same sum fades out as the new one is written.
function putAnswer(a, isSame) {
  const old = DR.items.filter((x) => x.t === 'a' && isSame(x));
  DR.items = DR.items.filter((x) => !old.includes(x)).concat([a]);
  const ghosts = old.map((x) => ({ ...x }));
  const t0 = performance.now(), ms = 520;
  a.reveal = 0;
  a.fade = 0;
  const step = (now) => {
    if (!DR) return;
    const t = Math.min(1, (now - t0) / ms), e = 1 - (1 - t) ** 2;
    a.reveal = e;
    a.fade = Math.min(1, t * 2.5);
    redraw();
    ghosts.forEach((g) => paintItem(DR.bx, g, 1 - Math.min(1, t * 2)));
    if (t < 1) requestAnimationFrame(step); else { delete a.reveal; delete a.fade; redraw(); drHist(); }
  };
  requestAnimationFrame(step);
  buzz(10);
}
// Tap ✨ on a sum: read its line and write the answer under it. An equation with two letters looks
// for its partner (the equation just above or below it) and both are solved together.
async function solveLine(ids) {
  if (!DR) return;
  const line = DR.items.filter((x) => ids.includes(x.id) && x.t === 's');
  if (!line.length) return;
  const key = 'L' + ids.slice().sort().join();
  if (DR.busy.has(key)) return;
  DR.busy.add(key);
  const d = DR, off = glow(bboxOf(line));
  try {
    const { r, res } = await readMath(line);
    if (DR !== d) return;
    let out = res, items = line;
    if (!out && r.kind === 'math' && unknownsIn(r.expression).length === 2 && /=/.test(r.expression)) {
      const other = partnerLine(line);
      if (other) {
        const off2 = glow(bboxOf(other));
        try {
          const { r: r2 } = await readMath(other, () => true);
          if (DR !== d) return;
          const sys = r2.kind === 'math' ? solveSystem(r.expression, r2.expression) : null;
          if (sys) { out = sys; items = bboxOf(other).y0 > bboxOf(line).y0 ? line.concat(other) : other.concat(line); }
        } finally { off2(); }
      }
      if (!out) { toast(other ? "Couldn't solve these two together — check they're written clearly" : 'Two unknowns need two equations — write the other one under it'); return; }
    }
    // a question in words: the AI helper works it out (and the app checks it)
    if (!out && r.kind === 'text' && r.text) out = await solveWords(r.text, d);
    if (DR !== d) return;
    if (!out) {
      toast(r.kind === 'math' ? (/[=<>≤≥]/.test(r.expression) ? "Couldn't solve that one — check it's written clearly" : 'Nothing to work out there — add “=” to get an answer') : "That doesn't look like a sum — try writing it a little bigger");
      return;
    }
    // (two equations: the answer goes under the lower one, sized like one line of writing)
    const allIds = items.map((x) => x.id);
    const same = (x) => ansLine(x).some((id) => allIds.includes(id));
    putAnswer(answerBelow(out, items, { read: r.expression || r.text, steps: out.steps && out.steps.length ? out.steps : undefined, replaces: same, lineH: bboxOf(line).h }), same);
  } catch (e) {
    if (DR === d) aiFail(e, "Couldn't work it out just now — try again", 'Working out sums needs the internet');
  } finally {
    d.busy.delete(key);
    off();
  }
}
// A handwritten question in words → an answer to write under it ({ kind, lines, steps }), or null.
async function solveWords(text, d) {
  try {
    const r = await aiCall('/solve', { text }, 75000);
    const it = r && r.items && r.items[0];
    if (!it || DR !== d) return null;
    const a = mqFromAI(it);
    if (!a.m) return null;
    const st = (a.u ? [`Understood as: ${a.u}`] : []).concat(a.st || []);
    return { kind: 'words', lines: [a.m, a.s].filter(Boolean), steps: st };
  } catch (e) {
    if (DR === d) aiFail(e, "Couldn't work it out just now — try again", 'Questions in words need the internet');
    return null;
  }
}
// The equation written just above or below this one (lined up with it), or null.
function partnerLine(line) {
  const lb = bboxOf(line), lh = Math.max(50, lb.h), have = new Set(line.map((x) => x.id));
  const cands = DR.items.filter((x) => x.t === 's' && !have.has(x.id)).map((s) => ({ s, b: bboxOf([s]) }))
    .filter(({ b }) => b.x1 > lb.x0 - lh && b.x0 < lb.x1 + lh && ((b.y0 >= lb.y1 - 4 && b.y0 < lb.y1 + 2.6 * lh) || (b.y1 <= lb.y0 + 4 && b.y1 > lb.y0 - 2.6 * lh)))
    .sort((a, b) => Math.min(Math.abs(a.b.y0 - lb.y1), Math.abs(lb.y0 - a.b.y1)) - Math.min(Math.abs(b.b.y0 - lb.y1), Math.abs(lb.y0 - b.b.y1)));
  for (const { s } of cands) {
    const other = lineOf(s);
    if (other.length >= 3 && lineHasEquals(other) && !other.some((x) => have.has(x.id))) return other;
  }
  return null;
}

// ---------- Glows, the ✨ button ----------
// A soft moving shine over the part being looked at (stays in place if the paper changes size).
function placeGlow(g) {
  const s = DR.scale, b = g.b;
  Object.assign(g.el.style, { left: `${(b.x0 - 10) * s}px`, top: `${(b.y0 - 10) * s}px`, width: `${(b.w + 20) * s}px`, height: `${(b.h + 20) * s}px` });
}
function glow(b) {
  const d = DR, g = { el: document.createElement('div'), b };
  g.el.className = 'dr-glow';
  placeGlow(g);
  $('.dr-float', d.wrap).appendChild(g.el);
  d.glows.push(g);
  return () => {
    const i = d.glows.indexOf(g);
    if (i >= 0) d.glows.splice(i, 1);
    g.el.classList.add('out');
    setTimeout(() => g.el.remove(), 300);
  };
}
function chipEl(ids, kind, left, top) {
  hideChip();
  const chip = document.createElement('button');
  chip.className = 'dr-chip';
  chip.dataset.dr = 'chip';
  chip.dataset.kind = kind;
  chip._ids = ids;
  chip.setAttribute('aria-label', kind === 'math' ? 'Work it out' : 'Make this drawing neat');
  chip.innerHTML = glyph('sparkles');
  chip.style.left = `${left}px`;
  chip.style.top = `${top}px`;
  $('.dr-float', DR.wrap).appendChild(chip);
  DR.timers.chipHide = setTimeout(hideChip, kind === 'math' ? 12000 : 6000);
}
// ✨ at the end of a line with "=" (or just under its end when the line reaches the edge).
function mathChip(ids) {
  if (!DR) return;
  const line = DR.items.filter((x) => ids.includes(x.id));
  if (line.length < 3) return;
  const b = bboxOf(line), s = DR.scale, c = 20; // (the chip is 40 px)
  if ((b.x1 + 14) * s + 44 <= DR.w * s) chipEl(ids, 'math', (b.x1 + 14) * s + 8, ((b.y0 + b.y1) / 2) * s - c);
  else chipEl(ids, 'math', Math.min(DR.w * s - 36, b.x1 * s - 24), (b.y1 + 8) * s);
}
function showChip(it) {
  if (!DR || !DR.items.includes(it)) return;
  const g = groupOf(it);
  const b = bboxOf(g);
  if (g.length < 2 && b.w < 90 && b.h < 90) return; // a dot or a tiny mark
  const s = DR.scale;
  chipEl(g.map((x) => x.id), 'draw', Math.min(DR.w - 40, b.x1) * s, Math.max(0, b.y0 - 30) * s);
}
function hideChip() {
  if (!DR) return;
  $$('.dr-chip', DR.wrap).forEach((c) => { c.classList.add('out'); c.dataset.dr = ''; setTimeout(() => c.remove(), 180); });
  clearTimeout(DR.timers.chipHide);
}
// The ✨ tool, then a tap: on a sum → its answer; on a drawing → make it neat; on a neat picture → ↻.
function magicAt(q) {
  const hit = itemAt(q);
  if (hit && (hit.t === 'i' || hit.t === 'e') && hit.from) { repick(hit); return; }
  if (hit && hit.t === 'a' && ansLine(hit).length) { solveLine(ansLine(hit)); return; }
  const near = DR.items.filter((x) => x.t === 's').map((x) => ({ x, d: Math.min(...pairs(x.p).map((p) => Math.hypot(p[0] - q[0], p[1] - q[1]))) })).sort((a, b) => a.d - b.d)[0];
  if (!near || near.d > 60) { toast('Tap right on a sum or a drawing'); return; }
  const line = lineOf(near.x);
  if (line.length >= 3 && lineHasEquals(line)) solveLine(line.map((x) => x.id));
  else makeNeat(groupOf(near.x));
}

// ---------- ✨ Neat drawings ----------
// The helper guesses what the drawing is; you pick (or type) what it really is and a style.
async function makeNeat(group) {
  if (!DR || !group.length) return;
  const d = DR, key = group.map((x) => x.id).join();
  if (d.busy.has(key)) return;
  d.busy.add(key);
  const b = bboxOf(group);
  const off = glow(b);
  let read;
  try {
    read = await aiCall('/read', { img: await cropPng(group, true), hint: 'object' }, 20000);
  } catch (e) {
    off();
    d.busy.delete(key);
    if (DR === d) aiFail(e, "Couldn't reach the drawing helper — try again", 'Making drawings neat needs the internet');
    return;
  }
  if (DR !== d) return;
  if (read.kind === 'math') {
    // It's a sum after all: its whole line is worked out.
    off();
    d.busy.delete(key);
    solveLine(lineOf(group[0]).map((x) => x.id));
    return;
  }
  if (read.kind === 'text' && read.text) {
    // a question in words: worked out and answered under it
    if (looksLikeMath(read.text) || /\?\s*$/.test(read.text)) {
      const out = await solveWords(read.text, d);
      off();
      d.busy.delete(key);
      if (!out || DR !== d) return;
      const ids = group.map((x) => x.id), same = (x) => ansLine(x).some((id) => ids.includes(id));
      putAnswer(answerBelow(out, group, { read: read.text, steps: out.steps, replaces: same }), same);
      return;
    }
    off();
    d.busy.delete(key);
    toast(`That looks like writing: “${read.text}”`);
    return;
  }
  openPick({ group, guesses: read.kind === 'object' ? read.guesses || [] : [], off, key });
}
// ↻ on a neat picture: pick again (another style, another guess, or just another try).
function repick(it) {
  if (!DR || !it.from) return;
  const key = 'P' + it.id;
  if (DR.busy.has(key)) return;
  DR.busy.add(key);
  const had = (it.guesses || []).find((g) => g.name === it.name);
  const guesses = [{ name: it.name, emoji: (had && had.emoji) || it.ch || '' }].concat((it.guesses || []).filter((g) => g.name !== it.name));
  openPick({ item: it, guesses, off: glow(bboxOf([it])), key });
}
// Build a hidden guesses card once, in a quiet moment after the paper opens: the first real one then
// appears without a stutter (fonts, emoji and the text box are ready).
function warmPick() {
  const d = DR, idle = window.requestIdleCallback || ((f) => setTimeout(f, 500));
  setTimeout(() => idle(() => {
    if (DR !== d || d.pick) return;
    const el = document.createElement('div');
    el.className = 'dr-pick';
    el.style.cssText = 'visibility:hidden;animation:none';
    el.innerHTML = pickHtml('What did you draw?', [{ name: 'tree', emoji: '🌳' }, { name: 'cloud', emoji: '☁️' }, { name: 'broccoli', emoji: '🥦' }]);
    d.wrap.appendChild(el);
    void el.offsetHeight;
    el.remove();
  }), 450);
}
const pickHtml = (title, gs) => `
    <div class="dr-pick-h"><b>${title}</b><button class="dr-pick-x" data-dr="pick-x" aria-label="Close">${glyph('x')}</button></div>
    ${gs.length ? `<div class="dr-pick-gs">${gs.map((g, i) => `<button class="dr-g" data-dr="pick" data-i="${i}" style="--i:${i}"><span class="dr-g-e">${esc(g.emoji || '✨')}</span><span class="dr-g-n">${esc(cap(g.name))}</span></button>`).join('')}</div>` : ''}
    <form class="dr-pick-own"><input type="text" maxlength="40" placeholder="${gs.length ? 'Something else? Type it' : 'Type what it is'}" enterkeyhint="go" autocomplete="off" aria-label="What it is"><button type="submit" aria-label="Draw it">${glyph('chevR')}</button></form>
    <div class="seg dr-style">${segButtons('dr-style', DRAW_STYLES, drawStyle())}</div>`;
// "What did you draw?" — three guesses, a box to type your own, and the style.
function openPick(o) {
  const d = DR;
  if (!d) return;
  if (d.pick) closePick();
  deselect();
  const gs = o.guesses.slice(0, 3);
  const el = document.createElement('div');
  el.className = 'dr-pick';
  el.innerHTML = pickHtml(o.item ? 'Draw it again' : gs.length ? 'What did you draw?' : "What is it? I couldn't tell", gs);
  // Out of the way of the drawing: at the bottom, or at the top when the drawing is low on the page.
  const b = o.item ? bboxOf([o.item]) : bboxOf(o.group);
  el.classList.toggle('top', (b.y0 + b.y1) / 2 > d.h * 0.55);
  d.wrap.appendChild(el);
  d.pick = { ...o, el };
  hint(null);
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dr]');
    if (!btn || !DR || DR.pick !== d.pick) return;
    e.stopPropagation();
    if (btn.dataset.dr === 'pick-x') closePick();
    if (btn.dataset.dr === 'pick') { btn.classList.add('chosen'); const g = gs[+btn.dataset.i]; setTimeout(() => choose(d.pick, g), 120); }
  });
  $('form', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('input', el).value.trim();
    if (!v) { $('input', el).focus(); return; }
    $('input', el).blur();
    choose(d.pick, { name: v.toLowerCase(), emoji: '' });
  });
  buzz(8);
}
function closePick(keepGlow) {
  const d = DR;
  if (!d || !d.pick) return;
  const p = d.pick;
  d.pick = null;
  if (!keepGlow) { p.off(); d.busy.delete(p.key); }
  p.el.classList.add('out');
  if (document.activeElement && p.el.contains(document.activeElement)) document.activeElement.blur();
  setTimeout(() => p.el.remove(), 220);
}
ACTIONS['dr-style'] = (el) => {
  S.settings.drawStyle = el.dataset.v;
  save();
  const seg = el.closest('.seg');
  if (seg) seg.innerHTML = segButtons('dr-style', DRAW_STYLES, drawStyle());
  buzz(6);
};
// Draw it: the sketch glows while the neat picture is made, then turns into it.
async function choose(o, g) {
  const d = DR;
  if (!d || !o || d.pick !== o) return;
  const name = String(g.name || '').trim().toLowerCase().slice(0, 40);
  if (!name) return;
  closePick(true);
  const style = drawStyle();
  const from = o.item ? o.item.from : o.group.map(({ fade, ...s }) => ({ ...s }));
  const guesses = [{ name, emoji: g.emoji || '' }].concat(o.guesses.filter((x) => x.name !== name)).slice(0, 4);
  hint(`${cap(name)} — drawing it…`);
  try {
    const r = await aiCall('/redraw', { img: await cropPng(from, true), name, style, seed: Math.floor(Math.random() * 2e9) }, 70000); // (the drawing model is sometimes busy)
    if (DR !== d) return;
    const target = o.item ? DR.items.find((x) => x.id === o.item.id) : null;
    if (o.item ? !target : !o.group.every((s) => DR.items.includes(s))) return; // changed meanwhile
    const it = { t: 'i', id: nid(), src: await whiten(r.img), name, style, guesses, from };
    if (DR !== d) return;
    if (target) Object.assign(it, { x: target.x, y: target.y, w: target.w, h: target.h });
    else {
      // The picture is square around the sketch (with the same margin as the crop the helper saw).
      const b = bboxOf(o.group), side = Math.max(b.w, b.h) + 48;
      Object.assign(it, { x: (b.x0 + b.x1) / 2 - side / 2, y: (b.y0 + b.y1) / 2 - side / 2, w: side, h: side });
    }
    await new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = it.src; imgCache.set(it.id, im); });
    if (DR !== d) return;
    swapIn(target ? [target] : o.group, it);
    selectIds([it.id]);
    buzz(12);
  } catch (e) {
    if (DR === d) aiFail(e, "Couldn't draw it just now", 'Making drawings neat needs the internet', () => { if (DR === d && !d.pick) { d.busy.add(o.key); d.pick = o; o.off = glow(o.item ? bboxOf([o.item]) : bboxOf(o.group)); choose(o, g); } });
  } finally {
    o.off();
    d.busy.delete(o.key);
    if (DR === d) hint(null);
  }
}
// The AI's pictures come on paper that's a little cream or grey; make that paper pure white (by the
// colour of its corners) so it disappears into the page with no box around the drawing.
function whiten(src) {
  return new Promise((done) => {
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas'), w = im.naturalWidth, h = im.naturalHeight;
        c.width = w;
        c.height = h;
        const x = c.getContext('2d', { willReadFrequently: false });
        x.drawImage(im, 0, 0);
        // the paper's colour, from its four corners
        let bg = 255;
        [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].forEach(([cx, cy]) => { const p = x.getImageData(cx, cy, 1, 1).data; bg = Math.min(bg, p[0], p[1], p[2]); });
        if (bg < 200 || bg >= 254) { done(src); return; } // already white, or not a light background
        // brighten just enough that the paper becomes white (the drawing itself changes very little)
        x.filter = `brightness(${(255 / bg + 0.01).toFixed(3)})`;
        x.drawImage(im, 0, 0);
        c.toBlob((b) => {
          if (!b) { done(c.toDataURL('image/jpeg', 0.92)); return; }
          const fr = new FileReader();
          fr.onload = () => done(fr.result);
          fr.onerror = () => done(src);
          fr.readAsDataURL(b);
        }, 'image/jpeg', 0.92);
      } catch (e) { done(src); }
    };
    im.onerror = () => done(src);
    im.src = src;
  });
}
// Replace some parts with a new one: the old ones fade out as the new one fades in.
function swapIn(old, it) {
  const t0 = performance.now(), ms = 420;
  DR.items = DR.items.filter((x) => !old.includes(x)).concat([it]);
  const ghosts = old.map((x) => ({ ...x }));
  it.fade = 0;
  const step = (now) => {
    if (!DR) return;
    const t = Math.min(1, (now - t0) / ms);
    it.fade = 1 - (1 - t) ** 2;
    redraw();
    ghosts.forEach((g) => paintItem(DR.bx, g, 1 - t));
    if (t < 1) requestAnimationFrame(step); else { delete it.fade; redraw(); drHist(); if (DR.sel) selFrame(); }
  };
  requestAnimationFrame(step);
}

// ---------- Picking things up ----------
// Tap a neat picture or an answer to pick it up; the lasso picks up handwriting. Drag the frame to
// move, pull the round corner to make it bigger or smaller, × removes, ↻ draws a picture again.
const movable = (it) => it && (it.t === 'e' || it.t === 'i' || it.t === 'a');
function itemAt(q) {
  for (let k = DR.items.length - 1; k >= 0; k--) {
    const it = DR.items[k];
    if (movable(it) && q[0] >= it.x - 14 && q[0] <= it.x + it.w + 14 && q[1] >= it.y - 14 && q[1] <= it.y + it.h + 14) return it;
  }
  return null;
}
function strokeAt(q) {
  for (let k = DR.items.length - 1; k >= 0; k--) {
    const it = DR.items[k];
    if (it.t !== 's') continue;
    const P = pairs(it.p), r = it.w / 2 + 16;
    if (P.length === 1 ? Math.hypot(P[0][0] - q[0], P[0][1] - q[1]) < r : P.some((p, i) => i && segDist(q, P[i - 1], p) < r)) return it;
  }
  return null;
}
// What the lasso went round: strokes mostly inside it, pictures and answers with their middle inside.
// An answer comes along with its sum.
function lassoSelect(p, tap) {
  let ids;
  if (tap) {
    const q = [p[0], p[1]], hit = itemAt(q), s = !hit && strokeAt(q);
    ids = hit ? [hit.id] : s ? groupOf(s).map((x) => x.id) : [];
  } else {
    const P = pairs(p);
    if (P.length < 3) return;
    ids = DR.items.filter((it) => {
      if (it.t !== 's') return pointInPoly(it.x + it.w / 2, it.y + it.h / 2, P);
      const pts = pairs(it.p);
      return pts.filter(([x, y]) => pointInPoly(x, y, P)).length >= Math.max(1, pts.length * 0.5);
    }).map((it) => it.id);
  }
  const set = new Set(ids);
  DR.items.forEach((a) => { if (a.t === 'a' && !set.has(a.id)) { const L = ansLine(a); if (L.length && L.every((id) => set.has(id))) set.add(a.id); } });
  if (!set.size) { hint(tap ? 'Draw a loop around the writing you want to move' : 'Nothing inside — draw the loop around the writing'); return; }
  selectIds([...set]);
  buzz(8);
  hint('Drag to move · pull the round corner to resize · × removes');
}
const selItems = () => (DR && DR.sel ? DR.items.filter((x) => DR.sel.includes(x.id)) : []);
function selectIds(ids) { if (!DR) return; DR.sel = ids.slice(); selFrame(); }
function deselect() { if (DR && DR.sel) { DR.sel = null; selFrame(); } }
function selFrame() {
  let f = $('.dr-sel:not(.out)', DR.wrap);
  const its = selItems();
  if (!its.length) {
    if (f) { f.classList.add('out'); setTimeout(() => f.remove(), 180); }
    DR.sel = null;
    stepsCard(null);
    return;
  }
  if (!f) {
    f = document.createElement('div');
    f.className = 'dr-sel';
    f.innerHTML = `<button class="dr-sel-x" aria-label="Remove">${glyph('x')}</button><button class="dr-sel-re" aria-label="Draw it again" hidden>${glyph('repeat')}</button><button class="dr-sel-st" hidden>Steps</button><i class="dr-sel-r" aria-hidden="true"></i>`;
    $('.dr-float', DR.wrap).appendChild(f);
    bindSel(f);
  }
  const b = bboxOf(its), s = DR.scale, pad = 8;
  Object.assign(f.style, { left: `${b.x0 * s - pad}px`, top: `${b.y0 * s - pad}px`, width: `${b.w * s + pad * 2}px`, height: `${b.h * s + pad * 2}px` });
  const one = its.length === 1 && (its[0].t === 'i' || its[0].t === 'e') && its[0].from;
  $('.dr-sel-re', f).hidden = !one;
  // a worked-out answer: "Steps" shows how
  const ans = its.length === 1 && its[0].t === 'a' && Array.isArray(its[0].steps) && its[0].steps.length ? its[0] : null;
  $('.dr-sel-st', f).hidden = !ans;
  if (DR.stepsFor && (!ans || DR.stepsFor !== ans.id)) stepsCard(null);
  else if (DR.stepsFor) stepsCard(ans, true);
}
// The steps of a worked-out answer, in a card under it (tap Steps again, or anywhere else, to close).
function stepsCard(it, move) {
  if (!DR) return;
  const old = $('.dr-steps:not(.out)', DR.wrap);
  if (!it) {
    DR.stepsFor = null;
    if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 180); }
    return;
  }
  const f = $('.dr-sel:not(.out)', DR.wrap);
  if (!f) return;
  let c = old;
  if (!c) {
    c = document.createElement('div');
    c.className = 'dr-steps';
    c.innerHTML = `<ol>${it.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
    c.addEventListener('pointerdown', (e) => e.stopPropagation());
    $('.dr-float', DR.wrap).appendChild(c);
  }
  DR.stepsFor = it.id;
  const left = parseFloat(f.style.left), top = parseFloat(f.style.top) + parseFloat(f.style.height) + 42, fw = $('.dr-float', DR.wrap).clientWidth;
  c.style.left = `${Math.max(8, Math.min(left, fw - c.offsetWidth - 8))}px`;
  c.style.top = `${top}px`;
  if (!move) buzz(4);
}
const moveItem = (o, dx, dy) => (o.t === 's' ? { ...o, p: o.p.map((v, i) => v + (i % 2 ? dy : dx)) } : { ...o, x: o.x + dx, y: o.y + dy });
function scaleItem(o, x0, y0, k) {
  if (o.t === 's') return { ...o, p: o.p.map((v, i) => (i % 2 ? y0 + (v - y0) * k : x0 + (v - x0) * k)), w: Math.max(1.5, Math.min(60, o.w * k)) };
  const n = { ...o, x: x0 + (o.x - x0) * k, y: y0 + (o.y - y0) * k, w: o.w * k, h: o.h * k };
  if (o.t === 'a') Object.assign(n, { size: o.size * k, lh: (o.lh || o.size * 1.1) * k });
  return n;
}
function bindSel(f) {
  let st = null;
  f.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.dr-sel-x, .dr-sel-re, .dr-sel-st')) return;
    const its = selItems();
    if (!its.length) return;
    e.preventDefault();
    e.stopPropagation();
    f.setPointerCapture(e.pointerId);
    st = { id: e.pointerId, q0: toPaper(e), orig: new Map(its.map((x) => [x.id, x])), bb: bboxOf(its), resize: !!e.target.closest('.dr-sel-r'), moved: false };
    f.classList.add('moving');
    hideChip();
  });
  f.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id || !DR) return;
    const q = toPaper(e), bb = st.bb;
    let dx = q[0] - st.q0[0], dy = q[1] - st.q0[1];
    if (!st.moved && Math.hypot(dx, dy) < 3) return;
    st.moved = true;
    let fn;
    if (st.resize) {
      const k = Math.max(40 / Math.max(1, Math.min(bb.w, bb.h)), Math.min(4, DR.w / bb.w, (bb.w + Math.max(dx, (dy * bb.w) / bb.h)) / bb.w));
      fn = (o) => scaleItem(o, bb.x0, bb.y0, k);
    } else {
      // (at least half of it stays on the paper)
      dx = Math.max(-bb.x0 - bb.w / 2, Math.min(DR.w - bb.x1 + bb.w / 2, dx));
      dy = Math.max(-bb.y0 - bb.h / 2, Math.min(DR.h - bb.y1 + bb.h / 2, dy));
      fn = (o) => moveItem(o, dx, dy);
    }
    DR.items = DR.items.map((x) => { const o = st.orig.get(x.id); return o ? fn(o) : x; });
    redraw();
    selFrame();
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    f.classList.remove('moving');
    if (!s.moved || !DR) return;
    // part of a sum moved away from its answer: the answer turns pale
    const moved = new Set(s.orig.keys());
    DR.items.forEach((a) => { if (a.t === 'a' && !moved.has(a.id) && ansLine(a).some((id) => moved.has(id))) a.stale = true; });
    redraw();
    drHist();
    buzz(6);
  };
  f.addEventListener('pointerup', end);
  f.addEventListener('pointercancel', end);
  $('.dr-sel-x', f).addEventListener('click', (e) => {
    e.stopPropagation();
    if (!DR) return;
    const gone = selItems();
    DR.items = DR.items.filter((x) => !gone.includes(x));
    deselect();
    fadeOut(gone);
    afterErase(gone);
    drHist();
    buzz(8);
  });
  $('.dr-sel-re', f).addEventListener('click', (e) => {
    e.stopPropagation();
    const it = selItems()[0];
    if (it) repick(it);
  });
  $('.dr-sel-st', f).addEventListener('click', (e) => {
    e.stopPropagation();
    const it = selItems()[0];
    if (!it || !DR) return;
    if (DR.stepsFor === it.id) stepsCard(null); else stepsCard(it);
  });
}
// Removed parts fade away instead of vanishing.
function fadeOut(gone) {
  const ghosts = gone.map((x) => ({ ...x })), t0 = performance.now();
  const step = (now) => {
    if (!DR) return;
    const t = Math.min(1, (now - t0) / 240);
    redraw();
    if (t < 1) { ghosts.forEach((g) => paintItem(DR.bx, g, 1 - t)); requestAnimationFrame(step); }
  };
  requestAnimationFrame(step);
}

// ---------- In the note ----------
// Drawing blocks: <div class="ph dr [fl|fr]" data-w="…"><img data-blob="picture" data-vec="parts"></div>
// fl = at the left with text on its right, fr = at the right with text on its left, neither = on its
// own line. data-w = the width chosen by pulling its corner (% of the note).
const DR_SIDE_MAX = 72; // a drawing with text beside it takes at most this much of the width
// Photos work the same way (class ph without dr): full width on their own line unless resized, half
// the width when put beside the text.
function drawPct(ph, img) {
  const want = +ph.dataset.w, side = ph.classList.contains('fl') || ph.classList.contains('fr');
  let p = want >= 15 && want <= 100 ? want
    : !ph.classList.contains('dr') ? (side ? 50 : 0)
      : img.naturalWidth ? Math.min(100, (img.naturalWidth / (2 * DRAW_W)) * 100) : 0;
  if (!p) return 0;
  if (side) p = Math.min(p, DR_SIDE_MAX);
  return Math.max(15, p);
}
// A drawing in a note is shown as wide, relative to the note, as it was on the paper (or as chosen).
function sizeDrawing(img) {
  const ph = img.closest('.ph');
  if (!ph) return;
  const set = () => {
    const p = drawPct(ph, img);
    if (img.style.width) img.style.width = '';
    if (p) ph.style.width = `${p.toFixed(1)}%`;
    else if (ph.style.width) ph.style.removeProperty('width');
    for (const x of [img, ph]) if (x.getAttribute('style') === '') x.removeAttribute('style');
  };
  if (img.complete && img.naturalWidth) set(); else img.addEventListener('load', set, { once: true });
}
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
  hideDrawBox();
  openDrawing(null, async (data) => {
    if (!data || ED !== me) return;
    const n = noteOf(me.id);
    const { pid, vid, url } = await saveDrawingBlobs(data, n && n.locked);
    if (ED !== me) return;
    const ph = document.createElement('div');
    // A drawing that doesn't fill the width sits at the left, so you can write next to it.
    ph.className = (pngBox(data).w / DRAW_W) * 100 <= 70 ? 'ph dr fl' : 'ph dr';
    ph.contentEditable = 'false';
    ph.innerHTML = `<img data-blob="${pid}" data-vec="${vid}" src="${url}" alt="Drawing">`;
    sizeDrawing($('img', ph));
    if (range) ED.range = range;
    histNow();
    insertBlock(ph);
    ph.classList.add('arrive');
    setTimeout(() => ph.classList.remove('arrive'), 500);
    afterCmd();
    saveEditor();
  });
};
// Tap a drawing in a note: it's picked up with its bar (Edit · where it sits · delete) and a corner
// to resize it. Tap it again to draw on it.
async function editDrawing(img) {
  if (!ED || DR) return;
  hideDrawBox();
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
    if (!ph.dataset.w) sizeDrawing(img);
    afterCmd();
    saveEditor();
  });
}
let DBX = null; // the picked-up drawing or photo in the note: { ph, el, scr, ro }
function drawingTap(img) {
  const ph = img.closest('.ph');
  if (DBX && DBX.ph === ph) { editDrawing(img); return; }
  showDrawBox(ph);
}
// Tap a photo: it's picked up like a drawing (Crop · where it sits · delete, a corner to resize, and
// it can be dragged to another place). Tap it again to see it full screen.
function photoTap(img) {
  const ph = img.closest('.ph');
  if (DBX && DBX.ph === ph) { openViewer(img); return; }
  showDrawBox(ph);
}
const layoutOf = (ph) => (ph.classList.contains('fl') ? 'fl' : ph.classList.contains('fr') ? 'fr' : 'blk');
function showDrawBox(ph) {
  hideDrawBox();
  if (!ED || !ph || !ph.isConnected) return;
  const scr = ph.closest('.scroll');
  if (!scr) return;
  const dr = ph.classList.contains('dr');
  const el = document.createElement('div');
  el.className = 'dbx';
  el.innerHTML = `
    <div class="dbx-bar">
      ${dr ? `<button class="dbx-edit" data-dbx="edit">${glyph('draw')}<span>Edit</span></button>` : `<button class="dbx-edit" data-dbx="crop">${glyph('crop')}<span>Crop</span></button>`}
      <div class="seg dbx-lay">${segButtons('dbx-lay', [['fl', glyph('wrapL')], ['blk', glyph('wrapN')], ['fr', glyph('wrapR')]], layoutOf(ph))}</div>
      <button class="dbx-del" data-dbx="del" aria-label="${dr ? 'Delete drawing' : 'Delete photo'}">${glyph('trash')}</button>
    </div>
    <i class="dbx-grab" aria-hidden="true"></i>
    <i class="dbx-h" aria-hidden="true"></i>`;
  scr.appendChild(el);
  $$('.dbx-lay button', el).forEach((b, i) => b.setAttribute('aria-label', ['Text on the right', 'On its own line', 'Text on the left'][i]));
  // (tapping the bar doesn't take the cursor out of the note)
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dbx]');
    if (!b || !DBX) return;
    const p = DBX.ph;
    if (b.dataset.dbx === 'edit') editDrawing($('img', p));
    if (b.dataset.dbx === 'crop') openCrop($('img', p));
    if (b.dataset.dbx === 'del') deleteDrawing(p);
  });
  bindDrawResize(el);
  bindPhMove(el);
  const ro = new ResizeObserver(() => placeDrawBox());
  ro.observe(ED.ed);
  DBX = { ph, el, scr, ro };
  placeDrawBox();
  buzz(6);
}
function placeDrawBox() {
  if (!DBX) return;
  const { ph, el, scr } = DBX;
  if (!ph.isConnected) { hideDrawBox(); return; }
  // Where the drawing sits in the note (not where it is in the middle of gliding there).
  let x, y;
  if (ph.offsetParent === scr) { x = ph.offsetLeft; y = ph.offsetTop; } else {
    const r = ph.getBoundingClientRect(), sr = scr.getBoundingClientRect();
    x = r.left - sr.left + scr.scrollLeft;
    y = r.top - sr.top + scr.scrollTop;
  }
  const w = ph.offsetWidth, h = ph.offsetHeight;
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  el.classList.toggle('side-r', layoutOf(ph) === 'fr');
  // the bar above the drawing (below it when there's no room above), kept inside the note's width
  const bar = $('.dbx-bar', el), bw = bar.offsetWidth, sw = scr.clientWidth;
  const left = Math.max(8 - x, Math.min(sw - 8 - bw - x, (w - bw) / 2));
  bar.style.left = `${left}px`;
  el.classList.toggle('below', y - scr.scrollTop < 110);
}
function hideDrawBox() {
  if (!DBX) return;
  const { el, ro } = DBX;
  DBX = null;
  ro.disconnect();
  el.classList.add('out');
  setTimeout(() => el.remove(), 180);
}
// Move the drawing to the left/right of the text or onto its own line: it glides to its new place
// and the words around it fade into their new lines.
ACTIONS['dbx-lay'] = (btn) => {
  if (!DBX || !ED) return;
  const ph = DBX.ph, lay = btn.dataset.v;
  const seg = btn.closest('.seg');
  if (seg) seg.innerHTML = segButtons('dbx-lay', [['fl', glyph('wrapL')], ['blk', glyph('wrapN')], ['fr', glyph('wrapR')]], lay);
  if (layoutOf(ph) === lay) return;
  const r0 = ph.getBoundingClientRect();
  const near = nearBlocks(ph);
  ph.classList.remove('fl', 'fr');
  if (lay !== 'blk') {
    ph.classList.add(lay);
    // somewhere to write next to it
    const next = ph.nextElementSibling;
    if (!next || next.classList.contains('ph') || /^(TABLE|HR)$/.test(next.tagName)) { const line = document.createElement('div'); line.innerHTML = '<br>'; ph.after(line); }
  }
  sizeDrawing($('img', ph));
  const b0 = DBX.el.getBoundingClientRect();
  placeDrawBox();
  glideTo(ph, r0);
  glideTo(DBX.el, b0, false); // (the frame glides along with the drawing)
  near.forEach((b) => b.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' }));
  histNow();
  queueSave();
  buzz(8);
};
// The lines around a drawing (they move when it does).
function nearBlocks(ph) {
  const out = [];
  for (let n = ph.previousElementSibling, k = 0; n && k < 2; n = n.previousElementSibling, k++) out.push(n);
  for (let n = ph.nextElementSibling, k = 0; n && k < 8; n = n.nextElementSibling, k++) out.push(n);
  return out.filter((n) => !n.classList.contains('dbx'));
}
// Slide an element from where it was (r0) to where it is now (growing or shrinking from its old
// size, unless scale is false — then only its place changes, e.g. a frame with a bar on it).
function glideTo(el, r0, scale = true) {
  if (reduceMotion()) return;
  const r1 = el.getBoundingClientRect();
  if (!r1.width) return;
  const k = scale ? ` scale(${r0.width / r1.width})` : '';
  el.animate([
    { transformOrigin: '0 0', transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px)${k}` },
    { transformOrigin: '0 0', transform: 'none' },
  ], { duration: 380, easing: 'cubic-bezier(.2, .9, .3, 1)' });
}
function deleteDrawing(ph) {
  hideDrawBox();
  histNow();
  const what = ph.classList.contains('dr') ? 'Drawing' : 'Photo';
  const done = () => {
    const next = ph.nextElementSibling;
    ph.remove();
    if (next) next.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 260 });
    afterCmd();
    saveEditor();
    toast(`${what} deleted — Undo is at the top`);
  };
  if (reduceMotion()) { done(); return; }
  ph.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.92)' }], { duration: 200, easing: 'ease-in' }).onfinish = done;
  buzz(10);
}
// Pull the round corner to make the drawing in the note bigger or smaller.
function bindDrawResize(el) {
  const h = $('.dbx-h', el);
  let st = null;
  h.addEventListener('pointerdown', (e) => {
    if (!DBX) return;
    e.preventDefault();
    e.stopPropagation();
    h.setPointerCapture(e.pointerId);
    const ph = DBX.ph;
    st = { id: e.pointerId, x0: e.clientX, w0: ph.getBoundingClientRect().width, full: ED.ed.clientWidth, dir: layoutOf(ph) === 'fr' ? -1 : 1, ph };
    el.classList.add('sizing');
  });
  h.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const side = layoutOf(st.ph) !== 'blk';
    const w = st.w0 + (e.clientX - st.x0) * st.dir;
    st.pct = Math.max(15, Math.min(side ? DR_SIDE_MAX : 100, (w / st.full) * 100));
    st.ph.style.width = `${st.pct.toFixed(1)}%`;
    placeDrawBox();
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    el.classList.remove('sizing');
    if (s.pct == null) return;
    s.ph.dataset.w = String(Math.round(s.pct));
    histNow();
    queueSave();
    buzz(6);
  };
  h.addEventListener('pointerup', end);
  h.addEventListener('pointercancel', end);
}
// Anything else touched: the drawing is put down.
document.addEventListener('pointerdown', (e) => {
  if (!DBX) return;
  if (e.target.closest('.dbx') || (DBX.ph.contains(e.target))) return;
  hideDrawBox();
}, true);
