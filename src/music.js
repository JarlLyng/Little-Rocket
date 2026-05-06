/**
 * Background music with sample-accurate gapless transitions.
 *
 * Implementation: Web Audio API. All loops are decoded into AudioBuffers
 * up front. Each track plays through an AudioBufferSourceNode whose
 * .start(when) is scheduled at the exact end time of the previous one.
 * Two sources are kept ahead in the chain at any moment, so the audio
 * engine has the next clip queued before the current one finishes —
 * no gap, not even a millisecond.
 *
 * Plays loops in array order on the first cycle (curated opening
 * sequence), then random with no immediate repeat.
 *
 * Mute is a smooth GainNode ramp instead of a hard flip, so toggling
 * doesn't click.
 *
 * If LOOPS is empty, the rest of the module no-ops and the music button
 * stays hidden.
 */

const LOOPS = [
  'audio/00.m4a',
  'audio/01.m4a',
  'audio/02.m4a',
  'audio/03.m4a',
];

const VOLUME = 0.4;
const STORAGE_KEY = 'little-rocket:music-muted';
const PRELOAD_LEAD_S = 0.05; // tiny offset so the very first source starts cleanly

let ctx = null;
let masterGain = null;
let buffers = [];
let loadingPromise = null;
let lastScheduledEndTime = 0;
let initialIndex = 0;
let lastIndex = -1;
let muted = false;
let started = false;

export function hasMusic() {
  return LOOPS.length > 0;
}

export function isMuted() {
  return muted;
}

/**
 * Create the AudioContext and kick off file fetch + decode. Must be called
 * from a user gesture (Start click) since browsers block AudioContext
 * creation/resume otherwise.
 */
export function initMusic() {
  if (!hasMusic() || ctx) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  masterGain = ctx.createGain();
  muted = (() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  })();
  masterGain.gain.value = muted ? 0 : VOLUME;
  masterGain.connect(ctx.destination);
  loadingPromise = loadAll();
  document.addEventListener('visibilitychange', onVisibilityChange);
}

/**
 * Begin playback. Safe to call before loading completes — awaits internally.
 * Called from main.js once the cinematic intro hands over control.
 */
export async function startMusic() {
  if (started || !hasMusic() || !ctx) return;
  started = true;

  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* ignore */ }
  }

  if (loadingPromise) {
    try { await loadingPromise; } catch { /* loadAll already logged */ }
  }
  if (buffers.length === 0) return;

  // Schedule the first two so there's always one queued ahead of the playhead.
  lastScheduledEndTime = ctx.currentTime + PRELOAD_LEAD_S;
  scheduleNext();
  scheduleNext();
}

export function toggleMusic() {
  muted = !muted;
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
  if (masterGain) {
    // Short ramp avoids the click of an instant gain change.
    const target = muted ? 0 : VOLUME;
    masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
  }
  return muted;
}

async function loadAll() {
  try {
    buffers = await Promise.all(LOOPS.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      return await ctx.decodeAudioData(arrayBuffer);
    }));
  } catch (err) {
    console.warn('Music load failed:', err);
    buffers = [];
  }
}

function pickNextIndex() {
  // First pass: deterministic order so the curated sequence plays once.
  if (initialIndex < LOOPS.length) return initialIndex++;
  // Subsequent passes: random with no immediate repeat.
  if (LOOPS.length === 1) return 0;
  let idx;
  do { idx = Math.floor(Math.random() * LOOPS.length); }
  while (idx === lastIndex);
  return idx;
}

function scheduleNext() {
  if (buffers.length === 0) return;
  const idx = pickNextIndex();
  lastIndex = idx;
  const buffer = buffers[idx];

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(masterGain);
  source.start(lastScheduledEndTime);

  // When this source finishes playing, schedule one more to keep the
  // chain one buffer ahead of the playhead.
  source.onended = scheduleNext;

  lastScheduledEndTime += buffer.duration;
}

function onVisibilityChange() {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
}
