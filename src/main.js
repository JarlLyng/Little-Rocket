import * as THREE from 'three';
import { createScene, createCamera, createRenderer, updateStreaks, updateSuns, updateNebulae, updateStarAnchors } from './scene.js';
import { createRocket, updateGlow } from './rocket.js';
import { createPlanetField } from './planets.js';
import { createAsteroidField } from './asteroids.js';
import { createControls } from './controls.js';
import { initAudio, setEngineLevel, suspendAudio } from './audio.js';
import { createExhaust } from './exhaust.js';
import { prefersReducedMotion } from './motion.js';

const ROT_SPEED = 0.02;        // radians per 60fps-frame
const ACCEL     = 0.05;        // speed delta per 60fps-frame
const MAX_SPEED = 5;
const FOV_IDLE  = 65;
const FOV_MAX   = 110;         // FOV at full throttle — sells velocity

const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', start, { once: true });

const HINT_VISIBLE_MS = 6000;
const HINT_FADE_MS = 400; // matches --ij-duration-slow in CSS
const NEAR_MISS_VISIBLE_MS = 700;
const INTRO_DURATION = 1.6;     // seconds of cinematic intro before player takes control
const INTRO_FOV_START = 50;     // narrow FOV → opens up to FOV_IDLE
const INTRO_CAM_DISTANCE = 60;  // how far back the camera starts behind the rocket

function start() {
  document.getElementById('start').hidden = true;
  document.getElementById('intro-overlay').hidden = false;
  // Audio context must be created from a user gesture, so we init it here
  // rather than at module load.
  initAudio();
  run();
}

/**
 * Show the controls reminder briefly, then fade. Click '?' any time to bring
 * it back. Calling showHint() while it's already up resets the timer.
 */
function setupHint() {
  const toast = document.getElementById('hint-toast');
  const button = document.getElementById('hint-button');
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

function run() {
  const { scene, suns, streaks, nebulae, starLayers } = createScene();
  const camera = createCamera();
  const renderer = createRenderer();
  document.body.appendChild(renderer.domElement);

  const rocketGroup = new THREE.Group();
  const rocket = createRocket();
  rocketGroup.add(rocket);
  scene.add(rocketGroup);

  const planets = createPlanetField(scene, rocketGroup);
  const asteroids = createAsteroidField(scene, rocketGroup);
  const exhaust = createExhaust();
  scene.add(exhaust.object);

  const { keys, mouse } = createControls();
  const speedEl = document.getElementById('speed');
  const distanceEl = document.getElementById('distance');
  const nearMissEl = document.getElementById('near-miss');

  const introOverlay = document.getElementById('intro-overlay');

  let speed = 0.3;             // intro starts the rocket gliding forward
  let distanceAU = 0;
  let introT = 0;
  let introDone = false;
  let nearMissTimer = null;
  function flashNearMiss() {
    nearMissEl.hidden = false;
    void nearMissEl.offsetWidth;
    nearMissEl.classList.add('visible');
    if (nearMissTimer) clearTimeout(nearMissTimer);
    nearMissTimer = setTimeout(() => {
      nearMissEl.classList.remove('visible');
      // Wait for the fade transition before hiding entirely
      setTimeout(() => { nearMissEl.hidden = true; }, 200);
    }, NEAR_MISS_VISIBLE_MS);
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
        setupHint();
      }
    } else {
      // Normal input — only after the intro hands over control
      if (keys['ArrowUp'])                    rocketGroup.rotateX(-ROT_SPEED * dt);
      if (keys['ArrowDown'])                  rocketGroup.rotateX( ROT_SPEED * dt);
      if (keys['ArrowLeft']  || keys['KeyA']) rocketGroup.rotateY( ROT_SPEED * dt);
      if (keys['ArrowRight'] || keys['KeyD']) rocketGroup.rotateY(-ROT_SPEED * dt);
      if (keys['KeyQ'])                       rocketGroup.rotateZ( ROT_SPEED * dt);
      if (keys['KeyE'])                       rocketGroup.rotateZ(-ROT_SPEED * dt);
      if (keys['KeyW']) speed = Math.min(speed + ACCEL * dt, MAX_SPEED);
      if (keys['KeyS']) speed = Math.max(speed - ACCEL * dt, 0);
    }

    speedEl.textContent = speed.toFixed(1);
    distanceAU += speed * realDt;
    distanceEl.textContent = `${Math.floor(distanceAU)} AU`;

    forward.set(0, 0, -1).applyQuaternion(rocketGroup.quaternion);
    rocketGroup.position.addScaledVector(forward, speed * dt);

    // Engines glow + audio scaled by intro progress so they ignite, not burst on
    const presentationSpeed = speed * introEase;
    updateGlow(rocket, presentationSpeed);
    setEngineLevel(presentationSpeed, MAX_SPEED);

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

    // Mouse-look is disabled during intro so the cinematic stays composed.
    const mouseGate = introDone ? 1 : 0;
    mouseOffset.set(mouse.x * 8 * mouseGate, -mouse.y * 5 * mouseGate, 0)
      .applyQuaternion(rocketGroup.quaternion);
    lookTarget.copy(rocketGroup.position)
      .addScaledVector(forward, 20)
      .add(mouseOffset);
    camera.lookAt(lookTarget);
    camera.up.set(0, 1, 0).applyQuaternion(rocketGroup.quaternion);

    planets.update(forward, dt, flashNearMiss);
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
