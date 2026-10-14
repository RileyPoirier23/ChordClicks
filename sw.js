/* ChordClicks service worker: caches the whole app so the browser / phone version opens and works with no
   connection. Saved songs live in localStorage, so they are always available; only Ultimate Guitar needs Wi-Fi. */
const VERSION = 'chordclicks-3.1.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './build/icon.png', './src/styles.css',
  './src/lib/theory.js', './src/lib/pitch.js', './src/lib/song.js', './src/lib/chroma.js', './src/lib/sync.js', './src/lib/requests.js',
  './src/js/audio.js', './src/js/capture-worklet.js', './src/js/store.js', './src/js/ug.js', './src/js/fretboard.js', './src/js/overlay.js', './src/js/solo.js',
  './src/js/tuner.js', './src/js/backing.js', './src/js/gear.js', './src/js/record.js', './src/js/chords.js', './src/js/library2.js', './src/js/controls.js',
  './src/js/fingerpick.js', './src/js/learn.js', './src/js/scales.js', './src/js/app.js',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;       // Ultimate Guitar etc. go straight to the network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => { if (r && r.ok) caches.open(VERSION).then(c => c.put(e.request, r.clone())); return r; }).catch(() => hit);
    return hit || net;
  }));
});
