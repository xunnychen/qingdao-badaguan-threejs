// Falling leaves, petals and fog drips. Every particle belongs to a tree near the walker and its whole life is a pure
// function of (tree, index, time) evaluated in the vertex shader: there is no simulation state, so the air is already
// full of leaves on the first frame, and trees that stay in range keep exactly the same leaves while the walker moves.
// Street trees shed a share of their leaves / petals over the carriageway and a share rides the wind across it.
import * as THREE from 'three';

const RANGE = 38;
// base: particle budget (x quality.particles x 1.3); per: particles per tree; range: trees this close to the walker;
// road: share released over the carriageway beside a street tree; fly: share carried a long way down-wind
const MODES = {
  leaves: { base: 2200, per: 120, range: RANGE + 4, road: 0.5, fly: 0.18, weight: { ginkgo: 1, maple: 1, plane: 1.15, crape: 0.4, peach: 0.3, crabapple: 0.3 } },
  petals: { base: 2200, per: 130, range: RANGE + 4, road: 0.6, fly: 0.3, weight: { peach: 1, crabapple: 1 } },
  drips: { base: 800, per: 70, range: 20, road: 0, fly: 0, weight: { cedar: 1, pine: 0.7, juniper: 0.4 } },
};
const BASE_MAX = 2200;
const LEAF_KIND = { ginkgo: 0, maple: 1, plane: 2, crape: 1, peach: 1, crabapple: 1 };
// real sizes, matching the leaves of the litter carpet
const LEAF_SIZE = { ginkgo: 0.115, maple: 0.12, plane: 0.16, crape: 0.075, peach: 0.075, crabapple: 0.075 };
const FLY = 2.6;        // extra down-wind drift of the wind-borne share
const PETALS = ['#F2B6C6', '#FFD9E2', '#ffffff', '#f29bb4', '#fbdde4'].map((h) => new THREE.Color(h));


export function createFalling(ctx, S) {
  const { rng, env } = ctx;
  const { hash2 } = rng;
  const MAX = Math.ceil(BASE_MAX * ctx.quality.particles * 1.3);

  const uAmount = { value: 1 }, uDripCol = { value: new THREE.Color(0.6, 0.63, 0.64) };
  const mat = new THREE.MeshStandardMaterial({ map: S.tex.falling, alphaTest: 0.5, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'life:falling';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: S.U.uTime, uWind: S.U.uWind, uWindBase: S.U.uWindBase, uGust: S.U.uGust, uAmount, uSunDir: S.U.uSunDir, uSunCol: S.U.uSunCol, uDripCol });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute vec4 iA;   // start x, y, z, fall height
        attribute vec4 iB;   // seed a, seed b, fall speed, size
        attribute vec4 iC;   // colour, kind + 8 * gust-only + 16 * wind-borne
        uniform float uTime, uGust, uAmount; uniform vec3 uWind, uWindBase;
        varying vec3 vTint; varying float vDrip;`)
      .replace('#include <uv_vertex>', /* glsl */ `#include <uv_vertex>
        float pKind = mod( iC.w, 8.0 ), pBurst = step( 7.5, mod( iC.w, 16.0 ) ), pFly = step( 15.5, iC.w );
        float pDrip = step( 3.5, pKind ), pPetal = step( 2.5, pKind ) * ( 1.0 - pDrip );
        vMapUv = vec2( ( pKind + uv.x ) * 0.125, uv.y );
        float pT = iA.w / iB.z;                                  // seconds from canopy to ground
        float pPeriod = pT * ( 1.0 + pDrip * ( 0.3 + 1.1 * iB.y ) );  // drips fall fast, then wait
        float pU = fract( uTime / pPeriod + iB.x ) * pPeriod / pT;
        float pLive = step( pU, 1.0 );
        pU = min( pU, 1.0 );
        float pEl = pU * pT;
        vec3 pPos = iA.xyz - vec3( 0.0, pU * iA.w, 0.0 );
        float pSpin = ( iB.y < 0.5 ? 1.0 : -1.0 ) * ( 0.8 + 1.3 * fract( iB.y * 7.3 ) );
        float pAng = uTime * pSpin + iB.x * 40.0;
        float pOpen = smoothstep( 0.0, 0.18, pU );
        float pRad = ( 0.3 + 0.75 * fract( iB.x * 13.7 ) ) * pOpen * ( 1.0 - pDrip );
        pPos.xz += pRad * vec2( cos( pAng ), sin( pAng ) );
        // steady drift down-wind, plus a shove while a gust passes
        pPos.xz += ( uWindBase.xz * pEl * 0.5 * ( 1.0 + ${FLY.toFixed(1)} * pFly ) + ( uWind.xz - uWindBase.xz ) * ( 1.2 + 2.2 * pU ) * pOpen ) * ( 1.0 - pDrip );
        vec2 pSide = vec2( - uWindBase.z, uWindBase.x ) / max( length( uWindBase.xz ), 1e-3 );
        pPos.xz += pSide * sin( uTime * 2.6 + iB.x * 31.0 ) * 0.34 * pPetal * pOpen;
        pPos.y += sin( uTime * 3.3 + iB.y * 17.0 ) * 0.05 * pOpen * ( 1.0 - pDrip );
        // tumbling frame
        float pTum = uTime * ( 1.6 + 3.2 * fract( iB.x * 5.1 ) ) + iB.y * 50.0;
        vec3 pAx = normalize( vec3( sin( iB.x * 44.0 ), 0.35, cos( iB.x * 44.0 ) ) );
        vec3 pE1 = normalize( cross( pAx, vec3( 0.0, 1.0, 0.0 ) ) );
        vec3 pE2 = cos( pTum ) * cross( pAx, pE1 ) + sin( pTum ) * pE1;
        pE1 = cos( pTum * 0.37 ) * pE1 + sin( pTum * 0.37 ) * pAx;
        pE2 = normalize( pE2 - pE1 * dot( pE1, pE2 ) );
        if ( pDrip > 0.5 ) {
          pE2 = vec3( 0.0, 1.0, 0.0 );
          // a thin streak facing the camera: the quad itself is the streak (its outline is cut in the fragment shader,
          // not read from the atlas, whose mips would erase anything this narrow); only slightly widened with distance,
          // so far drops thin out and vanish instead of growing into sticks
          pE1 = normalize( cross( pE2, pPos - cameraPosition ) ) * 0.075 * clamp( length( pPos - cameraPosition ) * 0.14, 1.0, 2.0 );
        }
        float pFade = smoothstep( 0.0, 0.05, pU ) * ( 1.0 - smoothstep( 0.975, 1.0, pU ) * ( 1.0 - pDrip ) );
        pFade *= 1.0 - smoothstep( ${(RANGE - 8).toFixed(1)}, ${RANGE.toFixed(1)}, length( pPos.xz - cameraPosition.xz ) );
        pFade *= mix( 1.0, smoothstep( 0.03, 0.3, uGust ), pBurst );
        pFade *= pLive * step( fract( iB.x * 91.7 ), uAmount );
        // drops are gone before they reach the ground (nothing may seem to stand on the road) and beyond a few metres
        pFade *= 1.0 - pDrip * max( smoothstep( 0.85, 1.0, pU ), smoothstep( 14.0, 24.0, length( pPos - cameraPosition ) ) );
        vec3 pNrm = normalize( cross( pE1, pE2 ) + vec3( 0.0, 1e-4, 0.0 ) );
        vec3 pVert = pPos + ( position.x * pE1 + position.y * pE2 ) * iB.w * pFade;
        vTint = iC.rgb; vDrip = pDrip;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = pNrm;')
      .replace('#include <begin_vertex>', 'vec3 transformed = pVert;')
      .replace('#include <project_vertex>', `#include <project_vertex>\nif ( pFade < 0.01 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint; varying float vDrip; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uDripCol;')
      .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
        diffuseColor.rgb *= vTint;
        if ( vDrip > 0.5 ) {
          // water is see-through: a screen-door pattern keeps half of the streak (still on the alpha-test path), and the
          // drop takes no direct light, it only carries the colour of the air around it
          vec2 dq = vec2( fract( vMapUv.x * 8.0 ) - 0.5, vMapUv.y - 0.5 ) * 2.0;
          if ( dot( dq, dq ) > 1.0 || mod( gl_FragCoord.x + gl_FragCoord.y, 2.0 ) < 1.0 ) discard;
          diffuseColor = vec4( 0.0, 0.0, 0.0, 1.0 );
        }`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
        {
          // thin leaves glow when the sun is behind them; drops just catch the sky
          vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
          float lBack = max( dot( - normal, sunV ), 0.0 );
          // (a leaf in the air also catches far more sky than the carpet under it: a small constant lift keeps it legible
          // in front of the litter)
          totalEmissiveRadiance += diffuseColor.rgb * uSunCol * ( 0.15 + 0.3 * lBack ) * ( 1.0 - vDrip ) + uDripCol * vDrip;
        }`);
  };
  mat.customProgramCacheKey = () => 'life:falling:v8';

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const A = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), Bq = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), C = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  for (const a of [A, Bq, C]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iA', A); geo.setAttribute('iB', Bq); geo.setAttribute('iC', C);
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'life:falling'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  S.group.add(mesh);

  let mode = '', bx = 1e9, bz = 1e9, dirty = true, wasBlending = false;
  const near = [], order = [], col = new THREE.Color(), P = {};
  let dist = new Float32Array(256);
  const byDist = (a, b) => dist[a] - dist[b] || near[a].id - near[b].id;
  function bind(px, pz) {
    const M = MODES[mode];
    geo.instanceCount = 0;
    if (!M) return;
    near.length = 0; order.length = 0;
    S.treesWithin(px, pz, M.range, near);
    // nearest trees first (MAP.trees is shared read-only data: distances live in a side array)
    if (dist.length < near.length) dist = new Float32Array(near.length * 2);
    let want = 0;
    for (let i = 0; i < near.length; i++) {
      const t = near[i], w = M.weight[t.species];
      if (!w) continue;
      dist[i] = (t.x - px) ** 2 + (t.z - pz) ** 2; order.push(i);
      want += M.per * w * (t.street ? 1 : 0.8);
    }
    order.sort(byDist);
    const cap = Math.min(MAX, Math.ceil(M.base * ctx.quality.particles * 1.3));
    // when the budget is short thin every tree a little before dropping the far ones
    const thin = Math.min(1, Math.max(0.55, cap / Math.max(1, want)));
    const fol = env.target.foliage;
    const ws = env.target.windStrength, wx = ctx.wind.dir.x * ws, wz = ctx.wind.dir.z * ws;
    let n = 0;
    for (const i of order) {
      const t = near[i], w = M.weight[t.species];
      const cnt = Math.max(1, Math.round(M.per * w * (t.street ? 1 : 0.8) * thin));
      // where the carriageway is, seen from a street tree
      let cx = 0, cz = 0, tx = 0, tz = 0, sp = 0;
      const st = t.street && M.road > 0 ? ctx.map.streetById[t.street] : null;
      if (st) { ctx.world.pointAt(st, t.s, P); cx = P.x - t.x; cz = P.z - t.z; tx = P.tx; tz = P.tz; sp = st.spacing; }
      for (let j = 0; j < cnt && n < cap; j++, n++) {
        const h1 = hash2(t.id, j, 11), h2 = hash2(t.id, j, 23), h3 = hash2(t.id, j, 37), h4 = hash2(t.id, j, 53), h5 = hash2(t.id, j, 71), h6 = hash2(t.id, j, 89);
        const a = h1 * Math.PI * 2;
        let x, z, top, kind, size, speed, fly = 0;
        if (mode === 'drips') {
          const r = t.r * 0.95 * Math.sqrt(h2);
          x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
          top = t.h * (0.28 + 0.3 * h3); kind = 4; size = 0.13 + 0.08 * h4; speed = 4.4 + 2.2 * h5; col.setRGB(1, 1, 1);
        } else {
          const petal = mode === 'petals';
          if (st && h6 < M.road) {
            // let go over the road: anywhere between the trunk and a little past the centre line, along the tree's run
            const k = 0.2 + 1.0 * h2, along = (h1 - 0.5) * sp * 1.1, r = 0.6 * h3;
            x = t.x + cx * k + tx * along + Math.cos(a * 7) * r; z = t.z + cz * k + tz * along + Math.sin(a * 7) * r;
            top = t.h * (0.72 + 0.28 * h3) + (petal ? 0.9 : 0.3);
          } else {
            // from the crown: leaves mostly from its rim, petals blown well clear of it
            const r = t.r * (petal ? 0.3 + 1.9 * Math.sqrt(h2) : 0.35 + 0.8 * Math.sqrt(h2));
            x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
            top = t.h * (0.42 + 0.4 * h3) + (petal ? 1.2 * h2 : 0);        // from the lower crown: most of the fall is in the open
          }
          if (petal) { kind = 3; size = 0.11 + 0.05 * h4; speed = 0.45 + 0.4 * h5; col.copy(PETALS[Math.floor(h1 * 977) % PETALS.length]); }
          else { kind = LEAF_KIND[t.species]; size = LEAF_SIZE[t.species] * (0.85 + 0.35 * h4); speed = 0.6 + 0.4 * h5; col.copy(fol[t.species][Math.floor(h4 * 4) % 4]).multiplyScalar(1.05); }
          if (hash2(t.id, j, 97) < M.fly) {
            // wind-borne: starts up-wind so that its long slant crosses the spot it was aimed at
            fly = 16;
            const half = (top / speed) * 0.5 * (1 + FLY) * (0.25 + 0.6 * hash2(t.id, j, 101));
            x -= wx * half; z -= wz * half;
          }
        }
        const burst = mode !== 'drips' && !fly && j % 4 === 3 ? 8 : 0;
        A.setXYZW(n, x, t.y + top, z, Math.max(0.5, top - 0.04));
        Bq.setXYZW(n, h4 * 0.999 + 0.0005, h5, speed, size);
        C.setXYZW(n, col.r, col.g, col.b, kind + burst + fly);
      }
      if (n >= cap) break;
    }
    geo.instanceCount = n;
    A.needsUpdate = Bq.needsUpdate = C.needsUpdate = true;
    A.clearUpdateRanges?.(); Bq.clearUpdateRanges?.(); C.clearUpdateRanges?.();
  }

  return {
    get count() { return geo.instanceCount; },
    onPreset() { dirty = true; },
    update() {
      const cur = env.current, p = ctx.player.pos;
      if (cur.particles !== mode) { mode = cur.particles; dirty = true; }
      if (wasBlending && !env.transitioning) dirty = true;      // the wind has settled: re-aim the wind-borne share
      wasBlending = env.transitioning;
      if (dirty || (p.x - bx) ** 2 + (p.z - bz) ** 2 > 9) { bind(p.x, p.z); bx = p.x; bz = p.z; dirty = false; }
      const switching = env.transitioning && env.prev.particles !== env.target.particles;
      // the fog preset asks for a sparse amount; drips are few to begin with, so do not thin them twice
      uAmount.value = Math.min(1, cur.particleAmount * (mode === 'drips' ? 2.2 : 1)) * (switching ? Math.abs(2 * env.blend - 1) : 1);
      // a drop is a little lighter than the fog behind it, never a white light of its own
      uDripCol.value.copy(cur.fogColor).multiplyScalar(0.72);
      mesh.visible = geo.instanceCount > 0 && uAmount.value > 0.003;
    },
    dispose() { S.group.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
