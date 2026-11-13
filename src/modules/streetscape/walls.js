// Garden walls: THE street edge of 八大关. Rubble base following the ground, coping, granite piers, and a top that is
// a wrought-iron railing, open-work masonry or nothing (the life package grows a hedge there).
// Runs are first stitched to the gate piers and joined at street corners so the wall reads as continuous.
import { stations, stationAt, sweep } from './util.js';
import { pier, mix, scl } from './parts.js';
import { RAIL_TILE } from './atlas.js';

const T = 0.225;            // half thickness of the rubble base
const COPE = 0.1;           // coping thickness (its top is at heightAt + w.h, where the hedge sits)
const MOSS = [0.4, 0.47, 0.31];
const PIERCED_BACK = [0.62, 0.62, 0.6];

function copingProfile(kind, y1, thick = COPE, half = 0.272) {
  const y0 = y1 - thick;
  if (kind === 'round') {
    const out = [{ o: half, y: y0 }];
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI; out.push({ o: half * Math.cos(a), y: y0 + 0.025 + (thick + 0.02) * Math.sin(a) }); }
    out.push({ o: -half, y: y0 });
    return out;
  }
  return [{ o: half, y: y0 }, { o: half, y: y1 - 0.03 }, { o: half - 0.035, y: y1 }, { o: -(half - 0.035), y: y1 }, { o: -half, y: y1 - 0.03 }, { o: -half, y: y0 }];
}

/** Stitch run ends to gate piers and to each other at corners. Returns [{ w, pts, end: [flag, flag] }]. */
function prepareRuns(ctx) {
  const { map, world, collision } = ctx;
  const runs = map.walls.map((w) => ({ w, pts: w.pts.map((p) => [p[0], p[1]]), end: [null, null], cornerWith: [null, null] }));
  const endInfo = (r, e) => {
    const p = r.pts, n = p.length, a = e ? p[n - 1] : p[0], b = e ? p[n - 2] : p[1];
    const dx = a[0] - b[0], dz = a[1] - b[1], l = Math.hypot(dx, dz) || 1;
    return { r, e, x: a[0], z: a[1], dx: dx / l, dz: dz / l };
  };
  const extend = (r, e, x, z) => {
    const q = e ? r.pts[r.pts.length - 1] : r.pts[0];
    if (Math.hypot(q[0] - x, q[1] - z) < 0.03) return;
    collision.addSegment(q[0], q[1], x, z, 0.275, 'wall');
    if (e) r.pts.push([x, z]); else r.pts.unshift([x, z]);
  };
  // ---- gate piers ----------------------------------------------------------------------------------------------------
  const gp = [];
  for (const g of map.gates) for (const sg of [-1, 1]) gp.push({ x: g.x + g.tx * (g.width / 2 + 0.3) * sg, z: g.z + g.tz * (g.width / 2 + 0.3) * sg, g });
  for (const r of runs) for (const e of [0, 1]) {
    const E = endInfo(r, e);
    let best = null, bd = 2.3;
    for (const q of gp) {
      if (q.g.street !== r.w.street || q.g.side !== r.w.side) continue;
      const vx = q.x - E.x, vz = q.z - E.z, d = Math.hypot(vx, vz);
      if (d < bd && (d < 0.35 || (vx * E.dx + vz * E.dz) / d > 0.8)) { bd = d; best = q; }
    }
    if (best) { extend(r, e, best.x, best.z); r.end[e] = 'gate'; }
  }
  // ---- corners -------------------------------------------------------------------------------------------------------
  const free = [];
  for (const r of runs) for (const e of [0, 1]) if (!r.end[e]) free.push(endInfo(r, e));
  const pairs = [], np = {};
  for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
    const a = free[i], b = free[j];
    if (a.r === b.r) continue;
    const wx = b.x - a.x, wz = b.z - a.z;
    if (wx * wx + wz * wz > 36) continue;
    const cross = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(cross) < 0.3) {
      // a bend where one street runs on into the next: the two ends face each other, bridge the gap straight
      const d = Math.hypot(wx, wz), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if (a.dx * b.dx + a.dz * b.dz > -0.6 || d < 0.05 || (wx * a.dx + wz * a.dz) / d < 0.75 || world.onRoad(mx, mz, 0.5)) continue;
      const pm = world.nearestPath(mx, mz, np);
      if (pm && pm.d < pm.path.half + 0.6) continue;
      if (map.gates.some((g) => Math.hypot(g.x - mx, g.z - mz) < g.width / 2 + d / 2 + 0.3)) continue;
      if (world.parkAt(mx + a.dz * 4, mz - a.dx * 4) || world.parkAt(mx - a.dz * 4, mz + a.dx * 4)) continue;
      pairs.push({ a, b, cx: b.x, cz: b.z, t: d, u: 0, cost: d });
      continue;
    }
    const t = (wx * b.dz - wz * b.dx) / cross, u = (wx * a.dz - wz * a.dx) / cross;
    if (t < -0.3 || u < -0.3 || t > 5 || u > 5) continue;
    const cx = a.x + a.dx * t, cz = a.z + a.dz * t;
    if (world.onRoad(cx, cz, 0.6) || world.onRoad((a.x + cx) / 2, (a.z + cz) / 2, 0.4) || world.onRoad((b.x + cx) / 2, (b.z + cz) / 2, 0.4)) continue;
    const pth = world.nearestPath(cx, cz, np);
    if (pth && pth.d < pth.path.half + 0.5) continue;
    pairs.push({ a, b, cx, cz, t, u, cost: Math.max(t, 0) + Math.max(u, 0) });
  }
  pairs.sort((p, q) => p.cost - q.cost);
  const corners = [];
  for (const p of pairs) {
    if (p.a.r.end[p.a.e] || p.b.r.end[p.b.e]) continue;
    if (p.t > 0.03) extend(p.a.r, p.a.e, p.cx, p.cz);
    if (p.u > 0.03) extend(p.b.r, p.b.e, p.cx, p.cz);
    p.a.r.end[p.a.e] = 'corner'; p.b.r.end[p.b.e] = 'cornerB';
    p.a.r.cornerWith[p.a.e] = p.b.r.w;
    corners.push([p.cx, p.cz]);
  }
  return { runs, corners };
}

export function buildWalls(ctx, S, iron) {
  const { world, rng } = ctx;
  const H = world.heightAt, { fbm2, clamp } = rng;
  const { runs, corners } = prepareRuns(ctx);
  const A = {}, B = {};
  let nPiers = 0;

  for (const r of runs) {
    const w = r.w, rand = rng.makeRng('streetscape:wall:' + w.id);
    const st = stations(r.pts, H, 2);
    if (st.length < 2) continue;
    const L = st[st.length - 1].s, mid = st[st.length >> 1], h = w.h;
    const rub = S.get('rubble', mid.x, mid.z), cop = S.get('coping', mid.x, mid.z), gra = S.get('granite', mid.x, mid.z), irn = S.get('iron', mid.x, mid.z);

    // ---- per-run character -------------------------------------------------------------------------------------------
    const k = rand.range(0.86, 1.05), warm = rand.range(-0.03, 0.05);
    const tint = [k * (1 + warm), k, k * (1 - warm * 1.3)];
    const copeTint = scl([1 + warm * 0.6, 1, 1 - warm * 0.8], rand.range(0.9, 1.04));
    const railStyle = rand.chance(0.58) ? 'spear' : 'scroll';
    const railH = clamp(rand.range(0.8, 1.0), 0.8, Math.max(0.8, 2.02 - h));
    const capKind = rand.chance(0.22) ? 'ball' : 'pyramid';
    const roundCope = rand.chance(0.45);
    const pierTop = w.top === 'rail' ? h + railH + 0.07 : w.top === 'pierced' ? h + 0.72 : clamp(h + 0.74, 1.6, 1.9);
    const uOff = rand.range(0, 2), uvScale = rand.range(0.92, 1.3);

    // ---- rubble base (two faces; the coping hides the top) -------------------------------------------------------------
    const moss = st.map((s) => fbm2(s.x * 0.23, s.z * 0.23, 3, 5)), damp = st.map((s) => fbm2(s.x * 0.8 + 31, s.z * 0.8, 2, 9));
    const colour = (garden) => (i, c) => {
      const m = moss[i] * (garden ? 0.82 : 1), d = 0.9 + 0.16 * damp[i];
      if (c === 0) return scl(mix(tint, MOSS, clamp(1.5 - 1.5 * m, 0.45, 0.95)), 0.5);
      if (c === 1) return scl(mix(scl(tint, 0.92), MOSS, clamp(0.95 - 1.9 * m, 0.04, 0.7)), d);
      return scl(tint, (garden ? 0.9 : 0.97) * d);
    };
    const ys = [-0.4, 0.42, h - COPE];
    // +o is the LEFT of the run direction; the garden is on the left when the wall stands on the street's left
    const colG = colour(true), colS = colour(false), left = w.side > 0 ? colG : colS, right = w.side > 0 ? colS : colG;
    sweep(rub, st, ys.map((y) => ({ o: T, y })), { vWorld: true, uOff, uvScale, color: (i, c) => left(i, c) });
    sweep(rub, st, ys.map((y) => ({ o: -T, y })).reverse(), { vWorld: true, uOff: uOff + 0.7, uvScale, color: (i, c) => right(i, 2 - c) });

    // ---- coping ------------------------------------------------------------------------------------------------------
    const lichen = (i) => scl(copeTint, 0.84 + 0.26 * damp[i] - 0.14 * clamp(1 - 2 * moss[i], 0, 1));
    const baseCope = copingProfile('flat', h);
    sweep(cop, st, baseCope, { uOff, color: (i) => lichen(i) });

    // ---- piers -------------------------------------------------------------------------------------------------------
    const n = Math.max(1, Math.round(L / 3.7)), ps = [];
    for (let i = 0; i <= n; i++) ps.push((i * L) / n);
    for (let i = 0; i <= n; i++) {
      const e = i === 0 ? 0 : i === n ? 1 : -1;
      if (e >= 0 && (r.end[e] === 'gate' || r.end[e] === 'cornerB')) continue;
      stationAt(st, ps[i], A);
      const corner = e >= 0 && r.end[e] === 'corner';
      pier(gra, A.x, A.z, H(A.x, A.z), A.tx, A.tz, {
        size: corner ? 0.56 : 0.5, top: pierTop + (corner ? 0.14 : 0), cap: capKind, tint: scl(tint, 1.04),
        moss: clamp(1.2 - 1.6 * fbm2(A.x * 0.23, A.z * 0.23, 3, 5), 0, 1),
      });
      nPiers++;
    }

    // ---- top ---------------------------------------------------------------------------------------------------------
    if (w.top === 'hedge') continue;
    const span = (s0, s1, fn) => {
      const bp = [s0];
      for (const q of st) if (q.s > s0 + 0.08 && q.s < s1 - 0.08) bp.push(q.s);
      bp.push(s1);
      stationAt(st, bp[0], A);
      for (let i = 1; i < bp.length; i++) {
        stationAt(st, bp[i], B);
        fn(A, B, bp[i - 1], bp[i]);
        A.x = B.x; A.z = B.z; A.g = B.g; A.tx = B.tx; A.tz = B.tz;
      }
    };
    for (let i = 0; i < n; i++) {
      const s0 = ps[i] + 0.24, s1 = ps[i + 1] - 0.24, Lp = s1 - s0;
      if (Lp < 0.3) continue;
      if (w.top === 'rail') {
        const [v0, v1] = iron.strip[railStyle];
        const uEnd = (Math.max(1, Math.round(Lp / 0.12)) * 0.12) / RAIL_TILE;
        span(s0, s1, (a, b, sa, sb) => {
          const ua = ((sa - s0) / Lp) * uEnd, ub = ((sb - s0) / Lp) * uEnd, ya = a.g + h - 0.012, yb = b.g + h - 0.012;
          irn.quad([a.x, ya, a.z], [b.x, yb, b.z], [b.x, yb + railH, b.z], [a.x, ya + railH, a.z], [a.tz, 0, -a.tx], [ua, v1], [ub, v1], [ub, v0], [ua, v0]);
        });
      } else {
        const [v0, v1] = iron.strip.pierced, pc = scl(tint, 1.0);
        const uEnd = (Math.max(1, Math.round(Lp / 0.24)) * 0.24) / RAIL_TILE;
        // the garden-side leaf is tinted down: seen through the holes of the street leaf it reads as the reveal depth
        for (const off of [0.085, -0.085]) {
          const garden = off * w.side > 0, cc = garden ? PIERCED_BACK : pc;
          span(s0, s1, (a, b, sa, sb) => {
            const ua = ((sa - s0) / Lp) * uEnd, ub = ((sb - s0) / Lp) * uEnd, ya = a.g + h - 0.005, yb = b.g + h - 0.005;
            const nx = a.tz, nz = -a.tx, ax = a.x + nx * off, az = a.z + nz * off, bx = b.x + b.tz * off, bz = b.z - b.tx * off;
            irn.quad([ax, ya, az], [bx, yb, bz], [bx, yb + 0.5, bz], [ax, ya + 0.5, az], [nx * Math.sign(off), 0, nz * Math.sign(off)], [ua, v1], [ub, v1], [ub, v0], [ua, v0], cc, cc, cc, cc);
          });
        }
      }
    }
    if (w.top === 'pierced') {
      sweep(cop, st, copingProfile(roundCope ? 'round' : 'flat', h + 0.5 + 0.095, 0.1, 0.16), { uOff: uOff + 0.4, smooth: roundCope, color: (i) => lichen(i) });
    }
  }
  return { runs, corners, nPiers };
}
