// Gates: two capped granite piers, double wrought-iron leaves (closed for villas, swung inward for landmarks),
// a blue enamel house-number plate and, on listed houses, a dark heritage plaque. Some piers carry a lantern globe.
import * as THREE from 'three';
import { plateQuad } from './util.js';
import { pier, scl } from './parts.js';

const PIER = 0.65, PIER_H = 2.4, LEAF_H = 2.02;

/** Decide numbers, plaques and designs (needed before the sign atlas is drawn). */
export function planGates(ctx) {
  const { map, rng } = ctx;
  const houses = [], plaques = [], info = new Map();
  const taken = {};
  for (const L of map.landmarks) {
    const m = /^(.*?)(\d+)号$/.exec(L.address);
    const street = m ? m[1] : map.streetById[L.street].name, number = m ? +m[2] : 1;
    (taken[L.street] || (taken[L.street] = new Set())).add(number);
    houses.push({ key: L.gate.id, street, number });
    plaques.push({ key: L.id, name: L.name, address: L.address });
    info.set(L.gate.id, { house: L.gate.id, plaque: L.id, design: 0, globe: true, cap: 'ball', landmark: L });
  }
  plaques.push({ key: 'generic' });
  for (const st of map.streets) {
    const used = taken[st.id] || new Set();
    const next = { 1: 1, '-1': 2 };
    const mine = map.gates.filter((g) => g.street === st.id && !info.has(g.id)).sort((a, b) => a.s - b.s);
    for (const g of mine) {
      let n = next[g.side];
      while (used.has(n)) n += 2;
      next[g.side] = n + 2; used.add(n);
      const rand = rng.makeRng('streetscape:gate:' + g.id);
      houses.push({ key: g.id, street: st.name, number: n });
      info.set(g.id, { house: g.id, plaque: rand.chance(0.45) ? 'generic' : null, design: rand.chance(0.5) ? 0 : 1, globe: rand.chance(0.3), cap: rand.chance(0.35) ? 'ball' : 'pyramid' });
    }
  }
  return { houses, plaques, info };
}

export function buildGates(ctx, S, plan, iron, signs) {
  const { map, world, rng } = ctx;
  const H = world.heightAt;
  const globe = new THREE.SphereGeometry(0.155, 10, 7);
  const collar = new THREE.CylinderGeometry(0.075, 0.1, 0.07, 8);
  for (const g of map.gates) {
    const I = plan.info.get(g.id);
    if (!I) continue;
    const rand = rng.makeRng('streetscape:gatelook:' + g.id);
    const hw = g.width / 2, fx = Math.sin(g.rot), fz = Math.cos(g.rot);     // f = toward the street
    const gra = S.get('granite', g.x, g.z), irn = S.get('iron', g.x, g.z);
    const k = rand.range(0.92, 1.06), tint = [k * 1.02, k, k * 0.97];
    // ---- piers -------------------------------------------------------------------------------------------------------
    const rx = fz, rz = -fx;                                                 // right of a viewer standing in the street
    for (const sg of [-1, 1]) {
      const px = g.x + g.tx * (hw + 0.3) * sg, pz = g.z + g.tz * (hw + 0.3) * sg, pg = H(px, pz);
      const y1 = pier(gra, px, pz, pg, g.tx, g.tz, { size: PIER, top: PIER_H, cap: I.globe ? 'flat' : I.cap, tint, moss: rand() });
      if (I.globe) {
        S.lampIron.add(collar.clone().translate(px, y1 + 0.035, pz));
        S.lampGlass.add(globe.clone().translate(px, y1 + 0.07 + 0.145, pz));
        S.glows.push({ x: px, y: y1 + 0.215, z: pz, size: 0.8 });
      }
      // plates on the street face
      const onRight = (g.tx * sg) * rx + (g.tz * sg) * rz > 0;
      const ox = px + fx * (PIER / 2 + 0.012), oz = pz + fz * (PIER / 2 + 0.012);
      if (onRight) plateQuad(S.sign, ox, pg + 1.78, oz, rx, rz, 0.3, 0.205, signs.house[I.house]);
      else if (I.plaque) plateQuad(S.sign, ox, pg + 1.5, oz, rx, rz, 0.36, 0.475, signs.plaque[I.plaque]);
    }
    // ---- leaves ------------------------------------------------------------------------------------------------------
    const rect = iron.gate(I.design), yb = g.y + 0.2, lw = hw - 0.035;
    const swing = g.open ? THREE.MathUtils.degToRad(rand.range(74, 84)) : 0;
    for (const sg of [-1, 1]) {
      const hx = g.x + g.tx * (hw - 0.03) * sg, hz = g.z + g.tz * (hw - 0.03) * sg;   // hinge
      // closed direction = toward the gate centre; open = rotated toward the garden (-f)
      const cx = -g.tx * sg, cz = -g.tz * sg;
      const dx = cx * Math.cos(swing) - fx * Math.sin(swing), dz = cz * Math.cos(swing) - fz * Math.sin(swing);
      const ex = hx + dx * lw, ez = hz + dz * lw;
      const n = [-dz, 0, dx];
      irn.quad([hx, yb, hz], [ex, yb, ez], [ex, yb + LEAF_H, ez], [hx, yb + LEAF_H, hz], n, [rect[0], rect[3]], [rect[2], rect[3]], [rect[2], rect[1]], [rect[0], rect[1]]);
    }
  }
  globe.dispose(); collar.dispose();
}

export const tintOf = scl;
