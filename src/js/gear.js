/* Gear view: pedalboard + amp with live feedback, looper, recorder. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const A = RCC.audio, $ = id => document.getElementById(id);
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let D = {}, built = false, raf = 0, stopListen = null, note = { name: '—', cents: 0 };
  const PRESETS = {
    'Clean sparkle': { on: { comp: 1, amp: 1, chorus: 1, reverb: 1 }, amp: 'Clean', p: { chorus: { mix: .3 }, reverb: { mix: .2 } } },
    'Blues crunch': { on: { amp: 1, drive: 1, reverb: 1 }, amp: 'Crunch', type: 'Overdrive', p: { drive: { drive: .35, level: .5 }, reverb: { mix: .2 } } },
    'Classic rock': { on: { amp: 1, drive: 1, delay: 1 }, amp: 'Crunch', type: 'Distortion', p: { drive: { drive: .5 }, delay: { mix: .15, time: .3, feedback: .25 } } },
    'Lead singing': { on: { comp: 1, amp: 1, drive: 1, delay: 1, reverb: 1 }, amp: 'Lead', type: 'Overdrive', p: { drive: { drive: .6 }, delay: { mix: .25, time: .4, feedback: .4 }, reverb: { mix: .3, decay: .55 } } },
    'Metal wall': { on: { amp: 1, drive: 1 }, amp: 'Metal', type: 'Distortion', p: { drive: { drive: .7, level: .45 } } },
    'Ambient wash': { on: { comp: 1, amp: 1, chorus: 1, delay: 1, reverb: 1 }, amp: 'Clean', p: { delay: { mix: .45, time: .55, feedback: .6 }, reverb: { mix: .55, decay: .9 }, chorus: { mix: .5 } } },
  };

  function knob(label, v, onChange, color) {
    const el = document.createElement('div'); el.className = 'knob'; el.style.setProperty('--kc', color || 'var(--ac)');
    el.innerHTML = `<svg viewBox="0 0 48 48"><circle class="kt" cx="24" cy="24" r="19"/><path class="ka" d=""/><g class="kn"><circle cx="24" cy="24" r="14"/><rect x="22.5" y="7" width="3" height="10" rx="1.5"/></g></svg><b>${label}</b><i></i>`;
    const arc = el.querySelector('.ka'), nob = el.querySelector('.kn'), val = el.querySelector('i');
    const paint = () => { const a = -135 + v * 270, r = 19, p = ang => [24 + r * Math.sin(ang * Math.PI / 180), 24 - r * Math.cos(ang * Math.PI / 180)];
      const [x0, y0] = p(-135), [x1, y1] = p(a); arc.setAttribute('d', v > .003 ? `M${x0} ${y0}A${r} ${r} 0 ${a + 135 > 180 ? 1 : 0} 1 ${x1} ${y1}` : ''); nob.style.transform = `rotate(${a}deg)`; val.textContent = Math.round(v * 100); };
    paint();
    let sy = 0, sv = 0;
    const move = e => { v = Math.max(0, Math.min(1, sv + (sy - e.clientY) / 160 * (e.shiftKey ? .25 : 1))); paint(); onChange(v); };
    el.onpointerdown = e => { sy = e.clientY; sv = v; el.setPointerCapture(e.pointerId); el.onpointermove = move; el.classList.add('drag'); };
    el.onpointerup = () => { el.onpointermove = null; el.classList.remove('drag'); };
    el.ondblclick = () => { v = +el.dataset.def || v; };
    el.onwheel = e => { e.preventDefault(); v = Math.max(0, Math.min(1, v - Math.sign(e.deltaY) * .03)); paint(); onChange(v); };
    el.tabIndex = 0; el.onkeydown = e => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { v = Math.min(1, v + .03); } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { v = Math.max(0, v - .03); } else return; paint(); onChange(v); e.preventDefault(); };
    el.set = nv => { v = nv; paint(); };
    return el;
  }

  function saveRig() { const f = A.fx || A.buildFxState; if (!f) return; lsSet('rcc-rig', { on: f.on, p: f.p, type: f.type, cab: f.cab, gate: f.gateThr, inGain: f.inGain ? f.inGain.gain.value : 1 }); }
  function ensureFx() {
    const c = A.get(); if (!A.fx) { A.fx = A.buildFx(c); }
    const s = lsGet('rcc-rig', null), f = A.fx;
    if (s && !f._restored) { f._restored = true; Object.keys(s.p || {}).forEach(k => f.p[k] && Object.assign(f.p[k], s.p[k])); Object.assign(f.type, s.type || {}); f.cab = s.cab !== false; Object.keys(s.on || {}).forEach(k => f.pedals[k].on = !!s.on[k]); f.gateThr = s.gate || 0; A.FX_ORDER.forEach(f.apply); }
    return f;
  }

  function buildBoard() {
    const f = ensureFx(), board = $('g-board'); board.innerHTML = '';
    A.FX_ORDER.forEach(k => {
      const def = A.FX_DEFS[k], card = document.createElement('div'); card.className = 'pedal' + (k === 'amp' ? ' amp' : ''); card.dataset.k = k; card.style.setProperty('--pc', def.color);
      card.innerHTML = `<div class="ph"><span class="led"></span><b>${def.name}</b></div><div class="pk"></div><div class="pf"></div>`;
      const pk = card.querySelector('.pk');
      Object.entries(def.params).forEach(([n, d]) => { const kn = knob(d.label, f.p[k][n], v => { f.set(k, n, v); saveRig(); }, def.color); kn.dataset.def = d.v; pk.appendChild(kn); });
      const pf = card.querySelector('.pf');
      if (def.types) { pf.innerHTML = `<div class="seg sm">${def.types.map(t => `<button data-t="${t}" class="${f.type[k] === t ? 'on' : ''}">${t}</button>`).join('')}</div>`; pf.querySelectorAll('button').forEach(b => b.onclick = () => { f.setType(k, b.dataset.t); pf.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); saveRig(); }); }
      if (k === 'amp') { pf.innerHTML = `<div class="seg sm">${Object.keys(A.AMP_MODELS).map(m => `<button data-m="${m}">${m}</button>`).join('')}</div><label class="tg"><span class="sw"><input type="checkbox" class="cab" ${f.cab ? 'checked' : ''}><i></i></span>Cabinet</label>`;
        pf.querySelectorAll('button').forEach(b => b.onclick = () => { f.setAmpModel(b.dataset.m); refreshKnobs(); saveRig(); });
        pf.querySelector('.cab').onchange = e => { f.setCab(e.target.checked); saveRig(); }; }
      card.querySelector('.ph').onclick = () => { f.setOn(k, !f.pedals[k].on); card.classList.toggle('on', f.pedals[k].on); saveRig(); };
      card.classList.toggle('on', f.pedals[k].on); board.appendChild(card);
    });
  }
  function refreshKnobs() { const f = A.fx; document.querySelectorAll('#g-board .pedal').forEach(card => { const k = card.dataset.k; [...card.querySelectorAll('.knob')].forEach((kn, i) => kn.set(Object.values(f.p[k])[i])); }); }
  function applyPreset(name) {
    const P = PRESETS[name], f = ensureFx();
    A.FX_ORDER.forEach(k => { f.pedals[k].on = !!(P.on[k]); Object.entries(A.FX_DEFS[k].params).forEach(([n, d]) => f.p[k][n] = d.v); });
    f.setAmpModel(P.amp); if (P.type) f.type.drive = P.type;
    Object.entries(P.p || {}).forEach(([k, o]) => Object.assign(f.p[k], o)); A.FX_ORDER.forEach(f.apply);
    buildBoard(); saveRig(); D.toast && D.toast('Preset: ' + name);
  }

  /* ---------- live feedback ---------- */
  function feedbackLoop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      raf = requestAnimationFrame(tick); const f = A.fx; if (!$('v-gear').classList.contains('on')) return;
      const lv = f && f.running ? f.level || 0 : 0, db = lv > 0 ? 20 * Math.log10(lv) : -90;
      $('g-lvl').style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%'; $('g-db').textContent = f && f.running ? (db > -89 ? db.toFixed(0) + ' dB' : '—') : 'off';
      const l = A.looper; $('lp-ring').style.setProperty('--p', (l.pos() * 360).toFixed(1) + 'deg');
      if (A.recorder.active()) { const e = A.recorder.elapsed(); $('rc-time').textContent = Math.floor(e / 60) + ':' + String(Math.floor(e % 60)).padStart(2, '0'); }
      let tip = '', cls = 'ok';
      if (!f || !f.running) tip = 'Rig is off. Press Power to hear your guitar through the pedals.';
      else if (db > -3) { tip = 'Signal is clipping — turn down your interface/mic gain or the Amp master.'; cls = 'bad'; }
      else if (db < -50) tip = 'No signal yet. Strum something, or check the input device.';
      else if (db < -38) tip = 'Signal is quiet — raise input gain for a cleaner tone.', cls = 'warn';
      else tip = 'Level is healthy.';
      if (f && f.running && f.monitor.gain.value > 0 && !$('g-hp').dataset.ack) { tip += ' Monitoring through speakers can feed back — use headphones.'; if (cls === 'ok') cls = 'warn'; }
      const tipEl = $('g-tip'); tipEl.textContent = tip; tipEl.className = 'tip ' + cls;
      $('g-note').textContent = note.name; $('g-cents').style.setProperty('--c', note.cents);
    };
    tick();
  }

  async function power() {
    const btn = $('g-power');
    if (A.fx && A.fx.running) { A.stopFx(); if (stopListen) { stopListen(); stopListen = null; } btn.classList.remove('on'); btn.textContent = 'Power on'; return; }
    try {
      ensureFx(); const f = await A.startFx(); f.gateThr = lsGet('rcc-rig', {}).gate || 0; f.inGain.gain.value = lsGet('rcc-rig', {}).inGain ?? 1;
      A.setMonitor($('g-mon').checked); btn.classList.add('on'); btn.textContent = 'Power off';
      stopListen = await A.listen.use({ pitch: e => { if (e.freq > 0) { const m = 69 + 12 * Math.log2(e.freq / 440), n = Math.round(m); note = { name: RCC.theory.NOTES[((n % 12) + 12) % 12] + Math.floor(n / 12 - 1), cents: Math.round((m - n) * 100) }; } else if (e.rms < .004) note = { name: '—', cents: 0 }; } });
    } catch (e) { D.toast && D.toast('Could not open input: ' + (e.message || e)); }
  }

  async function fillDevices() {
    const sel = $('g-dev'), list = await A.input.devices(); sel.innerHTML = '<option value="">Default input</option>' + list.map(d => `<option value="${d.deviceId}">${d.label || 'Input ' + d.deviceId.slice(0, 4)}</option>`).join(''); sel.value = A.input.deviceId || '';
  }

  /* ---------- looper ---------- */
  function paintLooper() {
    const l = A.looper, st = { idle: 'Ready', rec: 'Recording…', play: 'Playing', over: 'Overdubbing…', stopped: 'Stopped' }[l.state];
    $('lp-state').textContent = st; $('lp-state').className = 'lp-state ' + l.state;
    $('lp-rec').textContent = l.state === 'rec' ? '■ Finish loop' : '● Record'; $('lp-over').disabled = !l.layers.length || l.state === 'rec' || l.state === 'over';
    $('lp-layers').innerHTML = l.layers.map((ly, i) => `<div class="layer"><b>Layer ${i + 1}</b><input type="range" min="0" max="1.5" step=".05" value="${ly.vol}" data-i="${i}"><button class="btn sm ${ly.mute ? 'danger' : ''}" data-m="${i}">${ly.mute ? 'Muted' : 'Mute'}</button></div>`).join('') || '<div class="small">No layers yet. Hit Record, play a phrase, then overdub on top.</div>';
    $('lp-layers').querySelectorAll('input').forEach(r => r.oninput = () => l.setVol(+r.dataset.i, +r.value));
    $('lp-layers').querySelectorAll('[data-m]').forEach(b => b.onclick = () => l.setMute(+b.dataset.m, !l.layers[+b.dataset.m].mute));
  }
  async function loopRecord() {
    const l = A.looper; if (l.state === 'rec') { l.finish(); return; }
    if (RCC.pro && !RCC.pro.gate('looper')) return;
    if (!A.fx || !A.fx.running) await power();
    const bars = +$('lp-bars').value, bpm = D.bpm ? D.bpm() : 100, beats = D.beats ? D.beats() : 4;
    l.comp = +$('lp-comp').value; await l.record({ bars, bpm, beats, countIn: $('lp-count').checked ? beats : 0 });
  }

  /* ---------- recorder ---------- */
  async function recToggle() {
    const R = A.recorder;
    if (R.active()) { const take = await R.stop(); $('rc-btn').textContent = '● Start recording'; $('rc-btn').classList.remove('rec'); addTake(take); return; }
    if (!R.supported()) { D.toast && D.toast('Recording is not supported here'); return; }
    A.get(); A.setClickRecorded($('rc-click').checked);
    if ($('rc-gtr').checked && (!A.fx || !A.fx.running)) await power();
    A.recGuitar.gain.value = $('rc-gtr').checked ? 1 : 0;
    R.start({ canvas: document.getElementById('out'), video: $('rc-vid').checked }); $('rc-btn').textContent = '■ Stop'; $('rc-btn').classList.add('rec');
  }
  function addTake(t) {
    if (!t) return; const ext = t.ext || 'webm', name = 'RCC-take-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.' + ext;
    t.file = name; const el = document.createElement('div'); el.className = 'take';
    el.innerHTML = `<${t.video ? 'video' : 'audio'} src="${t.url}" controls ${t.video ? 'muted' : ''}></${t.video ? 'video' : 'audio'}><div><b>${t.name}</b><div class="small">${Math.round(t.dur)}s · ${(t.size / 1048576).toFixed(1)} MB · ${t.video ? 'camera + overlay + audio' : 'audio only'}</div><div class="row"><button class="btn sm p save">Save…</button></div></div>`;
    el.querySelector('.save').onclick = async () => {
      if (window.rcc && window.rcc.saveRecording) { const buf = await t.blob.arrayBuffer(); const r = await window.rcc.saveRecording(name, buf); D.toast && D.toast(r && r.ok ? 'Saved to ' + r.path : 'Save cancelled'); }
      else { const a = document.createElement('a'); a.href = t.url; a.download = name; a.click(); }
    };
    $('rc-takes').prepend(el);
  }

  function build() {
    if (built) return; built = true;
    buildBoard();
    const pre = $('g-pre'); pre.innerHTML = '<option value="">Presets…</option>' + Object.keys(PRESETS).map(n => `<option>${n}</option>`).join(''); pre.onchange = () => { if (pre.value) applyPreset(pre.value); pre.value = ''; };
    $('g-power').onclick = power; $('g-dev').onchange = async e => { await A.input.setDevice(e.target.value); };
    $('g-ref').onclick = fillDevices; fillDevices();
    $('g-mon').onchange = e => { if (e.target.checked && !$('g-hp').dataset.ack) { } A.setMonitor(e.target.checked); };
    $('g-hp').onclick = e => { e.target.dataset.ack = e.target.dataset.ack ? '' : '1'; e.target.classList.toggle('on', !!e.target.dataset.ack); };
    $('g-in').oninput = e => { if (A.fx && A.fx.inGain) { A.fx.inGain.gain.value = +e.target.value; saveRig(); } };
    $('g-gate').oninput = e => { if (A.fx) { A.fx.gateThr = +e.target.value / 1000; saveRig(); } };
    document.querySelectorAll('#g-tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('#g-tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.g-pane').forEach(p => p.classList.toggle('on', p.id === 'gp-' + b.dataset.t)); });
    $('lp-rec').onclick = loopRecord; $('lp-over').onclick = () => A.looper.overdub(); $('lp-play').onclick = () => A.looper.toggle(); $('lp-undo').onclick = () => A.looper.undo(); $('lp-clear').onclick = () => A.looper.clear();
    A.looper.listeners.push(paintLooper); paintLooper();
    $('rc-btn').onclick = recToggle;
    const saved = lsGet('rcc-rig', null); if (saved) { $('g-gate').value = Math.round((saved.gate || 0) * 1000); $('g-in').value = saved.inGain ?? 1; }
    feedbackLoop();
  }

  RCC.gear = {
    init(d) { D = d; build(); },
    toggleLoop: () => loopRecord(), toggleRecord: () => recToggle(), looperPlay: () => A.looper.toggle(),
    recording: () => A.recorder.active(),
  };
})();
