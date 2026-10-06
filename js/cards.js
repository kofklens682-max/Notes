'use strict';
/* Flashcards from your notes. Any note with word pairs — "reluctant — not willing", "thrive: to
   grow well", or a table with Word | Meaning | Example — can be practised from its ••• menu. Tap the
   card to turn it over, then Again / Hard / Knew it. Words you know come back later and later
   (1, 3, 7, 14, 30, 60 days); missed ones come back today. Words due show on Today. */

const CARD_DAYS = [0, 1, 3, 7, 14, 30, 60];
// Word pairs in a note's HTML: [{ k, w, m, x }] (k = the word in small letters, x = example).
const PAIR_RE = /^(.{1,60}?)(?:\s+[—–-]\s+|\s*:\s+|\s+=\s+|\t+)(.{1,400})$/;
function cardPairs(html) {
  if (!html) return [];
  const body = parseBody(html), out = [], seen = new Set();
  const add = (w, m, x) => {
    w = (w || '').replace(/\s+/g, ' ').trim(); m = (m || '').replace(/\s+/g, ' ').trim(); x = (x || '').replace(/\s+/g, ' ').trim();
    const k = w.toLowerCase();
    if (!w || !m || w.split(' ').length > 6 || /^[\d\s.,:%]+$/.test(w) || seen.has(k)) return;
    seen.add(k);
    out.push({ k, w, m, x });
  };
  // tables: first column the word, second the meaning, third an example (header rows skipped)
  $$('table', body).forEach((t) => {
    if (!t.classList.contains('eis')) {
      $$('tr', t).forEach((tr) => {
        const cells = $$(':scope > td', tr).filter((td) => !td.classList.contains('tk')).map((td) => td.textContent);
        if (cells.length >= 2) add(cells[0], cells[1], cells[2]);
      });
    }
    t.remove();
  });
  $$('.mq, .ph', body).forEach((x) => x.remove());
  $$('br', body).forEach((b) => b.replaceWith('\n'));
  $$('div, p, h1, h2, h3, li, blockquote', body).forEach((b) => b.append('\n'));
  const lines = body.textContent.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  lines.slice(1).forEach((line) => { // (the first line is the title)
    const m = line.match(PAIR_RE);
    if (!m) return;
    const [mean, ex] = m[2].split(/\s+[—–]\s+/); // "meaning — example"
    add(m[1], mean, ex);
  });
  return out;
}
// Bring a note's saved cards in line with its words: new words are due today, removed ones go.
function syncCards(n, pairs) {
  const old = S.cards[n.id] || {}, next = {};
  for (const p of pairs) {
    const c = old[p.k];
    next[p.k] = c ? { ...c, w: p.w, m: p.m, x: p.x } : { w: p.w, m: p.m, x: p.x, b: 0, due: todayIso() };
  }
  S.cards[n.id] = next;
}
let dueMemo = { rev: -1, day: '', n: 0 };
function dueCardCount() {
  const day = todayIso();
  if (dueMemo.rev === S.rev && dueMemo.day === day) return dueMemo.n;
  let n = 0;
  for (const [nid, set] of Object.entries(S.cards || {})) {
    const note = noteOf(nid);
    if (!note || note.locked) continue;
    for (const c of Object.values(set)) if (c.due <= day) n++;
  }
  dueMemo = { rev: S.rev, day, n };
  return n;
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- Practising ----------
let FS = null; // { q: [[noteId, key]], i, flip, known, again, title }
async function practiseNote(id) {
  const n = noteOf(id);
  if (!n || n.locked) return;
  wakeBodies();
  await bodiesReady;
  const pairs = cardPairs(n.html);
  if (!pairs.length) { toast('No word pairs in this note — write them like “word — meaning”'); return; }
  syncCards(n, pairs);
  save();
  startCards(shuffle(pairs.map((p) => [n.id, p.k])), noteTitle(n));
}
async function practiseDue() {
  wakeBodies();
  await bodiesReady;
  const day = todayIso(), q = [];
  for (const nid of Object.keys(S.cards)) {
    const n = noteOf(nid);
    if (!n || n.locked) continue;
    syncCards(n, cardPairs(n.html));
    for (const [k, c] of Object.entries(S.cards[nid])) if (c.due <= day) q.push([nid, k]);
  }
  save();
  if (!q.length) { toast('Nothing to review today'); render(); return; }
  startCards(shuffle(q), 'Words to Review');
}
ACTIONS['cards-due'] = () => practiseDue();
function startCards(q, title) {
  FS = { q, i: 0, flip: false, known: 0, again: 0, title, seen: new Set() };
  openSheet(`${sheetHead(esc(title), '', '<button class="strong" data-act="close-sheet">Done</button>')}<div class="sheet-body fc-body"><div class="fc-stage">${cardHtml()}</div></div>`, null, 'tall fc-sheet');
  sheet.onClose = () => { FS = null; if (cur().s === 'folders') setTimeout(render, 380); }; // Today's count moves on
}
const cardOf = ([nid, k]) => (S.cards[nid] || {})[k];
const ikey = ([nid, k]) => nid + '\n' + k; // (keys never hold a line break)
function cardHtml(cls = '') {
  if (FS.i >= FS.q.length) {
    const total = FS.seen.size;
    return `<div class="fc-end ${cls}">${glyph('checkCircle')}<b>All done!</b><p>${plural(total, 'word')} practised · knew ${FS.known} the first time</p><button class="td-btn" data-act="fc-again">Practise Again</button></div>`;
  }
  const c = cardOf(FS.q[FS.i]);
  if (!c) { FS.i++; return cardHtml(cls); }
  return `<div class="fc-count">${FS.i + 1} / ${FS.q.length}</div>
    <button class="fc ${FS.flip ? 'flip' : ''} ${cls}" data-act="fc-flip" aria-label="Turn the card over"><span class="fc-in">
      <span class="fc-face fc-f"><b>${esc(c.w)}</b><i>Tap to see the meaning</i></span>
      <span class="fc-face fc-b"><b>${esc(c.w)}</b><p>${esc(c.m)}</p>${c.x ? `<em>${esc(c.x)}</em>` : ''}</span>
    </span></button>
    <div class="fc-btns"><button class="fc-a fa-again" data-act="fc-ans" data-v="again">Again</button><button class="fc-a fa-hard" data-act="fc-ans" data-v="hard">Hard</button><button class="fc-a fa-knew" data-act="fc-ans" data-v="knew">Knew it</button></div>`;
}
const stage = () => sheet && $('.fc-stage', sheet.sh);
ACTIONS['fc-flip'] = (el) => { FS.flip = !FS.flip; el.classList.toggle('flip', FS.flip); buzz(8); };
ACTIONS['fc-ans'] = (el) => {
  const st = stage();
  if (!FS || !st || st.dataset.busy) return;
  const item = FS.q[FS.i], c = cardOf(item), v = el.dataset.v, day = todayIso();
  if (c) {
    const first = !FS.seen.has(ikey(item));
    FS.seen.add(ikey(item));
    if (v === 'again') { c.b = 0; c.due = day; FS.q.push(item); FS.again++; } // once more at the end
    else if (v === 'hard') { c.b = Math.max(1, c.b); c.due = isoAdd(day, 1); }
    else { c.b = Math.min(CARD_DAYS.length - 1, c.b + 1); c.due = isoAdd(day, CARD_DAYS[c.b]); if (first) FS.known++; }
    save();
  }
  buzz(10);
  // the card leaves (left for Again, right for Knew it, down for Hard) and the next one comes in
  const card = $('.fc', st);
  st.dataset.busy = '1';
  if (card) card.classList.add(v === 'again' ? 'out-l' : v === 'knew' ? 'out-r' : 'out-d');
  setTimeout(() => {
    FS.i++;
    FS.flip = false;
    st.innerHTML = cardHtml('in');
    delete st.dataset.busy;
  }, reduceMotion() ? 0 : 230);
};
ACTIONS['fc-again'] = () => {
  const st = stage();
  if (!FS || !st) return;
  const items = [...new Map(FS.q.map((x) => [ikey(x), x])).values()];
  FS = { ...FS, q: shuffle(items), i: 0, flip: false, known: 0, again: 0, seen: new Set() };
  st.innerHTML = cardHtml('in');
};
