/* Slow-downer (Pro): load any recording, slow it down at the same pitch, loop a section between A and B, count it in.
   Uses the media element's preservesPitch so it works on the phone and the desktop without a phase vocoder. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = { file: null, url: '', a: 0, b: 0, loop: false, speed: 1, peaks: null, dur: 0, raf: 0, count: false };
  let audio = null, D = null;
  const fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '.' + String(Math.floor((t % 1) * 10));
  function el() { return audio || (audio = $('sd-audio')); }
  async function load(file) {
    if (!file) return; st.file = file; if (st.url) URL.revokeObjectURL(st.url); st.url = URL.createObjectURL(file);
    const a = el(); a.src = st.url; a.preservesPitch = true; a.mozPreservesPitch = true; a.playbackRate = st.speed; st.a = 0; st.b = 0; st.loop = false; st.peaks = null;
    $('sd-name').textContent = file.name; paint();
    try { // waveform: decode a mono, low-rate copy so a 5-minute song is cheap
      const ab = await file.arrayBuffer(), c = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 8000); const buf = await c.decodeAudioData(ab);
      const d = buf.getChannelData(0), n = 600, per = Math.floor(d.length / n), peaks = new Float32Array(n);
      for (let i = 0; i < n; i++) { let m = 0; for (let j = i * per; j < (i + 1) * per; j += 4) { const v = Math.abs(d[j]); if (v > m) m = v; } peaks[i] = m; }
      st.peaks = peaks; st.dur = buf.duration; st.b = buf.duration; draw();
    } catch (e) { $('sd-msg').textContent = 'Could not draw the waveform (the file still plays).'; }
  }
  function draw() {
    const c = $('sd-wave'); if (!c) return; const w = c.width = c.clientWidth * devicePixelRatio, h = c.height = c.clientHeight * devicePixelRatio, g = c.getContext('2d');
    const cs = getComputedStyle(document.body), ink = cs.getPropertyValue('--ink') || '#121212', ac = cs.getPropertyValue('--ac') || '#c8102e', mut = cs.getPropertyValue('--mut') || '#888';
    g.clearRect(0, 0, w, h); const dur = st.dur || (el().duration || 1);
    if (st.loop || st.b > st.a) { g.fillStyle = 'rgba(200,16,46,.14)'; g.fillRect(st.a / dur * w, 0, Math.max(2, (st.b - st.a) / dur * w), h); }
    if (st.peaks) { g.fillStyle = mut.trim(); const n = st.peaks.length; for (let i = 0; i < n; i++) { const x = i / n * w, v = st.peaks[i] * h * .9; g.fillRect(x, (h - v) / 2, Math.max(1, w / n - 1), v); } }
    const pos = (el().currentTime || 0) / dur * w; g.fillStyle = ac.trim(); g.fillRect(pos - 1, 0, 3, h);
    g.fillStyle = ink.trim(); if (st.a > 0) g.fillRect(st.a / dur * w - 1, 0, 2, h); if (st.b < dur) g.fillRect(st.b / dur * w - 1, 0, 2, h);
  }
  function tick() { const a = el(); if (st.loop && st.b > st.a && a.currentTime >= st.b - 0.02) a.currentTime = st.a; $('sd-time').textContent = fmt(a.currentTime) + ' / ' + fmt(st.dur || a.duration || 0); draw(); st.raf = requestAnimationFrame(tick); }
  function paint() {
    $('sd-speed-v').textContent = Math.round(st.speed * 100) + '%'; $('sd-a').textContent = 'A ' + fmt(st.a); $('sd-b').textContent = 'B ' + fmt(st.b || st.dur); $('sd-loop').classList.toggle('on', st.loop);
    $('sd-play').textContent = el().paused ? '▶ Play' : '■ Stop';
  }
  async function playPause() {
    const a = el(); if (!st.file) { $('sd-file').click(); return; }
    if (!a.paused) { a.pause(); paint(); return; }
    if (RCC.pro && !RCC.pro.gate('slow')) return;
    if (st.count && D && D.bpm) { // count-in from the Practice tempo so you come in on the beat
      const A = RCC.audio, c = A.get(); await A.resume(); const spb = 60 / D.bpm(), t0 = c.currentTime + .05, beats = D.beats ? D.beats() : 4;
      for (let i = 0; i < beats; i++) A.click(t0 + i * spb, i === 0, false, .7);
      await new Promise(r => setTimeout(r, beats * spb * 1000));
    }
    if (st.loop && (a.currentTime < st.a || a.currentTime >= st.b)) a.currentTime = st.a;
    try { await a.play(); } catch (e) { $('sd-msg').textContent = 'Could not play: ' + (e.message || e); } paint();
  }
  function setSpeed(v) { st.speed = Math.max(.4, Math.min(1.25, v)); el().playbackRate = st.speed; paint(); }
  function mark(which) { const t = el().currentTime; if (which === 'a') { st.a = t; if (st.b <= st.a) st.b = st.dur || el().duration; } else { st.b = t; if (st.b <= st.a) st.a = 0; } st.loop = true; paint(); draw(); }
  function init(deps) {
    D = deps; const a = el(); if (!a) return;
    $('sd-file').onchange = e => load(e.target.files[0]); $('sd-pick').onclick = () => $('sd-file').click();
    $('sd-play').onclick = playPause; $('sd-speed').oninput = e => setSpeed(+e.target.value / 100);
    $('sd-a').onclick = () => mark('a'); $('sd-b').onclick = () => mark('b'); $('sd-loop').onclick = () => { st.loop = !st.loop; paint(); draw(); };
    $('sd-clear').onclick = () => { st.a = 0; st.b = st.dur; st.loop = false; paint(); draw(); }; $('sd-count').onchange = e => { st.count = e.target.checked; };
    document.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { $('sd-speed').value = +b.dataset.sd; setSpeed(+b.dataset.sd / 100); });
    $('sd-back').onclick = () => { a.currentTime = Math.max(0, a.currentTime - 5); }; $('sd-fwd').onclick = () => { a.currentTime = Math.min(a.duration || 0, a.currentTime + 5); };
    $('sd-wave').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); a.currentTime = (e.clientX - r.left) / r.width * (st.dur || a.duration || 0); draw(); };
    $('sd-chords').onclick = () => { if (!st.file) { D.toast('Load a recording first'); return; } if (!RCC.transcribe) return; RCC.transcribe.open(); const inp = document.getElementById('tc-file'); if (inp) { try { const dt = new DataTransfer(); dt.items.add(st.file); inp.files = dt.files; inp.dispatchEvent(new Event('change')); } catch (e) {} } };
    a.onended = () => { if (st.loop && st.b > st.a) { a.currentTime = st.a; a.play(); } else paint(); }; a.onpause = paint; a.onplay = paint;
    document.addEventListener('keydown', e => { if (!document.getElementById('gp-slow').classList.contains('on') || !document.getElementById('v-gear').classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === '[') mark('a'); else if (e.key === ']') mark('b'); else if (e.key === 'l') { st.loop = !st.loop; paint(); } else if (e.key === ',') setSpeed(st.speed - .05); else if (e.key === '.') setSpeed(st.speed + .05); else return; e.preventDefault(); });
    if (!st.raf) st.raf = requestAnimationFrame(tick); paint();
  }
  RCC.slowdown = { init, load, get state() { return st; } };
})();
