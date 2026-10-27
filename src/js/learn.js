/* Learn hub: chord library, chord-change trainer, ear training, theory lessons, progress. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory, $ = id => document.getElementById(id);
  const S = () => RCC.store, A = () => RCC.audio;
  let D, tab = 'chords', stopChange = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAMES = r => T.FLAT_NAMES && [1, 3, 5, 8, 10].includes(r) ? T.FLAT_NAMES[r] : T.NOTES[r];
  const stats = () => { const st = S().lib.stats; return st; };
  const touch = () => { S().lib.stats.updated = Date.now(); S().save(); };
  const fmtMin = s => (s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm' : Math.round(s / 60) + ' min');

  /* ---------- sound helpers ---------- */
  function playChord(name, dir = 'D') { const v = T.voicings(name)[0]; const a = A(); a.resume(); if (v) a.strum(a.chordMidis(v.frets), a.get().currentTime + .04, dir, 1.6); else { const p = T.parseChord(name); if (!p) return; const ct = T.CHORD_TYPES.find(x => x[0] === p.quality); (ct ? ct[2] : [0, 4, 7]).forEach((i, k) => a.pluck(48 + ((p.root + i) % 12), a.get().currentTime + .04 + k * .02, 1.4, .3)); } }
  function playNotes(midis, gap, dur) { const a = A(), c = a.get(); a.resume(); const t0 = c.currentTime + .06; midis.forEach((m, i) => a.pluck(m, t0 + i * gap, dur || Math.max(.5, gap * 1.4), .38)); return midis.length * gap; }
  function playTogether(midis) { const a = A(), c = a.get(); a.resume(); midis.forEach(m => a.pluck(m, c.currentTime + .06, 1.4, .3)); }

  /* ================================================================ CHORD CHANGE TRAINER */
  const PAIRS = [['G', 'C'], ['C', 'Am'], ['Em', 'A'], ['D', 'G'], ['A', 'D'], ['F', 'C'], ['Am', 'E'], ['D', 'A'], ['G', 'D'], ['Em', 'C'], ['Dm', 'Am'], ['Bm', 'G']];
  const cc = { a: 'G', b: 'C', mode: 'mic', secs: 60, run: null };
  function changesUI() {
    const el = $('ln-changes'), key = () => [cc.a, cc.b].sort().join('|'), rec = () => (stats().changes || {})[key()];
    const r = rec();
    el.innerHTML = `<div class="ln-card card"><div class="row" style="margin:0"><b style="font-size:17px">Chord change trainer</b><span class="small">How fast can you switch? Pick two chords, play whichever one is shown, and the app listens for the switch.</span></div>
      <div class="row"><label class="l">Chords</label><select id="cc-a">${[...PAIRS.flatMap(p => p), cc.a, cc.b].filter((x, i, a) => a.indexOf(x) === i).map(c => `<option ${c === cc.a ? 'selected' : ''}>${c}</option>`).join('')}</select><span>⇄</span><select id="cc-b">${[...PAIRS.flatMap(p => p), cc.a, cc.b].filter((x, i, a) => a.indexOf(x) === i).map(c => `<option ${c === cc.b ? 'selected' : ''}>${c}</option>`).join('')}</select>
       <span class="small">Quick pairs:</span>${PAIRS.slice(0, 6).map((p, i) => `<span class="chip" data-p="${i}">${p[0]}⇄${p[1]}</span>`).join('')}</div>
      <div class="row"><label class="l">Length</label><div class="seg sm" id="cc-len">${[30, 60, 120].map(n => `<button data-v="${n}" class="${cc.secs === n ? 'on' : ''}">${n}s</button>`).join('')}</div>
       <label class="l">Detect by</label><div class="seg sm" id="cc-mode"><button data-v="mic" class="${cc.mode === 'mic' ? 'on' : ''}">Listen to my guitar</button><button data-v="tap" class="${cc.mode === 'tap' ? 'on' : ''}">I'll tap / press Space</button></div></div>
      <div class="row"><button class="btn p big" id="cc-go">▶ Start drill</button>${r ? `<span class="small">Best: <b>${r.best}</b> changes/min · last 5 avg <b>${(r.hist.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, r.hist.length)).toFixed(1)}</b></span>` : '<span class="small">No attempts on this pair yet.</span>'}</div></div>
     <div class="card ln-card" id="cc-stage" style="display:none"><div style="display:flex;gap:30px;align-items:center;flex-wrap:wrap"><div style="text-align:center"><div class="small">Play</div><div class="bignum" id="cc-target">G</div><canvas id="cc-dg" width="260" height="300" style="width:200px"></canvas></div>
       <div style="flex:1;min-width:240px"><div class="row"><div class="bignum" id="cc-n">0</div><span class="small">changes</span><div class="bignum" id="cc-t" style="margin-left:auto">60</div><span class="small">sec left</span></div><div class="meter"><i id="cc-bar" style="width:0"></i></div>
       <div class="small" id="cc-msg" style="margin-top:10px"></div><div id="cc-times" class="chain" style="margin-top:10px"></div><button class="btn" id="cc-stop" style="margin-top:12px">Stop</button></div></div></div>
     <div class="card ln-card" id="cc-res" style="display:none"></div>`;
    $('cc-a').onchange = e => { cc.a = e.target.value; changesUI(); }; $('cc-b').onchange = e => { cc.b = e.target.value; changesUI(); };
    el.querySelectorAll('[data-p]').forEach(c => c.onclick = () => { [cc.a, cc.b] = PAIRS[+c.dataset.p]; changesUI(); });
    $('cc-len').querySelectorAll('button').forEach(b => b.onclick = () => { cc.secs = +b.dataset.v; changesUI(); });
    $('cc-mode').querySelectorAll('button').forEach(b => b.onclick = () => { cc.mode = b.dataset.v; changesUI(); });
    $('cc-go').onclick = startChange; $('cc-stop').onclick = () => finishChange(true);
  }
  async function startChange() {
    if (RCC.pro && !RCC.pro.gate('trainer')) return;
    if (cc.a === cc.b) { D.toast('Pick two different chords'); return; }
    const run = (cc.run = { target: cc.a, t0: 0, times: [], tStart: 0, ok: 0, done: false, begun: false });
    $('cc-stage').style.display = 'block'; $('cc-res').style.display = 'none'; $('cc-go').disabled = true;
    const show = () => { $('cc-target').textContent = run.target; const v = T.voicings(run.target)[0]; RCC.fret.chordDiagram($('cc-dg').getContext('2d'), 260, 300, v, D.accent()); };
    show(); $('cc-msg').textContent = 'Get ready…';
    if (cc.mode === 'mic') { try { run.un = await A().listen.use({ chroma: ev => { if (!run.begun || run.done || !ev.loud) return; const m = RCC.chroma.matchChord(ev.chroma, run.target); run.ok = m.ok ? run.ok + 1 : 0; if (run.ok >= 2 && performance.now() - run.t0 > 350) landed(); } }); } catch (e) { D.toast('Microphone unavailable. Using tap mode.'); cc.mode = 'tap'; } }
    const landed = () => { const dt = (performance.now() - run.t0) / 1000; run.times.push(dt); run.ok = 0; run.target = run.target === cc.a ? cc.b : cc.a; run.t0 = performance.now(); show(); $('cc-n').textContent = run.times.length; $('cc-times').innerHTML = run.times.slice(-8).map(t => `<span class="dch"><b>${t.toFixed(2)}s</b></span>`).join(''); $('cc-msg').textContent = dt < 1 ? 'Smooth! ⚡' : dt < 2 ? 'Nice.' : 'Take your time, accuracy first.'; };
    run.landed = landed;
    run.key = e => { if (e.key === ' ' && $('v-learn').classList.contains('on') && run.begun) { e.preventDefault(); landed(); } }; document.addEventListener('keydown', run.key);
    let n = 3; $('cc-t').textContent = cc.secs; const cd = setInterval(() => { $('cc-msg').textContent = 'Starting in ' + n + '…'; if (n-- <= 0) { clearInterval(cd); run.begun = true; run.t0 = performance.now(); run.tStart = performance.now(); $('cc-msg').textContent = cc.mode === 'mic' ? 'Play ' + run.target + ' — I’m listening.' : 'Play it, then press Space or tap the chord.'; run.tick = setInterval(() => { const left = cc.secs - (performance.now() - run.tStart) / 1000; $('cc-t').textContent = Math.max(0, Math.ceil(left)); $('cc-bar').style.width = Math.min(100, (1 - left / cc.secs) * 100) + '%'; if (left <= 0) finishChange(); }, 100); } }, 1000);
    run.cd = cd; $('cc-target').onclick = () => { if (cc.mode === 'tap' && run.begun) landed(); };
  }
  function finishChange(early) {
    const run = cc.run; if (!run || run.done) return; run.done = true; clearInterval(run.cd); clearInterval(run.tick); document.removeEventListener('keydown', run.key); run.un && run.un(); $('cc-go').disabled = false;
    const n = run.times.length, elapsed = Math.max(1, (performance.now() - (run.tStart || performance.now())) / 1000), cpm = run.begun ? n / elapsed * 60 : 0;
    if (!n) { $('cc-stage').style.display = 'none'; D.toast('No changes detected. Check your mic level, or use tap mode.'); return; }
    const key = [cc.a, cc.b].sort().join('|'), st = stats(); st.changes = st.changes || {}; const r = (st.changes[key] = st.changes[key] || { best: 0, hist: [] });
    const prevBest = r.best; r.best = Math.max(r.best, +cpm.toFixed(1)); r.hist.push(+cpm.toFixed(1)); r.hist = r.hist.slice(-30); r.at = Date.now(); touch(); D.track({ sec: elapsed, drill: 'chord-change' });
    const avg = run.times.reduce((a, b) => a + b, 0) / n, best = Math.min(...run.times);
    $('cc-stage').style.display = 'none'; const res = $('cc-res'); res.style.display = 'block';
    res.innerHTML = `<div class="stat-grid"><div class="card stat"><b>${cpm.toFixed(1)}</b><span>changes / minute${cpm > prevBest && prevBest ? ' — new best! 🎉' : ''}</span></div><div class="card stat"><b>${n}</b><span>clean changes</span></div><div class="card stat"><b>${avg.toFixed(2)}s</b><span>average switch</span></div><div class="card stat"><b>${best.toFixed(2)}s</b><span>fastest switch</span></div></div>
     <div class="small" style="margin-top:10px">Tip: aim for 30+ changes a minute before moving to the next pair. Look at where your fingers land, not at the chord names.</div><canvas id="cc-hist" height="90" style="width:100%;margin-top:10px"></canvas>`;
    const cv = $('cc-hist'), w = cv.width = cv.clientWidth * 2, h = cv.height = 180, c = cv.getContext('2d'), hs = r.hist, mx = Math.max(...hs, 10);
    c.strokeStyle = D.accent(); c.lineWidth = 4; c.beginPath(); hs.forEach((v, i) => { const x = 10 + i * (w - 20) / Math.max(1, hs.length - 1), y = h - 14 - v / mx * (h - 28); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    hs.forEach((v, i) => { const x = 10 + i * (w - 20) / Math.max(1, hs.length - 1), y = h - 14 - v / mx * (h - 28); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); });
    changesUI.skip = true; $('ln-changes').querySelector('.row:last-child') && 0;
  }

  /* ================================================================ EAR TRAINING */
  const IV = [['m2', 1, 'Minor 2nd'], ['M2', 2, 'Major 2nd'], ['m3', 3, 'Minor 3rd'], ['M3', 4, 'Major 3rd'], ['P4', 5, 'Perfect 4th'], ['TT', 6, 'Tritone'], ['P5', 7, 'Perfect 5th'], ['m6', 8, 'Minor 6th'], ['M6', 9, 'Major 6th'], ['m7', 10, 'Minor 7th'], ['M7', 11, 'Major 7th'], ['P8', 12, 'Octave']];
  const IV_EASY = ['m3', 'M3', 'P4', 'P5', 'P8'], IV_MED = ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'm7', 'P8'];
  const EAR_CH = [['maj', 'Major', [0, 4, 7]], ['min', 'Minor', [0, 3, 7]], ['dim', 'Diminished', [0, 3, 6]], ['aug', 'Augmented', [0, 4, 8]], ['7', 'Dominant 7', [0, 4, 7, 10]], ['maj7', 'Major 7', [0, 4, 7, 11]], ['m7', 'Minor 7', [0, 3, 7, 10]], ['sus4', 'Sus4', [0, 5, 7]]];
  const EAR_SC = [['major', 'Major'], ['minor', 'Natural minor'], ['dorian', 'Dorian'], ['mixolydian', 'Mixolydian'], ['majpent', 'Major pentatonic'], ['minpent', 'Minor pentatonic'], ['blues', 'Blues'], ['harmonic', 'Harmonic minor']];
  const ear = { kind: 'int', level: 1, dir: 'up', q: null, score: 0, n: 0, streak: 0, best: 0, round: 0, answered: false };
  const EAR_N = 10;
  function pool() {
    if (ear.kind === 'int') { const ids = ear.level === 1 ? IV_EASY : ear.level === 2 ? IV_MED : IV.map(x => x[0]); return IV.filter(x => ids.includes(x[0])).map(x => ({ id: x[0], label: x[2], data: x[1] })); }
    if (ear.kind === 'chord') { const k = ear.level === 1 ? 2 : ear.level === 2 ? 5 : 8; return EAR_CH.slice(0, k).map(x => ({ id: x[0], label: x[1], data: x[2] })); }
    const k = ear.level === 1 ? 3 : ear.level === 2 ? 5 : 8; return EAR_SC.slice(0, k).map(x => ({ id: x[0], label: x[1], data: T.SCALES[x[0]].iv }));
  }
  function earUI() {
    const el = $('ln-ear'), sc = (stats().ear || {});
    el.innerHTML = `<div class="ln-card card"><div class="row" style="margin:0"><b style="font-size:17px">Ear training</b><span class="small">Listen, then name what you heard. ${EAR_N} questions per round.</span></div>
     <div class="row"><div class="seg" id="ear-kind"><button data-v="int" class="${ear.kind === 'int' ? 'on' : ''}">Intervals</button><button data-v="chord" class="${ear.kind === 'chord' ? 'on' : ''}">Chords</button><button data-v="scale" class="${ear.kind === 'scale' ? 'on' : ''}">Scales</button></div>
      <div class="seg sm" id="ear-lvl">${['Easy', 'Medium', 'Hard'].map((l, i) => `<button data-v="${i + 1}" class="${ear.level === i + 1 ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${ear.kind === 'int' ? `<div class="seg sm" id="ear-dir">${[['up', 'Up'], ['down', 'Down'], ['both', 'Together']].map(([v, l]) => `<button data-v="${v}" class="${ear.dir === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <span class="grow"></span><span class="small">Best: ${sc[ear.kind] ? sc[ear.kind] + '/' + EAR_N : '—'}</span></div>
     <div class="row" style="justify-content:space-between"><div><div class="small">Round score</div><div class="bignum" id="ear-score">${ear.score}<span style="font-size:22px;color:var(--mut)"> / ${ear.n}</span></div></div><div style="text-align:center"><div class="small">Streak</div><div class="bignum" id="ear-streak">${ear.streak}</div></div>
      <div><button class="btn p big" id="ear-play">▶ ${ear.q ? 'Play again' : 'Start round'}</button> <button class="btn" id="ear-skip" ${ear.q ? '' : 'disabled'}>Skip</button></div></div>
     <div class="small" id="ear-msg" style="min-height:20px;margin-top:6px"></div><div class="big-answer" id="ear-ans"></div></div>`;
    $('ear-kind').querySelectorAll('button').forEach(b => b.onclick = () => { ear.kind = b.dataset.v; ear.q = null; ear.score = ear.n = ear.streak = 0; earUI(); });
    $('ear-lvl').querySelectorAll('button').forEach(b => b.onclick = () => { if (+b.dataset.v > 1 && RCC.pro && !RCC.pro.gate('trainer')) return; ear.level = +b.dataset.v; ear.q = null; ear.score = ear.n = 0; earUI(); });
    $('ear-dir') && $('ear-dir').querySelectorAll('button').forEach(b => b.onclick = () => { ear.dir = b.dataset.v; earUI(); });
    $('ear-play').onclick = () => (ear.q ? earPlay() : earNext()); $('ear-skip').onclick = () => { if (ear.q && !ear.answered) { ear.n++; ear.streak = 0; } earNext(); };
    if (ear.q) earAnswers();
  }
  function earPlay() {
    const q = ear.q; if (!q) return; const root = 48 + Math.floor(Math.random() * 0) + q.root;
    if (ear.kind === 'int') { const a = q.root, b = q.root + q.item.data * (q.down ? -1 : 1); if (ear.dir === 'both') playTogether([a, b]); else playNotes([a, b], .8, 1.1); }
    else if (ear.kind === 'chord') { const m = q.item.data.map(i => q.root + i); if (Math.random() < .5 || true) { const a = A(), c = a.get(); a.resume(); a.strum(m, c.currentTime + .06, 'D', 1.8, .3); } }
    else { const iv = q.item.data, m = iv.map(i => q.root + i).concat([q.root + 12]); playNotes(m, .34, .5); }
  }
  function earNext() {
    if (ear.n >= EAR_N) { earEnd(); return; }
    const p = pool(); ear.q = { item: p[Math.floor(Math.random() * p.length)], root: 52 + Math.floor(Math.random() * 12), down: ear.dir === 'down' }; ear.answered = false;
    $('ear-play').textContent = '▶ Play again'; $('ear-skip').disabled = false; $('ear-msg').textContent = 'What did you hear?'; earAnswers(); earPlay();
  }
  function earAnswers() {
    const p = pool(), box = $('ear-ans'); box.innerHTML = p.map(x => `<button data-id="${x.id}">${x.label}</button>`).join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      if (ear.answered) return; ear.answered = true; const ok = b.dataset.id === ear.q.item.id; ear.n++; if (ok) { ear.score++; ear.streak++; ear.best = Math.max(ear.best, ear.streak); } else ear.streak = 0;
      b.classList.add(ok ? 'ok' : 'bad'); if (!ok) box.querySelector(`[data-id="${ear.q.item.id}"]`).classList.add('ok');
      $('ear-msg').textContent = ok ? ['Nice ear!', 'Correct!', 'Spot on.'][ear.n % 3] : 'It was ' + ear.q.item.label + '.'; $('ear-score').innerHTML = `${ear.score}<span style="font-size:22px;color:var(--mut)"> / ${ear.n}</span>`; $('ear-streak').textContent = ear.streak;
      setTimeout(() => { if ($('v-learn').classList.contains('on') && tab === 'ear') earNext(); }, 1100);
    });
  }
  function earEnd() {
    const st = stats(); st.ear = st.ear || {}; st.ear[ear.kind] = Math.max(st.ear[ear.kind] || 0, ear.score); st.earRounds = (st.earRounds || 0) + 1; touch(); D.track({ sec: EAR_N * 12, drill: 'ear' });
    const sc = ear.score; ear.q = null; earUI(); $('ear-msg').textContent = `Round complete: ${sc} / ${EAR_N}${sc === EAR_N ? ' — perfect! 🎉' : sc >= 8 ? ' — great ears!' : sc >= 5 ? ' — keep going.' : ' — try Easy mode for a while.'}`; ear.score = ear.n = 0;
  }

  /* ================================================================ THEORY LESSONS */
  const FUNC = { 0: ['Home', 'tonic', '#34d399'], 1: ['Moving away', 'subdominant', '#38bdf8'], 2: ['Soft home', 'tonic', '#34d399'], 3: ['Lift off', 'subdominant', '#38bdf8'], 4: ['Tension', 'dominant', '#f87171'], 5: ['Sad home', 'tonic', '#34d399'], 6: ['Unstable', 'dominant', '#f87171'] };
  const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  let tkey = 0;
  const keyPicker = () => `<div class="row"><label class="l">Key</label><div class="seg sm" id="t-keys">${[0, 7, 2, 9, 4, 5, 10, 3].map(r => `<button data-r="${r}" class="${tkey === r ? 'on' : ''}">${NAMES(r)}</button>`).join('')}</div></div>`;
  const dia = () => T.diatonicChords(tkey, 'major');
  const LESSONS = [
    { id: 'keys', title: 'What is a key?', sub: '5 min · the 7 notes behind every song', body: () => { const d = dia(), notes = T.scaleNotes(tkey, 'major'); return `<div class="prose"><h3>A key is a home base</h3><p>Most songs use just <b>7 notes</b> — the major scale — and the <b>7 chords</b> you can build from them. Pick one and everything you play fits together.</p></div>${keyPicker()}<div class="chain" style="margin:10px 0">${notes.map((n, i) => `<div class="nt ${i === 0 ? 'r' : ''}"><b>${n}</b><small>${i + 1}</small></div>`).join('')}</div><div class="small">Tap a chord to hear it:</div><div class="chain" id="t-chords">${d.map(c => `<div class="dch" data-c="${c.name}"><b>${c.name}</b><small>${c.roman}</small></div>`).join('')}</div><div class="prose"><div class="callout">Songs in <b>${NAMES(tkey)}</b> use these chords almost exclusively. Seeing Am, F, C and G on a sheet? That's a key of C. Spotting the key tells you which scale to solo with.</div></div>`; }, wire: () => { $('t-chords').querySelectorAll('.dch').forEach(e => e.onclick = () => playChord(e.dataset.c)); } },
    { id: 'nashville', title: 'The Nashville number system', sub: '6 min · talk about chords in any key', body: () => { const d = dia(); return `<div class="prose"><h3>Numbers instead of names</h3><p>Session players don’t say “play G, C, D”. They say <b>“1, 4, 5”</b> — because numbers work in <i>every</i> key. If the singer wants it lower, you just change the key; the numbers stay the same.</p></div>${keyPicker()}<table class="nashv"><tr><th>Number</th>${[1, 2, 3, 4, 5, 6, 7].map(n => `<td>${n}</td>`).join('')}</tr><tr><th>Roman</th>${ROMAN.map(n => `<td>${n}</td>`).join('')}</tr><tr><th>Chord in ${NAMES(tkey)}</th>${d.map(c => `<td><b>${c.name}</b></td>`).join('')}</tr></table>
        <div class="prose"><p>Try it: type a progression as numbers.</p></div><div class="row"><input id="t-nums" value="1 5 6 4" style="width:180px"><button class="btn p" id="t-numplay">▶ Hear it</button><button class="btn" id="t-numuse">Open in Practice</button></div><div class="chain" id="t-numout" style="margin-top:8px"></div><div class="prose"><div class="callout">“1 5 6 4” is the famous pop progression (Let It Be, Someone Like You, countless hits). In ${NAMES(tkey)}: <b id="t-numex"></b>.</div></div>`; }, wire: () => {
        const chords = () => { const d = dia(); return ($('t-nums').value.match(/[1-7]/g) || []).map(n => d[+n - 1].name); };
        const upd = () => { const c = chords(); $('t-numout').innerHTML = c.map(x => `<div class="dch"><b>${x}</b></div>`).join(''); $('t-numex').textContent = c.join(' – '); }; upd(); $('t-nums').oninput = upd;
        $('t-numplay').onclick = () => { const c = chords(), a = A(), t = a.get().currentTime + .05; c.forEach((x, i) => { const v = T.voicings(x)[0]; if (v) a.strum(a.chordMidis(v.frets), t + i * 1.2, 'D', 1.4); }); };
        $('t-numuse').onclick = () => { if (D.jam) D.jam('[Progression]\n' + chords().join('  '), NAMES(tkey) + ' · ' + $('t-nums').value); }; } },
    { id: 'why', title: 'Why progressions work', sub: '8 min · tension, release and the three jobs', body: () => { const d = dia(); return `<div class="prose"><h3>Every chord has a job</h3><p>Chords in a key fall into three families. Music feels good because it <b>leaves home, builds tension, and comes back</b>.</p></div>${keyPicker()}
        <div class="chain" id="t-func">${d.map((c, i) => `<div class="dch" data-i="${i}" style="border-color:${FUNC[i][2]}"><b>${c.name}</b><small>${c.roman} · ${FUNC[i][1]}</small></div>`).join('')}</div>
        <div class="prose"><p><span style="color:#34d399">●</span> <b>Tonic</b> (I, vi, iii): home, rest, “we’re here”. &nbsp; <span style="color:#38bdf8">●</span> <b>Subdominant</b> (IV, ii): moving away, a lift. &nbsp; <span style="color:#f87171">●</span> <b>Dominant</b> (V, vii°): tension that <i>wants</i> to resolve back to I.</p><p>Build your own: tap chords below in order and hear whether it resolves.</p></div>
        <div class="row"><div class="chain" id="t-build"></div><button class="btn" id="t-clear">Clear</button><button class="btn p" id="t-hear">▶ Hear it</button></div><div class="small" id="t-verdict" style="min-height:22px"></div>
        <div class="prose"><div class="callout"><b>The big idea:</b> the V chord (${d[4].name}) contains a note a half-step below the I chord’s root. Your ear <i>craves</i> that step, so V → I feels like exhaling. Try ${d[4].name} → ${d[0].name}, then stop on ${d[4].name} and notice how it hangs in the air.</div></div>`; }, wire: () => {
        const seq = []; const draw = () => { $('t-build').innerHTML = seq.map(i => `<div class="dch" style="border-color:${FUNC[i][2]}"><b>${dia()[i].name}</b></div>`).join('') || '<span class="small">tap chords above…</span>'; const last = seq[seq.length - 1], prev = seq[seq.length - 2]; $('t-verdict').textContent = !seq.length ? '' : last === 0 ? (prev === 4 || prev === 6 ? 'V → I: the strongest resolution in music. ✔' : prev === 3 ? 'IV → I: the “amen” (plagal) cadence. Gentle and warm. ✔' : 'Back home. Resolved. ✔') : last === 4 ? 'Ends on V: unresolved tension, begging to continue…' : last === 5 ? 'Ends on vi: bittersweet, a “deceptive” ending.' : last === 3 ? 'Ends on IV: open and hopeful, floating.' : 'Moving through the key…'; };
        $('t-func').querySelectorAll('.dch').forEach(e => e.onclick = () => { seq.push(+e.dataset.i); playChord(dia()[+e.dataset.i].name); draw(); }); draw();
        $('t-clear').onclick = () => { seq.length = 0; draw(); }; $('t-hear').onclick = () => { const a = A(), t = a.get().currentTime + .05; seq.forEach((i, k) => { const v = T.voicings(dia()[i].name)[0]; if (v) a.strum(a.chordMidis(v.frets), t + k * 1.1, 'D', 1.3); }); }; } },
    { id: 'names', title: 'Reading chord names', sub: '4 min · m, 7, maj7, sus', body: () => { const q = [['', 'Major', 'bright, happy: 1 – 3 – 5'], ['m', 'Minor', 'dark, sad: 1 – ♭3 – 5'], ['7', 'Dominant 7', 'bluesy, wants to move: 1 – 3 – 5 – ♭7'], ['maj7', 'Major 7', 'dreamy, jazzy: 1 – 3 – 5 – 7'], ['m7', 'Minor 7', 'smooth, mellow: 1 – ♭3 – 5 – ♭7'], ['sus4', 'Suspended 4', 'unresolved, open: 1 – 4 – 5'], ['sus2', 'Suspended 2', 'airy, open: 1 – 2 – 5']]; return `<div class="prose"><h3>What the letters after the note mean</h3><p>The first letter is the <b>root</b>. Whatever follows changes the <i>colour</i>. Hear the same root with each suffix:</p></div>${keyPicker()}<div class="lesson-list">${q.map(([s, n, d]) => `<div class="lesson-card" data-c="${NAMES(tkey)}${s}"><b>${NAMES(tkey)}${s}</b> <small>${n}</small><div class="small">${d}</div></div>`).join('')}</div>`; }, wire: () => { $('lesson-body').querySelectorAll('[data-c]').forEach(e => e.onclick = () => playChord(e.dataset.c)); } },
    { id: 'capo', title: 'Capo & transposing', sub: '4 min · play hard songs with easy shapes', body: () => { const shapes = ['G', 'C', 'D', 'Em', 'Am']; return `<div class="prose"><h3>A capo moves the whole key</h3><p>A capo on fret <b>n</b> raises every chord by <b>n semitones</b>. So you can play easy open shapes and sound in a harder key.</p></div>${keyPicker()}<div class="row"><label class="l">Capo fret</label><input type="range" id="t-capo" min="0" max="9" value="2" style="width:200px"><b id="t-capov">2</b></div><div class="small">You play these shapes → they sound like:</div><div class="chain" id="t-capoout"></div><div class="prose"><div class="callout">Song in a hard key like ${NAMES((tkey + 1) % 12)}? Try capo 1, 2 or 3 and see if the shapes become G, C, D, Em, Am. In Practice, use the <b>Transpose / Capo</b> helper to do this automatically for any song.</div></div>`; }, wire: () => { const upd = () => { const n = +$('t-capo').value; $('t-capov').textContent = n; $('t-capoout').innerHTML = ['G', 'C', 'D', 'Em', 'Am'].map(c => `<div class="dch" data-c="${c}"><b>${c}</b><small>sounds ${T.transposeChord(c, n)}</small></div>`).join(''); $('t-capoout').querySelectorAll('.dch').forEach(e => e.onclick = () => playChord(e.dataset.c)); }; $('t-capo').oninput = upd; upd(); } },
  ];
  let lesson = null;
  function theoryUI() {
    const el = $('ln-theory'), done = (stats().lessons || {});
    if (!lesson) { el.innerHTML = `<div class="ln-card card"><b style="font-size:17px">Theory lessons</b><div class="small" style="margin:4px 0 12px">Short, interactive — every example plays through your speakers.</div><div class="lesson-list">${LESSONS.map(l => `<div class="lesson-card ${done[l.id] ? 'done' : ''}" data-id="${l.id}"><b>${l.title}</b> ${done[l.id] ? '✓' : ''}<div class="small">${l.sub}</div></div>`).join('')}</div></div>`; el.querySelectorAll('[data-id]').forEach(c => c.onclick = () => { lesson = LESSONS.find(l => l.id === c.dataset.id); theoryUI(); }); return; }
    el.innerHTML = `<div class="ln-card card"><div class="row" style="margin:0 0 10px"><button class="btn sm" id="t-back">← All lessons</button><b style="font-size:17px">${lesson.title}</b><span class="grow"></span><button class="btn p sm" id="t-done">${done[lesson.id] ? '✓ Completed' : 'Mark complete'}</button></div><div id="lesson-body">${lesson.body()}</div></div>`;
    $('t-back').onclick = () => { lesson = null; theoryUI(); }; $('t-done').onclick = () => { const st = stats(); st.lessons = st.lessons || {}; st.lessons[lesson.id] = Date.now(); touch(); D.toast('Lesson complete ✓'); theoryUI(); };
    const k = $('t-keys'); if (k) k.querySelectorAll('button').forEach(b => b.onclick = () => { tkey = +b.dataset.r; theoryUI(); });
    lesson.wire && lesson.wire();
  }

  /* ================================================================ PROGRESS */
  function progressUI() {
    const st = stats(), tot = S().totals(), sk = S().streak(), days = st.days || {}, key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const now = new Date(), tdy = (days[S().today()] || {}).sec || 0; let week = 0; for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(d.getDate() - i); week += (days[key(d)] || {}).sec || 0; }
    const cells = []; const start = new Date(now); start.setDate(start.getDate() - (26 * 7 - 1) - start.getDay() + 6 - 6); for (let i = 0; i < 26 * 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const m = ((days[key(d)] || {}).sec || 0) / 60, lv = m <= 0 ? '' : m < 10 ? 'l1' : m < 25 ? 'l2' : m < 45 ? 'l3' : 'l4'; cells.push(`<i class="${lv}" title="${key(d)}: ${Math.round(m)} min"></i>`); }
    const scores = Object.entries(st.best || {}).map(([k, v]) => [k.replace(/^solo:/, '').replace(/:$/, ''), v]).sort((a, b) => b[1] - a[1]).slice(0, 6), ch = Object.entries(st.changes || {});
    const ACH = [['first', 'First practice', tot.sec > 60], ['s3', '3-day streak', sk.best >= 3], ['s7', '7-day streak', sk.best >= 7], ['s30', '30-day streak', sk.best >= 30], ['k10', '10 chords known', S().knownCount() >= 10], ['k25', '25 chords known', S().knownCount() >= 25], ['sc5', '5 scales learned', S().learnedScaleCount() >= 5], ['sc12', 'All 12 major scales', ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'].every((_, i) => S().scaleLearned([0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5][i] + ':major'))], ['h1', '1 hour practiced', tot.sec >= 3600], ['h10', '10 hours practiced', tot.sec >= 36000], ['cc30', '30 changes / minute', ch.some(([, r]) => r.best >= 30)], ['ear', 'Perfect ear round', Object.values(st.ear || {}).some(v => v >= 10)], ['les', 'All theory lessons', LESSONS.every(l => (st.lessons || {})[l.id])]];
    $('ln-progress').innerHTML = `<div class="stat-grid"><div class="card stat"><b>🔥 ${sk.current}</b><span>day streak · best ${sk.best}</span></div><div class="card stat"><b>${fmtMin(tdy)}</b><span>today</span></div><div class="card stat"><b>${fmtMin(week)}</b><span>last 7 days</span></div><div class="card stat"><b>${fmtMin(tot.sec)}</b><span>all time</span></div><div class="card stat"><b>${tot.songs}</b><span>songs played</span></div><div class="card stat"><b>${S().knownCount()}</b><span>chords known</span></div><div class="card stat"><b>${S().learnedScaleCount()}</b><span>scales learned</span></div><div class="card stat"><b>${Object.keys(st.lessons || {}).length}/${LESSONS.length}</b><span>lessons done</span></div></div>
     <div class="card ln-card" style="margin-top:12px"><b>Last 26 weeks</b><div class="small" style="margin-bottom:8px">A day counts toward your streak after 1 minute of practice or playing a song.</div><div class="heat">${cells.join('')}</div></div>
     <div class="card ln-card"><b>Personal bests</b><div class="chain" style="margin-top:8px">${[...scores.map(([k, v]) => `<div class="dch"><b>${v}%</b><small>${esc(k).slice(0, 34)}</small></div>`), ...ch.map(([k, r]) => `<div class="dch"><b>${r.best}/min</b><small>${k.replace('|', ' ⇄ ')}</small></div>`), ...Object.entries(st.ear || {}).map(([k, v]) => `<div class="dch"><b>${v}/10</b><small>ear · ${k}</small></div>`)].join('') || '<span class="small">Play along in Solo (Score mode), run a chord-change drill, or do an ear round and your bests show up here.</span>'}</div></div>
     <div class="card ln-card"><div class="row" style="justify-content:space-between;margin:0"><b>This week</b><button class="btn sm" id="pg-report">Weekly report</button></div><div class="small" style="margin-top:6px">${esc(RCC.report ? RCC.report.compute(S().lib).note : '')}</div></div>
     <div class="card ln-card"><b>Achievements</b><div class="chain" style="margin-top:8px">${ACH.map(([id, n, ok]) => `<div class="dch" style="opacity:${ok ? 1 : .35}"><b>${ok ? '🏅' : '🔒'} ${n}</b></div>`).join('')}</div></div>`;
    const rb = $('pg-report'); if (rb) rb.onclick = () => RCC.report.open();
  }

  /* ================================================================ PATHS (lesson packs) */
  const PATHS = [
    { id: 'first', title: 'Your first 10 songs', free: true, blurb: 'Eight open chords, the changes between them, and a strum you can keep. Two weeks if you do a little every day.',
      steps: [['lesson', 'keys'], ['chord', 'G'], ['chord', 'C'], ['chord', 'D'], ['change', 'G', 'C'], ['change', 'G', 'D'], ['chord', 'Em'], ['chord', 'Am'], ['change', 'C', 'Am'], ['chord', 'E'], ['chord', 'A'], ['change', 'Em', 'A'], ['chord', 'Dm'], ['finger', 0], ['ear', 'interval']] },
    { id: 'barre', title: 'Barre chords', blurb: 'F and B minor stop being the enemy. E and A shapes moved up the neck, then the changes that use them.',
      steps: [['lesson', 'nashville'], ['chord', 'F'], ['change', 'F', 'C'], ['chord', 'Bm'], ['change', 'Bm', 'G'], ['chord', 'B'], ['chord', 'F#m'], ['change', 'F#m', 'D'], ['chord', 'Bb'], ['chord', 'Cm'], ['scale', '0:major']] },
    { id: 'fingerstyle', title: 'Fingerstyle foundations', blurb: 'Thumb independence, the p-i-m-a patterns everybody uses, and the chords that ring under them.',
      steps: [['chord', 'Am'], ['chord', 'C'], ['finger', 0], ['finger', 1], ['finger', 2], ['chord', 'Cadd9'], ['chord', 'Em7'], ['finger', 3], ['finger', 4], ['change', 'Am', 'C'], ['finger', 5]] },
    { id: 'lead', title: 'Lead guitar: pentatonic to solo', blurb: 'Minor pentatonic in every position, the major scale on top, bends and slides, then a scored solo.',
      steps: [['scale', '9:minor pentatonic'], ['scale', '4:minor pentatonic'], ['lesson', 'keys'], ['scale', '7:major'], ['scale', '0:major'], ['ear', 'interval'], ['ear', 'chord'], ['scale', '2:minor pentatonic'], ['solo']] },
    { id: 'theory', title: 'Theory that you actually use', blurb: 'Keys, numbers, why chords go where they go, and training your ear to hear it before you play it.',
      steps: [['lesson', 'keys'], ['lesson', 'nashville'], ['ear', 'interval'], ['ear', 'chord'], ['scale', '0:major'], ['scale', '9:minor'], ['ear', 'progression']] },
  ];
  const SC_NAME = k => { const [r, s] = k.split(':'); return NAMES(+r) + ' ' + s; };
  function stepInfo(s) {
    const st = stats();
    if (s[0] === 'lesson') { const l = LESSONS.find(x => x.id === s[1]); return { label: 'Lesson · ' + (l ? l.title : s[1]), done: !!(st.lessons || {})[s[1]], go: () => { lesson = l || null; show('theory'); } }; }
    if (s[0] === 'chord') return { label: 'Learn ' + s[1], done: S().knows(s[1]), go: () => { RCC.chords.select(s[1]); show('chords'); } };
    if (s[0] === 'change') { const r = (st.changes || {})[[s[1], s[2]].sort().join('|')]; return { label: `${s[1]} ⇄ ${s[2]} at 20/min`, done: !!(r && r.best >= 20), sub: r ? 'best ' + r.best : '', go: () => changes(s[1], s[2]) }; }
    if (s[0] === 'finger') { const P = (RCC.fingerpick.PATTERNS || [])[s[1]]; return { label: 'Fingerpick · ' + (P ? P.name : 'pattern ' + (s[1] + 1)), done: !!(P && (st.finger || {})[P.id]), go: () => { show('finger'); if (P) RCC.fingerpick.select(P.id); } }; }
    if (s[0] === 'ear') { const k = { interval: 'int', chord: 'chord', progression: 'prog' }[s[1]] || s[1]; return { label: 'Ear · ' + s[1] + 's, 7/10', done: ((st.ear || {})[k] || 0) >= 7, go: () => { ear.kind = k; show('ear'); } }; }
    if (s[0] === 'scale') return { label: 'Scale · ' + SC_NAME(s[1]), done: S().scaleLearned(s[1]), go: () => { const [r, t] = s[1].split(':'); RCC.scales.open(+r, t); RCC.app.show('scales'); } };
    if (s[0] === 'solo') return { label: 'Score 80% on a solo', done: Object.values(st.best || {}).some(v => v >= 80), go: () => { RCC.app.show('solo'); $('solo-demo').click(); } };
    return { label: s.join(' '), done: false, go: () => {} };
  }
  let pathOpen = null;
  function pathsUI() {
    const el = $('ln-paths'); if (!el) return; const pro = !RCC.pro || RCC.pro.has();
    if (!pathOpen) { el.innerHTML = `<div class="small" style="margin-bottom:10px">A path is a lesson pack: chords, changes, drills and lessons in the order that works. Ticks come from what you actually do in the app.</div><div class="paths">${PATHS.map(p => { const info = p.steps.map(stepInfo), done = info.filter(i => i.done).length; return `<button class="card path ${!p.free && !pro ? 'locked' : ''}" data-p="${p.id}"><div class="row" style="justify-content:space-between;margin:0"><b>${esc(p.title)}</b>${p.free ? '<span class="tag">Free</span>' : pro ? '' : '<span class="pro-tag">PRO</span>'}</div><div class="small" style="margin:6px 0">${esc(p.blurb)}</div><div class="bar"><i style="width:${Math.round(done / p.steps.length * 100)}%"></i></div><div class="small">${done}/${p.steps.length} done</div></button>`; }).join('')}</div>`;
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const p = PATHS.find(x => x.id === b.dataset.p); if (!p.free && RCC.pro && !RCC.pro.gate('trainer')) return; pathOpen = p; pathsUI(); }); return; }
    const p = pathOpen, info = p.steps.map(stepInfo), next = info.findIndex(i => !i.done);
    el.innerHTML = `<div class="row" style="justify-content:space-between"><button class="btn sm" id="pt-back">← Paths</button><b>${esc(p.title)}</b><span class="small">${info.filter(i => i.done).length}/${info.length}</span></div><div class="small" style="margin:4px 0 10px">${esc(p.blurb)}</div>
      <ol class="plan">${info.map((i, k) => `<li class="${i.done ? 'done' : k === next ? 'next' : ''}"><span class="pl-ic">${i.done ? '✓' : k + 1}</span><div class="grow"><b>${esc(i.label)}</b>${i.sub ? ` <span class="small">${esc(i.sub)}</span>` : ''}</div><button class="btn sm ${k === next ? 'p' : ''}" data-s="${k}">${i.done ? 'Again' : 'Go'}</button></li>`).join('')}</ol>`;
    $('pt-back').onclick = () => { pathOpen = null; pathsUI(); }; el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => info[+b.dataset.s].go());
  }
  function changes(a, b) { cc.a = a; cc.b = b; show('changes'); }

  /* ================================================================ shell */
  function show(t) {
    tab = t; if (stopChange) stopChange(); if (t !== 'finger' && RCC.fingerpick) RCC.fingerpick.stop();
    document.querySelectorAll('#ln-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); document.querySelectorAll('.ln-pane').forEach(p => p.classList.toggle('on', p.id === 'ln-' + t));
    if (t === 'chords') RCC.chords.redraw(); else if (t === 'changes' && !(cc.run && !cc.run.done)) changesUI(); else if (t === 'ear') earUI(); else if (t === 'finger') RCC.fingerpick.redraw(); else if (t === 'theory') theoryUI(); else if (t === 'progress') progressUI(); else if (t === 'paths') pathsUI();
  }
  function init(deps) {
    D = deps; D.jam = deps.jam; document.querySelectorAll('#ln-tabs button').forEach(b => b.onclick = () => show(b.dataset.t));
    RCC.chords.build($('ln-chords'), { accent: D.accent, useChord: n => D.useChord && D.useChord(n) });
    if (RCC.fingerpick) RCC.fingerpick.init(D);
  }
  RCC.learn = { init, show, redraw: () => show(tab), setDeps: o => Object.assign(D, o), openChord: n => { RCC.chords.select(n); show('chords'); }, changes, PATHS };
})();
