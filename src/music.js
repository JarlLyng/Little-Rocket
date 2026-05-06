/**
 * Background music.
 *
 * Plays loops in array order on the first cycle (so the player hears them
 * in the intended sequence), then switches to random selection with no
 * immediate repeat. AAC/M4A — modern browsers all support it; smaller
 * files than MP3 at the same quality.
 *
 * Gap-free handover: while the current track plays, the next track is
 * already created with preload='auto' so the file is fetched and decoded
 * in the background. When the current track's `ended` fires, the next
 * element is ready and .play() starts almost instantly (~tens of ms vs
 * ~1s for cold instantiation).
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

let current = null;     // currently playing HTMLAudioElement
let next = null;        // pre-loaded HTMLAudioElement waiting to play
let nextUrl = null;     // the URL we picked for `next` (kept for lastUrl tracking)
let muted = false;
let started = false;
let initialIndex = 0;
let lastUrl = null;

export function hasMusic() {
  return LOOPS.length > 0;
}

export function startMusic() {
  if (started || !hasMusic()) return;
  started = true;
  muted = localStorage.getItem(STORAGE_KEY) === '1';

  const url = pickNextUrl();
  lastUrl = url;
  current = createAudio(url);
  current.addEventListener('ended', advance, { once: true });
  current.play().catch((err) => console.warn('Music could not start:', url, err));

  prefetchNext();
}

export function toggleMusic() {
  muted = !muted;
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
  const v = muted ? 0 : VOLUME;
  if (current) current.volume = v;
  if (next)    next.volume = v;
  return muted;
}

export function isMuted() {
  return muted;
}

function pickNextUrl() {
  // First pass: deterministic order so the curated sequence plays once.
  if (initialIndex < LOOPS.length) return LOOPS[initialIndex++];
  // Subsequent passes: random with no immediate repeat.
  if (LOOPS.length === 1) return LOOPS[0];
  let url;
  do { url = LOOPS[Math.floor(Math.random() * LOOPS.length)]; }
  while (url === lastUrl);
  return url;
}

function createAudio(url) {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.volume = muted ? 0 : VOLUME;
  // Trigger eager fetch + decode. Browser may already do this but be explicit.
  audio.load();
  return audio;
}

function prefetchNext() {
  nextUrl = pickNextUrl();
  next = createAudio(nextUrl);
}

function advance() {
  if (next) {
    // Promote the pre-loaded element. By now the file is fetched and
    // decoded (we had the entire current loop's duration to load it),
    // so .play() starts almost immediately.
    lastUrl = nextUrl;
    current = next;
    next = null;
    nextUrl = null;
    current.addEventListener('ended', advance, { once: true });
    current.play().catch((err) => console.warn('Music advance failed:', err));
  } else {
    // Fallback: prefetch hadn't completed (network glitch, fast end).
    const url = pickNextUrl();
    lastUrl = url;
    current = createAudio(url);
    current.addEventListener('ended', advance, { once: true });
    current.play().catch((err) => console.warn('Music cold start failed:', err));
  }
  prefetchNext();
}
