// Benches, litter bins, bollards and the two engraved 八大关 boulders.
import * as THREE from 'three';
import { plateQuad, lin } from './util.js';
import { place, template, strut } from './parts.js';

const IRON = lin('#1c1f1e'), BIN_GREEN = lin('#2c6a41'), BIN_GREY = lin('#7b8084'), BIN_DARK = lin('#26292b');

function benchTemplates(ctx) {
  const { geo } = ctx;
  const wood = [];
  for (let k = 0; k < 5; k++) wood.push(geo.box(1.7, 0.03, 0.074, { x: 0, y: 0.425 - (k === 4 ? 0.012 : 0), z: -0.17 + k * 0.092 }));
  for (let k = 0; k < 3; k++) wood.push(geo.box(1.7, 0.085, 0.03, { x: 0, y: 0.545 + k * 0.118, z: -0.245 - k * 0.03, rotX: -0.2 }));
  const iron = [];
  for (const x of [-0.79, 0, 0.79]) {
    const end = x !== 0, t = end ? 0.045 : 0.035;
    iron.push(strut({ x, y: -0.08, z: 0.21 }, { x, y: 0.41, z: 0.17 }, t, 0.05));                    // front leg
    iron.push(strut({ x, y: -0.08, z: -0.3 }, { x, y: 0.41, z: -0.2 }, t, 0.05));                    // back leg
    iron.push(strut({ x, y: 0.41, z: -0.2 }, { x, y: 0.93, z: -0.32 }, t, 0.045));                   // back stay
    iron.push(new THREE.BoxGeometry(t, 0.035, 0.44).translate(x, 0.395, 0));                           // seat rail
    if (end) {
      iron.push(strut({ x, y: 0.41, z: 0.19 }, { x, y: 0.63, z: 0.2 }, t, 0.04));
      iron.push(new THREE.BoxGeometry(0.055, 0.03, 0.5).translate(x, 0.645, -0.03));                   // arm rest
      iron.push(new THREE.TorusGeometry(0.05, 0.016, 4, 10, Math.PI * 1.55).rotateZ(-0.6).rotateY(Math.PI / 2).translate(x, 0.6, 0.235));   // scroll
      iron.push(new THREE.TorusGeometry(0.075, 0.014, 4, 11, Math.PI * 1.6).rotateZ(2.3).rotateY(Math.PI / 2).translate(x, 0.52, 0.02));
      iron.push(new THREE.TorusGeometry(0.045, 0.014, 4, 9, Math.PI * 1.5).rotateZ(0.4).rotateY(Math.PI / 2).translate(x, 0.0, 0.25));
    }
  }
  return { wood: template(wood), iron: template(iron) };
}

function binTemplate() {
  const body = [new THREE.CylinderGeometry(0.2, 0.165, 0.62, 10, 1, false).translate(0, 0.45, 0)];
  const dark = [new THREE.CylinderGeometry(0.215, 0.215, 0.05, 10).translate(0, 0.785, 0), new THREE.CylinderGeometry(0.12, 0.2, 0.07, 10).translate(0, 0.845, 0),
    new THREE.CylinderGeometry(0.05, 0.07, 0.14, 6).translate(0, 0.07, 0), new THREE.CylinderGeometry(0.202, 0.202, 0.035, 10, 1, true).translate(0, 0.6, 0)];
  return { body: template(body), dark: template(dark) };
}

function boulderGeometry(ctx, seed) {
  const { rng, geo } = ctx;
  const g = new THREE.IcosahedronGeometry(1, 3);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const n = 1 + 0.62 * (rng.fbm2(x * 1.3 + seed, y * 1.5 + z * 1.1, 3, seed) - 0.5) + 0.16 * (rng.fbm2(x * 4 + z * 3, y * 4 + seed, 2, seed + 3) - 0.5);
    x *= 1.02 * n; y *= 0.7 * n; z *= 0.5 * n;
    if (z > 0.31) z = 0.31 + (z - 0.31) * 0.06;      // dressed face for the lettering
    if (y < -0.3) y = -0.3 + (y + 0.3) * 0.2;
    y += 0.08 * x * (seed % 2 ? 1 : -1);             // a slightly leaning top line
    P.setXYZ(i, x, y + 0.36, z);
  }
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g.computeVertexNormals();                            // flat facets: a rough-hewn boulder
  return geo.applyMetricUV(geo.normalize(g));
}

export function buildFurniture(ctx, S, free, signs, wallRuns) {
  const { map, world, collision, rng } = ctx;
  const H = world.heightAt;

  // ---- benches -----------------------------------------------------------------------------------------------------
  const BT = benchTemplates(ctx), BIN = binTemplate();
  const bins = [];
  map.benches.forEach((b, i) => {
    const y = b.y + (b.where === 'promenade' ? 0.03 : 0.05);
    place(S.wood, BT.wood, b.x, y, b.z, b.rot);
    place(S.misc, BT.iron, b.x, y, b.z, b.rot, IRON);
    S.placed.push({ x: b.x, z: b.z, r: 1.1 });
    if (i % 3 === 0) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot), sg = i % 2 ? 1 : -1;
      bins.push({ x: b.x + c * 1.75 * sg - s * 0.12, z: b.z - s * 1.75 * sg - c * 0.12, rot: b.rot, y: y - 0.03 });
    }
  });
  // a pair beside each tourist post
  for (const p of S.touristPosts || []) {
    for (const a of [0, 1.6, 3.2, 4.8]) {
      const x = p.x + Math.cos(a + 0.6) * 1.25, z = p.z + Math.sin(a + 0.6) * 1.25;
      const st = world.nearestStreet(x, z);
      if (!st || st.d < st.street.half + 0.75 || st.d > st.street.half + st.street.sidewalk - 0.3 || !free(x, z, 0.5, 0.6)) continue;
      const P = world.pointAt(st.street, st.s);
      bins.push({ x, z, rot: Math.atan2(P.tx, P.tz) + Math.PI / 2, y: H(x, z) + 0.14 });
      break;
    }
  }
  for (const b of bins) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    [-0.24, 0.24].forEach((lx, k) => {
      const x = b.x + lx * c, z = b.z - lx * s;
      place(S.misc, BIN.body, x, b.y, z, b.rot, k ? BIN_GREY : BIN_GREEN);
      place(S.misc, BIN.dark, x, b.y, z, b.rot, BIN_DARK);
    });
    collision.addCircle(b.x, b.z, 0.42, 'bin');
    S.placed.push({ x: b.x, z: b.z, r: 0.7 });
  }
  BT.wood.dispose(); BT.iron.dispose(); BIN.body.dispose(); BIN.dark.dispose();

  // ---- bollards at both ends of the beach link ---------------------------------------------------------------------
  const path = map.paths.find((p) => p.id === 'beach-link');
  if (path) {
    const P = {};
    const row = (s) => {
      world.pointAt(path, s, P);
      for (const lat of [-1.35, 0, 1.35]) {
        const x = P.x + P.nx * lat, z = P.z + P.nz * lat;
        // a turned granite post: plain stone (no ashlar joints), a slim necking and a chamfered, slightly domed head
        const g = H(x, z), rnd = rng.makeRng(`streetscape:bollard:${s.toFixed(1)}:${lat}`), k = rnd.range(0.9, 1.02);
        const prof = [[0.135, -0.3], [0.135, 0.05], [0.118, 0.09], [0.11, 0.6], [0.098, 0.63], [0.098, 0.66], [0.128, 0.69], [0.128, 0.75], [0.1, 0.795], [0.0, 0.815]];
        const post = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10);
        post.rotateY(Math.atan2(P.tx, P.tz)).translate(x, g, z);
        const bg = ctx.geo.applyMetricUV(ctx.geo.normalize(post));
        ctx.geo.bakeGroundAO(bg, g + 0.1, 0.35, 0.55);
        S.get('coping', x, z).add(bg, [0.97 * k, 0.94 * k, 0.9 * k]);
        collision.addCircle(x, z, 0.17, 'bollard');
      }
    };
    let s0 = 0.5;
    for (; s0 < path.len / 2; s0 += 0.4) { world.pointAt(path, s0, P); if (world.backDist(P.x, P.z) > 3.4) break; }
    let s1 = path.len - 0.5;
    for (; s1 > path.len / 2; s1 -= 0.4) {
      world.pointAt(path, s1, P);
      const st = world.nearestStreet(P.x, P.z);
      if (!st || st.d > st.street.half + st.street.sidewalk + 0.6) break;
    }
    row(s0); row(s1);
  }

  // ---- 八大关 boulders ----------------------------------------------------------------------------------------------
  const wallDist = (x, z) => {
    let best = 99;
    for (const r of wallRuns) {
      const bb = r.w.bbox;
      if (x < bb.minX - 4 || x > bb.maxX + 4 || z < bb.minZ - 4 || z > bb.maxZ + 4) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const ax = r.pts[i][0], az = r.pts[i][1], dx = r.pts[i + 1][0] - ax, dz = r.pts[i + 1][1] - az;
        let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
    }
    return best;
  };
  const np = {};
  [[-186, -44], [-20, 28]].forEach(([jx, jz], bi) => {
    let best = null;
    for (let r = 7; r <= 15; r += 1) for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, x = jx + Math.cos(a) * r, z = jz + Math.sin(a) * r;
      if (!free(x, z, 1.2, 0.9)) continue;
      const pth = world.nearestPath(x, z, np);
      if (pth && pth.d < pth.path.half + 1.2) continue;
      const wd = wallDist(x, z);
      if (wd < 0.95) continue;
      const st = world.nearestStreet(x, z);
      const onWalk = st && st.d < st.street.half + st.street.sidewalk;
      // prefer a roomy sidewalk corner close to the junction, in front of the wall
      const score = Math.min(wd, 1.6) * 2 + (onWalk ? 1.5 : 0) - r * 0.25 - (ctx.world.surfaceAt(x, z) === 'garden' ? 3 : 0);
      if (!best || score > best.score) best = { x, z, score };
    }
    if (!best) return;
    const { x, z } = best, g = H(x, z) + 0.1;
    const rot = Math.atan2(jx - x, jz - z);            // the lettering faces the junction
    const geo = boulderGeometry(ctx, 11 + bi * 7);
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, g, z);
    geo.applyMatrix4(m);
    ctx.geo.bakeGroundAO(geo, g - 0.05, 0.5, 0.6);
    const C = geo.attributes.color, warm = bi ? [1.0, 0.9, 0.78] : [0.97, 0.88, 0.78];
    for (let i = 0; i < C.count; i++) C.setXYZ(i, C.getX(i) * warm[0], C.getY(i) * warm[1], C.getZ(i) * warm[2]);
    S.get('coping', x, z).add(geo);
    const fx = Math.sin(rot), fz = Math.cos(rot);
    plateQuad(S.sign, x + fx * 0.338, g + 0.42, z + fz * 0.338, fz, -fx, 1.22, 0.3, signs.boulder);
    collision.addBox(x, z, 0.95, 0.4, rot, 'boulder');
    S.placed.push({ x, z, r: 1.3 });
  });
}
