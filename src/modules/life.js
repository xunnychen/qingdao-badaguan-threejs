// Package "life": everything that grows, falls, flies or poses in the scene.
//   life/planting.js  hedges on the garden walls, creeper over wall runs, shrubs, flower beds, hydrangeas (static chunks)
//   life/grass.js     grass tufts on the lawns near the walker (recycled cell grid, one instanced mesh)
//   life/litter.js    leaf litter and petal carpets along kerbs and wall bases (instanced patches, live amounts)
//   life/falling.js   falling leaves / petals / fog drips bound to the trees around the walker (stateless shader motion)
//   life/motes.js     dust motes / midges (additive points)
//   life/flyers.js    gulls over the bay, butterflies in the parks (vertex-animated)
//   life/figures.js   wedding couples with photographer and reflector, strollers, an elder
//   life/textures.js  the canvas textures all of the above share
// Budget: about 20 draw calls; triangles are held down by distance rules (blooms only in chunks near the camera, only
// hedges and shrubs of the chunks around the walker in the shadow pass, people merged per 150 m cell, grass thinned
// beyond 16 m). The stats are logged with ?debug=1.
import * as THREE from 'three';
import { createLifeTextures } from './life/textures.js';
import { createPlanting } from './life/planting.js';
import { createGrass } from './life/grass.js';
import { createLitter } from './life/litter.js';
import { createFalling } from './life/falling.js';
import { createMotes } from './life/motes.js';
import { createFlyers } from './life/flyers.js';
import { createFigures } from './life/figures.js';

const SEASONS = ['autumn', 'fog', 'dusk', 'spring'];   // uShow[1..4]; uShow[0] = always

export async function create(ctx) {
  const { map: MAP, world, env, wind } = ctx;
  const group = ctx.group('life');

  // ---- shared: tree lookup, surface height, uniforms -----------------------------------------------------------------------
  const TC = 12, treeCells = new Map();
  for (const t of MAP.trees) {
    const k = Math.floor(t.x / TC) * 4096 + Math.floor(t.z / TC);
    let a = treeCells.get(k); if (!a) treeCells.set(k, (a = []));
    a.push(t);
  }
  const treesWithin = (x, z, r, out = []) => {
    const x0 = Math.floor((x - r) / TC), x1 = Math.floor((x + r) / TC), z0 = Math.floor((z - r) / TC), z1 = Math.floor((z + r) / TC);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = treeCells.get(i * 4096 + j);
      if (a) for (const t of a) if ((t.x - x) ** 2 + (t.z - z) ** 2 <= r * r) out.push(t);
    }
    return out;
  };
  const treeNear = (x, z, r) => {
    const x0 = Math.floor((x - r) / TC), x1 = Math.floor((x + r) / TC), z0 = Math.floor((z - r) / TC), z1 = Math.floor((z + r) / TC);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = treeCells.get(i * 4096 + j);
      if (a) for (const t of a) if ((t.x - x) ** 2 + (t.z - z) ** 2 <= r * r) return true;
    }
    return false;
  };
  // street surfaces sit on thin per-street height layers above heightAt (same greedy colouring as the terrain package)
  const layer = {};
  for (const st of MAP.streets) {
    const used = new Set();
    for (const j of MAP.junctions) if (j.streets.includes(st.id)) for (const o of j.streets) if (o !== st.id && layer[o] !== undefined) used.add(layer[o]);
    let l = 0; while (used.has(l)) l++;
    layer[st.id] = l;
  }
  const ns = {};
  /** top of the walkable surface at (x,z): asphalt / paving level on streets, heightAt elsewhere */
  const groundY = (x, z) => {
    const h = world.heightAt(x, z), surf = world.surfaceAt(x, z);
    if (surf !== 'road' && surf !== 'sidewalk') return h;
    const q = world.nearestStreet(x, z, ns);
    if (!q) return h;
    const L = layer[q.street.id] * 0.012;
    if (surf === 'sidewalk') return h + 0.14 + L;
    const f = Math.min(1, q.d / q.street.half);
    return h + 0.03 + 0.02 * (1 - f * f) + L;
  };

  const U = {
    uTime: wind.uniforms.uTime, uWind: wind.uniforms.uWind, uGust: wind.uniforms.uGust,
    uWindBase: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) },
    uShow: { value: new Float32Array([1, 0, 0, 0, 0]) },
  };
  const S = { group, U, tex: createLifeTextures(ctx), treesWithin, treeNear, groundY };

  const parts = {};
  const add = (name, make) => {
    try { parts[name] = make(ctx, S); } catch (e) { console.error(`[life] ${name} failed`, e); }
  };
  add('planting', createPlanting);
  if (ctx.quality.grass) add('grass', createGrass);
  add('litter', createLitter);
  add('falling', createFalling);
  add('motes', createMotes);
  add('flyers', createFlyers);
  add('figures', createFigures);
  const list = Object.values(parts);

  const prevName = () => { for (const k in env.resolved) if (env.resolved[k] === env.prev) return k; return env.name; };
  function shared() {
    const cur = env.current;
    U.uWindBase.value.copy(wind.dir).multiplyScalar(wind.strength);
    U.uSunDir.value.copy(env.sunDir);
    U.uSunCol.value.copy(cur.sunColor).multiplyScalar(cur.sunIntensity);
    const k = env.transitioning ? env.blend * env.blend * (3 - 2 * env.blend) : 1, from = prevName();
    for (let i = 0; i < SEASONS.length; i++) {
      const id = SEASONS[i];
      U.uShow.value[i + 1] = (id === env.name ? k : 0) + (env.transitioning && id === from && id !== env.name ? 1 - k : 0);
    }
  }
  shared();
  for (const p of list) p.update?.(0, ctx.state.time || 0);

  if (ctx.params.debug) {
    console.log('[life]', JSON.stringify({ planting: parts.planting?.stats, litter: parts.litter?.stats, figures: parts.figures?.stats, grass: parts.grass?.count, falling: parts.falling?.count }));
  }

  return {
    parts,
    update(dt, t) {
      shared();
      for (const p of list) p.update?.(dt, t);
    },
    onPreset(target, prev) { for (const p of list) p.onPreset?.(target, prev); },
    dispose() {
      for (const p of list) p.dispose?.();
      S.tex.dispose();
      ctx.scene.remove(group);
    },
  };
}
