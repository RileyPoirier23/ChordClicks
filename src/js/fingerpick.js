/* Learn → Fingerpicking: right-hand patterns (p i m a) on any chord, with a step grid, playback,
   and a one-click hand-off to Solo mode so the app listens and scores you. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory, $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FINGER = { p: ['p', 'thumb', '#fbbf24'], i: ['i', 'index', '#38bdf8'], m: ['m', 'middle', '#34d399'], a: ['a', 'ring', '#f472b6'] };
  const CHORDS = ['C', 'G', 'Am', 'Em', 'D', 'F', 'Dm', 'E', 'A', 'Cadd9', 'G/B'];
  // steps: one entry per slot; strings are numbered like a tab (6 = low E … 1 = high e). sub = slots per beat.
  const PATTERNS = [
    { id: 'thumb', name: 'Thumb walk', lv: 1, beats: 4, sub: 1, desc: 'Thumb only, alternating between the two lowest strings of the chord. This is the engine of almost every pattern below — make it steady before adding fingers.', steps: [[6, 'p'], [4, 'p'], [5, 'p'], [4, 'p']] },
    { id: 'pima', name: 'Basic arpeggio (p i m a)', lv: 1, beats: 4, sub: 2, desc: 'Thumb on the bass, then index, middle and ring on the top three strings. Keep each finger on its own string: i = G, m = B, a = high e.', steps: [[6, 'p'], [3, 'i'], [2, 'm'], [1, 'a'], [6, 'p'], [3, 'i'], [2, 'm'], [1, 'a']] },
    { id: 'pimami', name: 'Up and down (p i m a m i)', lv: 1, beats: 3, sub: 2, desc: 'A waltz-feel roll: up the strings and back down. Great for 3/4 songs and for getting m and i to trade off smoothly.', steps: [[6, 'p'], [3, 'i'], [2, 'm'], [1, 'a'], [2, 'm'], [3, 'i']] },
    { id: 'travis', name: 'Travis picking', lv: 2, beats: 4, sub: 2, desc: 'The country / folk workhorse. The thumb alternates bass notes on every beat (steady as a metronome) while the fingers pick melody notes between them. Say “boom-chick” with the thumb.', steps: [[6, 'p'], [2, 'm'], [4, 'p'], [3, 'i'], [6, 'p'], [2, 'm'], [4, 'p'], [1, 'a']] },
    { id: 'pinch', name: 'Pinch and roll', lv: 2, beats: 4, sub: 2, desc: 'Thumb and ring pluck together on beat 1 (a “pinch”), then the fingers roll. Common in ballads — Landslide, Fast Car and friends live here.', steps: [[[6, 1], 'p,a'], [3, 'i'], [2, 'm'], [1, 'a'], [[5, 1], 'p,a'], [3, 'i'], [2, 'm'], [3, 'i']] },
    { id: 'dust', name: 'Dust-in-the-Wind roll', lv: 2, beats: 4, sub: 2, desc: 'Travis bass with a 3-2-1 melody roll on top: 6 3 2 3 1 3 2 3. The thumb never stops.', steps: [[6, 'p'], [3, 'i'], [2, 'm'], [3, 'i'], [1, 'a'], [3, 'i'], [2, 'm'], [3, 'i']] },
    { id: 'forward', name: 'Forward roll (banjo style)', lv: 2, beats: 4, sub: 2, desc: 'A rolling 3-2-1 that crosses the beat: 3 2 1 3 2 1 3 2. It sounds faster than it is because the accent keeps shifting.', steps: [[3, 'i'], [2, 'm'], [1, 'a'], [3, 'i'], [2, 'm'], [1, 'a'], [3, 'i'], [2, 'm']] },
    { id: 'triplet', name: 'Triplet arpeggio', lv: 3, beats: 4, sub: 3, desc: 'Three notes per beat: p i m, p i m. Count “1-trip-let 2-trip-let”. Classical pieces and 6/8 ballads use this feel constantly.', steps: [[6, 'p'], [3, 'i'], [2, 'm'], [4, 'p'], [3, 'i'], [2, 'm'], [5, 'p'], [3, 'i'], [2, 'm'], [4, 'p'], [3, 'i'], [1, 'a']] },
    { id: 'tremolo', name: 'Tremolo (p a m i)', lv: 3, beats: 4, sub: 4, desc: 'Thumb plays a bass note, then a-m-i repeat the same high string as fast and even as you can. Start painfully slow; evenness beats speed.', steps: [[6, 'p'], [1, 'a'], [1, 'm'], [1, 'i'], [5, 'p'], [1, 'a'], [1, 'm'], [1, 'i'], [4, 'p'], [1, 'a'], [1, 'm'], [1, 'i'], [5, 'p'], [1, 'a'], [1, 'm'], [1, 'i']] },
  ];
  const TIPS = [
    ['Which finger plays what', 'Thumb (p) covers the three bass strings E, A, D. Index (i) plays G, middle (m) plays B, ring (a) plays high e. Pinky rests.'],
    ['Plant, then play', 'Rest the fingertips lightly on their strings before a pattern starts. Pluck, then come back to the same spot: the hand barely moves.'],
    ['Thumb is the metronome', 'In nearly every pattern the thumb lands on the beat. If something falls apart, slow down until the thumb is boring again.'],
    ['Pluck toward your palm', 'Fingers pull slightly in and up (free stroke); the thumb pushes down and away. Both should clear the neighbouring string.'],
    ['Go slow, stay even', 'Use the speed slider at 50–60% and the click. Speed comes from even notes, not effort. Raise it 5% only when a pass is clean.'],
    ['Then put it under a song', 'Any chord sheet in Practice works: pick a pattern here, then play it over the chord that is on screen instead of strumming.'],
  ];
  const st = { pat: 'pima', chord: 'C', speed: 70, slot: -1 };
  let D, timer = null, playing = false, built = false;
  const S = () => RCC.store, A = () => RCC.audio;
  const pattern = () => PATTERNS.find(p => p.id === st.pat) || PATTERNS[0];
  const strs = s => (Array.isArray(s) ? s : [s]);
  /** frets[0] = low E … frets[5] = high e for the chosen chord (muted bass strings fall back to the next string). */
  function shape() { const sh = T.chordShape(st.chord) || T.chordShape('C'); return sh.frets; }
  function fretFor(string) { const f = shape(); let i = 6 - string; while (i < 5 && f[i] < 0) i++; while (i > 0 && f[i] < 0) i--; return { idx: i, fret: Math.max(0, f[i]) }; }
  const midiOf = string => { const { idx, fret } = fretFor(string); return T.OPEN_MIDI[idx] + fret; };

  function tabText() {
    const p = pattern(), rows = Array.from({ length: 6 }, () => []), cols = p.steps.length * 2;
    for (let bar = 0; bar < 2; bar++) {
      p.steps.forEach(step => { const hit = {}; strs(step[0]).forEach(s => { const { idx, fret } = fretFor(s); hit[5 - idx] = String(fret); }); for (let r = 0; r < 6; r++) { const v = hit[r] || '-'; rows[r].push(v.length > 1 ? v : v + '-'); } });
      rows.forEach(r => r.push('|'));
    }
    const names = ['e', 'B', 'G', 'D', 'A', 'E'];
    return `[${p.name} on ${st.chord}]\n` + rows.map((r, i) => names[i] + '|' + r.join('')).join('\n') + '\n';
  }

  /* ---------- playback ---------- */
  function play() {
    if (playing) { stop(); return; }
    const a = A(), c = a.get(); a.resume(); playing = true; $('fp-play').textContent = '■ Stop';
    const p = pattern(), bpm = (D.bpm ? D.bpm() : 90) * st.speed / 100, slotSec = 60 / bpm / p.sub; let i = 0, t = c.currentTime + .08;
    const tickOne = () => {
      if (!playing) return; const now = c.currentTime;
      while (t < now + .25) {
        const step = p.steps[i % p.steps.length], when = t, slot = i % p.steps.length;
        strs(step[0]).forEach(s => a.pluck(midiOf(s), when, 1.1, .42));
        if (slot % p.sub === 0 && $('fp-click').checked) a.click(when, slot === 0, false, .45);
        setTimeout(() => { if (playing) { st.slot = slot; paintGrid(); } }, Math.max(0, (when - c.currentTime) * 1000));
        t += slotSec; i++;
      }
      timer = setTimeout(tickOne, 60);
    };
    tickOne();
  }
  function stop() { playing = false; clearTimeout(timer); st.slot = -1; const b = $('fp-play'); if (b) b.textContent = '▶ Hear it'; paintGrid(); }

  /* ---------- UI ---------- */
  function paintGrid() {
    const g = $('fp-grid'); if (!g) return; const p = pattern();
    const rows = [6, 5, 4, 3, 2, 1].map(s => `<div class="fp-row"><b>${['E', 'A', 'D', 'G', 'B', 'e'][6 - s]}</b>${p.steps.map((step, i) => { const on = strs(step[0]).includes(s), f = on ? step[1].split(',')[strs(step[0]).indexOf(s)] || step[1].split(',')[0] : ''; return `<i class="${on ? 'on' : ''} ${i === st.slot ? 'now' : ''} ${i % p.sub === 0 ? 'beat' : ''}" style="${on ? '--fc:' + FINGER[f][2] : ''}">${on ? f : ''}</i>`; }).join('')}</div>`).join('');
    const counts = `<div class="fp-row cnt"><b></b>${p.steps.map((_, i) => `<i class="${i === st.slot ? 'now' : ''}">${i % p.sub === 0 ? (i / p.sub + 1) : p.sub === 2 ? '&amp;' : p.sub === 3 ? ['', 'trip', 'let'][i % 3] : ['', 'e', '&amp;', 'a'][i % 4]}</i>`).join('')}</div>`;
    g.innerHTML = rows + counts;
    const now = st.slot >= 0 ? p.steps[st.slot] : null; $('fp-now').innerHTML = now ? now[1].split(',').map(f => `<span style="color:${FINGER[f][2]}">${f}</span>`).join(' + ') + ` <small>${now[1].split(',').map(f => FINGER[f][1]).join(' + ')} · string ${strs(now[0]).join(' + ')}</small>` : '<small>press ▶ Hear it</small>';
  }
  function render() {
    const el = $('ln-finger'); if (!el) return; const p = pattern(), done = (S().lib.stats.finger || {});
    el.innerHTML = `<div class="ln-card card"><div class="row" style="margin:0"><b style="font-size:17px">Fingerpicking</b><span class="small">Right-hand patterns you can put under any chord. p = thumb, i = index, m = middle, a = ring.</span></div>
      <div class="fp-tips">${TIPS.map(([h, t]) => `<div class="fp-tip"><b>${h}</b><span>${t}</span></div>`).join('')}</div></div>
     <div class="fp-layout">
      <div class="card ln-card"><h4>Patterns</h4><div class="fp-list">${PATTERNS.map(x => `<div class="lesson-card ${x.id === st.pat ? 'sel' : ''} ${done[x.id] ? 'done' : ''}" data-p="${x.id}"><b>${esc(x.name)}</b> ${done[x.id] ? '✓' : ''}<div class="small">Level ${x.lv} · ${x.beats}/4${x.sub === 3 ? ' triplets' : x.sub === 4 ? ' 16ths' : x.sub === 2 ? ' 8ths' : ''}</div></div>`).join('')}</div></div>
      <div class="card ln-card"><div class="row" style="margin:0 0 4px"><h3 style="margin:0;font-size:20px">${esc(p.name)}</h3><span class="tag">Level ${p.lv}</span></div><p class="small" style="line-height:1.55;margin:4px 0 10px">${esc(p.desc)}</p>
       <div class="row"><label class="l">Chord</label><div class="chain" id="fp-chords">${CHORDS.map(c => `<span class="chip ${c === st.chord ? 'on' : ''}" data-c="${c}">${c}</span>`).join('')}</div></div>
       <div id="fp-grid" class="fp-grid"></div>
       <div class="fp-now" id="fp-now"></div>
       <div class="row"><button class="btn p" id="fp-play">▶ Hear it</button><label class="tg">Speed <input type="range" id="fp-speed" min="40" max="120" value="${st.speed}" style="width:120px"><b id="fp-speed-v" style="min-width:40px;color:var(--fg)">${st.speed}%</b></label><label class="tg"><span class="sw"><input type="checkbox" id="fp-click" checked><i></i></span>Click</label></div>
       <div class="row"><button class="btn" id="fp-solo" title="Opens the pattern as a tab in Solo so the app can listen and score you">🎯 Play it on guitar (Solo)</button><button class="btn" id="fp-prac" title="Load the chord in Practice and keep the pattern on screen">Use in Practice</button><button class="btn" id="fp-done">${done[p.id] ? '✓ Learned' : 'Mark as learned'}</button></div>
       <div class="small">Fingers: <span style="color:${FINGER.p[2]}">p</span> thumb · <span style="color:${FINGER.i[2]}">i</span> index · <span style="color:${FINGER.m[2]}">m</span> middle · <span style="color:${FINGER.a[2]}">a</span> ring. Slots step through the bar left to right; two fingers in one slot pluck together.</div>
      </div></div>`;
    el.querySelectorAll('[data-p]').forEach((c, i) => { if (i >= 3 && RCC.pro) RCC.pro.mark(c, 'finger'); c.onclick = () => { if (i >= 3 && RCC.pro && !RCC.pro.gate('finger')) return; stop(); st.pat = c.dataset.p; render(); }; });
    $('fp-chords').querySelectorAll('.chip').forEach(c => c.onclick = () => { st.chord = c.dataset.c; $('fp-chords').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); paintGrid(); });
    $('fp-play').onclick = play; $('fp-speed').oninput = e => { st.speed = +e.target.value; $('fp-speed-v').textContent = st.speed + '%'; if (playing) { stop(); play(); } };
    $('fp-solo').onclick = () => { stop(); if (D.drill) D.drill(tabText(), p.name + ' on ' + st.chord); };
    $('fp-prac').onclick = () => { stop(); if (D.jam) D.jam('[' + p.name + ']\n' + st.chord + '\n' + tabText().split('\n').slice(1).join('\n'), p.name + ' · ' + st.chord); };
    $('fp-done').onclick = () => { const s = S().lib.stats; s.finger = s.finger || {}; s.finger[p.id] = Date.now(); s.updated = Date.now(); S().save(); if (D.track) D.track({ drill: 'fingerpick' }); D.toast('Pattern learned ✓'); render(); };
    paintGrid();
  }
  RCC.fingerpick = { init: deps => { D = deps; }, redraw: () => { if (!built) built = true; render(); }, stop, PATTERNS, tabText, select: id => { if (PATTERNS.some(p => p.id === id)) { stop(); st.pat = id; built = true; render(); } } };
})();
