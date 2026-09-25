'use strict';
/* Start-up: load the data, show the first screen, open what a home-screen shortcut or a
   notification asked for, offline support with quick updates, and closing locked notes after a
   minute in the background. Loaded last. */

const APP_BUILD = '1.4';
ACTIONS.tab = (el) => goTab(el.dataset.tab);
bindTabSlide($('#tabs'), (t) => goTab(t));

// What a shortcut (?new=note) or a notification (?task=id) asks for.
function openLink(p) {
  const want = (k) => p.get(k);
  if (want('new') === 'note') { goTab('notes', true); ACTIONS['new-note'](); return; }
  if (want('new') === 'task') { goTab('planner', true); taskSheet(null, {}); return; }
  if (want('open') === 'groceries' || want('add') === 'grocery') {
    goTab('planner', true);
    if (cur().s !== 'groceries') push({ s: 'groceries' });
    setTimeout(() => { const i = $('.g-input', curEl()); if (i) i.focus(); }, 350);
    return;
  }
  if (want('task')) {
    const t = taskOf(want('task'));
    goTab('planner', true);
    if (t) taskSheet(t);
    return;
  }
  if (want('habit')) {
    goTab('planner', true);
    if (habitOf(want('habit')) && cur().s !== 'habits') push({ s: 'habits' });
  }
}

(async function start() {
  await loadState();
  applyTheme();
  const p = new URLSearchParams(location.search);
  history.replaceState({ n: 0 }, '', location.search ? location.pathname : undefined);
  show();
  document.body.classList.add('ready');
  if (storageBroken) toast("This phone's storage isn't available — changes won't be kept");
  openLink(p);
  registerSW();
  planLocal();
  setTimeout(() => {
    cleanPhotos().catch(() => {});
    bodiesReady.then(() => cleanBodies()).catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    checkDueNow(15 * 60e3);
    connectPush(false);
  }, 3000);
})();

// ---------- Background / foreground ----------
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    if (ED) await saveEditor();
    flush();
    return;
  }
  await reloadIfChanged();
  const away = hiddenAt ? Date.now() - hiddenAt : 0;
  if (away > 60000 && LOCK.key) {
    forgetKey();
    const e = cur(), n = e.s === 'note' ? noteOf(e.id) : null;
    if (n && n.locked) { ED = null; pop(); } else if (!sheet) render();
  } else if (away > 10 * 60e3 && !ED && !sheet) render(); // "Today", counts and streaks move on
  if (swReg) swReg.update().catch(() => {});
  checkDueNow(15 * 60e3);
  planLocal();
});
window.addEventListener('pagehide', () => { flush(); });
// A notification's "Done" / "In 10 min" changed the saved data while the app was in the background.
async function reloadIfChanged() {
  let d = null;
  try { d = await dbGet('state', 'S'); } catch (e) { return; }
  if (d && (+d.rev || 0) > S.rev) {
    const old = new Map(S.notes.map((n) => [n.id, n]));
    S = normalize(d);
    // The saved state has no note text (it's stored per note): keep what's already in memory.
    for (const n of S.notes) { const o = old.get(n.id); if (o) BODY_KEYS.forEach((k) => { n[k] = o[k]; }); }
    if (!ED && !sheet) render();
  }
}

// ---------- Service worker: offline, updates, notifications ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    // Reload into the new version, but not in the middle of typing.
    if (sheet || ED) pendingReload = true; else location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'act') {
      if (applyNotifAction(S, m, m.action)) {
        save();
        if (!ED && !sheet) render();
        toast(m.action === 'done' ? 'Marked as done' : 'Reminding you again in 10 minutes');
      }
    }
    if (m.type === 'reload') reloadIfChanged();
    if (m.type === 'open') openLink(new URLSearchParams(m.kind === 'task' ? `task=${m.id}` : m.kind === 'habit' ? `habit=${m.id}` : ''));
  });
  navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
}
