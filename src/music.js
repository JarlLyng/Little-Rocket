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
 * The music also breathes with the flight. A lowpass filter sits in the
 * chain: at rest the music is muffled and distant; at full throttle it opens
 * up bright and present (setMusicIntensity). Passing close to a world fires a
 * brief swell (musicSwell), so the score lifts at the same moment the NEAR
 * MISS flash does.
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

// Speed-driven brightness: the lowpass cutoff sweeps from "distant" to "open"
// across the throttle range, on a log scale so the change feels even to the ear.
const CUTOFF_MIN_HZ = 520;
const CUTOFF_MAX_HZ = 18000;
const CUTOFF_SMOOTH = 0.4;   // slow, musical follow — not twitchy with each frame
const SWELL_PEAK = 1.3;      // colour-gain multiplier at the top of a fly-by swell

let ctx = null;
let masterGain = null;
let musicFilter = null;      // lowpass; cutoff tracks speed
let colorGain = null;        // brief presence swell on close passes
let buffers = [];
let firstReady = null;       // resolves when buffers[0] is decoded (or fails)
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

  // Chain: source → musicFilter (lowpass, speed-driven) → colorGain (swell)
  //        → masterGain (volume/mute) → destination.
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = CUTOFF_MIN_HZ; // start muffled; opens with speed
  musicFilter.Q.value = 0.0001;                // gentle slope, no resonant peak
  colorGain = ctx.createGain();
  colorGain.gain.value = 1;

  musicFilter.connect(colorGain);
  colorGain.connect(masterGain);
  masterGain.connect(ctx.destination);
  loadAll();
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

  // Wait only for the FIRST buffer so playback can begin as soon as it's
  // ready, even on slow connections. The rest stream into place during
  // the first track and are picked up by scheduleNext when ready.
  if (firstReady) {
    try { await firstReady; } catch { /* loadOne already logged */ }
  }
  if (!buffers[0]) return;

  // Queue two sources ahead so transitions are sample-accurate. If the
  // second buffer isn't loaded yet, scheduleNext retries via setTimeout
  // and will catch up before the first track finishes (typical loop is
  // 30+ seconds, plenty of time on any working connection).
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

/**
 * Open or close the music's lowpass filter with throttle. `level` is 0..1
 * (speed / maxSpeed). Cheap enough to call every frame — the cutoff eases
 * toward its target so rapid input changes stay musical.
 */
export function setMusicIntensity(level) {
  if (!ctx || !musicFilter) return;
  const t = Math.min(1, Math.max(0, level));
  const cutoff = CUTOFF_MIN_HZ * Math.pow(CUTOFF_MAX_HZ / CUTOFF_MIN_HZ, t);
  musicFilter.frequency.setTargetAtTime(cutoff, ctx.currentTime, CUTOFF_SMOOTH);
}

/**
 * A brief swell in presence — fired when the rocket passes close to a world,
 * so the score lifts in time with the NEAR MISS flash. A quick rise, then a
 * gentle settle back to neutral. Silent if music is muted (masterGain is 0).
 */
export function musicSwell() {
  if (!ctx || !colorGain) return;
  const now = ctx.currentTime;
  colorGain.gain.cancelScheduledValues(now);
  colorGain.gain.setValueAtTime(colorGain.gain.value, now);
  colorGain.gain.linearRampToValueAtTime(SWELL_PEAK, now + 0.18);
  colorGain.gain.setTargetAtTime(1, now + 0.18, 0.5);
}

function loadAll() {
  // Sequential fetch keeps the network from splitting bandwidth across all
  // four files at once — the first one finishes faster, music starts sooner.
  // Buffers populate in order; scheduleNext gracefully handles a slot that
  // isn't ready yet.
  buffers = new Array(LOOPS.length).fill(null);

  let firstResolve;
  firstReady = new Promise((resolve) => { firstResolve = resolve; });

  (async () => {
    for (let i = 0; i < LOOPS.length; i++) {
      try {
        const response = await fetch(LOOPS[i]);
        if (!response.ok) throw new Error(`${LOOPS[i]}: HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        buffers[i] = await ctx.decodeAudioData(arrayBuffer);
      } catch (err) {
        console.warn('Music load failed:', LOOPS[i], err);
      }
      if (i === 0) firstResolve();
    }
  })();
}

function pickNextIndex() {
  // First pass: deterministic order, but only return slots whose buffer
  // is already loaded. If the next curated slot isn't ready yet, return -1
  // so scheduleNext can retry shortly.
  if (initialIndex < LOOPS.length) {
    return buffers[initialIndex] ? initialIndex++ : -1;
  }
  // Subsequent passes: random over loaded buffers, no immediate repeat.
  const ready = [];
  for (let i = 0; i < LOOPS.length; i++) {
    if (buffers[i] && i !== lastIndex) ready.push(i);
  }
  if (ready.length === 0) return buffers[lastIndex] ? lastIndex : -1;
  return ready[Math.floor(Math.random() * ready.length)];
}

function scheduleNext() {
  const idx = pickNextIndex();
  if (idx === -1) {
    // The next track in the curated order is still loading. Retry in a
    // moment — the audio engine will accept the .start(when) just-in-time
    // as long as `when` is in the future.
    setTimeout(scheduleNext, 250);
    return;
  }
  lastIndex = idx;
  const buffer = buffers[idx];

  // If we waited for a slow load, lastScheduledEndTime may be in the past.
  // Push it forward so the new source starts cleanly.
  const startAt = Math.max(lastScheduledEndTime, ctx.currentTime + PRELOAD_LEAD_S);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(musicFilter);
  source.start(startAt);

  // When this source finishes playing, schedule one more to keep the
  // chain one buffer ahead of the playhead.
  source.onended = scheduleNext;

  lastScheduledEndTime = startAt + buffer.duration;
}

function onVisibilityChange() {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
}
