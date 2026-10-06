const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['camera', 'microphone'] }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(800);
  // 1. UG extraction against a fake page store, then strum parsing
  const out = await p.evaluate(() => {
    const store = { store: { page: { data: { tab: { song_name: 'Wonderwall', artist_name: 'Oasis', tonality_name: 'F#m' }, tab_view: { meta: { capo: 2 }, wiki_tab: { content: '[Verse]\n[ch]Em7[/ch]  [ch]G[/ch]\nToday is gonna be the day' }, strummings: [{ part: 'Verse', bpm: 87, denominator: 8, is_triplet: 0, values: ['D', '', 'D', 'U', '', 'U', 'D', 'U'] }, { part: 'Chorus', bpm: 87, denominator: 8, values: ['D', 'D', 'U', '', 'U', 'D', 'U', ''] }] } } } } };
    const d = document.createElement('div'); d.className = 'js-store'; d.dataset.content = JSON.stringify(store); document.body.appendChild(d);
    const x = JSON.parse(eval(window.__rcc.EXTRACT)); return { x, strums: window.RCC.song.extractStrumsFromJSON({ strum: x.strum }) };
  });
  console.log('extract:', out.x.title, '|', out.x.meta, '|', JSON.stringify(out.strums.map(s => [s.part, s.pat, s.bpm, s.sub])));
  // 2. load as library song: auto pattern per section
  await p.evaluate(o => { const S = window.RCC.store; const s = S.addSong({ title: o.x.title, artist: o.x.artist, text: o.x.text + '\n[Chorus]\nC D', strums: window.RCC.song.extractStrumsFromJSON({ strum: o.x.strum }), meta: o.x.meta, genre: 'Rock' }); window.__rcc.loadSong(s); }, out);
  console.log('header:', await p.textContent('#np-s'), '| pattern:', await p.inputValue('#pat'), '| bpm', await p.textContent('#bpm'), '| patsel:', await p.$$eval('#patsel option', o => o.map(x => x.textContent.trim())));
  await p.click('#cn'); await p.click('#cn'); await p.waitForTimeout(200); console.log('after chorus chord, pattern:', await p.inputValue('#pat'));
  // 3. tuner against Chromium's fake mic
  await p.evaluate(() => { const ac = new AudioContext(), dest = ac.createMediaStreamDestination(); const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110 * Math.pow(2, 10 / 1200); const g = ac.createGain(); g.gain.value = .25; o.connect(g).connect(dest); o.start(); const noise = ac.createBufferSource(), nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() - .5) * .08; noise.buffer = nb; noise.loop = true; const ng = ac.createGain(); ng.gain.value = 1; noise.connect(ng).connect(dest); noise.start(); navigator.mediaDevices.getUserMedia = async c => c.audio ? dest.stream : Promise.reject(new Error('x')); });
  await p.evaluate(() => window.__rcc.show('tuner')); await p.click('#tonbtn'); await p.waitForTimeout(3500);
  console.log('tuner:', await p.textContent('#tnote'), '|', await p.textContent('#tinfo'), '| mics:', await p.$$eval('#micsel option', o => o.length));
  await p.screenshot({ path: '/tmp/claude-0/shots/tuner-running.png' }); await p.click('#tonbtn');
  // 4. scales quiz + playlists + menu
  await p.evaluate(() => window.__rcc.show('scales')); await p.click('#sc-quiz'); const notes = await p.$$eval('#sc-quizbox .qh b', e => e[0].textContent); console.log('quiz:', notes);
  console.log(errs.length ? errs.join('\n') : 'NO ERRORS'); await b.close();
})();
