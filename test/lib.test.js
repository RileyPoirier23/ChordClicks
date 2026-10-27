const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/lib/theory.js');
const S = require('../src/lib/song.js');
const P = require('../src/lib/pitch.js');

test('chord detection', () => {
  ['Am', 'F#m7', 'Bb', 'Cmaj7', 'G7sus4', 'Dsus2', 'E7b9', 'A/C#', 'C#m', 'Gadd9', 'D5', 'Fmaj7'].forEach(c => assert.ok(T.isChord(c), c));
  ['Hello', 'Add', 'Bad', 'the', 'Verse', 'Dead', 'Face'].forEach(c => assert.ok(!T.isChord(c), c));
});

test('chord shapes', () => {
  assert.deepStrictEqual(T.chordShape('C').frets, [-1, 3, 2, 0, 1, 0]);
  assert.deepStrictEqual(T.chordShape('F').frets, [1, 3, 3, 2, 1, 1]);
  assert.deepStrictEqual(T.chordShape('Bm').frets, [-1, 2, 4, 4, 3, 2]);
  assert.deepStrictEqual(T.chordShape('E').frets, [0, 2, 2, 1, 0, 0]);
  assert.deepStrictEqual(T.chordShape('G#m').frets, [4, 6, 6, 4, 4, 4]);
  assert.ok(T.chordShape('F#m7'));
  assert.deepStrictEqual(T.chordShape('Bb').frets, [-1, 1, 3, 3, 3, 1]);
});

test('sheet parsing keeps sections and dedupes consecutive chords', () => {
  const sh = S.parseSheet('[Verse 1]\n[ch]Am[/ch]   F\nsome lyric here\nC  G  G\n[Chorus]\nAm');
  assert.deepStrictEqual(sh.prog.map(p => p.c), ['Am', 'F', 'C', 'G', 'Am']);
  assert.strictEqual(sh.prog[0].sec, 'Verse 1');
  assert.strictEqual(sh.prog[4].sec, 'Chorus');
});

test('strum string parsing', () => {
  assert.strictEqual(S.strumToString(S.parseStrumString('D DU UDU')), 'D-DU-UDU');
  assert.strictEqual(S.strumToString(S.parseStrumString('D - D U - U D U')), 'D-DU-UDU');
  assert.strictEqual(S.strumToString(S.parseStrumString('↓ ↓↑ ↑↓↑')), 'D-DU-UDU');
});

test('strums from UG-like JSON (several shapes)', () => {
  const a = S.extractStrumsFromJSON({ store: { page: { data: { tab_view: { strummings: [{ part: 'Verse', bpm: 92, denominator: 8, is_triplet: 0, values: ['D', '', 'D', 'U', '', 'U', 'D', 'U'] }] } } } } });
  assert.strictEqual(a[0].pat, 'D-DU-UDU'); assert.strictEqual(a[0].part, 'Verse'); assert.strictEqual(a[0].bpm, 92); assert.strictEqual(a[0].sub, 2);
  const b = S.extractStrumsFromJSON({ x: { strumming: [{ strumming: [{ type: 'D' }, { type: null }, { type: 'D' }, { type: 'U' }] }] } });
  assert.strictEqual(b[0].pat, 'D-DU');
  const c = S.extractStrumsFromJSON({ strummings: [{ pattern: 'D DU UDU', name: 'Chorus' }] });
  assert.strictEqual(c[0].pat, 'D-DU-UDU');
  assert.strictEqual(S.extractStrumsFromJSON({ strummings: [] }).length, 0);
});

test('strums from plain text', () => {
  const r = S.findStrumsInText('[Intro]\nStrumming pattern: D DU UDU\n\nAm F\nD D D D\n D  DU UDU ');
  assert.ok(r.length >= 1); assert.strictEqual(r[0].pat, 'D-DU-UDU'); assert.strictEqual(r[0].part, 'Intro');
});

test('strum for section', () => {
  const st = [{ part: 'Verse', pat: 'D-DU' }, { part: 'Chorus', pat: 'DDUDU' }];
  assert.strictEqual(S.strumForSection(st, 'Chorus 2').pat, 'DDUDU');
  assert.strictEqual(S.strumForSection(st, 'Bridge').pat, 'D-DU');
});

const TAB = `[Solo]
e|-----------------|-12-----12-10---|
B|-------------8-10|-----------------|
G|---7h9-7---------|-----------------|
D|-----------------|-----------------|
A|-----------------|-----------------|
E|-0---------------|-----------------|

[Outro]
e|--5--7--|
B|--------|
G|--------|
D|--------|
A|--------|
E|--------|`;
test('tab parsing', () => {
  assert.ok(S.isTabLine('e|---3---5---|')); assert.ok(!S.isTabLine('Hello world'));
  const { sections } = S.parseTabs(TAB);
  assert.strictEqual(sections.length, 2);
  const s = sections[0];
  assert.strictEqual(s.name, 'Solo'); assert.ok(S.isSoloName(s.name));
  const first = s.events[0]; assert.deepStrictEqual(first.notes.map(n => [n.s, n.fret]), [[5, 0]]);
  const hasTwelve = s.events.some(e => e.notes.some(n => n.s === 0 && n.fret === 12));
  assert.ok(hasTwelve, 'multi-digit fret kept');
  const h = s.events.find(e => e.notes.some(n => n.s === 2 && n.fret === 9));
  assert.strictEqual(h.notes[0].tech, 'h');
  assert.strictEqual(s.maxFret, 12);
  assert.ok(s.colsPerBeat >= 1 && s.colsPerBeat <= 8);
  for (let i = 1; i < s.events.length; i++) assert.ok(s.events[i].t >= s.events[i - 1].t);
});

const sine = (f, sr, n, harm = [1]) => { const b = new Float32Array(n); for (let i = 0; i < n; i++) { let v = 0; harm.forEach((a, h) => v += a * Math.sin(2 * Math.PI * f * (h + 1) * i / sr)); b[i] = v * 0.3; } return b; };
test('YIN finds guitar strings within 1 cent', () => {
  for (const sr of [44100, 48000]) for (const note of ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']) {
    const f = T.noteToFreq(note), r = P.yin(sine(f, sr, 4096, [0.6, 1, 0.5, 0.3]), sr);
    const cents = 1200 * Math.log2(r.freq / f);
    assert.ok(Math.abs(cents) < 1, `${note}@${sr}: ${cents}`); assert.ok(r.prob > 0.9);
  }
});
test('YIN handles strong 2nd harmonic without octave error', () => {
  const f = T.noteToFreq('E2'), r = P.yin(sine(f, 48000, 4096, [0.2, 1, 0.4]), 48000);
  assert.ok(Math.abs(1200 * Math.log2(r.freq / f)) < 2);
});
test('YIN rejects noise', () => {
  const b = new Float32Array(4096).map(() => (Math.random() - 0.5) * 0.4);
  const r = P.yin(b, 48000); assert.ok(r.freq < 0 || r.prob < 0.8);
});
test('nearest string', () => {
  const t = T.TUNINGS.standard.notes, r = T.nearestString(T.noteToFreq('A2') * Math.pow(2, 10 / 1200), t);
  assert.strictEqual(r.index, 1); assert.ok(Math.abs(r.cents - 10) < 0.01);
});

test('scales: spelling, key signatures, chords, positions', () => {
  const n = (r, t) => T.scaleNotes(r, t).join(' ');
  assert.strictEqual(n(0, 'major'), 'C D E F G A B');
  assert.strictEqual(n(7, 'major'), 'G A B C D E F#');
  assert.strictEqual(n(5, 'major'), 'F G A Bb C D E');
  assert.strictEqual(n(1, 'major'), 'Db Eb F Gb Ab Bb C');
  assert.strictEqual(n(6, 'major'), 'F# G# A# B C# D# E#');
  assert.strictEqual(n(9, 'minor'), 'A B C D E F G');
  assert.strictEqual(T.diatonicChords(0, 'major').map(c => c.name).join(' '), 'C Dm Em F G Am Bdim');
  assert.strictEqual(T.diatonicChords(0, 'major').map(c => c.roman).join(' '), 'I ii iii IV V vi vii°');
  for (let r = 0; r < 12; r++) {
    const o = T.scaleOnNeck(r, 'major');
    assert.strictEqual(o.positions.length, 7);
    o.positions.forEach(p => { assert.ok(p.length >= 16, `root ${r} len ${p.length}`); p.forEach(x => assert.ok(o.pcs.includes(x.pc))); });
  }
  const pent = T.scaleOnNeck(9, 'minpent'); assert.strictEqual(pent.positions.length, 5);
  assert.ok(pent.positions[0].every(x => x.fret >= 0));
});

test('strums: array of arrays as returned by the in-page extractor', () => {
  const r = S.extractStrumsFromJSON({ strum: [[{ part: 'Verse', bpm: 87, denominator: 8, values: ['D', '', 'D', 'U', '', 'U', 'D', 'U'] }, { part: 'Chorus', values: ['D', 'D', 'U', '', 'U', 'D', 'U', ''] }]] });
  assert.deepStrictEqual(r.map(x => [x.part, x.pat, x.bpm, x.sub]), [['Verse', 'D-DU-UDU', 87, 2], ['Chorus', 'DDU-UDU-', 0, 0]]);
});

/* ===================== phase 1 additions ===================== */
const C = require('../src/lib/chroma.js'); const Y = require('../src/lib/sync.js'); const Q = require('../src/lib/requests.js');

test('transposeText keeps alignment and flats/sharps sensible', () => {
  const t = 'Am        F\nSome lyric here\nC   G/B  D\nline';
  const up = S.transposeText(t, 2); // Bm G ...
  assert.strictEqual(up.split('\n')[0].trim().split(/\s+/).join(' '), 'Bm G');
  assert.strictEqual(up.split('\n')[2].trim().split(/\s+/).join(' '), 'D A/C# E');
  const down = S.transposeText('G   C   D', -2); // F Bb C
  assert.strictEqual(down.trim().split(/\s+/).join(' '), 'F A# C'.replace('A#', 'Bb').replace('F', 'F'));
  assert.strictEqual(S.transposeText('G   C   D', 0).trim().split(/\s+/).join(' '), 'G C D');
  const wide = S.transposeText('C         G', 1).split('\n')[0]; assert.ok(wide.indexOf('G#') === wide.indexOf('G#') && /Db\s+Ab/.test(wide) || /C#\s+G#/.test(wide));
});
test('ChordPro conversion', () => {
  const r = S.fromChordPro('{title: Test Song}\n{artist: Me}\n{start_of_chorus}\n[Am]Hello [G]world\n{end_of_chorus}\n# comment\nplain line');
  assert.strictEqual(r.title, 'Test Song'); assert.strictEqual(r.artist, 'Me');
  const lines = r.text.split('\n'); assert.strictEqual(lines[0], '[Chorus]'); assert.match(lines[1], /^Am\s+G$/); assert.strictEqual(lines[2], 'Hello world'); assert.strictEqual(lines[1].indexOf('G'), 6);
  assert.ok(S.looksLikeChordPro('[Am]Hello')); assert.ok(!S.looksLikeChordPro('[Chorus]\nAm F'));
});
test('stage lines pair chords with lyrics', () => {
  const sh = S.parseSheet('[Verse]\nAm   F\nHello world\nC    G\nsecond line\n[Outro]\nplain words');
  const L = S.stageLines(sh); assert.strictEqual(L.length, 3); assert.strictEqual(L[0].lyric, 'Hello world'); assert.deepStrictEqual(L[0].chords.map(c => c.pi), [0, 1]);
  assert.strictEqual(S.stageIndex(L, 2), 1); assert.strictEqual(L[2].chords.length, 0);
});
test('voicings, CAGED, triads, key, difficulty', () => {
  assert.ok(T.voicings('F').length >= 3); assert.ok(T.voicings('Gmaj7').every(v => v.frets.length === 6));
  const cg = T.caged(0); assert.deepStrictEqual(cg.map(c => c.shape), ['C', 'A', 'G', 'E', 'D']);
  cg.forEach(c => assert.ok(c.notes.some(n => n.root)));
  for (let r = 0; r < 12; r++) T.caged(r).forEach(c => c.notes.forEach(n => assert.ok(n.fret >= 0 && n.fret <= 17)));
  const tv = T.triadVoicings(0, 'maj', 2, 0); assert.ok(tv.length && tv[0].notes.map(n => n.deg).join() === 'R,3,5');
  assert.deepStrictEqual(T.guessKey(['G', 'C', 'D', 'Em']), { root: 7, type: 'major', score: T.guessKey(['G', 'C', 'D', 'Em']).score });
  assert.strictEqual(T.guessKey(['Am', 'F', 'C', 'G']).type, 'minor');
  assert.strictEqual(T.songDifficulty(['G', 'C', 'D', 'Em'], 90, 'D-DU-UDU').level, 1);
  assert.ok(T.songDifficulty(['F', 'Bm', 'Bb', 'C#m7', 'Gdim', 'Faug', 'Ebmaj7'], 140, 'DUDUDU').level >= 4);
  assert.strictEqual(T.canon('A#'), T.canon('Bb'));
});
test('merge libraries: newest wins, deletions stick, stats merge', () => {
  const a = { songs: [{ id: '1', title: 'old', added: 1, updated: 5 }, { id: '2', title: 'keep', added: 2 }], playlists: [{ id: 'p', name: 'A', songIds: ['1', '2'], updated: 3 }], deleted: { 3: 10 }, known: { C: 5 }, stats: { updated: 1, days: { '2026-01-01': { sec: 60, songs: ['1'] } } } };
  const b = { songs: [{ id: '1', title: 'new', added: 1, updated: 9 }, { id: '3', title: 'gone', added: 3, updated: 4 }, { id: '4', title: 'remote only', added: 4 }], playlists: [{ id: 'p', name: 'B', songIds: ['1', '9'], updated: 7 }], known: { C: -9, G: 2 }, stats: { updated: 2, days: { '2026-01-01': { sec: 90, songs: ['2'] } } } };
  const m = Y.mergeLibs(a, b);
  assert.deepStrictEqual(m.songs.map(s => s.id).sort(), ['1', '2', '4']); assert.strictEqual(m.songs.find(s => s.id === '1').title, 'new');
  assert.strictEqual(m.playlists[0].name, 'B'); assert.deepStrictEqual(m.playlists[0].songIds, ['1']);
  assert.strictEqual(m.known.C, -9); assert.strictEqual(m.known.G, 2);
  assert.strictEqual(m.stats.days['2026-01-01'].sec, 90); assert.deepStrictEqual(m.stats.days['2026-01-01'].songs.sort(), ['1', '2']);
});
test('twitch chat parsing + request matching', () => {
  const l = '@badges=;display-name=Viewer1;id=x :viewer1!viewer1@viewer1.tmi.twitch.tv PRIVMSG #chan :!request wonderwall oasis';
  const m = Q.parseIrc(l); assert.strictEqual(m.nick, 'Viewer1'); assert.strictEqual(Q.parseCommand(m.text), 'wonderwall oasis');
  assert.ok(Q.parseIrc('PING :tmi.twitch.tv').ping); assert.strictEqual(Q.parseCommand('hello there'), null); assert.strictEqual(Q.parseCommand('!request'), null);
  const songs = [{ title: 'Wonderwall', artist: 'Oasis' }, { title: 'Creep', artist: 'Radiohead' }];
  assert.strictEqual(Q.matchSong('wonderwall', songs).title, 'Wonderwall'); assert.strictEqual(Q.matchSong('stairway to heaven', songs), null);
});

// minimal FFT for the chord-detection test
function fftMag(x) { const n = x.length, re = Float64Array.from(x), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const u = i + k, v = i + k + len / 2, tr = re[v] * cr - im[v] * ci, ti = re[v] * ci + im[v] * cr; re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
  return Float64Array.from({ length: n / 2 }, (_, i) => Math.hypot(re[i], im[i])); }
function chordSpectrum(frets, sr = 48000, N = 16384) {
  const x = new Float64Array(N); frets.forEach((f, i) => { if (f < 0) return; const fr = T.midiToFreq(T.OPEN_MIDI[i] + f); for (let h = 1; h <= 6; h++) for (let t = 0; t < N; t++) x[t] += Math.sin(2 * Math.PI * fr * h * t / sr) / h; });
  for (let t = 0; t < N; t++) x[t] *= 0.5 - 0.5 * Math.cos(2 * Math.PI * t / N); return fftMag(x);
}
test('chord detection from synthetic guitar chords', () => {
  const shapes = { C: [-1, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3], Am: [-1, 0, 2, 2, 1, 0], Em: [0, 2, 2, 0, 0, 0], D: [-1, -1, 0, 2, 3, 2], F: [1, 3, 3, 2, 1, 1], E: [0, 2, 2, 1, 0, 0] };
  for (const [name, fr] of Object.entries(shapes)) {
    const ch = C.chromaFromMags(chordSpectrum(fr), 48000, 16384);
    assert.ok(C.matchChord(ch, name).ok, name + ' should match itself: ' + JSON.stringify(C.matchChord(ch, name)));
    for (const other of Object.keys(shapes)) if (other !== name) assert.ok(!C.matchChord(ch, other).ok, `${name} must not match ${other}: ` + JSON.stringify(C.matchChord(ch, other)));
  }
  assert.ok(C.chromaFromMags(new Float64Array(8192), 48000, 16384).every(v => v === 0));
});

test('Ultimate Guitar numeric strumming (measures) + tempo/subdivision', () => {
  const r = S.extractStrumsFromJSON({ strummings: [{ part: 'Verse', bpm: 87, denuminator: 8, is_triplet: 0, measures: [{ measure: 1 }, { measure: 101 }, { measure: 1 }, { measure: 2 }, { measure: 101 }, { measure: 2 }, { measure: 1 }, { measure: 2 }] }] });
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].pat, 'D-DU-UDU'); assert.strictEqual(r[0].bpm, 87); assert.strictEqual(r[0].sub, 2); assert.strictEqual(r[0].part, 'Verse');
});
test('capo / tuning / tempo / key written in the sheet text', () => {
  const m = S.findMetaInText('Wonderwall\nTuning: Standard (E A D G B E)\nCapo: 2nd fret\nTempo: 87\nKey: F#m\n\n[Intro]\nEm7 G');
  assert.deepStrictEqual(m, { tuning: 'Standard E A D G B E', capo: '2', bpm: 87, key: 'F#m' });
  assert.strictEqual(S.findMetaInText('no capo here').capo, '0');
});
test('tab techniques: bends keep one note, slides/hammer-ons link to their target', () => {
  const t = S.parseTabs('e|--7b9r7--5/7--7h9p7--3~--8b--|\nB|------------------------------|\nG|------------------------------|\nD|------------------------------|\nA|------------------------------|\nE|------------------------------|').sections[0];
  const n = t.events.map(e => e.notes[0]);
  assert.strictEqual(n.length, 8);
  assert.deepStrictEqual([n[0].fret, n[0].bend, n[0].release, n[0].tech], [7, 2, 7, 'b']);
  assert.deepStrictEqual(n[1].to, { fret: 7, tech: '/' }); assert.strictEqual(n[2].tech, '/');
  assert.deepStrictEqual(n[3].to, { fret: 9, tech: 'h' }); assert.deepStrictEqual(n[4].to, { fret: 7, tech: 'p' });
  assert.strictEqual(n[6].tech, '~'); assert.strictEqual(n[7].bend, 2);
});
test('pitch refinement keeps the YIN estimate and sharpens it on a noisy guitar-like tone', () => {
  const sr = 48000, f = 110.3, buf = new Float32Array(8192); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - .5;
  for (let i = 0; i < buf.length; i++) buf[i] = .3 * Math.sin(2 * Math.PI * f * i / sr) + .15 * Math.sin(2 * Math.PI * 2 * f * i / sr) + .08 * Math.sin(2 * Math.PI * 3 * f * i / sr) + .02 * rnd();
  const y = P.yin(buf, sr, { minF: 57, maxF: 1500, threshold: .13 }), fr = sr / P.refine(buf, sr / y.freq);
  assert.ok(Math.abs(1200 * Math.log2(fr / f)) < 1.5, 'refined within 1.5 cents: ' + fr);
  assert.ok(Math.abs(1200 * Math.log2(fr / f)) <= Math.abs(1200 * Math.log2(y.freq / f)) + .5);
});

const CA = require('../src/lib/chordsfromaudio.js');
test('chords from audio: synthetic progression comes back in order with the right key', () => {
  const sr = 22050, prog = ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'G'];
  const r = CA.analyze(CA.synth(prog, 1.5, sr), sr, { bpm: 80 });
  assert.deepStrictEqual(r.segments.map(s => s.chord), prog);
  assert.strictEqual(r.key && r.key.name, 'G');
  assert.ok(Math.abs(r.segments[1].t - 1.5) < 0.3, 'second chord starts near 1.5s: ' + r.segments[1].t);
  const sheet = CA.toSheet(r, 'Test'); assert.match(sheet, /^\[Test\]  \(key G\)\n0:00  G   D   Em   C\n0:0[56]  G   D   C   G$/);
});
test('chords from audio: silence gives nothing', () => { const r = CA.analyze(new Float32Array(22050 * 3), 22050); assert.deepStrictEqual(r.segments, []); assert.strictEqual(r.key, null); });
