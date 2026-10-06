/* Twitch chat request parsing + matching requests to songs in the library. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RCC = root.RCC || {}; root.RCC.requests = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  /** Parse one IRC line from Twitch. Returns {nick, text} for chat messages, {ping:true} for PING, else null. */
  function parseIrc(line) {
    line = String(line).replace(/\r?\n$/, '');
    if (/^PING/.test(line)) return { ping: true };
    const m = /^(?:@(\S+) )?:([^!\s]+)![^ ]+ PRIVMSG #\S+ :(.*)$/.exec(line);
    if (!m) return null;
    const tags = {}; (m[1] || '').split(';').forEach(t => { const [k, v] = t.split('='); if (k) tags[k] = v; });
    return { nick: tags['display-name'] || m[2], text: m[3], tags };
  }
  /** "!request Wonderwall - Oasis" -> "Wonderwall - Oasis" (or null). */
  function parseCommand(text, prefixes = ['!request', '!sr', '!song']) {
    const t = String(text).trim();
    for (const p of prefixes) if (t.toLowerCase().startsWith(p + ' ')) { const q = t.slice(p.length).trim().slice(0, 100); return q || null; }
    return null;
  }
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  /** Best library match for a free-text query by words in title/artist. */
  function matchSong(query, songs) {
    const qw = norm(query).split(' ').filter(Boolean); if (!qw.length) return null;
    let best = null, bs = 0;
    songs.forEach(s => { const hay = norm(s.title + ' ' + s.artist); const hit = qw.filter(w => hay.includes(w)).length, sc = hit / qw.length + (norm(s.title) === norm(query) ? 1 : 0); if (sc > bs) { bs = sc; best = s; } });
    return bs >= 0.67 ? best : null;
  }
  return { parseIrc, parseCommand, matchSong };
});
