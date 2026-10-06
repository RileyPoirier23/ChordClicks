const { app, BrowserWindow, session, ipcMain, dialog, shell, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const createAuth = require('./auth.js');

app.commandLine.appendSwitch('log-level', '3'); // silence Chromium SSL/network spam
if (!app.requestSingleInstanceLock()) app.quit();

// Ad/tracker hosts that UG's page pulls in (these caused the SSL/ERR_* flood)
const BLOCK = ['doubleclick', 'googlesyndication', 'googleadservices', 'adservice', 'amazon-adsystem', 'criteo', 'taboola', 'outbrain', 'pubmatic', 'openx', 'rubiconproject', 'adnxs', 'casalemedia', 'smartadserver', '3lift', 'measureadv', 'tappx', 'omnitagjs', 'cootlogix', 'kueez', 'amitydigital', 'tinyorbit', 'programmaticx', 'bidtheatre', 'unrulymedia', 'drift-pixel', 'copper6', 'nextmillmedia', 'ad.turn.com', 'adyoulike', '4dex', 'moatads', 'scorecardresearch', 'quantserve', 'adform', 'smaato', 'sharethrough', 'teads', 'id5-sync', 'liveramp', 'bidswitch'];

let win, vc = null, auth;
const send = (on, text) => { if (win && !win.isDestroyed()) win.webContents.send('vcam:status', { on, text }); };
const res = (...p) => path.join(app.isPackaged ? process.resourcesPath : __dirname, ...p);

/* ---------------------------------------------------------------- virtual camera */
function stopVcam() { if (!vc) return; const p = vc; vc = null; try { p.stdin.end(); p.kill(); } catch (e) {} send(false, 'Virtual camera off.'); }
function startVcam() {
  stopVcam();
  const tries = [['py', ['-3']], ['python', []], ['python3', []]]; let msg = '';
  const go = i => {
    if (i >= tries.length) return send(false, msg || 'Virtual camera helper is not set up yet. Use “Set up virtual camera” below, then try again.');
    const [cmd, pre] = tries[i]; let ok = false, moved = false; const next = () => { if (!moved) { moved = true; go(i + 1); } };
    const p = spawn(cmd, [...pre, res('scripts', 'vcam.py'), '1280', '720', '30'], { windowsHide: true });
    p.on('error', next); p.stdin.on('error', () => {});
    p.stderr.on('data', d => { const l = String(d).trim(); if (l.startsWith('ERR')) msg = l.slice(4); });
    p.stdout.on('data', d => {
      const l = String(d).trim();
      if (l.startsWith('READY')) { ok = true; vc = p; send(true, 'Live as “' + l.slice(6) + '”. Choose it as the camera in Zoom, Discord, Teams or OBS.'); }
      else if (l.startsWith('ERR')) msg = l.slice(4);
    });
    p.on('exit', () => { if (vc === p) { vc = null; send(false, 'Virtual camera stopped.'); } else if (!ok) next(); });
  };
  go(0);
}
ipcMain.on('vcam:start', startVcam);
ipcMain.on('vcam:stop', stopVcam);
ipcMain.on('vcam:frame', (e, b) => { if (vc && !vc.stdin.writableNeedDrain) vc.stdin.write(Buffer.from(b)); });
// Runs the bundled one-time setup script with a Windows admin prompt (UAC).
ipcMain.handle('vcam:setup', () => {
  const script = res('setup', 'install-virtualcam.ps1');
  if (process.platform !== 'win32') return { ok: false, error: 'Virtual camera setup is Windows-only.' };
  if (!fs.existsSync(script)) return { ok: false, error: 'Setup script not found in this build.' };
  try {
    spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${script}"'`], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

/* ---------------------------------------------------------------- accounts + library */
ipcMain.handle('auth:status', () => auth.status());
ipcMain.handle('auth:register', (e, a) => auth.register(a || {}));
ipcMain.handle('auth:login', (e, a) => auth.login(a || {}));
ipcMain.handle('auth:logout', () => auth.logout());
ipcMain.handle('auth:delete', (e, a) => auth.deleteAccount(a || {}));
ipcMain.handle('lib:load', () => auth.loadLibrary());
ipcMain.handle('lib:save', (e, l) => auth.saveLibrary(l));
ipcMain.handle('lib:export', async (e, lib) => {
  const r = await dialog.showSaveDialog(win, { title: 'Export my songs', defaultPath: 'chordclicks-songs.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, JSON.stringify(lib, null, 2)); return { ok: true, path: r.filePath };
});
ipcMain.handle('lib:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import songs', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try { return { ok: true, lib: JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')) }; } catch (err) { return { ok: false, error: 'That file is not a valid song export.' }; }
});
ipcMain.handle('app:version', () => app.getVersion());

/* ---------------------------------------------------------------- recordings, PDF, global hotkeys, cloud sync */
ipcMain.handle('rec:save', async (e, { name, data }) => {
  const safe = String(name || 'take.webm').replace(/[^\w.\- ]/g, '_');
  const r = await dialog.showSaveDialog(win, { title: 'Save recording', defaultPath: path.join(app.getPath('videos'), safe), filters: [{ name: 'WebM video/audio', extensions: ['webm'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, Buffer.from(data)); return { ok: true, path: r.filePath };
});
ipcMain.handle('pdf:save', async (e, { html, name }) => {
  const r = await dialog.showSaveDialog(win, { title: 'Save PDF', defaultPath: String(name || 'setlist.pdf').replace(/[^\w.\- ]/g, '_'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html)));
    fs.writeFileSync(r.filePath, await w.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, margins: { marginType: 'default' } }));
    return { ok: true, path: r.filePath };
  } catch (err) { return { ok: false, error: String(err.message || err) }; } finally { w.destroy(); }
});
// Global hotkeys: { action: 'CommandOrControl+Alt+Right', ... }. Works while the app is in the background.
ipcMain.handle('hk:set', (e, map) => {
  globalShortcut.unregisterAll(); const failed = [];
  Object.entries(map || {}).forEach(([action, acc]) => {
    if (!acc || typeof acc !== 'string') return;
    let ok = false; try { ok = globalShortcut.register(acc, () => { if (win && !win.isDestroyed()) win.webContents.send('hk:fire', action); }); } catch (err) {}
    if (!ok) failed.push(action);
  });
  return { ok: true, failed };
});
const syncFile = () => path.join(app.getPath('userData'), 'sync.json');
const readSync = () => { try { return JSON.parse(fs.readFileSync(syncFile(), 'utf8')); } catch (e) { return {}; } };
const goodUrl = u => { try { const x = new URL(u); return (x.protocol === 'https:' || (x.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname))) ? x.origin : ''; } catch (e) { return ''; } };
async function syncCall(base, p, body, token) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(20000) });
  return r.json();
}
ipcMain.handle('sync:status', () => { const c = readSync(); return { url: c.url || '', name: c.name || '', on: !!c.token }; });
ipcMain.handle('sync:login', async (e, { url, name, password, register }) => {
  const base = goodUrl(url); if (!base) return { ok: false, error: 'Server address must start with https:// (or http://localhost).' };
  try { const r = await syncCall(base, register ? '/api/register' : '/api/login', { name, password }); if (!r.ok) return r; fs.writeFileSync(syncFile(), JSON.stringify({ url: base, name: r.name, token: r.token })); return { ok: true, name: r.name }; }
  catch (err) { return { ok: false, error: 'Could not reach the server.' }; }
});
ipcMain.handle('sync:logout', () => { try { fs.unlinkSync(syncFile()); } catch (e) {} return { ok: true }; });
ipcMain.handle('sync:run', async (e, lib) => {
  const c = readSync(); if (!c.token) return { ok: false, error: 'Not connected.' };
  try { const r = await syncCall(c.url, '/api/sync', { lib }, c.token); return r; } catch (err) { return { ok: false, error: 'Could not reach the server.' }; }
});

/* ---------------------------------------------------------------- updates */
const REPO_API = 'https://api.github.com/repos/RileyPoirier23/chordclicks/releases/latest';
const RELEASES = 'https://github.com/RileyPoirier23/chordclicks/releases/latest';
const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};
// Portable .exe can't patch itself: tell the user and open the download page.
async function checkPortable() {
  try {
    const r = await fetch(REPO_API, { headers: { 'User-Agent': 'chordclicks' } }); if (!r.ok) return;
    const rel = await r.json(); if (!rel.tag_name || !newer(rel.tag_name, app.getVersion())) return;
    const { response } = await dialog.showMessageBox(win, { type: 'info', title: 'ChordClicks update', message: `ChordClicks ${rel.tag_name} is out. You're on v${app.getVersion()}.`, detail: 'Download the new portable .exe and replace this one. Your songs carry over.', buttons: ['Download', 'Later'], defaultId: 0 });
    if (response === 0) shell.openExternal(RELEASES);
  } catch (e) {}
}
// Installed copy: download in the background, offer a restart when ready.
function checkInstalled() {
  let autoUpdater; try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async info => {
    const { response } = await dialog.showMessageBox(win, { type: 'info', title: 'ChordClicks update', message: `ChordClicks v${info.version} is ready.`, detail: 'Restart now to update, or it installs next time you close the app.', buttons: ['Restart now', 'Later'], defaultId: 0 });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', () => {});
  autoUpdater.checkForUpdates().catch(() => {});
}

// One-time carry-over of songs/accounts from the old Chordify install.
function migrateFromChordify() {
  try {
    const now = app.getPath('userData'), old = path.join(app.getPath('appData'), 'Chordify');
    for (const f of ['accounts', 'sync.json']) {
      const from = path.join(old, f), to = path.join(now, f);
      if (fs.existsSync(from) && !fs.existsSync(to)) { fs.mkdirSync(now, { recursive: true }); fs.cpSync(from, to, { recursive: true }); }
    }
  } catch (e) {}
}

/* ---------------------------------------------------------------- window */
app.whenReady().then(() => {
  migrateFromChordify();
  auth = createAuth(app.getPath('userData'));

  const okp = ['media', 'fullscreen', 'pictureInPicture', 'midi'];
  session.defaultSession.setPermissionRequestHandler((wc, p, cb) => cb(okp.includes(p)));
  session.defaultSession.setPermissionCheckHandler((wc, p) => okp.includes(p));

  const ug = session.fromPartition('persist:ug');
  ug.setUserAgent(app.userAgentFallback.replace(/ Electron\/\S+/, '').replace(/ chordclicks\S*/i, ''));
  ug.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    let h = ''; try { h = new URL(d.url).hostname; } catch (e) {}
    cb({ cancel: BLOCK.some(b => h.includes(b)) });
  });

  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1040, minHeight: 680,
    backgroundColor: '#0b0b12', title: 'ChordClicks', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { webviewTag: true, preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  // Harden <webview>: the UG page never gets node access or our preload.
  win.webContents.on('will-attach-webview', (e, wp) => { delete wp.preload; wp.nodeIntegration = false; wp.contextIsolation = true; });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile('index.html');
  win.on('page-title-updated', e => e.preventDefault());
  if (app.isPackaged) setTimeout(() => (process.env.PORTABLE_EXECUTABLE_DIR ? checkPortable() : checkInstalled()), 5000);
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('before-quit', () => { stopVcam(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
