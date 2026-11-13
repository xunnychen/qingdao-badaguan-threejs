// Parts shared by the stucco villas (公主楼, 蝴蝶楼, 元帅楼, 八大关宾馆).
import { mul, WHITE } from './kit.js';

/**
 * Gabled dormer. Call inside a frame whose origin is on the roof surface at the dormer's front-bottom centre, with
 * local +Z pointing down the slope (outward). o: { w, h, tm (tan of the main roof pitch), pitch (deg), key, col,
 * roofCol, trim, win: opening overrides, hip }
 */
export function dormer(B, o) {
  const w = o.w, h = o.h, tm = o.tm, tp = Math.tan(((o.pitch ?? 45) * Math.PI) / 180), key = o.key || 'stucco', col = o.col || WHITE;
  const trim = o.trim || WHITE, ov = 0.14, hw = w / 2;
  const yr = h + hw * tp;
  B.wall({ key, col, u0: -hw, u1: hw, y0: -0.05, top: [[-hw, h], [0, yr], [hw, h]],
    ops: [{ u: 0, y: 0.25, w: w - 0.42, h: h - 0.3, frame: trim, fw: 0.055, bars: [1, 1], sill: trim, sillKey: 'trim', ...(o.win || {}) }] });
  // cheeks
  for (const s of [-1, 1]) B.polyOut(key, [[s * hw, -0.05, 0], [s * hw, h, -h / tm], [s * hw, h, 0]], [0, h / 2, -0.2], mul(col, 0.9));
  // roof
  const ye = h - ov * tp, zf = 0.18, rc = o.roofCol || WHITE;
  for (const s of [-1, 1]) {
    B.slab(o.roofKey || 'roof', [[s * (hw + ov), ye, zf], [s * (hw + ov), ye, -ye / tm], [0, yr, -yr / tm], [0, yr, zf]], 0.07, rc, { uc: mul(trim, 0.8), ec: trim });
  }
  B.beam(o.roofKey || 'roof', [0, yr + 0.03, zf], [0, yr + 0.03, -yr / tm], 0.2, 0.1, mul(rc, 0.8));
}

/** chimney stack: box x0..x1, z0..z1 from y0 to y1 with a cap and pots */
export function chimney(B, x0, z0, x1, z1, y0, y1, o = {}) {
  const key = o.key || 'stucco', col = o.col || WHITE;
  B.box(key, x0, y0, z0, x1, y1, z1, col, { skip: 'u', ao: [0.8, 1] });
  B.box('stone', x0 - 0.08, y1, z0 - 0.08, x1 + 0.08, y1 + 0.14, z1 + 0.08, o.cap || [0.9, 0.88, 0.85]);
  const n = o.pots ?? 2, zc = (z0 + z1) / 2;
  for (let k = 0; k < n; k++) {
    const x = x0 + ((x1 - x0) * (k + 0.5)) / n;
    B.column('trim', x, y1 + 0.14, zc, 0.13, 0.42, o.pot || [0.3, 0.1, 0.06], 7, 0.1, false);
  }
}

/** granite plinth below a plan outline: from the ground (lo) up to y1, slightly proud of the wall line */
export function plinth(B, pts, closed, lo, y1, col, key = 'granite') {
  B.outline(pts, 0, closed, (i, len) => {
    B.wall({ key, col, u0: -0.08, u1: len + 0.08, y0: lo - 0.5, y1, d: 0.08, du: 6, lines: { y: [y1 - 1.0] }, mat: (u, y) => (y < y1 - 1.0 ? { col: mul(col, 0.7) } : null) });
    B.q('stone', [-0.08, y1, 0.08], [len + 0.08, y1, 0.08], [len + 0.08, y1 + 0.05, 0], [-0.08, y1 + 0.05, 0], [0.86, 0.84, 0.8]);
  });
}

/** rectangle outline expanded by e */
export const grow = (x0, z0, x1, z1, e) => [[x0 - e, z1 + e], [x1 + e, z1 + e], [x1 + e, z0 - e], [x0 - e, z0 - e]];
