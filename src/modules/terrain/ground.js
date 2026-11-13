// Near ground: a heightfield over RECT on a quality.terrainStep grid, split into 4 x 4 chunks for culling, drawn with
// one patched MeshStandardMaterial that blends lawn / garden / bare earth / gravel / sand / reef rock from the baked
// control map plus world-space detail textures. Lawn colour is a live uniform.
import * as THREE from 'three';
import { RECT, buildControlMap, buildRockTextures, buildMacroTexture } from './textures.js';
import { patchMaterial, streetTools } from './util.js';

const FRAG_HEAD = /* glsl */ `
varying vec3 vTP;
uniform sampler2D uCtl, uMacro, uGrass, uGrassN, uSand, uSandN, uRock, uRockN;
uniform vec4 uCtlRect;
uniform vec3 uLawn, uGravel, uRockA, uRockB, uRockC, uAlgae;
uniform float uWet;
float tRough;
vec2 tNm;
const mat2 ROT = mat2( 0.7986, -0.6018, 0.6018, 0.7986 );
float tHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float tVnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( tHash( i ), tHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( tHash( i + vec2( 0.0, 1.0 ) ), tHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// Jointed granite: courses of big slabs (about 3.6 x 2.1 m, offset per course), each split up to three times along its
// longer side at a random place, so neighbouring blocks differ several-fold in size and no course line runs far.
// Leaves the distance to the nearest joint (metres), the direction towards it (block frame) and a per-block id.
const mat2 BROT = mat2( 0.921, -0.389, 0.389, 0.921 );
float tBlockD;
vec2 tBlockDir, tBlockId;
void tBlocks( vec2 p ) {
  vec2 sz = vec2( 3.6, 2.1 );
  vec2 q = p / sz;
  float row = floor( q.y );
  q.x += tHash( vec2( row, 3.7 ) );
  vec2 id = vec2( floor( q.x ), row );
  vec2 f = fract( q );
  for ( int i = 0; i < 3; i ++ ) {
    float h = tHash( id + 2.9 ), c = 0.3 + 0.4 * tHash( id + 5.3 );
    if ( h > 0.84 - 0.1 * float( i ) ) break;                                // some slabs stay whole
    if ( sz.x > sz.y * ( 0.8 + 0.7 * tHash( id + 7.7 ) ) ) {
      if ( f.x < c ) { f.x /= c; sz.x *= c; id += vec2( 0.31, 0.17 ); } else { f.x = ( f.x - c ) / ( 1.0 - c ); sz.x *= 1.0 - c; id += vec2( 0.67, 0.43 ); }
    } else {
      if ( f.y < c ) { f.y /= c; sz.y *= c; id += vec2( 0.13, 0.71 ); } else { f.y = ( f.y - c ) / ( 1.0 - c ); sz.y *= 1.0 - c; id += vec2( 0.57, 0.29 ); }
    }
  }
  vec2 d = min( f, 1.0 - f ) * sz;
  tBlockD = min( d.x, d.y );
  tBlockDir = d.x < d.y ? vec2( sign( f.x - 0.5 ), 0.0 ) : vec2( 0.0, sign( f.y - 0.5 ) );
  tBlockId = id;
}
`;

const FRAG_MAP = /* glsl */ `
{
  vec2 wp = vTP.xz;
  float hgt = vTP.y;
  vec4 ctl = texture2D( uCtl, ( wp - uCtlRect.xy ) * uCtlRect.zw );
  vec3 mac = texture2D( uMacro, wp / 113.0 ).rgb;
  vec3 mic = texture2D( uMacro, wp.yx / 19.0 + vec2( 0.37, 0.11 ) ).rgb;
  vec3 mac2 = texture2D( uMacro, ( ROT * wp ) / 271.0 ).rgb;
  float dist = length( vViewPosition );
  float nearF = 1.0 - smoothstep( 16.0, 70.0, dist );       // tiling detail fades into its mean with distance
  float midF = 1.0 - 0.75 * smoothstep( 50.0, 200.0, dist );

  // reef granite detail (linear mean of the map is about 0.23; joints and crevices are much darker)
  vec3 rk = texture2D( uRock, wp / 7.0 ).rgb;
  float rkv = mix( 0.23, rk.r, 0.3 + 0.7 * midF );

  float shore = smoothstep( 0.42, 0.58, ctl.r );
  // sand lies over the rock: a crisp, patchy edge, and it fills the low joints first
  float sandW = shore * smoothstep( 0.46, 0.54, ctl.g + ( mic.r - 0.5 ) * 0.4 + ( mac.b - 0.5 ) * 0.3 + ( 0.23 - rk.r ) * 0.7 * nearF );
  float rockW = shore - sandW;
  float lawnW = smoothstep( 0.38, 0.62, ctl.b + ( mic.g - 0.5 ) * 0.45 + ( mac.r - 0.5 ) * 0.2 );
  float gravW = smoothstep( 0.36, 0.6, ctl.a + ( mic.b - 0.5 ) * 0.22 ) * ( 1.0 - shore );
  float earthW = ctl.g * ( 1.0 - smoothstep( 0.0, 0.25, ctl.r ) ) * 1.1 + smoothstep( 0.56, 0.72, mac.b * 0.55 + mic.r * 0.45 ) * 0.7;
  earthW = clamp( earthW, 0.0, 1.0 ) * ( 1.0 - lawnW );

  // --- inland: lawn, garden ground, bare earth, gravel
  vec3 g1 = texture2D( uGrass, wp / 2.5 ).rgb;
  float g2 = texture2D( uGrass, ( ROT * wp ) / 6.3 + 0.23 ).g;
  vec3 gT = mix( vec3( 0.49 ), g1, 0.3 + 0.7 * nearF ) * ( 0.5 + mix( 0.49, g2, midF ) ) * 1.85;
  vec3 lawnC = uLawn * gT * ( 0.72 + 0.26 * mac.g + 0.26 * mac2.r );
  vec3 gardC = uLawn * vec3( 0.62, 0.68, 0.52 ) * gT * ( 0.62 + 0.3 * mac.r + 0.3 * mac2.g );
  float nearS = 1.0 - smoothstep( 8.0, 42.0, dist );
  vec3 sd = mix( vec3( 0.70, 0.57, 0.31 ), texture2D( uSand, wp / 3.0 ).rgb, 0.2 + 0.8 * nearS );
  float grain = dot( sd, vec3( 0.45 ) );
  float rfm = texture2D( uMacro, wp.yx / 2.3 + 0.19 ).g;                   // fine mottling without the joint pattern (a second, smaller copy of the joints reads as floor tiles)
  float rfine = mix( 0.23, rfm * rfm * 0.85, 0.3 + 0.7 * nearF );
  vec3 earthC = vec3( 0.115, 0.08, 0.05 ) * ( 0.55 + 0.65 * grain ) * ( 0.75 + 0.5 * mic.g );
  // gravel: two scales of procedural stones (texture noise is too soft for grit), darker and dirtier towards the edge
  float gFade = 1.0 - smoothstep( 5.0, 24.0, dist );
  float stones = mix( 0.5, smoothstep( 0.2, 0.8, tVnoise( wp * 41.0 ) * 0.55 + tVnoise( ROT * wp * 97.0 ) * 0.45 ), gFade );
  vec3 gravC = uGravel * ( 0.58 + 0.5 * stones ) * ( 0.86 + 0.14 * mic.r + 0.14 * mac.g ) * mix( 0.7, 1.0, smoothstep( 0.55, 0.97, ctl.a ) );
  vec3 inland = mix( mix( gardC, earthC, earthW ), lawnC, lawnW );
  inland = mix( inland, gravC, gravW );

  // --- sand: dry above, a darker smoother wet band along the waterline
  float wetW = 1.0 - smoothstep( 0.22, 0.6, hgt + ( mic.r - 0.5 ) * 0.18 );
  float dampW = ( 1.0 - smoothstep( 0.5, 1.15, hgt + ( mac.g - 0.5 ) * 0.4 ) ) * 0.45;
  // kept below the tone-mapper's shoulder so that a shadow on dry sand reads as a darker sand, not as a pale hole
  vec3 sandC = sd * vec3( 1.04, 0.98, 0.98 ) * ( 0.79 + 0.14 * mic.g + 0.1 * mac2.b );
  sandC *= mix( vec3( 1.0 ), vec3( 0.6, 0.6, 0.54 ), max( wetW, dampW ) );
  sandC *= mix( 1.0, 0.8, smoothstep( 0.0, -3.0, hgt ) );

  // --- reef: fractured red-brown granite in jointed blocks, salt-bleached tops, barnacles, then a wet greenish-black
  //     algae band at the tide line
  vec2 fwv = fwidth( wp );
  float fw = max( fwv.x, fwv.y );                                           // metres per pixel
  float cellVis = clamp( 0.45 / ( fw + 0.001 ), 0.0, 1.0 ), jointVis = clamp( 0.11 / ( fw + 0.001 ), 0.0, 1.0 );
  // Joints wander (a metre-scale warp, so no edge is ruler-straight) and their trend swings over tens of metres. They
  // open only in patches: elsewhere the rock stays massive, with faint tone steps. An even lattice of dark joints reads
  // as crazy paving from every distance.
  float jGate = smoothstep( 0.4, 0.66, tVnoise( wp * 0.17 + 7.3 ) * 0.62 + tVnoise( ROT * wp * 0.43 + 2.1 ) * 0.38 );
  cellVis *= 0.34 + 0.66 * jGate; jointVis *= 0.1 + 0.9 * jGate;
  vec2 jWarp = vec2( tVnoise( wp * 0.41 ), tVnoise( wp * 0.41 + 31.7 ) ) - 0.5;
  tBlocks( BROT * wp + jWarp * 1.5 + ( mic.rg - 0.5 ) * 0.3 + ( mac.gb - 0.5 ) * 1.3 + ( mac2.rb - 0.5 ) * 3.5 );   // (a 7 m swing bent the joints into wood-grain arcs)
  float bh1 = tHash( tBlockId + 1.7 ), bh2 = tHash( tBlockId + 4.1 ), bh3 = tHash( tBlockId + 8.3 );
  float jw = 0.022 + 0.03 * bh3;                                            // half width of the open joint: 4 to 10 cm across
  float joint = ( 1.0 - smoothstep( jw, jw + 0.015 + fw, tBlockD ) ) * jointVis;
  float bevel = ( 1.0 - smoothstep( 0.0, 0.11, tBlockD - jw ) ) * jointVis;  // weathered arris
  // slabs step down towards the sea: the landward edge of a block lies in the shade of the riser above it
  float foot = ( 1.0 - smoothstep( 0.0, 0.32, tBlockD - jw ) ) * max( - dot( tBlockDir * BROT, vec2( 0.35, 0.94 ) ), 0.0 ) * cellVis * ( 0.4 + 0.6 * bh1 );
  float tone = mac.r * 0.5 + mic.b * 0.5 + ( bh2 - 0.5 ) * 0.36 * cellVis;
  vec3 rc = mix( uRockA, uRockB, smoothstep( 0.35, 0.6, tone ) );
  rc = mix( rc, uRockC, smoothstep( 0.55, 0.85, mac.g * 0.6 + mic.r * 0.4 + ( bh3 - 0.5 ) * 0.3 * cellVis ) * 0.7 );
  float cav = smoothstep( 0.3, 0.7, mac.b * 0.5 + mic.g * 0.5 );
  vec3 rockC = mix( rc, vec3( dot( rc, vec3( 0.333 ) ) ), 0.1 ) * min( 0.42 + rkv * 2.4, 1.3 ) * ( 0.9 + rfine * 0.45 ) * ( 0.66 + 0.36 * mac2.g ) * ( 0.76 + 0.24 * cav );
  rockC *= ( 1.0 + ( bh1 - 0.5 ) * mix( 0.14, 0.26, clamp( 0.09 / ( fw + 0.001 ), 0.0, 1.0 ) ) * cellVis ) * ( 1.0 - 0.12 * bevel ) * ( 1.0 - 0.34 * foot );
  float bandN = ( mic.g - 0.5 ) * 0.35 + ( bh1 - 0.5 ) * 0.24 * cellVis;
  float alg = 1.0 - smoothstep( 0.78, 1.12, hgt + bandN );
  float wetR = 1.0 - smoothstep( 1.0, 1.8, hgt + bandN );                   // splash zone: darker, damp rock
  float salt = smoothstep( 1.5, 2.2, hgt + ( mic.r - 0.5 ) * 0.6 ) * ( 0.25 + 0.75 * bh2 ) * smoothstep( 0.1, 0.34, rfm ) * ( 1.0 - bevel );
  rockC = mix( rockC, vec3( dot( rockC, vec3( 0.4 ) ) ) * vec3( 1.1, 1.04, 0.93 ), 0.55 * salt ) * ( 1.0 + 0.22 * salt );
  rockC *= mix( 1.0, 0.66, wetR );
  float barn = smoothstep( 0.6, 0.78, tVnoise( wp * 19.0 ) * 0.6 + tVnoise( ROT * wp * 47.0 ) * 0.4 + ( rfm - 0.3 ) * 0.5 ) * gFade
    * smoothstep( 0.8, 1.15, hgt + bandN ) * ( 1.0 - smoothstep( 1.35, 1.8, hgt + bandN ) );
  rockC = mix( rockC, vec3( 0.36, 0.34, 0.29 ), barn * 0.55 );
  vec3 algC = uAlgae * ( 0.6 + rfine * 2.2 ) * mix( vec3( 1.0 ), vec3( 0.8, 1.35, 0.6 ), smoothstep( 0.35, 0.65, mic.b ) * 0.7 ) * ( 1.0 + ( bh1 - 0.5 ) * 0.5 * cellVis );
  rockC = mix( rockC, algC, alg * 0.9 );
  rockC *= 1.0 - 0.62 * joint;

  vec3 col = mix( inland, sandC, sandW );
  col = mix( col, rockC, rockW );
  col *= 1.0 - 0.12 * uWet;
  diffuseColor.rgb = col;

  float sandR = mix( 0.96, 0.38, wetW );
  float rockR = mix( mix( 0.9, 0.62, wetR ), 0.36, alg ) + 0.3 * joint;
  tRough = mix( mix( 0.95 - 0.1 * uWet, sandR, sandW ), rockR, rockW );

  vec2 nG = texture2D( uGrassN, wp / 2.5 ).xy - 0.5;
  vec2 nS = texture2D( uSandN, wp / 3.0 ).xy - 0.5;
  vec2 nR = texture2D( uRockN, wp / 7.0 ).xy - 0.5 + ( texture2D( uGrassN, ( ROT * wp ) / 1.7 ).xy - 0.5 ) * 0.5;
  float ripple = smoothstep( 0.4, 0.7, mac.r * 0.6 + mic.b * 0.4 ) * ( 1.0 - wetW * 0.8 );
  vec2 nV = ( texture2D( uGrassN, wp.yx / 0.9 ).xy - 0.5 ) * 1.5 * nearF;
  // per-block tilt and a rounded edge falling into each joint: the low sun picks every block out
  vec2 bN = ( ( vec2( bh2, bh3 ) - 0.5 ) * 0.42 * cellVis + tBlockDir * bevel * 0.3 ) * BROT;
  nR = nR * ( 0.65 + 1.0 * nearF ) * ( 1.0 - 0.5 * alg ) + vec2( bN.x, - bN.y );
  tNm = mix( mix( mix( nG * 1.3 * nearF, nV, gravW ), nS * ( 0.2 + 0.6 * ripple ) * nearS, sandW ), nR, rockW );
}
`;

const FRAG_NORMAL = /* glsl */ `
normal = normalize( normal + ( viewMatrix * vec4( tNm.x, 0.0, - tNm.y, 0.0 ) ).xyz * 2.0 );
`;

export function buildGround(ctx, group, corridors) {
  const { world, map: MAP, quality, tex } = ctx;
  const step = quality.terrainStep || 2;
  const nx = Math.round((RECT.x1 - RECT.x0) / step), nz = Math.round((RECT.z1 - RECT.z0) / step);
  const dx = (RECT.x1 - RECT.x0) / nx, dz = (RECT.z1 - RECT.z0) / nz;
  const W = nx + 1, Hn = nz + 1;
  const steps = MAP.promenade.steps, info = {}, ns = {};
  const { smoothstep, lerp } = ctx.rng;
  const T = streetTools(ctx);

  // heightAt with the seawall resolved for a coarse grid: the mesh passes UNDER the promenade paving and meets the
  // sand at the foot of the wall (the wall, paving and stairs are separate meshes).
  function shaped(x, z) {
    const h = world.heightAt(x, z);
    world.backInfo(x, z, info);
    const b = info.b, px = info.x, pz = info.z;
    if (px >= 70 || px <= -299 || b >= 2.3 || b < -7.4) return h;
    const fade = smoothstep(70, 68, px);
    if (b > -0.4) return h - 0.3 * fade;
    // under a flight of beach steps (frames from core, MAP.promenade.steps): stay at the level of the sand at its foot,
    // the steps and cheek walls are their own closed meshes
    for (const s of steps) {
      const ex = x - s.x, ez = z - s.z, u = ex * s.fx + ez * s.fz, w = ex * s.fz - ez * s.fx;
      if (u > 2.0 && u < s.d1 + 0.3 && Math.abs(w) < s.hw + 0.4) return Math.min(h, 1.45);
    }
    let nearStep = false;
    for (const s of steps) if (Math.hypot(px - s.x, pz - s.z) < 2.9) nearStep = true;
    const e = -b - 2.5, reach = nearStep ? 4.3 : 0.75;
    if (e > reach) return h;
    const d = Math.hypot(x - px, z - pz) || 1, tgt = 2.5 + reach;
    const hf = world.heightAt(px + ((x - px) / d) * tgt, pz + ((z - pz) / d) * tgt) - (nearStep ? 0.12 : 0);
    return lerp(h, Math.min(h, hf), fade);
  }

  const H0 = new Float32Array(W * Hn), Y = new Float32Array(W * Hn);
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
    const x = RECT.x0 + i * dx, z = RECT.z0 + j * dz, k = j * W + i;
    const h = shaped(x, z);
    H0[k] = h;
    let drop = 0;
    if (h > 3.4) {
      const st = world.nearestStreet(x, z, ns);
      if (st && st.d < st.street.wallOff + 0.35) drop = 0.12 * smoothstep(14, 26, T.openDist(st.street, st.s)); // run-off ends dive under the ground
      else for (const c of corridors) { if (world.distToLine(c.line, x, z, c.half + 1).d < c.half + 0.45) { drop = 0.12; break; } }
    }
    Y[k] = h - drop;
  }
  // shading normals come from the undepressed surface so road corridors leave no crease in the gardens
  const NRM = new Float32Array(W * Hn * 3);
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
    const il = Math.max(0, i - 1), ir = Math.min(nx, i + 1), ju = Math.max(0, j - 1), jd = Math.min(nz, j + 1);
    const sxv = (H0[j * W + ir] - H0[j * W + il]) / ((ir - il) * dx), szv = (H0[jd * W + i] - H0[ju * W + i]) / ((jd - ju) * dz);
    const l = Math.hypot(sxv, 1, szv), k = (j * W + i) * 3;
    NRM[k] = -sxv / l; NRM[k + 1] = 1 / l; NRM[k + 2] = -szv / l;
  }

  // ---- material ------------------------------------------------------------------------------------------------------
  const ctl = buildControlMap(ctx), rock = buildRockTextures(ctx), macro = buildMacroTexture(ctx);
  const grass = tex.get('grass'), sand = tex.get('sand');
  const C = (hex) => new THREE.Color(hex);
  const uniforms = {
    uCtl: { value: ctl }, uMacro: { value: macro },
    uGrass: { value: grass.map }, uGrassN: { value: grass.normalMap },
    uSand: { value: sand.map }, uSandN: { value: sand.normalMap },
    uRock: { value: rock.map }, uRockN: { value: rock.normalMap },
    uCtlRect: { value: new THREE.Vector4(RECT.x0, RECT.z0, 1 / (RECT.x1 - RECT.x0), 1 / (RECT.z1 - RECT.z0)) },
    uLawn: { value: ctx.env.current.lawn.clone() },
    uGravel: { value: C('#c9b999') },
    uRockA: { value: C('#7d5644') }, uRockB: { value: C('#96684c') }, uRockC: { value: C('#b08a62') }, uAlgae: { value: C('#20241b') },
    uWet: { value: 0 },
  };
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }), 'badaguan-terrain-ground', uniforms, (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL);
  });
  mat.name = 'terrain-ground';

  // ---- chunks --------------------------------------------------------------------------------------------------------
  const geos = [], CH = 4;
  for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
    const i0 = Math.floor((nx * ci) / CH), i1 = Math.floor((nx * (ci + 1)) / CH), j0 = Math.floor((nz * cj) / CH), j1 = Math.floor((nz * (cj + 1)) / CH);
    const w = i1 - i0 + 1, h = j1 - j0 + 1;
    const pos = new Float32Array(w * h * 3), nor = new Float32Array(w * h * 3);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 3, g = (j + j0) * W + (i + i0);
      pos[k] = RECT.x0 + (i + i0) * dx; pos[k + 1] = Y[g]; pos[k + 2] = RECT.z0 + (j + j0) * dz;
      nor[k] = NRM[g * 3]; nor[k + 1] = NRM[g * 3 + 1]; nor[k + 2] = NRM[g * 3 + 2];
    }
    const idx = new (w * h > 65535 ? Uint32Array : Uint16Array)((w - 1) * (h - 1) * 6);
    let o = 0;
    for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      // split along the diagonal that is flatter (keeps the seawall foot and reef lumps from saw-toothing)
      if (Math.abs(pos[a * 3 + 1] - pos[d * 3 + 1]) < Math.abs(pos[b * 3 + 1] - pos[c * 3 + 1])) { idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b; }
      else { idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `terrain-ground-${ci}${cj}`;
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    group.add(mesh);
    geos.push(geo);
  }

  // perimeter (for the far field's seam skirt), in order around the rectangle
  const edge = [];
  for (let i = 0; i <= nx; i++) edge.push([RECT.x0 + i * dx, Y[i], RECT.z0]);
  for (let j = 1; j <= nz; j++) edge.push([RECT.x1, Y[j * W + nx], RECT.z0 + j * dz]);
  for (let i = nx - 1; i >= 0; i--) edge.push([RECT.x0 + i * dx, Y[nz * W + i], RECT.z1]);
  for (let j = nz - 1; j >= 0; j--) edge.push([RECT.x0, Y[j * W], RECT.z0 + j * dz]);

  return {
    uniforms, edge, triangles: nx * nz * 2,
    dispose() { for (const g of geos) g.dispose(); mat.dispose(); ctl.dispose(); rock.map.dispose(); rock.normalMap.dispose(); macro.dispose(); },
  };
}
