// Streetscape helpers: a small non-indexed geometry writer, polyline stations and a profile sweep.
import * as THREE from 'three';

export const WALK_Y = 0.14;          // sidewalk surface above heightAt (terrain package convention)
export const CHUNK = 170;            // spatial chunk size for merged wall geometry (metres)

/** Non-indexed triangle soup writer (position, normal, uv, optional color). */
export class Buf {
  constructor(useColor = false) { this.p = []; this.n = []; this.u = []; this.c = useColor ? [] : null; }
  get tris() { return this.p.length / 9; }
  _v(a, n, uv, c) {
    this.p.push(a[0], a[1], a[2]); this.n.push(n[0], n[1], n[2]); this.u.push(uv[0], uv[1]);
    if (this.c) { if (c) this.c.push(c[0], c[1], c[2]); else this.c.push(1, 1, 1); }
  }
  tri(a, b, c, n, ua, ub, uc, ca, cb, cc) {
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
    const d = (ey * fz - ez * fy) * n[0] + (ez * fx - ex * fz) * n[1] + (ex * fy - ey * fx) * n[2];
    if (d >= 0) { this._v(a, n, ua, ca); this._v(b, n, ub, cb); this._v(c, n, uc, cc); }
    else { this._v(a, n, ua, ca); this._v(c, n, uc, cc); this._v(b, n, ub, cb); }
  }
  /** Quad a-b-c-d (around the perimeter). Winding is fixed against the normal n. Optional per-corner normals/colours. */
  quad(a, b, c, d, n, ua, ub, uc, ud, ca, cb, cc, cd, na, nb, nc, nd) {
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
    const dot = (ey * fz - ez * fy) * n[0] + (ez * fx - ex * fz) * n[1] + (ex * fy - ey * fx) * n[2];
    na = na || n; nb = nb || n; nc = nc || n; nd = nd || n;
    if (dot >= 0) {
      this._v(a, na, ua, ca); this._v(b, nb, ub, cb); this._v(c, nc, uc, cc);
      this._v(a, na, ua, ca); this._v(c, nc, uc, cc); this._v(d, nd, ud, cd);
    } else {
      this._v(a, na, ua, ca); this._v(c, nc, uc, cc); this._v(b, nb, ub, cb);
      this._v(a, na, ua, ca); this._v(d, nd, ud, cd); this._v(c, nc, uc, cc);
    }
  }
  /** Append a BufferGeometry (non-indexed, position/normal/uv[/color]); optional uniform colour [r,g,b]. */
  add(geo, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i)); this.n.push(N.getX(i), N.getY(i), N.getZ(i));
      this.u.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      if (this.c) {
        const r = color ? color[0] : 1, gg = color ? color[1] : 1, b = color ? color[2] : 1;
        if (C) this.c.push(C.getX(i) * r, C.getY(i) * gg, C.getZ(i) * b); else this.c.push(r, gg, b);
      }
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }
  build() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.u), 2));
    if (this.c) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    this.p = this.n = this.u = this.c = null;
    return g;
  }
}

/** Chunk key of a world position. */
export const chunkKey = (x, z, size = CHUNK) => `${Math.floor((x + 300) / size)}:${Math.floor((z + 270) / size)}`;

/**
 * Stations along a polyline: every vertex plus even subdivisions no longer than maxStep.
 * Returns [{x, z, s, tx, tz, nx, nz, g}] with g = ground height, n = left normal (tz, -tx).
 */
export function stations(pts, heightAt, maxStep = 2) {
  const out = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-4) continue;
    const n = Math.max(1, Math.ceil(len / maxStep));
    for (let j = out.length ? 1 : 0; j <= n; j++) {
      const t = j / n;
      out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s: s + len * t });
    }
    s += len;
  }
  for (let i = 0; i < out.length; i++) {
    const p = out[Math.max(0, i - 1)], q = out[Math.min(out.length - 1, i + 1)], o = out[i];
    let tx = q.x - p.x, tz = q.z - p.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    o.tx = tx; o.tz = tz; o.nx = tz; o.nz = -tx; o.g = heightAt(o.x, o.z);
  }
  return out;
}

/** Interpolated point on a station list at arc length s: {x, z, g, tx, tz}. */
export function stationAt(st, s, out = {}) {
  let lo = 0, hi = st.length - 1;
  if (s <= 0) { lo = 0; hi = 1; } else if (s >= st[hi].s) { lo = hi - 1; } else {
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (st[m].s <= s) lo = m; else hi = m; }
  }
  hi = lo + 1;
  const a = st[lo], b = st[hi], t = Math.min(1, Math.max(0, (s - a.s) / ((b.s - a.s) || 1)));
  out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; out.g = a.g + (b.g - a.g) * t;
  let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; out.tx = tx / l; out.tz = tz / l;
  return out;
}

/**
 * Sweep a 2D profile ([{o: lateral offset, y: height}]) along stations. Face normals are (dy, -do) in the
 * (lateral, up) plane: walk the profile so that this points outward (right face upward, then over the top to the left).
 * opts: yAt(i) base height at station i (default ground), smooth (average normals at profile points),
 * uOff, vWorld (v = world y instead of profile length), color(i, k) -> [r,g,b].
 */
export function sweep(buf, st, profile, opts = {}) {
  const { yAt = (i) => st[i].g, smooth = false, uOff = 0, vWorld = false, color = null, uvScale = 1 } = opts;
  const K = profile.length;
  const fn = [], vlen = [0];
  for (let k = 0; k < K - 1; k++) {
    const dox = profile[k + 1].o - profile[k].o, dy = profile[k + 1].y - profile[k].y, l = Math.hypot(dox, dy) || 1;
    fn.push([dy / l, -dox / l]); vlen.push(vlen[k] + l);
  }
  const pn = [];
  for (let k = 0; k < K; k++) {
    const a = fn[Math.max(0, k - 1)], b = fn[Math.min(K - 2, k)];
    let x = a[0] + b[0], y = a[1] + b[1]; const l = Math.hypot(x, y) || 1; pn.push([x / l, y / l]);
  }
  const P = (i, k) => { const s = st[i], p = profile[k]; return [s.x + s.nx * p.o, yAt(i) + p.y, s.z + s.nz * p.o]; };
  const N = (i, n2) => { const s = st[i]; return [s.nx * n2[0], n2[1], s.nz * n2[0]]; };
  for (let i = 0; i < st.length - 1; i++) {
    for (let k = 0; k < K - 1; k++) {
      const a = P(i, k), b = P(i + 1, k), c = P(i + 1, k + 1), d = P(i, k + 1);
      const n = N(i, fn[k]);
      const u0 = (st[i].s + uOff) * uvScale, u1 = (st[i + 1].s + uOff) * uvScale;
      const va = (vWorld ? a[1] : vlen[k]) * uvScale, vb = (vWorld ? b[1] : vlen[k]) * uvScale, vc = (vWorld ? c[1] : vlen[k + 1]) * uvScale, vd = (vWorld ? d[1] : vlen[k + 1]) * uvScale;
      if (smooth) {
        buf.quad(a, b, c, d, n, [u0, va], [u1, vb], [u1, vc], [u0, vd],
          color && color(i, k), color && color(i + 1, k), color && color(i + 1, k + 1), color && color(i, k + 1),
          N(i, pn[k]), N(i + 1, pn[k]), N(i + 1, pn[k + 1]), N(i, pn[k + 1]));
      } else {
        buf.quad(a, b, c, d, n, [u0, va], [u1, vb], [u1, vc], [u0, vd],
          color && color(i, k), color && color(i + 1, k), color && color(i + 1, k + 1), color && color(i, k + 1));
      }
    }
  }
}

/** A textured quad facing a viewer who sees `r` (unit, horizontal) pointing right. rect = [u0, v0, u1, v1] (top-left, bottom-right). */
export function plateQuad(buf, cx, cy, cz, rx, rz, w, h, rect, color) {
  const n = [-rz, 0, rx], hw = w / 2, hh = h / 2;
  const bl = [cx - rx * hw, cy - hh, cz - rz * hw], br = [cx + rx * hw, cy - hh, cz + rz * hw];
  const tr = [cx + rx * hw, cy + hh, cz + rz * hw], tl = [cx - rx * hw, cy + hh, cz - rz * hw];
  buf.quad(bl, br, tr, tl, n, [rect[0], rect[3]], [rect[2], rect[3]], [rect[2], rect[1]], [rect[0], rect[1]], color, color, color, color);
}

/** sRGB hex -> linear [r,g,b] (vertex colours are linear). */
export function lin(hex, k = 1) { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; }
