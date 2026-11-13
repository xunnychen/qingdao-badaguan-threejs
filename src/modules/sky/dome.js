// Sky dome: art-directed gradient + sun glow + sun disc + two FBM cloud layers + analytic height-fog haze, one draw call.
//
// The dome is a unit sphere drawn at the far plane (gl_Position.z = w) AFTER the opaque scene, so the cloud shader only
// runs on pixels where sky is actually visible. It ignores the camera position and the model matrix, which lets the very
// same mesh be rendered into the PMREM cube camera (uEnv = 1: no sun disc, earth-coloured lower hemisphere).
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;

uniform sampler2D uNoise;
uniform vec3 uZenith, uHorizon, uGlow, uAnti;
uniform vec3 uSunColor, uCloudLit, uCloudShade, uGround;
uniform vec3 uSunDir;
uniform vec4 uDrift;        // xy: cumulus layer offset, zw: cirrus layer offset (noise uv)
uniform vec2 uWind;         // unit horizontal wind direction (x, z)
uniform float uHaze, uDisc, uCover, uDens;
uniform float uCamY;
uniform vec3 fogColor;      // scene fog, refreshed by the renderer (material.fog = true)
uniform float fogNear, fogFar;
uniform float uEnv;         // 1 while rendering the environment cube

const float PI = 3.14159265;

float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

// low cumulus density field (0..1), p in cloud-plane units
float cumulus( vec2 p ) {
  vec2 q = p + uDrift.xy;
  vec4 a = texture2D( uNoise, q * 0.21 );
  vec4 b = texture2D( uNoise, vec2( q.x * 0.8 - q.y * 0.6, q.x * 0.6 + q.y * 0.8 ) * 0.47 + 0.37 );
  float fine = texture2D( uNoise, q * 1.9 + 0.11 ).b;
  float big = texture2D( uNoise, q * 0.043 + 0.5 ).a;
  float n = a.r * 0.58 + b.g * 0.29 + fine * 0.13;
  // large clear / busy regions: shifts the field by up to +-0.13
  return n + ( big - 0.5 ) * 0.26;
}

void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  float hc = max( h, 0.0 );
  float mu = dot( d, uSunDir );
  float mu0 = max( mu, 0.0 );
  vec2 dh = d.xz / max( length( d.xz ), 1e-4 );
  vec2 sh = uSunDir.xz / max( length( uSunDir.xz ), 1e-4 );
  float muH = dot( dh, sh );

  float lowSun = 1.0 - smoothstep( 0.05, 0.5, uSunDir.y );

  // ---- clear-sky gradient ------------------------------------------------------------------------------------------
  float grad = pow( 1.0 - hc, mix( 5.6, 1.5, uHaze ) );
  // around the horizon: anti-solar tint behind you, warm glow under the sun
  vec3 hor = mix( uHorizon, uAnti, smoothstep( 0.15, -0.95, muH ) * 0.9 );
  float sunSide = smoothstep( -0.1, 1.0, muH );
  hor = mix( hor, uGlow, sunSide * sunSide * 0.6 );
  // a low sun burns the horizon under it: keep the band saturated instead of washing it to the glow colour
  hor = mix( hor, uHorizon, lowSun * smoothstep( 0.3, 1.0, muH ) * 0.45 );
  // ACES pulls warm bands toward yellow-grey: give a low sun its saturation back
  hor = max( mix( vec3( dot( hor, vec3( 0.2126, 0.7152, 0.0722 ) ) ), hor, 1.0 + 0.4 * lowSun ), 0.0 );
  // the zenith deepens a little straight overhead and away from the sun
  vec3 zen = uZenith * mix( 1.0, 0.84, hc * hc ) * mix( 0.94, 1.04, sunSide );
  vec3 col = mix( zen, hor, grad );
  // sun glow lobe (wide forward scattering + tight aureole)
  float lobe = pow( mu0, 8.0 ) * 0.22 + pow( mu0, 48.0 ) * 0.45;
  lobe *= mix( 0.6, 1.0, grad ) * mix( 1.0, 1.15, lowSun );
  col = mix( col, uGlow, clamp( lobe, 0.0, 0.9 ) );
  float aureole = pow( mu0, 700.0 ) * 0.9 + pow( mu0, 4000.0 ) * 1.6;

  // ---- clouds --------------------------------------------------------------------------------------------------------
  float cloudA = 0.0;
  float thin = 0.0;
  if ( h > 0.004 ) {
    // spherical shell projection: dense toward the horizon without the 1/h blow-up of a flat plane
    const float SH = 0.045;
    float dist = - h + sqrt( h * h + 2.0 * SH + SH * SH );
    vec2 p = d.xz * ( dist / SH );
    float horizonFade = smoothstep( 0.004, 0.11, h );

    // high streaks (cirrus): stretched along the wind, domain-warped so the bands curl instead of running as straight
    // parallel rays, patchy, and thinned out overhead where the stretch would be most obvious
    vec2 w = uWind;
    vec2 pc = vec2( dot( p, w ), dot( p, vec2( - w.y, w.x ) ) ) * 0.72 + uDrift.zw;
    vec4 wn = texture2D( uNoise, pc * vec2( 0.031, 0.062 ) + 0.4 );
    pc.y += ( wn.r - 0.5 ) * 3.2 + ( wn.a - 0.5 ) * 1.6;
    pc.x += ( wn.g - 0.5 ) * 2.4;
    vec2 pr = vec2( pc.x * 0.940 - pc.y * 0.342, pc.x * 0.342 + pc.y * 0.940 );   // 20 degrees between octaves
    float c1 = texture2D( uNoise, pc * vec2( 0.06, 0.27 ) + 0.21 ).g;
    float c2 = texture2D( uNoise, pr * vec2( 0.15, 0.71 ) + 0.63 ).r;
    float c3 = texture2D( uNoise, pc * vec2( 0.034, 0.047 ) ).a;
    float c4 = texture2D( uNoise, pr * vec2( 0.45, 1.9 ) + 0.17 ).b;
    float cir = c1 * 0.56 + c2 * 0.32 + c4 * 0.12 + ( c3 - 0.5 ) * 0.95;
    float cirT = 1.0 - mix( 0.22, 0.66, clamp( uCover * 1.15, 0.0, 1.0 ) );
    float cirA = smoothstep( cirT + 0.03, cirT + 0.33, cir );
    cirA *= cirA * mix( 0.2, 0.32, uCover ) * horizonFade * ( 1.0 - 0.75 * smoothstep( 0.4, 0.85, h ) );
    // lit colour; at a low sun only the streaks near the sun azimuth catch the glow, the rest go cool and dim
    vec3 cirCol = mix( uCloudLit, uGlow, 0.25 );
    vec3 cirCool = mix( uCloudShade, zen, 0.5 ) * 1.25;
    cirCol = mix( cirCol, cirCool, lowSun * ( 1.0 - smoothstep( 0.35, 0.95, muH ) * smoothstep( 0.7, 0.2, h ) ) );
    cirCol += uGlow * pow( mu0, 10.0 ) * 0.35;
    cirCol = mix( cirCol, hor, ( 1.0 - horizonFade ) * 0.7 + 0.12 );
    col = mix( col, cirCol, cirA );

    // low cumulus
    float thr = 1.0 - mix( 0.2, 0.9, uCover );
    float soft = mix( 0.15, 0.42, uCover );
    float n0 = cumulus( p );
    // one more octave eats into the edges only (the cores stay solid): crisp rims overhead where the base noise is
    // magnified, at the cost of a single extra fetch on sky pixels
    vec2 qe = p + uDrift.xy;
    float er = texture2D( uNoise, qe * 4.1 + 0.7 ).b * 0.75 + texture2D( uNoise, vec2( qe.y, - qe.x ) * 9.7 + 0.31 ).b * 0.25;
    float dens0 = smoothstep( thr, thr + soft, n0 );
    float sharp = mix( 0.7, 1.0, smoothstep( 0.55, 0.15, h ) );          // tighter threshold overhead
    float dens = smoothstep( thr, thr + soft * sharp, n0 - ( 1.0 - dens0 ) * ( er - 0.35 ) * 0.12 );
    if ( dens > 0.001 ) {
      // light: is there less cloud toward the sun? then this is a sunlit flank
      vec2 toSun = sh * mix( 0.5, 0.16, clamp( uSunDir.y * 1.6, 0.0, 1.0 ) );
      float n1 = cumulus( p + toSun );
      float lit = clamp( 0.62 + ( n0 - n1 ) * 3.4, 0.0, 1.0 );
      // looking toward the sun the thick cores go dark; looking away the faces are fully lit
      float back = mix( 1.0, 1.0 - dens * 0.75, smoothstep( 0.2, 1.0, mu ) );
      lit *= back * mix( 1.0, 0.72, dens * dens );
      vec3 cc = mix( uCloudShade, uCloudLit, lit );
      // silver lining: thin edges close to the sun forward-scatter
      thin = ( 1.0 - dens ) * dens * 4.0;
      cc += ( uGlow * 0.7 + uSunColor * 0.5 ) * thin * ( pow( mu0, 14.0 ) * 0.7 + pow( mu0, 160.0 ) * 2.2 );
      // aerial perspective: distant cloud banks sink into the horizon colour
      cc = mix( cc, hor, ( 1.0 - horizonFade ) * 0.8 + ( 1.0 - smoothstep( 0.0, 0.5, h ) ) * 0.22 );
      cloudA = ( 1.0 - exp( - dens * mix( 1.4, 5.0, uDens ) ) ) * horizonFade;
      col = mix( col, cc, cloudA );
    }
    cloudA = max( cloudA, cirA * 0.5 );
  }

  // ---- sun ---------------------------------------------------------------------------------------------------------
  float sunVis = ( 1.0 - uEnv );
  float lowDisc = 1.0 - smoothstep( 0.12, 0.3, uSunDir.y );         // a setting sun: bigger, dimmer, orange not white
  float veil = 1.0 - cloudA * mix( 0.1, 0.96, smoothstep( 0.3, 0.9, uDisc ) );
  // a low sun keeps only a faint aureole, or the disc edge dissolves into it
  col += uSunColor * aureole * uDisc * veil * sunVis * mix( 1.0, 0.12, lowDisc );
  float ang = acos( clamp( mu, -1.0, 1.0 ) );
  float rad = radians( mix( 1.05, 0.62, uDisc ) ) * mix( 1.0, 2.2, lowDisc );
  float disc = 1.0 - smoothstep( rad * mix( 0.55, 0.9, uDisc ), rad, ang );
  float d2 = uDisc * uDisc;
  float rr = clamp( ang / rad, 0.0, 1.0 );
  vec3 discCol = uSunColor * ( 1.5 + 46.0 * d2 * d2 ) * mix( 1.0, 0.82, rr );       // high sun: white-hot, limb darkened
  // setting sun. ACES turns ANY bright warm colour into cream (vec3( 1.0, 0.45, 0.16 ) * 6.0 comes out 254,247,235),
  // and the dusk sky around it is already near the shoulder, so the disc cannot win on brightness: it is drawn with
  // very saturated sources kept low on the curve instead, a gold core grading to a deep orange limb, and it REPLACES
  // the sky under it (max() would keep the sky's paler green / blue and wash the limb out)
  vec3 lowCol = mix( vec3( 1.0, 0.2, 0.02 ) * 2.1, vec3( 1.0, 0.07, 0.0 ) * 1.0, smoothstep( 0.15, 0.95, rr ) );
  lowCol *= mix( 0.4, 1.0, d2 * d2 );
  // the lower limb reddens through the thicker air
  lowCol *= mix( vec3( 1.0 ), vec3( 1.0, 0.8, 0.6 ), smoothstep( rad, - rad, h - uSunDir.y ) );
  discCol = mix( discCol, lowCol, lowDisc );
  vec3 over = mix( max( col, discCol ), discCol, lowDisc );
  col = mix( col, over, disc * veil * sunVis * step( 0.0, h + rad ) );

  // environment cube: the lower hemisphere is the ground bounce, not bright fog
  col = mix( col, uGround, uEnv * smoothstep( 0.02, -0.2, h ) );

  gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // ---- height fog along an infinite ray: the same integral, uniforms and position in the pipeline as core/fog.js,
  // so far terrain and sea melt into exactly this colour whether or not a post-processing chain is active ------------
  float fogK = max( fogFar, 1e-5 );
  float fogA = exp( - fogK * clamp( uCamY - 2.0, -10.0, 400.0 ) );
  // above the horizon the ray leaves the fog layer. Below it the dome is only ever seen from the air, past the far
  // edge of the sea and terrain meshes, which have themselves faded to pure fog colour there: so pure fog colour.
  float tau = abs( fogNear ) * fogA / ( fogK * max( h, 1e-4 ) );
  float ff = h > 0.0 ? 1.0 - exp( - tau ) : 1.0;
  // from altitude the analytic band above the horizon collapses to less than a pixel and the sky met the fog colour
  // with a razor edge: keep an art-directed minimum haze so the horizon is always a soft gradient (at street level
  // the integral is already thicker than this, so nothing changes there)
  float band = 0.02 + 0.06 * uHaze;
  float up = 1.0 - smoothstep( 0.0, band, h );
  ff = max( ff, up * up );
  // fogNear < 0: drawn into the linear HDR target, same correction as core/fog.js
  ff = mix( ff, pow( ff, 2.2 ), step( fogNear, 0.0 ) );
  // toward the sun the haze is forward-lit: let some of the glow through so silhouettes read against it
  ff *= 1.0 - ( pow( mu0, 24.0 ) * 0.3 * ( 1.0 - uHaze * 0.6 ) + disc * mix( 0.8, 0.93, lowDisc ) * sunVis ) * step( 0.0, h );
  ff *= 1.0 - uEnv * smoothstep( 0.02, -0.2, h );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, ff );
  gl_FragColor.rgb += ( hash12( gl_FragCoord.xy ) - 0.5 ) * ( 1.5 / 255.0 ) * ( 1.0 - uEnv );
}`;

export function createDome(ctx, noiseTex) {
  const uniforms = {
    uNoise: { value: noiseTex },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() }, uAnti: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    fogColor: { value: new THREE.Color() }, fogNear: { value: 0.001 }, fogFar: { value: 0.01 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uDrift: { value: new THREE.Vector4() }, uWind: { value: new THREE.Vector2(0, -1) },
    uHaze: { value: 0.4 }, uDisc: { value: 1 }, uCover: { value: 0.3 }, uDens: { value: 0.5 },
    uCamY: { value: 10 },
    uEnv: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'sky-dome', uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth,
    fog: true, // NOT the fog chunks: only so the renderer feeds fogColor / fogNear / fogFar (see the end of FRAG)
  });
  const geometry = new THREE.SphereGeometry(1, 48, 24); // 2208 triangles
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky-dome';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.renderOrder = 900; // last among the opaque objects: depth-rejected wherever anything else was drawn

  // twin for the environment cube scene (same geometry + material)
  const envMesh = new THREE.Mesh(geometry, material);
  envMesh.frustumCulled = false;
  envMesh.matrixAutoUpdate = false;

  return {
    mesh, envMesh, material, uniforms,
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
