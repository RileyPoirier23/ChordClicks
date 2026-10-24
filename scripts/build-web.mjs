// Builds the static web/mobile bundle into www/ (what Capacitor wraps and what a static host serves).
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname), out = resolve(root, 'www');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) cpSync(resolve(root, f), resolve(out, f));
cpSync(resolve(root, 'src'), resolve(out, 'src'), { recursive: true });
mkdirSync(resolve(out, 'build')); cpSync(resolve(root, 'build/icon.png'), resolve(out, 'build/icon.png'));
// stamp the service worker cache with the package version plus a hash of everything shipped, so phones and browsers
// pick up any change to the web build (not only version bumps): a new cache name makes the worker reinstall.
const v = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const h = createHash('sha256');
const walk = d => readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach(e => { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (f !== resolve(out, 'sw.js')) { h.update(f.slice(out.length)); h.update(readFileSync(f)); } });
walk(out);
const stamp = `chordclicks-${v}-${h.digest('hex').slice(0, 8)}`;
writeFileSync(resolve(out, 'sw.js'), readFileSync(resolve(out, 'sw.js'), 'utf8').replace(/const VERSION = '[^']*'/, `const VERSION = '${stamp}'`));
console.log('www/ ready (' + stamp + ')');
