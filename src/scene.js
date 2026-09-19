/**
 * Scene factory and "follower" updates.
 *
 * createScene() builds: a Scene with sky-gradient background, ambient + two
 * directional lights (binary star system), three star Points layers, a streak
 * LineSegments layer, four nebula sprites, plus visible sun mesh + halo per
 * star. Returns handles to the things main.js needs to update each frame.
 *
 * Anything that should feel "infinitely far" (suns, nebulae, star layers,
 * streak layer) is re-pinned to the rocket's world position every frame so
 * the player can fly forever without flying out of the surrounding sky.
 *
 * The 3D scene is intentionally outside the IAMJARL design token system —
 * see styles/main.css for the UI chrome that does use tokens.
 */
import * as THREE from 'three';

// Forward-right-up of the default rocket orientation (rocket starts pointing -z).
// Putting the sun here means the player sees it the moment the game starts.
// Binary star system. The warm primary sits forward-right-up; a cooler,
// smaller companion sits forward-left-up. Both are visible from the default
// rocket orientation.
const SUNS = [
  {
    direction: new THREE.Vector3(0.4, 0.35, -1).normalize(),
    distance: 2200,
    meshSize: 45,
    haloSize: 420,
    color: 0xfff0c8,
    lightIntensity: 0.95,
  },
  {
    direction: new THREE.Vector3(-0.5, 0.25, -0.9).normalize(),
    distance: 2500,
    meshSize: 26,
    haloSize: 270,
    color: 0xc8d8ff,
    lightIntensity: 0.55,
  },
];

const NEBULA_COLORS = [0x4422aa, 0x882244, 0x224488, 0x6644aa, 0x4488cc, 0xaa4466];

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = makeSkyGradient();
  scene.fog = new THREE.FogExp2(0x000008, 0.0002);

  // Lower ambient compensates for two directional lights summing close to
  // the previous single-sun intensity.
  scene.add(new THREE.AmbientLight(0x303048, 0.32));

  // Build each sun: directional light + visible mesh + additive halo.
  const suns = SUNS.map((spec) => {
    const light = new THREE.DirectionalLight(spec.color, spec.lightIntensity);
    light.position.copy(spec.direction).multiplyScalar(100);
    scene.add(light);
    scene.add(light.target);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(spec.meshSize, 32, 32),
      new THREE.MeshBasicMaterial({ color: spec.color })
    );
    scene.add(mesh);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialGradient(spec.color),
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    halo.scale.set(spec.haloSize, spec.haloSize, 1);
    scene.add(halo);

    return { spec, mesh, halo };
  });

  // Star layers are anchored to the rocket each frame (see updateStarAnchors)
  // so the player never flies "out of" the starfield. Stars themselves stay
  // fixed in rocket-relative space, which reads as "stars at infinity" — the
  // sense of motion comes from planets, asteroids, and the streak layer.
  const starLayers = [
    makeStarLayer(8000, 0.8, 4000, 0xffffff),
    makeStarLayer(2000, 1.5, 4000, 0xddeeff),
    makeStarLayer(300,  2.5, 4000, 0xffeecc),
    // A galactic band gives the sky a structure to read against — without it
    // the starfield is uniform noise in every direction.
    makeGalacticBand(5000, 1800),
  ];
  for (const layer of starLayers) scene.add(layer);

  // Streak layer: zero-length line segments that grow backwards along the
  // rocket's forward vector at high speed. Also anchored to the rocket so the
  // streaks always surround it.
  const streaks = makeStreakLayer(400, 4000);
  scene.add(streaks);

  const nebulae = makeNebulae(3);
  for (const n of nebulae) scene.add(n.sprite);

  return { scene, suns, streaks, nebulae, starLayers };
}

/**
 * Pin star (and streak) layers to the rocket's world position so they feel
 * like a static dome at infinity.
 */
export function updateStarAnchors(starLayers, streaks, rocketPosition) {
  for (const layer of starLayers) layer.position.copy(rocketPosition);
  streaks.position.copy(rocketPosition);
}

function makeStarLayer(count, size, spread, color) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() - 0.5) * spread;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false }));
}

/**
 * A dense band of faint stars concentrated near one plane — our stand-in for
 * a galactic disc seen edge-on. Stars sit on a shell at a fixed radius so the
 * band keeps its shape from every angle, with elevation drawn from a narrow
 * normal distribution (sum-of-uniforms) so density falls off smoothly away
 * from the mid-line instead of ending at a hard edge. The whole layer is
 * tilted so the band cuts across the sky diagonally rather than sitting level.
 */
function makeGalacticBand(count, radius) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    // Three uniforms summed ≈ normal; scaled to keep the band tight.
    const spread = ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 0.55;
    const r = radius * (0.9 + Math.random() * 0.2);
    const o = i * 3;
    pos[o]     = Math.cos(theta) * r;
    pos[o + 1] = spread * r;
    pos[o + 2] = Math.sin(theta) * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const layer = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xf4f0ff,
    size: 0.7,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.55,
  }));
  layer.rotation.set(0.34, 0, 0.62);
  return layer;
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
 * Pin every sun's mesh and halo to the rocket so each one stays at a fixed
 * apparent direction regardless of where the rocket has flown.
 */
export function updateSuns(suns, rocketPosition) {
  for (const s of suns) {
    s.mesh.position.copy(rocketPosition).addScaledVector(s.spec.direction, s.spec.distance);
    s.halo.position.copy(s.mesh.position);
  }
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
      // Softer gradient than the sun halo — center alpha caps at 0.25, not 1.
      // Combined with the low opacity below this gives a barely-perceptible tint.
      map: makeNebulaGradient(color),
      color: 0xffffff,
      transparent: true,
      opacity: 0.04 + Math.random() * 0.03,
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

/**
 * Sun-style glow: bright core falling off to nothing. Exported because the
 * comet head wants exactly the same falloff.
 */
export function makeRadialGradient(hexColor) {
  return makeGradientTexture(hexColor, [
    [0,    1.0],
    [0.2,  0.6],
    [0.5,  0.15],
    [1,    0],
  ]);
}

function makeNebulaGradient(hexColor) {
  // Cap center alpha at 0.25 so even at full opacity the nebula never glows
  // bright. The smooth falloff makes it read as a faint cloud, not a sun.
  return makeGradientTexture(hexColor, [
    [0,    0.25],
    [0.35, 0.10],
    [0.7,  0.025],
    [1,    0],
  ]);
}

function makeGradientTexture(hexColor, stops) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  const c = new THREE.Color(hexColor);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  for (const [stop, alpha] of stops) {
    grad.addColorStop(stop, `rgba(${rgb}, ${alpha})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Filmic highlight rolloff. Without it the suns, engine glow, and every
  // additive sprite clip to flat white the moment they overlap; ACES lets
  // them bloom toward white gradually and keeps their colour to the edge.
  // Exposure compensates for the midtone dip tonemapping introduces. This
  // value is for rendering straight to screen; postfx.js lowers it when it
  // takes over, because a composer blends in linear space and comes out much
  // brighter — see COMPOSER_EXPOSURE there.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  // Cap pixel ratio lower on touch devices — mobile GPUs choke on retina-
  // density 3D scenes with our planet/asteroid/star/streak count.
  const isTouch = typeof window !== 'undefined'
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const cap = isTouch ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
  return renderer;
}

export function createCamera() {
  return new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
}
