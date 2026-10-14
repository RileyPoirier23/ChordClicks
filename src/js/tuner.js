/* Guitar tuner: mic/interface selection, band-limited input ("isolate guitar"), YIN pitch detection, string-aware display. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory, P = RCC.pitch;
  const $ = id => document.getElementById(id);
  const cfg = Object.assign({ mic: '', tuning: 'standard', mode: 'auto', isol: true, gate: 22, a4: 440 }, (() => { try { return JSON.parse(localStorage.getItem('rcc-tuner') || '{}'); } catch (e) { return {}; } })());
  const save = () => { try { localStorage.setItem('rcc-tuner', JSON.stringify(cfg)); } catch (e) {} };
  let D, running = false, ctx, src, reconn, an, filters = {}, timer = null, tunedSet = new Set(), intn = null, intnRes = {};
  let lockIdx = 0, hist = [], lastGood = 0, inTuneSince = 0, shown = { cents: 0, ok: false, has: false };
  let needle = 0, hitIdx = -1, outl = 0, floor = 1, emaC = null, lastStr = -1, strHold = 0;
  const tuning = () => T.TUNINGS[cfg.tuning].notes;
  const gateThr = () => 0.003 + Math.pow(cfg.gate / 100, 2) * 0.1;

  function buildPegs() {
    $('tstrings').innerHTML = tuning().map((n, i) => { const m = /^([A-G]#?)(\d)$/.exec(n); return `<div class="peg" data-i="${i}">${m[1]}<small>${tuning().length > 6 || tuning().length < 5 ? 'string ' : 'string '}${tuning().length - i}</small></div>`; }).join('');
    document.querySelectorAll('.peg').forEach(p => p.onclick = () => {
      const i = +p.dataset.i;
      if (cfg.mode === 'lock' && lockIdx === i) setMode('auto'); else { lockIdx = i; setMode('lock'); }
      if (!running) beep(T.noteToFreq(tuning()[i], cfg.a4));
      applyFilters();
    });
    paintPegs();
  }
  function paintPegs() {
    document.querySelectorAll('.peg').forEach((p, i) => {
      p.classList.toggle('lock', cfg.mode === 'lock' && i === lockIdx);
      p.classList.toggle('hit', i === hitIdx);
      p.classList.toggle('ok', i === hitIdx && shown.ok); p.classList.toggle('done', tunedSet.has(i));
    });
  }
  function beep(f) {
    const c = D.audio(), o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(.35, c.currentTime + .03); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + 1.8);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 1.9);
  }
  function setMode(m) { cfg.mode = m; document.querySelectorAll('#tmode button').forEach(b => b.classList.toggle('on', b.dataset.v === m)); hist = []; paintPegs(); applyFilters(); save(); }

  async function listMics() {
    try {
      const d = await RCC.audio.input.devices(), cur = RCC.audio.input.deviceId;
      $('micsel').innerHTML = '<option value="">System default microphone</option>' + d.filter(x => x.deviceId !== 'default').map((x, i) => `<option value="${x.deviceId}">${(x.label || 'Input ' + (i + 1)).replace(/</g, '&lt;')}</option>`).join('');
      $('micsel').value = d.some(x => x.deviceId === cur) ? cur : '';
    } catch (e) {}
  }

  /** Band-limit the signal so only the guitar's range reaches the pitch detector. */
  function applyFilters() {
    if (!filters.hp1) return;
    let hp = 25, lp = 20000; const fs = tuning().map(n => T.noteToFreq(n, cfg.a4)), fLo = Math.min(...fs), fHi = Math.max(...fs);
    if (cfg.isol) {
      hp = Math.max(20, fLo * .7); lp = Math.min(2500, fHi * 4.5);
      if (cfg.mode === 'lock') { const f = T.noteToFreq(tuning()[lockIdx], cfg.a4); hp = f * .62; lp = Math.min(1500, f * 5); }
    }
    const t = ctx.currentTime;
    filters.hp1.frequency.setTargetAtTime(hp, t, .02); filters.hp2.frequency.setTargetAtTime(hp, t, .02);
    filters.lp1.frequency.setTargetAtTime(lp, t, .02); filters.lp2.frequency.setTargetAtTime(lp, t, .02);
  }

  async function start() {
    const A = RCC.audio;
    try { src = await A.input.open(); } catch (e) { $('tinfo').textContent = 'Microphone unavailable (' + (e.name || e.message) + '). Check Windows privacy settings → Microphone.'; return; }
    ctx = A.get(); const mk = (type, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; return f; };
    filters = { hp1: mk('highpass', .71), hp2: mk('highpass', .71), lp1: mk('lowpass', .71), lp2: mk('lowpass', .71) };
    an = ctx.createAnalyser(); an.fftSize = 8192; an.smoothingTimeConstant = 0;
    src.connect(filters.hp1); filters.hp1.connect(filters.hp2).connect(filters.lp1).connect(filters.lp2).connect(an);
    reconn = s => { s.connect(filters.hp1); }; A.input.onChange(reconn);
    applyFilters(); await listMics(); tunedSet.clear();
    running = true; hist = []; $('tonbtn').textContent = 'Stop tuner'; $('tinfo').textContent = 'Listening… pluck a string';
    timer = setInterval(tick, 40);
  }
  function stop() {
    if (!running) return; running = false; clearInterval(timer); try { src && src.disconnect(filters.hp1); an && an.disconnect(); } catch (e) {} RCC.audio.input.release(); intn = null; paintIntn();
    $('tonbtn').textContent = 'Start tuner'; $('lvl').style.width = '0'; hitIdx = -1; shown.has = false; paintPegs(); $('tnote').textContent = '—'; $('tinfo').textContent = 'Pick your input, then press Start';
  }

  const buf = new Float32Array(8192);
  function tick() {
    an.getFloatTimeDomainData(buf);
    const thr = gateThr(), sr = ctx.sampleRate;
    let rms = P.rms(buf); $('lvl').style.width = Math.min(100, rms * 8 * 100) + '%'; $('gatem').style.left = Math.min(100, thr * 8 * 100) + '%';
    let freq = -1, prob = 0;
    if (rms >= thr) {
      const fsT = tuning().map(n => T.noteToFreq(n, cfg.a4)); let opts = { minF: Math.max(25, Math.min(...fsT) * .7), maxF: Math.min(1500, Math.max(...fsT) * 2.2), threshold: .13 };
      if (cfg.mode === 'lock') { const f = T.noteToFreq(tuning()[lockIdx], cfg.a4); opts = { minF: f * .7, maxF: f * 1.6, threshold: .13 }; }
      const r = P.yin(buf, sr, opts); freq = r.freq; prob = r.prob;
      if (freq > 0) freq = sr / P.refine(buf, sr / freq);   // measure over several periods for a steady, precise reading
    }
    floor = rms < floor ? rms : floor * .9999 + rms * .0001;        // slow noise-floor estimate, keeps hiss from reading as a note
    if (rms < Math.max(thr, floor * 2.5)) freq = -1;
    const now = performance.now();
    if (freq > 0 && prob > .85) {
      // ignore one-off octave/outlier jumps; accept a new note once it persists for 3 readings
      if (hist.length >= 3) { const m0 = P.median(hist); if (Math.abs(1200 * Math.log2(freq / m0)) > 80) { if (++outl < 3) return; hist = []; emaC = null; outl = 0; } else outl = 0; }
      hist.push(freq); if (hist.length > 5) hist.shift();
      const med = P.median(hist), good = hist.filter(f => Math.abs(1200 * Math.log2(f / med)) < 40), f = good.reduce((a, b) => a + b, 0) / good.length;
      lastGood = now; show(f, now);
    } else if (now - lastGood > 1200) { hist = []; emaC = null; lastStr = -1; shown.has = false; hitIdx = cfg.mode === 'lock' ? lockIdx : -1; if (running) { $('tnote').textContent = '—'; $('tinfo').textContent = rms < thr ? 'Listening… pluck a string' : 'Hmm, not a clear note — pluck one string'; } paintPegs(); }
  }
  function show(f, now) {
    let name, oct, cents, target;
    if (cfg.mode === 'chrom') { const n = T.nearestNote(f, cfg.a4); name = n.name; oct = n.octave; cents = n.cents; hitIdx = -1; target = T.noteToFreq(name + oct, cfg.a4); }
    else if (cfg.mode === 'lock') { const note = tuning()[lockIdx]; target = T.noteToFreq(note, cfg.a4); cents = 1200 * Math.log2(f / target); hitIdx = lockIdx; const m = /^([A-G]#?)(\d)$/.exec(note); name = m[1]; oct = +m[2]; }
    else {
      let b = T.nearestString(f, tuning(), cfg.a4);
      // stick with the string you were tuning unless the pitch is clearly closer to another one for a few readings
      if (lastStr >= 0 && b.index !== lastStr) { const keep = T.noteToFreq(tuning()[lastStr], cfg.a4), kc = 1200 * Math.log2(f / keep); if (Math.abs(kc) < 350 && ++strHold < 4) b = { index: lastStr, note: tuning()[lastStr], target: keep, cents: kc }; else strHold = 0; } else strHold = 0;
      if (Math.abs(b.cents) > 650) { const n = T.nearestNote(f, cfg.a4); name = n.name; oct = n.octave; cents = n.cents; hitIdx = -1; target = T.noteToFreq(name + oct, cfg.a4); lastStr = -1; }
      else { cents = b.cents; target = b.target; hitIdx = b.index; lastStr = b.index; const m = /^([A-G]#?)(\d)$/.exec(b.note); name = m[1]; oct = +m[2]; }
    }
    emaC = emaC == null || Math.abs(cents - emaC) > 25 ? cents : emaC * .6 + cents * .4; cents = emaC;
    const inTune = Math.abs(cents) <= (shown.ok ? 6 : 3); if (inTune) { if (!inTuneSince) inTuneSince = now; } else inTuneSince = 0;
    shown = { cents, ok: inTune && now - inTuneSince > 250, has: true }; if (shown.ok && hitIdx >= 0) tunedSet.add(hitIdx); if (intn) feedIntn(f, now);
    $('tnote').innerHTML = name + '<small>' + oct + '</small>'; $('tnote').style.color = shown.ok ? 'var(--gr)' : '';
    const dir = shown.ok ? 'In tune ✓' : Math.abs(cents) < 4 ? 'Almost…' : Math.abs(cents) < 12 ? (cents < 0 ? 'A touch low ↑' : 'A touch high ↓') : cents < 0 ? 'Too low – tune up ↑' : 'Too high – tune down ↓';
    $('tinfo').textContent = f.toFixed(1) + ' Hz · ' + (cents > 0 ? '+' : '') + cents.toFixed(Math.abs(cents) < 10 ? 1 : 0) + '¢ · ' + dir;
    document.querySelector('.tuner-main').style.setProperty('--tune', shown.ok ? '#34d399' : Math.abs(cents) < 15 ? '#fbbf24' : '#8b5cf6');
    paintPegs();
  }

  /* ---- intonation checker: compare the 12th-fret note with the open string ---- */
  let ibuf = [];
  function paintIntn() {
    const box = $('intn'); if (!box) return; const names = tuning();
    if (!intn) { box.innerHTML = `<button class="btn" id="intn-go">Check intonation…</button>` + Object.keys(intnRes).map(i => `<div class="small">String ${tuning().length - i}: <b style="color:${Math.abs(intnRes[i]) <= 5 ? 'var(--gr)' : 'var(--warn)'}">${intnRes[i] > 0 ? '+' : ''}${intnRes[i].toFixed(0)}¢</b> ${Math.abs(intnRes[i]) <= 5 ? '✓ good' : intnRes[i] > 0 ? 'sharp: move saddle back' : 'flat: move saddle forward'}</div>`).join(''); $('intn-go').onclick = () => { if (!running) { D.toast('Start the tuner first'); return; } intn = { idx: cfg.mode === 'lock' ? lockIdx : hitIdx >= 0 ? hitIdx : 0, step: 'open', open: 0 }; ibuf = []; paintIntn(); }; return; }
    const lab = names[intn.idx];
    box.innerHTML = `<div class="small">String <select id="intn-s">${names.map((n, i) => `<option value="${i}" ${i === intn.idx ? 'selected' : ''}>${tuning().length - i} · ${n.replace(/\d/, '')}</option>`).join('')}</select></div><div style="margin:6px 0"><b>${intn.step === 'open' ? '1. Play the OPEN string and let it ring' : intn.step === 'fret' ? '2. Now play the 12th FRET on the same string' : 'Done'}</b></div><div class="meter"><i style="width:${Math.min(100, ibuf.length * 4)}%"></i></div><button class="btn sm" id="intn-x" style="margin-top:6px">Cancel</button>`;
    $('intn-s').onchange = e => { intn = { idx: +e.target.value, step: 'open', open: 0 }; ibuf = []; paintIntn(); }; $('intn-x').onclick = () => { intn = null; paintIntn(); };
  }
  function feedIntn(f, now) {
    const tf = T.noteToFreq(tuning()[intn.idx], cfg.a4), want = intn.step === 'open' ? tf : intn.open * 2, off = 1200 * Math.log2(f / want);
    if (Math.abs(off) > (intn.step === 'open' ? 100 : 150)) { ibuf = []; return; }
    ibuf.push(f); if (ibuf.length > 25) ibuf.shift(); const m = P.median(ibuf), spread = Math.max(...ibuf.map(x => Math.abs(1200 * Math.log2(x / m))));
    if (ibuf.length >= 16 && spread < 6) {
      if (intn.step === 'open') { intn.open = m; intn.step = 'fret'; ibuf = []; D.toast('Open string captured — now the 12th fret'); }
      else { const cents = 1200 * Math.log2(m / (intn.open * 2)); intnRes[intn.idx] = cents; intn = null; D.toast('Intonation measured'); }
      paintIntn();
    } else if (ibuf.length % 5 === 0) { const m2 = $('intn') && $('intn').querySelector('.meter i'); if (m2) m2.style.width = Math.min(100, ibuf.length * 4) + '%'; }
  }

  /* ---- gauge ---- */
  function drawGauge() {
    const cv = $('gauge'), c = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H - 60, R = Math.min(W / 2 - 40, H - 100);
    c.clearRect(0, 0, W, H);
    const A = d => (-90 + d * 70 / 50) * Math.PI / 180;      // cents -> radians (±70°)
    // zones
    [[-50, -15, 'rgba(248,113,113,.35)'], [-15, -5, 'rgba(251,191,36,.4)'], [-5, 5, 'rgba(52,211,153,.7)'], [5, 15, 'rgba(251,191,36,.4)'], [15, 50, 'rgba(248,113,113,.35)']].forEach(([a, b, col]) => {
      c.beginPath(); c.arc(cx, cy, R, A(a), A(b)); c.strokeStyle = col; c.lineWidth = 26; c.stroke();
    });
    for (let v = -50; v <= 50; v += 10) { const a = A(v), big = v % 50 === 0 || v === 0; c.strokeStyle = 'rgba(255,255,255,' + (big ? .8 : .4) + ')'; c.lineWidth = big ? 4 : 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30)); c.lineTo(cx + Math.cos(a) * (R - 52), cy + Math.sin(a) * (R - 52)); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '600 24px system-ui'; c.textAlign = 'center';
    [['♭', -50], ['0', 0], ['♯', 50]].forEach(([t, v]) => c.fillText(t, cx + Math.cos(A(v)) * (R - 82), cy + Math.sin(A(v)) * (R - 82) + 8));
    const target = shown.has ? Math.max(-50, Math.min(50, shown.cents)) : 0; needle += (target - needle) * (Math.abs(target - needle) < 3 ? .1 : .22);
    const a = A(needle), col = shown.has ? (shown.ok ? '#34d399' : Math.abs(needle) < 15 ? '#fbbf24' : '#f87171') : 'rgba(255,255,255,.3)';
    c.save(); c.shadowColor = col; c.shadowBlur = shown.has ? 24 : 0; c.strokeStyle = col; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18)); c.stroke(); c.restore();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, 14, 0, 7); c.fill();
  }

  function init(deps) {
    D = deps;
    { const ent = Object.entries(T.TUNINGS), opt = ([k, v]) => `<option value="${k}">${v.name}</option>`; $('tunsel').innerHTML = `<optgroup label="Guitar">${ent.filter(e => !e[1].group).map(opt).join('')}</optgroup><optgroup label="Other instruments">${ent.filter(e => e[1].group).map(opt).join('')}</optgroup>`; }
    $('tunsel').value = cfg.tuning; $('isol').checked = cfg.isol; $('gate').value = cfg.gate; $('a4').value = cfg.a4;
    $('tunsel').onchange = e => { cfg.tuning = e.target.value; lockIdx = Math.min(lockIdx, tuning().length - 1); tunedSet.clear(); buildPegs(); applyFilters(); save(); };
    $('isol').onchange = e => { cfg.isol = e.target.checked; applyFilters(); save(); };
    $('gate').oninput = e => { cfg.gate = +e.target.value; $('gatem').style.left = Math.min(100, gateThr() * 800) + '%'; save(); };
    $('a4').onchange = e => { cfg.a4 = Math.max(400, Math.min(480, +e.target.value || 440)); e.target.value = cfg.a4; save(); };
    $('micsel').onchange = async e => { try { await RCC.audio.input.setDevice(e.target.value); } catch (err) { D.toast('Could not open that input'); } };
    $('micref').onclick = listMics;
    document.querySelectorAll('#tmode button').forEach(b => b.onclick = () => setMode(b.dataset.v));
    $('tonbtn').onclick = () => running ? stop() : start();
    navigator.mediaDevices && navigator.mediaDevices.addEventListener('devicechange', listMics);
    setMode(cfg.mode); buildPegs(); paintIntn(); listMics(); $('gatem').style.left = Math.min(100, gateThr() * 800) + '%';
    (function loop() { if ($('v-tuner').classList.contains('on')) drawGauge(); requestAnimationFrame(loop); })();
  }
  RCC.tuner = { init, stop: () => running && stop(), isRunning: () => running };
})();
