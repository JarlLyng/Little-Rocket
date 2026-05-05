import * as THREE from 'three';
import { createScene, createCamera, createRenderer, updateStreaks, updateSun, updateNebulae } from './scene.js';
import { createRocket, updateGlow } from './rocket.js';
import { createPlanetField } from './planets.js';
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

function start() {
  document.getElementById('start').hidden = true;
  document.getElementById('ui').hidden = false;
  // Audio context must be created from a user gesture, so we init it here
  // rather than at module load.
  initAudio();
  run();
}

function run() {
  const { scene, sunMesh, halo, streaks, nebulae } = createScene();
  const camera = createCamera();
  const renderer = createRenderer();
  document.body.appendChild(renderer.domElement);

  const rocketGroup = new THREE.Group();
  const rocket = createRocket();
  rocketGroup.add(rocket);
  scene.add(rocketGroup);

  const planets = createPlanetField(scene, rocketGroup);
  const exhaust = createExhaust();
  scene.add(exhaust.object);

  const { keys, mouse } = createControls();
  const speedEl = document.getElementById('speed');

  let speed = 1.0;
  const clock = new THREE.Clock();
  const forward = new THREE.Vector3();
  const camOffset = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const mouseOffset = new THREE.Vector3();
  const enginePos = new THREE.Vector3();
  const shakeOffset = new THREE.Vector3();

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

    if (keys['ArrowUp'])                    rocketGroup.rotateX(-ROT_SPEED * dt);
    if (keys['ArrowDown'])                  rocketGroup.rotateX( ROT_SPEED * dt);
    if (keys['ArrowLeft']  || keys['KeyA']) rocketGroup.rotateY( ROT_SPEED * dt);
    if (keys['ArrowRight'] || keys['KeyD']) rocketGroup.rotateY(-ROT_SPEED * dt);
    if (keys['KeyQ'])                       rocketGroup.rotateZ( ROT_SPEED * dt);
    if (keys['KeyE'])                       rocketGroup.rotateZ(-ROT_SPEED * dt);
    if (keys['KeyW']) speed = Math.min(speed + ACCEL * dt, MAX_SPEED);
    if (keys['KeyS']) speed = Math.max(speed - ACCEL * dt, 0);
    speedEl.textContent = speed.toFixed(1);

    forward.set(0, 0, -1).applyQuaternion(rocketGroup.quaternion);
    rocketGroup.position.addScaledVector(forward, speed * dt);

    updateGlow(rocket, speed);
    setEngineLevel(speed, MAX_SPEED);

    // Speed-based FOV punch. Eased so it feels like acceleration, not a snap.
    // Reduced-motion holds FOV at idle to avoid the wide-angle "rush".
    const reducedMotion = prefersReducedMotion();
    const targetFov = reducedMotion
      ? FOV_IDLE
      : FOV_IDLE + (speed / MAX_SPEED) * (FOV_MAX - FOV_IDLE);
    camera.fov += (targetFov - camera.fov) * 0.08;
    camera.updateProjectionMatrix();

    camOffset.set(0, 2.5, 8).applyQuaternion(rocketGroup.quaternion);
    camera.position.lerp(rocketGroup.position.clone().add(camOffset), 0.15);

    // Camera shake at high throttle. Sells velocity. Skipped for reduced-motion.
    if (!reducedMotion) {
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

    mouseOffset.set(mouse.x * 8, -mouse.y * 5, 0).applyQuaternion(rocketGroup.quaternion);
    lookTarget.copy(rocketGroup.position)
      .addScaledVector(forward, 20)
      .add(mouseOffset);
    camera.lookAt(lookTarget);
    camera.up.set(0, 1, 0).applyQuaternion(rocketGroup.quaternion);

    planets.update(forward, dt);
    // Star streaks read as motion; when reduced-motion is set, force them invisible.
    updateStreaks(streaks, forward, reducedMotion ? 0 : speed, MAX_SPEED);
    updateSun(sunMesh, halo, rocketGroup.position);
    updateNebulae(nebulae, rocketGroup.position);

    // Engine exhaust: emit from glow position in world space, then update all live particles.
    rocket.userData.glow.getWorldPosition(enginePos);
    exhaust.spawn(enginePos, forward, speed, MAX_SPEED, dt);
    exhaust.update(dt);

    renderer.render(scene, camera);
  }

  frame();
}
