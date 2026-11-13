// 公主楼: Danish fairy-tale villa. Teal stucco, white trim, very steep red cross-gable roof, green needle spire on
// the front-right (south-east) corner. Local +Z = front, facing 居庸关路 to the south.
import { lin, mul, WHITE, site, rect } from './kit.js';
import { dormer, chimney, plinth, grow } from './parts.js';

const PI = Math.PI;
// Pre-compensated: mid-tone tints come out about half as bright and much more saturated after the stucco map, lighting and
// ACES, so the vertex tint is lighter and greyer than the palette value it should land on (#5FA79B lit, #4C8C84 shade).
const TEAL = lin('#78c8c0'), TRIM = lin('#F3EFE4'), ROOFC = [0.84, 0.84, 0.92], PLINTH = [0.78, 0.78, 0.78];
const DOOR = lin('#6B3F26'), TIMBER = lin('#7a4a2c'), SPIRE = lin('#6aa894'), STONE = [0.92, 0.9, 0.86], GOLD = lin('#c9a24a');

export function buildGongzhulou(B, L, env) {
  const g0 = site(L, 0, env.heightAt).range(-6, -5, 6, 5.5, 6);
  const F = g0.hi + 0.3, S = site(L, F, env.heightAt);
  B.rng = env.makeRng('landmarks:gongzhulou'); B.litShare = 0.4;
  const X0 = -5.6, X1 = 4.6, Z0 = -4.8, Z1 = 3.4, E = 5.5, F1 = 3.0;
  const TM = Math.tan((57 * PI) / 180), HALF = (Z1 - Z0) / 2, YA = E + HALF * TM;
  const TC = Math.tan((60 * PI) / 180), CX0 = -5.4, CX1 = -0.6, CZ = 5.0, YC = E + ((CX1 - CX0) / 2) * TC;
  const lo = S.range(-6, -5, 6, 6, 6).lo;
  const SUR = { key: 'trim', col: TRIM, w: 0.14, p: 0.04 };
  const Wn = (u, y, w, h, extra) => ({ u, y, w, h, frame: TRIM, fw: 0.06, bars: [1, 2], sur: SUR, sill: TRIM, sillKey: 'trim', ...extra });
  const corners = (len, y1, y0 = 0) => {
    B.box('trim', 0, y0, 0, 0.2, y1, 0.035, TRIM, { skip: 'bu' });
    B.box('trim', len - 0.2, y0, 0, len, y1, 0.035, TRIM, { skip: 'bu' });
  };
  const belt = (len, y = F1) => B.box('trim', 0, y - 0.09, 0, len, y + 0.09, 0.04, TRIM, { skip: 'b' });
  const barge = (half, yE, yTop, tan, ov = 0.3) => {
    for (const s of [-1, 1]) B.beam('trim', [half - s * (half + 0.36), yE - 0.36 * tan + 0.02, ov], [half, yTop + 0.02, ov], 0.07, 0.27, TRIM, { anchor: 't' });
  };

  B.frame(L.x, F, L.z, L.rot, () => {
    // ---- main block ------------------------------------------------------------------------------------------------------
    const gable = [[0, E], [HALF, YA], [2 * HALF, E]];
    const faces = [
      { ops: [{ u: 6.4, y: 0, w: 1.1, h: 2.25, kind: 'door', doorCol: DOOR, frame: TRIM, sur: SUR, glazed: true }, Wn(6.4, F1 + 0.95, 0.9, 1.25)] },
      { top: gable, ops: [Wn(3.3, 0.95, 1.0, 1.5), Wn(6.3, 0.95, 1.0, 1.5), Wn(3.3, F1 + 0.9, 0.9, 1.3), Wn(6.3, F1 + 0.9, 0.9, 1.3), Wn(4.1, 6.7, 1.0, 1.4), Wn(4.1, 9.3, 0.5, 0.75, { bars: [1, 1] })] },
      { ops: [Wn(2, 0.95, 1.0, 1.5), Wn(5.1, 0.95, 1.0, 1.5), Wn(8.2, 0.95, 1.0, 1.5), Wn(2, F1 + 0.9, 0.9, 1.3), Wn(5.1, F1 + 0.9, 0.9, 1.3), Wn(8.2, F1 + 0.9, 0.9, 1.3)] },
      { top: gable, ops: [Wn(2.0, 0.95, 1.0, 1.5), Wn(5.4, 0.95, 1.0, 1.5), Wn(2.0, F1 + 0.9, 0.9, 1.3), Wn(5.4, F1 + 0.9, 0.9, 1.3), Wn(4.1, 6.7, 1.0, 1.4), Wn(4.1, 9.3, 0.5, 0.75, { bars: [1, 1] })] },
    ];
    B.outline(rect(X0, Z0, X1, Z1), 0, true, (i, len) => {
      const f = faces[i];
      B.wall({ key: 'stucco', col: TEAL, u0: 0, u1: len, y0: 0, y1: E, top: f.top, ops: f.ops, aoBase: 0.9, aoTop: f.top ? 0 : 0.3 });
      corners(len, E); belt(len);
      if (f.top) { barge(HALF, E, YA, TM); B.box('trim', 0.2, E - 0.08, 0, len - 0.2, E + 0.08, 0.035, TRIM, { skip: 'b' }); }
    });
    plinth(B, grow(X0, Z0, X1, Z1, 0), true, lo, 0, PLINTH);
    B.hipRoof(X0, Z0, X1, Z1, E, 57, 0.35, { axis: 'x', gable: [true, true], ovG: 0.3, col: ROOFC, uc: mul(TRIM, 0.7), ec: TRIM });

    // ---- front cross gable ------------------------------------------------------------------------------------------------
    const cw = CX1 - CX0;
    B.seg(CX0, CZ, CX1, CZ, 0, (len) => {
      B.wall({ key: 'stucco', col: TEAL, u0: 0, u1: len, y0: 0, top: [[0, E], [cw / 2, YC], [cw, E]], aoBase: 0.9,
        ops: [Wn(cw / 2, 0.85, 2.3, 1.6, { bars: [3, 2] }), Wn(cw / 2, F1 + 0.04, 1.15, 2.1, { bars: [1, 3], sill: false }), Wn(cw / 2, 6.55, 0.8, 1.2), Wn(cw / 2, 8.25, 0.34, 0.5, { bars: [0, 0], sur: null })] });
      corners(len, E); belt(len); barge(cw / 2, E, YC, TC);
      // timber balcony
      B.box('trim', 0.55, F1 - 0.14, 0, len - 0.55, F1, 1.0, TIMBER, { skip: 'b' });
      for (const u of [0.75, len - 0.75]) B.beam('trim', [u, F1 - 0.85, 0.03], [u, F1 - 0.14, 0.8], 0.09, 0.09, TIMBER);
      const rl = { h: 0.92, col: TIMBER, step: 0.15, bw: 0.04, rail: [0.09, 0.07] };
      B.balustrade([0.6, F1, 0.94], [len - 0.6, F1, 0.94], rl);
      B.balustrade([0.6, F1, 0.02], [0.6, F1, 0.94], rl);
      B.balustrade([len - 0.6, F1, 0.94], [len - 0.6, F1, 0.02], rl);
      for (const u of [0.6, len - 0.6]) B.beam('trim', [u, F1, 0.94], [u, F1 + 1.0, 0.94], 0.1, 0.1, TIMBER);
    });
    B.seg(CX0, Z1, CX0, CZ, 0, (len) => { B.wall({ key: 'stucco', col: TEAL, u0: 0, u1: len, y0: 0, y1: E, aoBase: 0.9, aoTop: 0.3 }); belt(len); B.box('trim', len - 0.2, 0, 0, len, E, 0.035, TRIM, { skip: 'bu' }); });
    B.seg(CX1, CZ, CX1, Z1, 0, (len) => { B.wall({ key: 'stucco', col: TEAL, u0: 0, u1: len, y0: 0, y1: E, aoBase: 0.9, aoTop: 0.3 }); belt(len); B.box('trim', 0, 0, 0, 0.2, E, 0.035, TRIM, { skip: 'bu' }); });
    plinth(B, [[CX0, Z1], [CX0, CZ], [CX1, CZ], [CX1, Z1]], false, lo, 0, PLINTH);
    B.hipRoof(CX0, 0.75, CX1, CZ, E, 60, 0.3, { axis: 'z', gable: [true, true], ovG: 0.3, col: ROOFC, uc: mul(TRIM, 0.7), ec: TRIM });

    // ---- entrance porch with its own steep gablet -----------------------------------------------------------------------------
    const PX0 = -0.6, PX1 = 2.3, PZ = 5.2, PE = 2.55, TP = Math.tan((58 * PI) / 180), pw = PX1 - PX0;
    const pg = S.range(PX0, Z1, PX1, PZ + 2.5, 3).lo;
    B.box('granite', PX0, pg - 0.4, Z1, PX1, -0.1, PZ, PLINTH, { skip: 'bu' });
    B.box('stone', PX0 - 0.05, -0.1, Z1, PX1 + 0.05, 0, PZ + 0.05, STONE, { skip: 'bu' });
    for (const x of [PX0 + 0.14, PX1 - 0.14]) {
      B.beam('trim', [x, 0, PZ - 0.14], [x, PE, PZ - 0.14], 0.15, 0.15, TRIM, { caps: false });
      B.balustrade([x, 0, Z1 + 0.05], [x, 0, PZ - 0.2], { h: 0.85, col: TRIM, step: 0.15, bw: 0.04 });
      B.beam('trim', [x, PE - 0.09, Z1], [x, PE - 0.09, PZ], 0.12, 0.18, TRIM);
    }
    B.beam('trim', [PX0, PE - 0.09, PZ - 0.14], [PX1, PE - 0.09, PZ - 0.14], 0.12, 0.18, TRIM);
    const pr = B.hipRoof(PX0, Z1, PX1, PZ, PE, 58, 0.25, { axis: 'z', gable: [true, true], ovG: 0.25, col: ROOFC, uc: mul(TRIM, 0.7), ec: TRIM, t: 0.1 });
    B.seg(PX0, PZ - 0.1, PX1, PZ - 0.1, 0, () => {
      B.wall({ key: 'trim', col: TRIM, u0: 0, u1: pw, y0: PE, top: [[0, PE], [pw / 2, PE + (pw / 2) * TP], [pw, PE]] });
      B.beam('trim', [pw / 2, PE, 0.02], [pw / 2, PE + (pw / 2) * TP - 0.1, 0.02], 0.1, 0.05, TEAL);
      for (const s of [-1, 1]) B.beam('trim', [pw / 2 + s * 0.75, PE, 0.02], [pw / 2, PE + 0.95, 0.02], 0.08, 0.05, TEAL);
    });
    let stepRun = 0;
    B.frame((PX0 + PX1) / 2, 0, PZ, 0, () => { stepRun = B.stairs('stone', 2.3, (z) => S.gy((PX0 + PX1) / 2, PZ + z), STONE); });

    // ---- octagonal corner turret with the needle spire ---------------------------------------------------------------------------
    const TX = 3.95, TZ = 3.55, TR = 1.55, TT = 9.75;
    const oct = (r) => Array.from({ length: 8 }, (_, k) => { const a = ((k * 45 - 22.5) * PI) / 180; return [TX + Math.sin(a) * r, TZ + Math.cos(a) * r]; });
    const tl = S.range(TX - 2, TZ - 2, TX + 2, TZ + 2, 3).lo;
    B.outline(oct(TR), 0, true, (k, len) => {
      const vis = k <= 2 || k === 7, y0 = vis ? 0 : E - 0.8, ops = [];
      if (vis && k !== 7) { ops.push(Wn(len / 2, F1 + 0.95, 0.5, 1.25, { bars: [0, 2], sur: { ...SUR, w: 0.1 } })); if (k !== 1) ops.push(Wn(len / 2, 1.0, 0.5, 1.4, { bars: [0, 2], sur: { ...SUR, w: 0.1 } })); }
      ops.push({ u: len / 2, y: 7.75, w: 0.5, h: 1.2, arch: true, n: 6, frame: TRIM, fw: 0.05, bars: [0, 1], sur: { ...SUR, w: 0.09 }, sill: TRIM, sillKey: 'trim', lit: false });
      B.wall({ key: 'stucco', col: TEAL, u0: 0, u1: len, y0, y1: TT, ops, aoBase: vis ? 0.9 : 0, aoTop: 0.35 });
      B.box('trim', 0, y0, 0, 0.07, TT, 0.03, TRIM, { skip: 'bu' }); B.box('trim', len - 0.07, y0, 0, len, TT, 0.03, TRIM, { skip: 'bu' });
      for (const y of vis ? [F1, E, 7.3, TT - 0.12] : [7.3, TT - 0.12]) B.box('trim', 0, y - 0.08, 0, len, y + 0.08, 0.045, TRIM, { skip: 'b' });
      if (vis) B.wall({ key: 'granite', col: PLINTH, u0: -0.04, u1: len + 0.04, y0: tl - 0.5, y1: 0, d: 0.08 });
    });
    // spire: bell-cast flare, then the needle
    const r1 = oct(2.0), r2 = oct(1.22), YF = TT - 0.2, YN = TT + 1.0, YTIP = 16.5;
    for (let k = 0; k < 8; k++) {
      const j = (k + 1) % 8, c = mul(SPIRE, k % 2 ? 1 : 0.92);
      B.poly('trim', [[r1[k][0], YF, r1[k][1]], [r1[j][0], YF, r1[j][1]], [r2[j][0], YN, r2[j][1]], [r2[k][0], YN, r2[k][1]]], c);
      B.poly('trim', [[r2[k][0], YN, r2[k][1]], [r2[j][0], YN, r2[j][1]], [TX, YTIP, TZ]], [c, c, mul(c, 1.15)]);
      const w = oct(TR);
      B.poly('trim', [[r1[j][0], YF, r1[j][1]], [r1[k][0], YF, r1[k][1]], [w[k][0], YF, w[k][1]], [w[j][0], YF, w[j][1]]], mul(TRIM, 0.6));
    }
    B.column('trim', TX, YTIP - 0.5, TZ, 0.07, 1.5, GOLD, 6, 0.02);
    B.sphere('trim', TX, YTIP + 0.1, TZ, 0.16, GOLD, 8);
    B.sphere('trim', TX, YTIP + 0.55, TZ, 0.08, GOLD, 6);

    // ---- dormers, chimney ---------------------------------------------------------------------------------------------------------
    const dz = 1.15, yb = E + dz * TM;
    B.frame(0.85, yb, Z1 - dz, 0, () => dormer(B, { w: 1.35, h: 1.3, tm: TM, pitch: 52, col: TEAL, trim: TRIM, roofCol: ROOFC }));
    for (const x of [-3.3, 1.9]) B.frame(x, yb, Z0 + dz, PI, () => dormer(B, { w: 1.35, h: 1.3, tm: TM, pitch: 52, col: TEAL, trim: TRIM, roofCol: ROOFC }));
    chimney(B, -3.3, -1.25, -2.4, -0.45, 9.2, 13.5, { key: 'granite', col: [0.9, 0.84, 0.8], pot: lin('#8a4a34') });

    // colliders
    const col = env.collision, tag = `landmark:${L.id}`;
    if (col) {
      col.removeTag(tag);
      const box = (x0, z0, x1, z1) => col.addBox(S.wx((x0 + x1) / 2, (z0 + z1) / 2), S.wz((x0 + x1) / 2, (z0 + z1) / 2), (x1 - x0) / 2, (z1 - z0) / 2, L.rot, tag);
      box(X0 - 0.1, Z0 - 0.1, X1 + 0.1, Z1 + 0.1); box(CX0 - 0.1, Z1, PX1 + 0.1, PZ + 0.1); box(PX0, PZ, PX1, PZ + stepRun);
      col.addCircle(S.wx(TX, TZ), S.wz(TX, TZ), TR + 0.1, tag);
    }
    void pr;
  });
  return { F, S };
}
