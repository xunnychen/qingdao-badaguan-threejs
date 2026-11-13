// Small geometry helpers shared by all builders (ctx.geo). Everything returns NON-INDEXED BufferGeometry with
// position + normal + uv (UVs in metres) so that results can always be merged together.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** Make any geometry mergeable: non-indexed, with position/normal/uv, no other attributes (keeps `color` if present). */
export function normalize(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  return g;
}

/**
 * Merge geometries into one (disposes the sources). Accepts any mix of indexed / non-indexed; if any source has a
 * `color` attribute the others get white. Returns null for an empty list.
 */
export function merge(list) {
  const gs = list.filter(Boolean).map(normalize);
  if (!gs.length) return null;
  if (gs.some((g) => g.attributes.color)) for (const g of gs) if (!g.attributes.color) tint(g, 0xffffff);
  const out = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
  if (!out) throw new Error('[geo.merge] mergeGeometries failed (attribute mismatch)');
  if (gs.length > 1) for (const g of gs) g.dispose();
  return out;
}

/** Bake a transform into a geometry. t = { x, y, z, rotY, rotX, rotZ, scale (number | [sx,sy,sz]) }. Returns geo. */
export function transform(geo, t = {}) {
  const sc = t.scale ?? 1;
  _s.set(...(Array.isArray(sc) ? sc : [sc, sc, sc]));
  _e.set(t.rotX || 0, t.rotY || 0, t.rotZ || 0, 'YXZ');
  _m.compose(_p.set(t.x || 0, t.y || 0, t.z || 0), _q.setFromEuler(_e), _s);
  geo.applyMatrix4(_m);
  return geo;
}

/**
 * Box-projected UVs in METRES from positions + normals (call after all transforms, in the space you want the texture
 * to be continuous in). Faces pointing mostly up/down use (x, z); other faces use (horizontal run, y).
 * scale multiplies the UVs (default 1 = one UV unit per metre). Requires non-indexed geometry (normalize first).
 */
export function applyMetricUV(geo, scale = 1) {
  const g = geo.index ? normalize(geo) : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    // face normal from the first vertex normal is not reliable on smooth shapes: use the geometric normal
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
    const ux = pos.getX(i + 1) - ax, uy = pos.getY(i + 1) - ay, uz = pos.getZ(i + 1) - az;
    const vx = pos.getX(i + 2) - ax, vy = pos.getY(i + 2) - ay, vz = pos.getZ(i + 2) - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k);
      let u, v;
      if (Math.abs(ny) > 0.7) { u = x; v = -z; }
      else if (Math.abs(nx) > Math.abs(nz)) { u = nx > 0 ? -z : z; v = y / Math.max(0.2, Math.sqrt(1 - ny * ny)); }
      else { u = nz > 0 ? x : -x; v = y / Math.max(0.2, Math.sqrt(1 - ny * ny)); }
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Box w (x) * h (y) * d (z) with its BASE CENTRE at the origin (y from 0 to h), metric UVs, then optional transform t.
 */
export function box(w, h, d, t) {
  const g = normalize(new THREE.BoxGeometry(w, h, d));
  g.translate(0, h / 2, 0);
  applyMetricUV(g);
  return t ? transform(g, t) : g;
}

/** Fill a `color` attribute with one colour (number | string | THREE.Color). Returns geo. */
export function tint(geo, color) {
  const c = color.isColor ? color : new THREE.Color(color);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/**
 * Cheap baked ambient occlusion into vertex colours: multiplies (or creates) `color` by a vertical gradient so the
 * bottom `fade` metres darken to `dark` (0..1). Call in world/object space after transforms.
 */
export function bakeGroundAO(geo, baseY = 0, fade = 1.2, dark = 0.62) {
  if (!geo.attributes.color) tint(geo, 0xffffff);
  const pos = geo.attributes.position, col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const k = dark + (1 - dark) * Math.min(1, Math.max(0, (pos.getY(i) - baseY) / fade));
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return geo;
}

/**
 * Static mesh helper: frozen matrix, shadows on.
 * The CPU copies of the vertex data are released once they are on the GPU (the merged static clusters are ~100 MB of
 * typed arrays otherwise). Bounds are computed first, since nothing can be read back afterwards: pass `keep: true` for
 * a geometry that will be read, edited, cloned or merged again later. (A restored WebGL context reloads the page.)
 */
function dropArray() { this.array = null; }
export function staticMesh(geo, material, { cast = true, receive = true, name = '', keep = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive; m.name = name;
  m.matrixAutoUpdate = false; m.updateMatrix();
  if (!keep && geo.attributes.position && !geo.userData.keepArrays) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    for (const k in geo.attributes) {
      const a = geo.attributes[k];
      if (a.isInterleavedBufferAttribute || a.usage !== THREE.StaticDrawUsage) continue;
      a.onUpload(dropArray);
    }
    if (geo.index) geo.index.onUpload(dropArray);
  }
  return m;
}

export const geo = { normalize, merge, transform, applyMetricUV, box, tint, bakeGroundAO, staticMesh };
export default geo;
