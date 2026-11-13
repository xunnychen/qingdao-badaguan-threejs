// Shared procedural textures (ctx.tex). Canvas-generated, tileable, cached. No image files anywhere in this project.
//
// CONVENTION: every texture returned by tex.get() has `repeat` pre-set so that ONE UV UNIT = ONE METRE.
// Build geometry with UVs in metres (see ctx.geo.applyMetricUV) and never touch .repeat / .offset on a shared texture
// (clone() it first if you need a different scale).
//
// tex.get(kind, opts) -> { map, normalMap, metres }       (normalMap may be null)
//   'granite'   rock-faced coursed ashlar (蘑菇石): plinths, quoins, piers, landmark walls.   2.4 m tile
//   'rubble'    random granite rubble with raised cement pointing: garden walls.            2.0 m tile
//   'pebble'    pebble-dash panel (花石楼's 鹅卵石 infill).                                 1.2 m tile
//   'rooftile'  Qingdao red clay tile rows. opts.color = base hex (default '#b5482e').      2.0 m tile (rows run along U, slope along V)
//   'stucco'    near-white 拉毛 render with rain streaks: tint with material.color.         2.0 m tile
//   'asphalt'   old asphalt with aggregate, patches and cracks.                             4.0 m tile
//   'paving'    flamed granite slabs 60 x 30 cm, staggered bond.                            2.4 m tile
//   'sand'      fine pale-gold sand with ripples.                                           3.0 m tile
//   'grass'     neutral lawn detail: tint with material.color.                              2.5 m tile
//   'bark'      neutral furrowed bark: tint with material.color.                            1.0 m tile
//   'wood'      neutral planks 15 cm wide running along U: tint with material.color.        1.2 m tile
//   'concrete'  neutral fine speckle: tint with material.color.                             2.0 m tile
// Helpers for packages that need their own textures (leaf atlases, signs...):
//   tex.makeCanvas(w, h) -> { canvas, g }      tex.canvasTexture(canvas, { srgb, metres, repeat })
//   tex.tileNoise(size, cells, seed) -> Float32Array(size*size) tileable value noise in [0,1]
//   tex.normalFromHeight(heightFloat32, size, strength) -> canvas
import * as THREE from 'three';
import { makeRng, hash2 } from './rng.js';

export function createTextures(renderer, quality) {
  const cache = new Map();
  const maxAniso = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy());

  function makeCanvas(w, h = w) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    return { canvas, g: canvas.getContext('2d', { willReadFrequently: true }) };
  }
  /** opts: srgb (true for albedo/emissive; false for normal/roughness/alpha data), metres (tile size) or repeat. */
  function canvasTexture(canvas, { srgb = true, metres = 0, repeat = 0, wrap = true } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const r = metres ? 1 / metres : repeat || 1;
    t.repeat.set(r, r);
    t.anisotropy = maxAniso;
    return t;
  }
  /** Tileable value noise: `cells` lattice cells across the tile (`cellsY` down it, for stretched grain). */
  function tileNoise(size, cells, seed = 0, cellsY = cells) {
    const out = new Float32Array(size * size);
    const lat = new Float32Array(cells * cellsY);
    for (let i = 0; i < cells * cellsY; i++) lat[i] = hash2(i % cells, (i / cells) | 0, seed);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cellsY, iy = Math.floor(fy), ty = fy - iy, uy = ty * ty * (3 - 2 * ty);
      const y0 = (iy % cellsY) * cells, y1 = ((iy + 1) % cellsY) * cells;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells, ix = Math.floor(fx), tx = fx - ix, ux = tx * tx * (3 - 2 * tx);
        const x0 = ix % cells, x1 = (ix + 1) % cells;
        const a = lat[y0 + x0], b = lat[y0 + x1], c = lat[y1 + x0], d = lat[y1 + x1];
        out[y * size + x] = a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
      }
    }
    return out;
  }
  function tileFbm(size, cells, octaves, seed) {
    const out = new Float32Array(size * size);
    let amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = tileNoise(size, cells << o, seed + o * 13);
      for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
      norm += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }
  function normalFromHeight(h, size, strength = 2) {
    const { canvas, g } = makeCanvas(size);
    const img = g.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const xl = (x + size - 1) % size, xr = (x + 1) % size, yu = (y + size - 1) % size, yd = (y + 1) % size;
      const dx = (h[y * size + xr] - h[y * size + xl]) * strength, dy = (h[yd * size + x] - h[yu * size + x]) * strength;
      const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
      d[o] = (-dx / l * 0.5 + 0.5) * 255; d[o + 1] = (dy / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return canvas;
  }
  const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b].map((v) => Math.pow(v, 1 / 2.2) * 255); }; // approx sRGB bytes
  const hexRGB = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  function fromPixels(size, fn) {
    const { canvas, g } = makeCanvas(size);
    const img = g.createImageData(size, size), d = img.data, c = [0, 0, 0];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      fn(x, y, c);
      const o = (y * size + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return canvas;
  }
  const pack = (colorCanvas, height, size, metres, strength) => ({
    map: canvasTexture(colorCanvas, { srgb: true, metres }),
    normalMap: height ? canvasTexture(normalFromHeight(height, size, strength), { srgb: false, metres }) : null,
    metres,
  });

  // ---- generators ---------------------------------------------------------------------------------------------------
  const GEN = {
    granite() {
      const size = quality.texSize, metres = 2.4, rows = 8, rand = makeRng('tex:granite');
      const pal = ['#B9B2A3', '#9C968A', '#857F74', '#C2A893', '#A9A294', '#B3A995', '#8E8779'].map(hexRGB);
      const rowH = size / rows;
      // per row: block boundaries (wrapping) + colours
      const rowsData = [];
      for (let r = 0; r < rows; r++) {
        const edges = [0]; let x = 0;
        while (x < size) { x += Math.round(size * rand.range(0.3, 0.68) / metres); if (size - x < size * 0.2 / metres) x = size; edges.push(Math.min(x, size)); }
        const shift = Math.floor(rand() * size);
        rowsData.push({ edges, shift, cols: edges.slice(1).map(() => { const c = rand.pick(pal), k = rand.range(0.93, 1.06), m = 0.45; // pull toward the mean so walls read as one stone
          return [(c[0] * (1 - m) + 166 * m) * k, (c[1] * (1 - m) + 159 * m) * k, (c[2] * (1 - m) + 146 * m) * k, rand.range(0.55, 1)]; }) });
      }
      const n1 = tileFbm(size, 6, 4, 11), n2 = tileNoise(size, 96, 12), n3 = tileNoise(size, 200, 14);
      const H = new Float32Array(size * size);
      const joint = hexRGB('#5E5A54'), bevel = size * 0.014;
      const canvas = fromPixels(size, (x, y, c) => {
        const r = Math.min(rows - 1, Math.floor(y / rowH)), R = rowsData[r];
        const xs = (x + R.shift) % size;
        let b = 0; while (R.edges[b + 1] <= xs) b++;
        const ex = Math.min(xs - R.edges[b], R.edges[b + 1] - xs), ey = Math.min(y - r * rowH, (r + 1) * rowH - y);
        const e = Math.min(1, Math.max(0, (Math.min(ex, ey) - 1.2) / bevel));
        const i = y * size + x, col = R.cols[b];
        const speck = (n3[i] - 0.5) * 34 + (n2[i] - 0.5) * 22, tone = 0.86 + n1[i] * 0.28;
        const dome = Math.min(1, Math.min(ex, ey) / (rowH * 0.45));
        H[i] = e * (0.35 + 0.65 * col[3] * (0.5 + 0.5 * dome) + (n1[i] - 0.5) * 0.9 + (n2[i] - 0.5) * 0.35);
        const lit = 0.72 + 0.28 * e;
        for (let k = 0; k < 3; k++) c[k] = joint[k] + (Math.min(255, col[k] * tone + speck) * lit - joint[k]) * Math.min(1, e * 1.6);
      });
      return pack(canvas, H, size, metres, 5.5);
    },

    _voronoi(name, size, metres, n, stretch, pal, mortarHex, mortarW, bump, seed) {
      const rand = makeRng(`tex:${name}`), palRGB = pal.map(hexRGB), mortar = hexRGB(mortarHex);
      const nx = n, ny = Math.round(n * stretch);
      const sx = new Float32Array(nx * ny), sy = new Float32Array(nx * ny), sc = [], sh = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        sx[j * nx + i] = (i + 0.15 + rand() * 0.7) / nx; sy[j * nx + i] = (j + 0.15 + rand() * 0.7) / ny;
        const c = rand.pick(palRGB), k = rand.range(0.86, 1.1); sc.push([c[0] * k, c[1] * k, c[2] * k]); sh[j * nx + i] = rand.range(0.6, 1);
      }
      const n1 = tileFbm(size, 8, 3, seed), n2 = tileNoise(size, 180, seed + 5);
      const H = new Float32Array(size * size);
      const canvas = fromPixels(size, (x, y, c) => {
        const u = x / size, v = y / size, ci = Math.floor(u * nx), cj = Math.floor(v * ny);
        let d1 = 9, d2 = 9, id = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = (ci + di + nx) % nx, jj = (cj + dj + ny) % ny, k = jj * nx + ii;
          let ddx = Math.abs(u - sx[k]); if (ddx > 0.5) ddx = 1 - ddx;
          let ddy = Math.abs(v - sy[k]); if (ddy > 0.5) ddy = 1 - ddy;
          const d = Math.hypot(ddx * nx, ddy * ny);
          if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
        }
        const i = y * size + x;
        const m = Math.min(1, Math.max(0, (d2 - d1 - mortarW) / 0.16));
        const col = sc[id], tone = 0.88 + n1[i] * 0.24, speck = (n2[i] - 0.5) * 26;
        H[i] = bump > 0 ? m * (0.4 + sh[id] * 0.6 * (1 - d1 * 0.6)) + (n1[i] - 0.5) * 0.3 * m + (1 - m) * 0.42 : m * (1 - d1 * 0.8) * sh[id];
        for (let k = 0; k < 3; k++) c[k] = mortar[k] + (Math.min(255, col[k] * tone + speck) * (0.8 + 0.2 * m) - mortar[k]) * m;
      });
      return pack(canvas, H, size, metres, 5);
    },
    rubble() {
      return GEN._voronoi('rubble', 512, 2.0, 6, 1.5, ['#9C968A', '#857F74', '#B3A995', '#A69F91', '#8C857A', '#B9B2A3', '#C2A893'], '#77736c', 0.085, 1, 21);
    },
    pebble() {
      return GEN._voronoi('pebble', 512, 1.2, 20, 1.0, ['#A89C86', '#6E6A62', '#C9B48C', '#8A5F4A', '#9C9485', '#B9B2A3', '#7A7469'], '#6a655c', 0.1, 0, 31);
    },

    rooftile(opts) {
      const size = quality.texSize, metres = 2.0, cols = 8, rows = 6;
      const base = new THREE.Color(opts.color || '#b5482e'), hsl = {}; base.getHSL(hsl, THREE.SRGBColorSpace);
      const rand = makeRng(`tex:roof:${opts.color || ''}`), tiles = [];
      for (let i = 0; i < cols * rows; i++) {
        const dull = rand.chance(0.08), c = new THREE.Color().setHSL(
          (hsl.h + rand.range(-0.014, 0.018) + 1) % 1, Math.max(0, hsl.s * (dull ? 0.55 : rand.range(0.85, 1.1))), Math.min(1, hsl.l * (dull ? 0.82 : rand.range(0.8, 1.16))), THREE.SRGBColorSpace);
        tiles.push(hexRGB('#' + c.getHexString(THREE.SRGBColorSpace)));
      }
      const n1 = tileFbm(size, 5, 4, 41), n2 = tileNoise(size, 150, 42), streak = tileNoise(size, 40, 43);
      const H = new Float32Array(size * size);
      const canvas = fromPixels(size, (x, y, c) => {
        const v = (y / size) * rows, r = Math.floor(v), fy = v - r;         // fy: 0 = upper edge (under the tile above), 1 = lower drip edge
        const u = (x / size) * cols + (r % 2) * 0.5, ci = Math.floor(u) % cols, fx = u - Math.floor(u);
        const t = tiles[r * cols + ci], i = y * size + x;
        const side = Math.min(fx, 1 - fx);                                  // distance to the tile's side joints
        const tongue = 1 - 0.1 * (1 - Math.pow(Math.abs(fx * 2 - 1), 2.2)); // rounded 牛舌瓦 lower edge
        const under = fy < 0.1 ? 0.55 + fy * 4.5 : 1;                        // contact shadow below the overlapping tile
        const edge = fy > tongue ? 0.5 : 1;
        const groove = side < 0.035 ? 0.62 : 1;
        const moss = Math.max(0, streak[(y * size + ((x * 3) % size)) | 0] - 0.62) * 1.6 * n1[i];
        const tone = (0.84 + n1[i] * 0.3 + (n2[i] - 0.5) * 0.12) * under * edge * groove * (0.9 + 0.14 * fy);
        H[i] = (fy > tongue ? 0 : 0.25 + fy * 0.75) * (side < 0.035 ? 0.5 : 1) + Math.sin(fx * Math.PI) * 0.12;
        c[0] = Math.min(255, t[0] * tone * (1 - moss * 0.5)); c[1] = Math.min(255, t[1] * tone * (1 - moss * 0.25)); c[2] = Math.min(255, t[2] * tone * (1 - moss * 0.45));
      });
      return pack(canvas, H, size, metres, 4.5);
    },

    stucco() {
      const size = 512, metres = 2.0;
      const n1 = tileFbm(size, 4, 4, 51), n2 = tileNoise(size, 128, 52), n3 = tileNoise(size, 256, 53), st = tileNoise(size, 48, 54);
      const H = new Float32Array(size * size);
      const canvas = fromPixels(size, (x, y, c) => {
        const i = y * size + x;
        const streak = Math.max(0, st[((y >> 3) * size + x) % (size * size)] - 0.6) * 0.16; // vertical rain streaks
        const v = 238 * (0.9 + n1[i] * 0.12) + (n2[i] - 0.5) * 16 + (n3[i] - 0.5) * 10 - streak * 255;
        H[i] = n2[i] * 0.6 + n3[i] * 0.4;
        c[0] = v; c[1] = v * 0.995; c[2] = v * 0.98;
      });
      return pack(canvas, H, size, metres, 1.6);
    },

    asphalt() {
      // Fine aggregate only: nothing in the 4 m tile is large or contrasty enough to read as a repeat (the terrain
      // package adds the large-scale variation in world space). Cracks are a few OPEN, branching hairlines.
      const size = 512, metres = 4.0, rand = makeRng('tex:asphalt');
      const n1 = tileFbm(size, 8, 3, 61), n2 = tileNoise(size, 256, 62), n3 = tileNoise(size, 170, 63);
      const a = hexRGB('#4c4e50'), b = hexRGB('#5b5d5f');   // old sun-bleached asphalt: a warm mid grey, not blue-black in shade
      const crackM = new Float32Array(size * size);
      const walk = (x, y, dir, len, depth) => {
        for (let k = 0; k < len; k++) {
          dir += rand.range(-0.38, 0.38);
          if (rand.chance(0.035)) dir += rand.range(-1.1, 1.1);
          x += Math.cos(dir) * 1.0; y += Math.sin(dir) * 1.0;
          const fade = Math.min(1, k / 6, (len - k) / 10);
          const xi = ((Math.round(x) % size) + size) % size, yi = ((Math.round(y) % size) + size) % size;
          crackM[yi * size + xi] = Math.max(crackM[yi * size + xi], fade);
          const xj = (xi + 1) % size;
          crackM[yi * size + xj] = Math.max(crackM[yi * size + xj], fade * 0.45);
          if (depth < 2 && rand.chance(0.012)) walk(x, y, dir + rand.sign() * rand.range(0.6, 1.3), rand.int(18, 60), depth + 1);
        }
      };
      for (let k = 0; k < 6; k++) walk(rand.range(0, size), rand.range(0, size), rand.range(0, Math.PI * 2), rand.int(50, 150), 0);
      const H = new Float32Array(size * size);
      const canvas = fromPixels(size, (x, y, c) => {
        const i = y * size + x;
        const patch = Math.min(1, Math.max(0, (n1[i] - 0.5) * 2.5));
        const agg = n2[i] > 0.8 ? (n2[i] - 0.8) * 230 : 0;
        const crack = 1 - crackM[i] * 0.42;
        H[i] = n2[i] * 0.7 + n3[i] * 0.3 - crackM[i] * 0.7;
        for (let k = 0; k < 3; k++) c[k] = ((a[k] + (b[k] - a[k]) * patch) * (0.9 + n3[i] * 0.2) + agg) * crack;
      });
      return pack(canvas, H, size, metres, 1.4);
    },

    paving() {
      const size = 512, metres = 2.4, cols = 4, rows = 8, rand = makeRng('tex:paving');
      const pal = ['#9A968E', '#B0AAA0', '#A39E95', '#8F8B84', '#AAA59B'].map(hexRGB);
      const slab = []; for (let i = 0; i < cols * rows; i++) { const c = rand.pick(pal), k = rand.range(0.93, 1.06); slab.push([c[0] * k, c[1] * k, c[2] * k]); }
      const n1 = tileFbm(size, 6, 3, 71), n2 = tileNoise(size, 220, 72);
      const H = new Float32Array(size * size), sw = size / cols, sh = size / rows;
      const canvas = fromPixels(size, (x, y, c) => {
        const r = Math.floor(y / sh), xs = (x + (r % 2) * sw * 0.5) % size, ci = Math.floor(xs / sw);
        const e = Math.min(xs - ci * sw, (ci + 1) * sw - xs, y - r * sh, (r + 1) * sh - y);
        const m = Math.min(1, Math.max(0, (e - 0.8) / 2.2)), i = y * size + x, col = slab[r * cols + ci];
        H[i] = m * 0.8 + (n2[i] - 0.5) * 0.25;
        const tone = 0.9 + n1[i] * 0.18;
        for (let k = 0; k < 3; k++) c[k] = (col[k] * tone + (n2[i] - 0.5) * 20) * (0.5 + 0.5 * m);
      });
      return pack(canvas, H, size, metres, 2.2);
    },

    sand() {
      const size = 512, metres = 3.0;
      const n1 = tileFbm(size, 4, 4, 81), n2 = tileNoise(size, 256, 82), warp = tileFbm(size, 3, 2, 83);
      const base = hexRGB('#dcc898');
      const H = new Float32Array(size * size);
      const canvas = fromPixels(size, (x, y, c) => {
        const i = y * size + x;
        const ripple = Math.sin((y / size) * Math.PI * 2 * 14 + warp[i] * 9) * 0.5 + 0.5;
        H[i] = ripple * 0.55 + n2[i] * 0.25 + n1[i] * 0.3;
        const tone = 0.93 + n1[i] * 0.1 + (ripple - 0.5) * 0.035, sp = (n2[i] - 0.5) * 18;
        for (let k = 0; k < 3; k++) c[k] = Math.min(255, base[k] * tone + sp);
      });
      return pack(canvas, H, size, metres, 1.3);
    },

    grass() {
      const size = 512, metres = 2.5;
      const n1 = tileFbm(size, 5, 4, 91), n2 = tileNoise(size, 256, 92), n3 = tileNoise(size, 128, 93);
      const H = new Float32Array(size * size);
      const canvas = fromPixels(size, (x, y, c) => {
        const i = y * size + x;
        const v = 200 * (0.78 + n1[i] * 0.3) + (n2[i] - 0.5) * 46 + (n3[i] - 0.5) * 24;
        H[i] = n2[i] * 0.7 + n3[i] * 0.3;
        const warm = (n1[i] - 0.5) * 22;
        c[0] = Math.min(255, v + warm); c[1] = Math.min(255, v + 6); c[2] = Math.min(255, v - warm - 4);
      });
      return pack(canvas, H, size, metres, 1.8);
    },

    bark() {
      const size = 256, metres = 1.0;
      // furrows stretched 6.5x along V (up the trunk): an anisotropic lattice, so the tile still wraps in V
      const n1 = tileFbm(size, 4, 3, 101), fur = tileNoise(size, 26, 102, 4), n2 = tileNoise(size, 128, 103);
      const H = new Float32Array(size * size);
      const canvas = fromPixels(size, (x, y, c) => {
        const i = y * size + x;
        const f = fur[i];
        const ridge = Math.abs(f - 0.5) * 2;
        H[i] = ridge * 0.8 + n2[i] * 0.2;
        const v = 255 * (0.55 + ridge * 0.35 + (n1[i] - 0.5) * 0.2 + (n2[i] - 0.5) * 0.1);
        c[0] = c[1] = c[2] = Math.max(0, Math.min(255, v));
      });
      return pack(canvas, H, size, metres, 3.5);
    },

    wood() {
      const size = 512, metres = 1.2, planks = 8, rand = makeRng('tex:wood');
      const tone = []; for (let i = 0; i < planks; i++) tone.push(rand.range(0.82, 1.04));
      const n1 = tileNoise(size, 8, 111), g1 = tileNoise(size, 180, 112), n2 = tileNoise(size, 256, 113);
      const H = new Float32Array(size * size), ph = size / planks;
      const canvas = fromPixels(size, (x, y, c) => {
        const p = Math.floor(y / ph), e = Math.min(y - p * ph, (p + 1) * ph - y), i = y * size + x;
        const grain = g1[((y * 1) % size) * size + ((x >> 3) % size)];       // grain stretched along U
        const gap = e < 1.6 ? 0.35 : 1;
        H[i] = (e < 1.6 ? 0 : 0.7) + grain * 0.3;
        const v = 232 * tone[p] * (0.86 + grain * 0.2 + (n1[i] - 0.5) * 0.12) * gap + (n2[i] - 0.5) * 10;
        c[0] = Math.min(255, v); c[1] = Math.min(255, v * 0.97); c[2] = Math.min(255, v * 0.92);
      });
      return pack(canvas, H, size, metres, 2.5);
    },

    concrete() {
      const size = 256, metres = 2.0;
      const n1 = tileFbm(size, 4, 4, 121), n2 = tileNoise(size, 128, 122);
      const H = new Float32Array(size * size);
      const canvas = fromPixels(size, (x, y, c) => {
        const i = y * size + x; H[i] = n2[i];
        c[0] = c[1] = c[2] = Math.min(255, 228 * (0.88 + n1[i] * 0.16) + (n2[i] - 0.5) * 22);
      });
      return pack(canvas, H, size, metres, 1.2);
    },
  };

  function get(kind, opts = {}) {
    if (!GEN[kind] || kind.startsWith('_')) throw new Error(`[tex] unknown texture kind "${kind}"`);
    const key = kind + ':' + JSON.stringify(opts);
    if (!cache.has(key)) cache.set(key, GEN[kind](opts));
    return cache.get(key);
  }
  return { get, makeCanvas, canvasTexture, tileNoise, tileFbm, normalFromHeight, kinds: Object.keys(GEN).filter((k) => !k.startsWith('_')), maxAnisotropy: maxAniso, _rgb: rgb };
}
