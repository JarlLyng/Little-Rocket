/**
 * Procedural noise textures shared by all planets and moons.
 *
 * Generated once on first request via four-octave value noise (6/18/48/128
 * grids, smoothstep-interpolated, contrast-shaped with pow(1.4)). The same
 * underlying noise is written to two CanvasTextures:
 *
 *   getPlanetBumpTexture()  — full 0–255 range. Used as bumpMap, roughnessMap,
 *                             and aoMap. Linear color space.
 *   getPlanetColorMap()     — compressed 0.50–1.10 range so it modulates the
 *                             diffuse color without black-clipping. sRGB.
 *
 * Both textures are RepeatWrapping with anisotropy 4. They are intentionally
 * never disposed — they live for the lifetime of the page.
 */
import * as THREE from 'three';

const SIZE = 512;
// Four octaves: large continents → fine surface noise. Each tiles via wrap-around sampling.
const OCTAVES = [
  { res: 6,   weight: 0.42 },
  { res: 18,  weight: 0.28 },
  { res: 48,  weight: 0.18 },
  { res: 128, weight: 0.12 },
];

let cachedBump = null;
let cachedMap = null;
let cachedAtmosphere = null;
let cachedPlume = null;

/**
 * Generates two textures from a single multi-octave value-noise field:
 *
 *   bump:  full 0–255 range. Used as bumpMap, roughnessMap, and aoMap.
 *   map:   compressed range (≈0.5–1.15) so it modulates planet diffuse color
 *          without black-clipping. Light noise → highlights, dark noise → dim.
 *
 * Generated once on first call. Both share the same underlying noise so the
 * surface relief and the color patches read as the same terrain features.
 */
export function getPlanetBumpTexture() {
  if (!cachedBump) generate();
  return cachedBump;
}

export function getPlanetColorMap() {
  if (!cachedMap) generate();
  return cachedMap;
}

/**
 * Engine plume falloff — bright at the nozzle end, fading to black down the
 * plume's length. Used as the map on an additive cone, where black reads as
 * fully transparent (the same trick the exhaust particles use), so the plume
 * dissolves backwards instead of ending in a hard rim. Combined with an
 * open-ended cone there's no cap either, so nothing about the plume has a
 * defined edge any more.
 *
 * Varies only along v, the cone's height. A gradient across u would put a
 * visible seam where the cone's UVs wrap around to meet themselves.
 *
 * Left in linear colour space on purpose: this is a brightness multiplier, not
 * colour data, so the authored stops should be used as written rather than
 * decoded from sRGB first.
 */
export function getPlumeTexture() {
  if (!cachedPlume) {
    const size = 64;
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    // Textures default to flipY, so canvas row 0 lands at v = 1 — which is the
    // cone's apex, and the apex is the end tucked up against the nozzle.
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0,    '#ffffff');
    grad.addColorStop(0.22, '#e0e0e0');
    grad.addColorStop(0.55, '#6e6e6e');
    grad.addColorStop(0.8,  '#242424');
    grad.addColorStop(1,    '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    cachedPlume = new THREE.CanvasTexture(canvas);
  }
  return cachedPlume;
}

/**
 * Atmospheric limb glow — a soft annulus, transparent at the centre and
 * peaking just outside the planet's silhouette. Drawn as an additive sprite
 * scaled relative to the planet radius, it reads as haze clinging to the edge
 * of the world. Peaking OUTSIDE the silhouette matters: a glow that peaked on
 * the disc would be depth-tested against the sphere and tear along the limb.
 *
 * Pure white so a single shared texture can be tinted per planet via the
 * sprite material's colour. Never disposed — one texture serves every planet.
 */
export function getAtmosphereTexture() {
  if (!cachedAtmosphere) {
    const size = 256;
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    // Peak at 0.79 of the sprite's half-width. Paired with a sprite scaled to
    // ATMOSPHERE_SCALE × radius in planets.js, that lands just off the limb.
    grad.addColorStop(0,    'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.60, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.79, 'rgba(255, 255, 255, 0.42)');
    grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.22)');
    grad.addColorStop(0.93, 'rgba(255, 255, 255, 0.07)');
    grad.addColorStop(1,    'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    cachedAtmosphere = new THREE.CanvasTexture(canvas);
  }
  return cachedAtmosphere;
}

function generate() {
  const grids = OCTAVES.map(({ res, weight }) => {
    const grid = new Float32Array(res * res);
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
    return { res, weight, grid };
  });

  const sample = (oct, ix, iy) => {
    const r = oct.res;
    return oct.grid[((iy + r) % r) * r + ((ix + r) % r)];
  };

  const buf = new Float32Array(SIZE * SIZE);
  let min = Infinity, max = -Infinity;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let v = 0;
      for (const oct of grids) {
        const fx = (x / SIZE) * oct.res;
        const fy = (y / SIZE) * oct.res;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const top = sample(oct, ix, iy)     + (sample(oct, ix + 1, iy)     - sample(oct, ix, iy))     * sx;
        const bot = sample(oct, ix, iy + 1) + (sample(oct, ix + 1, iy + 1) - sample(oct, ix, iy + 1)) * sx;
        v += (top + (bot - top) * sy) * oct.weight;
      }
      buf[y * SIZE + x] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  const range = max - min || 1;
  const bumpCanvas = makeCanvas();
  const mapCanvas = makeCanvas();
  const bumpCtx = bumpCanvas.getContext('2d');
  const mapCtx = mapCanvas.getContext('2d');
  const bumpImg = bumpCtx.createImageData(SIZE, SIZE);
  const mapImg = mapCtx.createImageData(SIZE, SIZE);
  const bumpData = bumpImg.data;
  const mapData = mapImg.data;

  for (let i = 0; i < buf.length; i++) {
    const n = (buf[i] - min) / range;
    // Pow with 1.4 pushes the curve toward darker valleys (more continents/oceans
    // contrast). Smoothstep would have softened it.
    const shaped = Math.pow(n, 1.4);

    const bumpV = Math.floor(shaped * 255);
    // Diffuse multiplier: maps 0 → 0.50 and 1 → 1.10, so dark patches darken
    // the planet color to half-brightness without ever fully blacking out.
    const diffuseMul = 0.50 + shaped * 0.60;
    const mapV = Math.min(255, Math.floor(diffuseMul * 255));

    const idx = i * 4;
    bumpData[idx] = bumpData[idx + 1] = bumpData[idx + 2] = bumpV;
    bumpData[idx + 3] = 255;
    mapData[idx]  = mapData[idx + 1]  = mapData[idx + 2]  = mapV;
    mapData[idx + 3] = 255;
  }

  bumpCtx.putImageData(bumpImg, 0, 0);
  mapCtx.putImageData(mapImg, 0, 0);

  cachedBump = new THREE.CanvasTexture(bumpCanvas);
  cachedBump.wrapS = cachedBump.wrapT = THREE.RepeatWrapping;
  cachedBump.anisotropy = 4;

  cachedMap = new THREE.CanvasTexture(mapCanvas);
  cachedMap.wrapS = cachedMap.wrapT = THREE.RepeatWrapping;
  cachedMap.anisotropy = 4;
  // The color map carries diffuse data — must be sRGB so Three's tonemap
  // doesn't double-darken it.
  cachedMap.colorSpace = THREE.SRGBColorSpace;
}

function makeCanvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
