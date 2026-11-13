// Textures private to the terrain package: the baked surface-control map, a weathered granite (reef) detail texture,
// a macro-variation noise and the far-field "wooded suburb" speckle. All canvas / typed-array generated.
import * as THREE from 'three';

export const RECT = { x0: -300, x1: 300, z0: -272, z1: 240 }; // near ground mesh + control map extent (metres)

/**
 * Surface control map (RGBA8, linear data):
 *   R  shore mask (1 = seaward of the coast-path strip: sand or rock)
 *   G  on the shore: beachness (1 sand, 0 rock) · inland: bare-earth amount (planting beds, under garden trees)
 *   B  mown lawn (parks, landmark lawns, the green behind the promenade); 0 = private garden ground
 *   A  gravel (park footpaths, villa drives)
 * Drawn with Canvas 2D in world metres (anti-aliased, ~0.3 m per texel) rather than queried per texel: ~50 ms.
 */
export function buildControlMap(ctx) {
  const { map: MAP, world, tex } = ctx;
  const size = ctx.quality.tier === 'low' ? 1024 : 2048;
  const W = size, H = size, sx = W / (RECT.x1 - RECT.x0), sz = H / (RECT.z1 - RECT.z0);
  const mk = () => {
    const { canvas, g } = tex.makeCanvas(W, H);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.setTransform(sx, 0, 0, sz, -RECT.x0 * sx, -RECT.z0 * sz);
    g.globalCompositeOperation = 'lighter';
    g.lineJoin = 'round'; g.lineCap = 'round';
    return { canvas, g };
  };
  const poly = (g, pts, close) => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (close) g.closePath(); };
  const px = size / 2048; // blur radii are authored for the 2048 map

  // ---- canvas A: R shore, G earth, B lawn ---------------------------------------------------------------------------
  const A = mk();
  {
    const g = A.g, back = MAP.coast.backline.filter((p) => p[0] > -420 && p[0] < 420);
    g.fillStyle = '#ff0000'; g.strokeStyle = '#ff0000';
    g.beginPath(); poly(g, back); g.lineTo(420, 420); g.lineTo(-420, 420); g.closePath(); g.fill();
    g.lineWidth = 5; g.beginPath(); poly(g, back); g.stroke();        // the flat coast-path strip is rock where it is not paved

    // lawn
    // (soft edges: the shader thresholds them with noise, so a lawn ends in a ragged line rather than a ruled one)
    g.fillStyle = '#0000ff'; g.strokeStyle = '#0000ff';
    g.filter = `blur(${(7 * px).toFixed(1)}px)`;
    g.beginPath(); for (const p of MAP.parks) poly(g, p.poly, true); g.fill();
    g.lineWidth = 24; g.beginPath(); poly(g, MAP.promenade.pts); g.stroke();
    // landmark grounds: the reserve rectangle of the plot, not a disc
    g.filter = `blur(${(9 * px).toFixed(1)}px)`;
    g.beginPath(); for (const l of MAP.landmarks) poly(g, world.rectCorners({ x: l.x, z: l.z, w: l.reserve, d: l.reserve, rot: l.rot }, -2.5), true); g.fill();

    // bare earth: planting beds along the inside of the garden walls, around the houses, under garden trees
    g.filter = `blur(${(3 * px).toFixed(1)}px)`;
    g.strokeStyle = 'rgba(0,255,0,0.85)'; g.fillStyle = 'rgba(0,255,0,0.7)';
    g.lineWidth = 3.2; g.beginPath(); for (const w of MAP.walls) poly(g, w.pts); g.stroke();
    g.filter = `blur(${(7 * px).toFixed(1)}px)`;
    g.strokeStyle = 'rgba(0,255,0,0.6)';
    g.lineWidth = 4.5; g.beginPath(); for (const l of MAP.lots) poly(g, world.rectCorners(l, 0.8), true); g.stroke();
    g.filter = `blur(${(6 * px).toFixed(1)}px)`;
    g.beginPath();
    for (const t of MAP.trees) if (!t.street && world.surfaceAt(t.x, t.z) === 'garden') { const r = Math.max(1.6, t.r * 0.6); g.moveTo(t.x + r, t.z); g.arc(t.x, t.z, r, 0, Math.PI * 2); }
    g.fill();
    g.filter = 'none';
  }

  // ---- canvas B: R gravel, G beachness ------------------------------------------------------------------------------
  const B = mk();
  {
    const g = B.g;
    g.filter = `blur(${(1.4 * px).toFixed(1)}px)`;
    g.strokeStyle = '#ff0000'; g.fillStyle = '#ff0000';
    for (const p of MAP.paths) if (p.kind === 'gravel') { g.lineWidth = p.width; g.beginPath(); poly(g, p.pts); g.stroke(); }
    // villa drives: gate -> front of the house, with a small forecourt
    g.lineWidth = 2.7; g.beginPath();
    for (const l of MAP.lots) {
      const gt = l.gate; if (!gt) continue;
      const fx = l.x + Math.sin(l.rot) * (l.d / 2 + 0.6), fz = l.z + Math.cos(l.rot) * (l.d / 2 + 0.6);
      const dx = fx - gt.x, dz = fz - gt.z, d = Math.hypot(dx, dz) || 1;
      g.moveTo(gt.x - (dx / d) * 0.5, gt.z - (dz / d) * 0.5); g.lineTo(fx, fz);
    }
    g.stroke();
    g.beginPath();
    for (const l of MAP.lots) {
      if (!l.gate) continue;
      // forecourt: a rectangle across the house front
      const sn = Math.sin(l.rot), cs = Math.cos(l.rot), hw = Math.min(l.w * 0.34, 3.6), d0 = l.d / 2 + 0.3, d1 = l.d / 2 + 3.1;
      poly(g, [[-hw, d0], [hw, d0], [hw, d1], [-hw, d1]].map(([a, b]) => [l.x + cs * a + sn * b, l.z - sn * a + cs * b]), true);
    }
    g.fill();
    g.filter = 'none';

    // beachness is smooth: evaluate exactly on a coarse grid and let the canvas upscale it
    const cw = 300, ch = 256, small = tex.makeCanvas(cw, ch), img = small.g.createImageData(cw, ch), info = {};
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = RECT.x0 + ((i + 0.5) / cw) * (RECT.x1 - RECT.x0), z = RECT.z0 + ((j + 0.5) / ch) * (RECT.z1 - RECT.z0);
      world.backInfo(x, z, info);
      const o = (j * cw + i) * 4;
      img.data[o] = 0; img.data[o + 1] = Math.round(world.beachness(info.x) * 255); img.data[o + 2] = 0; img.data[o + 3] = 255;
    }
    small.g.putImageData(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(small.canvas, 0, 0, W, H);
  }

  const a = A.g.getImageData(0, 0, W, H).data, b = B.g.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H * 4; i += 4) {
    const shore = a[i];
    out[i] = shore;
    out[i + 1] = shore > 127 ? b[i + 1] : Math.round(a[i + 1] * (1 - shore / 127));
    out[i + 2] = a[i + 2];
    out[i + 3] = b[i];
  }
  A.canvas.width = A.canvas.height = B.canvas.width = B.canvas.height = 1; // release the backing stores
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = Math.min(4, tex.maxAnisotropy || 1);
  t.needsUpdate = true;
  return t;
}

function pixelsToTexture(tex, size, fn, { srgb, mip = true } = {}) {
  const { canvas, g } = tex.makeCanvas(size);
  const img = g.createImageData(size, size), d = img.data, c = [0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x, y, c);
    const o = (y * size + x) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = tex.canvasTexture(canvas, { srgb, repeat: 1 });
  t.generateMipmaps = mip;
  return t;
}

/**
 * Neutral weathered granite: blotchy, crystalline speckle, and two near-orthogonal sets of fracture joints that cut it
 * into blocks (each block with its own tone and level). Tint in the shader. Returns {map, normalMap}.
 * The joint directions (3,1) and (-1,3) are integer vectors, so the pattern tiles; block id (i + 3j) mod 10 is
 * invariant under both tile translations.
 */
export function buildRockTextures(ctx) {
  // Weathered shore granite. Two warped joint sets, but each joint fades in and out along its length and varies in
  // width, so the surface never reads as laid flagstones; fine bedding lines follow one set, and a ridged mid-scale
  // noise gives the plates a craggy, broken top (most of the relief comes from the normal map).
  const { tex } = ctx, size = 512;
  const n1 = tex.tileFbm(size, 4, 5, 301), n2 = tex.tileNoise(size, 180, 302), n3 = tex.tileNoise(size, 64, 303);
  const w1 = tex.tileFbm(size, 3, 3, 304), w2 = tex.tileFbm(size, 3, 3, 305), gate = tex.tileFbm(size, 5, 2, 306);
  const rg = tex.tileFbm(size, 5, 3, 307), gate2 = tex.tileFbm(size, 4, 2, 308), bed = tex.tileFbm(size, 6, 3, 309);
  const Hh = new Float32Array(size * size), TEX = size / Math.sqrt(10); // texels between two main joints
  const hsh = (k) => { const v = Math.sin(k * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };
  const line = (d, w) => Math.max(0, 1 - d / w);
  const sat = (v) => Math.max(0, Math.min(1, v));
  const map = pixelsToTexture(tex, size, (x, y, c) => {
    const i = y * size + x;
    const u1 = (3 * x + y) / size + (w1[i] - 0.5) * 0.5, u2 = (-x + 3 * y) / size + (w2[i] - 0.5) * 0.5;
    const f1 = u1 - Math.floor(u1), f2 = u2 - Math.floor(u2);
    const d1 = Math.min(f1, 1 - f1) * TEX, d2 = Math.min(f2, 1 - f2) * TEX;        // texels to the nearest main joint
    const k1 = sat((gate[i] - 0.4) * 5), k2 = sat((gate2[i] - 0.46) * 5);          // joints come and go
    const g2 = Math.abs(f2 - 0.5) * TEX;
    const crev = Math.min(1, Math.max(k1 * line(d1, 1.6 + 3.2 * n3[i]), k2 * line(d2, 1.3 + 2.6 * n3[i]), (1 - k2) * 0.45 * line(g2, 1.4)));
    const halo = Math.max(k1 * line(d1, 16), k2 * line(d2, 13));
    // bedding: fine parallel partings along set 1, only in places
    const bq = u1 * 5 + (bed[i] - 0.5) * 1.6, fb = bq - Math.floor(bq);
    const strata = line(Math.min(fb, 1 - fb) * (TEX / 5), 1.3) * sat((bed[i] - 0.42) * 5) * 0.6;
    const ridge = 1 - Math.abs(2 * rg[i] - 1);                                     // craggy mid-scale relief
    const id = ((Math.floor(u1) + 3 * Math.floor(u2)) % 10 + 10) % 10;
    const kk = Math.min(k1, k2), tone = (hsh(id) - 0.5) * kk, lvl = (hsh(id + 23) - 0.5) * kk;
    Hh[i] = n1[i] * 0.55 + ridge * 0.2 + n3[i] * 0.2 + n2[i] * 0.1 + lvl * 0.22 - halo * halo * 0.05 - crev * 0.16 - strata * 0.2;
    const sp = (n2[i] > 0.7 ? (n2[i] - 0.7) * 0.7 : 0) + (n2[i] < 0.2 ? (n2[i] - 0.2) * 0.6 : 0);
    const v = 255 * (0.54 + (n1[i] - 0.5) * 0.55 + (ridge - 0.6) * 0.16 + (n3[i] - 0.5) * 0.18 + sp + tone * 0.1) * (1 - halo * 0.05) * (1 - crev * 0.2) * (1 - strata * 0.4); // joints only faint here: the ground shader cuts the blocks
    c[0] = c[1] = c[2] = Math.max(0, Math.min(255, v));
  }, { srgb: true });
  const normalMap = tex.canvasTexture(tex.normalFromHeight(Hh, size, 4.5), { srgb: false, repeat: 1 });
  return { map, normalMap };
}

/** Three independent low-frequency noises in RGB (linear data), tiling. */
export function buildMacroTexture(ctx) {
  const { tex } = ctx, size = 256;
  const a = tex.tileFbm(size, 4, 5, 311), b = tex.tileFbm(size, 5, 5, 312), d = tex.tileFbm(size, 6, 4, 313);
  const st = (v) => Math.max(0, Math.min(255, ((v - 0.5) * 1.9 + 0.5) * 255));
  return pixelsToTexture(tex, size, (x, y, c) => { const i = y * size + x; c[0] = st(a[i]); c[1] = st(b[i]); c[2] = st(d[i]); }, { srgb: false });
}

/**
 * Far field: a woodland canopy seen from above. Jittered round crowns (a tiling Worley pattern), each with its own
 * tone, dark gaps between them. Grey, linear data: the shader tints it with the live foliage colour and derives a
 * bump from it so the sun models the tree tops.
 */
export function buildSpeckleTexture(ctx) {
  const { tex } = ctx, size = 256, N = 9, cell = size / N, rand = ctx.rng.makeRng('terrain:far-canopy');
  const pts = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + rand.range(0.15, 0.85)) * cell, (j + rand.range(0.15, 0.85)) * cell, rand.range(0.62, 1), rand.range(0.7, 1.15)]);
  const fine = tex.tileNoise(size, 64, 324);
  const t = pixelsToTexture(tex, size, (x, y, c) => {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
    let best = 0, tone = 1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + N) % N, jj = (cj + dj + N) % N, p = pts[jj * N + ii];
      let dx = Math.abs(x - p[0]), dy = Math.abs(y - p[1]);
      if (dx > size / 2) dx = size - dx;
      if (dy > size / 2) dy = size - dy;
      const r = Math.hypot(dx, dy) / (cell * 0.78 * p[3]), h = r < 1 ? Math.sqrt(1 - r * r) * p[3] : 0;
      if (h > best) { best = h; tone = p[2]; }
    }
    const v = 255 * Math.min(1, (0.16 + 0.78 * Math.min(1, best) * tone) * (0.88 + 0.24 * fine[y * size + x]));
    c[0] = c[1] = c[2] = v;
  }, { srgb: false });
  return t;
}
