/* Scale Lab: scales, arpeggios, triads and the CAGED system across the neck, with a circle-of-fifths picker. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory, $ = id => document.getElementById(id);
  const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];           // C G D A E B F# Db Ab Eb Bb F
  const KEYNAME = r => ({ 1: 'Db', 3: 'Eb', 5: 'F', 6: 'F#', 8: 'Ab', 10: 'Bb' }[r] || T.NOTES[r]);
  const PROGS = {
    'I – V – vi – IV (pop)': [0, 4, 5, 3], 'I – IV – V (rock / country)': [0, 3, 4], 'vi – IV – I – V': [5, 3, 0, 4],
    'ii – V – I (jazz)': [1, 4, 0], 'I – vi – IV – V (50s)': [0, 5, 3, 4], '12-bar blues (I7 IV7 V7)': 'blues',
  };
  const GROUPS = {
    scales: [['Major', ['major']], ['Modes', ['dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian']], ['Pentatonic & blues', ['majpent', 'minpent', 'blues']], ['Minor flavours', ['harmonic', 'melodic']]],
    arp: [['Triads', ['arp_maj', 'arp_min', 'arp_dim', 'arp_aug']], ['Seventh chords', ['arp_maj7', 'arp_7', 'arp_m7', 'arp_m7b5']]],
  };
  const SHORT = { major: 'Major', dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian', mixolydian: 'Mixolydian', minor: 'Minor', locrian: 'Locrian', harmonic: 'Harm. minor', melodic: 'Mel. minor', majpent: 'Maj pent', minpent: 'Min pent', blues: 'Blues', arp_maj: 'Major', arp_min: 'Minor', arp_dim: 'Dim', arp_aug: 'Aug', arp_maj7: 'Maj7', arp_7: 'Dom 7', arp_m7: 'Min 7', arp_m7b5: 'm7♭5' };
  const SHAPE_COLORS = { C: '#f87171', A: '#fbbf24', G: '#34d399', E: '#38bdf8', D: '#c084fc' };
  const st = { tab: 'scales', root: 0, type: 'major', arpType: 'arp_maj', show: 'notes', pos: -1, hide: false, play: null, quiz: null, tri: { q: 'maj', set: 0, inv: 3, pos: -1 }, cg: { shape: -1 } };
  let D, anim = null;
  const nm = r => KEYNAME(r);
  const S_ = () => RCC.store;
  const curType = () => (st.tab === 'arp' ? st.arpType : st.type);
  const lkey = (r, t) => r + ':' + t;
  const learned = (r, t) => S_().scaleLearned(lkey(r, t));
  const data = () => T.scaleOnNeck(st.root, curType(), 22);

  /* ---------- circle of fifths wheel ---------- */
  function wheel() {
    const pt = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
    const wedge = (r0, r1, d0, d1) => { const [x0, y0] = pt(r1, d0), [x1, y1] = pt(r1, d1), [x2, y2] = pt(r0, d1), [x3, y3] = pt(r0, d0); return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`; };
    let out = '';
    CIRCLE.forEach((r, i) => {
      const d0 = i * 30 - 15 + 1, d1 = i * 30 + 15 - 1, mid = i * 30, rel = (r + 9) % 12, [tx, ty] = pt(100, mid), [ux, uy] = pt(66, mid);
      out += `<g class="wm" data-r="${r}" data-t="major"><path d="${wedge(84, 124, d0, d1)}"/><text x="${tx}" y="${ty + 5}">${nm(r)}</text><i data-k="${r}:major"></i></g>`;
      out += `<g class="wn" data-r="${rel}" data-t="minor"><path d="${wedge(48, 82, d0, d1)}"/><text x="${ux}" y="${uy + 4}">${nm(rel)}m</text></g>`;
    });
    out += '<text class="wsig" x="0" y="-4" id="wsig"></text><text class="wsig2" x="0" y="12" id="wsig2"></text>';
    $('sc-wheel').innerHTML = out;
    $('sc-wheel').querySelectorAll('g').forEach(g => g.onclick = () => { st.root = +g.dataset.r; if (st.tab === 'scales') st.type = g.dataset.t === 'minor' ? 'minor' : (st.type === 'minor' || st.type === 'major' ? 'major' : st.type); st.pos = -1; st.tri.pos = -1; refresh(); });
  }
  function paintWheel() {
    document.querySelectorAll('#sc-wheel g').forEach(g => {
      const r = +g.dataset.r, t = g.dataset.t, on = r === st.root && (st.tab !== 'scales' ? t === 'major' : (t === 'minor' ? st.type === 'minor' : st.type !== 'minor'));
      g.classList.toggle('on', on); g.classList.toggle('done', learned(r, t));
    });
    const maj = st.type === 'minor' ? (st.root + 3) % 12 : st.root;
    $('wsig').textContent = nm(st.root) + (st.type === 'minor' && st.tab === 'scales' ? 'm' : ''); $('wsig2').textContent = T.KEY_SIGS[maj] === '0' ? '♮' : T.KEY_SIGS[maj];
  }

  /* ---------- sidebar chips ---------- */
  function paintTypes() {
    const g = GROUPS[st.tab], box = $('sc-typewrap'); box.style.display = g ? '' : 'none'; if (!g) return;
    $('sc-typeh').textContent = st.tab === 'arp' ? 'Arpeggio' : 'Scale';
    $('sc-types').innerHTML = g.map(([title, ks]) => `<div class="tgrp"><small>${title}</small><div>${ks.map(k => `<button class="tchip ${curType() === k ? 'on' : ''} ${learned(st.root, k) ? 'done' : ''}" data-k="${k}">${SHORT[k]}</button>`).join('')}</div></div>`).join('');
    $('sc-types').querySelectorAll('button').forEach(b => b.onclick = () => { if (st.tab === 'arp') st.arpType = b.dataset.k; else st.type = b.dataset.k; st.pos = -1; refresh(); });
  }

  function buildStatic() {
    wheel();
    document.querySelectorAll('#sc-show button').forEach(b => b.onclick = () => { st.show = b.dataset.v; refresh(); });
    $('sc-hide').onchange = e => { st.hide = e.target.checked; draw(); };
    document.querySelectorAll('#sc-tabs button').forEach(b => { if (b.dataset.t !== 'scales' && RCC.pro) RCC.pro.mark(b, 'neck'); b.onclick = () => { if (b.dataset.t !== 'scales' && RCC.pro && !RCC.pro.gate('neck')) return; st.tab = b.dataset.t; st.pos = -1; stopPlay(); st.quiz = null; renderQuiz(); refresh(); }; });
    $('sc-learned').onclick = () => { const k = lkey(st.root, curType()), was = learned(st.root, curType()); S_().setScaleLearned(k, !was); refresh(); if (!was) D.toast(nm(st.root) + ' ' + T.SCALES[curType()].name + ' marked as learned 🎸'); };
    $('sc-play').onclick = playScale; $('sc-prog').innerHTML = Object.keys(PROGS).map(k => `<option>${k}</option>`).join('');
    $('sc-jam').onclick = jam; $('sc-quiz').onclick = startQuiz; $('sc-drill').onclick = drill;
  }

  function refresh() {
    const type = curType(), S = T.SCALES[type], d = st.tab === 'triad' || st.tab === 'caged' ? null : data(), notes = d ? d.notes : null;
    document.querySelectorAll('#sc-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === st.tab));
    paintWheel(); paintTypes();
    document.querySelectorAll('#sc-show button').forEach(b => b.classList.toggle('on', b.dataset.v === st.show));
    const isScale = st.tab === 'scales' || st.tab === 'arp';
    ['sc-play', 'sc-drill', 'sc-quiz', 'sc-learned'].forEach(i => { $(i).style.display = isScale || (i === 'sc-play') ? '' : 'none'; });
    $('sc-quiz').style.display = st.tab === 'scales' ? '' : 'none'; $('sc-drill').style.display = isScale ? '' : 'none';
    $('sc-chordsbox').style.display = st.tab === 'scales' && S.iv.length === 7 ? '' : 'none';
    if (st.tab === 'triad') titleTriad(); else if (st.tab === 'caged') titleCaged(); else {
      $('sc-title').innerHTML = `${nm(st.root)} <span>${S.name}</span>`;
      $('sc-sig').textContent = st.tab === 'scales' && st.type === 'major' ? 'Key signature: ' + (T.KEY_SIGS[st.root] === '0' ? 'no sharps or flats' : T.KEY_SIGS[st.root].replace('♯', ' sharp(s)').replace('♭', ' flat(s)')) : S.iv.length + ' notes';
      $('sc-noterow').innerHTML = notes.map((n, i) => `<div class="nt ${i === 0 ? 'r' : ''}"><b>${n}</b><small>${S.deg[i]}</small></div>`).join('');
      if (S.iv.length === 7) { const ws = S.iv.map((v, i) => (S.iv[i + 1] ?? 12) - v).map(x => x === 1 ? 'H' : x === 2 ? 'W' : x === 3 ? 'W+H' : x); $('sc-formula').innerHTML = 'Steps: ' + ws.map(w => `<span class="chip">${w}</span>`).join(''); }
      else $('sc-formula').innerHTML = 'Intervals: ' + S.deg.map(w => `<span class="chip">${w}</span>`).join('');
      const ch = T.diatonicChords(st.root, type);
      $('sc-chords').innerHTML = ch.length ? ch.map(c => `<div class="dch"><b>${c.name}</b><small>${c.roman}</small></div>`).join('') : '';
      $('sc-rel').textContent = type === 'major' ? `Relative minor: ${notes[5]}m  ·  Parallel minor: ${nm(st.root)}m` : type === 'minor' ? `Relative major: ${notes[2]}` : st.tab === 'arp' ? 'Outline of the chord: play it over that chord for a solo that always fits.' : '';
      $('sc-sub').innerHTML = `<div class="small" style="margin-bottom:6px">Position</div><div id="sc-pos" class="pos"><span class="chip ${st.pos < 0 ? 'on' : ''}" data-p="-1">Whole neck</span>` + d.positions.map((_, i) => `<span class="chip ${st.pos === i ? 'on' : ''}" data-p="${i}">Pos ${i + 1}</span>`).join('') + '</div>';
      $('sc-sub').querySelectorAll('.chip').forEach(c => c.onclick = () => { st.pos = +c.dataset.p; refresh(); });
    }
    if (st.tab === 'triad') subTriad(); else if (st.tab === 'caged') subCaged();
    const S2 = S_(), nMaj = CIRCLE.filter(r => S2.scaleLearned(lkey(r, 'major'))).length, nAll = S2.learnedScaleCount();
    $('sc-progress').style.width = (nMaj / 12 * 100) + '%'; $('sc-progtxt').textContent = `${nMaj} / 12 major scales learned · ${nAll} total`;
    if (isScale) $('sc-learned').textContent = learned(st.root, type) ? '✓ Learned' : 'Mark as learned';
    draw();
  }

  /* ---------- triads ---------- */
  const QN = { maj: 'Major', min: 'Minor', dim: 'Diminished', aug: 'Augmented' }, SETS = ['6-5-4', '5-4-3', '4-3-2', '3-2-1'], INV = ['Root', '1st inv.', '2nd inv.', 'All'];
  function triVoicings() { const o = []; const invs = st.tri.inv === 3 ? [0, 1, 2] : [st.tri.inv]; invs.forEach(i => T.triadVoicings(st.root, st.tri.q, st.tri.set, i).forEach(v => o.push({ ...v, inv: i }))); return o.sort((a, b) => a.lo - b.lo); }
  function titleTriad() {
    $('sc-title').innerHTML = `${nm(st.root)}${st.tri.q === 'min' ? 'm' : st.tri.q === 'dim' ? '°' : st.tri.q === 'aug' ? '+' : ''} <span>${QN[st.tri.q]} triad · strings ${SETS[st.tri.set]}</span>`;
    const pcs = T.TRIADS[st.tri.q].map(i => (st.root + i) % 12), degs = ['R', st.tri.q === 'min' || st.tri.q === 'dim' ? 'b3' : '3', st.tri.q === 'dim' ? 'b5' : st.tri.q === 'aug' ? '#5' : '5'];
    $('sc-noterow').innerHTML = pcs.map((p, i) => `<div class="nt ${i === 0 ? 'r' : ''}"><b>${T.NOTES[p]}</b><small>${degs[i]}</small></div>`).join('');
    $('sc-sig').textContent = 'Three-note chords on adjacent strings: the basis of funky rhythm, lead fills and chord-melody.';
    $('sc-formula').innerHTML = 'Shapes: ' + (st.tri.inv === 3 ? 'all inversions' : INV[st.tri.inv]) + ' — every spot on the neck'; $('sc-rel').textContent = '';
  }
  function subTriad() {
    const t = st.tri, v = triVoicings(), seg = (arr, key, cur) => `<div class="seg sm">${arr.map((x, i) => `<button data-k="${key}" data-i="${i}" class="${cur === i ? 'on' : ''}">${x}</button>`).join('')}</div>`;
    $('sc-sub').innerHTML = `<div class="row"><label class="l">Chord</label>${seg(['Major', 'Minor', 'Dim', 'Aug'], 'q', ['maj', 'min', 'dim', 'aug'].indexOf(t.q))}</div>
     <div class="row"><label class="l">Strings</label>${seg(SETS, 'set', t.set)}</div><div class="row"><label class="l">Inversion</label>${seg(INV, 'inv', t.inv)}</div>
     <div class="small" style="margin:10px 0 6px">Spots</div><div class="pos"><span class="chip ${t.pos < 0 ? 'on' : ''}" data-p="-1">All</span>${v.map((x, i) => `<span class="chip ${t.pos === i ? 'on' : ''}" data-p="${i}">Fret ${Math.max(1, x.lo)}${t.inv === 3 ? ' · ' + ['root', '1st', '2nd'][x.inv] : ''}</span>`).join('')}</div>`;
    $('sc-sub').querySelectorAll('.seg button').forEach(b => b.onclick = () => { const i = +b.dataset.i; if (b.dataset.k === 'q') t.q = ['maj', 'min', 'dim', 'aug'][i]; else t[b.dataset.k] = i; t.pos = -1; refresh(); });
    $('sc-sub').querySelectorAll('.chip').forEach(c => c.onclick = () => { t.pos = +c.dataset.p; refresh(); });
  }

  /* ---------- CAGED ---------- */
  function titleCaged() {
    const cg = T.caged(st.root); $('sc-title').innerHTML = `${nm(st.root)} major <span>five shapes, one chord</span>`;
    $('sc-noterow').innerHTML = cg.map(s => `<div class="nt" style="border-color:${SHAPE_COLORS[s.shape]}"><b style="color:${SHAPE_COLORS[s.shape]}">${s.shape}</b><small>fret ${s.lo || 'open'}</small></div>`).join('');
    $('sc-sig').textContent = 'Every open chord shape (C-A-G-E-D) can slide up the neck as a barre chord. Together they cover the whole fretboard.';
    $('sc-formula').innerHTML = 'Order up the neck: ' + cg.map(s => `<span class="chip" style="border-color:${SHAPE_COLORS[s.shape]}">${s.shape}</span>`).join('→'); $('sc-rel').textContent = 'The CAGED shapes repeat every 12 frets, so each one also exists an octave higher.';
  }
  function subCaged() {
    const cg = T.caged(st.root), sel = st.cg.shape;
    $('sc-sub').innerHTML = `<div class="small" style="margin-bottom:6px">Show</div><div class="pos"><span class="chip ${sel < 0 ? 'on' : ''}" data-p="-1">All five</span>${cg.map((s, i) => `<span class="chip ${sel === i ? 'on' : ''}" data-p="${i}" style="${sel === i ? '' : 'border-color:' + SHAPE_COLORS[s.shape]}">${s.shape} shape · fret ${s.lo || 'open'}</span>`).join('')}</div>
     <div class="small" style="margin-top:10px">${sel < 0 ? 'Each colour is one shape. White-ringed notes are the root (' + nm(st.root) + '), which is how you can link neighbouring shapes together.' : cg[sel].shape + ' shape: the open ' + cg[sel].shape + ' chord moved so its root lands on ' + nm(st.root) + '. Frets (low→high E): ' + cg[sel].frets.map(f => f < 0 ? 'x' : f).join(' ')}</div>`;
    $('sc-sub').querySelectorAll('.chip').forEach(c => c.onclick = () => { st.cg.shape = +c.dataset.p; refresh(); });
  }

  /* ---------- fretboard ---------- */
  function fit(cv) { const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c, w, h }; }
  function draw() {
    const cv = $('scfret'); if (!cv.clientWidth) return;
    const f = fit(cv); let f0 = 0, f1 = 15, notes = [];
    if (st.tab === 'triad') {
      const v = triVoicings(), sel = st.tri.pos >= 0 ? v[st.tri.pos] : null;
      if (sel) { const fr = sel.notes.map(n => n.fret); [f0, f1] = RCC.fret.windowFor(Math.min(...fr), Math.max(...fr), 6); }
      v.forEach((x, i) => x.notes.forEach(n => { const on = !sel || sel === x; notes.push({ s: n.s, fret: n.fret, kind: !on ? 'dim' : n.deg === 'R' ? 'root' : 'scale', label: st.hide ? '' : st.show === 'fret' ? n.fret : n.deg, color: '#8b9cff' }); }));
      if (!sel) f1 = Math.max(15, ...v.flatMap(x => x.notes.map(n => n.fret)));
    } else if (st.tab === 'caged') {
      const cg = T.caged(st.root), sel = st.cg.shape;
      if (sel >= 0) { const s = cg[sel], fr = s.frets.filter(x => x >= 0); [f0, f1] = RCC.fret.windowFor(Math.min(...fr), Math.max(...fr), 5); }
      const seen = new Set();
      cg.forEach((s, i) => s.notes.forEach(n => { const on = sel < 0 || sel === i, key = n.s + ':' + n.fret; if (sel < 0 && seen.has(key)) return; seen.add(key); notes.push({ s: n.s, fret: n.fret, kind: !on ? 'dim' : n.root ? 'root' : 'scale', label: st.hide ? '' : st.show === 'fret' ? n.fret : (n.root ? 'R' : T.NOTES[(T.OPEN_MIDI[5 - n.s] + n.fret) % 12]), color: SHAPE_COLORS[s.shape] }); }));
      // repeat shapes an octave higher when they fit
      cg.forEach((s, i) => { if (s.hi + 12 <= 17 && (sel < 0 || sel === i)) s.notes.forEach(n => { const key = n.s + ':' + (n.fret + 12); if (sel < 0 && seen.has(key)) return; seen.add(key); notes.push({ s: n.s, fret: n.fret + 12, kind: n.root ? 'root' : 'scale', label: st.hide ? '' : n.root ? 'R' : T.NOTES[(T.OPEN_MIDI[5 - n.s] + n.fret) % 12], color: SHAPE_COLORS[s.shape] }); }); });
      if (sel < 0) f1 = 17;
    } else {
      const d = data(), S = T.SCALES[curType()], sel = st.pos >= 0 ? d.positions[st.pos] : null;
      f0 = 1;
      if (sel && sel.length) { const fr = sel.map(n => n.fret); [f0, f1] = RCC.fret.windowFor(Math.min(...fr), Math.max(...fr), 6); }
      const inSel = n => (sel ? sel.some(x => x.s === n.s && x.fret === n.fret) : true), hl = st.play ? st.play.pc : -1;
      notes = d.all.filter(n => n.fret <= Math.max(f1, 15)).map(n => {
        const root = n.deg === 0, on = inSel(n); let kind = !on ? 'dim' : root ? 'root' : 'scale'; if (hl >= 0 && n.pc === hl && on) kind = 'cur';
        return { s: n.s, fret: n.fret, kind, label: st.hide ? '' : st.show === 'degrees' ? S.deg[n.deg] : st.show === 'fret' ? n.fret : d.notes[n.deg], color: root ? undefined : '#8b9cff' };
      });
    }
    f.c.clearRect(0, 0, f.w, f.h);
    RCC.fret.draw(f.c, { x: 8, y: 2, w: f.w - 16, h: f.h - 4 }, { f0, f1, notes, accent: D.accent() });
  }

  /* ---------- audio ---------- */
  function playScale() {
    if (st.play) { stopPlay(); return; }
    const A = RCC.audio, c = A.get(); A.resume();
    let seq, step = .42 * 100 / (+$('sc-speed').value || 100);
    if (st.tab === 'triad') { const v = triVoicings(), x = (st.tri.pos >= 0 ? v[st.tri.pos] : v[0]); if (!x) return; const m = x.notes.map(n => T.OPEN_MIDI[5 - n.s] + n.fret).sort((a, b) => a - b); seq = m; const t0 = c.currentTime + .08; A.strum(m, t0, 'D', 1.6, .3); return; }
    if (st.tab === 'caged') { const cg = T.caged(st.root), x = cg[Math.max(0, st.cg.shape)]; A.strum(A.chordMidis(x.frets), c.currentTime + .08, 'D', 1.8); return; }
    const S = T.SCALES[curType()], start = 48 + (((st.root - 48) % 12) + 12) % 12, up = S.iv.map(i => start + i).concat([start + 12]); seq = up.concat(up.slice(0, -1).reverse());
    const t0 = c.currentTime + .08; seq.forEach((m, i) => A.pluck(m, t0 + i * step, step * 1.1, .4));
    st.play = { pc: seq[0] % 12 }; $('sc-play').textContent = '■ Stop';
    clearInterval(anim); anim = setInterval(() => { const i = Math.floor((c.currentTime - t0) / step); if (i >= seq.length) return stopPlay(); st.play.pc = seq[Math.max(0, i)] % 12; draw(); }, 40);
  }
  function stopPlay() { clearInterval(anim); st.play = null; $('sc-play').textContent = '▶ Hear it'; draw(); }

  /** Turn the selected scale/arpeggio position into a tab (up then down) and hand it to Solo mode for scoring. */
  function drill() {
    const d = data(), sel = st.pos >= 0 ? d.positions[st.pos] : d.positions[0] || d.all.filter(n => n.fret <= 12);
    const midi = n => T.OPEN_MIDI[5 - n.s] + n.fret, up = sel.slice().sort((a, b) => midi(a) - midi(b) || a.s - b.s), seq = up.concat(up.slice(0, -1).reverse());
    if (!seq.length) return; const gap = seq.some(n => n.fret >= 10) ? 4 : 2, perBar = 16 / gap, rows = Array.from({ length: 6 }, () => []), L = ['e', 'B', 'G', 'D', 'A', 'E'];
    const cols = Math.ceil(seq.length / perBar) * 16 + 1; rows.forEach(r => { for (let i = 0; i < cols; i++) r.push('-'); r[0] = '|'; });
    seq.forEach((n, i) => { const col = 1 + i * gap, s = String(n.fret); for (let k = 0; k < s.length; k++) rows[n.s][col + k] = s[k]; });
    rows.forEach(r => { for (let c = 16; c < cols; c += 16) r[c] = '|'; r[cols - 1] = '|'; });
    const text = L.map((l, i) => l + rows[i].join('')).join('\n');
    D.drill(text, `${nm(st.root)} ${T.SCALES[curType()].name}${st.pos >= 0 ? ' · position ' + (st.pos + 1) : ''}`);
  }

  function jam() {
    const prog = PROGS[$('sc-prog').value], ch = T.diatonicChords(st.root, 'major'), notes = T.scaleNotes(st.root, 'major');
    let names; if (prog === 'blues') { const I = nm(st.root), IV = notes[3], V = notes[4]; names = [I, I, I, I, IV, IV, I, I, V, IV, I, V].map(n => n + '7'); } else names = prog.map(i => ch[i].name);
    D.jam('[Progression]\n' + names.join('  ') + '\n\n[Solo]\n(use the ' + nm(st.root) + ' ' + T.SCALES[curType()].name + ' on the Scales page)', nm(st.root) + ' jam – ' + $('sc-prog').value);
  }

  /* ---------- "Spell it" quiz ---------- */
  function startQuiz() { const root = CIRCLE[Math.floor(Math.random() * 12)]; st.quiz = { root, want: T.scaleNotes(root, 'major'), got: [] }; renderQuiz(); }
  function renderQuiz() {
    const q = st.quiz, box = $('sc-quizbox'); if (!q) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], alt = { 'C#': 'C#/Db', 'D#': 'D#/Eb', 'F#': 'F#/Gb', 'G#': 'G#/Ab', 'A#': 'A#/Bb' };
    box.innerHTML = `<div class="qh"><b>Spell the ${nm(q.root)} major scale</b><span class="small">Tap the 7 notes in order, starting on ${nm(q.root)}.</span></div>
     <div class="qgot">${q.want.map((n, i) => `<span class="nt ${q.got[i] != null ? (q.ok && q.ok[i] === false ? 'bad' : 'r') : ''}"><b>${q.got[i] != null ? (q.done ? q.want[i] : names[q.got[i]]) : '?'}</b></span>`).join('')}</div>
     <div class="q12">${names.map((n, i) => `<button class="btn sm" data-i="${i}">${alt[n] || n}</button>`).join('')}</div>
     <div class="row"><button class="btn sm" id="q-undo">Undo</button><button class="btn sm" id="q-new">New key</button><button class="btn sm" id="q-end">Close</button><span id="q-msg" class="small"></span></div>`;
    box.querySelectorAll('.q12 button').forEach(b => b.onclick = () => { if (q.done) return; q.got.push(+b.dataset.i); if (q.got.length === 7) check(); renderQuiz(); });
    $('q-undo').onclick = () => { q.got.pop(); q.done = false; renderQuiz(); };
    $('q-new').onclick = startQuiz; $('q-end').onclick = () => { st.quiz = null; renderQuiz(); };
    if (q.done) $('q-msg').textContent = q.pass ? '✓ Perfect! ' + q.want.join(' ') : '✗ Not quite. Answer: ' + q.want.join(' ');
  }
  function check() {
    const q = st.quiz, want = q.want.map(n => T.noteIndex(n)); q.ok = q.got.map((g, i) => g === want[i]); q.pass = q.ok.every(Boolean); q.done = true;
    if (D.track) D.track({ drill: 'scale-spell' });
    if (q.pass) { S_().setScaleLearned(lkey(q.root, 'major'), true); refresh(); }
  }

  function init(deps) {
    D = deps; buildStatic();
    try { const old = JSON.parse(localStorage.getItem('rcc-learned') || '{}'); Object.keys(old).forEach(r => { if (old[r]) S_().lib.scales[lkey(r, 'major')] = S_().lib.scales[lkey(r, 'major')] || 1; }); localStorage.removeItem('rcc-learned'); } catch (e) {}
    refresh(); new ResizeObserver(draw).observe($('scfret')); S_().on(() => { if ($('v-scales').classList.contains('on')) refresh(); });
  }
  RCC.scales = { init, redraw: () => { refresh(); }, open: (root, type) => { st.root = +root; st.type = type || 'major'; st.tab = 'scales'; refresh(); } };
})();
