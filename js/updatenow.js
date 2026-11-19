'use strict';
/* "Update" button in Settings (17 Nov 2026). Any element with data-appupdate checks for a newer version of the app and, when there is one,
   installs it and reloads at once, so you do not have to leave the app and come back. Your data is not touched (it lives in the phone, not in the app files).
   The same file is used by Teacher and Budget. */
(function () {
  let busy = false;
  const say = (b, t) => { const s = b.querySelector('small, .row-sub'); if (s) s.textContent = t; };
  async function run(b) {
    if (busy) return; busy = true;
    const done = (t) => { say(b, t); busy = false; };
    try {
      if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return done('Updates work in the installed app, not on this test page');
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return done('No update service found. Close the app and open it again.');
      say(b, 'Checking…');
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return; reloading = true; say(b, 'Updating…');
        const go = () => location.reload();
        try { const k = window.keepNow; if (typeof k === 'function') { Promise.resolve(k()).then(go, go); return; } } catch (e) { /* none */ }
        setTimeout(go, 250);
      });
      await reg.update();
      if (reg.installing || reg.waiting) {
        say(b, 'Downloading the new version…');
        if (reg.waiting) { try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) { /* none */ } }
        setTimeout(() => { if (!reloading) done('Still downloading. Check your internet and press again.'); }, 45000);
      } else done('You have the newest version');
    } catch (e) { done('Could not check. Check your internet and press again.'); }
  }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-appupdate]'); if (b) { e.preventDefault(); run(b); } });
})();
