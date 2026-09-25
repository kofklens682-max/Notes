'use strict';
/* Settings: notifications, the notes code, appearance, voice typing language, backup and
   restore, storage, and erasing everything. */

SCREENS.settings = {
  render() {
    const perm = notifPerm();
    const status = !notifSupported() ? 'Not available' : perm === 'denied' ? 'Blocked' : notifOn() ? (pushReady() ? 'On' : 'On, while open') : 'Off';
    const L = S.settings.lock;
    const last = S.settings.lastBackup;
    const body = `
      <h2 class="sec">Notifications</h2>
      <div class="card">
        <div class="row static">${tile('bell', '#FF3B30')}<span class="lbl">Reminders</span><span class="val">${status}</span></div>
        ${notifOn() ? `<button class="row" data-act="notif-test">${tile('sparkles', '#FF9500')}<span class="lbl">Send a Test Notification</span></button>`
          : notifSupported() && perm !== 'denied' ? `<button class="row" data-act="notif-on">${tile('bell', '#34C759')}<span class="lbl tinted">Turn On Notifications</span></button>` : ''}
        <label class="row">${tile('clock', '#007AFF')}<span class="lbl">Default time</span><input class="row-input" type="time" name="allDay" value="${S.settings.allDay}"></label>
      </div>
      <p class="foot">Reminders with a date but no time alert you at the default time. ${perm === 'denied' ? "Notifications are blocked. Open the phone's Settings → Apps → Notes → Notifications and allow them." : pushReady()
        ? 'Reminders arrive even when the app is closed. Only the times are sent to the reminder server — never what your notes or reminders say.'
        : "The reminder server isn't set up yet, so reminders appear only while the app is open or was used recently."}</p>

      <h2 class="sec">Locked Notes</h2>
      <div class="card">
        ${L ? `<button class="row" data-act="lock-change">${tile('lock', '#8E8E93')}<span class="lbl">Change Code</span>${glyph('chevR', 'chev')}</button>
          ${LOCK.key ? `<button class="row" data-act="lock-now">${tile('lock', '#FF9500')}<span class="lbl">Lock Now</span><span class="val">Notes are open</span></button>` : ''}
          <button class="row" data-act="lock-reset">${tile('x', '#FF3B30')}<span class="lbl danger">Forgot Code…</span></button>`
        : `<button class="row" data-act="lock-set">${tile('lock', '#8E8E93')}<span class="lbl">Set a Notes Code</span>${glyph('chevR', 'chev')}</button>`}
      </div>
      <p class="foot">To lock a note, open it and tap ••• → Lock Note. Locked notes are encrypted with your 4-digit code; if you forget it they can't be recovered. They close again after a minute in the background.</p>

      <h2 class="sec">Appearance</h2>
      <div class="card pad"><div class="seg">${segButtons('theme', [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']], S.settings.theme)}</div></div>

      <h2 class="sec">Voice Typing Language</h2>
      <div class="card pad"><div class="seg">${segButtons('voice-lang', VOICE_LANGS.map(([v, , l]) => [v, esc(l)]), S.settings.voiceLang)}</div></div>

      <h2 class="sec">Backup</h2>
      <div class="card">
        <button class="row" data-act="backup-save">${tile('share', '#007AFF')}<span class="lbl">Save Backup File</span></button>
        <button class="row" data-act="backup-load">${tile('download', '#34C759')}<span class="lbl">Restore from Backup</span></button>
      </div>
      <p class="foot">Everything is stored only on this phone. ${last ? `Last backup: ${esc(dayName(dateOf(last), true))}.` : 'You have no backup yet.'} Now and then, save a backup to Telegram or Google Drive — then you can restore everything on a new phone.</p>

      <h2 class="sec">Storage</h2>
      <div class="card">
        <div class="row static">${tile('box', '#8E8E93')}<span class="lbl">Space used</span><span class="val" id="st-used">…</span></div>
        <div class="row static">${tile('shield', '#34C759')}<span class="lbl">Safe from clean-up</span><span class="val" id="st-keep">…</span></div>
      </div>

      <button class="danger-btn" data-act="erase">Erase Everything</button>
      <div class="about">Notes &amp; Planner · version ${APP_BUILD}</div>`;
    return page({ title: 'Settings', back: UI.tab === 'notes' ? 'Notes' : 'Today', body });
  },
  mount(el) {
    const t = $('input[name="allDay"]', el);
    t.addEventListener('change', () => { if (t.value) { S.settings.allDay = t.value; save(); } });
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((e) => { const u = $('#st-used', el); if (u) u.textContent = `${((e.usage || 0) / 1048576).toFixed(1)} MB`; }).catch(() => {});
    }
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((p) => { const k = $('#st-keep', el); if (k) k.textContent = p ? 'Yes' : 'Not yet'; }).catch(() => {});
    }
  },
};
ACTIONS.theme = (el) => { S.settings.theme = el.dataset.v; save(); applyTheme(); render(); };
ACTIONS['voice-lang'] = (el) => { S.settings.voiceLang = el.dataset.v; save(); render(); };
ACTIONS['lock-set'] = async () => { if (await needKey()) { toast('Code set — now lock a note from its ••• menu'); render(); } };
ACTIONS['lock-change'] = async () => { if (await changeCode()) { toast('Code changed'); render(); } };
ACTIONS['lock-now'] = () => { forgetKey(); render(); toast('Locked notes are closed'); };
ACTIONS['lock-reset'] = async () => {
  const n = lockedNotes().length;
  const ok = await ask({
    title: 'Forgot the notes code?',
    msg: `Locked notes can't be opened without the code. Removing the code permanently deletes ${plural(n, 'locked note')}.`,
    ok: n ? `Delete ${plural(n, 'Locked Note')}` : 'Remove Code', destructive: true,
  });
  if (!ok) return;
  removeLockedNotes();
  render();
  toast('Code removed');
};

// ---------- Backup ----------
const BACKUP_APP = 'notes-planner';
async function makeBackup() {
  wakeBodies();
  await bodiesReady;
  if (ED) await saveEditor();
  await flush();
  const photos = {};
  for (const id of await dbKeys('blobs')) {
    const rec = await dbGet('blobs', id);
    if (!rec) continue;
    if (rec.data) photos[id] = { type: rec.type, data: toB64(new Uint8Array(await rec.data.arrayBuffer())) };
    else photos[id] = { type: rec.type, iv: toB64(new Uint8Array(rec.iv)), ct: toB64(new Uint8Array(rec.ct)) };
  }
  return { app: BACKUP_APP, v: APP_V, at: Date.now(), state: S, photos };
}
ACTIONS['backup-save'] = async () => {
  let data;
  try { data = await makeBackup(); } catch (e) { toast("Couldn't make the backup"); return; }
  // Android can share .txt files to Telegram / Drive; the content is JSON.
  const name = `notes-backup-${todayIso()}.txt`;
  const file = new File([JSON.stringify(data)], name, { type: 'text/plain' });
  const done = () => { S.settings.lastBackup = Date.now(); save(); if (!ED && !sheet) render(); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Notes backup' }); done(); toast('Backup saved'); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  done();
  toast('Backup downloaded');
};
ACTIONS['backup-load'] = () => $('#import-file').click();
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'import-file') return;
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let data = null;
  try { data = JSON.parse(await f.text()); } catch (err) { /* not JSON */ }
  if (!data || data.app !== BACKUP_APP || !data.state) { toast("That file isn't a Notes backup"); return; }
  const st = normalize(data.state);
  const ok = await ask({
    title: 'Restore this backup?',
    msg: `Saved ${dayName(dateOf(+data.at || Date.now()), true)}: ${plural(st.notes.length, 'note')}, ${plural(st.tasks.length, 'reminder')}, ${plural(st.habits.length, 'habit')}. Everything in the app now will be replaced.`,
    ok: 'Restore', destructive: true,
  });
  if (!ok) return;
  try {
    st.notes.forEach((n) => { n.html = cleanHtml(n.html); });
    await dbClear('blobs');
    for (const [id, p] of Object.entries(data.photos || {})) {
      if (!/^[a-z0-9]{4,40}$/i.test(id) || !p || typeof p.type !== 'string') continue;
      if (p.data) await dbPut('blobs', id, { type: p.type, data: new Blob([fromB64(p.data)], { type: p.type }) });
      else if (p.iv && p.ct) await dbPut('blobs', id, { type: p.type, iv: fromB64(p.iv), ct: fromB64(p.ct).buffer });
    }
    st.rev = (S.rev || 0) + 1;
    forgetKey();
    photoUrls.clear();
    await dbClear('bodies');
    S = st;
    S.notes.forEach((n) => dirtyBodies.add(n.id));
    bodiesLoaded = true;
    await flush();
  } catch (err) { toast("Couldn't restore — " + ((err && err.message) || err)); return; }
  applyTheme();
  resetScreens();
  toast('Backup restored');
  remindSoon();
});
function resetScreens() {
  if (sheet) closeSheetNow();
  UI.stacks = { notes: [{ s: 'folders', folder: 'all' }], planner: [{ s: 'planner' }] };
  ED = null;
  $('#stage').innerHTML = '';
  show();
  syncHistory();
}
ACTIONS.erase = async () => {
  const ok = await ask({ title: 'Erase everything?', msg: 'All notes, photos, reminders, groceries and habits on this phone will be deleted. This cannot be undone.', ok: 'Erase Everything', destructive: true });
  if (!ok) return;
  const sure = await ask({ title: 'Are you sure?', msg: S.settings.lastBackup ? '' : "You haven't saved a backup.", ok: 'Yes, Erase', destructive: true });
  if (!sure) return;
  await dbClear('blobs');
  await dbClear('bodies');
  await dbClear('meta');
  forgetKey();
  dirtyBodies.clear();
  S = blank();
  await flush();
  applyTheme();
  resetScreens();
  toast('Everything erased');
};
