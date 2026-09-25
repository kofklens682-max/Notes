'use strict';
/* Habits: things you repeat (every day or on chosen days), optionally several times a day
   (e.g. 8 glasses of water), with streaks, a history calendar and an optional reminder.
   A "sleep" habit logs bedtime and wake-up instead, and shows them as line graphs. */

const habitOf = (id) => S.habits.find((h) => h.id === id);
const HABIT_ICONS = ['flame', 'drop', 'book', 'dumbbell', 'run', 'moon', 'sun', 'heart', 'pill', 'leaf', 'apple', 'coffee', 'music', 'gradcap', 'pencil', 'sparkles', 'star', 'target', 'wallet', 'phone', 'users', 'house', 'paw', 'bell'];
const HABIT_IDEAS = [
  { name: 'Drink water', g: 'drop', c: '#32ADE6', target: 8 },
  { name: 'Read 20 minutes', g: 'book', c: '#FF9500', target: 1 },
  { name: 'Exercise', g: 'dumbbell', c: '#FF3B30', target: 1 },
  { name: 'Walk 8,000 steps', g: 'run', c: '#34C759', target: 1 },
  { name: 'Learn 10 new words', g: 'gradcap', c: '#5856D6', target: 1 },
  { name: 'Sleep', g: 'moon', c: '#5856D6', target: 1, kind: 'sleep' },
];
function scheduleText(h) {
  const d = h.days.join('');
  if (d === '1111111') return 'Every day';
  if (d === '1111100') return 'Weekdays';
  if (d === '0000011') return 'Weekends';
  return WK3.filter((_, i) => h.days[i]).join(', ');
}
function streaks(h) {
  const today = todayIso();
  let cur = 0, d = habitDone(h, today) ? today : isoAdd(today, -1), guard = 0;
  while (d >= h.start && guard++ < 4000) {
    if (habitOn(h, d)) { if (habitDone(h, d)) cur++; else break; }
    d = isoAdd(d, -1);
  }
  let best = 0, run = 0;
  d = h.start; guard = 0;
  while (d <= today && guard++ < 4000) {
    if (habitOn(h, d)) {
      if (habitDone(h, d)) { run++; best = Math.max(best, run); } else if (d !== today) run = 0;
    }
    d = isoAdd(d, 1);
  }
  return { cur, best };
}
// Share of scheduled days done in the last `n` days (today counts only once it's done).
function rate(h, n = 30) {
  const today = todayIso();
  let on = 0, done = 0;
  for (let i = 0; i < n; i++) {
    const d = isoAdd(today, -i);
    if (d < h.start) break;
    if (!habitOn(h, d)) continue;
    if (d === today && !habitDone(h, d)) continue;
    on++;
    if (habitDone(h, d)) done++;
  }
  return on ? Math.round((done / on) * 100) : 0;
}

// ---------- Habits list ----------
function weekOf(day) {
  const mon = isoAdd(day, -dowMon(day));
  return Array.from({ length: 7 }, (_, i) => isoAdd(mon, i));
}
function habitRow(h, day) {
  const cnt = habitCount(h, day), tg = h.target, done = cnt >= tg;
  const st = streaks(h);
  const t = h.kind === 'sleep' ? h.times[day] : null;
  const meta = t ? [`<span>${t.bed} → ${t.wake} · ${durText(sleepMins(t))}</span>`]
    : h.kind === 'sleep' ? ['<span>Tap the circle to log the night</span>']
      : [st.cur > 1 ? `<span class="streak">${glyph('flame', 'inl')}${st.cur}-day streak</span>` : `<span>${scheduleText(h)}</span>`];
  if (tg > 1) meta.push(`<span>${cnt} of ${tg}</span>`);
  if (h.remind) meta.push(`<span>${glyph('bell', 'inl')}${h.remind}</span>`);
  return swipeRow(`<div class="habit${done ? ' is-done' : ''}" style="--c:${h.c}">
      <button class="h-main" data-act="h-open" data-id="${h.id}">${tile(h.g, h.c)}<span class="h-txt"><b>${esc(h.name)}</b><span class="h-meta">${meta.join('')}</span></span></button>
      <button class="h-btn" data-act="h-tick" data-id="${h.id}" data-day="${day}" aria-label="${h.kind === 'sleep' ? (done ? 'Change the night' : 'Log the night') : done ? 'Done — tap to undo' : tg > 1 ? `Add one (${cnt} of ${tg})` : 'Mark as done'}">${ring(cnt / tg, 42, 3.6)}${done ? glyph('check') : tg > 1 ? `<small>${cnt}</small>` : h.kind === 'sleep' ? glyph('moon', 'h-moon') : ''}</button>
    </div>`, { right: swBtn('h-edit', h.id, 'Edit', 'pencil', 'var(--gray)') + swBtn('h-del', h.id, 'Delete', 'trash', 'var(--red)') });
}
SCREENS.habits = {
  tint: () => '#FF9500',
  render(e) {
    const today = todayIso();
    const day = e.day && e.day <= today ? e.day : today;
    const week = weekOf(day);
    const strip = `<div class="week">
      <button class="wk-arrow" data-act="h-week" data-v="-7" aria-label="Previous week">${glyph('chevL')}</button>
      ${week.map((d, i) => {
        const hs = S.habits.filter((h) => habitOn(h, d));
        const frac = hs.length ? hs.filter((h) => habitDone(h, d)).length / hs.length : 0;
        return `<button class="wd${d === day ? ' sel' : ''}${d === today ? ' today' : ''}" data-act="h-day" data-v="${d}" ${d > today ? 'disabled' : ''} aria-label="${dayName(d, true)}"><span class="wd-l">${WK1[i]}</span><span class="wd-r">${ring(frac, 36, 3)}<b>${parseD(d).getDate()}</b></span></button>`;
      }).join('')}
      <button class="wk-arrow" data-act="h-week" data-v="7" ${week[6] >= today ? 'disabled' : ''} aria-label="Next week">${glyph('chevR')}</button>
    </div>`;
    const on = S.habits.filter((h) => habitOn(h, day)), off = S.habits.filter((h) => !habitOn(h, day));
    let body = strip;
    if (!S.habits.length) {
      body += `${empty('flame', 'Build a routine', 'Small things done every day add up. Pick an idea or tap + to make your own.')}
        <div class="ideas">${HABIT_IDEAS.map((x, i) => `<button class="chip" data-act="h-idea" data-v="${i}" style="--c:${x.c}">${glyph(x.g)}${esc(x.name)}</button>`).join('')}</div>`;
    } else {
      const doneN = on.filter((h) => habitDone(h, day)).length;
      body += `<h2 class="sec">${day === today ? 'Today' : esc(dayName(day, true))}${on.length ? `<span class="n">${doneN}/${on.length}</span>` : ''}</h2>`;
      body += on.length ? `<div class="card">${on.map((h) => habitRow(h, day)).join('')}</div>` : '<div class="hint-empty">Nothing planned for this day</div>';
      if (off.length) body += `<h2 class="sec">Not planned for this day</h2><div class="card dim">${off.map((h) => `<button class="row" data-act="h-open" data-id="${h.id}">${tile(h.g, h.c)}<span class="lbl">${esc(h.name)}</span><span class="val">${scheduleText(h)}</span>${glyph('chevR', 'chev')}</button>`).join('')}</div>`;
    }
    const all = S.habits.filter((h) => habitOn(h, today));
    const sub = all.length ? `${all.filter((h) => habitDone(h, today)).length} of ${all.length} done today` : '';
    return page({ title: 'Habits', back: 'Planner', body, sub });
  },
  fab: () => ({ g: 'plus', act: 'h-new', label: 'New habit' }),
};
ACTIONS['open-habits'] = () => push({ s: 'habits' });
ACTIONS['h-day'] = (el) => { cur().day = el.dataset.v; render(); };
ACTIONS['h-week'] = (el) => {
  const e = cur(), today = todayIso();
  let d = isoAdd(e.day || today, +el.dataset.v);
  if (d > today) d = today;
  e.day = d;
  render();
};
ACTIONS['h-tick'] = (el) => {
  const h = habitOf(el.dataset.id);
  if (!h) return;
  const day = el.dataset.day || todayIso();
  if (h.kind === 'sleep') { sleepSheet(h, day); return; }
  const cnt = habitCount(h, day);
  if (cnt >= h.target) {
    const before = cnt;
    delete h.log[day];
    save();
    render();
    if (h.target > 1) undoToast('Reset to 0', () => { h.log[day] = before; });
    return;
  }
  h.log[day] = cnt + 1;
  if (day < h.start) h.start = day;
  buzz(h.log[day] >= h.target ? [12, 40, 18] : 10);
  save();
  render();
  if (h.log[day] >= h.target && day === todayIso()) {
    const all = S.habits.filter((x) => habitOn(x, day));
    if (all.every((x) => habitDone(x, day))) toast('All habits done today — well done!');
  }
};
ACTIONS['h-open'] = (el) => push({ s: 'habit', id: el.dataset.id });
ACTIONS['h-new'] = () => habitSheet(null);
ACTIONS['h-idea'] = (el) => { const x = HABIT_IDEAS[+el.dataset.v]; habitSheet(null, { name: x.name, g: x.g, c: x.c, target: x.target, kind: x.kind || 'check' }); };
ACTIONS['h-edit'] = (el) => habitSheet(habitOf(el.dataset.id));
ACTIONS['h-edit-cur'] = () => habitSheet(habitOf(cur().id));
async function deleteHabit(id) {
  const h = habitOf(id);
  if (!h) return false;
  const ok = await ask({ title: `Delete “${h.name}”?`, msg: 'Its history and streak will be lost.', ok: 'Delete Habit', destructive: true });
  if (!ok) { render(); return false; }
  S.habits = S.habits.filter((x) => x.id !== id);
  save();
  return true;
}
ACTIONS['h-del'] = async (el) => { if (await deleteHabit(el.dataset.id)) render(); };

// ---------- One habit ----------
function heatmap(h) {
  const today = todayIso(), weeks = 17;
  const start = isoAdd(today, -dowMon(today) - (weeks - 1) * 7);
  let cols = '', months = '';
  let lastM = -1;
  for (let w = 0; w < weeks; w++) {
    const first = isoAdd(start, w * 7), m = parseD(first).getMonth();
    months += `<span>${m !== lastM ? MON[m] : ''}</span>`;
    lastM = m;
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = isoAdd(first, i);
      if (d > today) { cells += '<i class="fut"></i>'; continue; }
      const f = Math.min(1, habitCount(h, d) / h.target);
      const cls = !h.days[dowMon(d)] ? 'off' : f >= 1 ? 'full' : f > 0 ? 'part' : '';
      cells += `<button class="${cls}${d === today ? ' now' : ''}" style="${f > 0 && f < 1 ? `--f:${(0.25 + f * 0.6).toFixed(2)}` : ''}" data-act="h-cell" data-v="${d}" aria-label="${dayName(d, true)}: ${f >= 1 ? 'done' : 'not done'}"></button>`;
    }
    cols += `<div class="hm-col">${cells}</div>`;
  }
  return `<div class="hm"><div class="hm-months">${months}</div><div class="hm-body"><div class="hm-days">${WK1.map((x, i) => `<span>${i % 2 === 0 ? x : ''}</span>`).join('')}</div><div class="hm-grid">${cols}</div></div></div>`;
}
const habitInfo = (h, goal) => `<div class="card">
    <div class="row static">${glyph('repeat', 'row-g')}<span class="lbl">Repeat</span><span class="val">${scheduleText(h)}</span></div>
    ${goal ? `<div class="row static">${glyph('target', 'row-g')}<span class="lbl">Goal</span><span class="val">${h.target > 1 ? `${h.target} times a day` : 'Once a day'}</span></div>` : ''}
    <div class="row static">${glyph('bell', 'row-g')}<span class="lbl">Reminder</span><span class="val">${h.remind || 'Off'}</span></div>
    <div class="row static">${glyph('calendar', 'row-g')}<span class="lbl">Started</span><span class="val">${dayName(h.start, true)}</span></div>
  </div>
  <button class="danger-btn" data-act="h-del-cur">Delete Habit</button>`;
SCREENS.habit = {
  tint: (e) => (habitOf(e.id) || {}).c,
  mount(el) { bindCharts(el); },
  render(e) {
    const h = habitOf(e.id);
    if (!h) return page({ title: 'Habit', back: 'Habits', body: empty('flame', 'This habit was deleted') });
    if (h.kind === 'sleep') return page({ title: h.name, back: 'Habits', right: navText('h-edit-cur', 'Edit'), body: sleepBody(h, e) + habitInfo(h, false) });
    const today = todayIso(), st = streaks(h), cnt = habitCount(h, today), on = habitOn(h, today);
    const total = Object.keys(h.log).filter((d) => habitDone(h, d)).length;
    const todayCard = on ? `<div class="card h-today">
        <button class="h-big" data-act="h-tick" data-id="${h.id}" data-day="${today}">${ring(cnt / h.target, 64, 5)}${cnt >= h.target ? glyph('check') : `<b>${cnt}</b>`}</button>
        <div class="h-today-txt"><b>${cnt >= h.target ? 'Done for today' : h.target > 1 ? `${cnt} of ${h.target} today` : 'Not done yet today'}</b><span>${cnt >= h.target ? 'Tap the circle to undo' : 'Tap the circle when you do it'}</span></div>
        ${h.target > 1 ? `<button class="round-btn" data-act="h-minus" data-id="${h.id}" ${cnt ? '' : 'disabled'} aria-label="One less">${glyph('minus')}</button>` : ''}
      </div>` : `<div class="hint-empty">Not planned for today (${scheduleText(h)})</div>`;
    const body = `${todayCard}
      <div class="stats">
        <div class="stat"><b>${st.cur}</b><span>Current streak</span></div>
        <div class="stat"><b>${st.best}</b><span>Best streak</span></div>
        <div class="stat"><b>${rate(h)}%</b><span>Last 30 days</span></div>
        <div class="stat"><b>${total}</b><span>Days done</span></div>
      </div>
      <h2 class="sec">History<span class="sec-note">Tap a day to change it</span></h2>
      <div class="card pad">${heatmap(h)}</div>
      ${habitInfo(h, true)}`;
    return page({ title: h.name, back: 'Habits', right: navText('h-edit-cur', 'Edit'), body });
  },
};
ACTIONS['h-minus'] = (el) => {
  const h = habitOf(el.dataset.id), d = todayIso();
  if (!h || !habitCount(h, d)) return;
  h.log[d] = habitCount(h, d) - 1;
  if (!h.log[d]) delete h.log[d];
  save();
  render();
};
ACTIONS['h-cell'] = (el) => {
  const h = habitOf(cur().id), d = el.dataset.v;
  if (!h) return;
  if (habitDone(h, d)) delete h.log[d]; else h.log[d] = h.target;
  if (d < h.start) h.start = d;
  buzz();
  save();
  render();
};
ACTIONS['h-del-cur'] = async () => { if (await deleteHabit(cur().id)) pop(); };

// ---------- Sleep ----------
// Each morning holds { bed, wake }. Bedtimes are compared on a scale starting at noon, so
// 23:30 and 00:30 sit next to each other instead of 23 hours apart.
const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
const clockOf = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`; };
const bedScale = (t) => (toMin(t) - 720 + 1440) % 1440;
const bedClock = (v) => clockOf(v + 720);
const sleepMins = (t) => (((toMin(t.wake) - toMin(t.bed)) % 1440) + 1440) % 1440;
const durText = (m) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
const durShort = (m) => `${Math.floor(m / 60)}h ${pad2(Math.round(m % 60))}m`;
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
// Your usual times (from the last week you logged), to prefill the sheet.
function typicalTimes(h) {
  const last = Object.keys(h.times).sort().slice(-7).map((d) => h.times[d]);
  if (!last.length) return { bed: '23:00', wake: '07:00' };
  const r5 = (m) => Math.round(m / 5) * 5;
  return { bed: bedClock(r5(avg(last.map((t) => bedScale(t.bed))))), wake: clockOf(r5(avg(last.map((t) => toMin(t.wake))))) };
}
function sleepStats(h, dates) {
  const ts = dates.map((d) => h.times[d]).filter(Boolean);
  if (!ts.length) return { n: 0 };
  const beds = ts.map((t) => bedScale(t.bed)), mean = avg(beds);
  const spread = Math.round(Math.sqrt(avg(beds.map((b) => (b - mean) ** 2))));
  return { n: ts.length, bed: bedClock(mean), wake: clockOf(avg(ts.map((t) => toMin(t.wake)))), dur: avg(ts.map(sleepMins)), spread };
}
const shortDay = (d) => { const x = parseD(d); return `${x.getDate()} ${MON[x.getMonth()]}`; };
// One line graph: a single series of times of day, later times higher up.
function timeChart(title, color, dates, vals, fmt) {
  const W = 320, H = 128, L = 40, R = 8, T = 8, B = 20;
  const have = vals.map((v, i) => (v == null ? null : { i, v })).filter(Boolean);
  if (!have.length) return '';
  let lo = Math.min(...have.map((p) => p.v)), hi = Math.max(...have.map((p) => p.v));
  const step = [15, 30, 60, 120, 180].find((s) => Math.max(hi - lo, 20) / s <= 3) || 240;
  lo = Math.floor((lo - step * 0.3) / step) * step;
  hi = Math.ceil((hi + step * 0.3) / step) * step;
  if (hi - lo < step * 2) hi = lo + step * 2;
  const n = dates.length;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  let grid = '';
  for (let v = lo; v <= hi; v += step) grid += `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="c-ax" x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`;
  const xl = [...new Set([0, Math.round((n - 1) / 2), n - 1])].map((i, k, a) => `<text class="c-ax" x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="${k === 0 ? 'start' : k === a.length - 1 ? 'end' : 'middle'}">${i === n - 1 ? 'Today' : shortDay(dates[i])}</text>`).join('');
  let path = '', prev = -2;
  for (const p of have) { path += `${p.i === prev + 1 ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`; prev = p.i; }
  const dots = have.map((p) => `<circle class="c-dot" cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4"/>`).join('');
  const pts = have.map((p) => ({ x: +x(p.i).toFixed(1), y: +y(p.v).toFixed(1), t: `${dayName(dates[p.i])} · ${fmt(p.v)}` }));
  const mean = fmt(avg(have.map((p) => p.v)));
  return `<div class="c-head"><i class="c-key" style="--k:${color}"></i>${esc(title)}<span>average ${mean}</span></div>
    <div class="chart" data-w="${W}" data-pts='${esc(JSON.stringify(pts))}' style="--k:${color}">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} over the last ${n} days, average ${mean}">${grid}${xl}
        <path class="c-line" d="${path}"/>${dots}
        <line class="c-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="c-hi" r="5.5" visibility="hidden"/>
      </svg><div class="c-tip" hidden></div>
    </div>`;
}
// Touch or hover a graph to read a night's exact time.
function bindCharts(root) {
  $$('.chart', root).forEach((c) => {
    const pts = JSON.parse(c.dataset.pts), W = +c.dataset.w;
    const svg = $('svg', c), cross = $('.c-cross', c), hi = $('.c-hi', c), tip = $('.c-tip', c);
    let hideT = 0;
    const show = (ev) => {
      const r = svg.getBoundingClientRect(), sx = ((ev.clientX - r.left) * W) / r.width;
      const p = pts.reduce((a, b) => (Math.abs(b.x - sx) < Math.abs(a.x - sx) ? b : a));
      cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x); cross.setAttribute('visibility', 'visible');
      hi.setAttribute('cx', p.x); hi.setAttribute('cy', p.y); hi.setAttribute('visibility', 'visible');
      tip.textContent = p.t;
      tip.hidden = false;
      const px = (p.x * r.width) / W, half = tip.offsetWidth / 2;
      tip.style.left = `${clamp(px, half, r.width - half)}px`;
      clearTimeout(hideT);
    };
    const hide = (delay) => { clearTimeout(hideT); hideT = setTimeout(() => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); hi.setAttribute('visibility', 'hidden'); }, delay); };
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse' || ev.buttons) show(ev); });
    svg.addEventListener('pointerup', (ev) => hide(ev.pointerType === 'mouse' ? 0 : 1800));
    svg.addEventListener('pointerleave', () => hide(0));
    svg.addEventListener('pointercancel', () => hide(0));
  });
}
function sleepBody(h, e) {
  const today = todayIso(), range = e.range || 14;
  const t = h.times[today];
  const logCard = `<div class="card h-today">
      <button class="h-big" data-act="h-tick" data-id="${h.id}" data-day="${today}" aria-label="${t ? 'Change last night' : 'Log last night'}">${ring(t ? 1 : 0, 64, 5)}${glyph(t ? 'check' : 'moon')}</button>
      <div class="h-today-txt"><b>${t ? `${t.bed} → ${t.wake}` : 'Last night'}</b><span>${t ? `${durText(sleepMins(t))} of sleep · tap to change` : 'Tap the circle to log when you slept'}</span></div>
    </div>`;
  const dates = Array.from({ length: range }, (_, i) => isoAdd(today, i - range + 1));
  const s = sleepStats(h, dates);
  if (!s.n) return `${logCard}<div class="hint-empty">Log a few nights to see your graph</div>`;
  const rows = dates.filter((d) => h.times[d]).map((d) => `<tr><td>${dayName(d, true)}</td><td>${h.times[d].bed}</td><td>${h.times[d].wake}</td></tr>`).join('');
  return `${logCard}
    <div class="card pad charts">
      <div class="seg c-range">${[[14, '2 weeks'], [30, 'Month']].map(([v, l]) => `<button data-act="sl-range" data-v="${v}" class="${range === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${timeChart('Went to bed', 'var(--bed)', dates, dates.map((d) => (h.times[d] ? bedScale(h.times[d].bed) : null)), bedClock)}
      ${timeChart('Woke up', 'var(--wake)', dates, dates.map((d) => (h.times[d] ? toMin(h.times[d].wake) : null)), clockOf)}
      <table class="sr-only"><caption>Sleep, last ${range} days</caption><tr><th>Morning</th><th>Went to bed</th><th>Woke up</th></tr>${rows}</table>
    </div>
    <div class="stats">
      <div class="stat"><b>${durShort(s.dur)}</b><span>Average sleep</span></div>
      <div class="stat"><b>${s.n > 1 ? `±${s.spread} min` : '—'}</b><span>Bedtime varies by</span></div>
    </div>`;
}
ACTIONS['sl-range'] = (el) => { cur().range = +el.dataset.v; render(); };
let SL = null;
function sleepSheet(h, day) {
  const t = h.times[day], typ = typicalTimes(h);
  SL = { id: h.id, day, bed: t ? t.bed : typ.bed, wake: t ? t.wake : typ.wake, had: !!t };
  openSheet(sleepSheetHtml(), mountSleepSheet);
}
function sleepSheetHtml() {
  return `${sheetHead('Sleep', '<button data-act="close-sheet">Cancel</button>', '<button class="strong" data-act="sl-save">Save</button>')}
    <div class="sheet-body">
      <div class="card form">
        <label class="frow">${tile('moon', 'var(--bed)')}<span class="lbl">Went to bed</span><input type="time" name="bed" value="${SL.bed}" required></label>
        <label class="frow">${tile('sun', 'var(--wake)')}<span class="lbl">Woke up</span><input type="time" name="wake" value="${SL.wake}" required></label>
        <label class="frow">${tile('calendar', '#8E8E93')}<span class="lbl">Morning of</span><input type="date" name="day" value="${SL.day}" max="${todayIso()}" required></label>
      </div>
      <div class="hint-line sl-dur">${durText(sleepMins(SL))} of sleep</div>
      ${SL.had ? '<button class="danger-btn" data-act="sl-del">Remove This Night</button>' : ''}
    </div>`;
}
function mountSleepSheet(sh) {
  sh.addEventListener('change', (e) => {
    const t = e.target;
    if ((t.name === 'bed' || t.name === 'wake') && t.value) { SL[t.name] = t.value; $('.sl-dur', sh).textContent = `${durText(sleepMins(SL))} of sleep`; }
    if (t.name === 'day' && t.value && t.value <= todayIso()) {
      const h = habitOf(SL.id), had = h && h.times[t.value];
      SL.day = t.value;
      SL.had = !!had;
      if (had) { SL.bed = had.bed; SL.wake = had.wake; }
      refreshSheet(sleepSheetHtml(), mountSleepSheet);
    }
  });
}
ACTIONS['sl-save'] = () => {
  const h = habitOf(SL.id);
  if (!h) { closeSheet(); return; }
  h.times[SL.day] = { bed: SL.bed, wake: SL.wake };
  h.log[SL.day] = 1;
  if (SL.day < h.start) h.start = SL.day;
  buzz();
  save();
  closeSheet();
  render();
};
ACTIONS['sl-del'] = () => {
  const h = habitOf(SL.id);
  if (h) { delete h.times[SL.day]; delete h.log[SL.day]; save(); }
  closeSheet();
  render();
};

// ---------- New / edit habit ----------
let HS = null;
function habitSheet(h, preset = {}) {
  HS = h ? { ...h, days: [...h.days], isNew: false }
    : { id: uid(), name: '', g: 'flame', c: '#FF9500', kind: 'check', times: {}, days: [1, 1, 1, 1, 1, 1, 1], target: 1, remind: null, log: {}, start: todayIso(), isNew: true, ...preset };
  openSheet(habitSheetHtml(), (sh) => { mountHabitSheet(sh); if (HS.isNew && !HS.name) $('.hero-name', sh).focus(); }, 'tall');
}
function habitSheetHtml() {
  const d = HS.days.join('');
  const preset = (v, l) => `<button class="chip ${d === v ? 'on' : ''}" data-act="hs-days" data-v="${v}">${l}</button>`;
  return `${sheetHead(HS.isNew ? 'New Habit' : 'Edit Habit', '<button data-act="close-sheet">Cancel</button>', `<button class="strong" data-act="hs-save" ${HS.name.trim() && HS.days.some(Boolean) ? '' : 'disabled'}>${HS.isNew ? 'Add' : 'Done'}</button>`)}
    <div class="sheet-body" style="--tint:${HS.c}">
      <div class="card list-hero"><span class="hero-ic sq" style="--c:${HS.c}">${glyph(HS.g)}</span><input class="hero-name" value="${esc(HS.name)}" placeholder="Habit name" maxlength="50" autocapitalize="sentences" enterkeyhint="done" style="color:${HS.c}"></div>
      <div class="card pad">${swatches('hs-color', HS.c)}</div>
      <div class="card pad"><div class="icon-grid">${HABIT_ICONS.map((g) => `<button class="${g === HS.g ? 'on' : ''}" data-act="hs-icon" data-v="${g}" style="--c:${HS.c}" aria-label="${g}">${glyph(g)}</button>`).join('')}</div></div>
      <h2 class="sec">Repeat</h2>
      <div class="card pad">
        <div class="days">${WK3.map((w, i) => `<button class="${HS.days[i] ? 'on' : ''}" data-act="hs-day" data-v="${i}" aria-pressed="${!!HS.days[i]}" aria-label="${w}">${WK1[i]}</button>`).join('')}</div>
        <div class="chips">${preset('1111111', 'Every day')}${preset('1111100', 'Weekdays')}${preset('0000011', 'Weekends')}</div>
      </div>
      <div class="card form">
        <div class="frow">${tile('moon', '#5856D6')}<span class="lbl">Log bedtime &amp; wake-up</span>${toggle('hsSleep', HS.kind === 'sleep', 'Log bedtime and wake-up')}</div>
        ${HS.kind === 'sleep' ? '' : `<div class="frow">${tile('target', '#FF9500')}<span class="lbl">Goal<small>${HS.target > 1 ? `${HS.target} times a day` : 'Once a day'}</small></span>
          <div class="stepper"><button data-act="hs-target" data-v="-1" ${HS.target <= 1 ? 'disabled' : ''} aria-label="Fewer">${glyph('minus')}</button><b>${HS.target}</b><button data-act="hs-target" data-v="1" ${HS.target >= 50 ? 'disabled' : ''} aria-label="More">${glyph('plus')}</button></div></div>`}
        <div class="frow">${tile('bell', '#FF3B30')}<span class="lbl">Reminder${HS.remind ? `<small>Every planned day at ${HS.remind}</small>` : ''}</span>${toggle('hsRemind', !!HS.remind, 'Reminder')}</div>
        ${HS.remind ? `<div class="frow sub"><input type="time" name="hsTime" value="${HS.remind}"></div>` : ''}
      </div>
      ${HS.remind ? notifHint('') : ''}
      ${HS.isNew ? '' : '<button class="danger-btn" data-act="hs-del">Delete Habit</button>'}
    </div>`;
}
function mountHabitSheet(sh) {
  const name = $('.hero-name', sh);
  name.addEventListener('input', () => { HS.name = name.value; $('[data-act="hs-save"]', sh).disabled = !HS.name.trim() || !HS.days.some(Boolean); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  sh.addEventListener('change', (e) => {
    if (e.target.name === 'hsSleep') { HS.kind = e.target.checked ? 'sleep' : 'check'; if (HS.kind === 'sleep') HS.target = 1; redrawHabit(); }
    if (e.target.name === 'hsRemind') { HS.remind = e.target.checked ? HS.remind || '20:00' : null; redrawHabit(); }
    if (e.target.name === 'hsTime' && e.target.value) { HS.remind = e.target.value; redrawHabit(); }
  });
}
const redrawHabit = () => refreshSheet(habitSheetHtml(), mountHabitSheet);
ACTIONS['hs-color'] = (el) => { HS.c = el.dataset.v; redrawHabit(); };
ACTIONS['hs-icon'] = (el) => { HS.g = el.dataset.v; redrawHabit(); };
ACTIONS['hs-day'] = (el) => { const i = +el.dataset.v; HS.days[i] = HS.days[i] ? 0 : 1; redrawHabit(); };
ACTIONS['hs-days'] = (el) => { HS.days = el.dataset.v.split('').map(Number); redrawHabit(); };
ACTIONS['hs-target'] = (el) => { HS.target = clamp(HS.target + +el.dataset.v, 1, 50); redrawHabit(); };
ACTIONS['hs-save'] = () => {
  const { isNew, ...h } = HS;
  h.name = h.name.trim();
  if (!h.name || !h.days.some(Boolean)) return;
  h.times = h.times || {};
  if (h.kind === 'sleep') h.target = 1;
  if (isNew) S.habits.push(h); else Object.assign(habitOf(h.id) || {}, h);
  save();
  closeSheet();
  render();
};
ACTIONS['hs-del'] = async () => {
  const id = HS.id;
  closeSheet();
  if (await deleteHabit(id)) { if (cur().s === 'habit') pop(); else render(); }
};
