// Reef rocks: 太平角's weathered pinkish-tan to rust granite. Rounded, stepped boulders in four base shapes (smooth
// normals, only the sharp arrises of the ledges stay hard), instanced. placeRocks() is pure (runs under Node); buildRocks() makes the meshes and registers colliders.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// base shapes: [icosahedron detail, squash y, jaggedness, terrace strength, bedding tilt]
const SHAPES = [
  { name: 'boulder', detail: 3, sy: 0.92, jag: 0.26, ridge: 0.15, terrace: 0.78, tilt: 0.22, boxy: 0.22, crease: 0.68, seed: 11 },  // big rounded block
  { name: 'chunk',   detail: 1, sy: 0.82, jag: 0.26, ridge: 0.08, terrace: 0.25, tilt: -0.3, boxy: 0.36, crease: 0.85, seed: 23 },  // small rock
  { name: 'slab',    detail: 1, sy: 0.4,  jag: 0.18, ridge: 0.06, terrace: 0.8,  tilt: 0.12, boxy: 0.66, crease: 0.72, seed: 37 },  // flat ledge / shelf
  { name: 'cobble',  detail: 0, sy: 0.7,  jag: 0.22, ridge: 0.0, terrace: 0.0,  tilt: 0.0,  boxy: 0, crease: 1.3, seed: 51 },  // loose stones (20 triangles)
];
// the platform under the boulders (terrain package) is #7d5644 / #96684c with a little #b08a62: the same family here
const PALETTE = ['#7D5644', '#8A5F4A', '#96684C', '#84594A', '#9C6B4E', '#A67C5A'];
// instances are split alongshore so the shadow cascades and the main frustum can cull them: [name, test(x)]
const CELLS = [['w', (x) => x < 0], ['e1', (x) => x >= 0 && x < 140], ['e2', (x) => x >= 140]];
const STRIKE = 0.85;   // compass-ish direction of the granite's joints: ledges all over the reef line up with it

// ----------------------------------------------------------------------------------------------------------------------
/**
 * Decide where every rock goes. Returns [{x, y, z, sx, sy, sz, rot, tiltX, tiltZ, type, tone, r, top, wet}]
 * (r = plan radius in metres, top = height of the crown above the local ground/water).
 */
export function placeRocks({ world, map, rng }, layout) {
  const { smoothstep } = rng;
  const out = [];
  const info = {};
  // things that must stay clear
  const keep = [];
  for (const f of map.figures) keep.push([f.x, f.z, 2.4, 0.3]);                 // [x, z, radius, max rock size allowed inside]
  for (const id in map.views) { const v = map.views[id]; if ((v.h ?? 1.65) < 4) keep.push([v.x, v.z, 2.6, 0]); }
  keep.push([layout.landing.x, layout.landing.z, layout.landing.r + 0.8, 0]);
  // lanes from every rail opening down to the water stay free of anything you cannot step over
  const lanes = layout.openings.map((o) => ({ x: o.x, z: o.z, nx: o.nx, nz: o.nz }));

  const allowed = (x, z, size, inWater) => {
    if (Math.abs(x) > 291) return false;
    world.backInfo(x, z, info);
    if (info.b > -(2.5 + 0.25 + size * 0.42)) return false;                    // never on the coast path strip
    const h = world.heightAt(x, z);
    const s = world.shoreDist(x, z);
    if (s <= 0) { if (!inWater && h < -0.3 - size * 0.32) return false; }       // only rocks big enough to break the surface
    else if (world.beachness(info.x) > 0.5 && !(info.x < -238 || info.x > 60)) return false; // not on the bathing beach
    for (const k of keep) { const d = Math.hypot(x - k[0], z - k[1]); if (d < k[2] + size * 0.5 && size > k[3]) return false; }
    if (size > 0.75) for (const l of lanes) {
      const ex = x - l.x, ez = z - l.z, along = ex * l.nx + ez * l.nz, across = Math.abs(ex * l.nz - ez * l.nx);
      if (along > -1 && along < 26 && across < 1.5 + size * 0.5) return false;
    }
    return true;
  };

  const add = (x, z, size, rand, opt = {}) => {
    if (!allowed(x, z, size, opt.inWater)) return false;
    const h = world.heightAt(x, z);
    let type = opt.type;
    if (type == null) {
      if (size < 0.9) type = 3;
      else if (size < 2.5) type = rand.chance(0.6) ? 1 : 2;
      else type = rand.chance(0.78) ? 0 : 2;
    }
    const sh = SHAPES[type];
    const a = opt.aspect || rand.range(0.8, 1.25);   // aspect > 1: a long ledge (local x is the long axis)
    const sx = (size / 2) * a, sz = (size / 2) / a * rand.range(0.85, 1.15);
    const sy = (size / 2) * rand.range(0.95, 1.4) * (opt.tall || 1);
    const base = h < 0 ? Math.max(h, -0.25 - sy * sh.sy * 0.45) : h;
    const sink = sy * 0.14;            // skerries stand on a hidden plinth
    const top = base + sy * sh.sy * 0.92 - sink - Math.max(h, 0);
    const rock = {
      x, z, y: base - sink, sx, sy, sz, rot: opt.rot ?? rand.range(0, Math.PI * 2),
      tiltX: (opt.dipX || 0) + rand.range(-0.14, 0.14) * (opt.rot == null ? 1 : 0.4),
      tiltZ: (opt.dipZ || 0) + rand.range(-0.14, 0.14) * (opt.rot == null ? 1 : 0.4), type,
      tone: opt.tone ?? rand(), pale: smoothstep(0.4, 2.6, h + rand.range(-0.5, 0.5)),
      r: Math.max(sx, sz), fr: Math.sqrt(sx * sz), top, wet: h < 0.3,
    };
    // a rock that only just breaks the surface shows as a dark sliver awash (decided after every random draw, so the
    // rest of the layout does not depend on it)
    if (h < 0.1 && top < 0.38 && !opt.inWater) {
      if (type === 3 || h < -0.45) return false;
      const lift = 0.42 - top;                        // a ledge at the tide line stands clear of the wash instead
      rock.y += lift; rock.top = 0.42;
    }
    out.push(rock);
    return true;
  };

  // 1. hand-placed heroes: the headland point, skerries standing in the water, the western rocks
  {
    const rand = rng.makeRng('coast:rocks:hero');
    const heroes = [
      // x, z, size, type, tall
      [86, 181, 5.2, 0, 1.0], [92.5, 184.5, 3.6, 0, 1.49], [79, 180.5, 3.2, 0, 0.9], [99, 180, 2.8, 2, 1], [74, 176, 2.6, 0, 1.43],
      [90, 194, 4.4, 0, 1.62], [101, 191, 2.6, 0, 1.1], [70, 191, 3.0, 0, 1.56], [58, 181, 2.2, 0, 1.1], [112, 180, 2.4, 0, 1.1],
      [127, 158, 3.4, 0, 1.62], [150, 131, 2.8, 0, 1.2], [162, 121, 4.2, 0, 1.69], [181, 100, 2.6, 0, 1.2], [206, 72, 3.8, 0, 1.62],
      [219, 60, 2.4, 0, 1.2], [238, 36, 3.2, 0, 1.69], [249, 22, 2.6, 0, 1.2], [268, 2, 3.6, 0, 1.69],
      [-244, 154, 4.2, 0, 1.62], [-252, 149, 3.0, 0, 1.1], [-236, 147, 2.4, 0, 1.2], [-258, 160, 3.4, 0, 1.69], [-247, 141, 2.2, 2, 1],
      [-266, 150, 2.8, 0, 1.1],
    ];
    for (const [x, z, size, type, tall] of heroes) {
      add(x + rand.range(-0.6, 0.6), z + rand.range(-0.6, 0.6), size * rand.range(0.92, 1.1), rand, { type, tall, inWater: true });
    }
  }

  // A ledge: 3 to 6 slabs and blocks that overlap and share one strike and dip, so their bedding lines agree and they
  // read as one jointed outcrop instead of separate stones. Loose cobbles only fill the gaps beside it.
  const ledge = (cx, cz, rand, scale = 1) => {
    const strike = STRIKE + rand.range(-0.28, 0.28);
    const ax = Math.cos(strike), az = -Math.sin(strike);          // world direction of local +x
    const dipX = rand.range(-0.05, 0.05), dipZ = rand.range(0.04, 0.16) * (rand.chance(0.8) ? 1 : -1);
    const tone = rand.range(0.1, 0.9);
    const n = rand.int(3, 6);
    let along = rand.range(-1.5, 0), made = 0;
    for (let i = 0; i < n; i++) {
      const k = rand();
      const type = k < 0.6 ? 2 : k < 0.72 ? 0 : 1;
      const size = (type === 2 ? rand.range(2.3, 4.2) : type === 0 ? rand.range(2.2, 3.6) : rand.range(1.5, 2.6)) * scale;
      const aspect = type === 2 ? rand.range(1.35, 1.9) : rand.range(1.0, 1.3);
      const across = rand.range(-0.55, 0.55) * size;
      const x = cx + ax * along - az * across, z = cz + az * along + ax * across;
      if (add(x, z, size, rand, { type, aspect, rot: strike + rand.range(-0.13, 0.13) + (rand.chance(0.5) ? Math.PI : 0),
        dipX, dipZ, tone: Math.min(1, Math.max(0, tone + rand.range(-0.14, 0.14))),
        tall: type === 2 ? rand.range(1.0, 1.7) : rand.range(0.85, 1.25) })) made++;
      along += size * aspect * rand.range(0.3, 0.5);               // the next one overlaps this one
    }
    if (made) for (let i = 0; i < 2; i++) {
      const a = rand.range(0, Math.PI * 2), d = rand.range(1.2, 3.4) * scale;
      add(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rand.range(0.35, 0.85), rand);
    }
    return made;
  };

  // 2. clusters from the world plan: outcrops, densest in the middle
  {
    const rand = rng.makeRng('coast:rocks:clusters');
    for (const [cx, cz, cr] of map.coast.reefClusters) {
      const n = Math.max(2, Math.round((cr * cr) / 62));
      for (let i = 0; i < n; i++) {
        const a = rand.range(0, Math.PI * 2), d = cr * Math.pow(rand(), 0.7) * 0.92;
        ledge(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rand, 1.12 - 0.3 * (d / cr));
      }
    }
  }

  // 3. the rocky shore between the boardwalk and the water (and the run-off beyond x = 250): a broken line of ledges
  //    along the tide line, a sparser second rank up the shore, cobbles in between
  {
    const rand = rng.makeRng('coast:rocks:shore');
    for (const s of layout.segs) {
      for (let u = 1.5; u < s.len; u += 7.2) {
        const uu = u + rand.range(-2, 2);
        const px = s.ax + s.tx * uu, pz = s.az + s.tz * uu;
        // find the shore width along the seaward normal
        let w = 3;
        while (w < 60 && world.shoreDist(px + s.nx * w, pz + s.nz * w) > 0) w += 1.0;
        if (w < 7) continue;
        const e1 = Math.max(4.6, w + rand.range(-3.6, 0.6));
        ledge(px + s.nx * e1, pz + s.nz * e1, rand, rand.range(0.85, 1.15));
        if (w > 13 && rand.chance(0.42)) {
          const e2 = 4.8 + (w - 8.5) * rand.range(0.15, 0.7), v = rand.range(-3, 3);
          ledge(px + s.nx * e2 + s.tx * v, pz + s.nz * e2 + s.tz * v, rand, rand.range(0.7, 0.95));
        }
        for (let k = 0; k < 2; k++) {                                 // strays
          const v = rand.range(-3.6, 3.6), e = 3.4 + Math.pow(rand(), 0.7) * (w - 2.4);
          add(px + s.nx * e + s.tx * v, pz + s.nz * e + s.tz * v, rand.chance(0.25) ? rand.range(1.0, 1.7) : rand.range(0.35, 0.85), rand);
        }
      }
    }
  }

  // 4. flat shelves around the wedding couple's spot on the reef (walkable: they stay low)
  {
    const rand = rng.makeRng('coast:rocks:shelf');
    const f = map.figures.find((q) => q.id === 'wed-reef');
    if (f) for (let i = 0; i < 5; i++) {
      const a = rand.range(0, Math.PI * 2), d = rand.range(3.4, 6.5);
      add(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, rand.range(1.6, 2.4), rand, { type: 2, tall: 0.55 });
    }
  }
  return out;
}

// ----------------------------------------------------------------------------------------------------------------------
function rockGeometry(ctx, sh) {
  const { valueNoise2 } = ctx.rng;
  let g = new THREE.IcosahedronGeometry(1, sh.detail); // non-indexed: 20 * (detail+1)^2 faces
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const ct = Math.cos(sh.tilt), st = Math.sin(sh.tilt);
  const n3 = (x, y, z, f, seed) => valueNoise2(x * f + y * 1.71 * f + 5.3, z * f - y * 1.37 * f + 9.1, seed);
  const v = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // quantise so the duplicated corner vertices of neighbouring faces get identical noise (and weld when smoothed)
    const qx = Math.round(v.x * 1e4) / 1e4, qy = Math.round(v.y * 1e4) / 1e4, qz = Math.round(v.z * 1e4) / 1e4;
    // low-frequency lobes, then a ridged octave: rounded masses with a few weathered spines, no crystal facets
    const rid = 1 - Math.abs(2 * n3(qx, qy, qz, 2.3, sh.seed + 7) - 1);
    let r = 1 + sh.jag * (n3(qx, qy, qz, 0.95, sh.seed) - 0.5) * 2 + sh.jag * 0.3 * (n3(qx, qy, qz, 2.6, sh.seed + 3) - 0.5) * 2
      + sh.ridge * (rid * rid - 0.35);
    r = Math.max(0.6, r);
    // jointed granite breaks into blocks: pull the ball toward a cube (flat top, steep faces, rounded edges)
    if (sh.boxy) r *= (1 + sh.boxy * (1 / Math.max(Math.abs(qx), Math.abs(qy), Math.abs(qz)) - 1)) * (1 - 0.2 * sh.boxy);
    v.set(qx * r, qy * r, qz * r);
    // stepped ledges: terrace along a tilted axis, so the risers dip together like sheeting joints
    let ty = v.y * ct + v.x * st;
    const tx = v.x * ct - v.y * st;
    const step = 0.3;
    const q = Math.round(ty / step) * step;
    ty += (q - ty) * sh.terrace;
    v.x = tx * ct + ty * st; v.y = ty * ct - tx * st;
    // flatten the buried underside a little, squash
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.5;
    v.y *= sh.sy;
    pos.setXYZ(i, v.x, v.y, v.z);
    // vertex tone: soft blotches (same for welded corners) and a darker foot, where the rock sits in its own shade
    const blot = 0.9 + 0.2 * n3(qx, qy, qz, 1.7, sh.seed + 19);
    const c = blot * (0.8 + 0.2 * Math.min(1, Math.max(0, v.y / sh.sy + 0.75)));
    col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // smooth shading; only edges sharper than the crease angle (the arrises of ledges and block corners) stay hard
  g = toCreasedNormals(g, sh.crease);
  g.computeBoundingSphere();
  return g;
}

// Weathered granite: soft blotches and a salt-and-pepper crystal speckle (feldspar, quartz, biotite). No drawn joints
// (on a boulder they read as paving lines): the relief is in the geometry and in the normal map.
function rockTexture(ctx) {
  const { tex } = ctx;
  const size = 256;
  const n1 = tex.tileFbm(size, 4, 3, 301), n2 = tex.tileFbm(size, 8, 2, 302), fade = tex.tileFbm(size, 3, 2, 304);
  const rand = ctx.rng.makeRng('coast:rocks:tex');
  // crystals: every grain is a 1 to 3 px fleck drawn into a float layer (a real PRNG: a lattice hash at this density
  // lines up into parallel streaks)
  const speck = new Float32Array(size * size);
  for (let n = 0; n < 9000; n++) {
    const x = rand.int(0, size - 1), y = rand.int(0, size - 1), k = rand();
    const v = k < 0.4 ? -rand.range(0.5, 1) : k < 0.8 ? rand.range(0.4, 1) : rand.range(0.1, 0.4);    // biotite / feldspar / quartz
    const w = rand.chance(0.3) ? 2 : 1, h = rand.chance(0.3) ? 2 : 1;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) speck[((y + dy) % size) * size + ((x + dx) % size)] = v;
  }
  const { canvas, g } = tex.makeCanvas(size);
  const img = g.createImageData(size, size), d = img.data;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, o = i * 4;
    let v = 0.86 + (n1[i] - 0.5) * 0.26 + (n2[i] - 0.5) * 0.12 + speck[i] * 0.13;
    v = Math.min(1, Math.max(0.3, v));
    const warm = 0.5 + (n1[i] - 0.5) * 1.6 + Math.max(0, speck[i]) * 0.3;
    d[o] = 255 * Math.min(1, v * (1.0 + 0.04 * warm)); d[o + 1] = 255 * v * (0.965 + 0.015 * warm); d[o + 2] = 255 * v * (0.93 - 0.03 * warm); d[o + 3] = 255;
    height[i] = n1[i] * 0.55 + n2[i] * 0.3 + speck[i] * 0.045;
  }
  g.putImageData(img, 0, 0);
  const map = tex.canvasTexture(canvas, { srgb: true });
  const normalMap = tex.canvasTexture(tex.normalFromHeight(height, size, 4), { srgb: false });
  return { map, normalMap };
}

export function buildRocks(ctx, rocks, group) {
  const { collision } = ctx;
  const t = rockTexture(ctx);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, vertexColors: true });
  mat.name = 'coast:reef';
  // Triplanar granite in world metres (the normals are smooth now, so a per-facet projection would smear), and the
  // tide marks by world height: wet olive-black algae at the water, a pale barnacle line, rust rock, salt-bleached
  // pink-buff tops. The same heights as the platform under the boulders (terrain ground shader).
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uReefMap = { value: t.map };
    shader.uniforms.uReefNor = { value: t.normalMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vReefW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 rw = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            rw = instanceMatrix * rw;
          #endif
          vReefW = ( modelMatrix * rw ).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vReefW;\nuniform sampler2D uReefMap, uReefNor;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 rWn = normalize( inverseTransformDirection( normal, viewMatrix ) );
        vec3 rBw = pow( abs( rWn ), vec3( 4.0 ) ); rBw /= rBw.x + rBw.y + rBw.z;
        vec3 rP = vReefW * 0.42;
        vec2 rUx = rP.zy * vec2( 1.0, 1.1 ), rUz = rP.xy * vec2( 1.0, 1.1 ) + 0.37;
        vec2 rUy = vec2( rP.x * 0.8 + rP.z * 0.6, rP.z * 0.8 - rP.x * 0.6 );
        vec3 rAlb = texture2D( uReefMap, rUx ).rgb * rBw.x + texture2D( uReefMap, rUy ).rgb * rBw.y + texture2D( uReefMap, rUz ).rgb * rBw.z;
        vec2 rTx = texture2D( uReefNor, rUx ).xy - 0.5, rTy = texture2D( uReefNor, rUy ).xy - 0.5, rTz = texture2D( uReefNor, rUz ).xy - 0.5;
        // metre-scale mottling: grey-pink to tan patches that run across neighbouring boulders
        vec3 rMot = texture2D( uReefMap, vReefW.xz * 0.061 + vReefW.y * 0.043 ).rgb;
        float rN = clamp( ( rMot.g - 0.7 ) * 2.2 + 0.5, 0.0, 1.0 );
        vec3 rock = diffuseColor.rgb * rAlb * 1.12;
        float rLum = dot( rock, vec3( 0.2126, 0.7152, 0.0722 ) );
        rock = mix( rock, vec3( rLum ) * vec3( 1.04, 1.0, 0.95 ), 0.22 * rN ) * ( 0.9 + 0.2 * rN );
        float rH = vReefW.y + ( rN - 0.5 ) * 0.34;
        float rUp = smoothstep( 0.1, 0.75, rWn.y );
        // salt-bleached tops: paler, desaturated pink-buff where the spray dries on upward faces
        float rSalt = smoothstep( 1.25, 2.3, rH ) * ( 0.3 + 0.7 * rUp ) * ( 0.55 + 0.45 * rN );
        rock = mix( rock, ( vec3( rLum ) * 0.5 + rock * 0.5 ) * vec3( 1.24, 1.17, 1.08 ), rSalt * 0.48 );
        // splash zone: damp and darker
        float rWet = 1.0 - smoothstep( 1.0, 1.8, rH );
        rock *= 1.0 - 0.3 * rWet;
        // barnacle line just above the algae: a broken pale grey crust
        vec2 rBs = vec2( 2.7, 2.9 );
        float rBt = texture2D( uReefMap, rUx * rBs ).g * rBw.x + texture2D( uReefMap, rUy * rBs ).g * rBw.y + texture2D( uReefMap, rUz * rBs ).g * rBw.z;
        float rBarn = smoothstep( 0.86, 1.04, rH ) * ( 1.0 - smoothstep( 1.1, 1.42, rH ) ) * smoothstep( 0.7, 0.9, rBt + ( rN - 0.5 ) * 0.12 );
        rock = mix( rock, vec3( 0.3, 0.29, 0.255 ), rBarn * 0.5 );
        // algae and weed below the tide line: wet olive-black
        float rBand = smoothstep( 0.74, 1.08, rH );
        vec3 rAlgae = mix( vec3( 0.024, 0.026, 0.018 ), vec3( 0.036, 0.05, 0.024 ), rN ) * ( 0.7 + 0.6 * rAlb.g );
        diffuseColor.rgb = mix( rAlgae, rock, 0.06 + 0.94 * rBand );
        roughnessFactor = mix( 0.42, mix( 0.68, roughnessFactor, 1.0 - rWet ), rBand );
        // triplanar normal map (UDN blend), flattened under the slick algae
        vec3 rD = vec3( 0.0, rTx.y, rTx.x ) * rBw.x + vec3( rTy.x * 0.8 - rTy.y * 0.6, 0.0, rTy.x * 0.6 + rTy.y * 0.8 ) * rBw.y + vec3( rTz.x, rTz.y, 0.0 ) * rBw.z;
        // plus a decimetre-scale relief from the same map (weathering pits and swells break up the smooth shading)
        vec2 rLx = texture2D( uReefNor, rUx * 0.23 + 0.31 ).xy - 0.5, rLy = texture2D( uReefNor, rUy * 0.23 + 0.31 ).xy - 0.5, rLz = texture2D( uReefNor, rUz * 0.23 + 0.31 ).xy - 0.5;
        vec3 rE = vec3( 0.0, rLx.y, rLx.x ) * rBw.x + vec3( rLy.x * 0.8 - rLy.y * 0.6, 0.0, rLy.x * 0.6 + rLy.y * 0.8 ) * rBw.y + vec3( rLz.x, rLz.y, 0.0 ) * rBw.z;
        rWn = normalize( rWn + ( rD * 3.2 + rE * 2.6 ) * mix( 0.35, 1.0, rBand ) );
        normal = normalize( ( viewMatrix * vec4( rWn, 0.0 ) ).xyz );
      }`);
  };
  mat.customProgramCacheKey = () => 'coast-reef-v9';

  const geos = SHAPES.map((sh) => rockGeometry(ctx, sh));
  const meshes = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const pal = PALETTE.map((h) => new THREE.Color(h)), c = new THREE.Color(), ochre = new THREE.Color('#B08A62'), grey = new THREE.Color();
  let triangles = 0;
  for (let ti = 0; ti < SHAPES.length; ti++) {
    const casts = SHAPES[ti].detail > 0;   // loose cobbles are too small to matter in the shadow map: they stay one mesh
    for (const [cellName, inCell] of casts ? CELLS : [['all', () => true]]) {
      const list = rocks.filter((r) => r.type === ti && inCell(r.x));
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geos[ti], mat, list.length);
      mesh.name = `reef-${SHAPES[ti].name}-${cellName}`;
      list.forEach((r, i) => {
        e.set(r.tiltX, r.rot, r.tiltZ, 'YXZ');
        m4.compose(p.set(r.x, r.y, r.z), q.setFromEuler(e), s.set(r.sx, r.sy, r.sz));
        mesh.setMatrixAt(i, m4);
        const k = r.tone * (pal.length - 1), k0 = Math.floor(k);
        c.copy(pal[k0]).lerp(pal[Math.min(pal.length - 1, k0 + 1)], k - k0).lerp(ochre, 0.03 + r.pale * 0.16);
        const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        // weathered, not terracotta: about a third of the chroma goes, and blocks differ in value (grey-pink to tan)
        c.lerp(grey.setRGB(lum * 1.03, lum * 0.99, lum * 0.94), 0.36 + 0.14 * ctx.rng.hash2(i, ti, 91));
        c.multiplyScalar(1.02 + 0.24 * (ctx.rng.hash2(i, ti, 57) - 0.5) + 0.1 * (r.tone - 0.5));
        mesh.setColorAt(i, c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = casts; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      // Each cell has its own bounds, so the cascades cull it; on top of core's caster test (core/loop.js) a cell only
      // casts while the camera is within shadow range of it (rocks are at most 5 m tall: no long reach to allow for),
      // and the small angular chunks only within the near part of that range.
      const box = mesh.boundingBox.clone(), share = SHAPES[ti].name === 'chunk' ? 0.55 : 1;
      mesh.userData.castWhen = (cam, range) => box.distanceToPoint(cam) < range * share + 10;
      group.add(mesh);
      meshes.push(mesh);
      triangles += (geos[ti].attributes.position.count / 3) * list.length;
    }
  }
  // boulders you cannot step over block the walker; low shelves stay walkable
  let colliders = 0;
  for (const r of rocks) if (r.top > 0.9) { collision.addCircle(r.x, r.z, Math.max(0.35, r.r * 0.72), 'reef'); colliders++; }

  return {
    meshes, triangles, colliders,
    dispose() { for (const g of geos) g.dispose(); mat.dispose(); t.map.dispose(); t.normalMap.dispose(); for (const m of meshes) m.dispose(); },
  };
}
