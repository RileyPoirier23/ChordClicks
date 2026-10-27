// Builds the static web/mobile bundle into www/ (what Capacitor wraps and what a static host serves).
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)), out = resolve(root, 'www');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) cpSync(resolve(root, f), resolve(out, f));
cpSync(resolve(root, 'src'), resolve(out, 'src'), { recursive: true });
mkdirSync(resolve(out, 'build')); cpSync(resolve(root, 'build/icon.png'), resolve(out, 'build/icon.png'));
// stamp the service worker cache with the package version so phones pick up new releases
const v = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
writeFileSync(resolve(out, 'sw.js'), readFileSync(resolve(out, 'sw.js'), 'utf8').replace(/const VERSION = '[^']*'/, `const VERSION = 'chordclicks-${v}'`));
console.log('www/ ready (v' + v + ')');
