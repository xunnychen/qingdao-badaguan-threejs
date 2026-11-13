// Tileable FBM noise texture shared by the cloud layers and the fog wisps (RGBA8, repeat, mip-mapped, NoColorSpace).
//   R  cumulus base   (period 4, 5 octaves)
//   G  second field   (period 5, 5 octaves, other seed): breaks up the repeat of R and feeds the cirrus streaks
//   B  fine detail    (period 16, 3 octaves)
//   A  very low freq  (period 2, 3 octaves): large-scale coverage variation, so the sky has clear and busy regions
import * as THREE from 'three';

function lattice(rand, n) {
  const a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = rand();
  return a;
}

/** periodic value-noise FBM, returns Float32Array(size*size) normalised to 0..1 */
function tileFbm(rand, size, period, octaves, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, p = period;
  for (let o = 0; o < octaves && p <= size; o++, p *= 2, amp *= gain) {
    const lat = lattice(rand, p), cell = size / p;
    total += amp;
    for (let y = 0; y < size; y++) {
      const fy = y / cell, y0 = Math.floor(fy), ty = fy - y0, y1 = (y0 + 1) % p;
      const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
      for (let x = 0; x < size; x++) {
        const fx = x / cell, x0 = Math.floor(fx), tx = fx - x0, x1 = (x0 + 1) % p;
        const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
        const a = lat[y0 * p + x0], b = lat[y0 * p + x1], c = lat[y1 * p + x0], d = lat[y1 * p + x1];
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
  }
  // stretch to the full 0..1 range so thresholds behave the same whatever the seed
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) { const v = out[i] / total; out[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
  return out;
}

export function makeNoiseTexture(ctx, size = 256) {
  const rng = ctx.rng.makeRng('sky:noise');
  const rand = () => rng();
  const r = tileFbm(rand, size, 4, 5, 0.52);
  const g = tileFbm(rand, size, 5, 5, 0.5);
  const b = tileFbm(rand, size, 16, 3, 0.55);
  const a = tileFbm(rand, size, 2, 3, 0.45);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round(r[i] * 255);
    data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = Math.round(b[i] * 255);
    data[i * 4 + 3] = Math.round(a[i] * 255);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.name = 'sky-noise';
  tex.needsUpdate = true;
  return tex;
}
