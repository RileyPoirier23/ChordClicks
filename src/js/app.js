/* ChordClicks – main renderer script: wires views, library, import, metronome, overlay, accounts. */
(function () {
  const RCC = window.RCC, T = RCC.theory, SG = RCC.song, Store = RCC.store, OV = RCC.overlay, R = window.rcc;
  const $ = id => document.getElementById(id), root = document.documentElement;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const DEFAULT_PAT = 'D-DU-UDU';
  const ACCENTS = ['#8b5cf6', '#ec4899', '#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#f87171'];

  /* ================================================================ settings */
  const P = Object.assign({ accent: '#8b5cf6', fs: 17, asr: 0, mir: false, bpm: 90, beats: 4, sub: 2, vol: .7, autoc: true, follow: true, autopat: true, motion: true, impGenre: '' },
    (() => { try { return JSON.parse(localStorage.getItem('rcc2') || '{}'); } catch (e) { return {}; } })());
  P.ov = Object.assign({}, OV.DEFAULTS, P.ov || {}); P.ov.show = Object.assign({}, OV.DEFAULTS.show, (P.ov || {}).show || {});
  const saveP = () => { try { localStorage.setItem('rcc2', JSON.stringify(P)); } catch (e) {} };

  let toastT; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3400); }

  /* ================================================================ dialogs + menus */
  let onCancel = null;
  function dialog(html, mount, cancel) { $('dlg').innerHTML = html; $('modal').classList.add('on'); onCancel = cancel || null; mount && mount(); }
  function closeDlg() { $('modal').classList.remove('on'); onCancel = null; }
  $('modal').addEventListener('mousedown', e => { if (e.target === $('modal')) { const c = onCancel; closeDlg(); c && c(); } });
  function askText(title, val = '', ok = 'Save') {
    return new Promise(res => dialog(`<h2>${esc(title)}</h2><div class="row"><input id="ask-i" value="${esc(val)}" maxlength="60"></div><div class="row" style="justify-content:flex-end"><button class="btn" id="ask-c">Cancel</button><button class="btn p" id="ask-ok">${esc(ok)}</button></div>`, () => {
      const i = $('ask-i'); i.focus(); i.select(); const done = v => { closeDlg(); res(v); };
      $('ask-ok').onclick = () => done(i.value.trim()); $('ask-c').onclick = () => done(null);
      i.onkeydown = e => { if (e.key === 'Enter') done(i.value.trim()); else if (e.key === 'Escape') done(null); };
    }, () => res(null)));
  }
  function askConfirm(msg, ok = 'Delete') {
    return new Promise(res => dialog(`<h2>${esc(msg)}</h2><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="ask-c">Cancel</button><button class="btn p" id="ask-ok">${esc(ok)}</button></div>`, () => {
      $('ask-ok').onclick = () => { closeDlg(); res(true); }; $('ask-c').onclick = () => { closeDlg(); res(false); };
    }, () => res(false)));
  }
  let menuEl = null;
  function menu(x, y, items) {
    closeMenu(); menuEl = document.createElement('div'); menuEl.className = 'menu';
    items.forEach(it => { const d = document.createElement('div'); if (it.hr) { menuEl.appendChild(document.createElement('hr')); return; } if (it.hd) { d.className = 'hd'; d.textContent = it.label; menuEl.appendChild(d); return; } d.innerHTML = (it.check ? '✓ ' : '') + esc(it.label); d.onclick = () => { closeMenu(); it.fn(); }; menuEl.appendChild(d); });
    document.body.appendChild(menuEl);
    const r = menuEl.getBoundingClientRect(); menuEl.style.left = Math.min(x, innerWidth - r.width - 10) + 'px'; menuEl.style.top = Math.min(y, innerHeight - r.height - 10) + 'px';
  }
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  document.addEventListener('mousedown', e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });

  /* ================================================================ audio */
  const audio = () => RCC.audio.get();
  function clickAt(t, acc, sub) { RCC.audio.click(t, acc, sub, P.vol); }

  /* ================================================================ song state */
  let song = null, sheet = { lines: [], prog: [] }, prog = [], pi = 0, pat = [], stepNow = -1, strums = [], running = false;
  let queue = { label: '', ids: [], idx: -1 }, stageLines = [];
  const tempSong = (title, text, extra) => Object.assign({ id: null, title, artist: '', genre: '', text, strums: [], pat: '', bpm: 0, temp: true }, extra || {});

  function loadSong(s) {
    if (running) toggle();
    song = s; $('paste').value = s.text || '';
    strums = (s.strums && s.strums.length) ? s.strums : SG.findStrumsInText(s.text || '');
    parseSheet();
    const first = SG.strumForSection(strums, prog[0] && prog[0].sec);
    const p = s.pat || (first && first.pat) || DEFAULT_PAT;
    setPattern(p, { quiet: true });
    const b = s.bpm || (first && first.bpm); if (b) setBpm(b);
    pi = 0; schedPi = 0; showChord(); renderSongHeader(); renderPatSel();
    RCC.solo.setSong(s);
    renderLib();
  }
  function parseSheet() {
    sheet = SG.parseSheet($('paste').value); prog = sheet.prog;
    $('sheet').innerHTML = renderSheetHTML(sheet);
    $('sheet').querySelectorAll('.c').forEach(e => e.onclick = () => setPi(+e.dataset.pi)); renderLoopSel(); stageLines = SG.stageLines(sheet); renderNewChords();
    const seen = new Map(); prog.forEach((p, i) => { if (p.sec && !seen.has(p.sec)) seen.set(p.sec, i); });
    $('secs').innerHTML = [...seen].map(([s, i]) => `<span class="chip" data-i="${i}">${esc(s)}</span>`).join('');
    $('secs').querySelectorAll('.chip').forEach(c => c.onclick = () => { setPi(+c.dataset.i); showChord(true); });
  }
  function renderSheetHTML(sh) {
    if (!sh.lines.some(l => l.text.trim())) return '<span class="small">Nothing here yet. Use Edit to paste a chord sheet, or import one from Find.</span>';
    return sh.lines.map(l => {
      if (l.kind === 'section') return `<span class="sec">${esc(l.text)}</span>`;
      if (l.kind === 'tab') return `<span class="tabl">${esc(l.text)}</span>`;
      if (l.kind === 'chords') { let out = '', at = 0; l.toks.forEach(t => { out += esc(l.text.slice(at, t.s)) + `<span class="c" data-pi="${t.pi}">${esc(t.c)}</span>`; at = t.e; }); return out + esc(l.text.slice(at)); }
      return esc(l.text);
    }).join('\n');
  }
  function renderSongHeader() {
    const s = song || {}, m = s.meta || {}, bits = [s.artist, s.genre, m.key && 'Key ' + m.key, m.capo && 'Capo ' + m.capo, m.tuning && !/standard/i.test(m.tuning) && m.tuning, s.bpm && s.bpm + ' bpm'].filter(Boolean);
    $('np-t').textContent = s.title || 'No song loaded'; $('np-s').textContent = bits.join(' · ') || 'Search Ultimate Guitar or open your library';
    $('sh-title').textContent = s.title ? s.title : 'Chord sheet';
    const qi = queue.ids.length ? queue.ids.indexOf(s.id) : -1;
    $('qinfo').textContent = qi >= 0 ? `${queue.label} · ${qi + 1}/${queue.ids.length}` : '';
    $('sp').disabled = $('sn').disabled = !(qi >= 0 && queue.ids.length > 1);
  }

  function renderNewChords() {
    const names = [...new Set(prog.map(p => p.c))], un = RCC.chords ? RCC.chords.unknown(names) : [];
    $('newch').innerHTML = un.length && song && !song.temp ? '<span class="small" style="margin-right:2px">New chords:</span>' + un.slice(0, 6).map(n => `<span class="chip" data-n="${esc(n)}" title="Open in the chord library">${esc(n)}</span>`).join('') : '';
    $('newch').querySelectorAll('.chip').forEach(c => c.onclick = () => { RCC.learn.openChord(c.dataset.n); show('learn'); });
  }

  /* ---- chord display ---- */
  function showChord(scrollSheet) {
    const c = prog[pi] ? prog[pi].c : '—', n = prog.length ? prog[(pi + 1) % prog.length].c : '—';
    const el = $('cur'); if (el.textContent !== c) { el.textContent = c; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    $('nxt').textContent = 'Next ' + n;
    const sec = prog[pi] && prog[pi].sec; $('sectag').style.display = sec ? '' : 'none'; $('sectag').textContent = sec || '';
    RCC.fret.chordDiagram($('cdiag').getContext('2d'), 260, 300, T.chordShape(c), P.accent);
    document.querySelectorAll('#sheet .c').forEach(e => e.classList.toggle('hl', +e.dataset.pi === pi)); paintLoop && paintLoop();
    document.querySelectorAll('#secs .chip').forEach(e => e.classList.toggle('on', sec && e.textContent === sec));
    if ((P.follow || scrollSheet) && $('v-practice').classList.contains('on')) {
      const t = document.querySelector('#sheet .c.hl'), sh = $('sheet');
      if (t) { const y = t.getBoundingClientRect().top - sh.getBoundingClientRect().top + sh.scrollTop; sh.scrollTo({ top: y - sh.clientHeight / 2, behavior: 'smooth' }); }
    }
    if (P.autopat && strums.length > 1 && sec) { const sp = SG.strumForSection(strums, sec); if (sp && sp.pat !== pat.join('')) setPattern(sp.pat, { quiet: true, keepBpm: true }); }
  }
  const nav = d => { if (prog.length) setPi((pi + d + prog.length) % prog.length); };

  /* ---- strumming pattern ---- */
  function setPattern(str, o = {}) {
    pat = SG.parseStrumString(str); if (!pat.length) pat = SG.parseStrumString(DEFAULT_PAT);
    $('pat').value = pat.join('');
    $('strum').innerHTML = pat.map(c => `<div class="st ${c === 'D' ? 'd' : c === 'U' ? 'u' : ''}">${c === 'D' ? '↓' : c === 'U' ? '↑' : '·'}</div>`).join('');
    const b = +$('beats').value; if (pat.length % b === 0 && pat.length / b >= 1 && pat.length / b <= 4) { P.sub = pat.length / b; $('sub').value = P.sub; }
    const fm = strums.find(x => x.pat === pat.join('') && x.sub); if (fm && fm.sub) { P.sub = fm.sub; $('sub').value = fm.sub; }
    if (!o.quiet) toast('Pattern: ' + pat.join(''));
    renderPatSel();
  }
  function renderPatSel() {
    const cur = pat.join(''), opts = strums.map((s, i) => `<option value="${i}">${esc((s.part || 'Pattern ' + (i + 1)) + '  ' + s.pat)}</option>`);
    const idx = strums.findIndex(s => s.pat === cur);
    $('patsel').innerHTML = (idx < 0 ? '<option value="-1">Custom</option>' : '') + (opts.join('') || '<option value="-1">No saved patterns</option>');
    $('patsel').value = String(idx);
  }
  $('patsel').onchange = e => { const s = strums[+e.target.value]; if (s) { setPattern(s.pat, { quiet: true }); if (s.bpm) setBpm(s.bpm); } };
  $('pat').onchange = e => setPattern(e.target.value);
  $('patsave').onclick = () => {
    const p = pat.join(''); if (!song) return;
    const list = (song.strums && song.strums.length ? song.strums : strums).slice(); if (!list.some(s => s.pat === p)) list.push({ part: '', pat: p, bpm: 0, sub: P.sub, src: 'user' });
    song.strums = list; song.pat = p; strums = list;
    if (song.id) Store.updateSong(song.id, { strums: list, pat: p }); renderPatSel(); toast('Pattern saved to ' + (song.title || 'song'));
  };

  /* ================================================================ metronome + trainer */
  const TR = Object.assign({ loop: 'off', ramp: false, rampStart: 60, speed: 100, pass: 0, listen: false, silent: false, silPlay: 3, silMute: 1, backing: false, bstyle: 'rock', bvol: .6, bcomp: false, flash: true, acc: 'Xxxx' }, P.tr || {});
  TR.loop = 'off'; TR.speed = 100; TR.pass = 0; TR.listen = false;
  const saveTR = () => { P.tr = { ramp: TR.ramp, rampStart: TR.rampStart, silent: TR.silent, silPlay: TR.silPlay, silMute: TR.silMute, backing: TR.backing, bstyle: TR.bstyle, bvol: TR.bvol, bcomp: TR.bcomp, flash: TR.flash, acc: TR.acc }; saveP(); };
  let timer, nextT = 0, step = 0, schedPi = 0, bar = 0, passFb = { ok: 0, n: 0 }, fbCur = { heard: false, hit: false }, unListen = null, uiBar = -1, soloStart = -1, soloSec = '', soloOn = false, flashV = 0, flashAcc = false, runSec = 0, runT = null;
  function beatDots() { const n = +$('beats').value; $('bdots').innerHTML = Array.from({ length: n }, () => '<i></i>').join(''); }
  const curBpm = () => P.bpm * (TR.ramp ? TR.speed : 100) / 100;
  const clampI = i => Math.max(0, Math.min(prog.length - 1, (i | 0)));
  function loopRange() {
    if (TR.loop === 'off' || !prog.length) return null;
    if (TR.loop === 'custom') { const a = clampI(+$('loopfrom').value - 1), b = clampI(+$('loopto').value - 1); return [Math.min(a, b), Math.max(a, b)]; }
    const ix = prog.map((p, i) => (p.sec === TR.loop.slice(4) ? i : -1)).filter(i => i >= 0); return ix.length ? [ix[0], ix[ix.length - 1]] : null;
  }
  function paintLoop() { const r = loopRange(); document.querySelectorAll('#sheet .c').forEach(e => e.classList.toggle('inloop', !!r && +e.dataset.pi >= r[0] && +e.dataset.pi <= r[1])); }
  function renderLoopSel() {
    const names = [...new Set(prog.map(p => p.sec).filter(Boolean))];
    $('loopsel').innerHTML = '<option value="off">Off (play through)</option>' + names.map(n => `<option value="sec:${esc(n)}">Loop section: ${esc(n)}</option>`).join('') + '<option value="custom">Loop chords…</option>';
    if (!names.includes(TR.loop.slice(4)) && TR.loop !== 'custom') TR.loop = 'off'; $('loopsel').value = TR.loop; $('looprange').style.display = TR.loop === 'custom' ? '' : 'none'; $('loopto').max = $('loopfrom').max = Math.max(1, prog.length); paintLoop();
  }
  function paintSpeed() { $('speedrow').style.display = TR.ramp || TR.pass ? '' : 'none'; $('speedv').textContent = (TR.ramp ? TR.speed : 100) + '% · ' + Math.round(curBpm()) + ' bpm'; $('passv').textContent = TR.pass; }
  function finalizeFb() { if (TR.listen && fbCur.heard) { passFb.n++; if (fbCur.hit) passFb.ok++; $('fbtxt').textContent = `Clean chords this pass: ${passFb.ok}/${passFb.n}`; } fbCur = { heard: false, hit: false }; }
  function passDone() {
    TR.pass++; const n = passFb.n, ok = n ? passFb.ok / n : 1, scored = TR.listen && n >= 2;
    if (TR.ramp) { const old = TR.speed; if (!scored || ok >= .8) TR.speed = Math.min(100, TR.speed + 5); else if (ok < .4) TR.speed = Math.max(TR.rampStart, TR.speed - 5);
      if (TR.speed !== old) setTimeout(() => toast(TR.speed >= 100 ? 'Full tempo reached 🎉' : `Tempo ${TR.speed > old ? 'up' : 'down'} to ${TR.speed}%${scored ? ' (' + Math.round(ok * 100) + '% clean)' : ''}`), 150); }
    passFb = { ok: 0, n: 0 }; Store.track({ drill: 'loop' }); setTimeout(paintSpeed, 150);
  }
  function advanceSched() {
    const r = loopRange(); let n = schedPi + 1, wrapped = false;
    if (r) { if (n > r[1] || n < r[0]) { n = r[0]; wrapped = true; } } else if (n >= prog.length) { n = 0; wrapped = true; }
    schedPi = n; if (wrapped) { soloOn = false; passDone(); }
  }
  const inSolo = i => !!(prog[i] && prog[i].sec && SG.isSoloName(prog[i].sec) && RCC.solo.hasTabs());
  function sched() {
    const beats = +$('beats').value, sub = +$('sub').value, per = beats * sub, c = audio();
    while (nextT < c.currentTime + .12) {
      const sl = step % per, t = nextT, idx = step, b = Math.floor(sl / sub), isBeat = sl % sub === 0;
      if (sl === 0 && idx > 0) { bar++; if (P.autoc && prog.length) advanceSched(); }
      const cpi = schedPi, bn = bar, muted = TR.silent && (bar % (TR.silPlay + TR.silMute)) >= TR.silPlay, ac = TR.acc[b % TR.acc.length] || 'x';
      if (!muted && ac !== '.') { RCC.audio.click(t, ac === 'X' && isBeat, !isBeat, P.vol); }
      if (TR.backing) RCC.backing.step({ t, s: sl, sub, beats, chord: prog[cpi] ? prog[cpi].c : '', style: TR.bstyle, vol: TR.bvol, comp: TR.bcomp, patChar: pat.length ? pat[idx % pat.length] : '' });
      // solo follows the song's own timeline
      const wantSolo = inSolo(cpi); if (wantSolo && (!soloOn || prog[cpi].sec !== soloSec)) { soloStart = idx; soloSec = prog[cpi].sec; } soloOn = wantSolo;
      const soloBeat = wantSolo ? (idx - soloStart) / sub : -1;
      setTimeout(() => {
        if (!running) return;
        if (bn !== uiBar) { if (uiBar >= 0) finalizeFb(); uiBar = bn; }
        if (pi !== cpi) { pi = cpi; showChord(); }
        const si = pat.length ? idx % pat.length : -1; stepNow = si;
        document.querySelectorAll('.st').forEach((e, i) => e.classList.toggle('on', i === si));
        if (isBeat) { document.querySelectorAll('#bdots i').forEach((e, i) => { e.classList.toggle('on', i === b); e.classList.toggle('acc', b === 0); e.classList.toggle('mute', muted); }); document.body.classList.add('beat'); setTimeout(() => document.body.classList.remove('beat'), 110); if (TR.flash) { flashV = 1; flashAcc = b === 0; } }
        if (wantSolo) { RCC.solo.follow(true); RCC.solo.pushBeat(soloBeat); } else RCC.solo.follow(false);
      }, Math.max(0, (t - c.currentTime) * 1000));
      nextT += 60 / curBpm() / sub; step++;
    }
  }
  function toggle() {
    running = !running; $('play').textContent = running ? '■ Stop' : '▶ Start';
    if (running) {
      const c = audio(); c.resume(); step = 0; bar = 0; uiBar = -1; nextT = c.currentTime + .06; passFb = { ok: 0, n: 0 }; fbCur = { heard: false, hit: false }; TR.pass = 0; TR.speed = TR.ramp ? TR.rampStart : 100; soloOn = false;
      const r = loopRange(); schedPi = clampI(pi); if (r && (schedPi < r[0] || schedPi > r[1])) { schedPi = r[0]; pi = schedPi; showChord(); }
      paintSpeed(); timer = setInterval(sched, 25); runSec = 0; runT = setInterval(() => { runSec++; if (runSec % 5 === 0) Store.track({ sec: 5 }); }, 1000);
      if (song && (song.id || song.title)) Store.track({ song: song.id || 'tmp:' + song.title });
    } else { stepNow = -1; clearInterval(timer); clearInterval(runT); document.querySelectorAll('.st,#bdots i').forEach(e => e.classList.remove('on', 'mute')); RCC.solo.follow(false); soloOn = false; if (runSec % 5) Store.track({ sec: runSec % 5 }); TR.speed = TR.ramp ? TR.speed : 100; paintSpeed(); }
  }
  function setBpm(v) { P.bpm = Math.max(30, Math.min(260, Math.round(v))); $('bpm').textContent = P.bpm; $('bpmr').value = Math.min(240, P.bpm); RCC.solo.syncBpm(P.bpm); saveP(); paintSpeed(); }
  $('play').onclick = toggle; $('m-').onclick = () => setBpm(P.bpm - 1); $('m+').onclick = () => setBpm(P.bpm + 1); $('bpmr').oninput = e => setBpm(+e.target.value);
  let taps = []; $('tap').onclick = () => { const n = performance.now(); taps = taps.filter(x => n - x < 2500); taps.push(n); if (taps.length > 1) setBpm(60000 / ((n - taps[0]) / (taps.length - 1))); };
  $('beats').onchange = e => { P.beats = +e.target.value; beatDots(); saveP(); }; $('sub').onchange = e => { P.sub = +e.target.value; saveP(); };
  $('vol').oninput = e => { P.vol = +e.target.value; saveP(); }; $('autoc').onchange = e => { P.autoc = e.target.checked; saveP(); };
  $('follow').onchange = e => { P.follow = e.target.checked; saveP(); };
  const setPi = i => { pi = i; schedPi = i; showChord(); };
  $('cp').onclick = () => nav(-1); $('cn').onclick = () => nav(1);

  /* ---- trainer / timing / backing controls ---- */
  $('loopsel').onchange = e => { TR.loop = e.target.value; $('looprange').style.display = TR.loop === 'custom' ? '' : 'none'; paintLoop(); };
  $('loopfrom').onchange = $('loopto').onchange = paintLoop;
  $('ramp').onchange = e => { TR.ramp = e.target.checked; $('rampset').style.display = TR.ramp ? '' : 'none'; if (!running) TR.speed = TR.ramp ? TR.rampStart : 100; if (TR.ramp && TR.loop === 'off') toast('Tip: pick a section to loop, then the tempo climbs each clean pass'); paintSpeed(); saveTR(); };
  $('rampstart').oninput = e => { TR.rampStart = +e.target.value; $('rampstart-v').textContent = TR.rampStart + '%'; if (!running) TR.speed = TR.rampStart; paintSpeed(); saveTR(); };
  async function setListen(on) {
    if (on) { try { unListen = await RCC.audio.listen.use({ chroma: ev => { if (!running || !prog[pi] || !ev.loud) return; fbCur.heard = true; const m = RCC.chroma.matchChord(ev.chroma, prog[pi].c); if (m.ok) fbCur.hit = true; const el = $('fb'); el.style.display = ''; el.className = 'tag ' + (m.ok ? 'ok' : 'miss'); el.textContent = m.ok ? '✓ ' + prog[pi].c + ' sounds right' : (m.heard ? 'Heard ' + m.heard : 'Listening…'); } }); TR.listen = true; }
      catch (e) { toast('Microphone unavailable: ' + (e.message || e)); TR.listen = false; $('listen').checked = false; } }
    else { unListen && unListen(); unListen = null; TR.listen = false; $('fb').style.display = 'none'; $('fbtxt').textContent = ''; }
  }
  $('listen').onchange = e => setListen(e.target.checked);
  $('accpat').onchange = e => { TR.acc = e.target.value; saveTR(); }; $('flash').onchange = e => { TR.flash = e.target.checked; saveTR(); };
  $('silent').onchange = e => { TR.silent = e.target.checked; saveTR(); }; $('sil-play').onchange = e => { TR.silPlay = Math.max(1, +e.target.value || 3); saveTR(); }; $('sil-mute').onchange = e => { TR.silMute = Math.max(1, +e.target.value || 1); saveTR(); };
  $('bstyle').innerHTML = Object.entries(RCC.backing.STYLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('backing').onchange = e => { TR.backing = e.target.checked; saveTR(); }; $('bstyle').onchange = e => { TR.bstyle = e.target.value; saveTR(); };
  $('bvol').oninput = e => { TR.bvol = +e.target.value; saveTR(); }; $('bcomp').onchange = e => { TR.bcomp = e.target.checked; saveTR(); };

  /* ---- sheet editing ---- */
  $('editb').onclick = () => { const ed = $('pastewrap').style.display === 'none'; $('pastewrap').style.display = ed ? 'flex' : 'none'; $('sheet').style.display = ed ? 'none' : ''; $('secs').style.display = ed ? 'none' : ''; $('editb').textContent = ed ? 'Done' : 'Edit'; if (!ed) applyText(); };
  $('parse').onclick = () => { applyText(); $('editb').click(); };
  function applyText() {
    const text = $('paste').value;
    if (song && song.id) { Store.updateSong(song.id, { text }); song.text = text; } else if (song) song.text = text; else song = tempSong('Pasted song', text);
    strums = (song.strums && song.strums.length) ? song.strums : SG.findStrumsInText(text);
    parseSheet(); pi = Math.min(pi, Math.max(0, prog.length - 1)); showChord(); renderPatSel(); RCC.solo.setSong(song); renderSongHeader();
  }

  /* ================================================================ navigation */
  const views = ['practice', 'library', 'find', 'solo', 'scales', 'learn', 'tuner', 'gear', 'stream', 'support', 'settings'];
  function show(v) {
    if (v !== 'tuner') RCC.tuner.stop();
    document.querySelectorAll('.nav').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    views.forEach(n => $('v-' + n).classList.toggle('on', n === v));
    if (v === 'library') renderLib(); if (v === 'scales') RCC.scales.redraw(); if (v === 'stream') renderStreamUI(); if (v === 'practice') showChord();
    if (v === 'find') { fillImportTargets(); paintOnline(); setTimeout(() => $('ug-q').focus(), 50); } if (v === 'learn') RCC.learn.redraw();
  }
  document.querySelectorAll('.nav').forEach(b => b.onclick = () => show(b.dataset.view));

  /* ================================================================ library UI */
  let selKey = 'all'; const metaCache = new Map();
  function songMeta(s) {
    const k = s.id + ':' + (s.text || '').length + ':' + (s.soloTab || '').length; let m = metaCache.get(k);
    if (!m) { m = { chords: SG.parseSheet(s.text || '').prog.length, tabs: SG.parseTabs((s.text || '') + '\n' + (s.soloTab || '')).sections.length }; metaCache.set(k, m); } return m;
  }
  function renderLib() {
    const L = Store.lib; if (!$('v-library')) return;
    const item = (key, name, n, color) => `<div class="pl ${selKey === key ? 'on' : ''}" data-k="${esc(key)}"><i class="dot" style="background:${color}"></i><span>${esc(name)}</span><i>${n}</i></div>`;
    $('pl-all').innerHTML = item('all', 'All songs', L.songs.length, 'var(--ac)');
    const noGenre = L.songs.filter(s => !(s.genre || '').trim()).length;
    $('pl-genres').innerHTML = Store.genres().map(g => item('g:' + g.name, g.name, g.n, g.color)).join('') + (noGenre && Store.genres().length ? item('g:', 'No genre', noGenre, '#64748b') : '') || '<div class="small" style="padding:4px 10px">Genres appear once you tag songs.</div>';
    $('pl-list').innerHTML = L.playlists.map(p => item('p:' + p.id, p.name, p.songIds.length, p.color)).join('') || '<div class="small" style="padding:4px 10px">No playlists yet.</div>';
    document.querySelectorAll('#v-library .pl').forEach(e => e.onclick = () => { selKey = e.dataset.k; renderLib(); });
    // validate selection
    if (selKey.startsWith('p:') && !Store.playlist(selKey.slice(2))) selKey = 'all';
    let list = selKey === 'g:' ? L.songs.filter(s => !(s.genre || '').trim()) : Store.songsFor(selKey);
    const q = $('lib-q').value.trim().toLowerCase(); if (q) list = list.filter(s => (s.title + ' ' + s.artist + ' ' + s.genre).toLowerCase().includes(q));
    const flt = $('lib-filter').value; if (flt !== 'all') list = list.filter(s => RCC.lib2.passes(RCC.lib2.info(s), flt));
    const sort = $('lib-sort').value; if (sort !== 'recent' || !selKey.startsWith('p:')) list = list.slice().sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'artist' ? a.artist.localeCompare(b.artist) : (b.added || 0) - (a.added || 0));
    const isPl = selKey.startsWith('p:'), pl = isPl && Store.playlist(selKey.slice(2));
    $('lib-title').textContent = selKey === 'all' ? 'All songs' : isPl ? pl.name : selKey === 'g:' ? 'No genre' : selKey.slice(2);
    $('lib-sub').textContent = list.length + (list.length === 1 ? ' song' : ' songs');
    $('lib-ren').style.display = $('lib-del').style.display = $('lib-notes').style.display = $('lib-pdf').style.display = $('lib-print').style.display = isPl ? '' : 'none'; $('lib-play').disabled = $('lib-shuf').disabled = !list.length;
    $('songs').innerHTML = list.map((s, i) => {
      const m = songMeta(s), gc = s.genre ? Store.genreColor(s.genre) : 'var(--ac)';
      return `<div class="song ${song && song.id === s.id ? 'cur' : ''}" data-id="${s.id}" style="--gc:${gc};animation-delay:${Math.min(i, 12) * 25}ms"><div class="acts">${isPl && sort === 'recent' && !q && flt === 'all' ? `<button data-act="up" title="Move earlier">▲</button><button data-act="dn" title="Move later">▼</button>` : ''}<button data-act="more" title="More">⋯</button></div><b>${esc(s.title)}</b><div class="ar">${esc(s.artist) || '&nbsp;'}</div><div class="meta">${s.genre ? `<span class="tag" style="color:${gc}">${esc(s.genre)}</span>` : ''}<span class="tag">${m.chords} chords</span>${RCC.lib2.badge(RCC.lib2.info(s))}${(s.strums || []).length ? '<span class="tag ok">strum ✓</span>' : ''}${m.tabs ? '<span class="tag ok">solo tab ✓</span>' : ''}</div></div>`;
    }).join('') || `<div class="empty"><b>${q ? 'No matches' : 'Nothing here yet'}</b>${q ? 'Try a different filter.' : 'Import a song from Ultimate Guitar in <u>Find</u>, or paste one on the Practice page.'}</div>`;
    document.querySelectorAll('#songs .song').forEach(e => {
      e.onclick = ev => { const id = e.dataset.id; if (ev.target.dataset.act === 'up' || ev.target.dataset.act === 'dn') { const i = pl.songIds.indexOf(id); Store.reorderPlaylist(pl.id, i, i + (ev.target.dataset.act === 'up' ? -1 : 1)); return; } if (ev.target.dataset.act === 'more') { const r = ev.target.getBoundingClientRect(); songMenu(id, r.left, r.bottom + 4); return; } playList(list.map(x => x.id), id, $('lib-title').textContent); };
      e.oncontextmenu = ev => { ev.preventDefault(); songMenu(e.dataset.id, ev.clientX, ev.clientY); };
    });
    $('lib-play').onclick = () => playList(list.map(x => x.id), list[0] && list[0].id, $('lib-title').textContent);
    $('lib-shuf').onclick = () => { const ids = list.map(x => x.id).sort(() => Math.random() - .5); playList(ids, ids[0], $('lib-title').textContent + ' (shuffled)'); };
    sugg(); fillImportTargets(); renderAcct();
  }
  function songMenu(id, x, y) {
    const s = Store.song(id); if (!s) return;
    menu(x, y, [
      { label: 'Open in Practice', fn: () => playList([id], id, '') },
      { hr: 1 }, { hd: 1, label: 'Playlists' },
      ...Store.lib.playlists.map(p => ({ label: p.name, check: p.songIds.includes(id), fn: () => { const on = Store.toggleInPlaylist(p.id, id); toast((on ? 'Added to ' : 'Removed from ') + p.name); } })),
      { label: '+ New playlist…', fn: async () => { const n = await askText('New playlist', ''); if (n) { Store.createPlaylist(n, id); toast('Added to ' + n); } } },
      { hr: 1 }, { hd: 1, label: 'Genre' },
      ...Store.PRESET_GENRES.slice(0, 8).map(g => ({ label: g, check: (s.genre || '').toLowerCase() === g.toLowerCase(), fn: () => Store.updateSong(id, { genre: g }) })),
      { label: 'Other…', fn: async () => { const g = await askText('Genre', s.genre || ''); if (g != null) Store.updateSong(id, { genre: g }); } },
      { hr: 1 }, { label: 'Delete song', fn: async () => { if (await askConfirm('Delete “' + s.title + '”?')) { Store.removeSong(id); if (song && song.id === id) song = null; } } },
    ]);
  }
  function playList(ids, id, label) {
    queue = { label: label || '', ids: ids.slice(), idx: ids.indexOf(id) };
    const s = Store.song(id); if (!s) return; loadSong(s); show('practice');
  }
  function stepSong(d) { if (queue.ids.length < 2) return; const i = queue.ids.indexOf(song && song.id); const n = (i + d + queue.ids.length) % queue.ids.length; const s = Store.song(queue.ids[n]); if (s) loadSong(s); }
  $('sp').onclick = () => stepSong(-1); $('sn').onclick = () => stepSong(1);
  $('lib-q').oninput = renderLib; $('lib-sort').onchange = renderLib; $('lib-filter').onchange = renderLib;
  $('lib-import').onclick = () => RCC.lib2.openImport(); $('imp-paste').onclick = () => RCC.lib2.openImport();
  $('lib-notes').onclick = () => selKey.startsWith('p:') && RCC.lib2.openNotes(selKey.slice(2)); $('lib-pdf').onclick = () => selKey.startsWith('p:') && RCC.lib2.exportSet(selKey.slice(2)); $('lib-print').onclick = () => selKey.startsWith('p:') && RCC.lib2.exportSet(selKey.slice(2), 'print');
  $('xpose').onclick = () => RCC.lib2.openTranspose();
  $('pl-new').onclick = async () => { const n = await askText('New playlist', ''); if (n) { const p = Store.createPlaylist(n); selKey = 'p:' + p.id; renderLib(); } };
  $('lib-ren').onclick = async () => { const p = Store.playlist(selKey.slice(2)); if (!p) return; const n = await askText('Rename playlist', p.name); if (n) Store.renamePlaylist(p.id, n); };
  $('lib-del').onclick = async () => { const p = Store.playlist(selKey.slice(2)); if (p && await askConfirm('Delete playlist “' + p.name + '”? Songs stay in your library.')) { Store.deletePlaylist(p.id); selKey = 'all'; } };
  function sugg() { const q = $('q').value.toLowerCase(); $('sugg').innerHTML = Store.lib.songs.filter(x => (x.title + ' ' + x.artist).toLowerCase().includes(q)).slice(0, 12).map(x => `<option value="${esc(x.title + ' — ' + x.artist)}">`).join(''); }
  Store.on(() => { if ($('v-library').classList.contains('on')) renderLib(); else { sugg(); fillImportTargets(); } renderAcct(); renderNewChords(); });

  /* ================================================================ Ultimate Guitar (own UI, nothing from the site is displayed) */
  const UG = { q: '', type: 'chords', page: 1, results: [], more: false, sel: -1, cur: null, busy: false };
  function fillImportTargets() {
    $('genres').innerHTML = [...new Set([...Store.PRESET_GENRES, ...Store.genres().map(g => g.name)])].map(g => `<option value="${esc(g)}">`).join('');
    const cur = $('imp-pl').value; $('imp-pl').innerHTML = '<option value="">No playlist</option>' + Store.lib.playlists.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join(''); $('imp-pl').value = cur; $('imp-genre').value = $('imp-genre').value || P.impGenre || '';
  }
  const ugErr = e => (e && e.message === 'offline') ? 'You’re offline — only saved songs are available' : 'Ultimate Guitar: ' + ((e && e.message) || 'something went wrong');
  const stars = r => { const n = Math.max(0, Math.min(5, Math.round(r))); return '★'.repeat(n) + `<span style="opacity:.3">${'★'.repeat(5 - n)}</span>`; };
  function ugRender() {
    const box = $('ug-results');
    if (UG.busy === 'search' && !UG.results.length) { box.innerHTML = `<div class="empty"><b>Searching…</b>${esc(UG.q)}</div>`; return; }
    if (!UG.results.length) { box.innerHTML = `<div class="empty"><b>${UG.q ? 'No results' : 'Search Ultimate Guitar'}</b>${UG.q ? 'Try fewer words, or switch between Chords, Tabs and All.' : 'Type a song or artist above. Versions open here — no website, no ads.'}</div>`; return; }
    box.innerHTML = UG.results.map((r, i) => `<div class="ugr ${i === UG.sel ? 'on' : ''}" data-i="${i}"><div class="grow" style="min-width:0"><b>${esc(r.title)}</b><div class="ar">${esc(r.artist)}${r.version > 1 ? ' · ver ' + r.version : ''}${r.key ? ' · ' + esc(r.key) : ''}</div></div><div class="rt"><span class="tag">${esc(r.type)}</span><div>${stars(r.rating)} <span>${r.votes ? r.votes.toLocaleString() : ''}</span></div></div></div>`).join('')
      + (UG.more ? `<div class="row" style="justify-content:center;margin:10px 0 4px"><button class="btn sm" id="ug-more" ${UG.busy ? 'disabled' : ''}>${UG.busy ? 'Loading…' : 'More results'}</button></div>` : '');
    box.querySelectorAll('.ugr').forEach(e => e.onclick = () => ugOpen(+e.dataset.i));
    const m = $('ug-more'); if (m) m.onclick = () => ugSearch(UG.q, UG.page + 1);
  }
  async function ugSearch(q, pg = 1) {
    q = String(q || '').trim(); if (!q) return;
    if (!RCC.ug.online()) { toast('You’re offline — only saved songs are available'); return; }
    UG.q = q; $('ug-q').value = q; UG.busy = 'search'; if (pg === 1) { UG.results = []; UG.sel = -1; UG.cur = null; $('ug-prev').innerHTML = '<div class="empty"><b>Nothing selected</b>Pick a result to preview it before you import.</div>'; } ugRender();
    try { const r = await RCC.ug.search(q, { type: UG.type, page: pg }); if (UG.q !== q) return; UG.page = pg; UG.results = pg === 1 ? r.results : UG.results.concat(r.results); UG.more = r.more; }
    catch (e) { toast(ugErr(e)); }
    UG.busy = false; ugRender();
    if (pg === 1 && UG.results.length && UG.sel < 0) ugOpen(0);
  }
  async function ugOpen(i) {
    const r = UG.results[i]; if (!r) return; UG.sel = i; UG.cur = null; ugRender();
    const box = $('ug-prev'); box.innerHTML = `<div class="empty"><b>Loading…</b>${esc(r.title)} — ${esc(r.artist)}</div>`;
    try { const t = await RCC.ug.tab(r.url); if (UG.sel !== i) return; UG.cur = t; ugPreview(t); }
    catch (e) { if (UG.sel !== i) return; box.innerHTML = `<div class="empty"><b>Couldn’t load that one</b>${esc(ugErr(e))}<div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm" id="ug-ext">Open in your browser</button></div></div>`; $('ug-ext').onclick = () => window.open(r.url, '_blank'); }
  }
  function ugPreview(t) {
    const box = $('ug-prev'), m = t.meta || {}, bits = [m.key && 'Key ' + m.key, m.capo && 'Capo ' + m.capo, m.tuning && 'Tuning ' + m.tuning, t.bpm && t.bpm + ' bpm', m.difficulty && String(m.difficulty)].filter(Boolean);
    box.innerHTML = `<div class="ph"><div class="grow" style="min-width:0"><h2 class="ell">${esc(t.title)}</h2><div class="small ell">${esc(t.artist)}${bits.length ? ' · ' + bits.map(esc).join(' · ') : ''}</div></div><button class="btn p" id="ug-imp">Import this song</button><button class="btn sm" id="ug-ext" title="Open on ultimate-guitar.com in your browser">↗</button></div>
      <div class="ug-meta">${t.chords.length ? `<span class="small">Chords</span>${t.chords.slice(0, 16).map(c => `<span class="tag">${esc(c)}</span>`).join('')}` : '<span class="small">No chord line found — it may be a tab-only page.</span>'}${t.strums.length ? `<span class="small" style="margin-left:6px">Strum</span>${t.strums.slice(0, 3).map(s => `<span class="tag ok" title="${esc(s.part || '')}">${esc((s.part ? s.part + ' ' : '') + s.pat)}</span>`).join('')}` : ''}</div>
      <pre id="ug-text"></pre>`;
    $('ug-text').innerHTML = renderSheetHTML(SG.parseSheet(t.text));
    $('ug-imp').onclick = () => ugImport(t); $('ug-ext').onclick = () => window.open(t.url, '_blank');
  }
  function ugImport(x) {
    const genre = $('imp-genre').value.trim(); P.impGenre = genre; saveP();
    const saved = Store.addSong({ title: x.title, artist: x.artist, text: x.text, strums: x.strums || [], pat: '', bpm: x.bpm || 0, genre, meta: x.meta || {}, url: x.url });
    const pid = $('imp-pl').value; if (pid && Store.playlist(pid) && !Store.playlist(pid).songIds.includes(saved.id)) Store.toggleInPlaylist(pid, saved.id);
    const nTabs = SG.parseTabs(x.text).sections.length, ns = (x.strums || []).length, m = x.meta || {};
    toast(`Imported “${x.title}”${ns ? ' · ' + ns + ' strumming pattern' + (ns > 1 ? 's' : '') : ''}${m.capo ? ' · capo ' + m.capo : ''}${m.tuning ? ' · ' + m.tuning : ''}${nTabs ? ' · ' + nTabs + ' tab section' + (nTabs > 1 ? 's' : '') : ''}`);
    playList([saved.id], saved.id, pid ? Store.playlist(pid).name : '');
  }
  $('ug-go').onclick = () => ugSearch($('ug-q').value); $('ug-q').onkeydown = e => { if (e.key === 'Enter') ugSearch($('ug-q').value); };
  document.querySelectorAll('#ug-type button').forEach(b => b.onclick = () => { UG.type = b.dataset.v; document.querySelectorAll('#ug-type button').forEach(x => x.classList.toggle('on', x === b)); if (UG.q) ugSearch(UG.q); });
  $('find-off-lib').onclick = () => show('library');
  $('ug').onclick = () => {
    const v = $('q').value.trim(), hit = Store.lib.songs.find(x => (x.title + ' — ' + x.artist) === v);
    if (hit) { playList([hit.id], hit.id, ''); return; } if (!v) return;
    if (!RCC.ug.online()) { selKey = 'all'; $('lib-q').value = v; show('library'); toast('You’re offline — showing saved songs that match'); return; }
    show('find'); ugSearch(v);
  };
  $('q').onkeydown = e => { if (e.key === 'Enter') $('ug').click(); }; $('q').oninput = sugg;
  /* ---- offline awareness: everything saved keeps working, only Ultimate Guitar needs a connection ---- */
  function paintOnline() {
    const on = RCC.ug.online(); document.body.classList.toggle('offline', !on); $('find-off').hidden = on; $('netpill').hidden = on;
    $('q').placeholder = on ? 'Search Ultimate Guitar or your library' : 'Offline — search your saved songs';
  }
  window.addEventListener('online', () => { paintOnline(); toast('Back online'); }); window.addEventListener('offline', () => { paintOnline(); toast('You’re offline — your saved songs still work'); });

  /* ================================================================ camera + overlay + output */
  const cv = $('out'), cx = cv.getContext('2d', { willReadFrequently: true });
  let stream = null, camId = ''; try { camId = localStorage.getItem('rcc-cam') || ''; } catch (e) {}
  async function listCams() { try { const d = (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === 'videoinput'); $('camsel').innerHTML = d.map((x, i) => `<option value="${x.deviceId}">${esc(x.label || 'Camera ' + (i + 1))}</option>`).join('') || '<option>No camera found</option>'; if (d.some(x => x.deviceId === camId)) $('camsel').value = camId; } catch (e) {} }
  async function startCam() {
    try { if (stream) stream.getTracks().forEach(t => t.stop()); const v = { width: { ideal: 1280 }, height: { ideal: 720 } }; if (camId) v.deviceId = { exact: camId };
      stream = await navigator.mediaDevices.getUserMedia({ video: v }); $('cam').srcObject = stream; camId = stream.getVideoTracks()[0].getSettings().deviceId || camId; await listCams();
    } catch (e) { if (camId) { camId = ''; return startCam(); } toast('Camera unavailable (' + e.name + ')'); }
  }
  $('camsel').onchange = e => { camId = e.target.value; try { localStorage.setItem('rcc-cam', camId); } catch (_) {} startCam(); };
  navigator.mediaDevices && navigator.mediaDevices.addEventListener('devicechange', listCams);

  let lastFrame = performance.now(), spCtxFit = null;
  function fitCv(c) { const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); } const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g, w, h }; }
  function frame() {
    const now = performance.now(), dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now; flashV = Math.max(0, flashV - dt * 4.5);
    const so = RCC.solo.overlayState(), sti = stageLines.length ? SG.stageIndex(stageLines, pi) : 0;
    OV.render(cx, { opts: P.ov, video: $('cam'), mirror: P.mir, accent: P.accent, chord: prog[pi] ? prog[pi].c : '—', prog, pi, pat, stepNow, bpm: Math.round(curBpm()), running, solo: so, flash: flashV, flashAcc,
      stage: { lines: stageLines, cur: sti, sec: stageLines[sti] && stageLines[sti].sec }, queue: RCC.chat ? RCC.chat.queue : [] });
    const targets = [];
    if ($('v-practice').classList.contains('on')) targets.push($('pv')); if ($('v-stream').classList.contains('on')) targets.push($('pv2')); if (document.body.classList.contains('clean')) targets.push($('pvc'));
    targets.forEach(t => t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height));
    // solo fretboard fades into the practice page when a solo section arrives
    const ps = RCC.solo.panelState(), sp = $('solopanel'), vis = !!(ps && ps.alpha > .02 && $('v-practice').classList.contains('on'));
    if (sp.classList.contains('on') !== vis) sp.classList.toggle('on', vis);
    if (vis) { sp.style.opacity = ps.alpha.toFixed(2); const f = fitCv($('sp-fret')); f.g.clearRect(0, 0, f.w, f.h); RCC.fret.draw(f.g, { x: 10, y: 22, w: f.w - 20, h: f.h - 30 }, { ...ps, accent: P.accent }); }
  }
  (function loop() { frame(); requestAnimationFrame(loop); })();
  try { const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)']))); w.onmessage = () => { if (document.hidden) frame(); }; } catch (e) {}

  /* virtual camera (RGBA frames, same size as the canvas) */
  let vOn = false, vt = null;
  if (R) {
    R.onStatus(m => { vOn = m.on; $('vmsg').textContent = m.text; $('vstat').textContent = m.on ? 'Virtual cam live' : 'Virtual cam off'; $('vstat').classList.toggle('on', m.on); $('vcam').textContent = m.on ? 'Stop virtual camera' : 'Start virtual camera'; clearInterval(vt); if (m.on) vt = setInterval(() => { try { R.frame(cx.getImageData(0, 0, 1280, 720).data.buffer); } catch (e) {} }, 33); });
    $('vcam').onclick = () => vOn ? R.stop() : R.start();
    $('vsetup').onclick = async () => { const r = await R.setupVcam(); toast(r.ok ? 'Setup started – approve the Windows prompt, then restart your video app.' : (r.error || 'Setup failed')); };
  } else { $('vcam').disabled = $('vsetup').disabled = true; $('vmsg').textContent = 'Virtual camera needs the desktop app.'; }

  $('pipb').onclick = async () => { try { if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; } const p = $('pip'); p.srcObject = cv.captureStream(30); await p.play(); await p.requestPictureInPicture(); } catch (e) { toast('Floating window not supported here'); } };
  function exitClean() { document.body.classList.remove('clean'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  $('cleanb').onclick = () => { document.body.classList.add('clean'); document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); toast('Clean mode: click or press Esc to exit'); };
  $('cleanwrap').onclick = exitClean;

  /* ---- Stream view: layouts, position, elements ---- */
  const scratch = document.createElement('canvas'); scratch.width = 1280; scratch.height = 720; const sx = scratch.getContext('2d');
  const SAMPLE = { stage: { cur: 1, sec: 'Verse', lines: [{ chords: [{ c: 'Am', pi: 0, col: 0 }, { c: 'F', pi: 1, col: 10 }], lyric: 'Paste a song from the web', sec: 'Verse' }, { chords: [{ c: 'C', pi: 2, col: 0 }, { c: 'G', pi: 3, col: 12 }], lyric: 'and the lyrics follow you', sec: 'Verse' }, { chords: [{ c: 'Am', pi: 4, col: 0 }], lyric: 'on camera, line by line', sec: 'Verse' }] }, queue: [], chord: 'Am', prog: [{ c: 'Am' }, { c: 'F' }, { c: 'C' }, { c: 'G' }], pi: 0, pat: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'], stepNow: 2, bpm: 92, running: true, mirror: false, video: null };
  function renderStreamUI() {
    $('layouts').innerHTML = Object.entries(OV.MODES).map(([k, m]) => `<div class="lay ${P.ov.mode === k ? 'on' : ''}" data-m="${k}"><canvas width="224" height="126"></canvas>${m.name}</div>`).join('');
    document.querySelectorAll('#layouts .lay').forEach(el => {
      const k = el.dataset.m; OV.render(sx, { ...SAMPLE, accent: P.accent, opts: { ...P.ov, mode: k, pos: OV.snap(k, k === P.ov.mode ? P.ov.pos : OV.DEFAULTS.pos) } });
      el.querySelector('canvas').getContext('2d').drawImage(scratch, 0, 0, 224, 126); el.onclick = () => setMode(k);
    });
    const grid = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'], valid = OV.MODES[P.ov.mode].valid, cur = OV.snap(P.ov.mode, P.ov.pos);
    $('posgrid').innerHTML = grid.map(g => `<button data-p="${g}" class="${cur === g ? 'on' : ''}" ${valid.includes(g) ? '' : 'disabled'}></button>`).join('');
    $('posgrid').querySelectorAll('button').forEach(b => b.onclick = () => { P.ov.pos = b.dataset.p; saveP(); renderStreamUI(); });
    $('ov-scale').value = P.ov.scale; $('ov-scale-v').textContent = P.ov.scale + '%'; $('ov-bg').value = P.ov.bg; $('opr').value = P.ov.dim / 100; $('mir').checked = P.mir;
    const labels = { chord: 'Chord name', diagram: 'Chord diagram', nextdiag: 'Next chord diagram', next: 'Next chord', strum: 'Strum pattern', chips: 'Chord progress', bpm: 'Tempo', fret: 'Solo fretboard', queue: 'Chat requests', flash: 'Beat flash', brand: 'Watermark' };
    $('elgrid').innerHTML = Object.entries(labels).map(([k, l]) => `<label class="tg"><span class="sw"><input type="checkbox" data-k="${k}" ${P.ov.show[k] ? 'checked' : ''}><i></i></span>${l}</label>`).join('');
    $('elgrid').querySelectorAll('input').forEach(i => i.onchange = () => { P.ov.show[i.dataset.k] = i.checked; saveP(); renderStreamUI(); });
    document.querySelectorAll('#ovchips .chip').forEach(c => c.classList.toggle('on', c.dataset.m === P.ov.mode));
  }
  function setMode(m) { P.ov.mode = m; P.ov.pos = OV.snap(m, P.ov.pos); saveP(); renderStreamUI(); }
  document.querySelectorAll('#ovchips .chip').forEach(c => c.onclick = () => setMode(c.dataset.m));
  $('ov-scale').oninput = e => { P.ov.scale = +e.target.value; $('ov-scale-v').textContent = P.ov.scale + '%'; saveP(); }; $('ov-scale').onchange = renderStreamUI;
  $('ov-bg').oninput = e => { P.ov.bg = +e.target.value; saveP(); }; $('ov-bg').onchange = renderStreamUI;
  $('opr').oninput = e => { P.ov.dim = Math.round(+e.target.value * 100); saveP(); };
  $('mir').onchange = e => { P.mir = e.target.checked; saveP(); };

  /* ================================================================ settings view */
  function applyLook() {
    root.style.setProperty('--ac', P.accent); root.style.setProperty('--fs', P.fs + 'px'); $('acc').value = P.accent;
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s.dataset.c === P.accent));
    $('ambient').style.display = P.motion ? '' : 'none';
    const hex = P.accent, r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    root.style.setProperty('--ac2', `hsl(${(Math.round(Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI) + 360 + 50) % 360} 85% 62%)`);
  }
  $('swatches').innerHTML = ACCENTS.map(c => `<span class="swatch" data-c="${c}" style="background:${c}"></span>`).join('');
  document.querySelectorAll('.swatch').forEach(s => s.onclick = () => { P.accent = s.dataset.c; saveP(); applyLook(); showChord(); });
  $('acc').oninput = e => { P.accent = e.target.value; saveP(); applyLook(); };
  $('fsr').oninput = e => { P.fs = +e.target.value; saveP(); applyLook(); }; $('asr').oninput = e => { P.asr = +e.target.value; saveP(); };
  $('autopat').onchange = e => { P.autopat = e.target.checked; saveP(); }; $('motion').onchange = e => { P.motion = e.target.checked; saveP(); applyLook(); };
  setInterval(() => { if (P.asr && !P.follow) $('sheet').scrollTop += P.asr * .15; }, 30);
  $('exp').onclick = async () => { const r = await Store.exportLib(); if (r && r.ok) toast('Songs exported'); };
  $('imp-lib').onclick = async () => {
    if (!R) { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json'; f.onchange = async () => { try { const n = Store.mergeLib(JSON.parse(await f.files[0].text())); toast('Imported ' + n + ' new song' + (n === 1 ? '' : 's')); } catch (e) { toast('That file is not a valid song export.'); } }; f.click(); return; }
    const r = await R.lib.importFrom(); if (r.ok) { const n = Store.mergeLib(r.lib); toast('Imported ' + n + ' new song' + (n === 1 ? '' : 's')); } else if (r.error) toast(r.error); };

  /* ================================================================ accounts */
  function renderAcct() {
    const u = Store.user; $('acct').classList.toggle('guest', !u); $('acctI').textContent = u ? u.name[0].toUpperCase() : '?'; $('acctN').textContent = u ? u.name : 'Sign in';
    $('acct-info').innerHTML = u ? `Signed in as <b style="color:var(--fg)">${esc(u.name)}</b> · ${Store.lib.songs.length} songs saved to this account.` : 'You’re using the app as a guest. Create an account to keep your songs and playlists separate for each person on this computer.';
    $('acct-btn').textContent = u ? 'Account…' : 'Sign in / Register';
  }
  function openAccount(mode) {
    const u = Store.user;
    if (u) {
      dialog(`<svg class="logo" viewBox="0 0 64 64"><use href="#logo"/></svg><h2>${esc(u.name)}</h2><div class="small">Member since ${new Date(u.created).toLocaleDateString()} · ${Store.lib.songs.length} songs · ${Store.lib.playlists.length} playlists</div>
       <div class="row" style="margin-top:18px"><button class="btn" id="ac-out">Sign out</button><button class="btn" id="ac-exp">Export songs</button><button class="btn danger" id="ac-del">Delete account</button></div><div class="row" style="justify-content:flex-end"><button class="btn p" id="ac-x">Close</button></div>`, () => {
        $('ac-x').onclick = closeDlg; $('ac-exp').onclick = () => Store.exportLib();
        $('ac-out').onclick = async () => { await Store.logout(); closeDlg(); afterAuth('Signed out'); };
        $('ac-del').onclick = () => dialog(`<h2>Delete account?</h2><div class="small">This permanently deletes ${esc(u.name)} and its saved songs from this computer. Enter your password to confirm.</div><div class="row"><input type="password" id="ac-pw" class="grow" placeholder="Password"></div><div class="err" id="ac-err"></div><div class="row" style="justify-content:flex-end"><button class="btn" id="ac-c">Cancel</button><button class="btn danger" id="ac-go">Delete forever</button></div>`, () => {
          $('ac-c').onclick = () => openAccount(); $('ac-go').onclick = async () => { const r = await Store.deleteAccount($('ac-pw').value); if (r.ok) { closeDlg(); afterAuth('Account deleted'); } else $('ac-err').textContent = r.error || 'Failed'; };
        });
      }); return;
    }
    const reg = mode === 'register', guestSongs = Store.lib.songs.length;
    dialog(`<svg class="logo" viewBox="0 0 64 64"><use href="#logo"/></svg><h2>${reg ? 'Create your account' : 'Welcome back'}</h2><div class="small">${reg ? 'Your songs and playlists are saved to this account on this computer.' : 'Sign in to load your saved songs.'}</div>
     <div class="row" style="margin-top:14px"><input id="ac-u" class="grow" placeholder="Username" autocomplete="username"></div>
     <div class="row"><input type="password" id="ac-p" class="grow" placeholder="Password${reg ? ' (8+ characters)' : ''}" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>
     ${reg ? '<div class="row"><input type="password" id="ac-p2" class="grow" placeholder="Confirm password" autocomplete="new-password"></div>' : ''}
     <div class="row"><label class="tg"><span class="sw"><input type="checkbox" id="ac-rem" checked><i></i></span>Keep me signed in</label></div>
     ${reg && guestSongs ? `<div class="row"><label class="tg"><span class="sw"><input type="checkbox" id="ac-adopt" checked><i></i></span>Move my ${guestSongs} guest songs into this account</label></div>` : ''}
     <div class="err" id="ac-err"></div>
     <div class="row" style="justify-content:space-between"><button class="btn ghost" id="ac-sw">${reg ? 'I already have an account' : 'Create an account'}</button><button class="btn p" id="ac-go">${reg ? 'Create account' : 'Sign in'}</button></div>
     ${reg ? '<div class="small" style="margin-top:8px">Accounts are stored on this computer, so there’s no password reset — use Export songs for a backup.</div>' : ''}`, () => {
      $('ac-u').focus(); $('ac-sw').onclick = () => openAccount(reg ? 'login' : 'register');
      const go = async () => {
        $('ac-err').textContent = ''; const a = { name: $('ac-u').value, password: $('ac-p').value, remember: $('ac-rem').checked };
        if (reg) { if (a.password !== $('ac-p2').value) { $('ac-err').textContent = 'Passwords don’t match.'; return; } a.adoptGuest = !!($('ac-adopt') && $('ac-adopt').checked); }
        $('ac-go').disabled = true; const r = await (reg ? Store.register(a) : Store.login(a)); $('ac-go').disabled = false;
        if (r.ok) { closeDlg(); afterAuth((reg ? 'Welcome, ' : 'Signed in as ') + r.user.name); } else $('ac-err').textContent = r.error;
      };
      $('ac-go').onclick = go; dlgEnter(go);
    });
  }
  function dlgEnter(go) { $('dlg').querySelectorAll('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); }); }
  function afterAuth(msg) { queue = { label: '', ids: [], idx: -1 }; selKey = 'all'; renderLib(); renderAcct(); renderSongHeader(); toast(msg); }
  $('acct').onclick = () => openAccount(); $('acct-btn').onclick = () => openAccount();

  /* ================================================================ misc wiring */
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { exitClean(); closeMenu(); }
  });

  /* ================================================================ boot */
  (async function boot() {
    $('bpm').textContent = P.bpm; $('beats').value = P.beats; $('sub').value = P.sub; $('vol').value = P.vol; $('autoc').checked = P.autoc; $('follow').checked = P.follow; $('fsr').value = P.fs; $('asr').value = P.asr; $('autopat').checked = P.autopat; $('motion').checked = P.motion;
    applyLook(); beatDots(); setBpm(P.bpm);
    $('ramp').checked = TR.ramp; $('rampset').style.display = TR.ramp ? '' : 'none'; $('rampstart').value = TR.rampStart; $('rampstart-v').textContent = TR.rampStart + '%'; if (TR.ramp) TR.speed = TR.rampStart; $('accpat').value = TR.acc; $('flash').checked = TR.flash; $('silent').checked = TR.silent; $('sil-play').value = TR.silPlay; $('sil-mute').value = TR.silMute; $('backing').checked = TR.backing; $('bstyle').value = TR.bstyle; $('bvol').value = TR.bvol; $('bcomp').checked = TR.bcomp; paintSpeed();
    RCC.solo.init({ track: o => Store.track(o), songTitle: () => (song && song.title) || '', result: r => Store.track({ drill: 'solo-' + r.mode, score: { key: r.key, v: Math.round(r.acc) } }), audio, bpm: { get: () => P.bpm, set: setBpm }, toast, accent: () => P.accent, click: acc => clickAt(audio().currentTime + .01, acc, false), saveTab: t => { if (song) { song.soloTab = t; if (song.id) Store.updateSong(song.id, { soloTab: t }); RCC.solo.setSong(song); toast('Tab saved to this song'); } } });
    RCC.tuner.init({ audio, toast });
    RCC.learn.init({ toast, audio, accent: () => P.accent, jam: (text, title) => { loadSong(tempSong(title, text, { artist: 'Theory lesson' })); show('practice'); }, useChord: n => { loadSong(tempSong(n, '[Chord]\n' + n, { artist: 'Chord library' })); show('practice'); }, track: o => Store.track(o), bpm: () => P.bpm, drill: (text, name) => { if (RCC.solo.openTab(text, name)) show('solo'); } });
    RCC.gear.init({ toast, bpm: () => P.bpm, beats: () => +$('beats').value });
    RCC.scales.init({ audio, toast, track: o => Store.track(o), drill: (text, name) => { if (RCC.solo.openTab(text, name)) show('solo'); }, accent: () => P.accent, jam: (text, title) => { loadSong(tempSong(title, text, { artist: 'Scale Lab' })); show('practice'); } });
    await Store.init(); RCC.controls.init();
    renderAcct(); renderLib(); renderStreamUI();
    if (R) R.version().then(v => { $('ver').textContent = $('ver2').textContent = 'v' + v; });
    paintOnline();
    $('sup-share').onclick = async () => { const url = 'https://www.506clicks.ca/projects/chordclicks/', text = 'ChordClicks — free guitar practice app with your chords on camera'; try { if (navigator.share) await navigator.share({ title: 'ChordClicks', text, url }); else { await navigator.clipboard.writeText(url); toast('Link copied — thanks for sharing!'); } } catch (e) {} };
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
    loadSong(tempSong('Sample', '[Verse]\nAm        F\nPaste a song from Ultimate Guitar here\nC         G\nand the chords show up on your camera'));
    song.title = ''; renderSongHeader();
    startCam();
  })();
  function replaceText(text, metaPatch) {
    $('paste').value = text; if (song && metaPatch) { song.meta = Object.assign({}, song.meta || {}, metaPatch); if (song.id) Store.updateSong(song.id, { meta: song.meta }); }
    applyText(); renderSongHeader();
  }
  RCC.app = { get song() { return song; }, get prog() { return prog; }, get pi() { return pi; }, get sheet() { return sheet; }, get running() { return running; }, loadSong, show, toast, dialog, closeDlg, askText, askConfirm, menu, esc, P, saveP, Store, setBpm, nav, setPi, toggle, playList, renderLib, tempSong, replaceText, applyText, setMode, renderStreamUI, TR };
  window.__rcc = { loadSong, show, get song() { return song; }, tempSong, P, ugSearch, UG };
})();
