/**
 * Procedural engine audio. No asset files — synthesized via Web Audio API.
 *
 * Architecture:
 *   noise (looped buffer) → bandpass filter → engine gain → master gain → out
 *   sub-oscillator                          → drone gain  → master gain → out
 *
 * Speed modulates filter frequency (rises with throttle) and engine gain.
 * Browsers block AudioContext until a user gesture, so init() must be called
 * from inside a click handler.
 */

let ctx = null;
let masterGain, engineGain, droneGain, filter;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  ctx = new AudioCtx();

  // White noise buffer, looped — cheap and gives us "rocket exhaust" timbre
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) channel[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 200;
  filter.Q.value = 1.5;

  engineGain = ctx.createGain();
  engineGain.gain.value = 0;

  noise.connect(filter);
  filter.connect(engineGain);

  // Sub-oscillator for low rumble
  const sub = ctx.createOscillator();
  sub.type = 'sawtooth';
  sub.frequency.value = 55;
  droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  sub.connect(droneGain);

  masterGain = ctx.createGain();
  masterGain.gain.value = 0.22;

  engineGain.connect(masterGain);
  droneGain.connect(masterGain);
  masterGain.connect(ctx.destination);

  noise.start();
  sub.start();
}

export function setEngineLevel(speed, maxSpeed) {
  if (!ctx) return;
  const t = Math.min(speed / maxSpeed, 1);
  const now = ctx.currentTime;
  // setTargetAtTime with a small time-constant smooths abrupt input changes
  engineGain.gain.setTargetAtTime(t * 0.6, now, 0.05);
  droneGain.gain.setTargetAtTime(t * 0.18, now, 0.08);
  filter.frequency.setTargetAtTime(180 + t * 1200, now, 0.06);
}

export function suspendAudio() {
  if (ctx && ctx.state === 'running') ctx.suspend();
}
