import * as THREE from 'three';

let cachedBump = null;

/**
 * Procedurally generated bump texture for planet surfaces.
 * Generated once and shared across all planet materials — cheap on memory,
 * and the variation in planet color, size, and rings makes it read as unique.
 *
 * Implementation: smoothstep-interpolated value noise from a low-res grid,
 * tiled seamlessly so it wraps cleanly around a sphere.
 */
export function getPlanetBumpTexture() {
  if (cachedBump) return cachedBump;

  const size = 256;
  const lowRes = 16; // grid of random values; smaller = larger features

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const grid = new Float32Array(lowRes * lowRes);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random();

  const sample = (ix, iy) => grid[((iy + lowRes) % lowRes) * lowRes + ((ix + lowRes) % lowRes)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * lowRes;
      const fy = (y / size) * lowRes;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      // Smoothstep so the interpolation has zero derivative at the grid points
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const top = sample(ix, iy)     + (sample(ix + 1, iy)     - sample(ix, iy))     * sx;
      const bot = sample(ix, iy + 1) + (sample(ix + 1, iy + 1) - sample(ix, iy + 1)) * sx;
      const v = top + (bot - top) * sy;
      const c = Math.floor(v * 255);
      const idx = (y * size + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = c;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  cachedBump = new THREE.CanvasTexture(canvas);
  cachedBump.wrapS = cachedBump.wrapT = THREE.RepeatWrapping;
  return cachedBump;
}
