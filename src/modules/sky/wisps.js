// Sea-fog wisps: large soft upright billboards (one instanced draw call) that drift inland from the sea around the
// walker. Positions are a pure function of the accumulated drift vector, wrapped in a camera-centred square, so any time
// t looks finished and recycling happens at the faded rim. Denser near the shore and on low ground.
import * as THREE from 'three';

const COUNT = 50;
const HALF = 66;             // wrap half-size (m): the fog preset hides everything past ~70 m, so the banks live close
                             // (about 6 in view at any time); they recycle at 66 m, fully faded beyond 60 m
const SPAN = HALF * 2;

const VERT = /* glsl */ `
attribute vec4 aPos;    // xyz centre, w alpha
attribute vec4 aShape;  // x width, y height, z seed, w flip
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
uniform float uTilt;    // 0 upright .. 1 lying flat (seen from above the bank is a patch, not an edge-on smear)
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vAlpha = aPos.w;
  vSeed = aShape.z;
  vec3 right = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  right = normalize( vec3( right.x, 0.0, right.z ) );
  vec3 fwdH = vec3( - right.z, 0.0, right.x );
  vec3 up = normalize( mix( vec3( 0.0, 1.0, 0.0 ), fwdH, uTilt ) ) * mix( aShape.y, aShape.x * 0.6, uTilt );
  vec3 wp = aPos.xyz + right * ( position.x * aShape.x * aShape.w ) + up * position.y;
  vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  // soft lens shape, flatter underneath so the bank sits on the ground without a visible cut
  float r = length( vec2( c.x, c.y * ( c.y < 0.0 ? 1.25 : 1.0 ) ) );
  float body = 1.0 - smoothstep( 0.15, 1.0, r );
  vec2 q = vUv * vec2( 0.55, 0.24 ) + vec2( vSeed * 7.31, vSeed * 3.17 );
  float n = texture2D( uNoise, q + vec2( uTime * 0.004, 0.0 ) ).r * 0.65
          + texture2D( uNoise, q * 2.7 - vec2( uTime * 0.007, uTime * 0.002 ) ).g * 0.35;
  float a = body * smoothstep( 0.2, 0.7, n + body * 0.4 ) * vAlpha;
  a *= smoothstep( 1.5, 8.0, vFogDepth );              // never clip against the near plane
  if ( a < 0.003 ) discard;
  // internal structure: brighter billows, greyer hollows (about +-8 %)
  gl_FragColor = vec4( uColor * ( 0.92 + 0.16 * smoothstep( 0.25, 0.75, n ) ), a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createWisps(ctx, noiseTex) {
  const { world, rng } = ctx;
  const rand = rng.makeRng('sky:wisps');

  const base = new Float32Array(COUNT * 2);
  const speed = new Float32Array(COUNT);
  const lift = new Float32Array(COUNT);
  const weight = new Float32Array(COUNT);
  const aPos = new Float32Array(COUNT * 4);
  const aShape = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    base[i * 2] = rand() * SPAN; base[i * 2 + 1] = rand() * SPAN;
    speed[i] = rand.range(0.3, 0.8);                 // m/s
    lift[i] = rand.range(0.0, 1.0);
    weight[i] = rand.range(0.55, 1.0);
    aShape[i * 4] = rand.range(22, 46);              // width
    aShape[i * 4 + 1] = rand.range(4.5, 9.5);        // height
    aShape[i * 4 + 2] = rand();
    aShape[i * 4 + 3] = rand.sign();
  }

  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  const posAttr = new THREE.InstancedBufferAttribute(aPos, 4);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPos', posAttr);
  geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(aShape, 4));
  geometry.instanceCount = COUNT;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uNoise: { value: null }, uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uTilt: { value: 0 },
  }]);
  uniforms.uNoise.value = noiseTex;
  const material = new THREE.ShaderMaterial({
    name: 'sky-wisps', uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky-wisps';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 20;
  mesh.visible = false;

  const drift = new THREE.Vector2();
  let started = false;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function update(dt, t, amount, camera, windDir, fogColor) {
    // inland (north) with a share of the wind: sea fog is advected off the water whatever the breeze does
    let dx = windDir.x * 0.55, dz = windDir.z * 0.55 - 0.7;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (!started) { drift.set(dx * t, dz * t); started = true; } else { drift.x += dx * dt; drift.y += dz * dt; }
    mesh.visible = amount > 0.004;
    if (!mesh.visible) return;
    uniforms.uTime.value = t;
    uniforms.uColor.value.copy(fogColor).multiplyScalar(1.05);
    const cx = camera.position.x, cz = camera.position.z, cy = camera.position.y;
    const agl = cy - Math.max(0, world.heightAt(cx, cz));
    uniforms.uTilt.value = ss(12, 50, agl);
    for (let i = 0; i < COUNT; i++) {
      let x = base[i * 2] + drift.x * speed[i] - cx, z = base[i * 2 + 1] + drift.y * speed[i] - cz;
      x = ((x % SPAN) + SPAN) % SPAN - HALF; z = ((z % SPAN) + SPAN) % SPAN - HALF;
      const dist = Math.hypot(x, z);
      const wx = x + cx, wz = z + cz;
      const ground = Math.max(0, world.heightAt(wx, wz));
      const hgt = aShape[i * 4 + 1];
      const shore = world.shoreDist(wx, wz);
      // weight: full over the water and the beach, thinning inland and uphill; a few float at roof height
      const wShore = 0.6 + 0.4 * ss(240, 15, shore);
      const wLow = 0.6 + 0.4 * ss(17, 3, ground);
      const rim = ss(HALF - 6, HALF - 26, dist);
      const high = lift[i] > 0.78 ? 1 : 0;
      const y = ground + hgt * 0.42 + (high ? 5 + lift[i] * 6 : lift[i] * 1.6);
      // seen from far above, the bank reads as cotton on the ground; keep it but thinner
      const above = 1 - 0.55 * ss(25, 70, cy - y);
      aPos[i * 4] = wx; aPos[i * 4 + 1] = y; aPos[i * 4 + 2] = wz;
      aPos[i * 4 + 3] = amount * rim * above * (high ? 0.5 * weight[i] * wShore * wLow : 0.45 + 0.4 * weight[i] * wShore * wLow);
    }
    posAttr.needsUpdate = true;
  }

  return {
    mesh, update, count: COUNT,
    dispose() { geometry.dispose(); quad.dispose(); material.dispose(); },
  };
}
