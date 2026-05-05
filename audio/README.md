# Music loops

Loops in this folder are played by `src/music.js` after the cinematic intro
ends. The first cycle plays them in the order listed in `LOOPS`; subsequent
cycles pick at random with no immediate repeat.

## Format

The repo currently ships AAC/M4A files at 160 kbps stereo. AAC is supported
by every modern browser (including iOS Safari) and produces ~20% smaller
files than MP3 at the same perceived quality. MP3 still works if you prefer
— update the file extensions in `LOOPS` and the player handles either.

## Adding or replacing loops

1. Drop new files into this folder
2. Add or update their paths in the `LOOPS` array in `src/music.js`:
   ```js
   const LOOPS = [
     'audio/00.m4a',
     'audio/01.m4a',
   ];
   ```

The ♪ button in the top-right HUD appears automatically as long as `LOOPS`
has at least one entry.

## Converting WAV → AAC on macOS

`afconvert` ships with macOS — no install needed:

```bash
afconvert -f m4af -d aac -b 160000 input.wav output.m4a
```

For MP3 instead, install `ffmpeg` (`brew install ffmpeg`) and use:

```bash
ffmpeg -i input.wav -codec:a libmp3lame -b:a 160k output.mp3
```

## Recommendations

- **Length**: 60–180 seconds works well — long enough to settle into,
  short enough that the random selector keeps things fresh
- **Loudness**: aim for around -16 LUFS so the engine audio stays audible
  on top
- **Loop seam**: the player switches loops on `ended`, so each track plays
  through to its natural end. Trim the tail to a clean resolution rather
  than relying on a hard cut
