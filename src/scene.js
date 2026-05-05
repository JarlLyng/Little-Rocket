import * as THREE from 'three';

// Forward-right-up of the default rocket orientation (rocket starts pointing -z).
// Putting the sun here means the player sees it the moment the game starts.
const SUN_DIRECTION = new THREE.Vector3(0.4, 0.35, -1).normalize();
const SUN_DISTANCE = 2200;

const NEBULA_COLORS = [0x4422aa, 0x882244, 0x224488, 0x6644aa, 0x4488cc, 0xaa4466];

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = makeSkyGradient();
  scene.fog = new THREE.FogExp2(0x000008, 0.0002);

  // Lower ambient + brighter directional gives bump maps more pronounced shading.
  scene.add(new THREE.AmbientLight(0x303048, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
  scene.add(sun);
  scene.add(sun.target); // target defaults to (0,0,0); explicit add lets us move it later

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

  const nebulae = makeNebulae(4);
  for (const n of nebulae) scene.add(n.sprite);

  return { scene, sunMesh, halo, streaks, nebulae };
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
  // Ramp in from 25% throttle so streaks are visible across most of the speed range.
  const t = Math.max(0, (speed / maxSpeed - 0.25) / 0.75);
  streaks.material.opacity = t * 0.85;
  if (t === 0) return;

  const length = t * 200;
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

/**
 * Each nebula carries a fixed direction + distance from the rocket; we re-pin
 * it every frame so the nebulae feel infinitely distant. Same trick as the sun.
 */
export function updateNebulae(nebulae, rocketPosition) {
  for (const n of nebulae) {
    n.sprite.position.copy(rocketPosition).addScaledVector(n.direction, n.distance);
  }
}

function makeNebulae(count) {
  const nebulae = [];
  for (let i = 0; i < count; i++) {
    const color = NEBULA_COLORS[i % NEBULA_COLORS.length];
    const scale = 1800 + Math.random() * 1400;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialGradient(color),
      color: 0xffffff,
      transparent: true,
      // Very low opacity — nebulae should read as a hint of color in deep
      // space, not a dominant background element.
      opacity: 0.03 + Math.random() * 0.03,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sprite.scale.set(scale, scale, 1);
    nebulae.push({
      sprite,
      direction: new THREE.Vector3(
        Math.random() - 0.5,
        (Math.random() - 0.5) * 0.6,
        Math.random() - 0.5
      ).normalize(),
      distance: 2500 + Math.random() * 1500,
    });
  }
  return nebulae;
}

function makeSkyGradient() {
  // Almost pure black with a barely-perceptible color shift, so the scene
  // still reads as black space but doesn't feel as flat as #000000.
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0,    '#02020a');
  grad.addColorStop(0.5,  '#000000');
  grad.addColorStop(1,    '#03020a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
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
