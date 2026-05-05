import * as THREE from 'three';

const FIELD_COUNT = 4;
const ASTEROIDS_PER_FIELD = [8, 18];   // [min, max] inclusive
const FIELD_RADIUS = [50, 120];
const ASTEROID_RADIUS = [0.5, 2.2];
const COLORS = [0x8a8378, 0x6b6358, 0x9a9088, 0x7a6e60, 0x877a64];
const GEOMETRY_POOL_SIZE = 8;

// Scratch vector reused inside the per-frame loop.
const _scratch = new THREE.Vector3();

/**
 * Pool of distinct asteroid shapes built lazily on first use. Each asteroid
 * picks one and varies via scale + rotation, so a player perceives unique
 * shapes without us paying the cost of one geometry per mesh. Pool stays
 * alive for the lifetime of the program — geometries are NOT disposed when
 * a field recycles.
 */
let geometryPool = null;

function buildAsteroidGeometry() {
  // Unit radius — instances scale to their actual size.
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const positions = geo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const wobble = 0.65 + Math.random() * 0.55;
    positions.setXYZ(i, (x / len) * wobble, (y / len) * wobble, (z / len) * wobble);
  }
  geo.computeVertexNormals();
  return geo;
}

function getPooledGeometry() {
  if (!geometryPool) {
    geometryPool = [];
    for (let i = 0; i < GEOMETRY_POOL_SIZE; i++) geometryPool.push(buildAsteroidGeometry());
  }
  return geometryPool[Math.floor(Math.random() * geometryPool.length)];
}

/**
 * Asteroid fields: clusters of small low-poly rocky meshes that spawn in
 * front of the rocket and recycle behind. Each asteroid is an icosahedron
 * with vertex displacement and flat shading — chunky surface character
 * without textures or per-vertex normals.
 *
 * Visually distinct from planets: smaller, more numerous per cluster, no
 * emissive component, no rings or moons. Provides a different rhythm.
 */
export function createAsteroidField(scene, anchor) {
  const fields = [];

  function makeAsteroid() {
    const radius = ASTEROID_RADIUS[0] + Math.random() * (ASTEROID_RADIUS[1] - ASTEROID_RADIUS[0]);
    const mesh = new THREE.Mesh(
      getPooledGeometry(),
      new THREE.MeshStandardMaterial({
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        roughness: 1.0,
        metalness: 0.05,
        flatShading: true,
      })
    );
    mesh.scale.setScalar(radius);
    mesh.userData.spinX = (Math.random() - 0.5) * 0.01;
    mesh.userData.spinY = (Math.random() - 0.5) * 0.01;
    mesh.userData.spinZ = (Math.random() - 0.5) * 0.005;
    return mesh;
  }

  function spawnField(initial = false) {
    const group = new THREE.Group();
    const count = ASTEROIDS_PER_FIELD[0]
      + Math.floor(Math.random() * (ASTEROIDS_PER_FIELD[1] - ASTEROIDS_PER_FIELD[0]));
    const fieldRadius = FIELD_RADIUS[0] + Math.random() * (FIELD_RADIUS[1] - FIELD_RADIUS[0]);

    const asteroids = [];
    for (let i = 0; i < count; i++) {
      const a = makeAsteroid();
      // Uniformly distribute inside a sphere using inverse-CDF for radius
      const r = fieldRadius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      a.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      a.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      group.add(a);
      asteroids.push(a);
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(anchor.quaternion);
    const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(anchor.quaternion);
    const up      = new THREE.Vector3(0, 1,  0).applyQuaternion(anchor.quaternion);

    const dist = initial ? 600 + Math.random() * 1400 : 1500 + Math.random() * 800;
    const spread = 600;
    group.position.copy(anchor.position)
      .add(forward.multiplyScalar(dist))
      .add(right.multiplyScalar((Math.random() - 0.5) * spread))
      .add(up.multiplyScalar((Math.random() - 0.5) * spread));

    group.userData.asteroids = asteroids;
    scene.add(group);
    fields.push(group);
  }

  for (let i = 0; i < FIELD_COUNT; i++) spawnField(true);

  function update(forward, dt) {
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      for (const a of f.userData.asteroids) {
        a.rotation.x += a.userData.spinX * dt;
        a.rotation.y += a.userData.spinY * dt;
        a.rotation.z += a.userData.spinZ * dt;
      }

      const toField = _scratch.subVectors(f.position, anchor.position);
      if (toField.dot(forward) < -300 || toField.length() > 2500) {
        scene.remove(f);
        f.traverse((obj) => {
          if (obj.isMesh) {
            // Geometry is shared from the pool — only dispose the per-asteroid material.
            obj.material.dispose();
          }
        });
        fields.splice(i, 1);
      }
    }
    while (fields.length < FIELD_COUNT) spawnField();
  }

  return { update };
}
