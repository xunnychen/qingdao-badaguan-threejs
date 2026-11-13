// Tree template builder: tapered tubes (trunk / limbs) and leaf-cluster cards with sphere-bent normals, emitted at one of
// three levels of detail. A template is plain typed arrays in tree-local space (root at the origin, +y up); the forest
// code stamps it into per-cell merged meshes.
//   lod 0 (near): textured bark tubes in the trunk mesh + every card (folded, 4 triangles).
//   lod 1 (mid):  trunk and main limbs as flat-coloured tubes inside the leaf mesh + a subset of enlarged cards.
//   lod 2 (far):  3-sided trunk + a handful of large cards.
//   lod 3 (shadow proxy for near cells): the near trunk and main limbs as solid tubes + the mid subset of cards, all in
//                 the leaf arrays. The forest appends it to the near foliage geometry and draws it only into shadow maps.
import { ATLAS_N, TILE } from './atlas.js';

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mix: (a, b, wa, wb) => [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb],
};

const INSET = 0.014;
const SOLID_U = ((TILE.solid % ATLAS_N) + 0.5) / ATLAS_N, SOLID_V = (Math.floor(TILE.solid / ATLAS_N) + 0.5) / ATLAS_N;

/**
 * cfg: { mid: [step, scale], far: [step, scale], midLevel }  rand: seeded rng (used for the card shuffle only)
 */
export function makeBuilder(lod, cfg, rand) {
  const trunk = { P: [], N: [], UV: [], S: [], I: [] };
  const leaf = { P: [], N: [], UV: [], T: [], B: [], H: [], FL: [], TR: [], BD: [], I: [] };
  const cards = [];
  const shadow = lod === 3, cls = shadow ? 1 : lod;       // species code sees lod 3 as mid
  const b = { lod: cls, shadow, crown: [0, 0, 0], crownR: [1, 1, 1] };

  function leafVert(p, n, u, v, tone, bright, hash, fl, tr, bd) {
    leaf.P.push(p[0], p[1], p[2]); leaf.N.push(n[0], n[1], n[2]); leaf.UV.push(u, v);
    leaf.T.push(tone); leaf.B.push(bright); leaf.H.push(hash); leaf.FL.push(fl); leaf.TR.push(tr); leaf.BD.push(bd);
    return leaf.T.length - 1;
  }

  /** path: [[x,y,z,r], ...]; level 0 trunk, 1 main limb, 2 secondary (near only). */
  b.tube = (path, { sides = 6, level = 0, shade = 1 } = {}) => {
    if (cls === 1 && level > (cfg.midLevel ?? 1)) return;
    if (lod === 2 && level > 0) return;
    let pts = path;
    // near trunk (and its shadow proxy, which must keep the same surface): round off the bends with one Catmull-Rom
    // point per span that turns, so a leaning trunk does not kink at a ring
    if (level === 0 && (lod === 0 || shadow) && pts.length > 2) {
      const dirs = [];
      for (let i = 0; i < pts.length - 1; i++) dirs.push(V.norm(V.sub(pts[i + 1], pts[i])));
      const bent = (i) => i > 0 && i < pts.length - 1 && V.dot(dirs[i - 1], dirs[i]) < 0.9985;       // about 3 degrees
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        if (bent(i) || bent(i + 1)) {
          const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
          out.push([0, 1, 2, 3].map((k) => (k === 3 ? (p1[3] + p2[3]) / 2 : (-p0[k] + 9 * p1[k] + 9 * p2[k] - p3[k]) / 16)));
        }
        out.push(pts[i + 1]);
      }
      pts = out;
    }
    // mid: everything decimated; shadow proxy: the trunk keeps the near surface (no self-shadow mismatch), limbs are decimated
    if (lod === 1 || (shadow && level > 0)) { sides = level === 0 ? 5 : 3; if (pts.length > 3) pts = pts.filter((_, i) => i === 0 || i === pts.length - 1 || i % 2 === 0); }
    if (lod === 2) { sides = 3; pts = pts.length > 3 ? [pts[0], pts[pts.length >> 1], pts[pts.length - 1]] : [pts[0], pts[pts.length - 1]]; }
    const n = pts.length, near = lod === 0;
    const base = near ? trunk.S.length : leaf.T.length;
    const uRep = Math.max(1, Math.round((Math.PI * 2 * pts[0][3]) / 0.9));
    let a = null, cum = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(n - 1, i + 1)];
      const t = V.norm(V.sub(q1, q0));
      if (!a) { const ref = Math.abs(t[0]) < 0.8 ? [1, 0, 0] : [0, 0, 1]; a = V.norm(V.sub(ref, V.mul(t, V.dot(ref, t)))); }
      else a = V.norm(V.sub(a, V.mul(t, V.dot(a, t))));
      const bn = V.cross(t, a);
      if (i) cum += V.len(V.sub(p, pts[i - 1]));
      for (let j = 0; j <= sides; j++) {
        const th = (j / sides) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        const nr = [a[0] * c + bn[0] * s, a[1] * c + bn[1] * s, a[2] * c + bn[2] * s];
        const pos = [p[0] + nr[0] * p[3], p[1] + nr[1] * p[3], p[2] + nr[2] * p[3]];
        if (near) {
          trunk.P.push(pos[0], pos[1], pos[2]); trunk.N.push(nr[0], nr[1], nr[2]);
          trunk.UV.push((j / sides) * uRep, cum); trunk.S.push(shade);
        } else leafVert(pos, nr, SOLID_U, SOLID_V, 8, shade, 0, 0, 0, 0);
      }
    }
    const I = near ? trunk.I : leaf.I, row = sides + 1;
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
      const v0 = base + i * row + j, v1 = v0 + 1, v2 = v0 + row + 1, v3 = v0 + row;
      I.push(v0, v1, v2, v0, v2, v3);
    }
  };

  /**
   * Leaf card. o: { c:[x,y,z] centre, n: facing, up: reference for the card's vertical axis, w, h, tile, tone (0..3 offset
   * from the tree's tone, 4..7 absolute, 12..15 absolute in the alternate palette slot), bright, trans, flutter, backDark, fold, roll, flip, normal (fixed), nMix, keep }
   */
  b.card = (o) => { cards.push(o); };

  /** Raw leaf-material geometry (hulls). verts: [{p, n, u, v, bright}], idx relative. Tile UVs are tile-local 0..1. */
  b.raw = (verts, idx, { tile, tone = 0, trans = 0.1, flutter = 0.01, hash = 0 }) => {
    const col = tile % ATLAS_N, rowT = Math.floor(tile / ATLAS_N), base = leaf.T.length;
    for (const v of verts) leafVert(v.p, v.n, (col + v.u) / ATLAS_N, (rowT + v.v) / ATLAS_N, tone, v.bright ?? 1, hash, flutter, trans, -1);
    for (const i of idx) leaf.I.push(base + i);
  };

  function emitCard(o, scale, fold) {
    const n = V.norm(o.n);
    const upRef = o.up || [0, 1, 0];
    let v = V.sub(upRef, V.mul(n, V.dot(upRef, n)));
    if (V.len(v) < 1e-3) v = V.sub([1, 0, 0], V.mul(n, n[0]));
    v = V.norm(v);
    let u = V.cross(v, n);
    if (o.roll) {
      const c = Math.cos(o.roll), s = Math.sin(o.roll);
      const u2 = V.mix(u, v, c, s), v2 = V.mix(v, u, c, -s);
      u = u2; v = v2;
    }
    const hw = (o.w * scale) / 2, hh = (o.h * scale) / 2;
    const col = o.tile % ATLAS_N, rowT = Math.floor(o.tile / ATLAS_N);
    let u0 = (col + INSET) / ATLAS_N, u1 = (col + 1 - INSET) / ATLAS_N;
    if (o.flip) { const t = u0; u0 = u1; u1 = t; }
    const vTop = (rowT + INSET) / ATLAS_N, vBot = (rowT + 1 - INSET) / ATLAS_N;
    const nMix = o.nMix ?? 0.3, C = o.nc || b.crown, R = b.crownR;
    const base = leaf.T.length;
    const colsX = fold ? [-1, 0, 1] : [-1, 1];
    // shading that varies ACROSS a crown card (one flat tone per quad reads as a sheet of paper): each corner takes the
    // shade of its own depth in the crown (darker toward the middle), and the lower edge sits in the card's own shade
    const depthOf = (q) => Math.min(1.15, Math.hypot((q[0] - C[0]) / R[0], (q[1] - C[1]) / R[1], (q[2] - C[2]) / R[2]));
    const grad = o.normal || o.flat ? 0 : 1, fc = grad ? depthOf(o.c) : 0;
    for (const sy of [-1, 1]) for (const sx of colsX) {
      const off = fold && sx === 0 ? fold * o.w * scale : 0;
      const p = [o.c[0] + u[0] * sx * hw + v[0] * sy * hh + n[0] * off, o.c[1] + u[1] * sx * hw + v[1] * sy * hh + n[1] * off,
        o.c[2] + u[2] * sx * hw + v[2] * sy * hh + n[2] * off];
      let nr;
      if (o.normal) nr = V.norm(V.mix(o.normal, [u[0] * sx + v[0] * sy, u[1] * sx + v[1] * sy, u[2] * sx + v[2] * sy], 1, 0.22));
      else {
        const sph = V.norm([(p[0] - C[0]) / R[0], (p[1] - C[1]) / R[1], (p[2] - C[2]) / R[2]]);
        nr = V.norm(V.mix(sph, n, 1 - nMix, nMix));
      }
      const shade = grad ? Math.max(0.66, Math.min(1.3, 1 + 1.1 * (depthOf(p) - fc))) * (1 + 0.07 * sy) : 1;
      leafVert(p, nr, u0 + (u1 - u0) * (sx * 0.5 + 0.5), sy > 0 ? vTop : vBot, o.tone ?? 0, (o.bright ?? 1) * shade, o.hash, o.flutter ?? 0.04, o.trans ?? 0.5, o.backDark ?? 0);
    }
    if (fold) leaf.I.push(base, base + 1, base + 4, base, base + 4, base + 3, base + 1, base + 2, base + 5, base + 1, base + 5, base + 4);
    else leaf.I.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }

  b.finish = () => {
    // deterministic shuffle so LOD subsampling takes an even spread of the crown
    const order = cards.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    let k = 0;
    for (const i of order) {
      const o = cards[i];
      const h = rand();
      o.hash = o.kill ?? h;            // leaf-fill thinning order: `kill` lets a species drop unsupported cards first
      if (lod === 0) { emitCard(o, 1, o.fold ?? 0); continue; }
      if (o.loose) continue;           // not on a limb this LOD draws
      const [step, scale] = cls === 1 ? cfg.mid : cfg.far;
      if ((o.keep || 0) >= cls) { emitCard(o, o.keepScale ?? (cls === 2 ? 1.25 : 1.1), 0); continue; }
      if (k++ % step === 0) emitCard(o, scale, 0);
    }
    const f = (a) => new Float32Array(a);
    return {
      trunk: { nv: trunk.S.length, P: f(trunk.P), N: f(trunk.N), UV: f(trunk.UV), S: f(trunk.S), I: new Uint32Array(trunk.I) },
      leaf: { nv: leaf.T.length, P: f(leaf.P), N: f(leaf.N), UV: f(leaf.UV), T: f(leaf.T), B: f(leaf.B), H: f(leaf.H), FL: f(leaf.FL), TR: f(leaf.TR),
        BD: f(leaf.BD), I: new Uint32Array(leaf.I) },
    };
  };
  return b;
}
