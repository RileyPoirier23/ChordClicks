/* Camera compositor: draws the camera frame + the chosen overlay layout onto the 1280x720 output canvas. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  let W = 1280, H = 720;
  /** Output size. Landscape 1280x720 for streaming/virtual cam, portrait 720x1280 for phone recordings. */
  function setSize(w, h) { W = w; H = h; }
  const MODES = {
    full: { name: 'Full', valid: ['tc', 'mc', 'bc'], note: 'Big centred panel' },
    banner: { name: 'Banner', valid: ['tc', 'bc'], note: 'Slim bar along an edge' },
    corner: { name: 'Corner', valid: ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'], note: 'Small card' },
    pill: { name: 'Pill', valid: ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'], note: 'Tiny chord tag' },
    side: { name: 'Side', valid: ['ml', 'mr'], note: 'Upcoming chords list' },
    stage: { name: 'Stage', valid: ['tc', 'mc', 'bc'], note: 'Lyrics + chords karaoke' },
    off: { name: 'Off', valid: [], note: 'Camera only' },
  };
  const DEFAULTS = { mode: 'corner', pos: 'br', scale: 100, bg: 55, dim: 25, show: { chord: true, next: true, strum: true, chips: false, bpm: true, brand: true, fret: true, diagram: true, nextdiag: false, queue: true, flash: true }, soloAuto: true };
  const snap = (mode, pos) => { const v = MODES[mode].valid; return !v.length || v.includes(pos) ? pos : v[v.length - 1]; };

  function rr(c, x, y, w, h, r, fill) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
  function txt(c, t, x, y, font, fill, align = 'center') {
    c.font = font; c.fillStyle = fill; c.textAlign = align; c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 8; c.fillText(t, x, y); c.shadowBlur = 0;
  }
  function anchor(pos, w, h, m) {
    const x = pos[1] === 'l' ? m : pos[1] === 'r' ? W - w - m : (W - w) / 2;
    const y = pos[0] === 't' ? m : pos[0] === 'b' ? H - h - m : (H - h) / 2;
    return { x, y };
  }
  function strumRow(c, cx, y, st, bw, bh, gap) {
    const n = st.pat.length; if (!n) return;
    const tot = n * (bw + gap) - gap;
    st.pat.forEach((s, i) => {
      const x = cx - tot / 2 + i * (bw + gap);
      rr(c, x, y, bw, bh, bw * .28, i === st.stepNow ? '#39ff88' : 'rgba(255,255,255,.17)');
      c.fillStyle = i === st.stepNow ? '#06140b' : '#fff'; c.font = `800 ${bh * .52}px system-ui,sans-serif`; c.textAlign = 'center';
      c.fillText(s === 'D' ? '↓' : s === 'U' ? '↑' : '·', x + bw / 2, y + bh * .68);
    });
  }

  const shapeCache = new Map();
  const shapeOf = n => { if (!n || n === '—') return null; let v = shapeCache.get(n); if (v === undefined) { v = RCC.theory.chordShape(n) || null; shapeCache.set(n, v); } return v; };
  /** chord fingering drawn into a box; works in every layout */
  function diag(c, st, name, x, y, w, h, alpha) {
    const sh = shapeOf(name); if (!sh) return; c.save(); if (alpha != null) c.globalAlpha = alpha; c.translate(x, y); c.scale(w / 260, h / 300); RCC.fret.chordDiagram(c, 260, 300, sh, st.accent, { clear: false, f: 1.9 }); c.restore();
  }
  const nextOf = st => (st.prog.length ? st.prog[(st.pi + 1) % st.prog.length].c : '—');

  function drawFull(c, st, o, s, pos, bg) {
    const dg = o.show.diagram, nd = dg && o.show.nextdiag, w = (dg ? (nd ? 900 : 720) : 540) * s, h = (o.show.strum ? 330 : 230) * s, { x, y } = anchor(pos, w, h, 40 * s), cx = dg ? x + w * (nd ? .3 : .34) : x + w / 2;
    rr(c, x, y, w, h, 28 * s, bg);
    if (o.show.chord) txt(c, st.chord, cx, y + 150 * s, `900 ${150 * s}px system-ui,sans-serif`, st.accent);
    if (o.show.next) txt(c, 'Next: ' + nextOf(st), cx, y + 205 * s, `600 ${28 * s}px system-ui,sans-serif`, '#c5c8d6');
    if (o.show.strum) strumRow(c, cx, y + 232 * s, st, (nd ? 38 : 46) * s, 66 * s, (nd ? 6 : 7) * s);
    if (dg) { const dh = h - 40 * s, dw = dh * 260 / 300, nh = 150 * s, ndw = nh * 260 / 300, bx = nd ? x + w - dw - 34 * s - ndw - 22 * s : x + w - dw - 34 * s;
      diag(c, st, st.chord, bx, y + 20 * s, dw, dh);
      if (nd) { txt(c, 'NEXT', x + w - ndw / 2 - 24 * s, y + 28 * s, `800 ${15 * s}px system-ui,sans-serif`, '#aeb2c2'); diag(c, st, nextOf(st), x + w - ndw - 24 * s, y + h - nh - 24 * s, ndw, nh, .85); } }
    if (o.show.chips) chips(c, st, x + w / 2, y + h + 14 * s, s);
  }
  function chips(c, st, cx, y, s) {
    c.font = `700 ${26 * s}px system-ui,sans-serif`;
    const s0 = Math.max(0, st.pi - 3), L = st.prog.slice(s0, s0 + 8), ws = L.map(p => c.measureText(p.c).width + 32 * s);
    let x = cx - ws.reduce((a, b) => a + b + 8 * s, -8 * s) / 2;
    L.forEach((p, i) => { rr(c, x, y, ws[i], 44 * s, 22 * s, i + s0 === st.pi ? st.accent : 'rgba(0,0,0,.45)'); c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(p.c, x + ws[i] / 2, y + 31 * s); x += ws[i] + 8 * s; });
  }
  function drawBanner(c, st, o, s, pos, bg) {
    const dg = o.show.diagram, h = (dg ? 150 : 130) * s, y = pos[0] === 't' ? 0 : H - h;
    c.fillStyle = bg; c.fillRect(0, y, W, h);
    c.fillStyle = st.accent; c.fillRect(0, pos[0] === 't' ? y + h - 3 : y, W, 3);
    let tx = 40 * s;
    if (dg) { const dh = h - 14 * s, dw = dh * 260 / 300; diag(c, st, st.chord, 24 * s, y + 7 * s, dw, dh); tx = 24 * s + dw + 20 * s; if (o.show.nextdiag) { const nh = h * .62; diag(c, st, nextOf(st), W - 24 * s - nh * .87, y + h - nh - 6 * s, nh * 260 / 300, nh, .8); } }
    if (o.show.chord) txt(c, st.chord, tx, y + h * .72, `900 ${92 * s}px system-ui,sans-serif`, st.accent, 'left');
    const rx = W - 40 * s - (dg && o.show.nextdiag ? h * .62 * .87 + 20 * s : 0);
    if (o.show.next) txt(c, 'NEXT  ' + nextOf(st), rx, y + h * .42, `700 ${34 * s}px system-ui,sans-serif`, '#e4e6ee', 'right');
    if (o.show.bpm) txt(c, '♩ ' + st.bpm + (st.running ? '  ▶' : ''), rx, y + h * .78, `600 ${24 * s}px system-ui,sans-serif`, '#aeb2c2', 'right');
    if (o.show.strum) strumRow(c, W / 2 + (dg ? 60 * s : 0), y + h * .2, st, 36 * s, 56 * s, 6 * s);
  }
  function drawCorner(c, st, o, s, pos, bg) {
    const dg = o.show.diagram, w = (dg ? 470 : 380) * s, h = (o.show.strum ? 200 : 150) * s, { x, y } = anchor(pos, w, h, 22 * s);
    rr(c, x, y, w, h, 22 * s, bg);
    let tx = x + 24 * s;
    if (dg) { const dh = h - 20 * s, dw = dh * 260 / 300; diag(c, st, st.chord, x + 12 * s, y + 10 * s, dw, dh); tx = x + 12 * s + dw + 10 * s; }
    if (o.show.chord) txt(c, st.chord, tx, y + 92 * s, `900 ${84 * s}px system-ui,sans-serif`, st.accent, 'left');
    if (o.show.next) txt(c, 'Next ' + nextOf(st), x + w - 22 * s, y + 46 * s, `700 ${24 * s}px system-ui,sans-serif`, '#d6d9e4', 'right');
    if (o.show.bpm) txt(c, '♩ ' + st.bpm, x + w - 22 * s, y + 80 * s, `600 ${22 * s}px system-ui,sans-serif`, '#aeb2c2', 'right');
    if (o.show.strum) strumRow(c, tx + (x + w - tx) / 2 - 8 * s, y + 118 * s, st, 28 * s, 50 * s, 5 * s);
  }
  function drawPill(c, st, o, s, pos, bg) {
    c.font = `900 ${50 * s}px system-ui,sans-serif`;
    const cw = o.show.chord ? c.measureText(st.chord).width : 0, nx = o.show.next ? 'next ' + nextOf(st) : '';
    c.font = `600 ${22 * s}px system-ui,sans-serif`; const nw = nx ? c.measureText(nx).width : 0;
    const w = cw + nw + (cw && nw ? 84 : 40) * s, h = 70 * s, { x, y } = anchor(pos, w, h, 22 * s);
    rr(c, x, y, w, h, h / 2, bg);
    let px = x + 24 * s;
    if (o.show.chord) { txt(c, st.chord, px, y + h * .7, `900 ${50 * s}px system-ui,sans-serif`, st.accent, 'left'); px += cw + 20 * s; }
    if (nx) txt(c, nx, px, y + h * .64, `600 ${22 * s}px system-ui,sans-serif`, '#cfd2de', 'left');
    if (o.show.strum && st.pat.length) { const k = st.stepNow; rr(c, x + w - 18 * s, y + h / 2 - 5 * s, 10 * s, 10 * s, 5 * s, k >= 0 ? '#39ff88' : 'rgba(255,255,255,.25)'); }
    if (o.show.diagram && shapeOf(st.chord)) { // diagram card hangs off the pill, on the side facing the middle of the frame
      const dh = 150 * s, dw = dh * 260 / 300 + 16 * s, up = pos[0] === 'b', cy = up ? y - dh - 20 * s : y + h + 8 * s, cx2 = Math.max(10, Math.min(W - dw - 10, x));
      rr(c, cx2, up ? cy : cy, dw, dh + 12 * s, 18 * s, bg); diag(c, st, st.chord, cx2 + 8 * s, (up ? cy : cy) + 6 * s, dh * 260 / 300, dh);
    }
  }
  function drawSide(c, st, o, s, pos, bg) {
    const w = 210 * s, h = H - 80 * s, { x, y } = anchor(pos, w, h, 24 * s), dg = o.show.diagram && shapeOf(st.chord);
    rr(c, x, y, w, h, 24 * s, bg);
    let top = y + 20 * s; if (dg) { const dh = 190 * s; diag(c, st, st.chord, x + (w - dh * 260 / 300) / 2, top, dh * 260 / 300, dh); top += dh + 8 * s; }
    const L = st.prog.slice(st.pi, st.pi + (dg ? 5 : 7)), step = (dg ? 62 : 78) * s;
    L.forEach((p, i) => {
      const yy = top + i * step, ih = step - 6 * s;
      if (i === 0) rr(c, x + 12 * s, yy, w - 24 * s, ih, 18 * s, st.accent);
      txt(c, p.c, x + w / 2, yy + ih * .72, `${i === 0 ? 900 : 700} ${(i === 0 ? ih * .72 : ih * .54)}px system-ui,sans-serif`, i === 0 ? '#fff' : `rgba(255,255,255,${.75 - i * .09})`);
    });
    if (o.show.bpm) txt(c, '♩ ' + st.bpm, x + w / 2, y + h - 18 * s, `600 ${22 * s}px system-ui,sans-serif`, '#aeb2c2');
  }

  /* ---- stage mode: karaoke style lyrics with chords above the words ---- */
  function drawStage(c, st, o, s, pos, bg) {
    const g = st.stage; if (!g || !g.lines.length) { drawPill(c, st, o, s, 'bc', bg); return; }
    const w = (W - 80) * Math.min(1, s), lh = 118 * s, h = lh * 3 + 40 * s, { x, y } = anchor(pos, w, h, 30 * s);
    rr(c, x, y, w, h, 30 * s, bg);
    const idx = g.cur, rows = [idx - 1, idx, idx + 1];
    rows.forEach((li, r) => {
      const L = g.lines[li], yy = y + 20 * s + r * lh, cur = li === idx; if (!L) return;
      const fs = (cur ? 52 : 34) * s, alpha = cur ? 1 : .45; c.save(); c.globalAlpha = alpha; c.textAlign = 'left';
      c.font = `${cur ? 800 : 600} ${fs}px system-ui,sans-serif`; const base = yy + lh * (cur ? .86 : .78);
      const tw = c.measureText(L.lyric).width, avail = w - 80 * s, k = tw > avail ? avail / tw : 1; // shrink long lines to fit
      c.save(); c.translate(x + 40 * s, 0); c.scale(k, 1);
      if (L.lyric) { c.fillStyle = cur ? '#fff' : '#cfd2de'; c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 6; c.fillText(L.lyric, 0, base); c.shadowBlur = 0; }
      const cf = `900 ${(cur ? 40 : 28) * s}px system-ui,sans-serif`; let lastR = -1e9;
      L.chords.forEach(ch => {
        c.font = `${cur ? 800 : 600} ${fs}px system-ui,sans-serif`; let cx0 = c.measureText(L.lyric.slice(0, ch.col)).width; c.font = cf; const cw = c.measureText(ch.c).width + 20 * s; cx0 = Math.max(cx0, lastR + 8 * s); lastR = cx0 + cw;
        const hot = cur && ch.pi === st.pi; if (hot) rr(c, cx0 - 6 * s, base - fs - 40 * s, cw + 4 * s, 46 * s, 14 * s, st.accent);
        c.fillStyle = hot ? '#fff' : st.accent; c.fillText(ch.c, cx0 + 4 * s, base - fs - 6 * s);
      });
      c.restore(); c.restore();
    });
    if (g.sec) txt(c, g.sec.toUpperCase(), x + w - 24 * s, y + 26 * s, `800 ${16 * s}px system-ui,sans-serif`, st.accent, 'right');
  }

  function drawSolo(c, st, o, s, bg) {
    const h = 210 * s, y = H - h - 18 * s, x = 34;
    const a = st.solo.alpha == null ? 1 : st.solo.alpha, rise = (1 - a) * 26 * s; c.save(); c.globalAlpha = a; c.translate(0, rise);
    rr(c, x - 10, y - 8, W - 2 * x + 20, h + 16, 20 * s, bg);
    RCC.fret.draw(c, { x, y, w: W - 2 * x, h }, { ...st.solo, compact: true, accent: st.accent });
    txt(c, 'SOLO', x + 6, y - 14, '800 15px system-ui,sans-serif', st.accent, 'left'); c.restore();
  }

  function render(c, st) {
    const o = st.opts, v = st.video;
    c.save(); if (st.mirror) { c.translate(W, 0); c.scale(-1, 1); }
    if (v && v.videoWidth) { const r = Math.max(W / v.videoWidth, H / v.videoHeight), w = v.videoWidth * r, h = v.videoHeight * r; c.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); }
    else { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#12122a'); g.addColorStop(1, '#2a1030'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    c.restore();
    if (o.dim > 0) { c.fillStyle = `rgba(0,0,0,${o.dim / 100 * .8})`; c.fillRect(0, 0, W, H); }
    const s = o.scale / 100 * Math.min(1, W / 1280), bg = `rgba(8,8,16,${o.bg / 100})`;
    const soloOn = st.solo && st.solo.active && o.soloAuto && o.show.fret;
    if (o.mode !== 'off') {
      let pos = snap(o.mode, o.pos);
      if (soloOn && pos[0] === 'b') pos = 't' + pos[1];
      ({ full: drawFull, banner: drawBanner, corner: drawCorner, pill: drawPill, side: drawSide, stage: drawStage }[o.mode])(c, st, o, s, pos, bg);
    }
    if (soloOn) drawSolo(c, st, o, Math.min(1, s), bg);
    if (o.show.queue && st.queue && st.queue.length) { // chat requests
      const q = st.queue.slice(0, 3), w = 330, h = 40 + q.length * 30; rr(c, 18, 18, w, h, 16, bg); txt(c, 'UP NEXT · REQUESTS', 34, 42, '800 13px system-ui,sans-serif', st.accent, 'left');
      q.forEach((r, i) => { c.font = '600 18px system-ui,sans-serif'; let t = r.title + (r.by ? '  · ' + r.by : ''); while (c.measureText(t).width > w - 36 && t.length > 8) t = t.slice(0, -2); txt(c, t, 34, 70 + i * 30, '600 18px system-ui,sans-serif', '#e4e6ee', 'left'); });
    }
    if (o.show.flash && st.flash > .02) { // beat flash: a soft glow around the frame
      const f = st.flash, g = c.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * .95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, st.accent + Math.round(f * (st.flashAcc ? 140 : 80)).toString(16).padStart(2, '0')); c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (o.show.brand) txt(c, 'CHORDCLICKS', W - 18, 24, '800 14px system-ui,sans-serif', st.accent, 'right');
  }

  RCC.overlay = { render, MODES, DEFAULTS, snap, setSize, get W() { return W; }, get H() { return H; } };
})();
