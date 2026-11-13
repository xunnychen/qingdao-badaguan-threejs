// Package "terrain": ground, roads, kerbs, sidewalks, paving, the seawall promenade and the far field.
//
//   terrain/ground.js     near heightfield (4 x 4 chunks) + the blended ground material (control map, live lawn colour)
//   terrain/far.js        coarse far field out to +-1400 m with seam skirts
//   terrain/streets.js    asphalt ribbons, kerbs, sidewalks, tree pits, paved footpaths
//   terrain/promenade.js  海滨步行道 paving, seawall, parapet, beach stairs
//   terrain/textures.js   control map, reef granite, macro noise, far speckle
//
// Draw calls: 16 ground chunks and the three street ribbons in 300 m cells are frustum-culled (about half are drawn on
// foot) + far + granite + coping (+2 in the shadow pass).
import * as THREE from 'three';
import { buildGround } from './terrain/ground.js';
import { buildFar } from './terrain/far.js';
import { buildStreets, pavedLines } from './terrain/streets.js';
import { buildPromenade } from './terrain/promenade.js';

export async function create(ctx) {
  const { geo, mats, env } = ctx;
  const { smoothstep, lerp } = ctx.rng;
  const group = ctx.group('terrain');

  const paved = pavedLines(ctx);
  const ground = buildGround(ctx, group, paved);
  const far = buildFar(ctx, group, ground.edge);
  const streets = buildStreets(ctx, paved);
  const prom = buildPromenade(ctx, streets.pave);

  // shared materials are read-only: clone the ones that need vertex colours / live wetness
  const asphalt = mats.get('asphalt').clone(); asphalt.vertexColors = true; asphalt.name = 'terrain-asphalt';
  const kerbMat = mats.get('kerb').clone(); kerbMat.vertexColors = true; kerbMat.name = 'terrain-kerb';
  const paveMat = mats.get('paving').clone(); paveMat.vertexColors = true; paveMat.name = 'terrain-paving';
  // smooth-dressed stone (kerbs, coping, steps): the shared concrete normal map is too coarse at full strength
  kerbMat.normalScale.set(0.35, 0.35);
  const copingMat = mats.get('coping').clone(); copingMat.vertexColors = true; copingMat.normalScale.set(0.3, 0.3); copingMat.name = 'terrain-coping';
  const graniteMat = mats.get('granite').clone(); graniteMat.vertexColors = true; graniteMat.name = 'terrain-granite';
  // dressed granite here is the cool buff-grey of the palette (#B9B2A3 / #9C968A): under the warm low sun the shared
  // materials drift to sandstone yellow, so these clones are pulled a little cooler and darker
  const KERB = new THREE.Color('#a7a198').multiply(new THREE.Color(0.8, 0.83, 0.89));
  graniteMat.color.multiply(new THREE.Color(0.8, 0.83, 0.9));
  copingMat.color.multiply(new THREE.Color(0.86, 0.88, 0.93));
  const WOOD_COOL = new THREE.Color(0.03, 0.075, 0.062), GARDEN = new THREE.Color(0.62, 0.68, 0.52);
  const owned = [asphalt, kerbMat, paveMat, copingMat, graniteMat];

  const geos = [];
  // `cell` > 0 splits a whole-map ribbon into square cells of that many metres so three can cull what is off screen
  const add = (buf, mat, name, cast, cell = 0) => {
    if (!buf.triangles) return 0;
    const n = buf.triangles;
    for (const part of cell ? buf.split(cell) : [buf]) {
      const g = part.build();
      geos.push(g);
      group.add(geo.staticMesh(g, mat, { cast, receive: true, name }));
    }
    return n;
  };
  const CELL = 300;
  const tris = {
    ground: ground.triangles, far: far.triangles,
    asphalt: add(streets.road, asphalt, 'terrain-roads', false, CELL),
    kerbs: add(streets.kerb, kerbMat, 'terrain-kerbs', false, CELL),
    paving: add(streets.pave, paveMat, 'terrain-paving', false, CELL),
    granite: add(prom.granite, graniteMat, 'terrain-seawall', true),
    coping: add(prom.coping, copingMat, 'terrain-coping', true),
  };
  tris.total = Object.values(tris).reduce((a, b) => a + b, 0);
  if (ctx.params.debug) console.log('[terrain] triangles', JSON.stringify(tris));

  function apply() {
    const cur = env.current;
    ground.uniforms.uLawn.value.copy(cur.lawn);
    // sea fog leaves everything damp: darker, glossier asphalt and paving
    const wet = smoothstep(0.004, 0.015, cur.fogDensity);
    ground.uniforms.uWet.value = wet;
    asphalt.color.setScalar(1 - 0.3 * wet); asphalt.roughness = lerp(0.93, 0.5, wet);
    paveMat.color.setScalar(1 - 0.16 * wet); paveMat.roughness = lerp(0.88, 0.66, wet);
    kerbMat.color.copy(KERB).multiplyScalar(1 - 0.14 * wet);
    // far woodland: the live hedge green pulled dark and a little blue (pine / cedar); the first metres beyond the near
    // rectangle carry on its garden-ground colour
    far.uniforms.uWood.value.copy(cur.hedge).multiplyScalar(0.62).lerp(WOOD_COOL, 0.35);
    far.uniforms.uNear.value.copy(cur.lawn).multiply(GARDEN).multiplyScalar(0.72);
  }
  apply();

  return {
    triangles: tris,
    update() { apply(); },
    onPreset() {},
    dispose() {
      ctx.scene.remove(group);
      ground.dispose(); far.dispose();
      for (const g of geos) g.dispose();
      for (const m of owned) m.dispose();
    },
  };
}
