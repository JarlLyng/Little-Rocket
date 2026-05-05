import * as THREE from 'three';

const COLORS = [0xff6644, 0x44aaff, 0xffaa44, 0x88ff88, 0xaa66ff, 0xffdd66, 0xff88aa];
const TARGET_COUNT = 40;

export function createPlanetField(scene, anchor) {
  const planets = [];

  function spawn(initial = false) {
    const r = 2 + Math.random() * 8;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 24),
      new THREE.MeshStandardMaterial({
        color, roughness: 0.8, metalness: 0.1,
        emissive: color, emissiveIntensity: 0.15,
      })
    );

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(anchor.quaternion);
    const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(anchor.quaternion);
    const up      = new THREE.Vector3(0, 1,  0).applyQuaternion(anchor.quaternion);

    const dist = initial ? 400 + Math.random() * 1200 : 1200 + Math.random() * 600;
    const spread = 800;
    planet.position.copy(anchor.position)
      .add(forward.multiplyScalar(dist))
      .add(right.multiplyScalar((Math.random() - 0.5) * spread))
      .add(up.multiplyScalar((Math.random() - 0.5) * spread));

    if (Math.random() < 0.25) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.4, r * 1.9, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffeecc, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
        })
      );
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      planet.add(ring);
    }

    planet.userData.spinSpeed = (Math.random() - 0.5) * 0.005;
    scene.add(planet);
    planets.push(planet);
  }

  for (let i = 0; i < TARGET_COUNT; i++) spawn(true);

  function update(forward, dt) {
    for (let i = planets.length - 1; i >= 0; i--) {
      const p = planets[i];
      // dt is normalized to 60fps; spinSpeed was tuned for per-frame use
      p.rotation.y += p.userData.spinSpeed * dt;
      const toPlanet = p.position.clone().sub(anchor.position);
      if (toPlanet.dot(forward) < -200 || toPlanet.length() > 2500) {
        scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        planets.splice(i, 1);
      }
    }
    while (planets.length < TARGET_COUNT) spawn();
  }

  return { update };
}
