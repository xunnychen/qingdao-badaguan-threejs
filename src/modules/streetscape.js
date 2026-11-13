// Package "streetscape": the continuous granite garden wall with its piers, railings and gates, the cast-iron street
// lamps (with their evening light), street-name plates, tourist finger posts, benches and a little street clutter.
//
// Draw calls: piers + coping (the bulk of the triangles) per 120 m chunk and lamp posts per 170 m chunk, all hidden
// beyond FAR on foot (update -> cullDetail); the cheap rubble faces + railing panels per 340 m chunk; and six global
// meshes (lamp glass, signs, small furniture, bench timber, glow billboards, light pools). Only the rubble wall and
// the bench timber cast shadows.
import * as THREE from 'three';
import { Buf, chunkKey } from './streetscape/util.js';

import { buildIronAtlas, buildSignAtlas, buildRadialTexture } from './streetscape/atlas.js';
import { buildWalls } from './streetscape/walls.js';
import { planGates, buildGates } from './streetscape/gates.js';
import { buildLamps } from './streetscape/lamps.js';
import { planSigns, buildSigns, makeSpotTest } from './streetscape/signs.js';
import { buildFurniture } from './streetscape/furniture.js';

const BIG = 340;
const DETAIL = 120;       // chunk size of the heavy detail families (piers, coping), metres
const FAR = 190;          // on foot, detail chunks (piers, coping, lamp posts) are hidden beyond this distance, metres
const bigKey = (x, z) => `${Math.floor((x + 300) / BIG)}:${Math.floor((z + 270) / BIG)}`;

/** Alpha test that turns into a stable screen-space dither once the texture is minified, so distant railings stay a
 *  see-through screen instead of vanishing (or turning solid) in the mip chain. Still a pure alpha TEST (no blending). */
function patchRailAlpha(mat, texW, texH) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlasSize = { value: new THREE.Vector2(texW, texH) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uAtlasSize;')
      .replace('#include <alphatest_fragment>', /* glsl */ `
        #ifdef USE_MAP
          vec2 railPx = vMapUv * vec2( 512.0, 1024.0 );   // reference texel density: thresholds are in world terms
          vec2 railDx = dFdx( railPx ), railDy = dFdy( railPx );
          float railLod = 0.5 * log2( max( max( dot( railDx, railDx ), dot( railDy, railDy ) ), 1e-8 ) );
          float railFar = smoothstep( 3.3, 4.7, railLod );
          float railNoise = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
          float railCut = mix( 0.5, 0.32, smoothstep( 1.0, 3.3, railLod ) );
          if ( diffuseColor.a < mix( railCut, clamp( railNoise, 0.1, 0.95 ), railFar ) ) discard;
          diffuseColor.a = 1.0;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'streetscape-rail';
}

/** Additive sprites must fade out in fog, not fade toward the fog colour. keep = fraction that survives full fog. */
function patchAdditiveFog(shader, keep) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', /* glsl */ `
    vec3 preFogColor = gl_FragColor.rgb;
    #include <fog_fragment>
    #ifdef USE_FOG
      gl_FragColor.rgb = preFogColor * ( 1.0 - ${(1 - keep).toFixed(3)} * fogFactor );
    #endif`);
}

export async function create(ctx) {
  const { map, geo, mats, world, quality, env } = ctx;
  const group = ctx.group('streetscape');
  const owned = [];                                    // materials / textures / geometries this module must dispose

  // ---- sinks --------------------------------------------------------------------------------------------------------
  const chunked = { rubble: new Map(), coping: new Map(), granite: new Map(), iron: new Map() };
  const S = {
    get(kind, x, z) {
      // rubble faces and the 8 k triangles of railing panels: few big meshes; piers + coping: small cullable chunks
      const k = kind === 'rubble' || kind === 'iron' ? bigKey(x, z) : chunkKey(x, z, DETAIL);
      let b = chunked[kind].get(k);
      if (!b) chunked[kind].set(k, (b = new Buf(true)));
      return b;
    },
    sign: new Buf(false), misc: new Buf(true), wood: new Buf(false), lampIron: new Buf(false), lampGlass: new Buf(false),
    glows: [], lampHeads: [], placed: [], touristPosts: null,
  };

  // ---- textures -----------------------------------------------------------------------------------------------------
  const iron = buildIronAtlas(ctx);
  const gatePlan = planGates(ctx);
  const free = makeSpotTest(ctx, S);
  const signPlan = planSigns(ctx, S, free);
  S.touristPosts = signPlan.posts;
  const signs = buildSignAtlas(ctx, { streets: map.streets, houses: gatePlan.houses, plaques: gatePlan.plaques, tourist: signPlan.entries });
  owned.push(iron.texture, signs.texture);

  // ---- geometry -----------------------------------------------------------------------------------------------------
  const walls = buildWalls(ctx, S, iron);
  buildGates(ctx, S, gatePlan, iron, signs);
  buildLamps(ctx, S);
  buildSigns(ctx, S, signPlan, signs);
  buildFurniture(ctx, S, free, signs, walls.runs);

  // ---- materials ----------------------------------------------------------------------------------------------------
  const vc = (name) => { const m = mats.get(name).clone(); m.vertexColors = true; m.name = `streetscape:${name}`; owned.push(m); return m; };
  const rubbleMat = vc('rubble'), copingMat = vc('coping'), graniteMat = vc('granite');
  const ironMat = new THREE.MeshStandardMaterial({ map: iron.texture, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, color: 0xd4d4d4, roughness: 0.7, metalness: 0, name: 'streetscape:ironwork' });
  patchRailAlpha(ironMat, iron.width, iron.height);
  const signMat = new THREE.MeshStandardMaterial({ map: signs.texture, alphaTest: 0.5, roughness: 0.86, metalness: 0, envMapIntensity: 0.35, emissive: 0xffffff, emissiveMap: signs.texture, emissiveIntensity: 0.06,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'streetscape:signs' });   // plates never z-fight their tray / pier
  owned.push(ironMat, signMat);
  const miscMat = mats.plain('#ffffff', 0.55, 0.3, { vertexColors: true });

  const detail = [];                                   // { mesh, box } of the distance-culled detail chunks
  const track = (m) => {
    if (!m) return m;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    detail.push({ mesh: m, box: m.geometry.boundingBox });
    return m;
  };
  const add = (buf, mat, name, opts) => {
    const g = buf.build();
    if (!g) return null;
    const m = geo.staticMesh(g, mat, { name, ...opts });
    owned.push(g); group.add(m);
    return m;
  };
  for (const [k, b] of chunked.rubble) add(b, rubbleMat, `walls:${k}`);
  for (const [k, b] of chunked.coping) track(add(b, copingMat, `coping:${k}`, { cast: false }));   // its shadow is the wall's own
  // Only the rubble wall (and bench timber) cast: the wall run beside each pier throws the shadow that reads, and a
  // railing bar or lamp post is at or under one shadow texel. Measured: 25 shadow draw calls / 144 k triangles saved
  // at the spawn for no visible change.
  for (const [k, b] of chunked.granite) track(add(b, graniteMat, `piers:${k}`, { cast: false }));
  for (const [k, b] of chunked.iron) add(b, ironMat, `ironwork:${k}`, { cast: false });
  // whole-map soups (lamp posts, bins, sign poles) are split into spatial chunks so the renderer can cull them per
  // view and per shadow cascade, and so core's shadow-caster culling (core/loop.js) can drop the far ones
  const addSplit = (buf, mat, name, opts) => {
    const g = buf.build();
    if (!g) return;
    const pos = g.attributes.position, tris = pos.count / 3, buckets = new Map();
    if (g.index) { owned.push(g); group.add(geo.staticMesh(g, mat, { name, ...opts })); return; }
    for (let t = 0; t < tris; t++) {
      const i = t * 3, k = chunkKey((pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3);
      let b = buckets.get(k); if (!b) buckets.set(k, (b = []));
      b.push(t);
    }
    for (const [k, list] of buckets) {
      const part = new THREE.BufferGeometry();
      for (const an in g.attributes) {
        const src = g.attributes[an], sz = src.itemSize, out = new src.array.constructor(list.length * 3 * sz);
        list.forEach((t, j) => out.set(src.array.subarray(t * 3 * sz, (t + 1) * 3 * sz), j * 3 * sz));
        part.setAttribute(an, new THREE.BufferAttribute(out, sz, src.normalized));
      }
      part.computeBoundingBox(); part.computeBoundingSphere();
      owned.push(part);
      const m = geo.staticMesh(part, mat, { name: `${name}:${k}`, cast: opts?.cast, receive: opts?.receive });
      group.add(m); track(m);
    }
    g.dispose();
  };
  addSplit(S.lampIron, mats.get('ironGreen'), 'lamp-iron', { cast: false });
  add(S.lampGlass, mats.get('lampGlass'), 'lamp-glass', { cast: false, receive: false });   // 10 k, one call: the far globes still glow at dusk
  add(S.sign, signMat, 'signs', { cast: false });
  add(S.misc, miscMat, 'furniture', { cast: false });   // 16 k triangles: one draw call is worth more than culling it
  add(S.wood, mats.wood('#7a5230'), 'bench-timber');

  // ---- evening light: glow billboards, light pools, a small pool of point lights ---------------------------------------
  const glowScale = { value: 1 };
  const glowTex = buildRadialTexture(ctx, 'glow'), poolTex = buildRadialTexture(ctx, 'pool');
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true, name: 'streetscape:glow' });
  glowMat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowScale = glowScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowScale;')
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        mvPosition.xy += position.xy * length( instanceMatrix[ 0 ].xyz ) * uGlowScale;
        mvPosition.z += 0.3;
        gl_Position = projectionMatrix * mvPosition;`);
    patchAdditiveFog(shader, 0.65);
  };
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true, name: 'streetscape:pool' });
  poolMat.onBeforeCompile = (shader) => patchAdditiveFog(shader, 0);
  owned.push(glowTex, poolTex, glowMat, poolMat);

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), NRM = new THREE.Vector3();
  const quad = new THREE.PlaneGeometry(1, 1);
  const glowMesh = new THREE.InstancedMesh(quad, glowMat, S.glows.length);
  S.glows.forEach((gl, i) => { M.makeScale(gl.size, gl.size, gl.size).setPosition(gl.x, gl.y, gl.z); glowMesh.setMatrixAt(i, M); });
  glowMesh.frustumCulled = false; glowMesh.matrixAutoUpdate = false; glowMesh.renderOrder = 6; glowMesh.name = 'lamp-glow';
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const poolMesh = new THREE.InstancedMesh(flat, poolMat, S.lampHeads.length);
  const nrm = [0, 1, 0];
  S.lampHeads.forEach((l, i) => {
    world.normalAt(l.x, l.z, nrm);
    Q.setFromUnitVectors(UP, NRM.set(nrm[0], nrm[1], nrm[2]));
    const d = l.lamp.kind === 'twin' ? 12.5 : 11;
    M.compose(V.set(l.x, world.heightAt(l.x, l.z) + 0.2, l.z), Q, SC.set(d, 1, d));
    poolMesh.setMatrixAt(i, M);
  });
  poolMesh.frustumCulled = false; poolMesh.matrixAutoUpdate = false; poolMesh.renderOrder = 5; poolMesh.name = 'lamp-pools';
  glowMesh.visible = poolMesh.visible = false;
  group.add(poolMesh, glowMesh);
  owned.push(quad, flat);

  const WARM = new THREE.Color('#ffd9a0');
  const slots = [];
  for (let i = 0; i < quality.lampLights; i++) {
    const light = new THREE.PointLight(WARM, 0, 16, 2);
    light.castShadow = false; light.visible = false; light.name = `lamp-light-${i}`;
    group.add(light);
    slots.push({ light, head: null, k: 0 });
  }
  // The lights are in the scene (and in the light count of every lit program) only while a lit preset is shown or being
  // faded to. Both light states are compiled and drawn once by core's warm-up (see prewarm below), and three keeps both
  // variants in each material's program map, so arming and disarming are cache hits.
  let armed = false, forced = null;
  const show = (v) => { for (const sl of slots) sl.light.visible = v; };
  const arm = () => { if (armed || !slots.length) return; armed = true; if (forced === null) show(true); };
  const disarm = () => {
    if (!armed) return;
    armed = false;
    for (const sl of slots) { sl.light.intensity = 0; sl.k = 0; if (sl.head) sl.head.owned = false; sl.head = null; }
    if (forced === null) show(false);
  };

  const fwd = new THREE.Vector3(), heads = S.lampHeads, NS = slots.length;
  const want = new Array(NS).fill(null), wantScore = new Float64Array(NS);
  let stamp = 0, rescoreIn = 0, lastX = 1e9, lastZ = 1e9;
  /** The NS best lamps (nearest, biased ahead of the walker), by insertion into a preallocated list: no allocation. */
  function pickWanted(cam) {
    ctx.camera.getWorldDirection(fwd);
    stamp++;
    let n = 0;
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i], dx = h.x - cam.x, dz = h.z - cam.z, d = Math.hypot(dx, dz);
      const score = d - 9 * ((dx * fwd.x + dz * fwd.z) / (d + 1e-3));     // lamps ahead of the walker count as nearer
      if (n === NS && score >= wantScore[NS - 1]) continue;
      let j = n < NS ? n++ : NS - 1;
      while (j > 0 && wantScore[j - 1] > score) { want[j] = want[j - 1]; wantScore[j] = wantScore[j - 1]; j--; }
      want[j] = h; wantScore[j] = score;
    }
    for (let i = 0; i < n; i++) want[i].wantStamp = stamp;
    for (let i = n; i < NS; i++) want[i] = null;
  }
  function assignLights(dt, on, instant) {
    const cam = ctx.camera.position;
    rescoreIn -= dt;
    const mx = cam.x - lastX, mz = cam.z - lastZ;
    if (instant || rescoreIn <= 0 || mx * mx + mz * mz > 4) { pickWanted(cam); rescoreIn = 0.25; lastX = cam.x; lastZ = cam.z; }
    for (let si = 0; si < NS; si++) {
      const sl = slots[si];
      if (!(sl.head && sl.head.wantStamp === stamp)) {
        sl.k = instant ? 0 : Math.max(0, sl.k - dt * 2.5);
        if (sl.k <= 0) {
          if (sl.head) sl.head.owned = false;
          sl.head = null;
          for (let i = 0; i < NS; i++) if (want[i] && !want[i].owned) { sl.head = want[i]; break; }
          if (sl.head) { sl.head.owned = true; sl.light.position.set(sl.head.x, sl.head.y - 0.25, sl.head.z); }
        }
      }
      if (sl.head && sl.head.wantStamp === stamp) sl.k = instant ? 1 : Math.min(1, sl.k + dt * 2.5);
      const d = sl.head ? Math.hypot(sl.head.x - cam.x, sl.head.z - cam.z) : 1e3;
      sl.light.intensity = sl.head ? 26 * on * sl.k * (1 - THREE.MathUtils.smoothstep(d, 55, 90)) : 0;
    }
  }

  // ---- distance culling of the detail chunks ------------------------------------------------------------------------
  // On foot, trees, houses and haze hide a 0.5 m pier 220 m away; from the air (overview shots) the radius opens up.
  let cullX = 1e9, cullY = 1e9, cullZ = 1e9;
  function cullDetail(force) {
    const cam = ctx.camera.position;
    const mx = cam.x - cullX, my = cam.y - cullY, mz = cam.z - cullZ;
    if (!force && mx * mx + my * my + mz * mz < 4) return;
    cullX = cam.x; cullY = cam.y; cullZ = cam.z;
    const alt = cam.y - world.heightAt(cam.x, cam.z);
    const far = FAR * (quality.tier === 'low' ? 0.62 : 1) + 10 * Math.max(0, alt - 12);   // low tier: ~120 m
    for (let i = 0; i < detail.length; i++) {
      const d = detail[i], dist = d.box.distanceToPoint(cam);
      // 12 m of hysteresis so a walker pacing on the boundary does not flicker a chunk
      if (d.mesh.visible ? dist > far + 12 : dist < far) d.mesh.visible = !d.mesh.visible;
    }
  }

  let wasLit = false;
  function update(dt) {
    cullDetail(ctx.state.shot);
    const cur = env.current, on = cur.lampsOn;
    const any = on > 0.01;
    if (glowMesh.visible !== any) glowMesh.visible = poolMesh.visible = any;
    if (any) {
      // sea fog swells the halos; the ground pools only read when the daylight is low
      const foggy = THREE.MathUtils.smoothstep(cur.fogDensity, 0.004, 0.018);
      glowScale.value = 1 + 3.5 * foggy;
      const day = cur.sunIntensity * Math.max(0, Math.sin(THREE.MathUtils.degToRad(cur.sunElevation))) + cur.hemiIntensity;
      const dim = THREE.MathUtils.clamp(1.9 / (0.6 + day), 0.5, 1.6);
      glowMat.color.copy(WARM).multiplyScalar(on * (1.15 + 0.6 * foggy));
      poolMat.color.copy(WARM).multiplyScalar(on * 0.3 * dim * (1 - 0.45 * foggy));
    }
    if (on > 0.05) arm();
    else if (on <= 0.01 && !env.transitioning) disarm();   // back in daylight: leave the light count (after the fade, not during)
    const lit = armed && on > 0.05;
    // ramp in from the 0.05 threshold so the first lit frame does not pop
    if (lit) assignLights(dt, on * Math.min(1, (on - 0.05) / 0.1), !wasLit || ctx.state.shot);
    else if (wasLit) for (const sl of slots) sl.light.intensity = 0;
    wasLit = lit;
  }
  update(0);

  if (ctx.params.debug) {
    let tris = 0;
    group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) tris += o.geometry.attributes.position.count / 3; });
    const gap = (p) => Math.min(...map.lamps.map((l) => Math.hypot(l.x - p.x, l.z - p.z)));
    console.log('[streetscape] plate -> nearest lamp (m): ' + [...signPlan.streetSigns.map((s) => `${s.st.name}@${s.x.toFixed(0)},${s.z.toFixed(0)}:${gap(s).toFixed(1)}`), ...signPlan.posts.map((s) => `post@${s.x.toFixed(0)},${s.z.toFixed(0)}:${gap(s).toFixed(1)}`)].join(' '));
    console.log(`[streetscape] ${group.children.length} objects, ${Math.round(tris)} triangles, ${walls.nPiers} piers, ${walls.corners.length} corners joined, ${signPlan.streetSigns.length} street signs, ${signPlan.posts.length} finger posts`);
  }

  return {
    update,
    onPreset(target) { if (target && target.lampsOn > 0.05) arm(); },   // the program switch happens as the fade starts, not mid-fade
    /**
     * Shader warm-up hook (core `warmUp`): prewarm(true) shows the light state the page did NOT boot in, so its program
     * variants get compiled and drawn too (booting in fog / dusk, that is the daytime state without point lights);
     * prewarm(false) returns to the real state.
     */
    prewarm(on) {
      if (!slots.length) return;
      forced = on ? !armed : null;
      show(forced === null ? armed : forced);
    },
    dispose() {
      ctx.scene.remove(group);
      for (const o of owned) o.dispose();
      glowMesh.dispose(); poolMesh.dispose();
    },
    stats: { piers: walls.nPiers, corners: walls.corners.length, streetSigns: signPlan.streetSigns.length, fingerPosts: signPlan.posts.length },
  };
}
