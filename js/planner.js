'use strict';
/* Planner tab: the home page (Today / Scheduled / All / Completed, Groceries, Habits, your lists),
   task lists like iPhone Reminders, the task details sheet and the list editor. */

const listOf = (id) => S.lists.find((l) => l.id === id);
const taskOf = (id) => S.tasks.find((t) => t.id === id);
const LIST_ICONS = ['list', 'house', 'briefcase', 'cart', 'book', 'gradcap', 'heart', 'star', 'gift', 'plane', 'car', 'users', 'phone', 'paw', 'dumbbell', 'pill', 'music', 'coffee', 'wallet', 'sparkles', 'flag', 'target', 'bell', 'leaf'];
const SMART = {
  today: { name: 'Today', g: 'today', c: '#007AFF' },
  scheduled: { name: 'Scheduled', g: 'calendar', c: '#FF3B30' },
  all: { name: 'All', g: 'tray', c: '#636366' },
  done: { name: 'Completed', g: 'checkCircle', c: '#8E8E93' },
};
const PRIO = ['None', 'Low', 'Medium', 'High'];
const dueAt = (t) => (t.due ? atMs(t.due, t.time || '23:59') : Infinity);
const isOverdue = (t) => !t.done && !!t.due && (t.due < todayIso() || (t.due === todayIso() && !!t.time && atMs(t.due, t.time) < Date.now()));
function smartTasks(id) {
  const today = todayIso();
  if (id === 'today') return S.tasks.filter((t) => !t.done && t.due && t.due <= today);
  if (id === 'scheduled') return S.tasks.filter((t) => !t.done && t.due);
  if (id === 'done') return S.tasks.filter((t) => t.done);
  return S.tasks.filter((t) => !t.done);
}
const SORTS = {
  due: (a, b) => dueAt(a) - dueAt(b) || b.prio - a.prio || a.created - b.created,
  prio: (a, b) => b.prio - a.prio || dueAt(a) - dueAt(b) || a.created - b.created,
  title: (a, b) => (a.title || '').localeCompare(b.title || ''),
  created: (a, b) => a.created - b.created,
};
const sortKey = (key) => S.settings.listSort[key] || 'due';
function dueText(t) {
  if (!t.due) return '';
  return `${dayName(t.due)}${t.time ? `, ${t.time}` : ''}`;
}

// ---------- Rows ----------
function taskRow(t, showList) {
  const L = listOf(t.list) || S.lists[0];
  const meta = [];
  if (t.due) meta.push(`<span class="${isOverdue(t) ? 'late' : ''}">${dueText(t)}</span>`);
  if (t.repeat && !t.done) meta.push(`<span>${glyph('repeat', 'inl')}${REPEATS[t.repeat] || ''}</span>`);
  if (t.subs.length) meta.push(`<span>${t.subs.filter((s) => s.done).length}/${t.subs.length}</span>`);
  if (showList) meta.push(`<span class="t-list">${esc(L.name)}</span>`);
  if (t.done && t.doneAt) meta.push(`<span>Completed ${dayName(dateOf(t.doneAt))}, ${hm(t.doneAt)}</span>`);
  const inner = `<div class="task${t.done ? ' is-done' : ''}" style="--c:${L.color}">
      <button class="chk" data-act="task-toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark as not done' : 'Complete'}"></button>
      <button class="t-main" data-act="task-open" data-id="${t.id}">
        <span class="t-title">${t.prio ? `<b class="prio">${'!'.repeat(t.prio)}</b>` : ''}${esc(t.title || 'New Reminder')}</span>
        ${t.notes ? `<span class="t-notes">${esc(firstLine(t.notes))}</span>` : ''}
        ${meta.length ? `<span class="t-meta">${meta.join('')}</span>` : ''}
      </button>
    </div>`;
  return swipeRow(inner, { right: swBtn('task-open', t.id, 'Details', 'info', 'var(--gray)') + swBtn('task-del', t.id, 'Delete', 'trash', 'var(--red)') });
}
const addRow = (list, due = '') => {
  const L = listOf(list) || S.lists[0];
  return `<div class="task add-row" style="--c:${L.color}"><span class="chk plus">${glyph('plus')}</span><input class="add-input" data-list="${L.id}" data-due="${due}" placeholder="New Reminder" enterkeyhint="done" autocapitalize="sentences" aria-label="New reminder in ${esc(L.name)}"></div>`;
};
const taskCard = (rows, extra = '') => `<div class="card tasks">${rows}${extra}</div>`;
const tsec = (title, cls = '', right = '') => `<h2 class="sec ${cls}">${esc(title)}${right}</h2>`;

function taskBody(e) {
  const today = todayIso();
  if (e.list) {
    const L = listOf(e.list);
    const key = 'list:' + L.id;
    const open = S.tasks.filter((t) => t.list === L.id && !t.done).sort(SORTS[sortKey(key)]);
    const done = S.tasks.filter((t) => t.list === L.id && t.done).sort((a, b) => b.doneAt - a.doneAt);
    let html = taskCard(open.map((t) => taskRow(t)).join(''), addRow(L.id));
    if (!open.length && !S.settings.showDone[key]) html = `<div class="hint-empty">No reminders</div>` + html;
    if (S.settings.showDone[key] && done.length) html += tsec('Completed') + taskCard(done.map((t) => taskRow(t)).join(''));
    else if (done.length) html += `<button class="add-link muted" data-act="show-done" data-v="${key}">${plural(done.length, 'Completed')}  ·  Show</button>`;
    return html;
  }
  if (e.smart === 'today') {
    const all = smartTasks('today').sort(SORTS.due);
    const late = all.filter((t) => t.due < today), now = all.filter((t) => t.due === today);
    let html = late.length ? tsec('Overdue', 'late') + taskCard(late.map((t) => taskRow(t, true)).join('')) : '';
    html += tsec(late.length ? 'Today' : '') + taskCard(now.map((t) => taskRow(t, true)).join(''), addRow(S.lists[0].id, today));
    if (!all.length) html = `<div class="all-done">${glyph('checkCircle')}<b>Nothing left for today</b></div>` + html;
    return html;
  }
  if (e.smart === 'scheduled') {
    const all = smartTasks('scheduled').sort(SORTS.due);
    if (!all.length) return empty('calendar', 'No Scheduled Reminders', 'Reminders with a date show up here.');
    const groups = [];
    for (const t of all) {
      const g = t.due < today ? 'Overdue' : dayName(t.due, true);
      if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g, items: [] });
      groups[groups.length - 1].items.push(t);
    }
    return groups.map((x) => tsec(x.g, x.g === 'Overdue' ? 'late' : '') + taskCard(x.items.map((t) => taskRow(t, true)).join(''))).join('');
  }
  if (e.smart === 'all') {
    return S.lists.map((L) => {
      const ts = S.tasks.filter((t) => t.list === L.id && !t.done).sort(SORTS.due);
      return `<h2 class="sec" style="color:${L.color}">${esc(L.name)}</h2>` + taskCard(ts.map((t) => taskRow(t)).join(''), addRow(L.id));
    }).join('');
  }
  const done = smartTasks('done').sort((a, b) => b.doneAt - a.doneAt);
  if (!done.length) return empty('checkCircle', 'No Completed Reminders');
  const groups = [];
  for (const t of done) {
    const g = dayName(dateOf(t.doneAt || Date.now()), true);
    if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g, items: [] });
    groups[groups.length - 1].items.push(t);
  }
  return groups.map((x) => tsec(x.g) + taskCard(x.items.map((t) => taskRow(t, true)).join(''))).join('');
}

// ---------- Planner home ----------
function habitsToday() {
  const d = todayIso();
  const hs = S.habits.filter((h) => habitOn(h, d));
  return { total: hs.length, done: hs.filter((h) => habitDone(h, d)).length };
}
SCREENS.planner = {
  render() {
    const card = (id) => {
      const n = id === 'done' ? '' : smartTasks(id).length;
      return `<button class="smart" data-act="open-smart" data-id="${id}"><span class="sm-top">${tile(SMART[id].g, SMART[id].c, 'round')}<b>${n}</b></span><span class="sm-name">${SMART[id].name}</span></button>`;
    };
    const toBuy = S.grocery.items.filter((i) => !i.done).length;
    const h = habitsToday();
    const lists = S.lists.map((l) => swipeRow(
      `<button class="row" data-act="open-list" data-id="${l.id}">${tile(l.g || 'list', l.color, 'round')}<span class="lbl">${esc(l.name)}</span><span class="val">${S.tasks.filter((t) => t.list === l.id && !t.done).length}</span>${glyph('chevR', 'chev')}</button>`,
      { right: swBtn('list-edit', l.id, 'Info', 'info', 'var(--gray)') + (S.lists.length > 1 ? swBtn('list-del', l.id, 'Delete', 'trash', 'var(--red)') : '') },
    )).join('');
    const body = `<div class="smart-grid">${['today', 'scheduled', 'all', 'done'].map(card).join('')}</div>
      <div class="wide-cards">
        <button class="wide" data-act="open-groceries">${tile('cart', '#34C759', 'round')}<span class="w-main"><b>Groceries</b><span>${toBuy ? `${plural(toBuy, 'item')} to buy` : 'Your list is empty'}</span></span>${glyph('chevR', 'chev')}</button>
        <button class="wide" data-act="open-habits"><span class="w-ring" style="--c:#FF9500">${ring(h.total ? h.done / h.total : 0, 36, 4)}${glyph('flame')}</span><span class="w-main"><b>Habits</b><span>${h.total ? `${h.done} of ${h.total} done today` : 'Build a daily routine'}</span></span>${glyph('chevR', 'chev')}</button>
      </div>
      <h2 class="sec lg">My Lists</h2><div class="card">${lists}</div>
      <button class="add-link" data-act="new-list">${glyph('plus')}Add List</button>`;
    return page({ title: 'Planner', right: navBtn('settings', 'gear', 'Settings'), body, sub: longDate(todayIso()) });
  },
  fab: () => ({ g: 'plus', act: 'new-task', label: 'New reminder' }),
};
ACTIONS['open-smart'] = (el) => push({ s: 'tasks', smart: el.dataset.id });
ACTIONS['open-list'] = (el) => push({ s: 'tasks', list: el.dataset.id });

// ---------- A list of tasks ----------
SCREENS.tasks = {
  tint: (e) => (e.list ? (listOf(e.list) || S.lists[0]).color : SMART[e.smart].c),
  render(e) {
    if (e.list && !listOf(e.list)) { e.smart = 'all'; delete e.list; }
    const title = e.list ? listOf(e.list).name : SMART[e.smart].name;
    return page({ title, back: 'Planner', right: navBtn('tasks-menu', 'more', 'More'), body: taskBody(e) });
  },
  mount(el) { bindAddRows(el); },
  fab: (e) => (e.smart === 'done' ? null : { g: 'plus', act: 'new-task', label: 'New reminder' }),
};
// Type in "New Reminder" and press Enter to add; the field stays ready for the next one.
function bindAddRows(el) {
  $$('.add-input', el).forEach((input) => {
    const add = () => {
      const title = input.value.trim();
      if (!title) return;
      const t = makeTask({ title, list: input.dataset.list, due: input.dataset.due || null });
      S.tasks.push(t);
      save();
      input.value = '';
      input.closest('.add-row').insertAdjacentHTML('beforebegin', taskRow(t, cur().smart === 'today'));
      $$('.hint-empty, .all-done', el).forEach((x) => x.remove());
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    input.addEventListener('blur', () => { if (input.value.trim()) { add(); render(); } });
  });
}
function makeTask(p = {}) {
  return { id: uid(), title: '', notes: '', list: S.lists[0].id, due: null, time: null, repeat: null, prio: 0, subs: [], done: false, doneAt: 0, snooze: 0, created: Date.now(), ...p };
}
ACTIONS['tasks-menu'] = async (el) => {
  const e = cur();
  const items = [];
  if (e.list) {
    const key = 'list:' + e.list, k = sortKey(key);
    items.push({ id: 'done', label: S.settings.showDone[key] ? 'Hide Completed' : 'Show Completed', g: 'checkCircle' }, '-');
    [['due', 'Due Date'], ['prio', 'Priority'], ['title', 'Title'], ['created', 'Date Created']].forEach(([v, l]) => items.push({ id: 'sort:' + v, label: `Sort by ${l}`, check: k === v }));
    items.push('-', { id: 'info', label: 'List Info', g: 'info' });
    if (S.lists.length > 1) items.push({ id: 'delete', label: 'Delete List', g: 'trash', danger: true });
  } else if (e.smart === 'done') {
    items.push({ id: 'clear', label: 'Delete All Completed', g: 'trash', danger: true });
  } else {
    items.push({ id: 'new', label: 'New Reminder', g: 'plus' }, { id: 'newlist', label: 'New List', g: 'list' });
  }
  const v = await menu(el, items);
  if (!v) return;
  if (v === 'done') { const key = 'list:' + e.list; S.settings.showDone[key] = !S.settings.showDone[key]; save(); render(); }
  if (v.startsWith('sort:')) { S.settings.listSort['list:' + e.list] = v.slice(5); save(); render(); }
  if (v === 'info') listSheet(listOf(e.list));
  if (v === 'delete' && (await deleteList(e.list))) pop();
  if (v === 'new') ACTIONS['new-task']();
  if (v === 'newlist') listSheet(null);
  if (v === 'clear') {
    const n = smartTasks('done').length;
    if (await ask({ title: `Delete ${plural(n, 'completed reminder')}?`, ok: 'Delete', destructive: true })) {
      S.tasks = S.tasks.filter((t) => !t.done);
      save();
      render();
    }
  }
};
ACTIONS['show-done'] = (el) => { S.settings.showDone[el.dataset.v] = true; save(); render(); };

// Ticking: the circle fills, and the task slides away a moment later (tap again to undo).
let tickT = 0;
ACTIONS['task-toggle'] = (el) => {
  const t = taskOf(el.dataset.id);
  if (!t) return;
  const row = el.closest('.task');
  if (t.done) {
    t.done = false; t.doneAt = 0;
    save();
    if (row.classList.contains('ticked')) row.classList.remove('ticked'); else render();
    return;
  }
  buzz(12);
  row.classList.add('ticked');
  if (completeTask(t) === 'next') toast(`Done — next: ${dayName(t.due, true)}`);
  save();
  clearTimeout(tickT);
  tickT = setTimeout(() => { if (cur().s === 'tasks' || cur().s === 'planner') render(); }, 1100);
};
ACTIONS['task-open'] = (el) => taskSheet(taskOf(el.dataset.id));
ACTIONS['task-del'] = (el) => deleteTask(el.dataset.id);
function deleteTask(id) {
  const i = S.tasks.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [t] = S.tasks.splice(i, 1);
  save();
  render();
  undoToast('Reminder deleted', () => { S.tasks.splice(Math.min(i, S.tasks.length), 0, t); });
}
ACTIONS['new-task'] = () => {
  const e = cur();
  const preset = {};
  if (e.s === 'tasks' && e.list) preset.list = e.list;
  if (e.s === 'tasks' && e.smart === 'today') preset.due = todayIso();
  if (UI.tab !== 'planner') goTab('planner', true);
  taskSheet(null, preset);
};

// ---------- Task details sheet ----------
let TS = null; // { d: draft, isNew }
function taskSheet(t, preset = {}) {
  if (t === undefined) return;
  TS = { d: t ? JSON.parse(JSON.stringify(t)) : makeTask(preset), isNew: !t };
  openSheet(taskSheetHtml(), (sh) => {
    mountTaskSheet(sh);
    if (TS.isNew) $('.f-title', sh).focus();
  }, 'tall');
}
function taskSheetHtml() {
  const { d, isNew } = TS;
  const L = listOf(d.list) || S.lists[0];
  const today = todayIso();
  const sat = (() => { let x = today; while (dowMon(x) !== 5) x = isoAdd(x, 1); return x; })();
  const mon = (() => { let x = isoAdd(today, 1); while (dowMon(x) !== 0) x = isoAdd(x, 1); return x; })();
  const chips = [['Today', today], ['Tomorrow', isoAdd(today, 1)], ['Weekend', sat], ['Next Week', mon]]
    .map(([l, v]) => `<button class="chip ${d.due === v ? 'on' : ''}" data-act="task-quick" data-v="${v}">${l}</button>`).join('');
  return `${sheetHead(isNew ? 'New Reminder' : 'Details', '<button data-act="close-sheet">Cancel</button>', `<button class="strong" data-act="task-save" ${d.title.trim() ? '' : 'disabled'}>${isNew ? 'Add' : 'Done'}</button>`)}
  <div class="sheet-body" style="--tint:${L.color}">
    <div class="card form">
      <input class="f-title" name="title" placeholder="Title" value="${esc(d.title)}" autocapitalize="sentences" enterkeyhint="done" maxlength="200">
      <textarea class="f-notes" name="notes" placeholder="Notes" rows="2">${esc(d.notes)}</textarea>
    </div>
    <div class="card form">
      <div class="frow">${tile('calendar', '#FF3B30')}<span class="lbl">Date${d.due ? `<small class="${d.due < today ? 'late' : ''}">${dayName(d.due, true)}</small>` : ''}</span>${toggle('hasDate', !!d.due, 'Date')}</div>
      ${d.due ? `<div class="frow sub"><input type="date" name="due" value="${d.due}"><div class="chips">${chips}</div></div>` : ''}
      <div class="frow">${tile('clock', '#007AFF')}<span class="lbl">Time${d.time ? `<small>${d.time}</small>` : ''}</span>${toggle('hasTime', !!d.time, 'Time')}</div>
      ${d.time ? `<div class="frow sub"><input type="time" name="time" value="${d.time}"></div>` : ''}
      <label class="frow">${tile('repeat', '#8E8E93')}<span class="lbl">Repeat</span><select name="repeat"><option value="">Never</option>${Object.entries(REPEATS).map(([k, v]) => `<option value="${k}" ${d.repeat === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    ${d.due ? notifHint(d.time ? `You'll be reminded at ${d.time}.` : `You'll be reminded at ${S.settings.allDay} on the day.`) : ''}
    <div class="card form">
      <div class="frow col"><span class="frow-top">${tile('bang', '#FF9500')}<span class="lbl">Priority</span></span><div class="seg">${PRIO.map((x, i) => `<button data-act="task-prio" data-v="${i}" class="${d.prio === i ? 'on' : ''}">${x}</button>`).join('')}</div></div>
      <label class="frow">${tile(L.g || 'list', L.color)}<span class="lbl">List</span><select name="list">${S.lists.map((l) => `<option value="${l.id}" ${l.id === d.list ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    </div>
    <h2 class="sec">Subtasks</h2>
    <div class="card form subs">
      ${d.subs.map((s) => `<div class="frow subrow"><button class="chk ${s.done ? 'on' : ''}" data-act="sub-toggle" data-id="${s.id}" aria-label="Done"></button><input name="sub" data-sid="${s.id}" value="${esc(s.title)}" placeholder="Subtask" enterkeyhint="next"><button class="xbtn" data-act="sub-del" data-id="${s.id}" aria-label="Remove">${glyph('x')}</button></div>`).join('')}
      <button class="frow add-sub" data-act="sub-add">${glyph('plus')}<span>Add Subtask</span></button>
    </div>
    ${isNew ? '' : '<button class="danger-btn" data-act="task-del-sheet">Delete Reminder</button>'}
  </div>`;
}
function mountTaskSheet(sh) {
  const d = TS.d;
  const okBtn = $('[data-act="task-save"]', sh);
  sh.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name === 'title') { d.title = t.value; okBtn.disabled = !t.value.trim(); }
    if (t.name === 'notes') d.notes = t.value;
    if (t.name === 'sub') { const s = d.subs.find((x) => x.id === t.dataset.sid); if (s) s.title = t.value; }
  });
  sh.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'hasDate') { d.due = t.checked ? d.due || todayIso() : null; if (!d.due) { d.time = null; d.repeat = null; } redrawTask(); }
    if (t.name === 'hasTime') {
      if (t.checked) { d.due = d.due || todayIso(); const n = new Date(); d.time = d.time || `${pad2(Math.min(23, n.getHours() + 1))}:00`; } else d.time = null;
      redrawTask();
    }
    if (t.name === 'due' && t.value) { d.due = t.value; redrawTask(); }
    if (t.name === 'time' && t.value) { d.time = t.value; redrawTask(); }
    if (t.name === 'repeat') { d.repeat = t.value || null; if (d.repeat && !d.due) d.due = todayIso(); redrawTask(); }
    if (t.name === 'list') { d.list = t.value; redrawTask(); }
  });
  $$('input[name="sub"]', sh).forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ACTIONS['sub-add'](); } }));
  $('.f-title', sh).addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
}
const redrawTask = () => refreshSheet(taskSheetHtml(), mountTaskSheet);
ACTIONS['task-quick'] = (el) => { TS.d.due = el.dataset.v; redrawTask(); };
ACTIONS['task-prio'] = (el) => { TS.d.prio = +el.dataset.v; redrawTask(); };
ACTIONS['sub-add'] = () => {
  const s = { id: uid(), title: '', done: false };
  TS.d.subs.push(s);
  redrawTask();
  const i = $(`input[data-sid="${s.id}"]`, sheet.sh);
  if (i) i.focus();
};
ACTIONS['sub-del'] = (el) => { TS.d.subs = TS.d.subs.filter((s) => s.id !== el.dataset.id); redrawTask(); };
ACTIONS['sub-toggle'] = (el) => { const s = TS.d.subs.find((x) => x.id === el.dataset.id); if (s) { s.done = !s.done; buzz(); redrawTask(); } };
ACTIONS['task-save'] = () => {
  const { d, isNew } = TS;
  d.title = d.title.trim();
  if (!d.title) return;
  d.subs = d.subs.filter((s) => s.title.trim()).map((s) => ({ ...s, title: s.title.trim() }));
  if (d.time && !d.due) d.due = todayIso();
  if (isNew) S.tasks.push(d);
  else {
    const t = taskOf(d.id);
    if (!t) { closeSheet(); return; }
    if (t.due !== d.due || t.time !== d.time) d.snooze = 0;
    Object.assign(t, d);
  }
  save();
  closeSheet();
  render();
  if (isNew && cur().s === 'planner') toast(`Added to ${listOf(d.list).name}`);
};
ACTIONS['task-del-sheet'] = () => { const id = TS.d.id; closeSheet(); deleteTask(id); };

// ---------- Lists ----------
let LS = null;
function listSheet(l) {
  LS = l ? { ...l, isNew: false } : { id: uid(), name: '', color: '#007AFF', g: 'list', isNew: true };
  openSheet(listSheetHtml(), (sh) => { mountListSheet(sh); if (LS.isNew) $('.hero-name', sh).focus(); });
}
function listSheetHtml() {
  return `${sheetHead(LS.isNew ? 'New List' : 'List Info', '<button data-act="close-sheet">Cancel</button>', `<button class="strong" data-act="list-save" ${LS.name.trim() ? '' : 'disabled'}>Done</button>`)}
    <div class="sheet-body">
      <div class="card list-hero"><span class="hero-ic" style="--c:${LS.color}">${glyph(LS.g)}</span><input class="hero-name" value="${esc(LS.name)}" placeholder="List Name" maxlength="40" autocapitalize="words" enterkeyhint="done" style="color:${LS.color}"></div>
      <div class="card pad">${swatches('ls-color', LS.color)}</div>
      <div class="card pad"><div class="icon-grid">${LIST_ICONS.map((g) => `<button class="${g === LS.g ? 'on' : ''}" data-act="ls-icon" data-v="${g}" style="--c:${LS.color}" aria-label="${g}">${glyph(g)}</button>`).join('')}</div></div>
    </div>`;
}
function mountListSheet(sh) {
  const i = $('.hero-name', sh);
  i.addEventListener('input', () => { LS.name = i.value; $('[data-act="list-save"]', sh).disabled = !i.value.trim(); });
  i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); });
}
ACTIONS['ls-color'] = (el) => { LS.color = el.dataset.v; refreshSheet(listSheetHtml(), mountListSheet); };
ACTIONS['ls-icon'] = (el) => { LS.g = el.dataset.v; refreshSheet(listSheetHtml(), mountListSheet); };
ACTIONS['list-save'] = () => {
  const name = LS.name.trim();
  if (!name) return;
  const { isNew, ...l } = LS;
  l.name = name;
  if (isNew) S.lists.push(l); else Object.assign(listOf(l.id) || {}, l);
  save();
  closeSheet();
  render();
};
ACTIONS['new-list'] = () => listSheet(null);
ACTIONS['list-edit'] = (el) => listSheet(listOf(el.dataset.id));
async function deleteList(id) {
  const L = listOf(id);
  if (!L || S.lists.length < 2) return false;
  const n = S.tasks.filter((t) => t.list === id).length;
  const ok = await ask({ title: `Delete “${L.name}”?`, msg: n ? `This will delete all ${plural(n, 'reminder')} in this list.` : '', ok: 'Delete List', destructive: true });
  if (!ok) { render(); return false; }
  S.tasks = S.tasks.filter((t) => t.list !== id);
  S.lists = S.lists.filter((l) => l.id !== id);
  save();
  return true;
}
ACTIONS['list-del'] = async (el) => { if (await deleteList(el.dataset.id)) render(); };
