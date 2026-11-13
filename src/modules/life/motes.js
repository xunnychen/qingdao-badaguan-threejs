// Motes: tiny additive points in a box that follows the camera (positions wrap, so they are anchored in the world).
// In the autumn afternoon they read as dust in the sun shafts, at dusk as back-lit midges: they brighten sharply when
// the view turns toward the sun. They are forward-scatter only (a cone around the sun, almost nothing elsewhere) and
// they live under the trees: in the open (beach, reef, promenade) additive points over sky and sea read as stars or
// snow, so the amount follows how much canopy stands around the camera.
import * as THREE from 'three';

const BOX = 13, N = 900;

export function createMotes(ctx, S) {
  const rand = ctx.rng.makeRng('life:motes');
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rand(); pos[i * 3 + 1] = rand(); pos[i * 3 + 2] = rand();
    seed[i * 4] = rand(); seed[i * 4 + 1] = rand(); seed[i * 4 + 2] = rand(); seed[i * 4 + 3] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uAmount: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 720 }, uMidge: { value: 0 },
  }]);
  uniforms.uTime = S.U.uTime; uniforms.uWind = S.U.uWind; uniforms.uSunDir = S.U.uSunDir;
  const mat = new THREE.ShaderMaterial({
    name: 'life:motes', uniforms, fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uScale, uMidge; uniform vec3 uWind, uSunDir;
      varying float vA;
      #include <fog_pars_vertex>
      void main() {
        // slow drift with the wind + a private wander (midges jitter much faster than dust)
        vec3 drift = uWind * uTime * 0.12 + vec3( 0.0, - uTime * 0.012 * ( 0.4 + aSeed.x ), 0.0 );
        float wf = mix( 0.35, 2.6, uMidge );
        drift += 0.22 * mix( 1.0, 0.6, uMidge ) * vec3( sin( uTime * wf * ( 0.5 + aSeed.y ) + aSeed.x * 40.0 ), sin( uTime * wf * ( 0.4 + aSeed.z ) + aSeed.y * 40.0 ), cos( uTime * wf * ( 0.45 + aSeed.w ) + aSeed.z * 40.0 ) );
        vec3 p = ( fract( position + ( drift - cameraPosition ) / ${BOX.toFixed(1)} ) - 0.5 ) * ${BOX.toFixed(1)};
        p.y *= 0.55;
        vec3 world = cameraPosition + p;
        vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        float d = length( p );
        float toSun = max( dot( normalize( p ), uSunDir ), 0.0 );
        float twinkle = 0.55 + 0.45 * sin( uTime * ( 1.5 + 4.0 * aSeed.w ) + aSeed.x * 60.0 );
        vA = ( 0.02 + 0.85 * pow( toSun, 4.0 ) ) * twinkle * smoothstep( 0.4, 1.3, d ) * ( 1.0 - smoothstep( ${(BOX * 0.36).toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, d ) );
        // steeply overhead a mote is seen against the brightest sky gaps: thin it there
        vA *= 1.0 - 0.75 * smoothstep( 0.3, 0.75, p.y / max( d, 1e-3 ) );
        // a mote smaller than a pixel fades instead of being held at a hard minimum size
        float px = uScale * ( 0.007 + 0.009 * aSeed.z ) / max( d, 0.3 );
        vA *= min( 1.0, px * px / 1.6 );
        gl_PointSize = clamp( px, 1.0, 4.0 );
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmount;
      varying float vA;
      #include <fog_pars_fragment>
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float a = smoothstep( 0.5, 0.12, length( q ) ) * vA * uAmount;
        // additive: fog only dims (mixing toward the fog colour would add light)
        float f = exp( - abs( fogNear ) * vFogDepth * 2.0 );
        gl_FragColor = vec4( uColor * a * f, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'life:motes'; pts.frustumCulled = false; pts.matrixAutoUpdate = false; pts.renderOrder = 5;
  S.group.add(pts);
  // how much canopy stands around the camera (0 in the open, 1 on a tree-lined street)
  const near = [];
  let cx = 1e9, cz = 1e9, canopyTarget = 0, canopy = -1;
  function measure(x, z) {
    near.length = 0;
    S.treesWithin(x, z, 16, near);
    let c = 0;
    for (const t of near) c += 1 - Math.min(1, Math.max(0, (Math.hypot(t.x - x, t.z - z) - t.r) / 6));
    canopyTarget = Math.min(1, Math.max(0, (c - 0.35) / 1.4));
  }
  return {
    update(dt) {
      const cur = ctx.env.current, cam = ctx.camera.position;
      if ((cam.x - cx) ** 2 + (cam.z - cz) ** 2 > 1) { cx = cam.x; cz = cam.z; measure(cx, cz); }
      canopy = canopy < 0 || !dt ? canopyTarget : canopy + (canopyTarget - canopy) * Math.min(1, dt * 1.5);
      uniforms.uAmount.value = cur.motes * canopy;
      uniforms.uColor.value.copy(cur.sunColor).multiplyScalar(0.6 + 0.25 * cur.sunIntensity);
      uniforms.uScale.value = ctx.viewport.height * ctx.viewport.pixelRatio;
      // low sun = midges
      uniforms.uMidge.value = Math.min(1, Math.max(0, (16 - cur.sunElevation) / 10));
      pts.visible = uniforms.uAmount.value > 0.01;
    },
    dispose() { S.group.remove(pts); geo.dispose(); mat.dispose(); },
  };
}
