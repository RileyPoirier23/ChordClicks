# ChordClicks

**Practice songs, scales and solos with your chords burned into your camera feed.**
Free guitar practice app for Windows. Created by Riley Mackay-Poirier [@506clicks](https://www.506clicks.ca).

[**Download for Windows**](https://github.com/RileyPoirier23/chordclicks/releases/latest/download/ChordClicks-Setup.exe) ·
[Portable .exe](https://github.com/RileyPoirier23/chordclicks/releases/latest/download/ChordClicks-Portable.exe) ·
[All releases](https://github.com/RileyPoirier23/chordclicks/releases)

The installer keeps itself up to date. Windows may warn about an unknown publisher: click "More info" then "Run anyway".

## What it does
- **Find**: search Ultimate Guitar inside the app (no website, no ads), preview a version, and import it with chords, key, capo, tuning, tempo and strumming patterns.
- **Practice**: auto-scroll chords, loop sections, tempo ramps, backing tracks and a metronome. Works offline with everything you've saved.
- **Solo**: play-along scoring from your mic or interface, bends / slides / hammer-ons drawn on the highway and the neck, "wait for me" mode, loop bars, latency calibration.
- **Scales**: scales, arpeggios, triads and CAGED shapes with a circle-of-fifths picker.
- **Learn**: chord-change trainer, ear training, fingerpicking patterns (p i m a, Travis, rolls, tremolo), theory lessons, chord library and progress tracking.
- **Tuner**: chromatic tuner for guitar, bass, uke and 7-string, plus an intonation checker.
- **Gear**: pedals, amp, a sample-accurate looper (AudioWorklet) and recorder.
- **Record**: a camera view with the overlay burned in, a record button, then trim and title your take and save it to your camera roll (phone) or a file (desktop).
- **Stream**: chord diagrams and fretboard overlaid on your webcam, karaoke-style Stage layout, scenes, Twitch chat song requests, and a virtual camera for Zoom, Discord, Teams or OBS.
- **Library**: difficulty ratings, "songs I can play", transpose/capo, playlists, set notes and PDF export, optional cloud sync.

Upgrading from Chordify? Your accounts and songs are copied over automatically on first launch.

## Free and Pro
Practice, Find/import (20 songs), tuner, scales, chord library, Solo watch mode and Record are free. **Pro** ($24.99 once) adds
play-along scoring, the trainers, arpeggios / triads / CAGED, the looper, the streaming kit, unlimited library + set lists,
all fingerpicking patterns and cloud sync. Everyone gets a 7-day trial in-app. Keys are verified offline:
```
node scripts/licence.mjs keygen              # once: writes licence-private.jwk (keep it secret) and installs the public key in src/js/pro.js
node scripts/licence.mjs issue "Jane Doe" --email jane@example.com   # per order: prints a CCPRO-… key to email the buyer
node scripts/licence.mjs verify CCPRO-…
```

## Ultimate Guitar on web and phones (helper server)
Browsers block cross-site reads, so the web and phone builds relay Ultimate Guitar through a tiny server you run for free:
either `deploy/ug-proxy.worker.js` on Cloudflare Workers (`wrangler deploy deploy/ug-proxy.worker.js --name chordclicks-ug`)
or this repo on Render (`render.yaml`, which also hosts cloud sync). Paste the address into Settings → Helper server.
The Windows app needs none of this.

## Phone / tablet
The same app runs as a native Android / iOS app through Capacitor, and as an installable web app (PWA). Saved songs,
practice, solo scoring, scales, learn, tuner, gear and Record all work with no connection; Ultimate Guitar search needs Wi-Fi.
Record mode shoots portrait or landscape with the front or back camera; the save step opens the share sheet so the video lands in Photos / the gallery.
```
npm run web          # builds www/ (static bundle, also fine for any web host)
npm run android      # syncs www/ into android/ and opens Android Studio
npm run ios          # syncs www/ into ios/ and opens Xcode (Mac only)
```

## Develop
```
npm install
npm test
npm start
npm run dist
```
See [README_BUILD.md](README_BUILD.md) for the full build notes. Pushing a new `version` in `package.json` to `main` builds and publishes a release automatically.
