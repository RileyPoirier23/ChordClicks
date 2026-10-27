/* Chords from a recording (Pro): pick an MP3/WAV/M4A, the app decodes it, runs the chromagram chord detector and gives you a
   timed chord sheet to open in Practice or save to the library. Everything runs on the device. */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function decode(file) {
    const c = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 22050);
    const buf = await c.decodeAudioData(await file.arrayBuffer());
    // mono mix, then resample to 22.05k with an offline context (keeps the FFT cheap)
    const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 22050), 22050), src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const r = await off.startRendering(); return { samples: r.getChannelData(0), sr: 22050, duration: buf.duration };
  }
  function open() {
    const a = RCC.app; if (RCC.pro && !RCC.pro.gate('trainer')) return;
    a.dialog(`<h2>Chords from a recording</h2><p class="small" style="line-height:1.5;margin:4px 0 10px">Pick a song file (MP3, WAV, M4A, OGG). ChordClicks listens for the chords and writes a sheet with timestamps. Works best on clear, guitar- or piano-led recordings; it hears triads and 7ths, not every colour chord.</p>
      <div class="row"><input type="file" id="tc-file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"><label class="l">Tempo</label><input type="number" id="tc-bpm" placeholder="auto" min="40" max="240" style="width:80px"><span class="small">bpm (optional, steadies the result)</span></div>
      <div class="small" id="tc-msg"></div><div id="tc-out"></div>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" id="tc-x">Close</button></div>`, () => {
      $('tc-x').onclick = a.closeDlg;
      $('tc-file').onchange = async e => {
        const f = e.target.files[0]; if (!f) return; const msg = $('tc-msg'); msg.textContent = 'Decoding…'; $('tc-out').innerHTML = '';
        try {
          const { samples, sr, duration } = await decode(f); if (duration > 12 * 60) throw new Error('That file is over 12 minutes — trim it first.');
          msg.textContent = 'Listening for chords…'; await new Promise(r => setTimeout(r, 30));
          const res = RCC.chordsFromAudio.analyze(samples, sr, { bpm: +$('tc-bpm').value || 0 });
          if (!res.segments.length) { msg.textContent = 'Nothing chord-like found. Try a cleaner recording or a louder file.'; return; }
          const title = f.name.replace(/\.[^.]+$/, ''), sheet = RCC.chordsFromAudio.toSheet(res, title);
          msg.textContent = `${res.segments.length} chord changes · ${res.chords.length} different chords${res.key ? ' · key of ' + res.key.name : ''} · ${Math.round(duration)}s`;
          $('tc-out').innerHTML = `<div class="chain" style="margin:8px 0">${res.chords.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div><pre class="tc-sheet">${esc(sheet)}</pre><div class="row"><button class="btn p" id="tc-open">Open in Practice</button><button class="btn" id="tc-save">Save to library</button><span class="small">Timestamps are where each line starts in the recording.</span></div>`;
          const song = { title, artist: 'From recording', text: sheet, bpm: +$('tc-bpm').value || 0, meta: res.key ? { key: res.key.name } : {} };
          $('tc-open').onclick = () => { a.closeDlg(); a.loadSong(a.tempSong(song.title, song.text, { artist: song.artist, bpm: song.bpm, meta: song.meta })); a.show('practice'); };
          $('tc-save').onclick = () => { if (!RCC.pro.canAddSong(RCC.store.lib.songs.length)) { RCC.pro.upsell('library'); return; } const s = RCC.store.addSong({ ...song, strums: [], pat: '', genre: '' }); a.closeDlg(); a.loadSong(s); a.show('practice'); a.toast('Saved “' + title + '”'); };
        } catch (err) { msg.textContent = 'Could not read that file: ' + (err.message || err); }
      };
    });
    $('dlg').classList.add('wide');
  }
  RCC.transcribe = { open, decode };
})();
