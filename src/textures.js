import * as THREE from 'three';

let cachedBump = null;

/**
 * Procedurally generated noise texture used for both bump and roughness on
 * planets and moons. One CanvasTexture, reused everywhere — cheap on memory.
 *
 * Implementation: multi-octave value noise. Three smoothstep-interpolated
 * grids of different frequencies are summed and contrast-stretched, giving
 * both large continent-like features and smaller surface roughness.
 */
export function getPlanetBumpTexture() {
  if (cachedBump) return cachedBump;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  // Three octaves: large, medium, fine. Each tiles seamlessly via wrap-around sampling.
  const octaves = [
    { res: 8,  weight: 0.55 },
    { res: 24, weight: 0.30 },
    { res: 64, weight: 0.15 },
  ].map(({ res, weight }) => {
    const grid = new Float32Array(res * res);
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
    return { res, weight, grid };
  });

  const sample = (oct, ix, iy) => {
    const r = oct.res;
    return oct.grid[((iy + r) % r) * r + ((ix + r) % r)];
  };

  let min = Infinity, max = -Infinity;
  const buf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const oct of octaves) {
        const fx = (x / size) * oct.res;
        const fy = (y / size) * oct.res;
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
      buf[y * size + x] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  // Contrast-stretch to use the full 0..1 range, then push toward extremes
  // with a smoothstep-like curve so light/dark patches read as terrain.
  const range = max - min || 1;
  for (let i = 0; i < buf.length; i++) {
    const n = (buf[i] - min) / range;
    const stretched = n * n * (3 - 2 * n); // smoothstep — adds contrast
    const c = Math.floor(stretched * 255);
    const idx = i * 4;
    data[idx] = data[idx + 1] = data[idx + 2] = c;
    data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  cachedBump = new THREE.CanvasTexture(canvas);
  cachedBump.wrapS = cachedBump.wrapT = THREE.RepeatWrapping;
  cachedBump.anisotropy = 4;
  return cachedBump;
}
