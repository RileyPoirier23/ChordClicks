/* ChordClicks Pro: free vs Pro features, a 7-day trial, and licence keys verified offline (ECDSA P-256).
   Keys are issued with scripts/licence.mjs; nothing phones home. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const PUBLIC_KEY = {"kty":"EC","crv":"P-256","x":"G1dhm9SI0mAggizQris29lCNSWP6fRN2jzwJtfcWuwE","y":"KFrOAIBjT02vpwwungi3MOk8ENmemMG-Svc-8esiStM"};
  const SITE = 'https://www.506clicks.ca', TRIAL_DAYS = 7, FREE_SONGS = 20;
  /* Checkout details come from the website (Settings the owner publishes from the panel): whether buying is open yet,
     the checkout link (Square) and the price. Cached so the app behaves the same offline. */
  const lsGetRaw = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const cfg = Object.assign({ proLive: false, buy: SITE + '/projects/chordclicks/#pro', price: '$24.99' }, lsGetRaw('rcc-procfg', {}));
  const live = () => !!cfg.proLive && !!cfg.buy;
  async function syncConfig() {
    if (navigator.onLine === false) return;
    try { const j = await fetch(SITE + '/api/content', { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then(r => r.json()); const c = (j && j.chordclicks) || {};
      Object.assign(cfg, { proLive: !!c.proLive, buy: c.buy || cfg.buy, price: c.price || cfg.price, promo: c.promo || '' }); try { localStorage.setItem('rcc-procfg', JSON.stringify(cfg)); } catch (e) {} emit(); } catch (e) {}
  }
  const FEATURES = [
    ['score', 'Play-along scoring', 'Score me and Wait-for-me in Solo: the app listens and grades every note.'],
    ['trainer', 'Smart trainers', 'Tempo ramps, chord checking while you practice, the chord-change trainer and full ear training.'],
    ['looper', 'Looper', 'Sample-accurate loops and overdubs recorded after your pedals and amp.'],
    ['stream', 'Streaming kit', 'Virtual camera for Zoom / OBS / Discord, scenes with hotkeys, Twitch song requests.'],
    ['neck', 'Arpeggios, triads & CAGED', 'The whole neck beyond scales: arpeggio shapes, triad sets and inversions, the five CAGED positions.'],
    ['library', 'Unlimited library', `Save more than ${FREE_SONGS} songs, with set lists, gig notes and PDF export.`],
    ['finger', 'All fingerpicking patterns', 'Every pattern in the Fingerpicking room, not just the first three.'],
    ['sync', 'Cloud sync', 'Keep songs, playlists and progress in step across computers and phones.'],
  ];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FEATURE_OF = Object.fromEntries(FEATURES.map(f => [f[0], f]));
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const st = { lic: lsGet('rcc-pro', null), trial: lsGet('rcc-trial', null), valid: false, checked: false, _l: [] };
  const b64u = s => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const emit = () => st._l.forEach(f => { try { f(); } catch (e) {} });

  async function verify(key) {
    const m = /^CCPRO-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(key || '').trim()); if (!m) return { ok: false, error: 'That doesn’t look like a ChordClicks key (CCPRO-…).' };
    let payload; try { payload = JSON.parse(new TextDecoder().decode(b64u(m[1]))); } catch (e) { return { ok: false, error: 'Key is damaged — paste it again in one piece.' }; }
    if (PUBLIC_KEY.x === 'REPLACE_ME') return { ok: false, error: 'This build has no licence key installed yet.' };
    try {
      const pub = await crypto.subtle.importKey('jwk', { ...PUBLIC_KEY, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u(m[2]), new TextEncoder().encode(m[1]));
      if (!ok) return { ok: false, error: 'This key isn’t valid.' };
    } catch (e) { return { ok: false, error: 'Could not check the key here.' }; }
    if (payload.x && Date.now() > payload.x) return { ok: false, error: 'This key has expired.' };
    return { ok: true, name: payload.n || '', email: payload.e || '', until: payload.x || 0 };
  }
  const trialLeft = () => { if (!st.trial || !st.trial.start) return 0; return Math.max(0, Math.ceil((st.trial.start + TRIAL_DAYS * 864e5 - Date.now()) / 864e5)); };
  const trialUsed = () => !!(st.trial && st.trial.start);
  const has = () => st.valid || trialLeft() > 0;
  const status = () => st.valid ? { kind: 'pro', label: 'Pro · ' + (st.lic.name || 'licensed'), name: st.lic.name } : trialLeft() > 0 ? { kind: 'trial', label: `Pro trial · ${trialLeft()} day${trialLeft() === 1 ? '' : 's'} left`, days: trialLeft() } : { kind: 'free', label: trialUsed() ? 'Free · trial ended' : 'Free' };

  /** Startup splash for the free tier: every third launch (never twice a day), rotating the three Pro messages. */
  const SPLASH = [
    ['Stop guessing. Get scored.', 'Pro listens while you play the solo and grades every note. Wait-for-me holds the tab until you nail it.', 'score'],
    ['Learn it. Prove it.', 'Chord-change drills with a stopwatch, full ear training, every arpeggio, triad and CAGED shape on the neck.', 'trainer'],
    ['Teach on camera.', 'Virtual camera for Zoom and OBS, scenes with hotkeys, Twitch song requests, unlimited library and set lists.', 'stream'],
  ];
  function splash(force) {
    if (!force) { if (has()) return false; const n = (lsGetRaw('rcc-launch', 0) | 0) + 1; lsSet('rcc-launch', n); const last = lsGetRaw('rcc-splash-at', 0); if (n % 3 !== 0 || Date.now() - last < 20 * 3600e3) return false; lsSet('rcc-splash-at', Date.now()); }
    const a = RCC.app; if (!a) return false; const [h, p, f] = SPLASH[Math.floor(Math.random() * SPLASH.length)];
    a.dialog(`<div class="pro-splash"><span class="pro-tag big">PRO</span><h2>${h}</h2><p>${p}</p>
      <ul class="pro-list compact">${FEATURES.map(x => `<li class="${x[0] === f ? 'hl' : ''}"><b>${a.esc(x[1])}</b></li>`).join('')}</ul>
      <div class="row" style="justify-content:space-between;margin-top:12px;gap:8px"><div class="row" style="margin:0;gap:8px">${trialUsed() ? '' : `<button class="btn p" id="sp-trial">Try Pro free for ${TRIAL_DAYS} days</button>`}${live() ? `<a class="btn ${trialUsed() ? 'p' : ''}" href="${a.esc(cfg.buy)}" target="_blank" rel="noreferrer">Buy Pro · ${a.esc(cfg.price)} once</a>` : ''}</div><button class="btn ghost" id="sp-x">Not now</button></div>
      <div class="small" style="margin-top:8px">${live() ? 'No subscription. Works offline on all your devices.' : 'Keys go on sale soon. Everything stays free to practise with.'}</div></div>`, () => {
      document.getElementById('sp-x').onclick = a.closeDlg; const t = document.getElementById('sp-trial'); if (t) t.onclick = () => { startTrial(); a.closeDlg(); a.toast(`Pro trial started — ${TRIAL_DAYS} days of everything`); };
    });
    return true;
  }
  async function init() {
    syncConfig(); if (st.lic && st.lic.key) { const r = await verify(st.lic.key); st.valid = r.ok; if (r.ok) { st.lic.name = r.name; lsSet('rcc-pro', st.lic); } } st.checked = true; emit(); }
  async function activate(key) { const r = await verify(key); if (r.ok) { st.lic = { key: String(key).trim(), name: r.name, since: Date.now() }; st.valid = true; lsSet('rcc-pro', st.lic); emit(); } return r; }
  function deactivate() { st.lic = null; st.valid = false; try { localStorage.removeItem('rcc-pro'); } catch (e) {} emit(); }
  function startTrial() { if (trialUsed()) return false; st.trial = { start: Date.now() }; lsSet('rcc-trial', st.trial); emit(); return true; }

  /** Run fn when Pro (or trial) is active, otherwise show the upsell for that feature. Returns true when fn ran. */
  function gate(feature, fn) {
    if (has()) { fn && fn(); return true; }
    upsell(feature); return false;
  }
  function upsell(feature) {
    const a = RCC.app; if (!a) return; const f = FEATURE_OF[feature], esc = a.esc;
    a.dialog(`<div class="pro-head"><span class="pro-tag big">PRO</span><h2>${f ? esc(f[1]) : 'ChordClicks Pro'}</h2></div>
      <p class="small" style="margin:4px 0 12px;line-height:1.5">${f ? esc(f[2]) : 'Everything that turns practice into progress.'} ${trialUsed() ? '' : `Try everything free for ${TRIAL_DAYS} days — no card, no account.`}</p>
      <ul class="pro-list">${FEATURES.map(x => `<li class="${x[0] === feature ? 'hl' : ''}"><b>${esc(x[1])}</b><span>${esc(x[2])}</span></li>`).join('')}</ul>
      <div class="row" style="justify-content:space-between;margin-top:14px;gap:8px"><div class="row" style="margin:0;gap:8px">${trialUsed() ? '' : `<button class="btn p" id="pro-trial">Start ${TRIAL_DAYS}-day trial</button>`}${live() ? `<a class="btn ${trialUsed() ? 'p' : ''}" href="${esc(cfg.buy)}" target="_blank" rel="noreferrer">Buy Pro · ${esc(cfg.price)} once</a>` : ''}</div><button class="btn ghost" id="pro-key">I have a key</button></div>
      <div class="small" style="margin-top:10px">${live() ? 'One payment, yours forever, works offline. Your key comes by email.' : 'Pro keys go on sale soon at 506clicks.ca. The trial is the full thing in the meantime.'}</div>`, () => {
      const t = document.getElementById('pro-trial'); if (t) t.onclick = () => { startTrial(); a.closeDlg(); a.toast(`Pro trial started — ${TRIAL_DAYS} days of everything`); };
      document.getElementById('pro-key').onclick = () => keyDialog();
    });
  }
  function keyDialog() {
    const a = RCC.app;
    a.dialog(`<h2>Enter your Pro key</h2><div class="small">It starts with <b>CCPRO-</b>. Paste the whole thing.</div><div class="row" style="margin-top:12px"><input id="pro-in" class="grow" placeholder="CCPRO-…" spellcheck="false" autocomplete="off"></div><div class="err" id="pro-err"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="pro-c">Cancel</button><button class="btn p" id="pro-go">Activate</button></div>`, () => {
      const i = document.getElementById('pro-in'); i.focus();
      document.getElementById('pro-c').onclick = a.closeDlg;
      const go = async () => { const r = await activate(i.value); if (r.ok) { a.closeDlg(); a.toast('Pro activated' + (r.name ? ' — thanks, ' + r.name : '') + ' 🎉'); } else document.getElementById('pro-err').textContent = r.error; };
      document.getElementById('pro-go').onclick = go; i.onkeydown = e => { if (e.key === 'Enter') go(); };
    });
  }
  /** Small PRO tags next to gated controls while on the free tier. */
  function mark(el, feature) { if (!el) return; let t = el.querySelector(':scope > .pro-tag'); if (has()) { t && t.remove(); return; } if (!t) { t = document.createElement('span'); t.className = 'pro-tag'; t.textContent = 'PRO'; t.title = (FEATURE_OF[feature] || [])[1] || 'ChordClicks Pro'; el.appendChild(t); } }
  const canAddSong = count => has() || count < FREE_SONGS;

  RCC.pro = { init, has, status, gate, upsell, keyDialog, activate, deactivate, startTrial, trialLeft, trialUsed, mark, canAddSong, splash, live, config: () => cfg, FEATURES, FREE_SONGS, TRIAL_DAYS, get PRICE() { return cfg.price; }, get BUY_URL() { return cfg.buy; }, onChange: f => st._l.push(f) };
})();
