// 花石楼: a small granite castle on a knoll above the sea. Local frame: +Z = entrance front (toward the gate on 黄海路),
// +X = the sunlit seaward elevation seen from the south-west lawn, tower on the (+X, -Z) corner (largest world z).
import * as THREE from 'three';
import { lin, mul, mix, vnoise, site, rect } from './kit.js';

const PI = Math.PI;
// Tints are biased cool: the autumn sun (#ffe2b0) turns neutral granite tan, and the brief wants grey granite with
// pink-buff only as an accent. G_BASE is the darker rusticated ground storey, G_DARK the corbels and joints.
const G_GREY = [0.86, 0.95, 1.12], G_WARM = [1.02, 0.93, 0.9], G_LIGHT = [1.04, 1.12, 1.26], G_DARK = [0.55, 0.6, 0.7], G_BUFF = [1.04, 1.0, 1.0];
const G_BASE = [0.7, 0.77, 0.9];
const PEB = [1.06, 1.1, 1.16];
const STONE = [0.98, 0.97, 0.96], DECK = [0.5, 0.49, 0.47], PAVE = [0.78, 0.78, 0.78], STEP = [1.12, 1.08, 1.02];
const LAWN = [0.95, 1, 0.9], BOX = lin('#2f4a2a');
// weathering blotches: a smooth per-vertex tint between a cool dark and a warm light stone
const T_LO = [0.78, 0.83, 0.92], T_HI = [1.1, 1.07, 1.02];
const blotch = (seed, wrap = 0, cell = 1.5) => (u, y) => {
  const n = vnoise(u / cell, y / 1.05, seed, wrap) * 0.7 + vnoise(u / cell * 2 + 7.3, y / 0.5, seed + 3, wrap * 2) * 0.3;
  return mix(T_LO, T_HI, Math.min(1, Math.max(0, (n - 0.2) / 0.6)));
};
const FRAME = lin('#4A3A2C'), COPPER = lin('#4f7a6c'), DOOR = lin('#4a2f1c');

const ball = (x, y, z, r) => { const g = new THREE.SphereGeometry(r, 9, 6); g.scale(1, 0.86, 1); g.translate(x, y, z); return g; };

export function buildHuashilou(B, L, env) {
  const F = L.floorY + 0.4, S = site(L, F, env.heightAt);
  B.rng = env.makeRng('landmarks:huashilou'); B.litShare = 0.3;
  B.uvScale = { granite: 0.62 };
  const TY = -0.15;                                    // terrace level
  const TX0 = -9.4, TX1 = 9.5, TZ0 = -9.0, TZ1 = 10.9;      // 1.1 to 1.5 m of walk around the masses
  const X0 = -8, X1 = 5.2, Z0 = -5, Z1 = 7;            // main block
  const F1 = 3.5, F2 = 7.0, ROOF = 10.5, PAR = 11.2;
  const TWX = 5.2, TWZ = -5, R = 2.9;                  // tower
  const out = { stairs: [] };

  const SUR = { key: 'granite', col: G_LIGHT, w: 0.2, p: 0.06, alt: 0.84 };
  const W = (u, y, w, h, extra) => ({ u, y, w, h, arch: true, frame: FRAME, bars: [1, 1], sur: SUR, sill: STONE, ...extra });
  const pair = (u, y, w, h, extra) => [W(u - w / 2 - 0.19, y, w, h, extra), W(u + w / 2 + 0.19, y, w, h, extra)];

  B.frame(L.x, F, L.z, L.rot, () => {
    // ---- terrace -------------------------------------------------------------------------------------------------------
    const tg = S.range(TX0, TZ0, TX1, TZ1, 8);
    B.outline(rect(TX0, TZ0, TX1, TZ1), 0, true, (i, len) => {
      B.wall({ key: 'granite', col: [0.9, 0.89, 0.87], u0: 0, u1: len, y0: tg.lo - 0.7, y1: TY, du: 5, lines: { y: [TY - 1.4] },
        mat: (u, y) => (y < TY - 1.4 ? { col: [0.68, 0.67, 0.65] } : null) });
      B.box('stone', -0.07, TY - 0.13, -0.5, len + 0.07, TY + 0.001, 0.07, STONE, { skip: 'b' });
      // low parapet with gaps for the two flights of steps
      const gaps = i === 0 ? [[-TX0 - 2.1, -TX0 + 2.1]] : i === 1 ? [[TZ1 - 1.9, TZ1 + 1.9]] : [];
      let u = 0;
      const run = (a, b) => {
        if (b - a < 0.3) return;
        B.box('granite', a, TY, -0.38, b, TY + 0.46, 0, G_GREY, { skip: 'u', ao: [0.72, 1] });
        B.box('stone', a - 0.03, TY + 0.46, -0.43, b + 0.03, TY + 0.55, 0.05, STONE, { skip: 'u' });
      };
      const pier = (a) => {
        B.box('granite', a - 0.28, TY, -0.5, a + 0.28, TY + 0.85, 0.06, G_LIGHT, { skip: 'u', ao: [0.75, 1] });
        B.box('stone', a - 0.33, TY + 0.85, -0.55, a + 0.33, TY + 0.95, 0.11, STONE);
        B.sphere('stone', a, TY + 1.13, -0.22, 0.2, STONE, 8);
      };
      for (const g of gaps) { run(u, g[0] - 0.28); pier(g[0] - 0.28); pier(g[1] + 0.28); u = g[1] + 0.28; }
      run(u, len);
      pier(0.28);
    });
    B.slab('stone', [[TX0, TY, TZ1], [TX1, TY, TZ1], [TX1, TY, TZ0], [TX0, TY, TZ0]], 0.1, PAVE, { noUnder: true, noEdge: true });
    // steps: to the gate path (+Z) and down to the south-west lawn (+X)
    B.frame(0, TY, TZ1, 0, () => {
      const run = B.stairs('stone', 4.2, (z) => S.gy(0, TZ1 + z) - TY, STEP);
      out.stairs.push([0, TZ1 + run / 2, 2.4, run / 2]);
      for (const s of [-1, 1]) B.box('granite', s * 2.28 - 0.2, S.gy(s * 2.3, TZ1 + run) - TY - 0.5, 0, s * 2.28 + 0.2, 0.3, run * 0.82, G_GREY, { skip: 'bu' });
    });
    B.frame(TX1, TY, 0, PI / 2, () => {
      const run = B.stairs('stone', 3.8, (z) => S.gy(TX1 + z, 0) - TY, STEP);
      out.stairs.push([TX1 + run / 2, 0, run / 2, 2.2]);
      for (const s of [-1, 1]) B.box('granite', s * 2.08 - 0.2, S.gy(TX1 + run, -s * 2.1) - TY - 0.5, 0, s * 2.08 + 0.2, 0.3, run * 0.82, G_GREY, { skip: 'bu' });
    });

    // ---- main block ------------------------------------------------------------------------------------------------------
    const wallMat = (len) => (u, y, near) => {
      if (y < 3.28) return { col: G_BASE };
      if (near || u < 0.8 || u > len - 0.8 || y > 9.75 || Math.abs(y - F2) < 0.24 || Math.abs(y - F1) < 0.24) return null;
      return { key: 'pebble', col: PEB };
    };
    const faces = [
      // 0 front (+Z): u = X + 8
      { u0: 0, u1: 13.2, ops: [
        { u: 8, y: 0, w: 1.5, h: 2.9, arch: true, kind: 'door', doorCol: DOOR, glass: 'stained', frame: FRAME, sur: SUR },
        W(11.6, 0.9, 0.9, 2.0),
        W(8, F1 + 0.1, 1.3, 2.5, { bars: [1, 2], sill: false }), W(11.6, F1 + 0.9, 0.9, 1.9),
        W(7.05, F2 + 0.9, 0.7, 1.6), W(8, F2 + 0.9, 0.7, 1.6), W(8.95, F2 + 0.9, 0.7, 1.6), ...pair(2.7, F2 + 0.9, 0.85, 1.7), W(11.6, F2 + 0.9, 0.9, 1.7),
      ] },
      // 1 right (+X, the hero elevation): u = 7 - Z; the tower takes over beyond u = 9.3
      { u0: 0, u1: 9.4, ops: [
        W(6.95, 0, 1.4, 2.8, { bars: [1, 3], sill: false }),
        ...pair(6.95, F1 + 0.05, 0.85, 2.45, { glass: 'stained', sill: false }),
        ...pair(6.95, F2 + 0.9, 0.85, 1.7),
        W(1.65, F2 + 1.0, 0.7, 1.6), W(2.6, F2 + 1.0, 0.7, 1.6, { glass: 'stained' }), W(3.55, F2 + 1.0, 0.7, 1.6),
      ] },
      // 2 back (-Z, the sea side): u = 5.2 - X; the tower covers u < 2.7
      { u0: 2.6, u1: 13.2, ops: [
        W(4.7, 0.9, 0.95, 2.0), W(7.7, 0, 1.3, 2.8, { bars: [1, 3], sill: false }), W(10.8, 0.9, 0.95, 2.0),
        ...pair(4.7, F1 + 0.9, 0.8, 1.9), W(7.7, F1 + 0.6, 1.0, 2.5, { glass: 'stained' }), ...pair(10.8, F1 + 0.9, 0.8, 1.9),
        W(4.7, F2 + 0.9, 0.9, 1.7), W(7.7, F2 + 0.9, 0.9, 1.7), W(10.8, F2 + 0.9, 0.9, 1.7),
      ] },
      // 3 left (-X): u = Z + 5; chimney breast at u 5.3 .. 6.7
      { u0: 0, u1: 12, ops: [
        ...pair(2.7, 0.9, 0.8, 2.0), ...pair(9.5, 0.9, 0.8, 2.0),
        ...pair(2.7, F1 + 0.9, 0.8, 1.9), ...pair(9.5, F1 + 0.9, 0.8, 1.9),
        W(2.7, F2 + 0.9, 0.9, 1.7), W(9.5, F2 + 0.9, 0.9, 1.7),
      ] },
    ];
    B.outline(rect(X0, Z0, X1, Z1), 0, true, (i, len) => {
      const f = faces[i];
      B.wall({ key: 'granite', col: G_GREY, u0: f.u0, u1: f.u1, y0: TY, y1: ROOF - 0.1, ops: f.ops, pad: 0.3, mat: wallMat(len), aoBase: 1.1,
        tint: blotch(11 + i * 5), du: 1.4, dy: 1.0,
        lines: { u: [0.8, len - 0.8], y: [3.28, F1 - 0.24, F1 + 0.24, F2 - 0.24, F2 + 0.24, 9.75] } });
      // string courses, corbel table, crenellated parapet
      for (const y of [F1, F2]) B.box('stone', f.u0, y - 0.1, 0, f.u1, y + 0.1, 0.08, STONE, { skip: 'b' });
      B.box('granite', f.u0, ROOF - 0.38, 0, f.u1, ROOF - 0.1, 0.07, G_LIGHT, { skip: 'b' });
      for (let u = f.u0 + 0.25; u < f.u1 - 0.3; u += 0.62) B.box('granite', u, ROOF - 0.66, 0, u + 0.3, ROOF - 0.38, 0.11, G_DARK, { skip: 'bt' });
      B.box('granite', -0.12, ROOF - 0.1, -0.3, len + 0.12, PAR, 0.12, G_GREY, { ao: [0.8, 1] });
      const n = Math.round((len + 0.24 - 0.6) / 1.1), per = (len + 0.24 - 0.6) / n;
      for (let k = 0; k <= n; k++) B.box('granite', -0.12 + k * per, PAR, -0.3, -0.12 + k * per + 0.6, PAR + 0.6, 0.12, k % 2 ? G_GREY : G_BUFF, { skip: 'u' });
      if (i === 3) { // chimney breast
        B.box('granite', 5.3, TY, 0, 6.7, 12.9, 0.5, G_BUFF, { skip: 'u', ao: [0.7, 1] });
        B.box('granite', 5.3, PAR, -0.4, 6.7, 12.9, 0, G_BUFF, { skip: 'fu' });
        B.box('stone', 5.2, 12.9, -0.5, 6.8, 13.1, 0.6, STONE);
        for (const u of [5.65, 6.35]) B.column('trim', u, 13.1, 0.05, 0.16, 0.55, lin('#8a4a34'), 8, 0.13, false);
      }
    });
    B.slab('stone', [[X0, ROOF, Z1], [X1, ROOF, Z1], [X1, ROOF, Z0], [X0, ROOF, Z0]], 0.1, DECK, { noUnder: true, noEdge: true });
    // stair-head penthouse on the roof terrace
    B.outline(rect(-1.2, -3.9, 2.9, -0.6), 0, true, (i, len) => {
      B.wall({ key: 'granite', col: G_GREY, u0: 0, u1: len, y0: ROOF, y1: 13.1, aoBase: 0.8,
        ops: i === 0 ? [{ u: 1.2, y: ROOF, w: 0.95, h: 2.1, arch: true, kind: 'door', doorCol: DOOR, frame: FRAME, fan: false }, W(3.0, ROOF + 0.8, 0.7, 1.3, { sur: null })] : i === 3 ? [W(len / 2, ROOF + 0.8, 0.7, 1.3, { sur: null })] : [] });
      B.box('granite', -0.1, 13.1, -0.25, len + 0.1, 13.45, 0.1, G_GREY, { skip: 'u' });
      for (let u = 0; u < len - 0.3; u += 1.05) B.box('granite', u - 0.1, 13.45, -0.25, u + 0.45, 13.85, 0.1, G_GREY, { skip: 'u' });
    });
    B.slab('stone', [[-1.2, 13.15, -0.6], [2.9, 13.15, -0.6], [2.9, 13.15, -3.9], [-1.2, 13.15, -3.9]], 0.1, DECK, { noUnder: true, noEdge: true });

    // ---- front wing (two storeys, own crenellated parapet): turns the plan into an L around the entrance court ---------------
    const WX1 = -3.5, WZ = 10.0, WT = 7.45;
    B.outline([[X0, Z1], [X0, WZ], [WX1, WZ], [WX1, Z1]], 0, false, (i, len) => {
      const ops = i === 1 ? [...pair(len / 2, 0.9, 0.8, 2.0), ...pair(len / 2, F1 + 0.85, 0.8, 1.9, { glass: 'stained' })]
        : i === 0 ? [W(len / 2, 0.9, 0.8, 2.0), W(len / 2, F1 + 0.9, 0.8, 1.9)] : [W(len / 2, F1 + 0.9, 0.75, 1.8)];
      B.wall({ key: 'granite', col: G_GREY, u0: 0, u1: len, y0: TY, y1: WT, ops, pad: 0.3, aoBase: 1.1, tint: blotch(55 + i), du: 1.4, dy: 1.0,
        lines: { u: [0.6, len - 0.6], y: [3.28, F1 + 0.24, WT - 0.5] },
        mat: (u, y, near) => (y < 3.28 ? { col: G_BASE } : near || u < 0.6 || u > len - 0.6 || y > WT - 0.5 || y < F1 + 0.24 ? null : { key: 'pebble', col: PEB }) });
      B.box('stone', 0, F1 - 0.1, 0, len, F1 + 0.1, 0.08, STONE, { skip: 'b' });
      for (let u = 0.25; u < len - 0.3; u += 0.62) B.box('granite', u, WT - 0.28, 0, u + 0.3, WT, 0.11, G_DARK, { skip: 'bt' });
      B.box('granite', -0.12, WT, -0.3, len + 0.12, WT + 0.5, 0.12, G_GREY, { ao: [0.8, 1] });
      const n = Math.max(1, Math.round((len + 0.24 - 0.55) / 1.05));
      for (let k = 0; k <= n; k++) { const u = -0.12 + ((len + 0.24 - 0.55) * k) / n; B.box('granite', u, WT + 0.5, -0.3, u + 0.55, WT + 0.98, 0.12, k % 2 ? G_GREY : G_BUFF, { skip: 'u' }); }
    });
    B.slab('stone', [[X0, WT + 0.05, WZ], [WX1, WT + 0.05, WZ], [WX1, WT + 0.05, Z1], [X0, WT + 0.05, Z1]], 0.1, DECK, { noUnder: true, noEdge: true });

    // ---- raised lawn beds on the terrace (granite kerb, turf, clipped box) --------------------------------------------------------
    const bed = (x0, z0, x1, z1, balls) => {
      B.box('granite', x0, TY, z0, x1, TY + 0.32, z1, G_GREY, { skip: 'u', ao: [0.75, 1] });
      B.box('stone', x0 - 0.03, TY + 0.32, z0 - 0.03, x1 + 0.03, TY + 0.38, z1 + 0.03, STONE, { skip: 'u' });
      B.poly('grass', [[x0 + 0.28, TY + 0.385, z1 - 0.28], [x1 - 0.28, TY + 0.385, z1 - 0.28], [x1 - 0.28, TY + 0.385, z0 + 0.28], [x0 + 0.28, TY + 0.385, z0 + 0.28]], LAWN);
      for (const [bx, bz, r] of balls) B.addGeo('trim', ball(bx, TY + 0.38 + r * 0.82, bz, r), (x, y) => mul(BOX, 0.55 + 0.9 * Math.min(1, Math.max(0, (y - TY - 0.4) / (r * 1.7)))));
    };
    bed(3.3, 8.3, TX1 - 0.4, TZ1 - 0.4, [[4.3, 9.4, 0.5], [6.3, 9.45, 0.62], [8.2, 9.4, 0.5]]);
    bed(-8.4, TZ0 + 0.4, 1.4, -6.5, [[-7.3, -7.6, 0.55], [-3.5, -7.6, 0.7], [0.3, -7.6, 0.55]]);

    // ---- half-octagon bay on the seaward elevation (2 storeys, stained glass) -----------------------------------------------
    const bay = [[X1, 6.6], [7.15, 5.6], [7.15, 3.2], [X1, 2.2]], BAYT = 7.45;
    B.outline(bay, 0, false, (i, len) => {
      const w = i === 1 ? 1.0 : 0.8;
      B.wall({ key: 'granite', col: G_BUFF, u0: 0, u1: len, y0: TY, y1: BAYT, aoBase: 1.1, pad: 0.22, lines: { y: [3.0, 4.1] },
        mat: (u, y, near) => (y > 3.0 && y < 4.1 && !near ? { key: 'pebble', col: PEB } : y < 0.6 ? { col: G_BASE } : null),
        ops: [W(len / 2, 0.75, w, 2.15, { glass: 'stained', bars: [0, 0] }), W(len / 2, F1 + 0.75, w, 2.2, { glass: 'stained', bars: [0, 0] })] });
      B.box('stone', 0, F1 - 0.1, 0, len, F1 + 0.1, 0.08, STONE, { skip: 'b' });
      B.box('granite', -0.1, BAYT, -0.3, len + 0.1, BAYT + 0.5, 0.1, G_GREY);
      const n = Math.max(1, Math.round((len - 0.5) / 1.05));
      for (let k = 0; k <= n; k++) { const u = -0.05 + ((len + 0.1 - 0.5) * k) / n; B.box('granite', u, BAYT + 0.5, -0.3, u + 0.5, BAYT + 0.95, 0.1, G_GREY, { skip: 'u' }); }
    });
    B.slab('stone', [[X1, BAYT + 0.05, 6.6], [7.15, BAYT + 0.05, 5.6], [7.15, BAYT + 0.05, 3.2], [X1, BAYT + 0.05, 2.2]], 0.1, DECK, { noUnder: true, noEdge: true });

    // ---- first-floor balcony between the bay and the tower -----------------------------------------------------------------
    B.seg(X1, Z1, X1, Z0, 0, () => {
      B.box('stone', 4.95, F1 - 0.2, 0, 9.05, F1, 1.25, STONE, { skip: 'b' });
      for (const u of [5.3, 6.95, 8.6]) {
        B.box('granite', u - 0.16, F1 - 0.75, 0, u + 0.16, F1 - 0.2, 0.55, G_LIGHT, { skip: 'bt' });
        B.box('granite', u - 0.16, F1 - 0.45, 0.55, u + 0.16, F1 - 0.2, 1.05, G_LIGHT, { skip: 'bt' });
      }
      B.balustrade([5.0, F1, 1.13], [9.0, F1, 1.13], { h: 0.85, key: 'stone', col: STONE, step: 0.27, bw: 0.1, rail: [0.2, 0.1] });
    });

    // copper rainwater pipes and hopper heads
    for (const [px, pz] of [[X1 + 0.09, 6.8], [X1 - 0.5, Z1 + 0.09], [X0 - 0.09, Z0 + 0.5], [X0 + 0.5, Z0 - 0.09]]) {
      B.column('trim', px, TY, pz, 0.055, ROOF - 0.3 - TY, COPPER, 6);
      B.box('trim', px - 0.13, ROOF - 0.5, pz - 0.13, px + 0.13, ROOF - 0.2, pz + 0.13, mul(COPPER, 0.9));
    }

    // ---- entrance porch (round arches on stubby columns, balustraded balcony above) ---------------------------------------
    const PX = 2.2, PZ = 9.3, PT = 0.45, PH = 3.5;
    const voidOp = (u, w, h) => ({ u, y: 0, w, h, arch: true, kind: 'void', rev: PT, n: 10, sur: { key: 'granite', col: G_LIGHT, w: 0.24, p: 0.07, alt: 0.84 } });
    B.outline([[-PX, Z1], [-PX, PZ], [PX, PZ], [PX, Z1]], 0, false, (i, len) => {
      B.wall({ key: 'granite', col: G_BUFF, u0: 0, u1: len, y0: TY, y1: PH, aoBase: 1.0, tint: blotch(41 + i), du: 1.2, dy: 1.0, ops: [i === 1 ? voidOp(len / 2, 2.7, 3.0) : voidOp(1.15, 1.4, 2.6)] });
      B.box('stone', -0.08, PH - 0.12, 0, len + 0.08, PH + 0.08, 0.1, STONE, { skip: 'b' });
    });
    const inner = (u, w, h) => ({ u, y: 0, w, h, arch: true, kind: 'void', rev: 0.001, n: 10 });
    B.outline([[PX - PT, Z1], [PX - PT, PZ - PT], [-PX + PT, PZ - PT], [-PX + PT, Z1]], 0, false, (i, len) => {
      B.wall({ key: 'granite', col: mul(G_WARM, 0.62), u0: 0, u1: len, y0: 0, y1: PH - 0.3, ops: [i === 1 ? inner(len / 2, 2.7, 3.0) : inner(i === 0 ? 1.15 : len - 1.15, 1.4, 2.6)] });
    });
    B.poly('granite', [[-PX, PH - 0.3, Z1], [PX, PH - 0.3, Z1], [PX, PH - 0.3, PZ], [-PX, PH - 0.3, PZ]], mul(G_WARM, 0.5));
    B.box('stone', -PX - 0.1, TY, Z1, PX + 0.1, 0, PZ + 0.35, STONE, { skip: 'bu' });
    B.box('stone', -1.6, TY - 0.0, PZ + 0.35, 1.6, -0.07, PZ + 0.65, STONE, { skip: 'bu' });
    for (const s of [-1, 1]) {
      const cx = s * (PX - 0.12), cz = PZ - 0.12;
      B.box('granite', cx - 0.5, 0, cz - 0.5, cx + 0.5, 0.6, cz + 0.5, G_GREY, { skip: 'u', ao: [0.75, 1] });
      B.column('granite', cx, 0.6, cz, 0.4, 1.45, G_BUFF, 12, 0.36);
      B.box('stone', cx - 0.5, 2.05, cz - 0.5, cx + 0.5, 2.3, cz + 0.5, STONE);
    }
    B.slab('stone', [[-PX, PH + 0.02, Z1], [PX, PH + 0.02, Z1], [PX, PH + 0.02, PZ], [-PX, PH + 0.02, PZ]], 0.1, DECK, { noUnder: true, noEdge: true });
    const rail = { h: 0.85, key: 'stone', col: STONE, step: 0.27, bw: 0.1, rail: [0.2, 0.1] };
    B.balustrade([-PX + 0.12, PH, Z1], [-PX + 0.12, PH, PZ - 0.2], rail);
    B.balustrade([-PX + 0.3, PH, PZ - 0.12], [PX - 0.3, PH, PZ - 0.12], rail);
    B.balustrade([PX - 0.12, PH, PZ - 0.2], [PX - 0.12, PH, Z1], rail);
    for (const s of [-1, 1]) {
      B.box('granite', s * (PX - 0.12) - 0.2, PH, PZ - 0.32, s * (PX - 0.12) + 0.2, PH + 1.0, PZ + 0.08, G_LIGHT, { skip: 'u' });
      B.sphere('stone', s * (PX - 0.12), PH + 1.2, PZ - 0.12, 0.2, STONE, 8);
    }

    // ---- round tower ---------------------------------------------------------------------------------------------------------
    const tgr = S.range(TWX - 3.5, TWZ - 3.5, TWX + 3.5, TWZ + 3.5, 4);
    const LV = [TY, F1, F2, 10.3, 13.2, 15.2];
    const deg = (a) => (a * PI / 180) * R;
    B.cyl(TWX, 0, TWZ, R, (C) => {
      const bands = [
        { col: G_BASE, wins: [[150, 0.9, 0.75, 1.9, 0], [245, 0.9, 0.75, 1.9, 0]] },
        { col: G_GREY, wins: [[112, 0.85, 0.75, 1.9, 1], [198, 0.85, 0.75, 1.9, 0], [288, 0.85, 0.7, 1.7, 0]] },
        { col: G_GREY, peb: true, wins: [[160, 0.8, 0.75, 1.9, 1], [250, 0.8, 0.75, 1.9, 0], [75, 0.8, 0.7, 1.7, 0]] },
        { col: G_LIGHT, wins: [[122, 0.6, 0.75, 1.8, 0], [212, 0.6, 0.75, 1.8, 1], [300, 0.6, 0.75, 1.8, 0], [32, 0.6, 0.75, 1.8, 0]] },
        { col: G_GREY, wins: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [22.5 + k * 45, 0.35, 0.8, 1.35, 0]) },
      ];
      bands.forEach((b, i) => {
        const y0 = LV[i], y1 = LV[i + 1];
        B.wall({ key: 'granite', col: b.col, u0: 0, u1: C, y0, y1, du: C / 32, dy: 1.0, tint: blotch(71 + i, 12, C / 12), smooth: true, pad: b.peb ? 0.28 : 0, aoBase: i === 0 ? 1.1 : 0,
          lines: b.peb ? { y: [y0 + 0.3, y1 - 0.3] } : undefined,
          mat: b.peb ? (u, y, near) => (near || y < y0 + 0.3 || y > y1 - 0.3 ? null : { key: 'pebble', col: PEB }) : null,
          ops: b.wins.map((w) => W(deg(w[0]), (i === 0 ? 0 : y0) + w[1], w[2], w[3], { glass: w[4] ? 'stained' : undefined, bars: i === 4 ? [0, 0] : [1, 1], n: 6,
            lit: i === 4 ? false : undefined, sur: { key: 'granite', col: G_LIGHT, w: 0.18, p: 0.06, alt: 0.84 } })) });
        if (i > 0) B.box('stone', 0, y0 - 0.1, 0, C, y0 + 0.1, 0.09, STONE, { nu: 32, skip: 'blr' });
      });
      // battered base, corbel ring, crenellated parapet
      B.box('granite', 0, tgr.lo - 0.8, 0, C, TY, 0.02, G_DARK, { nu: 32, skip: 'bulrt' });
      B.box('granite', 0, TY, 0, C, 0.4, 0.2, G_DARK, { nu: 32, skip: 'bulr' });
      const nb = 26;
      for (let k = 0; k < nb; k++) { const u = (C * (k + 0.5)) / nb; B.box('granite', u - 0.15, 14.72, 0, u + 0.15, 15.12, 0.22, G_DARK, { skip: 'bt' }); }
      B.box('granite', 0, 15.12, 0, C, 15.45, 0.3, G_LIGHT, { nu: 32, skip: 'blr' });
      B.box('granite', 0, 15.45, -0.14, C, 15.95, 0.3, G_GREY, { nu: 32, skip: 'ulr' });
      const nm = 18, per = C / nm;
      for (let k = 0; k < nm; k++) B.box('granite', k * per, 15.95, -0.14, k * per + per * 0.56, 16.65, 0.3, k % 2 ? G_GREY : G_BUFF, { nu: 2, skip: 'u' });
    }, -PI / 4);
    const disc = [];
    for (let k = 0; k < 24; k++) { const a = (k / 24) * PI * 2; disc.push([TWX + Math.sin(a) * (R - 0.1), 15.5, TWZ + Math.cos(a) * (R - 0.1)]); }
    B.slab('stone', disc, 0.1, DECK, { noUnder: true, noEdge: true });
    B.column('trim', TWX, 15.5, TWZ, 0.3, 0.5, lin('#55524c'), 8, 0.12, false);
    B.column('trim', TWX, 16.0, TWZ, 0.06, 5.0, lin('#3a3c3a'), 6, 0.04);
    B.sphere('trim', TWX, 21.05, TWZ, 0.13, COPPER, 8);
    B.flag(TWX, 20.85, TWZ, 1.5, 1.0, 0);

    // ---- low granite garden wall toward the sea ------------------------------------------------------------------------------
    out.seawall = [[21.5, -7.5], [20, -13.2], [9.5, -18.4], [-5, -22], [-17, -20.5]];
    for (let i = 0; i < out.seawall.length - 1; i++) {
      const a = out.seawall[i], b = out.seawall[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.4);
      for (let k = 0; k < n; k++) {
        const ax = a[0] + ((b[0] - a[0]) * k) / n, az = a[1] + ((b[1] - a[1]) * k) / n, bx = a[0] + ((b[0] - a[0]) * (k + 1)) / n, bz = a[1] + ((b[1] - a[1]) * (k + 1)) / n;
        const g0 = S.gy(ax, az), g1 = S.gy(bx, bz), top = (g0 + g1) / 2 + 0.72;
        B.seg(ax, az, bx, bz, 0, (len) => {
          B.box('granite', -0.02, Math.min(g0, g1) - 0.5, -0.24, len + 0.02, top, 0.24, G_GREY, { skip: 'u', ao: [0.6, 1] });
          B.box('stone', -0.04, top, -0.3, len + 0.04, top + 0.1, 0.3, STONE, { skip: 'u' });
        });
        if (k === 0) {
          B.box('granite', ax - 0.36, g0 - 0.5, az - 0.36, ax + 0.36, g0 + 1.05, az + 0.36, G_GREY, { skip: 'u', ao: [0.6, 1] });
          B.box('stone', ax - 0.42, g0 + 1.05, az - 0.42, ax + 0.42, g0 + 1.17, az + 0.42, STONE);
        }
      }
    }
    const e = out.seawall[out.seawall.length - 1], ge = S.gy(e[0], e[1]);
    B.box('granite', e[0] - 0.36, ge - 0.5, e[1] - 0.36, e[0] + 0.36, ge + 1.05, e[1] + 0.36, G_GREY, { skip: 'u', ao: [0.6, 1] });
    B.box('stone', e[0] - 0.42, ge + 1.05, e[1] - 0.42, e[0] + 0.42, ge + 1.17, e[1] + 0.42, STONE);
  });

  B.uvScale = {};
  // ---- colliders ---------------------------------------------------------------------------------------------------------
  const col = env.collision, tag = `landmark:${L.id}`;
  if (col) {
    col.removeTag(tag);
    const cx = (TX0 + TX1) / 2, cz = (TZ0 + TZ1) / 2;
    col.addBox(S.wx(cx, cz), S.wz(cx, cz), (TX1 - TX0) / 2, (TZ1 - TZ0) / 2, L.rot, tag);
    for (const s of out.stairs) col.addBox(S.wx(s[0], s[1]), S.wz(s[0], s[1]), s[2], s[3], L.rot, tag);
    col.addPolyline(out.seawall.map((p) => [S.wx(p[0], p[1]), S.wz(p[0], p[1])]), 0.32, tag);
  }
  return { F, S };
}
