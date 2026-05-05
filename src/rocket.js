import * as THREE from 'three';

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

  const finMat = new THREE.MeshStandardMaterial({ color: 0x4488ff });
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.6), finMat);
    const angle = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 1.2);
    fin.rotation.z = angle - Math.PI / 2;
    rocket.add(fin);
  }

  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 1.5, 12),
    new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.7 })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.z = 2.0;
  rocket.userData.glow = glow;
  rocket.add(glow);

  return rocket;
}

export function updateGlow(rocket, speed) {
  const glow = rocket.userData.glow;
  glow.scale.setScalar(0.5 + speed * 0.4 + Math.random() * 0.1);
  glow.material.opacity = 0.4 + speed * 0.1;
}
