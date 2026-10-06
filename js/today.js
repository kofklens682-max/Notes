'use strict';
/* Today, at the top of the Notes tab: what needs you now. Reminders due today or overdue (tick them
   here), habits still to do, the nearest deadline with its countdown, checklists you haven't
   finished, and flashcard words due for review. Each part only shows when it has something in it,
   so on a quiet day this is just the greeting. Uses planner.js (tasks), habits and cards.js. */

const TODAY_MAX = 4;
// How a reminder's time reads: "in 25 min", "in 2 h", "18:00", "Overdue".
function dueLabel(t) {
  if (isOverdue(t)) return '<span class="late">Overdue</span>';
  if (!t.time) return 'Today';
  const ms = atMs(t.due, t.time) - Date.now();
  if (ms < 60 * 60e3) return `in ${Math.max(1, Math.round(ms / 60e3))} min`;
  if (ms < 3 * 3600e3) return `in ${Math.round(ms / 3600e3)} h`;
  return t.time;
}
// Notes with a checklist that isn't finished, changed in the last two weeks.
function notesToFinish() {
  const since = Date.now() - 14 * 864e5;
  return S.notes.filter((n) => !n.locked && n.todo && n.todo[1] > n.todo[0] && n.edited > since).sort((a, b) => b.edited - a.edited);
}
function todayHtml() {
  const today = todayIso();
  const due = S.tasks.filter((t) => !t.done && t.due && t.due <= today).sort(SORTS.due);
  const habits = S.habits.filter((h) => habitOn(h, today) && !habitDone(h, today));
  const dl = S.tasks.filter((t) => t.deadline && !t.done && t.due && t.due > today && daysFromToday(t.due) <= 30).sort(SORTS.due)[0];
  const finish = notesToFinish().slice(0, 2);
  const words = dueCardCount();
  let html = '';
  if (due.length || habits.length) {
    const rows = due.slice(0, TODAY_MAX).map((t) => {
      const L = listOf(t.list) || S.lists[0];
      return `<div class="task td-row" style="--c:${L.color}" data-id="${t.id}"><button class="chk" data-act="task-toggle" data-id="${t.id}" aria-label="Complete"></button><button class="t-main" data-act="task-open" data-id="${t.id}"><span class="t-title">${esc(t.title || 'Reminder')}</span></button><span class="td-r">${dueLabel(t)}</span></div>`;
    }).join('');
    const more = due.length > TODAY_MAX ? `<button class="td-more" data-act="tab" data-tab="planner">${due.length - TODAY_MAX} more in Planner</button>` : '';
    const hab = habits.length ? `<button class="td-line" data-act="td-habits">${glyph('flame', 'td-ic')}<span>${habits.slice(0, 3).map((h) => esc(h.name)).join(' · ')}${habits.length > 3 ? ` +${habits.length - 3}` : ''}</span><span class="td-r">habits</span></button>` : '';
    html += `<div class="td-card"><h3>${glyph('bell', 'inl')}Today</h3><div class="card tasks td-list">${rows}${hab}</div>${more}</div>`;
  }
  if (dl) {
    const n = daysFromToday(dl.due), c = n <= 3 ? 'var(--red)' : n <= 14 ? 'var(--orange)' : 'var(--blue)';
    html += `<button class="td-card td-dl" data-act="task-open" data-id="${dl.id}" style="--dc:${c}"><span class="dl-r">${ring(clamp(1 - n / 30, 0.05, 1), 46, 4.5)}<span><b>${n}</b><small>${n === 1 ? 'day' : 'days'}</small></span></span><span class="td-dlt"><b>${esc(dl.title || 'Deadline')}</b><span>Due ${dayName(dl.due, true)}</span></span></button>`;
  }
  if (finish.length) {
    html += `<div class="td-card"><h3>${glyph('checklist', 'inl')}To finish</h3><div class="card">${finish.map((n) => `<button class="td-line" data-act="open-note" data-id="${n.id}"><span>${esc(noteTitle(n))}</span><span class="td-r">${n.todo[1] - n.todo[0]} left</span></button>`).join('')}</div></div>`;
  }
  if (words) {
    html += `<div class="td-card td-words"><h3>${glyph('cards', 'inl')}Words to review</h3><div class="card pad"><p>${plural(words, 'word')} ${words === 1 ? 'is' : 'are'} due today</p><button class="td-btn" data-act="cards-due">Review · ${Math.max(1, Math.round(words / 6))} min</button></div></div>`;
  }
  return html ? `<div class="today">${html}</div>` : '';
}
// What Today shows, in short (the Notes screen is drawn again when this changes).
const todaySig = () => {
  const today = todayIso();
  return S.tasks.filter((t) => !t.done && t.due && (t.due <= today || t.deadline)).map((t) => t.id + t.due + t.time + t.title).join() + '|'
    + S.habits.map((h) => h.id + (habitOn(h, today) && !habitDone(h, today) ? 1 : 0) + h.name).join() + '|' + dueCardCount() + '|' + greeting() + '|' + new Date().getHours();
};
ACTIONS['td-habits'] = () => { goTab('planner'); setTimeout(() => { if (UI.tab === 'planner' && cur().s === 'planner') push({ s: 'habits' }); }, 300); };
