/* Library merge used by both the app and the (optional) sync server. Newest edit wins per item; deletions are remembered. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RCC = root.RCC || {}; root.RCC.sync = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  const ts = x => (x && (x.updated || x.added)) || 0;
  const newest = (a, b) => (ts(b) > ts(a) ? b : a);
  /** value maps like known chords / learned scales: +timestamp = on, -timestamp = off; larger |ts| wins */
  function mergeFlags(a = {}, b = {}) { const o = { ...a }; for (const k in b) if (!(k in o) || Math.abs(b[k]) > Math.abs(o[k])) o[k] = b[k]; return o; }
  function mergeStats(a = {}, b = {}) {
    const base = (b.updated || 0) > (a.updated || 0) ? { ...a, ...b } : { ...b, ...a };
    const days = {}; for (const d of new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})])) {
      const x = (a.days || {})[d] || {}, y = (b.days || {})[d] || {};
      days[d] = { ...y, ...x, sec: Math.max(x.sec || 0, y.sec || 0), songs: [...new Set([...(x.songs || []), ...(y.songs || [])])] };
    }
    base.days = days; base.lessons = { ...(a.lessons || {}), ...(b.lessons || {}) }; base.achievements = { ...(a.achievements || {}), ...(b.achievements || {}) };
    return base;
  }
  /** @param a local library  @param b remote library */
  function mergeLibs(a, b) {
    a = a || {}; b = b || {};
    const deleted = { ...(b.deleted || {}) }; for (const k in a.deleted || {}) deleted[k] = Math.max(deleted[k] || 0, a.deleted[k]);
    const byId = new Map();
    [...(b.songs || []), ...(a.songs || [])].forEach(s => { const cur = byId.get(s.id); byId.set(s.id, cur ? newest(cur, s) : s); });
    const songs = [...byId.values()].filter(s => !(deleted[s.id] > ts(s))).sort((x, y) => (y.added || 0) - (x.added || 0));
    const ids = new Set(songs.map(s => s.id)), pl = new Map();
    [...(b.playlists || []), ...(a.playlists || [])].forEach(p => { const cur = pl.get(p.id); pl.set(p.id, cur ? newest(cur, p) : p); });
    const playlists = [...pl.values()].filter(p => !(deleted[p.id] > ts(p))).map(p => ({ ...p, songIds: (p.songIds || []).filter(i => ids.has(i)) }));
    return { v: 2, songs, playlists, known: mergeFlags(a.known, b.known), scales: mergeFlags(a.scales, b.scales), stats: mergeStats(a.stats, b.stats), deleted };
  }
  return { mergeLibs, mergeFlags, mergeStats };
});
