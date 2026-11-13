// Small mesh-building helpers private to the terrain package.
// Buf collects non-indexed triangles (position / normal / uv [/ color]); faces are oriented by a "hint" normal so the
// builders never have to think about winding.
import * as THREE from 'three';

/** vertex: position, metre UV, colour (grey multiplier or [r,g,b]), optional explicit normal [nx,ny,nz] */
export const V = (x, y, z, u = 0, v = 0, c = 1, n = null) => ({ x, y, z, u, v, c, n });

export const UP = [0, 1, 0];

export class Buf {
  constructor(useColor = false) {
    this.p = []; this.n = []; this.u = []; this.c = useColor ? [] : null;
  }
  get triangles() { return this.p.length / 9; }
  tri(a, b, c, hint) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return; // degenerate (collapsed strip end)
    nx /= l; ny /= l; nz /= l;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    const P = this.p, N = this.n, U = this.u, C = this.c;
    for (const v of [a, b, c]) {
      P.push(v.x, v.y, v.z);
      if (v.n) N.push(v.n[0], v.n[1], v.n[2]); else N.push(nx, ny, nz);
      U.push(v.u, v.v);
      if (C) { if (typeof v.c === 'number') C.push(v.c, v.c, v.c); else C.push(v.c[0], v.c[1], v.c[2]); }
    }
  }
  /** a,b,c,d in perimeter order */
  quad(a, b, c, d, hint) { this.tri(a, b, c, hint); this.tri(a, c, d, hint); }

  /**
   * Prism over a quadrilateral footprint. corners: 4 [x,z] in perimeter order; yb / yt: number or 4 numbers (per corner).
   * opts: top (true), bottom (false), sides ([1,1,1,1] = edge i from corner i to i+1), c (colour), u0 (start of the
   * running horizontal UV on the sides), topC (colour of the top face).
   */
  prism(corners, yb, yt, opts = {}) {
    const { top = true, bottom = false, sides = [1, 1, 1, 1], c = 1, u0 = 0, topC = c } = opts;
    const B = typeof yb === 'number' ? [yb, yb, yb, yb] : yb, T = typeof yt === 'number' ? [yt, yt, yt, yt] : yt;
    const cx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4;
    const cz = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4;
    let u = u0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4], j = (i + 1) % 4;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (sides[i] && len > 1e-4) {
        // outward = perpendicular to the edge, away from the centroid
        let ox = b[1] - a[1], oz = -(b[0] - a[0]);
        if (ox * ((a[0] + b[0]) / 2 - cx) + oz * ((a[1] + b[1]) / 2 - cz) < 0) { ox = -ox; oz = -oz; }
        this.quad(V(a[0], B[i], a[1], u, B[i], c), V(b[0], B[j], b[1], u + len, B[j], c),
          V(b[0], T[j], b[1], u + len, T[j], c), V(a[0], T[i], a[1], u, T[i], c), [ox, 0, oz]);
      }
      u += len;
    }
    if (top) this.quad(...corners.map((p, i) => V(p[0], T[i], p[1], p[0], p[1], topC)), UP);
    if (bottom) this.quad(...corners.map((p, i) => V(p[0], B[i], p[1], p[0], p[1], c)), [0, -1, 0]);
  }

  /** Split by triangle centroid into square cells of `size` metres (for frustum culling); returns one Buf per cell. */
  split(size) {
    const cells = new Map(), P = this.p, N = this.n, U = this.u, C = this.c;
    for (let t = 0; t < P.length / 9; t++) {
      const o = t * 9;
      const k = Math.floor((P[o] + P[o + 3] + P[o + 6]) / 3 / size) * 4096 + Math.floor((P[o + 2] + P[o + 5] + P[o + 8]) / 3 / size);
      let b = cells.get(k); if (!b) cells.set(k, (b = new Buf(!!C)));
      for (let i = 0; i < 9; i++) { b.p.push(P[o + i]); b.n.push(N[o + i]); }
      for (let i = 0; i < 6; i++) b.u.push(U[t * 6 + i]);
      if (C) for (let i = 0; i < 9; i++) b.c.push(C[o + i]);
    }
    this.p = this.n = this.u = this.c = null;
    return [...cells.values()];
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.u), 2));
    if (this.c) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    this.p = this.n = this.u = this.c = null;
    return g;
  }
}

/**
 * Sampler for a MAP street / path (pts resampled at ~2 m, cum = arc length).
 * at(s, off, out): point at arc length s, offset `off` metres along the LEFT normal n = (tz, -tx)
 * (off = side * distance, the same convention as MAP gates / trees). out = {x, z, tx, tz}.
 */
export function makeSampler(line, mitre0 = null, mitre1 = null) {
  const pts = line.pts, n = pts.length, cum = line.cum;
  const TX = new Float64Array(n), TZ = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    TX[i] = (b[0] - a[0]) / l; TZ[i] = (b[1] - a[1]) / l;
  }
  // an end that continues as another street: cross-sections turn onto the shared mitre line so the two ribbons butt
  if (mitre0) { TX[0] = mitre0[0]; TZ[0] = mitre0[1]; }
  if (mitre1) { TX[n - 1] = mitre1[0]; TZ[n - 1] = mitre1[1]; }
  return {
    len: line.len, n,
    at(s, off, out) {
      s = s < 0 ? 0 : s > line.len ? line.len : s;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
      let tx = TX[lo] + (TX[hi] - TX[lo]) * t, tz = TZ[lo] + (TZ[hi] - TZ[lo]) * t;
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      out.x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t + tz * off;
      out.z = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t - tx * off;
      out.tx = tx; out.tz = tz;
      return out;
    },
  };
}

/**
 * Street-network facts shared by the ground mesh and the street builder.
 *   end(st)                 {openStart, openEnd, mitre0, mitre1}: open = the end is not at a junction (run-off into the
 *                           far field); mitre = tangent of the shared cross-section where the street continues as another
 *   onRoad(x, z, m, skip)   the street whose carriageway (+ m metres) covers (x,z), or null. Unlike world.onRoad the
 *                           ends are BUTT ends, so a street that stops at a T-junction does not bite a round cap out of
 *                           the far kerb and sidewalk of the street it meets.
 *   openDist(st, s)         metres along st from s to its nearest open end (Infinity if it has none)
 */
export function streetTools(ctx) {
  const { world, map: MAP } = ctx;
  const info = new Map();
  const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  for (const st of MAP.streets) {
    const n = st.pts.length;
    info.set(st.id, { p0: st.pts[0], p1: st.pts[n - 1], t0: unit(st.pts[0], st.pts[1]), t1: unit(st.pts[n - 2], st.pts[n - 1]), openStart: true, openEnd: true, mitre0: null, mitre1: null });
  }
  for (const st of MAP.streets) {
    const e = info.get(st.id);
    for (const [key, p, t, mk] of [['openStart', e.p0, e.t0, 'mitre0'], ['openEnd', e.p1, e.t1, 'mitre1']]) {
      const near = MAP.streets.filter((o) => o !== st && world.distToLine(o, p[0], p[1], 3).d < 0.6);
      if (!near.length) continue;
      e[key] = false;
      if (near.length !== 1) continue;
      // exactly one other street, and it also ends here: the two are one bent road
      const o = info.get(near[0].id), start = key === 'openStart';
      let c = null; // direction of travel THROUGH the joint, in this street's sense of increasing s
      if (Math.hypot(o.p1[0] - p[0], o.p1[1] - p[1]) < 0.6) c = start ? o.t1 : [-o.t1[0], -o.t1[1]];
      else if (Math.hypot(o.p0[0] - p[0], o.p0[1] - p[1]) < 0.6) c = start ? [-o.t0[0], -o.t0[1]] : o.t0;
      if (!c || c[0] * t[0] + c[1] * t[1] < 0.75) continue;
      const l = Math.hypot(c[0] + t[0], c[1] + t[1]);
      e[mk] = [(c[0] + t[0]) / l, (c[1] + t[1]) / l];
    }
  }
  return {
    end: (st) => info.get(st.id),
    onRoad(x, z, margin = 0, skip = null) {
      for (const o of MAP.streets) {
        if (o === skip) continue;
        const r = o.half + margin;
        const q = world.distToLine(o, x, z, r + 0.5);
        if (q.d > r) continue;
        // butt ends: only where the nearest point IS an end (a street that curls back, like 韶关路, passes behind the
        // half-plane of its own start further along, and was wrongly cut out of every junction there)
        const e = info.get(o.id), qs = q.s;
        if (qs < r + 1 && (x - e.p0[0]) * e.t0[0] + (z - e.p0[1]) * e.t0[1] < 0) continue;
        if (qs > o.len - r - 1 && (x - e.p1[0]) * e.t1[0] + (z - e.p1[1]) * e.t1[1] > 0) continue;
        return o;
      }
      return null;
    },
    openDist(st, s) {
      const e = info.get(st.id);
      return Math.min(e.openStart ? s : Infinity, e.openEnd ? st.len - s : Infinity);
    },
  };
}

/** Patch helper: unique program cache key + shared uniforms for an onBeforeCompile material. */
export function patchMaterial(mat, key, uniforms, fn) {
  mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, uniforms); fn(sh); };
  mat.customProgramCacheKey = () => key;
  return mat;
}
