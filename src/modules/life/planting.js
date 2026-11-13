// Hedges on the garden walls, creeper spilling over wall runs, garden shrubs, flower beds and hydrangeas.
// Everything is static geometry merged per 150 m cell and drawn with ONE material: a per-vertex "kind" picks the live
// palette colour (hedge / ivy / shrub) or one of the live seasonal tints (flower beds, blossoming shrubs, hydrangea
// heads change colour with the preset instead of carrying one copy of their geometry per season).
// Each chunk's vertex buffer is ordered [hedges | shrubs | creeper | blooms]: the shadow pass draws only hedges + shrubs
// (onBeforeShadow narrows the draw range), blooms are drawn only in the chunks near the camera and the far chunks keep
// just their hedges.
import * as THREE from 'three';

const CELL = 150;
const SEASON = { always: 0, autumn: 1, fog: 2, dusk: 3, spring: 4 };
const K_HEDGE = 0, K_IVY = 1, K_SHRUB = 2, K_TINT = 4;
const T_FLOWER = 0, T_BLOSSOM = 6, T_HYDRANGEA = 12, TINTS = 16;
const FLOWERS = {
  autumn: ['#f0b81c', '#e07a1c', '#f4ead0', '#b8457a', '#d9a21e', '#c9462e'],
  fog: ['#8FA6C8', '#C9A6C4', '#f4f1ea', '#a9b6dc'],
  dusk: ['#d9455a', '#f08a3c', '#f2d24a', '#c44f9a', '#f4f1ea'],
  spring: ['#e8455e', '#f4c430', '#f2a0b8', '#ffffff', '#d6478a', '#f06a2a'],
};
// shrubs that flower: [spring colour, autumn colour] (null = plain leaf colour in that season)
const BLOSSOM = [['#d6478a', null], ['#f2a0b8', null], ['#f4c430', null], ['#e8455e', '#b5432a'], [null, '#b5432a'], [null, '#c9662e']];
// hydrangea heads: blue / mauve in the June fog and the summer dusk, dried in autumn, green buds in April
const HYDRANGEA = { fog: ['#8FA6C8', '#C9A6C4', '#f4f1ea', '#a9b6dc'], dusk: ['#8f9fd0', '#cf9ac0', '#f1e6e2', '#b0a8dc'], autumn: ['#a8907c', '#b39484', '#b8a890', '#9a8c7c'] };
const PRESETS = ['autumn', 'fog', 'dusk', 'spring'];

export function createPlanting(ctx, S) {
  const { map: MAP, world, rng } = ctx;
  const { fbm2, hash2 } = rng;
  const hAt = world.heightAt;

  // ---- chunked vertex writer ---------------------------------------------------------------------------------------------
  const chunks = new Map();
  const chunkAt = (x, z) => {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = [0, 1, 2, 3].map(() => ({ pos: [], nor: [], uv: [], col: [], ap: [] }))));
    return c;
  };
  const HEDGE = 0, MOUND = 1, CREEP = 2, BLOOM = 3;
  let B = null, KIND = 0, SEA = 0, HASH = 0.5;
  // a vertex record: [x,y,z, nx,ny,nz, u,v, r,g,b, flex]
  const put = (p) => { B.pos.push(p[0], p[1], p[2]); B.nor.push(p[3], p[4], p[5]); B.uv.push(p[6], p[7]); B.col.push(p[8], p[9], p[10]); B.ap.push(KIND, SEA, HASH, p[11] || 0); };
  const tri = (a, b, c) => { put(a); put(b); put(c); };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };

  // ---- helpers -----------------------------------------------------------------------------------------------------------
  /** resample a polyline at about `step` metres keeping every corner: [{x,z,s,tx,tz}] */
  function resample(pts, step) {
    const out = [];
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az, l = Math.hypot(dx, dz);
      if (l < 1e-4) continue;
      const n = Math.max(1, Math.round(l / step));
      for (let k = 0; k < n; k++) out.push({ x: ax + (dx * k) / n, z: az + (dz * k) / n, s: s + (l * k) / n });
      s += l;
    }
    const e = pts[pts.length - 1];
    out.push({ x: e[0], z: e[1], s });
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      out[i].tx = (b.x - a.x) / l; out[i].tz = (b.z - a.z) / l;
    }
    return out;
  }
  const gatePiers = [];
  for (const g of MAP.gates) for (const sg of [-1, 1]) gatePiers.push({ x: g.x + g.tx * (g.width / 2 + 0.3) * sg, z: g.z + g.tz * (g.width / 2 + 0.3) * sg, street: g.street, side: g.side });
  /** the streetscape package stitches wall ends to the gate piers: do the same so the hedge reaches the pier */
  function stitched(w) {
    const pts = w.pts.map((p) => [p[0], p[1]]);
    for (const e of [0, 1]) {
      const a = e ? pts[pts.length - 1] : pts[0], b = e ? pts[pts.length - 2] : pts[1];
      const dx = a[0] - b[0], dz = a[1] - b[1], l = Math.hypot(dx, dz) || 1;
      let best = null, bd = 2.3;
      for (const q of gatePiers) {
        if (q.street !== w.street || q.side !== w.side) continue;
        const vx = q.x - a[0], vz = q.z - a[1], d = Math.hypot(vx, vz);
        if (d < bd && d > 0.5 && (vx * dx + vz * dz) / (d * l) > 0.8) { bd = d; best = q; }
      }
      if (best) {
        const k = (bd - 0.34) / bd, p = [a[0] + (best.x - a[0]) * k, a[1] + (best.z - a[1]) * k];
        if (e) pts.push(p); else pts.unshift(p);
      }
    }
    return pts;
  }

  // ---- 1. hedges ---------------------------------------------------------------------------------------------------------
  // cross-section: lateral offset factor, height factor, normal (lateral, up), ambient shade
  const HP = [[-1, 0, -1, 0, 0.5], [-1.06, 0.5, -1, 0.2, 0.8], [-0.8, 0.92, -0.6, 0.8, 0.97], [0, 1.03, 0, 1, 1.06], [0.8, 0.92, 0.6, 0.8, 0.97], [1.06, 0.5, 1, 0.2, 0.8], [1, 0, 1, 0, 0.5]];
  let hedgeLen = 0;
  function hedge(w) {
    const st = resample(stitched(w), 1.8);
    if (st.length < 2) return;
    const rand = rng.makeRng(`life:hedge:${w.id}`);
    const tone = 0.86 + 0.24 * rand(), warm = 0.94 + 0.1 * rand(), seed = Math.floor(rand() * 900);
    const mid = st[st.length >> 1];
    B = chunkAt(mid.x, mid.z)[HEDGE]; KIND = K_HEDGE; SEA = 0; HASH = 0;
    let prev = null;
    for (let i = 0; i < st.length; i++) {
      const p = st[i], nx = p.tz, nz = -p.tx;
      const base = hAt(p.x, p.z) + w.h - 0.035;
      const end = Math.min(i, st.length - 1 - i);
      const hh = (0.68 + 0.16 * (fbm2(p.x * 0.33, p.z * 0.33, 2, seed) - 0.5) + 0.05 * (hash2(i, seed, 3) - 0.5)) * (end === 0 ? 0.86 : 1);
      const hw = (0.26 + 0.07 * (fbm2(p.x * 0.5 + 9, p.z * 0.5, 2, seed + 5) - 0.5)) * (end === 0 ? 0.85 : 1);
      const patch = 0.82 + 0.36 * fbm2(p.x * 0.7, p.z * 0.7, 2, seed + 11);
      const ring = [];
      let vlen = 0;
      for (let k = 0; k < HP.length; k++) {
        const q = HP[k];
        if (k) vlen += Math.hypot((q[0] - HP[k - 1][0]) * hw, (q[1] - HP[k - 1][1]) * hh);
        const l = Math.hypot(q[2], q[3]) || 1, c = q[4] * tone * patch;
        ring.push([p.x + nx * q[0] * hw, base + q[1] * hh, p.z + nz * q[0] * hw, (nx * q[2]) / l, q[3] / l, (nz * q[2]) / l, p.s, vlen, c * warm, c, c * 0.96, q[1] * 0.35]);
      }
      if (prev) for (let k = 0; k < HP.length - 1; k++) quad(prev[k], ring[k], ring[k + 1], prev[k + 1]);
      if (i === 0 || i === st.length - 1) {
        const sg = i === 0 ? -1 : 1, c = 0.8 * tone;
        const cen = [p.x + p.tx * sg * 0.08, base + hh * 0.5, p.z + p.tz * sg * 0.08, p.tx * sg, 0.15, p.tz * sg, p.s, hh * 0.5, c, c, c, 0.1];
        for (let k = 0; k < HP.length - 1; k++) { const a = ring[k].slice(), b = ring[k + 1].slice(); a[3] = b[3] = p.tx * sg; a[5] = b[5] = p.tz * sg; a[4] = b[4] = 0.2; tri(cen, a, b); }
      }
      prev = ring;
    }
    hedgeLen += st[st.length - 1].s;
  }

  // ---- 2. creeper (爬山虎) over wall runs ----------------------------------------------------------------------------------
  function creeper(w, rand) {
    const st = resample(w.pts, 0.7), L = st[st.length - 1].s;
    if (L < 6) return;
    const n = 1 + Math.floor(rand() * Math.min(3, L / 14));
    const face = -w.side;
    for (let c = 0; c < n; c++) {
      const span = Math.min(L - 1.5, 2.6 + rand() * 5.5), s0 = 0.7 + rand() * (L - span - 1.4);
      const dropMax = Math.max(0.2, Math.min(w.h - 0.1, w.h * (0.55 + 0.4 * rand())));
      const tone = 0.8 + 0.3 * rand(), u0 = rand() * 4, both = rand() < 0.55;
      let prev = null;
      for (let i = 0; i < st.length; i++) {
        const p = st[i];
        if (p.s < s0 || p.s > s0 + span) { prev = null; continue; }
        if (!prev) { B = chunkAt(p.x, p.z)[CREEP]; KIND = K_IVY; SEA = 0; HASH = 0; }
        const f = (p.s - s0) / span, e = Math.pow(Math.max(0, Math.sin(Math.PI * f)), 0.55) * (0.75 + 0.25 * fbm2(p.s * 0.9, c * 7.3, 2, 31));
        const nx = p.tz * face, nz = -p.tx * face, g = hAt(p.x, p.z), u = u0 + p.s / 1.5;
        const t2 = tone * (0.85 + 0.3 * hash2(i, c, 41));
        const mk = (o, y, v, ny, nl, k, flex) => [p.x + nx * o, g + y, p.z + nz * o, nx * nl, ny, nz * nl, u, v, t2 * k, t2 * k, t2 * k, flex];
        const ring = [
          mk(0.325, w.h + 0.02 - dropMax * e, 0.0, 0.1, 1, 0.92, 0.5),
          mk(0.33, w.h + 0.03, 0.6, 0.3, 1, 1.0, 0.15),
          mk(0.14, w.h + 0.03 + 0.11 * e, 0.8, 1, 0.2, 1.06, 0.1),
          mk(-0.14, w.h + 0.03 + 0.11 * e, 0.97, 1, -0.2, 1.06, 0.1),
          mk(-0.33, w.h - (both ? 0.45 : 0.2) * e, 0.42, 0.3, -1, 0.85, 0.3),
        ];
        if (prev) for (let k = 0; k < 4; k++) quad(prev[k], ring[k], ring[k + 1], prev[k + 1]);
        prev = ring;
      }
    }
  }

  // ---- 3. shrubs, flower beds, hydrangeas ---------------------------------------------------------------------------------
  const RINGS = [0, 0.56, 1.12, 1.68];
  /** a lumpy leaf dome. tone = [r,g,b] multiplier. */
  function dome(cx, cy, cz, rx, ry, rz, tone, seed, segs = 8, rings = RINGS, flex = 0.3, lump = 0.12) {
    const rows = [];
    for (let j = 0; j < rings.length; j++) {
      const ph = rings[j], row = [];
      for (let i = 0; i <= segs; i++) {
        const ii = i % segs, th = (ii / segs) * Math.PI * 2 + seed * 1.7;
        const k = j === 0 ? 1 + lump * 0.5 * (hash2(0, seed, 77) - 0.5) : 1 + lump * (hash2(ii + j * 13, seed, 77) - 0.5) * 2;
        const dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
        const sh = 0.5 + 0.56 * Math.min(1, Math.max(0, dy * 0.8 + 0.35)) + 0.12 * (hash2(ii * 3 + j, seed, 5) - 0.5);
        const nl = Math.hypot(dx / rx, dy / ry, dz / rz) || 1;
        row.push([cx + dx * rx * k, cy + dy * ry * k, cz + dz * rz * k, dx / rx / nl, dy / ry / nl, dz / rz / nl,
          (i / segs) * Math.PI * 2 * rx + seed, ph * ry + seed * 0.37, tone[0] * sh, tone[1] * sh, tone[2] * sh, flex * Math.max(0, dy)]);
      }
      rows.push(row);
    }
    for (let i = 0; i < segs; i++) tri(rows[0][i], rows[1][i + 1], rows[1][i]);
    for (let j = 1; j < rings.length - 1; j++) for (let i = 0; i < segs; i++) quad(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
  }
  const HEAD_RINGS = [0, 0.9, 1.75];
  function shrubTone(rand) { const v = 0.82 + 0.34 * rand(); return [v * (0.92 + 0.14 * rand()), v, v * (0.86 + 0.16 * rand())]; }

  const BED_RINGS = [0, 0.62, 1.2, 1.62];
  function mound(x, z, r, rand, opts = {}) {
    const seed = rand() * 100, n = opts.single ? 1 : 1 + Math.floor(rand() * 1.75);
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.283, d = i ? r * (0.5 + 0.3 * rand()) : 0, rr = r * (i ? 0.62 + 0.25 * rand() : 1);
      const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d, squash = opts.squash ?? 0.72 + 0.25 * rand();
      blobs.push([bx, hAt(bx, bz) - 0.03 + rr * squash * 0.12, bz, rr, rr * squash]);
    }
    B = chunkAt(x, z)[MOUND];
    KIND = K_SHRUB; SEA = 0; HASH = 0;
    const tone = shrubTone(rand);
    // a seasonal skin: azalea / forsythia in April, burning bush in November (a live tint, no extra geometry)
    if (opts.blossom) { KIND = K_TINT; HASH = (T_BLOSSOM + Math.floor(rand() * BLOSSOM.length)) / 32; }
    for (const b of blobs) dome(b[0], b[1], b[2], b[3], b[4], b[3], tone, seed + b[0], opts.segs ?? 6, opts.rings ?? RINGS, 0.3, opts.lump ?? 0.13);
    return blobs;
  }
  /** point + outward normal on the upper part of a blob */
  const _s = [0, 0, 0, 0, 0, 0];
  function onBlob(b, th, ph, k = 0.97) {
    const dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
    const nl = Math.hypot(dx / b[3], dy / b[4], dz / b[3]) || 1;
    _s[0] = b[0] + dx * b[3] * k; _s[1] = b[1] + dy * b[4] * k; _s[2] = b[2] + dz * b[3] * k;
    _s[3] = dx / b[3] / nl; _s[4] = dy / b[4] / nl; _s[5] = dz / b[3] / nl;
    return _s;
  }
  /** mophead hydrangea flowers: small lumpy domes all over the bush */
  function hydrangeaHeads(blobs, rand, count, size) {
    B = chunkAt(blobs[0][0], blobs[0][2])[BLOOM];
    KIND = K_TINT; SEA = 0;
    const main = Math.floor(rand() * 2), mixed = rand() < 0.5;
    for (let i = 0; i < count; i++) {
      const b = blobs[i % blobs.length], q = onBlob(b, (i * 2.4 + rand() * 1.3) % 6.283, 0.12 + 1.1 * Math.sqrt((i % 7 + rand()) / 7), 0.9);
      const r = size * (0.85 + 0.3 * rand()), k = 0.92 + 0.22 * rand();
      const pick = rand(), idx = pick < 0.12 ? 2 : mixed ? (pick < 0.56 ? 0 : pick < 0.86 ? 1 : 3) : (pick < 0.75 ? main : 3);
      HASH = (T_HYDRANGEA + idx) / 32;
      dome(q[0] + q[3] * r * 0.25, q[1] + q[4] * r * 0.25, q[2] + q[5] * r * 0.25, r, r * 0.82, r, [k, k, k], rand() * 50, 4, HEAD_RINGS, 0.3, 0.12);
    }
  }
  /** bedding flowers: flat little rosettes facing out of the cushion, massed in two colours */
  function rosettes(blobs, rand, count, size) {
    B = chunkAt(blobs[0][0], blobs[0][2])[BLOOM];
    KIND = K_TINT; SEA = 0;
    const a = Math.floor(rand() * 6), split = rand() * 6.283, share = 1.6 + rand() * 3;
    for (let i = 0; i < count; i++) {
      const b = blobs[i % blobs.length], th = (i * 2.399 + rand() * 0.9) % 6.283;
      const q = onBlob(b, th, 0.1 + 1.12 * Math.sqrt(((i * 5) % count + rand()) / count), 1.01);
      const px = q[0], py = q[1], pz = q[2], nx = q[3], ny = q[4], nz = q[5];
      const r = size * (0.8 + 0.5 * rand()), k = 0.88 + 0.26 * rand();
      const odd = rand() < 0.08, second = ((th - split + 6.283) % 6.283) < share;
      HASH = (T_FLOWER + (a + (odd ? 3 : second ? 1 : 0)) % 6) / 32;
      // tangent frame on the cushion
      let tx = nz, tz = -nx; const tl = Math.hypot(tx, tz);
      if (tl < 0.05) { tx = 1; tz = 0; } else { tx /= tl; tz /= tl; }
      const ux = ny * tz, uy = nz * tx - nx * tz, uz = -ny * tx;
      const lift = r * 0.12, rot = rand() * 6.283;
      const top = [px + nx * (lift + r * 0.42), py + ny * (lift + r * 0.42), pz + nz * (lift + r * 0.42), nx, ny, nz, 0.1, 0.1, k * 1.18, k * 1.18, k * 1.18, 0.4];
      const ring = [];
      for (let p = 0; p < 5; p++) {
        const an = rot + (p / 5) * 6.283, c = Math.cos(an) * r, s = Math.sin(an) * r, sh = k * (0.74 + 0.2 * hash2(i, p, 19));
        ring.push([px + nx * lift + tx * c + ux * s, py + ny * lift + uy * s, pz + nz * lift + tz * c + uz * s,
          nx * 0.75 + (tx * c + ux * s) / r * 0.5, ny * 0.75 + (uy * s) / r * 0.5, nz * 0.75 + (tz * c + uz * s) / r * 0.5, 0.2 + p * 0.1, 0.3, sh, sh, sh, 0.35]);
      }
      for (let p = 0; p < 5; p++) tri(top, ring[(p + 1) % 5], ring[p]);
    }
  }
  const plant = {
    ball(x, z, rand) { mound(x, z, 0.42 + 0.3 * rand(), rand, { single: true, squash: 0.95, lump: 0.08, segs: 7 }); },
    shrub(x, z, rand) { mound(x, z, 0.5 + 0.45 * rand(), rand, { blossom: rand() < 0.36 }); },
    hydrangea(x, z, rand) {
      const blobs = mound(x, z, 0.55 + 0.3 * rand(), rand, { squash: 0.8 });
      hydrangeaHeads(blobs, rand, 9 + Math.floor(rand() * 3), 0.15);
    },
    bed(x, z, rand) {
      const blobs = mound(x, z, 0.6 + 0.4 * rand(), rand, { squash: 0.5, lump: 0.05, segs: 6, rings: BED_RINGS });
      rosettes(blobs, rand, blobs.length > 1 ? 32 : 24, 0.085);
    },
  };

  // ---- placement ---------------------------------------------------------------------------------------------------------
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    let t = ((px - ax) * dx + (pz - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
  };
  const inRect = (r, x, z, m) => { const [lx, lz] = world.toLocal(r, x, z); return Math.abs(lx) <= r.w / 2 + m && Math.abs(lz) <= r.d / 2 + m; };
  const houses = [...MAP.lots, ...MAP.landmarks];
  const placed = [];
  function free(x, z, r) {
    if (world.surfaceAt(x, z) !== 'garden') return false;
    for (const o of MAP.streets) if (world.distToLine(o, x, z, o.wallOff + r + 2).d < o.wallOff + 0.3 + r * 0.75) return false;
    if (S.treeNear(x, z, 0.9 + r)) return false;
    for (const hsr of houses) if (Math.abs(hsr.x - x) < 30 && Math.abs(hsr.z - z) < 30 && inRect(hsr, x, z, 0.25 + r * 0.5)) return false;
    for (const p of placed) if (Math.hypot(p[0] - x, p[1] - z) < (p[2] + r) * 0.8) return false;
    return true;
  }
  let nPlants = 0;
  function tryPlant(kind, x, z, r, rand) {
    if (!free(x, z, r)) { rand(); return false; }
    placed.push([x, z, r]);
    plant[kind](x, z, rand);
    nPlants++;
    return true;
  }

  for (const w of MAP.walls) {
    if (w.top === 'hedge') hedge(w);
    else { const rand = rng.makeRng(`life:creeper:${w.id}`); if (rand() < 0.34) creeper(w, rand); }
  }

  for (const lot of MAP.lots) {
    const rand = rng.makeRng(`life:garden:${lot.id}`);
    const c = Math.cos(lot.rot), s = Math.sin(lot.rot);
    const W = (lx, lz) => [lot.x + lx * c + lz * s, lot.z - lx * s + lz * c];
    const [gx, gz] = world.toLocal(lot, lot.gate.x, lot.gate.z);
    const hw = lot.w / 2, hd = lot.d / 2;
    const doorX = Math.max(-hw + 1.5, Math.min(hw - 1.5, gx));
    // keep the two possible gate-to-door lines clear (the door is either opposite the gate or in the middle of the front)
    const onWalk = (lx, lz, r) => segDist(lx, lz, gx, gz, doorX, hd) < 1.5 + r || segDist(lx, lz, gx, gz, 0, hd) < 1.5 + r;
    const at = (kind, lx, lz, r) => { if (onWalk(lx, lz, r)) { rand(); return; } const [x, z] = W(lx, lz); tryPlant(kind, x, z, r, rand); };
    placed.length = 0;
    // foundation planting along the front and the sides of the house
    for (let lx = -hw - 0.4; lx <= hw + 0.4; lx += 2.0 + rand() * 1.8) if (rand() < 0.7) at(rand() < 0.3 ? 'ball' : 'shrub', lx, hd + 0.75 + rand() * 0.4, 0.6);
    for (const sx of [-1, 1]) for (let lz = -hd + 1; lz < hd; lz += 2.8 + rand() * 2.4) if (rand() < 0.36) at('shrub', sx * (hw + 0.8 + rand() * 0.3), lz, 0.6);
    // a loose border along the inside of the street wall: hydrangeas, shrubs, clipped balls
    const zw = hd + lot.setback - 1.35;
    for (let lx = -hw - 7; lx <= hw + 7; lx += 2.1 + rand() * 2.0) {
      const k = rand();
      if (k < 0.74) at(k < 0.3 ? 'hydrangea' : k < 0.56 ? 'shrub' : 'ball', lx, zw - rand() * 0.6, 0.6);
    }
    // flower beds flanking the walk from the gate to the door, and one or two loose in the front garden
    for (let f = 0.22; f < 0.9; f += 0.2 + rand() * 0.12) for (const sd of [-1, 1]) {
      if (rand() > 0.5) continue;
      const dx = doorX - gx, dz = hd - gz, l = Math.hypot(dx, dz) || 1, off = 2.3 + rand() * 0.25;
      at('bed', gx + dx * f + (-dz / l) * sd * off, gz + dz * f + (dx / l) * sd * off, 0.7);
    }
    const beds = 1 + Math.floor(rand() * 2.2);
    for (let i = 0; i < beds; i++) at('bed', (rand() * 2 - 1) * (hw + 3), hd + 2.2 + rand() * Math.max(0.5, lot.setback - 4.6), 0.7);
  }

  // parks: flower beds and clipped balls beside the gravel paths
  placed.length = 0;
  for (const path of MAP.paths) {
    if (path.kind !== 'gravel') continue;
    const rand = rng.makeRng(`life:parkbeds:${path.id}`), p = {};
    for (let s = 4; s < path.len - 3; s += 5.5 + rand() * 4) {
      world.pointAt(path, s, p);
      const side = rand() < 0.5 ? 1 : -1, off = path.half + 1.1 + rand() * 0.9;
      const x = p.x + p.nx * side * off, z = p.z + p.nz * side * off, kind = rand() < 0.62 ? 'bed' : rand() < 0.5 ? 'ball' : 'shrub';
      if (!world.parkAt(x, z, -1) || world.surfaceAt(x, z) !== 'lawn' || S.treeNear(x, z, 1.6)) continue;
      if (MAP.benches.some((b) => Math.hypot(b.x - x, b.z - z) < 1.8) || MAP.figures.some((f) => Math.hypot(f.x - x, f.z - z) < 2.5)) continue;
      if (placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < 1.6)) continue;
      placed.push([x, z, 0.7]);
      plant[kind](x, z, rand); nPlants++;
    }
  }

  // ---- material ----------------------------------------------------------------------------------------------------------
  const uPal = { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(1, 1, 1)] };
  const uTint = { value: Array.from({ length: TINTS }, () => new THREE.Color(1, 1, 1)) };
  const VERT_PARS = /* glsl */ `
attribute vec4 aP;            // kind, season, show threshold (kind 4: tint index / 32), wind flex
uniform vec3 uPal[ 4 ]; uniform vec3 uTint[ ${TINTS} ]; uniform float uShow[ 5 ]; uniform float uTime; uniform vec3 uWind;`;
  const KILL = /* glsl */ `
if ( uShow[ int( aP.y + 0.5 ) ] < aP.z ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );`;
  const MOVE = /* glsl */ `
transformed.xz += uWind.xz * aP.w * ( 0.035 + 0.03 * sin( uTime * 2.3 + position.x * 1.7 + position.z * 1.3 ) + 0.012 * sin( uTime * 6.1 + position.x * 5.0 + position.y * 7.0 ) );`;
  const mat = new THREE.MeshStandardMaterial({ map: S.tex.leafy, vertexColors: true, alphaTest: 0.5, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'life:planting';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uPal, uTint, uShow: S.U.uShow, uCreeper: { value: S.tex.creeper }, uTime: S.U.uTime, uWind: S.U.uWind });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}\nvarying float vCard; varying vec2 vCardUv;`)
      .replace('#include <color_vertex>', `#include <color_vertex>\nint pk = int( aP.x + 0.5 );\nvColor.rgb *= pk == 4 ? uTint[ int( aP.z * 32.0 + 0.5 ) ] : uPal[ pk ];\nvCard = pk == 1 ? 1.0 : 0.0;\nvCardUv = uv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${MOVE}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${KILL}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uCreeper; varying float vCard; varying vec2 vCardUv;`)
      .replace('#include <map_fragment>', /* glsl */ `
        vec4 tileTex = texture2D( map, vMapUv );
        vec4 cardTex = texture2D( uCreeper, vCardUv );
        vec4 sampledDiffuseColor = vCard > 0.5 ? vec4( cardTex.rgb * 1.25, cardTex.a ) : vec4( tileTex.rgb * 1.7, 1.0 );
        diffuseColor *= sampledDiffuseColor;`);
  };
  mat.customProgramCacheKey = () => 'life:planting:v2';
  const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uPal, uTint, uShow: S.U.uShow, uTime: S.U.uTime, uWind: S.U.uWind });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${MOVE}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${KILL}`);
  };
  depth.customProgramCacheKey = () => 'life:plantingDepth:v2';

  const meshes = [];
  let tris = 0, castTris = 0;
  const cat = (c, k) => { const n = c.reduce((a, b) => a + b[k].length, 0), out = new Float32Array(n); let o = 0; for (const b of c) { out.set(b[k], o); o += b[k].length; } return out; };
  for (const c of chunks.values()) {
    const nHedge = c[HEDGE].pos.length / 3, nCast = nHedge + c[MOUND].pos.length / 3, nCreep = c[CREEP].pos.length / 3, nAll = nCast + nCreep + c[BLOOM].pos.length / 3;
    if (!nAll) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cat(c, 'pos'), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(cat(c, 'nor'), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(cat(c, 'uv'), 2));
    g.setAttribute('color', new THREE.BufferAttribute(cat(c, 'col'), 3));
    g.setAttribute('aP', new THREE.BufferAttribute(cat(c, 'ap'), 4));
    g.computeBoundingSphere(); g.computeBoundingBox();
    tris += nAll / 3; castTris += nCast / 3;
    const m = new THREE.Mesh(g, mat);
    m.name = 'life:planting'; m.castShadow = true; m.receiveShadow = true;
    m.customDepthMaterial = depth;
    m.matrixAutoUpdate = false; m.updateMatrix();
    m.userData.hedge = nHedge; m.userData.cast = nCast; m.userData.mid = nCast + nCreep; m.userData.all = nAll; m.userData.main = nAll;
    // only hedges and shrubs go into the shadow map
    m.onBeforeShadow = () => { g.setDrawRange(0, m.userData.cast); };
    m.onAfterShadow = () => { g.setDrawRange(0, m.userData.main); };
    S.group.add(m); meshes.push(m);
  }
  chunks.clear();

  const tmp = new THREE.Color(), tmp2 = new THREE.Color();
  const FL = {}, HY = {}, BL = BLOSSOM.map((b) => [b[0] && new THREE.Color(b[0]), b[1] && new THREE.Color(b[1])]);
  for (const k of PRESETS) { FL[k] = FLOWERS[k].map((h) => new THREE.Color(h)); HY[k] = HYDRANGEA[k]?.map((h) => new THREE.Color(h)); }
  function tints() {
    const show = S.U.uShow.value, T = uTint.value, leaf = uPal.value[2];
    for (let i = 0; i < TINTS; i++) T[i].setRGB(0, 0, 0);
    for (let s = 0; s < 4; s++) {
      const w = show[s + 1], id = PRESETS[s];
      if (w <= 0) continue;
      for (let i = 0; i < 6; i++) {
        tmp.copy(FL[id][i % FL[id].length]); T[T_FLOWER + i].r += tmp.r * w; T[T_FLOWER + i].g += tmp.g * w; T[T_FLOWER + i].b += tmp.b * w;
        const bl = BL[i][id === 'spring' ? 0 : id === 'autumn' ? 1 : 2] || leaf;
        T[T_BLOSSOM + i].r += bl.r * w; T[T_BLOSSOM + i].g += bl.g * w; T[T_BLOSSOM + i].b += bl.b * w;
      }
      for (let i = 0; i < 4; i++) {
        const hy = HY[id] ? tmp.copy(HY[id][i]) : tmp.copy(leaf).lerp(tmp2.setRGB(0.5, 0.62, 0.3), 0.35);
        T[T_HYDRANGEA + i].r += hy.r * w; T[T_HYDRANGEA + i].g += hy.g * w; T[T_HYDRANGEA + i].b += hy.b * w;
      }
    }
  }
  return {
    stats: { chunks: meshes.length, tris, castTris, plants: nPlants, hedgeMetres: Math.round(hedgeLen) },
    update() {
      const cur = ctx.env.current, pal = uPal.value;
      pal[0].copy(cur.hedge);
      pal[1].copy(cur.ivy);
      pal[2].copy(cur.hedge).lerp(tmp.copy(cur.lawn), 0.42);
      tints();
      // far chunks are a few pixels of green: beyond 330 m skip them, beyond 200 m keep only the hedges, blooms only near
      // the camera; shadows only from the chunks around it
      const cam = ctx.camera.position;
      const sd = Math.min(ctx.quality.shadowDistance, 28);
      for (const m of meshes) {
        const b = m.geometry.boundingSphere, d = b.center.distanceTo(cam) - b.radius;
        const near = m.geometry.boundingBox.distanceToPoint(cam);      // the box hugs the chunk far better than the sphere
        m.visible = d < 330; m.castShadow = near < sd && m.userData.cast > 0;
        m.userData.main = near < 70 ? m.userData.all : d < 200 ? m.userData.mid : m.userData.hedge;
        m.geometry.setDrawRange(0, m.userData.main);
      }
    },
    dispose() { for (const m of meshes) { S.group.remove(m); m.geometry.dispose(); } mat.dispose(); depth.dispose(); },
  };
}
