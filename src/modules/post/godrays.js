// Screen-space crepuscular rays. ONE half-resolution pass: a 28-tap radial march from each pixel toward the sun's screen
// position. A tap contributes when the scene depth there is the sky (nothing was drawn: the dome sits on the far plane
// and does not write depth), weighted by an analytic halo around the sun, so trunks, canopies, roofs and gables carve
// the shafts. The start of the march is jittered per pixel (interleaved gradient noise) to turn banding into fine noise,
// which the final pass smooths with a 4-tap fetch. The result is a scalar "shaft amount"; the final pass tints it with
// the sun colour and adds it in linear HDR before tone mapping.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const TAPS = 28;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uSun;          // sun position in uv space (may lie outside 0..1)
uniform float uAspect;      // width / height
uniform float uNear;
uniform float uFar;
uniform float uSkyZ;        // view distance beyond which a texel counts as sky
uniform float uReach;       // halo radius in screen heights
uniform float uFalloff;     // radius (screen heights) at which shafts have died out
varying vec2 vUv;

float sky(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = uNear * uFar / (uFar - d * (uFar - uNear));
  return step(uSkyZ, z);
}
float halo(vec2 uv) {
  float r = length((uv - uSun) * vec2(uAspect, 1.0));
  float a = clamp(1.0 - r / uReach, 0.0, 1.0);
  return a * a * (0.55 + 0.45 * a * a);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec2 toSun = uSun - vUv;
  float dist = length(toSun * vec2(uAspect, 1.0));
  // never march further than the halo reaches: far pixels spend their taps where the light is
  float span = min(1.0, (uReach * 1.15) / max(dist, 1.0e-4));
  vec2 start = vUv + toSun * (1.0 - span);
  vec2 stepv = toSun * span * (0.97 / float(${TAPS}));
  vec2 p = start + stepv * ign(gl_FragCoord.xy);
  float acc = 0.0, wsum = 0.0, w = 1.0, open = 0.0;
  for (int i = 0; i < ${TAPS}; i++) {
    vec2 q = clamp(p, vec2(0.001), vec2(0.999));
    float s = sky(q);
    open += s;
    acc += s * halo(p) * w;
    wsum += w;
    w *= 0.972;
    p += stepv;
  }
  // a canopy lets only a few taps through: lift thin shafts, saturate smoothly toward the open sky
  float rays = 1.0 - exp(-2.6 * acc / wsum);
  // Shafts are light seen AGAINST occluders. Where the whole path to the sun is open sky (beach, sea, rooftops) the sky
  // shader already draws the sun's glow, and adding the halo again would only wash the frame: keep a fifth of it.
  // (open is integrated along the march, so this is smooth, unlike a per-pixel sky test.)
  rays *= mix(1.0, 0.2, smoothstep(0.4, 0.92, open / float(${TAPS})));
  // die out with distance from the sun so the far side of the frame is untouched
  float fall = clamp(1.0 - dist / uFalloff, 0.0, 1.0);
  rays *= fall * fall;
  // in-scatter needs air in front of the surface: a trunk 3 m away or the wall beside the camera gets almost none,
  // the depth of the tunnel and the sky get all of it
  float d0 = texture2D(tDepth, vUv).x;
  float z0 = uNear * uFar / (uFar - d0 * (uFar - uNear));
  rays *= 0.06 + 0.94 * smoothstep(2.5, 28.0, z0);
  gl_FragColor = vec4(rays, rays, rays, 1.0);
}`;

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class GodRaysPass extends Pass {
  /** @param {object} o { camera, env, getDepthTexture() } */
  constructor(o) {
    super();
    this.needsSwap = false;
    this.camera = o.camera;
    this.env = o.env;
    this.getDepthTexture = o.getDepthTexture;
    this.amount = 0;                 // live result: 0 when the pass skipped this frame
    this.sunUv = new THREE.Vector2(0.5, 0.5);
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.target.texture.name = 'post.godrays';
    this.target.texture.generateMipmaps = false;
    this.uniforms = {
      tDepth: { value: null },
      uSun: { value: this.sunUv },
      uAspect: { value: 1 },
      uNear: { value: 0.15 },
      uFar: { value: 4000 },
      uSkyZ: { value: 3000 },
      uReach: { value: 0.72 },
      uFalloff: { value: 1.3 },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'post.godrays', uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this._quad = new FullScreenQuad(this.material);
  }

  get texture() { return this.target.texture; }

  setSize(width, height) {
    this.target.setSize(Math.max(2, Math.round(width / 2)), Math.max(2, Math.round(height / 2)));
    this.uniforms.uAspect.value = width / Math.max(1, height);
  }

  /** how strongly the sun can throw shafts into this view (0 = skip the pass) */
  measure() {
    const cam = this.camera, env = this.env;
    const base = env.current.godrays || 0;
    if (base <= 0.002) return 0;
    const sun = env.sunDir;
    cam.getWorldDirection(_f);
    const facing = THREE.MathUtils.smoothstep(_f.dot(sun), 0.05, 0.32);
    if (facing <= 0) return 0;
    _v.copy(cam.position).addScaledVector(sun, cam.far * 0.5).project(cam);
    this.sunUv.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
    const m = Math.max(Math.abs(_v.x), Math.abs(_v.y));
    const edge = 1 - THREE.MathUtils.smoothstep(m, 1.0, 1.55);     // in or near the frustum only
    const up = THREE.MathUtils.smoothstep(sun.y, -0.03, 0.05);     // nothing from a set sun
    return base * facing * edge * up;
  }

  render(renderer) {
    this.amount = this.measure();
    const depth = this.getDepthTexture();
    if (this.amount <= 0.003 || !depth) { this.amount = 0; return; }
    const u = this.uniforms, cam = this.camera;
    u.tDepth.value = depth;
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uSkyZ.value = cam.far * 0.75;
    renderer.setRenderTarget(this.target);
    this._quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this._quad.dispose();
  }
}
