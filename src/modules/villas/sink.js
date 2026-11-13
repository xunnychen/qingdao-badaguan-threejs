// Geometry sink for the villa builders: collects triangles per material key, already transformed to world space.
// Everything is flat-shaded unless normals are supplied; UVs are in METRES with U horizontal and V up the slope
// (so walls get (run, height) and roof planes get (along the eaves, up the slope)); every vertex carries a colour.
import * as THREE from 'three';

const _t = new THREE.Matrix4();
const _c = new THREE.Color();

/** sRGB hex -> linear [r,g,b] */
export const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mulc = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const WHITE = [1, 1, 1];

export class Sink {
  /**
   * shared: Map of buffers for keys that are merged globally (slate / brown roofs, lit windows ...).
   * cells: Map cellId -> Map key -> buffer, for keys bucketed in small spatial cells (fine trim, see build.js);
   * the cell is chosen per villa in begin().
   */
  constructor(shared = null, sharedKeys = [], cells = null, cellKeys = []) {
    this.bufs = new Map();
    this.shared = shared;
    this.sharedKeys = new Set(sharedKeys);
    this.cells = cells;
    this.cellKeys = new Set(cellKeys);
    this.cell = '';
    this.m = new THREE.Matrix4();
    this.stack = [];
    this.flip = false;
    this.uo = 0; this.vo = 0;
  }

  buf(key) {
    let map = this.sharedKeys.has(key) ? this.shared : this.bufs;
    if (this.cellKeys.has(key)) { map = this.cells.get(this.cell); if (!map) this.cells.set(this.cell, (map = new Map())); }
    let b = map.get(key);
    if (!b) map.set(key, (b = { pos: [], nor: [], uv: [], col: [] }));
    return b;
  }

  /** start a villa: world matrix (may mirror in X), per-villa UV offset */
  begin(matrix, flip, uo = 0, vo = 0, cell = '') {
    this.m.copy(matrix); this.stack.length = 0; this.flip = flip; this.uo = uo; this.vo = vo; this.cell = cell;
  }

  /** run fn in a child frame translated by (x,y,z) and rotated by rotY (local +X -> (cos, 0, -sin)) */
  frame(x, y, z, rotY, fn) {
    this.stack.push(this.m.clone());
    _t.makeRotationY(rotY).setPosition(x, y, z);
    this.m.multiply(_t);
    const r = fn();
    this.m.copy(this.stack.pop());
    return r;
  }

  /**
   * Triangle a,b,c ([x,y,z] in the current frame), CCW seen from outside.
   * col: [r,g,b] or [[r,g,b] x3]; uv: optional [[u,v] x3]; nor: optional [[x,y,z] x3] (smooth shading).
   */
  tri(key, a, b, c, col, uv, nor) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-8) return;
    nx /= l; ny /= l; nz /= l;
    const B = this.buf(key), e = this.m.elements;
    // uv basis: e = horizontal in-plane, s = up the slope
    let ex, ey = 0, ez, sx, sy, sz;
    if (!uv) {
      if (Math.abs(ny) > 0.9995) { ex = 1; ez = 0; sx = 0; sy = 0; sz = -1; }
      else {
        const h = Math.hypot(nx, nz); ex = nz / h; ez = -nx / h;
        sx = ny * ez - nz * ey; sy = nz * ex - nx * ez; sz = nx * ey - ny * ex;
      }
    }
    const perV = Array.isArray(col[0]);
    const order = this.flip ? [0, 2, 1] : [0, 1, 2];
    const P = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const i = order[k], p = P[i], x = p[0], y = p[1], z = p[2];
      B.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      let qx = nx, qy = ny, qz = nz;
      if (nor) { qx = nor[i][0]; qy = nor[i][1]; qz = nor[i][2]; }
      B.nor.push(e[0] * qx + e[4] * qy + e[8] * qz, e[1] * qx + e[5] * qy + e[9] * qz, e[2] * qx + e[6] * qy + e[10] * qz);
      if (uv) B.uv.push(uv[i][0], uv[i][1]);
      else B.uv.push(x * ex + z * ez + this.uo, x * sx + y * sy + z * sz + this.vo);
      const cc = perV ? col[i] : col;
      B.col.push(cc[0], cc[1], cc[2]);
      if (cc.length > 3) (B.alpha || (B.alpha = [])).push(cc[3]);   // optional vertex alpha (ivy)
    }
  }

  /** Quad a,b,c,d CCW from outside (a bottom-left, b bottom-right, c top-right, d top-left). col: one colour or 4. */
  quad(key, a, b, c, d, col, uv) {
    if (Array.isArray(col[0])) {
      this.tri(key, a, b, c, [col[0], col[1], col[2]], uv && [uv[0], uv[1], uv[2]]);
      this.tri(key, a, c, d, [col[0], col[2], col[3]], uv && [uv[0], uv[2], uv[3]]);
    } else {
      this.tri(key, a, b, c, col, uv && [uv[0], uv[1], uv[2]]);
      this.tri(key, a, c, d, col, uv && [uv[0], uv[2], uv[3]]);
    }
  }

  /** Quad whose winding is fixed up so that it faces along `out` ([x,y,z] hint). */
  quadO(key, a, b, c, d, out, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    if (Math.abs(vx) + Math.abs(vy) + Math.abs(vz) < 1e-9) { vx = c[0] - a[0]; vy = c[1] - a[1]; vz = c[2] - a[2]; }
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * out[0] + ny * out[1] + nz * out[2] >= 0) this.quad(key, a, b, c, d, col);
    else if (Array.isArray(col[0])) this.quad(key, b, a, d, c, [col[1], col[0], col[3], col[2]]);
    else this.quad(key, b, a, d, c, col);
  }

  /** Double-sided quad (thin strips: balusters, rails). */
  quad2(key, a, b, c, d, col) { this.quad(key, a, b, c, d, col); this.quad(key, b, a, d, c, col); }

  /** Convex polygon fan; winding fixed up to face `out`. cols optional per-vertex. */
  fan(key, pts, out, col) {
    const n = pts.length; if (n < 3) return;
    // newell normal
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const rev = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    const perV = Array.isArray(col[0]);
    for (let i = 1; i < n - 1; i++) {
      const i1 = rev ? i + 1 : i, i2 = rev ? i : i + 1;
      this.tri(key, pts[0], pts[i1], pts[i2], perV ? [col[0], col[i1], col[i2]] : col);
    }
  }

  /** Axis-aligned box. skip: string of faces to omit: f(+z) b(-z) r(+x) l(-x) t(+y) d(-y). */
  box(key, x0, x1, y0, y1, z0, z1, col, skip = 'd') {
    if (!skip.includes('f')) this.quad(key, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col);
    if (!skip.includes('b')) this.quad(key, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col);
    if (!skip.includes('r')) this.quad(key, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col);
    if (!skip.includes('l')) this.quad(key, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);
    if (!skip.includes('t')) this.quad(key, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col);
    if (!skip.includes('d')) this.quad(key, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);
  }

  /** Oriented box along the segment p0 -> p1, w wide (horizontal), h high, centred on the line. */
  beam(key, p0, p1, w, h, col, caps = true) {
    let ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const L = Math.hypot(ax, ay, az); if (L < 1e-6) return;
    ax /= L; ay /= L; az /= L;
    let sx = -az, sy = 0, sz = ax;                         // side = axis x Y (horizontal)
    let sl = Math.hypot(sx, sz);
    if (sl < 1e-4) { sx = 1; sz = 0; sl = 1; }
    sx /= sl; sz /= sl;
    const ux = sy * az - sz * ay, uy = sz * ax - sx * az, uz = sx * ay - sy * ax; // up = side x axis
    const hw = w / 2, hh = h / 2;
    const P = (p, a, b) => [p[0] + sx * a + ux * b, p[1] + sy * a + uy * b, p[2] + sz * a + uz * b];
    const c0 = [P(p0, -hw, -hh), P(p0, hw, -hh), P(p0, hw, hh), P(p0, -hw, hh)];
    const c1 = [P(p1, -hw, -hh), P(p1, hw, -hh), P(p1, hw, hh), P(p1, -hw, hh)];
    const outs = [[-ux, -uy, -uz], [sx, sy, sz], [ux, uy, uz], [-sx, -sy, -sz]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quadO(key, c0[i], c0[j], c1[j], c1[i], outs[i], col); }
    if (caps) {
      this.quadO(key, c0[0], c0[1], c0[2], c0[3], [-ax, -ay, -az], col);
      this.quadO(key, c1[0], c1[1], c1[2], c1[3], [ax, ay, az], col);
    }
  }

  /**
   * Cylinder / cone frustum around the vertical through (cx, cz) from y0 (radius r0) to y1 (radius r1).
   * o: { seg = 10, smooth = true, top = false, bottom = false, a0 = 0, a1 = 2pi, col1 (colour at the top) }
   */
  cyl(key, cx, cz, y0, y1, r0, r1, col, o = {}) {
    const seg = o.seg || 10, a0 = o.a0 || 0, a1 = o.a1 ?? Math.PI * 2, smooth = o.smooth !== false;
    const h = y1 - y0, sl = Math.hypot(h, r0 - r1) || 1, ny = (r0 - r1) / sl, nr = h / sl;
    const colT = o.col1 || col, rm = Math.max(r0, r1);
    for (let i = 0; i < seg; i++) {
      const b0 = a0 + ((a1 - a0) * i) / seg, b1 = a0 + ((a1 - a0) * (i + 1)) / seg;
      const c0 = Math.cos(b0), s0 = Math.sin(b0), c1 = Math.cos(b1), s1 = Math.sin(b1);
      // increasing angle goes +x -> +z; seen from outside that runs right to left
      const A = [cx + c1 * r0, y0, cz + s1 * r0], Bq = [cx + c0 * r0, y0, cz + s0 * r0];
      const C = [cx + c0 * r1, y1, cz + s0 * r1], D = [cx + c1 * r1, y1, cz + s1 * r1];
      const nA = [c1 * nr, ny, s1 * nr], nB = [c0 * nr, ny, s0 * nr];
      const uA = -b1 * rm, uB = -b0 * rm;
      const uv = [[uA, 0], [uB, 0], [uB, sl], [uA, sl]];
      const n4 = smooth ? [nA, nB, nB, nA] : null;
      this.tri(key, A, Bq, C, [col, col, colT], [uv[0], uv[1], uv[2]], n4 && [n4[0], n4[1], n4[2]]);
      if (r1 > 1e-4) this.tri(key, A, C, D, [col, colT, colT], [uv[0], uv[2], uv[3]], n4 && [n4[0], n4[2], n4[3]]);
      if (o.top && r1 > 1e-4) this.tri(key, [cx, y1, cz], D, C, colT);
      if (o.bottom) this.tri(key, [cx, y0, cz], Bq, A, col);
    }
  }

  /**
   * Roof slab: convex planar polygon `pts` (the TOP surface), extruded `t` metres straight down.
   * Top goes to `key` (tile), underside + edges to `trimKey`. edges: indices of polygon edges that get a fascia
   * (edge i runs pts[i] -> pts[i+1]); default all.
   */
  slab(key, pts, t, col, trimKey, soffit, fascia, edges = null) {
    const n = pts.length;
    this.fan(key, pts, [0, 1, 0], col);
    const low = pts.map((p) => [p[0], p[1] - t, p[2]]);
    this.fan(trimKey, low, [0, -1, 0], soffit);
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0] / n; cy += p[1] / n; cz += p[2] / n; }
    for (let i = 0; i < n; i++) {
      if (edges && !edges.includes(i)) continue;
      const j = (i + 1) % n, a = pts[i], b = pts[j];
      const out = [(a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz];
      if (Math.abs(out[0]) + Math.abs(out[2]) < 1e-6) out[1] = 1;
      this.quadO(trimKey, low[i], low[j], b, a, out, fascia);
    }
  }
}

/** buffers -> BufferGeometry (position, normal, uv, color) */
export function toGeometry(b, withColor = true) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
  const nv = b.pos.length / 3;
  if (withColor && b.alpha && b.alpha.length === nv) {
    // RGBA vertex colours: three multiplies diffuse alpha by the vertex alpha (USE_COLOR_ALPHA), which alphaTest then cuts
    const c = new Float32Array(nv * 4);
    for (let i = 0; i < nv; i++) { c[i * 4] = b.col[i * 3]; c[i * 4 + 1] = b.col[i * 3 + 1]; c[i * 4 + 2] = b.col[i * 3 + 2]; c[i * 4 + 3] = b.alpha[i]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 4));
  } else if (withColor) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
