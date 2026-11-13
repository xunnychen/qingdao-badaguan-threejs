// Shared wind state + vertex-shader helper. ctx.wind.
// One set of uniform objects is shared by every swaying material so trees, hedges, grass, particles and audio gusts agree.
import * as THREE from 'three';
import { hash2 } from './rng.js';

export function createWind(env, events) {
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3(1, 0, 0) },  // horizontal direction * strength (strength ~0..1.5)
    uGust: { value: 0 },                            // 0..1 gust envelope
  };
  const wind = {
    uniforms,
    dir: new THREE.Vector3(1, 0, 0), // unit, blows toward
    strength: 0.5,                   // base strength from the preset (0..1)
    gust: 0,                         // 0..1 current gust envelope
    power: 0.5,                      // strength * (1 + gust): what things should react to
    _lastSlot: -1,
    /** Deterministic gust envelope as a function of time: one ~6 s gust in every 28 s slot. */
    gustAt(t) {
      const slot = Math.floor(t / 28);
      const startT = slot * 28 + 4 + hash2(slot, 91, 5) * 16;
      const u = (t - startT) / 6;
      return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 2;
    },
    update(dt, t) {
      wind.strength = env.current.windStrength;
      wind.dir.copy(env.windDir);
      const g = wind.gustAt(t);
      if (g > 0 && wind.gust === 0) events.emit('gust', { time: t, duration: 6 });
      wind.gust = g;
      wind.power = wind.strength * (1 + 1.4 * g);
      uniforms.uTime.value = t;
      uniforms.uGust.value = g;
      uniforms.uWind.value.copy(wind.dir).multiplyScalar(wind.power);
    },
    /**
     * Add wind sway to a built-in material (MeshStandard/Lambert/Depth...) via onBeforeCompile. Works with InstancedMesh.
     * Local-space y of each vertex is treated as height above the object's root.
     *   opts.sway    whole-object bending in metres per metre^2 of height (default 0.012: a 12 m tree tip moves ~0.9 m in a gust)
     *   opts.flutter small high-frequency leaf flutter amplitude in metres (default 0.03), applied above opts.flutterFrom (m)
     * Call BEFORE the material is first rendered. Use the same call on a MeshDepthMaterial assigned to
     * mesh.customDepthMaterial if you want the shadow to sway too.
     */
    apply(material, opts = {}) {
      const sway = (opts.sway ?? 0.012).toFixed(5), flutter = (opts.flutter ?? 0.03).toFixed(5), from = (opts.flutterFrom ?? 1.5).toFixed(3);
      const prev = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        if (prev) prev.call(material, shader, renderer);
        shader.uniforms.uTime = uniforms.uTime; shader.uniforms.uWind = uniforms.uWind; shader.uniforms.uGust = uniforms.uGust;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\nuniform float uTime; uniform vec3 uWind; uniform float uGust;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            #ifdef USE_INSTANCING
              vec3 wOrigin = instanceMatrix[3].xyz;
              mat3 wBasis = mat3( instanceMatrix );
            #else
              vec3 wOrigin = modelMatrix[3].xyz;
              mat3 wBasis = mat3( modelMatrix );
            #endif
            float wPhase = dot( wOrigin.xz, vec2( 0.11, 0.07 ) );
            float wH = max( position.y, 0.0 );
            float wSway = sin( uTime * 1.1 + wPhase ) * 0.6 + sin( uTime * 2.3 + wPhase * 1.7 ) * 0.3 + 0.5;
            float wFlut = sin( uTime * 6.0 + position.x * 3.1 + position.z * 2.3 + wPhase * 3.0 ) * ${flutter} * step( ${from}, wH ) * ( 0.4 + length( uWind ) );
            vec3 wWorld = uWind * ( wSway * ${sway} * wH * wH ) + normalize( uWind + vec3( 1e-4 ) ) * wFlut;
            // world-space push converted into local space (instances keep their own rotation / scale)
            transformed += ( wWorld * wBasis ) / max( dot( wBasis[0], wBasis[0] ), 1e-4 );
          }`);
      };
      const key = `wind:${sway}:${flutter}:${from}`;
      const prevKey = material.customProgramCacheKey?.bind(material);
      material.customProgramCacheKey = () => (prevKey ? prevKey() + '|' : '') + key;
      return material;
    },
  };
  return wind;
}
