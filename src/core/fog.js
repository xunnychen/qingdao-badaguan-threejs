// Global height fog. Overrides three's fog shader chunks ONCE (before the first render) so every built-in material and
// every ShaderMaterial that includes the fog chunks gets exponential height fog with no per-material work.
//
// scene.fog is a THREE.Fog whose two floats are re-purposed:
//     fog.near = density at sea level (1/m)        fog.far = height falloff (1/m)
// The SIGN of fog.near is a flag: negative while the post package renders into its linear HDR target (see the chunk).
// Custom shaders that read fogNear directly must use abs( fogNear ).
// Use ctx.setFog(color, density, falloff); never construct another fog object.
//
// Custom ShaderMaterials: construct with { fog: true }, merge THREE.UniformsLib.fog into uniforms, define `vec4 mvPosition`
// in the vertex shader and include <fog_pars_vertex>, <fog_vertex>, <fog_pars_fragment>, <fog_fragment>.
import * as THREE from 'three';

export const FOG_REF_HEIGHT = 2.0; // metres above sea level where density == fog.near

let installed = false;
export function installFog() {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    // height fog: fogNear = density at y = ${FOG_REF_HEIGHT.toFixed(1)} m, fogFar = falloff per metre of height
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogLen = length( fogRay );
    float fogK = max( fogFar, 1e-5 );
    float fogDy = clamp( fogRay.y * fogK, -30.0, 30.0 );
    float fogA = exp( - fogK * clamp( cameraPosition.y - ${FOG_REF_HEIGHT.toFixed(1)}, -10.0, 400.0 ) );
    float fogInt = abs( fogDy ) > 1e-3 ? ( 1.0 - exp( - fogDy ) ) / fogDy : 1.0 - 0.5 * fogDy;
    float fogFactor = clamp( 1.0 - exp( - abs( fogNear ) * fogLen * fogA * fogInt ), 0.0, 1.0 );
    // fogNear < 0 flags "drawing into a linear HDR target" (set by the post package while its composer renders):
    // the mix then happens in linear light before tone mapping, where the same fraction lifts dark surfaces far more
    // than the display-space mix every preset was tuned for. f_linear = f_display ^ 2.2 restores the look.
    fogFactor = mix( fogFactor, pow( fogFactor, 2.2 ), step( fogNear, 0.0 ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}

/** JS mirror of the shader: fog amount (0..1) between camera position and a world point. Useful for sprites / UI. */
export function fogAmount(fog, cam, p) {
  const k = Math.max(fog.far, 1e-5);
  const len = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
  const dy = Math.max(-30, Math.min(30, (p.y - cam.y) * k));
  const a = Math.exp(-k * Math.max(-10, Math.min(400, cam.y - FOG_REF_HEIGHT)));
  const integ = Math.abs(dy) > 1e-3 ? (1 - Math.exp(-dy)) / dy : 1 - 0.5 * dy;
  return Math.max(0, Math.min(1, 1 - Math.exp(-Math.abs(fog.near) * len * a * integ)));
}
