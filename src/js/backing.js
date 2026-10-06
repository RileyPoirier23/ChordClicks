/* Backing track generator: drums + bass (+ optional strummed chords) built from the song's chords and strumming pattern. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory;
  const STYLES = { rock: 'Rock', ballad: 'Ballad', folk: 'Folk (boom-chick)', shuffle: 'Shuffle', funk: 'Funk 16ths' };
  const cache = new Map();
  function chordInfo(name) {
    let v = cache.get(name); if (v) return v;
    const p = T.parseChord(name), vo = T.voicings(name)[0] || null, shape = vo || T.chordShape(name);
    v = { root: p ? (p.bass != null ? p.bass : p.root) : 0, true_root: p ? p.root : 0, fifth: p ? (p.root + 7) % 12 : 7, mids: shape ? RCC.audio.chordMidis(shape.frets) : [], ok: !!p };
    cache.set(name, v); return v;
  }
  const bassMidi = pc => 36 + ((pc - 36 % 12 + 12 * 4) % 12);   // E1..D#2 range
  /**
   * Schedule one grid step. o: { t, s (slot within bar), sub, beats, chord, style, vol, comp, patChar, bar }
   */
  function step(o) {
    const A = RCC.audio, { t, s, sub, beats, style, vol } = o, b = Math.floor(s / sub), k = s % sub, on = k === 0, v = vol;
    const ci = chordInfo(o.chord), half = beats >= 4 ? 2 : Math.ceil(beats / 2);
    const bassNote = pc => 28 + ((pc - 28 % 12 + 120) % 12);
    let st = style; if (st === 'shuffle' && sub !== 3) st = 'rock'; if (st === 'funk' && sub < 2) st = 'rock';
    if (st === 'rock') {
      if (on && (b === 0 || b === half)) A.kick(t, .8 * v); if (on && beats >= 3 && b % 2 === 1) A.snare(t, .5 * v);
      if (sub >= 2 && k === Math.floor(sub / 2) && b === half - 1) A.kick(t, .55 * v);
      if (sub === 1 ? true : k === 0 || (sub >= 2 && k === Math.floor(sub / 2) && sub % 2 === 0)) A.hat(t, (on ? .22 : .14) * v);
      if (on && b === 0 && ci.ok) A.bass(bassNote(ci.root), t, .5 * 60 / 90, .5 * v + .1);
      else if (on && b === half && ci.ok) A.bass(bassNote(ci.root), t, .4, .42 * v);
      else if (sub >= 2 && k === Math.floor(sub / 2) && b === half - 1 && ci.ok) A.bass(bassNote(ci.fifth) + 0, t, .3, .38 * v);
    } else if (st === 'ballad') {
      if (on && b === 0) A.kick(t, .7 * v); if (on && b === half) A.snare(t, .4 * v, true); if (on) A.hat(t, .12 * v);
      if (on && b === 0 && ci.ok) A.bass(bassNote(ci.root), t, 1.6, .5 * v + .1); if (on && b === half && ci.ok) A.bass(bassNote(ci.fifth), t, 1.2, .38 * v);
    } else if (st === 'folk') {
      if (on && b % 2 === 0) { A.kick(t, .45 * v); if (ci.ok) A.bass(bassNote(b === 0 ? ci.root : ci.fifth), t, .4, .45 * v); }
      if (on && b % 2 === 1) { A.hat(t, .3 * v, true); A.snare(t, .18 * v); }
    } else if (st === 'shuffle') {
      if (on && (b === 0 || b === half)) A.kick(t, .8 * v); if (on && b % 2 === 1) A.snare(t, .5 * v); if (k !== 1) A.hat(t, (on ? .22 : .16) * v);
      if (on && ci.ok && b % 2 === 0) A.bass(bassNote(b === 0 ? ci.root : ci.fifth), t, .45, .45 * v + .05);
    } else if (st === 'funk') {
      const g = b * sub + k; if (g === 0 || g === sub * 2 + Math.floor(sub / 2) || g === sub * 3) A.kick(t, .8 * v); if (on && b % 2 === 1) A.snare(t, .55 * v); else if (k === sub - 1 && b === 3) A.snare(t, .22 * v);
      A.hat(t, (on ? .2 : .1) * v, k === sub - 1 && b === 1); if (on && b === 0 && ci.ok) A.bass(bassNote(ci.root), t, .25, .5 * v); if (k === sub - 1 && b % 2 === 0 && ci.ok) A.bass(bassNote(ci.root) + 12, t, .15, .35 * v);
    }
    if (o.comp && (o.patChar === 'D' || o.patChar === 'U') && ci.mids.length) A.strum(ci.mids, t, o.patChar, 1.0, .18 * (o.compVol == null ? 1 : o.compVol));
  }
  RCC.backing = { step, STYLES };
})();
