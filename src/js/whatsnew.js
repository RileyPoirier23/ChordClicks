/* "What's new": shown once after an update (compares the running version with the last one seen). */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const log = () => window.RCC_CHANGELOG || [];
  const current = () => (log()[0] || {}).version || '';
  const item = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\(Pro\)|\(export is Pro\)/g, m => `<span class="pro-tag">${m === '(Pro)' ? 'PRO' : 'export: PRO'}</span>`);
  function open(all) {
    const a = RCC.app, L = all ? log() : log().slice(0, 1); if (!a || !L.length) return;
    a.dialog(`<h2>What’s new${all ? '' : ' in ' + esc(L[0].version)}</h2>${L.map(e => `<div class="wn"><b class="wn-v">${esc(e.version)}</b><span class="small">${esc(e.date)}</span><ul>${e.items.map(i => `<li>${item(i)}</li>`).join('')}</ul></div>`).join('')}
      <div class="row" style="justify-content:space-between;margin-top:12px"><a class="small" href="https://www.506clicks.ca/changelog/" target="_blank" rel="noreferrer">Full changelog on 506clicks.ca</a><div class="row" style="margin:0;gap:8px">${all ? '' : '<button class="btn" id="wn-all">Older versions</button>'}<button class="btn p" id="wn-x">Got it</button></div></div>`, () => {
      document.getElementById('wn-x').onclick = a.closeDlg; const b = document.getElementById('wn-all'); if (b) b.onclick = () => open(true);
    });
    document.getElementById('dlg').classList.add('wide');
  }
  /** Call after boot: shows the dialog once per version, never on a first run (the welcome tour covers that). */
  function maybe() {
    const v = current(); if (!v) return false; let seen = ''; try { seen = localStorage.getItem('rcc-seen-version') || ''; } catch (e) {}
    try { localStorage.setItem('rcc-seen-version', v); } catch (e) {}
    const P = RCC.app && RCC.app.P; if (!seen) return false; // first launch (or upgraded from before this dialog existed): stay quiet
    if (seen === v) return false; if (document.getElementById('modal').classList.contains('on')) return false; // welcome / splash already up
    open(false); return true;
  }
  RCC.whatsnew = { open, maybe, current };
})();
