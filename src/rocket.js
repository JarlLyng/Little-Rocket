import * as THREE from 'three';

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
