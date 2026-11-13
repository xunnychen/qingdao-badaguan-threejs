// Geometry kit for the landmark builders. Pure three.js maths (no DOM), so the builders also run under Node.
//
// A Builder collects triangles per material key, already in WORLD space, with normals, metric UVs and a linear
// vertex colour. Everything is authored in "surface space" (u, y, d): on the default flat surface that is simply the
// current frame's (x, y, z) with +z as the outward normal; inside `cyl()` u is the arc length around a vertical
// cylinder and d the radial offset, so the same wall / opening / box code builds round towers.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const PI = Math.PI;
/** sRGB hex -> linear [r,g,b] */
export const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mulc = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const WHITE = [1, 1, 1];
const h2 = (i, j, seed) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
/** smooth value noise 0..1 on a unit lattice; wrapX > 0 makes it periodic in x with that many cells */
export function vnoise(x, y, seed = 0, wrapX = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (i) => (wrapX ? ((i % wrapX) + wrapX) % wrapX : i);
  const a = h2(w(xi), yi, seed), b = h2(w(xi + 1), yi, seed), c = h2(w(xi), yi + 1, seed), d = h2(w(xi + 1), yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const FLAT = {
  map(p, o) { o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; },
  nor(p, o) { o[0] = 0; o[1] = 0; o[2] = 1; },
};
const cylSurf = (R) => ({
  R,
  map(p, o) { const a = p[0] / R, r = R + p[2]; o[0] = Math.sin(a) * r; o[1] = p[1]; o[2] = Math.cos(a) * r; },
  nor(p, o) { const a = p[0] / R; o[0] = Math.sin(a); o[1] = 0; o[2] = Math.cos(a); },
});

const uniq = (arr, lo, hi) => {
  const a = arr.filter((v) => v >= lo - 1e-6 && v <= hi + 1e-6).sort((p, q) => p - q), out = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 0.012) out.push(v);
  return out;
};
const subdivide = (arr, step) => {
  if (!step) return arr;
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1], b = arr[i], n = Math.ceil((b - a) / step - 1e-6);
    for (let k = 1; k < n; k++) out.push(a + ((b - a) * k) / n);
    out.push(b);
  }
  return out;
};

export class Builder {
  /** globalKeys: keys that are never prefixed (shared across clusters). */
  constructor(globalKeys = []) {
    this.bufs = new Map();
    this.m = new THREE.Matrix4();
    this.stack = [];
    this.surf = FLAT;
    this.uo = 0; this.vo = 0;
    this.prefix = '';
    this.global = new Set(globalKeys);
    this.rng = null;       // set per building
    this.litShare = 0.35;
    this.uvScale = {};     // key -> UV multiplier (e.g. bigger granite blocks on 花石楼)
    this.flags = [];       // cloth flags, animated by the entry module: { x, y, z (world, top of the hoist), w, h, row }
  }

  /** register a flag whose hoist top is at the frame-space point (x, y, z) */
  flag(x, y, z, w, h, row) {
    const e = this.m.elements;
    this.flags.push({ x: e[0] * x + e[4] * y + e[8] * z + e[12], y: e[1] * x + e[5] * y + e[9] * z + e[13], z: e[2] * x + e[6] * y + e[10] * z + e[14], w, h, row });
  }

  buf(key) {
    const k = this.global.has(key) ? key : this.prefix + key;
    let b = this.bufs.get(k);
    if (!b) this.bufs.set(k, (b = { pos: [], nor: [], uv: [], col: [] }));
    return b;
  }

  /** child frame translated by (x,y,z) and rotated by rotY (local +Z -> (sin, 0, cos)); resets the surface to flat */
  frame(x, y, z, rotY, fn) {
    this.stack.push([this.m.clone(), this.surf, this.uo, this.vo]);
    const t = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    this.m.multiply(t);
    this.surf = FLAT;
    this.uo += x * 0.371 + z * 0.173; this.vo += z * 0.293;
    const r = fn();
    [this.m, this.surf, this.uo, this.vo] = [...this.stack.pop()];
    return r;
  }
  /** frame along the plan segment a -> b at height y: +X runs from a to b, +Z is the outward normal (to the right of a->b on a north-up map) */
  seg(ax, az, bx, bz, y, fn) {
    const len = Math.hypot(bx - ax, bz - az);
    return this.frame(ax, y, az, Math.atan2(-(bz - az), bx - ax), () => fn(len));
  }
  /** one seg frame per edge of a plan outline (front-left -> front-right -> back-right -> back-left order = outward faces) */
  outline(pts, y, closed, fn) {
    const n = pts.length, m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % n]; this.seg(a[0], a[1], b[0], b[1], y, (len) => fn(i, len)); }
  }
  /** cylindrical surface of radius R around the vertical axis at (x, z): u = arc length (0 at +Z, growing toward +X) */
  cyl(x, y, z, R, fn, rotY = 0) {
    return this.frame(x, y, z, rotY, () => { this.surf = cylSurf(R); return fn(2 * PI * R); });
  }

  /**
   * Convex polygon (surface-space points, CCW seen from outside). col: [r,g,b] or one per vertex.
   * opt: { smooth (use the surface normal), uvf(p) -> [u,v], nor: [[x,y,z]...] frame-space normals }
   */
  poly(key, pts, col, opt) {
    const n = pts.length;
    if (n < 3) return;
    // surface-space normal (Newell) -> UV basis
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    let ex, ez, sx, sy, sz;
    if (Math.abs(ny) > 0.9995) { ex = 1; ez = 0; sx = 0; sy = 0; sz = -1; }
    else { const h = Math.hypot(nx, nz); ex = nz / h; ez = -nx / h; sx = ny * ez; sy = nz * ex - nx * ez; sz = -ny * ex; }
    const e = this.m.elements, surf = this.surf, flat = surf === FLAT;
    const P = new Array(n), tmp = [0, 0, 0];
    for (let i = 0; i < n; i++) { const q = [0, 0, 0]; surf.map(pts[i], q); P[i] = q; }
    // frame-space flat normal
    let fx = nx, fy = ny, fz = nz;
    if (!flat) {
      fx = fy = fz = 0;
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % n];
        fx += (a[1] - b[1]) * (a[2] + b[2]); fy += (a[2] - b[2]) * (a[0] + b[0]); fz += (a[0] - b[0]) * (a[1] + b[1]);
      }
      l = Math.hypot(fx, fy, fz);
      if (l < 1e-9) return;
      fx /= l; fy /= l; fz /= l;
    }
    const B = this.buf(key), per = Array.isArray(col[0]);
    const smooth = opt && opt.smooth, uvf = opt && opt.uvf, nors = opt && opt.nor, uk = this.uvScale[key] || 1;
    const put = (i) => {
      const p = P[i], s = pts[i];
      B.pos.push(e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13], e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]);
      let ax = fx, ay = fy, az = fz;
      if (nors) { ax = nors[i][0]; ay = nors[i][1]; az = nors[i][2]; }
      else if (smooth) { surf.nor(s, tmp); ax = tmp[0]; ay = tmp[1]; az = tmp[2]; }
      B.nor.push(e[0] * ax + e[4] * ay + e[8] * az, e[1] * ax + e[5] * ay + e[9] * az, e[2] * ax + e[6] * ay + e[10] * az);
      if (uvf) { const t = uvf(s); B.uv.push(t[0], t[1]); }
      else B.uv.push((s[0] * ex + s[2] * ez + this.uo) * uk, (s[0] * sx + s[1] * sy + s[2] * sz + this.vo) * uk);
      const c = per ? col[i] : col;
      B.col.push(c[0], c[1], c[2]);
    };
    for (let i = 1; i < n - 1; i++) { put(0); put(i); put(i + 1); }
  }
  q(key, a, b, c, d, col, opt) { this.poly(key, [a, b, c, d], col, opt); }
  /** polygon oriented so that it faces away from `centre` (flat frames only) */
  polyOut(key, pts, centre, col, opt) {
    const n = pts.length;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    let mx = 0, my = 0, mz = 0;
    for (const p of pts) { mx += p[0]; my += p[1]; mz += p[2]; }
    const dot = nx * (mx / n - centre[0]) + ny * (my / n - centre[1]) + nz * (mz / n - centre[2]);
    if (dot < 0) { pts = pts.slice().reverse(); if (Array.isArray(col[0])) col = col.slice().reverse(); }
    this.poly(key, pts, col, opt);
  }

  /**
   * Box in surface space. opt: { skip: 'fblrtu' (front d1, back d0, left u0, right u1, top, under), nu: segments along u,
   * ao: [kBottom, kTop] vertical colour gradient }
   */
  box(key, u0, y0, d0, u1, y1, d1, col = WHITE, opt = {}) {
    const skip = opt.skip || '', nu = opt.nu || 1;
    const cb = opt.ao ? mul(col, opt.ao[0]) : col, ct = opt.ao ? mul(col, opt.ao[1]) : col;
    const v = [cb, cb, ct, ct];
    for (let k = 0; k < nu; k++) {
      const a = u0 + ((u1 - u0) * k) / nu, b = u0 + ((u1 - u0) * (k + 1)) / nu;
      if (!skip.includes('f')) this.q(key, [a, y0, d1], [b, y0, d1], [b, y1, d1], [a, y1, d1], v, opt);
      if (!skip.includes('b')) this.q(key, [b, y0, d0], [a, y0, d0], [a, y1, d0], [b, y1, d0], v);
      if (!skip.includes('t')) this.q(key, [a, y1, d1], [b, y1, d1], [b, y1, d0], [a, y1, d0], ct);
      if (!skip.includes('u')) this.q(key, [a, y0, d0], [b, y0, d0], [b, y0, d1], [a, y0, d1], cb);
    }
    if (!skip.includes('l')) this.q(key, [u0, y0, d0], [u0, y0, d1], [u0, y1, d1], [u0, y1, d0], v);
    if (!skip.includes('r')) this.q(key, [u1, y0, d1], [u1, y0, d0], [u1, y1, d0], [u1, y1, d1], v);
  }

  /** box beam between two points (flat frames). w = horizontal width, h = thickness; opt: { caps: false, anchor: 't'|'b'|'c' } */
  beam(key, a, b, w, h, col = WHITE, opt = {}) {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return;
    dx /= L; dy /= L; dz /= L;
    let sx, sy = 0, sz;
    if (Math.abs(dy) > 0.999) { sx = 1; sz = 0; } else { const h2 = Math.hypot(dx, dz); sx = -dz / h2; sz = dx / h2; }
    // up = side x dir
    const ux = sy * dz - sz * dy, uy = sz * dx - sx * dz, uz = sx * dy - sy * dx;
    const off = opt.anchor === 't' ? -h / 2 : opt.anchor === 'b' ? h / 2 : 0;
    const c = (p, i, j) => [p[0] + sx * w / 2 * i + ux * (h / 2 * j + off), p[1] + uy * (h / 2 * j + off), p[2] + sz * w / 2 * i + uz * (h / 2 * j + off)];
    const A = [c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1)], Bq = [c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)];
    const mid = [(a[0] + b[0]) / 2 + ux * off, (a[1] + b[1]) / 2 + uy * off, (a[2] + b[2]) / 2 + uz * off];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.polyOut(key, [A[i], A[j], Bq[j], Bq[i]], mid, col); }
    if (opt.caps !== false) { this.polyOut(key, A, mid, col); this.polyOut(key, Bq, mid, col); }
  }

  /**
   * Roof / floor slab: polygon (frame space, any winding; made to face up) extruded DOWN by t.
   * o: { uk, uc (underside key/colour), ek, ec (edge key/colour), noUnder, noEdge }
   */
  slab(key, pts, t, col = WHITE, o = {}) {
    let ny = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; ny += (a[2] - b[2]) * (a[0] + b[0]); }
    if (ny < 0) pts = pts.slice().reverse();
    this.poly(key, pts, col);
    const low = pts.map((p) => [p[0], p[1] - t, p[2]]);
    if (!o.noUnder) this.poly(o.uk || 'trim', low.slice().reverse(), o.uc || col);
    if (!o.noEdge) {
      let cx = 0, cy = 0, cz = 0;
      for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
      const c = [cx / n, cy / n - t / 2, cz / n];
      for (let i = 0; i < n; i++) {
        if (o.edges && !o.edges[i]) continue;
        const j = (i + 1) % n;
        this.polyOut(o.ek || 'trim', [low[i], low[j], pts[j], pts[i]], c, o.ec || col);
      }
    }
  }

  /**
   * Hip / gable roof over the plan rectangle. yE = wall-top height (the roof plane passes through the wall line there).
   * o: { axis: 'x'|'z' ridge direction, gable: [start, end] (gable instead of hip), ovG gable overhang, key, col, t, uc, ec, cap }
   * Returns { yRidge, yEdge, tan }.
   */
  hipRoof(x0, z0, x1, z1, yE, pitch, ov, o = {}) {
    const axis = o.axis || (x1 - x0 >= z1 - z0 ? 'x' : 'z');
    const P = axis === 'x' ? (a, b, y) => [a, y, b] : (a, b, y) => [b, y, a];
    const [a0, a1, b0, b1] = axis === 'x' ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const g = o.gable || [false, false], ovG = o.ovG ?? 0.3, tan = Math.tan((pitch * PI) / 180);
    const A0 = a0 - (g[0] ? ovG : ov), A1 = a1 + (g[1] ? ovG : ov), B0 = b0 - ov, B1 = b1 + ov;
    const h = (B1 - B0) / 2, yb = yE - ov * tan, yr = yb + h * tan, bc = (B0 + B1) / 2;
    const i0 = g[0] ? 0 : h, i1 = g[1] ? 0 : h;
    const key = o.key || 'roof', col = o.col || WHITE, t = o.t ?? 0.14;
    const so = { uk: o.uk || 'trim', uc: o.uc || col, ek: o.ek || 'trim', ec: o.ec || col };
    const r0 = P(A0 + i0, bc, yr), r1 = P(A1 - i1, bc, yr);
    this.slab(key, [P(A0, B1, yb), P(A1, B1, yb), r1, r0], t, col, so);
    this.slab(key, [P(A1, B0, yb), P(A0, B0, yb), r0, r1], t, col, so);
    if (i1 > 0) this.slab(key, [P(A1, B1, yb), P(A1, B0, yb), r1], t, col, so);
    if (i0 > 0) this.slab(key, [P(A0, B0, yb), P(A0, B1, yb), r0], t, col, so);
    if (o.cap !== false) {
      const cc = o.capCol || mul(col, 0.8), up = (p) => [p[0], p[1] + 0.03, p[2]];
      this.beam(key, up(r0), up(r1), 0.3, 0.14, cc);
      if (i1 > 0) { this.beam(key, up(P(A1, B1, yb)), up(r1), 0.24, 0.1, cc); this.beam(key, up(P(A1, B0, yb)), up(r1), 0.24, 0.1, cc); }
      if (i0 > 0) { this.beam(key, up(P(A0, B1, yb)), up(r0), 0.24, 0.1, cc); this.beam(key, up(P(A0, B0, yb)), up(r0), 0.24, 0.1, cc); }
    }
    return { yRidge: yr, yEdge: yb, tan, r0, r1 };
  }

  /**
   * Wall with openings on the current surface, u in [u0,u1], y in [y0,y1] (or up to a `top` profile [[u,y]...]).
   * o: { key, col, u0, u1, y0, y1, d, ops: [...], top, pad, mat(u,y,nearOpening) -> {key,col}|null, aoBase (fade m),
   *      aoTop (0..1 darkness at the top), du, dy, smooth, lines: {u:[], y:[]} }
   */
  wall(o) {
    const { key, u0, u1, y0 } = o, col = o.col || WHITE, D = o.d || 0, ops = o.ops || [], pad = o.pad || 0, prof = o.top;
    const y1 = prof ? Math.max(...prof.map((p) => p[1])) : o.y1;
    const topAt = (u) => {
      if (!prof) return y1;
      for (let i = 0; i < prof.length - 1; i++) {
        const a = prof[i], b = prof[i + 1];
        if (u <= b[0] + 1e-9) return a[1] + ((b[1] - a[1]) * sat((u - a[0]) / Math.max(1e-9, b[0] - a[0])));
      }
      return prof[prof.length - 1][1];
    };
    let us = [u0, u1], ys = [y0, y1];
    for (const p of ops) {
      const x0 = p.u - p.w / 2, x1 = p.u + p.w / 2, yT = p.y + p.h;
      us.push(x0, x1); ys.push(p.y, yT);
      if (p.arch) ys.push(yT - p.w / 2);
      if (pad) { us.push(x0 - pad, x1 + pad); ys.push(p.y - pad, yT + pad); }
    }
    if (prof) for (const p of prof) { us.push(p[0]); ys.push(p[1]); }
    const aoB = o.aoBase || 0, aoT = o.aoTop || 0;
    if (aoB) ys.push(y0 + aoB);
    if (aoT && !prof) ys.push(y1 - 0.7);
    if (o.lines) { if (o.lines.u) us.push(...o.lines.u); if (o.lines.y) ys.push(...o.lines.y); }
    us = subdivide(uniq(us, u0, u1), o.du); ys = subdivide(uniq(ys, y0, y1), o.dy);
    const ao = (u, y) => (aoB ? 0.6 + 0.4 * sat((y - y0) / aoB) : 1) * (aoT ? 1 - aoT * (1 - sat((topAt(u) - y) / 0.7)) : 1);
    const inOp = (u, y, g) => { for (const p of ops) if (u > p.u - p.w / 2 - g && u < p.u + p.w / 2 + g && y > p.y - g && y < p.y + p.h + g) return true; return false; };
    const pick = (u, y) => {
      const m = o.mat ? o.mat(u, y, pad ? inOp(u, y, pad) : false) : null;
      return m ? [m.key || key, m.col || col] : [key, col];
    };
    const sm = o.smooth ? { smooth: true } : undefined;
    // optional smooth per-vertex tint (weathering blotches); applied to quads of the wall's own key only
    const tn = o.tint;
    const cv = (k, c, u, y) => {
      const a = ao(u, y);
      if (!tn || k !== key) return mul(c, a);
      const t = tn(u, y);
      return [c[0] * t[0] * a, c[1] * t[1] * a, c[2] * t[2] * a];
    };
    for (let i = 0; i < us.length - 1; i++) {
      const ua = us[i], ub = us[i + 1], uc = (ua + ub) / 2;
      const ta = topAt(ua), tb = topAt(ub), lo = Math.min(ta, tb);
      for (let j = 0; j < ys.length - 1; j++) {
        const ya = ys[j], yb = ys[j + 1];
        if (yb <= lo + 1e-6) {
          const yc = (ya + yb) / 2;
          if (inOp(uc, yc, 0)) continue;
          const [k, c] = pick(uc, yc);
          this.q(k, [ua, ya, D], [ub, ya, D], [ub, yb, D], [ua, yb, D], [cv(k, c, ua, ya), cv(k, c, ub, ya), cv(k, c, ub, yb), cv(k, c, ua, yb)], sm);
        } else {
          const [k, c] = pick(uc, (ya + lo) / 2 + 0.01);
          const pts = [[ua, ya, D], [ub, ya, D]], cs = [cv(k, c, ua, ya), cv(k, c, ub, ya)];
          if (tb > ya + 1e-6) { pts.push([ub, tb, D]); cs.push(cv(k, c, ub, tb)); }
          if (ta > ya + 1e-6) { pts.push([ua, ta, D]); cs.push(cv(k, c, ua, ta)); }
          this.poly(k, pts, cs, sm);
          break;
        }
      }
    }
    for (const p of ops) {
      const [k, c] = pick(p.u, p.y + p.h - 0.02);
      this.opening(p, k, mul(c, ao(p.u, p.y + p.h * 0.6)), D);
    }
  }

  /**
   * One opening. p: { u, y, w, h, arch, kind: 'win'|'door'|'void', rev, lit, glass (key override), frame (colour), fw,
   *   bars: [nv, nh], sill: false | colour, sillKey, sur: { key, col, w, p }, shut: colour, doorCol, uvf, n }
   */
  opening(p, wk, wc, D = 0) {
    const kind = p.kind || 'win';
    const x0 = p.u - p.w / 2, x1 = p.u + p.w / 2, y0 = p.y, yT = p.y + p.h, r = p.w / 2, arch = !!p.arch, ys = arch ? yT - r : yT;
    const rev = p.rev ?? (kind === 'door' ? 0.26 : kind === 'void' ? 0.45 : 0.18), zi = D - rev, N = p.n || 8;
    const c0 = mul(wc, 0.86), c1 = mul(wc, 0.48);
    const arc = [];
    if (arch) for (let i = 0; i <= N; i++) { const a = PI - (PI * i) / N; arc.push([p.u + Math.cos(a) * r, ys + Math.sin(a) * r]); }
    if (arch) {
      for (let i = 0; i < N; i++) {
        const cx = i < N / 2 ? x0 : x1;
        this.poly(wk, [[cx, yT, D], [arc[i][0], arc[i][1], D], [arc[i + 1][0], arc[i + 1][1], D]], wc);
      }
    }
    // reveals
    this.q(wk, [x0, y0, D], [x0, y0, zi], [x0, ys, zi], [x0, ys, D], [c0, c1, c1, c0]);
    this.q(wk, [x1, y0, zi], [x1, y0, D], [x1, ys, D], [x1, ys, zi], [c1, c0, c0, c1]);
    this.q(wk, [x0, y0, D], [x1, y0, D], [x1, y0, zi], [x0, y0, zi], [c0, c0, c1, c1]);
    if (!arch) this.q(wk, [x0, yT, zi], [x1, yT, zi], [x1, yT, D], [x0, yT, D], [c1, c1, c0, c0]);
    else for (let i = 0; i < N; i++) {
      const a = arc[i], b = arc[i + 1];
      this.q(wk, [a[0], a[1], zi], [b[0], b[1], zi], [b[0], b[1], D], [a[0], a[1], D], [c1, c1, c0, c0]);
    }
    const fc = p.frame || [0.07, 0.045, 0.03], fw = p.fw ?? 0.07, zf = zi + 0.03;
    const strip = (ax, ay, bx, by, w, c = fc, z = zf) => {
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, px = (-dy / l) * w / 2, py = (dx / l) * w / 2;
      this.q('trim', [ax + px, ay + py, z], [ax - px, ay - py, z], [bx - px, by - py, z], [bx + px, by + py, z], c);
    };
    const topAt = (x) => (arch ? ys + Math.sqrt(Math.max(0, r * r - (x - p.u) * (x - p.u))) : yT);
    const pane = (key, ya, c, opt) => {
      if (ys > ya + 1e-6) this.q(key, [x0, ya, zi], [x1, ya, zi], [x1, ys, zi], [x0, ys, zi], c, opt);
      if (arch) this.poly(key, arc.slice().reverse().map((a) => [a[0], a[1], zi]), c, opt);
    };
    const frameRing = () => {
      strip(x0 + fw / 2, y0, x0 + fw / 2, ys, fw); strip(x1 - fw / 2, y0, x1 - fw / 2, ys, fw); strip(x0, y0 + fw / 2, x1, y0 + fw / 2, fw);
      if (!arch) strip(x0, yT - fw / 2, x1, yT - fw / 2, fw);
      else for (let i = 0; i < N; i++) {
        const a = arc[i], b = arc[i + 1], k = (r - fw) / r;
        this.q('trim', [p.u + (a[0] - p.u) * k, ys + (a[1] - ys) * k, zf], [p.u + (b[0] - p.u) * k, ys + (b[1] - ys) * k, zf], [b[0], b[1], zf], [a[0], a[1], zf], fc);
      }
    };
    if (kind === 'win') {
      const lit = p.lit ?? (this.rng ? this.rng() < this.litShare : false);
      const gk = p.glass || (lit ? 'lit' : 'glass');
      pane(gk, y0, WHITE, p.uvf ? { uvf: p.uvf } : gk === 'stained' ? { uvf: (s) => [(s[0] - x0) / 0.9 + 0.5 - p.w / 1.8, (s[1] - y0) / 0.9] } : undefined);
      frameRing();
      const bars = p.bars || [0, 0];
      for (let k = 1; k <= bars[0]; k++) { const x = x0 + (p.w * k) / (bars[0] + 1); strip(x, y0, x, topAt(x), 0.045); }
      for (let k = 1; k <= bars[1]; k++) { const y = y0 + ((ys - y0) * k) / (bars[1] + 1); strip(x0, y, x1, y, 0.045); }
      if (arch && bars[1]) strip(x0, ys, x1, ys, 0.05);
      if (p.sill !== false) this.box(p.sillKey || 'stone', x0 - 0.1, y0 - 0.12, D, x1 + 0.1, y0, D + 0.11, p.sill || WHITE, { skip: 'b' });
    } else if (kind === 'door') {
      const dc = p.doorCol || [0.14, 0.05, 0.02], yd = arch ? ys : yT;
      this.q('trim', [x0, y0, zi], [x1, y0, zi], [x1, yd, zi], [x0, yd, zi], [mul(dc, 0.75), mul(dc, 0.75), dc, dc]);
      if (arch) this.poly(p.fan === false ? 'trim' : (p.glass || 'lit'), arc.slice().reverse().map((a) => [a[0], a[1], zi]), p.fan === false ? dc : WHITE);
      frameRing();
      if (arch) strip(x0, ys, x1, ys, 0.07);
      const leaves = p.w > 1.25 ? 2 : 1, lw = (p.w - 2 * fw) / leaves;
      for (let k = 0; k < leaves; k++) {
        const ax = x0 + fw + lw * k + 0.1, bx = x0 + fw + lw * (k + 1) - 0.1, h = yd - y0;
        const pc = mul(dc, 0.62);
        this.q('trim', [ax, y0 + 0.18, zi + 0.012], [bx, y0 + 0.18, zi + 0.012], [bx, y0 + h * 0.42, zi + 0.012], [ax, y0 + h * 0.42, zi + 0.012], pc);
        this.q(p.glazed ? (p.glass || 'glass') : 'trim', [ax, y0 + h * 0.5, zi + 0.012], [bx, y0 + h * 0.5, zi + 0.012], [bx, yd - 0.16, zi + 0.012], [ax, yd - 0.16, zi + 0.012], p.glazed ? WHITE : pc);
        if (k) strip(x0 + fw + lw * k, y0, x0 + fw + lw * k, yd, 0.05);
      }
    }
    if (p.sur) {
      const s = p.sur, w = s.w ?? 0.16, pr = s.p ?? 0.05, sk = s.key || 'trim', sc = s.col || WHITE, Df = D + pr;
      this.box(sk, x0 - w, y0, D, x0, ys, Df, sc, { skip: 'bu' });
      this.box(sk, x1, y0, D, x1 + w, ys, Df, sc, { skip: 'bu' });
      if (!arch) this.box(sk, x0 - w, yT, D, x1 + w, yT + w, Df, sc, { skip: 'b' });
      else {
        const k = (r + w) / r;
        for (let i = 0; i < N; i++) {
          const a = arc[i], b = arc[i + 1];
          const ao = [p.u + (a[0] - p.u) * k, ys + (a[1] - ys) * k], bo = [p.u + (b[0] - p.u) * k, ys + (b[1] - ys) * k];
          const cc = s.alt && i % 2 ? mul(sc, s.alt) : sc;
          this.q(sk, [a[0], a[1], Df], [b[0], b[1], Df], [bo[0], bo[1], Df], [ao[0], ao[1], Df], cc);
          this.q(sk, [ao[0], ao[1], Df], [bo[0], bo[1], Df], [bo[0], bo[1], D], [ao[0], ao[1], D], cc);
        }
      }
    }
    if (p.shut) {
      const sw = p.w / 2 - 0.02;
      for (const s of [-1, 1]) {
        const a = s < 0 ? x0 - 0.04 - sw : x1 + 0.04;
        this.box('trim', a, y0, D, a + sw, yT, D + 0.045, p.shut, { skip: 'b' });
        for (let k = 1; k < 6; k++) strip(a + 0.06, y0 + (p.h * k) / 6, a + sw - 0.06, y0 + (p.h * k) / 6, 0.03, mul(p.shut, 0.6), D + 0.05);
      }
    }
  }

  /** balustrade between two points (flat frames): top rail, bottom rail, balusters. o: { h, key, col, step, bw, rail: [w,h], solidBase } */
  balustrade(a, b, o = {}) {
    const h = o.h ?? 0.9, key = o.key || 'trim', col = o.col || WHITE, step = o.step ?? 0.16, bw = o.bw ?? 0.045, rail = o.rail || [0.09, 0.07];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.beam(key, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], rail[0], rail[1], col, { anchor: 't' });
    this.beam(key, [a[0], a[1] + 0.1, a[2]], [b[0], b[1] + 0.1, b[2]], rail[0] * 0.8, rail[1] * 0.8, col);
    const n = Math.max(1, Math.round(L / step));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      this.beam(key, [x, y + 0.1, z], [x, y + h - rail[1], z], bw, bw, col, { caps: false });
    }
  }

  /**
   * Flight of steps descending along +Z from the frame origin (top edge centre at y = 0). ground(z) -> local ground y.
   * Returns the run length.
   */
  stairs(key, w, ground, col = WHITE, o = {}) {
    const rise = o.rise ?? 0.165, tread = o.tread ?? 0.32, nose = 0.035, tt = 0.045;
    const rc = mul(col, o.riser ?? 0.68), rc2 = mul(col, (o.riser ?? 0.68) * 0.8);
    let i = 1;
    for (; i < 40; i++) {
      const y = -i * rise, z0 = (i - 1) * tread, z1 = z0 + tread, g = ground(z0 + tread / 2), yb = Math.min(g, y) - 0.35;
      // tread slab with a nosing (casts a line on the riser below), then the darker riser block
      this.box(key, -w / 2 - 0.02, y - tt, z0, w / 2 + 0.02, y, z1 + nose, col, { skip: 'b' });
      this.q(key, [-w / 2, yb, z1], [w / 2, yb, z1], [w / 2, y - tt, z1], [-w / 2, y - tt, z1], [rc2, rc2, rc, rc]);
      this.q(key, [-w / 2, yb, z0], [-w / 2, yb, z1], [-w / 2, y - tt, z1], [-w / 2, y - tt, z0], [rc2, rc2, rc, rc]);
      this.q(key, [w / 2, yb, z1], [w / 2, yb, z0], [w / 2, y - tt, z0], [w / 2, y - tt, z1], [rc2, rc2, rc, rc]);
      if (y - rise < g + 0.03) break;
    }
    return i * tread;
  }

  /** add a THREE geometry authored in the current (flat) frame. col: [r,g,b] or fn(x,y,z) -> [r,g,b] */
  addGeo(key, geometry, col = WHITE, o = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, e = this.m.elements, B = this.buf(key), fn = typeof col === 'function';
    const s = o.uvScale || this.uvScale[key] || 1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      B.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      B.nor.push(e[0] * nx + e[4] * ny + e[8] * nz, e[1] * nx + e[5] * ny + e[9] * nz, e[2] * nx + e[6] * ny + e[10] * nz);
      if (Math.abs(ny) > 0.75) B.uv.push(x * s + this.uo, -z * s + this.vo);
      else if (Math.abs(nx) > Math.abs(nz)) B.uv.push(z * s + this.uo, y * s + this.vo);
      else B.uv.push(x * s + this.uo, y * s + this.vo);
      const c = fn ? col(x, y, z) : col;
      B.col.push(c[0], c[1], c[2]);
    }
    g.dispose(); if (g !== geometry) geometry.dispose();
  }
  /** vertical cylinder / cone, base centre at (x, y, z) */
  column(key, x, y, z, r, h, col = WHITE, n = 10, rTop = r, open = true) {
    const g = new THREE.CylinderGeometry(rTop, r, h, n, 1, open);
    g.translate(x, y + h / 2, z);
    this.addGeo(key, g, col);
  }
  sphere(key, x, y, z, r, col = WHITE, n = 8) {
    const g = new THREE.SphereGeometry(r, n, Math.max(4, n - 2));
    g.translate(x, y, z);
    this.addGeo(key, g, col);
  }
  /** rounded boulder: p-norm ball scaled to (sx, sy, sz), noisy; power 2 = ellipsoid, 5 = rounded block */
  rock(key, x, y, z, sx, sy, sz, seed, col = WHITE, o = {}) {
    const pw = o.power || 2.6, amp = o.amp ?? 0.16, detail = o.detail ?? 1;
    let g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    const pos = g.attributes.position;
    const h3 = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + seed * 19.19) * 43758.5453; return s - Math.floor(s); };
    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const k = 1 / Math.pow(Math.pow(Math.abs(px), pw) + Math.pow(Math.abs(py), pw) + Math.pow(Math.abs(pz), pw), 1 / pw);
      const q = (v) => Math.round(v * 2.2);
      const nse = 1 + amp * (h3(q(px), q(py), q(pz)) - 0.5) * 2 + amp * 0.4 * (h3(px * 9, py * 9, pz * 9) - 0.5);
      px *= k * nse * sx; py *= k * nse * sy; pz *= k * nse * sz;
      pos.setXYZ(i, px, py, pz);
    }
    g.computeVertexNormals();
    if (o.rotY) g.rotateY(o.rotY);
    if (o.rotX) g.rotateX(o.rotX);
    g.translate(x, y, z);
    const lo = y - sy, c2 = typeof col === 'function' ? col : (px, py) => mul(col, 0.62 + 0.38 * sat((py - lo) / (sy * 0.9)));
    this.addGeo(key, g, c2, o);
  }

  /** key -> BufferGeometry (position, normal, uv, color) */
  finish() {
    const out = new Map();
    for (const [k, b] of this.bufs) {
      if (!b.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nor), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3));
      g.computeBoundingSphere(); g.computeBoundingBox();
      out.set(k, g);
    }
    return out;
  }
  tris() { let n = 0; for (const b of this.bufs.values()) n += b.pos.length / 9; return n; }
}

/** site helper for one landmark: local <-> world, ground heights relative to the floor level F */
export function site(L, F, heightAt) {
  const c = Math.cos(L.rot), s = Math.sin(L.rot);
  const S = {
    L, F,
    wx: (lx, lz) => L.x + lx * c + lz * s,
    wz: (lx, lz) => L.z - lx * s + lz * c,
    /** ground height at local (lx, lz), relative to F */
    gy: (lx, lz) => heightAt(L.x + lx * c + lz * s, L.z - lx * s + lz * c) - F,
    /** min / max ground over a local rectangle */
    range(x0, z0, x1, z1, n = 5) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
        const g = S.gy(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * j) / n);
        if (g < lo) lo = g; if (g > hi) hi = g;
      }
      return { lo, hi };
    },
  };
  return S;
}

/** plan rectangle as an outline in the order front-left, front-right, back-right, back-left (faces: 0 front +Z, 1 right +X, 2 back, 3 left) */
export const rect = (x0, z0, x1, z1) => [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
