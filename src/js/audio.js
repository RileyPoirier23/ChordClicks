/* Audio engine: shared context + buses, synth voices, shared mic input, guitar FX chain (pedals + amp), looper, recorder. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const A = { ctx: null };
  const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  /* ================================================================ context + buses */
  A.get = function () {
    if (A.ctx) return A.ctx;
    const c = (A.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }));
    A.limiter = c.createDynamicsCompressor(); A.limiter.threshold.value = -4; A.limiter.knee.value = 6; A.limiter.ratio.value = 12; A.limiter.attack.value = .003; A.limiter.release.value = .12;
    A.master = c.createGain(); A.master.connect(A.limiter); A.limiter.connect(c.destination);
    A.recDest = c.createMediaStreamDestination(); A.limiter.connect(A.recDest);
    // metronome click: always heard, optionally recorded
    A.clickBus = c.createGain(); A.clickBus.connect(c.destination);
    A.clickRec = c.createGain(); A.clickRec.gain.value = 0; A.clickBus.connect(A.clickRec); A.clickRec.connect(A.recDest);
    // guitar monitor path (heard) – kept apart so it can be muted while still being recorded
    A.monBus = c.createDynamicsCompressor(); A.monBus.threshold.value = -2; A.monBus.ratio.value = 20; A.monBus.connect(c.destination);
    A.recGuitar = c.createGain(); A.recGuitar.connect(A.recDest);
    return c;
  };
  A.resume = () => { const c = A.get(); return c.state === 'suspended' ? c.resume() : Promise.resolve(); };
  A.setClickRecorded = on => { A.get(); A.clickRec.gain.value = on ? 1 : 0; };

  /* ================================================================ synth voices */
  let noiseBuf = null;
  function noise(c) { if (noiseBuf) return noiseBuf; const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return (noiseBuf = b); }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  A.click = (t, acc, sub, vol = .7) => {
    const c = A.get(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = acc ? 1500 : sub ? 700 : 1000; g.gain.setValueAtTime(Math.max(.0001, vol * (sub ? .4 : 1)), t); g.gain.exponentialRampToValueAtTime(.001, t + .05);
    o.connect(g).connect(A.clickBus); o.start(t); o.stop(t + .06);
  };
  A.pluck = (midi, t, dur = .5, vol = .4, dest) => {
    const c = A.get(), o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(), f = mtof(midi);
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2; lp.type = 'lowpass'; lp.frequency.setValueAtTime(3400, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .15);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(dest || A.master); o.start(t); o2.start(t); o.stop(t + dur + .2); o2.stop(t + dur + .2);
  };
  /** Strum a list of MIDI notes (low -> high). dir 'D' = low to high. */
  A.strum = (midis, t, dir = 'D', dur = 1.1, vol = .26) => {
    const list = dir === 'U' ? midis.slice().reverse() : midis;
    list.forEach((m, i) => A.pluck(m, t + i * .022, dur, vol));
  };
  A.chordMidis = (frets, tuning = [40, 45, 50, 55, 59, 64]) => frets.map((f, i) => (f < 0 ? null : tuning[i] + f)).filter(m => m != null);
  A.kick = (t, vol = .9) => { const c = A.get(), o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .12); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .28); o.connect(g).connect(A.master); o.start(t); o.stop(t + .3); };
  A.snare = (t, vol = .5) => {
    const c = A.get(), n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), o = c.createOscillator(), og = c.createGain();
    n.buffer = noise(c); f.type = 'highpass'; f.frequency.value = 1500; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .17); n.connect(f).connect(g).connect(A.master); n.start(t, Math.random()); n.stop(t + .2);
    o.type = 'triangle'; o.frequency.setValueAtTime(190, t); og.gain.setValueAtTime(vol * .5, t); og.gain.exponentialRampToValueAtTime(.001, t + .1); o.connect(og).connect(A.master); o.start(t); o.stop(t + .12);
  };
  A.hat = (t, vol = .2, open) => { const c = A.get(), n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); n.buffer = noise(c); f.type = 'highpass'; f.frequency.value = 7200; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + (open ? .22 : .045)); n.connect(f).connect(g).connect(A.master); n.start(t, Math.random()); n.stop(t + .25); };
  A.bass = (midi, t, dur = .4, vol = .5) => {
    const c = A.get(), o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(midi); lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(lp).connect(g).connect(A.master); o.start(t); o.stop(t + dur + .05);
  };

  /* ================================================================ shared microphone / interface input */
  const In = (A.input = { refs: 0, stream: null, source: null, deviceId: lsGet('rcc-input', ''), _l: [], opening: null });
  In.onChange = f => In._l.push(f);
  In.devices = async () => { try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId !== 'communications'); } catch (e) { return []; } };
  async function openStream() {
    const c = A.get(); await A.resume();
    const mk = id => navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    try { In.stream = await mk(In.deviceId); } catch (e) { if (In.deviceId) { In.deviceId = ''; lsSet('rcc-input', ''); In.stream = await mk(''); } else throw e; }
    In.source = c.createMediaStreamSource(In.stream);
  }
  /** Acquire the shared input; call In.release() when done. Resolves to the MediaStreamAudioSourceNode. */
  In.open = async () => {
    In.refs++;
    try { if (!In.source) { In.opening = In.opening || openStream(); await In.opening; In.opening = null; } } catch (e) { In.refs--; In.opening = null; throw e; }
    return In.source;
  };
  In.release = () => { In.refs = Math.max(0, In.refs - 1); if (!In.refs) closeStream(); };
  function closeStream() { try { In.stream && In.stream.getTracks().forEach(t => t.stop()); In.source && In.source.disconnect(); } catch (e) {} In.stream = In.source = null; }
  In.setDevice = async id => {
    In.deviceId = id || ''; lsSet('rcc-input', In.deviceId);
    if (In.refs) { closeStream(); await openStream(); In._l.forEach(f => { try { f(In.source); } catch (e) { console.error(e); } }); }
  };

  /* ================================================================ guitar FX chain */
  const FX_DEFS = {
    comp: { name: 'Compressor', color: '#38bdf8', params: { sustain: { label: 'Sustain', v: .4 }, level: { label: 'Level', v: .5 } } },
    drive: { name: 'Drive', color: '#f59e0b', params: { drive: { label: 'Drive', v: .5 }, tone: { label: 'Tone', v: .5 }, level: { label: 'Level', v: .5 } }, types: ['Overdrive', 'Distortion', 'Fuzz'] },
    amp: { name: 'Amp', color: '#ef4444', params: { gain: { label: 'Gain', v: .35 }, bass: { label: 'Bass', v: .5 }, mid: { label: 'Mid', v: .5 }, treble: { label: 'Treble', v: .55 }, presence: { label: 'Presence', v: .4 }, master: { label: 'Master', v: .6 } } },
    chorus: { name: 'Chorus', color: '#34d399', params: { rate: { label: 'Rate', v: .3 }, depth: { label: 'Depth', v: .5 }, mix: { label: 'Mix', v: .4 } } },
    delay: { name: 'Delay', color: '#a78bfa', params: { time: { label: 'Time', v: .35 }, feedback: { label: 'Repeats', v: .35 }, mix: { label: 'Mix', v: .3 } } },
    reverb: { name: 'Reverb', color: '#ec4899', params: { decay: { label: 'Decay', v: .4 }, mix: { label: 'Mix', v: .25 } } },
  };
  const AMP_MODELS = { Clean: { gain: .12, bass: .5, mid: .5, treble: .6, presence: .5, master: .6 }, Crunch: { gain: .42, bass: .55, mid: .55, treble: .55, presence: .45, master: .55 }, Lead: { gain: .7, bass: .5, mid: .7, treble: .5, presence: .4, master: .5 }, Metal: { gain: .92, bass: .65, mid: .3, treble: .65, presence: .6, master: .45 } };
  A.FX_DEFS = FX_DEFS; A.AMP_MODELS = AMP_MODELS;

  function curve(kind, k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * 2 - 1;
      c[i] = kind === 'Fuzz' ? (x >= 0 ? 1 - Math.exp(-x * k * 2) : -(1 - Math.exp(x * k * 1.2)) * .8)
        : kind === 'Distortion' ? (2 / Math.PI) * Math.atan(x * k * 3) : Math.tanh(x * k) / Math.tanh(Math.min(k, 8));
    }
    return c;
  }
  function impulse(ctx, seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds)), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return b;
  }
  const g = (ctx, v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };

  /** Each builder returns {in, out, apply(params)}; `pedal()` wraps it with a bypass switch. */
  const BUILD = {
    comp(ctx) {
      const c = ctx.createDynamicsCompressor(), mk = g(ctx); c.attack.value = .01; c.release.value = .25; c.knee.value = 12; c.connect(mk);
      return { in: c, out: mk, apply: p => { c.threshold.value = -10 - p.sustain * 35; c.ratio.value = 3 + p.sustain * 9; mk.gain.value = .6 + p.level * 1.4; } };
    },
    drive(ctx) {
      const i = g(ctx), pre = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), tone = ctx.createBiquadFilter(), lv = g(ctx);
      pre.type = 'highpass'; pre.frequency.value = 90; ws.oversample = '4x'; tone.type = 'lowpass'; tone.Q.value = .5; i.connect(pre).connect(ws).connect(tone).connect(lv);
      return { in: i, out: lv, apply: (p, type) => { ws.curve = curve(type || 'Overdrive', 1 + p.drive * 30); tone.frequency.value = 700 + p.tone * 7000; lv.gain.value = .15 + p.level * 1.1; } };
    },
    amp(ctx) {
      const i = g(ctx), s1 = ctx.createWaveShaper(), hp = ctx.createBiquadFilter(), s2 = ctx.createWaveShaper(), lo = ctx.createBiquadFilter(), mid = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter(), pres = ctx.createBiquadFilter(), vol = g(ctx), cabHp = ctx.createBiquadFilter(), cabLp = ctx.createBiquadFilter(), cabLp2 = ctx.createBiquadFilter(), cabPk = ctx.createBiquadFilter(), out = g(ctx);
      s1.oversample = s2.oversample = '4x'; hp.type = 'highpass'; hp.frequency.value = 140; lo.type = 'lowshelf'; lo.frequency.value = 120; mid.type = 'peaking'; mid.frequency.value = 700; mid.Q.value = .8; hi.type = 'highshelf'; hi.frequency.value = 3200; pres.type = 'highshelf'; pres.frequency.value = 5200;
      cabHp.type = 'highpass'; cabHp.frequency.value = 85; cabLp.type = 'lowpass'; cabLp.frequency.value = 5200; cabLp2.type = 'lowpass'; cabLp2.frequency.value = 6500; cabPk.type = 'peaking'; cabPk.frequency.value = 2600; cabPk.gain.value = 3; cabPk.Q.value = 1;
      i.connect(s1).connect(hp).connect(s2).connect(lo).connect(mid).connect(hi).connect(pres).connect(vol); vol.connect(cabHp).connect(cabLp).connect(cabLp2).connect(cabPk).connect(out);
      const direct = g(ctx, 0); vol.connect(direct).connect(out); // "cab off" path
      return { in: i, out, apply: (p, _t, cab = true) => { s1.curve = curve('Overdrive', 1 + p.gain * 25); s2.curve = curve('Overdrive', 1 + p.gain * 10); lo.gain.value = (p.bass - .5) * 24; mid.gain.value = (p.mid - .5) * 20; hi.gain.value = (p.treble - .5) * 22; pres.gain.value = (p.presence - .5) * 16; vol.gain.value = .06 + p.master * .45; cabHp.frequency.value = cab ? 85 : 20; cabLp.frequency.value = cab ? 5200 : 20000; cabLp2.frequency.value = cab ? 6500 : 20000; cabPk.gain.value = cab ? 3 : 0; direct.gain.value = 0; } };
    },
    chorus(ctx) {
      const i = g(ctx), dry = g(ctx), wet = g(ctx), d = ctx.createDelay(.05), lfo = ctx.createOscillator(), dep = g(ctx, .003), o = g(ctx);
      d.delayTime.value = .02; lfo.frequency.value = .8; lfo.connect(dep).connect(d.delayTime); lfo.start(); i.connect(dry).connect(o); i.connect(d).connect(wet).connect(o);
      return { in: i, out: o, apply: p => { lfo.frequency.value = .1 + p.rate * 3; dep.gain.value = .001 + p.depth * .006; wet.gain.value = p.mix; dry.gain.value = 1 - p.mix * .4; } };
    },
    delay(ctx) {
      const i = g(ctx), dry = g(ctx), wet = g(ctx), d = ctx.createDelay(1.2), fb = g(ctx, .3), lp = ctx.createBiquadFilter(), o = g(ctx);
      lp.type = 'lowpass'; lp.frequency.value = 3200; i.connect(dry).connect(o); i.connect(d); d.connect(lp).connect(fb).connect(d); d.connect(wet).connect(o);
      return { in: i, out: o, apply: p => { d.delayTime.value = .05 + p.time * .85; fb.gain.value = Math.min(.85, p.feedback * .9); wet.gain.value = p.mix; } };
    },
    reverb(ctx) {
      const i = g(ctx), dry = g(ctx), wet = g(ctx), conv = ctx.createConvolver(), o = g(ctx); let last = -1;
      i.connect(dry).connect(o); i.connect(conv).connect(wet).connect(o);
      return { in: i, out: o, apply: p => { const sec = .4 + p.decay * 3.2; if (Math.abs(sec - last) > .15) { conv.buffer = impulse(ctx, sec); last = sec; } wet.gain.value = p.mix * 1.4; dry.gain.value = 1; } };
    },
  };
  const ORDER = ['comp', 'drive', 'amp', 'chorus', 'delay', 'reverb'];
  A.FX_ORDER = ORDER;

  /** Build a complete chain on any (Offline)AudioContext. Connect your source to fx.input; take audio from fx.output. */
  A.buildFx = function (ctx) {
    const f = { ctx, input: g(ctx), output: g(ctx), gateGain: g(ctx), p: {}, on: {}, type: { drive: 'Overdrive' }, cab: true, pedals: {} };
    f.meter = ctx.createAnalyser(); f.meter.fftSize = 1024; f.input.connect(f.meter); f.input.connect(f.gateGain);
    let prev = f.gateGain;
    ORDER.forEach(k => {
      const fx = BUILD[k](ctx), p = { in: g(ctx), out: g(ctx), fx, on: k !== 'drive' && k !== 'chorus' && k !== 'delay' && k !== 'reverb' ? true : false };
      fx.out.connect(p.out); f.pedals[k] = p;
      p.route = () => { try { p.in.disconnect(); } catch (e) {} p.in.connect(p.on ? fx.in : p.out); };
      prev.connect(p.in); prev = p.out; f.p[k] = Object.fromEntries(Object.entries(FX_DEFS[k].params).map(([n, d]) => [n, d.v])); f.on[k] = p.on;
    });
    prev.connect(f.output);
    f.apply = k => { const p = f.pedals[k]; p.route(); p.fx.apply(f.p[k], f.type[k], f.cab); f.on[k] = p.on; };
    f.set = (k, name, v) => { f.p[k][name] = v; f.apply(k); };
    f.setOn = (k, on) => { f.pedals[k].on = on; f.apply(k); };
    f.setType = (k, t) => { f.type[k] = t; f.apply(k); };
    f.setCab = on => { f.cab = on; f.apply('amp'); };
    f.setAmpModel = name => { Object.assign(f.p.amp, AMP_MODELS[name]); f.apply('amp'); };
    ORDER.forEach(f.apply);
    return f;
  };

  /** Live chain: mic -> fx -> (monitor | looper tap | recorder). */
  A.fx = null;
  A.startFx = async function () {
    if (A.fx && A.fx.running) return A.fx;
    const c = A.get(), src = await In.open();
    const f = A.fx || (A.fx = A.buildFx(c)); f.running = true;
    f.inGain = f.inGain || g(c, 1); f.tap = f.tap || g(c, 1); f.monitor = f.monitor || g(c, 0);
    f.output.disconnect(); f.output.connect(f.tap); f.tap.connect(f.monitor); f.monitor.connect(A.monBus); f.tap.connect(A.recGuitar);
    src.connect(f.inGain); f.inGain.connect(f.input);
    f._reconnect = s => { s.connect(f.inGain); }; In.onChange(f._reconnect);
    // simple noise gate
    f.gateThr = f.gateThr ?? 0; const buf = new Float32Array(1024);
    clearInterval(f._gt); f._gt = setInterval(() => {
      f.meter.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; const rms = Math.sqrt(s / buf.length); f.level = rms;
      const open = rms > f.gateThr || f.gateThr === 0; f.gateGain.gain.setTargetAtTime(open ? 1 : 0, c.currentTime, open ? .005 : .06);
    }, 25);
    return f;
  };
  A.stopFx = function () {
    const f = A.fx; if (!f || !f.running) return; f.running = false; clearInterval(f._gt);
    try { f.inGain.disconnect(); f.monitor.gain.value = 0; } catch (e) {} In.release();
  };
  A.setMonitor = on => { if (A.fx) A.fx.monitor.gain.setTargetAtTime(on ? 1 : 0, A.get().currentTime, .02); };

  /* ================================================================ looper */
  const L = (A.looper = { layers: [], state: 'idle', dur: 0, startT: 0, comp: 0, listeners: [] });
  const emit = () => L.listeners.forEach(f => f(L));
  function ensureProc() {
    if (L.proc) return; const c = A.get();
    L.proc = c.createScriptProcessor(2048, 1, 1); if (A.fx && A.fx.tap) A.fx.tap.connect(L.proc); const mute = g(c, 0); L.proc.connect(mute); mute.connect(c.destination);
    L.proc.onaudioprocess = e => {
      if (!L.cap) return; const cap = L.cap, inp = e.inputBuffer.getChannelData(0), n = inp.length, bufStart = e.playbackTime - n / c.sampleRate;
      let from = 0; if (!cap.started) { from = Math.round((cap.t0 - bufStart) * c.sampleRate); if (from >= n) return; from = Math.max(0, from); cap.started = true; }
      for (let i = from; i < n; i++) { if (cap.target && cap.len >= cap.target) break; if (cap.len >= cap.data.length) cap.data = grow(cap.data); cap.data[cap.len++] = inp[i]; }
      if (cap.target && cap.len >= cap.target) finishCapture();
    };
  }
  const grow = a => { const b = new Float32Array(a.length * 2); b.set(a); return b; };
  function finishCapture() {
    const cap = L.cap; L.cap = null; const c = A.get(); let data = cap.data.slice(0, cap.len);
    if (L.comp > 0 && data.length > L.comp) { const k = Math.round(L.comp / 1000 * c.sampleRate), r = new Float32Array(data.length); r.set(data.subarray(k)); r.set(data.subarray(0, k), data.length - k); data = r; } // latency compensation
    const buf = c.createBuffer(1, data.length, c.sampleRate); buf.copyToChannel(data, 0);
    const layer = { buf, gain: g(c, 1), vol: 1, mute: false }; layer.gain.connect(A.master);
    if (!L.layers.length) { L.dur = buf.duration; L.startT = c.currentTime + .05; }
    L.layers.push(layer); startLayer(layer, L.state === 'over' || L.layers.length > 1 ? cap.t0 : L.startT); L.state = 'play'; emit();
  }
  function startLayer(layer, alignT) {
    const c = A.get(); stopLayer(layer);
    const s = c.createBufferSource(); s.buffer = layer.buf; s.loop = true; s.connect(layer.gain);
    const now = c.currentTime + .02, off = (((now - L.startT) % L.dur) + L.dur) % L.dur; s.start(now, off); layer.src = s;
  }
  function stopLayer(l) { try { l.src && l.src.stop(); } catch (e) {} l.src = null; }
  L.pos = () => (L.layers.length && L.state !== 'stopped' ? ((((A.get().currentTime - L.startT) % L.dur) + L.dur) % L.dur) / L.dur : 0);
  /** First loop. bars+bpm+beats -> fixed length; otherwise free-length (call L.finish()). countIn in beats. */
  L.record = async function ({ bars = 0, bpm = 100, beats = 4, countIn = 0 } = {}) {
    if (!A.fx || !A.fx.running) await A.startFx(); ensureProc(); const c = A.get(), spb = 60 / bpm;
    L.clear(true); L.state = 'rec'; const t0 = c.currentTime + .1 + countIn * spb;
    for (let i = 0; i < countIn; i++) A.click(c.currentTime + .1 + i * spb, i === 0, false, .8);
    L.cap = { t0, started: false, data: new Float32Array(c.sampleRate * 10), len: 0, target: bars ? Math.round(bars * beats * spb * c.sampleRate) : 0 }; emit();
  };
  L.finish = () => { if (L.cap && L.cap.len > 1000) finishCapture(); else { L.cap = null; L.state = 'idle'; emit(); } };
  /** Overdub: records one more pass starting at the next loop boundary. */
  L.overdub = function () {
    if (!L.layers.length) return; ensureProc(); const c = A.get();
    const into = (c.currentTime - L.startT) % L.dur, t0 = c.currentTime + (L.dur - into);
    L.cap = { t0, started: false, data: new Float32Array(Math.round(L.dur * c.sampleRate) + 4096), len: 0, target: Math.round(L.dur * c.sampleRate) }; L.state = 'over'; emit();
  };
  L.stop = () => { L.layers.forEach(stopLayer); if (L.cap) L.cap = null; L.state = L.layers.length ? 'stopped' : 'idle'; emit(); };
  L.play = () => { if (!L.layers.length) return; L.startT = A.get().currentTime + .05; L.layers.forEach(l => startLayer(l)); L.state = 'play'; emit(); };
  L.undo = () => { const l = L.layers.pop(); if (l) { stopLayer(l); l.gain.disconnect(); } if (!L.layers.length) { L.state = 'idle'; L.dur = 0; } emit(); };
  L.clear = quiet => { L.layers.forEach(l => { stopLayer(l); try { l.gain.disconnect(); } catch (e) {} }); L.layers = []; L.cap = null; L.dur = 0; L.state = 'idle'; if (!quiet) emit(); };
  L.setVol = (i, v) => { const l = L.layers[i]; if (l) { l.vol = v; l.gain.gain.value = l.mute ? 0 : v; } };
  L.setMute = (i, m) => { const l = L.layers[i]; if (l) { l.mute = m; l.gain.gain.value = m ? 0 : l.vol; emit(); } };
  L.toggle = () => { if (L.state === 'play' || L.state === 'over') L.stop(); else L.play(); };

  /* ================================================================ recorder (camera + overlay + audio) */
  const Rec = (A.recorder = { rec: null, chunks: [], t0: 0, takes: [] });
  Rec.supported = () => typeof MediaRecorder !== 'undefined';
  Rec.start = function ({ canvas, video = true } = {}) {
    A.get(); const tracks = [...A.recDest.stream.getAudioTracks()];
    if (video && canvas) tracks.unshift(...canvas.captureStream(30).getVideoTracks());
    const stream = new MediaStream(tracks), pick = (video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm']).find(m => MediaRecorder.isTypeSupported(m)) || '';
    Rec.mime = pick; Rec.video = video; Rec.chunks = [];
    Rec.rec = new MediaRecorder(stream, { mimeType: pick || undefined, videoBitsPerSecond: 5e6, audioBitsPerSecond: 192e3 });
    Rec.rec.ondataavailable = e => { if (e.data && e.data.size) Rec.chunks.push(e.data); };
    Rec.rec.start(1000); Rec.t0 = performance.now();
  };
  Rec.active = () => !!(Rec.rec && Rec.rec.state === 'recording');
  Rec.elapsed = () => (Rec.active() ? (performance.now() - Rec.t0) / 1000 : 0);
  Rec.stop = () => new Promise(res => {
    if (!Rec.rec) return res(null); const dur = (performance.now() - Rec.t0) / 1000;
    Rec.rec.onstop = () => { const blob = new Blob(Rec.chunks, { type: Rec.mime || 'video/webm' }), take = { blob, url: URL.createObjectURL(blob), dur, video: Rec.video, name: new Date().toLocaleString(), size: blob.size }; Rec.takes.unshift(take); Rec.rec = null; res(take); };
    Rec.rec.stop();
  });

  /* ================================================================ pitch / chord listener (shared by Solo scoring, trainers, live feedback) */
  const Ls = (A.listen = { subs: new Set(), running: false, gate: .008, last: { freq: -1, rms: 0 } });
  Ls.use = async function ({ pitch, chroma }) {
    const sub = { pitch, chroma }; Ls.subs.add(sub);
    try { await Ls._start(); } catch (e) { Ls.subs.delete(sub); throw e; }
    return () => { Ls.subs.delete(sub); if (!Ls.subs.size) Ls._stop(); };
  };
  Ls._start = async function () {
    if (Ls.running) return; Ls.running = true; const c = A.get(), src = await In.open();
    Ls.hp = c.createBiquadFilter(); Ls.hp.type = 'highpass'; Ls.hp.frequency.value = 60; Ls.lp = c.createBiquadFilter(); Ls.lp.type = 'lowpass'; Ls.lp.frequency.value = 1500;
    Ls.an = c.createAnalyser(); Ls.an.fftSize = 4096; Ls.an.smoothingTimeConstant = 0; src.connect(Ls.hp); Ls.hp.connect(Ls.lp).connect(Ls.an);
    Ls.fft = c.createAnalyser(); Ls.fft.fftSize = 16384; Ls.fft.smoothingTimeConstant = .5; src.connect(Ls.fft);
    Ls._re = s => { s.connect(Ls.hp); s.connect(Ls.fft); }; In.onChange(Ls._re);
    const buf = new Float32Array(4096), db = new Float32Array(Ls.fft.frequencyBinCount); let slow = 0, lastOn = 0, tick = 0;
    Ls.timer = setInterval(() => {
      Ls.an.getFloatTimeDomainData(buf); const t = c.currentTime;
      const r = RCC.pitch.yin(buf, c.sampleRate, { minF: 70, maxF: 1000, threshold: .13 });
      const loud = r.rms > Ls.gate; slow = slow * .85 + r.rms * .15;
      const onset = loud && r.rms > Math.max(Ls.gate * 1.5, slow * 1.45) && t - lastOn > .09; if (onset) lastOn = t;
      const ev = { freq: loud && r.prob > .85 ? r.freq : -1, prob: r.prob, rms: r.rms, t, onset }; Ls.last = ev;
      Ls.subs.forEach(s => s.pitch && s.pitch(ev));
      if (++tick % 4 === 0 && [...Ls.subs].some(s => s.chroma)) {
        Ls.fft.getFloatFrequencyData(db); const mag = new Float64Array(db.length); for (let i = 0; i < db.length; i++) mag[i] = Math.pow(10, db[i] / 20);
        const ch = RCC.chroma.chromaFromMags(mag, c.sampleRate, Ls.fft.fftSize), e2 = { chroma: ch, rms: r.rms, loud, t };
        Ls.subs.forEach(s => s.chroma && s.chroma(e2));
      }
    }, 40);
  };
  Ls._stop = function () { Ls.running = false; clearInterval(Ls.timer); try { Ls.hp.disconnect(); Ls.fft.disconnect(); } catch (e) {} In.release(); };

  RCC.audio = A;
})();
