#!/usr/bin/env node
/* Optional cloud-sync server for ChordClicks. Zero dependencies.
   Run:  node server/server.js            (PORT=8787, DATA_DIR=./server-data)
   Put it behind HTTPS (Caddy / nginx / a host like Fly.io or Render) before using it over the internet. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { mergeLibs } = require('../src/lib/sync.js');
const { webcrypto } = crypto;

/* ---------------- ChordClicks Pro checkout (Stripe Payment Link + webhook) ----------------
   Env: STRIPE_SECRET_KEY (sk_live_…), STRIPE_WEBHOOK_SECRET (whsec_…), LICENCE_PRIVATE_JWK (contents of licence-private.jwk),
        RESEND_API_KEY + MAIL_FROM (optional: emails the key), SITE_THANKS (optional, link used in the email).
   Flow: Payment Link -> Stripe -> (1) webhook checkout.session.completed -> key issued + emailed + stored
                                  (2) thank-you page calls GET /api/key?session_id=… -> same key shown immediately. */
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function signKey(payload) {
  const jwk = JSON.parse(process.env.LICENCE_PRIVATE_JWK || 'null'); if (!jwk) throw Object.assign(new Error('LICENCE_PRIVATE_JWK is not set'), { code: 500 });
  const key = await webcrypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const body = b64u(JSON.stringify(payload)); const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(body));
  return 'CCPRO-' + body + '.' + b64u(sig);
}
async function stripeGet(p) {
  const r = await fetch('https://api.stripe.com/v1' + p, { headers: { authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Object.assign(new Error('Stripe: ' + r.status), { code: 502 }); return r.json();
}
function stripeSigOk(raw, header) {
  const parts = Object.fromEntries(String(header || '').split(',').map(x => x.split('='))); const t = parts.t, v1 = parts.v1; if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - +t) > 300) return false;
  const exp = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || '').update(t + '.' + raw).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(v1)); } catch (e) { return false; }
}
async function sendKeyMail(to, name, key) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM || !to) return false;
  const thanks = process.env.SITE_THANKS || 'https://www.506clicks.ca/projects/chordclicks/';
  const html = `<p>Hi ${name || 'there'},</p><p>Thanks for buying <b>ChordClicks Pro</b>. Here is your key:</p><p style="font:16px/1.4 ui-monospace,monospace;background:#f3f0e8;padding:12px;border-radius:4px;word-break:break-all">${key}</p><p>In ChordClicks go to <b>Settings → ChordClicks Pro → Enter key</b> and paste it. It works offline, on all your devices, forever.</p><p>Download links and help: <a href="${thanks}">${thanks}</a><br>Questions: reply to this email.</p><p>— Riley, 506Clicks</p>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject: 'Your ChordClicks Pro key', html }), signal: AbortSignal.timeout(15000) });
  return r.ok;
}

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

  const ordersFile = path.join(dataDir, 'orders.json');
  /** Issue (or re-issue) the key for a paid Checkout session. Deterministic per session, so the webhook and the thank-you page agree. */
  async function keyForSession(sess) {
    if (sess.payment_status !== 'paid' && sess.status !== 'complete') throw Object.assign(new Error('Not paid yet'), { code: 402 });
    const orders = rd(ordersFile, {}); if (orders[sess.id]) return orders[sess.id];
    const email = (sess.customer_details && sess.customer_details.email) || sess.customer_email || '', name = (sess.customer_details && sess.customer_details.name) || '';
    const key = await signKey({ n: name.slice(0, 40), e: email.slice(0, 60), i: Date.now(), x: 0, v: 1, s: sess.id.slice(-10) });
    orders[sess.id] = { key, email, name, at: Date.now(), mailed: false }; wr(ordersFile, orders);
    try { orders[sess.id].mailed = await sendKeyMail(email, name, key); wr(ordersFile, orders); } catch (e) {}
    return orders[sess.id];
  }
  const rawBody = req => new Promise((res, rej) => { let n = 0; const ch = []; req.on('data', c => { n += c.length; if (n > 2e6) { rej(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else ch.push(c); }); req.on('end', () => res(Buffer.concat(ch).toString())); });
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
      res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', 'authorization, content-type');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && url === '/api/health') return out(res, 200, { ok: true });
      // Ultimate Guitar relay for the web / phone builds (browsers block the cross-site fetch). Only UG pages, HTML only.
      if (req.method === 'GET' && url === '/api/ug') {
        if (limited(ip, 40)) return out(res, 429, { ok: false, error: 'Too many requests. Wait a minute.' });
        const target = new URL(req.url, 'http://x').searchParams.get('url') || ''; let u; try { u = new URL(target); } catch (e) { return out(res, 400, { ok: false, error: 'Bad address' }); }
        if (u.protocol !== 'https:' || !/(^|\.)ultimate-guitar\.com$/.test(u.hostname)) return out(res, 400, { ok: false, error: 'Only Ultimate Guitar pages' });
        try {
          const r = await fetch(u.href, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
          const html = await r.text(); const m = /class="js-store"[^>]*?data-content="([^"]*)"/.exec(html);
          return out(res, 200, { ok: r.ok, status: r.status, html: m ? '<div class="js-store" data-content="' + m[1] + '"></div>' : html.slice(0, 200000) });
        } catch (e) { return out(res, 502, { ok: false, error: 'Could not reach Ultimate Guitar' }); }
      }
      // Pro checkout: thank-you page asks for the key of a paid session
      if (req.method === 'GET' && url === '/api/key') {
        if (limited(ip, 20)) return out(res, 429, { ok: false, error: 'Too many requests. Wait a minute.' });
        const sid = new URL(req.url, 'http://x').searchParams.get('session_id') || ''; if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return out(res, 400, { ok: false, error: 'Bad session' });
        if (!process.env.STRIPE_SECRET_KEY) return out(res, 500, { ok: false, error: 'Checkout is not configured on this server yet.' });
        const sess = await stripeGet('/checkout/sessions/' + encodeURIComponent(sid)); const o = await keyForSession(sess);
        return out(res, 200, { ok: true, key: o.key, email: o.email, mailed: o.mailed });
      }
      // Owner's panel (506clicks.ca/admin): needs ADMIN_TOKEN. Stats + manual key issue.
      const adminOk = q => process.env.ADMIN_TOKEN && q && crypto.timingSafeEqual(Buffer.from(String(q).padEnd(64).slice(0, 64)), Buffer.from(String(process.env.ADMIN_TOKEN).padEnd(64).slice(0, 64)));
      if (url === '/api/admin/stats' || url === '/api/admin/issue') {
        if (limited(ip, 30)) return out(res, 429, { ok: false, error: 'Too many requests' });
        const q = req.method === 'GET' ? new URL(req.url, 'http://x').searchParams.get('token') : (await body(req));
        const tok = typeof q === 'string' ? q : q && q.token; if (!adminOk(tok)) return out(res, 401, { ok: false, error: 'Bad admin token' });
        if (url === '/api/admin/stats') {
          const orders = Object.entries(rd(ordersFile, {})).map(([id, o]) => ({ id: id.slice(-8), at: o.at, email: String(o.email || '').replace(/^(.).*(@.*)$/, '$1…$2'), name: o.name, mailed: o.mailed, manual: !!o.manual })).sort((a, b) => b.at - a.at);
          return out(res, 200, { ok: true, orders: orders.slice(0, 50), count: orders.length, users: Object.keys(rd(usersFile, {})).length, stripe: !!process.env.STRIPE_SECRET_KEY, mail: !!process.env.RESEND_API_KEY, signing: !!process.env.LICENCE_PRIVATE_JWK });
        }
        const { name = '', email = '' } = q || {}; const key = await signKey({ n: String(name).slice(0, 40), e: String(email).slice(0, 60), i: Date.now(), x: 0, v: 1 });
        const orders = rd(ordersFile, {}); const id = 'manual_' + Date.now(); orders[id] = { key, email, name, at: Date.now(), mailed: false, manual: true };
        try { orders[id].mailed = email ? await sendKeyMail(email, name, key) : false; } catch (e) {} wr(ordersFile, orders);
        return out(res, 200, { ok: true, key, mailed: orders[id].mailed });
      }
      if (req.method === 'POST' && url === '/api/stripe/webhook') {
        const raw = await rawBody(req); if (!stripeSigOk(raw, req.headers['stripe-signature'])) return out(res, 400, { ok: false, error: 'Bad signature' });
        const ev = JSON.parse(raw);
        if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') { try { await keyForSession(ev.data.object); } catch (e) { console.error('key issue failed', e.message); } }
        return out(res, 200, { received: true });
      }
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
