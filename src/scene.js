import * as THREE from 'three';

const SUN_DIRECTION = new THREE.Vector3(100, 50, 100).normalize();
const SUN_DISTANCE = 2200;

export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000010, 0.0002);

  // Lower ambient + brighter directional gives bump maps more pronounced shading.
  scene.add(new THREE.AmbientLight(0x303048, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
  scene.add(sun);

  // Visible sun: bright sphere + radial halo sprite. Both follow the rocket
  // each frame so the sun stays "infinitely far" in a fixed direction.
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(45, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8 })
  );
  scene.add(sunMesh);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialGradient(0xfff0c8),
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.set(420, 420, 1);
  scene.add(halo);

  scene.add(makeStarLayer(8000, 0.8, 4000, 0xffffff));
  scene.add(makeStarLayer(2000, 1.5, 4000, 0xddeeff));
  scene.add(makeStarLayer(300,  2.5, 4000, 0xffeecc));

  // Streak layer: zero-length line segments that grow backwards along the
  // rocket's forward vector at high speed. Positions live at world origin —
  // we update them from main.js per frame.
  const streaks = makeStreakLayer(400, 4000);
  scene.add(streaks);

  return { scene, sunMesh, halo, streaks };
}

function makeStarLayer(count, size, spread, color) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() - 0.5) * spread;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false }));
}

function makeStreakLayer(count, spread) {
  const positions = new Float32Array(count * 6); // two endpoints per segment
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * spread;
    const y = (Math.random() - 0.5) * spread;
    const z = (Math.random() - 0.5) * spread;
    const o = i * 6;
    positions[o]     = positions[o + 3] = x;
    positions[o + 1] = positions[o + 4] = y;
    positions[o + 2] = positions[o + 5] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.LineSegments(geo, mat);
}

/**
 * Update streak length & opacity based on speed. At low speed the streaks
 * collapse to zero length and disappear; above ~50% throttle they ramp in.
 */
export function updateStreaks(streaks, forward, speed, maxSpeed) {
  const t = Math.max(0, (speed / maxSpeed - 0.5) * 2); // 0 below 50%, 1 at max
  streaks.material.opacity = t * 0.55;
  if (t === 0) return;

  const length = t * 60;
  const dx = forward.x * length, dy = forward.y * length, dz = forward.z * length;
  const arr = streaks.geometry.attributes.position.array;
  // Each segment: [sx,sy,sz, ex,ey,ez] — keep start, set end = start - forward*length
  for (let i = 0; i < arr.length; i += 6) {
    arr[i + 3] = arr[i] - dx;
    arr[i + 4] = arr[i + 1] - dy;
    arr[i + 5] = arr[i + 2] - dz;
  }
  streaks.geometry.attributes.position.needsUpdate = true;
}

/**
 * Update sun mesh + halo to track the rocket so the sun stays at a fixed
 * apparent direction regardless of where the rocket has flown.
 */
export function updateSun(sunMesh, halo, rocketPosition) {
  sunMesh.position.copy(rocketPosition).addScaledVector(SUN_DIRECTION, SUN_DISTANCE);
  halo.position.copy(sunMesh.position);
}

function makeRadialGradient(hexColor) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  const c = new THREE.Color(hexColor);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  grad.addColorStop(0,    `rgba(${rgb}, 1)`);
  grad.addColorStop(0.2,  `rgba(${rgb}, 0.6)`);
  grad.addColorStop(0.5,  `rgba(${rgb}, 0.15)`);
  grad.addColorStop(1,    `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return renderer;
}

export function createCamera() {
  return new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
}
