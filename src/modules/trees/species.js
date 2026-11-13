// The nine 八大关 species as template builders. Each builds a tree at its nominal size (H, R) with the root at the
// origin; the forest scales it to the individual tree (h / H vertically, r / R horizontally).
import { makeBuilder, V } from './builder.js';
import { TILE } from './atlas.js';

const TAU = Math.PI * 2, GOLD = 2.39996;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const ORDER = ['ginkgo', 'maple', 'plane', 'cedar', 'juniper', 'pine', 'peach', 'crabapple', 'crape'];
export const VARIANTS = 3;

// sway: metres of tip displacement per unit wind per metre^2 of height; mid/far: [take every n-th card, scale];
// tint: multiplies the live palette (linear rgb); plane: how much of the camouflage bark map shows on the trunk
export const SPEC = {
  ginkgo:    { H: 14,   R: 4.0, bark: '#a3907b', gain: 1.0,  sway: 0.0021, plane: 0, mid: [3, 1.85], far: [13, 3.4] },
  maple:     { H: 10.5, R: 4.7, bark: '#9c8873', gain: 1.0,  sway: 0.0026, plane: 0, mid: [3, 1.6],  far: [10, 3.0] },
  plane:     { H: 17,   R: 6.9, bark: '#e6e6e0', gain: 1.0,  sway: 0.0017, plane: 1, mid: [2, 1.5],  far: [10, 3.0], flat: '#9d9a80' },
  cedar:     { H: 17.5, R: 5.1, bark: '#8a7462', gain: 1.4,  sway: 0.0011, plane: 0, mid: [4, 1.6],  far: [24, 2.6], tint: [1.02, 1.03, 1.15] },
  juniper:   { H: 6.5,  R: 1.3, bark: '#7a6654', gain: 1.8,  sway: 0.0028, plane: 0, mid: [2, 1.35], far: [6, 1.9] },
  pine:      { H: 8,    R: 3.7, bark: '#7d6658', gain: 1.0,  sway: 0.0022, plane: 0, mid: [2, 1.25], far: [5, 1.5], midLevel: 1 },
  peach:     { H: 4.1,  R: 2.3, bark: '#94705f', gain: 1.0,  sway: 0.006,  plane: 0, mid: [3, 1.6],  far: [8, 2.6] },
  crabapple: { H: 4.9,  R: 2.5, bark: '#9a8474', gain: 1.0,  sway: 0.005,  plane: 0, mid: [3, 1.6],  far: [9, 2.7] },
  crape:     { H: 3.9,  R: 2.1, bark: '#b3a299', gain: 1.0,  sway: 0.008,  plane: 0.55, mid: [2, 1.4], far: [6, 2.2] },
  // understory thicket of the backdrop belt (not a street species; borrows the juniper palette)
  shrub:     { H: 3.2,  R: 3.0, bark: '#7a6654', gain: 1.3,  sway: 0.002,  plane: 0, mid: [1, 1],    far: [1, 1], palette: 'juniper' },
};

// ---- helpers ---------------------------------------------------------------------------------------------------------
function rv(rand) { return [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]; }

/** Quadratic-bezier limb from a to c, bulging by `bulge` (vector added to the midpoint). Returns the path. */
function limbTo(b, rand, a, c, r0, r1, { segs = 3, bulge = [0, 0, 0], sides = 5, level = 1, shade = 1, wob = 0.12 } = {}) {
  const m = V.add(V.lerp(a, c, 0.5), bulge), path = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, s = 1 - t;
    const p = [s * s * a[0] + 2 * s * t * m[0] + t * t * c[0], s * s * a[1] + 2 * s * t * m[1] + t * t * c[1], s * s * a[2] + 2 * s * t * m[2] + t * t * c[2]];
    if (i > 0 && i < segs) { p[0] += (rand() - 0.5) * wob * 2; p[1] += (rand() - 0.5) * wob; p[2] += (rand() - 0.5) * wob * 2; }
    path.push([p[0], p[1], p[2], lerp(r0, r1, t ** 0.75)]);
  }
  b.tube(path, { sides, level, shade });
  return path;
}

const toneMostly = (rand) => (rand() < 0.74 ? 0 : rand() < 0.5 ? 1 : 3);
// 五角枫: orange / yellow / a little scarlet / russet on ONE tree; each variant leans a different way
const MAPLE_MIX = [[0.36, 0.44, 0.06, 0.14], [0.26, 0.56, 0.04, 0.14], [0.4, 0.32, 0.08, 0.2]];
// blossom: [pink, pale, deep, white]; 碧桃 mixes all three even on one tree, 海棠 stays pale pink-white
const PEACH_MIX = [[0.56, 0.22, 0.08, 0.14], [0.3, 0.3, 0.04, 0.36], [0.42, 0.16, 0.26, 0.16]];
const CRAB_MIX = [[0.5, 0.32, 0.02, 0.16], [0.3, 0.37, 0.01, 0.32], [0.42, 0.3, 0.02, 0.26]];
const toneAbs = (w) => (rand) => { let t = rand(); for (let i = 0; i < 4; i++) { t -= w[i]; if (t <= 0) return 4 + i; } return 4; };

/**
 * A broadleaf crown grown FROM its branches: main limbs to points on an ellipsoid shell, secondary forks off each limb,
 * then leaf cards hung on the outer part of every limb (tips first), so no branch ends bare and no card floats.
 * o: { C, rx, ry, profile(yn), n, sec, az(k), yn(k, rand), start(k, tip, rand), r0, r1, secR, bulgeOut, bulgeY, sides, segs,
 *      shade, wob, ynMin, extra: [points], cards, inner, size: [a, b], spread, tiles, tone(rand), trans, flutter, fold, jitter }
 */
function branchCrown(b, rand, o) {
  const { C, rx, ry } = o, prof = o.profile || (() => 1), ynMin = o.ynMin ?? -0.6;
  const shell = (az, yn, f) => {
    const rad = Math.sqrt(Math.max(0, 1 - yn * yn)) * prof(yn) * f;
    return [C[0] + Math.cos(az) * rad * rx, C[1] + yn * ry * f, C[2] + Math.sin(az) * rad * rx];
  };
  const anchors = [], wood = [];      // wood: points on the limbs that are still drawn at the mid LOD
  const hang = (path, t0) => {
    const n = path.length - 1;
    for (let i = 1; i <= n; i++) {
      if (i / n >= t0) anchors.push({ p: path[i], tip: i === n });
      if ((i - 0.5) / n >= t0) anchors.push({ p: V.lerp(path[i - 1], path[i], 0.5), tip: false });
    }
  };
  const az0 = rand() * TAU, segs = o.segs ?? 4;
  for (let k = 0; k < o.n; k++) {
    const az = az0 + (o.az ? o.az(k) : (k / o.n) * TAU) + rand.range(-0.25, 0.25), yn = o.yn(k, rand);
    const tip = shell(az, yn, rand.range(0.86, 0.97)), from = o.start(k, tip, rand);
    const hx = tip[0] - from[0], hz = tip[2] - from[2];
    const path = limbTo(b, rand, from, tip, o.r0 * (1 - 0.25 * (k / o.n)), o.r1,
      { segs, bulge: [hx * (o.bulgeOut ?? 0.1), o.bulgeY ?? 0, hz * (o.bulgeOut ?? 0.1)], sides: o.sides ?? 4, level: o.level ? o.level(k) : 1, shade: o.shade ?? 1, wob: o.wob ?? 0.16 });
    hang(path, 0.5);
    if ((o.level ? o.level(k) : 1) <= 1) for (let i = 1; i <= segs; i++) { wood.push(path[i]); wood.push(V.lerp(path[i - 1], path[i], 0.5)); }
    for (let s = 0; s < (o.sec ?? 2); s++) {
      const f2 = path[1 + ((s + k) % (segs - 1))];
      const az2 = az + (s % 2 ? 1 : -1) * rand.range(0.35, 0.95) * (o.secSpread ?? 1);
      const yn2 = clamp(yn + rand.range(-0.6, 0.5), ynMin, 0.96);
      const tip2 = shell(az2, yn2, rand.range(0.8, 1.0));
      if (tip2[1] < f2[1] - 0.25 * ry) tip2[1] = f2[1] - 0.25 * ry * rand();     // forks do not dive
      const p2 = limbTo(b, rand, [f2[0], f2[1], f2[2]], tip2, Math.min(o.secR, f2[3] * 0.8), 0.015,
        { segs: 2, bulge: [0, o.secBulgeY ?? 0.15, 0], sides: 3, level: 2, shade: o.shade ?? 1, wob: (o.wob ?? 0.16) * 0.6 });
      hang(p2, 0.4);
    }
  }
  for (const p of o.extra || []) anchors.push({ p, tip: true });
  // tips first, so a thinned (leafFill < 1) or sub-sampled crown keeps the cards that sit on wood
  anchors.sort((a, c) => (c.tip ? 1 : 0) - (a.tip ? 1 : 0));
  const R = b.crownR, na = anchors.length, spread = o.spread ?? 0.8;
  for (const p of o.extra || []) wood.push(p);
  // a card far from any limb the mid / far LOD still draws would float there beside a bare trunk: near LOD only
  const sup2 = o.support ? (o.support * rx) ** 2 : Infinity;
  const loose = (p) => { for (const w of wood) if ((p[0] - w[0]) ** 2 + (p[1] - w[1]) ** 2 + (p[2] - w[2]) ** 2 < sup2) return false; return true; };
  // no card centre beyond the crown's own outline: one that sticks out hovers beside the tree once its neighbours
  // are thinned (leafFill) or turn edge-on
  const tuck = (p) => {
    const ey = (p[1] - C[1]) / ry, pr = prof(clamp(ey, -1, 1)) || 1;
    const l = Math.hypot((p[0] - C[0]) / (rx * pr), ey, (p[2] - C[2]) / (rx * pr));
    if (l > 0.9) { const k = 0.9 / l; p[0] = C[0] + (p[0] - C[0]) * k; p[1] = C[1] + (p[1] - C[1]) * k; p[2] = C[2] + (p[2] - C[2]) * k; }
    return p;
  };
  const emit = (p, s, inner, kill, fold, q = o) => {
    if (!o.noTuck) tuck(p);
    const e = [(p[0] - C[0]) / R[0], (p[1] - C[1]) / R[1], (p[2] - C[2]) / R[2]], fn = Math.min(1, V.len(e));
    const dir = V.norm([e[0], e[1] * 0.9 + 0.1, e[2]]);
    b.card({
      c: p, n: V.norm(V.add(dir, V.mul(rv(rand), o.jitter ?? 0.6))), up: V.norm([rand() * 0.7 - 0.35, 1, rand() * 0.7 - 0.35]),
      w: s, h: s, tile: q.tiles[Math.floor(rand() * q.tiles.length)], tone: q.tone ? q.tone(rand) : 0, loose: o.support ? loose(p) : false,
      bright: (0.58 + 0.46 * fn) * (0.86 + 0.16 * clamp(e[1] * 0.5 + 0.5, 0, 1)) * (0.94 + 0.12 * rand()) * (inner ? 0.86 : 1),
      trans: (o.trans ?? 0.6) * (0.5 + 0.5 * fn), flutter: o.flutter ?? 0.045, fold, flip: rand() < 0.5, nMix: 0.28, kill,
    });
  };
  for (let i = 0; i < o.cards; i++) {
    const a = anchors[i % na], pass = Math.floor(i / na), k = pass === 0 ? 0.3 : 1;
    const off = rv(rand), s = lerp(o.size[0], o.size[1], rand());
    emit([a.p[0] + off[0] * spread * k, a.p[1] + off[1] * spread * k * 0.7 + (a.tip ? s * 0.12 : 0), a.p[2] + off[2] * spread * k], s, false,
      pass === 0 ? rand() * 0.72 : 0.3 + 0.7 * rand(), i % 2 === 0 ? (o.fold ?? 0.24) : 0);
  }
  // an inner shell gives the crown depth (seen from below and against the light)
  for (let i = 0; i < (o.inner ?? 0); i++) {
    const a = anchors[Math.floor(rand() * na)], f = rand.range(0.4, 0.7), off = rv(rand);
    emit([lerp(C[0], a.p[0], f) + off[0] * spread * 0.6, a.p[1] - rand() * 0.12 * ry + off[1] * 0.3, lerp(C[2], a.p[2], f) + off[2] * spread * 0.6],
      lerp(o.size[0], o.size[1], rand()) * 1.1, true, 0.15 + 0.85 * rand(), 0);
  }
  // a second set of cards in another palette slot (海棠: leaves and fruit when not in bloom; the forest shows one set)
  const A = o.alt;
  if (A) {
    for (let i = 0; i < A.cards; i++) {
      const a = anchors[i % na], pass = Math.floor(i / na), k = pass === 0 ? 0.3 : 1, off = rv(rand);
      emit([a.p[0] + off[0] * spread * k, a.p[1] + off[1] * spread * k * 0.7, a.p[2] + off[2] * spread * k], lerp(A.size[0], A.size[1], rand()), false,
        pass === 0 ? rand() * 0.8 : 0.25 + 0.75 * rand(), 0, A);
    }
    // fruit: small clusters hanging under the outer twigs
    for (let i = 0; i < (A.fruit ?? 0); i++) {
      const a = anchors[Math.floor(rand() * na)], s = rand.range(A.fruitSize[0], A.fruitSize[1]), az = rand() * TAU;
      b.card({ c: [a.p[0] + rand.range(-0.25, 0.25), a.p[1] - s * 0.4 - rand() * 0.15, a.p[2] + rand.range(-0.25, 0.25)], n: [Math.cos(az), 0, Math.sin(az)],
        up: V.norm([rand() * 0.5 - 0.25, -1, rand() * 0.5 - 0.25]), w: s, h: s, tile: A.fruitTile, tone: A.fruitTone, bright: rand.range(0.9, 1.1), trans: 0.35,
        flutter: 0.03, flip: rand() < 0.5, nMix: 0.4, kill: rand() * 0.5 });
    }
  }
}

// ---- species ---------------------------------------------------------------------------------------------------------
const BUILD = {
  ginkgo(b, rand) {
    const lean = [rand.range(-0.25, 0.25), rand.range(-0.25, 0.25)];
    b.crown = [0, 8.2, 0]; b.crownR = [4, 5.6, 4];
    const trunk = [[0, -0.5, 0, 0.36], [lean[0] * 0.4, 3.2, lean[1] * 0.4, 0.28], [lean[0], 7.6, lean[1], 0.19], [lean[0] * 0.6, 11.2, lean[1] * 0.6, 0.09], [0, 13.0, 0, 0.03]];
    b.tube(trunk, { sides: 7, level: 0 });
    // ascending scaffold branches whorled up the leader; each carries its own fans of leaves
    const n = 10;
    branchCrown(b, rand, {
      C: b.crown, rx: 4.0, ry: 5.5, profile: (yn) => lerp(1.08, 0.62, (yn + 1) / 2), ynMin: -0.72,
      n, sec: 1, az: (k) => k * GOLD, yn: (k, r) => lerp(-0.62, 0.84, k / (n - 1)) + r.range(-0.06, 0.06),
      start: (k, tip) => {
        const hd = Math.hypot(tip[0], tip[2]), y0 = clamp(tip[1] - hd * 0.8, 2.9, 11), t = (y0 + 0.5) / 13.5;
        return [lean[0] * t, y0, lean[1] * t];
      },
      r0: 0.115, r1: 0.022, secR: 0.045, bulgeOut: 0.12, bulgeY: -0.35, sides: 3, segs: 3, level: (k) => (k % 2 ? 2 : 1), shade: 1, wob: 0.14,
      extra: [[0, 12.9, 0], [lean[0] * 0.6, 11.4, lean[1] * 0.6]],
      support: 0.42, cards: 152, inner: 34, size: [1.38, 2.0], spread: 0.85, tiles: [TILE.ginkgoA, TILE.ginkgoB], tone: toneMostly, trans: 0.95, flutter: 0.05,
    });
  },

  maple(b, rand, variant) {
    b.crown = [0, 6.7, 0]; b.crownR = [4.7, 3.6, 4.7];
    const fy = rand.range(2.5, 3.0), n = 5;
    b.tube([[0, -0.5, 0, 0.33], [rand.range(-0.1, 0.1), 1.2, rand.range(-0.1, 0.1), 0.26], [rand.range(-0.08, 0.08), fy, rand.range(-0.08, 0.08), 0.22], [0, fy + 0.75, 0, 0.15]], { sides: 7, level: 0 });
    branchCrown(b, rand, {
      C: b.crown, rx: 4.7, ry: 3.6, ynMin: -0.56,
      n, sec: 3, yn: (k, r) => (k === 0 ? 0.8 : r.range(-0.2, 0.45)),
      start: (k) => [0, fy - 0.35 + 1.0 * (((k * 2) % n) / n), 0],
      r0: 0.15, r1: 0.035, secR: 0.06, bulgeOut: 0.14, bulgeY: -0.45, sides: 4, wob: 0.2,
      cards: 96, inner: 22, size: [1.8, 2.5], spread: 0.9, tiles: [TILE.mapleA, TILE.mapleB], tone: toneAbs(MAPLE_MIX[variant % 3]), trans: 0.8, flutter: 0.05,
    });
  },

  plane(b, rand) {
    b.crown = [0, 11.9, 0]; b.crownR = [6.9, 4.8, 6.9];
    const fy = rand.range(5.3, 5.9), n = 5;
    b.tube([[0, -0.5, 0, 0.56], [rand.range(-0.12, 0.12), 1.4, rand.range(-0.12, 0.12), 0.46], [rand.range(-0.15, 0.15), 3.6, rand.range(-0.15, 0.15), 0.42], [0, fy, 0, 0.38], [0, fy + 1.0, 0, 0.26]],
      { sides: 8, level: 0 });
    branchCrown(b, rand, {
      C: b.crown, rx: 6.9, ry: 4.7, profile: (yn) => (yn < 0 ? 1 + yn * 0.18 : 1), ynMin: -0.7,
      n, sec: 3, yn: (k, r) => (k === 0 ? 0.82 : r.range(-0.3, 0.5)),
      start: (k) => [0, fy - 0.4 + 1.3 * (((k * 2) % n) / n), 0],
      r0: 0.25, r1: 0.06, secR: 0.1, bulgeOut: 0.06, bulgeY: 0.6, secBulgeY: 0.4, sides: 5, shade: 1, wob: 0.26,
      support: 0.36, cards: 96, inner: 22, size: [2.6, 3.5], spread: 1.3, tiles: [TILE.planeA, TILE.planeB], tone: toneMostly, trans: 0.7, flutter: 0.055,
    });
  },

  cedar(b, rand) {
    b.crown = [0, 10, 0]; b.crownR = [5, 8, 5];
    b.tube([[0, -0.5, 0, 0.44], [0, 5, 0, 0.33], [0, 11, 0, 0.18], [0, 17.2, 0, 0.03]], { sides: 6, level: 0 });
    // 雪松: the lowest boughs leave the trunk just above head height, reach across the carriageway and droop, each
    // hung with a curtain of branchlets: two rows of them close into a dark tunnel
    const tiers = 13, y0 = 3.9, y1 = 16.0;
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers, yt = y0 + (y1 - y0) * t ** 0.95, low = k < 4;
      const Lb = 6.3 * (1 - k / (tiers + 0.6)) ** 0.9, nb = k < 5 ? 7 : k < 8 ? 6 : 4, a0 = k * 1.37 + rand() * 0.6;
      for (let j = 0; j < nb; j++) {
        const az = a0 + (j / nb) * TAU + rand.range(-0.25, 0.25), L = Math.max(0.9, Lb * (j % 2 ? rand.range(0.55, 0.85) : rand.range(0.9, 1.12)));
        const y = yt + (k === 0 ? rand.range(-0.15, 0.5) : rand.range(-0.5, 0.5)) + (j % 2 ? 0.35 : 0);
        const out = [Math.cos(az), 0, Math.sin(az)], droop = (k === 0 ? 0.12 : low ? 0.21 : 0.17) * L + 0.2;   // the lowest tier stays clear of heads
        // the bough: rises a little, then droops toward its tip
        const at = (u) => [out[0] * L * u, y + 0.22 * L * u * (1 - u) - droop * u * u, out[2] * L * u];
        const tip = at(1);
        if (k < 5 && j % 2 === 0) b.tube([[0, y, 0, 0.1 - k * 0.012], [...at(0.5), 0.05], [...tip, 0.015]], { sides: 3, level: 2, shade: 0.95 });
        const bright = (0.72 + 0.4 * t) * rand.range(0.92, 1.08);
        const lit = V.norm(V.mix([0, 1, 0], out, 0.85, 0.55));
        // foliage in overlapping sprays stepping down the bough (not one sheet): each fans a little to one side
        const nS = L > 3.3 ? 3 : L > 1.7 ? 2 : 1;
        for (let s = 0; s < nS; s++) {
          const uc = nS === 1 ? 0.52 : ((s + 0.62) / nS) * 0.97, w = L * (nS === 1 ? 1.05 : 1.3 / nS) * rand.range(0.92, 1.1);
          const yaw = nS === 1 ? 0 : (s % 2 ? 1 : -1) * rand.range(0.15, 0.42), cy = Math.cos(yaw), sy = Math.sin(yaw);
          const dir = [out[0] * cy - out[2] * sy, 0, out[0] * sy + out[2] * cy];
          const p0 = at(Math.max(0, uc - 0.12)), p1 = at(Math.min(1, uc + 0.12));
          const slope = V.norm([dir[0], (p1[1] - p0[1]) / Math.max(0.05, Math.hypot(p1[0] - p0[0], p1[2] - p0[2])) - 0.08 * s, dir[2]]);
          const side = V.cross(dir, [0, 1, 0]);
          let nUp = V.norm(V.cross(side, slope));
          if (nUp[1] < 0) nUp = V.mul(nUp, -1);
          const roll = rand.range(-0.4, 0.4), nFlat = V.norm(V.mix(nUp, side, Math.cos(roll), Math.sin(roll)));
          const c = V.add(at(uc), V.add(V.mul(side, Math.sin(yaw) * w * -0.2), [0, -0.06 * s, 0]));
          b.card({ c, n: nFlat, up: V.cross(nFlat, slope), w, h: w * 0.74 + 0.25, tile: TILE.cedarTop, tone: rand() < 0.7 ? 0 : 1,
            bright: bright * (1 - 0.05 * s) * rand.range(0.8, 1.2), trans: 0.45, flutter: 0.018, backDark: 0.85, fold: s === 0 && nS < 3 ? 0.08 : 0, normal: lit, flip: false,
            kill: 0, keep: s === (nS >= 3 ? 1 : 0) ? (j % 3 === 0 && k % 3 === 0 ? 2 : 1) : 0, keepScale: nS === 3 ? 2.3 : nS === 2 ? 1.5 : 1.05 });
        }
        // hanging branchlets seen from the side, on every bough
        const slopeB = V.norm(V.sub(tip, [0, y, 0])), sideB = V.cross(out, [0, 1, 0]);
        let upB = V.norm(V.cross(sideB, slopeB));
        if (upB[1] < 0) upB = V.mul(upB, -1);
        const fh = low ? (k === 0 ? 1.5 : rand.range(1.8, 2.3)) * Math.min(1, L / 4.2) : Math.min(0.34 * L + 0.5, 2.0), cMid = at(0.54);
        const nSide = V.norm(V.mix(out, [0, 1, 0], 0.8, 0.5));
        b.card({ c: V.sub(cMid, V.mul(upB, fh * 0.27 - 0.1)), n: V.cross(slopeB, upB), up: upB, w: L * 1.05, h: fh, tile: TILE.cedarSide, tone: rand() < 0.7 ? 0 : 3,
          bright: bright * 0.94 * rand.range(0.86, 1.14), trans: 0.4, flutter: 0.022, normal: nSide });
        // the lowest four tiers: curtains ACROSS the bough too, so the canopy is closed seen along the street and from
        // underneath (flat sprays alone vanish edge-on)
        if (low) for (const uc of L > 3 ? [0.48, 0.88] : [0.7]) {
          const pc = at(uc), ch = fh * rand.range(0.85, 1.1) * (uc > 0.9 ? 0.8 : 1), cw = L * rand.range(0.5, 0.62) * (1.15 - 0.4 * uc);
          const sk = rand.range(-0.35, 0.35), nC = V.norm([out[0] + sideB[0] * sk, 0, out[2] + sideB[2] * sk]);
          b.card({ c: [pc[0], pc[1] - ch * 0.27 + 0.1, pc[2]], n: nC, up: [0, 1, 0], w: cw, h: ch, tile: TILE.cedarSide, tone: rand() < 0.6 ? 0 : rand() < 0.5 ? 1 : 3,
            bright: bright * rand.range(0.76, 1.04), trans: 0.4, flutter: 0.022, normal: nSide, flip: rand() < 0.5, keep: uc < 0.6 && j % 2 === 0 ? 1 : 0, keepScale: 1.3 });
        }
      }
    }
    for (let j = 0; j < 3; j++) {
      const az = (j / 3) * Math.PI + rand() * 0.3;
      b.card({ c: [0, 16.3, 0], n: [Math.cos(az), 0, Math.sin(az)], w: 2.6, h: 1.5, roll: Math.PI / 2, tile: TILE.cedarTop, tone: 1, bright: 1.05, trans: 0.3,
        flutter: 0.02, normal: [Math.cos(az) * 0.5, 0.85, Math.sin(az) * 0.5], keep: 2, keepScale: 1 });
    }
  },

  juniper(b, rand) {
    b.crown = [0, 3, 0]; b.crownR = [1.3, 3.4, 1.3];
    b.tube([[0, -0.4, 0, 0.16], [0, 0.7, 0, 0.13]], { sides: 5, level: 2 });
    // twisted, lumpy opaque hull well inside the flame cards (the cards make the silhouette)
    const ysA = [-0.25, 0.35, 1.1, 2.0, 3.0, 4.0, 4.9, 5.7, 6.45], rsA = [0.6, 0.86, 0.97, 1.0, 0.92, 0.78, 0.58, 0.33, 0.02];
    const pick = b.lod === 2 ? [0, 2, 4, 6, 8] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const ph = rand() * TAU, ph2 = rand() * TAU, tw = rand.range(0.4, 0.62) * (rand() < 0.5 ? -1 : 1);
    const ringK = ysA.map(() => rand.range(0.92, 1.08));
    // (the shadow proxy keeps the near hull exactly: a coarser one would stripe the near hull with self-shadow)
    // Side counts are EVEN: the mirrored u mapping below turns round on a vertex (an odd count leaves one facet with
    // constant u, which smears the tile into horizontal bands).
    const sides = b.lod === 2 ? 6 : b.lod === 1 && !b.shadow ? 8 : 12, verts = [], idx = [];
    const tri = (x) => { const f = x - Math.floor(x); return f < 0.5 ? f * 2 : 2 - f * 2; };
    const HULL = 1.3 * 0.8;
    pick.forEach((i) => {
      const y = ysA[i];
      for (let j = 0; j <= sides; j++) {
        const th = (j / sides) * TAU, a = th + i * tw;
        const r = HULL * rsA[i] * ringK[i] * (1 + 0.2 * Math.sin(th * 3 + i * 0.9 + ph) + 0.08 * Math.sin(th * 5 - i * 1.7 + ph2));
        const dir = [Math.cos(a), 0, Math.sin(a)];
        verts.push({ p: [dir[0] * r, y, dir[2] * r], n: V.norm([dir[0], 0.35, dir[2]]), u: lerp(0.22, 0.78, tri((j / sides) * 2)), v: lerp(0.78, 0.22, tri(i * 0.75)),
          bright: 0.8 + 0.22 * (i / 8) });
      }
    });
    const row = sides + 1;
    for (let i = 0; i < pick.length - 1; i++) for (let j = 0; j < sides; j++) {
      const v0 = i * row + j, v1 = v0 + 1, v2 = v0 + row + 1, v3 = v0 + row;
      idx.push(v0, v2, v1, v0, v3, v2);
    }
    b.raw(verts, idx, { tile: TILE.juniper, tone: 0, trans: 0.06, flutter: 0.008 });
    const rAt = (y) => { for (let i = 0; i < ysA.length - 1; i++) if (y <= ysA[i + 1]) return HULL * lerp(rsA[i], rsA[i + 1], (y - ysA[i]) / (ysA[i + 1] - ysA[i])); return 0.1; };
    // small flames licking upward and twisting round the column
    const n = 40, sg = Math.sign(tw);
    for (let i = 0; i < n; i++) {
      const y = 0.1 + 5.5 * ((i + rand() * 0.6) / n), az = i * GOLD + ph, r = rAt(y) * 0.92;
      const out = [Math.cos(az), 0, Math.sin(az)], tan = [-out[2] * sg, 0, out[0] * sg], h = rand.range(1.15, 1.65) * (1 - 0.2 * (y / 6));
      b.card({ c: [out[0] * r, y + h * 0.36, out[2] * r], n: V.norm([out[0], 0.3, out[2]]),
        up: V.norm([out[0] * 0.12 + tan[0] * rand.range(0.25, 0.6), 1, out[2] * 0.12 + tan[2] * rand.range(0.25, 0.6)]),
        w: h * rand.range(0.46, 0.58), h, tile: TILE.juniper, tone: toneMostly(rand),
        bright: (0.84 + 0.24 * (y / 6)) * rand.range(0.92, 1.08), trans: 0.12, flutter: 0.014, fold: i % 2 ? 0.16 : 0, flip: rand() < 0.5, nMix: 0.5, kill: 0 });
    }
    for (let j = 0; j < 2; j++) {
      const az = ph + j * 1.6;
      b.card({ c: [0, 5.75, 0], n: [Math.cos(az), 0.1, Math.sin(az)], w: 0.8, h: 1.9, roll: rand.range(-0.2, 0.2), tile: TILE.juniper, tone: 0, bright: 1.06, trans: 0.14,
        flutter: 0.02, nMix: 0.6, keep: 2, keepScale: 1 });
    }
  },

  pine(b, rand) {
    // leans toward local +x (the forest turns +x inland, away from the sea wind)
    const lean = rand.range(0.45, 1.0), wz = rand.range(-0.3, 0.3);
    const trunk = [[0, -0.5, 0, 0.3], [0.3 * lean, 1.5, wz * 0.5, 0.25], [1.15 * lean, 3.5, -wz, 0.2], [1.5 * lean, 5.3, wz, 0.14], [2.3 * lean, 6.9, 0, 0.07]];
    b.tube(trunk, { sides: 6, level: 0 });
    b.crown = [1.8 * lean, 5.2, 0]; b.crownR = [3.8, 2.6, 3.8];
    const pad = (c, r, big) => {
      const rot = rand() * TAU, tilt = [rand.range(-0.22, 0.22), 1, rand.range(-0.22, 0.22)];
      const bright = rand.range(0.9, 1.08) * (0.8 + 0.22 * Math.min(1, (c[1] - 3) / 4));
      // domed top (folded card), seen from above and below
      b.card({ c: V.add(c, [0, 0.25, 0]), n: V.norm(tilt), up: [Math.cos(rot), 0, Math.sin(rot)], w: r * 2.15, h: r * 2.15, tile: TILE.pineTop, tone: toneMostly(rand), bright, trans: 0.12,
        flutter: 0.02, backDark: 0.8, fold: 0.1, normal: [tilt[0], 0.95, tilt[2]], keep: big ? 2 : 1, keepScale: 1.08 });
      // three standing cards give the pad its thickness from the side
      for (let j = 0; j < 3; j++) {
        const az = rot + j * (Math.PI / 3) + rand.range(-0.2, 0.2), h = r * 1.0 + 0.6;
        b.card({ c: V.add(c, [0, h * 0.06, 0]), n: [Math.cos(az), 0, Math.sin(az)], w: r * 2.1, h, tile: TILE.pineSide, tone: toneMostly(rand), bright: bright * 0.95, trans: 0.14,
          flutter: 0.02, normal: V.norm([Math.cos(az) * 0.35, 0.9, Math.sin(az) * 0.35]), flip: rand() < 0.5, keep: big && j < 2 ? 2 : 0, keepScale: 1.1 });
      }
    };
    const topC = [2.5 * lean + 0.2, 7.1, rand.range(-0.3, 0.3)];
    pad(topC, rand.range(2.1, 2.6), true);
    pad([topC[0] + rand.range(-1.6, -0.8), topC[1] - rand.range(0.5, 0.9), topC[2] + rand.range(-1.5, 1.5)], rand.range(1.5, 1.9), false);
    const n = 5 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      const t = (k + rand() * 0.5) / n, i0 = 2 + (k % 2), from = trunk[i0];
      const az = k * GOLD + rand(), wx = Math.cos(az);
      const reach = rand.range(1.7, 2.7) * (wx > 0 ? 1.2 : 0.75);
      const c = [from[0] + Math.cos(az) * reach, from[1] + rand.range(0.3, 1.2) - t * 0.4, from[2] + Math.sin(az) * reach];
      limbTo(b, rand, [from[0], from[1], from[2]], [c[0], c[1] - 0.1, c[2]], 0.09, 0.03, { segs: 2, bulge: [0, 0.45, 0], sides: 4, level: 1, shade: 0.95 });
      pad(c, rand.range(1.5, 2.1), k < 2);
    }
  },

  peach(b, rand, variant) {
    b.crown = [0, 2.8, 0]; b.crownR = [2.3, 1.5, 2.3];
    const fy = rand.range(0.75, 1.0);
    b.tube([[0, -0.4, 0, 0.125], [rand.range(-0.05, 0.05), fy * 0.6, rand.range(-0.05, 0.05), 0.105], [0, fy + 0.3, 0, 0.08]], { sides: 6, level: 0 });
    const pick = toneAbs(PEACH_MIX[variant % 3]);
    const bloom = (p, tone, kill) => {
      const s = rand.range(0.82, 1.14), q = [p[0] + rand.range(-0.3, 0.3), p[1] + rand.range(-0.1, 0.3), p[2] + rand.range(-0.3, 0.3)];
      b.card({ c: q, n: V.norm(V.add(V.norm([q[0], (q[1] - 2.3) * 0.8 + 0.25, q[2]]), V.mul(rv(rand), 0.8))), up: V.norm([rand() * 0.7 - 0.35, 1, rand() * 0.7 - 0.35]),
        w: s, h: s, tile: rand() < 0.5 ? TILE.blossomA : TILE.blossomB, tone, bright: rand.range(0.88, 1.06), trans: 0.75, flutter: 0.04,
        fold: rand() < 0.5 ? 0.16 : 0, flip: rand() < 0.5, kill });
    };
    const at = (path, f) => { const i = Math.min(path.length - 2, Math.floor(f)); return V.lerp(path[i], path[i + 1], f - i); };
    const nl = 5 + (rand() < 0.5 ? 1 : 0), a0 = rand() * TAU;
    for (let k = 0; k < nl; k++) {
      const az = a0 + (k / nl) * TAU + rand.range(-0.3, 0.3), rr = rand.range(1.3, 1.9), top = [Math.cos(az) * rr, rand.range(2.8, 3.6), Math.sin(az) * rr];
      const from = [0, fy - 0.3 + 0.55 * (((k * 2) % nl) / nl), 0];
      const path = limbTo(b, rand, from, top, 0.06, 0.014, { segs: 4, bulge: [Math.cos(az) * 0.45, -0.3, Math.sin(az) * 0.45], sides: 4, level: 1, shade: 1, wob: 0.11 });
      // each branch flowers mostly in one colour (碧桃: pink, white and deep red branches on one tree)
      const limbTone = pick(rand), tn = () => (rand() < 0.75 ? limbTone : pick(rand));
      for (const f of [1.2, 1.6, 2.0, 2.4, 2.8, 3.1, 3.4, 3.7, 3.9, 4]) bloom(at(path, f), tn(), f > 3.3 ? rand() * 0.6 : rand());
      const a2 = az + (rand() < 0.5 ? -1 : 1) * rand.range(0.6, 1.1), f2 = path[2];
      const tip2 = [f2[0] + Math.cos(a2) * rand.range(0.6, 1.0), f2[1] + rand.range(0.5, 1.0), f2[2] + Math.sin(a2) * rand.range(0.6, 1.0)];
      const p2 = limbTo(b, rand, [f2[0], f2[1], f2[2]], tip2, 0.028, 0.01, { segs: 2, bulge: [0, -0.1, 0], sides: 3, level: 2, shade: 1, wob: 0.05 });
      for (const f of [0.7, 1.1, 1.5, 1.8, 2]) bloom(at(p2, f), tn(), rand());
    }
  },

  crabapple(b, rand, variant) {
    b.crown = [0, 3.3, 0]; b.crownR = [2.5, 1.7, 2.5];
    const fy = rand.range(1.35, 1.65), n = 5;
    b.tube([[0, -0.4, 0, 0.135], [rand.range(-0.06, 0.06), 0.8, rand.range(-0.06, 0.06), 0.11], [0, fy + 0.4, 0, 0.08]], { sides: 6, level: 0 });
    branchCrown(b, rand, {
      C: b.crown, rx: 2.5, ry: 1.65, ynMin: -0.6,
      n, sec: 2, yn: (k, r) => (k === 0 ? 0.8 : r.range(-0.25, 0.45)),
      start: (k) => [0, fy - 0.3 + 0.6 * (((k * 2) % n) / n), 0],
      r0: 0.065, r1: 0.014, secR: 0.028, bulgeOut: 0.14, bulgeY: -0.2, secBulgeY: 0.05, sides: 4, wob: 0.1,
      cards: 78, inner: 12, size: [0.85, 1.15], spread: 0.4, tiles: [TILE.blossomB, TILE.blossomB, TILE.blossomA], tone: toneAbs(CRAB_MIX[variant % 3]),
      trans: 0.75, flutter: 0.04, fold: 0.16, jitter: 0.8,
      // out of bloom: small oval leaves in bronze-yellow (thin in autumn) and clusters of little red fruit
      alt: { cards: 84, size: [0.7, 0.95], tiles: [TILE.crapeLeaf], tone: (r) => { const t = r(); return t < 0.5 ? 12 : t < 0.8 ? 13 : 14; },
        fruit: 26, fruitSize: [0.2, 0.3], fruitTile: TILE.panicle, fruitTone: 15 },
    });
  },

  crape(b, rand) {
    // 紫薇: several sinuous smooth stems in a vase, foliage on the upper half, loose conical panicles nodding outward
    b.crown = [0, 2.7, 0]; b.crownR = [2.1, 1.5, 2.1];
    const ns = 4 + Math.floor(rand() * 2), base = Math.floor(rand() * 3), a0 = rand() * TAU;
    let pi = 0;
    const leafCard = (p, s, br) => b.card({ c: p, n: V.norm(V.add(V.norm([p[0], 0.5, p[2]]), V.mul(rv(rand), 0.7))), up: V.norm([rand() * 0.6 - 0.3, 1, rand() * 0.6 - 0.3]),
      w: s, h: s, tile: TILE.crapeLeaf, tone: 7, bright: br * rand.range(0.9, 1.08), trans: 0.6, flutter: 0.04, fold: 0, flip: rand() < 0.5 });
    const panicle = (p, axis, len, tone, cross, keep) => {
      const side = V.norm(V.cross(axis, V.norm(V.add([axis[2], 0.3, -axis[0]], V.mul(rv(rand), 0.5)))));
      const c = V.add(p, V.mul(axis, len * 0.42)), bright = rand.range(0.94, 1.12);
      b.card({ c, n: side, up: axis, w: len, h: len, tile: TILE.panicle, tone, bright, trans: 0.8, flutter: 0.045, flip: rand() < 0.5, nMix: 0.25, keep, keepScale: 1.45 });
      if (cross) b.card({ c, n: V.cross(axis, side), up: axis, w: len, h: len, tile: TILE.panicle, tone, bright, trans: 0.8, flutter: 0.045, flip: rand() < 0.5, nMix: 0.25 });
    };
    // a branch end: leaves under the flowers, then a loose bunch of panicles of different sizes
    const end = (tip, dir, outw) => {
      const tone = 4 + ((base + pi++) % 3), np = 3 + (rand() < 0.5 ? 1 : 0);
      leafCard(V.sub(tip, V.mul(dir, 0.1)), rand.range(0.6, 0.8), 0.92);
      for (let j = 0; j < np; j++) {
        const big = j === 0;
        const axis = V.norm(V.add(V.add(V.mul(dir, big ? 1 : 0.6), V.mul(outw, big ? 0.35 : rand.range(0.3, 0.9))), V.add([0, big ? -0.1 : rand.range(-0.5, 0.1), 0], V.mul(rv(rand), big ? 0.15 : 0.45))));
        panicle(V.sub(tip, V.mul(dir, big ? 0 : rand.range(0.02, 0.22))), axis, big ? rand.range(0.52, 0.68) : rand.range(0.32, 0.5), rand() < 0.8 ? tone : 4 + ((tone - 3) % 3), big, big ? 1 : 0);
      }
    };
    for (let k = 0; k < ns; k++) {
      const az = a0 + (k / ns) * TAU + rand.range(-0.3, 0.3), rr = rand.range(0.6, 1.15), out = [Math.cos(az), 0, Math.sin(az)];
      const top = [out[0] * rr, rand.range(2.35, 2.95), out[2] * rr], root = [out[0] * rand.range(0.1, 0.2), -0.3, out[2] * rand.range(0.1, 0.2)];
      const path = limbTo(b, rand, root, top, 0.05, 0.017, { segs: 5, bulge: [out[0] * 0.3, -0.25, out[2] * 0.3], sides: 5, level: 1, shade: 1, wob: 0.16 });
      for (let s = 0; s < 2; s++) {
        const a2 = az + (s ? 1 : -1) * rand.range(0.6, 1.1), from = path[3 + s];
        const tip = [from[0] + Math.cos(a2) * rand.range(0.55, 0.9), from[1] + rand.range(0.5, 0.95), from[2] + Math.sin(a2) * rand.range(0.55, 0.9)];
        const p2 = limbTo(b, rand, [from[0], from[1], from[2]], tip, 0.022, 0.009, { segs: 2, bulge: [0, 0.08, 0], sides: 3, level: 2, shade: 1, wob: 0.05 });
        leafCard(V.lerp(p2[0], p2[1], 0.7), rand.range(0.75, 1.0), 0.86);
        leafCard(V.lerp(p2[1], p2[2], 0.5), rand.range(0.7, 0.95), 0.92);
        end(tip, V.norm(V.sub(p2[2], p2[1])), [Math.cos(a2), 0, Math.sin(a2)]);
      }
      // foliage down the upper half of the stem, and its own flowering tip
      leafCard(V.lerp(path[2], path[3], 0.6), rand.range(0.8, 1.05), 0.8);
      leafCard(V.add(path[4], [0, 0.1, 0]), rand.range(0.8, 1.05), 0.88);
      end(top, V.norm(V.sub(path[5], path[4])), out);
    }
  },

  shrub(b, rand) {
    // three crossed domes half sunk in the ground: nothing shows between the belt's trunks
    b.crown = [0, 1.2, 0]; b.crownR = [3, 2.4, 3];
    const a0 = rand() * TAU, tiles = [TILE.mapleB, TILE.planeA, TILE.mapleA];
    for (let j = 0; j < 3; j++) {
      const az = a0 + (j * Math.PI) / 3 + rand.range(-0.2, 0.2);
      b.card({ c: [rand.range(-0.4, 0.4), 1.0, rand.range(-0.4, 0.4)], n: [Math.cos(az), 0, Math.sin(az)], w: 7.0, h: 4.8, tile: tiles[j], tone: toneMostly(rand),
        bright: rand.range(0.66, 0.86), trans: 0.15, flutter: 0.02, flip: rand() < 0.5, normal: V.norm([Math.cos(az) * 0.4, 0.85, Math.sin(az) * 0.4]), keep: 2, keepScale: 1, kill: 0 });
    }
  },
};

/** Build one template. Same (species, variant) gives the same tree at every lod (3 = shadow proxy of the near tree). */
export function makeTemplate(species, variant, lod, makeRng) {
  const S = SPEC[species];
  const b = makeBuilder(lod, { mid: S.mid, far: S.far, midLevel: S.midLevel ?? 1 }, makeRng(`trees:tpl:${species}:${variant}:shuffle`));
  BUILD[species](b, makeRng(`trees:tpl:${species}:${variant}`), variant);
  return b.finish();
}
