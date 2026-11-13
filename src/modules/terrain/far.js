// Far field: one coarse tensor-grid mesh from the near rectangle out to +-1400 m following heightAt (太平山 to the
// north, 汇泉角 south-west, 太平角 east), tinted as a dark wooded suburb with a faint roof-red speckle. Seam skirts on
// both sides of the near/far boundary so there are no cracks. Does not receive shadows.
import * as THREE from 'three';
import { RECT, buildSpeckleTexture } from './textures.js';
import { patchMaterial } from './util.js';

const R = 1400;

function axis(a0, a1, inner) {
  const out = [], n = Math.round((a1 - a0) / inner);
  for (let i = 0; i <= n; i++) out.push(a0 + ((a1 - a0) * i) / n);
  for (const dir of [-1, 1]) {
    let pos = dir < 0 ? a0 : a1, step = inner * 1.3;
    while (Math.abs(pos) < R - 1) {
      pos += dir * step; step = Math.min(step * 1.32, 105);
      if (Math.abs(pos) > R - step * 0.4) pos = dir * R;
      if (dir < 0) out.unshift(pos); else out.push(pos);
    }
  }
  return out;
}

export function buildFar(ctx, group, edge) {
  const { world } = ctx;
  const { smoothstep, valueNoise2 } = ctx.rng;
  const coarse = ctx.quality.tier === 'low' ? 18 : 12;
  const xs = axis(RECT.x0, RECT.x1, coarse), zs = axis(RECT.z0, RECT.z1, coarse);
  const W = xs.length, H = zs.length;
  const pos = [], nor = [], col = [], mix = [], idx = [];
  const cRock = new THREE.Color('#70503f'), cAlgae = new THREE.Color('#23261e'), cBed = new THREE.Color('#6f6a52'), cDeep = new THREE.Color('#223a3c');
  const c = new THREE.Color();

  const pushVertex = (x, y, z, skirt = false) => {
    const e = 6;
    const hx = world.heightAt(x + e, z) - world.heightAt(x - e, z), hz = world.heightAt(x, z + e) - world.heightAt(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    const h = skirt ? y + 6 : y;
    if (h < 0) c.copy(cBed).lerp(cDeep, smoothstep(0, -8, h));
    else c.copy(cAlgae).lerp(cRock, smoothstep(0.7, 1.4, h)).multiplyScalar(0.85 + 0.3 * valueNoise2(x * 0.05, z * 0.05, 5));
    const out = Math.max(RECT.x0 - x, x - RECT.x1, RECT.z0 - z, z - RECT.z1, 0);
    pos.push(x, y, z); nor.push(-hx / l, (2 * e) / l, -hz / l); col.push(c.r, c.g, c.b);
    mix.push(smoothstep(2.6, 4.2, h), smoothstep(2, 60, out));
    return pos.length / 3 - 1;
  };

  // Run-off corridors: the streets carry on over this coarse mesh for up to 170 m, and a 12-100 m facet rides up to
  // 0.3 m above heightAt, which laid a band of grass across the carriageway. Every cell a corridor touches is lowered
  // by exactly what it needs to stay 0.14 m under the true ground there (the near mesh's own corridor drop is 0.12).
  const HV = new Float32Array(W * H), LOW = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) HV[j * W + i] = world.heightAt(xs[i], zs[j]);
  {
    const find = (arr, v) => { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; } return lo; };
    const need = new Map(), q = {};
    for (const st of ctx.map.streets) {
      const reach = st.wallOff + 1.2, no = Math.ceil(reach / 1.4);
      for (let s = 0; s <= st.len; s += 1.4) {
        world.pointAt(st, s, q);
        const cx = q.x, cz = q.z, ox = q.tz, oz = -q.tx;
        if (cx > RECT.x0 + reach && cx < RECT.x1 - reach && cz > RECT.z0 + reach && cz < RECT.z1 - reach) continue;
        for (let o = -no; o <= no; o++) {
          const x = cx + (ox * o * reach) / no, z = cz + (oz * o * reach) / no;
          if (x > RECT.x0 && x < RECT.x1 && z > RECT.z0 && z < RECT.z1) continue;
          if (Math.abs(x) >= R || Math.abs(z) >= R) continue;
          const i = find(xs, x), j = find(zs, z), k = j * W + i;
          const u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - zs[j]) / (zs[j + 1] - zs[j]);
          const a = HV[k], b = HV[k + 1], cc = HV[k + W], d = HV[k + W + 1];
          const far = u + v < 1 ? a + (b - a) * u + (cc - a) * v : d + (cc - d) * (1 - u) + (b - d) * (1 - v);
          const n = far - (world.heightAt(x, z) - 0.14);
          if (n > (need.get(k) || 0)) need.set(k, n);
        }
      }
    }
    for (const [k, n] of need) for (const v of [k, k + 1, k + W, k + W + 1]) LOW[v] = Math.max(LOW[v], n);
    for (let k = 0; k < W * H; k++) HV[k] -= LOW[k];
  }

  const id = new Int32Array(W * H).fill(-1);
  const inside = (i, j) => xs[i] > RECT.x0 - 0.01 && xs[i] < RECT.x1 + 0.01 && zs[j] > RECT.z0 - 0.01 && zs[j] < RECT.z1 + 0.01;
  const strictlyInside = (i, j) => xs[i] > RECT.x0 + 0.01 && xs[i] < RECT.x1 - 0.01 && zs[j] > RECT.z0 + 0.01 && zs[j] < RECT.z1 - 0.01;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (strictlyInside(i, j)) continue;
    id[j * W + i] = pushVertex(xs[i], HV[j * W + i], zs[j]);
  }
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    if (inside(i, j) && inside(i + 1, j) && inside(i, j + 1) && inside(i + 1, j + 1)) continue; // covered by the near mesh
    const a = id[j * W + i], b = id[j * W + i + 1], cc = id[(j + 1) * W + i], d = id[(j + 1) * W + i + 1];
    idx.push(a, cc, b, b, cc, d);
  }
  // seam skirts: (1) below the far mesh's inner boundary, (2) below the near mesh's perimeter
  const skirt = (ring) => {
    let prevT = -1, prevB = -1;
    for (let k = 0; k <= ring.length; k++) {
      const p = ring[k % ring.length];
      const t = pushVertex(p[0], p[1], p[2]), b = pushVertex(p[0], p[1] - 6, p[2], true);
      if (prevT >= 0) idx.push(prevT, prevB, t, t, prevB, b);
      prevT = t; prevB = b;
    }
  };
  const ring = [];
  const iL = xs.findIndex((x) => Math.abs(x - RECT.x0) < 0.01), iR = xs.findIndex((x) => Math.abs(x - RECT.x1) < 0.01);
  const jT = zs.findIndex((z) => Math.abs(z - RECT.z0) < 0.01), jB = zs.findIndex((z) => Math.abs(z - RECT.z1) < 0.01);
  const P = (i, j) => [xs[i], HV[j * W + i], zs[j]];
  for (let i = iL; i <= iR; i++) ring.push(P(i, jT));
  for (let j = jT + 1; j <= jB; j++) ring.push(P(iR, j));
  for (let i = iR - 1; i >= iL; i--) ring.push(P(i, jB));
  for (let j = jB - 1; j > jT; j--) ring.push(P(iL, j));
  skirt(ring);
  skirt(edge);

  // canopy lumps on the hills: without them 太平山 is a smooth dome. Low five-sided blobs, same material and draw call,
  // break its silhouette into tree tops (wide, low mounds of canopy rather than single trees).
  {
    const rand = ctx.rng.makeRng('terrain:far-trees'), NT = ctx.quality.tier === 'low' ? 600 : 1200, K = 5;
    const lump = (x, z, h, r, tall, a0) => {
      const base = pos.length / 3;
      for (let k = 0; k < K; k++) {
        const a = a0 + (k / K) * 6.2832, cx = Math.cos(a), cz = Math.sin(a);
        pos.push(x + cx * r * 0.8, h - 2, z + cz * r * 0.8, x + cx * r, h + tall * 0.42, z + cz * r);
        // normals stay close to the ground's so a mound shades like the canopy around it and only its outline reads
        nor.push(cx * 0.62, 0.78, cz * 0.62, cx * 0.45, 0.89, cz * 0.45);
        col.push(0, 0, 0, 0, 0, 0); mix.push(0.8, 1, 0.9, 1);
      }
      pos.push(x, h + tall, z); nor.push(0, 1, 0); col.push(0, 0, 0); mix.push(1, 1);
      const apex = base + 2 * K;
      for (let k = 0; k < K; k++) {
        const b0 = base + 2 * k, b1 = base + 2 * ((k + 1) % K);
        idx.push(b0, b0 + 1, b1, b1, b0 + 1, b1 + 1, b0 + 1, apex, b1 + 1);
      }
    };
    let made = 0;
    for (let tries = 0; tries < NT * 40 && made < NT; tries++) {
      const x = rand.range(-1280, 1280), z = rand.range(-1280, 1280);
      if (Math.max(RECT.x0 - x, x - RECT.x1, RECT.z0 - z, z - RECT.z1) < 130) continue;
      const h = world.heightAt(x, z);
      if (h < 16 || rand() > smoothstep(16, 60, h)) continue;
      made++;
      lump(x, z, h, rand.range(7, 13), rand.range(5, 9.5), rand.range(0, 6.283));
    }
    // the same canopy on the two headlands that close every sea view (汇泉角 south-west, 太平角 east): dense woodland
    // above a bare rock foot, thickest on the seaward slopes and crests that make the skyline
    const randH = ctx.rng.makeRng('terrain:far-headlands'), NH = ctx.quality.tier === 'low' ? 520 : 1050;
    made = 0;
    for (let tries = 0; tries < NH * 60 && made < NH; tries++) {
      const west = randH() < 0.42;
      const x = west ? randH.range(-800, -345) : randH.range(345, 880), z = randH.range(-240, 600);
      const keep = randH(), r = randH.range(6.5, 11.5), tall = randH.range(6, 11), a0 = randH.range(0, 6.283);
      const h = world.heightAt(x, z);
      if (h < 4.6) continue;
      const sd = world.shoreDist(x, z);
      if (sd < 9 || keep > (0.35 + 0.65 * smoothstep(380, 90, sd)) * smoothstep(345, 400, Math.abs(x))) continue;
      made++;
      lump(x, z, h, r, tall * smoothstep(4.6, 9, h + sd * 0.05), a0);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setAttribute('aMix', new THREE.BufferAttribute(new Float32Array(mix), 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere(); geo.computeBoundingBox();

  const speck = buildSpeckleTexture(ctx);
  const uniforms = {
    uSpeck: { value: speck },
    uWood: { value: new THREE.Color('#324e35') }, uNear: { value: new THREE.Color('#4a5a28') }, uRoof: { value: new THREE.Color('#b5482e') },
  };
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide }), 'badaguan-terrain-far', uniforms, (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aCol;\nattribute vec2 aMix;\nvarying vec3 vFP;\nvarying vec3 vFCol;\nvarying vec2 vFMix;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFP = position; vFCol = aCol; vFMix = aMix;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
varying vec3 vFP;
varying vec3 vFCol;
varying vec2 vFMix;
uniform sampler2D uSpeck;
uniform vec3 uWood, uNear, uRoof;
vec2 tFarN;
const mat2 FROT = mat2( 0.7986, -0.6018, 0.6018, 0.7986 );
// two rotated octaves of the canopy tile (53 m and 87 m) so the repeat never lines up
float farCanopy( vec2 p ) { return texture2D( uSpeck, p / 53.0 ).g * 0.62 + texture2D( uSpeck, ( FROT * p ) / 87.0 + 0.37 ).g * 0.38; }
float farHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
`)
      .replace('#include <map_fragment>', /* glsl */ `
{
  vec2 p = vFP.xz;
  float crown = farCanopy( p );
  float big = texture2D( uSpeck, p.yx / 631.0 + 0.3 ).g;
  float big2 = texture2D( uSpeck, ( FROT * p ) / 977.0 + 0.61 ).g;
  float wooded = vFMix.x * vFMix.y;
  tFarN = vec2( crown - farCanopy( p + vec2( 0.7, 0.0 ) ), crown - farCanopy( p + vec2( 0.0, 0.7 ) ) ) * ( 3.2 * wooded );
  vec3 wood = uWood * ( 0.2 + 0.86 * crown ) * ( 0.72 + 0.56 * big ) * mix( 1.0, 0.82, smoothstep( 30.0, 110.0, vFP.y ) );
  vec3 land = mix( uNear * ( 0.75 + 0.5 * big ), wood, vFMix.y );
  // a thin scatter of red-tiled roofs among the trees on the low ground only: one small jittered rectangle per cell
  vec2 cp = p / 27.0, ci = floor( cp );
  float h1 = farHash( ci ), h2 = farHash( ci + 17.3 ), h3 = farHash( ci + 41.7 );
  float ang = h1 * 6.2832;
  vec2 q = mat2( cos( ang ), - sin( ang ), sin( ang ), cos( ang ) ) * ( fract( cp ) - 0.5 - ( vec2( h2, h3 ) - 0.5 ) * 0.4 );
  vec2 hs = vec2( 0.15 + 0.1 * h3, 0.1 + 0.05 * h2 );
  float aa = 0.012 + length( vViewPosition ) * 0.00006;
  float roof = ( 1.0 - smoothstep( hs.x - aa, hs.x + aa, abs( q.x ) ) ) * ( 1.0 - smoothstep( hs.y - aa, hs.y + aa, abs( q.y ) ) );
  roof *= step( 0.5, farHash( ci + 71.9 ) ) * smoothstep( 0.4, 0.62, big2 ) * ( 1.0 - smoothstep( 14.0, 30.0, vFP.y ) ) * wooded;
  roof *= 1.0 - smoothstep( 500.0, 1100.0, length( vViewPosition ) );
  land = mix( land, uRoof * ( q.y > 0.0 ? 0.62 : 0.4 ) * ( 0.8 + 0.4 * h2 ), roof * 0.8 );
  tFarN *= 1.0 - roof;
  diffuseColor.rgb = mix( vFCol, land, vFMix.x );
}`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize( normal + ( viewMatrix * vec4( tFarN.x, 0.0, tFarN.y, 0.0 ) ).xyz );');
  });
  mat.name = 'terrain-far';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain-far';
  mesh.receiveShadow = false; mesh.castShadow = false;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  group.add(mesh);

  return { uniforms, triangles: idx.length / 3, dispose() { geo.dispose(); mat.dispose(); speck.dispose(); } };
}
