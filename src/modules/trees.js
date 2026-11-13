// Package "trees": 一路一树. Every street carries its own species (ginkgo, maple, plane, cedar, dragon juniper, black pine,
// peach, crabapple, crape myrtle), each with its own crown shape, leaf texture, bark and seasonal palette.
//
// Technique: tree templates (trunk tubes + alpha-tested leaf-cluster cards with sphere-bent normals) are stamped into
// MERGED meshes per 96 m cell, one set per level of detail, so a cell costs 2 draw calls near (bark + foliage) and 1 at
// mid / far. Whole cells switch LOD by distance with hysteresis and a short dithered cross-fade. One foliage material
// for everything: the colour is a palette uniform indexed per vertex, so ambience presets cross-fade smoothly and
// blossom seasons are just palettes. Near cells cast their shadow from a light proxy (the mid-LOD cards + the near
// trunk as solid tubes) that lives in the same geometry and is only drawn into the shadow maps.
import * as THREE from 'three';
import { buildAtlas, buildPlaneBark } from './trees/atlas.js';
import { ORDER, SPEC, VARIANTS, makeTemplate } from './trees/species.js';
import { ALT, createTreeMaterials } from './trees/materials.js';

const CELL = 96, BELT_CELL = 120, HYST = 7, FADE_TIME = 0.45, AHEAD = 25, KEEP = 40;

export async function create(ctx) {
  const { map, env, world, quality, rng } = ctx;
  const group = ctx.group('trees');
  const atlas = buildAtlas(ctx);
  const planeBark = buildPlaneBark(ctx);
  const M = createTreeMaterials(ctx, atlas, planeBark);
  const spIndex = Object.fromEntries(ORDER.map((s, i) => [s, i]));
  const barkCol = ORDER.map((s) => new THREE.Color(SPEC[s].bark));
  // flat trunk colour of the mid / far LOD = the lit average of the near bark (bark texture averages about 0.5 linear)
  const farCol = ORDER.map((s) => (SPEC[s].flat ? new THREE.Color(SPEC[s].flat) : new THREE.Color(SPEC[s].bark).multiplyScalar(0.5)));
  const instant = !!ctx.params.shot;

  // ---- templates (lazy per lod) -------------------------------------------------------------------------------------
  const tplCache = new Map();
  const template = (species, variant, lod) => {
    const k = `${species}:${variant}:${lod}`;
    let t = tplCache.get(k);
    if (!t) tplCache.set(k, (t = makeTemplate(species, variant, lod, rng.makeRng)));
    return t;
  };

  // ---- tree list: the plan + a backdrop belt outside the map ----------------------------------------------------------
  const trees = [];
  for (const t of map.trees) {
    if (!SPEC[t.species]) continue;
    if (t.garden && quality.treeDensity < 1 && rng.hash2(t.seed & 0xffff, t.id, 77) > quality.treeDensity) continue;
    trees.push(t);
  }
  const belt = makeBelt();

  // Backdrop: a DEEP thicket right outside the plan (staggered rows of low-crowned evergreens over an understory of
  // shrubs, so nothing shows between the trunks from the walkable edge), thinning into clumps up the hill behind.
  function makeBelt() {
    const rand = rng.makeRng('trees:belt'), out = [], grid = new Map(), E = map.EXTENT, G = 6;
    const dens = Math.min(1, quality.treeDensity + 0.2);
    const edge = (x, z) => Math.max(E.minX - x, x - E.maxX, E.minZ - z);          // > 0 outside (west, east, north)
    const free = (x, z, s) => {
      const gx = Math.floor(x / G), gz = Math.floor(z / G), m = Math.ceil(s / G);
      for (let i = -m; i <= m; i++) for (let j = -m; j <= m; j++) {
        const l = grid.get((gx + i) * 4096 + gz + j);
        if (l) for (const o of l) if (Math.hypot(o.x - x, o.z - z) < s) return false;
      }
      return true;
    };
    const INNER = { cedar: 0.36, pine: 0.3, maple: 0.13, plane: 0.11, ginkgo: 0.1 };
    const OUTER = { cedar: 0.28, pine: 0.2, plane: 0.2, maple: 0.17, ginkgo: 0.15 };
    const nsOut = {};
    const add = (x, z, d) => {
      const y = world.heightAt(x, z);
      if (y < 1 || world.backDist(x, z) < 10) return false;
      // the streets run on ~130 m past the plan (MAP RUNOFF): keep the thicket off their asphalt and sidewalks
      const ns = world.nearestStreet(x, z, nsOut);
      if (ns && ns.d < ns.street.wallOff + 2.5) return false;
      let species = rand.weighted(d < 45 ? INNER : OUTER);
      if (world.shoreDist(x, z) < 60) species = 'pine';
      const S = map.SPECIES[species], k = rand(), big = d < 45 ? 1.0 : 1.14;
      const t = { id: 100000 + out.length, x, y, z, species, h: (S.h[0] + (S.h[1] - S.h[0]) * k) * big, r: (S.r[0] + (S.r[1] - S.r[0]) * k) * 1.15,
        rot: rand() * Math.PI * 2, seed: Math.floor(rand() * 1e9), tone: Math.floor(rand() * 4), belt: true };
      out.push(t);
      const key = Math.floor(x / G) * 4096 + Math.floor(z / G);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(t);
      // understory: a wide low thicket at the foot of every tree of the inner rows, and of some further out
      if (d < 45 || rand() < 0.3) {
        const sx = x + rand.range(-1.6, 1.6), sz = z + rand.range(-1.6, 1.6), sy = world.heightAt(sx, sz);
        out.push({ id: 100000 + out.length, x: sx, y: sy, z: sz, species: 'shrub', h: rand.range(2.9, 4.3), r: rand.range(2.6, 3.7), rot: rand() * Math.PI * 2,
          seed: Math.floor(rand() * 1e9), tone: Math.floor(rand() * 4), belt: true });
      }
      return true;
    };
    // inner rows: sample the band right outside the plan directly (west, north, east sides)
    const zS = 330, wN = E.maxX - E.minX + 90, hS = zS - E.minZ, per = wN + 2 * hS;
    let nIn = 0;
    const maxIn = Math.round(1500 * dens);
    for (let tries = 0; tries < 60000 && nIn < maxIn; tries++) {
      const u = rand() * per, d = 1.5 + 43 * rand();
      let x, z;
      if (u < wN) { x = E.minX - 45 + u; z = E.minZ - d; } else if (u < wN + hS) { x = E.minX - d; z = E.minZ + (u - wN); } else { x = E.maxX + d; z = E.minZ + (u - wN - hS); }
      if (edge(x, z) < 1 || !free(x, z, 4.4 + d * 0.03)) continue;
      if (add(x, z, edge(x, z))) nIn++;
    }
    // the slopes behind: thinner with distance, in clumps, out to 440 m
    let nOut = 0;
    const maxOut = Math.round(1000 * dens);
    for (let tries = 0; tries < 90000 && nOut < maxOut; tries++) {
      const x = rand.range(-470, 470), z = rand.range(-460, zS), d = edge(x, z);
      if (d < 44 || Math.hypot(x, z + 20) > 440) continue;
      const clump = rng.hash2(Math.floor(x / 46) + 64, Math.floor(z / 46) + 64, 311) > 0.4 ? 1 : 0.3;
      if (rand() > (0.2 + 0.8 * Math.exp(-(d - 44) / 110)) * clump) continue;
      if (!free(x, z, 6 + Math.min(5, (d - 44) / 30))) continue;
      if (add(x, z, d)) nOut++;
    }
    return out;
  }

  // ---- per-tree stamp parameters --------------------------------------------------------------------------------------
  // Block-interior fill trees (MAP `interior`, ~500) stand behind the garden walls and the villas: backdrop. Those more
  // than 7 m behind a wall line take the mid template (and the far cards as shadow proxy) even inside a near cell,
  // about a third of the triangles of a full near tree.
  const _ns = {};
  const isBackdrop = (t) => { if (!t.interior) return false; const ns = world.nearestStreet(t.x, t.z, _ns); return !ns || ns.d > ns.street.wallOff + 7; };
  function stampOf(t) {
    const S = SPEC[t.species], r = rng.makeRng(t.seed);
    let rot = t.rot;
    if (t.species === 'pine') {       // lean inland: away from the sea wind
      const e = 5, gx = world.shoreDist(t.x + e, t.z) - world.shoreDist(t.x - e, t.z), gz = world.shoreDist(t.x, t.z + e) - world.shoreDist(t.x, t.z - e);
      rot = (Math.hypot(gx, gz) > 1e-3 ? Math.atan2(-gz, gx) : Math.PI / 2) + (r() - 0.5) * 0.9;
    }
    return {
      S, sp: spIndex[S.palette || t.species], variant: Math.floor(r() * VARIANTS) % VARIANTS,
      cos: Math.cos(rot), sin: Math.sin(rot), sxz: t.r / S.R, sy: t.h / S.H,
      bright: 0.9 + 0.2 * r(), h0: r(), phase: t.x * 0.11 + t.z * 0.07, tone: t.tone | 0, cheap: isBackdrop(t),
    };
  }

  // ---- cells ------------------------------------------------------------------------------------------------------------
  const cells = new Map();
  const _v = new THREE.Vector3();
  function addToCell(t, size, tag) {
    const key = `${tag}:${Math.floor(t.x / size)}:${Math.floor(t.z / size)}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { key, trees: [], stamps: [], belt: tag === 'b', lod: -1, mesh: [null, null, null], box: new THREE.Box3(), fade: null, dist: 0, cast: null }));
    c.trees.push(t); c.stamps.push(stampOf(t));
    const m = t.r * 1.3 + 1.5;
    c.box.expandByPoint(_v.set(t.x - m, t.y - 0.5, t.z - m)).expandByPoint(_v.set(t.x + m, t.y + t.h * 1.08 + 0.5, t.z + m));
  }
  for (const t of trees) addToCell(t, CELL, 'm');
  for (const t of belt) addToCell(t, BELT_CELL, 'b');

  // contact darkening at the foot of a trunk, and shade under the crown, for the flat-coloured trunks of mid / far LOD
  const contact = (py) => 0.62 + 0.38 * Math.min(1, Math.max(0, py + 0.2) / 1.1);

  // The merged cell geometry is static and nothing reads it on the CPU (the bounds are set by hand), so the typed arrays
  // are dropped once they are on the GPU: they were most of the page's JS heap.
  function dropArray() { this.array = null; }
  function freeAfterUpload(g) {
    for (const k in g.attributes) g.attributes[k].onUpload(dropArray);
    g.index.onUpload(dropArray);      // the renderer only needs index.count (a wireframe would need the array: unused)
  }

  function buildCell(c, lod) {
    // a shadow proxy follows the visible foliage in the same geometry: template lod 3 for near cells, the far cards for mid
    const lods = lod === 0 ? [0, 3] : lod === 1 ? [1, 2] : [2];
    const lodOf = (st, l) => (st.cheap ? (l === 0 ? 1 : l === 3 ? 2 : l) : l);
    const tpls = lods.map((l) => c.trees.map((t, i) => template(t.species, c.stamps[i].variant, lodOf(c.stamps[i], l))));
    let nLeaf = 0, iLeaf = 0, nTrunk = 0, iTrunk = 0;
    for (const set of tpls) for (const tp of set) { nLeaf += tp.leaf.nv; iLeaf += tp.leaf.I.length; }
    for (const tp of tpls[0]) { nTrunk += tp.trunk.nv; iTrunk += tp.trunk.I.length; }
    const out = new THREE.Group();
    out.matrixAutoUpdate = false;

    // foliage (+ flat-coloured trunks at mid / far)
    const P = new Float32Array(nLeaf * 3), N = new Float32Array(nLeaf * 3), UV = new Float32Array(nLeaf * 2), D = new Float32Array(nLeaf * 4), F = new Float32Array(nLeaf * 4);
    const I = new Uint32Array(iLeaf);
    let v = 0, ii = 0, iNear = 0;
    tpls.forEach((set, pass) => {
      c.trees.forEach((t, n) => {
        const st = c.stamps[n], L = set[n].leaf, { cos, sin, sxz, sy } = st, crownY = t.h * 0.3;
        for (let i = 0; i < L.nv; i++, v++) {
          const px = L.P[i * 3] * sxz, py = L.P[i * 3 + 1] * sy, pz = L.P[i * 3 + 2] * sxz;
          P[v * 3] = t.x + px * cos + pz * sin; P[v * 3 + 1] = t.y + py; P[v * 3 + 2] = t.z - px * sin + pz * cos;
          const nx = L.N[i * 3], nz = L.N[i * 3 + 2];
          N[v * 3] = nx * cos + nz * sin; N[v * 3 + 1] = L.N[i * 3 + 1]; N[v * 3 + 2] = -nx * sin + nz * cos;
          UV[v * 2] = L.UV[i * 2]; UV[v * 2 + 1] = L.UV[i * 2 + 1];
          const code = L.T[i], hh = Math.max(0, py), wood = code === 8;
          D[v * 4] = wood ? 36 + st.sp : code >= 12 ? ALT + code - 12 : st.sp * 4 + (code >= 4 ? code - 4 : (st.tone + code) % 4);
          D[v * 4 + 1] = wood ? L.B[i] * (0.9 + 0.2 * st.h0) * contact(py) * (1 - 0.22 * Math.min(1, Math.max(0, py - crownY) / (crownY + 0.5)))
            : L.B[i] * st.bright * st.S.gain;
          D[v * 4 + 2] = wood ? 0 : (L.H[i] + st.h0) % 1;
          D[v * 4 + 3] = st.S.sway * hh * hh;
          F[v * 4] = st.phase; F[v * 4 + 1] = L.FL[i]; F[v * 4 + 2] = L.TR[i]; F[v * 4 + 3] = L.BD[i];
        }
        const base = v - L.nv;
        for (let i = 0; i < L.I.length; i++) I[ii++] = base + L.I[i];
      });
      if (pass === 0) iNear = ii;
    });
    if (nLeaf) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      g.setAttribute('aData', new THREE.BufferAttribute(D, 4));
      g.setAttribute('aFx', new THREE.BufferAttribute(F, 4));
      g.setIndex(new THREE.BufferAttribute(I, 1));
      g.boundingBox = c.box.clone(); g.boundingSphere = c.box.getBoundingSphere(new THREE.Sphere());
      freeAfterUpload(g);
      const mesh = new THREE.Mesh(g, M.leaf);
      mesh.name = `trees:leaf:${c.key}:${lod}`;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = lod < 2; mesh.receiveShadow = true;
      mesh.userData.leaf = true;
      if (lod < 2) mesh.customDepthMaterial = M.depth;
      if (lod < 2) {
        const nShadow = ii - iNear;
        g.setDrawRange(0, iNear);
        mesh.onBeforeShadow = () => { g.setDrawRange(iNear, nShadow); };
        mesh.onAfterShadow = () => { g.setDrawRange(0, iNear); };
      }
      out.add(mesh);
    }

    // bark (near only)
    if (nTrunk) {
      const TP = new Float32Array(nTrunk * 3), TN = new Float32Array(nTrunk * 3), TUV = new Float32Array(nTrunk * 2), TC = new Float32Array(nTrunk * 3), TS = new Float32Array(nTrunk * 3);
      const TI = new Uint32Array(iTrunk);
      v = 0; ii = 0;
      c.trees.forEach((t, n) => {
        const st = c.stamps[n], T = tpls[0][n].trunk, { cos, sin, sxz, sy } = st, col = barkCol[st.sp];
        for (let i = 0; i < T.nv; i++, v++) {
          const px = T.P[i * 3] * sxz, py = T.P[i * 3 + 1] * sy, pz = T.P[i * 3 + 2] * sxz;
          TP[v * 3] = t.x + px * cos + pz * sin; TP[v * 3 + 1] = t.y + py; TP[v * 3 + 2] = t.z - px * sin + pz * cos;
          const nx = T.N[i * 3], nz = T.N[i * 3 + 2];
          TN[v * 3] = nx * cos + nz * sin; TN[v * 3 + 1] = T.N[i * 3 + 1]; TN[v * 3 + 2] = -nx * sin + nz * cos;
          TUV[v * 2] = T.UV[i * 2]; TUV[v * 2 + 1] = T.UV[i * 2 + 1] * sy;
          // darken toward the ground (contact) and by the template's shade
          const sh = T.S[i] * (0.9 + 0.2 * st.h0) * contact(py);
          TC[v * 3] = col.r * sh; TC[v * 3 + 1] = col.g * sh; TC[v * 3 + 2] = col.b * sh;
          const hh = Math.max(0, py);
          TS[v * 3] = st.phase; TS[v * 3 + 1] = st.S.sway * hh * hh; TS[v * 3 + 2] = st.S.plane;
        }
        const base = v - T.nv;
        for (let i = 0; i < T.I.length; i++) TI[ii++] = base + T.I[i];
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(TP, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(TN, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(TUV, 2));
      g.setAttribute('color', new THREE.BufferAttribute(TC, 3));
      g.setAttribute('aSway', new THREE.BufferAttribute(TS, 3));
      g.setIndex(new THREE.BufferAttribute(TI, 1));
      g.boundingBox = c.box.clone(); g.boundingSphere = c.box.getBoundingSphere(new THREE.Sphere());
      freeAfterUpload(g);
      const mesh = new THREE.Mesh(g, M.trunk);
      mesh.name = `trees:trunk:${c.key}`;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false; mesh.receiveShadow = true;      // its shadow comes from the proxy in the foliage mesh
      out.add(mesh);
    }
    out.visible = false;
    group.add(out);
    return out;
  }

  function releaseCell(c, lod) {
    const g = c.mesh[lod];
    for (const m of g.children) m.geometry.dispose();
    group.remove(g);
    c.mesh[lod] = null;
  }

  // far is built up front (cheap); mid and near cells are built ahead of need, one per frame
  const cellList = [...cells.values()];
  for (const c of cellList) c.mesh[2] = buildCell(c, 2);

  // ---- LOD cross-fade: a pooled pair of fade materials per cell in transition ------------------------------------------------
  const pool = [], fading = [];
  function fadeSlot() {
    let s = pool.pop();
    if (!s) {
      const uIn = { value: 0 }, uOut = { value: -1 };
      s = { uIn, uOut, leafIn: M.makeLeaf(uIn), leafOut: M.makeLeaf(uOut), trunkIn: M.makeTrunk(uIn), trunkOut: M.makeTrunk(uOut) };
    }
    return s;
  }
  const setMats = (g, leaf, trunk) => { for (const m of g.children) m.material = m.userData.leaf ? leaf : trunk; };
  function endFade(c) {
    const f = c.fade;
    if (!f) return;
    setMats(c.mesh[f.from], M.leaf, M.trunk); setMats(c.mesh[f.to], M.leaf, M.trunk);
    c.mesh[f.from].visible = false;
    pool.push(f.slot);
    c.fade = null;
    const i = fading.indexOf(c);
    if (i >= 0) fading.splice(i, 1);
  }
  function setLod(c, lod, now) {
    endFade(c);
    const from = c.lod;
    c.lod = lod; c.cast = null;
    if (from < 0 || now || instant) {
      for (let i = 0; i < 3; i++) if (c.mesh[i]) c.mesh[i].visible = i === lod;
      return;
    }
    const slot = fadeSlot();
    slot.uIn.value = 0; slot.uOut.value = -1;
    setMats(c.mesh[lod], slot.leafIn, slot.trunkIn); setMats(c.mesh[from], slot.leafOut, slot.trunkOut);
    c.mesh[lod].visible = true;
    c.fade = { from, to: lod, t: 0, slot };
    fading.push(c);
  }

  // ---- LOD selection ------------------------------------------------------------------------------------------------------
  const near = quality.treeLodNear, far = quality.treeLodFar, shadowFar = Math.min(quality.shadowDistance || 120, 125) + 15;
  function selectLod(force) {
    const cam = ctx.camera.position;
    let want = null, wantLod = 0, drop = null, dropLod = 0;
    for (const c of cellList) {
      const d = c.dist = c.box.distanceToPoint(cam);
      let lod = c.lod;
      if (lod < 0 || force) lod = d < near ? 0 : d < far ? 1 : 2;
      else if (lod === 0) { if (d > near + HYST) lod = d < far ? 1 : 2; }
      else if (lod === 1) { if (d < near) lod = 0; else if (d > far + HYST) lod = 2; }
      else if (d < far) lod = d < near ? 0 : 1;
      if (c.belt && lod === 0) lod = 1;
      if (!c.mesh[1] && d < far + AHEAD) {
        if (force || instant || c.lod < 0 || d < far * 0.4) { if (lod < 2) c.mesh[1] = buildCell(c, 1); }      // (close by after a jump: now)
        else { if (!want || d < want.dist) { want = c; wantLod = 1; } if (lod < 2) lod = 2; }
      }
      if (c.mesh[1] && !c.belt && !c.mesh[0] && d < near + AHEAD) {
        if (force || instant) { if (lod === 0) c.mesh[0] = buildCell(c, 0); }
        else { if (!want || d < want.dist) { want = c; wantLod = 0; } if (lod === 0) lod = c.lod === 0 ? 0 : 1; }
      }
      if (lod !== c.lod) setLod(c, lod, force);
      // mid cells beyond the shadow range do not cast
      const cast = lod === 0 || (lod === 1 && d < shadowFar);
      if (cast !== c.cast) { c.cast = cast; const m = c.mesh[lod].children[0]; if (m) m.castShadow = cast; }
      // near / mid meshes left well behind are released again (a tour of the map otherwise keeps every cell it ever
      // built: three times the vertex memory of the start). KEEP metres beyond the build-ahead ring is the hysteresis.
      if (!c.fade && !force) {
        const l = c.mesh[0] && c.lod > 0 && d > near + AHEAD + KEEP ? 0 : c.mesh[1] && c.lod === 2 && d > far + AHEAD + KEEP ? 1 : -1;
        if (l >= 0 && (!drop || d > drop.dist)) { drop = c; dropLod = l; }
      }
    }
    if (want) want.mesh[wantLod] = buildCell(want, wantLod);       // at most one cell per frame, before the walker needs it
    else if (drop) releaseCell(drop, dropLod);                     // and at most one release, the farthest first
  }

  // ---- live ambience --------------------------------------------------------------------------------------------------------
  const U = M.uniforms, pal = U.uPalette.value, fill = U.uFill.value;
  for (let i = 0; i < 9; i++) { pal[(36 + i) * 3] = farCol[i].r; pal[(36 + i) * 3 + 1] = farCol[i].g; pal[(36 + i) * 3 + 2] = farCol[i].b; }
  const TINT = ORDER.map((s) => SPEC[s].tint || [1, 1, 1]);
  const iMaple = spIndex.maple, iPlane = spIndex.plane, iCrab = spIndex.crabapple, FRUIT = new THREE.Color('#b3241c');
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // pull an accent tone toward the tree's main tone (harsh deep-red slabs on 海棠, maroon lumps on spring maples)
  const soften = (s, k) => { const a = s * 12, b = a + 6; for (let i = 0; i < 3; i++) pal[b + i] += (pal[a + i] - pal[b + i]) * k; };
  function syncEnv() {
    const c = env.current;
    for (let s = 0; s < 9; s++) {
      const cols = c.foliage[ORDER[s]], tint = TINT[s];
      for (let k = 0; k < 4; k++) { const col = cols[k], o = (s * 4 + k) * 3; pal[o] = col.r * tint[0]; pal[o + 1] = col.g * tint[1]; pal[o + 2] = col.b * tint[2]; }
      fill[s] = c.leafFill?.[ORDER[s]] ?? 1;
    }
    // 海棠 out of bloom shows its leaf + fruit cards (alternate slot) instead of the blossom cards. Bloom is read off the
    // live palette (blossom is pale: a high blue channel), so presets cross-fade by thinning one set into the other.
    {
      const cb = c.foliage.crabapple, o = ALT * 3, bloom = sstep(0.2, 0.45, cb[0].b), lf = fill[iCrab];
      // bronze-yellow, olive-bronze and a softened russet: no scarlet (that is 嘉峪关路's signature)
      for (let i = 0; i < 3; i++) {
        const k = 'rgb'[i];
        pal[o + i] = cb[1][k] * 0.78; pal[o + 3 + i] = cb[3][k] * 0.78; pal[o + 6 + i] = (cb[1][k] + (cb[0][k] - cb[1][k]) * 0.6) * 0.78;
      }
      // fruit: red once the leaves have turned, leaf-coloured (unripe) in the green seasons
      const ripe = sstep(0.05, 0.3, (cb[0].r - cb[0].g) / (cb[0].r + cb[0].g + 1e-4)) * (1 - bloom);
      pal[o + 9] = cb[0].r + (FRUIT.r - cb[0].r) * ripe; pal[o + 10] = cb[0].g + (FRUIT.g - cb[0].g) * ripe; pal[o + 11] = cb[0].b + (FRUIT.b - cb[0].b) * ripe;
      fill[iCrab] = lf * bloom; fill[ALT / 4] = lf * (0.25 + 0.75 * lf) * (1 - bloom);       // autumn (0.6): well under half the leaves left
    }
    soften(iCrab, 0.55); soften(iMaple, 0.3);
    // 法桐 in leaf: its yellow-green accent tone reads as lime patches on a green crown (worst against a low sun), so in
    // the green seasons it is pulled most of the way to the main tone. Autumn (tone 0 warmer than green) keeps it.
    {
      const a = iPlane * 12, b = a + 9, k = 0.55 * sstep(0.02, 0.2, (pal[a + 1] - pal[a]) / (pal[a + 1] + pal[a] + 1e-4));
      for (let i = 0; i < 3; i++) pal[b + i] += (pal[a + i + 3] - pal[b + i]) * k;
    }
    U.uSunDir.value.copy(env.sunDir);
    U.uSunCol.value.copy(c.sunColor).multiplyScalar(c.sunIntensity);
  }
  syncEnv();
  selectLod(true);
  // have the cells around the start ready, so the first steps never wait on a build
  for (const c of cellList) {
    if (!c.mesh[1] && c.dist < far + AHEAD) c.mesh[1] = buildCell(c, 1);
    if (!c.belt && !c.mesh[0] && c.dist < near + AHEAD) c.mesh[0] = buildCell(c, 0);
  }

  return {
    update(dt) {
      syncEnv();
      selectLod(false);
      for (let i = fading.length - 1; i >= 0; i--) {
        const c = fading[i], f = c.fade;
        f.t += Math.min(0.1, dt || 0.016) / FADE_TIME;
        if (f.t >= 1) endFade(c);
        else { f.slot.uIn.value = f.t; f.slot.uOut.value = f.t - 1; }
      }
    },
    onPreset() {},
    dispose() {
      group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      ctx.scene.remove(group);
      M.dispose(); atlas.texture.dispose(); planeBark.dispose();
    },
  };
}
