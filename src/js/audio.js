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
  /** Raw mic/voice straight into recordings (phone videos). Separate from the guitar rig path. */
  A.setMicRecorded = async on => {
    const c = A.get();
    if (on && !A._micRec) { const src = await In.open(); A._micRec = g(c, 1); src.connect(A._micRec); A._micRec.connect(A.recDest); A._micRe = s => s.connect(A._micRec); In.onChange(A._micRe); }
    else if (!on && A._micRec) { try { A._micRec.disconnect(); } catch (e) {} A._micRec = null; In._l = In._l.filter(f => f !== A._micRe); In.release(); }
  };

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
      return { in: i, out: lv, apply: (p, type) => { ws.curve = curve(type || 'Overdrive', 1 + p.drive * 14); tone.frequency.value = 700 + p.tone * 7000; lv.gain.value = .15 + p.level * 1.1; } };
    },
    amp(ctx) {
      const i = g(ctx), pre = g(ctx), s1 = ctx.createWaveShaper(), hp = ctx.createBiquadFilter(), pre2 = g(ctx), s2 = ctx.createWaveShaper(), lo = ctx.createBiquadFilter(), mid = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter(), pres = ctx.createBiquadFilter(), vol = g(ctx), cabHp = ctx.createBiquadFilter(), cabLp = ctx.createBiquadFilter(), cabLp2 = ctx.createBiquadFilter(), cabPk = ctx.createBiquadFilter(), out = g(ctx);
      s1.oversample = s2.oversample = '4x'; hp.type = 'highpass'; hp.frequency.value = 140; lo.type = 'lowshelf'; lo.frequency.value = 120; mid.type = 'peaking'; mid.frequency.value = 700; mid.Q.value = .8; hi.type = 'highshelf'; hi.frequency.value = 3200; pres.type = 'highshelf'; pres.frequency.value = 5200;
      cabHp.type = 'highpass'; cabHp.frequency.value = 85; cabLp.type = 'lowpass'; cabLp.frequency.value = 5200; cabLp2.type = 'lowpass'; cabLp2.frequency.value = 6500; cabPk.type = 'peaking'; cabPk.frequency.value = 2600; cabPk.gain.value = 3; cabPk.Q.value = 1;
      i.connect(pre).connect(s1).connect(hp).connect(pre2).connect(s2).connect(lo).connect(mid).connect(hi).connect(pres).connect(vol); vol.connect(cabHp).connect(cabLp).connect(cabLp2).connect(cabPk).connect(out);
      const direct = g(ctx, 0); vol.connect(direct).connect(out); // "cab off" path
      return { in: i, out, apply: (p, _t, cab = true) => {
        // gain staging: Clean stays clean at interface levels, Metal saturates both stages
        pre.gain.value = .6 + p.gain * 5; s1.curve = curve('Overdrive', 1.1 + p.gain * 2.5); pre2.gain.value = .7 + p.gain * 1.8; s2.curve = curve('Overdrive', 1 + p.gain * 1.6);
        lo.gain.value = (p.bass - .5) * 24; mid.gain.value = (p.mid - .5) * 20; hi.gain.value = (p.treble - .5) * 22; pres.gain.value = (p.presence - .5) * 16;
        vol.gain.value = (.1 + p.master * .7) / (1 + p.gain * 1.5);
        cabHp.frequency.value = cab ? 85 : 20; cabLp.frequency.value = cab ? 5200 : 20000; cabLp2.frequency.value = cab ? 6500 : 20000; cabPk.gain.value = cab ? 3 : 0; direct.gain.value = 0; } };
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
    f.output.disconnect(); f.output.connect(f.tap); f.tap.connect(f.monitor); f.monitor.connect(A.monBus); f.tap.connect(A.recGuitar); if (L.node && !f._loopTap) { f.tap.connect(L.node); f._loopTap = true; }
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
  const L = (A.looper = { layers: [], state: 'idle', dur: 0, startT: 0, comp: 0, listeners: [], node: null, kind: '', cap: null });
  const emit = () => L.listeners.forEach(f => f(L));
  // The worklet source is inlined and loaded from a blob: URL so it works from file:// (desktop), https (web) and the phone app alike.
  const WORKLET_SRC = "/* Sample-accurate audio capture for the looper. Runs on the audio thread, so a busy UI\n   (camera, canvas, video) can no longer put gaps or crackle into a recorded loop.\n   Messages in : {cmd:'start', t0:<context seconds>, target:<frames or 0 for free length>}\n                 {cmd:'finish'} | {cmd:'cancel'}\n   Messages out: {done:true, data:Float32Array, t0:<seconds the first sample was captured at>} */\nclass RccCapture extends AudioWorkletProcessor {\n  constructor() {\n    super();\n    this.cap = null;\n    this.port.onmessage = e => {\n      const m = e.data || {};\n      if (m.cmd === 'start') this.cap = { startFrame: Math.round(m.t0 * sampleRate), target: m.target | 0, chunks: [], len: 0, started: false };\n      else if (m.cmd === 'finish') this.flush();\n      else if (m.cmd === 'cancel') this.cap = null;\n    };\n  }\n  flush() {\n    const c = this.cap; if (!c) return; this.cap = null;\n    const out = new Float32Array(c.len); let o = 0;\n    for (const ch of c.chunks) { out.set(ch, o); o += ch.length; }\n    this.port.postMessage({ done: true, data: out, t0: c.startFrame / sampleRate }, [out.buffer]);\n  }\n  process(inputs) {\n    const c = this.cap; if (!c) return true;\n    const inp = inputs[0] && inputs[0][0], n = inp ? inp.length : 128, frame = currentFrame;\n    let from = 0;\n    if (!c.started) { if (c.startFrame >= frame + n) return true; from = Math.max(0, c.startFrame - frame); c.started = true; }\n    let to = n; if (c.target && c.len + (to - from) > c.target) to = from + (c.target - c.len);\n    const chunk = new Float32Array(Math.max(0, to - from)); if (inp) chunk.set(inp.subarray(from, to));\n    c.chunks.push(chunk); c.len += chunk.length;\n    if (c.target && c.len >= c.target) this.flush();\n    return true;\n  }\n}\nregisterProcessor('rcc-capture', RccCapture);\n";
  const workletUrl = () => URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }));
  /** The capture node sits after the pedals/amp (fx.tap). AudioWorklet when available, ScriptProcessor otherwise. */
  async function ensureCapture() {
    const c = A.get(); if (L.node) { tapToCapture(); return L.node; }
    if (!L.ready) L.ready = (async () => {
      try {
        if (!c.audioWorklet) throw new Error('no worklet');
        try { await c.audioWorklet.addModule('src/js/capture-worklet.js'); } catch (e1) { await c.audioWorklet.addModule(workletUrl()); }
        const n = new AudioWorkletNode(c, 'rcc-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
        n.port.onmessage = e => { if (e.data && e.data.done) onCaptured(e.data.data, e.data.t0); };
        L.node = n; L.kind = 'worklet';
      } catch (e) {
        // fallback: main-thread capture (older engines)
        const p = c.createScriptProcessor(2048, 1, 1);
        p.onaudioprocess = ev => {
          const cap = L.scap; if (!cap) return; const inp = ev.inputBuffer.getChannelData(0), n = inp.length, bufStart = c.currentTime;
          let from = 0; if (!cap.started) { from = Math.round((cap.t0 - bufStart) * c.sampleRate); if (from >= n) return; from = Math.max(0, from); cap.started = true; }
          for (let i = from; i < n; i++) { if (cap.target && cap.len >= cap.target) break; if (cap.len >= cap.data.length) cap.data = grow(cap.data); cap.data[cap.len++] = inp[i]; }
          if (cap.target && cap.len >= cap.target) scriptFinish();
        };
        L.node = p; L.kind = 'script';
      }
      const mute = g(c, 0); L.node.connect(mute); mute.connect(c.destination);
    })();
    await L.ready; tapToCapture(); return L.node;
  }
  function tapToCapture() { const f = A.fx; if (f && f.tap && L.node && !f._loopTap) { f.tap.connect(L.node); f._loopTap = true; } }
  const grow = a => { const b = new Float32Array(a.length * 2); b.set(a); return b; };
  function scriptFinish() { const cap = L.scap; if (!cap) return; L.scap = null; onCaptured(cap.data.slice(0, cap.len), cap.t0); }
  function startCapture(t0, target) {
    L.cap = { t0, target };
    if (L.kind === 'worklet') L.node.port.postMessage({ cmd: 'start', t0, target });
    else L.scap = { t0, started: false, data: new Float32Array(A.get().sampleRate * 10), len: 0, target };
  }
  function cancelCapture() { L.cap = null; L.scap = null; if (L.kind === 'worklet' && L.node) L.node.port.postMessage({ cmd: 'cancel' }); }
  /** A capture came back: make it a layer. The first layer defines the loop length and its origin in context time. */
  function onCaptured(data, t0) {
    const c = A.get(), cap = L.cap; L.cap = null;
    if (!cap || data.length < 1000) { L.state = L.layers.length ? 'play' : 'idle'; emit(); return; }
    const k = Math.round(L.comp / 1000 * c.sampleRate);           // latency compensation: shift the take earlier
    if (k > 0 && data.length > k) { const r = new Float32Array(data.length); r.set(data.subarray(k)); r.set(data.subarray(0, k), data.length - k); data = r; }
    const fadeN = Math.min(256, data.length >> 2);                 // tiny fades so the loop seam doesn't click
    for (let i = 0; i < fadeN; i++) { const w = i / fadeN; data[i] *= w; data[data.length - 1 - i] *= w; }
    const buf = c.createBuffer(1, data.length, c.sampleRate); buf.copyToChannel(data, 0);
    const layer = { buf, gain: g(c, 1), vol: 1, mute: false }; layer.gain.connect(A.master);
    if (!L.layers.length) { L.dur = buf.duration; L.startT = t0; }
    L.layers.push(layer); startLayer(layer); L.state = 'play'; emit();
  }
  function startLayer(layer) {
    const c = A.get(); stopLayer(layer); if (!L.dur) return;
    const s = c.createBufferSource(); s.buffer = layer.buf; s.loop = true; s.connect(layer.gain);
    const when = Math.max(c.currentTime + .01, L.startT), off = (((when - L.startT) % L.dur) + L.dur) % L.dur;
    s.start(when, off); layer.src = s;
  }
  function stopLayer(l) { try { l.src && l.src.stop(); } catch (e) {} l.src = null; }
  L.pos = () => { if (!L.layers.length || L.state === 'stopped' || !L.dur) return 0; const t = A.get().currentTime - L.startT; return t < 0 ? 0 : (t % L.dur) / L.dur; };
  /** First loop. bars+bpm+beats -> fixed length; otherwise free-length (call L.finish()). countIn in beats. */
  L.record = async function ({ bars = 0, bpm = 100, beats = 4, countIn = 0 } = {}) {
    if (!A.fx || !A.fx.running) await A.startFx();
    await ensureCapture(); const c = A.get(), spb = 60 / bpm;
    L.clear(true); L.state = 'rec';
    const t0 = c.currentTime + .15 + countIn * spb;
    for (let i = 0; i < countIn; i++) A.click(c.currentTime + .15 + i * spb, i === 0, false, .8);
    startCapture(t0, bars ? Math.round(bars * beats * spb * c.sampleRate) : 0); emit();
  };
  L.finish = () => { if (!L.cap) return; if (L.kind === 'worklet') L.node.port.postMessage({ cmd: 'finish' }); else scriptFinish(); };
  /** Overdub: records one more pass starting at the next loop boundary. */
  L.overdub = async function () {
    if (!L.layers.length || L.cap) return; await ensureCapture(); const c = A.get();
    if (L.state === 'stopped') L.play();
    const now = c.currentTime + .05, into = (((now - L.startT) % L.dur) + L.dur) % L.dur, t0 = now + (L.dur - into);
    startCapture(t0, Math.round(L.dur * c.sampleRate)); L.state = 'over'; emit();
  };
  L.stop = () => { L.layers.forEach(stopLayer); cancelCapture(); L.state = L.layers.length ? 'stopped' : 'idle'; emit(); };
  L.play = () => { if (!L.layers.length) return; L.startT = A.get().currentTime + .05; L.layers.forEach(startLayer); L.state = 'play'; emit(); };
  L.undo = () => { if (L.cap) { cancelCapture(); L.state = L.layers.length ? 'play' : 'idle'; emit(); return; } const l = L.layers.pop(); if (l) { stopLayer(l); l.gain.disconnect(); } if (!L.layers.length) { L.state = 'idle'; L.dur = 0; } emit(); };
  L.clear = quiet => { L.layers.forEach(l => { stopLayer(l); try { l.gain.disconnect(); } catch (e) {} }); L.layers = []; cancelCapture(); L.dur = 0; L.state = 'idle'; if (!quiet) emit(); };
  L.setVol = (i, v) => { const l = L.layers[i]; if (l) { l.vol = v; l.gain.gain.value = l.mute ? 0 : v; } };
  L.setMute = (i, m) => { const l = L.layers[i]; if (l) { l.mute = m; l.gain.gain.value = m ? 0 : l.vol; emit(); } };
  L.toggle = () => { if (L.state === 'play' || L.state === 'over') L.stop(); else L.play(); };

  /* ================================================================ recorder (camera + overlay + audio) */
  const Rec = (A.recorder = { rec: null, chunks: [], t0: 0, takes: [] });
  Rec.supported = () => typeof MediaRecorder !== 'undefined';
  Rec.start = function ({ canvas, video = true } = {}) {
    A.get(); const tracks = [...A.recDest.stream.getAudioTracks()];
    if (video && canvas) tracks.unshift(...canvas.captureStream(30).getVideoTracks());
    const stream = new MediaStream(tracks), pick = (video ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']).find(m => MediaRecorder.isTypeSupported(m)) || '';
    Rec.mime = pick; Rec.video = video; Rec.chunks = [];
    Rec.rec = new MediaRecorder(stream, { mimeType: pick || undefined, videoBitsPerSecond: 5e6, audioBitsPerSecond: 192e3 });
    Rec.rec.ondataavailable = e => { if (e.data && e.data.size) Rec.chunks.push(e.data); };
    Rec.rec.start(1000); Rec.t0 = performance.now();
  };
  Rec.active = () => !!(Rec.rec && Rec.rec.state === 'recording');
  Rec.elapsed = () => (Rec.active() ? (performance.now() - Rec.t0) / 1000 : 0);
  Rec.stop = () => new Promise(res => {
    if (!Rec.rec) return res(null); const dur = (performance.now() - Rec.t0) / 1000;
    Rec.rec.onstop = () => { const blob = new Blob(Rec.chunks, { type: Rec.mime || 'video/webm' }), take = { blob, url: URL.createObjectURL(blob), dur, video: Rec.video, name: new Date().toLocaleString(), size: blob.size, ext: /mp4/.test(Rec.mime || '') ? (Rec.video ? 'mp4' : 'm4a') : 'webm' }; Rec.takes.unshift(take); Rec.rec = null; res(take); };
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
