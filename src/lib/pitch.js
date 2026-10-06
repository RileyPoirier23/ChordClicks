/* YIN pitch detector tuned for guitar (≈60–1200 Hz). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RCC = root.RCC || {}; root.RCC.pitch = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  const rms = b => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i]; return Math.sqrt(s / b.length); };

  /**
   * @param {Float32Array} buf  mono samples (>= 2*sr/minF recommended, 4096 is plenty)
   * @returns {{freq:number, prob:number, rms:number}}  freq = -1 when nothing clear was found
   */
  function yin(buf, sr, { minF = 60, maxF = 1200, threshold = 0.12 } = {}) {
    const level = rms(buf);
    const W = Math.floor(buf.length / 2);
    const maxTau = Math.min(W - 1, Math.floor(sr / minF));
    const minTau = Math.max(2, Math.floor(sr / maxF));
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const x = buf[j] - buf[j + tau]; s += x * x; }
      d[tau] = s;
    }
    // cumulative mean normalised difference
    const cm = new Float32Array(maxTau + 1); cm[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= maxTau; tau++) { run += d[tau]; cm[tau] = run ? (d[tau] * tau) / run : 1; }
    let tau = -1;
    for (let t = minTau; t < maxTau; t++) {
      if (cm[t] < threshold) { while (t + 1 < maxTau && cm[t + 1] < cm[t]) t++; tau = t; break; }
    }
    if (tau < 0) { // no dip under the threshold: report the best candidate with low confidence
      let best = minTau; for (let t = minTau; t < maxTau; t++) if (cm[t] < cm[best]) best = t;
      return { freq: -1, prob: Math.max(0, 1 - cm[best]), rms: level };
    }
    // parabolic interpolation
    const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1], den = a + c - 2 * b;
    const shift = den ? (a - c) / (2 * den) : 0;
    return { freq: sr / (tau + shift), prob: 1 - cm[tau], rms: level };
  }

  /** Median of recent readings, ignoring outliers (octave jumps). */
  function median(arr) { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

  return { yin, rms, median };
});
