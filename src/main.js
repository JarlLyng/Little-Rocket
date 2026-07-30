/**
 * Game loop orchestrator.
 *
 * Owns the frame loop, the rocket transform, the camera, and input wiring.
 * Each visible system (planets, asteroids, exhaust, audio, music, story,
 * sun, streaks, nebulae) is built in its own module and updated from here.
 *
 * Lifecycle:
 *   page load → user clicks Start → start() → run() → frame loop forever.
 *
 * The frame loop has two phases:
 *   1. Intro  — cinematic dolly-in for INTRO_DURATION seconds. Input is
 *               ignored, speed/FOV/camera are scripted, the black overlay
 *               fades. Engine glow + audio scale up from silence.
 *   2. Live   — keyboard/mouse drive the rocket. FOV, camera shake, exhaust,
 *               star streaks all key off speed.
 *
 * Hot-loop convention: scratch Vector3s declared once outside the loop are
 * reused per frame to avoid GC churn (see camTarget, forward, etc).
 */
import * as THREE from 'three';
import { createScene, createCamera, createRenderer, updateStreaks, updateSuns, updateNebulae, updateStarAnchors } from './scene.js';
import { createRocket, updateGlow } from './rocket.js';
import { createPlanetField } from './planets.js';
import { createAsteroidField } from './asteroids.js';
import { createControls } from './controls.js';
import { initAudio, setEngineLevel, suspendAudio } from './audio.js';
import { createExhaust } from './exhaust.js';
import { prefersReducedMotion } from './motion.js';
import { initMusic, startMusic, toggleMusic, isMuted, hasMusic, setMusicIntensity, musicSwell } from './music.js';
import { startStory } from './story.js';
import { trackOnce, trackEvent } from './analytics.js';
import { fetchTotalDistance, reportSessionDistance } from './stats.js';
import { checkMilestone } from './milestones.js';
import { fetchStrangerNames, submitName, MAX_NAME_LEN } from './names.js';

// Register the service worker so the game is installable and works offline.
// Failure is silent — it's a progressive enhancement, never a hard dependency.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is optional */ });
  });
}

const ROT_SPEED = 0.02;        // radians per 60fps-frame
const ACCEL     = 0.05;        // speed delta per 60fps-frame
const MAX_SPEED = 5;
const FOV_IDLE  = 65;
const FOV_MAX   = 110;         // FOV at full throttle — sells velocity

const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', start, { once: true });

// Show the collective-distance lines on the start screen as soon as the API
// resolves. Failure is silent — the game still works without them.
function revealStat(id, html) {
  const el = document.getElementById(id);
  el.innerHTML = html;
  el.hidden = false;
  // Force reflow so the opacity transition runs
  void el.offsetWidth;
  el.classList.add('visible');
}
fetchTotalDistance().then((stats) => {
  if (!stats) return;
  if (stats.total >= 1) {
    revealStat('collective-stat',
      `Before you, <strong>${stats.total.toLocaleString()}</strong> AU have been flown.`);
  }
  // Only show the record once it's a real journey — a 5 AU record reads
  // as sad, not inviting. 30 AU is the first milestone (past Neptune).
  if (stats.farthest >= 30) {
    revealStat('farthest-stat',
      `The farthest drifter reached <strong>${stats.farthest.toLocaleString()}</strong> AU.`);
  }
});

const HINT_VISIBLE_MS = 6000;
const HINT_FADE_MS = 400; // matches --ij-duration-slow in CSS
const NEAR_MISS_VISIBLE_MS = 700;
const MILESTONE_VISIBLE_MS = 3200;
const MILESTONE_FADE_MS = 600; // matches CSS transition
const INTRO_DURATION = 1.6;     // seconds of cinematic intro before player takes control
const INTRO_FOV_START = 50;     // narrow FOV → opens up to FOV_IDLE
const INTRO_CAM_DISTANCE = 60;  // how far back the camera starts behind the rocket

function start() {
  document.getElementById('start').hidden = true;
  document.getElementById('intro-overlay').hidden = false;
  // Audio contexts must be created from a user gesture. Engine and music
  // are created here; music also kicks off file fetch + decode so the
  // buffers are ready by the time the cinematic intro hands over control.
  initAudio();
  initMusic();
  trackOnce('game-started');
  run();
}

/**
 * Show the controls reminder briefly, then fade. Click '?' any time to bring
 * it back. Calling showHint() while it's already up resets the timer.
 *
 * Hint copy adapts to touch vs keyboard so phone players don't see "Arrow keys".
 */
function setupHint() {
  const toast = document.getElementById('hint-toast');
  const button = document.getElementById('hint-button');
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
                 || ('ontouchstart' in window);
  toast.textContent = isTouch
    ? 'Drag the left half to steer · drag the right half to throttle'
    : 'Arrow keys = steer · W/S = throttle · Q/E = roll · Mouse = look around';
  let hideTimer = null;
  let removeTimer = null;

  function show() {
    if (removeTimer) clearTimeout(removeTimer);
    if (hideTimer) clearTimeout(hideTimer);
    toast.hidden = false;
    // Force a reflow so the transition runs from opacity 0 → 1.
    void toast.offsetWidth;
    toast.classList.add('visible');
    hideTimer = setTimeout(() => {
      toast.classList.remove('visible');
      removeTimer = setTimeout(() => { toast.hidden = true; }, HINT_FADE_MS);
    }, HINT_VISIBLE_MS);
  }

  button.addEventListener('click', show);
  show();
}

/**
 * Reveal and wire the music toggle button — only when LOOPS are configured.
 * If no loops are set up, the button stays hidden and the rest of the game
 * is unaffected.
 */
function setupMusicButton() {
  if (!hasMusic()) return;
  const button = document.getElementById('music-button');
  button.hidden = false;
  button.classList.toggle('muted', isMuted());
  button.setAttribute('aria-label', isMuted() ? 'Unmute music' : 'Mute music');
  button.addEventListener('click', () => {
    const muted = toggleMusic();
    button.classList.toggle('muted', muted);
    button.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
    trackEvent(muted ? 'music-mute' : 'music-unmute');
  });
}

function run() {
  const { scene, suns, streaks, nebulae, starLayers } = createScene();
  const camera = createCamera();
  const renderer = createRenderer();
  document.body.appendChild(renderer.domElement);

  const rocketGroup = new THREE.Group();
  const rocket = createRocket();
  rocketGroup.add(rocket);
  scene.add(rocketGroup);

  const labelLayer = document.getElementById('planet-labels');
  const planets = createPlanetField(scene, rocketGroup, camera, labelLayer);
  planets.setOnStranger(() => trackOnce('stranger-world-seen'));
  // Pull the names other drifters left so we can sprinkle them onto passing
  // worlds. Failure is silent — local naming still works without strangers.
  fetchStrangerNames().then((names) => planets.setStrangerPool(names));

  const asteroids = createAsteroidField(scene, rocketGroup);
  const exhaust = createExhaust();
  scene.add(exhaust.object);

  const { keys, mouse, touchSteer, touchThrottle } = createControls();
  const speedEl = document.getElementById('speed');
  const distanceEl = document.getElementById('distance');
  const nearMissEl = document.getElementById('near-miss');
  const throttleFill = document.getElementById('throttle-fill');
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
                 || ('ontouchstart' in window);

  const introOverlay = document.getElementById('intro-overlay');

  let speed = 0.3;             // intro starts the rocket gliding forward
  let distanceAU = 0;
  let introT = 0;
  let introDone = false;
  let nearMissTimer = null;
  function flashNearMiss() {
    musicSwell(); // lift the score in time with the flash
    nearMissEl.hidden = false;
    void nearMissEl.offsetWidth;
    nearMissEl.classList.add('visible');
    if (nearMissTimer) clearTimeout(nearMissTimer);
    nearMissTimer = setTimeout(() => {
      nearMissEl.classList.remove('visible');
      // Wait for the fade transition before hiding entirely
      setTimeout(() => { nearMissEl.hidden = true; }, 200);
    }, NEAR_MISS_VISIBLE_MS);
    trackOnce('first-near-miss', { distance: Math.floor(distanceAU) });
  }

  const milestoneEl = document.getElementById('milestone-toast');
  const milestoneDistanceEl = document.getElementById('milestone-distance');
  const milestoneLabelEl = document.getElementById('milestone-label');
  let milestoneHideTimer = null;
  let milestoneRemoveTimer = null;
  function flashMilestone(milestone) {
    if (milestoneHideTimer) clearTimeout(milestoneHideTimer);
    if (milestoneRemoveTimer) clearTimeout(milestoneRemoveTimer);
    milestoneDistanceEl.textContent = `${milestone.au.toLocaleString()} AU`;
    milestoneLabelEl.textContent = milestone.label;
    milestoneEl.hidden = false;
    void milestoneEl.offsetWidth;
    milestoneEl.classList.add('visible');
    milestoneHideTimer = setTimeout(() => {
      milestoneEl.classList.remove('visible');
      milestoneRemoveTimer = setTimeout(() => { milestoneEl.hidden = true; }, MILESTONE_FADE_MS);
    }, MILESTONE_VISIBLE_MS);
    trackEvent('milestone-reached', { au: milestone.au });
  }
  // --- Collective planet naming ---
  // A cue appears when a world drifts close; pressing N (or tapping the cue)
  // opens a small dialog. The name you give is pinned to that world and let
  // loose into the shared pool for other drifters to encounter.
  const nameCue = document.getElementById('name-cue');
  const nameDialog = document.getElementById('name-dialog');
  const nameForm = document.getElementById('name-form');
  const nameInput = document.getElementById('name-input');
  let nameDialogOpen = false;
  nameCue.textContent = isTouch ? 'Name this world' : 'Name this world · N';

  function openNameDialog() {
    if (nameDialogOpen || !planets.hasNameable()) return;
    nameDialogOpen = true;
    nameDialog.hidden = false;
    nameCue.hidden = true;
    nameInput.value = '';
    nameInput.focus();
  }
  function closeNameDialog() {
    nameDialogOpen = false;
    nameDialog.hidden = true;
    nameInput.blur();
  }
  function setupNaming() {
    nameCue.addEventListener('click', openNameDialog);
    nameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const named = planets.nameNearest(nameInput.value.trim().slice(0, MAX_NAME_LEN));
      if (named) { submitName(named); trackEvent('planet-named'); }
      closeNameDialog();
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeNameDialog(); }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyN' && !nameDialogOpen && introDone
          && e.target.tagName !== 'INPUT' && planets.hasNameable()) {
        e.preventDefault();
        openNameDialog();
      }
    });
  }

  const clock = new THREE.Clock();
  const forward = new THREE.Vector3();
  const camOffset = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const mouseOffset = new THREE.Vector3();
  const enginePos = new THREE.Vector3();
  const shakeOffset = new THREE.Vector3();
  const camTarget = new THREE.Vector3();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Pause audio when tab is hidden so we don't whine in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendAudio();
    else initAudio(); // resumes if already created
  });

  // Contribute this session's distance to the collective total when the
  // page is on its way out. sendBeacon survives the teardown.
  window.addEventListener('pagehide', () => {
    reportSessionDistance(distanceAU);
  });

  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;

    const dt = Math.min(clock.getDelta(), 1 / 30) * 60;
    const realDt = dt / 60;

    // --- Intro phase: cinematic camera dolly + FOV widen + audio swell ---
    let introEase = 1;
    if (!introDone) {
      introT = Math.min(introT + realDt, INTRO_DURATION);
      const t = introT / INTRO_DURATION;
      introEase = 1 - Math.pow(1 - t, 3); // ease-out cubic
      introOverlay.style.opacity = String(1 - introEase);

      // Engines spool up: speed eases from 0.3 to 0.9 by intro end
      speed = 0.3 + 0.6 * introEase;

      if (introT >= INTRO_DURATION) {
        introDone = true;
        introOverlay.hidden = true;
        document.getElementById('ui').hidden = false;
        document.getElementById('hint-button').hidden = false;
        if (isTouch) document.getElementById('throttle-bar').hidden = false;
        setupHint();
        setupMusicButton();
        setupNaming();
        startMusic();
        startStory();
      }
    } else {
      // Combine keyboard arrows + virtual joystick. Each axis is the sum so
      // both inputs are usable at once — useful for hybrid devices like
      // iPads with attached keyboards.
      let pitch = 0, yaw = 0;
      if (keys['ArrowUp'])                    pitch -= 1;
      if (keys['ArrowDown'])                  pitch += 1;
      if (keys['ArrowLeft']  || keys['KeyA']) yaw   += 1;
      if (keys['ArrowRight'] || keys['KeyD']) yaw   -= 1;
      pitch += touchSteer.y;
      yaw   -= touchSteer.x;

      if (pitch) rocketGroup.rotateX(pitch * ROT_SPEED * dt);
      if (yaw)   rocketGroup.rotateY(yaw   * ROT_SPEED * dt);
      if (keys['KeyQ']) rocketGroup.rotateZ( ROT_SPEED * dt);
      if (keys['KeyE']) rocketGroup.rotateZ(-ROT_SPEED * dt);

      if (touchThrottle.value !== null) {
        // Touch throttle is sticky and absolute; ease toward target speed.
        const target = touchThrottle.value * MAX_SPEED;
        speed += (target - speed) * 0.12;
      } else {
        if (keys['KeyW']) speed = Math.min(speed + ACCEL * dt, MAX_SPEED);
        if (keys['KeyS']) speed = Math.max(speed - ACCEL * dt, 0);
      }
      if (speed >= MAX_SPEED) trackOnce('max-speed', { distance: Math.floor(distanceAU) });
    }

    speedEl.textContent = speed.toFixed(1);
    distanceAU += speed * realDt;
    distanceEl.textContent = `${Math.floor(distanceAU)} AU`;
    checkMilestone(distanceAU, flashMilestone);
    if (isTouch && introDone) {
      throttleFill.style.height = `${(speed / MAX_SPEED) * 100}%`;
    }

    forward.set(0, 0, -1).applyQuaternion(rocketGroup.quaternion);
    rocketGroup.position.addScaledVector(forward, speed * dt);

    // Engines glow + audio scaled by intro progress so they ignite, not burst on
    const presentationSpeed = speed * introEase;
    updateGlow(rocket, presentationSpeed);
    setEngineLevel(presentationSpeed, MAX_SPEED);
    // Music brightness tracks throttle: muffled at rest, open at full speed.
    setMusicIntensity(presentationSpeed / MAX_SPEED);

    // FOV: during intro, lerp from narrow → idle. After, speed-based punch.
    const reducedMotion = prefersReducedMotion();
    let targetFov;
    if (!introDone) {
      targetFov = INTRO_FOV_START + (FOV_IDLE - INTRO_FOV_START) * introEase;
      camera.fov = targetFov;
    } else {
      targetFov = reducedMotion
        ? FOV_IDLE
        : FOV_IDLE + (speed / MAX_SPEED) * (FOV_MAX - FOV_IDLE);
      camera.fov += (targetFov - camera.fov) * 0.08;
    }
    camera.updateProjectionMatrix();

    // Camera offset: starts 60 units back, eases to normal 8 units back.
    const camDistance = 8 + (INTRO_CAM_DISTANCE - 8) * (1 - introEase);
    camOffset.set(0, 2.5, camDistance).applyQuaternion(rocketGroup.quaternion);
    if (introDone) {
      camTarget.copy(rocketGroup.position).add(camOffset);
      camera.position.lerp(camTarget, 0.15);
    } else {
      // Snap during intro so the dolly path is exact, not lerp-smoothed
      camera.position.copy(rocketGroup.position).add(camOffset);
    }

    // Camera shake at high throttle. Sells velocity. Skipped for reduced-motion + intro.
    if (introDone && !reducedMotion) {
      const shakeT = Math.max(0, (speed / MAX_SPEED - 0.65) / 0.35);
      if (shakeT > 0) {
        const amp = shakeT * shakeT * 0.18;
        shakeOffset.set(
          (Math.random() - 0.5) * amp,
          (Math.random() - 0.5) * amp,
          0
        ).applyQuaternion(rocketGroup.quaternion);
        camera.position.add(shakeOffset);
      }
    }

    // Mouse-look is disabled during intro and on touch devices (drags would
    // double up with the steering joystick).
    const mouseGate = (introDone && !isTouch) ? 1 : 0;
    mouseOffset.set(mouse.x * 8 * mouseGate, -mouse.y * 5 * mouseGate, 0)
      .applyQuaternion(rocketGroup.quaternion);
    lookTarget.copy(rocketGroup.position)
      .addScaledVector(forward, 20)
      .add(mouseOffset);
    camera.lookAt(lookTarget);
    camera.up.set(0, 1, 0).applyQuaternion(rocketGroup.quaternion);

    planets.update(forward, dt, flashNearMiss);
    // Show/hide the naming cue based on whether a world is within reach.
    if (introDone && !nameDialogOpen) {
      const has = planets.hasNameable();
      if (has === nameCue.hidden) nameCue.hidden = !has;
    }
    asteroids.update(forward, dt);
    // Star streaks read as motion; suppressed under reduced-motion AND during intro.
    const streakSpeed = (introDone && !reducedMotion) ? speed : 0;
    updateStreaks(streaks, forward, streakSpeed, MAX_SPEED);
    updateSuns(suns, rocketGroup.position);
    updateNebulae(nebulae, rocketGroup.position);
    updateStarAnchors(starLayers, streaks, rocketGroup.position);

    // Engine exhaust: emit from glow position in world space, then update all live particles.
    // No emission during intro — engines aren't fully lit yet.
    rocket.userData.glow.getWorldPosition(enginePos);
    if (introDone) exhaust.spawn(enginePos, forward, speed, MAX_SPEED, dt);
    exhaust.update(dt);

    renderer.render(scene, camera);
  }

  frame();
}
