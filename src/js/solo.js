/* Solo mode: a Guitar-Hero / karaoke style trainer. Tab notes scroll toward a hit line and light up on a fretboard. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const $ = id => document.getElementById(id);
  const COUNT_IN = 4, LOOK = 1.5;
  let D, secs = [], sec = null, pos = 0, playing = false, last = 0, lastBeat = -99, cur = -1;
  const st = { speed: 100, click: true, loop: false, lefty: false, cam: true, mode: 'watch', ramp: false, lat: 100, from: 0, to: -1 };
  const WIN = 0.3;                                   // hit window in beats (either side of the note)
  let sc = { hits: 0, miss: 0, combo: 0, best: 0, pts: 0 }, heard = { pc: -1, at: 0, n: 0 }, unListen = null, ext = false, fade = 0, waiting = false, accSec = 0, flash = [], edges = [0, 1];
  const NOTE_PC = n => (RCC.theory.OPEN_MIDI[5 - n.s] + n.fret) % 12;
  const accPct = () => (sc.hits + sc.miss ? sc.hits / (sc.hits + sc.miss) * 100 : 0);
  let fretCtx, hwCtx, size = { fw: 0, fh: 0, hw: 0, hh: 0 };

  const DEMO = (() => {
    const L = { e: 0, B: 1, G: 2, D: 3, A: 4, E: 5 }, rows = Array.from({ length: 6 }, () => Array(34).fill('-'));
    [0, 16].forEach(c => { rows.forEach(r => r[c + 0] = '|'); }); rows.forEach(r => { r[33] = '|'; r[16] = '|'; });
    const put = (col, str, fret) => { const s = String(fret); for (let i = 0; i < s.length; i++) rows[L[str]][col + 1 + i] = s[i]; };
    [[0, 'e', 5], [2, 'e', 8], [4, 'B', 5], [6, 'B', 8], [8, 'G', 5], [10, 'G', 7], [12, 'D', 7], [14, 'D', 5],
      [16, 'A', 7], [18, 'A', 5], [20, 'E', 8], [22, 'E', 5], [24, 'e', 8], [26, 'e', 5], [28, 'B', 8], [30, 'e', 12]].forEach(n => put(...n));
    return '[Demo Solo]\n' + ['e', 'B', 'G', 'D', 'A', 'E'].map((n, i) => n + rows[i].join('')).join('\n');
  })();

  const beatOf = e => e.t / sec.colsPerBeat;
  const totalBeats = () => sec ? Math.max(1, sec.length / sec.colsPerBeat) : 1;
  const secPerBeat = () => 60 / (D.bpm.get() * st.speed / 100);
  const fmt = b => { const t = Math.max(0, b * secPerBeat()), m = Math.floor(t / 60); return m + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };

  function buildList(song) {
    const S = RCC.song; secs = [];
    const text = (song && song.text) || '';
    S.parseTabs(text).sections.forEach(s => secs.push(s));
    if (song && song.soloTab) S.parseTabs(song.soloTab).sections.forEach(s => { s.name = 'My tab' + (s.name.startsWith('Tab ') ? '' : ' · ' + s.name); secs.push(s); });
    secs.sort((a, b) => (S.isSoloName(b.name) ? 1 : 0) - (S.isSoloName(a.name) ? 1 : 0));
    $('solo-sel').innerHTML = secs.length ? secs.map((s, i) => `<option value="${i}">${s.name.replace(/</g, '&lt;')} · ${s.events.length} notes</option>`).join('') : '<option>No tabs found in this song</option>';
    select(0);
  }
  function select(i) {
    stop(); sec = secs[i] || null; pos = 0; cur = -1;
    $('soloempty').hidden = !!sec; $('solo-sel').value = String(i);
    $('solo-scrub').value = 0; $('solo-time').textContent = '0:00';
    if (sec) { sec._win = RCC.fret.windowFor(sec.minFret, sec.maxFret, 12); calcEdges(); linkTargets(sec); }
    resetScore(); fillRange();
  }
  /** For every slide / hammer / pull, remember which later event holds the destination note (for drawing the connector). */
  function linkTargets(sc) {
    const ev = sc.events;
    ev.forEach((e, i) => e.notes.forEach(n => { delete n.toIdx; if (!n.to) return; for (let j = i + 1; j < Math.min(ev.length, i + 4); j++) if (ev[j].notes.some(m => m.s === n.s && m.fret === n.to.fret)) { n.toIdx = j; break; } }));
  }
  const BEND_LABEL = b => b >= 4 ? '2' : b === 3 ? '1½' : b === 2 ? 'full' : b === 1 ? '½' : '¼';
  function calcEdges() {
    const tb = totalBeats(), b = (sec.bars || []).map(c => c / sec.colsPerBeat).filter(x => x > .01 && x < tb - .01);
    edges = [...new Set([0, ...b.map(x => +x.toFixed(3)), +tb.toFixed(3)])].sort((x, y) => x - y); st.from = 0; st.to = -1;
  }
  function fillRange() {
    const n = edges.length - 1, opt = i => `<option value="${i}">Bar ${i + 1}</option>`;
    $('solo-from').innerHTML = Array.from({ length: n }, (_, i) => opt(i)).join(''); $('solo-to').innerHTML = Array.from({ length: n }, (_, i) => opt(i)).join('');
    $('solo-from').value = '0'; $('solo-to').value = String(n - 1); $('solo-range').hidden = n < 2;
  }
  const rangeBeats = () => { const n = edges.length - 1, a = Math.min(st.from, n - 1), b = st.to < 0 ? n - 1 : Math.min(st.to, n - 1); return [edges[Math.min(a, b)], edges[Math.max(a, b) + 1]]; };
  function resetScore(keepSpeed) { sc = { hits: 0, miss: 0, combo: 0, best: 0, pts: 0 }; waiting = false; flash = []; if (sec) sec.events.forEach(e => delete e.st); }
  function resetRange(a, b) { if (sec) sec.events.forEach(e => { const t = beatOf(e); if (t >= a - .01 && t < b) delete e.st; }); }
  function summary() {
    if (st.mode === 'watch' || sc.hits + sc.miss < 3) return; const a = accPct(), g = a >= 95 ? 'S' : a >= 85 ? 'A' : a >= 70 ? 'B' : a >= 50 ? 'C' : 'D';
    D.toast(`Run complete: ${g} · ${a.toFixed(0)}% accurate · best combo ${sc.best}`);
    if (D.result) D.result({ key: 'solo:' + (D.songTitle ? D.songTitle() : '') + ':' + (sec ? sec.name : ''), acc: a, grade: g, hits: sc.hits, miss: sc.miss, combo: sc.best, mode: st.mode });
  }
  async function setMode(m) {
    if (m !== 'watch' && RCC.pro && !RCC.pro.gate('score')) { m = 'watch'; }
    st.mode = m; document.querySelectorAll('#solo-mode button').forEach(b => b.classList.toggle('on', b.dataset.v === m)); resetScore(); $('solo-lat-wrap').hidden = m === 'watch';
    if (m === 'watch') { if (unListen) { unListen(); unListen = null; } return; }
    if (unListen) return;
    try {
      unListen = await RCC.audio.listen.use({ pitch: e => { if (e.freq > 0) { const m = Math.round(69 + 12 * Math.log2(e.freq / 440)), cents = Math.abs((69 + 12 * Math.log2(e.freq / 440) - m) * 100); if (cents < 45) { const pc = ((m % 12) + 12) % 12; heard = { pc, at: performance.now(), n: pc === heard.pc && performance.now() - heard.at < 200 ? heard.n + 1 : 1, seen: heard.pc === pc ? heard.seen : performance.now() }; } } } });
    } catch (e) { D.toast('Microphone unavailable: ' + (e.message || e)); st.mode = 'watch'; setMode('watch'); }
  }
  function loadText(text, opts = {}) {
    const r = RCC.song.parseTabs(text);
    if (!r.sections.length) { D.toast('No tab found. Use six lines like e|---5---|'); return false; }
    secs = r.sections; secs.forEach((s, i) => s.name = opts.name || (s.name.startsWith('Tab ') ? 'Pasted tab' : s.name));
    $('solo-sel').innerHTML = secs.map((s, i) => `<option value="${i}">${s.name} · ${s.events.length} notes</option>`).join(''); select(0); return true;
  }

  function play() {
    if (!sec) { D.toast('Load a tab first, or try the demo'); return; }
    if (playing) { stop(); return; }
    const [ra, rb] = rangeBeats(); if (st.loop && (pos < ra || pos >= rb)) pos = ra;
    if (pos >= totalBeats() - .01) pos = 0;
    if (pos <= ra + .001) pos = ra - COUNT_IN;
    if (pos < ra) resetScoreSoft();
    lastBeat = Math.floor(pos) - 1; playing = true; last = performance.now(); D.audio().resume && D.audio().resume();
    $('solo-play').textContent = '❚❚ Pause';
  }
  function resetScoreSoft() { if (st.mode !== 'watch') { const [a, b] = rangeBeats(); resetRange(a, b); } }
  function stop() { if (playing) summary(); playing = false; waiting = false; $('solo-play').textContent = '▶ Play'; $('countin').classList.remove('on'); }
  function restart() { const a = st.loop ? rangeBeats()[0] : 0; pos = a; cur = -1; lastBeat = -99; resetScore(); if (playing) { pos = a - COUNT_IN; lastBeat = Math.floor(pos) - 1; } }

  function judge() {
    if (st.mode === 'watch' || !sec) return;
    const pa = pos - st.lat / 1000 / secPerBeat(), ev = sec.events, fresh = performance.now() - heard.at < 220 && heard.n >= 2;
    for (let i = Math.max(0, cur - 6); i < ev.length; i++) {
      const e = ev[i], t = beatOf(e); if (t - pa > WIN + .05) break; if (e.st) continue;
      if (fresh && Math.abs(pa - t) <= WIN + (st.mode === 'wait' ? 99 : 0) && e.notes.some(n => NOTE_PC(n) === heard.pc || (n.bend && (NOTE_PC(n) + n.bend) % 12 === heard.pc))) {
        e.st = 'hit'; sc.hits++; sc.combo++; sc.best = Math.max(sc.best, sc.combo); sc.pts += 100 * (1 + Math.min(sc.combo, 20) / 10) * (1 - Math.abs(pa - t) / (WIN * 2)) | 0; flash.push({ e, t0: performance.now() });
        if (waiting && i >= cur) { waiting = false; } heard.n = 0; break;
      }
      if (st.mode === 'score' && pa - t > WIN) { e.st = 'miss'; sc.miss++; sc.combo = 0; }
    }
  }
  function nextPending() { if (!sec) return null; const ev = sec.events; for (let i = Math.max(0, cur); i < ev.length; i++) if (!ev[i].st) return ev[i]; return null; }
  function tick(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    fade += ((ext || (playing && st.cam) ? 1 : 0) - fade) * Math.min(1, dt * 3.2);
    if (playing && sec && !ext) {
      let d = dt / secPerBeat(); const [ra, rb] = rangeBeats(), end = st.loop ? rb : totalBeats() + 1;
      if (st.mode === 'wait' && pos >= 0) { const np = nextPending(); if (np) { const t = beatOf(np) + st.lat / 1000 / secPerBeat(); if (pos + d >= t) { d = Math.max(0, t - pos); waiting = true; } else waiting = false; } else waiting = false; }
      pos += d; const b = Math.floor(pos);
      if (b > lastBeat && !waiting) { lastBeat = b; if (st.click) D.click(b % 4 === 0); }
      if (pos < ra) { const n = Math.ceil(ra - pos); const el = $('countin'); if (el.textContent !== String(n)) { el.textContent = n; el.classList.remove('on'); void el.offsetWidth; } el.classList.add('on'); }
      else $('countin').classList.remove('on');
      accSec += dt; if (accSec >= 5) { if (D.track) D.track({ sec: accSec }); accSec = 0; }
      if (st.mode !== 'watch') judge();
      if (pos > end) {
        if (st.loop) { // wrap, optionally ramping the tempo
          const a = accPct(), scored = st.mode !== 'watch' && sc.hits + sc.miss >= 3; summary();
          if (st.ramp) { const old = st.speed; if (!scored ? true : a >= 85) st.speed = Math.min(130, st.speed + 5); else if (a < 50) st.speed = Math.max(40, st.speed - 5); if (st.speed !== old) { $('solo-speed').value = st.speed; $('solo-speed-v').textContent = st.speed + '%'; D.toast(`Tempo ${st.speed > old ? 'up' : 'down'} to ${st.speed}%`); } }
          resetRange(ra, rb); resetScore(); pos = ra - 0.001; lastBeat = Math.floor(ra) - 1; cur = -1;
        } else { pos = totalBeats(); stop(); }
      }
    }
    if (sec) { advance(); }
    if ($('v-solo').classList.contains('on')) drawAll();
    requestAnimationFrame(tick);
  }
  function advance() { // current event index = last event whose beat <= pos
    const ev = sec.events; let i = Math.max(-1, Math.min(cur, ev.length - 1));
    while (i + 1 < ev.length && beatOf(ev[i + 1]) <= pos) i++;
    while (i >= 0 && beatOf(ev[i]) > pos) i--;
    cur = i;
  }

  /* ---- fretboard notes for the current moment (shared with the camera overlay) ---- */
  function fretState(compact) {
    if (!sec) return null;
    const ev = sec.events, notes = [];
    const links = [];
    const add = (e, kind, prog) => e && e.notes.forEach(n => { notes.push({ s: n.s, fret: n.fret, kind, prog }); if (kind === 'cur' || kind === 'next') { if (n.to) links.push({ s: n.s, f0: n.fret, f1: n.to.fret, kind: n.to.tech }); if (n.bend) links.push({ s: n.s, f0: n.fret, f1: n.fret, kind: 'b', label: BEND_LABEL(n.bend) }); } });
    const c = ev[cur], n1 = ev[cur + 1];
    if (c && pos - beatOf(c) < 1.2) add(c, 'cur');
    if (waiting && !c) { const w = nextPending(); if (w) add(w, 'cur'); }
    if (n1) add(n1, 'next', 1 - Math.max(0, Math.min(1, (beatOf(n1) - pos) / LOOK)));
    if (!compact) { add(ev[cur + 2], 'later'); add(ev[cur + 3], 'later'); }
    return { f0: sec._win[0], f1: sec._win[1], notes, links, lefty: st.lefty };
  }

  /* ---- drawing ---- */
  function fit(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c, w, h };
  }
  function drawAll() {
    const f = fit($('fret')), accent = D.accent();
    f.c.clearRect(0, 0, f.w, f.h);
    if (sec) { const fs = fretState(false); RCC.fret.draw(f.c, { x: 10, y: 4, w: f.w - 20, h: f.h - 8 }, { ...fs, accent }); }
    const hw = fit($('hw')); drawHighway(hw.c, hw.w, hw.h, accent);
    if (sec) { $('solo-scrub').value = Math.round(Math.max(0, pos) / totalBeats() * 1000); $('solo-time').textContent = fmt(Math.max(0, pos)) + ' / ' + fmt(totalBeats()); }
  }
  function drawHighway(c, w, h, accent) {
    c.clearRect(0, 0, w, h);
    const padT = 14, padB = 14, lane = (h - padT - padB) / 6, hitX = Math.round(w * .2), ppb = Math.max(90, Math.min(170, w / 8));
    for (let s = 0; s < 6; s++) { const y = padT + s * lane; c.fillStyle = s % 2 ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.05)'; c.fillRect(0, y, w, lane); c.fillStyle = RCC.fret.STRING_COLORS[s]; c.globalAlpha = .55; c.fillRect(0, y + lane / 2 - .5, w, 1); c.globalAlpha = 1; }
    if (!sec) return;
    const b0 = pos - hitX / ppb - 1, b1 = pos + (w - hitX) / ppb + 1, X = b => hitX + (b - pos) * ppb;
    for (let b = Math.ceil(b0); b <= b1; b++) { c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(b), padT); c.lineTo(X(b), h - padB); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2;
    sec.bars.forEach(col => { const x = X(col / sec.colsPerBeat); if (x > -4 && x < w + 4) { c.beginPath(); c.moveTo(x, padT); c.lineTo(x, h - padB); c.stroke(); } });
    // hit line
    const g = c.createLinearGradient(hitX - 40, 0, hitX + 40, 0); g.addColorStop(0, 'transparent'); g.addColorStop(.5, accent + 'cc'); g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(hitX - 40, padT, 80, h - padT - padB);
    c.fillStyle = '#fff'; c.fillRect(hitX - 1.5, padT - 4, 3, h - padT - padB + 8);
    if (waiting) { c.fillStyle = 'rgba(251,191,36,.9)'; c.font = '700 13px system-ui'; c.textAlign = 'left'; c.fillText('Waiting for you…', hitX + 14, padT + 16); }
    if (st.mode !== 'watch') { c.textAlign = 'right'; c.fillStyle = '#fff'; c.font = '800 22px system-ui'; c.fillText(String(sc.pts), w - 14, padT + 24); c.font = '600 12px system-ui'; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(`${accPct().toFixed(0)}% · combo ${sc.combo}${sc.combo >= 10 ? ' 🔥' : ''}`, w - 14, padT + 42); c.textAlign = 'left'; }
    const gh = Math.min(lane * .74, 38), gw = Math.min(ppb * .52, 54);
    sec.events.forEach(e => {
      const b = beatOf(e); if (b < b0 || b > b1) return;
      const x = X(b), past = x < hitX - 2, d = (pos - b), hit = e.st === 'hit', miss = e.st === 'miss';
      const alpha = hit ? Math.max(0, 1 - d * 2.2) : (st.mode === 'wait' && !e.st && d < .6) ? 1 : past ? Math.max(0, 1 - d * (miss ? 1.6 : .9)) : 1; if (alpha <= 0) return;
      e.notes.forEach(n => {
        const y = padT + n.s * lane + lane / 2, col = RCC.fret.STRING_COLORS[n.s], hot = Math.abs(d) < .18;
        c.save(); c.globalAlpha = alpha * (past ? .55 : 1);
        if (hot) { c.shadowColor = col; c.shadowBlur = 26; }
        c.fillStyle = miss ? '#6b7280' : hit ? '#34d399' : col; c.beginPath(); c.roundRect(x - gw / 2, y - gh / 2, gw * (hit ? 1 + Math.max(0, .5 - d) * .6 : 1), gh, 10); c.fill(); c.shadowBlur = 0;
        c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = hot ? 3 : 1.5; c.stroke();
        c.fillStyle = '#0b0b12'; c.font = '800 ' + Math.round(gh * .55) + 'px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(n.fret, x, y + 1);
        c.textBaseline = 'alphabetic';
        // techniques: bend (curved arrow up + amount), slide / hammer / pull (connector to the destination note), vibrato (wave)
        if (n.bend) {
          const x0 = x + gw / 2 - 2, top = y - lane * .62; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y - 3); c.quadraticCurveTo(x0 + 18, y - 6, x0 + 18, top + 6); c.stroke();
          c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x0 + 18, top); c.lineTo(x0 + 13, top + 9); c.lineTo(x0 + 23, top + 9); c.fill();
          c.font = '700 10px system-ui'; c.textAlign = 'left'; c.fillText(BEND_LABEL(n.bend), x0 + 26, top + 8);
          if (n.release != null) { c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x0 + 24, top + 4); c.quadraticCurveTo(x0 + 42, top + 4, x0 + 44, y - 4); c.stroke(); c.setLineDash([]); }
        }
        if (n.to && n.toIdx != null && sec.events[n.toIdx]) {
          const xt = X(beatOf(sec.events[n.toIdx])), up = n.to.fret > n.fret, t = n.to.tech;
          c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2;
          if (t === '/' || t === '\\') { c.beginPath(); c.moveTo(x + gw / 2, y + (up ? gh * .3 : -gh * .3)); c.lineTo(xt - gw / 2, y + (up ? -gh * .3 : gh * .3)); c.stroke(); }
          else { c.beginPath(); c.moveTo(x, y - gh / 2 - 2); c.quadraticCurveTo((x + xt) / 2, y - gh / 2 - lane * .7, xt, y - gh / 2 - 2); c.stroke(); c.fillStyle = '#fff'; c.font = '700 11px system-ui'; c.textAlign = 'center'; c.fillText(t === 'h' ? 'H' : 'P', (x + xt) / 2, y - gh / 2 - lane * .36); }
        }
        if (n.tech === '~') { c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.5; c.beginPath(); for (let k = 0; k <= 16; k++) { const px = x + gw / 2 + 3 + k * 2, py = y - gh / 2 - 7 + Math.sin(k * 1.2) * 3; k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
        else if (n.tech === 'h' || n.tech === 'p' || n.tech === '/' || n.tech === '\\') { /* shown by the connector from the previous note */ }
        c.restore(); c.textBaseline = 'alphabetic';
      });
    });
  }

  function init(deps) {
    D = deps;
    $('solo-play').onclick = play; $('solo-restart').onclick = restart;
    $('solo-sel').onchange = e => select(+e.target.value);
    $('solo-speed').oninput = e => { st.speed = +e.target.value; $('solo-speed-v').textContent = st.speed + '%'; };
    $('solo-bpm').onchange = e => D.bpm.set(+e.target.value);
    [['solo-click', 'click'], ['solo-loop', 'loop'], ['solo-flip', 'lefty'], ['solo-cam', 'cam']].forEach(([id, k]) => { $(id).checked = st[k]; $(id).onchange = e => { st[k] = e.target.checked; }; });
    document.querySelectorAll('#solo-mode button').forEach(b => b.onclick = () => setMode(b.dataset.v));
    $('solo-lat').value = st.lat; $('solo-lat').oninput = e => { st.lat = +e.target.value; $('solo-lat-v').textContent = st.lat + ' ms'; };
    $('solo-ramp').onchange = e => { st.ramp = e.target.checked; if (st.ramp && !st.loop) { $('solo-loop').checked = st.loop = true; } };
    $('solo-from').onchange = e => { st.from = +e.target.value; if (+$('solo-to').value < st.from) $('solo-to').value = st.to = st.from; resetScore(); };
    $('solo-to').onchange = e => { st.to = +e.target.value; if (+$('solo-from').value > st.to) $('solo-from').value = st.from = st.to; resetScore(); };
    $('solo-scrub').oninput = e => { pos = +e.target.value / 1000 * totalBeats(); cur = -1; lastBeat = Math.floor(pos); resetScore(); };
    $('solo-demo').onclick = () => { loadText(DEMO, { name: 'Demo solo (A minor pentatonic)' }); };
    $('solo-paste-toggle').onclick = () => { const b = $('solo-pastebox'); b.style.display = b.style.display === 'none' ? 'block' : 'none'; };
    $('solo-load').onclick = () => { if (loadText($('solo-text').value, { name: 'Pasted tab' })) $('solo-pastebox').style.display = 'none'; };
    $('solo-save').onclick = () => { const t = $('solo-text').value; if (loadText(t, { name: 'My tab' })) { D.saveTab(t); $('solo-pastebox').style.display = 'none'; } };
    document.addEventListener('keydown', e => { if ($('v-solo').classList.contains('on') && e.key === ' ' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); e.stopPropagation(); play(); } }, true);
    requestAnimationFrame(t => { last = t; tick(t); });
  }
  /** Open a tab string directly (used by Scales drills). */
  function openTab(text, name) { return loadText(text, { name }); }
  /** Follow the song's own timeline: the app pushes the beat position inside the solo section. */
  function follow(on) { ext = !!on; if (on) { let i = secs.findIndex(x => RCC.song.isSoloName(x.name)); if (i < 0) i = 0; if (secs[i] && sec !== secs[i]) select(i); stop(); } else pos = 0; }
  function pushBeat(b) { if (ext && sec) pos = b; }
  RCC.solo = {
    init, setSong: song => { buildList(song); },
    syncBpm: v => { $('solo-bpm').value = v; },
    hasTabs: () => secs.length > 0, openTab, follow, pushBeat, setMode,
    soloTabLength: () => { const i = secs.findIndex(x => RCC.song.isSoloName(x.name)); const q = secs[i < 0 ? 0 : i]; return q ? q.length / q.colsPerBeat : 0; },
    overlayState() { if (!sec || fade < .02 || (!ext && !playing)) return { active: false }; return { active: true, alpha: fade, ...fretState(true) }; },
    panelState() { return sec && fade > .02 ? { alpha: fade, ...fretState(false) } : null; },
    fade: () => fade, isPlaying: () => playing, cam: () => st.cam,
  };
})();
