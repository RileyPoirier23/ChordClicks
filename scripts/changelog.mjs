// Parses CHANGELOG.md. `node scripts/changelog.mjs` writes src/changelog.js (what the app's "What's new" reads);
// `node scripts/changelog.mjs notes [version]` prints one version's section as release notes (used by the desktop workflow).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
export function parse(md) {
  const out = []; let cur = null;
  for (const line of md.split('\n')) {
    const h = /^## (\d+\.\d+\.\d+)\s*(?:—|-)\s*(\d{4}-\d{2}-\d{2})?/.exec(line);
    if (h) { cur = { version: h[1], date: h[2] || '', items: [] }; out.push(cur); continue; }
    const li = /^- (.*)$/.exec(line); if (li && cur) cur.items.push(li[1].trim());
  }
  return out;
}
const md = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'), log = parse(md), pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const [cmd, ver] = process.argv.slice(2);
if (cmd === 'notes') {
  const v = ver || pkg.version, e = log.find(x => x.version === v);
  process.stdout.write(e ? `## ChordClicks ${e.version}${e.date ? ' · ' + e.date : ''}\n\n${e.items.map(i => '- ' + i).join('\n')}\n` : `New build of ChordClicks ${v}.\n`);
} else {
  if (!log.some(x => x.version === pkg.version)) console.warn(`CHANGELOG.md has no section for ${pkg.version}`);
  writeFileSync(resolve(root, 'src/changelog.js'), `/* Generated from CHANGELOG.md by scripts/changelog.mjs — do not edit. */\nwindow.RCC_CHANGELOG = ${JSON.stringify(log.slice(0, 12))};\n`);
  console.log('src/changelog.js: ' + log.length + ' versions');
}
