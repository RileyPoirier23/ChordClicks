# ChordClicks

**Practice songs, scales and solos with your chords burned into your camera feed.**
Free guitar practice app for Windows. Created by Riley Mackay-Poirier [@506clicks](https://www.506clicks.ca).

[**Download for Windows**](https://github.com/RileyPoirier23/chordclicks/releases/latest/download/ChordClicks-Setup.exe) ·
[Portable .exe](https://github.com/RileyPoirier23/chordclicks/releases/latest/download/ChordClicks-Portable.exe) ·
[All releases](https://github.com/RileyPoirier23/chordclicks/releases)

The installer keeps itself up to date. Windows may warn about an unknown publisher: click "More info" then "Run anyway".

## What it does
- **Practice**: search Ultimate Guitar or your library, auto-scroll chords, loop sections, tempo ramps, backing tracks and a metronome.
- **Solo**: play-along scoring from your mic or interface, "wait for me" mode, loop bars, latency calibration.
- **Scales**: scales, arpeggios, triads and CAGED shapes with a circle-of-fifths picker.
- **Learn**: chord-change trainer, ear training, theory lessons, chord library and progress tracking.
- **Tuner**: chromatic tuner for guitar, bass, uke and 7-string, plus an intonation checker.
- **Gear**: pedals, amp, looper and recorder.
- **Stream**: chord diagrams and fretboard overlaid on your webcam, karaoke-style Stage layout, scenes, Twitch chat song requests, and a virtual camera for Zoom, Discord, Teams or OBS.
- **Library**: difficulty ratings, "songs I can play", transpose/capo, playlists, set notes and PDF export, optional cloud sync.

Upgrading from Chordify? Your accounts and songs are copied over automatically on first launch.

## Develop
```
npm install
npm test
npm start
npm run dist
```
See [README_BUILD.md](README_BUILD.md) for the full build notes. Pushing a new `version` in `package.json` to `main` builds and publishes a release automatically.
