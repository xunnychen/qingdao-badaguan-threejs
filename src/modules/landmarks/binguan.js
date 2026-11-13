// 八大关宾馆: long two-storey hotel block with a three-storey central pavilion, projecting end pavilions, red hipped
// roofs with dormers, cream stucco on a granite base, a central porte-cochère with a balcony, flagpoles on the lawn.
import { lin, mul, WHITE, site, rect } from './kit.js';
import { dormer, chimney } from './parts.js';

const PI = Math.PI;
const CREAM = lin('#EADFC4'), TRIM = lin('#F4F0E6'), BASE = [0.9, 0.89, 0.87], STONE = [0.94, 0.92, 0.88], ROOFC = [0.98, 0.98, 1.0];
const DOOR = lin('#5A3B28'), FRAME = lin('#F2EEE2'), GOLD = lin('#c9a24a');

export function buildBinguan(B, L, env) {
  const S0 = site(L, 0, env.heightAt);
  const F = Math.max(S0.range(-8, 8, 8, 13.5, 4).hi + 1.0, S0.range(-20, -7.5, 20, -6, 6).hi - 0.5), S = site(L, F, env.heightAt);
  B.rng = env.makeRng('landmarks:binguan'); B.litShare = 0.42;
  const E = 7.2, F1 = 3.6, F2 = 7.0, EC = 10.5, PITCH = 30, TAN = Math.tan((PITCH * PI) / 180);
  const lo = S.range(-20.5, -8, 20.5, 14, 8).lo;
  const SUR = { key: 'trim', col: TRIM, w: 0.13, p: 0.04 };
  const Wh = (u, y, w, h, extra) => ({ u, y, w, h, frame: FRAME, fw: 0.06, bars: [1, 2], sur: SUR, sill: STONE, ...extra });
  const bay = (u, plain) => [Wh(u, 0.95, 1.15, 1.9, plain ? { sur: null } : null), Wh(u, F1 + 0.9, 1.15, 1.75, plain ? { sur: null } : null)];
  const mat = (u, y) => (y < 0.02 ? { key: 'granite', col: y < -0.9 ? mul(BASE, 0.72) : BASE } : null);
  const trims = (len, yE, quoin = true) => {
    B.box('trim', 0, F1 - 0.1, 0, len, F1 + 0.1, 0.05, TRIM, { skip: 'b' });
    B.box('trim', 0, yE - 0.34, 0, len, yE - 0.06, 0.1, TRIM, { skip: 'b' });
    B.box('stone', 0, -0.02, 0, len, 0.1, 0.06, STONE, { skip: 'b' });
    if (quoin) for (const u of [0, len - 0.32]) for (let y = 0.2; y < yE - 0.6; y += 0.62) B.box('trim', u, y, 0, u + 0.32, y + 0.4, 0.035, TRIM, { skip: 'b' });
  };
  const cols = [];

  B.frame(L.x, F, L.z, L.rot, () => {
    // ---- main range with end pavilions (one outline) ----------------------------------------------------------------------------
    const PV = 8;   // end pavilions project 1.5 m, so their eave returns read as roofs rather than as stray fascia stubs
    const outl = [[-20, PV], [-14.5, PV], [-14.5, 6.5], [14.5, 6.5], [14.5, PV], [20, PV], [20, -PV], [14.5, -PV], [14.5, -6.5], [-14.5, -6.5], [-14.5, -PV], [-20, -PV]];
    const rearBays = []; for (let k = 0; k < 9; k++) rearBays.push(...bay(2.3 + k * 3.05, true));
    const ops = {
      0: [...bay(1.6), ...bay(3.9)], 4: [...bay(1.6), ...bay(3.9)],
      2: [...bay(2.0), ...bay(4.3), ...bay(6.6), ...bay(22.4), ...bay(24.7), ...bay(27.0)],
      5: [...bay(3.0, true), ...bay(6.3, true), ...bay(9.7, true), ...bay(13.0, true)], 11: [...bay(3.0, true), ...bay(6.3, true), ...bay(9.7, true), ...bay(13.0, true)],
      6: [...bay(1.6, true), ...bay(3.9, true)], 10: [...bay(1.6, true), ...bay(3.9, true)], 8: rearBays,
    };
    B.outline(outl, 0, true, (i, len) => {
      B.wall({ key: 'stucco', col: CREAM, u0: 0, u1: len, y0: lo - 0.5, y1: E, ops: ops[i] || [], aoTop: 0.3, lines: { y: [0.02, -0.9] }, mat, du: 6 });
      trims(len, E, len > 2 && len < 20);
    });
    // main roof: its eaves stop where the end-pavilion roofs take over (valley from the internal corner up to the pavilion
    // ridge), so no eave or fascia runs on through the pavilion walls; the hip ends come down onto the pavilion ridges
    {
      const ov = 0.55, yb = E - ov * TAN, zb = 6.5 + ov, yr = yb + zb * TAN, xe = 14.5 - ov, xr = 20 + ov - zb, xv = 17.25, zv = zb - (xv - xe);
      const yv = yb + (zb - zv) * TAN, sof = mul(TRIM, 0.75), cc = mul(ROOFC, 0.8);
      for (const s of [1, -1]) {
        B.slab('roof', [[-xe, yb, s * zb], [xe, yb, s * zb], [xv, yv, s * zv], [xr, yr, 0], [-xr, yr, 0], [-xv, yv, s * zv]], 0.14, ROOFC, { uk: 'trim', uc: sof, noEdge: true });
        B.polyOut('trim', [[-xe, yb - 0.14, s * zb], [xe, yb - 0.14, s * zb], [xe, yb, s * zb], [-xe, yb, s * zb]], [0, yb, 0], TRIM);
        B.slab('roof', [[s * xr, yr, 0], [s * xv, yv, zv], [s * xv, yv, -zv]], 0.14, ROOFC, { noUnder: true, noEdge: true });
        for (const k of [1, -1]) B.beam('roof', [s * xr, yr + 0.03, 0], [s * xv, yv + 0.03, k * zv], 0.24, 0.1, cc);
      }
      B.beam('roof', [-xr, yr + 0.03, 0], [xr, yr + 0.03, 0], 0.3, 0.14, cc);
    }
    for (const s of [-1, 1]) B.hipRoof(s > 0 ? 14.5 : -20, -PV, s > 0 ? 20 : -14.5, PV, E, PITCH, 0.55, { axis: 'z', col: ROOFC, uc: mul(TRIM, 0.75), ec: TRIM });

    // ---- central three-storey pavilion ------------------------------------------------------------------------------------------
    B.outline(rect(-6, 2, 6, 8), 0, true, (i, len) => {
      const us = [1.6, 3.8, 6, 8.2, 10.4];
      const o = i !== 0 ? [] : [
        { u: 6, y: 0, w: 1.9, h: 2.7, kind: 'door', doorCol: DOOR, frame: FRAME, sur: SUR, glazed: true, glass: 'lit' },
        ...[1.6, 3.8, 8.2, 10.4].map((u) => Wh(u, 0.95, 1.15, 1.9)),
        ...us.map((u) => Wh(u, F1 + 0.05, 1.15, 2.3, { bars: [1, 3], sill: false })),
        ...us.map((u) => Wh(u, F2 + 0.85, 1.1, 1.6)),
      ];
      B.wall({ key: 'stucco', col: CREAM, u0: 0, u1: len, y0: i === 2 ? E : lo - 0.5, y1: EC, ops: o, aoTop: 0.3, lines: { y: [0.02, -0.9] }, mat, du: 6 });
      if (i !== 2) { trims(len, EC, i === 0); B.box('trim', 0, F2 - 0.1, 0, len, F2 + 0.1, 0.05, TRIM, { skip: 'b' }); }
    });
    const cr = B.hipRoof(-6, 2, 6, 8, EC, PITCH, 0.55, { axis: 'x', col: ROOFC, uc: mul(TRIM, 0.75), ec: TRIM });

    // ---- porte-cochère -------------------------------------------------------------------------------------------------------------
    const PX = 4.3, PZ0 = 8, PZ1 = 13.4, CB = 3.2;
    B.box('stucco', -PX, CB, PZ0, PX, F1 - 0.12, PZ1, CREAM, { skip: 'bt', ao: [0.62, 1] });
    B.box('trim', -PX - 0.12, F1 - 0.12, PZ0, PX + 0.12, F1 + 0.06, PZ1 + 0.12, TRIM, { skip: 'b' });
    B.slab('stone', [[-PX, F1 + 0.07, PZ0], [PX, F1 + 0.07, PZ0], [PX, F1 + 0.07, PZ1], [-PX, F1 + 0.07, PZ1]], 0.05, [0.6, 0.59, 0.56], { noUnder: true, noEdge: true });
    const piers = [[-PX + 0.4, PZ1 - 0.4], [-1.5, PZ1 - 0.4], [1.5, PZ1 - 0.4], [PX - 0.4, PZ1 - 0.4], [-PX + 0.4, 10.4], [PX - 0.4, 10.4]];
    for (const [x, z] of piers) {
      const g = S.gy(x, z);
      B.box('granite', x - 0.4, g - 0.4, z - 0.4, x + 0.4, g + 1.0, z + 0.4, BASE, { skip: 'u', ao: [0.65, 1] });
      B.box('stucco', x - 0.32, g + 1.0, z - 0.32, x + 0.32, CB - 0.14, z + 0.32, CREAM, { skip: 'ut' });
      B.box('trim', x - 0.4, CB - 0.14, z - 0.4, x + 0.4, CB, z + 0.4, TRIM, { skip: 't' });
      cols.push([x, z, 0.5]);
    }
    const rl = { h: 0.9, key: 'trim', col: TRIM, step: 0.24, bw: 0.09, rail: [0.18, 0.09] };
    B.balustrade([-PX + 0.1, F1 + 0.07, PZ0 + 0.1], [-PX + 0.1, F1 + 0.07, PZ1 - 0.25], rl);
    B.balustrade([-PX + 0.3, F1 + 0.07, PZ1 - 0.1], [PX - 0.3, F1 + 0.07, PZ1 - 0.1], rl);
    B.balustrade([PX - 0.1, F1 + 0.07, PZ1 - 0.25], [PX - 0.1, F1 + 0.07, PZ0 + 0.1], rl);
    for (const x of [-PX + 0.1, PX - 0.1]) B.box('trim', x - 0.18, F1 + 0.07, PZ1 - 0.28, x + 0.18, F1 + 1.1, PZ1 + 0.08, TRIM, { skip: 'u' });
    // landing and steps under the canopy
    const sg = S.range(-3.4, PZ0, 3.4, PZ0 + 3.5, 3).lo;
    B.box('granite', -3.4, sg - 0.4, PZ0, 3.4, -0.12, PZ0 + 1.0, BASE, { skip: 'bu' });
    B.box('stone', -3.45, -0.12, PZ0, 3.45, 0, PZ0 + 1.05, STONE, { skip: 'bu' });
    let run = 0;
    B.frame(0, 0, PZ0 + 1.0, 0, () => { run = B.stairs('stone', 6.4, (z) => S.gy(0, PZ0 + 1.0 + z), STONE); });

    // ---- dormers, chimneys, flagpoles --------------------------------------------------------------------------------------------
    const dz = 1.7, yb = E + dz * TAN, dopt = { w: 1.3, h: 1.15, tm: TAN, pitch: 38, col: CREAM, trim: TRIM, roofCol: ROOFC };
    for (const x of [-12.6, -10.4, -8.2, 8.2, 10.4, 12.6]) B.frame(x, yb, 6.5 - dz, 0, () => dormer(B, dopt));
    for (const x of [-11, -5.5, 0, 5.5, 11]) B.frame(x, yb, -6.5 + dz, PI, () => dormer(B, dopt));
    for (const x of [-16.2, -8.6, 8.6, 16.2]) chimney(B, x - 0.55, -0.45, x + 0.55, 0.45, 9.6, 12.3, { col: CREAM, pot: lin('#8a4a34'), pots: 3 });
    const FX = -10, FZ = 15.2, fg = S.range(FX - 2.4, FZ - 0.6, FX + 2.4, FZ + 0.6, 3);
    B.box('granite', FX - 2.3, fg.lo - 0.4, FZ - 0.55, FX + 2.3, fg.hi + 0.35, FZ + 0.55, BASE, { skip: 'u', ao: [0.7, 1] });
    B.box('stone', FX - 2.36, fg.hi + 0.35, FZ - 0.61, FX + 2.36, fg.hi + 0.45, FZ + 0.61, STONE);
    for (const dx of [-1.5, 0, 1.5]) {
      const h = dx === 0 ? 9.5 : 8.6;
      B.column('trim', FX + dx, fg.hi + 0.45, FZ, 0.065, h, lin('#d8d8d2'), 6, 0.04);
      B.sphere('trim', FX + dx, fg.hi + 0.45 + h + 0.09, FZ, 0.11, GOLD, 6);
      B.flag(FX + dx, fg.hi + 0.45 + h - 0.12, FZ, 1.45, 0.95, dx === 0 ? 0 : 1);
    }
    void cr;

    const col = env.collision, tag = `landmark:${L.id}`;
    if (col) {
      const box = (x0, z0, x1, z1) => col.addBox(S.wx((x0 + x1) / 2, (z0 + z1) / 2), S.wz((x0 + x1) / 2, (z0 + z1) / 2), (x1 - x0) / 2, (z1 - z0) / 2, L.rot, tag);
      box(-3.5, PZ0, 3.5, PZ0 + 1.0 + run); box(FX - 2.4, FZ - 0.65, FX + 2.4, FZ + 0.65);
      for (const c of cols) col.addCircle(S.wx(c[0], c[1]), S.wz(c[0], c[1]), c[2], tag);
    }
  });
  return { F, S };
}
