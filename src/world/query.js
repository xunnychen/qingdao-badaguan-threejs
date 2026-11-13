// Fast spatial queries over the world plan. Pure JS (no three.js). Exposed to modules as ctx.world.
import { MAP, WALK, BOUNDS, EXTENT, parkAt, pointAt, distToLine, toLocal, rectCorners, polySignedDist } from './map.js';
import { heightAt, normalAt, slopeAt, shoreDist, backDist, backInfo, beachness, HALF_PROM, PROM_Y, SEA_LEVEL } from './height.js';

// --- uniform grid over street + path segments -------------------------------------------------------------------------
const CELL = 16, REACH = 16;
const lines = [...MAP.streets, ...MAP.paths];
const grid = new Map();
lines.forEach((line, li) => {
  const pts = line.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = Math.floor((Math.min(pts[i][0], pts[i + 1][0]) - REACH) / CELL), x1 = Math.floor((Math.max(pts[i][0], pts[i + 1][0]) + REACH) / CELL);
    const z0 = Math.floor((Math.min(pts[i][1], pts[i + 1][1]) - REACH) / CELL), z1 = Math.floor((Math.max(pts[i][1], pts[i + 1][1]) + REACH) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = cx * 4096 + cz;
      let a = grid.get(k); if (!a) grid.set(k, (a = []));
      a.push(li * 4096 + i);
    }
  }
});

function nearestLine(x, z, wantStreet, out) {
  const cell = grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (!cell) return null;
  let best = REACH * REACH, found = false;
  for (let n = 0; n < cell.length; n++) {
    const li = (cell[n] / 4096) | 0, i = cell[n] % 4096;
    const isStreet = li < MAP.streets.length;
    if (isStreet !== wantStreet) continue;
    const line = lines[li], pts = line.pts;
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az;
    const l2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (ax + dx * t), ez = z - (az + dz * t);
    // prefer the line whose *edge* is closest so wide roads win at junctions
    const d = ex * ex + ez * ez;
    if (d < best) {
      best = d; found = true;
      out.line = line; out.i = i; out.s = line.cum[i] + Math.sqrt(l2) * t; out.side = ex * dz - ez * dx >= 0 ? 1 : -1;
    }
  }
  if (!found) return null;
  out.d = Math.sqrt(best);
  return out;
}

/**
 * Nearest street centre line within 16 m of (x,z), or null.
 * Returns {street, d, s, side, i}: street object, distance (m), arc length along it, side (+1 left / -1 right), segment index.
 * Pass `out` to avoid allocation.
 */
export function nearestStreet(x, z, out = {}) {
  const r = nearestLine(x, z, true, out);
  if (r) r.street = r.line;
  return r;
}
/** Nearest footpath (MAP.paths) within 16 m, same shape as nearestStreet but with `.path`. */
export function nearestPath(x, z, out = {}) {
  const r = nearestLine(x, z, false, out);
  if (r) r.path = r.line;
  return r;
}

const _a = {}, _b = {}, _c = {};
/**
 * What the ground is at (x,z). One of:
 *  'water' | 'sand' | 'rock' | 'promenade' | 'boardwalk' | 'road' | 'sidewalk' | 'path' | 'lawn' | 'garden'
 * ('lawn' = public park grass, 'garden' = private garden ground behind the walls.)
 */
export function surfaceAt(x, z) {
  backInfo(x, z, _c);
  const b = _c.b;
  if (b < -HALF_PROM) {
    if (shoreDist(x, z) <= 0) return 'water';
    return beachness(_c.x) > 0.5 ? 'sand' : 'rock';
  }
  if (b <= HALF_PROM) {
    if (_c.x >= MAP.coast.promenadeX[0] && _c.x <= MAP.coast.promenadeX[1]) return 'promenade';
    if (_c.x > MAP.coast.boardwalkX[0] && _c.x <= MAP.coast.boardwalkX[1]) return 'boardwalk';
    return 'rock';
  }
  const st = nearestLine(x, z, true, _a);
  if (st) {
    if (st.d <= st.line.half) return 'road';
    if (st.d <= st.line.half + st.line.sidewalk) {
      // a sidewalk point may still be on another street's carriageway at a junction
      return 'sidewalk';
    }
  }
  const p = nearestLine(x, z, false, _b);
  if (p && p.d <= p.line.half) return 'path';
  if (parkAt(x, z)) return 'lawn';
  return 'garden';
}

/** true if (x,z) is on any carriageway (checks every nearby street, not just the nearest centre line). */
export function onRoad(x, z, margin = 0) {
  const cell = grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (!cell) return false;
  for (let n = 0; n < cell.length; n++) {
    const li = (cell[n] / 4096) | 0, i = cell[n] % 4096;
    if (li >= MAP.streets.length) continue;
    const line = lines[li], pts = line.pts;
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (ax + dx * t), ez = z - (az + dz * t), r = line.half + margin;
    if (ex * ex + ez * ez <= r * r) return true;
  }
  return false;
}

/** Distance in metres to the nearest tree of a species set within `maxR` (linear scan over a coarse grid). */
const treeCells = new Map();
for (const t of MAP.trees) {
  const k = Math.floor(t.x / 20) * 4096 + Math.floor(t.z / 20);
  let a = treeCells.get(k); if (!a) treeCells.set(k, (a = []));
  a.push(t);
}
/** Trees whose trunk is within r metres of (x,z). r <= 20. Returns array of MAP.trees entries. */
export function treesNear(x, z, r = 10, out = []) {
  out.length = 0;
  const cx = Math.floor(x / 20), cz = Math.floor(z / 20);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = treeCells.get((cx + i) * 4096 + (cz + j));
    if (a) for (const t of a) if ((t.x - x) * (t.x - x) + (t.z - z) * (t.z - z) <= r * r) out.push(t);
  }
  return out;
}

export const inBounds = (x, z, m = 0) => x >= BOUNDS.minX + m && x <= BOUNDS.maxX - m && z >= BOUNDS.minZ + m && z <= BOUNDS.maxZ - m;

export const world = {
  map: MAP, BOUNDS, WALK, EXTENT, SEA_LEVEL, PROM_Y,
  heightAt, normalAt, slopeAt, shoreDist, backDist, backInfo, beachness,
  surfaceAt, nearestStreet, nearestPath, onRoad, treesNear, parkAt, inBounds,
  pointAt, distToLine, toLocal, rectCorners, polySignedDist,
};
export default world;
