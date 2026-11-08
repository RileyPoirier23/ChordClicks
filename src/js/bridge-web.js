/* Web / phone stand-in for the desktop bridge (window.rcc): local accounts, per-account libraries and cloud sync,
   all without Electron. Accounts live in this browser (password hashed with PBKDF2); sync talks to the helper server. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  if (window.rcc) return; // desktop app: the real bridge is there
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const enc = new TextEncoder();
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  async function hash(pw, salt) {
    if (!(crypto && crypto.subtle)) { let h = 0; for (const ch of salt + pw) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'w' + h; } // http:// fallback (no subtle crypto): weak, but accounts here only separate libraries
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 120000 }, key, 256));
  }
  const norm = n => String(n || '').trim().toLowerCase();
  const accounts = () => lsGet('rcc-accounts', {}), cur = () => lsGet('rcc-acct-cur', null);
  const libKey = () => { const u = cur(); return u ? 'rcc-lib2:' + u.id : 'rcc-lib2'; };
  const pub = a => ({ id: a.id, name: a.name, created: a.created });
  const auth = {
    async status() { const u = cur(); return { user: u ? pub(u) : null }; },
    async register({ name, password } = {}) {
      const n = norm(name); if (!/^[a-z0-9_.@-]{3,40}$/.test(n)) return { ok: false, error: 'Name must be 3–40 letters, numbers or _ . @ -' };
      if (String(password || '').length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
      const all = accounts(); if (all[n]) return { ok: false, error: 'That name is taken on this device.' };
      const salt = hex(crypto.getRandomValues(new Uint8Array(12))), a = { id: 'u' + Date.now().toString(36), name: String(name).trim(), salt, hash: await hash(password, salt), created: Date.now() };
      all[n] = a; lsSet('rcc-accounts', all); lsSet('rcc-acct-cur', a);
      // a brand-new account starts with the guest library, so nothing you built before signing up disappears
      const guest = lsGet('rcc-lib2', null); if (guest && !lsGet('rcc-lib2:' + a.id, null)) lsSet('rcc-lib2:' + a.id, guest);
      return { ok: true, user: pub(a) };
    },
    async login({ name, password } = {}) {
      const a = accounts()[norm(name)]; if (!a) return { ok: false, error: 'No account with that name on this device.' };
      if (await hash(password, a.salt) !== a.hash) return { ok: false, error: 'Wrong password.' };
      lsSet('rcc-acct-cur', a); return { ok: true, user: pub(a) };
    },
    async logout() { try { localStorage.removeItem('rcc-acct-cur'); } catch (e) {} return { ok: true }; },
    async deleteAccount({ password } = {}) {
      const u = cur(); if (!u) return { ok: false }; const all = accounts(), a = all[norm(u.name)]; if (!a) return { ok: false };
      if (await hash(password, a.salt) !== a.hash) return { ok: false, error: 'Wrong password.' };
      delete all[norm(u.name)]; lsSet('rcc-accounts', all); try { localStorage.removeItem('rcc-lib2:' + a.id); localStorage.removeItem('rcc-acct-cur'); } catch (e) {} return { ok: true };
    },
  };
  const lib = {
    async load() { return lsGet(libKey(), null); },
    async save(l) { lsSet(libKey(), l); return { ok: true }; },
    async exportTo(l) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(l, null, 2)], { type: 'application/json' })); a.download = 'chordclicks-songs.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return { ok: true }; },
    importFrom() { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = () => { const f = i.files[0]; if (!f) return res({ ok: false }); f.text().then(t => { try { res({ ok: true, lib: JSON.parse(t) }); } catch (e) { res({ ok: false, error: 'That file is not a valid song export.' }); } }); }; i.click(); }); },
  };
  /* cloud sync against the ChordClicks helper server (server/server.js): same endpoints the desktop app uses */
  const sy = () => lsGet('rcc-sync', {});
  const helper = () => { let u = ''; try { u = localStorage.getItem('rcc-proxy') || ''; } catch (e) {} if (!u && RCC.pro && RCC.pro.config) u = RCC.pro.config().helper || ''; return u.replace(/\/+$/, ''); };
  async function call(base, p, body, token) {
    const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(20000) });
    return r.json();
  }
  const sync = {
    async status() { const c = sy(); return { url: c.url || '', name: c.name || '', on: !!c.token, defaultUrl: helper() }; },
    async login({ url, name, password, register } = {}) {
      const base = String(url || helper() || '').replace(/\/+$/, ''); if (!/^https?:\/\//.test(base)) return { ok: false, error: 'Enter the helper server address (https://…).' };
      try { const r = await call(base, register ? '/api/register' : '/api/login', { name, password }); if (!r.ok) return r; lsSet('rcc-sync', { url: base, name: r.name, token: r.token }); return { ok: true, name: r.name }; }
      catch (e) { return { ok: false, error: 'Could not reach the server.' }; }
    },
    async logout() { try { localStorage.removeItem('rcc-sync'); } catch (e) {} return { ok: true }; },
    async run(l) { const c = sy(); if (!c.token) return { ok: false, error: 'Not connected.' }; try { return await call(c.url, '/api/sync', { lib: l }, c.token); } catch (e) { return { ok: false, error: 'Could not reach the server.' }; } },
  };
  RCC.webBridge = { auth, lib, sync, web: true };
})();
