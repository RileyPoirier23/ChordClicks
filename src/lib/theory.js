/* Music theory helpers: notes, tunings, chord shapes. UMD so it runs in Electron and in node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RCC = root.RCC || {}; root.RCC.theory = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };
  const noteIndex = n => { n = FLAT[n] || n; return NOTES.indexOf(n); };

  // ---- tunings (low string -> high string) ----
  const TUNINGS = {
    standard: { name: 'Standard (E A D G B E)', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    dropd: { name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    halfdown: { name: 'Half step down', notes: ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] },
    fulldown: { name: 'Full step down', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
    dadgad: { name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
    openg: { name: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
    opend: { name: 'Open D', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
    opene: { name: 'Open E', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
    guitar7: { name: '7-string guitar', notes: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'], group: 'Other instruments' },
    bass4: { name: 'Bass (4-string)', notes: ['E1', 'A1', 'D2', 'G2'], group: 'Other instruments' },
    bass5: { name: 'Bass (5-string)', notes: ['B0', 'E1', 'A1', 'D2', 'G2'], group: 'Other instruments' },
    uke: { name: 'Ukulele (GCEA)', notes: ['G4', 'C4', 'E4', 'A4'], group: 'Other instruments' },
    mandolin: { name: 'Mandolin / violin', notes: ['G3', 'D4', 'A4', 'E5'], group: 'Other instruments' },
    banjo: { name: 'Banjo (open G)', notes: ['D3', 'G3', 'B3', 'D4', 'G4'], group: 'Other instruments' },
  };

  function noteToMidi(name) {
    const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
    if (!m) return NaN;
    return noteIndex(m[1]) + (parseInt(m[2], 10) + 1) * 12;
  }
  const midiToFreq = (midi, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12);
  const noteToFreq = (name, a4 = 440) => midiToFreq(noteToMidi(name), a4);

  function nearestNote(freq, a4 = 440) {
    const m = 12 * Math.log2(freq / a4) + 69, r = Math.round(m);
    return { midi: r, name: NOTES[((r % 12) + 12) % 12], octave: Math.floor(r / 12) - 1, cents: (m - r) * 100 };
  }

  /** Match a frequency against the strings of a tuning. */
  function nearestString(freq, tuning, a4 = 440) {
    let best = null;
    tuning.forEach((n, i) => {
      const f = noteToFreq(n, a4), cents = 1200 * Math.log2(freq / f);
      if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { index: i, note: n, target: f, cents };
    });
    return best;
  }

  // ---- chord names ----
  const CHORD_RE = /^[A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add|\+|-|°|ø|Δ)?\d*(?:(?:sus|add|b|#|maj)\d+)*(?:\([^)\s]*\))?(?:\/[A-G][#b]?)?$/;
  const isChord = s => CHORD_RE.test(s);

  function parseChord(name) {
    const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(name);
    if (!m) return null;
    const root = noteIndex(m[1] + m[2]);
    if (root < 0) return null;
    return { root, quality: normQuality(m[3]), bass: m[4] ? noteIndex(m[4]) : null, raw: name };
  }
  function normQuality(q) {
    q = q.replace(/[()]/g, '');
    if (q === '' || q === 'maj' || q === 'M') return 'maj';
    if (/^(m|min|-)$/.test(q)) return 'min';
    if (/^(maj7|M7|Δ|Δ7|maj9|maj13)$/.test(q)) return 'maj7';
    if (/^(m7|min7|-7|m9|m11|m13)$/.test(q)) return 'm7';
    if (/^(7|9|11|13|7b9|7#9|7#5|7b5)$/.test(q)) return '7';
    if (/^(sus|sus4|7sus4)$/.test(q)) return 'sus4';
    if (q === 'sus2') return 'sus2';
    if (/^(dim|dim7|°|m7b5|ø)$/.test(q)) return 'dim';
    if (/^(aug|\+|aug7)$/.test(q)) return 'aug';
    if (q === '5') return '5';
    if (/^(add9|add2|2|9add)$/.test(q)) return 'add9';
    if (q === '6') return '6';
    if (q === 'm6') return 'm6';
    return /^m(?!aj)/.test(q) ? 'min' : 'maj';
  }
  const SUFFIX = { maj: '', min: 'm', 7: '7', m7: 'm7', maj7: 'maj7', sus4: 'sus4', sus2: 'sus2', 5: '5', dim: 'dim', add9: 'add9', 6: '6', m6: 'm6', aug: 'aug' };

  // frets low E -> high e, -1 = muted
  const OPEN = {
    C: [-1, 3, 2, 0, 1, 0], D: [-1, -1, 0, 2, 3, 2], G: [3, 2, 0, 0, 0, 3],
    Am: [-1, 0, 2, 2, 1, 0], Dm: [-1, -1, 0, 2, 3, 1], Em: [0, 2, 2, 0, 0, 0],
    A7: [-1, 0, 2, 0, 2, 0], B7: [-1, 2, 1, 2, 0, 2], C7: [-1, 3, 2, 3, 1, 0], D7: [-1, -1, 0, 2, 1, 2], E7: [0, 2, 0, 1, 0, 0], G7: [3, 2, 0, 0, 0, 1],
    Am7: [-1, 0, 2, 0, 1, 0], Dm7: [-1, -1, 0, 2, 1, 1], Em7: [0, 2, 0, 0, 0, 0],
    Cmaj7: [-1, 3, 2, 0, 0, 0], Dmaj7: [-1, -1, 0, 2, 2, 2], Fmaj7: [-1, -1, 3, 2, 1, 0], Gmaj7: [3, 2, 0, 0, 0, 2], Amaj7: [-1, 0, 2, 1, 2, 0], Emaj7: [0, 2, 1, 1, 0, 0],
    Asus2: [-1, 0, 2, 2, 0, 0], Asus4: [-1, 0, 2, 2, 3, 0], Dsus2: [-1, -1, 0, 2, 3, 0], Dsus4: [-1, -1, 0, 2, 3, 3], Esus4: [0, 2, 2, 2, 0, 0], Gsus4: [3, 3, 0, 0, 1, 3],
    Cadd9: [-1, 3, 2, 0, 3, 0], 'G/B': [-1, 2, 0, 0, 0, 3], 'D/F#': [2, -1, 0, 2, 3, 2], 'C/G': [3, 3, 2, 0, 1, 0],
  };
  // movable templates, relative to the barre fret
  const E_SHAPE = { maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, 2, 1, 1, 0, 0], sus4: [0, 2, 2, 2, 0, 0], 5: [0, 2, 2, -1, -1, -1], 6: [0, 2, 2, 1, 2, 0], dim: [0, 1, 2, 0, -1, -1], aug: [0, 3, 2, 1, 1, 0] };
  const A_SHAPE = { maj: [-1, 0, 2, 2, 2, 0], min: [-1, 0, 2, 2, 1, 0], 7: [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0], maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0], 5: [-1, 0, 2, 2, -1, -1], 6: [-1, 0, 2, 2, 2, 2], m6: [-1, 0, 2, 2, 1, 2], dim: [-1, 0, 1, 2, 1, -1], add9: [-1, 0, 2, 4, 2, 0], aug: [-1, 0, 3, 2, 2, 1] };

  /** Returns {frets, window:[first,last], barre, name} or null. */
  function chordShape(name) {
    const c = parseChord(name);
    if (!c) return null;
    const rn = NOTES[c.root], sfx = SUFFIX[c.quality] ?? '';
    const key = rn + sfx, slash = c.bass != null ? key + '/' + NOTES[c.bass] : null;
    let frets = (slash && OPEN[slash]) || OPEN[key], barre = false;
    if (!frets) {
      const q = c.quality;
      const fe = (c.root - 4 + 12) % 12, fa = (c.root - 9 + 12) % 12;
      const hasE = !!E_SHAPE[q], hasA = !!A_SHAPE[q];
      let useE = hasE && (!hasA || fe <= fa);
      const t = useE ? E_SHAPE[q] : (hasA ? A_SHAPE[q] : null);
      const base = useE ? fe : fa;
      if (!t) return null;
      frets = t.map(x => (x < 0 ? -1 : x + base));
      barre = base > 0;
    }
    const pos = frets.filter(f => f > 0);
    const lo = pos.length ? Math.min(...pos) : 1, hi = pos.length ? Math.max(...pos) : 1;
    const first = hi <= 4 ? 1 : lo;
    return { frets, window: [first, Math.max(first + 3, hi)], barre, name };
  }

  /* ---------------- scales ---------------- */
  const SCALES = {
    major: { name: 'Major (Ionian)', iv: [0, 2, 4, 5, 7, 9, 11], deg: ['1', '2', '3', '4', '5', '6', '7'] },
    dorian: { name: 'Dorian', iv: [0, 2, 3, 5, 7, 9, 10], deg: ['1', '2', 'b3', '4', '5', '6', 'b7'] },
    phrygian: { name: 'Phrygian', iv: [0, 1, 3, 5, 7, 8, 10], deg: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'] },
    lydian: { name: 'Lydian', iv: [0, 2, 4, 6, 7, 9, 11], deg: ['1', '2', '3', '#4', '5', '6', '7'] },
    mixolydian: { name: 'Mixolydian', iv: [0, 2, 4, 5, 7, 9, 10], deg: ['1', '2', '3', '4', '5', '6', 'b7'] },
    minor: { name: 'Natural minor (Aeolian)', iv: [0, 2, 3, 5, 7, 8, 10], deg: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
    locrian: { name: 'Locrian', iv: [0, 1, 3, 5, 6, 8, 10], deg: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'] },
    harmonic: { name: 'Harmonic minor', iv: [0, 2, 3, 5, 7, 8, 11], deg: ['1', '2', 'b3', '4', '5', 'b6', '7'] },
    melodic: { name: 'Melodic minor', iv: [0, 2, 3, 5, 7, 9, 11], deg: ['1', '2', 'b3', '4', '5', '6', '7'] },
    majpent: { name: 'Major pentatonic', iv: [0, 2, 4, 7, 9], deg: ['1', '2', '3', '5', '6'] },
    minpent: { name: 'Minor pentatonic', iv: [0, 3, 5, 7, 10], deg: ['1', 'b3', '4', '5', 'b7'] },
    blues: { name: 'Blues', iv: [0, 3, 5, 6, 7, 10], deg: ['1', 'b3', '4', 'b5', '5', 'b7'] },
  };
  // keys that are conventionally spelled with flats
  const FLAT_KEYS = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db as roots
  const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

  /** Spell a 7-note scale with each letter used once (C D E… with proper #/b). */
  function spell(root, iv) {
    const rootName = FLAT_KEYS.has(root) || root === 6 && false ? FLAT_NAMES[root] : NOTES[root];
    const rl = LETTERS.indexOf(rootName[0]);
    return iv.map((i, k) => {
      const pc = (root + i) % 12, letter = LETTERS[(rl + k) % 7];
      let d = ((pc - LETTER_PC[LETTERS.indexOf(letter)]) % 12 + 12) % 12; if (d > 6) d -= 12;
      return letter + (d === 0 ? '' : d > 0 ? '#'.repeat(d) : 'b'.repeat(-d));
    });
  }
  function scaleNotes(root, type) {
    const s = SCALES[type];
    return s.iv.length === 7 ? spell(root, s.iv) : s.iv.map(i => (FLAT_KEYS.has(root) ? FLAT_NAMES : NOTES)[(root + i) % 12]);
  }
  const KEY_SIGS = { 0: '0', 7: '1♯', 2: '2♯', 9: '3♯', 4: '4♯', 11: '5♯', 6: '6♯', 5: '1♭', 10: '2♭', 3: '3♭', 8: '4♭', 1: '5♭' };
  /** Diatonic triads for the 7-note scale, e.g. major -> I ii iii IV V vi vii° */
  function diatonicChords(root, type) {
    const s = SCALES[type]; if (s.iv.length !== 7) return [];
    const names = scaleNotes(root, type), ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    return s.iv.map((_, k) => {
      const a = s.iv[k], b = s.iv[(k + 2) % 7] + (k + 2 >= 7 ? 12 : 0), c = s.iv[(k + 4) % 7] + (k + 4 >= 7 ? 12 : 0);
      const third = b - a, fifth = c - a;
      let q = third === 4 && fifth === 7 ? '' : third === 3 && fifth === 7 ? 'm' : third === 3 && fifth === 6 ? 'dim' : third === 4 && fifth === 8 ? 'aug' : '?';
      const r = q === 'm' || q === 'dim' ? ROM[k].toLowerCase() : ROM[k];
      return { name: names[k] + (q === '?' ? '' : q), roman: r + (q === 'dim' ? '°' : q === 'aug' ? '+' : '') };
    });
  }
  const OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // standard tuning, low E -> high e

  /**
   * Fretboard positions for a scale.
   * Returns {all:[{s,fret,deg,pc}], positions:[[{s,fret,deg,pc}]...]}; s: 0 = high e … 5 = low E (tab order).
   * Positions use 3 notes per string (2 for pentatonics/blues), starting on each scale degree on the low E string.
   */
  function scaleOnNeck(root, type, maxFret = 22, tuning = OPEN_MIDI) {
    const sc = SCALES[type], pcs = sc.iv.map(i => (root + i) % 12);
    const all = [];
    tuning.forEach((open, lo) => { for (let f = 0; f <= maxFret; f++) { const idx = pcs.indexOf((open + f) % 12); if (idx >= 0) all.push({ s: 5 - lo, fret: f, deg: idx, pc: (open + f) % 12 }); } });
    const per = sc.iv.length >= 7 ? 3 : 2, positions = [];
    for (let k = 0; k < pcs.length; k++) {
      // lowest note on the low E string (frets 0–11) matching degree k
      let start = null; for (let f = 0; f < 12; f++) if ((tuning[0] + f) % 12 === pcs[k]) { start = tuning[0] + f; break; }
      if (start == null) continue;
      const seq = []; let m = start, d = k;
      while (seq.length < per * 6 + 2) { seq.push({ midi: m, deg: d }); const nd = (d + 1) % pcs.length; m += ((pcs[nd] - pcs[d]) % 12 + 12) % 12 || 12; d = nd; }
      const pos = []; let i = 0;
      for (let lo = 0; lo < 6 && i < seq.length; lo++) {
        for (let n = 0; n < per && i < seq.length; n++, i++) {
          const fret = seq[i].midi - tuning[lo];
          if (fret >= 0 && fret <= maxFret) pos.push({ s: 5 - lo, fret, deg: seq[i].deg, pc: seq[i].midi % 12 });
        }
      }
      positions.push(pos);
    }
    return { all, positions, notes: scaleNotes(root, type), pcs };
  }


  /* ---------------- transposing / canonical names ---------------- */
  const mod12 = n => ((n % 12) + 12) % 12;
  function transposeChord(name, semis, flats) {
    const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(name);
    if (!m || noteIndex(m[1]) < 0) return name;
    const names = flats ? FLAT_NAMES : NOTES;
    let out = names[mod12(noteIndex(m[1]) + semis)] + m[2];
    if (m[3]) out += '/' + names[mod12(noteIndex(m[3]) + semis)];
    return out;
  }
  /** One name per chord regardless of spelling: Bb and A#, Amin and Am. */
  function canon(name) { const c = parseChord(name); return c ? NOTES[c.root] + (SUFFIX[c.quality] ?? '') : name; }
  const prefersFlats = root => [1, 3, 5, 8, 10].includes(mod12(root));

  /* ---------------- more voicings ---------------- */
  const D_SHAPE = { maj: [-1, -1, 0, 2, 3, 2], min: [-1, -1, 0, 2, 3, 1], 7: [-1, -1, 0, 2, 1, 2], m7: [-1, -1, 0, 2, 1, 1], maj7: [-1, -1, 0, 2, 2, 2], sus2: [-1, -1, 0, 2, 3, 0], sus4: [-1, -1, 0, 2, 3, 3], 6: [-1, -1, 0, 2, 0, 2], dim: [-1, -1, 0, 1, 3, 1] };
  function voicings(name) {
    const c = parseChord(name); if (!c) return [];
    const q = c.quality, rn = NOTES[c.root], key = rn + (SUFFIX[q] ?? ''), out = [], seen = new Set();
    const add = (label, frets) => {
      const k = frets.join(','); if (seen.has(k)) return;
      const pos = frets.filter(f => f > 0), hi = pos.length ? Math.max(...pos) : 1, lo = pos.length ? Math.min(...pos) : 1;
      if (hi > 15) return; seen.add(k);
      const first = hi <= 4 ? 1 : lo; out.push({ label, frets, window: [first, Math.max(first + 3, hi)], lo: pos.length ? lo : 0, name });
    };
    const slash = c.bass != null ? key + '/' + NOTES[c.bass] : null;
    if ((slash && OPEN[slash]) || OPEN[key]) add('Open', (slash && OPEN[slash]) || OPEN[key]);
    [['E shape', E_SHAPE, (c.root - 4 + 12) % 12], ['A shape', A_SHAPE, (c.root - 9 + 12) % 12], ['D shape', D_SHAPE, (c.root - 2 + 12) % 12]].forEach(([lab, tbl, base]) => {
      const t = tbl[q]; if (!t) return;
      [base, base + 12].forEach((b, i) => { if (i && base !== 0) return; add((b === 0 ? 'Open ' : b >= 12 ? 'High ' : 'Barre ') + lab + (b ? ' · fret ' + b : ''), t.map(x => (x < 0 ? -1 : x + b))); });
    });
    return out.sort((a, b) => a.lo - b.lo);
  }

  /* ---------------- arpeggios, triads, CAGED ---------------- */
  [['arp_maj', 'Major triad arpeggio', [0, 4, 7], ['1', '3', '5']], ['arp_min', 'Minor triad arpeggio', [0, 3, 7], ['1', 'b3', '5']], ['arp_dim', 'Diminished arpeggio', [0, 3, 6], ['1', 'b3', 'b5']], ['arp_aug', 'Augmented arpeggio', [0, 4, 8], ['1', '3', '#5']],
    ['arp_maj7', 'Major 7 arpeggio', [0, 4, 7, 11], ['1', '3', '5', '7']], ['arp_7', 'Dominant 7 arpeggio', [0, 4, 7, 10], ['1', '3', '5', 'b7']], ['arp_m7', 'Minor 7 arpeggio', [0, 3, 7, 10], ['1', 'b3', '5', 'b7']], ['arp_m7b5', 'Half-diminished arpeggio', [0, 3, 6, 10], ['1', 'b3', 'b5', 'b7']]]
    .forEach(([k, name, iv, deg]) => { SCALES[k] = { name, iv, deg, arp: true }; });

  const TRIADS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
  /** All close-voiced triads on three adjacent strings. lo = lowest string (0 = low E … 3 = D). inv = 0 root, 1 first, 2 second inversion. */
  function triadVoicings(root, quality, lo, inv) {
    const pcs = TRIADS[quality].map(i => (root + i) % 12), need = [0, 1, 2].map(k => pcs[(inv + k) % 3]), degs = ['R', quality === 'min' || quality === 'dim' ? 'b3' : '3', quality === 'dim' ? 'b5' : quality === 'aug' ? '#5' : '5'];
    const next = (open, above, pc) => { for (let f = 0; f <= 17; f++) if (open + f > above && (open + f) % 12 === pc) return f; return -1; };
    const res = [];
    for (let fa = 0; fa <= 17; fa++) {
      const ma = OPEN_MIDI[lo] + fa; if (ma % 12 !== need[0]) continue;
      const fb = next(OPEN_MIDI[lo + 1], ma, need[1]); if (fb < 0) continue;
      const fc = next(OPEN_MIDI[lo + 2], OPEN_MIDI[lo + 1] + fb, need[2]); if (fc < 0) continue;
      const fr = [fa, fb, fc]; if (Math.max(...fr) - Math.min(...fr) > 5) continue;
      res.push({ notes: fr.map((f, k) => ({ s: 5 - (lo + k), fret: f, deg: degs[(inv + k) % 3] })), lo: Math.min(...fr) });
    }
    return res;
  }

  const CAGED_SHAPES = { C: { frets: [-1, 3, 2, 0, 1, 0], pc: 0 }, A: { frets: [-1, 0, 2, 2, 2, 0], pc: 9 }, G: { frets: [3, 2, 0, 0, 0, 3], pc: 7 }, E: { frets: [0, 2, 2, 1, 0, 0], pc: 4 }, D: { frets: [-1, -1, 0, 2, 3, 2], pc: 2 } };
  /** The five open-chord shapes moved to `root`, ordered up the neck. */
  function caged(root) {
    return Object.entries(CAGED_SHAPES).map(([shape, s]) => {
      const off = mod12(root - s.pc);
      let frets = s.frets.map(f => (f < 0 ? -1 : f + off));
      if (Math.min(...frets.filter(f => f >= 0)) >= 12) frets = frets.map(f => (f < 0 ? -1 : f - 12));
      const fr = frets.filter(f => f > 0), lo = fr.length ? Math.min(...fr) : 0, hi = Math.max(...frets);
      const notes = []; frets.forEach((f, i) => { if (f >= 0) notes.push({ s: 5 - i, fret: f, root: (OPEN_MIDI[i] + f) % 12 === root }); });
      return { shape, frets, lo, hi, notes };
    }).sort((a, b) => a.lo - b.lo);
  }

  /* ---------------- key guessing, difficulty ---------------- */
  const qClass = q => (q === 'min' || q === 'm7' || q === 'm6' ? 'min' : q === 'dim' ? 'dim' : 'maj');
  /** Best-fit key for a list of chord names -> {root, type:'major'|'minor'} */
  function guessKey(names) {
    const cs = names.map(parseChord).filter(Boolean); if (!cs.length) return null;
    let best = null;
    for (let r = 0; r < 12; r++) for (const type of ['major', 'minor']) {
      const set = new Set(diatonicChords(r, type).map(c => { const p = parseChord(c.name); return p.root + ':' + qClass(p.quality); }));
      let score = 0; cs.forEach(c => { if (set.has(c.root + ':' + qClass(c.quality))) score++; });
      if (cs[0].root === r && (qClass(cs[0].quality) === 'min') === (type === 'minor')) score += 0.6;
      if (cs[cs.length - 1].root === r) score += 0.3;
      if (!best || score > best.score) best = { root: r, type, score };
    }
    return best;
  }
  function chordDifficulty(name) {
    const c = parseChord(name); if (!c) return 3;
    const key = NOTES[c.root] + (SUFFIX[c.quality] ?? ''), slash = c.bass != null;
    let d;
    if (OPEN[key]) d = ['maj', 'min'].includes(c.quality) ? 1 : ['7', 'm7'].includes(c.quality) ? 1.5 : 2;
    else if (c.quality === '5') d = 2;
    else if (['maj', 'min', '7', 'm7'].includes(c.quality)) d = 3;
    else if (['dim', 'aug'].includes(c.quality)) d = 4; else d = 3.5;
    return d + (slash && !OPEN[key + '/' + NOTES[c.bass]] ? 0.5 : 0);
  }
  /** @returns {{level:1-5,label:string,reasons:string[]}} */
  function songDifficulty(chordNames, bpm = 90, strumPat = '') {
    const uniq = [...new Set(chordNames.map(canon))]; if (!uniq.length) return { level: 0, label: '—', reasons: [] };
    const ds = uniq.map(chordDifficulty), avg = ds.reduce((a, b) => a + b, 0) / ds.length, barre = ds.filter(x => x >= 3).length;
    let score = avg * .9 + (uniq.length > 6 ? .3 : 0) + (uniq.length > 10 ? .4 : 0) + (barre / uniq.length) * .8 + (bpm > 130 ? .4 : 0) + ((strumPat.match(/U/g) || []).length >= 3 ? .2 : 0);
    const level = Math.max(1, Math.min(5, Math.round(score)));
    const reasons = []; if (barre) reasons.push(barre + ' barre/hard chord' + (barre > 1 ? 's' : '')); if (uniq.length > 6) reasons.push(uniq.length + ' different chords'); if (bpm > 130) reasons.push('fast tempo');
    return { level, label: ['', 'Beginner', 'Easy', 'Intermediate', 'Advanced', 'Expert'][level], reasons };
  }

  /* ---------------- ear training data ---------------- */
  const INTERVALS = [['m2', 1, 'Minor 2nd'], ['M2', 2, 'Major 2nd'], ['m3', 3, 'Minor 3rd'], ['M3', 4, 'Major 3rd'], ['P4', 5, 'Perfect 4th'], ['TT', 6, 'Tritone'], ['P5', 7, 'Perfect 5th'], ['m6', 8, 'Minor 6th'], ['M6', 9, 'Major 6th'], ['m7', 10, 'Minor 7th'], ['M7', 11, 'Major 7th'], ['P8', 12, 'Octave']];
  const CHORD_TYPES = [['maj', 'Major', [0, 4, 7]], ['min', 'Minor', [0, 3, 7]], ['dim', 'Diminished', [0, 3, 6]], ['aug', 'Augmented', [0, 4, 8]], ['7', 'Dominant 7', [0, 4, 7, 10]], ['maj7', 'Major 7', [0, 4, 7, 11]], ['m7', 'Minor 7', [0, 3, 7, 10]], ['sus4', 'Sus4', [0, 5, 7]], ['sus2', 'Sus2', [0, 2, 7]]];

  return { transposeChord, canon, prefersFlats, voicings, triadVoicings, TRIADS, caged, CAGED_SHAPES, guessKey, chordDifficulty, songDifficulty, INTERVALS, CHORD_TYPES, mod12, OPEN, FLAT_NAMES, SUFFIX,
    SCALES, KEY_SIGS, scaleNotes, scaleOnNeck, diatonicChords, OPEN_MIDI, NOTES, TUNINGS, noteIndex, noteToMidi, midiToFreq, noteToFreq, nearestNote, nearestString, CHORD_RE, isChord, parseChord, chordShape, normQuality };
});
