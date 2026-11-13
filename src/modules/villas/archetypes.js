// The eight Badaguan villa archetypes (docs/DESIGN.md 2.4). Each builder draws one villa into V.S in local space:
// +X right, +Z front (street side), y = 0 at the ground-floor level, the footprint centred on the origin.
import { lin, mul } from './sink.js';
import {
  TRIM, STONE, IRON, opening, wallAB, rectOutline, bays, winRow, shell, band, quoins, cornerBoards, gableRoof, hipRoof, dormer,
  chimney, steps, railing, parapet, column, disc, valley, strip, rafterTails,
} from './parts.js';

const D = Math.PI / 180, PI = Math.PI;
const BRICK = lin('#9a5b45');

/** recessed loggia behind an arcade: back wall, side walls, floor and ceiling. Front wall is at z = zf. */
function loggia(V, x0, x1, zf, depth, h, key, col, backOpen) {
  const S = V.S, zb = zf - depth, dk = mul(col, 0.72);
  wallAB(V, [x0, zb], [x1, zb], 0, h, { key, col: dk, open: backOpen, ao: false });
  wallAB(V, [x0, zf - 0.42], [x0, zb], 0, h, { key, col: dk, ao: false });
  wallAB(V, [x1, zb], [x1, zf - 0.42], 0, h, { key, col: dk, ao: false });
  S.quad('paint', [x0, 0.01, zf], [x1, 0.01, zf], [x1, 0.01, zb], [x0, 0.01, zb], mul(STONE, 0.8));
  S.quad('paint', [x0, h, zb], [x1, h, zb], [x1, h, zf - 0.42], [x0, h, zf - 0.42], mul(TRIM.white, 0.55));
}

// ----------------------------------------------------------------------------------------------------------------------
// A  German Jugendstil: L-plan, jerkinhead roof, half-timbered street gable, canted bay, arched stone door
// ----------------------------------------------------------------------------------------------------------------------
export function archA(V) {
  const { S, rng } = V;
  V.roof = V.mkRoof(rng.pick(['#b5482e', '#b5482e', '#8c3a2a']));
  const st = V.tone(rng.pick(['#DDBE78', '#E0C27A', '#DDBE78', '#E3CB8C']));
  const cream = V.tone('#EFE6CF'), shut = rng.chance(0.75) ? TRIM.green : TRIM.oxblood;
  // per-lot massing: length of the main range, eaves, pitches, bay, dormers, chimneys
  const xL = -8 + rng.pick([0, 0, 0.8, 1.6]), eave = 7.0 + rng.range(-0.3, 0.3), pM = (46 + rng.range(-3, 3)) * D, pW = (52 + rng.range(-3, 2)) * D;
  const hasBay = rng.chance(0.7), nDor = rng.int(1, 2), nBack = rng.int(0, 2), chim2 = rng.chance(0.7), jk = rng.pick([0.32, 0.32, 0.22, 0]);
  const f2 = 3.6, base = { top: 1.2, col: V.G };
  const W = (us, y, w, h, ex) => winRow(V, us, y, w, h, ex);
  const up = { shutters: shut };
  const fl = -xL, bu = (fl - 1.4) / 2, bx = xL + bu;                       // front wall length, bay centre (u and x)
  const O = [[xL, 4.5], [0, 4.5], [0, 6.5], [6, 6.5], [6, -6.5], [xL, -6.5]];
  shell(V, O, eave, base, { key: 'stucco', col: st }, (i, len) => {
    const ivy = V.ivy(i);
    if (i === 0) return { open: [{ u: fl - 1.4, y: 0, w: 1.25, h: 2.6, kind: 'door', arch: 'round', surround: STONE, sw: 0.24, doorCol: shut },
      ...(hasBay ? [] : W([bu], 1.25, 2.0, 1.7, { bars: [3, 2] })),
      ...W([bu - 1.15, bu + 1.15], f2 + 0.9, 1.0, 1.6, up), ...W([fl - 1.4], f2 + 1.2, 0.75, 1.15)] };
    if (i === 1) return {};
    if (i === 2) return { open: [...W([3], 1.25, 2.4, 1.7, { bars: [3, 2] }), ...W([1.9, 4.1], f2 + 0.9, 0.95, 1.6, up)] };
    if (i === 3) return { ivy, open: [...W(bays(len, 3, 1.2), 1.25, 1.05, 1.7), ...W(bays(len, 3, 1.2), f2 + 0.9, 1.0, 1.6, up)] };
    if (i === 4) return { ivy, open: [...W(bays(len, 4, 1), 1.25, 1.05, 1.7), ...W(bays(len, 4, 1), f2 + 0.9, 1.0, 1.6)] };
    return { ivy, open: [...W(bays(len, 3, 1), 1.25, 1.05, 1.7), ...W(bays(len, 3, 1), f2 + 0.9, 1.0, 1.6, up)] };
  });
  const qc = mul(V.G, 1.12);
  quoins(V, [xL, 4.5], [1, 0], [0, -1], 1.3, eave - 0.3, qc);
  quoins(V, [0, 6.5], [1, 0], [0, -1], 1.3, eave - 0.3, qc);
  quoins(V, [6, 6.5], [-1, 0], [0, -1], 1.3, eave - 0.3, qc);
  quoins(V, [6, -6.5], [-1, 0], [0, 1], 1.3, eave - 0.3, qc);
  quoins(V, [xL, -6.5], [1, 0], [0, 1], 1.3, eave - 0.3, qc);
  if (hasBay) { // canted bay
    const B = [[bx - 1.7, 4.5], [bx - 1.0, 5.35], [bx + 1.0, 5.35], [bx + 1.7, 4.5]], by = 3.25;
    for (let i = 0; i < 3; i++) {
      const len = Math.hypot(B[i + 1][0] - B[i][0], B[i + 1][1] - B[i][1]);
      wallAB(V, B[i], B[i + 1], V.yb, by, { key: 'stucco', col: st, bands: [[1.2, 'granite', V.G]],
        open: W([len / 2], 1.25, i === 1 ? 1.4 : 0.6, 1.6, { bars: i === 1 ? [2, 2] : [0, 2] }) });
    }
    const Bo = [[bx - 1.95, 4.5], [bx - 1.1, 5.52], [bx + 1.1, 5.52], [bx + 1.95, 4.5]], Bt = [bx - 1.5, bx - 0.9, bx + 0.9, bx + 1.5];
    for (let i = 0; i < 3; i++) S.fan(V.roof.key, [[Bo[i][0], by, Bo[i][1]], [Bo[i + 1][0], by, Bo[i + 1][1]], [Bt[i + 1], by + 0.75, 4.5], [Bt[i], by + 0.75, 4.5]], [0, 1, 0.3], V.roof.col);
    S.fan('paint', Bo.map((p) => [p[0], by, p[1]]), [0, -1, 0], V.roof.soff);
  }
  steps(V, -1.4, 4.5, 1.9, { cheekCol: V.G });
  // roofs
  const tpM = Math.tan(pM), ridge = eave + 5.5 * tpM;
  const gEnd = { key: 'stucco', col: st, win: { u: 0, y: 0.9, w: 0.9, h: 1.35, shutters: shut } };
  S.frame((xL + 6) / 2, 0, -1, 0, () => gableRoof(V, { len: 6 - xL, span: 11, y: eave, pitch: pM, over: 0.55, rake: 0.45, jerkin: [jk, jk], gable: [gEnd, gEnd] }));
  const tW = Math.tan(pW), vc = valley(eave, tW, 3, 0.45, eave, tpM, 0.55);
  S.frame(3, 0, 3.5, -PI / 2, () => gableRoof(V, { len: 6, span: 6, y: eave, pitch: pW, over: 0.45, rakeR: 0.5, cutL: [4.5 - vc[0] - 3.5, 4.5 - vc[1] - 3.5],
    gable: [null, { key: 'stucco', col: cream, timber: TRIM.brown, sp: 1.0, win: { u: 0, y: 0.8, w: 0.85, h: 1.15, frame: TRIM.brown } }] }));
  const dor = { w: 1.5, h: 1.45, tp: tpM, pitch: 42 * D, key: 'stucco', col: st };
  for (const x of nDor === 1 ? [bx] : [bx - 1.5, bx + 1.5]) S.frame(x, eave + 1.0 * tpM, 3.5, 0, () => dormer(V, dor));
  const bc = (xL + 6) / 2;
  for (const x of nBack === 0 ? [] : nBack === 1 ? [bc] : [bc - 2.6, bc + 2.6]) S.frame(x, eave + 1.0 * tpM, -5.5, PI, () => dormer(V, dor));
  chimney(V, bx + 0.2, -1, ridge - 1.3, ridge + 1.4, 1.15, 0.7, 'stucco', mul(st, 0.92), STONE);
  if (chim2) chimney(V, 4.3, -4.3, eave + 2.2 * tpM - 0.8, eave + 2.2 * tpM + 3.2, 0.8, 0.8, 'stucco', mul(st, 0.92), STONE);
}

// ----------------------------------------------------------------------------------------------------------------------
// B  Castle: rock-faced granite block, crenellated parapet, round corner tower, ground-floor loggia
// ----------------------------------------------------------------------------------------------------------------------
export function archB(V) {
  const { S, rng } = V;
  V.roof = V.mkRoof('#b5482e');
  const g = mul(V.G, rng.range(0.96, 1.06)), f2 = 3.9, f3 = 7.3, deck = 9.5, top = 10.0;
  const fr = rng.chance(0.5) ? TRIM.oxblood : TRIM.green;
  const aw = { arch: 'round', frame: fr, sillCol: mul(STONE, 0.9) };
  const W = (us, y, w, h, ex) => winRow(V, us, y, w, h, { ...aw, ...ex });
  const O = rectOutline(-7, 5, -6, 4.2);
  shell(V, O, top, { top: 0.02, col: mul(g, 0.9) }, { key: 'granite', col: g }, (i, len) => {
    const ivy = V.ivy(i);
    if (i === 0) return { open: [
      ...[1.6, 3.9, 6.2].map((u) => ({ u, y: 0, w: 1.75, h: 2.95, kind: 'void', arch: 'round' })),
      ...W([8.55], 1.0, 0.95, 1.9), ...W([1.6, 3.9, 6.2, 8.55], f2 + 0.9, 1.0, 1.95), ...W([1.6, 3.9, 6.2, 8.55], f3 + 0.75, 0.7, 0.95, { arch: null, bars: [1, 0] })] };
    const n = i === 2 ? 4 : 3;
    return { ivy, open: [...W(bays(len, n, 1), 1.0, 0.95, 1.9), ...W(bays(len, n, 1), f2 + 0.9, 1.0, 1.95), ...W(bays(len, n, 1), f3 + 0.75, 0.7, 0.95, { arch: null, bars: [1, 0] })] };
  });
  loggia(V, -6.55, 0.4, 4.2, 1.9, 3.45, 'granite', g, [{ u: 3.0, y: 0, w: 1.3, h: 2.5, kind: 'door', arch: 'round', doorCol: fr }, ...W([0.9, 5.3], 1.0, 0.9, 1.6)]);
  band(V, O, f2 + 0.1, 0.12, 0.2, mul(STONE, 0.92));
  band(V, O, deck - 0.1, 0.3, 0.26, mul(g, 0.85), true, 'granite');
  parapet(V, O, deck, top, 0.4, 'granite', g, { crenel: 0.6, copKey: 'granite' });
  steps(V, -3.1, 4.2, 2.3, { cheekCol: g });
  chimney(V, rng.pick([-4.2, -1.5]), -3.6, deck, deck + rng.range(1.9, 2.8), 1.0, 0.8, 'granite', g);
  if (rng.chance(0.4)) chimney(V, 2.6, -4.4, deck, deck + 2.0, 0.8, 0.8, 'granite', g);
  // round tower (12-gon)
  const cx = 4.7, cz = 3.55, r = 2.25, n = 12, cone = rng.chance(0.5), th = (cone ? 11.6 : 13.4) + rng.range(-0.5, 0.7);
  const T = Array.from({ length: n }, (_, k) => { const a = -(k + 0.5) * (2 * PI / n); return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });
  for (let i = 0; i < n; i++) {
    const a = T[i], b = T[(i + 1) % n], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const outside = mx > 5.05 || mz > 4.25, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const open = [];
    if (outside && i % 2 === 0) for (const y of [1.3, 5.0, 8.6]) { const yy = y + ((i / 2) % 3) * 0.5; if (yy + 1.6 < th - 0.6) open.push(...W([len / 2], yy, 0.52, 1.5, { bars: [0, 2], sill: false })); }
    wallAB(V, a, b, outside ? V.yb : 6, th + (cone ? 0 : 0.5), { key: 'granite', col: g, open, ao: outside });
  }
  S.cyl('granite', cx, cz, th - 0.55, th - 0.2, r + 0.02, r + 0.2, mul(g, 0.8), { seg: 12, smooth: false });
  S.cyl('granite', cx, cz, th - 0.2, th + 0.02, r + 0.2, r + 0.2, mul(g, 0.95), { seg: 12, smooth: false, top: true });
  if (cone) {
    const R = V.roof, rr = r + 0.45, hh = rr * Math.tan(60 * D);
    S.cyl(R.key, cx, cz, th, th + hh, rr, 0, R.col, { seg: 14 });
    S.cyl('paint', cx, cz, th - 0.08, th, rr - 0.05, rr, R.fascia, { seg: 14, bottom: true });
    S.cyl('paint', cx, cz, th + hh - 0.25, th + hh + 1.0, 0.045, 0.02, IRON, { seg: 5 });
    S.cyl('paint', cx, cz, th + hh - 0.1, th + hh + 0.2, 0.14, 0.03, IRON, { seg: 6 });
  } else {
    const Ti = T.map((p) => [cx + (p[0] - cx) * 1.06, cz + (p[1] - cz) * 1.06]);
    parapet(V, Ti, th + 0.02, th + 0.55, 0.32, 'granite', g, { crenel: 0.55, copKey: 'granite' });
    S.cyl('paint', cx, cz, th, th + 3.4, 0.05, 0.03, mul(TRIM.white, 0.9), { seg: 5 });
  }
}

// ----------------------------------------------------------------------------------------------------------------------
// C  Nordic steep-roof: steep cross gable, corner turret with a needle spire, pale blue / mint render, white trim
// ----------------------------------------------------------------------------------------------------------------------
export function archC(V) {
  const { S, rng } = V;
  V.roof = V.mkRoof(rng.pick(['#b5482e', '#b5482e', '#8c3a2a']));
  V.roof.fascia = TRIM.white;
  const st = V.tone(rng.pick(['#9DBFCB', '#A9CDB5', '#9DBFCB'])), wt = TRIM.white;
  const eave = 5.5, gE = 6.4, tE = 10.0 + rng.range(-0.5, 0.8), f2 = 3.1, base = { top: 0.5, col: V.G };
  const pM = (57 + rng.range(-2.5, 2)) * D, nDor = rng.int(1, 2);
  const tr = { surround: wt, sw: 0.13 };
  const W = (us, y, w, h, ex) => winRow(V, us, y, w, h, { ...tr, ...ex });
  const O = [[-5.5, 4], [-4.6, 4], [-4.6, 4.6], [0.6, 4.6], [0.6, 4], [2.3, 4], [2.3, 5], [4.9, 5], [4.9, 4], [5.5, 4], [5.5, -4.5], [-5.5, -4.5]];
  shell(V, O, eave, base, { key: 'stucco', col: st }, (i, len) => {
    const ivy = V.ivy(i);
    switch (i) {
      case 1: case 3: return { yTop: gE };
      case 2: return { yTop: gE, open: [...W([1.3, 3.9], 0.9, 1.0, 1.65), ...W([2.6], f2 + 0.08, 1.25, 2.15, { sill: false, bars: [1, 3] })] };
      case 4: return { open: [{ u: 0.85, y: 0, w: 1.0, h: 2.3, kind: 'door', doorCol: TRIM.oxblood, glazed: true, surround: wt, sw: 0.12 }] };
      case 5: case 7: return { yTop: tE };
      case 6: return { yTop: tE, open: [...W([1.3], 0.9, 0.85, 1.6), ...W([1.3], f2 + 1.0, 0.85, 1.6), ...W([1.3], 7.3, 0.8, 1.45, { arch: 'round' })] };
      case 9: case 11: return { ivy, open: [...W(bays(len, 2, 1), 0.9, 1.0, 1.65), ...W(bays(len, 2, 1.4), f2 + 0.75, 0.95, 1.3, { bars: [1, 1] })] };
      case 10: return { ivy, open: [...W(bays(len, 3, 1), 0.9, 1.0, 1.65), ...W(bays(len, 3, 1), f2 + 0.75, 0.95, 1.3, { bars: [1, 1] })] };
      default: return {};
    }
  });
  // turret faces above the main roof
  wallAB(V, [4.9, 2.4], [2.3, 2.4], 5.2, tE, { key: 'stucco', col: st, ao: false });
  wallAB(V, [2.3, 2.4], [2.3, 4], 5.2, tE, { key: 'stucco', col: st, ao: false });
  wallAB(V, [4.9, 4], [4.9, 2.4], 5.2, tE, { key: 'stucco', col: st, ao: false, open: W([0.8], 7.3, 0.7, 1.45, { arch: 'round' }) });
  for (const [c, dA, dB, y1] of [[[-5.5, 4], [1, 0], [0, -1], eave], [[-4.6, 4.6], [1, 0], [0, -1], gE], [[0.6, 4.6], [-1, 0], [0, -1], gE], [[2.3, 5], [1, 0], [0, -1], tE],
    [[4.9, 5], [-1, 0], [0, -1], tE], [[5.5, 4], [-1, 0], [0, -1], eave], [[5.5, -4.5], [-1, 0], [0, 1], eave], [[-5.5, -4.5], [1, 0], [0, 1], eave]]) cornerBoards(V, c, dA, dB, 0.5, y1, 0.2, wt);
  band(V, [[2.3, 4], [2.3, 5], [4.9, 5], [4.9, 4]], tE - 0.25, 0.12, 0.22, wt, false);
  // roofs
  const tpM = Math.tan(pM), tG = Math.tan(58 * D), ridge = eave + 4.25 * tpM;
  const gEnd = { key: 'stucco', col: st, win: { u: 0, y: 0.45, w: 0.95, h: 1.5, surround: wt, sw: 0.13 }, vent: true, ventY: 0.62 };
  S.frame(0, 0, -0.25, 0, () => gableRoof(V, { len: 11, span: 8.5, y: eave, pitch: pM, over: 0.45, rake: 0.45, gable: [gEnd, gEnd] }));
  const vc = valley(gE, tG, 2.6, 0.4, eave, tpM, 0.45);
  S.frame(-2, 0, 2.6, -PI / 2, () => gableRoof(V, { len: 4, span: 5.2, y: gE, pitch: 58 * D, over: 0.4, rakeR: 0.5, cutL: [4 - vc[0] - 2.6, 4 - vc[1] - 2.6],
    gable: [null, { key: 'stucco', col: mul(wt, 0.97), timber: rng.chance(0.5) ? st : null, sp: 0.8, win: { u: 0, y: 0.5, w: 0.8, h: 1.3, arch: 'round', frame: wt } }] }));
  S.frame(3.6, 0, 3.7, 0, () => {
    const a = hipRoof(V, { lx: 2.6, lz: 2.6, y: tE, pitch: 48 * D, over: 0.35, maxRise: 0.75, ridge: false });
    const b = hipRoof(V, { lx: a.tx * 2, lz: a.tz * 2, y: a.yT, pitch: 78.5 * D, over: 0, hipW: 0.12 });
    S.cyl('paint', 0, 0, b.yT - 0.3, b.yT + 1.1, 0.05, 0.015, IRON, { seg: 5 });
    S.cyl('paint', 0, 0, b.yT - 0.1, b.yT + 0.12, 0.02, 0.15, IRON, { seg: 6 });
    S.cyl('paint', 0, 0, b.yT + 0.12, b.yT + 0.34, 0.15, 0.02, IRON, { seg: 6 });
  });
  for (const x of nDor === 1 ? [0] : [-2.6, 2.6]) S.frame(x, eave + 0.8 * tpM, -4.5 + 0.8, PI, () => dormer(V, { w: 1.4, h: 1.4, tp: tpM, pitch: 50 * D, key: 'stucco', col: st, win: { frame: wt } }));
  chimney(V, rng.pick([1.3, 1.3, -3.4]), -0.25, ridge - 1.4, ridge + rng.range(1.2, 1.8), 0.75, 0.75, 'stucco', BRICK, mul(BRICK, 0.8));
  // timber balcony on the street gable
  const bx0 = -3.9, bx1 = -0.1, bz = 5.5, by = f2 - 0.1;
  S.box('paint', bx0, bx1, by - 0.14, by, 4.6, bz, wt, '');
  for (const x of [bx0 + 0.3, bx1 - 0.3]) S.beam('paint', [x, by - 0.95, 4.62], [x, by - 0.12, bz - 0.12], 0.1, 0.12, wt, false);
  railing(V, [bx0 + 0.05, bz - 0.05], [bx1 - 0.05, bz - 0.05], by, { h: 0.95, col: wt, sp: 0.2, rw: 0.08, bw: 0.05, posts: 0.1 });
  railing(V, [bx0 + 0.05, 4.6], [bx0 + 0.05, bz - 0.05], by, { h: 0.95, col: wt, sp: 0.2, rw: 0.08, bw: 0.05 });
  railing(V, [bx1 - 0.05, bz - 0.05], [bx1 - 0.05, 4.6], by, { h: 0.95, col: wt, sp: 0.2, rw: 0.08, bw: 0.05 });
  steps(V, 1.45, 4.0, 1.5, { cheeks: false, landing: 1.1 });
  // little hood over the door
  S.slab(V.roof.key, [[0.6, 2.55, 4.85], [2.3, 2.55, 4.85], [2.3, 2.95, 4.0], [0.6, 2.95, 4.0]], 0.1, V.roof.col, 'paint', wt, wt, [0]);
}

// ----------------------------------------------------------------------------------------------------------------------
// D  Spanish: low tiled hip, white-cream walls, three-arch loggia, long iron balcony, stair tower
// ----------------------------------------------------------------------------------------------------------------------
export function archD(V) {
  const { S, rng } = V;
  V.roof = V.mkRoof('#c2603a');
  const st = V.tone(rng.pick(['#F1E9D6', '#F1E9D6', '#EADFC4'])), fr = rng.chance(0.6) ? TRIM.brown : TRIM.green;
  // per-lot massing: length of the main block, eaves, pitch, tower height, chimneys, a rear dormer
  const sh = rng.pick([0, 0, 0.6, 1.2]), xL = -8 + sh, xc = -3 + sh / 2;
  const eave = 7.0 + rng.range(-0.25, 0.25), pitch = rng.range(21, 26) * D, tT = eave + rng.range(3.0, 3.9), chim2 = rng.chance(0.45);
  const f2 = 3.6, base = { top: 0.35, col: V.G };
  const W = (us, y, w, h, ex) => winRow(V, us, y, w, h, { frame: fr, ...ex });
  const O = [[xL, 5], [5.2, 5], [5.2, 4.4], [8, 4.4], [8, 1.2], [5.2, 1.2], [5.2, -5], [xL, -5]];
  const ax = [-2.6, 0, 2.6].map((d) => xc + d - xL), wu = 3.2 - xL;
  shell(V, O, eave, base, { key: 'stucco', col: st }, (i, len) => {
    const ivy = V.ivy(i);
    switch (i) {
      case 0: return { open: [...ax.map((u) => ({ u, y: 0, w: 1.9, h: 2.95, kind: 'void', arch: 'round' })), ...W([wu], 0.95, 1.1, 1.9, { arch: 'round' }),
        ...W(ax, f2 + 0.05, 1.1, 2.25, { sill: false, bars: [1, 3] }), ...W([wu], f2 + 0.9, 1.05, 1.6)] };
      case 1: return {};
      case 2: return { yTop: tT, open: [...W([1.4], 1.2, 0.8, 1.6, { arch: 'round' }), ...W([1.4], 4.7, 0.8, 1.6, { arch: 'round' }), ...W([0.85, 1.95], tT - 2.1, 0.6, 1.25, { arch: 'round', bars: [0, 0], sill: false })] };
      case 3: return { yTop: tT, open: [...W([1.6], 2.6, 0.7, 1.5, { arch: 'round' }), ...W([1.6], 5.6, 0.7, 1.5, { arch: 'round' }), ...W([1.05, 2.15], tT - 2.1, 0.6, 1.25, { arch: 'round', bars: [0, 0], sill: false })] };
      case 4: return { yTop: tT };
      case 5: return { ivy, open: [...W(bays(len, 1, 1.5), 0.95, 1.1, 1.7), ...W(bays(len, 1, 1.5), f2 + 0.9, 1.05, 1.6)] };
      case 6: return { ivy, open: [...W(bays(len, 4, 1), 0.95, 1.1, 1.7), ...W(bays(len, 4, 1), f2 + 0.9, 1.05, 1.6)] };
      default: return { ivy, open: [...W(bays(len, 3, 1), 0.95, 1.1, 1.7), ...W(bays(len, 3, 1), f2 + 0.9, 1.05, 1.6)] };
    }
  });
  wallAB(V, [5.2, 1.2], [5.2, 4.4], eave - 0.7, tT, { key: 'stucco', col: st, ao: false });
  loggia(V, xc - 4.1, xc + 4.0, 5, 2.1, 3.4, 'stucco', st, [{ u: 4.1, y: 0, w: 1.4, h: 2.6, kind: 'door', arch: 'round', doorCol: fr, glazed: true }, ...W([1.5, 6.7], 0.9, 1.0, 1.7, { arch: 'round' })]);
  // long iron balcony over the arcade
  const bx0 = xc - 3.9, bx1 = xc + 3.9, bz = 5.7, by = f2 - 0.08;
  S.box('paint', bx0, bx1, by - 0.12, by, 5, bz, mul(STONE, 1.05), '');
  for (const d of [-3.6, -1.3, 1.3, 3.6]) S.box('paint', xc + d - 0.09, xc + d + 0.09, by - 0.45, by - 0.12, 5, bz - 0.2, mul(STONE, 0.95), 'tb');
  railing(V, [bx0 + 0.04, bz - 0.04], [bx1 - 0.04, bz - 0.04], by, { h: 0.95, sp: 0.15, posts: 0.045 });
  railing(V, [bx0 + 0.04, 5], [bx0 + 0.04, bz - 0.04], by, { h: 0.95, sp: 0.15 });
  railing(V, [bx1 - 0.04, bz - 0.04], [bx1 - 0.04, 5], by, { h: 0.95, sp: 0.15 });
  steps(V, xc, 5, 2.4, { cheekCol: V.G });
  const tp = Math.tan(pitch), mc = (xL + 5.2) / 2;
  S.frame(mc, 0, 0, 0, () => { const o = { lx: 5.2 - xL, lz: 10, y: eave, pitch, over: 0.6 }; hipRoof(V, o); rafterTails(V, o, TRIM.brown); });
  S.frame(6.6, 0, 2.8, 0, () => hipRoof(V, { lx: 2.8, lz: 3.2, y: tT, pitch: 25 * D, over: 0.5 }));
  band(V, [[5.2, 4.4], [8, 4.4], [8, 1.2]], tT - 0.75, 0.1, 0.14, mul(st, 0.9), false);
  // chimneys with a little tiled cap
  chimney(V, xc - 1.2, -2.4, eave + 0.5, eave + 2.6 * tp + rng.range(1.7, 2.3), 0.8, 0.8, 'stucco', st, lin('#b9603f'));
  if (chim2) chimney(V, 2.5, 1.6, eave + 0.5, eave + 2.7 * tp + 1.7, 0.7, 0.7, 'stucco', st, lin('#b9603f'));
}

// ----------------------------------------------------------------------------------------------------------------------
// E  French mansard: symmetrical five bays, white cornice and pilasters, mansard with dormers, columned porch + balcony
// ----------------------------------------------------------------------------------------------------------------------
export function archE(V) {
  const { S, rng } = V;
  V.roof = V.mkRoof(rng.chance(0.5) ? '#8c3a2a' : '#5b5f66');
  const st = V.tone(rng.pick(['#C4BDAF', '#D9B8A0', '#C9BFAE', '#D9B8A0'])), wt = TRIM.white;
  V.roof.fascia = wt;
  const corn = 7.5 + rng.range(-0.25, 0.25), f2 = 3.8, zf = 4.6, base = { top: 0.45, col: V.G };
  const mRise = rng.range(2.75, 3.4), dxs = rng.pick([[-4.25, 0, 4.25], [-4.25, 0, 4.25], [-2.75, 2.75], [-5.5, -2.75, 0, 2.75, 5.5]]);
  const dzs = rng.chance(0.6) ? [-3.2, 1.8] : [-0.7], chx = rng.pick([4.4, 4.4, 2.8]), chh = rng.range(2.0, 2.7);
  const W = (us, y, w, h, ex) => winRow(V, us, y, w, h, { surround: wt, sw: 0.14, ...ex });
  const O = rectOutline(-7, 7, -6, zf), fb = [1.5, 4.25, 7, 9.75, 12.5];
  shell(V, O, corn, base, { key: 'stucco', col: st }, (i, len) => {
    const ivy = V.ivy(i);
    if (i === 0) return { open: [{ u: 7, y: 0, w: 1.5, h: 2.75, kind: 'door', arch: 'seg', doorCol: rng.chance(0.5) ? TRIM.green : TRIM.oxblood, glazed: true, surround: wt, sw: 0.16 },
      ...W([1.5, 4.25, 9.75, 12.5], 0.9, 1.1, 1.95, { arch: 'seg' }), ...W([1.5, 4.25, 9.75, 12.5], f2 + 0.8, 1.1, 1.85), ...W([7], f2 + 0.06, 1.3, 2.5, { sill: false, bars: [1, 3] })] };
    const n = i === 2 ? 5 : 4;
    return { ivy, open: [...W(bays(len, n, 0.9), 0.9, 1.1, 1.95, { arch: 'seg' }), ...W(bays(len, n, 0.9), f2 + 0.8, 1.1, 1.85)] };
  });
  // pilasters
  for (const [c, dA, dB] of [[[-7, zf], [1, 0], [0, -1]], [[7, zf], [-1, 0], [0, -1]], [[7, -6], [-1, 0], [0, 1]], [[-7, -6], [1, 0], [0, 1]]]) cornerBoards(V, c, dA, dB, 0.45, corn - 0.5, 0.5, wt);
  for (const x of [-1.6, 1.6]) S.box('paint', x - 0.22, x + 0.22, 0.45, corn - 0.5, zf, zf + 0.06, wt, 'bdt');
  band(V, O, f2 - 0.05, 0.1, 0.16, wt);
  band(V, O, corn - 0.42, 0.22, 0.16, wt);
  band(V, O, corn - 0.15, 0.62, 0.3, wt);
  // mansard
  const tL = Math.tan(70 * D);
  S.frame(0, 0, (zf - 6) / 2, 0, () => {
    const a = hipRoof(V, { lx: 14, lz: zf + 6, y: corn, pitch: 70 * D, over: 0.12, maxRise: mRise, hipW: 0.2 });
    band(V, rectOutline(-a.tx, a.tx, -a.tz, a.tz), a.yT + 0.02, 0.24, 0.16, mul(V.roof.ridge, 0.9), true, V.roof.key);
    hipRoof(V, { lx: a.tx * 2, lz: a.tz * 2, y: a.yT, pitch: 15 * D, over: 0.02 });
    for (const x of [-chx, chx]) chimney(V, x, 0, a.yT - 0.3, a.yT + chh, 0.75, 1.3, 'stucco', mul(st, 0.95), wt);
  });
  const dz = 0.22, dy = corn + dz * tL;
  const dOpt = { w: 1.35, h: 1.6, tp: tL, style: 'seg', key: 'stucco', col: mul(wt, 0.96), win: { arch: 'seg', w: 0.95, h: 1.3 } };
  for (const x of dxs) S.frame(x, dy, zf - dz, 0, () => dormer(V, dOpt));
  for (const x of dxs) S.frame(x, dy, -6 + dz, PI, () => dormer(V, dOpt));
  for (const z of dzs) {
    S.frame(7 - dz, dy, z, PI / 2, () => dormer(V, dOpt));
    S.frame(-7 + dz, dy, z, -PI / 2, () => dormer(V, dOpt));
  }
  // porch with balcony
  const pd = 1.7, px = 1.95, ph = f2 - 0.35;
  const sg = steps(V, 0, zf, px * 2 + 0.2, { landing: pd + 0.1, cheekCol: V.G });
  for (const x of [-px + 0.25, px - 0.25]) { column(V, x, zf + pd - 0.25, 0, ph, 0.17, wt); column(V, x, zf + 0.2, 0, ph, 0.17, wt); }
  S.box('paint', -px, px, ph, ph + 0.32, zf, zf + pd, wt, 'b');
  S.box('paint', -px - 0.1, px + 0.1, ph + 0.32, ph + 0.42, zf, zf + pd + 0.1, wt, 'b');
  const ry = ph + 0.42, ro = { h: 0.85, col: wt, sp: 0.2, rw: 0.09, bw: 0.06, posts: 0.14 };
  railing(V, [-px, zf + pd], [px, zf + pd], ry, ro);
  railing(V, [-px, zf + 0.05], [-px, zf + pd], ry, { ...ro, posts: 0 });
  railing(V, [px, zf + pd], [px, zf + 0.05], ry, { ...ro, posts: 0 });
  void sg;
}

// ----------------------------------------------------------------------------------------------------------------------
// F  Japanese-modern: long low hip with deep eaves, buff render over a granite ground storey, window bands, flat canopy
// ----------------------------------------------------------------------------------------------------------------------
export function archF(V) {
  const { S, rng } = V;
  V.roof = V.mkRoof('#6a4b3e');
  const st = V.tone(rng.pick(['#D9CBB0', '#D9CBB0', '#E0D2B4'])), br = TRIM.brown;
  V.roof.fascia = mul(br, 0.9); V.roof.soff = mul(lin('#cdbf9f'), 0.6);
  const eave = 6.5 + rng.range(-0.2, 0.25), pitch = rng.range(25.5, 30.5) * D, f2 = 3.3, zf = 4.2, zb = -4.5;
  const W = (us, y, w, h, ex) => winRow(V, us, y, w, h, { frame: br, ...ex });
  const O = rectOutline(-8, 8, zb, zf);
  shell(V, O, eave, { top: f2, col: V.G, ledgeCol: br }, { key: 'stucco', col: st }, (i, len) => {
    const ivy = V.ivy(i);
    if (i === 0) return { open: [{ u: 10.2, y: 0, w: 1.4, h: 2.4, kind: 'door', doorCol: br, glazed: true }, ...W([8.95, 11.45], 0.5, 0.5, 1.9, { bars: [0, 3], sill: false }),
      ...W([2.4, 5.8], 1.05, 2.2, 1.35, { bars: [3, 1] }), ...W([14.1], 1.05, 1.9, 1.35, { bars: [3, 1] }), ...W([2.4, 6.3, 10.2, 13.9], f2 + 0.95, 2.5, 1.3, { bars: [4, 1] })] };
    if (i === 2) return { ivy, open: [...W(bays(len, 4, 1), 1.05, 2.0, 1.35, { bars: [3, 1] }), ...W(bays(len, 4, 1), f2 + 0.95, 2.4, 1.3, { bars: [4, 1] })] };
    return { ivy, open: [...W(bays(len, 2, 1), 1.05, 1.8, 1.35, { bars: [2, 1] }), ...W(bays(len, 2, 1), f2 + 0.95, 2.2, 1.3, { bars: [3, 1] })] };
  });
  band(V, O, eave - 0.2, 0.1, 0.34, br);
  // timber battens on the upper storey
  const batt = (x0, z0, x1, z1) => S.beam('fine', [x0, f2 + 0.05, z0], [x1, eave - 0.3, z1], 0.14, 0.07, br, false);
  const battS = (x, z) => S.beam('fine', [x, f2 + 0.05, z], [x, eave - 0.3, z], 0.07, 0.14, br, false);
  for (const x of [-7.9, -3.65, 0.25, 4.05, 7.9]) batt(x, zf + 0.02, x, zf + 0.02);
  for (const x of [-7.9, -3.5, 0, 3.5, 7.9]) batt(x, zb - 0.02, x, zb - 0.02);
  for (const z of [zb + 0.1, -0.15, zf - 0.1]) { battS(8.02, z); battS(-8.02, z); }
  S.frame(0, 0, (zf + zb) / 2, 0, () => { const o = { lx: 16, lz: zf - zb, y: eave, pitch, over: 0.9 }; hipRoof(V, o); rafterTails(V, o, br, 0.8); });
  const tpF = Math.tan(pitch), cxs = rng.pick([[-5], [5], [-5, 4.2], [-2]]);
  for (const x of cxs) chimney(V, x, -1, eave + 1.1, eave + 3.5 * tpF + rng.range(1.6, 2.1), 0.95, 0.95, 'granite', V.G);
  // flat canopy porch
  const cx0 = 0.3, cx1 = 4.1, cz = zf + 1.9;
  S.box('paint', cx0, cx1, 2.75, 2.95, zf, cz, mul(TRIM.white, 0.92), '');
  S.box('paint', cx0 - 0.06, cx1 + 0.06, 2.95, 3.02, zf, cz + 0.06, br, 'b');
  for (const x of [cx0 + 0.3, cx1 - 0.3]) S.box('granite', x - 0.22, x + 0.22, 0, 2.75, cz - 0.55, cz - 0.11, V.G, 'dt');
  steps(V, 2.2, zf, 3.0, { landing: 1.9, cheeks: false });
}

// ----------------------------------------------------------------------------------------------------------------------
// G  English country: T-plan, cross gables, tall chimneys, timber veranda across the front
// ----------------------------------------------------------------------------------------------------------------------
export function archG(V) {
  const { S, rng } = V;
  V.roof = V.mkRoof(rng.pick(['#b5482e', '#b5482e', '#8c3a2a']));
  const wt = TRIM.white;
  V.roof.fascia = wt;
  const st = V.tone(rng.pick(['#EBD9A0', '#EBD9A0', '#EADFC4']));
  const eave = 7.0 + rng.range(-0.25, 0.25), pG = (42 + rng.range(-2.5, 2.5)) * D, f2 = 3.5, base = { top: 0.8, col: V.G };
  const dxs = rng.pick([[-4.6], [-6.6, -2.6], [-6.6, -2.6], [-7.2, -4.6, -2.0]]), chim3 = rng.chance(0.55);
  const sash = { bars: [2, 3], surround: wt, sw: 0.1 };
  const W = (us, y, w, h, ex) => winRow(V, us, y, w, h, { ...sash, ...ex });
  const O = [[-9, 2.5], [1.5, 2.5], [1.5, 6.5], [8.5, 6.5], [8.5, 2.5], [9, 2.5], [9, -6.5], [-9, -6.5]];
  const dcol = rng.chance(0.5) ? TRIM.green : TRIM.oxblood;
  shell(V, O, eave, base, { key: 'stucco', col: st }, (i, len) => {
    const ivy = V.ivy(i);
    switch (i) {
      case 0: return { open: [{ u: 8.4, y: 0, w: 1.2, h: 2.4, kind: 'door', doorCol: dcol, glazed: true, surround: wt, sw: 0.12 },
        ...W([2.2, 5.3], 0.2, 1.2, 2.3, { sill: false, bars: [1, 3] }), ...W([2.2, 5.3, 8.4], f2 + 0.9, 1.05, 1.75)] };
      case 1: return { open: W([2.2], f2 + 0.9, 1.0, 1.75) };
      case 2: return { open: [...W([3.5], 0.95, 2.7, 1.85, { bars: [5, 3] }), ...W([2.2, 4.8], f2 + 0.9, 1.05, 1.75)] };
      case 3: return { ivy, open: [...W([2], 0.95, 1.05, 1.8), ...W([2], f2 + 0.9, 1.05, 1.75)] };
      case 4: return {};
      case 6: return { ivy, open: [...W(bays(len, 5, 1), 0.95, 1.05, 1.8), ...W(bays(len, 5, 1), f2 + 0.9, 1.05, 1.75)] };
      default: return { ivy, open: [...W(bays(len, 2, 1.2), 0.95, 1.05, 1.8), ...W(bays(len, 2, 1.2), f2 + 0.9, 1.05, 1.75)] };
    }
  });
  const tp = Math.tan(pG), ridge = eave + 4.5 * tp;
  const gEnd = { key: 'stucco', col: st, win: { u: 0, y: 0.7, w: 0.9, h: 1.4, bars: [1, 2], surround: wt, sw: 0.1 } };
  S.frame(0, 0, -2, 0, () => gableRoof(V, { len: 18, span: 9, y: eave, pitch: pG, over: 0.5, rake: 0.45, gable: [gEnd, gEnd] }));
  const vc = valley(eave, tp, 3.5, 0.5, eave, tp, 0.5), timber = rng.chance(0.55);
  S.frame(5, 0, 4, -PI / 2, () => gableRoof(V, { len: 5, span: 7, y: eave, pitch: pG, over: 0.5, rakeR: 0.5, cutL: [2.5 - vc[0] - 4, 2.5 - vc[1] - 4],
    gable: [null, timber ? { key: 'stucco', col: V.tone('#EFE6CF'), timber: TRIM.brown, sp: 1.05, win: { u: 0, y: 0.75, w: 0.8, h: 1.1, frame: TRIM.brown } }
      : { key: 'stucco', col: st, win: { u: 0, y: 0.7, w: 0.9, h: 1.4, bars: [1, 2], surround: wt, sw: 0.1 }, vent: false }] }));
  for (const x of dxs) S.frame(x, eave + 0.9 * tp, 2.5 - 0.9, 0, () => dormer(V, { w: 1.5, h: 1.4, tp, pitch: 40 * D, key: 'stucco', col: st, win: { frame: wt, bars: [1, 2] } }));
  const chT = ridge + rng.range(2.2, 2.9);
  chimney(V, rng.pick([-6.2, -6.2, -3.4]), -2, ridge - 0.9, chT, 0.8, 1.15, 'stucco', BRICK, mul(BRICK, 0.8));
  chimney(V, 7.4, -2, ridge - 0.9, chT, 0.8, 1.15, 'stucco', BRICK, mul(BRICK, 0.8));
  if (chim3) chimney(V, 0.4, -5.2, eave + 0.7, ridge + 1.5, 0.75, 0.75, 'stucco', BRICK, mul(BRICK, 0.8));
  // veranda
  const vx0 = -9, vx1 = 1.5, vz = 5.0, vh = 2.85, wood = lin('#6f5a44');
  S.box('granite', vx0, vx1, V.yb, -0.12, 2.5, vz, V.G, 'bdt');
  S.box('paint', vx0 - 0.05, vx1, -0.12, 0, 2.5, vz + 0.06, wood, 'bd');
  const posts = [-8.85, -6.3, -3.75, -1.2, 1.3];
  for (const x of posts) S.box('paint', x - 0.08, x + 0.08, 0, vh, vz - 0.2, vz - 0.04, wt, 'dt');
  S.box('paint', vx0, vx1, vh, vh + 0.2, vz - 0.22, vz - 0.02, wt, '');
  S.box('paint', vx0, vx0 + 0.16, vh, vh + 0.2, 2.5, vz - 0.22, wt, 'fb');
  for (const x of posts.slice(0, 4)) for (const sgn of [-1, 1]) { if (x + sgn * 0.5 < vx0) continue; S.beam('fine', [x + sgn * 0.08, vh - 0.5, vz - 0.12], [x + sgn * 0.55, vh, vz - 0.12], 0.06, 0.08, wt, false); }
  S.slab(V.roof.key, [[vx0 - 0.35, vh + 0.18, vz + 0.3], [vx1, vh + 0.18, vz + 0.3], [vx1, vh + 0.95, 2.5], [vx0 - 0.35, vh + 0.95, 2.5]], 0.12, V.roof.col, 'paint', mul(wt, 0.7), wt, [0, 3]);
  const ro = { h: 0.85, col: wt, sp: 0.21, rw: 0.08, bw: 0.05 };
  for (let i = 0; i < 3; i++) railing(V, [posts[i] + 0.08, vz - 0.12], [posts[i + 1] - 0.08, vz - 0.12], 0, ro);
  railing(V, [vx0 + 0.08, 2.5], [vx0 + 0.08, vz - 0.2], 0, ro);
  steps(V, 0.05, vz, 2.3, { landing: 0.35, cheeks: false });
}

// ----------------------------------------------------------------------------------------------------------------------
// H  Art Deco: flat roofs, curved corner with ribbon windows, stair tower with a tall strip window, porthole, slab canopy
// ----------------------------------------------------------------------------------------------------------------------
export function archH(V) {
  const { S, rng } = V;
  V.roof = V.mkRoof('#b5482e');
  const grey = rng.chance(0.4), st = V.tone(grey ? '#B8B2A6' : '#EFEADD');
  const fr = rng.pick([TRIM.white, TRIM.green, TRIM.oxblood, lin('#3d5a55')]), acc = grey ? TRIM.white : mul(st, 0.8);
  const top = 7.9 + rng.range(-0.3, 0.35), deck = top - 0.9, tTop = top + rng.range(1.6, 2.7), tDeck = tTop - 0.6, roofTop = rng.pick(['tank', 'tank', 'pent', 'pent', 'none']);
  const f2 = 3.5, R = 3, base = { top: 0.25, col: V.G, ledge: false };
  // the ribbon window of the curved corner is ONE window: lit as a whole per storey, no curtains
  const rib = [0, 1].map(() => ({ lit: rng.chance(0.35), curtain: false, bars: [0, 1], sill: false, fw: 0.05 }));
  const W = (us, y, w, h, ex) => winRow(V, us, y, w, h, { frame: fr, sillCol: acc, ...ex });
  const arc = []; const NS = 6;
  for (let k = 1; k < NS; k++) { const a = PI / 2 - (PI / 2) * (k / NS); arc.push([4 + Math.cos(a) * R, 2 + Math.sin(a) * R]); }
  const O = [[-7, 5], [-3.4, 5], [4, 5], ...arc, [7, 2], [7, -5], [-7, -5], [-7, 1.4]];
  const nA = NS; // arc edges are 2 .. 2+NS-1
  shell(V, O, top, base, { key: 'stucco', col: st, aoTop: 0.86 }, (i, len) => {
    const ivy = V.ivy(i);
    if (i === 0) return { yTop: tTop, open: [{ u: 1.8, y: 0, w: 1.3, h: 2.4, kind: 'door', doorCol: fr, glazed: true }, ...W([1.8], 3.5, 0.95, tTop - 4.6, { bars: [1, 7], sill: false })] };
    if (i === 1) return { open: [...W([1.75, 5.3], 1.0, 2.5, 1.45, { bars: [3, 1] }), ...W([1.75, 5.3], f2 + 1.0, 2.5, 1.45, { bars: [3, 1] })] };
    if (i >= 2 && i < 2 + nA) return { open: [...W([len / 2], 1.0, len - 0.12, 1.45, rib[0]), ...W([len / 2], f2 + 1.0, len - 0.12, 1.45, rib[1])] };
    if (i === 2 + nA) return { ivy, open: [...W(bays(len, 2, 0.8), 1.0, 2.0, 1.45, { bars: [2, 1] }), ...W(bays(len, 2, 0.8), f2 + 1.0, 2.0, 1.45, { bars: [2, 1] })] };
    if (i === 3 + nA) return { ivy, open: [...W(bays(len, 4, 1), 1.0, 1.6, 1.45, { bars: [2, 1] }), ...W(bays(len, 4, 1), f2 + 1.0, 1.6, 1.45, { bars: [2, 1] })] };
    if (i === 4 + nA) return { ivy, open: [...W(bays(len, 2, 1), 1.0, 1.6, 1.45, { bars: [2, 1] }), ...W(bays(len, 2, 1), f2 + 1.0, 1.6, 1.45, { bars: [2, 1] })] };
    return { yTop: tTop, open: W([len / 2], f2 + 1.0, 1.2, 1.45, { bars: [1, 1] }) };
  });
  // stair tower inner faces above the main roof
  wallAB(V, [-3.4, 5], [-3.4, 1.4], deck, tTop, { key: 'stucco', col: st, ao: false });
  wallAB(V, [-3.4, 1.4], [-7, 1.4], deck, tTop, { key: 'stucco', col: st, ao: false });
  const mainO = [[-7, 5], [4, 5], ...arc, [7, 2], [7, -5], [-7, -5]];
  parapet(V, mainO, deck, top, 0.25, 'stucco', st, { copCol: acc });
  parapet(V, rectOutline(-7, -3.4, 1.4, 5), tDeck, tTop, 0.25, 'stucco', st, { copCol: acc });
  // speed lines under the parapet + sill band along the ribbon windows
  const lineO = [[-3.4, 5], [4, 5], ...arc, [7, 2], [7, -5]];
  for (const y of [deck + 0.2, deck + 0.42, deck + 0.64]) band(V, lineO, y, 0.07, 0.07, acc, false);
  band(V, lineO, 0.95, 0.1, 0.1, acc, false); band(V, lineO, f2 + 0.95, 0.1, 0.1, acc, false);
  band(V, [[-7, 1.4], [-7, 5], [-3.4, 5]], tTop - 0.35, 0.07, 0.07, acc, false);
  // porthole + slab canopy + door
  S.frame(-7, 0, 5, 0, () => { disc(S, 3.05, 1.75, 0.03, 0.43, fr); disc(S, 3.05, 1.75, 0.045, 0.33, [1, 1, 1], 'glass'); strip(S, 'fine', 2.72, 1.75, 3.38, 1.75, 0.04, 0.055, fr); strip(S, 'fine', 3.05, 1.42, 3.05, 2.08, 0.04, 0.055, fr); });
  S.box('paint', -6.85, -3.55, 2.62, 2.78, 5, 6.6, mul(TRIM.white, 0.95), '');
  S.box('paint', -6.9, -3.5, 2.78, 2.84, 5, 6.65, acc, 'b');
  S.cyl('paint', -3.8, 6.35, 0, 2.62, 0.05, 0.05, fr, { seg: 6 });
  steps(V, -5.2, 5, 2.4, { landing: 1.3, cheekCol: V.G });
  // pipe rail on the roof terrace (front + curve)
  const railO = [[-3.3, 4.88], [4, 4.88], ...arc.map((p) => [4 + (p[0] - 4) * 0.96, 2 + (p[1] - 2) * 0.96]), [6.88, 2], [6.88, -1]];
  for (let i = 0; i < railO.length - 1; i++) railing(V, railO[i], railO[i + 1], top, { h: 0.55, low: 0.28, sp: 1.3, rw: 0.045, bw: 0.04, col: fr });
  // a stubby stack / water-tank housing on the roof
  if (roofTop === 'tank') {
    S.box('stucco', 2.2, 4.2, deck, deck + 1.5, -3.6, -1.8, mul(st, 0.95), 'd');
    S.box('paint', 2.1, 4.3, deck + 1.5, deck + 1.6, -3.7, -1.7, acc, '');
  } else if (roofTop === 'pent') { // set-back penthouse / sun room on the roof terrace
    const px0 = -2.6, px1 = 3.0, pz0 = -4.4, pz1 = -0.8, ph = 2.7, wk = { key: 'stucco', col: st };
    S.box('stucco', px0, px1, deck, deck + ph, pz0, pz1, mul(st, 0.97), 'dt');
    S.box('paint', px0 - 0.35, px1 + 0.35, deck + ph, deck + ph + 0.14, pz0 - 0.2, pz1 + 0.5, acc, '');
    const pw = { overlay: true, y: 1.0, h: 1.15, frame: fr, sill: false, curtain: false, lit: rng.chance(0.35) };
    S.frame(px0, deck, pz1, 0, () => opening(V, { ...pw, u: (px1 - px0) / 2, w: px1 - px0 - 1.0, bars: [5, 0] }, wk));
    S.frame(px1, deck, pz1, PI / 2, () => opening(V, { ...pw, u: (pz1 - pz0) / 2, w: pz1 - pz0 - 1.2, bars: [2, 0] }, wk));
  }
}

// ----------------------------------------------------------------------------------------------------------------------
// outbuilding: small garage / store in the same materials. Footprint 3.8 x 5.8, doors on +Z.
// ----------------------------------------------------------------------------------------------------------------------
export function outbuilding(V, style, st, doorCol) {
  const { S } = V, hw = 1.9, hd = 2.9, h = 2.7;
  const O = rectOutline(-hw, hw, -hd, hd);
  shell(V, O, h, { top: 0.3, col: V.G, ledge: false }, { key: style === 'B' ? 'granite' : 'stucco', col: style === 'B' ? V.G : st }, (i, len) => {
    if (i === 0) return { open: [{ u: len / 2, y: 0, w: 2.6, h: 2.15, kind: 'garage', doorCol }] };
    if (i === 1) return { open: winRow(V, [len / 2], 1.1, 0.9, 1.0, { bars: [1, 1] }) };
    return {};
  });
  if (style === 'B' || style === 'H') {
    parapet(V, O, h - 0.25, h + 0.3, 0.22, style === 'B' ? 'granite' : 'stucco', style === 'B' ? V.G : st, style === 'B' ? { crenel: 0.4, copKey: 'granite' } : {});
  } else if (style === 'A' || style === 'C' || style === 'G') {
    const g = { key: 'stucco', col: st };
    S.frame(0, 0, 0, -PI / 2, () => gableRoof(V, { len: hd * 2, span: hw * 2, y: h, pitch: (style === 'C' ? 50 : 40) * D, over: 0.35, rake: 0.3, gable: [g, { ...g, vent: true }] }));
  } else {
    hipRoof(V, { lx: hw * 2, lz: hd * 2, y: h, pitch: (style === 'E' ? 35 : 24) * D, over: style === 'F' ? 0.6 : 0.4 });
  }
  // sett apron: ramps from the door threshold down onto the lawn and then follows the ground
  const aw = 1.55, na = 5, al = 2.4, ac = mul(V.G, 0.78), ay = (k) => (k === 0 ? 0 : Math.min(0, V.gy(0, hd + (al * k) / na)) + 0.06);
  for (let k = 0; k < na; k++) {
    const z0 = hd + (al * k) / na, z1 = hd + (al * (k + 1)) / na, y0 = ay(k), y1 = ay(k + 1);
    S.quad('granite', [-aw, y0, z0], [-aw, y1, z1], [aw, y1, z1], [aw, y0, z0], ac);
    for (const sg of [-1, 1]) S.quadO('granite', [sg * aw, y0, z0], [sg * aw, y1, z1], [sg * aw, y1 - 0.45, z1], [sg * aw, y0 - 0.45, z0], [sg, 0, 0], mul(ac, 0.8));
  }
  S.quadO('granite', [-aw, ay(na), hd + al], [aw, ay(na), hd + al], [aw, ay(na) - 0.45, hd + al], [-aw, ay(na) - 0.45, hd + al], [0, 0, 1], mul(ac, 0.8));
}

export const ARCH = { A: archA, B: archB, C: archC, D: archD, E: archE, F: archF, G: archG, H: archH };
