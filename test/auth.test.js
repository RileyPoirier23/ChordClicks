const test = require('node:test'); const assert = require('node:assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const createAuth = require('../auth.js');
test('accounts: register, login, per-user libraries, lockout, delete', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-')); let a = createAuth(dir);
  assert.strictEqual(a.status().user, null);
  assert.ok(!a.register({ name: 'ab', password: 'longenough' }).ok); assert.ok(!a.register({ name: 'Joe', password: 'short' }).ok);
  const lib = { songs: [{ id: '1', title: 'x' }], playlists: [] };
  assert.ok(a.saveLibrary(lib).ok);                            // guest library
  const r = a.register({ name: 'Joe', password: 'correct horse', remember: true, adoptGuest: true }); assert.ok(r.ok);
  assert.strictEqual(a.loadLibrary().songs.length, 1);         // guest songs adopted
  a.saveLibrary({ songs: [{ id: '2' }, { id: '3' }], playlists: [] });
  assert.ok(!a.register({ name: 'joe', password: 'another one!' }).ok);   // case-insensitive duplicate
  a.logout(); assert.strictEqual(a.loadLibrary().songs.length, 1);        // back to guest library
  assert.ok(!fs.readFileSync(path.join(dir, 'accounts/users.json'), 'utf8').includes('correct horse'));
  a = createAuth(dir); assert.strictEqual(a.status().user, null);        // logged out stays logged out
  assert.ok(!a.login({ name: 'joe', password: 'wrong' }).ok);
  assert.ok(a.login({ name: 'JOE', password: 'correct horse', remember: true }).ok);
  assert.strictEqual(a.loadLibrary().songs.length, 2);
  a = createAuth(dir); assert.strictEqual(a.status().user.name, 'Joe');  // remembered session
  for (let i = 0; i < 5; i++) a.login({ name: 'joe', password: 'bad' });
  assert.match(a.login({ name: 'joe', password: 'correct horse' }).error, /Too many/);
  assert.ok(!a.deleteAccount({ password: 'nope' }).ok); assert.ok(a.deleteAccount({ password: 'correct horse' }).ok);
  assert.strictEqual(a.status().user, null); assert.ok(!createAuth(dir).login({ name: 'joe', password: 'correct horse' }).ok);
  assert.ok(!a.saveLibrary({ bad: 1 }).ok);
});
