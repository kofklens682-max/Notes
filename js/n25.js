'use strict';
/* 25 Nov 2026 (Notes 5.0): his new plan. Loaded after n20.js, before main.js. Wraps older code, never edits it.
   1. Two tabs only: Notes and Goals. Today, Search and every reminder are gone (old reminder data is kept, only hidden;
      the phone stops getting reminder alerts).
   2. Notes tab = one page: Recent (last 5 notes), then the folders (All notes, his folders, Locked, Recently deleted)
      and "New folder". Settings switch: notes inside a folder stay out of All notes.
   3. Goals tab: a Goals | Habits switch. Goals = white cards with one small ring; tap = sheet with the steps.
      New goal = one short sheet (name, steps one per line, deadline). Habits = rows with a tick circle and a streak;
      tap = sheet with the streak and a month calendar; new habit = short sheet (name, days).
   4. The + button always makes a new note.
   5. Selected words: our own menu above the words (Chrome's Translate/Cut bar is kept away), with handles to change
      the selection.
   6. The New table sheet puts the keyboard down. */

/* ---------- 1. Two tabs ---------- */
TAB_ORDER.splice(0, TAB_ORDER.length, 'notes', 'goals');
delete UI.stacks.today;
delete UI.stacks.search;
UI.tab = 'notes';
BACK_NAMES.nxfolders = 'Notes';
{
  const _go = goTab;
  goTab = function (t, keep) { return _go.call(this, UI.stacks[t] ? t : 'notes', keep); }; // (old links asked for Today)
}
// An old "New reminder" shortcut on the home screen opens a new note instead.
taskSheet = function () { ACTIONS['new-note'](); };
// The + button: always a new note, also when it is held.
fabMenu = function () { ACTIONS['new-note'](); };
// No reminders: the menus never offer them (lock-screen note, reminder, habit reminder).
{
  const _menu = menu;
  menu = function (anchor, items) { return _menu.call(this, anchor, items.filter((it) => it === '-' || !['notif', 'rem'].includes(it.id))); };
}
// Reminders off for good: no alerts while the app is open, and the reminder server loses this phone.
async function n25RemindersOff() {
  if (S.settings.n25RemOff) return;
  S.settings.n25RemOff = 1;
  S.settings.notify = false;
  S.notes.forEach((n) => { delete n.notif; });
  save();
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      (await reg.getNotifications()).forEach((x) => x.close());
      const sub = reg.pushManager && (await reg.pushManager.getSubscription());
      if (sub) await sub.unsubscribe();
    }
  } catch (e) { /* not important */ }
}
{
  const _ls = loadState;
  loadState = async function () { const r = await _ls.apply(this, arguments); setTimeout(() => n25RemindersOff(), 2500); return r; };
}

/* ---------- 2. Notes tab: Recent + folders ---------- */
const n25Hide = () => !!(S && S.settings.hideFolderNotes);
// The notes All notes shows (with the switch on: only the ones not in a folder).
const n25AllNotes = () => S.notes.filter((n) => !n25Hide() || !folderOf(n.folder) || n.folder === 'notes');
{
  const _grid = notesGridHtml;
  notesGridHtml = function (fid, limit) {
    if (fid !== 'all' || !n25Hide()) return _grid.apply(this, arguments);
    const list = sortNotes(n25AllNotes());
    if (!list.length) return empty('note', 'No notes', 'Notes inside folders stay in their folder. Tap + to write one.');
    return cardsHtml(list, limit || NOTES_PAGE, 'all') + `<div class="count">${plural(list.length, 'note')} · notes in folders stay in their folder</div>`;
  };
}
// 25 Nov (his feedback): one plain list of notes, no Today / Previous 7 days / Previous 30 days headings.
{
  const _cards = cardsHtml;
  cardsHtml = function (list, limit, fid) { return _cards.call(this, list, limit, fid, true); };
}
// The built-in Notes folder is not shown any more, so a note that is in no folder of his has no folder label.
{
  const _nc = noteCard;
  noteCard = function (n, showFolder) { return _nc.call(this, n, showFolder && n.folder !== 'notes' && !!folderOf(n.folder)); };
}
function n25RecentRow(n) {
  const text = n.locked ? `${glyph('lock', 'inl')}Locked` : esc(n.preview || 'No more text');
  return `<button class="n25-nr" data-act="open-note" data-id="${n.id}" data-hold="note">
    ${n.emoji ? `<span class="n25-emo">${esc(n.emoji)}</span>` : ''}
    <span class="n25-nt"><b>${esc(noteTitle(n))}</b><small><span class="n25-when">${noteWhen(n.edited)}</span>${text}</small></span></button>`;
}
SCREENS.nxfolders.render = function () {
  const locked = S.notes.filter((n) => n.locked).length, trash = (S.trash || []).length;
  const recent = n25AllNotes().slice().sort((a, b) => b.edited - a.edited).slice(0, 5);
  let body = backupNudge();
  body += tsec('Recent', '', recent.length ? `<button class="sec-btn" data-act="nx-folder" data-id="all">See all</button>` : '');
  body += recent.length
    ? `<div class="card n25-recent">${recent.map(n25RecentRow).join('')}</div>`
    : `<div class="card n25-empty">${glyph('compose')}<b>No notes yet</b><span>Tap + to write your first note.</span></div>`;
  // Folders: only the ones he made (All notes = "See all" above; the built-in Notes folder is not shown).
  body += tsec('Folders');
  body += `<div class="card">${fTree(null, 0)}
    <button class="row n25-newf" data-act="new-folder">${tile('folderPlus', '#FFCC00', 'round')}<span class="lbl">New folder</span></button></div>`;
  body += `<div class="card nx-gap">${folderRow('__locked', 'Locked', locked, 'lock', '#8E8E93')}<button class="row" data-act="nx-trash">${tile('trash', '#8E8E93', 'round')}<span class="lbl">Recently deleted</span><span class="val">${trash}</span>${glyph('chevR', 'chev')}</button></div>`;
  body += '<p class="foot">Swipe a folder left to rename or delete it. Hold it for more.</p>';
  return page({ title: 'Notes', big: 'Notes', right: navBtn('settings', 'gear', 'Settings'), body });
};
{
  const _sig = SCREENS.nxfolders.sig;
  SCREENS.nxfolders.sig = () => _sig() + '|' + S.notes.map((n) => n.id + n.edited + (n.emoji || '') + (n.pinned ? 'p' : '')).join() + '|' + n25Hide();
  SCREENS.nxfolders.mount = (el) => fillPhotos(el);
}
// The folder's name in its list says "All notes" (sentence case, like everything else).
{
  const _fr = SCREENS.folders.render;
  SCREENS.folders.render = function () { return _fr.apply(this, arguments).replace(/All Notes/g, 'All notes'); };
}
// Settings: the switch, Reminders gone, the new version.
const N25_VERSION = 'Notes 5.0';
{
  const _sr = SCREENS.settings.render;
  SCREENS.settings.render = function () {
    let h = _sr.apply(this, arguments);
    h = h.replace(/<h2 class="sec">Reminders<\/h2>[\s\S]*?<h2 class="sec">Appearance<\/h2>/, '<h2 class="sec">Appearance</h2>');
    h = h.replace('<h2 class="sec">Notes</h2>', `<h2 class="sec">Notes</h2>
      <div class="card"><label class="row">${tile('folder', '#FFCC00')}<span class="lbl n25-wrap">Keep folder notes in their folder<small>On: notes you write inside a folder don't show in All notes or Recent</small></span>${toggle('n25hide', n25Hide(), 'Keep folder notes in their folder')}</label></div>
      <h2 class="sec">Sort notes by</h2>`);
    h = h.replace(/Notes 4\.\d/g, N25_VERSION);
    return h;
  };
  // (the reminder rows are gone, so their inputs are not looked for)
  SCREENS.settings.mount = function (el) {
    aiLeftCheck(el);
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((x) => { const u = $('#st-used', el); if (u) u.textContent = `${((x.usage || 0) / 1048576).toFixed(1)} MB`; }).catch(() => {});
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((p) => { const k = $('#st-keep', el); if (k) k.textContent = p ? 'Yes' : 'Not yet'; }).catch(() => {});
  };
  document.addEventListener('change', (e) => {
    if (e.target.name !== 'n25hide') return;
    S.settings.hideFolderNotes = e.target.checked;
    save();
    buzz(8);
    toast(e.target.checked ? 'Folder notes stay in their folder' : 'All notes shows every note again');
  });
}
// The Back button from Settings / a folder says "Notes" or "Goals".
{
  const _bl = backLabel;
  backLabel = function (fb) { const r = _bl.apply(this, arguments); return r === 'Folders' ? 'Notes' : r === 'All Notes' ? 'All notes' : r; };
}

/* ---------- 3. Goals tab: Goals | Habits ---------- */
const G25 = { seg: 'goals' };
try { if (localStorage.getItem('notes-gseg') === 'habits') G25.seg = 'habits'; } catch (e) { /* none */ }
// One small ring per goal (the ring knows its own size, so it fills right wherever it is drawn).
function n25Ring(g, size, w) {
  const r = (size - w) / 2, C = 2 * Math.PI * r, f = goalPct(g) / 100;
  return `<svg class="n25-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="n25-rbg" stroke-width="${w}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="n25-rfg" stroke="${g.c}" stroke-width="${w}" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${(C * (1 - Math.max(f, f > 0 ? 0.02 : 0))).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
const n25FillRings = (root) => setTimeout(() => $$('.n25-rfg[data-off]', root).forEach((c) => { c.style.strokeDashoffset = c.dataset.off; }), 40);
function n25GoalCard(g) {
  const done = goalDone(g), n = g.steps.length, pct = goalPct(g);
  const sub = [n ? `${done} of ${n} steps` : 'No steps yet', g.due ? goalLeft(g) : ''].filter(Boolean).join(' · ');
  return `<button class="n25-gc${pct === 100 && n ? ' all' : ''}" data-act="goal-open" data-id="${g.id}" style="--c:${g.c}">
    <span class="n25-gr">${n25Ring(g, 46, 6)}<i>${pct === 100 && n ? glyph('check') : pct + '%'}</i></span>
    <span class="n25-gt"><b>${esc(g.name)}</b><small${g.due && goalDays(g) < 0 && pct < 100 ? ' class="late"' : ''}>${esc(sub)}</small></span>${glyph('chevR', 'chev')}</button>`;
}
function n25GoalsBody() {
  const gs = S.goals || [];
  if (!gs.length) return `<div class="card n25-empty">${glyph('target')}<b>No goals yet</b><span>A goal is a few steps. Tick them off and its ring fills.</span><button class="nx-pill" data-act="n25-newgoal">New goal</button></div>`;
  const open = gs.filter((g) => !(g.steps.length && goalPct(g) === 100)), done = gs.filter((g) => g.steps.length && goalPct(g) === 100);
  // 25 Nov (his feedback): all goals in one rounded box, one row each.
  let h = open.length ? `<div class="card n25-glist">${open.map(n25GoalCard).join('')}</div>` : '';
  if (done.length) h += `<h2 class="sec">Completed</h2><div class="card n25-glist">${done.map(n25GoalCard).join('')}</div>`;
  return h;
}
// A habit row: tick circle, name, streak.
function n25HabitRow(h, day) {
  const cnt = habitCount(h, day), tg = h.target, done = cnt >= tg, st = streaks(h), sleep = h.kind === 'sleep';
  const t = sleep ? h.times[day] : null;
  const meta = sleep ? (t ? `${t.bed} → ${t.wake}` : 'Tap the circle to log the night') : tg > 1 ? `${cnt} of ${tg} today` : scheduleText(h);
  const circ = `<button class="n25-tk${done ? ' on' : ''}" data-act="h-tick" data-id="${h.id}" data-day="${day}" style="--c:${h.c}" aria-label="${done ? 'Done, tap to undo' : 'Mark as done'}">${tg > 1 && !done ? ring(cnt / tg, 30, 2.6) + `<small>${cnt}</small>` : done ? glyph('check') : sleep ? glyph('moon') : ''}</button>`;
  const inner = `<div class="n25-hr${done ? ' is-done' : ''}" style="--c:${h.c}">${circ}<button class="n25-hm" data-act="n25-habit" data-id="${h.id}"><span class="n25-ht"><b>${esc(h.name)}</b><small>${esc(meta)}</small></span>${st.cur ? `<span class="n25-fl">${glyph('flame')}${st.cur}</span>` : ''}${glyph('chevR', 'chev')}</button></div>`;
  return swipeRow(inner, { right: swBtn('h-edit', h.id, 'Edit', 'pencil', 'var(--gray)') + swBtn('h-del', h.id, 'Delete', 'trash', 'var(--red)') });
}
function n25HabitsBody() {
  const today = todayIso();
  if (!S.habits.length) return `<div class="card n25-empty">${glyph('flame')}<b>No habits yet</b><span>Water, reading, sleep: small things you do every day.</span><button class="nx-pill" data-act="h-new">New habit</button></div>`;
  const on = S.habits.filter((h) => habitOn(h, today)), off = S.habits.filter((h) => !habitOn(h, today));
  let h = '';
  if (on.length) h += `<h2 class="sec">Today<span class="n">${on.filter((x) => habitDone(x, today)).length} of ${on.length}</span></h2><div class="card n25-hcard">${on.map((x) => n25HabitRow(x, today)).join('')}</div>`;
  if (off.length) h += `<h2 class="sec">Not today</h2><div class="card n25-hcard dim">${off.map((x) => n25HabitRow(x, today)).join('')}</div>`;
  return h;
}
SCREENS.goals = {
  render() {
    const g = G25.seg === 'goals';
    const body = `<div class="card pad n25-seg no-swipe"><div class="seg">${segButtons('n25-gseg', [['goals', 'Goals'], ['habits', 'Habits']], G25.seg)}</div></div>
      <div class="n25-gbody">${g ? n25GoalsBody() : n25HabitsBody()}</div>`;
    return page({ title: 'Goals', right: `<button class="ntext" data-act="${g ? 'n25-newgoal' : 'h-new'}">${g ? 'New goal' : 'New habit'}</button>`, body });
  },
  mount(el) { n25FillRings(el); },
  sig: () => JSON.stringify(S.goals) + '|' + S.rev + '|' + G25.seg + '|' + todayIso(),
  fab: () => ({ g: 'plus', act: 'new-note', label: 'New note' }),
};
BACK_NAMES.goals = 'Goals';
ACTIONS['n25-gseg'] = (el) => {
  if (G25.seg === el.dataset.v) return;
  G25.seg = el.dataset.v;
  try { localStorage.setItem('notes-gseg', G25.seg); } catch (e) { /* none */ }
  buzz(6);
  const scr = curEl(), box = scr && $('.n25-gbody', scr);
  render();
  const nb = curEl() && $('.n25-gbody', curEl());
  if (box && nb) { nb.classList.remove('n25-in-l', 'n25-in-r'); void nb.offsetWidth; nb.classList.add(G25.seg === 'habits' ? 'n25-in-r' : 'n25-in-l'); }
};
// The goal sheet: one ring (only this goal), steps, deadline, color. No "Show on Today" any more.
goalBody = function (g) {
  return `<div class="n25-gdet">${n25Ring(g, 132, 16)}<div class="n25-gmid"><b style="color:${g.c}">${goalPct(g)}%</b><span>${goalDone(g)} of ${g.steps.length}</span></div></div>
    ${g.due ? `<div class="n25-gdue${goalDays(g) < 0 && goalPct(g) < 100 ? ' late' : ''}">${glyph('calendar', 'inl')}${esc(dayName(g.due, true))} · ${goalLeft(g)}</div>` : ''}
    ${g.steps.length ? `<div class="card tasks nx-steps">${g.steps.map((s) => stepRow(g, s)).join('')}</div>` : ''}
    <div class="card tasks"><div class="task add-row" style="--c:${g.c}"><span class="chk plus">${glyph('plus')}</span><input class="add-input nx-stepin" placeholder="Add a step" enterkeyhint="done" autocapitalize="sentences" autocomplete="off"></div></div>
    ${g.steps.length ? '<p class="foot nx-shint">Tap a step to change it · swipe left to delete it</p>' : ''}`;
};
goalSheetHtml = function () {
  const g = goalOf(GOALID); if (!g) return '';
  return `${sheetHead('', '', '<button class="strong" data-act="close-sheet">Done</button>')}
  <div class="sheet-body nx-gsheet" style="--tint:${g.c}">
    <input class="nx-gname" value="${esc(g.name)}" maxlength="120" placeholder="Goal name" autocomplete="off" enterkeyhint="done" autocapitalize="sentences" aria-label="Goal name">
    ${goalBody(g)}
    <div class="card form">
      <div class="frow">${tile('calendar', '#FF3B30')}<span class="lbl">Deadline</span>${toggle('gDue', !!g.due, 'Deadline')}</div>
      ${g.due ? `<div class="frow sub"><input type="date" name="gDate" value="${g.due}" min="${todayIso()}"></div>` : ''}
    </div>
    <h2 class="sec">Color</h2>
    <div class="card pad">${swatches('nx-gcol', g.c)}</div>
    <button class="danger-btn" data-act="nx-gdel">Delete goal</button>
  </div>`;
};
// Ticking a step: the ring and the numbers move, nothing is redrawn.
nxFill = function (root) { $$('.n25-rfg', root).forEach((c) => { const g = goalOf(GOALID); if (!g) return; const C = +c.getAttribute('stroke-dasharray'), f = goalPct(g) / 100; c.style.strokeDashoffset = C * (1 - Math.max(f, f > 0 ? 0.02 : 0)); }); };
{
  const _step = ACTIONS['nx-step'];
  ACTIONS['nx-step'] = function (el) {
    _step.apply(this, arguments);
    const g = goalOf(el.dataset.g), root = gsRoot();
    if (!g || !root) return;
    const mid = $('.n25-gmid', root);
    if (mid) mid.innerHTML = `<b style="color:${g.c}">${goalPct(g)}%</b><span>${goalDone(g)} of ${g.steps.length}</span>`;
  };
}
// Draw the goal sheet with its ring filled.
{
  const _mg = mountGoalSheet;
  mountGoalSheet = function (sh) { _mg.apply(this, arguments); n25FillRings(sh); };
}
// New goal: one short sheet.
const NG = { name: '', steps: '', due: null, c: null };
function n25NewGoalHtml() {
  const ok = NG.name.trim();
  return `${sheetHead('New goal', '<button data-act="close-sheet">Cancel</button>', `<button class="strong" data-act="n25-gadd" ${ok ? '' : 'disabled'}>Add</button>`)}
    <div class="sheet-body" style="--tint:${NG.c}">
      <div class="card form"><input class="n25-gn" value="${esc(NG.name)}" placeholder="Goal, e.g. Prepare for the exam" maxlength="120" autocapitalize="sentences" enterkeyhint="next" autocomplete="off"></div>
      <h2 class="sec">Steps</h2>
      <div class="card form"><textarea class="n25-gs" placeholder="One step per line&#10;Read unit 1&#10;Do the practice test" rows="5" autocapitalize="sentences">${esc(NG.steps)}</textarea></div>
      <p class="foot">Press Enter for the next step. You can add more later.</p>
      <div class="card form">
        <div class="frow">${tile('calendar', '#FF3B30')}<span class="lbl">Deadline</span>${toggle('ngDue', !!NG.due, 'Deadline')}</div>
        ${NG.due ? `<div class="frow sub"><input type="date" name="ngDate" value="${NG.due}" min="${todayIso()}"></div>` : ''}
      </div>
      <h2 class="sec">Color</h2>
      <div class="card pad">${swatches('n25-gc', NG.c)}</div>
    </div>`;
}
function n25MountNewGoal(sh) {
  const n = $('.n25-gn', sh), s = $('.n25-gs', sh), add = $('[data-act="n25-gadd"]', sh);
  n.addEventListener('input', () => { NG.name = n.value; add.disabled = !NG.name.trim(); });
  n.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); s.focus(); } });
  s.addEventListener('input', () => { NG.steps = s.value; });
  sheetOn(sh, 'change', (e) => {
    if (e.target.name === 'ngDue') { NG.due = e.target.checked ? NG.due || isoAdd(todayIso(), 14) : null; refreshSheet(n25NewGoalHtml(), n25MountNewGoal); }
    if (e.target.name === 'ngDate' && e.target.value) NG.due = e.target.value;
  });
}
ACTIONS['n25-newgoal'] = () => {
  Object.assign(NG, { name: '', steps: '', due: null, c: GOAL_COLORS[(S.goals || []).length % GOAL_COLORS.length] });
  openSheet(n25NewGoalHtml(), n25MountNewGoal, 'tall');
  setTimeout(() => { const i = sheet && $('.n25-gn', sheet.sh); if (i) i.focus(); }, 420);
};
ACTIONS['nx-newgoal'] = ACTIONS['n25-newgoal'];
ACTIONS['n25-gc'] = (el) => { NG.c = el.dataset.v; buzz(6); refreshSheet(n25NewGoalHtml(), n25MountNewGoal); };
ACTIONS['n25-gadd'] = () => {
  const name = NG.name.trim();
  if (!name) return;
  const steps = NG.steps.split('\n').map((x) => x.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 200).map((t) => ({ id: uid(), title: t, done: false }));
  (S.goals = S.goals || []).push({ id: uid(), name, c: NG.c, due: NG.due, pinned: false, created: Date.now(), steps });
  save();
  closeSheet();
  buzz(12);
  if (UI.tab !== 'goals') goTab('goals', true);
  setTimeout(render, 320);
  toast('Goal added');
};

// A habit opens as a sheet: streaks, the month, change a day.
let HID = null, HMON = null;
function n25Month(h) {
  const today = todayIso(), first = HMON + '-01', lead = dowMon(first), d0 = parseD(first);
  const days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<i></i>';
  for (let k = 1; k <= days; k++) {
    const d = `${HMON}-${pad2(k)}`, fut = d > today, on = habitOn(h, d), f = Math.min(1, habitCount(h, d) / h.target);
    const cls = [fut ? 'fut' : '', f >= 1 ? 'done' : f > 0 ? 'part' : '', !on ? 'off' : '', d === today ? 'now' : ''].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-act="n25-hday" data-v="${d}" ${fut ? 'disabled' : ''} aria-label="${dayName(d, true)}">${k}</button>`;
  }
  const canNext = HMON < today.slice(0, 7);
  return `<div class="n25-cal" style="--c:${h.c}">
    <div class="n25-calh"><button data-act="n25-hmon" data-v="-1" aria-label="Previous month">${glyph('chevL')}</button><b>${MONTHS[d0.getMonth()]} ${d0.getFullYear()}</b><button data-act="n25-hmon" data-v="1" ${canNext ? '' : 'disabled'} aria-label="Next month">${glyph('chevR')}</button></div>
    <div class="n25-calw">${WK1.map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="n25-calg">${cells}</div></div>`;
}
function n25HabitSheetHtml() {
  const h = habitOf(HID); if (!h) return '';
  const today = todayIso(), st = streaks(h), cnt = habitCount(h, today), on = habitOn(h, today), done = cnt >= h.target;
  const total = Object.keys(h.log).filter((d) => habitDone(h, d)).length;
  return `${sheetHead(esc(h.name), `<button data-act="n25-hedit">Edit</button>`, '<button class="strong" data-act="close-sheet">Done</button>')}
    <div class="sheet-body" style="--tint:${h.c}">
      ${on ? `<div class="card n25-htoday"><button class="n25-tk big${done ? ' on' : ''}" data-act="h-tick" data-id="${h.id}" data-day="${today}" style="--c:${h.c}">${h.target > 1 && !done ? ring(cnt / h.target, 52, 4) + `<small>${cnt}</small>` : done ? glyph('check') : h.kind === 'sleep' ? glyph('moon') : ''}</button>
        <span><b>${done ? 'Done for today' : h.target > 1 ? `${cnt} of ${h.target} today` : 'Not done yet today'}</b><small>${done ? 'Tap the circle to undo' : 'Tap the circle when you do it'}</small></span></div>`
        : `<div class="card n25-htoday"><span><b>Not planned for today</b><small>${esc(scheduleText(h))}</small></span></div>`}
      <div class="n25-stats">
        <div><b style="color:${h.c}">${glyph('flame')}${st.cur}</b><span>Current streak</span></div>
        <div><b>${st.best}</b><span>Best streak</span></div>
        <div><b>${rate(h)}%</b><span>Last 30 days</span></div>
        <div><b>${total}</b><span>Days done</span></div>
      </div>
      <h2 class="sec">History<span class="sec-note">Tap a day to change it</span></h2>
      <div class="card pad">${n25Month(h)}</div>
      <div class="card"><div class="row static">${glyph('repeat', 'row-g')}<span class="lbl">Repeat</span><span class="val">${esc(scheduleText(h))}</span></div>
        ${h.target > 1 ? `<div class="row static">${glyph('target', 'row-g')}<span class="lbl">Times a day</span><span class="val">${h.target}</span></div>` : ''}
        <div class="row static">${glyph('calendar', 'row-g')}<span class="lbl">Started</span><span class="val">${esc(dayName(h.start, true))}</span></div></div>
      <button class="danger-btn" data-act="n25-hdel">Delete habit</button>
    </div>`;
}
function n25OpenHabit(id) {
  HID = id;
  HMON = todayIso().slice(0, 7);
  openSheet(n25HabitSheetHtml(), null, 'tall');
  if (sheet) sheet.onClose = () => { HID = null; if (cur().s === 'goals') render(); };
}
const n25RedrawHabit = () => { if (sheet && HID && habitOf(HID)) refreshSheet(n25HabitSheetHtml()); };
ACTIONS['n25-habit'] = (el) => n25OpenHabit(el.dataset.id);
ACTIONS['h-open'] = ACTIONS['n25-habit'];
ACTIONS['n25-hmon'] = (el) => {
  const d = parseD(HMON + '-01');
  d.setMonth(d.getMonth() + +el.dataset.v);
  HMON = iso(d).slice(0, 7);
  n25RedrawHabit();
};
ACTIONS['n25-hday'] = (el) => {
  const h = habitOf(HID), d = el.dataset.v;
  if (!h) return;
  const before = h.log[d];
  if (habitDone(h, d)) delete h.log[d]; else h.log[d] = h.target;
  if (d < h.start) h.start = d;
  buzz(8);
  save();
  n25RedrawHabit();
  if (before && !h.log[d]) undoToast(`${dayName(d, true)}: not done`, () => { h.log[d] = before; setTimeout(n25RedrawHabit, 0); });
};
ACTIONS['n25-hedit'] = () => { const h = habitOf(HID); if (h) habitSheet(h); };
ACTIONS['n25-hdel'] = async () => {
  const id = HID;
  closeSheet();
  if (await deleteHabit(id)) render();
};
// Ticking a habit: inside its sheet the sheet updates, on the list the list does.
{
  const _tick = ACTIONS['h-tick'];
  ACTIONS['h-tick'] = function (el) {
    const r = _tick.apply(this, arguments);
    if (sheet && HID) setTimeout(n25RedrawHabit, 0);
    return r;
  };
}
// New / edit habit: a short sheet (name, days, color; times a day only when wanted). No reminder.
habitSheetHtml = function () {
  const d = HS.days.join('');
  const preset = (v, l) => `<button class="chip ${d === v ? 'on' : ''}" data-act="hs-days" data-v="${v}">${l}</button>`;
  return `${sheetHead(HS.isNew ? 'New habit' : 'Edit habit', '<button data-act="close-sheet">Cancel</button>', `<button class="strong" data-act="hs-save" ${HS.name.trim() && HS.days.some(Boolean) ? '' : 'disabled'}>${HS.isNew ? 'Add' : 'Done'}</button>`)}
    <div class="sheet-body" style="--tint:${HS.c}">
      <div class="card list-hero"><span class="hero-ic sq" style="--c:${HS.c}">${glyph(HS.g)}</span><input class="hero-name" value="${esc(HS.name)}" placeholder="Habit, e.g. Read 20 minutes" maxlength="50" autocapitalize="sentences" enterkeyhint="done" style="color:${HS.c}"></div>
      <h2 class="sec">Which days</h2>
      <div class="card pad">
        <div class="days">${WK3.map((w, i) => `<button class="${HS.days[i] ? 'on' : ''}" data-act="hs-day" data-v="${i}" aria-pressed="${!!HS.days[i]}" aria-label="${w}">${WK1[i]}</button>`).join('')}</div>
        <div class="chips">${preset('1111111', 'Every day')}${preset('1111100', 'Weekdays')}${preset('0000011', 'Weekends')}</div>
      </div>
      ${HS.kind === 'sleep' ? '' : `<div class="card form"><div class="frow">${tile('target', '#FF9500')}<span class="lbl">Times a day</span>
        <div class="stepper"><button data-act="hs-target" data-v="-1" ${HS.target <= 1 ? 'disabled' : ''} aria-label="Fewer">${glyph('minus')}</button><b>${HS.target}</b><button data-act="hs-target" data-v="1" ${HS.target >= 50 ? 'disabled' : ''} aria-label="More">${glyph('plus')}</button></div></div></div>`}
      <h2 class="sec">Color</h2>
      <div class="card pad">${swatches('hs-color', HS.c)}</div>
      ${HS.isNew ? '' : '<button class="danger-btn" data-act="hs-del">Delete habit</button>'}
    </div>`;
};
{
  const _hs = habitSheet;
  habitSheet = function (h, preset) { _hs.call(this, h, preset); if (HS && HS.isNew) HS.remind = null; };
  const _save = ACTIONS['hs-save'];
  ACTIONS['hs-save'] = function () {
    const id = HS && HS.id;
    _save.apply(this, arguments);
    if (HID && HID === id) setTimeout(() => n25OpenHabit(id), 420); // (back to the habit after Edit)
  };
}

/* ---------- 5. Our menu above the selected words ---------- */
// Chrome's own bar (Translate, Cut, ⋮) comes with a selection made by a finger. So: a long press selects the word
// ourselves (Chrome's long press is cancelled), any other finger selection is taken over the same way, and two
// handles let you make the selection bigger or smaller.
const N25S = { touch: false, down: false, owned: null, drag: null, raf: 0 };
const slSame = (r, o) => o && r.startContainer === o.sc && r.startOffset === o.so && r.endContainer === o.ec && r.endOffset === o.eo;
const slMark = (r) => { N25S.owned = { sc: r.startContainer, so: r.startOffset, ec: r.endContainer, eo: r.endOffset }; };
function slSet(r) {
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  slMark(r);
  if (ED) ED.range = r.cloneRange();
}
// The word under the finger.
const WORDCH = /[\p{L}\p{N}_'’-]/u;
function slWordAt(x, y) {
  const c = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
  if (!c || !ED || !ED.ed.contains(c.startContainer)) return null;
  let n = c.startContainer, o = c.startOffset;
  if (n.nodeType !== 3) { const k = n.childNodes[o] || n.childNodes[o - 1]; if (k && k.nodeType === 3) { n = k; o = k === n.childNodes[o] ? 0 : k.data.length; } else return null; }
  const t = n.data;
  let a = o, b = o;
  if (!WORDCH.test(t[a] || '') && WORDCH.test(t[a - 1] || '')) a = b = o - 1;
  if (!WORDCH.test(t[a] || '')) return null;
  while (a > 0 && WORDCH.test(t[a - 1])) a--;
  while (b < t.length && WORDCH.test(t[b])) b++;
  const r = document.createRange();
  r.setStart(n, a);
  r.setEnd(n, b);
  return r;
}
document.addEventListener('touchstart', (e) => { N25S.touch = true; if (ED && ED.ed.contains(e.target)) N25S.down = true; }, { passive: true, capture: true });
document.addEventListener('touchend', () => { if (N25S.down) { N25S.down = false; setTimeout(slTakeOver, 30); } }, { passive: true, capture: true });
document.addEventListener('touchcancel', () => { N25S.down = false; }, { passive: true, capture: true });
document.addEventListener('mousedown', (e) => { if (!e.sourceCapabilities || !e.sourceCapabilities.firesTouchEvents) N25S.touch = false; }, true);
// Long press on a word: we select it (Chrome's selection and its bar never start).
document.addEventListener('contextmenu', (e) => {
  if (!ED || !ED.ed.contains(e.target) || !N25S.touch) return;
  if (e.target.closest('img, .ph, table.eis th')) return;
  e.preventDefault();
  const r = slWordAt(e.clientX, e.clientY);
  if (!r) return;
  if (document.activeElement !== ED.ed) ED.ed.focus({ preventScroll: true });
  slSet(r);
  buzz(10);
  n20SelSync();
}, true);
// Any other selection a finger made: take it over, so Chrome's bar goes away and ours stays.
function slTakeOver() {
  if (!ED || N25S.drag || N25S.down || !N25S.touch || sheet || document.activeElement !== ED.ed) return; // (a sheet is open: selecting again would bring the keyboard back)
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  if (!ED.ed.contains(r.startContainer) || !ED.ed.contains(r.endContainer) || slSame(r, N25S.owned)) return;
  slSet(r.cloneRange());
  n20SelSync();
}
document.addEventListener('selectionchange', () => {
  if (!ED) return;
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) { N25S.owned = null; slPlace(); return; }
  if (!N25S.down && !N25S.drag) setTimeout(slTakeOver, 60);
  slPlace();
});
// The handles.
function slHandles() {
  if (!ED) return null;
  let hs = $('.n25-hs', ED.el);
  if (!hs) {
    ED.el.insertAdjacentHTML('beforeend', '<div class="n25-hs" aria-hidden="true"><i class="n25-h s" data-h="s"><b></b></i><i class="n25-h e" data-h="e"><b></b></i></div>');
    hs = $('.n25-hs', ED.el);
    $$('.n25-h', hs).forEach((h) => h.addEventListener('pointerdown', slDragStart));
  }
  return hs;
}
// Where the words are, on the editor screen.
function slRects(r) {
  const list = [...r.getClientRects()].filter((x) => x.width > 0.5 || x.height > 0.5);
  if (!list.length) { const b = r.getBoundingClientRect(); return b.height ? [b] : []; }
  return list;
}
function slPlace() {
  cancelAnimationFrame(N25S.raf);
  N25S.raf = requestAnimationFrame(() => {
    if (!ED) return;
    const bar = $('.n20-sel', ED.el), hs = slHandles(), sel = getSelection();
    const ok = sel.rangeCount && !sel.isCollapsed && ED.ed.contains(sel.anchorNode) && ED.ed.contains(sel.focusNode);
    const rs = ok ? slRects(sel.getRangeAt(0)) : [];
    const host = ED.el.getBoundingClientRect(), nav = $('.nav', ED.el), edbar = $('.ed-bar', ED.el);
    const top = nav ? nav.getBoundingClientRect().bottom - host.top : 0;
    const bottom = (edbar && edbar.offsetParent ? edbar.getBoundingClientRect().top : host.bottom) - host.top;
    if (!rs.length) { hs.classList.remove('on'); return; }
    const a = rs[0], z = rs[rs.length - 1];
    const sx = a.left - host.left, sy = a.top - host.top, sh = a.height, ex = z.right - host.left, ey = z.top - host.top, eh = z.height;
    const hsOn = N25S.touch;
    hs.classList.toggle('on', hsOn);
    const [hS, hE] = $$('.n25-h', hs);
    hS.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`; hS.style.height = sh + 'px';
    hE.style.transform = `translate3d(${ex.toFixed(1)}px, ${ey.toFixed(1)}px, 0)`; hE.style.height = eh + 'px';
    hS.classList.toggle('out', sy + sh < top || sy > bottom);
    hE.classList.toggle('out', ey + eh < top || ey > bottom);
    if (!bar) return;
    // The bar: above the words (room for the handle's dot), or under them when there is no room above.
    const bw = bar.offsetWidth || 340, bh = bar.offsetHeight || 92;
    const minY = Math.min(...rs.map((x) => x.top)) - host.top, maxY = Math.max(...rs.map((x) => x.bottom)) - host.top;
    const minX = Math.min(...rs.map((x) => x.left)) - host.left, maxX = Math.max(...rs.map((x) => x.right)) - host.left;
    let y = minY - bh - 18, below = false;
    if (y < top + 6) { y = maxY + 22; below = true; }
    if (y + bh > bottom - 6) y = Math.max(top + 6, Math.min(bottom - bh - 6, (top + bottom - bh) / 2)); // (a long selection: in the middle)
    const cx = (minX + maxX) / 2, x = Math.max(8, Math.min(host.width - bw - 8, cx - bw / 2));
    bar.classList.add('n25-pos');
    bar.style.left = x.toFixed(1) + 'px';
    bar.style.top = y.toFixed(1) + 'px';
    bar.style.setProperty('--ox', Math.max(16, Math.min(bw - 16, cx - x)).toFixed(1) + 'px');
    bar.classList.toggle('below', below);
    bar.classList.toggle('n25-hid', !!N25S.drag || (maxY < top || minY > bottom));
  });
}
{
  const _sync = n20SelSync;
  n20SelSync = function () { _sync.apply(this, arguments); slPlace(); };
}
function slDragStart(e) {
  if (!ED) return;
  e.preventDefault();
  e.stopPropagation();
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const which = e.currentTarget.dataset.h, r = sel.getRangeAt(0).cloneRange();
  const rs = slRects(r), lh = rs.length ? (which === 's' ? rs[0] : rs[rs.length - 1]).height : 20;
  N25S.drag = { which, r, lh, id: e.pointerId, el: e.currentTarget };
  e.currentTarget.classList.add('drag');
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const mv = (ev) => slDragMove(ev.clientX, ev.clientY);
  const up = () => {
    const d = N25S.drag;
    N25S.drag = null;
    if (d) d.el.classList.remove('drag');
    window.removeEventListener('pointermove', mv, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    n20SelSync();
  };
  window.addEventListener('pointermove', mv, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  slPlace();
}
function slDragMove(x, y) {
  const d = N25S.drag;
  if (!d || !ED) return;
  // the finger is under the handle's dot: aim at the line the handle stands on
  const py = d.which === 's' ? y + Math.min(d.lh, 26) * 0.5 : y - Math.min(d.lh, 26) * 0.5;
  const c = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, py) : null;
  if (!c || !ED.ed.contains(c.startContainer)) return;
  const r = d.r.cloneRange();
  if (d.which === 's') {
    r.setStart(c.startContainer, c.startOffset);
    if (r.collapsed || r.compareBoundaryPoints(Range.START_TO_END, d.r) >= 0) return; // (never past the other handle)
  } else {
    r.setEnd(c.startContainer, c.startOffset);
    if (r.collapsed) return;
  }
  d.r = r;
  slSet(r);
  slPlace();
  buzz(4);
}
// The editor: scrolling moves the handles and the bar with the words.
{
  const _m = SCREENS.note.mount;
  SCREENS.note.mount = function (el) {
    _m.apply(this, arguments);
    const scr = $('.scroll', el);
    if (scr) scr.addEventListener('scroll', () => slPlace(), { passive: true });
    slHandles();
  };
}
window.addEventListener('resize', () => { if (ED) slPlace(); });
if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (ED) slPlace(); });

/* ---------- 6. New table: the keyboard goes down ---------- */
{
  const _ts = tableSheet;
  tableSheet = function () {
    const r = _ts.apply(this, arguments);
    if (ED && document.activeElement === ED.ed) ED.ed.blur();
    if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
    return r;
  };
}
