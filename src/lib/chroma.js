/* Chord detection from an audio spectrum (chromagram + template matching). Used by the chord-change trainer and live feedback. */
(function (root, factory) {
  const theory = (typeof module === 'object' && module.exports) ? require('./theory.js') : root.RCC.theory;
  const api = factory(theory);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RCC = root.RCC || {}; root.RCC.chroma = api; }
})(typeof self !== 'undefined' ? self : this, function (theory) {
  /** @param mag linear magnitudes of an FFT (length fftSize/2) */
  function chromaFromMags(mag, sr, fftSize, { minF = 70, maxF = 1800 } = {}) {
    const ch = new Float64Array(12), bin = sr / fftSize, lo = Math.max(2, Math.floor(minF / bin)), hi = Math.min(mag.length - 2, Math.ceil(maxF / bin));
    let max = 0; for (let i = lo; i <= hi; i++) if (mag[i] > max) max = mag[i];
    if (max <= 0) return ch;
    const thr = max * 0.08;
    for (let i = lo; i <= hi; i++) {
      const m = mag[i]; if (m < thr || m < mag[i - 1] || m < mag[i + 1]) continue;
      const a = mag[i - 1], c = mag[i + 1], den = a - 2 * m + c, d = den ? 0.5 * (a - c) / den : 0, f = (i + d) * bin;
      const pc = theory.mod12(Math.round(12 * Math.log2(f / 440) + 69));
      ch[pc] += m / Math.sqrt(f / 110);
    }
    let s = 0; for (let i = 0; i < 12; i++) s = Math.max(s, ch[i]); if (s > 0) for (let i = 0; i < 12; i++) ch[i] /= s;
    return ch;
  }
  const IV = { maj: [0, 4, 7], min: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8], 5: [0, 7], add9: [0, 2, 4, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9] };
  function template(root, q) { const v = new Float64Array(12); (IV[q] || IV.maj).forEach((i, k) => { v[(root + i) % 12] = k === 0 ? 1 : 0.85; }); return v; }
  function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < 12; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? d / Math.sqrt(na * nb) : 0; }
  const NAMES = theory.NOTES;
  /** Best triad match for a chromagram. */
  function bestTriad(ch) {
    let best = { sim: -1 };
    for (let r = 0; r < 12; r++) for (const q of ['maj', 'min']) { const s = cos(ch, template(r, q)); if (s > best.sim) best = { sim: s, name: NAMES[r] + (q === 'min' ? 'm' : '') }; }
    return best;
  }
  /** Is `name` what the chromagram says is being played? */
  function matchChord(ch, name) {
    const c = theory.parseChord(name); if (!c) return { ok: false, sim: 0 };
    const sim = cos(ch, template(c.root, c.quality)), other = bestTriad(ch);
    const target = theory.canon(name);
    return { ok: sim >= 0.7 && (sim >= other.sim - 0.03 || other.name === target), sim, heard: other.name, heardSim: other.sim };
  }
  return { chromaFromMags, matchChord, bestTriad, template };
});
