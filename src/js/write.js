/* Songwriter (Learn → Write): pick a key, build progressions from the chords that fit, hear them with the backing band,
   then open the song in Practice, save it to the library or export a backing WAV. Pro for play / save / export. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAMES = r => (T.FLAT_NAMES && [1, 3, 5, 8, 10].includes(r) ? T.FLAT_NAMES[r] : T.NOTES[r]);
  const TEMPLATES = [
    ['Pop anthem', 'I V vi IV'], ['Sad pop', 'vi IV I V'], ['Three-chord', 'I IV V V'], ['50s / doo-wop', 'I vi IV V'], ['Jazz turnaround', 'ii V I I'],
    ['Folk', 'I IV I V'], ['Andalusian', 'i VII VI V'], ['Minor rock', 'i VI III VII'], ['Blues (12 bars)', 'I I I I IV IV I I V IV I V'], ['Canon', 'I V vi iii IV I IV V'],
  ];
  const NEXT = { 0: [3, 4, 5, 1], 1: [4, 3, 0], 2: [5, 3, 1], 3: [4, 0, 1, 5], 4: [0, 5, 3], 5: [3, 4, 1, 0], 6: [0, 5] }; // what usually follows each degree
  const st = { root: 7, type: 'major', bpm: 100, style: 'pop', secs: [{ name: 'Verse', prog: [] }, { name: 'Chorus', prog: [] }], cur: 0, playing: false };
  let D = null;
  const dia = () => T.diatonicChords(st.root, st.type);
  const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  function degreeOf(sym) { const m = /^([ivIV]+)/.exec(sym); if (!m) return -1; return ROM.indexOf(m[1].toUpperCase()); }
  function fromTemplate(tpl) { const ch = dia(); return tpl.split(/\s+/).map(s => { const d = degreeOf(s); return d >= 0 && ch[d] ? ch[d].name : s; }); }
  function sec() { return st.secs[st.cur]; }
  function sheet() { return st.secs.filter(s => s.prog.length).map(s => `[${s.name}]\n` + s.prog.map((c, i) => c + (i % 4 === 3 ? '\n' : '   ')).join('').trim()).join('\n\n'); }
  function prog() { return st.secs.flatMap(s => s.prog.map(c => ({ c, sec: s.name }))); }
  function capoHint() {
    const used = [...new Set(st.secs.flatMap(s => s.prog))]; if (!used.length) return '';
    const hard = used.reduce((a, c) => a + T.chordDifficulty(c), 0) / used.length; if (hard < 2) return '';
    let best = null; for (let capo = 1; capo <= 7; capo++) { const moved = used.map(c => T.transposeChord ? T.transposeChord(c, -capo) : null); if (moved.some(x => !x)) break; const d = moved.reduce((a, c) => a + T.chordDifficulty(c), 0) / moved.length; if (!best || d < best.d) best = { capo, d, shapes: moved }; }
    return best && best.d < hard - .8 ? `Easier with a capo on ${best.capo}: play ${best.shapes.join(' ')}` : '';
  }
  function render() {
    const el = $('ln-write'); if (!el) return; const ch = dia(), s = sec(), pro = !RCC.pro || RCC.pro.has();
    el.innerHTML = `<div class="card ln-card"><div class="row" style="margin:0;gap:10px;flex-wrap:wrap"><label class="l">Key</label><select id="wr-root">${T.NOTES.map((n, i) => `<option value="${i}" ${i === st.root ? 'selected' : ''}>${NAMES(i)}</option>`).join('')}</select><div class="seg sm" id="wr-type"><button data-v="major" class="${st.type === 'major' ? 'on' : ''}">Major</button><button data-v="minor" class="${st.type === 'minor' ? 'on' : ''}">Minor</button></div>
        <label class="l">Tempo</label><input type="number" id="wr-bpm" min="40" max="220" value="${st.bpm}" style="width:70px"><label class="l">Feel</label><select id="wr-style">${Object.entries(RCC.backing.STYLES).map(([k, v]) => `<option value="${k}" ${k === st.style ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      <div class="small" style="margin:10px 0 6px">Chords in ${NAMES(st.root)} ${st.type}. Tap to add to the ${esc(s.name)}; the glowing ones usually come next.</div>
      <div class="chain" id="wr-chords">${ch.map((c, i) => `<span class="chip wr-chip ${s.prog.length && (NEXT[degreeOf(ch[degreeIdx(s.prog[s.prog.length - 1])] ? ch[degreeIdx(s.prog[s.prog.length - 1])].roman : '')] || []).includes(i) ? 'next' : ''}" data-c="${esc(c.name)}"><b>${esc(c.name)}</b><small>${esc(c.roman)}</small></span>`).join('')}</div>
      <div class="small" style="margin:12px 0 6px">Start from a shape:</div><div class="chain">${TEMPLATES.map(([n, t], i) => `<span class="chip" data-t="${i}" title="${esc(t)}">${esc(n)}</span>`).join('')}</div></div>
      <div class="card ln-card"><div class="row" style="margin:0;justify-content:space-between;flex-wrap:wrap;gap:8px"><div class="seg sm" id="wr-secs">${st.secs.map((x, i) => `<button data-s="${i}" class="${i === st.cur ? 'on' : ''}">${esc(x.name)} <i>${x.prog.length}</i></button>`).join('')}<button data-s="add">+</button></div><div class="row" style="margin:0;gap:6px"><button class="btn sm" id="wr-undo" ${s.prog.length ? '' : 'disabled'}>Undo</button><button class="btn sm" id="wr-clear" ${s.prog.length ? '' : 'disabled'}>Clear</button><button class="btn sm" id="wr-suggest">Suggest next</button></div></div>
        <div class="wr-bars" id="wr-bars">${s.prog.map((c, i) => `<span class="wr-bar" data-i="${i}" title="Click to remove"><b>${esc(c)}</b><small>${i + 1}</small></span>`).join('') || '<span class="small">Empty. Tap chords above or pick a shape.</span>'}</div>
        ${capoHint() ? `<div class="hint" style="margin-top:10px">${esc(capoHint())}</div>` : ''}
        <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn p" id="wr-play" ${prog().length ? '' : 'disabled'}>${st.playing ? '■ Stop' : '▶ Hear it'}</button><button class="btn" id="wr-open" ${prog().length ? '' : 'disabled'}>Open in Practice</button><button class="btn" id="wr-save" ${prog().length ? '' : 'disabled'}>Save to library</button><button class="btn" id="wr-wav" ${prog().length ? '' : 'disabled'}>Export backing WAV</button>${pro ? '' : '<span class="pro-tag">PRO</span>'}</div>
        <pre class="tc-sheet" style="margin-top:12px">${esc(sheet()) || ''}</pre></div>`;
    $('wr-root').onchange = e => { const old = st.root; st.root = +e.target.value; shiftAll(st.root - old); render(); }; $('wr-type').querySelectorAll('button').forEach(b => b.onclick = () => { st.type = b.dataset.v; st.secs.forEach(x => x.prog = []); render(); });
    $('wr-bpm').onchange = e => { st.bpm = Math.max(40, Math.min(220, +e.target.value || 100)); }; $('wr-style').onchange = e => { st.style = e.target.value; };
    el.querySelectorAll('.wr-chip').forEach(c => c.onclick = () => { sec().prog.push(c.dataset.c); play1(c.dataset.c); render(); });
    el.querySelectorAll('[data-t]').forEach(c => c.onclick = () => { sec().prog = fromTemplate(TEMPLATES[+c.dataset.t][1]); render(); });
    $('wr-secs').querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.s === 'add') { const names = ['Verse', 'Chorus', 'Bridge', 'Intro', 'Outro', 'Pre-chorus']; st.secs.push({ name: names[st.secs.length] || 'Part ' + (st.secs.length + 1), prog: [] }); st.cur = st.secs.length - 1; } else st.cur = +b.dataset.s; render(); });
    $('wr-undo').onclick = () => { sec().prog.pop(); render(); }; $('wr-clear').onclick = () => { sec().prog = []; render(); };
    $('wr-suggest').onclick = () => { const ch = dia(), last = sec().prog[sec().prog.length - 1], from = last ? degreeIdx(last) : -1, opts = from >= 0 ? NEXT[from] : [0, 5, 3]; const pick = ch[opts[Math.floor(Math.random() * opts.length)]]; if (pick) { sec().prog.push(pick.name); play1(pick.name); render(); } };
    el.querySelectorAll('.wr-bar').forEach(b => b.onclick = () => { sec().prog.splice(+b.dataset.i, 1); render(); });
    $('wr-play').onclick = () => { if (st.playing) { stop(); render(); return; } if (RCC.pro && !RCC.pro.gate('write')) return; hear(); };
    $('wr-open').onclick = () => { if (RCC.pro && !RCC.pro.gate('write')) return; D.jam(sheet(), 'New song in ' + NAMES(st.root) + ' ' + st.type, { bpm: st.bpm, style: st.style }); };
    $('wr-save').onclick = () => { if (RCC.pro && !RCC.pro.gate('write')) return; const S = RCC.store; if (!RCC.pro.canAddSong(S.lib.songs.length)) { RCC.pro.upsell('library'); return; } const s = S.addSong({ title: 'New song in ' + NAMES(st.root) + ' ' + st.type, artist: 'Songwriter', text: sheet(), bpm: st.bpm, strums: [], pat: '', genre: '', meta: { key: NAMES(st.root) + (st.type === 'minor' ? 'm' : '') } }); D.toast('Saved “' + s.title + '”'); };
    $('wr-wav').onclick = async () => { if (RCC.pro && !RCC.pro.gate('write')) return; const b = $('wr-wav'); b.disabled = true; b.textContent = 'Rendering…'; try { const blob = await RCC.backing.renderWav({ prog: prog(), bpm: st.bpm, beats: 4, sub: 2, style: st.style, comp: true, pat: 'D-DU-UDU', vol: .8, countIn: 1 }); const name = 'New song in ' + NAMES(st.root) + ' ' + st.type + ' (backing).wav'; if (RCC.record && RCC.record.exportFile) await RCC.record.exportFile(blob, name); else { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.click(); } D.toast('Backing track saved'); } catch (e) { D.toast('Could not render: ' + (e.message || e)); } render(); };
  }
  function degreeIdx(name) { const ch = dia(), c = T.canon(name); return ch.findIndex(x => T.canon(x.name) === c); }
  function shiftAll(semis) { if (!T.transposeChord) return; st.secs.forEach(s => s.prog = s.prog.map(c => T.transposeChord(c, semis) || c)); }
  function play1(name) { const A = RCC.audio, v = T.voicings(name)[0]; A.resume(); if (v) A.strum(A.chordMidis(v.frets), A.get().currentTime + .03, 'D', 1.2, .22); }
  let stopAt = 0, timer = 0;
  function hear() {
    const A = RCC.audio, c = A.get(); A.resume(); const p = prog(), spb = 60 / st.bpm, sub = 2, per = 4 * sub, t0 = c.currentTime + .1;
    p.forEach((x, bar) => { for (let s = 0; s < per; s++) RCC.backing.step({ t: t0 + (bar * per + s) * spb / sub, s, sub, beats: 4, bpm: st.bpm, chord: x.c, nextChord: p[bar + 1] ? p[bar + 1].c : '', style: st.style, vol: .8, comp: true, patChar: 'D-DU-UDU'[s % 8], first: bar === 0, fillBar: !!(p[bar + 1] && p[bar + 1].sec !== x.sec) }); });
    st.playing = true; stopAt = t0 + p.length * 4 * spb; clearTimeout(timer); timer = setTimeout(() => { st.playing = false; render(); }, (stopAt - c.currentTime) * 1000 + 300); render();
  }
  function stop() { // scheduled oscillators can't be cancelled, so mute the master for the rest of the pass
    const A = RCC.audio, c = A.get(), g = A.master.gain, left = Math.max(0, stopAt - c.currentTime); g.setValueAtTime(0, c.currentTime); g.setValueAtTime(1, c.currentTime + left + .1); st.playing = false; clearTimeout(timer);
  }
  RCC.write = { init: deps => { D = deps; }, redraw: render, state: st };
})();
