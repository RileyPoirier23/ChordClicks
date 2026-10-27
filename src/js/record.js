/* Record mode (phones first, works on desktop too): full-screen camera with the chord overlay, a big record button,
   then a quick editor (trim, title) and "Save to camera roll" (native share sheet on phones, Save dialog on desktop). */
(function () {
  const RCC = (window.RCC = window.RCC || {});
  const A = RCC.audio, $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = t => { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '.' + String(Math.floor((t % 1) * 10)); };
  const isPhone = () => matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const cap = () => (window.Capacitor && window.Capacitor.Plugins) || null;
  let D, take = null, trim = { a: 0, b: 0 }, dur = 0, portrait = false, timer = null, busy = false, onView = false, prevSize = null;

  /* ---------- stage ---------- */
  function orient(p) {
    portrait = p; $('rec-orient').textContent = portrait ? 'Portrait' : 'Landscape'; $('rec-orient').classList.toggle('on', portrait);
    D.setOutputSize(portrait ? 720 : 1280, portrait ? 1280 : 720); $('rec-stage').classList.toggle('portrait', portrait);
  }
  function paintLayouts() {
    const sel = $('rec-layout'); sel.innerHTML = Object.entries(D.modes).map(([k, m]) => `<option value="${k}" ${D.P.ov.mode === k ? 'selected' : ''}>${m.name}</option>`).join('');
  }
  function tick() {
    const R = A.recorder; if (R.active()) { const e = R.elapsed(); $('rec-time').textContent = Math.floor(e / 60) + ':' + String(Math.floor(e % 60)).padStart(2, '0'); }
    $('rec-song').textContent = D.songTitle() || '';
  }
  async function toggleRec() {
    const R = A.recorder; if (busy) return;
    if (R.active()) {
      const t = await R.stop(); $('rec-go').classList.remove('rec'); $('rec-go').title = 'Record'; $('rec-stage').classList.remove('recording');
      await A.setMicRecorded(false); if ($('rec-stopsong').checked && D.running()) D.toggle();
      if (t && t.size > 2000) openEditor(t); else D.toast('Nothing was recorded'); return;
    }
    if (!R.supported()) { D.toast('Recording is not supported in this browser'); return; }
    try { A.get(); await A.resume(); if ($('rec-mic').checked) await A.setMicRecorded(true); } catch (e) { D.toast('Microphone unavailable: ' + (e.message || e)); $('rec-mic').checked = false; }
    A.setClickRecorded($('rec-click').checked); A.recGuitar.gain.value = A.fx && A.fx.running ? 1 : 0;
    let n = 3; $('rec-count').hidden = false;
    await new Promise(res => { const step = () => { if (n <= 0) { $('rec-count').hidden = true; res(); return; } $('rec-count').textContent = n--; A.click(A.get().currentTime + .01, n === 2, false, .6); setTimeout(step, 1000); }; step(); });
    if (D.camLive && !D.camLive()) { await D.startCam(); await new Promise(r => setTimeout(r, 600)); }
    if (D.camLive && !D.camLive()) { D.toast('The camera isn’t sending video — allow camera access and try again'); await A.setMicRecorded(false); return; }
    R.start({ canvas: D.out, video: true }); $('rec-go').classList.add('rec'); $('rec-go').title = 'Stop'; $('rec-stage').classList.add('recording');
    if ($('rec-autosong').checked && !D.running()) D.toggle();
    // prove it: the recorder must have produced data and the camera must still be live a moment in, or we stop and say so
    setTimeout(async () => {
      if (!R.active()) return;
      const dead = !R.flowing() || (D.camLive && !D.camLive());
      if (dead) { const t = await R.stop(); $('rec-go').classList.remove('rec'); $('rec-stage').classList.remove('recording'); await A.setMicRecorded(false); if (D.running()) D.toggle(); D.toast(!R.flowing() ? 'Recording didn’t start: this browser can’t record the camera view. Try the ChordClicks app or Chrome.' : 'The camera stopped when the mic opened, so the recording was cancelled. Turn off “Mic / voice” and try again.'); }
    }, 2500);
  }
  /* ---------- editor ---------- */
  function openEditor(t) {
    take = t; dur = t.dur; trim = { a: 0, b: t.dur }; $('rec-edit').hidden = false; $('rec-stage').classList.add('editing');
    const v = $('rec-vid'); v.src = t.url; v.muted = false;
    $('rec-title').value = (D.songTitle() || 'ChordClicks') + ' ' + new Date().toLocaleDateString();
    // WebM from MediaRecorder reports an unknown duration until it is seeked to the end
    v.onloadedmetadata = () => { if (!isFinite(v.duration) || v.duration <= 0) { v.currentTime = 1e6; v.ontimeupdate = () => { v.ontimeupdate = null; if (isFinite(v.duration) && v.duration > 0) dur = v.duration; v.currentTime = 0; setTrim(); }; } else { dur = v.duration; setTrim(); } };
    setTrim(); paintInfo();
    v.ontimeupdate = v.ontimeupdate || (() => { if (v.currentTime >= trim.b - .02 && !v.paused && $('rec-preview').classList.contains('on')) { v.pause(); $('rec-preview').classList.remove('on'); } });
  }
  function setTrim() { trim.b = Math.min(trim.b || dur, dur); $('rec-a').max = $('rec-b').max = Math.max(.1, dur); $('rec-a').value = trim.a; $('rec-b').value = trim.b; paintInfo(); }
  function paintInfo() {
    $('rec-ta').textContent = fmt(trim.a); $('rec-tb').textContent = fmt(trim.b); $('rec-len').textContent = fmt(Math.max(0, trim.b - trim.a)) + ' of ' + fmt(dur);
    $('rec-save').textContent = (isPhone() ? 'Save to camera roll' : 'Save video') + (trimmed() ? ' (trimmed)' : '');
    const canTrim = typeof HTMLMediaElement.prototype.captureStream === 'function' || typeof HTMLMediaElement.prototype.mozCaptureStream === 'function';
    $('rec-trimnote').textContent = trimmed() && !canTrim ? 'This browser can’t cut video itself, so the full take will be saved. Trim it in your Photos app.' : trimmed() ? 'Trimming re-encodes the clip in real time, so a 20 s clip takes about 20 s.' : '';
  }
  const trimmed = () => trim.a > .15 || trim.b < dur - .15;
  function previewTrim() { const v = $('rec-vid'); if (!v.paused) { v.pause(); $('rec-preview').classList.remove('on'); return; } v.currentTime = trim.a; $('rec-preview').classList.add('on'); v.play().catch(() => {}); }
  /** Re-record the chosen range through a canvas so the saved file only holds the trimmed part. */
  function cutVideo() {
    return new Promise((res, rej) => {
      const v = $('rec-vid'); const grab = v.captureStream ? v.captureStream.bind(v) : v.mozCaptureStream && v.mozCaptureStream.bind(v); if (!grab) return res(take.blob);
      const pick = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
      const chunks = []; let rec; v.pause(); v.muted = false; v.volume = 0;      // audio must stay unmuted for captureStream to carry it
      const start = () => {
        const s = grab(); try { rec = new MediaRecorder(s, { mimeType: pick || undefined, videoBitsPerSecond: 5e6, audioBitsPerSecond: 160e3 }); } catch (e) { return res(take.blob); }
        rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => { v.volume = 1; const b = new Blob(chunks, { type: pick || 'video/webm' }); res(b.size > 1000 ? Object.assign(b, { ext: /mp4/.test(pick) ? 'mp4' : 'webm' }) : take.blob); };
        rec.start(500); v.play().catch(rej);
        const watch = () => { const p = (v.currentTime - trim.a) / Math.max(.1, trim.b - trim.a); $('rec-prog').style.width = Math.max(0, Math.min(100, p * 100)) + '%'; if (v.currentTime >= trim.b - .03 || v.ended) { v.pause(); try { rec.stop(); } catch (e) { res(take.blob); } } else requestAnimationFrame(watch); }; watch();
      };
      v.currentTime = trim.a; v.onseeked = () => { v.onseeked = null; start(); };
    });
  }
  async function save() {
    if (!take || busy) return; busy = true; $('rec-save').disabled = true; $('rec-prog').style.width = '0';
    try {
      const name = ($('rec-title').value.trim() || 'ChordClicks take').replace(/[^\w\- ]+/g, '').slice(0, 60) || 'ChordClicks take';
      let blob = take.blob, ext = take.ext || 'webm';
      if (trimmed()) { $('rec-msg').textContent = 'Cutting…'; blob = await cutVideo(); ext = blob.ext || ext; }
      $('rec-msg').textContent = 'Saving…'; const file = name + '.' + ext, type = blob.type || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
      const how = await exportFile(blob, file, type);
      $('rec-msg').textContent = how === 'share' ? 'Shared — choose “Save video” on your phone to put it in your camera roll.' : how === 'saved' ? 'Saved.' : 'Downloaded (' + file + ').';
      D.toast(how === 'share' ? 'Pick “Save video” to keep it in your camera roll' : 'Saved ' + file);
    } catch (e) { $('rec-msg').textContent = 'Could not save: ' + (e.message || e); }
    busy = false; $('rec-save').disabled = false; $('rec-prog').style.width = '0';
  }
  async function exportFile(blob, file, type) {
    // 1) native app: write to the cache folder and open the share sheet (iOS Photos "Save Video", Android gallery)
    const C = cap();
    if (C && C.Filesystem && C.Share) {
      const b64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
      const w = await C.Filesystem.writeFile({ path: file, data: b64, directory: 'CACHE' });
      await C.Share.share({ title: file, files: [w.uri] }); return 'share';
    }
    // 2) mobile browser / PWA: Web Share with a file
    try { const f = new File([blob], file, { type }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: file }); return 'share'; } } catch (e) { if (e && e.name === 'AbortError') throw new Error('cancelled'); }
    // 3) desktop app: Save dialog
    if (window.rcc && window.rcc.saveRecording) { const r = await window.rcc.saveRecording(file, await blob.arrayBuffer()); if (!r || !r.ok) throw new Error('cancelled'); return 'saved'; }
    // 4) plain download
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove(); return 'download';
  }
  function closeEditor(discard) {
    const v = $('rec-vid'); v.pause(); v.removeAttribute('src'); v.load(); $('rec-edit').hidden = true; $('rec-stage').classList.remove('editing'); $('rec-msg').textContent = '';
    if (discard && take) { try { URL.revokeObjectURL(take.url); } catch (e) {} } take = null;
  }

  function init(deps) {
    D = deps;
    $('rec-go').onclick = toggleRec; $('rec-flip').onclick = () => D.flipCam(); $('rec-orient').onclick = () => orient(!portrait);
    $('rec-layout').onchange = e => D.setMode(e.target.value); $('rec-mir').onchange = e => { D.P.mir = e.target.checked; D.saveP(); };
    $('rec-a').oninput = e => { trim.a = Math.min(+e.target.value, trim.b - .1); e.target.value = trim.a; paintInfo(); $('rec-vid').currentTime = trim.a; };
    $('rec-b').oninput = e => { trim.b = Math.max(+e.target.value, trim.a + .1); e.target.value = trim.b; paintInfo(); $('rec-vid').currentTime = trim.b; };
    $('rec-preview').onclick = previewTrim; $('rec-save').onclick = save; $('rec-again').onclick = () => closeEditor(true); $('rec-keep').onclick = () => closeEditor(false);
    $('rec-mic').checked = true; $('rec-autosong').checked = true;
    setInterval(tick, 250);
  }
  RCC.record = {
    init,
    onView(on) {
      onView = on; if (!D) return;
      if (on) { paintLayouts(); $('rec-mir').checked = !!D.P.mir; if (prevSize == null) { prevSize = [D.out.width, D.out.height]; orient(isPhone() && innerHeight > innerWidth); } }
      else if (prevSize && !A.recorder.active()) { D.setOutputSize(prevSize[0], prevSize[1]); prevSize = null; portrait = false; $('rec-stage').classList.remove('portrait'); }
    },
    recording: () => A.recorder.active(),
    exportFile,
  };
})();
