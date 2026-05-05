import * as THREE from 'three';
import { getPlanetBumpTexture } from './textures.js';

const COLORS = [0xff6644, 0x44aaff, 0xffaa44, 0x88ff88, 0xaa66ff, 0xffdd66, 0xff88aa];
const TARGET_COUNT = 40;
const RING_CHANCE = 0.25;
const ONE_MOON_CHANCE = 0.30;
const TWO_MOON_CHANCE = 0.05; // additional chance on top of one-moon

export function createPlanetField(scene, anchor) {
  const planets = [];
  const bumpMap = getPlanetBumpTexture();

  function makeMoon(planetRadius) {
    const moonRadius = planetRadius * (0.18 + Math.random() * 0.22);
    const moonGeo = new THREE.SphereGeometry(moonRadius, 16, 16);
    moonGeo.setAttribute('uv2', moonGeo.attributes.uv);
    const mesh = new THREE.Mesh(
      moonGeo,
      new THREE.MeshStandardMaterial({
        color: 0xbbbbbb,
        roughness: 0.95,
        metalness: 0.05,
        bumpMap,
        bumpScale: 1.0,
        roughnessMap: bumpMap,
        aoMap: bumpMap,
        aoMapIntensity: 1.0,
      })
    );
    return {
      mesh,
      distance: planetRadius * (1.7 + Math.random() * 1.0),
      angle: Math.random() * Math.PI * 2,
      speed: (Math.random() < 0.5 ? -1 : 1) * (0.005 + Math.random() * 0.01),
      tilt: (Math.random() - 0.5) * 0.8, // radians, gives orbits non-equatorial planes
    };
  }

  function spawn(initial = false) {
    const r = 2 + Math.random() * 8;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    const group = new THREE.Group();

    const bodyGeo = new THREE.SphereGeometry(r, 32, 32);
    // aoMap requires uv2; for SphereGeometry we just reuse uv.
    bodyGeo.setAttribute('uv2', bodyGeo.attributes.uv);
    const body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.06,
        bumpMap,
        bumpScale: 1.0 + Math.random() * 0.6,
        roughnessMap: bumpMap,
        aoMap: bumpMap,
        aoMapIntensity: 1.0,
      })
    );
    body.userData.spinSpeed = (Math.random() - 0.5) * 0.005;
    group.add(body);

    if (Math.random() < RING_CHANCE) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.4, r * 1.9, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffeecc, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
        })
      );
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      group.add(ring);
    }

    const moons = [];
    if (Math.random() < ONE_MOON_CHANCE) {
      const m = makeMoon(r);
      group.add(m.mesh);
      moons.push(m);
      if (Math.random() < TWO_MOON_CHANCE) {
        const m2 = makeMoon(r);
        group.add(m2.mesh);
        moons.push(m2);
      }
    }

    group.userData.body = body;
    group.userData.moons = moons;
    group.userData.radius = r;
    group.userData.wasNear = false;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(anchor.quaternion);
    const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(anchor.quaternion);
    const up      = new THREE.Vector3(0, 1,  0).applyQuaternion(anchor.quaternion);

    const dist = initial ? 400 + Math.random() * 1200 : 1200 + Math.random() * 600;
    const spread = 800;
    group.position.copy(anchor.position)
      .add(forward.multiplyScalar(dist))
      .add(right.multiplyScalar((Math.random() - 0.5) * spread))
      .add(up.multiplyScalar((Math.random() - 0.5) * spread));

    scene.add(group);
    planets.push(group);
  }

  for (let i = 0; i < TARGET_COUNT; i++) spawn(true);

  function update(forward, dt, onNearMiss) {
    for (let i = planets.length - 1; i >= 0; i--) {
      const p = planets[i];
      p.userData.body.rotation.y += p.userData.body.userData.spinSpeed * dt;

      for (const moon of p.userData.moons) {
        moon.angle += moon.speed * dt;
        const sa = Math.sin(moon.angle);
        const ca = Math.cos(moon.angle);
        moon.mesh.position.set(
          ca * moon.distance,
          sa * Math.sin(moon.tilt) * moon.distance,
          sa * Math.cos(moon.tilt) * moon.distance
        );
      }

      const toPlanet = p.position.clone().sub(anchor.position);
      const planetDist = toPlanet.length();
      const nearThreshold = p.userData.radius * 2.2;
      const isNear = planetDist < nearThreshold;
      // Fire only on the rising edge — once per close encounter, not every frame.
      if (isNear && !p.userData.wasNear && onNearMiss) onNearMiss();
      p.userData.wasNear = isNear;

      if (toPlanet.dot(forward) < -200 || planetDist > 2500) {
        scene.remove(p);
        p.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry.dispose();
            obj.material.dispose();
            // Note: bumpMap texture is shared and intentionally NOT disposed here.
          }
        });
        planets.splice(i, 1);
      }
    }
    while (planets.length < TARGET_COUNT) spawn();
  }

  return { update };
}
