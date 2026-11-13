// 蝴蝶楼: modest two-storey villa on a butterfly plan: a central block with a recessed two-storey loggia and two
// wings splayed forward. Cream-yellow stucco on a rusticated granite base, low hipped red roofs, green joinery.
import { lin, mul, WHITE, site, rect } from './kit.js';
import { chimney, plinth, grow } from './parts.js';

// pre-compensated like 公主楼's teal: the entrance front faces north-west and is lit by sky and ground bounce only
const CREAM = [0.98, 0.88, 0.66], GREEN = lin('#3F5E4A'), TRIM = lin('#F1EBDD'), ROOFC = [1.0, 1.06, 1.0], BASE = [0.86, 0.85, 0.83];
const STONE = [0.94, 0.92, 0.88], DOOR = lin('#3F5E4A');

export function buildHudielou(B, L, env) {
  const g0 = site(L, 0, env.heightAt).range(-9.5, -4.5, 9.5, 5, 6);
  const F = g0.hi + 0.35, S = site(L, F, env.heightAt);
  B.rng = env.makeRng('landmarks:hudielou'); B.litShare = 0.4;
  const CX = 3.9, CZ0 = -4.2, CZ1 = 2.6, E = 6.3, F1 = 3.2, LZ = 1.3;     // central block, loggia back wall at LZ
  const lo = S.range(-10, -5, 10, 6, 6).lo;
  const SUR = { key: 'trim', col: TRIM, w: 0.13, p: 0.04 };
  const Wn = (u, y, w, h, extra) => ({ u, y, w, h, frame: GREEN, fw: 0.065, bars: [1, 2], sur: SUR, sill: STONE, ...extra });
  const baseMat = (u, y) => (y < 0.75 ? { key: 'granite', col: BASE } : null);
  const band = (len, y, u0 = 0) => B.box('trim', u0, y - 0.09, 0, len, y + 0.09, 0.045, TRIM, { skip: 'b' });
  const cornice = (len, u0 = 0) => B.box('trim', u0, E - 0.3, 0, len, E - 0.04, 0.09, TRIM, { skip: 'b' });
  const boxes = [];

  B.frame(L.x, F, L.z, L.rot, () => {
    // ---- central block --------------------------------------------------------------------------------------------------------
    B.outline(rect(-CX, CZ0, CX, CZ1), 0, true, (i, len) => {
      if (i === 0) {   // front: only the frieze above the loggia; the loggia is open below
        B.wall({ key: 'stucco', col: CREAM, u0: 0, u1: len, y0: E - 0.55, y1: E, aoTop: 0.3 });
        B.box('stucco', 0, F1 - 0.35, -0.3, len, F1, 0, CREAM, { skip: 'b' });
        cornice(len);
        return;
      }
      const ops = i === 2 ? [Wn(1.6, 1.0, 1.1, 1.6), Wn(3.9, 1.0, 1.1, 1.6), Wn(6.2, 1.0, 1.1, 1.6), Wn(1.6, F1 + 0.9, 1.0, 1.5), Wn(3.9, F1 + 0.9, 1.0, 1.5), Wn(6.2, F1 + 0.9, 1.0, 1.5)] : [];
      B.wall({ key: 'stucco', col: CREAM, u0: 0, u1: len, y0: 0, y1: E, ops, aoBase: 0.9, aoTop: 0.3, lines: { y: [0.75] }, mat: baseMat });
      band(len, F1); cornice(len);
    });
    // loggia: back wall, side returns, floors, columns
    B.seg(-CX, LZ, CX, LZ, 0, (len) => {
      B.wall({ key: 'stucco', col: mul(CREAM, 0.94), u0: 0, u1: len, y0: 0, y1: E, aoBase: 0.9, aoTop: 0.4,
        ops: [{ u: len / 2, y: 0, w: 1.5, h: 2.4, kind: 'door', doorCol: DOOR, frame: TRIM, glazed: true, sur: SUR }, Wn(1.5, 0.9, 1.0, 1.6), Wn(len - 1.5, 0.9, 1.0, 1.6),
          Wn(len / 2, F1 + 0.03, 1.4, 2.2, { bars: [1, 3], sill: false }), Wn(1.5, F1 + 0.85, 1.0, 1.5), Wn(len - 1.5, F1 + 0.85, 1.0, 1.5)] });
    });
    for (const s of [-1, 1]) B.polyOut('stucco', [[s * CX, 0, LZ], [s * CX, 0, CZ1], [s * CX, E, CZ1], [s * CX, E, LZ]], [s * 30, 3, 2], mul(CREAM, 0.88));
    B.poly('stucco', [[-CX, E - 0.55, LZ], [CX, E - 0.55, LZ], [CX, E - 0.55, CZ1], [-CX, E - 0.55, CZ1]], mul(CREAM, 0.55));
    B.poly('stucco', [[-CX, F1 - 0.35, LZ], [CX, F1 - 0.35, LZ], [CX, F1 - 0.35, CZ1], [-CX, F1 - 0.35, CZ1]], mul(CREAM, 0.5));
    B.slab('stone', [[-CX, F1, LZ], [CX, F1, LZ], [CX, F1, CZ1 + 0.12], [-CX, F1, CZ1 + 0.12]], 0.12, STONE, { noUnder: true, ek: 'trim', ec: TRIM });
    B.box('stone', -CX, -0.12, LZ, CX, 0, CZ1 + 0.25, STONE, { skip: 'bu' });
    for (const x of [-CX + 0.22, -1.3, 1.3, CX - 0.22]) {
      for (const [y0, y1] of [[0, F1 - 0.35], [F1, E - 0.55]]) {
        B.box('trim', x - 0.2, y0, CZ1 - 0.36, x + 0.2, y0 + 0.14, CZ1 + 0.04, TRIM, { skip: 'u' });
        B.column('trim', x, y0 + 0.14, CZ1 - 0.16, 0.15, y1 - y0 - 0.28, TRIM, 10, 0.125);
        B.box('trim', x - 0.2, y1 - 0.14, CZ1 - 0.36, x + 0.2, y1, CZ1 + 0.04, TRIM, { skip: 't' });
      }
    }
    for (const [a, b] of [[-CX + 0.4, -1.5], [-1.1, 1.1], [1.5, CX - 0.4]]) B.balustrade([a, F1, CZ1 - 0.14], [b, F1, CZ1 - 0.14], { h: 0.85, col: GREEN, step: 0.14, bw: 0.035 });
    plinth(B, [[CX, CZ0], [-CX, CZ0]], false, lo, 0, BASE);
    const cr = B.hipRoof(-6.1, CZ0, 6.1, CZ1, E, 33, 0.6, { axis: 'x', col: ROOFC, uc: mul(TRIM, 0.75), ec: TRIM });
    let run = 0;
    B.frame(0, -0.12, CZ1 + 0.25, 0, () => { run = B.stairs('stone', 3.4, (z) => S.gy(0, CZ1 + 0.25 + z) + 0.12, STONE); });
    boxes.push([0, (CZ0 + CZ1) / 2, CX, (CZ1 - CZ0) / 2 + 0.2, 0], [0, CZ1 + 0.25 + run / 2, 1.8, run / 2, 0]);

    // ---- the two wings (butterfly): splayed 18 degrees toward the forecourt ------------------------------------------------------
    for (const s of [-1, 1]) {
      const rot = -s * 0.3, px = s * 6.1, pz = 0.3, WX = 2.6, WZ0 = -3.9, WZ1 = 4.3;
      B.frame(px, 0, pz, rot, () => {
        B.outline(rect(-WX, WZ0, WX, WZ1), 0, true, (i, len) => {
          const inner = (s > 0 && i === 3) || (s < 0 && i === 1);
          let ops;
          if (i === 0) ops = [Wn(len / 2, 0.9, 1.7, 1.75, { bars: [2, 2], shut: GREEN }), Wn(len / 2, F1 + 0.85, 1.5, 1.55, { bars: [2, 2], shut: GREEN })];
          else if (i === 2) ops = [Wn(len / 2, 1.0, 1.2, 1.6), Wn(len / 2, F1 + 0.9, 1.1, 1.5)];
          else if (inner) ops = [Wn(len - 1.6, 0.95, 1.0, 1.65), Wn(len - 1.6, F1 + 0.85, 1.0, 1.5)].map((o) => (s > 0 ? o : { ...o, u: 1.6 }));
          else ops = [Wn(2.1, 0.95, 1.05, 1.65), Wn(len - 2.1, 0.95, 1.05, 1.65), Wn(2.1, F1 + 0.85, 1.0, 1.5), Wn(len - 2.1, F1 + 0.85, 1.0, 1.5)];
          B.wall({ key: 'stucco', col: CREAM, u0: 0, u1: len, y0: 0, y1: E, ops, aoBase: 0.9, aoTop: 0.3, lines: { y: [0.75] }, mat: baseMat });
          band(len, F1); cornice(len);
          B.box('trim', 0, 0.75, 0, 0.3, E - 0.3, 0.03, TRIM, { skip: 'bu' }); B.box('trim', len - 0.3, 0.75, 0, len, E - 0.3, 0.03, TRIM, { skip: 'bu' });
        });
        plinth(B, grow(-WX, WZ0, WX, WZ1, 0), true, lo, 0, BASE);
        B.hipRoof(-WX, WZ0, WX, WZ1, E, 33, 0.6, { axis: 'z', col: ROOFC, uc: mul(TRIM, 0.75), ec: TRIM });
      });
      boxes.push([px, pz + 0.2, WX + 0.1, (WZ1 - WZ0) / 2 + 0.1, rot]);
    }
    chimney(B, -3.0, -1.3, -2.2, -0.5, cr.yRidge - 1.2, cr.yRidge + 1.3, { col: CREAM, pot: lin('#8a4a34') });
    chimney(B, 2.2, -1.3, 3.0, -0.5, cr.yRidge - 1.2, cr.yRidge + 1.3, { col: CREAM, pot: lin('#8a4a34') });
  });

  const col = env.collision, tag = `landmark:${L.id}`;
  if (col) {
    col.removeTag(tag);
    for (const b of boxes) col.addBox(S.wx(b[0], b[1]), S.wz(b[0], b[1]), b[2], b[3], L.rot + b[4], tag);
  }
  return { F, S, clear: 4.6 };   // front-most wall line near the gate axis (keeps the name boulder off the wings)
}
