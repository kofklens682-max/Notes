'use strict';
/* Shared by the page and the service worker: dates, repeating tasks, habits, which reminders
   are due, what "Done" / "In 10 min" on a notification does, and telling the reminder server
   when to wake the phone. The server only ever receives times, never what the reminder says:
   the phone looks up the text itself when it is woken. */

const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayIso = () => iso(new Date());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isoAdd = (s, n) => iso(addDays(parseD(s), n));
const dowMon = (s) => (parseD(s).getDay() + 6) % 7; // Monday = 0 … Sunday = 6
const atMs = (date, hm) => {
  const [h, m] = (hm || '09:00').split(':').map(Number);
  const d = parseD(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
};
const firstLine = (s) => String(s || '').split('\n').map((x) => x.trim()).find(Boolean) || '';

// ---------- Repeating tasks ----------
const REPEATS = { daily: 'Every Day', weekdays: 'Weekdays', weekly: 'Every Week', monthly: 'Every Month', yearly: 'Every Year' };
function sameDayIn(y, m, day) {
  const last = new Date(y, m + 1, 0).getDate();
  return iso(new Date(y, m, Math.min(day, last)));
}
function stepDate(s, rep) {
  const d = parseD(s);
  switch (rep) {
    case 'daily': return isoAdd(s, 1);
    case 'weekdays': { let n = isoAdd(s, 1); while (dowMon(n) > 4) n = isoAdd(n, 1); return n; }
    case 'weekly': return isoAdd(s, 7);
    case 'monthly': return sameDayIn(d.getFullYear(), d.getMonth() + 1, d.getDate());
    case 'yearly': return sameDayIn(d.getFullYear() + 1, d.getMonth(), d.getDate());
    default: return isoAdd(s, 1);
  }
}
// The next date after completing a repeating task — never today or in the past.
function nextDue(due, rep) {
  const today = todayIso();
  let n = stepDate(due, rep), guard = 0;
  while (n <= today && guard++ < 1000) n = stepDate(n, rep);
  return n;
}
// Tick a task. A repeating task moves to its next date instead of being finished.
function completeTask(t, now = Date.now()) {
  t.snooze = 0;
  if (t.repeat && t.due) {
    t.due = nextDue(t.due, t.repeat);
    (t.subs || []).forEach((s) => { s.done = false; });
    return 'next';
  }
  t.done = true;
  t.doneAt = now;
  return 'done';
}

// ---------- Habits ----------
const habitOn = (h, date) => !!(h.days && h.days[dowMon(date)]) && date >= (h.start || '0000');
const habitCount = (h, date) => (h.log && h.log[date]) || 0;
const habitDone = (h, date) => habitCount(h, date) >= (h.target || 1);

// ---------- Reminders ----------
const LATE_OK = 12 * 3600e3; // a reminder can still be shown up to 12 hours late
function reminders(S, now = Date.now(), days = 14) {
  const out = [];
  const allDay = (S.settings && S.settings.allDay) || '09:00';
  const listName = (id) => ((S.lists || []).find((l) => l.id === id) || {}).name || '';
  for (const t of S.tasks || []) {
    if (t.done || !t.due) continue;
    let at = atMs(t.due, t.time || allDay);
    if (t.snooze && t.snooze > at) at = t.snooze;
    if (at < now - LATE_OK) continue;
    const body = [t.time || '', listName(t.list), firstLine(t.notes)].filter(Boolean).join(' · ');
    out.push({ key: `t:${t.id}:${at}`, at, kind: 'task', id: t.id, title: t.title || 'Reminder', body });
  }
  const today = todayIso();
  for (const h of S.habits || []) {
    if (!h.remind) continue;
    for (let i = -1; i < days; i++) {
      const date = isoAdd(today, i);
      if (!habitOn(h, date) || habitDone(h, date)) continue;
      let at = atMs(date, h.remind);
      if (h.snooze && h.snooze.date === date && h.snooze.at > at) at = h.snooze.at;
      if (at < now - LATE_OK) continue;
      const body = h.target > 1 ? `${habitCount(h, date)} of ${h.target} done` : 'Time for your habit';
      out.push({ key: `h:${h.id}:${date}`, at, kind: 'habit', id: h.id, date, title: h.name, body });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// What "Done" or "In 10 min" on a notification does to the saved data.
function applyNotifAction(S, d, action, now = Date.now()) {
  if (d.kind === 'task') {
    const t = (S.tasks || []).find((x) => x.id === d.id);
    if (!t || t.done) return false;
    if (action === 'done') completeTask(t, now); else t.snooze = now + 10 * 60e3;
    return true;
  }
  if (d.kind === 'habit') {
    const h = (S.habits || []).find((x) => x.id === d.id);
    if (!h) return false;
    const date = d.date || todayIso();
    if (action === 'done') { h.log = h.log || {}; h.log[date] = h.target || 1; } else h.snooze = { date, at: now + 10 * 60e3 };
    return true;
  }
  return false;
}

// Show every reminder that is due and not shown yet. Runs in the service worker, one at a time,
// so a reminder is never shown twice (the server's wake-up and the app's own timer can race).
let dueChain = Promise.resolve(0);
function showDue(reg, lateMs) {
  dueChain = dueChain.catch(() => 0).then(() => showDueNow(reg, lateMs));
  return dueChain;
}
async function showDueNow(reg, lateMs) {
  const S = await dbGet('state', 'S');
  if (!S) return 0;
  const now = Date.now();
  const shown = (await dbGet('meta', 'shown')) || {};
  const due = reminders(S, now, 1).filter((r) => r.at <= now + 30e3 && r.at >= now - lateMs && !shown[r.key]);
  const icon = new URL('icons/icon-192.png', reg.scope).href;
  const badge = new URL('icons/badge-96.png', reg.scope).href;
  for (const r of due) {
    await reg.showNotification(r.title, {
      body: r.body, tag: r.key, icon, badge, timestamp: r.at,
      data: { kind: r.kind, id: r.id, date: r.date || null },
      actions: [{ action: 'done', title: 'Done' }, { action: 'snooze', title: 'In 10 min' }],
    });
    shown[r.key] = now;
  }
  for (const k of Object.keys(shown)) if (shown[k] < now - 3 * 864e5) delete shown[k];
  await dbPut('meta', 'shown', shown);
  return due.length;
}

// ---------- Reminder server ----------
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDec = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const pushReady = () => !!(self.PUSH && self.PUSH.url && self.PUSH.key);
async function deviceId() {
  let id = await dbGet('meta', 'device');
  if (!id) {
    id = b64u(crypto.getRandomValues(new Uint8Array(18))).replace(/[-_]/g, 'x');
    await dbPut('meta', 'device', id);
  }
  return id;
}
// Send the server the times it should wake this phone (the next 3 weeks). Only the times and
// an anonymous address for this phone are sent. Skipped when nothing changed.
async function pushSync(reg, S, force) {
  if (!pushReady() || !reg || !reg.pushManager) return 'off';
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return 'nosub';
  const now = Date.now();
  const times = [...new Set(reminders(S, now, 21).map((r) => r.at).filter((t) => t > now))];
  const test = await dbGet('meta', 'test');
  if (test && test > now) times.push(test);
  times.sort((a, b) => a - b);
  const body = JSON.stringify({ device: await deviceId(), endpoint: sub.endpoint, times: times.slice(0, 300) });
  const last = (await dbGet('meta', 'synced')) || {};
  if (!force && last.body === body && now - last.at < 20 * 3600e3) return 'same';
  const r = await fetch(self.PUSH.url.replace(/\/+$/, '') + '/sync', { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
  if (!r.ok) throw new Error('Reminder server answered ' + r.status);
  await dbPut('meta', 'synced', { body, at: now });
  return 'ok';
}
