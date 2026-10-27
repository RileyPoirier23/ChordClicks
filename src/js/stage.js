/* Stage mode (Pro): the chord sheet full screen in big type, the current chord lit, page turns from a pedal (Page Down / →),
   next song from the set list at the end. Esc leaves. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const $ = id => document.getElementById(id);
  let on = false, timer = null, lastPi = -1, size = 0;
  function el() { let w = $('stagewrap'); if (w) return w; w = document.createElement('div'); w.id = 'stagewrap'; w.innerHTML = `<div class="st-head"><div><b id="st-title"></b><span id="st-meta" class="small"></span></div><div class="st-ctl"><button class="btn sm" id="st-prev" title="Previous song">⏮</button><button class="btn sm" id="st-play" title="Space">▶</button><button class="btn sm" id="st-next" title="Next song">⏭</button><button class="btn sm" id="st-minus">A−</button><button class="btn sm" id="st-plus">A+</button><button class="btn sm" id="st-x" title="Esc">Exit</button></div></div><div class="st-now"><b id="st-cur">—</b><span id="st-nxt"></span></div><div class="st-sheet" id="st-sheet"></div><div class="st-foot small">Page Down / → turns the page · Space start/stop · at the end: next song</div>`; document.body.appendChild(w);
    $('st-x').onclick = close; $('st-prev').onclick = () => { $('sp').click(); refresh(); }; $('st-next').onclick = () => { $('sn').click(); refresh(); }; $('st-play').onclick = () => RCC.app.toggle();
    $('st-minus').onclick = () => zoom(-2); $('st-plus').onclick = () => zoom(2);
    w.querySelector('#st-sheet').onclick = e => { const c = e.target.closest('.c'); if (c) RCC.app.setPi(+c.dataset.pi); };
    return w;
  }
  function zoom(d) { size = Math.max(16, Math.min(60, size + d)); $('st-sheet').style.fontSize = size + 'px'; try { localStorage.setItem('rcc-stage-size', size); } catch (e) {} }
  function refresh() {
    const a = RCC.app, s = a.song || {}, m = s.meta || {};
    $('st-title').textContent = s.title || 'Chord sheet'; $('st-meta').textContent = [s.artist, m.key && 'Key ' + m.key, m.capo && 'Capo ' + m.capo, (a.P.bpm || 0) + ' bpm'].filter(Boolean).join(' · ');
    $('st-sheet').innerHTML = $('sheet').innerHTML; lastPi = -1; tick();
  }
  function tick() {
    const a = RCC.app, pi = a.pi, prog = a.prog; $('st-play').textContent = a.running ? '■' : '▶';
    if (pi === lastPi) return; lastPi = pi;
    $('st-cur').textContent = prog[pi] ? prog[pi].c : '—'; $('st-nxt').textContent = prog[pi + 1] ? 'next ' + prog[pi + 1].c : '';
    const sh = $('st-sheet'); sh.querySelectorAll('.c').forEach(e => e.classList.toggle('hl', +e.dataset.pi === pi));
    const t = sh.querySelector('.c.hl'); if (t && a.P.follow !== false) { const r = t.getBoundingClientRect(), b = sh.getBoundingClientRect(); if (r.top < b.top + 40 || r.bottom > b.bottom - 80) sh.scrollTop += r.top - b.top - b.height * .3; }
  }
  function page(d) { const sh = $('st-sheet'); const atEnd = sh.scrollTop + sh.clientHeight >= sh.scrollHeight - 4; if (d > 0 && atEnd) { $('sn').click(); refresh(); sh.scrollTop = 0; return; } sh.scrollBy({ top: d * (sh.clientHeight - 60), behavior: 'smooth' }); }
  function key(e) {
    if (!on || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') { close(); e.preventDefault(); } else if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'ArrowDown') { page(1); e.preventDefault(); } else if (e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') { page(-1); e.preventDefault(); } else if (e.key === ' ') { RCC.app.toggle(); e.preventDefault(); }
  }
  function open() {
    const a = RCC.app; if (!a.song || !a.prog.length) { a.toast('Load a song first'); return; }
    if (RCC.pro && !RCC.pro.gate('library')) return;
    el(); try { size = +localStorage.getItem('rcc-stage-size') || 0; } catch (e) {} size = size || (matchMedia('(pointer:coarse)').matches ? 22 : 30); $('st-sheet').style.fontSize = size + 'px';
    on = true; document.body.classList.add('stage'); refresh(); timer = setInterval(tick, 150); document.addEventListener('keydown', key, true);
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }
  function close() { on = false; clearInterval(timer); document.body.classList.remove('stage'); document.removeEventListener('keydown', key, true); if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }
  RCC.stage = { open, close, get on() { return on; } };
})();
