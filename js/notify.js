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
    return await pushSync(reg, S, force);
  } catch (e) {
    if (force) toast("Couldn't reach the reminder server — reminders still work while the app is open");
    return 'error';
  }
}
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
