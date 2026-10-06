const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ' ' + m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(1200);
  const shot = n => p.screenshot({ path: `/tmp/claude-0/shots/${n}.png` });
  const SONG = `[Verse 1]\nAm        F\nSome lyric line here\nC         G\nanother lyric line\n\n[Chorus]\nF   G   Am\nSing it out\n\n[Solo]\ne|-----------------|-12-----12-10---|\nB|-------------8-10|-----------------|\nG|---7h9-7---------|-----------------|\nD|-----------------|-----------------|\nA|-----------------|-----------------|\nE|-0---------------|-----------------|\n\nStrumming pattern: D DU UDU`;
  await p.evaluate(s => { const x = window.__rcc; const Store = window.RCC.store; const song = Store.addSong({ title: 'Test Song', artist: 'Tester', genre: 'Rock', text: s, strums: window.RCC.song.findStrumsInText(s) }); Store.addSong({ title: 'Blue Thing', artist: 'B.B.', genre: 'Blues', text: s }); Store.createPlaylist('Gig night', song.id); x.loadSong(Store.song(song.id)); }, SONG);
  await p.waitForTimeout(500); await shot('practice');
  for (const v of ['library', 'solo', 'scales', 'learn', 'gear', 'tuner', 'stream', 'settings', 'find']) { await p.evaluate(v => window.__rcc.show(v), v); await p.waitForTimeout(600); if (v === 'solo') { await p.click('#solo-play'); await p.waitForTimeout(6200); } await shot(v); }
  await p.evaluate(() => window.__rcc.show('solo')); await p.click('#solo-demo'); await p.click('#solo-play'); await p.waitForTimeout(6500); await shot('solo-demo');
  await p.evaluate(() => window.__rcc.show('scales')); await p.click('#sc-wheel g.wm[data-r="7"]'); await p.click('#sc-pos .chip:nth-child(3)'); await p.waitForTimeout(400); await shot('scales-G-pos2');
  await p.click('#acct'); await p.waitForTimeout(300); await shot('auth');
  console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
  await b.close();
})();
