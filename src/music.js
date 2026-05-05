/**
 * Background music.
 *
 * Plays loops in array order on the first cycle (so the player hears them
 * in the intended sequence), then switches to random selection with no
 * immediate repeat. AAC/M4A — modern browsers all support it; smaller
 * files than MP3 at the same quality.
 *
 * If LOOPS is empty, the rest of the module no-ops and the music button
 * stays hidden. Engine audio still works either way.
 *
 * Mute state persists across sessions in localStorage.
 */

const LOOPS = [
  'audio/00.m4a',
  'audio/01.m4a',
  'audio/02.m4a',
  'audio/03.m4a',
];

const VOLUME = 0.4;
const STORAGE_KEY = 'little-rocket:music-muted';

let current = null;
let muted = false;
let started = false;
let initialIndex = 0;   // walks LOOPS in order on the first pass
let lastUrl = null;     // for no-repeat random selection after the first pass

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

function pickNext() {
  // First pass: deterministic order so the curated sequence plays once.
  if (initialIndex < LOOPS.length) return LOOPS[initialIndex++];
  // Subsequent passes: random with no immediate repeat.
  if (LOOPS.length === 1) return LOOPS[0];
  let url;
  do { url = LOOPS[Math.floor(Math.random() * LOOPS.length)]; }
  while (url === lastUrl);
  return url;
}

function playNext() {
  const url = pickNext();
  lastUrl = url;
  const audio = new Audio(url);
  audio.volume = muted ? 0 : VOLUME;
  audio.addEventListener('ended', playNext, { once: true });
  audio.play().catch((err) => {
    // Autoplay blocked, file missing, or unsupported codec.
    // Fail silently — the game keeps working without music.
    console.warn('Music could not start:', url, err);
  });
  current = audio;
}
