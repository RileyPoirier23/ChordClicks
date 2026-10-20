/* Library extras: difficulty ratings, "songs you can play", import (paste / ChordPro / file), transpose + capo helper, setlist notes + PDF. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const T = RCC.theory, SG = RCC.song, $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const A = () => RCC.app, S = () => RCC.store;
  const cache = new Map();

  /** {names, level, label, reasons, unknown[]} for a song */
  function info(s) {
    const k = s.id + ':' + (s.text || '').length + ':' + (s.bpm || 0) + ':' + ((s.strums || [])[0] || {}).pat + ':' + S().knownCount();
    let m = cache.get(k); if (m) return m;
    const names = SG.chordNames ? SG.chordNames(s.text || '') : SG.parseSheet(s.text || '').prog.map(p => p.c), uniq = [...new Set(names.map(T.canon))];
    const d = T.songDifficulty(names, s.bpm || ((s.strums || []).find(x => x.bpm) || {}).bpm || 90, ((s.strums || [])[0] || {}).pat || s.pat || '');
    m = { names, uniq, ...d, unknown: uniq.filter(n => !S().knows(n)) }; if (cache.size > 400) cache.clear(); cache.set(k, m); return m;
  }
  const badge = m => (m.level ? `<span class="tag lv${m.level}" title="${esc(m.reasons.join(' · ') || 'Difficulty')}">${'●'.repeat(m.level)}<span style="opacity:.3">${'●'.repeat(5 - m.level)}</span> ${m.label}</span>` : '') + (m.uniq && m.uniq.length ? (m.unknown.length ? `<span class="tag warn" title="${esc(m.unknown.join(', '))}">+${m.unknown.length} new chord${m.unknown.length > 1 ? 's' : ''}</span>` : '<span class="tag ok">you know all chords</span>') : '');
  const passes = (m, f) => f === 'all' || (f === 'play' && m.uniq.length && !m.unknown.length) || (f === 'close' && m.uniq.length && m.unknown.length <= 2);

  /* ================================================================ import */
  function openImport(prefill) {
    const a = A(); prefill = prefill || {};
    a.dialog(`<h2>Import a song</h2><div class="small">Paste chords (with lyrics), a ChordPro file, or just lyrics. Works with text from any website.</div>
      <div class="row" style="margin-top:12px"><input id="im-t" class="grow" placeholder="Title" value="${esc(prefill.title || '')}"><input id="im-a" class="grow" placeholder="Artist" value="${esc(prefill.artist || '')}"></div>
      <div class="row"><input id="im-g" list="genres" class="grow" placeholder="Genre (optional)"><label class="btn sm" style="cursor:pointer">Open file…<input type="file" id="im-f" accept=".txt,.pro,.cho,.chopro,.crd,.md" style="display:none"></label></div>
      <textarea id="im-x" rows="12" spellcheck="false" placeholder="[Verse]&#10;Am          F&#10;Hello darkness my old friend&#10;&#10;— or ChordPro: [Am]Hello [F]darkness —&#10;— or only lyrics; add chords later with Edit —" style="width:100%;margin-top:6px">${esc(prefill.text || '')}</textarea>
      <div class="small" id="im-msg" style="min-height:18px"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="im-c">Cancel</button><button class="btn p" id="im-ok">Add to library</button></div>`, () => {
      const f = $('im-f'); f.onchange = async () => { const file = f.files[0]; if (!file) return; const t = await file.text(); $('im-x').value = t; if (!$('im-t').value) $('im-t').value = file.name.replace(/\.[^.]+$/, ''); check(); };
      const check = () => { const t = $('im-x').value; if (SG.looksLikeChordPro && SG.looksLikeChordPro(t)) $('im-msg').textContent = 'ChordPro detected — it will be converted to a chord sheet.'; else { const n = SG.parseSheet(t).prog.length; $('im-msg').textContent = n ? n + ' chords found.' : t.trim() ? 'No chords found. That’s fine — add them later with Edit.' : ''; } };
      $('im-x').oninput = check; $('im-c').onclick = a.closeDlg; check();
      $('im-ok').onclick = () => {
        if (RCC.pro && !RCC.pro.canAddSong(S().lib.songs.length)) { a.closeDlg(); RCC.pro.upsell('library'); return; }
        let text = $('im-x').value, title = $('im-t').value.trim(), artist = $('im-a').value.trim(); if (!text.trim()) { $('im-msg').textContent = 'Paste some text first.'; return; }
        if (SG.looksLikeChordPro && SG.looksLikeChordPro(text)) { const c = SG.fromChordPro(text); text = c.text; title = title || c.title; artist = artist || c.artist; }
        const found = SG.findStrumsInText(text), s = S().addSong({ title: title || 'Untitled', artist, text, strums: found, genre: $('im-g').value.trim() });
        a.closeDlg(); a.toast('Added “' + s.title + '”'); a.playList([s.id], s.id, '');
      };
    });
  }

  /* ================================================================ transpose + capo */
  function openTranspose() {
    const a = A(), song = a.song; if (!song || !(song.text || '').trim()) { a.toast('Load a song first'); return; }
    let semis = 0; const text = $('paste').value || song.text, names = SG.chordNames(text), key = T.guessKey(names), uniq = [...new Set(names)];
    const diffAvg = list => list.length ? list.reduce((x, n) => x + T.chordDifficulty(n), 0) / list.length : 0;
    const render = () => {
      const flats = key ? T.prefersFlats((key.root + semis + 12) % 12) : false, shown = uniq.map(n => T.transposeChord(n, semis, flats));
      const caps = [0, 1, 2, 3, 4, 5, 6, 7].map(c => { const sh = uniq.map(n => T.transposeChord(n, semis - c, T.prefersFlats(((key ? key.root : 0) + semis - c + 120) % 12))); return { c, sh, d: diffAvg(sh) }; }), best = caps.reduce((x, y) => (y.d < x.d - .05 ? y : x), caps[0]);
      const kn = key ? T.NOTES[(key.root + semis + 12) % 12] + (key.type === 'minor' ? 'm' : '') : '?';
      $('tp-body').innerHTML = `<div class="row" style="margin:0"><button class="btn" id="tp-d">−1</button><div style="text-align:center;min-width:110px"><div class="small">Key</div><b style="font-size:26px">${kn}</b></div><button class="btn" id="tp-u">+1</button><span class="small">${semis ? (semis > 0 ? '+' : '') + semis + ' semitones' : 'original key'}</span></div>
        <div class="small" style="margin:10px 0 4px">Chords after transposing</div><div class="chain">${shown.slice(0, 14).map(n => `<span class="dch"><b>${esc(n)}</b></span>`).join('')}</div>
        <div class="small" style="margin:14px 0 4px">Capo helper — play easier shapes at the same pitch ${best.c ? `<b style="color:var(--gr)">(capo ${best.c} is easiest)</b>` : ''}</div>
        <table class="nashv">${caps.map(x => `<tr class="${x.c === best.c ? 'best' : ''}"><th>Capo ${x.c || '—'}</th><td style="text-align:left">${x.sh.slice(0, 8).map(esc).join('  ')}${x.sh.length > 8 ? ' …' : ''}</td><td>${'●'.repeat(Math.round(x.d))}</td><td><button class="btn sm" data-c="${x.c}">Use</button></td></tr>`).join('')}</table>`;
      $('tp-d').onclick = () => { semis--; render(); }; $('tp-u').onclick = () => { semis++; render(); };
      $('tp-body').querySelectorAll('[data-c]').forEach(b => b.onclick = () => apply(semis - +b.dataset.c, +b.dataset.c));
    };
    const apply = (sm, capo) => {
      const flats = key ? T.prefersFlats(((key.root + sm) % 12 + 12) % 12) : false, nt = sm ? SG.transposeText(text, sm, flats) : text; // sm = shape shift
      a.replaceText(nt, { capo: capo ? String(capo) : '', key: key ? T.NOTES[(key.root + semis + 12) % 12] + (key.type === 'minor' ? 'm' : '') : '' }); a.closeDlg(); a.toast(capo ? `Capo ${capo}: sheet now shows easier shapes` : sm ? 'Transposed' : 'Unchanged');
    };
    a.dialog(`<h2>Key &amp; capo</h2><div id="tp-body"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="tp-c">Close</button><button class="btn p" id="tp-ok">Apply transpose</button></div>`, () => { $('tp-c').onclick = a.closeDlg; $('tp-ok').onclick = () => apply(semis, 0); render(); });
  }

  /* ================================================================ setlists */
  function openNotes(pid) {
    const a = A(), p = S().playlist(pid); if (!p) return; if (RCC.pro && !RCC.pro.gate('library')) return;
    a.dialog(`<h2>Gig notes · ${esc(p.name)}</h2><div class="small">Venue, start time, gear, cues… printed on the set sheet.</div><textarea id="gn" rows="9" style="width:100%;margin-top:10px" placeholder="Venue: …&#10;Soundcheck 6:30&#10;Capo songs first. Water on stage.">${esc(p.notes || '')}</textarea><div class="row" style="justify-content:flex-end"><button class="btn" id="gn-c">Cancel</button><button class="btn p" id="gn-ok">Save notes</button></div>`, () => { $('gn-c').onclick = a.closeDlg; $('gn-ok').onclick = () => { S().setPlaylistNotes(pid, $('gn').value); a.closeDlg(); a.toast('Notes saved'); }; });
  }
  function setHtml(p) {
    const songs = p.songIds.map(id => S().song(id)).filter(Boolean), css = `body{font:13px/1.45 system-ui,Segoe UI,Arial;color:#111;margin:0}h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:0}.sub{color:#555;margin-bottom:14px}.list{columns:1;margin:10px 0 18px;padding:0;list-style:none}.list li{padding:5px 0;border-bottom:1px solid #ddd;display:flex;gap:10px}.list b{min-width:24px;color:#777}.notes{white-space:pre-wrap;background:#f4f4f8;border-left:4px solid #7c3aed;padding:10px 14px;margin:10px 0 18px}pre{font:12.5px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;margin:8px 0 0}.song{page-break-before:always}.meta{color:#555;margin:2px 0 6px}.ch{display:inline-block;background:#eee;border-radius:6px;padding:1px 7px;margin:0 3px 3px 0;font-weight:700}`;
    const body = songs.map((s, i) => { const m = info(s), cap = s.meta && s.meta.capo ? 'Capo ' + s.meta.capo : '', key = (s.meta && s.meta.key) || ''; return `<div class="song"><h2>${i + 1}. ${esc(s.title)}</h2><div class="meta">${[s.artist, key && 'Key ' + key, cap, s.bpm && s.bpm + ' bpm', ((s.strums || [])[0] || {}).pat && 'Strum ' + s.strums[0].pat].filter(Boolean).map(esc).join(' · ')}</div><div>${m.uniq.map(n => `<span class="ch">${esc(n)}</span>`).join('')}</div><pre>${esc(s.text || '')}</pre></div>`; }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.name)}</title><style>${css}</style></head><body><h1>${esc(p.name)}</h1><div class="sub">${songs.length} songs · ${new Date().toLocaleDateString()}</div>${p.notes ? `<div class="notes">${esc(p.notes)}</div>` : ''}<ol class="list">${songs.map((s, i) => `<li><b>${i + 1}</b><span><b style="color:#111;min-width:0">${esc(s.title)}</b> <span style="color:#666">${esc(s.artist || '')}</span> <span style="color:#7c3aed">${esc((s.meta && s.meta.key) || '')}${s.meta && s.meta.capo ? ' · capo ' + esc(s.meta.capo) : ''}</span></span></li>`).join('')}</ol>${body}</body></html>`;
  }
  async function exportSet(pid, how) {
    const a = A(), p = S().playlist(pid); if (!p) return; if (RCC.pro && !RCC.pro.gate('library')) return; if (!p.songIds.length) { a.toast('This playlist is empty'); return; }
    const html = setHtml(p), R = window.rcc;
    if (how !== 'print' && R && R.savePdf) { const r = await R.savePdf(p.name.replace(/[^\w\- ]/g, '_') + '.pdf', html); a.toast(r && r.ok ? 'PDF saved: ' + r.path : r && r.error ? r.error : 'Cancelled'); return; }
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; fr.srcdoc = html; document.body.appendChild(fr);
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { a.toast('Printing is not available here'); } setTimeout(() => fr.remove(), 4000); };
  }

  RCC.lib2 = { info, badge, passes, openImport, openTranspose, openNotes, exportSet };
})();
