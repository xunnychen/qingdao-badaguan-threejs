// Pure geometry build for all generic villas (no renderer / DOM): runs under Node for checks.
// buildVillas({ map, world, makeRng }) -> { clusters: [Map key -> buf], shared: Map key -> buf, cells: Map id -> Map key -> buf, outs: [{x,z,hw,hd,rot}], stats }
import * as THREE from 'three';
import { Sink, lin, mul } from './sink.js';
import { TRIM } from './parts.js';
import { ARCH, outbuilding } from './archetypes.js';

export const SHARED_KEYS = ['glass', 'lit', 'ivy', 'slate', 'roofBrown'];
export const NCLUSTER = 6;
const ROOF_BASE = '#b5482e';

// Fine trim (window frames, glazing bars, shutters, balusters: key 'fine') never casts a shadow and is bucketed in cells of
// CELL metres by lot, so that villas.js can hide the cells that are too far away for it to show. (Glass, lit windows and
// ivy stay global: they read at any distance, so they cannot be hidden, and per-cell meshes of them cost more draw calls
// than the 32k triangles are worth.)
export const CELL_KEYS = ['fine'];
export const CELL = 130;
export const cellOf = (x, z) => `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`;

export const clusterOf = (x, z) => (x < -100 ? 0 : x < 95 ? 1 : 2) + (z < -105 ? 0 : 3);

function makeV(S, lot, rng, world, floorY, baseY) {
  const c = Math.cos(lot.rot), s = Math.sin(lot.rot), mir = lot.mirror ? -1 : 1;
  const m = new THREE.Matrix4().makeRotationY(lot.rot).setPosition(lot.x, floorY, lot.z);
  if (lot.mirror) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  S.begin(m, !!lot.mirror, rng.range(0, 7), rng.range(0, 7), cellOf(lot.x, lot.z));
  const base = lin(ROOF_BASE);
  const hasIvy = rng.chance(0.5), ivyP = rng.range(0.35, 0.7);
  const V = {
    S, rng, lot,
    yb: baseY - 0.45 - floorY,
    /** local ground height relative to the floor */
    gy(lx, lz) { const x = lx * mir; return world.heightAt(lot.x + x * c + lz * s, lot.z - x * s + lz * c) - floorY; },
    tone(hex) { const q = lin(hex), k = rng.range(0.93, 1.03); return [q[0] * k, q[1] * k * rng.range(0.985, 1.015), q[2] * k * rng.range(0.97, 1.03)]; },
    G: rng.pick([[1, 1, 1], [1.05, 0.98, 0.92], [0.95, 0.96, 0.98], [1.04, 1.0, 0.95]]),
    mkRoof(hex) {
      const k = rng.range(0.9, 1.06), q = lin(hex);
      let key = 'roof', col = [(q[0] / base[0]) * k, (q[1] / base[1]) * k, (q[2] / base[2]) * k];
      if (hex === '#6a4b3e') { key = 'roofBrown'; col = [k, k, k]; }
      else if (hex === '#5b5f66') { key = 'slate'; col = [k, k, k]; }
      return { key, col, ridge: mul(col, 0.74), soff: mul(TRIM.white, 0.55), fascia: mul(TRIM.brown, 0.9), t: 0.2, hex };
    },
    ivy(i) { void i; return hasIvy && rng.chance(ivyP) ? { rng, cover: rng.range(0.4, 0.95), hmax: rng.range(3.6, 7.2) } : undefined; },
  };
  return V;
}

/** find a spot for a garage beside / behind the house; returns { x, z } or null */
function placeOutbuilding(lot, rng, map, world) {
  const c = Math.cos(lot.rot), s = Math.sin(lot.rot), hw = 1.9, hd = 2.9;
  const sd = rng.sign();
  const cands = [[sd * (lot.w / 2 + 3.4), -lot.d / 2 + 3.2], [-sd * (lot.w / 2 + 3.4), -lot.d / 2 + 3.2],
    [sd * (lot.w / 2 - 2.2), -(lot.d / 2 + 4.4)], [-sd * (lot.w / 2 - 2.2), -(lot.d / 2 + 4.4)], [sd * (lot.w / 2 + 3.4), -lot.d / 2 - 1.5]];
  const out = {};
  for (const [lx, lz] of cands) {
    const x = lot.x + lx * c + lz * s, z = lot.z - lx * s + lz * c;
    const pts = [[0, 0], [-hw - 0.6, -hd - 0.6], [hw + 0.6, -hd - 0.6], [hw + 0.6, hd + 0.6], [-hw - 0.6, hd + 0.6], [0, hd + 0.6], [0, -hd - 0.6]]
      .map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c]);
    let ok = true, lo = 1e9, hi = -1e9;
    for (const [px, pz] of pts) {
      const E = map.EXTENT;
      if (px < E.minX + 3 || px > E.maxX - 3 || pz < E.minZ + 3) { ok = false; break; }
      const st = world.nearestStreet(px, pz, out);
      if (st && st.d < st.street.wallOff + 1.6) { ok = false; break; }
      const pa = world.nearestPath(px, pz, out);
      if (pa && pa.d < pa.path.half + 2) { ok = false; break; }
      if (world.parkAt(px, pz, 2.5) || world.backDist(px, pz) < 12) { ok = false; break; }
      for (const o of map.lots) {
        if (o === lot) continue;
        const [qx, qz] = world.toLocal(o, px, pz);
        if (Math.abs(qx) < o.w / 2 + 4 && Math.abs(qz) < o.d / 2 + 4) { ok = false; break; }
      }
      for (const L of map.landmarks) if (Math.hypot(L.x - px, L.z - pz) < (L.reserve || 20) + 2) { ok = false; break; }
      if (!ok) break;
      const h = world.heightAt(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (!ok || hi - lo > 1.3) continue;
    if (world.treesNear(x, z, 5.2).length) continue;
    return { x, z, lo, hi };
  }
  return null;
}

export function buildVillas({ map, world, makeRng }) {
  const shared = new Map(), cells = new Map();
  const sinks = Array.from({ length: NCLUSTER }, () => new Sink(shared, SHARED_KEYS, cells, CELL_KEYS));
  const outs = [], perLot = [];
  const count = () => { let n = 0; for (const S of sinks) for (const b of S.bufs.values()) n += b.pos.length / 9; for (const b of shared.values()) n += b.pos.length / 9; for (const c of cells.values()) for (const b of c.values()) n += b.pos.length / 9; return n; };
  for (const lot of map.lots) {
    const rng = makeRng(lot.seed), S = sinks[clusterOf(lot.x, lot.z)];
    const before = count();
    const V = makeV(S, lot, rng, world, lot.floorY, lot.baseY);
    (ARCH[lot.arch] || ARCH.A)(V);
    // outbuilding
    const r2 = makeRng(lot.seed + ':out');
    if (r2.chance(0.36)) {
      const spot = placeOutbuilding(lot, r2, map, world);
      if (spot) {
        const o = { x: spot.x, z: spot.z, rot: lot.rot, mirror: false, seed: lot.seed + ':out' };
        // floor from the ground in front of the door (the back digs into the slope), so the car can actually get in
        const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot), gDoor = world.heightAt(o.x + 3.2 * sn, o.z + 3.2 * cs);
        const V2 = makeV(sinks[clusterOf(o.x, o.z)], o, r2, world, Math.max(gDoor + 0.05, spot.hi - 0.8), Math.min(spot.lo, gDoor));
        V2.roof = V2.mkRoof(V.roof.hex); V2.G = V.G;
        const wallHex = { A: '#DDBE78', C: '#9DBFCB', D: '#F1E9D6', E: '#C4BDAF', F: '#D9CBB0', G: '#EBD9A0', H: '#EFEADD', B: '#B8B2A6' }[lot.arch];
        outbuilding(V2, lot.arch, V2.tone(wallHex), r2.pick([TRIM.green, TRIM.brown, TRIM.oxblood]));
        outs.push({ x: o.x, z: o.z, hw: 1.9, hd: 2.9, rot: o.rot, lot: lot.id });
      }
    }
    perLot.push({ id: lot.id, arch: lot.arch, tris: count() - before });
  }
  return { clusters: sinks.map((S) => S.bufs), shared, cells, outs, perLot, tris: count() };
}
