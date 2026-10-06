const test = require('node:test'), assert = require('node:assert'), os = require('os'), fs = require('fs'), path = require('path');
const createServer = require('../server/server.js');
test('register, sync, merge across two devices, delete tombstone', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rccs-')), srv = createServer({ dataDir: dir });
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const post = async (u, b, tok) => (await fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(b) })).json();
  assert.equal((await post('/api/register', { name: 'joe', password: 'short' })).ok, false);
  const r = await post('/api/register', { name: 'joe', password: 'longenough1' }); assert.ok(r.token);
  assert.equal((await post('/api/register', { name: 'joe', password: 'longenough1' })).ok, false);
  assert.equal((await post('/api/login', { name: 'joe', password: 'nope-nope' })).ok, false);
  const l = await post('/api/login', { name: 'joe', password: 'longenough1' });
  const a = await post('/api/sync', { lib: { songs: [{ id: 's1', title: 'A', added: 1 }], playlists: [] } }, r.token);
  const b = await post('/api/sync', { lib: { songs: [{ id: 's2', title: 'B', added: 2 }], playlists: [] } }, l.token);
  assert.deepEqual(b.lib.songs.map(s => s.id).sort(), ['s1', 's2']);
  const c = await post('/api/sync', { lib: { songs: [], playlists: [], deleted: { s1: 10 } } }, r.token);
  assert.deepEqual(c.lib.songs.map(s => s.id), ['s2']);
  assert.equal((await post('/api/sync', { lib: {} }, 'bad')).ok, false);
  srv.close(); fs.rmSync(dir, { recursive: true });
});
