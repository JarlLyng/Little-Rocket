# Music loops

Drop MP3 files in this folder and add their paths to the `LOOPS` array in
`src/music.js`:

```js
const LOOPS = [
  'audio/loop-cosmic-drift.mp3',
  'audio/loop-deep-space.mp3',
];
```

Notes:

- **Format**: MP3 is the safest cross-browser choice. OGG/Vorbis works
  everywhere except Safari < 17. Web Audio supports both.
- **Length**: 60–180 seconds works well — long enough to settle into,
  short enough that the random selector keeps things fresh.
- **Loudness**: aim for around -16 LUFS. The engine audio sits below that,
  so a bit of headroom keeps both audible.
- **Looping**: the player switches loops on `ended`, so each track plays
  through to its natural end. Keep an outro that resolves cleanly, or
  trim to a length that loops on itself.

The music button (♪ in the top-right HUD) only appears once `LOOPS` has at
least one entry. Mute state persists in localStorage.
