'use strict';
/* Notifications on this phone: permission, the push subscription, keeping the reminder server
   up to date (see remind.js), and a timer that shows reminders while the app is open. */

let swReg = null; // set by main.js once the service worker is registered
const notifSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
const notifPerm = () => (notifSupported() ? Notification.permission : 'unsupported');
const notifOn = () => notifSupported() && Notification.permission === 'granted' && !!S.settings.notify;
function swReady() {
  if (swReg && swReg.active) return Promise.resolve(swReg);
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
}

// The line under a date/time in the task and habit sheets.
function notifHint(msg) {
  if (notifOn()) return msg ? `<div class="hint-line">${glyph('bell', 'inl')}${esc(msg)}</div>` : '';
  if (!notifSupported()) return '';
  if (notifPerm() === 'denied') return `<div class="hint-line warn">${glyph('bell', 'inl')}Notifications are blocked for this app — allow them in the phone's settings to get reminders.</div>`;
  return `<button class="hint-btn" data-act="notif-on">${glyph('bell')}<span><b>Turn on notifications</b>so your phone reminds you on time</span></button>`;
}

async function enableNotifications() {
  if (!notifSupported()) { toast("This browser can't show notifications"); return false; }
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p !== 'granted') { toast('Notifications are blocked — allow them in the phone settings'); return false; }
  S.settings.notify = true;
  save();
  await connectPush(true);
  return true;
}
// Subscribe this phone to the reminder server (when it's set up) and send it the times.
async function connectPush(force) {
  if (!notifOn() || !pushReady()) return 'off';
  const reg = await swReady();
  if (!reg || !reg.pushManager) return 'off';
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uDec(PUSH.key) });
    const r = await pushSync(reg, S, force);
    PUSHLOG = (await dbGet('meta', 'pushlog')) || PUSHLOG;
    return r;
  } catch (e) {
    if (force) toast("Couldn't reach the reminder server — reminders still work while the app is open");
    // Try again in a minute: a reminder the server doesn't know about would never arrive.
    clearTimeout(retryT);
    retryT = setTimeout(() => connectPush(false), 60e3);
    return 'error';
  }
}
let retryT = 0;

// ---------- A note on the lock screen ----------
// "Show on Lock Screen" keeps a note as a quiet notification (a shopping list: what's still to buy).
// It follows the note as you edit it, and goes when swiped away (the service worker notes that).
async function noteNotifShow(n, info) {
  if (!n.notif || n.locked || !notifOn()) return;
  const reg = await swReady();
  if (!reg) return;
  info = info || noteInfo(n.html || '');
  const left = info.todo ? info.todo[1] - info.todo[0] : 0;
  const title = noteTitle(n) + (info.todo ? (left ? ` · ${left} left` : ' · all done') : '');
  const body = info.todo ? info.open.slice(0, 12).join(' · ') : info.preview || '';
  try {
    await reg.showNotification(title, {
      body, tag: 'note:' + n.id, silent: true, renotify: false, requireInteraction: true,
      icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { kind: 'note', id: n.id },
    });
  } catch (e) { /* notifications off */ }
}
async function noteNotifToggle(n) {
  if (n.notif) {
    delete n.notif;
    save();
    const reg = await swReady();
    if (reg) (await reg.getNotifications({ tag: 'note:' + n.id })).forEach((x) => x.close());
    toast('Removed from the lock screen');
    return;
  }
  if (!notifOn() && !(await enableNotifications())) return;
  wakeBodies();
  await bodiesReady;
  n.notif = true;
  save();
  await noteNotifShow(n);
  toast('On your lock screen — swipe it away to remove it');
}
// After the phone restarts its notifications are gone: show the notes again.
async function noteNotifsRestore() {
  const ns = S.notes.filter((n) => n.notif && !n.locked);
  if (!ns.length || !notifOn()) return;
  const reg = await swReady();
  if (!reg) return;
  const open = new Set((await reg.getNotifications()).map((x) => x.tag));
  await bodiesReady;
  for (const n of ns) if (!open.has('note:' + n.id)) noteNotifShow(n);
}

// ---------- Reliable Reminders (Settings) ----------
// The server keeps a short log: when each reminder was due, when it sent the wake-up, and when
// this phone answered. That shows whether a late reminder was the phone's fault or the server's.
let PUSHLOG = null;
dbGet('meta', 'pushlog').then((v) => { PUSHLOG = v || null; }).catch(() => {});
const lateText = (ms) => {
  const m = Math.round(ms / 60e3);
  if (m < 1) return 'On time';
  if (m < 60) return `${m} min late`;
  return `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min ' : ''}late`;
};
function logRows() {
  const log = ((PUSHLOG && PUSHLOG.log) || []).slice().reverse().slice(0, 10);
  const now = Date.now();
  return log.map((x) => {
    const late = x.ack ? x.ack - x.due : null;
    const st = x.ack ? lateText(late) : now - x.sent < 15 * 60e3 ? 'Waiting…' : 'Missed';
    const bad = !x.ack ? now - x.sent >= 15 * 60e3 : late >= 60e3;
    return { day: dateOf(x.due), at: x.due, st, bad, tries: x.tries || 1 };
  });
}
function remSummary() {
  const rows = logRows();
  if (!rows.length) return '';
  const ok = rows.filter((r) => !r.bad).length;
  return `${ok} of ${rows.length} on time`;
}
const PHONE_STEPS = [
  ['Chrome → Autostart', 'Turn it on, so the phone lets Chrome wake up for a reminder.'],
  ['Chrome → Battery saver', 'Choose “No restrictions”. This is the usual reason a reminder comes an hour late.'],
  ['Notes → Notifications', 'Allow them, with Lock screen and Floating notifications on.'],
  ['Recent apps', 'Open the list of recent apps, hold Chrome and tap the lock, so cleaning doesn\'t close it.'],
];
SCREENS.remcheck = {
  render() {
    const rows = logRows();
    const body = `
      <h2 class="sec">Last Reminders</h2>
      <div class="card">${rows.length ? rows.map((r) => `<div class="row static">${tile(r.bad ? 'x' : 'check', r.bad ? '#FF3B30' : '#34C759')}<span class="lbl">${esc(dayName(r.day))}, ${hm(r.at)}</span><span class="val">${esc(r.st)}${r.tries > 1 && !r.bad ? ' · resent' : ''}</span></div>`).join('')
        : `<div class="row static"><span class="lbl">No reminders yet</span></div>`}
        <button class="row" data-act="notif-test-off">${tile('sparkles', '#FF9500')}<span class="lbl tinted">Test with the Screen Off</span></button>
      </div>
      <p class="foot">The reminder server sends a wake-up at the exact time, and again if the phone doesn't answer. If one shows as late here, the phone held it back — the steps below fix that.</p>
      <h2 class="sec">On a Xiaomi / Redmi Phone</h2>
      <div class="card">${PHONE_STEPS.map(([t, d], i) => `<div class="row static step"><span class="tile" style="--c:#007AFF"><b>${i + 1}</b></span><span class="lbl"><b>${esc(t)}</b><small>${esc(d)}</small></span></div>`).join('')}</div>
      <p class="foot">Steps 1–3 are in the phone's Settings → Apps → Manage apps. Afterwards, tap Test with the Screen Off and lock the phone.</p>`;
    return page({ title: 'Reliable Reminders', back: 'Settings', body });
  },
  mount(el, e) {
    if (e.fetched) return; // once per visit: the redraw below mounts again
    e.fetched = true;
    connectPush(true).then(() => { if (cur() === e) repaint(el, e); });
  },
};
ACTIONS['rem-check'] = () => push({ s: 'remcheck' });
// A test through the reminder server in 1 minute, so there's time to lock the phone.
ACTIONS['notif-test-off'] = async () => {
  if (!notifOn() && !(await enableNotifications())) return;
  const at = Date.now() + 60e3;
  await dbPut('meta', 'test', at);
  const ok = pushReady() && (await connectPush(true)) === 'ok';
  if (!ok) { toast("Couldn't reach the reminder server"); return; }
  toast(`Lock your phone now — the test arrives at ${hm(at)}`);
};
ACTIONS['notif-on'] = async (el) => {
  if (!(await enableNotifications())) return;
  toast('Notifications on');
  if (el && el.classList.contains('hint-btn')) el.outerHTML = `<div class="hint-line">${glyph('bell', 'inl')}Notifications are on</div>`;
  else render();
};
ACTIONS['notif-test'] = async () => {
  if (!notifOn() && !(await enableNotifications())) return;
  const reg = await swReady();
  if (!reg) { toast('Notifications need the installed app'); return; }
  await dbPut('meta', 'test', Date.now() + 10000);
  let viaServer = false;
  if (pushReady()) viaServer = (await connectPush(true)) === 'ok';
  toast(viaServer ? 'Test coming in 10 seconds — you can close the app' : 'Test notification in 10 seconds');
  setTimeout(() => { if (reg.active) reg.active.postMessage({ type: 'test' }); }, 10500);
  render();
};

// After every change: re-plan the timer and tell the server (a moment later, once typing stops).
let remindT = 0, syncT = 0;
function remindSoon() {
  clearTimeout(syncT);
  syncT = setTimeout(() => { planLocal(); connectPush(false); }, 1500);
}
// While the app is open, wake up for the next reminder ourselves.
function planLocal() {
  clearTimeout(remindT);
  if (!notifOn()) return;
  const now = Date.now();
  const next = reminders(S, now, 2).find((r) => r.at > now);
  const wait = next ? Math.min(next.at - now + 400, 3600e3) : 3600e3;
  remindT = setTimeout(() => { checkDueNow(2 * 60e3); planLocal(); }, wait);
}
// Ask the service worker to show whatever is due (it remembers what was already shown).
async function checkDueNow(late) {
  if (!notifOn()) return;
  await flush();
  const reg = await swReady();
  if (reg && reg.active) reg.active.postMessage({ type: 'check', late });
}
