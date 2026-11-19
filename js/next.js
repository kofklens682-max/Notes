'use strict';
/* NEXT (20 Nov 2026): the new shell on top of the old engine. Four tabs (Today, Notes, Goals, Search),
   a new Today (week strip, Next up, three tasks, goals, habits), Goals with Apple-Watch rings and
   steps, Search across everything, a + button (tap = new note, hold = menu) and reminders typed in
   plain words. Loaded after the older files, before main.js. Design: Apps/next/notes-draft. */

// ---------- Goals: data helpers ----------
const GOAL_COLORS = ['#FF2D55', '#34C759', '#32ADE6', '#FF9500', '#AF52DE'];
const goalOf = (id) => (S.goals || []).find((g) => g.id === id);
const goalDone = (g) => g.steps.filter((s) => s.done).length;
const goalPct = (g) => (g.steps.length ? Math.round((goalDone(g) / g.steps.length) * 100) : 0);
const goalDays = (g) => (g.due ? daysFromToday(g.due) : null);
const goalLeft = (g) => { const n = goalDays(g); return n == null ? '' : n < 0 ? 'overdue' : n === 0 ? 'due today' : n === 1 ? '1 day left' : n + ' days left'; };

// Apple-Watch style rings: one solid ring per goal (the first goal is the outer ring), on a plain gray track.
function nxRingsSvg(goals) {
  return goals.slice(0, 5).map((g, i) => {
    const r = 88 - i * 22, C = 2 * Math.PI * r;
    return `<circle cx="110" cy="110" r="${r}" class="nxr-bg"/><circle class="nxr-fg" data-g="${g.id}" cx="110" cy="110" r="${r}" stroke="${g.c}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>`;
  }).join('');
}
const nxRings = (goals, cls, mid) => `<div class="nxr ${cls || ''}"><svg viewBox="0 0 220 220" aria-hidden="true">${nxRingsSvg(goals)}</svg><div class="nxr-mid">${mid || ''}</div></div>`;
// Fill the rings (after the screen is on the page, so they grow smoothly).
function nxFill(root, goals) {
  goals.slice(0, 5).forEach((g, i) => {
    const c = root.querySelector(`.nxr-fg[data-g="${g.id}"]`);
    if (!c) return;
    const r = 88 - i * 22, C = 2 * Math.PI * r;
    c.style.strokeDashoffset = C * (1 - Math.max(goalPct(g), 1.5) / 100);
  });
}
const nxFillSoon = (el, goals) => setTimeout(() => nxFill(el, goals), 40);

// ---------- Plain words → a reminder ("call mom tomorrow 6pm", "every Monday 9am") ----------
function parseWords(s) {
  let t = ' ' + s + ' ', repeat = null, off = null, h = null, m = 0, r;
  const now = new Date(), wdn = DOW_LONG.map((x) => x.toLowerCase());
  if ((r = t.match(/\bevery (day|morning|evening|night|weekday|week|month|year|sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i))) {
    const w = r[1].toLowerCase();
    repeat = w === 'weekday' ? 'weekdays' : w === 'month' ? 'monthly' : w === 'year' ? 'yearly' : wdn.includes(w) || w === 'week' ? 'weekly' : 'daily';
    if (w === 'morning') h = 8; if (w === 'evening') h = 19; if (w === 'night') h = 21;
    const i = wdn.indexOf(w); if (i >= 0) off = (i - now.getDay() + 7) % 7;
    t = t.replace(r[0], ' ');
  }
  if ((r = t.match(/\bin (\d+) (hours?|minutes?|mins?|days?)\b/i))) {
    const n = +r[1], u = r[2][0].toLowerCase(), d = new Date();
    if (u === 'h') d.setHours(d.getHours() + n); else if (u === 'm') d.setMinutes(d.getMinutes() + n); else d.setDate(d.getDate() + n);
    t = t.replace(r[0], ' ');
    return { title: cap1(t), due: iso(d), time: u === 'd' ? null : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, repeat };
  }
  if (/\btomorrow\b/i.test(t)) { off = 1; t = t.replace(/\btomorrow\b/i, ' '); }
  else if (/\btonight\b/i.test(t)) { off = 0; if (h == null) h = 20; t = t.replace(/\btonight\b/i, ' '); }
  else if (/\btoday\b/i.test(t)) { off = 0; t = t.replace(/\btoday\b/i, ' '); }
  if (off == null && (r = t.match(/\b(?:on |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i))) {
    off = (wdn.indexOf(r[1].toLowerCase()) - now.getDay() + 7) % 7 || 7; t = t.replace(r[0], ' ');
  }
  const tm = t.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) || t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (tm) {
    h = +tm[1]; m = tm[2] ? +tm[2] : 0; const ap = (tm[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    if (!ap && !tm[2] && h >= 1 && h <= 7) h += 12; // "at 6" means the evening
    if (h > 23 || m > 59) { h = null; m = 0; } else t = t.replace(tm[0], ' ');
  }
  let due = null, time = null;
  if (off != null || h != null) {
    if (off == null) { const d0 = new Date(); d0.setHours(h, m, 0, 0); off = d0 > now ? 0 : 1; }
    due = isoAdd(todayIso(), off);
    if (h != null) time = `${pad2(h)}:${pad2(m)}`;
  }
  t = t.replace(/\b(at|on|by)\b\s*$/i, ' ').replace(/^\s*remind me( to)?\b/i, ' ');
  return { title: cap1(t), due, time, repeat };
}
const cap1 = (s) => { s = s.replace(/\s+/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const whenText = (p) => (p.due ? `${dayName(p.due, true)}${p.time ? ', ' + p.time : ''}` : '');

function wordsSheet(pre = '') {
  openSheet(`${sheetHead('New reminder', '<button data-act="close-sheet">Cancel</button>', '<button class="strong" data-act="nx-radd" disabled>Add</button>')}
    <div class="sheet-body">
      <div class="card pad"><input class="nx-words" placeholder="Call mom tomorrow 6pm" value="${esc(pre)}" maxlength="200" autocapitalize="sentences" enterkeyhint="done" autocomplete="off"></div>
      <div class="nx-ideas">${['Call mom tomorrow 6pm', 'Plan lessons every Sunday 20:00', 'Stretch in 2 hours'].map((x) => `<button class="chip" data-act="nx-ridea" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="card pad nx-parsed"></div>
      <button class="nx-details" data-act="nx-rmore">More options</button>
    </div>`, (sh) => {
    const inp = $('.nx-words', sh), out = $('.nx-parsed', sh), add = $('[data-act="nx-radd"]', sh);
    const upd = () => {
      const p = parseWords(inp.value);
      add.disabled = !p.title;
      out.innerHTML = inp.value.trim()
        ? `<div class="nx-pr">${glyph('check', 'inl')}<b>${esc(p.title || '…')}</b></div><div class="nx-pr">${glyph('clock', 'inl')}${p.due ? esc(whenText(p)) : '<span class="nx-none">No time found: it goes on the day without a time</span>'}</div>${p.repeat ? `<div class="nx-pr">${glyph('repeat', 'inl')}${REPEATS[p.repeat]}</div>` : ''}`
        : '<div class="nx-none">Write it the way you say it. I find the time and the repeat.</div>';
    };
    sh._upd = upd;
    inp.addEventListener('input', upd);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !add.disabled) ACTIONS['nx-radd'](add); });
    upd();
    setTimeout(() => inp.focus(), 380);
  }, '');
}
ACTIONS['nx-ridea'] = (el) => { const i = $('.nx-words'); if (i) { i.value = el.dataset.v; i.dispatchEvent(new Event('input')); } };
ACTIONS['nx-radd'] = () => {
  const p = parseWords($('.nx-words').value);
  if (!p.title) return;
  if (!p.due) p.due = (cur().s === 'planner' && cur().day) || todayIso(); // no date said: the day you are looking at
  const t = makeTask({ title: p.title, due: p.due, time: p.time, repeat: p.repeat });
  S.tasks.push(t);
  save();
  closeSheet();
  buzz(12);
  toast('Reminder set: ' + whenText(p));
  if (['planner', 'tasks'].includes(cur().s)) setTimeout(render, 250);
};
ACTIONS['nx-rmore'] = () => { const p = parseWords(($('.nx-words') || {}).value || ''); closeSheet(); setTimeout(() => taskSheet(null, { title: p.title, due: p.due, time: p.time, repeat: p.repeat }), 380); };
ACTIONS['new-task'] = () => { wordsSheet(); };

// ---------- Today ----------
function nxNextUp() {
  const today = todayIso(), now = Date.now();
  const open = S.tasks.filter((t) => !t.done && t.due && t.due <= today && t.time).sort((a, b) => dueAt(a) - dueAt(b));
  return open.find((t) => dueAt(t) >= now) || open[0] || S.tasks.filter((t) => !t.done && t.due && t.due <= today).sort(SORTS.due)[0] || null;
}
function nxWeek(sel) {
  const today = todayIso(), mon = isoAdd(today, -dowMon(today));
  return `<div class="nx-week">${Array.from({ length: 7 }, (_, i) => {
    const d = isoAdd(mon, i), has = S.tasks.some((t) => !t.done && t.due === d);
    return `<button class="nx-wd${d === sel ? ' on' : ''}${d === today ? ' today' : ''}${has ? ' has' : ''}" data-act="nx-day" data-v="${d}" aria-label="${dayName(d, true)}">${WK3[i]}<b>${parseD(d).getDate()}</b><i></i></button>`;
  }).join('')}</div>`;
}
SCREENS.planner = {
  render(e) {
    const today = todayIso(), sel = e.day || today, isToday = sel === today;
    const late = isToday ? S.tasks.filter((t) => !t.done && isOverdue(t)) : [];
    const list = (isToday ? S.tasks.filter((t) => !t.done && t.due && t.due <= today) : S.tasks.filter((t) => !t.done && t.due === sel)).sort(SORTS.due);
    const undated = isToday ? S.tasks.filter((t) => !t.done && !t.due) : [];
    const rows = list.concat(undated);
    const nx = isToday ? nxNextUp() : null;
    const hs = S.habits.filter((h) => habitOn(h, sel) && sel <= today);
    const goals = (S.goals || []).filter((g) => g.pinned || (g.due && daysFromToday(g.due) <= 14 && goalPct(g) < 100));
    const shown = e.all ? rows : rows.slice(0, 3);
    let body = nxWeek(sel);
    if (nx) {
      const od = isOverdue(nx);
      body += `<div class="nx-next"><div class="nx-lbl">${glyph('bell', 'inl')}${od ? 'Overdue' : 'Next up'} · ${esc(dueText(nx) || 'Today')}</div>
        <div class="nx-ttl">${esc(nx.title || 'New reminder')}</div>
        <div class="nx-acts"><button class="main" data-act="nx-done" data-id="${nx.id}">Done</button><button data-act="nx-snooze" data-id="${nx.id}">Snooze</button></div></div>`;
    }
    if (isToday) body += deadlineStrip(today);
    if (late.length) body += `<div class="nx-roll"><span>${plural(late.length, 'task')} not finished</span><button data-act="nx-roll">Move to tomorrow</button></div>`;
    body += tsec('Tasks', '', `<button class="sec-btn" data-act="nx-addrem">Add</button>`);
    body += rows.length
      ? `<div class="card tasks">${shown.map((t) => taskRow(t, false)).join('')}${rows.length > 3 ? `<button class="nx-more" data-act="nx-more">${e.all ? 'Show less' : 'Show ' + (rows.length - 3) + ' more'}</button>` : ''}</div>`
      : `<div class="card nx-empty">${glyph('checkCircle')}<b>Nothing planned</b><span>Type “call mom tomorrow 6pm” to add a reminder.</span><button class="nx-pill" data-act="nx-addrem">Add a reminder</button></div>`;
    if (isToday) {
      if (goals.length) body += tsec('Goals', '', `<button class="sec-btn" data-act="tab" data-tab="goals">See all</button>`) + `<div class="nx-gscroll">${goals.map((g) => `<button class="nx-gcard" data-act="goal-open" data-id="${g.id}" style="--c:${g.c}">${nxRings([g], 'one', `<b>${goalPct(g)}%</b>`)}<span class="gt">${esc(g.name)}</span><span class="gs">${goalDone(g)} of ${g.steps.length} done${g.due ? ' · ' + goalLeft(g) : ''}</span></button>`).join('')}</div>`;
      body += tsec('Habits', '', `<button class="sec-btn" data-act="tab" data-tab="goals">${S.habits.length ? 'All' : 'Add'}</button>`);
      body += hs.length
        ? `<div class="hcs">${hs.map((h) => habitCircle(h, sel)).join('')}</div>`
        : `<button class="hint-btn" data-act="${S.habits.length ? 'tab" data-tab="goals' : 'h-new'}" style="margin-top:0">${glyph('flame')}<span><b>Build a routine</b>${S.habits.length ? 'No habits planned for today.' : 'Water, reading, sleep: tick them off here every day.'}</span></button>`;
    }
    const hr = new Date().getHours(), gr = hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    return page({ title: 'Today', right: navBtn('nx-voice', 'mic', 'Voice note') + navBtn('settings', 'gear', 'Settings'), body, sub: `${gr} · ${longDate(sel)}` });
  },
  mount(el) { $$('.nx-gcard', el).forEach((c) => { const g = goalOf(c.dataset.id); if (g) setTimeout(() => nxFill(c, [g]), 40); }); },
  fab: () => ({ g: 'plus', act: 'new-note', label: 'New note' }),
};
ACTIONS['nx-day'] = (el) => { const e = cur(); e.day = el.dataset.v === todayIso() ? null : el.dataset.v; e.all = false; render(); };
ACTIONS['nx-more'] = () => { const e = cur(); e.all = !e.all; render(); };
ACTIONS['nx-addrem'] = () => wordsSheet();
ACTIONS['nx-done'] = (el) => {
  const t = taskOf(el.dataset.id); if (!t) return;
  buzz(12);
  if (completeTask(t) === 'next') toast(`Done — next: ${dayName(t.due, true)}`);
  save(); render();
};
ACTIONS['nx-snooze'] = (el) => {
  const id = el.dataset.id;
  openSheet(`${sheetHead('Snooze', '', '<button data-act="close-sheet">Cancel</button>')}<div class="sheet-body"><div class="card">${[['In 10 minutes', 10], ['In 1 hour', 60], ['Tomorrow morning', 0]].map(([l, m]) => `<button class="row" data-act="nx-snz" data-id="${id}" data-m="${m}"><span class="lbl">${l}</span></button>`).join('')}</div></div>`, null, '');
};
ACTIONS['nx-snz'] = (el) => {
  const t = taskOf(el.dataset.id), m = +el.dataset.m; if (!t) return;
  if (m) { const d = new Date(Math.max(Date.now(), t.due && t.time ? dueAt(t) : 0) + m * 60e3); t.due = iso(d); t.time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; } else { t.due = isoAdd(todayIso(), 1); t.time = t.time || S.settings.allDay; }
  t.snooze = 0;
  save(); closeSheet(); toast(m ? 'Snoozed to ' + t.time : 'Moved to tomorrow'); setTimeout(render, 300);
};
ACTIONS['nx-roll'] = () => {
  const late = S.tasks.filter((t) => !t.done && isOverdue(t)); if (!late.length) return;
  const before = late.map((t) => [t, t.due, t.time, t.snooze]);
  late.forEach((t) => { t.due = isoAdd(todayIso(), 1); t.snooze = 0; });
  save(); buzz(10); render();
  undoToast('Moved to tomorrow', () => { before.forEach(([t, d, tm, s]) => { t.due = d; t.time = tm; t.snooze = s; }); });
};

// ---------- Goals ----------
function goalRows() {
  return (S.goals || []).map((g) => `<button class="nx-gi" data-act="goal-open" data-id="${g.id}"><i class="dot" style="background:${g.c}"></i><span class="gt2"><span class="gp" style="color:${g.c}">${goalPct(g)}%</span><span class="gn">${esc(g.name)}</span></span></button>`).join('');
}
SCREENS.goals = {
  render() {
    const gs = S.goals || [], today = todayIso();
    const avg = gs.length ? Math.round(gs.reduce((a, g) => a + goalPct(g), 0) / gs.length) : 0;
    let body = gs.length
      ? `<div class="nx-gsplit"><div class="nx-gl">${nxRings(gs, 'md', `<b>${avg}%</b>`)}</div><div class="nx-gr">${goalRows()}</div></div>`
      : `<div class="card nx-empty">${glyph('target')}<b>No goals yet</b><span>A goal is a few steps. Tick them off and the ring fills.</span><button class="nx-pill" data-act="nx-newgoal">New goal</button></div>`;
    body += tsec('Habits', '', `<button class="sec-btn" data-act="h-new">New habit</button>`);
    body += S.habits.length
      ? `<div class="card">${S.habits.map((h) => habitRow(h, today)).join('')}</div>`
      : `<div class="hint-btn" style="margin-top:0">${glyph('flame')}<span><b>Build a routine</b>Water, reading, sleep: small things every day.</span></div>`;
    return page({ title: 'Goals', right: gs.length ? `<button class="ntext" data-act="nx-newgoal">New goal</button>` : navBtn('settings', 'gear', 'Settings'), body });
  },
  mount(el) { nxFillSoon(el, S.goals || []); },
  fab: () => ({ g: 'plus', act: 'new-note', label: 'New note' }),
};
ACTIONS['nx-newgoal'] = async () => {
  const name = await askText({ title: 'New goal', msg: 'What do you want to reach?', placeholder: 'Prepare for the exam', ok: 'Create' });
  if (!name || !name.trim()) return;
  const g = { id: uid(), name: name.trim(), c: GOAL_COLORS[(S.goals || []).length % GOAL_COLORS.length], due: null, pinned: false, created: Date.now(), steps: [] };
  (S.goals = S.goals || []).push(g);
  save();
  if (UI.tab !== 'goals') goTab('goals', true);
  push({ s: 'goal', id: g.id });
};
ACTIONS['goal-open'] = (el) => {
  if (UI.tab === 'search' || UI.tab === 'notes') { /* stay in this tab */ }
  push({ s: 'goal', id: el.dataset.id });
};
function goalBody(g, order) {
  return `<div class="nx-gdetail">${nxRings(order, 'sm', `<b style="color:${g.c}">${goalPct(g)}%</b>`)}<div class="nx-gst"><b style="color:${g.c}">${goalDone(g)} of ${g.steps.length}</b> steps done${g.due ? ' · ' + goalLeft(g) : ''}</div></div>
    ${g.steps.length ? `<div class="card tasks nx-steps">${g.steps.map((s) => stepRow(g, s)).join('')}</div>` : ''}
    ${g.steps.length ? '<p class="foot nx-shint">Tap a step to change it · swipe left to delete it</p>' : ''}
    <div class="card tasks"><div class="task add-row" style="--c:${g.c}"><span class="chk plus">${glyph('plus')}</span><input class="add-input nx-stepin" placeholder="Add a step" enterkeyhint="done" autocapitalize="sentences" autocomplete="off"></div></div>`;
}
// A step: tick it, tap its words to change them, swipe left to delete it.
function stepRow(g, s) {
  const inner = `<div class="task${s.done ? ' is-done' : ''}" style="--c:${g.c}" data-sid="${s.id}"><button class="chk" data-act="nx-step" data-g="${g.id}" data-id="${s.id}" aria-label="${s.done ? 'Mark as not done' : 'Complete'}"></button><input class="add-input nx-stitle" data-id="${s.id}" value="${esc(s.title)}" maxlength="200" enterkeyhint="done" autocapitalize="sentences" autocomplete="off" aria-label="Step"></div>`;
  return swipeRow(inner, { right: swBtn('nx-sdel', s.id, 'Delete', 'trash', 'var(--red)') });
}
const goalOrder = (g) => [g, ...(S.goals || []).filter((x) => x !== g)];
SCREENS.goal = {
  tint: (e) => (goalOf(e.id) || {}).c,
  render(e) {
    const g = goalOf(e.id); if (!g) { return page({ title: 'Goal', back: 'Goals', body: empty('target', 'This goal is gone') }); }
    return page({ title: g.name, back: 'Goals', big: g.name, right: navBtn('nx-gmenu', 'more', 'More'), body: goalBody(g, goalOrder(g)) });
  },
  mount(el, e) {
    const g = goalOf(e.id); if (!g) return;
    nxFillSoon(el, goalOrder(g));
    $$('.nx-stitle', el).forEach((i) => {
      i.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); i.blur(); } });
      i.addEventListener('change', () => {
        const s = g.steps.find((x) => x.id === i.dataset.id); if (!s) return;
        const v = i.value.trim();
        if (v) { s.title = v; save(); return; }
        ACTIONS['nx-sdel']({ dataset: { id: s.id } }); // emptied: the step goes (Undo brings it back)
      });
    });
    const inp = $('.nx-stepin', el);
    if (inp) inp.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const v = inp.value.trim(); if (!v) return;
      g.steps.push({ id: uid(), title: v }); g.steps[g.steps.length - 1].done = false;
      save(); inp.value = ''; repaint(el, e); setTimeout(() => { const n = $('.nx-stepin', curEl()); if (n) n.focus(); }, 60);
    });
  },
  fab: null,
  bar: true,
};
ACTIONS['nx-step'] = (el) => {
  const g = goalOf(el.dataset.g); if (!g) return;
  const s = g.steps.find((x) => x.id === el.dataset.id); if (!s) return;
  s.done = !s.done; buzz(s.done ? 12 : 6);
  const root = curEl(), row = el.closest('.task');
  row.classList.toggle('is-done', s.done);
  nxFill(root, goalOrder(g));
  const st = $('.nx-gst', root), mid = $('.nxr-mid', root);
  if (st) st.innerHTML = `<b style="color:${g.c}">${goalDone(g)} of ${g.steps.length}</b> steps done${g.due ? ' · ' + goalLeft(g) : ''}`;
  if (mid) mid.innerHTML = `<b style="color:${g.c}">${goalPct(g)}%</b>`;
  save();
  if (goalPct(g) === 100 && s.done) toast('Goal complete 🎉');
};
ACTIONS['nx-gmenu'] = async (el) => {
  const g = goalOf(cur().id); if (!g) return;
  const r = await menu(el, [
    { id: 'name', label: 'Rename', g: 'pencil' },
    { id: 'due', label: g.due ? 'Change deadline' : 'Set deadline', g: 'calendar' },
    { id: 'color', label: 'Change color', g: 'palette' },
    { id: 'pin', label: g.pinned ? 'Unpin from Today' : 'Pin to Today', g: 'pin' },
    '-',
    { id: 'del', label: 'Delete goal', g: 'trash', danger: true },
  ]);
  if (r === 'name') { const n = await askText({ title: 'Rename goal', value: g.name, ok: 'Save' }); if (n && n.trim()) { g.name = n.trim(); save(); render(); } }
  if (r === 'pin') { g.pinned = !g.pinned; save(); toast(g.pinned ? 'Pinned to Today' : 'Unpinned'); }
  if (r === 'color') {
    openSheet(`${sheetHead('Color', '', '<button data-act="close-sheet">Done</button>')}<div class="sheet-body"><div class="card pad">${swatches('nx-gcol', g.c)}</div></div>`, null, '');
  }
  if (r === 'due') {
    openSheet(`${sheetHead('Deadline', '<button data-act="nx-gdue-none">None</button>', '<button class="strong" data-act="nx-gdue-set">Done</button>')}<div class="sheet-body"><div class="card pad"><input type="date" class="nx-date" value="${g.due || isoAdd(todayIso(), 14)}" min="${todayIso()}"></div></div>`, null, '');
  }
  if (r === 'del') {
    const ok = await ask({ title: `Delete “${g.name}”?`, msg: 'Its steps will be lost.', ok: 'Delete goal', destructive: true });
    if (!ok) return;
    const i = S.goals.indexOf(g); S.goals.splice(i, 1); save(); pop();
    undoToast('Goal deleted', () => { S.goals.splice(Math.min(i, S.goals.length), 0, g); });
  }
};
ACTIONS['nx-gcol'] = (el) => { const g = goalOf(cur().id); if (!g) return; g.c = el.dataset.v; save(); closeSheet(); setTimeout(() => repaint(curEl(), cur()), 300); };
ACTIONS['nx-gdue-set'] = () => { const g = goalOf(cur().id), v = ($('.nx-date') || {}).value; if (g && v) { g.due = v; save(); } closeSheet(); setTimeout(render, 300); };
ACTIONS['nx-gdue-none'] = () => { const g = goalOf(cur().id); if (g) { g.due = null; save(); } closeSheet(); setTimeout(render, 300); };

// ---------- Search (notes, reminders, habits, goals) ----------
const SQ = { q: '', f: '', recent: [] };
try { SQ.recent = JSON.parse(localStorage.getItem('notes-recent') || '[]').slice(0, 6); } catch (e) { /* none */ }
const nxHl = (s, q) => (q ? esc(s).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>') : esc(s));
function nxSearchResults() {
  const q = SQ.q.trim().toLowerCase(), f = SQ.f, today = todayIso();
  if (!q && !f) {
    const tiles = [
      ['Tasks', 'checkCircle', '#007AFF', S.tasks.filter((t) => !t.done).length + ' open', 'tasks'],
      ['Reminders', 'bell', '#FF9500', S.tasks.filter((t) => !t.done && t.due).length + ' coming', 'rem'],
      ['Tags', 'hash', '#34C759', allTags().length + ' tags', 'tags'],
      ['Photos', 'image', '#AF52DE', S.notes.filter((n) => (n.blobs || []).length).length + ' notes', 'photos'],
      ['Habits', 'flame', '#FF2D55', S.habits.length + ' habits', 'habits'],
      ['Locked', 'lock', '#8E8E93', S.notes.filter((n) => n.locked).length + ' notes', 'locked'],
    ];
    return `${SQ.recent.length ? `<h2 class="sec">Recent searches<button class="sec-btn" data-act="nx-sclear">Clear</button></h2><div class="nx-chips">${SQ.recent.map((r) => `<button class="chip" data-act="nx-sq" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}
      <h2 class="sec">Browse</h2><div class="nx-tiles">${tiles.map((x) => `<button class="nx-tile" data-act="nx-sf" data-v="${x[4]}"><span class="tic" style="--c:${x[2]}">${glyph(x[1])}</span><b>${x[0]}</b><span>${x[3]}</span></button>`).join('')}</div>`;
  }
  let out = '';
  const noteHtml = (n) => `<button class="row nx-nr" data-act="open-note" data-id="${n.id}"><span class="lbl"><b>${nxHl(noteTitle(n) || 'New Note', q)}</b><small>${nxHl(n.preview || '', q)}</small></span></button>`;
  if (f) {
    out += `<div class="nx-chips" style="margin-bottom:8px"><button class="chip" data-act="nx-sf" data-v="">${glyph('x', 'inl')} Clear filter</button></div>`;
    if (f === 'tasks' || f === 'rem') out += `<div class="card tasks">${S.tasks.filter((t) => !t.done && (f === 'tasks' || t.due)).sort(SORTS.due).map((t) => taskRow(t, true)).join('') || '<div class="hint-empty">Nothing here</div>'}</div>`;
    else if (f === 'tags') out += `<div class="nx-chips">${allTags().map((t) => `<button class="chip" data-act="nx-sq" data-v="${esc(t)}">${esc(t)}</button>`).join('') || '<div class="hint-empty">No tags yet. Type #idea in a note.</div>'}</div>`;
    else if (f === 'habits') out += `<div class="card">${S.habits.map((h) => habitRow(h, today)).join('') || '<div class="hint-empty">No habits</div>'}</div>`;
    else if (f === 'locked') out += `<div class="card">${S.notes.filter((n) => n.locked).map(noteHtml).join('') || '<div class="hint-empty">No locked notes</div>'}</div>`;
    else if (f === 'photos') out += `<div class="card">${S.notes.filter((n) => (n.blobs || []).length).map(noteHtml).join('') || '<div class="hint-empty">No photos yet</div>'}</div>`;
    return out;
  }
  const ns = S.notes.filter((n) => !n.locked && (((noteTitle(n) || '') + ' ' + (n.text || n.preview || '')).toLowerCase().includes(q)));
  const ts = S.tasks.filter((t) => (t.title + ' ' + (t.notes || '')).toLowerCase().includes(q));
  const hs = S.habits.filter((h) => h.name.toLowerCase().includes(q));
  const gs = (S.goals || []).filter((g) => (g.name + ' ' + g.steps.map((s) => s.title).join(' ')).toLowerCase().includes(q));
  if (ns.length) out += `<h2 class="sec">Notes</h2><div class="card">${ns.slice(0, 30).map(noteHtml).join('')}</div>`;
  if (ts.length) out += `<h2 class="sec">Reminders</h2><div class="card tasks">${ts.slice(0, 30).map((t) => taskRow(t, true)).join('')}</div>`;
  if (hs.length) out += `<h2 class="sec">Habits</h2><div class="card">${hs.map((h) => habitRow(h, today)).join('')}</div>`;
  if (gs.length) out += `<h2 class="sec">Goals</h2><div class="card">${gs.map((g) => `<button class="row" data-act="goal-open" data-id="${g.id}"><span class="lbl"><b>${nxHl(g.name, q)}</b><small>${goalDone(g)} of ${g.steps.length} steps</small></span><span class="val" style="color:${g.c}">${goalPct(g)}%</span></button>`).join('')}</div>`;
  return out || empty('search', `No results for “${SQ.q.trim()}”`, 'Try another word.');
}
function allTags() {
  const set = new Set();
  S.notes.forEach((n) => { if (n.locked) return; ((n.text || n.preview || '').match(/(^|\s)#[\p{L}\d_]+/gu) || []).forEach((t) => set.add(t.trim())); });
  return [...set].sort();
}
SCREENS.search = {
  render() {
    return page({ title: 'Search', body: `<label class="nx-sfield">${glyph('search')}<input class="nx-sin" type="search" placeholder="Notes, reminders, habits, goals" value="${esc(SQ.q)}" autocomplete="off" enterkeyhint="search"></label><div class="nx-sres">${nxSearchResults()}</div>` });
  },
  mount(el) {
    const inp = $('.nx-sin', el);
    inp.addEventListener('input', () => { SQ.q = inp.value; SQ.f = ''; $('.nx-sres', el).innerHTML = nxSearchResults(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return; inp.blur();
      const v = SQ.q.trim(); if (!v) return;
      SQ.recent = [v, ...SQ.recent.filter((x) => x !== v)].slice(0, 6);
      try { localStorage.setItem('notes-recent', JSON.stringify(SQ.recent)); } catch (err) { /* ignore */ }
    });
  },
  fab: () => ({ g: 'plus', act: 'new-note', label: 'New note' }),
};
const nxSearchRedraw = () => { const el = curEl(), r = el && $('.nx-sres', el); if (r) { r.innerHTML = nxSearchResults(); const i = $('.nx-sin', el); if (i) i.value = SQ.q; } };
ACTIONS['nx-sq'] = (el) => { SQ.q = el.dataset.v; SQ.f = ''; nxSearchRedraw(); };
ACTIONS['nx-sf'] = (el) => { SQ.f = el.dataset.v; SQ.q = ''; nxSearchRedraw(); };
ACTIONS['nx-sclear'] = () => { SQ.recent = []; try { localStorage.removeItem('notes-recent'); } catch (e) { /* ignore */ } nxSearchRedraw(); };

// ---------- The + button: tap = new note, hold = menu ----------
SCREENS.folders.fab = () => ({ g: 'plus', act: 'new-note', label: 'New note' });
(() => {
  const f = $('#fab'); let t = 0, held = false;
  f.addEventListener('pointerdown', () => { held = false; clearTimeout(t); t = setTimeout(() => { held = true; buzz(18); fabMenu(); }, 430); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => f.addEventListener(ev, () => clearTimeout(t)));
  f.addEventListener('click', (e) => { if (held) { e.stopImmediatePropagation(); e.preventDefault(); held = false; } }, true);
  f.addEventListener('contextmenu', (e) => e.preventDefault());
})();
async function fabMenu() {
  const r = await menu($('#fab'), [
    { id: 'check', label: 'Checklist', g: 'checklist' }, { id: 'rem', label: 'Reminder', g: 'bell' }, { id: 'habit', label: 'Habit', g: 'flame' },
    { id: 'goal', label: 'Goal', g: 'target' }, '-', { id: 'voice', label: 'Voice note', g: 'mic' }, { id: 'photo', label: 'Photo or scan', g: 'camera' }, { id: 'draw', label: 'Drawing', g: 'pencil' },
  ]);
  if (r === 'check') { ACTIONS['new-note'](); setTimeout(() => { const b = $('[data-act="ed-check"]'); if (b) b.click(); }, 500); }
  if (r === 'rem') wordsSheet();
  if (r === 'habit') ACTIONS['h-new']();
  if (r === 'goal') ACTIONS['nx-newgoal']();
  if (r === 'voice') ACTIONS['nx-voice']();
  if (r === 'photo') { ACTIONS['new-note'](); setTimeout(() => { const b = $('[data-act="ed-photo"]'); if (b) b.click(); }, 500); }
  if (r === 'draw') { ACTIONS['new-note'](); setTimeout(() => { const b = $('[data-act="ed-draw"]'); if (b) b.click(); }, 500); }
}
ACTIONS['nx-voice'] = () => { ACTIONS['new-note'](); setTimeout(() => { const b = $('[data-act="ed-mic"]'); if (b) b.click(); }, 500); };

// ---------- Note emoji (next to the heading) ----------
const NX_EMOJI = ['📝', '✨', '🌿', '📚', '💡', '🎯', '☕', '🌙', '🌸', '🍎', '✈️', '🎧', '🧠', '📅', '💬', '🤍', '⭐', '🔥', '✅', '🏆', '🗺️', '🎨', '🌍', '🧩', '📖', '🖊️', '📌', '🔖', '🗂️', '🧾', '💼', '🏠', '🛒', '🎓', '🍋', '🍃', '🌷', '🌞', '🌈', '🍀', '🕊️', '🦋', '🐚', '🪴', '🧸', '🎁', '🎬', '🎵', '📷', '🖼️', '🧳', '🏖️', '⛰️', '🚲', '🧘', '💪', '🥗', '🍵', '🍰', '💎', '🔑', '📈', '💰', '⏳', '🔔', '❤️', '🩵', '💛', '💚'];
ACTIONS['nx-emoji'] = () => {
  openSheet(`${sheetHead('Note emoji', '', '<button data-act="close-sheet">Done</button>')}<div class="sheet-body"><div class="nx-emo">${NX_EMOJI.map((x) => `<button data-act="nx-emopick" data-v="${x}">${x}</button>`).join('')}</div><button class="nx-details" data-act="nx-emopick" data-v="">No emoji</button></div>`, null, 'tall');
};
ACTIONS['nx-emopick'] = (el) => {
  const n = ED && noteOf(ED.id); if (!n) return;
  n.emoji = el.dataset.v || '';
  const b = $('.nx-emob', ED.el); if (b) b.innerHTML = n.emoji ? esc(n.emoji) : glyph('smile');
  ED.dirty = true; queueSave(); buzz(6); closeSheet();
};

// ---------- Notes tab: folders first, then the notes inside a folder ----------
const folderRow = (id, name, count, g, color, swipe) => {
  const inner = `<button class="row" data-act="nx-folder" data-id="${id}">${tile(g, color, 'round')}<span class="lbl">${esc(name)}</span><span class="val">${count}</span>${glyph('chevR', 'chev')}</button>`;
  return swipe ? swipeRow(inner, { right: swBtn('nx-fren', id, 'Rename', 'pencil', 'var(--gray)') + swBtn('nx-fdel', id, 'Delete', 'trash', 'var(--red)') }) : inner;
};
SCREENS.nxfolders = {
  render() {
    const locked = S.notes.filter((n) => n.locked).length, trash = (S.trash || []).length;
    let body = backupNudge();
    body += `<div class="card">${folderRow('all', 'All Notes', S.notes.length, 'note', '#FFCC00')}</div>`;
    const mine = S.folders.filter((f) => f.id !== 'notes');
    body += tsec('Folders', '', `<button class="sec-btn" data-act="new-folder">New</button>`);
    body += `<div class="card">${[S.folders.find((f) => f.id === 'notes'), ...mine].filter(Boolean).map((f) => folderRow(f.id, f.name, S.notes.filter((n) => n.folder === f.id).length, 'folder', folderColor(f.id), f.id !== 'notes')).join('')}</div>`;
    body += `<div class="card nx-gap">${folderRow('__locked', 'Locked', locked, 'lock', '#8E8E93')}<button class="row" data-act="nx-trash">${tile('trash', '#8E8E93', 'round')}<span class="lbl">Recently Deleted</span><span class="val">${trash}</span>${glyph('chevR', 'chev')}</button></div>`;
    return page({ title: 'Folders', big: 'Folders', right: navBtn('settings', 'gear', 'Settings'), body });
  },
  fab: () => ({ g: 'plus', act: 'new-note', label: 'New note' }),
};
ACTIONS['nx-folder'] = (el) => push({ s: 'folders', folder: el.dataset.id });
ACTIONS['nx-fren'] = (el) => renameFolder(el.dataset.id);
ACTIONS['nx-fdel'] = (el) => deleteFolder(el.dataset.id);
ACTIONS['nx-trash'] = () => push({ s: 'trash' });
// A new note opens with the folder list and the notes list behind it, so Back walks through them.
const nxNewNote = ACTIONS['new-note'];
ACTIONS['new-note'] = () => {
  const st = UI.stacks.notes;
  if (st.length === 1 && st[0].s === 'nxfolders') st.push({ s: 'folders', folder: 'all' });
  nxNewNote();
};

// ---------- Recently Deleted (30 days) ----------
const trashLeft = (n) => Math.max(1, 30 - Math.floor((Date.now() - n.deletedAt) / 864e5));
SCREENS.trash = {
  render() {
    const t = S.trash || [];
    const body = t.length
      ? `<div class="card">${t.map((n) => `<div class="row nx-tr"><span class="lbl"><b>${esc(noteTitle(n))}</b><small>${esc(n.locked ? 'Locked' : n.preview || 'No more text')}</small><small>${plural(trashLeft(n), 'day')} left</small></span><span class="nx-tact"><button data-act="nx-restore" data-id="${n.id}">Restore</button><button class="red" data-act="nx-purge" data-id="${n.id}">Delete</button></span></div>`).join('')}</div><button class="add-link muted" data-act="nx-purgeall">Delete all</button><p class="foot">Notes are deleted for good after 30 days.</p>`
      : empty('trash', 'Nothing here', 'Notes you delete wait here for 30 days, so you can bring them back.');
    return page({ title: 'Recently Deleted', back: 'Folders', body });
  },
  fab: null,
};
ACTIONS['nx-restore'] = (el) => {
  const n = (S.trash || []).find((x) => x.id === el.dataset.id); if (!n) return;
  S.trash = S.trash.filter((x) => x !== n);
  const { deletedAt, ...note } = n;
  if (!folderOf(note.folder)) note.folder = 'notes';
  S.notes.push(note);
  save(note); buzz(10); toast('Note restored'); render();
};
ACTIONS['nx-purge'] = async (el) => {
  const n = (S.trash || []).find((x) => x.id === el.dataset.id); if (!n) return;
  if (!(await ask({ title: 'Delete this note for good?', msg: 'It cannot be brought back.', ok: 'Delete note', destructive: true }))) return;
  S.trash = S.trash.filter((x) => x !== n); save(); render();
};
ACTIONS['nx-purgeall'] = async () => {
  if (!(await ask({ title: 'Delete everything here?', msg: 'These notes cannot be brought back.', ok: 'Delete all', destructive: true }))) return;
  S.trash = []; save(); render();
};

// ---------- Settings: one page in sections, like Teacher and Budget ----------
const NOTES_VERSION = 'Notes 4.2';
SCREENS.settings.render = function () {
  const perm = notifPerm();
  const status = !notifSupported() ? 'Not available' : perm === 'denied' ? 'Blocked' : notifOn() ? (pushReady() ? 'On' : 'On, while open') : 'Off';
  const L = S.settings.lock, last = S.settings.lastBackup;
  const back = { today: 'Today', notes: 'Folders', goals: 'Goals', search: 'Search' }[UI.tab] || 'Back';
  const body = `${acctSection()}
    <h2 class="sec">Reminders</h2>
    <div class="card">
      <div class="row static">${tile('bell', '#FF3B30')}<span class="lbl">Notifications</span><span class="val">${status}</span></div>
      ${notifOn() ? `<button class="row" data-act="notif-test">${tile('sparkles', '#FF9500')}<span class="lbl">Send a test notification</span></button>`
        : notifSupported() && perm !== 'denied' ? `<button class="row" data-act="notif-on">${tile('bell', '#34C759')}<span class="lbl tinted">Turn on notifications</span></button>` : ''}
      ${notifOn() && pushReady() ? `<button class="row" data-act="rem-check">${tile('shield', '#34C759')}<span class="lbl">Reliable reminders</span><span class="val">${esc(remSummary())}</span>${glyph('chevR', 'chev')}</button>` : ''}
      <label class="row">${tile('clock', '#FFCC00')}<span class="lbl">Default time<small>When a date has no time</small></span><input class="row-input" type="time" name="allDay" value="${S.settings.allDay}"></label>
      <label class="row">${tile('calendar', '#5856D6')}<span class="lbl">Week ahead on Sundays</span>${toggle('weekAhead', S.settings.weekAhead, 'Week ahead on Sundays')}</label>
    </div>
    <p class="foot">${pushReady() ? 'Reminders arrive even when the app is closed. Only the times are sent, never what you wrote.' : 'Reminders appear while the app is open or was used recently.'}</p>

    <h2 class="sec">Notes</h2>
    <div class="card pad"><div class="seg">${segButtons('nx-sort', [['edited', 'Edited'], ['created', 'Created'], ['title', 'Title']], S.settings.noteSort)}</div></div>
    <p class="foot">How the notes in a folder are sorted.</p>
    <h2 class="sec">Voice typing language</h2>
    <div class="card pad"><div class="seg">${segButtons('voice-lang', VOICE_LANGS.map(([v, , l]) => [v, esc(l)]), S.settings.voiceLang)}</div></div>

    <h2 class="sec">Locked notes</h2>
    <div class="card">
      ${L ? `<button class="row" data-act="lock-change">${tile('lock', '#8E8E93')}<span class="lbl">Change code</span>${glyph('chevR', 'chev')}</button>
        ${LOCK.key ? `<button class="row" data-act="lock-now">${tile('lock', '#FF9500')}<span class="lbl">Lock now</span><span class="val">Notes are open</span></button>` : ''}
        <button class="row" data-act="lock-reset">${tile('x', '#FF3B30')}<span class="lbl danger">Forgot the code…</span></button>`
      : `<button class="row" data-act="lock-set">${tile('lock', '#8E8E93')}<span class="lbl">Set a notes code</span>${glyph('chevR', 'chev')}</button>`}
    </div>
    <p class="foot">To lock a note, open it and tap ••• then Lock note. Locked notes are encrypted with your 4-digit code.</p>

    <h2 class="sec">AI helper</h2>
    <div class="card ai-left" id="ai-left">${aiLeftHtml(aiLeftNow())}</div>
    <p class="foot">Writing check and pictures use a free allowance each day.</p>

    <h2 class="sec">Backup</h2>
    <div class="card">
      <button class="row" data-act="backup-save">${tile('share', '#30B0C7')}<span class="lbl">Save a backup file<small>Send it to yourself in Telegram</small></span></button>
      <button class="row" data-act="backup-load">${tile('download', '#34C759')}<span class="lbl">Restore from a backup</span></button>
    </div>
    <p class="foot">${last ? `Last backup: ${esc(dayName(dateOf(last), true))}.` : 'No backup yet.'} Everything is stored on this phone and in your account.</p>

    <h2 class="sec">Storage</h2>
    <div class="card">
      <div class="row static">${tile('box', '#8E8E93')}<span class="lbl">Space used</span><span class="val" id="st-used">…</span></div>
      <div class="row static">${tile('shield', '#34C759')}<span class="lbl">Safe from clean-up</span><span class="val" id="st-keep">…</span></div>
    </div>

    <h2 class="sec">Update</h2>
    <div class="card"><button class="row" data-appupdate>${tile('download', '#007AFF')}<span class="lbl">Update the app<small>Get the newest version now</small></span></button></div>

    <button class="danger-btn" data-act="erase">Erase everything</button>
    <div class="about">${NOTES_VERSION} · Teacher, Budget and Notes share one account</div>`;
  return page({ title: 'Settings', back, body });
};
ACTIONS['nx-sort'] = (el) => { S.settings.noteSort = el.dataset.v; save(); render(); };

ACTIONS['nx-sdel'] = (el) => {
  const g = goalOf(cur().id); if (!g) return;
  const i = g.steps.findIndex((x) => x.id === el.dataset.id); if (i < 0) return;
  const [s] = g.steps.splice(i, 1);
  save(); buzz(10); repaint(curEl(), cur());
  undoToast('Step deleted', () => { g.steps.splice(Math.min(i, g.steps.length), 0, s); });
};

// Old notes began with a big Title line: it moves into the heading field the first time they are opened.
function nxMoveTitle(me) {
  const f = me.ed.firstElementChild, hd = $('.nx-head', me.el);
  if (!f || f.tagName !== 'H1' || !hd || hd.value.trim()) return;
  const t = f.textContent.replace(/\s+/g, ' ').trim();
  if (!t) return;
  hd.value = t;
  f.remove();
  if (!me.ed.firstChild) me.ed.innerHTML = '<div><br></div>';
  me.dirty = true;
  queueSave();
}

// ---------- A goal opens as a sheet over the page (21 Nov), not as a page of its own ----------
let GOALID = null;
const gsRoot = () => (sheet && sheet.sh) || curEl();
const nxBehind = () => { if (['goals', 'planner', 'search'].includes(cur().s)) render(); };
function goalSheetHtml() {
  const g = goalOf(GOALID); if (!g) return '';
  return `${sheetHead('', '', '<button class="strong" data-act="close-sheet">Done</button>')}
  <div class="sheet-body nx-gsheet" style="--tint:${g.c}">
    <input class="nx-gname" value="${esc(g.name)}" maxlength="120" placeholder="Goal name" autocomplete="off" enterkeyhint="done" autocapitalize="sentences" aria-label="Goal name">
    ${goalBody(g, goalOrder(g))}
    <div class="card form">
      <div class="frow">${tile('calendar', '#FF3B30')}<span class="lbl">Deadline${g.due ? `<small>${esc(dayName(g.due, true))} · ${goalLeft(g)}</small>` : ''}</span>${toggle('gDue', !!g.due, 'Deadline')}</div>
      ${g.due ? `<div class="frow sub"><input type="date" name="gDate" value="${g.due}" min="${todayIso()}"></div>` : ''}
      <div class="frow">${tile('pin', '#FF9500')}<span class="lbl">Show on Today</span>${toggle('gPin', !!g.pinned, 'Show on Today')}</div>
    </div>
    <div class="card pad">${swatches('nx-gcol', g.c)}</div>
    <button class="danger-btn" data-act="nx-gdel">Delete goal</button>
  </div>`;
}
function openGoal(id) {
  GOALID = id;
  openSheet(goalSheetHtml(), mountGoalSheet, 'tall');
  if (sheet) sheet.onClose = () => { GOALID = null; nxBehind(); };
}
const redrawGoal = () => { if (sheet && GOALID && goalOf(GOALID)) refreshSheet(goalSheetHtml(), mountGoalSheet); };
function mountGoalSheet(sh) {
  const g = goalOf(GOALID); if (!g) return;
  nxFillSoon(sh, goalOrder(g));
  const nm = $('.nx-gname', sh);
  nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') nm.blur(); });
  nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) { g.name = v; save(); } else nm.value = g.name; });
  $$('.nx-stitle', sh).forEach((i) => {
    i.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); i.blur(); } });
    i.addEventListener('change', () => {
      const s = g.steps.find((x) => x.id === i.dataset.id); if (!s) return;
      const v = i.value.trim();
      if (v) { s.title = v; save(); return; }
      ACTIONS['nx-sdel']({ dataset: { id: s.id } });
    });
  });
  const inp = $('.nx-stepin', sh);
  if (inp) inp.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const v = inp.value.trim(); if (!v) return;
    g.steps.push({ id: uid(), title: v, done: false });
    save(); redrawGoal();
    setTimeout(() => { const n = sheet && $('.nx-stepin', sheet.sh); if (n) n.focus(); }, 60);
  });
  sheetOn(sh, 'change', (e) => {
    const t = e.target;
    if (t.name === 'gDue') { g.due = t.checked ? g.due || isoAdd(todayIso(), 14) : null; save(); redrawGoal(); }
    if (t.name === 'gDate' && t.value) { g.due = t.value; save(); redrawGoal(); }
    if (t.name === 'gPin') { g.pinned = t.checked; save(); toast(g.pinned ? 'Shown on Today' : 'Not on Today'); }
  });
}
ACTIONS['goal-open'] = (el) => openGoal(el.dataset.id);
ACTIONS['nx-newgoal'] = async () => {
  const name = await askText({ title: 'New goal', msg: 'What do you want to reach?', placeholder: 'Prepare for the exam', ok: 'Create' });
  if (!name || !name.trim()) return;
  const g = { id: uid(), name: name.trim(), c: GOAL_COLORS[(S.goals || []).length % GOAL_COLORS.length], due: null, pinned: false, created: Date.now(), steps: [] };
  (S.goals = S.goals || []).push(g);
  save(); nxBehind();
  openGoal(g.id);
  setTimeout(() => { const n = sheet && $('.nx-stepin', sheet.sh); if (n) n.focus(); }, 450);
};
ACTIONS['nx-gcol'] = (el) => { const g = goalOf(GOALID); if (!g) return; g.c = el.dataset.v; save(); buzz(6); redrawGoal(); };
ACTIONS['nx-gdel'] = async () => {
  const g = goalOf(GOALID); if (!g) return;
  if (!(await ask({ title: `Delete “${g.name}”?`, msg: 'Its steps will be lost.', ok: 'Delete goal', destructive: true }))) return;
  const i = S.goals.indexOf(g);
  closeSheet();
  S.goals.splice(i, 1); save(); render();
  undoToast('Goal deleted', () => { S.goals.splice(Math.min(i, S.goals.length), 0, g); });
};
ACTIONS['nx-step'] = (el) => {
  const g = goalOf(el.dataset.g); if (!g) return;
  const s = g.steps.find((x) => x.id === el.dataset.id); if (!s) return;
  s.done = !s.done; buzz(s.done ? 12 : 6);
  const root = gsRoot(), row = el.closest('.task');
  if (row) row.classList.toggle('is-done', s.done);
  nxFill(root, goalOrder(g));
  const st = $('.nx-gst', root), mid = $('.nxr-mid', root);
  if (st) st.innerHTML = `<b style="color:${g.c}">${goalDone(g)} of ${g.steps.length}</b> steps done${g.due ? ' · ' + goalLeft(g) : ''}`;
  if (mid) mid.innerHTML = `<b style="color:${g.c}">${goalPct(g)}%</b>`;
  save();
  if (goalPct(g) === 100 && s.done) toast('Goal complete 🎉');
};
ACTIONS['nx-sdel'] = (el) => {
  const g = goalOf(GOALID || cur().id); if (!g) return;
  const i = g.steps.findIndex((x) => x.id === el.dataset.id); if (i < 0) return;
  const [s] = g.steps.splice(i, 1);
  save(); buzz(10);
  if (sheet && GOALID === g.id) redrawGoal(); else repaint(curEl(), cur());
  undoToast('Step deleted', () => { g.steps.splice(Math.min(i, g.steps.length), 0, s); setTimeout(redrawGoal, 0); });
};
