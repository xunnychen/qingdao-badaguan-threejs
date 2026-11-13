// The Yellow Sea: one custom ShaderMaterial on one tensor-grid mesh (dense along the playable shore, coarse to 3.8 km).
// No mirror pass. The shore is known to the shader through a baked half-float "coast map":
//   R = ground height (m, negative = sea bed)      G = proximity of reef rocks standing in the water (foam rings)
//   B = signed distance to the waterline (m, + land) A = beachness (1 = sand beach, 0 = rock shore)
import * as THREE from 'three';
import { WAVE_GLSL } from './waves.js';

export const COAST_RECT = { x0: -420, z0: -40, w: 840, h: 520 };
const TEX_W = 512, TEX_H = 320;

/** Bake the coast map. `rocks` (from placeRocks) add foam rings where they stand in or beside the water. */
export function bakeCoastMap(ctx, rocks) {
  const { world } = ctx;
  const { x0, z0, w, h } = COAST_RECT;
  const data = new Uint16Array(TEX_W * TEX_H * 4);
  const ring = new Float32Array(TEX_W * TEX_H);
  const cw = w / TEX_W, ch = h / TEX_H;
  for (const r of rocks) {
    const fr = r.fr ?? r.r;
    if (!r.wet || fr < 0.5) continue;                  // loose cobbles make no ring
    const reach = fr * 0.8 + 1.7;
    const i0 = Math.max(0, Math.floor((r.x - reach - x0) / cw)), i1 = Math.min(TEX_W - 1, Math.ceil((r.x + reach - x0) / cw));
    const j0 = Math.max(0, Math.floor((r.z - reach - z0) / ch)), j1 = Math.min(TEX_H - 1, Math.ceil((r.z + reach - z0) / ch));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(x0 + (i + 0.5) * cw - r.x, z0 + (j + 0.5) * ch - r.z);
      const t = Math.min(1, Math.max(0, (d - fr * 0.8) / 1.7));
      const v = 1 - t * t * (3 - 2 * t);
      if (v > ring[j * TEX_W + i]) ring[j * TEX_W + i] = v;
    }
  }
  const half = THREE.DataUtils.toHalfFloat, info = {};
  for (let j = 0; j < TEX_H; j++) {
    const z = z0 + (j + 0.5) * ch;
    for (let i = 0; i < TEX_W; i++) {
      const x = x0 + (i + 0.5) * cw, o = (j * TEX_W + i) * 4;
      const sd = world.shoreDist(x, z);
      world.backInfo(x, z, info);
      data[o] = half(Math.max(-16, Math.min(40, world.heightAt(x, z))));
      data[o + 1] = half(ring[j * TEX_W + i]);
      data[o + 2] = half(Math.max(-60, Math.min(30, sd)));
      data[o + 3] = half(world.beachness(info.x));
    }
  }
  const tex = new THREE.DataTexture(data, TEX_W, TEX_H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Tiling water noise: RG = ripple normal xy, B = foam lace (thin bright filaments), A = soft cloud noise. */
function waterNoise(ctx) {
  const { tex } = ctx;
  const size = 256;
  const h1 = tex.tileFbm(size, 5, 4, 911), h2 = tex.tileFbm(size, 11, 3, 912);
  const la = tex.tileFbm(size, 7, 3, 913), lb = tex.tileFbm(size, 13, 2, 914), cl = tex.tileFbm(size, 4, 4, 915);
  const data = new Uint8Array(size * size * 4);
  const H = (x, y) => { const i = ((y + size) % size) * size + ((x + size) % size); return h1[i] * 0.7 + h2[i] * 0.3; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, o = i * 4;
    const dx = (H(x + 1, y) - H(x - 1, y)) * 9, dy = (H(x, y + 1) - H(x, y - 1)) * 9;
    const l = Math.hypot(dx, dy, 1);
    data[o] = Math.round((0.5 - 0.5 * dx / l) * 255);
    data[o + 1] = Math.round((0.5 - 0.5 * dy / l) * 255);
    const a = Math.pow(1 - Math.abs(2 * la[i] - 1), 9), b = Math.pow(1 - Math.abs(2 * lb[i] - 1), 7) * 0.8;
    data[o + 2] = Math.round(Math.min(1, Math.max(a, b)) * 255);
    data[o + 3] = Math.round(Math.min(1, Math.max(0, (cl[i] - 0.5) * 2.2 + 0.5)) * 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(4, tex.maxAnisotropy || 1);
  t.needsUpdate = true;
  return t;
}

function axis(d0, d1, cell, lo, hi, grow = 1.24, cap = 420) {
  const n = Math.max(1, Math.round((d1 - d0) / cell)), out = [];
  for (let i = 0; i <= n; i++) out.push(d0 + ((d1 - d0) * i) / n);
  let step = cell, p = d1;
  while (p < hi - 0.5) { step = Math.min(step * grow, cap); p += step; if (hi - p < step * 0.6) p = hi; out.push(p); }
  step = cell; p = d0;
  while (p > lo + 0.5) { step = Math.min(step * grow, cap); p -= step; if (p - lo < step * 0.6) p = lo; out.unshift(p); }
  return out;
}

function oceanGeometry(ctx) {
  const { world, quality } = ctx;
  const cell = Math.max(3.2, 620 / quality.oceanSegments);
  const xs = axis(-270, 270, cell, -3800, 3800), zs = axis(-16, 262, cell, -460, 3800);
  const W = xs.length, H = zs.length;
  // a cell is dropped when it is entirely dry land that the terrain mesh covers
  const dry = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) dry[j * W + i] = world.heightAt(xs[i], zs[j]) > 0.9 ? 1 : 0;
  const id = new Int32Array(W * H).fill(-1);
  const pos = [], idx = [];
  const vert = (i, j) => { const k = j * W + i; if (id[k] < 0) { id[k] = pos.length / 3; pos.push(xs[i], 0, zs[j]); } return id[k]; };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    if (dry[j * W + i] && dry[j * W + i + 1] && dry[(j + 1) * W + i] && dry[(j + 1) * W + i + 1]) {
      const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2;
      const covered = Math.abs(mx) < 1380 && mz > -1380 && mz < 1380;
      if (covered && world.heightAt(mx, mz) > 0.9) continue;
    }
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 1670), 5700);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-3800, -2, -460), new THREE.Vector3(3800, 2, 3800));
  return g;
}

const COMMON = /* glsl */ `
uniform sampler2D uCoast;
uniform vec4 uRect;      // x0, z0, 1/w, 1/h of the coast map
uniform float uTime;
uniform float uWaveH;
${WAVE_GLSL}
vec4 coastData(vec2 xz) {
  vec2 uv = (xz - uRect.xy) * uRect.zw;
  vec2 e = min(uv, 1.0 - uv);
  float m = smoothstep(0.0, 0.035, min(e.x, e.y));
  return mix(vec4(-14.0, 0.0, -60.0, 0.0), texture2D(uCoast, clamp(uv, 0.0, 1.0)), m);
}
// the 8.6 s breathing of the bay: phase drifts along the shore so the swash never moves as one line
float swashPhase(vec2 p) {
  return uTime / 8.6 + 0.37 * sin(p.x * 0.021 + p.y * 0.013) + 0.21 * sin(p.x * 0.053 - p.y * 0.031 + 1.3);
}
float swashCurve(float u) {
  u = fract(u);
  return u < 0.3 ? smoothstep(0.0, 0.3, u) : 1.0 - smoothstep(0.3, 1.0, u);
}
float farFade(vec2 xz) { return 1.0 - smoothstep(450.0, 1300.0, length(xz - vec2(0.0, 150.0))); }
`;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${COMMON}
varying vec3 vWorld;
void main() {
  vec3 p = position;
  vec4 cd = coastData(p.xz);
  float damp = smoothstep(0.15, 3.0, -cd.r) * farFade(p.xz);
  p += coastWave(p.xz, uTime, uWaveH) * damp;
  // swash: the whole near-shore sheet lifts and drains so the water's edge slides up and down the sand
  p.y += uWaveH * (0.22 + 0.5 * cd.a) * swashCurve(swashPhase(position.xz)) * smoothstep(-16.0, -3.0, cd.b);
  vWorld = p;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${COMMON}
uniform sampler2D uNoise;
uniform vec3 uShallow, uDeep, uSpec, uSkyH, uSkyZ, uAnti, uSunGlow, uSunDir, uFoamCol;
uniform float uGlitter, uFoam, uLight;
varying vec3 vWorld;
// fixed rotations (0.6, -1.1, 2.3 rad): uv = R * xz, and a sampled slope goes back to world axes as slope * R
const mat2 R1 = mat2(0.82534, 0.56464, -0.56464, 0.82534);
const mat2 R2 = mat2(0.45360, -0.89121, 0.89121, 0.45360);
const mat2 R3 = mat2(-0.66628, 0.74571, -0.74571, -0.66628);

void main() {
  vec2 xz = vWorld.xz;
  vec4 cd = coastData(xz);
  float depth = vWorld.y - cd.r;
  float edge = smoothstep(0.0, 0.07, depth);
  if (edge < 0.004) discard;

  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // ---- normal: swell slope + three scrolling ripple octaves (each octave on its own axes so the tile never lines up) ----
  float damp = smoothstep(0.15, 3.0, -cd.r) * farFade(xz);
  vec2 slope = coastWaveSlope(xz, uTime, uWaveH) * damp * 2.2;
  float nearK = 1.0 / (1.0 + dist * 0.008);
  vec2 n1 = (texture2D(uNoise, (R1 * xz) * 0.097 + uTime * vec2(0.013, -0.024)).rg - 0.5) * R1;
  vec2 n2 = (texture2D(uNoise, (R2 * xz) * 0.241 + uTime * vec2(-0.031, -0.019) + 0.43).rg - 0.5) * R2;
  vec2 n3 = 0.5 * (texture2D(uNoise, xz * 0.0263 + uTime * vec2(0.0055, -0.0085) + 0.17).rg - 0.5)
          + 0.5 * ((texture2D(uNoise, (R3 * xz) * 0.0171 + uTime * vec2(-0.004, -0.006) + 0.61).rg - 0.5) * R3);
  n3 *= 1.35;
  float chop = 0.42 + 1.9 * uWaveH;
  vec2 dn = ((n1 + n2 * 0.7) * mix(0.35, 1.0, nearK) + n3 * 0.6) * chop * mix(0.45, 1.0, smoothstep(0.0, 1.2, depth));
  vec3 N = normalize(vec3(dn.x * 0.62 - slope.x, 1.0, dn.y * 0.62 - slope.y));

  // ---- water body: milky jade, shallow celadon over the sand to grey-teal in the deep ----
  float tDeep = 1.0 - exp(-max(depth, 0.0) * 0.42);
  vec3 body = mix(uShallow, uDeep, tDeep) * uLight;
  float lumB = dot(body, vec3(0.2126, 0.7152, 0.0722));
  body = mix(body, lumB * vec3(0.93, 1.05, 0.96), 0.3);                    // silt: milky, never a clear tropical blue
  body *= 0.94 + 0.5 * (n3.x + n3.y);                                      // silt clouds
  // stirred-up sand off the bathing beach: the first 30 to 40 m are paler and milkier, in drifting patches
  float milk = smoothstep(-38.0, -5.0, cd.b) * (0.35 + 0.65 * cd.a) * (0.75 + 1.2 * (n3.x - n3.y));
  body = mix(body, (lumB * 1.25 + 0.035 * uLight) * vec3(0.97, 1.02, 0.93), 0.32 * clamp(milk, 0.0, 1.0));

  // ---- analytic sky reflection (Schlick) ----
  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.5 * pow(1.0 - NdV, 3.6);                                // rough water: grazing reflection never reaches a mirror
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec2 sunH = normalize(uSunDir.xz + 1e-5);
  float azS = dot(normalize(R.xz + 1e-5), sunH), az = max(azS, 0.0);
  float lowSun = 1.0 - smoothstep(0.1, 0.34, uSunDir.y);
  // the horizon it mirrors is the sunset only toward the sun; away from it, the anti-solar haze (mauve at dusk)
  vec3 hor = mix(uAnti, uSkyH, smoothstep(-0.3, 0.8, azS));
  // by day the mirrored sky leans to the pale horizon (a blue zenith on jade water reads tropical); at low sun the
  // sea carries the violet-blue of the upper sky instead of the orange band
  float zen = min(1.0, pow(R.y, mix(0.8, 0.5, lowSun)) * mix(0.62, 0.85, lowSun) + mix(0.06, 0.35, lowSun));
  vec3 sky = mix(hor, uSkyZ, zen);
  sky = mix(sky, sky * uShallow / max(dot(uShallow, vec3(0.2126, 0.7152, 0.0722)), 0.02), 0.5);   // the sea keeps its jade cast even where it mirrors the sky
  sky = mix(sky, uSunGlow, pow(az, 8.0) * (1.0 - R.y) * 0.25);
  vec3 col = mix(body, sky, F);
  float lumC = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, lumC * vec3(0.95, 1.035, 0.975), 0.15);                    // Yellow Sea: slightly milky grey-green, never cyan

  // ---- sun glitter ----
  // near the camera: real glints, where a fine facet (0.3 to 1 m ripples) happens to mirror the sun, so the path is a
  // field of sparks and never a white sheet; far away, where the facets are smaller than a pixel, their statistics:
  // a soft lobe toward the sun.
  vec2 g1 = (texture2D(uNoise, (R2 * xz) * 0.57 + uTime * vec2(0.045, -0.06) + 0.11).rg - 0.5) * R2;
  vec2 g2 = (texture2D(uNoise, (R3 * xz) * 1.43 + uTime * vec2(-0.07, -0.05) + 0.3).rg - 0.5) * R3;
  vec3 Ng = normalize(vec3(N.x / N.y + (g1.x + g2.x * 0.8) * 1.25, 1.0, N.z / N.y + (g1.y + g2.y * 0.8) * 1.25));
  float rs = max(dot(reflect(-V, Ng), uSunDir), 0.0);
  float glint = pow(rs, 400.0) * 6.0 + pow(rs, 26.0) * 0.05;
  float elV = asin(clamp(V.y, 0.0, 1.0)), elS = asin(clamp(uSunDir.y, 0.0, 1.0));
  float dEl = elS - elV;
  float dAz = acos(clamp(dot(-normalize(V.xz + 1e-5), sunH), -1.0, 1.0));
  float sAz = 0.06 + 0.10 * elV;
  float path = exp(-dAz * dAz / (2.0 * sAz * sAz)) * exp(-dEl * dEl / (2.0 * 0.3 * 0.3));
  // A road of sparks, not a wash. Beyond a few tens of metres one pixel covers metres of water along the view, so any
  // world-space ripple texture averages to a matte band in the mips. The sparks there live in view-direction space
  // instead (cells of about half a degree in azimuth and elevation, so they are a few pixels at every distance), each
  // twinkling on its own clock, and are gated by world-space ripple patches so they belong to the water. Only far
  // out do they close into the unbroken streak under the sun.
  vec2 gp = vec2(atan(V.x, V.z) * 105.0, asin(clamp(V.y, -1.0, 1.0)) * 150.0);
  vec2 gi = floor(gp), gf = fract(gp) - 0.5;
  float gh = fract(sin(dot(gi, vec2(127.1, 311.7))) * 43758.5453), gh2 = fract(gh * 57.31 + 0.37);
  float tw = 0.5 + 0.5 * sin(uTime * (2.5 + 5.0 * gh2) + gh * 6.2832);
  vec2 gd = (gf - (vec2(gh2, fract(gh * 13.7)) - 0.5) * 0.5) * vec2(0.8, 1.25);
  float dots = (1.0 - smoothstep(0.12, 0.4, length(gd))) * step(0.4, gh) * tw * (0.6 + 0.8 * gh2);
  float sC = texture2D(uNoise, (R3 * xz) * 0.083 + uTime * vec2(0.017, -0.012) + 0.71).a;
  float sD = texture2D(uNoise, (R2 * xz) * 0.031 + uTime * vec2(-0.006, 0.008) + 0.13).a;
  float ripPatch = smoothstep(0.3, 0.62, sC * 0.55 + sD * 0.45 + 0.4 * (n3.x + n3.y));
  // the sparks reach further up and down the path than its soft core does (steep wavelets far from the mirror point)
  float pathS = exp(-dAz * dAz / (2.0 * sAz * sAz)) * max(exp(-dEl * dEl / (2.0 * 0.3 * 0.3)), 0.4);
  float spark = mix(0.1 * path + 9.0 * dots * ripPatch * pathS, 1.5 * path, smoothstep(700.0, 1600.0, dist));
  float sheet = min(spark * 1.15, 3.0);
  float farK = smoothstep(10.0, 55.0, dist);
  float glit = mix(min(glint, 3.0), sheet, farK) * smoothstep(0.06, 0.4, depth);
  col += uSpec * uGlitter * glit;

  // ---- foam ----
  float ph = swashPhase(xz);
  float lace = texture2D(uNoise, xz * 0.25 + uTime * vec2(0.008, -0.013)).b;
  float lace2 = texture2D(uNoise, (R1 * xz) * 0.63 + uTime * vec2(-0.011, -0.017) + 0.61).b;
  float cloud = texture2D(uNoise, xz * 0.043 + uTime * 0.004).a;
  float fine = texture2D(uNoise, (R2 * xz) * 0.17 + uTime * vec2(0.005, -0.004) + 0.27).a;   // 3 m blotches
  float L = max(lace, lace2 * 0.85);
  float sandy = cd.a;
  float lead = (1.0 - smoothstep(0.02, 0.075, depth))                              // the white line at the very edge;
    * mix(0.3 + 0.5 * smoothstep(0.2, 0.6, L + fine * 0.4), 1.0, sandy);           // over a rock shelf it is broken wash, not a sheet
  float zone = (1.0 - smoothstep(0.05, mix(0.2, 0.24, sandy), depth))
    * smoothstep(mix(0.4, 0.3, sandy), mix(0.85, 0.75, sandy), L + mix(fine * 0.35, cloud * 0.4, sandy)) * mix(0.72, 1.0, sandy);
  float sd = cd.b;
  // fronts running in to the shore; the distance is warped so they are loose arcs, not offsets of the shore polyline
  float sdw = sd + (cloud - 0.5) * 7.0 + (fine - 0.5) * 2.5 + (n3.x + n3.y) * 7.0;
  float wv = fract(-sdw / 9.0 + ph);
  float line = smoothstep(0.0, 0.05, wv) * (1.0 - smoothstep(0.05, 0.45, wv));
  line *= smoothstep(0.38, 0.62, texture2D(uNoise, xz * 0.0117 + vec2(0.3, uTime * 0.002)).a);   // broken arcs, not contour lines
  float env = mix(smoothstep(-10.0, -4.0, sd) * 0.2, smoothstep(-22.0, -6.0, sd) * 0.7, sandy);  // nothing crosses open water off the rocks
  float surf = line * env * smoothstep(0.3, 0.85, L * (0.85 + 0.5 * line) + cloud * 0.27);   // lace only: never a milky sheet
  float pulse = swashCurve(ph);
  // the wash around rocks standing in the water: always lace, ragged outline, never an opaque disc
  float rm = cd.g * (0.7 + 0.45 * pulse) + (fine - 0.5) * 0.6 + (cloud - 0.5) * 0.2;
  float ring = smoothstep(0.3, 0.75, rm) * smoothstep(0.34, 0.8, L + fine * 0.3) * 0.72;
  float foam = min(1.0, max(max(lead, zone), max(surf * 0.85, ring)) * uFoam * 1.25);
  col = mix(col, uFoamCol, foam);

  float alpha = edge * clamp(max(1.0 - exp(-depth * 3.2), F) + foam, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #ifdef USE_FOG
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(2700.0, 3700.0, dist));
  #endif
}
`;

const LUMA = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export function buildOcean(ctx, rocks, group) {
  const coastMap = bakeCoastMap(ctx, rocks);
  const noise = waterNoise(ctx);
  const cur = ctx.env.current;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uWaveH: { value: cur.waveHeight },
    uRect: { value: new THREE.Vector4(COAST_RECT.x0, COAST_RECT.z0, 1 / COAST_RECT.w, 1 / COAST_RECT.h) },
    uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uSpec: { value: new THREE.Color() },
    uSkyH: { value: new THREE.Color() }, uSkyZ: { value: new THREE.Color() }, uAnti: { value: new THREE.Color() }, uSunGlow: { value: new THREE.Color() },
    uFoamCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlitter: { value: 1 }, uFoam: { value: 1 }, uLight: { value: 1 },
  }]);
  uniforms.uCoast = { value: coastMap };
  uniforms.uNoise = { value: noise };
  const mat = new THREE.ShaderMaterial({
    name: 'coast:ocean', uniforms, vertexShader: VERT, fragmentShader: FRAG,
    fog: true, transparent: true, depthWrite: true,
  });
  const geo = oceanGeometry(ctx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ocean';
  mesh.renderOrder = -1;            // first among the transparent objects (it is the largest and the lowest)
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  group.add(mesh);

  const white = new THREE.Color(1, 1, 1), tmp = new THREE.Color();
  function update(t) {
    const c = ctx.env.current, u = uniforms, sun = ctx.env.sunDir;
    u.uTime.value = t;
    u.uWaveH.value = c.waveHeight;
    u.uShallow.value.copy(c.seaShallow); u.uDeep.value.copy(c.seaDeep); u.uSpec.value.copy(c.seaSpec);
    u.uSkyH.value.copy(c.skyHorizon); u.uSkyZ.value.copy(c.skyZenith); u.uSunGlow.value.copy(c.skySunGlow);
    u.uAnti.value.copy(c.skyAntiSolar || c.skyHorizon);
    u.uSunDir.value.copy(sun);
    u.uGlitter.value = c.seaGlitter; u.uFoam.value = c.foam;
    // how much light falls on the water (sun + sky), relative to the reference "exposure 1" daylight
    const L = (LUMA(c.sunColor) * c.sunIntensity * Math.max(sun.y, 0) + LUMA(c.hemiSky) * c.hemiIntensity) / Math.PI;
    u.uLight.value = Math.min(0.8, Math.max(0.28, 0.24 + 0.62 * L));
    const fl = Math.min(0.98, Math.max(0.26, 0.2 + 0.85 * L));
    tmp.copy(white).lerp(c.sunColor, 0.22).lerp(c.skyHorizon, 0.22 * (1 - Math.min(1, L * 2)));
    u.uFoamCol.value.copy(tmp).multiplyScalar(fl);
  }
  update(ctx.state.time || 0);

  return {
    mesh, update, triangles: geo.index.count / 3,
    dispose() { geo.dispose(); mat.dispose(); coastMap.dispose(); noise.dispose(); },
  };
}
