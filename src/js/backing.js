/* Backing track generator: a small band (drums, bass, pad/organ, optional strummed chords) built from the song's chords and strumming
   pattern. Follows the song: fills before section changes, a crash on the first bar, keys that sit under sustained styles.
   renderWav() plays the same band through an OfflineAudioContext so a backing track can be exported as a WAV file. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory;
  const STYLES = { rock: 'Rock', pop: 'Pop (8ths)', ballad: 'Ballad', folk: 'Folk (boom-chick)', country: 'Country train', shuffle: 'Shuffle', funk: 'Funk 16ths', reggae: 'Reggae', halftime: 'Half-time' };
  const cache = new Map();
  function chordInfo(name) {
    let v = cache.get(name); if (v) return v;
    const p = T.parseChord(name), vo = T.voicings(name)[0] || null, shape = vo || T.chordShape(name);
    const iv = p ? ((T.CHORD_TYPES || []).find(x => x[0] === p.quality) || [0, 0, [0, 4, 7]])[2] : [0, 4, 7];
    v = { root: p ? (p.bass != null ? p.bass : p.root) : 0, true_root: p ? p.root : 0, fifth: p ? (p.root + 7) % 12 : 7, third: p ? (p.root + (iv[1] || 4)) % 12 : 4, pad: p ? iv.slice(0, 4).map(i => 60 + ((p.root + i) % 12)) : [], mids: shape ? RCC.audio.chordMidis(shape.frets) : [], ok: !!p };
    cache.set(name, v); return v;
  }
  /** Soft organ/pad chord: detuned triangles through a low-pass, used by the sustained styles. */
  function pad(midis, t, dur, vol) {
    const A = RCC.audio, c = A.get(); if (!midis.length || vol <= 0) return;
    const g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol / midis.length, t + .08); g.gain.setValueAtTime(vol / midis.length, t + dur - .12); g.gain.linearRampToValueAtTime(0, t + dur); lp.connect(g).connect(A.master);
    midis.forEach(m => [-4, 4].forEach(det => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + .05); }));
  }
  /** Ride/crash: longer bright noise. */
  function crash(t, vol) { const A = RCC.audio, c = A.get(), n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); n.buffer = noiseBuf(c); f.type = 'highpass'; f.frequency.value = 5000; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.1); n.connect(f).connect(g).connect(A.master); n.start(t); n.stop(t + 1.2); }
  let nb = null, nbCtx = null; function noiseBuf(c) { if (nb && nbCtx === c) return nb; nbCtx = c; nb = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nb; }
  function tom(t, pitch, vol) { const A = RCC.audio, c = A.get(), o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(pitch, t); o.frequency.exponentialRampToValueAtTime(pitch * .55, t + .18); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .25); o.connect(g).connect(A.master); o.start(t); o.stop(t + .3); }
  /**
   * Schedule one grid step. o: { t, s (slot within bar), sub, beats, chord, nextChord, style, vol, comp, patChar, bar, fillBar (true on the bar before a section change), first (bar 0) }
   */
  function step(o) {
    const A = RCC.audio, { t, s, sub, beats, style, vol } = o, b = Math.floor(s / sub), k = s % sub, on = k === 0, v = vol, spb = 60 / (o.bpm || 100);
    const ci = chordInfo(o.chord), half = beats >= 4 ? 2 : Math.ceil(beats / 2), last = b === beats - 1;
    const bassNote = pc => 28 + ((pc - 28 % 12 + 120) % 12);
    let st = style; if (st === 'shuffle' && sub !== 3) st = 'rock'; if (st === 'funk' && sub < 2) st = 'rock'; if (st === 'pop' && sub < 2) st = 'rock'; if (st === 'reggae' && sub < 2) st = 'ballad';
    if (o.first && s === 0) crash(t, .25 * v);
    // fill on the last beat of the bar before a section change (not in the quiet styles)
    if (o.fillBar && last && !['ballad', 'folk', 'reggae'].includes(st)) { const n = Math.max(2, sub); for (let i = 0; i < n; i++) { const tt = t + (k === 0 ? i * spb / n : 0); if (k === 0) tom(tt, i % 2 ? 110 : 160, .45 * v); } if (on) A.snare(t + spb * .5, .3 * v); return; }
    if (st === 'rock') {
      if (on && (b === 0 || b === half)) A.kick(t, .8 * v); if (on && beats >= 3 && b % 2 === 1) A.snare(t, .5 * v);
      if (sub >= 2 && k === Math.floor(sub / 2) && b === half - 1) A.kick(t, .55 * v);
      if (sub === 1 ? true : k === 0 || (sub >= 2 && k === Math.floor(sub / 2) && sub % 2 === 0)) A.hat(t, (on ? .22 : .14) * v);
      if (on && b === 0 && ci.ok) A.bass(bassNote(ci.root), t, .5 * 60 / 90, .5 * v + .1);
      else if (on && b === half && ci.ok) A.bass(bassNote(ci.root), t, .4, .42 * v);
      else if (sub >= 2 && k === Math.floor(sub / 2) && b === half - 1 && ci.ok) A.bass(bassNote(ci.fifth) + 0, t, .3, .38 * v);
      if (last && sub >= 2 && k === Math.floor(sub / 2) && ci.ok && o.nextChord && o.nextChord !== o.chord) { const nx = chordInfo(o.nextChord); A.bass(bassNote(nx.root) - (Math.random() < .5 ? 1 : 2), t, .25, .36 * v); } // walk into the next chord
    } else if (st === 'pop') {
      if (on && (b === 0 || b === half)) A.kick(t, .75 * v); if (k === Math.floor(sub / 2) && b === half + 1) A.kick(t, .5 * v); if (on && b % 2 === 1) A.snare(t, .5 * v);
      if (k === 0 || k === Math.floor(sub / 2)) A.hat(t, (on ? .2 : .13) * v);
      if (ci.ok && (k === 0 || k === Math.floor(sub / 2))) A.bass(bassNote(b % 2 ? ci.fifth : ci.root) + (b >= half && k ? 12 : 0), t, .22, (on ? .42 : .3) * v);
      if (on && b === 0 && ci.ok) pad(ci.pad, t, spb * beats, .16 * v);
    } else if (st === 'ballad') {
      if (on && b === 0) A.kick(t, .7 * v); if (on && b === half) A.snare(t, .4 * v, true); if (on) A.hat(t, .12 * v);
      if (on && b === 0 && ci.ok) A.bass(bassNote(ci.root), t, 1.6, .5 * v + .1); if (on && b === half && ci.ok) A.bass(bassNote(ci.fifth), t, 1.2, .38 * v);
      if (on && b === 0 && ci.ok) pad(ci.pad, t, spb * beats, .22 * v);
    } else if (st === 'folk') {
      if (on && b % 2 === 0) { A.kick(t, .45 * v); if (ci.ok) A.bass(bassNote(b === 0 ? ci.root : ci.fifth), t, .4, .45 * v); }
      if (on && b % 2 === 1) { A.hat(t, .3 * v, true); A.snare(t, .18 * v); }
    } else if (st === 'country') {
      if (on && b % 2 === 0) { A.kick(t, .6 * v); if (ci.ok) A.bass(bassNote(b === 0 ? ci.root : ci.fifth), t, .35, .5 * v); }
      if (on && b % 2 === 1) A.snare(t, .4 * v); if (sub >= 2 ? k === 0 || k === Math.floor(sub / 2) : on) A.hat(t, (on ? .18 : .1) * v);
      if (last && sub >= 2 && k === Math.floor(sub / 2) && ci.ok && o.nextChord && o.nextChord !== o.chord) { const nx = chordInfo(o.nextChord); A.bass(bassNote(nx.root) + (nx.root > ci.root ? -2 : 2), t, .25, .4 * v); }
    } else if (st === 'shuffle') {
      if (on && (b === 0 || b === half)) A.kick(t, .8 * v); if (on && b % 2 === 1) A.snare(t, .5 * v); if (k !== 1) A.hat(t, (on ? .22 : .16) * v);
      if (on && ci.ok && b % 2 === 0) A.bass(bassNote(b === 0 ? ci.root : ci.fifth), t, .45, .45 * v + .05);
      if (k === 2 && b % 2 === 1 && ci.ok) A.bass(bassNote(b === 1 ? ci.third : ci.fifth), t, .2, .3 * v);
    } else if (st === 'funk') {
      const g = b * sub + k; if (g === 0 || g === sub * 2 + Math.floor(sub / 2) || g === sub * 3) A.kick(t, .8 * v); if (on && b % 2 === 1) A.snare(t, .55 * v); else if (k === sub - 1 && b === 3) A.snare(t, .22 * v);
      A.hat(t, (on ? .2 : .1) * v, k === sub - 1 && b === 1); if (on && b === 0 && ci.ok) A.bass(bassNote(ci.root), t, .25, .5 * v); if (k === sub - 1 && b % 2 === 0 && ci.ok) A.bass(bassNote(ci.root) + 12, t, .15, .35 * v);
      if (k === Math.floor(sub / 2) && b === half && ci.ok) pad(ci.pad.map(m => m + 12), t, spb * .3, .14 * v); // skank stab
    } else if (st === 'reggae') {
      if (on && b === half) { A.kick(t, .8 * v); A.snare(t, .3 * v); } if (k === Math.floor(sub / 2)) A.hat(t, .16 * v);
      if (k === Math.floor(sub / 2) && ci.ok) pad(ci.pad, t, spb * .22, .3 * v); // off-beat chop
      if (on && (b === 0 || b === half) && ci.ok) A.bass(bassNote(ci.root), t, .5, .55 * v); if (on && last && ci.ok) A.bass(bassNote(ci.fifth), t, .3, .4 * v);
    } else if (st === 'halftime') {
      if (on && b === 0) A.kick(t, .85 * v); if (sub >= 2 && k === Math.floor(sub / 2) && b === 1) A.kick(t, .5 * v); if (on && b === half) A.snare(t, .6 * v);
      if (on || (sub >= 2 && k === Math.floor(sub / 2))) A.hat(t, (on ? .2 : .12) * v);
      if (on && b === 0 && ci.ok) A.bass(bassNote(ci.root), t, spb * 1.8, .55 * v); if (on && b === half + 1 && ci.ok) A.bass(bassNote(ci.fifth), t, spb * .8, .4 * v);
      if (on && b === 0 && ci.ok) pad(ci.pad, t, spb * beats, .14 * v);
    }
    if (o.comp && (o.patChar === 'D' || o.patChar === 'U') && ci.mids.length) A.strum(ci.mids, t, o.patChar, 1.0, .18 * (o.compVol == null ? 1 : o.compVol));
  }

  /** Render a whole song's backing to a WAV Blob offline. prog: [{c, sec}], pat: strumming string. */
  async function renderWav({ prog, bpm = 100, beats = 4, sub = 2, style = 'rock', pat = '', comp = false, vol = .8, barsPerChord = 1, countIn = 0 }) {
    const A = RCC.audio, sr = 44100, spb = 60 / bpm, per = beats * sub;
    const chords = prog.length ? prog : [{ c: 'C' }];
    const bars = chords.length * barsPerChord + countIn, total = bars * beats * spb + 2;
    const off = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
    const saved = { ctx: A.ctx, master: A.master, limiter: A.limiter };
    A.ctx = off; A.master = off.createGain(); A.master.gain.value = .7; const lim = off.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = .003; lim.release.value = .12; A.master.connect(lim).connect(off.destination); cache.clear();
    try {
      for (let bar = 0; bar < bars; bar++) {
        const ci = bar - countIn, chord = ci < 0 ? '' : chords[Math.floor(ci / barsPerChord)], next = chords[Math.floor(ci / barsPerChord) + 1];
        for (let s = 0; s < per; s++) {
          const t = .05 + (bar * per + s) * spb / sub;
          if (ci < 0) { if (s % sub === 0) { const o = off.createOscillator(), g = off.createGain(); o.frequency.value = s === 0 ? 1400 : 1000; g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .06); o.connect(g).connect(A.master); o.start(t); o.stop(t + .07); } continue; }
          step({ t, s, sub, beats, bpm, chord: chord.c, nextChord: next ? next.c : '', style, vol, comp, patChar: pat.length ? pat[(bar * per + s) % pat.length] : '', first: ci === 0, fillBar: !!(next && next.sec && next.sec !== chord.sec) });
        }
      }
      const buf = await off.startRendering();
      return wavBlob(buf);
    } finally { A.ctx = saved.ctx; A.master = saved.master; A.limiter = saved.limiter; cache.clear(); }
  }
  function wavBlob(buf) {
    const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2)); let p = 0;
    const str = s => { for (let i = 0; i < s.length; i++) out.setUint8(p++, s.charCodeAt(i)); }, u32 = v => { out.setUint32(p, v, true); p += 4; }, u16 = v => { out.setUint16(p, v, true); p += 2; };
    str('RIFF'); u32(36 + n * ch * 2); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(buf.sampleRate); u32(buf.sampleRate * ch * 2); u16(ch * 2); u16(16); str('data'); u32(n * ch * 2);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); out.setInt16(p, v < 0 ? v * 32768 : v * 32767, true); p += 2; }
    return new Blob([out.buffer], { type: 'audio/wav' });
  }
  RCC.backing = { step, STYLES, renderWav, wavBlob };
})();
