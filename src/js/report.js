/* Weekly progress report: this week vs last, chords learned, drills, bests — shown in Learn → Progress and optionally emailed
   through the helper server (Resend). */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fmtMin = s => (s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm' : Math.round(s / 60) + ' min');
  /** Pure: numbers for the last 7 days vs the 7 before. `now` for tests. */
  function compute(lib, now = Date.now()) {
    const st = lib.stats || {}, days = st.days || {}, known = lib.known || {};
    const span = (from, to) => { let sec = 0, active = 0; const songs = new Set(), drills = {}; for (let i = from; i < to; i++) { const d = new Date(now); d.setDate(d.getDate() - i); const r = days[key(d)]; if (!r) continue; sec += r.sec || 0; if ((r.sec || 0) >= 60 || (r.songs || []).length) active++; (r.songs || []).forEach(s => songs.add(s)); Object.entries(r.drills || {}).forEach(([k, n]) => drills[k] = (drills[k] || 0) + n); } return { sec, active, songs: songs.size, drills }; };
    const week = span(0, 7), prev = span(7, 14);
    const learned = Object.entries(known).filter(([, v]) => v > now - 7 * 864e5).map(([c]) => c);
    const scales = Object.entries(lib.scales || {}).filter(([, v]) => v > now - 7 * 864e5).length;
    const bests = Object.entries((st.changes || {})).filter(([, r]) => (r.hist || []).some(h => (h.at || 0) > now - 7 * 864e5)).map(([k, r]) => ({ pair: k.replace('|', ' ⇄ '), best: r.best }));
    const perDay = []; for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); perDay.push({ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], sec: (days[key(d)] || {}).sec || 0 }); }
    const delta = prev.sec ? Math.round((week.sec - prev.sec) / prev.sec * 100) : null;
    let note; if (!week.sec) note = 'No practice logged this week. Even ten minutes counts — open a song and press Start.'; else if (week.active >= 5) note = 'Five or more days on the guitar. That is how it gets easy.'; else if (delta != null && delta > 20) note = 'Up on last week. Keep the streak going.'; else if (delta != null && delta < -20) note = 'Quieter than last week. Short and daily beats long and rare.'; else note = 'Steady. Try one new chord or a chord-change drill this week.';
    return { week, prev, delta, learned, scales, bests, perDay, note };
  }
  function html(r, name) {
    const max = Math.max(60, ...r.perDay.map(d => d.sec));
    const bars = r.perDay.map(d => `<td style="vertical-align:bottom;text-align:center;padding:0 3px"><div style="background:#c8102e;height:${Math.round(d.sec / max * 60)}px;min-height:2px"></div><div style="font:11px monospace;color:#555">${d.day}</div></td>`).join('');
    return `<div style="font-family:Segoe UI,system-ui,Arial;color:#121212;background:#f3f0e8;padding:20px;max-width:560px;border:1px solid #121212">
      <div style="font:800 24px/1.1 Arial;letter-spacing:-.02em">Your ChordClicks week${name ? ', ' + esc(name) : ''}</div>
      <div style="font:13px monospace;color:#555;margin:4px 0 14px">${new Date().toLocaleDateString()}</div>
      <table style="border-collapse:collapse;width:100%"><tr><td style="padding:0 10px 0 0;border:1px solid #121212;padding:8px"><div style="font:800 26px Arial">${fmtMin(r.week.sec)}</div><div style="font:12px monospace">practised${r.delta != null ? ` · ${r.delta >= 0 ? '+' : ''}${r.delta}% vs last week` : ''}</div></td>
      <td style="border:1px solid #121212;padding:8px"><div style="font:800 26px Arial">${r.week.active}/7</div><div style="font:12px monospace">days played</div></td>
      <td style="border:1px solid #121212;padding:8px"><div style="font:800 26px Arial">${r.week.songs}</div><div style="font:12px monospace">songs</div></td></tr></table>
      <table style="margin:14px 0 6px;width:100%"><tr>${bars}</tr></table>
      <p style="font:14px/1.5 Arial">${esc(r.note)}</p>
      <ul style="font:14px/1.6 Arial;padding-left:18px;margin:0">${r.learned.length ? `<li><b>Chords marked known:</b> ${esc(r.learned.join(', '))}</li>` : ''}${r.scales ? `<li><b>Scales learned:</b> ${r.scales}</li>` : ''}${r.bests.map(b => `<li><b>${esc(b.pair)}</b> — best ${b.best}/min</li>`).join('')}${Object.entries(r.week.drills).map(([k, n]) => `<li>${n}× ${esc(k)} drill${n > 1 ? 's' : ''}</li>`).join('')}</ul>
      <div style="font:11px monospace;color:#555;margin-top:16px">ChordClicks by 506clicks · you asked for this from the app, it is not a mailing list</div></div>`;
  }
  function open() {
    const a = RCC.app, S = RCC.store, r = compute(S.lib), name = (RCC.pro.status() || {}).name || '';
    let email = ''; try { email = localStorage.getItem('rcc-email') || ''; } catch (e) {}
    const helper = (RCC.pro.config().helper || '').replace(/\/+$/, '');
    a.dialog(`<h2>Weekly report</h2><div class="report">${html(r, name)}</div>
      <div class="row" style="margin-top:12px;gap:8px"><input id="rp-email" class="grow" type="email" placeholder="you@example.com" value="${esc(email)}"><button class="btn" id="rp-send" ${helper ? '' : 'disabled title="Needs the helper server"'}>Email it to me</button><button class="btn ghost" id="rp-x">Close</button></div><div class="small" id="rp-msg">${helper ? 'One email, now. Nothing recurring unless you ask again.' : 'Emailing needs the ChordClicks helper server (Settings).'}</div>`, () => {
      document.getElementById('rp-x').onclick = a.closeDlg;
      document.getElementById('rp-send').onclick = async () => {
        const e = document.getElementById('rp-email').value.trim(), m = document.getElementById('rp-msg'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { m.textContent = 'Enter a real email address.'; return; }
        try { localStorage.setItem('rcc-email', e); } catch (x) {} m.textContent = 'Sending…';
        try { const x = await fetch(helper + '/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, subject: 'Your ChordClicks week', html: html(r, name) }), signal: AbortSignal.timeout(15000) }).then(y => y.json()); m.textContent = x && x.ok ? '✓ Sent. Check your inbox.' : (x && x.error) || 'The server could not send it.'; } catch (err) { m.textContent = 'No answer from the helper server.'; }
      };
    });
    document.getElementById('dlg').classList.add('wide');
  }
  RCC.report = { compute, html, open };
})();
