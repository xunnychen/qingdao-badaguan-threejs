// Small masonry / ironwork primitives written straight into a Buf (see util.js). All UVs in metres.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();

export const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Oriented box: centre (cx, cz), from y0 to y1, half extents hw (along the unit tangent tx,tz) and hd (across).
 * c0 / c1 = vertex colours at the bottom / top. Sides always; top / bottom optional.
 */
export function obox(buf, cx, cz, y0, y1, hw, hd, tx, tz, c0, c1, { top = true, bottom = false, uOff = 0 } = {}) {
  const X = (lx, lz) => cx + lx * tx - lz * tz, Z = (lx, lz) => cz + lx * tz + lz * tx;
  const cs = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], ns = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let u = uOff;
  for (let i = 0; i < 4; i++) {
    const a = cs[i], b = cs[(i + 1) % 4], len = i % 2 ? hd * 2 : hw * 2;
    const n = [ns[i][0] * tx - ns[i][1] * tz, 0, ns[i][0] * tz + ns[i][1] * tx];
    const ax = X(a[0], a[1]), az = Z(a[0], a[1]), bx = X(b[0], b[1]), bz = Z(b[0], b[1]);
    buf.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], n, [u, y0], [u + len, y0], [u + len, y1], [u, y1], c0, c0, c1, c1);
    u += len;
  }
  const cap = (y, ny, c) => buf.quad(
    [X(-hw, -hd), y, Z(-hw, -hd)], [X(hw, -hd), y, Z(hw, -hd)], [X(hw, hd), y, Z(hw, hd)], [X(-hw, hd), y, Z(-hw, hd)], [0, ny, 0],
    [uOff - hw, -hd], [uOff + hw, -hd], [uOff + hw, hd], [uOff - hw, hd], c, c, c, c);
  if (top) cap(y1, 1, c1);
  if (bottom) cap(y0, -1, c0);
}

/** Four-sided pyramid on a square base of half size hs at height y, apex hgt above. */
export function pyramid(buf, cx, cz, y, hs, hgt, tx, tz, c, cTop = c) {
  const X = (lx, lz) => cx + lx * tx - lz * tz, Z = (lx, lz) => cz + lx * tz + lz * tx;
  const cs = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]], ns = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const l = Math.hypot(hgt, hs), apex = [cx, y + hgt, cz];
  for (let i = 0; i < 4; i++) {
    const a = cs[i], b = cs[(i + 1) % 4];
    const nl = [ns[i][0] * hgt / l, ns[i][1] * hgt / l];
    const n = [nl[0] * tx - nl[1] * tz, hs / l, nl[0] * tz + nl[1] * tx];
    buf.tri([X(a[0], a[1]), y, Z(a[0], a[1])], [X(b[0], b[1]), y, Z(b[0], b[1])], apex, n, [0, 0], [hs * 2, 0], [hs, l], c, c, cTop);
  }
}

const MOSS = [0.4, 0.47, 0.31];
/**
 * A granite pier: square shaft (sunk below ground, mossy foot), overhanging cap slab and a pyramid / ball / flat top.
 * g = ground height, top = shaft height above ground. Returns the y of the top of the cap slab.
 */
export function pier(buf, x, z, g, tx, tz, { size = 0.5, top = 1.75, cap = 'pyramid', tint = [1, 1, 1], sink = 0.4, moss = 0.5 } = {}) {
  const hs = size / 2;
  const foot = mix(scl(tint, 0.78), MOSS, 0.25 + 0.6 * moss), low = scl(tint, 0.9), hi = tint, under = scl(tint, 0.86);
  obox(buf, x, z, g - sink, g + 0.5, hs, hs, tx, tz, scl(foot, 0.62), low, { top: false });
  obox(buf, x, z, g + 0.5, g + top, hs, hs, tx, tz, low, under, { top: false, uOff: 0.37 });
  const o = hs + 0.055, capC = scl(hi, 1.06), y1 = g + top + 0.075;
  obox(buf, x, z, g + top, y1, o, o, tx, tz, scl(capC, 0.92), capC, { top: true, bottom: true });
  if (cap === 'pyramid') pyramid(buf, x, z, y1, o - 0.025, size * 0.4, tx, tz, capC, scl(capC, 1.05));
  else if (cap === 'ball') {
    obox(buf, x, z, y1, y1 + 0.05, hs * 0.5, hs * 0.5, tx, tz, capC, capC, { top: false });
    const r = size * 0.36;
    buf.add(new THREE.SphereGeometry(r, 6, 4).scale(1, 0.94, 1).translate(x, y1 + 0.04 + r * 0.92, z), capC);
  }
  return y1;
}

/** Thin square bar from p0 to p1 (THREE.Vector3-like {x,y,z}); returns a BufferGeometry. */
export function strut(p0, p1, thick, thick2 = thick) {
  _d.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  const len = _d.length();
  const g = new THREE.BoxGeometry(thick, len, thick2);
  _q.setFromUnitVectors(_up, _d.normalize());
  _m.compose(_p.set((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2), _q, _s);
  return g.applyMatrix4(_m);
}

/** Clone a template geometry, rotate about Y and move it, and append it to a Buf. */
export function place(buf, template, x, y, z, rot, color) {
  const g = template.clone();
  _m.makeRotationY(rot).setPosition(x, y, z);
  g.applyMatrix4(_m);
  buf.add(g, color);
}

/** Merge a list of BufferGeometries into ONE reusable non-indexed template (position, normal, uv). */
export function template(list) {
  let n = 0;
  const parts = list.map((g) => { const h = g.index ? g.toNonIndexed() : g; n += h.attributes.position.count; return h; });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  for (const g of list) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return out;
}
