// Deterministic random + noise utilities. Pure JS (no three.js, no DOM) so it also runs under Node.
// RULE: never call Math.random() anywhere in this project. Every module derives its randomness from a
// string seed via makeRng('module:purpose') so the world is identical on every load and in every screenshot.

/** xmur3 string hash -> uint32 */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG: returns () => float in [0,1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * makeRng(seed) -> rand() in [0,1) with helpers:
 *   rand.range(a,b)  float in [a,b)
 *   rand.int(a,b)    integer in [a,b] inclusive
 *   rand.pick(arr)   random element
 *   rand.chance(p)   boolean
 *   rand.gauss()     ~N(0,1)
 *   rand.sign()      -1 | 1
 *   rand.weighted({a:1,b:3}) key by weight
 */
export function makeRng(seed) {
  const s = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  const r = mulberry32(s);
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  r.weighted = (table) => {
    const keys = Object.keys(table);
    let total = 0;
    for (const k of keys) total += table[k];
    let t = r() * total;
    for (const k of keys) { t -= table[k]; if (t <= 0) return k; }
    return keys[keys.length - 1];
  };
  return r;
}

/** Stateless hash of integer lattice coords -> [0,1) */
export function hash2(ix, iz, seed = 0) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0,1]; period-free. */
export function valueNoise2(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Fractal value noise in [0,1]. */
export function fbm2(x, z, octaves = 4, seed = 0) {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * f, z * f, seed + i * 17);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
