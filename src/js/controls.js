/* Controls: scenes, stream chat requests, hotkeys (keyboard / global / MIDI pedal), cloud sync UI, record button. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const $ = id => document.getElementById(id), R = window.rcc;
  const A = () => RCC.app, esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ================================================================ scenes */
  const SHOW = { chord: true, diagram: true, nextdiag: false, next: true, strum: true, chips: false, bpm: true, fret: true, queue: true, flash: true, brand: true };
  const DEFAULT_SCENES = {
    Teaching: { ov: { mode: 'banner', pos: 'tc', scale: 100, bg: 65, dim: 20, soloAuto: true, show: { ...SHOW, chips: true, nextdiag: true, brand: false } } },
    Performance: { ov: { mode: 'stage', pos: 'bc', scale: 100, bg: 50, dim: 35, soloAuto: true, show: { ...SHOW, diagram: false, strum: false } } },
    'Solo cam': { ov: { mode: 'pill', pos: 'tl', scale: 100, bg: 55, dim: 10, soloAuto: true, show: { ...SHOW, strum: false } } },
    Minimal: { ov: { mode: 'corner', pos: 'br', scale: 90, bg: 45, dim: 0, soloAuto: false, show: { ...SHOW, diagram: false, strum: false, next: false, brand: false } } },
  };
  let scenes = null, curScene = '';
  const names = () => Object.keys(scenes);
  function loadScenes() { scenes = lsGet('rcc-scenes', null); if (!scenes || !Object.keys(scenes).length) scenes = clone(DEFAULT_SCENES); curScene = lsGet('rcc-scene-cur', ''); }
  const saveScenes = () => { lsSet('rcc-scenes', scenes); lsSet('rcc-scene-cur', curScene); };
  function paintScenes() {
    const box = $('scenes'); if (!box) return;
    box.innerHTML = names().map((n, i) => `<span class="chip ${n === curScene ? 'on' : ''}" data-n="${esc(n)}">${i < 9 ? `<small style="opacity:.6">${i + 1}</small> ` : ''}${esc(n)}</span>`).join('');
    box.querySelectorAll('.chip').forEach(c => c.onclick = () => applyScene(c.dataset.n));
  }
  function applyScene(n) {
    if (typeof n === 'number') n = names()[n]; const s = scenes[n]; if (!s) return; const a = A();
    a.P.ov = Object.assign({}, a.P.ov, clone(s.ov)); a.P.ov.show = Object.assign({}, clone(SHOW), a.P.ov.show); if (s.mir != null) a.P.mir = s.mir;
    curScene = n; a.saveP(); saveScenes(); a.renderStreamUI(); paintScenes(); a.toast('Scene: ' + n);
  }
  async function saveScene() { const a = A(), n = await a.askText('Scene name', curScene || 'My scene'); if (!n) return; scenes[n] = { ov: clone(a.P.ov), mir: a.P.mir }; curScene = n; saveScenes(); paintScenes(); a.toast('Scene saved'); }
  async function delScene() { const a = A(); if (!curScene || !scenes[curScene]) return; if (names().length < 2) { a.toast('Keep at least one scene'); return; } if (await a.askConfirm('Delete scene “' + curScene + '”?')) { delete scenes[curScene]; curScene = ''; saveScenes(); paintScenes(); } }

  /* ================================================================ chat requests (Twitch, anonymous read-only) */
  const chat = (RCC.chat = { queue: [], ws: null, channel: '', on: false, cooldown: new Map() });
  const paintQ = () => {
    const box = $('ch-q'); if (!box) return;
    box.innerHTML = chat.queue.length ? chat.queue.map((r, i) => `<div class="row" style="margin:4px 0"><b style="min-width:20px">${i + 1}</b><span class="grow">${esc(r.title)} <span class="small">${r.by ? '· ' + esc(r.by) : ''}${r.songId ? '' : ' · not in library'}</span></span><button class="btn sm" data-p="${i}">Play</button><button class="btn sm" data-x="${i}">✕</button></div>`).join('') : '<div class="small" style="margin:6px 0">No requests yet.</div>';
    box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => playReq(+b.dataset.p)); box.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { chat.queue.splice(+b.dataset.x, 1); paintQ(); });
  };
  function playReq(i) {
    const r = chat.queue[i]; if (!r) return; const a = A(); chat.queue.splice(i, 1); paintQ();
    if (r.songId && a.Store.song(r.songId)) a.playList([r.songId], r.songId, 'Request'); else { a.show('find'); $('q').value = r.title; $('ug').click(); }
  }
  function addReq(by, query) {
    const a = A(), now = Date.now(), last = chat.cooldown.get(by) || 0; if (now - last < 15000 && by !== 'test') return; chat.cooldown.set(by, now);
    if (chat.queue.filter(r => r.by === by).length >= 2 || chat.queue.length >= 30) return;
    const hit = RCC.requests.matchSong(query, a.Store.lib.songs);
    if (!hit && $('ch-lib').checked) return; if (chat.queue.some(r => r.songId && hit && r.songId === hit.id)) return;
    chat.queue.push({ title: hit ? hit.title + (hit.artist ? ' – ' + hit.artist : '') : query, by, songId: hit && hit.id }); paintQ(); a.toast('Request: ' + query + ' (' + by + ')');
  }
  function connectChat() {
    const ch = $('ch-chan').value.trim().replace(/^#/, '').toLowerCase(); if (!/^[a-z0-9_]{3,25}$/.test(ch)) { $('ch-stat').textContent = 'Enter your Twitch channel name (letters, numbers, underscore).'; return; }
    disconnectChat(); lsSet('rcc-chan', ch); chat.channel = ch; $('ch-stat').textContent = 'Connecting…';
    let ws; try { ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); } catch (e) { $('ch-stat').textContent = 'Could not open a connection.'; return; }
    chat.ws = ws; ws.onopen = () => { ws.send('CAP REQ :twitch.tv/tags'); ws.send('PASS SCHMOOPIIE'); ws.send('NICK justinfan' + Math.floor(10000 + Math.random() * 80000)); ws.send('JOIN #' + ch); };
    ws.onmessage = ev => String(ev.data).split('\r\n').filter(Boolean).forEach(line => {
      if (/ 366 /.test(line) || /:End of \/NAMES/.test(line)) { chat.on = true; $('ch-stat').textContent = 'Listening to #' + ch + ' — viewers type !request Song name'; $('ch-conn').textContent = 'Disconnect'; }
      const m = RCC.requests.parseIrc(line); if (!m) return; if (m.ping) { ws.send('PONG :tmi.twitch.tv'); return; }
      const prefixes = $('ch-pref').value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean), q = RCC.requests.parseCommand(m.text, prefixes); if (q) addReq(m.nick, q);
    });
    ws.onclose = () => { if (chat.ws === ws) { chat.on = false; chat.ws = null; $('ch-conn').textContent = 'Connect'; $('ch-stat').textContent = 'Disconnected.'; } };
    ws.onerror = () => { $('ch-stat').textContent = 'Connection failed (check the channel name and your network).'; };
  }
  function disconnectChat() { if (chat.ws) { const w = chat.ws; chat.ws = null; try { w.close(); } catch (e) {} } chat.on = false; $('ch-conn').textContent = 'Connect'; }

  /* ================================================================ hotkeys */
  const ACTIONS = [['next', 'Next chord'], ['prev', 'Previous chord'], ['startstop', 'Start / stop'], ['nextsong', 'Next song'], ['scene1', 'Scene 1'], ['scene2', 'Scene 2'], ['scene3', 'Scene 3'], ['scene4', 'Scene 4'], ['record', 'Record on/off'], ['looper', 'Looper record/play'], ['tap', 'Tap tempo'], ['bpmup', 'Tempo +5'], ['bpmdn', 'Tempo −5']];
  const DEF = { keys: { next: 'ArrowRight', prev: 'ArrowLeft', startstop: 'Space', scene1: 'Alt+Digit1', scene2: 'Alt+Digit2', scene3: 'Alt+Digit3', scene4: 'Alt+Digit4', record: 'Alt+KeyR', looper: 'Alt+KeyL' }, global: {}, midi: {} };
  let hk = null, learn = null;
  const loadHk = () => { hk = Object.assign(clone(DEF), lsGet('rcc-hk', {})); };
  const saveHk = () => { lsSet('rcc-hk', hk); pushGlobal(); };
  const comboOf = e => { const m = []; if (e.ctrlKey) m.push('Ctrl'); if (e.altKey) m.push('Alt'); if (e.shiftKey) m.push('Shift'); if (e.metaKey) m.push('Meta'); if (/^(Control|Alt|Shift|Meta)/.test(e.code)) return ''; return [...m, e.code].join('+'); };
  const pretty = c => String(c || '').replace(/Key|Digit/g, '').replace('Arrow', '').replace('Space', 'Space');
  const accel = e => { const m = []; if (e.ctrlKey || e.metaKey) m.push('CommandOrControl'); if (e.altKey) m.push('Alt'); if (e.shiftKey) m.push('Shift'); if (/^(Control|Alt|Shift|Meta)/.test(e.code)) return ''; const k = e.code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace(/^Numpad(\d)$/, 'num$1'); return m.length || /^F\d+$/.test(k) || /^Page|^Media|^Home|^End/.test(k) ? [...m, k].join('+') : ''; };
  function fire(a) {
    const app = A(), solo = $('v-solo').classList.contains('on');
    if (a === 'next') app.nav(1); else if (a === 'prev') app.nav(-1);
    else if (a === 'startstop') { if (solo) $('solo-play').click(); else app.toggle(); }
    else if (a === 'nextsong') $('sn').click(); else if (/^scene\d$/.test(a)) applyScene(+a.slice(5) - 1);
    else if (a === 'record') RCC.gear.toggleRecord(); else if (a === 'looper') RCC.gear.toggleLoop();
    else if (a === 'tap') $('tap').click(); else if (a === 'bpmup') app.setBpm(app.P.bpm + 5); else if (a === 'bpmdn') app.setBpm(app.P.bpm - 5);
  }
  function pushGlobal() { if (R && R.setHotkeys) R.setHotkeys(hk.global).then(r => { if (r && r.failed && r.failed.length) A().toast('Global hotkey already used by another app: ' + r.failed.map(f => (ACTIONS.find(x => x[0] === f) || [])[1]).join(', ')); }); }
  function paintHk() {
    const box = $('hk-table'); if (!box) return;
    box.innerHTML = '<table class="hk"><tr><th></th><th>Key</th><th>Global</th><th>Foot pedal (MIDI)</th></tr>' + ACTIONS.map(([id, lab]) => { const mi = hk.midi[id]; return `<tr><td>${lab}</td><td><button class="hkb" data-a="${id}" data-k="keys">${hk.keys[id] ? pretty(hk.keys[id]) : '—'}</button></td><td><button class="hkb" data-a="${id}" data-k="global" ${R ? '' : 'disabled'}>${hk.global[id] || '—'}</button></td><td><button class="hkb" data-a="${id}" data-k="midi">${learn && learn.a === id ? 'press pedal…' : mi ? mi.t.toUpperCase() + ' ' + mi.n : 'Learn'}</button></td></tr>`; }).join('') + '</table>';
    box.querySelectorAll('.hkb').forEach(b => { b.onclick = () => { learn = { a: b.dataset.a, k: b.dataset.k }; paintHk(); if (b.dataset.k === 'midi') initMidi(); }; b.oncontextmenu = e => { e.preventDefault(); const a = b.dataset.a, k = b.dataset.k; delete hk[k][a]; saveHk(); paintHk(); }; });
  }
  document.addEventListener('keydown', e => {
    if (learn && learn.k !== 'midi') { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { learn = null; paintHk(); return; } const v = learn.k === 'keys' ? comboOf(e) : accel(e); if (!v) { if (learn.k === 'global' && !/^(Control|Alt|Shift|Meta)/.test(e.code)) A().toast('Global keys need Ctrl/Alt, or a function/media key'); return; } hk[learn.k][learn.a] = v; learn = null; saveHk(); paintHk(); return; }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || $('modal').classList.contains('on')) return;
    const c = comboOf(e); if (!c) return;
    let act = Object.keys(hk.keys).find(a => hk.keys[a] === c); if (!act) act = { PageDown: 'next', PageUp: 'prev' }[c]; // page-turner pedals
    if (!act) return; if ($('v-solo').classList.contains('on') && act === 'startstop') return; // Solo handles Space itself
    if ((act === 'next' || act === 'prev') && !$('v-practice').classList.contains('on')) return;
    e.preventDefault(); fire(act);
  }, true);
  document.addEventListener('keyup', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !$('modal').classList.contains('on')) e.preventDefault(); }, true);
  if (R && R.onHotkey) R.onHotkey(a => fire(a));

  let midiAcc = null, lastMidi = 0;
  async function initMidi() {
    if (midiAcc) return; if (!navigator.requestMIDIAccess) { $('hk-midi').textContent = 'MIDI: not supported here'; return; }
    try { midiAcc = await navigator.requestMIDIAccess(); } catch (e) { $('hk-midi').textContent = 'MIDI: permission denied'; return; }
    const bind = () => { let n = 0; midiAcc.inputs.forEach(inp => { inp.onmidimessage = onMidi; n++; }); $('hk-midi').textContent = n ? `MIDI: ${n} device${n > 1 ? 's' : ''} connected` : 'MIDI: no device found — plug in your pedal'; };
    midiAcc.onstatechange = bind; bind();
  }
  function onMidi(ev) {
    const [st, n, v] = ev.data, type = st & 0xf0, ch = st & 15; let t = null;
    if (type === 0xb0 && v > 0) t = 'cc'; else if (type === 0x90 && v > 0) t = 'note'; else if (type === 0xc0) t = 'pc'; if (!t) return;
    if (learn && learn.k === 'midi') { hk.midi[learn.a] = { t, ch, n }; learn = null; saveHk(); paintHk(); return; }
    const now = performance.now(); if (now - lastMidi < 140) return; const act = Object.keys(hk.midi).find(a => { const m = hk.midi[a]; return m.t === t && m.n === n && m.ch === ch; }); if (act) { lastMidi = now; fire(act); }
  }

  /* ================================================================ cloud sync UI */
  let syncSt = { on: false, url: '', name: '' }, syncT = null, lastSync = 0;
  async function paintSync() {
    const box = $('sync-body'); if (!box) return;
    if (!R || !R.sync) { box.innerHTML = '<div class="small">Cloud sync needs the desktop app and a sync server you run (see README → Cloud sync).</div>'; return; }
    syncSt = await R.sync.status();
    box.innerHTML = syncSt.on ? `<div class="small">Connected to <b style="color:var(--fg)">${esc(syncSt.url)}</b> as <b style="color:var(--fg)">${esc(syncSt.name)}</b>.${lastSync ? ' Last sync ' + new Date(lastSync).toLocaleTimeString() + '.' : ''}</div><div class="row"><button class="btn p" id="sy-now">Sync now</button><button class="btn" id="sy-out">Disconnect</button></div>`
      : `<div class="small">Keeps your songs, playlists, known chords and stats in step across computers. You need to run the small sync server (<code>node server/server.js</code>) somewhere you control.</div><div class="row"><input id="sy-url" class="grow" placeholder="https://your-server.example.com" value="${esc(lsGet('rcc-sync-url', ''))}"></div><div class="row"><input id="sy-name" class="grow" placeholder="Sync username"><input id="sy-pw" type="password" class="grow" placeholder="Password (8+ chars)"></div><div class="row"><button class="btn p" id="sy-in">Sign in</button><button class="btn" id="sy-reg">Create sync account</button></div><div class="err" id="sy-err"></div>`;
    if (syncSt.on) { $('sy-now').onclick = () => doSync(true); $('sy-out').onclick = async () => { await R.sync.logout(); paintSync(); }; }
    else { const go = async reg => { lsSet('rcc-sync-url', $('sy-url').value.trim()); const r = await R.sync.login({ url: $('sy-url').value.trim(), name: $('sy-name').value, password: $('sy-pw').value, register: reg }); if (r.ok) { await paintSync(); doSync(true); } else $('sy-err').textContent = r.error || 'Failed'; }; $('sy-in').onclick = () => go(false); $('sy-reg').onclick = () => go(true); }
  }
  async function doSync(manual) {
    if (!syncSt.on) return; const r = await A().Store.syncNow(); if (r && r.ok) { lastSync = Date.now(); if (manual) A().toast('Synced ✓'); paintSync(); } else if (manual) A().toast((r && r.error) || 'Sync failed');
  }
  function watchSync() { A().Store.on(() => { if (!syncSt.on) return; clearTimeout(syncT); syncT = setTimeout(() => doSync(false), 8000); }); }

  /* ================================================================ record button in the header */
  function wireRec() {
    $('recb').onclick = () => RCC.gear.toggleRecord();
    setInterval(() => { const on = RCC.audio.recorder.active(); $('recb').classList.toggle('rec', on); $('recb').textContent = on ? '■ ' + Math.floor(RCC.audio.recorder.elapsed() / 60) + ':' + String(Math.floor(RCC.audio.recorder.elapsed() % 60)).padStart(2, '0') : '● Rec'; }, 500);
  }

  function init() {
    loadScenes(); loadHk(); paintScenes(); paintHk(); wireRec();
    $('scene-save').onclick = saveScene; $('scene-del').onclick = delScene;
    $('ch-chan').value = lsGet('rcc-chan', ''); $('ch-conn').onclick = () => (chat.ws ? disconnectChat() : connectChat());
    $('ch-next').onclick = () => playReq(0); $('ch-clear').onclick = () => { chat.queue.length = 0; paintQ(); }; $('ch-test').onclick = () => { const s = A().Store.lib.songs[0]; addReq('test', s ? s.title : 'Wonderwall'); if (!chat.queue.length) chat.queue.push({ title: 'Wonderwall – Oasis', by: 'test', songId: null }); paintQ(); };
    $('hk-reset').onclick = () => { hk = clone(DEF); saveHk(); paintHk(); }; paintQ(); pushGlobal(); paintSync(); watchSync();
    if (Object.keys(hk.midi).length) initMidi();
    setTimeout(() => doSync(false), 3000);
  }
  RCC.controls = { init, applyScene, fire, paintSync };
})();
