#!/usr/bin/env node
/* Optional cloud-sync server for ChordClicks. Zero dependencies.
   Run:  node server/server.js            (PORT=8787, DATA_DIR=./server-data)
   Put it behind HTTPS (Caddy / nginx / a host like Fly.io or Render) before using it over the internet. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { mergeLibs } = require('../src/lib/sync.js');

function createServer({ dataDir = path.join(__dirname, '..', 'server-data'), allowRegister = true } = {}) {
  fs.mkdirSync(path.join(dataDir, 'libs'), { recursive: true });
  const usersFile = path.join(dataDir, 'users.json'), tokFile = path.join(dataDir, 'tokens.json');
  const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
  const wr = (f, v) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f); };
  const norm = s => String(s || '').trim().toLowerCase();
  const sha = s => crypto.createHash('sha256').update(s).digest('hex');
  const libFile = id => path.join(dataDir, 'libs', id.replace(/[^a-f0-9]/g, '') + '.json');
  const hits = new Map();
  const limited = (ip, max = 30) => { const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000); h.push(now); hits.set(ip, h); return h.length > max; };

  const body = req => new Promise((res, rej) => {
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > 8e6) { rej(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else ch.push(c); });
    req.on('end', () => { try { res(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch (e) { rej(Object.assign(new Error('bad json'), { code: 400 })); } });
  });
  const out = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const userFor = req => { const m = /^Bearer (\S+)$/.exec(req.headers.authorization || ''); if (!m) return null; const t = rd(tokFile, {})[sha(m[1])]; return t ? t.user : null; };

  return http.createServer(async (req, res) => {
    const ip = req.socket.remoteAddress || '?';
    try {
      const url = req.url.split('?')[0];
      if (req.method === 'GET' && url === '/api/health') return out(res, 200, { ok: true });
      if (req.method !== 'POST' && !(req.method === 'GET' && url === '/api/lib')) return out(res, 404, { ok: false });
      if (limited(ip)) return out(res, 429, { ok: false, error: 'Too many requests. Wait a minute.' });
      if (url === '/api/register' || url === '/api/login') {
        const { name, password } = await body(req), n = norm(name), users = rd(usersFile, {});
        if (url === '/api/register') {
          if (!allowRegister) return out(res, 403, { ok: false, error: 'Registration is closed.' });
          if (!/^[a-z0-9_.@-]{3,40}$/.test(n)) return out(res, 400, { ok: false, error: 'Name must be 3–40 letters, numbers or _.@-' });
          if (String(password || '').length < 8) return out(res, 400, { ok: false, error: 'Password must be at least 8 characters.' });
          if (users[n]) return out(res, 409, { ok: false, error: 'That name is taken.' });
          const salt = crypto.randomBytes(16).toString('hex'); users[n] = { id: crypto.randomBytes(12).toString('hex'), salt, h: crypto.scryptSync(password, salt, 64).toString('hex') }; wr(usersFile, users);
        } else {
          const u = users[n]; const ok = u && crypto.timingSafeEqual(crypto.scryptSync(String(password || ''), u.salt, 64), Buffer.from(u.h, 'hex'));
          if (!ok) return out(res, 401, { ok: false, error: 'Wrong name or password.' });
        }
        const token = crypto.randomBytes(32).toString('hex'), t = rd(tokFile, {}); t[sha(token)] = { user: users[n].id, at: Date.now() }; wr(tokFile, t);
        return out(res, 200, { ok: true, token, name: n });
      }
      const uid = userFor(req); if (!uid) return out(res, 401, { ok: false, error: 'Sign in again.' });
      if (url === '/api/lib') return out(res, 200, { ok: true, lib: rd(libFile(uid), { v: 2, songs: [], playlists: [] }) });
      if (url === '/api/sync') {
        const { lib } = await body(req); const merged = mergeLibs(lib || {}, rd(libFile(uid), {}));
        wr(libFile(uid), merged); return out(res, 200, { ok: true, lib: merged, at: Date.now() });
      }
      if (url === '/api/logout') { const m = /^Bearer (\S+)$/.exec(req.headers.authorization), t = rd(tokFile, {}); delete t[sha(m[1])]; wr(tokFile, t); return out(res, 200, { ok: true }); }
      out(res, 404, { ok: false });
    } catch (e) { out(res, e.code || 500, { ok: false, error: e.code ? e.message : 'Server error' }); }
  });
}
module.exports = createServer;
if (require.main === module) { const port = +process.env.PORT || 8787; createServer({ dataDir: process.env.DATA_DIR || undefined }).listen(port, () => console.log('RCC sync server on :' + port)); }
