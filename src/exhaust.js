import * as THREE from 'three';

const POOL_SIZE = 500;
const LIFETIME_S = 1.2;        // seconds for a particle to fade to black
const SPAWN_RATE = 8;           // particles per second per unit of speed

/**
 * Engine particle trail. A fixed pool of points written to in a ring buffer,
 * faded via additive blending — when RGB → 0 the particle becomes invisible
 * even though its position keeps drifting. No alpha channel needed.
 *
 * The points are positioned in world space, not parented to the rocket, so
 * they remain in the trail behind the rocket as it moves on.
 */
export function createExhaust() {
  const positions = new Float32Array(POOL_SIZE * 3);
  const colors    = new Float32Array(POOL_SIZE * 3);
  const velocities = new Float32Array(POOL_SIZE * 3);
  const lives = new Float32Array(POOL_SIZE);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.4,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // particles drift outside the rocket's bounding sphere

  let cursor = 0;
  let spawnAccumulator = 0;

  /**
   * Emit particles from the engine glow position. Spawns are accumulated as
   * fractions across frames so low spawn rates still emit evenly.
   */
  function spawn(originWorld, forwardWorld, speed, dt) {
    if (speed <= 0) return;
    spawnAccumulator += speed * SPAWN_RATE * (dt / 60);
    const count = Math.floor(spawnAccumulator);
    spawnAccumulator -= count;

    const backSpeed = 3 + speed * 1.5;
    for (let n = 0; n < count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % POOL_SIZE;
      const pi = i * 3;

      positions[pi]     = originWorld.x + (Math.random() - 0.5) * 0.25;
      positions[pi + 1] = originWorld.y + (Math.random() - 0.5) * 0.25;
      positions[pi + 2] = originWorld.z + (Math.random() - 0.5) * 0.25;

      // Particles drift opposite to the rocket's forward, with a small spread
      const spread = 0.6;
      velocities[pi]     = -forwardWorld.x * backSpeed + (Math.random() - 0.5) * spread;
      velocities[pi + 1] = -forwardWorld.y * backSpeed + (Math.random() - 0.5) * spread;
      velocities[pi + 2] = -forwardWorld.z * backSpeed + (Math.random() - 0.5) * spread;

      lives[i] = 1.0;
    }
  }

  function update(dt) {
    const realDt = dt / 60;
    const decay = realDt / LIFETIME_S;

    for (let i = 0; i < POOL_SIZE; i++) {
      if (lives[i] <= 0) continue;
      lives[i] = Math.max(0, lives[i] - decay);

      const pi = i * 3;
      positions[pi]     += velocities[pi]     * realDt;
      positions[pi + 1] += velocities[pi + 1] * realDt;
      positions[pi + 2] += velocities[pi + 2] * realDt;

      // Fade through warm engine colors: cyan-blue core → pale orange tip
      const a = lives[i];
      colors[pi]     = (1.0 - a * 0.5) * a;          // R rises late, dies with a
      colors[pi + 1] = 0.7 * a;                      // G constant, dies with a
      colors[pi + 2] = a;                            // B starts strong, dies with a
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { object: points, spawn, update };
}
