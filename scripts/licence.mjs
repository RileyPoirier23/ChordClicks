#!/usr/bin/env node
/* ChordClicks Pro licence tool (ECDSA P-256, verified offline inside the app).
     node scripts/licence.mjs keygen                 -> prints a PUBLIC key for src/js/pro.js and writes licence-private.jwk (keep it secret, never commit)
     node scripts/licence.mjs issue "Jane Doe" [--email jane@x.com] [--days 0]   -> prints a licence key to send to the buyer
     node scripts/licence.mjs verify <key>           -> checks a key against the public key in src/js/pro.js
   Pro purchases: run `issue` for each order (or wire it into your Gumroad / Stripe webhook). */
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), privFile = path.join(root, 'licence-private.jwk'), proFile = path.join(root, 'src/js/pro.js');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const [cmd, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const PARAMS = { name: 'ECDSA', namedCurve: 'P-256' }, SIGN = { name: 'ECDSA', hash: 'SHA-256' };

if (cmd === 'keygen') {
  if (existsSync(privFile)) { console.error('licence-private.jwk already exists; delete it first if you really want a new pair (old keys stop working).'); process.exit(1); }
  const kp = await crypto.subtle.generateKey(PARAMS, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  writeFileSync(privFile, JSON.stringify(priv), { mode: 0o600 });
  const pubStr = JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y });
  if (existsSync(proFile)) { const s = readFileSync(proFile, 'utf8').replace(/const PUBLIC_KEY = \{[^}]*\};/, 'const PUBLIC_KEY = ' + pubStr + ';'); writeFileSync(proFile, s); console.log('Public key written into src/js/pro.js'); }
  console.log('Private key saved to licence-private.jwk (gitignored). Back it up somewhere safe.\nPublic key:', pubStr);
} else if (cmd === 'issue') {
  const name = rest.filter(x => !x.startsWith('--') && rest[rest.indexOf(x) - 1] !== '--email' && rest[rest.indexOf(x) - 1] !== '--days')[0] || 'ChordClicks user';
  const days = +arg('--days', 0), payload = { n: name.slice(0, 40), e: (arg('--email', '') || '').slice(0, 60), i: Date.now(), x: days > 0 ? Date.now() + days * 864e5 : 0, v: 1 };
  const priv = await crypto.subtle.importKey('jwk', JSON.parse(readFileSync(privFile, 'utf8')), PARAMS, false, ['sign']);
  const body = b64u(JSON.stringify(payload)), sig = b64u(await crypto.subtle.sign(SIGN, priv, Buffer.from(body)));
  console.log('CCPRO-' + body + '.' + sig);
} else if (cmd === 'verify') {
  const key = rest[0] || '', m = /^CCPRO-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key.trim()); if (!m) { console.log('Not a ChordClicks key'); process.exit(1); }
  const pubStr = /const PUBLIC_KEY = (\{[^}]*\});/.exec(readFileSync(proFile, 'utf8'))[1];
  const pub = await crypto.subtle.importKey('jwk', { ...JSON.parse(pubStr), ext: true }, PARAMS, false, ['verify']);
  const ok = await crypto.subtle.verify(SIGN, pub, unb64u(m[2]), Buffer.from(m[1]));
  console.log(ok ? 'VALID ' + unb64u(m[1]).toString() : 'INVALID');
} else console.log('usage: licence.mjs keygen | issue "Name" [--email e] [--days n] | verify <key>');
