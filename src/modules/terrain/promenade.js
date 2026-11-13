// 海滨步行道: granite paving with mitred corners and a darker edge course, the rock-faced seawall below it, a low
// granite parapet with piers and coping, and the four flights of steps down to the sand.
//
// Everything is built in per-segment frames of the raw promenade polyline:
//   point(j, t, d) = P_j + dir_j * t + n_j * d        (n = seaward normal, d > 0 toward the sea)
// A line at lateral offset d on segment j runs from t = d * tan(phi_j) to L_j - d * tan(phi_j+1), where phi is the
// signed half turn at the vertex (positive = the sea is on the inside of the bend), which gives exact mitres.
import { Buf, V, UP } from './util.js';

const Y = 3.5, PAVE_Y = 3.52, HALF = 2.5;
const PAR_IN = 2.15, PAR_H = 0.8, PIER = 0.5;
const OPEN_HALF = 2.2; // core's collider opens the balustrade where the centre line is within width / 2 of a stair

export function buildPromenade(ctx, pave) {
  const { world, map: MAP } = ctx;
  const granite = new Buf(true), coping = new Buf(true);
  const prom = MAP.promenade, hAt = world.heightAt;

  // visual run-off west of the playable area: follow the coast path to the edge of the near terrain
  const back = MAP.coast.backline, i0 = back.findIndex((p) => p[0] === prom.pts[0][0] && p[1] === prom.pts[0][1]);
  const pts = prom.pts.map((p) => [p[0], p[1]]);
  let ext = 0;
  if (i0 > 0) {
    const a = back[i0 - 1], b = back[i0], t = (-298 - a[0]) / (b[0] - a[0]);
    if (t > 0 && t < 1) { pts.unshift([-298, a[1] + (b[1] - a[1]) * t]); ext = 1; }
  }
  const n = pts.length - 1; // segments
  const seg = [];
  for (let j = 0; j < n; j++) {
    const dx = pts[j + 1][0] - pts[j][0], dz = pts[j + 1][1] - pts[j][1], L = Math.hypot(dx, dz);
    seg.push({ x: pts[j][0], z: pts[j][1], dx: dx / L, dz: dz / L, nx: -dz / L, nz: dx / L, L, cum: j ? seg[j - 1].cum + seg[j - 1].L : 0 });
  }
  const tanPhi = new Float64Array(n + 1), phi = new Float64Array(n + 1);
  for (let i = 1; i < n; i++) {
    const a = seg[i - 1], b = seg[i];
    phi[i] = Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz) / 2;
    tanPhi[i] = Math.tan(phi[i]);
  }
  const pt = (j, t, d) => [seg[j].x + seg[j].dx * t + seg[j].nx * d, seg[j].z + seg[j].dz * t + seg[j].nz * d];
  /** run = {j, ta, tb, mA, mB}: t-range on segment j; mA / mB = that end is a mitre (resolve per offset) */
  const tA = (r, d) => (r.mA ? d * tanPhi[r.j] : r.ta), tB = (r, d) => (r.mB ? seg[r.j].L - d * tanPhi[r.j + 1] : r.tb);
  const corners = (r, d0, d1, padA = 0, padB = 0) => [pt(r.j, tA(r, d0) - padA, d0), pt(r.j, tB(r, d0) + padB, d0), pt(r.j, tB(r, d1) + padB, d1), pt(r.j, tA(r, d1) - padA, d1)];

  // ---- paving ----------------------------------------------------------------------------------------------------------
  const cols = [[-HALF, -2.1, 0.7], [-2.1, 1.75, 1], [1.75, HALF, 0.7]];
  for (let j = 0; j < n; j++) {
    const r = { j, mA: true, mB: true }, s = seg[j];
    for (const [d0, d1, c] of cols) {
      const q = corners(r, d0, d1), ds = [d0, d0, d1, d1], ts = [tA(r, d0), tB(r, d0), tB(r, d1), tA(r, d1)];
      pave.quad(...q.map((p, k) => V(p[0], PAVE_Y, p[1], s.cum + ts[k], ds[k], c)), UP);
    }
    // landward edge: a low granite margin so the lawn can sit a little below the paving
    const a = pt(j, tA(r, -HALF), -HALF), b = pt(j, tB(r, -HALF), -HALF);
    pave.quad(V(a[0], PAVE_Y, a[1], s.cum, 0, 0.6), V(b[0], PAVE_Y, b[1], s.cum + s.L, 0, 0.6), V(b[0], PAVE_Y - 0.5, b[1], s.cum + s.L, 0.5, 0.6), V(a[0], PAVE_Y - 0.5, a[1], s.cum, 0.5, 0.6), [-s.nx, 0, -s.nz]);
  }

  // ---- stairs: where they are, which part of which segment they open ---------------------------------------------------
  const openings = seg.map(() => []); // per segment: [t0, t1]
  const stairs = [];
  for (const st of prom.steps) {
    let vi = -1;
    for (let i = 1; i < n; i++) if (Math.hypot(pts[i][0] - st.x, pts[i][1] - st.z) < 0.4) vi = i;
    if (vi > 0) {
      openings[vi - 1].push([seg[vi - 1].L - OPEN_HALF, Infinity]); openings[vi].push([-Infinity, OPEN_HALF]);
      const a = seg[vi - 1], b = seg[vi];
      let fx = a.nx + b.nx, fz = a.nz + b.nz; const l = Math.hypot(fx, fz); fx /= l; fz /= l;
      stairs.push({ x: pts[vi][0], z: pts[vi][1], fx, fz, phi: Math.max(0, phi[vi]) });
    } else {
      for (let j = 0; j < n; j++) {
        const s = seg[j], t = (st.x - s.x) * s.dx + (st.z - s.z) * s.dz, off = Math.abs((st.x - s.x) * s.nx + (st.z - s.z) * s.nz);
        if (t > 0 && t < s.L && off < 0.5) { openings[j].push([t - OPEN_HALF, t + OPEN_HALF]); stairs.push({ x: st.x, z: st.z, fx: s.nx, fz: s.nz, phi: 0 }); break; }
      }
    }
  }
  /** segment j minus its openings (and an optional tail gap) -> runs */
  const runsOf = (j, tailGap = 0) => {
    const s = seg[j], cuts = openings[j].map((c) => [Math.max(c[0], 0), Math.min(c[1], s.L)]);
    if (tailGap > 0) cuts.push([s.L - tailGap, s.L]);
    cuts.sort((p, q) => p[0] - q[0]);
    const out = [];
    let a = 0;
    for (const [c0, c1] of cuts) {
      if (c0 - a > 0.3) out.push({ j, ta: a, tb: c0, mA: a === 0, mB: false });
      a = Math.max(a, c1);
    }
    if (s.L - a > 0.3) out.push({ j, ta: a, tb: s.L, mA: a === 0, mB: true });
    return out;
  };

  // ---- seawall face + string course ------------------------------------------------------------------------------------
  for (let j = 0; j < n; j++) {
    const s = seg[j];
    for (const r of runsOf(j)) {
      const t0 = tA(r, HALF), t1 = tB(r, HALF), m = Math.max(1, Math.ceil((t1 - t0) / 2));
      let pr = null;
      for (let k = 0; k <= m; k++) {
        const t = t0 + ((t1 - t0) * k) / m, w = pt(j, t, HALF), f1 = pt(j, t, HALF + 0.8), f2 = pt(j, t, HALF + 1.6);
        const foot = Math.min(hAt(f1[0], f1[1]), hAt(f2[0], f2[1])) - 0.5;
        const cur = { w, foot, u: s.cum + t };
        if (pr && Math.min(pr.foot, foot) < Y - 0.08) {
          // clean stone above, a damp / weathered band over the metre above the sand, darkest at the foot
          const m0 = Math.min(Y, pr.foot + 1.6), m1 = Math.min(Y, foot + 1.6), N = [s.nx, 0, s.nz];
          granite.quad(V(pr.w[0], Y, pr.w[1], pr.u, Y), V(w[0], Y, w[1], cur.u, Y), V(w[0], m1, w[1], cur.u, m1, 0.86), V(pr.w[0], m0, pr.w[1], pr.u, m0, 0.86), N);
          granite.quad(V(pr.w[0], m0, pr.w[1], pr.u, m0, 0.86), V(w[0], m1, w[1], cur.u, m1, 0.86), V(w[0], foot, w[1], cur.u, foot, 0.42), V(pr.w[0], pr.foot, pr.w[1], pr.u, pr.foot, 0.42), N);
        }
        pr = cur;
      }
      coping.prism(corners(r, HALF - 0.02, HALF + 0.09), Y - 0.16, Y + 0.02, { u0: s.cum });
    }
  }

  // ---- parapet, coping, piers ------------------------------------------------------------------------------------------
  const PC = (PAR_IN + HALF) / 2; // parapet centre line
  const pier = (j, t) => {
    const h = PIER / 2, q = [pt(j, t - h, PC - h), pt(j, t + h, PC - h), pt(j, t + h, PC + h), pt(j, t - h, PC + h)];
    granite.prism(q, Y - 0.02, Y + 1.0, { top: false, u0: seg[j].cum + t });
    const g = h + 0.06, c = [pt(j, t - g, PC - g), pt(j, t + g, PC - g), pt(j, t + g, PC + g), pt(j, t - g, PC + g)];
    coping.prism(c, Y + 1.0, Y + 1.09, { bottom: true });
    const e = h - 0.08, c2 = [pt(j, t - e, PC - e), pt(j, t + e, PC - e), pt(j, t + e, PC + e), pt(j, t - e, PC + e)];
    coping.prism(c2, Y + 1.09, Y + 1.15);
  };
  for (let j = 0; j < n; j++) {
    const s = seg[j], last = j === n - 1;
    for (const r of runsOf(j, last ? 8 : 0)) {
      granite.prism(corners(r, PAR_IN, HALF), Y - 0.02, Y + PAR_H, { top: false, u0: s.cum });
      coping.prism(corners(r, PAR_IN - 0.06, HALF + 0.06), Y + PAR_H, Y + PAR_H + 0.1, { bottom: true, u0: s.cum });
      const a = r.mA ? PC * tanPhi[j] : r.ta + PIER / 2, b = r.mB ? s.L - PC * tanPhi[j + 1] : r.tb - PIER / 2;
      const cnt = Math.max(1, Math.round((b - a) / 4));
      for (let k = 0; k <= cnt; k++) {
        if (k === 0 && r.mA && j > 0) continue; // the previous segment already put a pier on this corner
        pier(j, a + ((b - a) * k) / cnt);
      }
    }
  }

  // ---- steps down to the sand ------------------------------------------------------------------------------------------
  const STEPS = 12, DROP = Y - 1.6, rise = DROP / STEPS;
  for (const st of stairs) {
    const cosP = Math.cos(st.phi), tanP = Math.tan(st.phi);
    const hw = (OPEN_HALF - HALF * tanP) * cosP, D0 = HALF / cosP + hw * tanP, D1 = (HALF + 4.0) / cosP;
    const tread = (D1 - D0) / STEPS, ax = st.fz, az = -st.fx;
    const lp = (u, w) => [st.x + st.fx * u + ax * w, st.z + st.fz * u + az * w];
    const F = [st.fx, 0, st.fz];
    if (st.phi > 0.01) { // wedge of landing between the two wall ends
      const a = lp(HALF / cosP - 0.05, 0), b = lp(D0, -hw), c = lp(D0, hw);
      coping.tri(V(a[0], PAVE_Y, a[1], a[0], a[1]), V(b[0], PAVE_Y, b[1], b[0], b[1]), V(c[0], PAVE_Y, c[1], c[0], c[1]), UP);
    }
    for (let k = 0; k <= STEPS; k++) {
      const u = D0 + k * tread, yTop = k === 0 ? PAVE_Y : Y - k * rise, yBot = k === STEPS ? 0.9 : Y - (k + 1) * rise;
      const a = lp(u, -hw), b = lp(u, hw);
      coping.quad(V(a[0], yTop, a[1], -hw, yTop, 0.86), V(b[0], yTop, b[1], hw, yTop, 0.86), V(b[0], yBot, b[1], hw, yBot, 0.6), V(a[0], yBot, a[1], -hw, yBot, 0.6), F);
      if (k < STEPS) {
        const c = lp(u + tread, hw), d = lp(u + tread, -hw);
        coping.quad(V(a[0], yBot, a[1], -hw, u), V(b[0], yBot, b[1], hw, u), V(c[0], yBot, c[1], hw, u + tread), V(d[0], yBot, d[1], -hw, u + tread), UP);
      }
    }
    // cheek walls following the flight, with a sloping coping and a newel block at the foot
    const top = (u) => Y - ((u - D0) / (D1 - D0)) * DROP + 0.62;
    for (const sg of [-1, 1]) {
      const w0 = sg * hw, w1 = sg * (hw + 0.35), u0 = D0 - 0.02, u1 = D1 + 0.15;
      const q = [lp(u0, w0), lp(u1, w0), lp(u1, w1), lp(u0, w1)];
      granite.prism(q, 0.9, [top(u0), top(u1), top(u1), top(u0)], { top: false });
      const c = [lp(u0, w0 - sg * 0.05), lp(u1, w0 - sg * 0.05), lp(u1, w1 + sg * 0.05), lp(u0, w1 + sg * 0.05)];
      coping.prism(c, [top(u0), top(u1), top(u1), top(u0)], [top(u0) + 0.09, top(u1) + 0.09, top(u1) + 0.09, top(u0) + 0.09], { bottom: true });
      const m = sg * (hw + 0.175), nb = [lp(u1 - 0.1, m - 0.27), lp(u1 + 0.44, m - 0.27), lp(u1 + 0.44, m + 0.27), lp(u1 - 0.1, m + 0.27)];
      granite.prism(nb, 0.9, top(u1) + 0.3, { top: false });
      const nc = [lp(u1 - 0.16, m - 0.33), lp(u1 + 0.5, m - 0.33), lp(u1 + 0.5, m + 0.33), lp(u1 - 0.16, m + 0.33)];
      coping.prism(nc, top(u1) + 0.3, top(u1) + 0.39, { bottom: true });
    }
  }

  return { granite, coping, ext };
}
