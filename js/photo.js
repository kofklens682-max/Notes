'use strict';
/* Photos and drawings in a note, once picked up (tap one): drag it to another place in the note,
   and crop a photo. The frame around it, its bar (Crop/Edit · where it sits · delete) and the
   resize corner are in draw.js (showDrawBox). */

// ---------- Moving ----------
// Press on the picked-up picture and drag: it lifts off and follows the finger, a line shows where it
// will land (between two lines of the note), and the note scrolls by itself near the top or bottom.
// A quick tap instead opens it: a photo full screen, a drawing to draw on.
function bindPhMove(frame) {
  const grab = $('.dbx-grab', frame);
  let st = null;
  grab.addEventListener('pointerdown', (e) => {
    if (!DBX || e.button > 0 || st) return;
    e.preventDefault();
    try { grab.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    st = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false, ph: DBX.ph, frame };
  });
  grab.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    st.x = e.clientX;
    st.y = e.clientY;
    if (!st.on) {
      if (Math.hypot(st.x - st.x0, st.y - st.y0) < 8) return;
      if (!startMove(st)) { st = null; return; }
    }
    dragMove(st);
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    if (!s.on) { if (e.type === 'pointerup') tapPicked(s.ph); return; }
    dropMove(s, e.type === 'pointerup');
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
}
function tapPicked(ph) {
  const img = $('img', ph);
  if (!img) return;
  if (ph.classList.contains('dr') && img.dataset.vec) editDrawing(img);
  else openViewer(img);
}
function startMove(s) {
  if (!ED || !DBX || DBX.ph !== s.ph || !s.ph.isConnected) return false;
  const ph = s.ph, img = $('img', ph), r = img.getBoundingClientRect();
  s.on = true;
  s.scr = DBX.scr;
  s.r0 = r;
  // the picture lifts off: a copy follows the finger, the one in the note fades
  const g = document.createElement('div');
  g.className = 'ph-ghost' + (ph.classList.contains('dr') ? ' dr' : '');
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  g.innerHTML = `<img src="${img.src}" alt="">`;
  document.body.appendChild(g);
  s.ghost = g;
  s.fade = ph.animate([{ opacity: 1 }, { opacity: 0.22 }], { duration: 160, fill: 'forwards' });
  s.frame.classList.add('lifting');
  const line = document.createElement('div');
  line.className = 'ph-drop';
  line.hidden = true;
  s.scr.appendChild(line);
  s.line = line;
  s.tgt = undefined;
  buzz(12);
  // near the top or bottom of the screen the note scrolls along
  const tick = () => {
    if (!s.on) return;
    const sr = s.scr.getBoundingClientRect(), top = sr.top + 70, bot = sr.bottom - 110;
    const v = s.y < top + 50 ? -Math.min(18, (top + 50 - s.y) / 3) : s.y > bot - 50 ? Math.min(18, (s.y - bot + 50) / 3) : 0;
    if (v) { s.scr.scrollTop += v; dragMove(s); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
}
// Where the picture would land: before the first line whose middle is below the finger (or at the end).
function dragMove(s) {
  if (!ED) return;
  s.ghost.style.transform = `translate3d(${(s.x - s.x0).toFixed(1)}px, ${(s.y - s.y0).toFixed(1)}px, 0) scale(1.04)`;
  const blocks = [...ED.ed.children].filter((c) => c !== s.ph);
  let b = null;
  for (const c of blocks) {
    const r = c.getBoundingClientRect();
    if (s.y < r.top + r.height / 2) { b = c; break; }
  }
  const same = b === s.ph.nextElementSibling;
  if (s.tgt && s.tgt.b === b) return;
  s.tgt = { b };
  if (!same) buzz(5);
  const sr = s.scr.getBoundingClientRect(), er = ED.ed.getBoundingClientRect();
  const last = blocks[blocks.length - 1];
  const y = b ? b.getBoundingClientRect().top - 4 : last ? last.getBoundingClientRect().bottom + 4 : er.top;
  Object.assign(s.line.style, { left: `${er.left - sr.left}px`, width: `${er.width}px`, top: `${y - sr.top + s.scr.scrollTop - 1.5}px` });
  s.line.hidden = same;
}
function dropMove(s, ok) {
  s.on = false;
  const { ph, ghost, line, frame } = s;
  line.remove();
  const b = s.tgt ? s.tgt.b : undefined;
  const move = ok && ED && b !== undefined && b !== ph.nextElementSibling;
  const gr = ghost.getBoundingClientRect();
  const done = () => {
    ghost.remove();
    if (s.fade) s.fade.cancel();
    frame.classList.remove('lifting');
    placeDrawBox();
  };
  if (!move) {
    // back to where it was
    const r = $('img', ph).getBoundingClientRect();
    if (reduceMotion()) { done(); return; }
    ghost.style.transition = 'transform .26s cubic-bezier(.2, .9, .3, 1)';
    ghost.style.transform = `translate3d(${r.left - s.r0.left}px, ${r.top - s.r0.top}px, 0)`;
    setTimeout(done, 270);
    return;
  }
  histNow();
  if (b) b.before(ph); else ED.ed.appendChild(ph);
  // always a line under it to keep writing on
  const next = ph.nextElementSibling;
  if (!next || next.classList.contains('ph') || /^(TABLE|HR|UL|OL)$/.test(next.tagName)) { const d = document.createElement('div'); d.innerHTML = '<br>'; ph.after(d); }
  done();
  glideTo($('img', ph), gr); // from where the finger let go to its new place
  afterCmd();
  saveEditor();
  buzz(10);
}

// ---------- Cropping ----------
// Crop a photo: pull the corners or sides of the frame, drag the frame to move it, Turn rotates a
// quarter at a time. Done saves the cropped photo (the old one stays for Undo).
function openCrop(img) {
  if (!ED || !img || !img.src) return;
  const me = ED;
  const src = new Image();
  src.src = img.src;
  (src.decode ? src.decode() : Promise.resolve()).then(() => cropEditor(me, img, src), () => toast("Couldn't open this photo"));
}
function cropEditor(me, img, src) {
  if (ED !== me) return;
  hideDrawBox();
  const wrap = document.createElement('div');
  wrap.className = 'crop';
  wrap.innerHTML = `<div class="crop-top"><button data-c="cancel">Cancel</button><b>Crop</b><button data-c="done" class="strong">Done</button></div>
    <div class="crop-stage"><canvas class="crop-cv"></canvas><div class="crop-box"><i class="crop-grid"></i>${['t', 'r', 'b', 'l', 'tl', 'tr', 'br', 'bl'].map((h) => `<i class="crop-h ${h}" data-h="${h}"></i>`).join('')}</div></div>
    <div class="crop-bot"><button data-c="rot">${glyph('rotate')}<span>Turn</span></button><button data-c="reset">Reset</button></div>`;
  document.body.appendChild(wrap);
  const stage = $('.crop-stage', wrap), cv = $('.crop-cv', wrap), box = $('.crop-box', wrap);
  let rot = 0, work = null, R = null, view = null;
  // the photo turned by rot quarters, at full size
  const build = () => {
    const w = src.naturalWidth, h = src.naturalHeight, side = rot % 2;
    work = document.createElement('canvas');
    work.width = side ? h : w;
    work.height = side ? w : h;
    const x = work.getContext('2d');
    x.translate(work.width / 2, work.height / 2);
    x.rotate((rot * Math.PI) / 2);
    x.drawImage(src, -w / 2, -h / 2);
    R = { x: 0, y: 0, w: work.width, h: work.height };
  };
  // fit it on the screen and draw the frame
  const layout = () => {
    const pad = 22, sw = stage.clientWidth - pad * 2, sh = stage.clientHeight - pad * 2;
    const k = Math.min(sw / work.width, sh / work.height), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(work.width * k), h = Math.round(work.height * k);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.getContext('2d').drawImage(work, 0, 0, cv.width, cv.height);
    view = { k, x: (stage.clientWidth - w) / 2, y: (stage.clientHeight - h) / 2 };
    cv.style.left = `${view.x}px`;
    cv.style.top = `${view.y}px`;
    paintBox();
  };
  const paintBox = () => {
    Object.assign(box.style, { left: `${view.x + R.x * view.k}px`, top: `${view.y + R.y * view.k}px`, width: `${R.w * view.k}px`, height: `${R.h * view.k}px` });
  };
  build();
  requestAnimationFrame(() => { layout(); wrap.classList.add('show'); });
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  // Dragging a corner/side changes the frame, dragging inside it moves it. Never smaller than 40 dots on screen.
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-h]');
    if (!h && !e.target.closest('.crop-box')) return;
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    drag = { id: e.pointerId, h: h ? h.dataset.h : 'move', x0: e.clientX, y0: e.clientY, r: { ...R } };
    wrap.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x0) / view.k, dy = (e.clientY - drag.y0) / view.k, r0 = drag.r, W = work.width, H = work.height;
    const min = 40 / view.k;
    let { x, y, w, h } = r0;
    if (drag.h === 'move') {
      x = clamp(r0.x + dx, 0, W - r0.w);
      y = clamp(r0.y + dy, 0, H - r0.h);
    } else {
      if (drag.h.includes('l')) { x = clamp(r0.x + dx, 0, r0.x + r0.w - min); w = r0.x + r0.w - x; }
      if (drag.h.includes('r')) w = clamp(r0.w + dx, min, W - r0.x);
      if (drag.h.includes('t')) { y = clamp(r0.y + dy, 0, r0.y + r0.h - min); h = r0.y + r0.h - y; }
      if (drag.h.includes('b')) h = clamp(r0.h + dy, min, H - r0.y);
    }
    R = { x, y, w, h };
    paintBox();
  });
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    wrap.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    const i = layers.indexOf(close);
    if (i >= 0) layers.splice(i, 1);
    window.removeEventListener('resize', onResize);
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 260);
  };
  layers.push(close);
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const c = b.dataset.c;
    if (c === 'cancel') { close(); if (ED === me && img.isConnected) showDrawBox(img.closest('.ph')); return; }
    if (c === 'rot' || c === 'reset') {
      rot = c === 'rot' ? (rot + 1) % 4 : 0;
      build();
      layout();
      if (!reduceMotion()) cv.animate([{ transform: c === 'rot' ? 'rotate(-90deg) scale(.9)' : 'scale(.96)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2, .9, .3, 1)' });
      buzz(8);
      return;
    }
    if (c !== 'done') return;
    const full = !rot && R.x < 1 && R.y < 1 && R.w > work.width - 1 && R.h > work.height - 1;
    if (full) { close(); if (ED === me && img.isConnected) showDrawBox(img.closest('.ph')); return; }
    b.disabled = true;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(R.w));
    out.height = Math.max(1, Math.round(R.h));
    out.getContext('2d').drawImage(work, Math.round(R.x), Math.round(R.y), out.width, out.height, 0, 0, out.width, out.height);
    const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9));
    close();
    if (!blob || ED !== me || !img.isConnected) return;
    const n = noteOf(me.id), locked = !!(n && n.locked), id = uid();
    try { await putPhoto(id, blob, locked ? LOCK.key : null); } catch (err) { toast("Couldn't save the photo"); return; }
    if (ED !== me || !img.isConnected) return;
    const url = URL.createObjectURL(blob);
    photoUrls.set(id, { url, locked });
    histNow();
    const ph = img.closest('.ph');
    img.dataset.blob = id;
    img.src = url;
    const after = () => {
      sizeDrawing(img);
      if (!reduceMotion()) img.animate([{ opacity: 0.3, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2, .9, .3, 1)' });
      afterCmd();
      saveEditor();
      showDrawBox(ph);
      toast('Photo cropped — Undo is at the top');
    };
    if (img.decode) img.decode().then(after, after); else after();
  });
}
