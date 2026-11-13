// Street-name plates at every junction (blue, 1.0 x 0.3 m, parallel to the street they name) and a few brown tourist
// finger posts pointing to 花石楼, 公主楼 and 第二海水浴场.
import * as THREE from 'three';
import { plateQuad, lin } from './util.js';
import { obox } from './parts.js';

const STEEL = lin('#8d9296'), STEEL_D = lin('#5c6165'), BROWN = lin('#4a3524');

/** Shared "is this spot free" test for small street furniture. */
export function makeSpotTest(ctx, S) {
  const { map, world } = ctx;
  const tmp = [];
  return (x, z, r = 0.5, roadMargin = 0.3) => {
    if (world.onRoad(x, z, roadMargin)) return false;
    if (x < map.WALK.minX + 2 || x > map.WALK.maxX - 2 || z < map.WALK.minZ + 2) return false;
    for (const t of world.treesNear(x, z, r + 1.2, tmp)) if (Math.hypot(t.x - x, t.z - z) < r + t.trunk + 0.55) return false;
    for (const l of map.lamps) if (Math.hypot(l.x - x, l.z - z) < r + 0.9) return false;
    for (const g of map.gates) if (Math.hypot(g.x - x, g.z - z) < g.width / 2 + 1.6 + r) return false;
    for (const p of S.placed) if (Math.hypot(p.x - x, p.z - z) < r + p.r) return false;
    return true;
  };
}

export function planSigns(ctx, S, free) {
  const { map, world, rng } = ctx;
  const P = {};
  const streetSigns = [];
  // candidate corner spots for street `st` at junction J, `lateral` metres from the centre line
  function* corners(st, J, lateral, d0, rot = 0) {
    const sJ = world.distToLine(st, J.x, J.z).s;
    const combos = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (let extra = 0; extra <= 7; extra += 1.2) {
      for (let c = 0; c < 4; c++) {
        const [dir, side] = combos[(c + rot) % 4];
        const s = sJ + dir * (d0 + extra);
        if (s < 1 || s > st.len - 1) continue;
        world.pointAt(st, s, P);
        yield { x: P.x + P.nx * side * lateral, z: P.z + P.nz * side * lateral, tx: P.tx, tz: P.tz, side };
      }
    }
  }
  // junction corners are rounded by the terrain package (kerb fillets up to 3 m): a pole must keep 2 m from the kerb of
  // every OTHER street at the junction, or it ends up on the asphalt where the mitred tip used to be
  const clearOfOthers = (J, st, x, z, m = 2.0) => J.streets.every((o) => {
    if (o === st.id) return true;
    const os = map.streetById[o];
    return world.distToLine(os, x, z).d >= os.half + m;
  });
  // A plate 1.5 m from a lit lamp head is washed to white by its PointLight (26 cd, decay 2) and the bloom: keep 4.5 m.
  const LAMP_GAPS = [4.5, 3, 0];
  const clearOfLamps = (x, z, gap) => gap <= 0 || map.lamps.every((l) => Math.hypot(l.x - x, l.z - z) >= gap);
  map.junctions.forEach((J, ji) => {
    J.streets.forEach((id, k) => {
      const st = map.streetById[id];
      const cross = Math.max(...J.streets.filter((o) => o !== id).map((o) => map.streetById[o].half + map.streetById[o].sidewalk * 0.4));
      // first choice keeps the plate out of the hot core of a lamp's PointLight; relax only if no corner allows it
      place: for (const lampGap of LAMP_GAPS) {
        for (const c of corners(st, J, st.half + 0.7, cross + 2.5, (ji + k * 2) % 4)) {
          if (!free(c.x, c.z, 0.35, 0.45) || !clearOfOthers(J, st, c.x, c.z) || !clearOfLamps(c.x, c.z, lampGap)) continue;
          streetSigns.push({ ...c, st }); S.placed.push({ x: c.x, z: c.z, r: 0.5 });
          break place;
        }
      }
    });
  });

  // ---- tourist finger posts -------------------------------------------------------------------------------------------
  const L = map.landmarkById;
  const targets = {
    huashilou: { name: L.huashilou.name, en: 'Huashi Lou (Granite Castle)', x: L.huashilou.gate.x, z: L.huashilou.gate.z },
    gongzhulou: { name: L.gongzhulou.name, en: 'Princess Villa', x: L.gongzhulou.gate.x, z: L.gongzhulou.gate.z },
    beach: { name: '第二海水浴场', en: 'No.2 Bathing Beach', x: -14, z: 63 },
  };
  const wanted = [
    { at: [-186, -44], to: ['gongzhulou', 'beach'] }, { at: [-21, -54], to: ['gongzhulou', 'huashilou'] }, { at: [-20, 28], to: ['beach', 'huashilou'] },
    { at: [90, 87], to: ['huashilou', 'beach'] }, { at: [143, 36], to: ['huashilou', 'gongzhulou'] },
  ];
  const posts = [], entries = [];
  wanted.forEach((wnt, i) => {
    const J = map.junctions.reduce((b, j) => (Math.hypot(j.x - wnt.at[0], j.z - wnt.at[1]) < Math.hypot(b.x - wnt.at[0], b.z - wnt.at[1]) ? j : b));
    const st = map.streetById[J.streets[0]];
    const cross = Math.max(...J.streets.slice(1).map((o) => map.streetById[o].half + map.streetById[o].sidewalk));
    place: for (const lampGap of LAMP_GAPS) for (const c of corners(st, J, st.half + st.sidewalk - 0.5, cross + 3.2, i)) {
      if (!free(c.x, c.z, 0.5, 0.6) || !clearOfOthers(J, st, c.x, c.z) || !clearOfLamps(c.x, c.z, lampGap)) continue;
      const fingers = wnt.to.map((key, k) => {
        const T = targets[key], dx = T.x - c.x, dz = T.z - c.z, d = Math.hypot(dx, dz);
        const real = Math.max(50, Math.round((d / 0.68) * 1.25 / 50) * 50);
        const dist = real >= 1000 ? (real / 1000).toFixed(1) + 'km' : real + 'm';
        const base = `t${i}:${k}`;
        entries.push({ key: base + ':R', name: T.name, en: T.en, dist, arrow: 'right' }, { key: base + ':L', name: T.name, en: T.en, dist, arrow: 'left' });
        return { key: base, dx: dx / d, dz: dz / d };
      });
      posts.push({ x: c.x, z: c.z, fingers }); S.placed.push({ x: c.x, z: c.z, r: 0.6 });
      break place;
    }
  });
  return { streetSigns, posts, entries };
}

export function buildSigns(ctx, S, plan, signs) {
  const { world, collision } = ctx;
  const H = world.heightAt;
  const pole = (x, z, g, h, r, col, seg = 7) => {
    S.misc.add(new THREE.CylinderGeometry(r, r, h + 0.3, seg).translate(x, g - 0.3 + (h + 0.3) / 2, z), col);
    S.misc.add(new THREE.SphereGeometry(r * 1.15, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, g + h, z), col);
  };
  for (const s of plan.streetSigns) {
    const g = H(s.x, s.z) + 0.14, rects = signs.street[s.st.id];
    pole(s.x, s.z, g, 2.22, 0.034, STEEL);
    const cy = g + 2.36;
    // thin steel tray behind the two faces + clamp
    obox(S.misc, s.x, s.z, cy - 0.155, cy + 0.155, 0.505, 0.011, s.tx, s.tz, STEEL_D, STEEL_D, { top: true, bottom: true });
    plateQuad(S.sign, s.x - s.tz * 0.018, cy, s.z + s.tx * 0.018, s.tx, s.tz, 1.0, 0.3, rects[0]);
    plateQuad(S.sign, s.x + s.tz * 0.018, cy, s.z - s.tx * 0.018, -s.tx, -s.tz, 1.0, 0.3, rects[1]);
    collision.addCircle(s.x, s.z, 0.1, 'sign');
  }
  for (const p of plan.posts) {
    const g = H(p.x, p.z) + 0.14;
    pole(p.x, p.z, g, 3.05, 0.045, BROWN, 8);
    S.misc.add(new THREE.CylinderGeometry(0.075, 0.09, 0.22, 8).translate(p.x, g + 0.11, p.z), BROWN);
    p.fingers.forEach((f, k) => {
      const cy = g + 2.82 - k * 0.3, cx = p.x + f.dx * 0.62, cz = p.z + f.dz * 0.62;
      obox(S.misc, cx, cz, cy - 0.12, cy + 0.12, 0.555, 0.01, f.dx, f.dz, BROWN, BROWN, { top: true, bottom: true });
      // viewer whose right is +d sees the arrow pointing right
      plateQuad(S.sign, cx - f.dz * 0.017, cy, cz + f.dx * 0.017, f.dx, f.dz, 1.1, 0.23, signs.tourist[f.key + ':R']);
      plateQuad(S.sign, cx + f.dz * 0.017, cy, cz - f.dx * 0.017, -f.dx, -f.dz, 1.1, 0.23, signs.tourist[f.key + ':L']);
    });
    collision.addCircle(p.x, p.z, 0.12, 'sign');
  }
}
