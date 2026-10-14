# ChordClicks 3.0 – build notes

Build notes for developers. The virtual camera setup script lives in `setup/`
(`install-virtualcam.ps1` + `.bat`).

```
chordclicks/
├── index.html  main.js  preload.js  auth.js
├── src/
│   ├── styles.css
│   ├── lib/  theory song pitch chroma sync requests      (pure logic, unit-tested in node)
│   └── js/   app store ug overlay fretboard solo scales tuner fingerpick
│             audio capture-worklet gear backing chords learn library2 controls
├── manifest.webmanifest  sw.js   (installable web app, offline cache)
├── capacitor.config.json android/ ios/   (phone apps; `npm run web` fills www/)
├── server/server.js      (optional cloud-sync server, zero dependencies)
├── scripts/vcam.py       (RGBA frames + binary stdin)
├── build/                icon / installer artwork / installer.nsh
└── test/   lib.test.js auth.test.js server.test.js   ui.cjs ui2.cjs ui3.cjs (headless UI tests)
```

## Build
```powershell
npm install
npm test          # unit tests (parsing, pitch, chords, merge, accounts, sync server)
npm start         # run it
npm run dist      # dist\ChordClicks-3.0.0-setup.exe + portable .exe
```
The UI tests (`node test/ui3.cjs`) need Playwright; they drive the page in headless Chromium with
synthetic microphone input.

## What is where
| Area | Where |
|---|---|
| Play-along scoring, "wait for me", loop bars, tempo ramp | Solo view (`solo.js`) |
| Chord-change trainer, ear training, theory lessons, chord library, progress | Learn view (`learn.js`, `chords.js`) |
| Scales / Arpeggios / Triads / CAGED, circle-of-fifths picker | Scales view (`scales.js`) |
| Pedals + amp, looper, recorder, live level feedback | Gear view (`gear.js`, `audio.js`) |
| Chromatic tuner for bass/uke/7-string/etc., intonation checker | Tuner view |
| Loop a section, slow-down ramp, backing track, silent bars, accents, flash | Practice view (right column) |
| Chord diagrams in every overlay layout, Stage (karaoke) layout, scenes, chat requests | Stream view |
| Difficulty rating, "songs I can play", transpose/capo, import, set notes + PDF | Library view / Key-Capo button |
| Hotkeys, global hotkeys, MIDI foot pedal, cloud sync | Settings view |
| Ultimate Guitar search / preview / import (`ug:fetch` IPC on desktop, native HTTP on phones, hidden webview fallback) | Find view (`ug.js`) |
| Fingerpicking patterns, tab generator for Solo | Learn view (`fingerpick.js`) |
| Looper capture on the audio thread | `capture-worklet.js` (+ ScriptProcessor fallback) |
| Offline: online/offline events, service worker, saved songs only | `app.js` paintOnline, `sw.js` |
| Record mode: portrait/landscape output, countdown, trim (real-time re-encode), export via Capacitor Share → Web Share → Save dialog → download | `record.js`, `overlay.js` setSize, `audio.js` setMicRecorded |

## Phone apps (Capacitor)
`npm run web` copies the app into `www/`; `npx cap sync` pushes it into `android/` and `ios/`. Open those with
Android Studio / Xcode to run on a device or build a store package. `CapacitorHttp` is enabled so `fetch()` to
Ultimate Guitar goes through native HTTP (no CORS). Mic and camera permissions are declared in the manifest / Info.plist.
The UI switches to a bottom tab bar and single-column layout under 820px wide.

## Cloud sync (optional)
Run `node server/server.js` on any machine you control (`PORT=8787`, data in `server-data/`). Put it behind
HTTPS (Caddy, nginx, Fly.io, Render…) before exposing it to the internet: the desktop app only accepts
`https://` addresses (or `http://localhost` for testing). In the app: Settings → Cloud sync → create a sync
account. Songs, playlists, known chords, learned scales and practice stats merge newest-edit-wins, and
deletions are remembered.

## Things worth knowing
* Play-along scoring and chord checks use the microphone/interface. Pick a clean input in Gear or Tuner; use
  the Latency slider in Solo if good notes are being marked late. Scoring matches pitch *class* (any octave).
* Hotkeys: in-app keys work everywhere; "Global" keys use Electron `globalShortcut` and can fail if another app
  owns the combination (the app tells you). MIDI pedals use Web MIDI (Windows: plug in before launching).
* Twitch chat requests read chat anonymously over `wss://irc-ws.chat.twitch.tv`. YouTube chat is not supported.
* Recordings are WebM (VP9/Opus) saved through a Save dialog.

## Branding / signing
`npm run assets` (needs Python + Pillow) regenerates the icon and installer images from `build/make_assets.py`.
Only a code-signing certificate removes the "Unknown publisher" SmartScreen warning; add
`"win": { "signtoolOptions": { ... } }` to the `build` section of package.json when you have one.

## Accounts
Accounts are local to the computer (scrypt-hashed passwords; libraries in
`%APPDATA%\ChordClicks\accounts`). Use Settings → Export songs to back up, or cloud sync.
