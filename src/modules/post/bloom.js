// HDR bloom: three's UnrealBloomPass mip chain (5 separable gaussian mips starting at half resolution) with two changes:
//
// 1. The bright-pass is our own. The stock LuminosityHighPass lets a texel through at FULL value once it crosses the
//    threshold, so a large area that is only slightly over (the sky around the sun, a white wall in full sun) gains
//    several hundred percent and washes the frame. Here only the EXCESS over the threshold blooms (soft knee), the input
//    is clamped so the sun disc cannot nuke the picture, and the 2x downsample is a 4-tap Karis-weighted average so a
//    single very bright leaf-gap pixel does not flicker as the camera moves.
// 2. The pass does NOT blend its result back onto the scene target (that would be one more full-screen draw into the
//    multisampled HDR target plus a second MSAA resolve). The final pass samples `bloom.texture` and adds it in linear
//    HDR right before tone mapping, which is the same maths for free.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;        // 1 / source size
uniform float uThreshold;
uniform float uKnee;
uniform float uExposure;   // renderer.toneMappingExposure: the threshold is judged on exposed values
uniform float uMax;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 tap(vec2 uv, inout float wsum) {
  vec3 c = texture2D(tDiffuse, uv).rgb;
  // NaN / negative guard, then clamp the peak (keeps hue)
  c = max(c, vec3(0.0));
  if (!(c.r + c.g + c.b < 1.0e9)) c = vec3(0.0);
  float m = max(c.r, max(c.g, c.b));
  c *= min(1.0, uMax / max(m, 1.0e-4));
  float w = 1.0 / (1.0 + luma(c));   // Karis: fireflies do not dominate the box
  wsum += w;
  return c * w;
}

void main() {
  float wsum = 0.0;
  vec3 c = tap(vUv + uTexel * vec2(-1.0, -1.0), wsum)
         + tap(vUv + uTexel * vec2( 1.0, -1.0), wsum)
         + tap(vUv + uTexel * vec2(-1.0,  1.0), wsum)
         + tap(vUv + uTexel * vec2( 1.0,  1.0), wsum);
  c /= max(wsum, 1.0e-4);
  // brightness for the threshold leans on the strongest channel, so saturated light (back-lit gold leaves, lamp glass,
  // sun on red tile) starts to glow before a grey surface of the same luminance does
  float m = max(c.r, max(c.g, c.b));
  float l = mix(luma(c), m, 0.85) * uExposure;
  // The knee is wide (half the threshold) for WARM light, so sunlit gold leaves, red tile and lamp glass that sit under
  // the threshold still give a little; for neutral and cool pixels (sky, horizon haze, fog, white walls) it stays
  // narrow, otherwise every large pale area would leak into the wide mips and veil the frame.
  float warm = smoothstep(-0.05, 0.3, (c.r - c.b) / max(m, 1.0e-4));
  float knee = uKnee * mix(0.3, 1.0, warm);
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1.0e-4);
  float k = max(soft, l - uThreshold) / max(l, 1.0e-4);
  vec3 b = c * max(k, 0.0);
  // compress large excesses: a lamp or a lit window keeps its halo, while a big very bright area (sun aureole, the
  // glitter path, wet sand under the sun) cannot flood the wide mips and veil the whole frame
  b /= 1.0 + 0.5 * luma(b);
  gl_FragColor = vec4(b, 1.0);
}`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class HdrBloomPass extends UnrealBloomPass {
  constructor(width, height) {
    super(new THREE.Vector2(width, height), 0.3, 0.6, 0.92);
    this.needsSwap = false;
    this.kneeRatio = 0.5;        // knee = kneeRatio * threshold
    this.exposure = 1;
    this.maxInput = 6;
    this.brightUniforms = {
      tDiffuse: { value: null },
      uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
      uThreshold: { value: 0.92 },
      uKnee: { value: 0.46 },
      uExposure: { value: 1 },
      uMax: { value: this.maxInput },
    };
    this.materialHighPassFilter.dispose();
    this.materialHighPassFilter = new THREE.ShaderMaterial({
      name: 'post.bloomBright', uniforms: this.brightUniforms, vertexShader: VERT, fragmentShader: BRIGHT_FRAG,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    for (const m of this.separableBlurMaterials) { m.depthTest = false; m.depthWrite = false; m.toneMapped = false; }
    this.compositeMaterial.depthTest = false; this.compositeMaterial.depthWrite = false; this.compositeMaterial.toneMapped = false;
    // wider mips carry a slightly warm tint: reads as light scattering in maritime haze instead of a grey veil
    this.bloomTintColors[2].set(1.0, 0.98, 0.95);
    this.bloomTintColors[3].set(1.0, 0.96, 0.91);
    this.bloomTintColors[4].set(1.0, 0.94, 0.87);
  }

  /** the composited bloom (linear HDR, half resolution): add it to the scene before tone mapping */
  get texture() { return this.renderTargetsHorizontal[0].texture; }

  setSize(width, height) {
    super.setSize(width, height);
    this.brightUniforms.uTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.getClearColor(this._oldClearColor);
    this._oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    const quad = this._fsQuad;

    // 1. bright pass + 2x downsample
    this.brightUniforms.tDiffuse.value = readBuffer.texture;
    this.brightUniforms.uThreshold.value = this.threshold;
    this.brightUniforms.uKnee.value = Math.max(0.05, this.kneeRatio * this.threshold);
    this.brightUniforms.uExposure.value = this.exposure;
    this.brightUniforms.uMax.value = this.maxInput;
    quad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    renderer.clear();
    quad.render(renderer);

    // 2. progressive separable blur
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const m = this.separableBlurMaterials[i];
      quad.material = m;
      m.uniforms.colorTexture.value = input.texture;
      m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      renderer.clear();
      quad.render(renderer);
      m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      renderer.clear();
      quad.render(renderer);
      input = this.renderTargetsVertical[i];
    }

    // 3. composite the mips (strength and radius live)
    quad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    renderer.clear();
    quad.render(renderer);

    renderer.setClearColor(this._oldClearColor, this._oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }
}
