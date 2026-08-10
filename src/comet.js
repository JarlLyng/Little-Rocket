/**
 * A rare comet.
 *
 * At most one is alive at a time, and it appears on its own schedule — a long
 * random wait, then a single crossing. The rarity is the point: it should feel
 * like something you were lucky to be looking at, not a recurring effect.
 *
 * Construction: an additive sprite head plus a trail of Points written in a
 * ring buffer, same technique as the engine exhaust — trail points live in
 * world space so they hang in the dark after the head has moved on, and fade
 * by ramping RGB toward zero (additive blending makes that read as alpha).
 *
 * The comet spawns ahead of the rocket and off to one side, with a velocity
 * that carries it ACROSS the view rather than along it, so it sweeps past
 * instead of receding. It despawns on a lifetime, or once it falls behind.
 */
import * as THREE from 'three';
import { makeRadialGradient } from './scene.js';

const HEAD_COLOR = 0xd8f4ff;   // pale ice blue
const HEAD_SIZE = 46;

const TRAIL_POOL = 260;
const TRAIL_LIFETIME_S = 1.7;
const TRAIL_SIZE = 6;
const TRAIL_SPREAD = 2.5;      // jitter on each trail point at birth, world units
const TRAIL_DRIFT = 9;         // world units/second each point wanders outward
// Additive points overlap heavily near the head. Without this gain the sum
// clips to solid white and the tail reads as a hard beam, not vapour.
const TRAIL_GAIN = 0.55;

// How long the dark stays empty. The first wait is shorter so a player who
// only flies once still has a fair chance of seeing one.
const FIRST_WAIT_S = [30, 80];
const REPEAT_WAIT_S = [110, 240];

const SPAWN_AHEAD = [700, 1300];
const SPAWN_LATERAL = [180, 460];
const CROSS_SPEED = [130, 250];  // world units per second, across the view
const LIFETIME_S = 20;

const _headPos = new THREE.Vector3();
const _toComet = new THREE.Vector3();

function randRange([lo, hi]) { return lo + Math.random() * (hi - lo); }

/**
 * @param scene   THREE.Scene
 * @param anchor  the rocket group — comets spawn and despawn relative to it
 */
export function createComet(scene, anchor) {
  const head = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialGradient(HEAD_COLOR),
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  head.scale.set(HEAD_SIZE, HEAD_SIZE, 1);
  head.visible = false;
  scene.add(head);

  const positions = new Float32Array(TRAIL_POOL * 3);
  const colors = new Float32Array(TRAIL_POOL * 3);
  const drifts = new Float32Array(TRAIL_POOL * 3);
  const lives = new Float32Array(TRAIL_POOL);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const trail = new THREE.Points(geo, new THREE.PointsMaterial({
    size: TRAIL_SIZE,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  trail.frustumCulled = false; // the trail extends well outside the head's bounds
  scene.add(trail);

  const headColor = new THREE.Color(HEAD_COLOR);
  const velocity = new THREE.Vector3();
  let cursor = 0;
  let active = false;
  let age = 0;
  let wait = randRange(FIRST_WAIT_S);

  function spawn(forward) {
    // Build a frame around the rocket's heading so "across the view" is
    // meaningful regardless of which way the player happens to be flying.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(anchor.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(anchor.quaternion);

    // Enter from one side, at a slight vertical offset.
    const side = Math.random() < 0.5 ? -1 : 1;
    const lateral = randRange(SPAWN_LATERAL) * side;
    const vertical = (Math.random() - 0.5) * 2 * randRange(SPAWN_LATERAL) * 0.6;

    _headPos.copy(anchor.position)
      .addScaledVector(forward, randRange(SPAWN_AHEAD))
      .addScaledVector(right, lateral)
      .addScaledVector(up, vertical);
    head.position.copy(_headPos);

    // Travel mostly sideways — inward, so it crosses the view rather than
    // drifting further out — with a little vertical and forward variation.
    const cross = randRange(CROSS_SPEED);
    velocity.set(0, 0, 0)
      .addScaledVector(right, -side * cross)
      .addScaledVector(up, (Math.random() - 0.5) * cross * 0.4)
      .addScaledVector(forward, (Math.random() - 0.5) * cross * 0.5);

    active = true;
    age = 0;
    head.visible = true;
    head.material.opacity = 0;
  }

  function despawn() {
    active = false;
    head.visible = false;
    wait = randRange(REPEAT_WAIT_S);
  }

  /**
   * @param forward   the rocket's forward vector this frame
   * @param dt        frame delta in 60fps-frame units (as elsewhere)
   * @param onAppear  fired once per comet, the moment it spawns
   */
  function update(forward, dt, onAppear) {
    const realDt = dt / 60;

    if (!active) {
      wait -= realDt;
      if (wait <= 0) {
        spawn(forward);
        if (onAppear) onAppear();
      }
    } else {
      age += realDt;
      head.position.addScaledVector(velocity, realDt);

      // Fade in over the first second and out over the last three, so it
      // arrives and leaves as light rather than popping.
      const fadeIn = Math.min(1, age);
      const fadeOut = Math.min(1, (LIFETIME_S - age) / 3);
      head.material.opacity = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.95;

      // Lay down one trail point per frame at the head's position. Its life
      // starts at the head's current opacity so the tail fades in with it.
      const i = cursor;
      cursor = (cursor + 1) % TRAIL_POOL;
      const ti = i * 3;
      positions[ti]     = head.position.x + (Math.random() - 0.5) * TRAIL_SPREAD;
      positions[ti + 1] = head.position.y + (Math.random() - 0.5) * TRAIL_SPREAD;
      positions[ti + 2] = head.position.z + (Math.random() - 0.5) * TRAIL_SPREAD;
      // Each point wanders as it ages, so the tail widens away from the head
      // instead of staying a constant-width tube.
      drifts[ti]     = (Math.random() - 0.5) * TRAIL_DRIFT;
      drifts[ti + 1] = (Math.random() - 0.5) * TRAIL_DRIFT;
      drifts[ti + 2] = (Math.random() - 0.5) * TRAIL_DRIFT;
      lives[i] = head.material.opacity;

      _toComet.subVectors(head.position, anchor.position);
      if (age >= LIFETIME_S || _toComet.dot(forward) < -400 || _toComet.length() > 3000) {
        despawn();
      }
    }

    // Trail points fade whether or not a comet is currently alive, so the
    // tail of a departed comet dissolves instead of vanishing with it.
    const decay = realDt / TRAIL_LIFETIME_S;
    for (let i = 0; i < TRAIL_POOL; i++) {
      if (lives[i] <= 0) continue;
      lives[i] = Math.max(0, lives[i] - decay);
      const ci = i * 3;
      positions[ci]     += drifts[ci]     * realDt;
      positions[ci + 1] += drifts[ci + 1] * realDt;
      positions[ci + 2] += drifts[ci + 2] * realDt;
      // Squared falloff: bright right at the head, tapering away fast down
      // the tail. Linear made the whole length read at nearly one brightness.
      const a = lives[i] * lives[i] * TRAIL_GAIN;
      colors[ci]     = headColor.r * a;
      colors[ci + 1] = headColor.g * a;
      colors[ci + 2] = headColor.b * a;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { update };
}
