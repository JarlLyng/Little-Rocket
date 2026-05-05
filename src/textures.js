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

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}
