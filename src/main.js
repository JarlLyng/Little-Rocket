import * as THREE from 'three';
import { createScene, createCamera, createRenderer } from './scene.js';
import { createRocket, updateGlow } from './rocket.js';
import { createPlanetField } from './planets.js';
import { createControls } from './controls.js';

const ROT_SPEED = 0.02;        // radians per 60fps-frame
const ACCEL     = 0.05;        // speed delta per 60fps-frame
const MAX_SPEED = 5;

const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', start, { once: true });

function start() {
  document.getElementById('start').hidden = true;
  document.getElementById('ui').hidden = false;
  run();
}

function run() {
  const scene = createScene();
  const camera = createCamera();
  const renderer = createRenderer();
  document.body.appendChild(renderer.domElement);

  const rocketGroup = new THREE.Group();
  const rocket = createRocket();
  rocketGroup.add(rocket);
  scene.add(rocketGroup);

  const planets = createPlanetField(scene, rocketGroup);
  const { keys, mouse } = createControls();
  const speedEl = document.getElementById('speed');

  let speed = 1.0;
  const clock = new THREE.Clock();
  const forward = new THREE.Vector3();
  const camOffset = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const mouseOffset = new THREE.Vector3();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;

    // Normalize to "60fps frames" so existing constants keep their feel.
    const dt = Math.min(clock.getDelta(), 1 / 30) * 60;

    if (keys['ArrowUp'])                       rocketGroup.rotateX(-ROT_SPEED * dt);
    if (keys['ArrowDown'])                     rocketGroup.rotateX( ROT_SPEED * dt);
    if (keys['ArrowLeft']  || keys['KeyA'])    rocketGroup.rotateY( ROT_SPEED * dt);
    if (keys['ArrowRight'] || keys['KeyD'])    rocketGroup.rotateY(-ROT_SPEED * dt);
    if (keys['KeyQ'])                          rocketGroup.rotateZ( ROT_SPEED * dt);
    if (keys['KeyE'])                          rocketGroup.rotateZ(-ROT_SPEED * dt);
    if (keys['KeyW']) speed = Math.min(speed + ACCEL * dt, MAX_SPEED);
    if (keys['KeyS']) speed = Math.max(speed - ACCEL * dt, 0);
    speedEl.textContent = speed.toFixed(1);

    forward.set(0, 0, -1).applyQuaternion(rocketGroup.quaternion);
    rocketGroup.position.addScaledVector(forward, speed * dt);

    updateGlow(rocket, speed);

    camOffset.set(0, 2.5, 8).applyQuaternion(rocketGroup.quaternion);
    camera.position.lerp(rocketGroup.position.clone().add(camOffset), 0.15);

    mouseOffset.set(mouse.x * 8, -mouse.y * 5, 0).applyQuaternion(rocketGroup.quaternion);
    lookTarget.copy(rocketGroup.position)
      .addScaledVector(forward, 20)
      .add(mouseOffset);
    camera.lookAt(lookTarget);
    camera.up.set(0, 1, 0).applyQuaternion(rocketGroup.quaternion);

    planets.update(forward, dt);

    renderer.render(scene, camera);
  }

  frame();
}
