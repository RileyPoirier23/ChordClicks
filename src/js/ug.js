/* Ultimate Guitar without the website: search, pick a version, preview, import.
   Pages are fetched as HTML (desktop: main process; mobile app: native HTTP) and the song data is read from
   the page's embedded JSON store. If a plain fetch is refused (bot check), the hidden <webview> loads the page
   and hands the same JSON back. Nothing from UG is ever shown as a web page. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const SG = RCC.song, R = window.rcc;
  const BASE = 'https://www.ultimate-guitar.com';
  const KEEP = { Chords: 'Chords', Tab: 'Tab', Tabs: 'Tab', 'Bass Tabs': 'Bass', 'Ukulele Chords': 'Ukulele' };
  const unesc = s => String(s).replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  /** The JSON blob UG embeds in every page (<div class="js-store" data-content="…">). */
  function storeFromHtml(html) {
    const m = /class="js-store"[^>]*?data-content="([^"]*)"/.exec(html) || /data-content="([^"]*)"[^>]*?class="js-store"/.exec(html);
    if (!m) return null;
    try { return JSON.parse(unesc(m[1])); } catch (e) { return null; }
  }
  const online = () => navigator.onLine !== false;

  async function fetchHtml(url) {
    if (R && R.ug) { const r = await R.ug.fetch(url); if (!r || !r.ok) throw new Error(r && r.error || 'Could not reach Ultimate Guitar'); return r.html; }
    const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    try { const r = await fetch(url, { credentials: 'omit', headers: { accept: 'text/html' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }
    catch (e) { if (native) throw e; throw new Error('the browser version can’t load Ultimate Guitar pages directly. Use “Paste instead…”, or the desktop / phone app'); }
  }
  /** Fallback: let the hidden webview render the page (handles bot checks) and read the same store. */
  function viaWebview(url) {
    const v = document.getElementById('ugv'); if (!v || typeof v.executeJavaScript !== 'function') return Promise.reject(new Error('no webview'));
    return new Promise((res, rej) => {
      let done = false; const t = setTimeout(() => { if (!done) { done = true; rej(new Error('Ultimate Guitar took too long')); } }, 25000);
      const onReady = async () => {
        if (done) return; try {
          const j = await v.executeJavaScript(`(()=>{const e=document.querySelector('.js-store');return e?e.dataset.content:null})()`);
          if (!j) return; // not rendered yet – wait for the next dom-ready/did-finish-load
          done = true; clearTimeout(t); v.removeEventListener('did-finish-load', onReady); v.removeEventListener('dom-ready', onReady); res(JSON.parse(j));
        } catch (e) { if (!done) { done = true; clearTimeout(t); rej(e); } }
      };
      v.addEventListener('dom-ready', onReady); v.addEventListener('did-finish-load', onReady); v.src = url;
    });
  }
  async function getStore(url) {
    if (!online()) throw new Error('offline');
    let store = null, err = null;
    try { store = storeFromHtml(await fetchHtml(url)); } catch (e) { err = e; }
    if (!store) { try { store = await viaWebview(url); } catch (e) { err = err || e; } }
    if (!store) throw err || new Error('Could not read that page');
    return store;
  }
  const page = store => (store && store.store && store.store.page && store.store.page.data) || (store && store.page && store.page.data) || null;

  /** @returns {Promise<{results:Array, more:boolean}>} */
  async function search(q, { type = 'chords', page: pg = 1 } = {}) {
    const url = `${BASE}/search.php?search_type=title&value=${encodeURIComponent(q)}${pg > 1 ? '&page=' + pg : ''}`;
    const d = page(await getStore(url)) || {};
    let list = d.results || (d.data && d.data.tabs) || [];
    if (!Array.isArray(list)) list = [];
    const out = list.filter(r => r && r.tab_url && KEEP[r.type] && !r.marketing_type).map(r => ({
      id: r.id, title: r.song_name || '', artist: r.artist_name || '', type: KEEP[r.type], version: +r.version || 1, rating: +r.rating || 0, votes: +r.votes || 0,
      key: r.tonality_name || '', difficulty: r.difficulty || '', url: r.tab_url, capo: r.capo != null ? r.capo : '',
    })).filter(r => type === 'all' || (type === 'chords' ? r.type === 'Chords' : r.type === 'Tab'));
    const pages = d.pagination && d.pagination.total;
    return { results: out, more: pages ? pg < pages : out.length >= 20 };
  }

  /** Everything we can grab from one chords/tab page. */
  async function tab(url) {
    const d = page(await getStore(url)); if (!d || !d.tab_view) throw new Error('Not a song page');
    const t = d.tab || {}, tv = d.tab_view, m = tv.meta || {};
    const text = (tv.wiki_tab && tv.wiki_tab.content) || '';
    let strums = SG.extractStrumsFromJSON({ strummings: tv.strummings || [] });
    if (!strums.length) strums = SG.extractStrumsFromJSON(tv);
    if (!strums.length) strums = SG.findStrumsInText(text);
    const tuningName = m.tuning ? (typeof m.tuning === 'string' ? m.tuning : [m.tuning.name, m.tuning.value].filter(Boolean).join(' · ')) : '';
    const txtMeta = SG.findMetaInText(text);
    const meta = {
      key: t.tonality_name || m.tonality || txtMeta.key || '',
      capo: m.capo != null && m.capo !== '' ? String(m.capo) : (txtMeta.capo || ''),
      tuning: tuningName || txtMeta.tuning || '',
      difficulty: t.difficulty || m.difficulty || '',
      type: KEEP[t.type] || t.type || '',
    };
    if (meta.capo === '0') meta.capo = '';
    const bpm = (strums.find(s => s.bpm) || {}).bpm || txtMeta.bpm || 0;
    const chords = SG.chordNames(text);
    return { title: t.song_name || '', artist: t.artist_name || '', text, strums, meta, bpm, chords: [...new Set(chords)], url, rating: +t.rating || 0, votes: +t.votes || 0, version: +t.version || 1 };
  }

  RCC.ug = { search, tab, storeFromHtml, online, BASE };
})();
