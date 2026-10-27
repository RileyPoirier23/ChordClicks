/* Song practice plan (Pro): looks at the loaded song, what you already know and your chord-change bests, and builds a short
   routine — tune up, drill the hardest change, loop the hardest section with the tempo ramp, then play it through. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => n >= 60 ? Math.round(n / 60) + ' min' : n + ' s';
  /** Pure: what to practise for a song. */
  function build(song, prog, { knows = () => false, changes = {} } = {}) {
    const names = prog.map(p => p.c), uniq = [...new Set(names.map(T.canon))];
    const unknown = uniq.filter(c => !knows(c)).sort((a, b) => T.chordDifficulty(b) - T.chordDifficulty(a));
    // chord changes that actually occur, weighted by how often and how hard
    const pairs = new Map();
    for (let i = 1; i < names.length; i++) { const a = T.canon(names[i - 1]), b = T.canon(names[i]); if (a === b) continue; const k = [a, b].sort().join('|'); const p = pairs.get(k) || { a, b, n: 0 }; p.n++; pairs.set(k, p); }
    const scored = [...pairs.values()].map(p => { const best = (changes[[p.a, p.b].sort().join('|')] || {}).best || 0; const hard = (T.chordDifficulty(p.a) + T.chordDifficulty(p.b)) / 2 + (knows(p.a) && knows(p.b) ? 0 : 1); return { ...p, best, score: hard * Math.log2(p.n + 1) * (best >= 30 ? .4 : best >= 20 ? .7 : 1) }; }).sort((a, b) => b.score - a.score);
    // hardest section: most distinct / hard chords per chord
    const secs = new Map(); prog.forEach(p => { const s = p.sec || 'Song'; const o = secs.get(s) || { name: s, n: 0, d: 0, set: new Set() }; o.n++; o.d += T.chordDifficulty(p.c); o.set.add(T.canon(p.c)); secs.set(s, o); });
    const section = [...secs.values()].map(s => ({ name: s.name, n: s.n, score: s.d / s.n + s.set.size * .15 })).sort((a, b) => b.score - a.score)[0];
    const diff = T.songDifficulty(names, song.bpm || 90, song.pat || '');
    const steps = [{ kind: 'tune', title: 'Tune up', sec: 60, why: 'Sixty seconds that make everything after it sound right.' }];
    unknown.slice(0, 2).forEach(c => steps.push({ kind: 'chord', chord: c, title: 'Learn ' + c, sec: 120, why: 'New for you' + (T.chordDifficulty(c) >= 3 ? ' and it’s a barre/stretch shape — go slow, press, release, repeat.' : '. Place it, strum, lift, place again.') }));
    scored.slice(0, 2).forEach(p => steps.push({ kind: 'change', a: p.a, b: p.b, title: `${p.a} ⇄ ${p.b} changes`, sec: 60, why: p.best ? `Your best is ${p.best}/min — ${p.best >= 30 ? 'keep it sharp' : 'aim for 30'}. It happens ${p.n}× in the song.` : `Never drilled. It happens ${p.n}× in the song.` }));
    if (section && secs.size > 1) steps.push({ kind: 'loop', section: section.name, title: 'Loop the ' + section.name, sec: 240, why: 'The busiest part. Start at 70% and let the ramp bring it up to speed.' });
    steps.push({ kind: 'play', title: 'Play it through', sec: 180, why: 'Full speed, no stopping. Mistakes are fine — keep the beat.' });
    return { steps, unknown, pairs: scored, section: section && secs.size > 1 ? section.name : null, difficulty: diff, total: steps.reduce((a, s) => a + s.sec, 0) };
  }
  function open() {
    const a = RCC.app, S = RCC.store, song = a.song, prog = a.prog;
    if (!song || !prog.length) { a.toast('Load a song with chords first'); return; }
    if (RCC.pro && !RCC.pro.gate('trainer')) return;
    const plan = build(song, prog, { knows: c => S.knows(c), changes: (S.lib.stats || {}).changes || {} });
    const icon = { tune: '🎚', chord: '✋', change: '⇄', loop: '🔁', play: '▶' };
    a.dialog(`<h2>Practice plan · ${esc(song.title || 'this song')}</h2><div class="small">${esc(plan.difficulty.label)}${plan.difficulty.reasons.length ? ' · ' + esc(plan.difficulty.reasons.join(', ')) : ''} · about ${fmt(plan.total)}${plan.unknown.length ? ` · ${plan.unknown.length} chord${plan.unknown.length > 1 ? 's' : ''} you haven’t marked as known` : ' · you know every chord in it'}</div>
      <ol class="plan">${plan.steps.map((s, i) => `<li><span class="pl-ic">${icon[s.kind]}</span><div class="grow"><b>${esc(s.title)}</b> <span class="small">${fmt(s.sec)}</span><div class="small">${esc(s.why)}</div></div><button class="btn sm" data-i="${i}">Go</button></li>`).join('')}</ol>
      <div class="row" style="justify-content:space-between;margin-top:12px"><span class="small">Tick chords as known in Learn → Chord library and the plan gets shorter.</span><button class="btn ghost" id="pl-x">Close</button></div>`, () => {
      $('pl-x').onclick = a.closeDlg;
      $('dlg').querySelectorAll('[data-i]').forEach(b => b.onclick = () => run(plan.steps[+b.dataset.i]));
    });
    $('dlg').classList.add('wide');
  }
  function run(s) {
    const a = RCC.app; a.closeDlg();
    if (s.kind === 'tune') { a.show('tuner'); $('tonbtn').click(); }
    else if (s.kind === 'chord') { a.show('learn'); RCC.learn.openChord(s.chord); }
    else if (s.kind === 'change') { a.show('learn'); RCC.learn.changes(s.a, s.b); }
    else if (s.kind === 'loop') { a.show('practice'); const sel = $('loopsel'); sel.value = 'sec:' + s.section; sel.dispatchEvent(new Event('change')); if (!$('ramp').checked) { $('ramp').checked = true; $('ramp').dispatchEvent(new Event('change')); } $('rampstart').value = 70; $('rampstart').dispatchEvent(new Event('input')); a.toast('Looping ' + s.section + ' from 70% — press Start'); }
    else if (s.kind === 'play') { a.show('practice'); const sel = $('loopsel'); sel.value = 'off'; sel.dispatchEvent(new Event('change')); if ($('ramp').checked) { $('ramp').checked = false; $('ramp').dispatchEvent(new Event('change')); } if (!a.running) a.toggle(); }
  }
  RCC.plan = { build, open };
})();
