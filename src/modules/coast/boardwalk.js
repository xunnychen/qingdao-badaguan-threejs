// 海滨木栈道: the timber boardwalk along MAP.boardwalk (raw polyline, ground strip flat at 3.5 m).
//   layoutBoardwalk(world, map)  pure geometry: segments, mitred offsets, rail runs, the 3 m rail openings and the
//                                octagonal landing where the granite promenade ends (70,149). No three.js: the reef
//                                placement uses it to keep the ways down to the rock clear.
//   buildBoardwalk(ctx, layout)  one merged mesh (deck, fascia, kerb, posts, rails, landing) + rail colliders.
import * as THREE from 'three';

export const DECK_Y = 3.55;       // deck top (the walker's feet are at 3.5)
export const DECK_HALF = 1.3;     // 2.6 m wide
export const RAIL_OFF = 1.22;     // rail line from the centre line (seaward)
export const RAIL_H = 1.05;
export const LANDING_R = 3.0;     // apothem of the octagonal landing
const OPEN_W = 3.0, OPEN_EVERY = 25, OPEN_FIRST = 16;

export function layoutBoardwalk(world, map) {
  const pts = map.boardwalk.pts.map((p) => [p[0], p[1]]);
  const playableSegs = pts.length - 1;
  // visual run-off past the edge of the playable area: follow the coast path to the next backline vertex
  const last = pts[pts.length - 1];
  const nxt = map.coast.backline.find((p) => p[0] > last[0] + 1);
  if (nxt) pts.push([nxt[0], nxt[1]]);

  const segs = [];
  let cum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
    let nx = -tz, nz = tx; // seaward unit normal
    if (world.backDist((ax + bx) / 2 + nx * 2, (az + bz) / 2 + nz * 2) > 0) { nx = -nx; nz = -nz; }
    segs.push({ i, ax, az, bx, bz, tx, tz, nx, nz, len, cum, playable: i < playableSegs });
    cum += len;
  }
  /** vertex i moved d metres to the seaward side (d < 0: landward), mitred between its two segments */
  const off = (i, d) => {
    const a = segs[Math.max(0, i - 1)], b = segs[Math.min(segs.length - 1, i)];
    let mx = a.nx + b.nx, mz = a.nz + b.nz;
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    const k = d / (mx * a.nx + mz * a.nz);
    return [pts[i][0] + mx * k, pts[i][1] + mz * k];
  };
  /** point on segment s at local distance u, d metres seaward; snaps to the mitre at the segment ends */
  const at = (s, u, d) => {
    if (u <= 1e-3 && s.i > 0) return off(s.i, d);
    if (u >= s.len - 1e-3) return off(s.i + 1, d);
    return [s.ax + s.tx * u + s.nx * d, s.az + s.tz * u + s.nz * d];
  };

  // rail runs and openings
  const pieces = [], openings = [];
  for (const s of segs) {
    const a = s.i === 0 ? LANDING_R : 0, b = s.len;
    const cuts = [];
    if (s.playable && s.len > 12) {
      for (let g = OPEN_FIRST; g < cum; g += OPEN_EVERY) {
        if (g < s.cum || g >= s.cum + s.len) continue;
        const c = Math.min(Math.max(g - s.cum, a + 3.5), b - 3.5);
        if (cuts.length && c - cuts[cuts.length - 1] < 8) continue;
        cuts.push(c);
      }
    }
    let u = a;
    for (const c of cuts) {
      pieces.push({ s, u0: u, u1: c - OPEN_W / 2 });
      const p = at(s, c, RAIL_OFF);
      openings.push({ x: p[0], z: p[1], nx: s.nx, nz: s.nz });
      u = c + OPEN_W / 2;
    }
    pieces.push({ s, u0: u, u1: b });
  }
  for (const p of pieces) { p.p0 = at(p.s, p.u0, RAIL_OFF); p.p1 = at(p.s, p.u1, RAIL_OFF); }

  // octagonal landing, one edge square to the boardwalk
  const s0 = segs[0], cx = pts[0][0], cz = pts[0][1];
  const th0 = Math.atan2(s0.tz, s0.tx), Rc = LANDING_R / Math.cos(Math.PI / 8);
  const corners = [];
  for (let k = 0; k < 8; k++) { const a = th0 + (k - 0.5) * Math.PI / 4; corners.push([cx + Math.cos(a) * Rc, cz + Math.sin(a) * Rc]); }
  const edges = [];
  for (let k = 0; k < 8; k++) {
    const a = th0 + k * Math.PI / 4, nx = Math.cos(a), nz = Math.sin(a);
    const p0 = corners[k], p1 = corners[(k + 1) % 8];
    const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
    edges.push({ k, p0, p1, nx, nz, mx, mz, rail: k !== 0 && world.backDist(mx + nx * 0.4, mz + nz * 0.4) < -1.6 });
  }
  // leave the edge that faces the tip of the headland open: that is the way down onto the rocky point
  const wl = map.coast.waterline;
  let tip = null;
  for (const p of wl) if (p[0] > 0 && p[0] < 250 && (!tip || p[1] > tip[1])) tip = p;
  tip = tip || [cx, cz + 30];
  const tl = Math.hypot(tip[0] - cx, tip[1] - cz) || 1, tdx = (tip[0] - cx) / tl, tdz = (tip[1] - cz) / tl;
  let best = null;
  for (const e of edges) if (e.rail && (!best || e.nx * tdx + e.nz * tdz > best.nx * tdx + best.nz * tdz)) best = e;
  if (best) { best.rail = false; openings.push({ x: best.mx, z: best.mz, nx: best.nx, nz: best.nz }); }

  return { pts, segs, off, at, pieces, openings, landing: { x: cx, z: cz, r: Rc, th0, corners, edges }, length: cum };
}

// ----------------------------------------------------------------------------------------------------------------------
export function buildBoardwalk(ctx, layout, group) {
  const { geo, collision, world } = ctx;
  const { segs, off, at, pieces, landing } = layout;
  const parts = [];

  // raw triangle soup with explicit UVs (u across the walk = along the plank, v along the walk)
  const P = [], N = [], U = [], C = [];
  const push = (p, n, u, v, c) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); U.push(u, v); C.push(c, c * 0.985, c * 0.96); };
  const tri = (a, b, c, n, ua, ub, uc, col) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    if (d >= 0) { push(a, n, ua[0], ua[1], col); push(b, n, ub[0], ub[1], col); push(c, n, uc[0], uc[1], col); }
    else { push(a, n, ua[0], ua[1], col); push(c, n, uc[0], uc[1], col); push(b, n, ub[0], ub[1], col); }
  };
  const quad = (a, b, c, d, n, ua, ub, uc, ud, col) => { tri(a, b, c, n, ua, ub, uc, col); tri(a, c, d, n, ua, uc, ud, col); };
  const UP = [0, 1, 0];

  // deck + fascia per segment
  for (const s of segs) {
    const L0 = off(s.i, -DECK_HALF), R0 = off(s.i, DECK_HALF), L1 = off(s.i + 1, -DECK_HALF), R1 = off(s.i + 1, DECK_HALF);
    const uv = (p) => [(p[0] - s.ax) * s.nx + (p[1] - s.az) * s.nz, s.cum + (p[0] - s.ax) * s.tx + (p[1] - s.az) * s.tz];
    const y = DECK_Y, tone = 0.94 + 0.08 * ((s.i * 7) % 3) / 2;
    quad([L0[0], y, L0[1]], [R0[0], y, R0[1]], [R1[0], y, R1[1]], [L1[0], y, L1[1]], UP, uv(L0), uv(R0), uv(R1), uv(L1), tone);
    for (const [e0, e1, sgn] of [[R0, R1, 1], [L0, L1, -1]]) {
      const n = [s.nx * sgn, 0, s.nz * sgn], v0 = uv(e0)[1], v1 = uv(e1)[1];
      quad([e0[0], y, e0[1]], [e1[0], y, e1[1]], [e1[0], y - 0.32, e1[1]], [e0[0], y - 0.32, e0[1]], n,
        [v0, 0.6], [v1, 0.6], [v1, 0.28], [v0, 0.28], 0.6);
    }
  }
  // landing: plank top (planks square to the boardwalk) + fascia
  {
    const c = landing, y = DECK_Y + 0.012, s0 = segs[0];
    const uv = (p) => [(p[0] - c.x) * s0.tx + (p[1] - c.z) * s0.tz + 0.31, (p[0] - c.x) * s0.nx + (p[1] - c.z) * s0.nz];
    for (const e of c.edges) {
      tri([c.x, y, c.z], [e.p0[0], y, e.p0[1]], [e.p1[0], y, e.p1[1]], UP, uv([c.x, c.z]), uv(e.p0), uv(e.p1), 1.0);
      const l = Math.hypot(e.p1[0] - e.p0[0], e.p1[1] - e.p0[1]);
      quad([e.p0[0], y, e.p0[1]], [e.p1[0], y, e.p1[1]], [e.p1[0], y - 0.5, e.p1[1]], [e.p0[0], y - 0.5, e.p0[1]], [e.nx, 0, e.nz],
        [0, 0.6], [l, 0.6], [l, 0.1], [0, 0.1], 0.6);
    }
  }
  const soup = new THREE.BufferGeometry();
  soup.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  soup.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  soup.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  soup.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  parts.push(soup);

  // squared timber between two plan points; y = underside
  const col = new THREE.Color();
  const beam = (p0, p1, y, w, h, tone, ext = 0) => {
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const g = geo.box(len + ext * 2, h, w, { x: (p0[0] + p1[0]) / 2, y, z: (p0[1] + p1[1]) / 2, rotY: Math.atan2(-dz, dx) });
    parts.push(geo.tint(g, col.setRGB(tone, tone * 0.97, tone * 0.93)));
  };
  const post = (p, rotY, h = RAIL_H, tone = 0.92) => {
    const g = geo.box(0.115, h + 0.22, 0.115, { x: p[0], y: DECK_Y - 0.25, z: p[1], rotY });
    parts.push(geo.tint(g, col.setRGB(tone, tone * 0.96, tone * 0.9)));
  };
  const rail = (p0, p1, rotY) => {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const n = Math.max(1, Math.round(len / 2));
    for (let j = 0; j <= n; j++) post([p0[0] + ((p1[0] - p0[0]) * j) / n, p0[1] + ((p1[1] - p0[1]) * j) / n], rotY);
    beam(p0, p1, DECK_Y + RAIL_H - 0.05, 0.15, 0.05, 1.05, 0.07);      // cap rail (hand-worn, paler)
    beam(p0, p1, DECK_Y + 0.7, 0.05, 0.075, 0.9);                     // mid rails
    beam(p0, p1, DECK_Y + 0.36, 0.05, 0.075, 0.9);
    collision.addSegment(p0[0], p0[1], p1[0], p1[1], 0.11, 'boardwalk-rail');
  };

  for (const p of pieces) {
    if (p.u1 - p.u0 < 0.3) continue;
    rail(p.p0, p.p1, Math.atan2(-p.s.tz, p.s.tx));
  }
  // low kerb timber along the landward edge
  for (const s of segs) {
    const a = at(s, s.i === 0 ? LANDING_R : 0, -(DECK_HALF - 0.07)), b = at(s, s.len, -(DECK_HALF - 0.07));
    beam(a, b, DECK_Y, 0.1, 0.09, 0.7);
  }
  // seaward edge beam, a finger proud of the planks: the deck reads as a built thing even where it lies on the rock
  for (const s of segs) {
    for (const pc of pieces) if (pc.s === s && pc.u1 - pc.u0 > 0.3) beam(at(s, pc.u0, DECK_HALF + 0.04), at(s, pc.u1, DECK_HALF + 0.04), DECK_Y - 0.14, 0.11, 0.18, 0.74);
  }
  // piles under the seaward edge: core's ground strip is only 0.9 m wide on this side (world/height.js BOARD_HALF_SEA)
  // and the rock falls away beyond it, so the deck edge stands clear of the reef on dark posts with a cross head
  for (const s of segs) {
    for (let u = 0.9; u < s.len - 0.5; u += 2.2) {
      const p = at(s, u, DECK_HALF - 0.12);
      const gy = world.heightAt(p[0] + s.nx * 0.25, p[1] + s.nz * 0.25) - 0.35;
      const hgt = DECK_Y - 0.3 - gy;
      if (hgt < 0.42) continue;
      const rotY = Math.atan2(-s.tz, s.tx);
      parts.push(geo.tint(geo.box(0.17, hgt, 0.17, { x: p[0], y: gy, z: p[1], rotY }), col.setRGB(0.5, 0.47, 0.43)));
      // joist end running back under the deck
      const q = at(s, u, DECK_HALF - 0.75);
      parts.push(geo.tint(geo.box(0.12, 0.16, 1.5, { x: q[0], y: DECK_Y - 0.3, z: q[1], rotY }), col.setRGB(0.46, 0.43, 0.4)));
    }
  }
  // duckboard steps from every rail opening down onto the reef: treads on two stringers, following the falling rock,
  // open between the treads so the rock and a line of shadow show through
  for (const o of layout.openings) {
    const tx = -o.nz, tz = o.nx, rotY = Math.atan2(-tz, tx);
    for (let k = 0; k < 7; k++) {
      const d = 0.34 + k * 0.56;
      const cx = o.x + o.nx * d, cz = o.z + o.nz * d;
      const top = Math.min(DECK_Y, world.heightAt(cx, cz) + 0.11);
      parts.push(geo.tint(geo.box(2.3, 0.055, 0.44, { x: cx, y: top - 0.055, z: cz, rotY }), col.setRGB(0.95, 0.92, 0.87)));
      for (const sgn of [-1, 1]) {
        const bx = cx + tx * sgn * 0.95, bz = cz + tz * sgn * 0.95;
        const gy = Math.min(world.heightAt(bx, bz), world.heightAt(bx + o.nx * 0.28, bz + o.nz * 0.28)) - 0.12;
        parts.push(geo.tint(geo.box(0.09, Math.max(0.08, top - 0.055 - gy), 0.56, { x: bx, y: gy, z: bz, rotY }), col.setRGB(0.6, 0.58, 0.54)));
      }
    }
  }
  // landing rails + a threshold beam where the granite paving ends
  for (const e of landing.edges) {
    const inset = (q) => [q[0] + (landing.x - q[0]) * 0.035, q[1] + (landing.z - q[1]) * 0.035];
    if (e.rail) rail(inset(e.p0), inset(e.p1), Math.atan2(-(e.p1[1] - e.p0[1]), e.p1[0] - e.p0[0]));
  }

  const merged = geo.merge(parts);
  const mat = ctx.mats.get('boardwalk').clone();
  mat.vertexColors = true;
  mat.name = 'coast:boardwalk';
  const mesh = geo.staticMesh(merged, mat, { cast: true, receive: true, name: 'boardwalk' });
  group.add(mesh);
  return { mesh, triangles: merged.attributes.position.count / 3, dispose() { merged.dispose(); mat.dispose(); } };
}
