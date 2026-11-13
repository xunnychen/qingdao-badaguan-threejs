// Capability probe for the scene render target. Software GL and some mobile drivers accept a multisampled half-float
// target with a resolved depth texture at creation time and then give an incomplete framebuffer, GL errors or a black
// frame. Instead of trusting it, render a known quad into a tiny target built with the SAME options, sample its colour
// and depth back through a shader into RGBA8, read the pixels and compare.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Build the scene target: linear HDR colour, optional MSAA, optional sampleable depth. */
export function makeSceneTarget(width, height, { samples = 0, depth = false } = {}) {
  const opts = { type: THREE.HalfFloatType, samples, depthBuffer: true, stencilBuffer: false };
  if (depth) {
    const dt = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
    dt.minFilter = dt.magFilter = THREE.NearestFilter;
    opts.depthTexture = dt;
  }
  const rt = new THREE.WebGLRenderTarget(width, height, opts);
  rt.texture.name = 'post.scene';
  rt.texture.generateMipmaps = false;
  return rt;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float uUseDepth;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;                 // expect (2.0, 0.5, 0.25): proves the target is really HDR
  float d = uUseDepth > 0.5 ? texture2D(tDepth, vUv).x : 0.0;
  gl_FragColor = vec4(c.r * 0.25, c.g, d, c.b * 2.0);
}`;

/** @returns {boolean} true when a target with these options renders and reads back correctly */
export function probeTarget(renderer, { samples = 0, depth = false } = {}) {
  const gl = renderer.getContext();
  const prevTarget = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  let rt = null, out = null, quad = null, mesh = null, mat = null, ok = false;
  try {
    while (gl.getError() !== gl.NO_ERROR) { /* drain stale errors */ }
    rt = makeSceneTarget(8, 8, { samples, depth });
    out = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: false });
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    cam.position.z = 1;
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.0, 0.5, 0.25, THREE.LinearSRGBColorSpace), fog: false, toneMapped: false }));
    mesh.position.z = 0;        // ortho depth = (1 - 0) / 2 = 0.5
    scene.add(mesh);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);

    mat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture || null }, uUseDepth: { value: depth ? 1 : 0 } },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    });
    quad = new FullScreenQuad(mat);
    renderer.setRenderTarget(out);
    quad.render(renderer);
    const px = new Uint8Array(4);
    renderer.readRenderTargetPixels(out, 4, 4, 1, 1, px);
    const near = (a, b, tol = 6) => Math.abs(a - b) <= tol;
    ok = near(px[0], 128) && near(px[1], 128) && near(px[3], 128) && (!depth || near(px[2], 128, 8));
    if (gl.getError() !== gl.NO_ERROR) ok = false;
  } catch (e) {
    ok = false;
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
    renderer.setClearColor(prevColor, prevAlpha);
    rt?.depthTexture?.dispose();
    rt?.dispose();
    out?.dispose();
    quad?.dispose();
    mat?.dispose();
    if (mesh) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
  return ok;
}
