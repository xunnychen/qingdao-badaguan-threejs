// Leaf litter and petal carpets: flat alpha-tested tiles (each texture tile holds many leaves) instanced per 160 m cell.
// Drift tiles are laid edge-on along the kerbs and wall feet under the street trees of each species so they join into
// continuous banks; loose scatter tiles cover the carriageway and the paving. Every tile of a kind has the same
// metres-per-tile scale, so a leaf is the same size everywhere. The amount per species follows env.current.litter live
// (tiles switch on by a per-tile threshold, the gutter drifts first).
import * as THREE from 'three';
import { LITTER_TILE, LITTER_M, LITTER_EDGE } from './textures.js';

const CELL = 160;
const COLS = { ginkgo: 0, maple: 1, plane: 2, peach: 3, crabapple: 3 };
const TINT = {
  ginkgo: ['#E2B32E', '#E8BC38', '#D9A726', '#EDC548'],
  maple: ['#B8452A', '#D9A21E', '#C8702A', '#A84A26', '#D98A24'],
  plane: ['#8F6A2C', '#A07A34', '#7C5A28', '#9A7A3A'],
  peach: ['#F2B6C6', '#FFD9E2', '#F4A8BE', '#F7C4D2'],
  crabapple: ['#FFD9E2', '#FFF1F4', '#F2B6C6', '#FBDDE4'],
};
// the terrain package lays every street on its own thin height layer (greedy colouring over the junction graph);
// mirror it so the litter sits exactly on the asphalt / paving instead of floating or sinking
const ROAD_Y = 0.03, CROWN = 0.02, WALK_Y = 0.14, LAYER = 0.012, LIFT = 0.014;

export function createLitter(ctx, S) {
  const { map: MAP, world, rng } = ctx;
  const hAt = world.heightAt;
  const layer = {};
  for (const st of MAP.streets) {
    const used = new Set();
    for (const j of MAP.junctions) if (j.streets.includes(st.id)) for (const o of j.streets) if (o !== st.id && layer[o] !== undefined) used.add(layer[o]);
    let l = 0; while (used.has(l)) l++;
    layer[st.id] = l;
  }
  const ns = {};
  function groundY(x, z, surf) {
    const h = hAt(x, z);
    if (surf !== 'road' && surf !== 'sidewalk') return h + 0.07;
    const q = world.nearestStreet(x, z, ns);
    if (!q) return h + 0.07;
    let L = layer[q.street.id];
    for (const j of MAP.junctions) if (Math.abs(j.x - x) < 14 && Math.abs(j.z - z) < 14) for (const id of j.streets) L = Math.max(L, layer[id]);
    if (surf === 'sidewalk') return h + WALK_Y + L * LAYER + LIFT + 0.008;
    const f = Math.min(1, q.d / q.street.half);
    let top = ROAD_Y + CROWN * (1 - f * f) + L * LAYER;
    // asphalt ribbons overlap at junctions and the higher layer covers the lower one: a tile that reaches under another
    // street's ribbon (a tile is up to 2 m wide) must lie on THAT surface, or the ribbon's edge cuts the carpet off in a
    // knife-straight line
    for (const o of MAP.streets) {
      if (o === q.street) continue;
      const d = world.distToLine(o, x, z, o.half + 1.2).d;
      if (d > o.half + 1.2) continue;
      const fo = Math.min(1, d / o.half);
      top = Math.max(top, ROAD_Y + CROWN * (1 - fo * fo) + layer[o.id] * LAYER);
    }
    return h + top + LIFT;
  }

  const chunks = new Map();
  let count = 0;
  const colors = {};
  for (const k in TINT) colors[k] = TINT[k].map((h) => new THREE.Color(h));
  /** one tile: `drift` tiles (row 0) have their straight edge toward local +z; rot turns local +z to (-sin, cos) */
  function patch(x, z, size, species, drift, rot, th, rand, want) {
    const surf = world.surfaceAt(x, z);
    if (want ? surf !== want : surf !== 'lawn' && surf !== 'garden') return;
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = { a: [], b: [], n: [], col: [] }));
    const y = groundY(x, z, surf), e = 0.5;
    const nx = -(hAt(x + e, z) - hAt(x - e, z)), nz = -(hAt(x, z + e) - hAt(x, z - e)), ny = 2 * e, l = Math.hypot(nx, ny, nz);
    const col = rand.pick(colors[species]), v = 0.88 + 0.22 * rand();
    c.a.push(x, y, z, size);
    c.b.push(Math.cos(rot), Math.sin(rot), COLS[species] + (drift ? 0 : 4), th);
    c.n.push(nx / l, nz / l);
    c.col.push(col.r * v, col.g * v, col.b * v);
    count++;
  }

  const p = {}, TAU = Math.PI * 2;
  const D = LITTER_M[0], SP = LITTER_M[1], E = LITTER_EDGE;
  // A drift tile has one straight edge: it may only lie where something really stops the leaves there (a kerb, a wall
  // foot). At junction mouths the kerb line runs across the other street's asphalt and at gates the wall is open; a
  // drift laid there ends in a knife-straight line on open ground, so those places get loose scatter instead.
  const wallsOf = {};
  for (const w of MAP.walls) (wallsOf[w.street] ||= []).push(w);
  const wallNear = (street, x, z, r) => {
    const list = wallsOf[street];
    if (!list) return false;
    for (const w of list) {
      const b = w.bbox;
      if (x < b.minX - r || x > b.maxX + r || z < b.minZ - r || z > b.maxZ + r) continue;
      for (let i = 0; i + 1 < w.pts.length; i++) {
        const ax = w.pts[i][0], az = w.pts[i][1], dx = w.pts[i + 1][0] - ax, dz = w.pts[i + 1][1] - az;
        const k = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(x - ax - dx * k, z - az - dz * k) <= r) return true;
      }
    }
    return false;
  };
  for (const t of MAP.trees) {
    if (COLS[t.species] === undefined) continue;
    const rand = rng.makeRng(`life:litter:${t.id}`);
    const petal = COLS[t.species] === 3;
    if (t.street) {
      const st = MAP.streetById[t.street], half = st.half, sp = st.spacing, side = t.side;
      // a drift tile whose straight edge lies `edge` metres from the centre line, banked outward (out = 1) or inward
      const drift = (ds, edge, out, size, jitter, lo, hi, want) => {
        world.pointAt(st, t.s + ds, p);
        const off = edge - out * E * size, th = lo + (hi - lo) * rand();
        const rot = Math.atan2(-p.nx * side * out, p.nz * side * out) + jitter;
        patch(p.x + p.nx * side * off, p.z + p.nz * side * off, size, t.species, true, rot, th, rand, want);
      };
      const scatter = (ds, off, lo, hi, want) => {
        world.pointAt(st, t.s + ds, p);
        patch(p.x + p.nx * side * off, p.z + p.nz * side * off, SP * (0.92 + 0.18 * rand()), t.species, false, rand() * TAU, lo + (hi - lo) * rand(), rand, want);
      };
      const run = () => (rand() - 0.5) * sp * 1.05;
      // is there a kerb / a wall along the whole length of a tile centred at ds?
      const kerbed = (ds, size) => {
        for (const k of [-0.5, 0, 0.5]) {
          world.pointAt(st, t.s + ds + k * size, p);
          const x = p.x + p.nx * side * (half + 0.4), z = p.z + p.nz * side * (half + 0.4);
          // (2.6 m clear of any other carriageway: the kerb leaves its straight line there to round the corner)
          for (const o of MAP.streets) if (o !== st && world.distToLine(o, x, z, o.half + 2.6).d <= o.half + 2.6) return false;
        }
        return true;
      };
      const walled = (ds, size) => {
        for (const k of [-0.42, 0, 0.42]) {
          world.pointAt(st, t.s + ds + k * size, p);
          if (!wallNear(st.id, p.x + p.nx * side * st.wallOff, p.z + p.nz * side * st.wallOff, 0.55)) return false;
        }
        return true;
      };
      // gutter: one continuous drift on the asphalt against the kerb (the densest, most persistent line)
      for (let ds = -sp / 2 + rand() * 0.3; ds < sp / 2;) {
        const size = D * (0.9 + 0.2 * rand());
        if (kerbed(ds, size)) drift(ds, half - 0.03 - 0.05 * rand(), 1, size, (rand() - 0.5) * 0.1, 0.02, 0.55, 'road');
        else scatter(ds, half - 0.4 - 1.2 * rand(), 0.25, 0.9, 'road');
        ds += size * (0.56 + 0.1 * rand());
      }
      // a second, broken row where the wind left heaps just inside the gutter
      // (kept within 0.15 m of the kerb: further out its straight edge would show on the open asphalt)
      for (let i = 0; i < (petal ? 3 : 2); i++) {
        const size = D * (0.95 + 0.25 * rand()), ds = run();
        if (kerbed(ds, size)) drift(ds, half - 0.04 - 0.1 * rand(), 1, size, (rand() - 0.5) * 0.1, 0.3, 1, 'road');
        else scatter(ds, half - 0.4 - 1.4 * rand(), 0.3, 1, 'road');
      }
      // back of the kerb and the tree pit
      for (let i = 0; i < 4; i++) {
        const size = D * (0.8 + 0.25 * rand()), ds = run();
        if (kerbed(ds, size)) drift(ds, half + 0.17 + 0.1 * rand(), -1, size, (rand() - 0.5) * 0.1, 0.1, 0.8, 'sidewalk');
        else scatter(ds, half + 0.5 + (st.sidewalk - 0.8) * rand(), 0.2, 0.9, 'sidewalk');
      }
      // drift against the foot of the garden wall
      for (let ds = -sp / 2 + rand() * 0.8; ds < sp / 2;) {
        const size = D * (0.85 + 0.25 * rand());
        if (walled(ds, size)) drift(ds, st.wallOff - 0.17 - 0.04 * rand(), 1, size, (rand() - 0.5) * 0.06, 0.05, 0.75, 'sidewalk');
        ds += size * (0.75 + 0.3 * rand());
      }
      // loose scatter over the paving
      for (let i = 0; i < 3; i++) scatter(run(), half + 0.5 + (st.sidewalk - 0.8) * rand(), 0.12, 1, 'sidewalk');
      // loose leaves all over the carriageway (thinning toward the crown as the amount drops)
      // (the scatter tile is a round-ish patch, not a full square: a third more of them for the same cover)
      const nRoad = Math.max(5, Math.round((sp * half) / (SP * SP) * (petal ? 1.5 : 1.3)));
      // (spread as a triangle 0.9 spacings to either side: neighbouring trees add up to an even carpet, and past the last
      // tree of a row the carpet thins out over several metres instead of stopping on a line across the road)
      for (let i = 0; i < nRoad; i++) { const k = rand(); scatter((rand() + rand() - 1) * sp * 0.9, (half - 0.7) * (1 - k), 0.18 + 0.5 * k * rand(), 1, 'road'); }
    } else {
      // garden and park trees: a loose ring under the canopy
      // (scatter tiles only: nothing on a lawn gives a drift a straight edge to bank against)
      const n = petal ? 8 : 7;
      for (let i = 0; i < n; i++) {
        const a = rand() * TAU, d = Math.min(3.2, t.r) * Math.sqrt(rand()), th = 0.2 + 0.8 * rand();
        patch(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, SP * (0.8 + 0.3 * rand()), t.species, false, rand() * TAU, th, rand, null);
      }
    }
  }

  // ---- material ----------------------------------------------------------------------------------------------------------
  const uLitter = { value: new THREE.Vector4() };
  const mat = new THREE.MeshStandardMaterial({ map: S.tex.litter, alphaTest: 0.42, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'life:litter';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLitter = uLitter;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute vec4 iA; attribute vec4 iB; attribute vec2 iN; attribute vec3 iCol;
        uniform vec4 uLitter;
        varying vec3 vTint;`)
      .replace('#include <uv_vertex>', /* glsl */ `#include <uv_vertex>
        float lCol = mod( iB.z, 4.0 ), lRow = step( 3.5, iB.z );
        vMapUv = vec2( ( lCol + uv.x ) * 0.25, 1.0 - ( lRow + 1.0 - uv.y ) * 0.5 );
        float lAmt = lCol < 0.5 ? uLitter.x : lCol < 1.5 ? uLitter.y : lCol < 2.5 ? uLitter.z : uLitter.w;
        vec2 lq = vec2( position.x * iB.x - position.z * iB.y, position.x * iB.y + position.z * iB.x ) * iA.w;
        vec3 lNrm = vec3( iN.x, sqrt( max( 0.05, 1.0 - dot( iN, iN ) ) ), iN.y );
        vec3 lPos = iA.xyz + vec3( lq.x, - ( lNrm.x * lq.x + lNrm.z * lq.y ) / lNrm.y, lq.y );
        vTint = iCol;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = lNrm;')
      .replace('#include <begin_vertex>', 'vec3 transformed = lPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>\nif ( lAmt < iB.w ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <map_fragment>', /* glsl */ `
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        // alpha-tested mips thin out with distance: push the coverage back up so far drifts stay a carpet
        vec2 lfx = dFdx( vMapUv ) * vec2( ${(LITTER_TILE * 4).toFixed(1)}, ${(LITTER_TILE * 2).toFixed(1)} ), lfy = dFdy( vMapUv ) * vec2( ${(LITTER_TILE * 4).toFixed(1)}, ${(LITTER_TILE * 2).toFixed(1)} );
        float lLod = max( 0.0, 0.5 * log2( max( dot( lfx, lfx ), dot( lfy, lfy ) ) ) );
        sampledDiffuseColor.a = min( 1.0, sampledDiffuseColor.a * ( 1.0 + lLod * 0.5 ) );
        sampledDiffuseColor.rgb *= vTint * 1.12;
        diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  mat.customProgramCacheKey = () => 'life:litter:v2';

  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5], 3));
  base.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  base.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2));
  base.setIndex([0, 1, 2, 0, 2, 3]);

  const meshes = [];
  for (const c of chunks.values()) {
    const n = c.a.length / 4;
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, base.attributes[k]);
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(c.a), 4));
    g.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(c.b), 4));
    g.setAttribute('iN', new THREE.InstancedBufferAttribute(new Float32Array(c.n), 2));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(c.col), 3));
    g.instanceCount = n;
    const box = new THREE.Box3();
    for (let i = 0; i < n; i++) box.expandByPoint(new THREE.Vector3(c.a[i * 4], c.a[i * 4 + 1], c.a[i * 4 + 2]));
    box.expandByScalar(1.5);
    g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, mat);
    m.name = 'life:litter'; m.castShadow = false; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    S.group.add(m); meshes.push(m);
  }
  chunks.clear();

  return {
    stats: { chunks: meshes.length, patches: count },
    update() {
      const L = ctx.env.current.litter;
      uLitter.value.set(L.ginkgo, L.maple, L.plane, L.petals);
      const any = L.ginkgo + L.maple + L.plane + L.petals > 0.004;
      const cam = ctx.camera.position;
      for (const m of meshes) { const b = m.geometry.boundingSphere; m.visible = any && b.center.distanceTo(cam) - b.radius < 170; }
    },
    dispose() { for (const m of meshes) { S.group.remove(m); m.geometry.dispose(); } base.dispose(); mat.dispose(); },
  };
}
