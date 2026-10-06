// Offline support and reminders. Bump VERSION whenever the app files change: the phone notices
// the new service worker, downloads the whole new version at once, and the app reloads into it.
// This site shares its address with the Budget app, so only "notes-" caches are ours.
const VERSION = 'notes-v31';
importScripts('js/config.js', 'js/store.js', 'js/remind.js');

const SHELL = [
  './',
  './index.html',
  './style.css',
  './icons.js',
  './js/config.js',
  './js/store.js',
  './js/remind.js',
  './js/account.js',
  './js/core.js',
  './js/lock.js',
  './js/notes.js',
  './js/editor.js',
  './js/table.js',
  './js/mathsolve.js',
  './js/draw.js',
  './js/maths.js',
  './js/photo.js',
  './js/aiwrite.js',
  './fonts/caveat-latin.woff2',
  './js/planner.js',
  './js/today.js',
  './js/cards.js',
  './js/groceries.js',
  './js/habits.js',
  './js/notify.js',
  './js/settings.js',
  './js/acctui.js',
  './js/main.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/badge-96.png',
  './fonts/inter-latin.woff2',
  './fonts/inter-latin-ext.woff2',
  './fonts/inter-cyrillic.woff2',
  './fonts/inter-cyrillic-ext.woff2',
];
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname);

// '?v=' makes GitHub's servers hand over this version's files, never a copy they kept of the old ones
// (the fetch handler below matches with ignoreSearch, so the address works without it).
const fresh = (u) => new Request(u + (u.includes('?') ? '&' : '?') + 'v=' + VERSION, { cache: 'reload' });
self.addEventListener('install', (e) => {
  e.waitUntil(
    (LOCAL ? Promise.resolve() : caches.open(VERSION).then((c) => c.addAll(SHELL.map(fresh))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('notes-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
// The app opens straight from the phone's copy: no waiting for the network, and no re-downloading
// every file at each start. (New versions arrive through a new service worker, see VERSION.)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (LOCAL || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = req.mode === 'navigate' ? './index.html' : req;
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      } catch (err) {
        return (req.mode === 'navigate' && (await cache.match('./index.html', { ignoreSearch: true }))) || Response.error();
      }
    }),
  );
});

// ---------- Reminders ----------
const serial = (f) => (dueChain = dueChain.catch(() => 0).then(f));
const iconUrl = (p) => new URL(p, self.registration.scope).href;
async function showTestNow() {
  const t = await dbGet('meta', 'test');
  if (!t) return false;
  await dbDel('meta', 'test');
  await self.registration.showNotification('Notifications work', {
    body: 'Your reminders will pop up like this.', tag: 'test',
    icon: iconUrl('icons/icon-192.png'), badge: iconUrl('icons/badge-96.png'),
  });
  return true;
}
// The reminder server woke us: show what's due. (Android requires showing something.)
self.addEventListener('push', (e) => {
  e.waitUntil(serial(async () => {
    const n0 = await showDueNow(self.registration, LATE_OK, 3 * 60e3);
    const t0 = await showTestNow();
    await pushAck(n0 + (t0 ? 1 : 0));
    if (n0 || t0) return;
    // A repeat of a wake-up we already answered: quietly re-show what's on screen instead of a new alert.
    const open = await self.registration.getNotifications();
    const last = open.filter((x) => x.tag !== 'summary').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
    if (last) {
      await self.registration.showNotification(last.title, {
        body: last.body, tag: last.tag, icon: last.icon, badge: last.badge, timestamp: last.timestamp,
        data: last.data, actions: last.actions, silent: true, renotify: false,
      });
      return;
    }
    const S = await dbGet('state', 'S');
    const today = todayIso();
    const n = S ? (S.tasks || []).filter((t) => !t.done && t.due && t.due <= today).length : 0;
    await self.registration.showNotification('Planner', {
      body: n ? `${n} reminder${n === 1 ? '' : 's'} for today` : 'Nothing is due right now', tag: 'summary', silent: true,
      icon: iconUrl('icons/icon-192.png'), badge: iconUrl('icons/badge-96.png'),
    });
  }));
});
self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'check') e.waitUntil(serial(() => showDueNow(self.registration, m.late || 120000)));
  if (m.type === 'test') e.waitUntil(serial(showTestNow));
});
self.addEventListener('notificationclick', (e) => {
  const n = e.notification, d = n.data || {};
  if (d.kind !== 'note') n.close(); // a note on the lock screen stays there until swiped away
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (e.action === 'done' || e.action === 'snooze' || e.action === 'tomorrow') {
      const open = wins.find((c) => c.visibilityState === 'visible');
      if (open) { open.postMessage({ type: 'act', action: e.action, ...d }); return; }
      await serial(async () => {
        const S = await dbGet('state', 'S');
        if (!S || !applyNotifAction(S, d, e.action)) return;
        S.rev = (S.rev || 0) + 1;
        await dbPut('state', 'S', S);
        try { await pushSync(self.registration, S); } catch (err) { /* offline */ }
      });
      wins.forEach((c) => c.postMessage({ type: 'reload' }));
      return;
    }
    const q = d.kind === 'task' ? `?task=${d.id}` : d.kind === 'habit' ? `?habit=${d.id}` : d.kind === 'note' ? `?note=${d.id}` : '';
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (w) {
      await w.focus();
      if (q) w.postMessage({ type: 'open', kind: d.kind, id: d.id });
    } else await self.clients.openWindow(iconUrl('./' + q));
  })());
});
// A note shown on the lock screen was swiped away: it isn't shown there any more.
self.addEventListener('notificationclose', (e) => {
  const d = e.notification.data || {};
  if (d.kind !== 'note') return;
  e.waitUntil(serial(async () => {
    const S = await dbGet('state', 'S');
    const n = S && (S.notes || []).find((x) => x.id === d.id);
    if (!n || !n.notif) return;
    delete n.notif;
    S.rev = (S.rev || 0) + 1;
    await dbPut('state', 'S', S);
    (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).forEach((c) => c.postMessage({ type: 'reload' }));
  }));
});
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    if (!pushReady()) return;
    await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uDec(self.PUSH.key) });
    const S = await dbGet('state', 'S');
    if (S) await pushSync(self.registration, S, true);
  })());
});
