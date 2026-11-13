// 2D collision + walkability (ctx.collision). Pure JS. Everything is a circle (the walker) against circles, oriented
// boxes and thick segments stored in a spatial hash. Core pre-registers the colliders that follow from the world plan
// (garden walls, closed gates, villa + landmark footprints, tree trunks, lamp posts, the seawall balustrade, benches).
// Feature modules add colliders only for solid things they invent themselves (reef boulders, figures, sign posts...).
import { MAP, WALK, walkMaxX, pointAt } from '../world/map.js';
import { heightAt, backDist, HALF_PROM } from '../world/height.js';

const CELL = 8;
export const MAX_WADE_DEPTH = 0.45;   // the walker may wade until the sea bed is this far below sea level

export function createCollision() {
  const grid = new Map();
  const all = [];
  const key = (cx, cz) => cx * 8192 + cz;
  function insert(c) {
    c.id = all.length; all.push(c);
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL), z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = key(cx, cz);
      let a = grid.get(k); if (!a) grid.set(k, (a = []));
      a.push(c);
    }
    return c;
  }
  const api = {
    all,
    /** Solid vertical cylinder. */
    addCircle(x, z, r, tag = '') { return insert({ type: 0, x, z, r, tag, on: true, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r }); },
    /** Oriented box: centre (x,z), half extents hw (local X) and hd (local Z), rot = THREE rotation.y. */
    addBox(x, z, hw, hd, rot = 0, tag = '') {
      const R = Math.hypot(hw, hd);
      return insert({ type: 1, x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), tag, on: true, minX: x - R, maxX: x + R, minZ: z - R, maxZ: z + R });
    },
    /** Thick segment (capsule) from (x1,z1) to (x2,z2) with half thickness r. */
    addSegment(x1, z1, x2, z2, r = 0.25, tag = '') {
      return insert({ type: 2, x1, z1, x2, z2, r, tag, on: true, minX: Math.min(x1, x2) - r, maxX: Math.max(x1, x2) + r, minZ: Math.min(z1, z2) - r, maxZ: Math.max(z1, z2) + r });
    },
    /** Polyline of thick segments. pts = [[x,z],...] */
    addPolyline(pts, r = 0.25, tag = '') { for (let i = 0; i < pts.length - 1; i++) api.addSegment(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, tag); },
    /** Disable every collider whose tag equals `tag` (e.g. to replace a landmark's default footprint box). Returns count. */
    removeTag(tag) { let n = 0; for (const c of all) if (c.tag === tag && c.on) { c.on = false; n++; } return n; },
    /** Enable/disable by tag (e.g. a gate that opens). */
    setTagEnabled(tag, on) { for (const c of all) if (c.tag === tag) c.on = on; },

    /**
     * Push a circle of radius r at (x,z) out of all colliders. Writes out.x/out.z, returns out. out.hit = touched anything.
     */
    resolve(x, z, r, out = {}) {
      let hit = false;
      for (let iter = 0; iter < 3; iter++) {
        let moved = false;
        const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
          const cell = grid.get(key(cx, cz));
          if (!cell) continue;
          for (let n = 0; n < cell.length; n++) {
            const c = cell[n];
            if (!c.on) continue;
            let qx, qz; // closest point on the collider's core shape
            let rr = r;
            if (c.type === 0) { qx = c.x; qz = c.z; rr = r + c.r; }
            else if (c.type === 2) {
              const dx = c.x2 - c.x1, dz = c.z2 - c.z1;
              let t = ((x - c.x1) * dx + (z - c.z1) * dz) / (dx * dx + dz * dz || 1);
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              qx = c.x1 + dx * t; qz = c.z1 + dz * t; rr = r + c.r;
            } else {
              const dx = x - c.x, dz = z - c.z;
              const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
              if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) {
                // inside the box: exit through the nearest face
                const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
                let nlx = lx, nlz = lz;
                if (px < pz) nlx = (lx < 0 ? -1 : 1) * (c.hw + r); else nlz = (lz < 0 ? -1 : 1) * (c.hd + r);
                x = c.x + nlx * c.c + nlz * c.s; z = c.z - nlx * c.s + nlz * c.c;
                moved = hit = true;
                continue;
              }
              const clx = lx < -c.hw ? -c.hw : lx > c.hw ? c.hw : lx, clz = lz < -c.hd ? -c.hd : lz > c.hd ? c.hd : lz;
              qx = c.x + clx * c.c + clz * c.s; qz = c.z - clx * c.s + clz * c.c;
            }
            const ex = x - qx, ez = z - qz, d2 = ex * ex + ez * ez;
            if (d2 < rr * rr) {
              const d = Math.sqrt(d2);
              if (d > 1e-5) { x = qx + (ex / d) * rr; z = qz + (ez / d) * rr; } else { x = qx + rr; }
              moved = hit = true;
            }
          }
        }
        if (!moved) break;
      }
      out.x = x; out.z = z; out.hit = hit;
      return out;
    },

    /** Can a walker stand at (x,z)? (inside the playable bounds and not in deep water). Ignores colliders. */
    walkable(x, z) {
      return x >= WALK.minX && x <= walkMaxX(z) && z >= WALK.minZ && heightAt(x, z) > -MAX_WADE_DEPTH;
    },

    /**
     * One walking step for a circle of radius r from (fx,fz) toward (tx,tz): sub-steps, slides along colliders, clamps to
     * the playable bounds and refuses deep water. Writes out.x/out.z (+ out.hit, out.blocked, out.edge = stopped by the
     * limit of the walkable area) and returns out.
     */
    move(fx, fz, tx, tz, r = 0.35, out = {}) {
      const dist = Math.hypot(tx - fx, tz - fz);
      const steps = Math.max(1, Math.ceil(dist / 0.25));
      let x = fx, z = fz, hit = false, blocked = false, edge = false;
      for (let i = 0; i < steps; i++) {
        let nx = x + (tx - fx) / steps, nz = z + (tz - fz) / steps;
        api.resolve(nx, nz, r, out);
        nx = out.x; nz = out.z; hit = hit || out.hit;
        if (nz < WALK.minZ) { nz = WALK.minZ; blocked = edge = true; }
        // east limit: WALK.maxX inland, pulled in along the coast (walkMaxX: a diagonal the walker slides along).
        // A walker placed well outside it (teleport, ?pos=) is not dragged back, he just cannot go further east.
        const mx = walkMaxX(nz);
        if (nx < WALK.minX) { nx = WALK.minX; blocked = edge = true; }
        else if (nx > mx) { nx = x > mx + 0.5 ? Math.min(nx, x) : mx; blocked = edge = true; }
        if (heightAt(nx, nz) < -MAX_WADE_DEPTH) {
          // try sliding along each axis before giving up
          if (heightAt(nx, z) >= -MAX_WADE_DEPTH) nz = z;
          else if (heightAt(x, nz) >= -MAX_WADE_DEPTH) nx = x;
          else { nx = x; nz = z; }
          blocked = true;
        }
        x = nx; z = nz;
      }
      out.x = x; out.z = z; out.hit = hit; out.blocked = blocked; out.edge = edge;
      return out;
    },
  };

  // ---- colliders that follow from the world plan --------------------------------------------------------------------
  for (const w of MAP.walls) api.addPolyline(w.pts, w.thickness / 2 + 0.05, 'wall');
  for (const g of MAP.gates) {
    const hw = g.width / 2;
    api.addCircle(g.x - g.tx * (hw + 0.3), g.z - g.tz * (hw + 0.3), 0.42, 'gatepier');
    api.addCircle(g.x + g.tx * (hw + 0.3), g.z + g.tz * (hw + 0.3), 0.42, 'gatepier');
    if (!g.open) api.addSegment(g.x - g.tx * hw, g.z - g.tz * hw, g.x + g.tx * hw, g.z + g.tz * hw, 0.12, `gate:${g.owner}`);
  }
  for (const l of MAP.lots) api.addBox(l.x, l.z, l.w / 2, l.d / 2, l.rot, `villa:${l.id}`);
  for (const l of MAP.landmarks) api.addBox(l.x, l.z, l.w / 2, l.d / 2, l.rot, `landmark:${l.id}`);
  for (const t of MAP.trees) if (!t.shrub) api.addCircle(t.x, t.z, t.species === 'juniper' ? Math.max(0.5, t.r * 0.6) : t.trunk + 0.12, 'tree');
  for (const l of MAP.lamps) api.addCircle(l.x, l.z, 0.18, 'lamp');
  for (const b of MAP.benches) api.addBox(b.x, b.z, 0.85, 0.32, b.rot, 'bench');
  // seawall balustrade along the seaward edge of the promenade, open at the four beach stairs
  {
    const prom = MAP.promenade, p = {};
    let run = null;
    const flush = () => { if (run && run.length > 1) api.addPolyline(run, 0.18, 'seawall'); run = null; };
    for (let s = 0; s <= prom.len; s += 0.5) {
      pointAt(prom, s, p);
      const sgn = backDist(p.x + p.nx * 2, p.z + p.nz * 2) < 0 ? 1 : -1; // seaward normal
      const x = p.x + p.nx * sgn * (HALF_PROM - 0.15), z = p.z + p.nz * sgn * (HALF_PROM - 0.15);
      const open = prom.steps.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.width / 2) || s > prom.len - 8;
      if (open) flush(); else (run || (run = [])).push([x, z]);
    }
    flush();
    // cheek walls beside each flight of beach steps (frames: MAP.promenade.steps, see world/height.js BEACH_STAIRS)
    for (const S of prom.steps) {
      for (const sg of [-1, 1]) {
        const w = sg * (S.hw + 0.175), ax = S.fz, az = -S.fx;
        api.addSegment(S.x + S.fx * S.d0 + ax * w, S.z + S.fz * S.d0 + az * w, S.x + S.fx * (S.d1 + 0.4) + ax * w, S.z + S.fz * (S.d1 + 0.4) + az * w, 0.2, 'seawall');
      }
    }
  }
  return api;
}
