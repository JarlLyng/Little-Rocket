/**
 * Background music — random loop selection.
 *
 * Drop MP3 files into the `audio/` folder at the repo root, then add their
 * paths to LOOPS below. The module loads on demand (after the cinematic
 * intro), picks a loop at random, and queues another random loop when the
 * current one ends. The same loop never plays twice in a row when there
 * are 2+ entries.
 *
 * If LOOPS is empty, the rest of the module no-ops and the music button
 * stays hidden. Engine audio still works either way.
 *
 * Mute state persists across sessions in localStorage.
 */

const LOOPS = [
  // Add your loop file paths here, e.g.:
  // 'audio/loop-cosmic-drift.mp3',
  // 'audio/loop-deep-space.mp3',
];

const VOLUME = 0.4;
const STORAGE_KEY = 'little-rocket:music-muted';

let current = null;
let muted = false;
let started = false;

export function hasMusic() {
  return LOOPS.length > 0;
}

export function startMusic() {
  if (started || !hasMusic()) return;
  started = true;
  muted = localStorage.getItem(STORAGE_KEY) === '1';
  playNext();
}

export function toggleMusic() {
  muted = !muted;
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
  if (current) current.volume = muted ? 0 : VOLUME;
  return muted;
}

export function isMuted() {
  return muted;
}

function pickRandom(excludeUrl) {
  if (LOOPS.length === 1) return LOOPS[0];
  let url;
  do { url = LOOPS[Math.floor(Math.random() * LOOPS.length)]; }
  while (url === excludeUrl);
  return url;
}

function playNext(excludeUrl) {
  const url = pickRandom(excludeUrl);
  const audio = new Audio(url);
  audio.volume = muted ? 0 : VOLUME;
  audio.addEventListener('ended', () => playNext(url), { once: true });
  audio.play().catch((err) => {
    // Autoplay blocked, file missing, or unsupported codec.
    // Fail silently — the game keeps working without music.
    console.warn('Music could not start:', url, err);
  });
  current = audio;
}
