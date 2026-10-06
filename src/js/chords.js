/* Chord library: every root x chord type, several voicings each, search, and a "chords I know" checklist. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory, $ = id => document.getElementById(id);
  const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const QUALS = [['', 'Major'], ['m', 'Minor'], ['7', '7'], ['m7', 'm7'], ['maj7', 'maj7'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['6', '6'], ['m6', 'm6'], ['add9', 'add9'], ['5', 'Power'], ['dim', 'dim'], ['aug', 'aug']];
  const st = { root: 'all', qual: 'all', q: '', known: false, sel: 'C', v: 0 };
  let D, host, built = false;
  const S = () => RCC.store;
  const all = (() => { const o = []; ROOTS.forEach(r => QUALS.forEach(([s]) => { const n = r + s; if (T.voicings(n).length) o.push(n); })); return o; })();

  function list() {
    const q = st.q.trim(), p = q ? T.parseChord(q) : null, ql = q.toLowerCase();
    let r = all.filter(n => {
      const c = T.parseChord(n); if (st.root !== 'all' && T.canon(c ? T.NOTES[c.root] : n) !== T.canon(st.root)) return false;
      if (st.qual !== 'all' && n.slice(ROOTS.find(x => n.startsWith(x) && (n[x.length] !== '#' && n[x.length] !== 'b')).length) !== st.qual) return false;
      if (st.known && !S().knows(n)) return false;
      if (q && !p && !n.toLowerCase().includes(ql)) return false; return true;
    });
    if (p) { const cn = T.canon(q); r = r.filter(n => T.canon(n) === cn || n.toLowerCase().startsWith(ql)); if (!r.length && T.voicings(q).length) r = [q]; }
    return r;
  }

  function mini(cv, name, v) {
    const dpr = window.devicePixelRatio || 1, W = 130, H = 150; cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext('2d'); c.setTransform(dpr * W / 260, 0, 0, dpr * H / 300, 0, 0);
    const vs = T.voicings(name); if (vs[v || 0]) RCC.fret.chordDiagram(c, 260, 300, vs[v || 0], D.accent());
  }

  function grid() {
    const l = list(), g = $('ch-grid'); const nKnown = S().knownCount();
    $('ch-count').textContent = `${l.length} chords · you know ${nKnown}`; $('ch-prog').style.width = Math.min(100, nKnown / 40 * 100) + '%';
    g.innerHTML = l.map(n => `<div class="ccard ${S().knows(n) ? 'known' : ''} ${st.sel === n ? 'sel' : ''}" data-n="${n}"><div class="kn" data-k="${n}" title="I know this chord">✓</div><canvas></canvas><b>${n}</b></div>`).join('') || '<div class="small" style="padding:20px">No chords match. Try a different filter.</div>';
    [...g.children].forEach(el => { if (!el.dataset.n) return; mini(el.querySelector('canvas'), el.dataset.n); el.onclick = e => { if (e.target.dataset.k) { S().setKnown(e.target.dataset.k, !S().knows(e.target.dataset.k)); return; } st.sel = el.dataset.n; st.v = 0; grid(); detail(); }; });
  }

  function detail() {
    const n = st.sel, vs = T.voicings(n), box = $('ch-detail'); if (!vs.length) { box.innerHTML = '<div class="small">Pick a chord.</div>'; return; }
    const p = T.parseChord(n), notes = (T.CHORD_TYPES.find(x => x[0] === p.quality) || [])[2];
    const spell = notes ? notes.map(i => T.NOTES[(p.root + i) % 12]).join(' – ') : '';
    const v = vs[Math.min(st.v, vs.length - 1)], known = S().knows(n), d = T.chordDifficulty(n);
    box.innerHTML = `<h3>${n}</h3><div class="small">${spell} · difficulty ${'●'.repeat(Math.round(d))}${'○'.repeat(5 - Math.round(d))}</div><canvas id="ch-big" width="260" height="300"></canvas>
     <div class="pos" style="margin:8px 0">${vs.map((x, i) => `<span class="chip ${i === st.v ? 'on' : ''}" data-i="${i}">${x.label}</span>`).join('')}</div>
     <div class="row"><button class="btn p" id="ch-play">▶ Hear it</button><button class="btn ${known ? 'danger' : ''}" id="ch-know">${known ? '✓ I know it' : 'Mark as known'}</button></div>
     <div class="row"><button class="btn sm" id="ch-use" title="Make this the current chord in Practice">Use in Practice</button></div>
     <div class="small" style="margin-top:8px">Frets (low E → high e): <b>${v.frets.map(f => f < 0 ? 'x' : f).join(' ')}</b></div>`;
    const cv = $('ch-big'), c = cv.getContext('2d'); RCC.fret.chordDiagram(c, 260, 300, v, D.accent());
    box.querySelectorAll('.chip').forEach(ch => ch.onclick = () => { st.v = +ch.dataset.i; detail(); });
    $('ch-play').onclick = () => { const A = RCC.audio; A.resume(); A.strum(A.chordMidis(v.frets), A.get().currentTime + .05, 'D', 1.8); };
    $('ch-know').onclick = () => S().setKnown(n, !known);
    $('ch-use').onclick = () => { if (D.useChord) D.useChord(n); };
  }

  function chips(host, arr, key, cur) { host.innerHTML = arr.map(([v, label]) => `<span class="chip ${cur === v ? 'on' : ''}" data-v="${v}">${label}</span>`).join(''); host.querySelectorAll('.chip').forEach(c => c.onclick = () => { st[key] = c.dataset.v; paint(); }); }
  function paint() { chips($('ch-roots'), [['all', 'All'], ...ROOTS.map(r => [r, r])], 'root', st.root); chips($('ch-quals'), [['all', 'All types'], ...QUALS.map(([s, l]) => [s, l])], 'qual', st.qual); grid(); detail(); }

  function build(el, deps) {
    D = deps; host = el;
    el.innerHTML = `<div class="ch-layout"><div><div class="card ch-tools"><div class="row" style="margin:0"><input id="ch-q" class="grow" placeholder="Search a chord: Am, F#m7, Dsus4…" autocomplete="off"><label class="tg"><span class="sw"><input type="checkbox" id="ch-known"><i></i></span>Only chords I know</label></div>
      <div class="ch-roots" id="ch-roots"></div><div class="ch-quals" id="ch-quals"></div>
      <div class="row" style="margin:0"><div class="meter grow"><i id="ch-prog"></i></div><span class="small" id="ch-count"></span></div></div><div id="ch-grid"></div></div>
      <div class="card ch-detail" id="ch-detail"></div></div>`;
    $('ch-q').oninput = e => { st.q = e.target.value; const p = T.parseChord(e.target.value.trim()); if (p && T.voicings(e.target.value.trim()).length) { st.sel = e.target.value.trim(); st.v = 0; } grid(); detail(); };
    $('ch-known').onchange = e => { st.known = e.target.checked; grid(); };
    S().on(() => { if (host.classList.contains('on')) { grid(); detail(); } });
    built = true; paint();
  }

  /** chord names from a list that the player hasn't ticked off yet */
  const unknown = names => [...new Set(names.map(T.canon))].filter(n => !S().knows(n));
  RCC.chords = { build, redraw: () => { if (built) paint(); }, unknown, all, select(n) { st.sel = n; st.v = 0; st.q = ''; st.root = 'all'; st.qual = 'all'; if (built) { $('ch-q').value = ''; paint(); } }, mini };
})();
