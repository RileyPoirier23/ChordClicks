/* Chords from an audio file: windowed FFT → chromagram → chord templates → runs of the same chord → a timed chord sheet.
   Pure maths, no DOM, so it runs in Node (tests) and the browser (Pro "Chords from a recording"). */
(function (root, factory) {
  const chroma = (typeof module === 'object' && module.exports) ? require('./chroma.js') : root.RCC.chroma;
  const theory = (typeof module === 'object' && module.exports) ? require('./theory.js') : root.RCC.theory;
  const api = factory(chroma, theory);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RCC = root.RCC || {}; root.RCC.chordsFromAudio = api; }
})(typeof self !== 'undefined' ? self : this, function (chroma, theory) {
  /** In-place radix-2 FFT; re/im are Float64Array of length n (power of two). */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  const QUALS = ['maj', 'min', '7', 'm7', 'maj7', 'sus4', 'sus2'];
  const SUF = { maj: '', min: 'm', 7: '7', m7: 'm7', maj7: 'maj7', sus4: 'sus4', sus2: 'sus2' };
  function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < 12; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? d / Math.sqrt(na * nb) : 0; }
  const TPL = []; for (let r = 0; r < 12; r++) for (const q of QUALS) TPL.push({ name: theory.NOTES[r] + SUF[q], root: r, q, v: chroma.template(r, q) });
  function best(ch, keyPcs) {
    let b = { sim: -1, name: 'N' };
    for (const t of TPL) { let s = cos(ch, t.v); if (['7', 'm7', 'maj7', 'sus4', 'sus2'].includes(t.q)) s -= 0.04; /* prefer plain triads unless clearly better */ if (keyPcs && !keyPcs.has(t.root)) s -= 0.06; if (s > b.sim) b = { sim: s, name: t.name }; }
    return b;
  }
  /** Key guess from the summed chromagram (Krumhansl profiles) → set of diatonic roots, or null. */
  const MAJP = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MINP = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function keyOf(sum) {
    let bk = null, bs = -2;
    for (let r = 0; r < 12; r++) for (const [prof, type] of [[MAJP, 'major'], [MINP, 'minor']]) { const rot = new Array(12); for (let i = 0; i < 12; i++) rot[(i + r) % 12] = prof[i]; const s = cos(sum, rot); if (s > bs) { bs = s; bk = { root: r, type }; } }
    if (!bk) return null;
    const steps = bk.type === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    return { root: bk.root, type: bk.type, name: theory.NOTES[bk.root] + (bk.type === 'minor' ? 'm' : ''), pcs: new Set(steps.map(s => (bk.root + s) % 12)) };
  }
  /**
   * @param {Float32Array} samples mono PCM −1..1
   * @param {number} sr sample rate
   * @param {{hop?:number, fftSize?:number, minDur?:number, bpm?:number, onProgress?:function}} o
   * @returns {{segments:Array<{t:number,dur:number,chord:string,conf:number}>, key:object|null, chords:string[], duration:number}}
   */
  function analyze(samples, sr, o = {}) {
    const N = o.fftSize || 8192, hop = o.hop || Math.round(sr * 0.1), win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(N / 2), frames = [], sum = new Float64Array(12);
    let rms0 = 0; for (let i = 0; i < samples.length; i += 64) rms0 += samples[i] * samples[i]; rms0 = Math.sqrt(rms0 / (samples.length / 64)) || 1e-6;
    for (let p = 0; p + N <= samples.length; p += hop) {
      let e = 0; for (let i = 0; i < N; i++) { const s = samples[p + i]; re[i] = s * win[i]; im[i] = 0; e += s * s; }
      const rms = Math.sqrt(e / N), loud = rms > rms0 * 0.15;
      fft(re, im); for (let i = 0; i < N / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
      const ch = loud ? chroma.chromaFromMags(mag, sr, N, { minF: 60, maxF: 1500 }) : new Float64Array(12);
      if (loud) for (let i = 0; i < 12; i++) sum[i] += ch[i];
      frames.push({ t: p / sr, ch, loud }); if (o.onProgress && frames.length % 50 === 0) o.onProgress(p / samples.length);
    }
    const key = frames.some(f => f.loud) ? keyOf(sum) : null;
    // smooth chroma over ±2 frames, then pick the best template per frame
    const sm = frames.map((f, i) => { const v = new Float64Array(12); let n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(frames.length - 1, i + 2); j++) if (frames[j].loud) { for (let k = 0; k < 12; k++) v[k] += frames[j].ch[k]; n++; } return n ? v : null; });
    const labels = sm.map(v => v ? best(v, key && key.pcs) : { name: 'N', sim: 0 });
    // collapse runs; drop blips shorter than minDur by merging into the neighbour
    const minDur = o.minDur || (o.bpm ? Math.max(0.3, 60 / o.bpm * 1.5) : 0.45), hopS = hop / sr, segs = [];
    labels.forEach((l, i) => { const t = frames[i].t; if (segs.length && segs[segs.length - 1].chord === l.name) { const s = segs[segs.length - 1]; s.dur = t + hopS - s.t; s.sum += l.sim; s.n++; } else segs.push({ t, dur: hopS, chord: l.name, sum: l.sim, n: 1 }); });
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < segs.length; i++) {
      const s = segs[i]; if (s.dur >= minDur || segs.length === 1) continue;
      const prev = segs[i - 1], next = segs[i + 1], into = !prev ? next : !next ? prev : (prev.sum / prev.n >= next.sum / next.n ? prev : next);
      if (into === prev) { prev.dur += s.dur; } else { next.t = s.t; next.dur += s.dur; }
      segs.splice(i, 1); i--;
      // re-merge equal neighbours
      for (let j = 1; j < segs.length; j++) if (segs[j].chord === segs[j - 1].chord) { segs[j - 1].dur += segs[j].dur; segs[j - 1].sum += segs[j].sum; segs[j - 1].n += segs[j].n; segs.splice(j, 1); j--; }
    }
    const segments = segs.filter(s => s.chord !== 'N').map(s => ({ t: +s.t.toFixed(2), dur: +s.dur.toFixed(2), chord: s.chord, conf: +(s.sum / s.n).toFixed(2) }));
    return { segments, key: key ? { name: key.name, root: key.root, type: key.type } : null, chords: [...new Set(segments.map(s => s.chord))], duration: samples.length / sr };
  }
  const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  /** Chord sheet text: one line per ~4 chords with timestamps, so Practice can play it and the lines stay readable. */
  function toSheet(res, title = 'From recording') {
    const out = ['[' + title + ']' + (res.key ? '  (key ' + res.key.name + ')' : '')]; let line = [];
    res.segments.forEach((s, i) => { line.push(s.chord); if (line.length === 4 || i === res.segments.length - 1) { out.push(mmss(res.segments[i - line.length + 1].t) + '  ' + line.join('   ')); line = []; } });
    return out.join('\n');
  }
  /** Synthesise a chord (for tests/demos): equal-tempered sines of the chord tones with a few harmonics. */
  function synth(chords, secPer, sr = 22050) {
    const n = Math.round(chords.length * secPer * sr), out = new Float32Array(n);
    chords.forEach((name, ci) => { const c = theory.parseChord(name); if (!c) return; const iv = chroma.template(c.root, c.quality); const pcs = []; for (let p = 0; p < 12; p++) if (iv[p]) pcs.push(p);
      const start = Math.round(ci * secPer * sr), end = Math.min(n, Math.round((ci + 1) * secPer * sr));
      pcs.forEach((pc, k) => { const f = 440 * Math.pow(2, (pc + 48 - 69 + (pc < c.root ? 12 : 0)) / 12); for (let i = start; i < end; i++) { const t = (i - start) / sr, env = Math.exp(-t * 1.2); out[i] += env * (Math.sin(2 * Math.PI * f * t) * .5 + Math.sin(4 * Math.PI * f * t) * .25 + Math.sin(6 * Math.PI * f * t) * .12) / pcs.length; } }); });
    return out;
  }
  return { analyze, toSheet, fft, synth, keyOf };
});
