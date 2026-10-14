/* Shared fretboard renderer (used by Solo, Scales and the on-camera overlay).
   String index s: 0 = high e (top) … 5 = low E (bottom), same as tab. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const STRING_COLORS = ['#f472b6', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];
  const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  /**
   * @param ctx    2d context
   * @param rect   {x,y,w,h} area to draw in
   * @param o      {f0,f1, notes:[{s,fret,kind,label,color,prog}], lefty, compact, accent}
   *   kind: 'cur' | 'next' | 'later' | 'scale' | 'root' | 'dim'
   *   prog: 0..1 approach (for 'next' ring)
   */
  function draw(ctx, rect, o) {
    const { x, y, w, h } = rect, compact = !!o.compact;
    const f0 = o.f0 ?? 1, f1 = o.f1 ?? 12, nF = f1 - f0 + 1;
    const padL = compact ? 26 : 44, padR = 8, padT = compact ? 10 : 22, padB = compact ? 18 : 30;
    const bx = x + padL, bw = w - padL - padR, by = y + padT, bh = h - padT - padB;
    const cw = bw / nF, sp = bh / 5;
    const fx = f => bx + (f - f0) * cw;                // left wire of fret f
    const noteX = f => f === 0 ? bx - padL * .45 : fx(f) + cw / 2;
    const sy = s => by + (o.lefty ? 5 - s : s) * sp;
    const mx = px => o.lefty ? x * 2 + w - px : px;     // mirror horizontally for lefties
    ctx.save();
    if (o.lefty) { ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }

    // wood
    const g = ctx.createLinearGradient(0, by - 8, 0, by + bh + 8);
    g.addColorStop(0, 'rgba(76,50,34,.92)'); g.addColorStop(1, 'rgba(52,34,24,.92)');
    ctx.fillStyle = g; rr(ctx, bx - 2, by - 10, bw + 4, bh + 20, compact ? 6 : 10); ctx.fill();
    // inlays
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    for (let f = Math.max(f0, 1); f <= f1; f++) if (INLAYS.includes(f)) {
      const cx = fx(f) + cw / 2, r = Math.min(cw, sp) * .16;
      if (f % 12 === 0) { [1.5, 3.5].forEach(i => { ctx.beginPath(); ctx.arc(cx, by + i * sp, r, 0, 7); ctx.fill(); }); }
      else { ctx.beginPath(); ctx.arc(cx, by + 2.5 * sp, r, 0, 7); ctx.fill(); }
    }
    // frets + nut
    for (let f = f0 - 1; f <= f1; f++) {
      const nut = f === 0;
      ctx.strokeStyle = nut ? '#e8e2d0' : 'rgba(210,210,225,.55)'; ctx.lineWidth = nut ? (compact ? 4 : 6) : (compact ? 1.5 : 2);
      ctx.beginPath(); ctx.moveTo(fx(f + 1) - cw, by - 6); ctx.lineTo(fx(f + 1) - cw, by + bh + 6); ctx.stroke();
    }
    // strings
    for (let s = 0; s < 6; s++) {
      const yy = sy(s); ctx.strokeStyle = s >= 3 ? '#c9a96a' : '#d8d8e4'; ctx.lineWidth = (compact ? .8 : 1.1) + (s * (compact ? .3 : .45));
      ctx.beginPath(); ctx.moveTo(bx - (f0 === 1 ? padL * .8 : 0), yy); ctx.lineTo(bx + bw, yy); ctx.stroke();
    }
    ctx.restore();

    // fret numbers (never mirrored text)
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.textAlign = 'center'; ctx.font = (compact ? '600 11px ' : '600 13px ') + 'system-ui,sans-serif';
    for (let f = f0; f <= f1; f++) if (!compact || f % 2 === 1 || nF < 10) ctx.fillText(f, mx(fx(f) + cw / 2), by + bh + (compact ? 14 : 22));
    if (f0 === 1 && !compact) { ctx.fillText('open', mx(bx - padL * .45), by + bh + 22); }

    // notes: draw order later -> next -> cur so the current note sits on top
    const order = { dim: 0, scale: 1, later: 2, next: 3, root: 4, cur: 5 };
    const R = Math.min(cw * .42, sp * .42, compact ? 12 : 22);
    [...(o.notes || [])].sort((a, b) => order[a.kind] - order[b.kind]).forEach(n => {
      if (n.fret === 0 ? f0 > 1 : (n.fret < f0 || n.fret > f1)) return;
      const cx = mx(noteX(n.fret)), cy = sy(n.s), col = n.color || STRING_COLORS[n.s];
      ctx.save();
      if (n.kind === 'cur') {
        ctx.shadowColor = col; ctx.shadowBlur = compact ? 14 : 30; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
      } else if (n.kind === 'next') {
        const p = Math.max(0, Math.min(1, n.prog ?? 0));
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = .35 + .65 * p;
        ctx.beginPath(); ctx.arc(cx, cy, R * (1 + (1 - p) * 1.1), 0, 7); ctx.stroke();
        ctx.globalAlpha = .9; ctx.fillStyle = 'rgba(10,10,16,.85)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
      } else if (n.kind === 'later') {
        ctx.globalAlpha = .5; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(10,10,16,.6)';
        ctx.beginPath(); ctx.arc(cx, cy, R * .85, 0, 7); ctx.fill(); ctx.stroke();
      } else if (n.kind === 'root') {
        ctx.fillStyle = o.accent || '#8b5cf6'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      } else if (n.kind === 'dim') {
        ctx.globalAlpha = .35; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, R * .7, 0, 7); ctx.fill();
      } else { // scale
        ctx.fillStyle = col; ctx.globalAlpha = .92; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      }
      ctx.restore();
      const label = n.label != null ? n.label : n.fret;
      if (n.kind !== 'dim' && label !== '') {
        ctx.fillStyle = n.kind === 'next' || n.kind === 'later' ? '#fff' : (n.kind === 'root' ? '#fff' : '#0b0b12');
        ctx.font = `800 ${Math.round(R * (String(label).length > 2 ? .8 : 1.0))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy + 1); ctx.textBaseline = 'alphabetic';
      }
    });
    // technique connectors: slides, hammer-ons / pull-offs between two frets, bends up from a fret
    const head = (x, y, dx, dy) => { const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * 8 - uy * 4, y - uy * 8 + ux * 4); ctx.lineTo(x - ux * 8 + uy * 4, y - uy * 8 - ux * 4); ctx.fill(); };
    (o.links || []).forEach(l => {
      if (l.f0 < (l.f0 === 0 ? 0 : f0) || l.f0 > f1) return;
      const y = sy(l.s), x0 = mx(noteX(l.f0)), x1 = mx(noteX(Math.min(f1, Math.max(f0, l.f1))));
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = compact ? 1.5 : 2.2; ctx.lineCap = 'round';
      if (l.kind === 'b') {
        const tx = x0 + R * 1.5, ty = y - R * 1.9; ctx.beginPath(); ctx.moveTo(x0 + R * .7, y - R * .4); ctx.quadraticCurveTo(x0 + R * 1.7, y - R * .5, tx, ty); ctx.stroke(); head(tx, ty, -.2, -1);
        if (l.label && !compact) { ctx.font = '700 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText(l.label, tx + 6, ty + 4); }
      } else if (l.kind === '/' || l.kind === '\\') {
        const d = Math.sign(x1 - x0) || 1; if (Math.abs(x1 - x0) < R * 2.5) { ctx.restore(); return; }
        ctx.beginPath(); ctx.moveTo(x0 + d * R * 1.1, y); ctx.lineTo(x1 - d * R * 1.2, y); ctx.stroke(); head(x1 - d * R * 1.1, y, d, 0);
      } else if (l.kind === 'h' || l.kind === 'p') {
        ctx.beginPath(); ctx.moveTo(x0, y - R * 1.1); ctx.quadraticCurveTo((x0 + x1) / 2, y - R * 2.6, x1, y - R * 1.1); ctx.stroke();
        if (!compact) { ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(l.kind.toUpperCase(), (x0 + x1) / 2, y - R * 1.9); }
      }
      ctx.restore();
    });
  }

  /** Pick a fret window that fits a set of frets, never narrower than `minSpan` frets. */
  function windowFor(minFret, maxFret, minSpan = 12) {
    let f0 = minFret <= 3 ? 1 : Math.max(1, minFret - 1);
    let f1 = Math.max(maxFret + 1, f0 + minSpan - 1);
    if (f1 > 24) { f1 = 24; f0 = Math.max(1, Math.min(f0, f1 - minSpan + 1)); }
    return [f0, f1];
  }

  /** Little fretboard-free chord diagram. */
  function chordDiagram(ctx, W, H, shape, accent, opt) {
    opt = opt || {}; const f = opt.f || 1, fnt = Math.round(20 * f);
    if (opt.clear !== false) ctx.clearRect(0, 0, W, H);
    if (!shape) return;
    const [a, b] = shape.window, nF = b - a + 1, left = f > 1 ? 56 : 34, top = 44, gw = W - left - 20, gh = H - top - 16, sx = gw / 5, fy = gh / nF;
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2;
    for (let s = 0; s < 6; s++) { ctx.beginPath(); ctx.moveTo(left + s * sx, top); ctx.lineTo(left + s * sx, top + gh); ctx.stroke(); }
    for (let f = 0; f <= nF; f++) { ctx.lineWidth = f === 0 && a === 1 ? 6 : 2; ctx.strokeStyle = f === 0 && a === 1 ? '#e8e2d0' : 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.moveTo(left, top + f * fy); ctx.lineTo(left + 5 * sx, top + f * fy); ctx.stroke(); }
    if (a > 1) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `700 ${fnt}px system-ui`; ctx.textAlign = 'right'; ctx.fillText(a + 'fr', left - 8, top + fy * .65); }
    const pos = shape.frets.filter(f => f > 0), mf = pos.length ? Math.min(...pos) : 0;
    if (mf > 0) { const idx = shape.frets.map((f, i) => (f === mf ? i : -1)).filter(i => i >= 0); if (idx.length >= 3 || (idx.length === 2 && idx[1] - idx[0] >= 3)) { const y = top + (mf - a + .5) * fy, r = Math.min(14, fy * .4); ctx.fillStyle = accent || '#8b5cf6'; ctx.beginPath(); ctx.roundRect(left + idx[0] * sx - r, y - r, (idx[idx.length - 1] - idx[0]) * sx + 2 * r, 2 * r, r); ctx.fill(); } }
    shape.frets.forEach((f, s) => {
      const cx = left + s * sx;
      if (f < 0) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `700 ${fnt}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('×', cx, top - 12); }
      else if (f === 0) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.lineWidth = 2.5 * Math.min(f, 1.6); ctx.arc(cx, top - 15, 7 * Math.min(f, 1.5), 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = accent || '#8b5cf6'; ctx.beginPath(); ctx.arc(cx, top + (f - a + .5) * fy, Math.min(14, fy * .4), 0, 7); ctx.fill(); }
    });
  }

  RCC.fret = { draw, windowFor, chordDiagram, STRING_COLORS };
})();
