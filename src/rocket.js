import * as THREE from 'three';
import { makeRadialGradient } from './scene.js';
import { getPlumeTexture } from './textures.js';

/**
 * Read a CSS custom property at runtime so the rocket reflects the design
 * system without hardcoding values. If the token is missing for any reason,
 * fall back to a hex literal so the scene still renders.
 */
function tokenColor(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// The engine is built in two parts, for the same reason the suns are: a flat
// cone has ONE uniform colour, so the moment it crosses the bloom threshold the
// whole cone becomes a bloom source and floods the frame with haze. Anything
// that should bleed convincingly needs a bright core with falloff.
//
//   plume — the visible cone. Additive so it adds light instead of reading as a
//           solid blue silhouette, but gained deliberately BELOW the threshold
//           so it never blooms as a slab.
//   core  — a small additive sprite at the nozzle, sharing the suns' radial
//           falloff and gained ABOVE the threshold. Only this tight area bleeds.
//
// The core fades in from CORE_THROTTLE_START, so the engine begins to glow only
// once you're actually pushing it. Where bloom is off (touch devices) the
// tonemapper simply rolls the extra brightness off and the core reads white.
const GLOW_COLOR = 0x66aaff;
const GLOW_GAIN = 1.6;
const CORE_COLOR = 0xdcefff;
const CORE_GAIN = 2.3;
const CORE_THROTTLE_START = 0.35; // fraction of max speed before the core lights

export function createRocket() {
  const rocket = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.6, 3, 16),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 })
  );
  body.rotation.x = Math.PI / 2;
  rocket.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.2, 16),
    new THREE.MeshStandardMaterial({ color: 0xff4444 })
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -2.1;
  rocket.add(nose);

  // Pull the brand accent live from the design system's --ij-color-primary token.
  const primary = new THREE.Color(tokenColor('--ij-color-primary', '#D0FF00'));
  const finMat = new THREE.MeshStandardMaterial({
    color: primary,
    emissive: primary,
    emissiveIntensity: 0.2,
    roughness: 0.5,
    metalness: 0.3,
  });
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.6), finMat);
    const angle = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 1.2);
    fin.rotation.z = angle - Math.PI / 2;
    rocket.add(fin);
  }

  const glow = new THREE.Mesh(
    // Open-ended: the base cap was the hard circular edge that read as a
    // solid teardrop from the chase camera. DoubleSide keeps the far wall
    // contributing now that you can see into it.
    new THREE.ConeGeometry(0.3, 1.5, 16, 1, true),
    new THREE.MeshBasicMaterial({
      // Additive rather than alpha-blended, so the plume adds light instead of
      // reading as a solid blue cone with a visible silhouette. The map fades
      // it to black down its length, which under additive blending is the same
      // as fading to transparent — so the trailing end simply dissolves.
      color: new THREE.Color(GLOW_COLOR).multiplyScalar(GLOW_GAIN),
      map: getPlumeTexture(),
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.z = 2.0;
  rocket.userData.glow = glow;
  rocket.add(glow);

  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialGradient(CORE_COLOR),
    color: new THREE.Color(CORE_GAIN, CORE_GAIN, CORE_GAIN),
    transparent: true,
    opacity: 0,              // lights up with throttle, see updateGlow
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  core.position.z = 2.0;
  rocket.userData.core = core;
  rocket.add(core);

  return rocket;
}

export function updateGlow(rocket, speed, maxSpeed) {
  const glow = rocket.userData.glow;
  glow.scale.setScalar(0.5 + speed * 0.4 + Math.random() * 0.1);
  glow.material.opacity = 0.4 + speed * 0.1;

  // Core intensity and size both ramp from CORE_THROTTLE_START to full throttle.
  const t = Math.min(1, Math.max(0,
    (speed / maxSpeed - CORE_THROTTLE_START) / (1 - CORE_THROTTLE_START)));
  const core = rocket.userData.core;
  core.material.opacity = t;
  core.scale.setScalar(0.5 + t * 1.1);
}
