// The ONE full-screen pass of the pipeline. In order, per pixel:
//
//   linear HDR scene  + bloom (linear HDR)  + god rays (linear HDR, sun tinted)
//   -> tone mapping (renderer.toneMapping / toneMappingExposure, three's own chunk: identical to OutputPass)
//   -> sRGB transfer (exactly once)
//   -> display-space grade: saturation, pivot contrast, multiply tint, vignette, film grain, triangular dither, fade
//
// OutputPass and the grade ShaderPass of the brief are folded into this single draw: the maths and the ordering are the
// same (bloom and rays before tone mapping, grade after the transfer function), but it saves two full-screen passes and
// never writes display values into a multisampled half-float target.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float uBloom;        // 0 / 1
uniform vec3 uRayColor;      // sun colour * intensity (0 = no rays this frame)
uniform vec2 uRayTexel;      // 1 / god-ray target size
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uTint;          // display-space multiply
uniform float uTintAmount;   // overall strength of the tint
uniform float uVignette;
uniform float uGrain;
uniform float uFade;
uniform float uSeed;
uniform float uAspect;
uniform float uDebug;
varying vec2 vUv;

#include <tonemapping_pars_fragment>

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 toneMap(vec3 c) {
  #if defined( PP_TONE_LINEAR )
    return LinearToneMapping(c);
  #elif defined( PP_TONE_REINHARD )
    return ReinhardToneMapping(c);
  #elif defined( PP_TONE_CINEON )
    return CineonToneMapping(c);
  #elif defined( PP_TONE_ACES )
    return ACESFilmicToneMapping(c);
  #elif defined( PP_TONE_AGX )
    return AgXToneMapping(c);
  #elif defined( PP_TONE_NEUTRAL )
    return NeutralToneMapping(c);
  #else
    return clamp(c, 0.0, 1.0);
  #endif
}

void main() {
  vec3 hdr = max(texture2D(tDiffuse, vUv).rgb, vec3(0.0));
  if (!(hdr.r + hdr.g + hdr.b < 1.0e9)) hdr = vec3(0.0);

  #ifdef PP_RAYS
    float rays = 0.0;
    if (uRayColor.r + uRayColor.g + uRayColor.b > 0.0) {
      // rotated 4-tap: hides the march jitter and the half-resolution stair steps
      rays = 0.25 * (
        texture2D(tRays, vUv + uRayTexel * vec2( 0.9,  0.35)).r +
        texture2D(tRays, vUv + uRayTexel * vec2(-0.35, 0.9)).r +
        texture2D(tRays, vUv + uRayTexel * vec2(-0.9, -0.35)).r +
        texture2D(tRays, vUv + uRayTexel * vec2( 0.35, -0.9)).r);
      // screen-like add: shafts read against dark canopy, trunks and shade, and barely lift what is already bright
      // (open sky, sunlit walls, back-lit leaves), so the frame never washes out
      float sl = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
      rays *= clamp(1.0 - 0.85 * sl, 0.18, 1.0);
      hdr += uRayColor * rays;
    }
  #endif

  #ifdef PP_BLOOM
    vec3 bloom = texture2D(tBloom, vUv).rgb * uBloom;
    hdr += bloom;
  #endif

  // debug views (?pp=bloom|rays|none)
  if (uDebug > 2.5) hdr = max(texture2D(tDiffuse, vUv).rgb, vec3(0.0));
  #ifdef PP_BLOOM
    if (uDebug > 0.5 && uDebug < 1.5) hdr = bloom;
  #endif
  #ifdef PP_RAYS
    if (uDebug > 1.5 && uDebug < 2.5) hdr = uRayColor * rays;
  #endif

  vec3 c = toneMap(hdr);
  #ifdef PP_SRGB
    c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
  #endif

  // ---- display-space grade ----
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSaturation), vec3(0.0));
  // pivot contrast as a power curve: black stays black (no crushed shadows, no lifted blacks), mid-grey is fixed
  c = 0.42 * pow(c / 0.42, vec3(uContrast));
  // multiply tint as a split-tone. Full strength on warm and neutral mid-tones (granite, roofs, plaster, leaves);
  // released (1) where the pixel leans cool at all, which includes the PALE cool things: horizon haze, milky sky, sea,
  // fog, and (2) in the highlights, so the sun disc, lamp glass, lit windows and white trim can still reach white.
  float cool = c.b - max(c.r, c.g);
  float hi = max(c.r, max(c.g, c.b));
  float tintAmt = uTintAmount * (1.0 - smoothstep(-0.05, 0.035, cool)) * (1.0 - smoothstep(0.78, 1.0, hi));
  c *= mix(vec3(1.0), uTint, tintAmt);

  // vignette: slightly oval, only the outer third of the frame
  vec2 q = (vUv - 0.5) * 2.0;
  q.x *= mix(1.0, 0.86, clamp(uAspect - 1.0, 0.0, 1.0));
  float r = length(q);
  float v = smoothstep(0.55, 1.5, r);
  c *= 1.0 - uVignette * v * (0.75 + 0.25 * v);

  // fine grain (strongest in the mid-tones) + triangular dither of +-0.5/255 against sky and fog banding
  vec2 px = gl_FragCoord.xy;
  float n1 = hash12(px + uSeed * vec2(17.13, 9.71));
  float n2 = hash12(px + 91.7 + uSeed * vec2(5.31, 23.9));
  float l2 = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  float gw = 0.35 + 0.65 * (1.0 - abs(2.0 * l2 - 1.0));
  gw *= 1.0 - 0.6 * smoothstep(0.35, 0.75, l2);   // bright, low-detail areas (sky, haze, fog) stay clean
  c += (n1 - 0.5) * uGrain * gw;
  c += (n1 + n2 - 1.0) * (0.5 / 255.0);

  c *= uFade;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const TONE_DEFINES = {
  [THREE.LinearToneMapping]: 'PP_TONE_LINEAR',
  [THREE.ReinhardToneMapping]: 'PP_TONE_REINHARD',
  [THREE.CineonToneMapping]: 'PP_TONE_CINEON',
  [THREE.ACESFilmicToneMapping]: 'PP_TONE_ACES',
  [THREE.AgXToneMapping]: 'PP_TONE_AGX',
  [THREE.NeutralToneMapping]: 'PP_TONE_NEUTRAL',
};

export class FinalPass extends Pass {
  /** @param {object} o { bloom: boolean, rays: boolean } */
  constructor(o = {}) {
    super();
    this.needsSwap = true;
    this.hasBloom = !!o.bloom;
    this.hasRays = !!o.rays;
    this.uniforms = {
      tDiffuse: { value: null },
      tBloom: { value: null },
      tRays: { value: null },
      uBloom: { value: 1 },
      uRayColor: { value: new THREE.Color(0, 0, 0) },
      uRayTexel: { value: new THREE.Vector2(1, 1) },
      uSaturation: { value: 1 },
      uContrast: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uTintAmount: { value: 1 },
      uVignette: { value: 0 },
      uGrain: { value: 0 },
      uFade: { value: 1 },
      uSeed: { value: 0 },
      uAspect: { value: 1 },
      uDebug: { value: 0 },
      toneMappingExposure: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'post.final', uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      depthTest: false, depthWrite: false, toneMapped: false, // tone mapping is done by hand, once, in the shader
    });
    this._quad = new FullScreenQuad(this.material);
    this._tone = null;
    this._space = null;
  }

  setSize(width, height) {
    this.uniforms.uAspect.value = width / Math.max(1, height);
    this.uniforms.uRayTexel.value.set(1 / Math.max(2, Math.round(width / 2)), 1 / Math.max(2, Math.round(height / 2)));
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.toneMappingExposure.value = renderer.toneMappingExposure;
    if (this._tone !== renderer.toneMapping || this._space !== renderer.outputColorSpace) {
      this._tone = renderer.toneMapping;
      this._space = renderer.outputColorSpace;
      const d = {};
      if (TONE_DEFINES[this._tone]) d[TONE_DEFINES[this._tone]] = '';
      if (THREE.ColorManagement.getTransfer(this._space) === THREE.SRGBTransfer) d.PP_SRGB = '';
      if (this.hasBloom) d.PP_BLOOM = '';
      if (this.hasRays) d.PP_RAYS = '';
      this.material.defines = d;
      this.material.needsUpdate = true;
    }
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
    }
    this._quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this._quad.dispose();
  }
}
