import * as THREE from 'three';
import { makeRadialGradient } from './scene.js';

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
const GLOW_GAIN = 2.4;
// How sharply the plume fades toward its silhouette. Below 1 broadens the lit
// core, above 1 tightens it; 0.85 keeps the falloff gentle.
const PLUME_EDGE_POWER = 0.85;
const CORE_COLOR = 0xdcefff;
const CORE_GAIN = 2.3;
const CORE_THROTTLE_START = 0.35; // fraction of max speed before the core lights

/**
 * The plume's material — the one custom shader in the project.
 *
 * It exists for the silhouette. A length-wise gradient can dissolve the plume's
 * trailing end, but nothing in a stock material can soften its outline, because
 * that depends on the angle between the surface and the eye — which only a
 * shader can see.
 *
 * The falloff runs the opposite way to the fresnel used for glowing shells. A
 * shell (a planet's atmosphere) is brightest at the rim, where the view ray
 * travels furthest through it. A plume is a FILLED volume: the ray passes
 * through the most gas dead centre and merely clips the edge at the outline, so
 * brightness follows dot(normal, view) — bright facing the eye, nothing at the
 * silhouette. Rim-bright fresnel here would just draw the hard outline back on.
 *
 * Written in linear colour, then run through three's own tonemapping and
 * colour-space chunks so it matches every stock material in the scene. In the
 * bloom path those chunks compile to nothing (the composer renders to a linear
 * target and OutputPass tonemaps once at the end); on the direct path they
 * apply, exactly as they do for the rest of the scene.
 */
function createPlumeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(GLOW_COLOR).multiplyScalar(GLOW_GAIN) },
      uIntensity: { value: 0.7 },   // throttle-driven, see updateGlow
      uEdge: { value: PLUME_EDGE_POWER },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
        // Both in view space, where the camera sits at the origin — so the
        // direction to the eye is simply the negated view-space position.
        vNormal = normalMatrix * normal;
        vView = -viewPos.xyz;
        gl_Position = projectionMatrix * viewPos;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uEdge;

      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;

      void main() {
        // 1 facing the eye, 0 at the silhouette. abs() so the cone's far wall
        // falls off the same way — it's rendered DoubleSide.
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float edge = pow(facing, uEdge);
        // v runs 0 at the flared trailing end to 1 at the apex, and the apex is
        // the end tucked against the nozzle — so this is bright at the engine,
        // gone by the tail.
        float lengthFade = smoothstep(0.0, 1.0, vUv.y);
        // Additive blending multiplies by alpha, so intensity lives in rgb and
        // alpha stays at 1.
        gl_FragColor = vec4(uColor * edge * lengthFade * uIntensity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

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
    new THREE.ConeGeometry(0.3, 1.5, 24, 1, true),
    createPlumeMaterial()
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
  // A ShaderMaterial doesn't read material.opacity — the shader owns it.
  glow.material.uniforms.uIntensity.value = 0.4 + speed * 0.1;

  // Core intensity and size both ramp from CORE_THROTTLE_START to full throttle.
  const t = Math.min(1, Math.max(0,
    (speed / maxSpeed - CORE_THROTTLE_START) / (1 - CORE_THROTTLE_START)));
  const core = rocket.userData.core;
  core.material.opacity = t;
  core.scale.setScalar(0.5 + t * 1.1);
}
