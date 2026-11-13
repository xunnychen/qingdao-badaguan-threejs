// Foliage, trunk and shadow-depth materials. One foliage material serves every species: the colour comes from a palette
// uniform (9 species x 4 tones + 9 trunk colours) indexed by a per-vertex attribute, so presets cross-fade for free.
// makeLeaf / makeTrunk build extra instances that share the compiled program but own a `uFade` uniform: the forest uses
// them for the short dithered cross-fade when a cell changes level of detail.
import * as THREE from 'three';
import { ATLAS_N } from './atlas.js';

// 36 foliage + 9 flat trunk colours (mid / far LOD) + 3 spare + 4 alternate foliage (海棠 leaves and fruit out of bloom)
export const PALETTE_N = 52;
export const ALT = 48;
export const FILL_N = 13;

const WIND_PARS = /* glsl */ `
uniform float uTime; uniform vec3 uWind; uniform float uGust;
vec3 treeSway( float phase, float amount ) {
  float s = sin( uTime * 1.1 + phase ) * 0.6 + sin( uTime * 2.3 + phase * 1.7 ) * 0.3 + 0.5;
  return uWind * ( s * amount );
}
vec3 leafFlutter( vec3 p, float phase, float amp ) {
  float f1 = sin( uTime * 5.3 + phase * 3.0 + p.x * 2.9 + p.y * 2.1 + p.z * 2.3 );
  float f2 = sin( uTime * 3.1 + phase + p.y * 1.7 + p.x * 1.3 + p.z * 0.9 );
  return ( normalize( uWind + vec3( 1e-4 ) ) * f1 + vec3( 0.0, 0.6, 0.0 ) * f2 ) * amp * ( 0.35 + length( uWind ) );
}`;

const LEAF_VERT_PARS = /* glsl */ `
attribute vec4 aData;   // palette index, brightness, per-card hash, sway amount
attribute vec4 aFx;     // phase, flutter, transmission, back-face sun blocking (< 0: solid surface, no card treatment)
uniform float uFill[ ${FILL_N} ];
${WIND_PARS}`;

const LEAF_VERT_MOVE = /* glsl */ `
int tIdx = int( aData.x + 0.5 );
float tKill = aData.z > uFill[ tIdx / 4 ] ? 1.0 : 0.0;
transformed += treeSway( aFx.x, aData.w ) + leafFlutter( position, aFx.x, aFx.y );`;

const KILL = /* glsl */ `
if ( tKill > 0.5 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );`;

// screen-door cross-fade: uFade 1 = solid, 0..1 = fading in, -1..0 = fading out with the complementary pattern
const FADE_PARS = /* glsl */ `
uniform float uFade;
float treeDither( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }`;
const FADE = /* glsl */ `
if ( uFade < 0.999 ) {
  float tDn = treeDither( gl_FragCoord.xy );
  if ( uFade >= 0.0 ? tDn > uFade : tDn <= 1.0 + uFade ) discard;
}`;

// Sun gaps in the shadow of the cedars (雪松, palette slots 12..15). Rows of tiered conifers stack a dozen cards along
// every sun ray, so their summed shadow is a solid slab however ragged each card is: 紫荆关路 went flat and unlit. Real
// boughs leave shafts. The depth pass therefore drops every cedar fragment whose SUN RAY (identified by where it meets
// the plane y = 0, the same for every card along the ray) falls in a patch of a 2-octave noise: about a fifth of the
// sun reaches the road as pools and flecks, and lights the boughs and trunks it passes on the way down.
const GAP_VERT = /* glsl */ `
vGap = vec3( transformed.xz - uSunDir.xz * ( transformed.y / max( uSunDir.y, 0.04 ) ), ( tIdx >= 12 && tIdx < 16 ) ? 1.0 : 0.0 );`;
const GAP_PARS = /* glsl */ `
varying vec3 vGap; uniform float uGap;
float gapHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float gapNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gapHash( i ), gapHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gapHash( i + vec2( 0.0, 1.0 ) ), gapHash( i + 1.0 ), f.x ), f.y );
}`;
const GAP_FRAG = /* glsl */ `
if ( vGap.z > 0.5 && gapNoise( vGap.xy * 0.25 ) * 0.64 + gapNoise( vGap.xy * 0.7 + 17.3 ) * 0.36 > uGap ) discard;`;

// the direct-light loops for the sun (cascaded SunLight or plain DirectionalLight): remember the shadowed sun colour so
// the transmission term can be masked by the same shadow
function sunTapChunk() {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  let at = src.indexOf('#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )');
  if (at < 0) at = src.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  if (at < 0) return src;
  const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  return src.slice(0, at) + src.slice(at).split(call).join(`directLight.color *= treeGraze;\n\t\ttreeSunLit = max( treeSunLit, directLight.color );\n\t\tdirectLight.color *= treeBack;\n\t\t${call}`);
}

export function createTreeMaterials(ctx, atlas, planeBark) {
  const wind = ctx.wind.uniforms;
  const U = {
    uPalette: { value: new Float32Array(PALETTE_N * 3) },
    uFill: { value: new Float32Array(FILL_N).fill(1) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(0, 0, 0) },      // sun colour x intensity (linear), for the transmission floor
    uGain: { value: 1.15 },
    uGap: { value: 0.52 },                              // sun-gap threshold of the cedar shadow (lower = more sun through)
    uAtlas: { value: atlas.size },
    uPlaneMap: { value: planeBark },
    uFade: { value: 1 },
    uTime: wind.uTime, uWind: wind.uWind, uGust: wind.uGust,
  };
  const lightsChunk = sunTapChunk();
  const a2c = (ctx.quality.msaa || 0) > 0;
  const all = [];

  // ---- foliage --------------------------------------------------------------------------------------------------------
  function makeLeaf(fade = U.uFade) {
    const leaf = new THREE.MeshStandardMaterial({ map: atlas.texture, alphaTest: 0.34, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness: 0.84, metalness: 0 });
    leaf.name = 'trees:leaf';
    leaf.onBeforeCompile = (sh) => {
      for (const k of ['uPalette', 'uFill', 'uSunDir', 'uSunCol', 'uGain', 'uAtlas', 'uTime', 'uWind', 'uGust']) sh.uniforms[k] = U[k];
      sh.uniforms.uFade = fade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${LEAF_VERT_PARS}\nuniform vec3 uPalette[ ${PALETTE_N} ]; uniform float uGain;\nvarying vec3 vTint; varying vec3 vLeaf;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEAF_VERT_MOVE}\nbool tWood = tIdx >= 36 && tIdx < 48;\nvTint = uPalette[ tIdx ] * ( aData.y * ( tWood ? 1.0 : uGain ) );\nvLeaf = vec3( aFx.z, max( aFx.w, 0.0 ), ( tWood || aFx.w < 0.0 ) ? 1.0 : 0.0 );`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${KILL}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uAtlas;\nvarying vec3 vTint; varying vec3 vLeaf;\nvec3 treeSunLit = vec3( 0.0 );\nfloat treeBack = 1.0;\nfloat treeGraze = 1.0;\n${FADE_PARS}`)
        .replace('#include <map_fragment>', /* glsl */ `
          ${FADE}
          vec4 leafTex = texture2D( map, vMapUv );
          vec2 lgx = dFdx( vMapUv ), lgy = dFdy( vMapUv );
          float lmn = min( dot( lgx, lgx ), dot( lgy, lgy ) );
          // keep coverage at distance: alpha-tested mips thin out, so push alpha up with the mip level. The SMALLER
          // derivative is used so edge-on cards are not boosted into solid slivers.
          float leafLod = max( 0.0, 0.5 * log2( max( lmn * uAtlas * uAtlas, 1e-8 ) ) );
          float leafA = min( 1.0, leafTex.a * ( 1.0 + min( leafLod, 3.0 ) * 0.38 ) );
          // broadleaf and blossom clusters: eat the card away toward its border along a ragged, lobed outline, so no
          // straight quad edge survives where the leaf mask (or its boosted mips) runs out to the edge of the tile
          vec2 leafTl = vMapUv * ${ATLAS_N}.0;
          float leafTile = floor( leafTl.x ) + floor( leafTl.y ) * ${ATLAS_N}.0;
          if ( vLeaf.z < 0.5 && ( leafTile < 5.5 || ( leafTile > 10.5 && leafTile < 12.5 ) ) ) {
            vec2 lc = fract( leafTl ) * 2.0 - 1.0, lc2 = lc * lc;
            float lEdge = sqrt( sqrt( dot( lc2, lc2 ) ) ) + ( leafTex.g - 0.5 ) * 0.22
              + 0.07 * sin( atan( lc.y, lc.x ) * 5.0 + vTint.g * 90.0 ) + 0.04 * sin( atan( lc.y, lc.x ) * 11.0 + vTint.r * 70.0 );
            leafA *= smoothstep( 1.02, 0.8, lEdge );
          }
          // geometric normal (towards the viewer) and the sun, both in view space
          vec3 leafGn = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
          vec3 leafSunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
          if ( vLeaf.z < 0.5 ) {
            // cards seen edge-on vanish instead of drawing as lines
            leafA *= smoothstep( 0.1, 0.36, abs( dot( leafGn, normalize( vViewPosition ) ) ) );
            // a card edge-on to the sun gets little direct light (its bent normal would light it anyway, and the
            // shadow map sampled at a grazing angle would stripe it)
            treeGraze = 0.25 + 0.75 * smoothstep( 0.04, 0.3, abs( dot( leafGn, leafSunV ) ) );
          } else {
            // solid hull / flat trunk: faces turned from the sun get none (smoothed normals would otherwise show the
            // shadow map's grazing-angle stripes along the terminator)
            treeGraze = smoothstep( 0.0, 0.28, dot( leafGn, leafSunV ) );
          }
          diffuseColor.a *= leafA;
          diffuseColor.rgb *= leafTex.rgb * vTint;
          // the underside of a flat spray / pad gets no direct sun (only sky light and what comes through)
          // (it is seen against the bright sky, so it is lifted a little or the ceiling of a conifer avenue goes black)
          if ( ! gl_FrontFacing ) { treeBack = 1.0 - vLeaf.y; diffuseColor.rgb *= 1.0 + 0.3 * vLeaf.y; }`)
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
        .replace('#include <lights_fragment_begin>', lightsChunk)
        .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
          {
            // light coming through the leaves: strongest when looking toward the sun, stronger for a low sun, and masked
            // by the sun's shadow (treeSunLit is the shadowed sun colour)
            vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
            float lBack = max( dot( - normal, sunV ), 0.0 );
            // the underside of a flat conifer spray whose top is in the sun glows with what comes through it
            if ( ! gl_FrontFacing ) lBack = max( lBack, vLeaf.y * max( dot( normal, sunV ), 0.0 ) * 1.6 );
            float lView = 0.45 + 0.55 * pow( max( dot( - normalize( vViewPosition ), sunV ), 0.0 ), 1.5 );
            // (a sun on the horizon crosses the whole depth of a crown and several crowns behind it: far less comes
            // through, so against a sunset the trees are silhouettes with a bright rim, not lanterns)
            float lDay = smoothstep( 0.1, 0.4, uSunDir.y );
            float lLow = min( 1.0 + 1.5 * ( 1.0 - clamp( uSunDir.y, 0.0, 1.0 ) ), 2.0 ) * mix( 0.6, 1.0, lDay );
            // what comes through is more saturated than what bounces off
            vec3 lCol = diffuseColor.rgb * ( 0.4 + 0.6 * normalize( diffuseColor.rgb + 1e-4 ) * 1.732 );
            // leaves deeper in the crown still pass some of the light the outer ones scattered (the shadow map is all
            // or nothing): a floor under the shadow mask keeps a back-lit crown glowing instead of going brown
            vec3 lSun = max( treeSunLit, uSunCol * ( 0.3 * mix( 0.3, 1.0, lDay ) ) );
            totalEmissiveRadiance += lCol * lSun * ( vLeaf.x * lBack * lView * lLow * 0.5 );
          }`)
        .replace('vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;',
          'vec3 totalSpecular = ( reflectedLight.directSpecular + reflectedLight.indirectSpecular ) * 0.25;');
    };
    leaf.customProgramCacheKey = () => 'trees:leaf:v10';
    all.push(leaf);
    return leaf;
  }
  const leaf = makeLeaf();

  // ---- shadow depth for foliage (same vertex motion and leaf-fill thinning) -----------------------------------------------
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas.texture, alphaTest: 0.34, side: THREE.DoubleSide });
  depth.name = 'trees:leafDepth';
  depth.onBeforeCompile = (sh) => {
    for (const k of ['uFill', 'uSunDir', 'uTime', 'uWind', 'uGust', 'uGap']) sh.uniforms[k] = U[k];
    // casters are pushed 0.3 m away from the sun: a thin card (or the hull / trunk under its own proxy) then never
    // stripes itself with shadow acne, and the shadow on the ground does not visibly move
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LEAF_VERT_PARS}\nuniform vec3 uSunDir;\nvarying vec3 vGap;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEAF_VERT_MOVE}\ntransformed -= uSunDir * 0.3;\n${GAP_VERT}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${KILL}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GAP_PARS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${GAP_FRAG}`);
  };
  depth.customProgramCacheKey = () => 'trees:leafDepth:v5';
  all.push(depth);

  // ---- trunks (near LOD): shared furrowed bark tinted by vertex colour; plane trees get the camouflage bark ---------------
  // The shared bark tile stretches its furrows along V in a way that does not wrap: with plain repeat every metre of
  // trunk showed a ring where furrows and normals jump. Private clones (same image, no copy on the CPU) mirror in V.
  const barkSrc = ctx.tex.get('bark');
  const mirrorV = (t) => { const c = t.clone(); c.wrapT = THREE.MirroredRepeatWrapping; c.needsUpdate = true; return c; };
  const bark = { map: mirrorV(barkSrc.map), normalMap: mirrorV(barkSrc.normalMap) };
  function makeTrunk(fade = U.uFade) {
    const trunk = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, vertexColors: true, roughness: 0.94, metalness: 0 });
    trunk.name = 'trees:trunk';
    trunk.onBeforeCompile = (sh) => {
      for (const k of ['uPlaneMap', 'uTime', 'uWind', 'uGust']) sh.uniforms[k] = U[k];
      sh.uniforms.uFade = fade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec3 aSway;\nvarying float vPlane;\n${WIND_PARS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += treeSway( aSway.x, aSway.y );\nvPlane = aSway.z;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform sampler2D uPlaneMap;\nvarying float vPlane;\n${FADE_PARS}`)
        .replace('#include <map_fragment>', `${FADE}\n#include <map_fragment>\ndiffuseColor.rgb = mix( diffuseColor.rgb, texture2D( uPlaneMap, vMapUv * 0.5 ).rgb, vPlane );`)
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * ( 1.0 - 0.75 * vPlane );'));
    };
    trunk.customProgramCacheKey = () => 'trees:trunk:v2';
    all.push(trunk);
    return trunk;
  }
  const trunk = makeTrunk();

  return {
    leaf, depth, trunk, uniforms: U, makeLeaf, makeTrunk,
    dispose() { for (const m of all) m.dispose(); bark.map.dispose(); bark.normalMap.dispose(); },
  };
}
