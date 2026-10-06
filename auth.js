// Local accounts + per-user song libraries (main process only).
// Passwords are hashed with scrypt + a random salt and never stored in plain text.
// Everything lives in the app's userData folder on this computer.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function createAuth(userDataDir) {
  const dir = path.join(userDataDir, 'accounts');
  const libDir = path.join(dir, 'libraries');
  const usersFile = path.join(dir, 'users.json');
  const sessionFile = path.join(dir, 'session.json');
  fs.mkdirSync(libDir, { recursive: true });

  const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fallback; } };
  const writeJSON = (f, data) => { // atomic: write temp then rename
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, f);
  };

  const users = () => readJSON(usersFile, { users: [] }).users;
  const saveUsers = list => writeJSON(usersFile, { users: list });
  const norm = n => String(n || '').trim().toLowerCase();
  const pub = u => (u ? { id: u.id, name: u.name, created: u.created } : null);

  const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  const fails = new Map(); // username -> {n, until}
  const libFile = id => path.join(libDir, (id || 'guest').replace(/[^a-z0-9-]/gi, '') + '.json');

  let current = null; // user id (null = guest)
  const sess = readJSON(sessionFile, null);
  if (sess && users().some(u => u.id === sess.userId)) current = sess.userId;

  const err = message => ({ ok: false, error: message });
  const okUser = u => ({ ok: true, user: pub(u) });
  const remember = (u, on) => {
    if (on) writeJSON(sessionFile, { userId: u.id }); else { try { fs.unlinkSync(sessionFile); } catch (e) {} }
  };

  return {
    status() { const u = users().find(x => x.id === current); return { user: pub(u), hasAccounts: users().length > 0 }; },

    register({ name, password, remember: rem, adoptGuest }) {
      const display = String(name || '').trim();
      if (!/^[A-Za-z0-9_.\- ]{3,24}$/.test(display)) return err('Username must be 3–24 letters, numbers, spaces, . _ or -');
      if (String(password || '').length < 8) return err('Password must be at least 8 characters.');
      const list = users();
      if (list.some(u => norm(u.name) === norm(display))) return err('That username is already taken on this computer.');
      const salt = crypto.randomBytes(16);
      const u = { id: crypto.randomUUID(), name: display, salt: salt.toString('hex'), hash: hash(password, salt).toString('hex'), created: Date.now() };
      list.push(u); saveUsers(list);
      if (adoptGuest) { // move the guest library into the new account
        const g = readJSON(libFile(null), null);
        if (g) writeJSON(libFile(u.id), g);
      }
      current = u.id; remember(u, rem);
      return okUser(u);
    },

    login({ name, password, remember: rem }) {
      const key = norm(name), f = fails.get(key);
      if (f && f.until > Date.now()) return err('Too many attempts. Try again in ' + Math.ceil((f.until - Date.now()) / 1000) + 's.');
      const u = users().find(x => norm(x.name) === key);
      let good = false;
      if (u) {
        const salt = Buffer.from(u.salt, 'hex');
        good = crypto.timingSafeEqual(hash(String(password || ''), salt), Buffer.from(u.hash, 'hex'));
      } else hash('x', Buffer.alloc(16)); // keep timing similar for unknown users
      if (!good) {
        const n = (f ? f.n : 0) + 1; fails.set(key, { n, until: n >= 5 ? Date.now() + 30000 : 0 });
        return err('Wrong username or password.');
      }
      fails.delete(key); current = u.id; remember(u, rem);
      return okUser(u);
    },

    logout() { current = null; try { fs.unlinkSync(sessionFile); } catch (e) {} return { ok: true }; },

    deleteAccount({ password }) {
      const u = users().find(x => x.id === current);
      if (!u) return err('Not signed in.');
      if (!crypto.timingSafeEqual(hash(String(password || ''), Buffer.from(u.salt, 'hex')), Buffer.from(u.hash, 'hex'))) return err('Wrong password.');
      saveUsers(users().filter(x => x.id !== u.id));
      try { fs.unlinkSync(libFile(u.id)); } catch (e) {}
      current = null; try { fs.unlinkSync(sessionFile); } catch (e) {}
      return { ok: true };
    },

    loadLibrary() { return readJSON(libFile(current), null); },
    saveLibrary(lib) {
      if (!lib || typeof lib !== 'object' || !Array.isArray(lib.songs) || !Array.isArray(lib.playlists)) return err('Bad library');
      if (JSON.stringify(lib).length > 25 * 1024 * 1024) return err('Library too large');
      writeJSON(libFile(current), lib); return { ok: true };
    },
  };
};
