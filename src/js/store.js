/* Library, playlists and accounts. Talks to the Electron main process when available;
   in a plain browser it falls back to localStorage (no accounts). */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const B = window.rcc;                    // preload bridge (Electron only)
  const GENRE_COLORS = { rock: '#f43f5e', pop: '#ec4899', country: '#f59e0b', blues: '#3b82f6', metal: '#94a3b8', folk: '#84cc16', punk: '#ef4444', indie: '#14b8a6', jazz: '#a855f7', worship: '#fbbf24', classic: '#fb923c', other: '#8b5cf6' };
  const PRESET_GENRES = ['Rock', 'Pop', 'Country', 'Blues', 'Metal', 'Folk', 'Punk', 'Indie', 'Jazz', 'Worship', 'Classic', 'Other'];
  const PL_COLORS = ['#8b5cf6', '#ec4899', '#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#a3e635'];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const norm = s => String(s || '').trim().toLowerCase();

  function genreColor(g) {
    const k = norm(g); if (!k) return GENRE_COLORS.other;
    if (GENRE_COLORS[k]) return GENRE_COLORS[k];
    let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 70% 60%)`;
  }

  const S = {
    user: null, lib: { v: 2, songs: [], playlists: [], known: {}, scales: {}, stats: { days: {} }, deleted: {} }, _l: [], _t: null,
    PRESET_GENRES, PL_COLORS, genreColor,
    on(f) { this._l.push(f); }, emit() { this._l.forEach(f => { try { f(); } catch (e) { console.error(e); } }); },

    async init() {
      if (B) { const st = await B.auth.status(); this.user = st.user; }
      await this._load();
    },
    async _load() {
      let lib = null;
      try { lib = B ? await B.lib.load() : JSON.parse(localStorage.getItem('rcc-lib2') || 'null'); } catch (e) {}
      if (!lib) lib = { v: 2, songs: [], playlists: [] };
      // one-time import of the old v1 localStorage library into the guest library
      if (!this.user && !lib.songs.length) {
        try {
          const old = JSON.parse(localStorage.getItem('rcc-lib') || '[]');
          if (old.length) { lib.songs = old.map(o => ({ id: uid(), title: o.title || 'Untitled', artist: o.artist || '', genre: '', text: o.text || '', strums: o.pat ? [{ part: '', pat: RCC.song.strumToString(RCC.song.parseStrumString(o.pat)), bpm: 0, sub: 0 }] : [], pat: '', bpm: 0, added: Date.now() })); localStorage.removeItem('rcc-lib'); }
        } catch (e) {}
      }
      lib.songs = lib.songs || []; lib.playlists = lib.playlists || []; lib.known = lib.known || {}; lib.scales = lib.scales || {}; lib.stats = lib.stats || {}; lib.stats.days = lib.stats.days || {}; lib.deleted = lib.deleted || {};
      this.lib = lib; this.emit();
    },
    save() {
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        try { if (B) B.lib.save(this.lib); else localStorage.setItem('rcc-lib2', JSON.stringify(this.lib)); } catch (e) { console.error(e); }
      }, 350);
    },
    flush() { clearTimeout(this._t); try { if (B) B.lib.save(this.lib); else localStorage.setItem('rcc-lib2', JSON.stringify(this.lib)); } catch (e) {} },

    /* ---- songs ---- */
    song(id) { return this.lib.songs.find(s => s.id === id); },
    addSong(x) {
      const { id: _drop, ...rest } = x; x = rest;
      const ex = this.lib.songs.find(s => norm(s.title) === norm(x.title) && norm(s.artist) === norm(x.artist));
      let s;
      if (ex) { Object.assign(ex, { ...x, id: ex.id, added: ex.added, genre: x.genre || ex.genre, updated: Date.now() }); s = ex; }
      else { s = { id: uid(), added: Date.now(), genre: '', strums: [], pat: '', bpm: 0, ...x }; this.lib.songs.unshift(s); }
      this.save(); this.emit(); return s;
    },
    updateSong(id, patch) { const s = this.song(id); if (!s) return; Object.assign(s, patch, { updated: Date.now() }); this.save(); this.emit(); },
    removeSong(id) {
      this.lib.songs = this.lib.songs.filter(s => s.id !== id); this.lib.deleted[id] = Date.now();
      this.lib.playlists.forEach(p => { if (p.songIds.includes(id)) { p.songIds = p.songIds.filter(x => x !== id); p.updated = Date.now(); } });
      this.save(); this.emit();
    },
    genres() {
      const m = new Map();
      this.lib.songs.forEach(s => { const g = (s.genre || '').trim(); if (g) m.set(g, (m.get(g) || 0) + 1); });
      return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([name, n]) => ({ name, n, color: genreColor(name) }));
    },
    /* ---- playlists ---- */
    playlist(id) { return this.lib.playlists.find(p => p.id === id); },
    createPlaylist(name, firstSongId) {
      name = String(name || '').trim().slice(0, 40) || 'New playlist';
      const p = { id: uid(), name, color: PL_COLORS[this.lib.playlists.length % PL_COLORS.length], songIds: firstSongId ? [firstSongId] : [] };
      this.lib.playlists.push(p); this.save(); this.emit(); return p;
    },
    renamePlaylist(id, name) { const p = this.playlist(id); if (p && name.trim()) { p.name = name.trim().slice(0, 40); p.updated = Date.now(); this.save(); this.emit(); } },
    deletePlaylist(id) { this.lib.deleted[id] = Date.now(); this.lib.playlists = this.lib.playlists.filter(p => p.id !== id); this.save(); this.emit(); },
    toggleInPlaylist(pid, sid) {
      const p = this.playlist(pid); if (!p) return false;
      const i = p.songIds.indexOf(sid); if (i >= 0) p.songIds.splice(i, 1); else p.songIds.push(sid); p.updated = Date.now();
      this.save(); this.emit(); return i < 0;
    },
    /** Songs for a selection key: 'all' | 'g:<genre>' | 'p:<playlistId>' */
    songsFor(key) {
      if (key.startsWith('g:')) { const g = norm(key.slice(2)); return this.lib.songs.filter(s => norm(s.genre) === g); }
      if (key.startsWith('p:')) { const p = this.playlist(key.slice(2)); return p ? p.songIds.map(id => this.song(id)).filter(Boolean) : []; }
      return this.lib.songs;
    },

    setPlaylistNotes(id, notes) { const p = this.playlist(id); if (p) { p.notes = String(notes || '').slice(0, 4000); p.updated = Date.now(); this.save(); } },
    reorderPlaylist(id, from, to) { const p = this.playlist(id); if (!p || to < 0 || to >= p.songIds.length) return; const [x] = p.songIds.splice(from, 1); p.songIds.splice(to, 0, x); p.updated = Date.now(); this.save(); this.emit(); },

    /* ---- progress: chords I know, scales learned, practice stats ---- */
    _canon: n => (RCC.theory && RCC.theory.canon ? RCC.theory.canon(n) : n),
    knows(ch) { return (this.lib.known[this._canon(ch)] || 0) > 0; },
    setKnown(ch, on) { this.lib.known[this._canon(ch)] = (on ? 1 : -1) * Date.now(); this.save(); this.emit(); },
    knownCount() { return Object.values(this.lib.known).filter(v => v > 0).length; },
    scaleLearned(key) { return (this.lib.scales[key] || 0) > 0; },
    setScaleLearned(key, on) { this.lib.scales[key] = (on ? 1 : -1) * Date.now(); this.lib.stats.updated = Date.now(); this.save(); this.emit(); },
    learnedScaleCount() { return Object.values(this.lib.scales).filter(v => v > 0).length; },
    today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    /** add practice time (seconds) / a song / a drill result to today's record */
    track({ sec = 0, song, drill, score } = {}) {
      const st = this.lib.stats, k = this.today(), d = st.days[k] || (st.days[k] = { sec: 0, songs: [] });
      d.sec += sec; if (song && !d.songs.includes(song)) d.songs.push(song);
      if (drill) { d.drills = d.drills || {}; d.drills[drill] = (d.drills[drill] || 0) + 1; }
      if (score != null) { st.best = st.best || {}; st.best[score.key] = Math.max(st.best[score.key] || 0, score.v); }
      st.updated = Date.now(); this.save();
    },
    streak() {
      const days = this.lib.stats.days, ok = k => (days[k] && days[k].sec >= 60) || (days[k] && days[k].songs && days[k].songs.length);
      const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      let d = new Date(), cur = 0; if (!ok(key(d))) d.setDate(d.getDate() - 1);
      while (ok(key(d))) { cur++; d.setDate(d.getDate() - 1); }
      const ks = Object.keys(days).filter(ok).sort(); let best = 0, run = 0, prev = null;
      ks.forEach(k => { const t = new Date(k + 'T00:00:00'); run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; prev = t; best = Math.max(best, run); });
      return { current: cur, best: Math.max(best, cur) };
    },
    totals() { const days = Object.values(this.lib.stats.days); const songs = new Set(); days.forEach(d => (d.songs || []).forEach(x => songs.add(x))); return { sec: days.reduce((a, d) => a + (d.sec || 0), 0), songs: songs.size, days: days.length }; },

    /* ---- cloud sync (optional) ---- */
    async syncNow() {
      if (!B || !B.sync) return { ok: false, error: 'Sync is available in the desktop app.' };
      this.flush(); const r = await B.sync.run(this.lib); if (!r || !r.ok) return r || { ok: false };
      this.lib = RCC.sync.mergeLibs(this.lib, r.lib); this.lib.v = 2; this.flush(); this.emit(); return { ok: true, at: r.at };
    },

    /* ---- accounts ---- */
    async register(a) { return this._auth(() => B.auth.register(a)); },
    async login(a) { return this._auth(() => B.auth.login(a)); },
    async _auth(fn) {
      if (!B) return { ok: false, error: 'Accounts are available in the desktop app.' };
      this.flush(); const r = await fn();
      if (r.ok) { this.user = r.user; await this._load(); }
      return r;
    },
    async logout() { if (!B) return; this.flush(); await B.auth.logout(); this.user = null; await this._load(); },
    async deleteAccount(password) { if (!B) return { ok: false }; const r = await B.auth.deleteAccount({ password }); if (r.ok) { this.user = null; await this._load(); } return r; },
    async exportLib() { if (B) return B.lib.exportTo(this.lib); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(this.lib, null, 2)], { type: 'application/json' })); a.download = 'chordclicks-songs.json'; a.click(); return { ok: true }; },
    /** Merge songs/playlists from an exported file. */
    mergeLib(inc) {
      if (!inc || !Array.isArray(inc.songs)) return 0;
      const idMap = {}; let n = 0;
      inc.songs.forEach(x => { if (!x || !x.title) return; const before = this.lib.songs.length; const s = this.addSong({ ...x, id: undefined }); idMap[x.id] = s.id; if (this.lib.songs.length > before) n++; });
      (inc.playlists || []).forEach(p => { const np = this.createPlaylist(p.name); np.songIds = (p.songIds || []).map(i => idMap[i]).filter(Boolean); });
      this.save(); this.emit(); return n;
    },
  };
  RCC.store = S;
})();
