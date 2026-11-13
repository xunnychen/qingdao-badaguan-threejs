// Grass tufts on the mown lawns (parks, the green behind the promenade, landmark lawns): one instanced mesh refilled
// from a cached 8 m cell grid whenever the walker enters a new cell. Tufts shrink to nothing at the edge of the range.
import * as THREE from 'three';

const CELL = 8, RANGE = 40, PER = 13;      // PER x PER jittered candidates per cell
const FULL = 3, THIN_AT = 15;              // cells this near (index distance) keep every tuft; beyond THIN_AT metres half of them shrink away
const MAXN = 6000;

export function createGrass(ctx, S) {
  const { map: MAP, world, rng } = ctx;
  const { hash2 } = rng;
  const promX = MAP.coast.promenadeX;
  const inRect = (r, x, z, m) => { const [lx, lz] = world.toLocal(r, x, z); return Math.abs(lx) <= r.w / 2 + m && Math.abs(lz) <= r.d / 2 + m; };
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    let t = ((px - ax) * dx + (pz - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
  };
  const lawnMarks = MAP.landmarks.map((l) => ({ l, r: l.reserve * 0.95, fx: l.x + Math.sin(l.rot) * (l.d / 2), fz: l.z + Math.cos(l.rot) * (l.d / 2) }));
  const ns = {};
  function lawnAt(x, z) {
    const surf = world.surfaceAt(x, z);
    if (surf === 'lawn') return world.parkAt(x, z, -0.5) ? 1 : 0;
    if (surf !== 'garden') return 0;
    const q = world.nearestStreet(x, z, ns);
    if (q && q.d < q.street.wallOff + 0.8) return 0;
    for (const m of lawnMarks) {
      const d = Math.hypot(m.l.x - x, m.l.z - z);
      if (d > m.r) continue;
      if (inRect(m.l, x, z, 2.2)) return 0;
      if (m.l.gate && segDist(x, z, m.l.gate.x, m.l.gate.z, m.fx, m.fz) < 2.3) return 0;
      return d > m.r - 4 ? 0.5 : 1;
    }
    const b = world.backDist(x, z);
    if (b > 3.5 && b < 11.5 && x > promX[0] + 2 && x < promX[1] - 2) return b > 9.5 ? 0.5 : 1;
    return 0;
  }

  const cells = new Map();
  function cell(cx, cz) {
    const key = cx * 4096 + cz;
    let c = cells.get(key);
    if (c !== undefined) return c;
    const out = [];
    for (let i = 0; i < PER; i++) for (let j = 0; j < PER; j++) {
      const gx = cx * PER + i, gz = cz * PER + j;
      const x = (gx + hash2(gx, gz, 1)) * (CELL / PER), z = (gz + hash2(gx, gz, 2)) * (CELL / PER);
      const k = lawnAt(x, z);
      if (k <= 0 || hash2(gx, gz, 3) > k * 0.9) continue;
      if (S.treeNear(x, z, 0.7)) continue;
      out.push(x, world.heightAt(x, z) - 0.02, z, 0.75 + 0.7 * hash2(gx, gz, 4), hash2(gx, gz, 5) * 6.283, hash2(gx, gz, 6));
    }
    c = out.length ? new Float32Array(out) : null;
    cells.set(key, c);
    return c;
  }

  // two crossed quads, pivot at the base
  const geo = new THREE.InstancedBufferGeometry();
  {
    const P = [], UV = [], I = [];
    for (let q = 0; q < 2; q++) {
      const a = q * Math.PI * 0.5 + 0.4, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, o = q * 4;
      P.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
      UV.push(0, 0, 1, 0, 1, 1, 0, 1);
      I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setIndex(I);
  }
  const iG = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 4), 4), iH = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 2), 2);
  iG.setUsage(THREE.DynamicDrawUsage); iH.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iG', iG); geo.setAttribute('iH', iH);
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const uLawn = { value: new THREE.Color() };
  const mat = new THREE.MeshStandardMaterial({ map: S.tex.tuft, alphaTest: 0.45, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'life:grass';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uLawn, uTime: S.U.uTime, uWind: S.U.uWind });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute vec4 iG; attribute vec2 iH;
        uniform float uTime; uniform vec3 uWind; uniform vec3 uLawn;
        varying vec3 vTint;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
      .replace('#include <begin_vertex>', /* glsl */ `
        float gc = cos( iH.x ), gs = sin( iH.x );
        float gDist = length( iG.xz - cameraPosition.xz );
        float gFade = 1.0 - smoothstep( ${(RANGE - 13).toFixed(1)}, ${(RANGE - 1.5).toFixed(1)}, gDist );
        // every second tuft is gone before the ring where the refill stops including it (no popping)
        gFade *= 1.0 - step( 0.5, fract( iH.y * 37.0 ) ) * smoothstep( ${THIN_AT.toFixed(1)}, ${((FULL + 0.5) * CELL - CELL * 1.42).toFixed(1)}, gDist );
        // far tufts are wider so the thinned lawn still reads as rough grass
        float gWide = 1.0 + 0.5 * smoothstep( 12.0, 30.0, gDist );
        vec3 gl = vec3( position.x * gc - position.z * gs, position.y, position.x * gs + position.z * gc );
        gl.xz *= 0.42 * iG.w * gWide; gl.y *= 0.17 * iG.w * ( 0.7 + 0.6 * iH.y ) * gFade;
        float gPh = iG.x * 0.37 + iG.z * 0.29;
        gl.xz += uWind.xz * position.y * ( 0.07 + 0.06 * sin( uTime * 2.2 + gPh ) + 0.02 * sin( uTime * 5.7 + gPh * 3.1 ) );
        vec3 transformed = iG.xyz + gl;
        vTint = uLawn * ( 0.88 + 0.3 * iH.y ) * mix( vec3( 1.0 ), vec3( 1.12, 1.06, 0.8 ), fract( iH.y * 7.7 ) * 0.6 );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb *= vTint * 1.32;`)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  mat.customProgramCacheKey = () => 'life:grass:v2';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'life:grass'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  S.group.add(mesh);

  let lcx = 1e9, lcz = 1e9;
  function refill(px, pz) {
    const R = Math.ceil(RANGE / CELL), cx0 = Math.floor(px / CELL), cz0 = Math.floor(pz / CELL);
    const list = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const d = Math.hypot(i, j);
      if (d > R + 0.5) continue;
      const c = cell(cx0 + i, cz0 + j);
      if (c) list.push([d, c]);
    }
    list.sort((a, b) => a[0] - b[0]);
    let n = 0;
    const G = iG.array, H = iH.array;
    for (const [d, c] of list) {
      const thin = d > FULL + 0.5;
      for (let k = 0; k < c.length && n < MAXN; k += 6) {
        if (thin && (c[k + 5] * 37) % 1 >= 0.5) continue;
        G[n * 4] = c[k]; G[n * 4 + 1] = c[k + 1]; G[n * 4 + 2] = c[k + 2]; G[n * 4 + 3] = c[k + 3];
        H[n * 2] = c[k + 4]; H[n * 2 + 1] = c[k + 5];
        n++;
      }
      if (n >= MAXN) break;
    }
    geo.instanceCount = n;
    iG.needsUpdate = iH.needsUpdate = true;
    mesh.visible = n > 0;
  }

  return {
    get count() { return geo.instanceCount; },
    update() {
      const p = ctx.player.pos, cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      if (cx !== lcx || cz !== lcz) { lcx = cx; lcz = cz; refill(p.x, p.z); }
      uLawn.value.copy(ctx.env.current.lawn);
    },
    dispose() { S.group.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
