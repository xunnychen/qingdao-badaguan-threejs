// Reusable villa parts. Everything draws into V.S (a Sink) in the villa's local frame:
// +X right, +Z front (street), y = 0 at the ground-floor level. V = { S, rng, gy(lx, lz), yb, roof, lot }.
import { lin, mul } from './sink.js';

export const TRIM = { white: lin('#F2EEE2'), green: lin('#2F5341'), oxblood: lin('#7A2E25'), brown: lin('#5A3B28') };
export const STONE = lin('#b3ada1');
export const IRON = lin('#1F2321');
export const POT = lin('#b0603c');
const PI = Math.PI;
const CURTAIN = [lin('#e9e2d0'), lin('#d9c9a8'), lin('#c9b2a0'), lin('#e4dccb'), lin('#b9c2b4')];

const uniq = (arr, lo, hi) => {
  const a = arr.filter((v) => v >= lo - 1e-6 && v <= hi + 1e-6).sort((p, q) => p - q), out = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 0.015) out.push(v);
  return out;
};

/** points of an arch from the left springing over the crown to the right springing; kind 'round' | 'seg' */
function archPts(u, yT, w, kind, n = 8) {
  const pts = [];
  if (kind === 'round') {
    const r = w / 2, cy = yT - r;
    for (let i = 0; i <= n; i++) { const a = PI - (PI * i) / n; pts.push([u + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  } else {
    const rise = 0.17 * w, R = (w * w / 4 + rise * rise) / (2 * rise), cy = yT - R, ph = Math.asin(w / 2 / R);
    for (let i = 0; i <= n; i++) { const a = PI / 2 + ph - (2 * ph * i) / n; pts.push([u + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  }
  return pts;
}

/** flat strip (quad) along a 2D segment in the plane z, facing +z */
export function strip(S, key, x0, y0, x1, y1, w, z, col) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, px = (-dy / l) * w / 2, py = (dx / l) * w / 2;
  S.quadO(key, [x0 - px, y0 - py, z], [x1 - px, y1 - py, z], [x1 + px, y1 + py, z], [x0 + px, y0 + py, z], [0, 0, 1], col);
}

/**
 * One opening in a wall (canonical wall frame: wall along +X at z = 0 facing +Z).
 * p: { u, y, w, h, kind: 'win' | 'door' | 'garage' | 'void', arch: 'round' | 'seg', lit, frame, bars: [nv, nh],
 *      sill, surround, shutters, doorCol, rev, overlay }
 */
export function opening(V, p, wk) {
  const S = V.S, { u, y, w, h } = p, kind = p.kind || 'win';
  const x0 = u - w / 2, x1 = u + w / 2, yT = y + h, overlay = !!p.overlay;
  const rev = p.rev ?? (kind === 'door' || kind === 'garage' ? 0.24 : kind === 'void' ? 0.42 : 0.17);
  let arc = null, ys = yT;
  if (p.arch) { arc = archPts(u, yT, w, p.arch, p.arch === 'round' ? 8 : 6); ys = arc[0][1]; }
  const acx = u, acy = p.arch === 'round' ? ys : ys - w;
  if (!overlay) {
    if (arc) {
      const mid = arc.length >> 1;
      for (let i = 0; i < arc.length - 1; i++) {
        const c = i < mid ? [x0, yT, 0] : [x1, yT, 0];
        S.fan(wk.key, [c, [arc[i][0], arc[i][1], 0], [arc[i + 1][0], arc[i + 1][1], 0]], [0, 0, 1], wk.col);
      }
    }
    const c0 = mul(wk.col, kind === 'void' ? 0.9 : 0.82), c1 = mul(wk.col, kind === 'void' ? 0.6 : 0.5);
    S.quadO(wk.key, [x0, y, 0], [x0, y, -rev], [x0, ys, -rev], [x0, ys, 0], [1, 0, 0], [c0, c1, c1, c0]);
    S.quadO(wk.key, [x1, y, 0], [x1, y, -rev], [x1, ys, -rev], [x1, ys, 0], [-1, 0, 0], [c0, c1, c1, c0]);
    if (kind === 'win') S.quadO(wk.key, [x0, y, 0], [x1, y, 0], [x1, y, -rev], [x0, y, -rev], [0, 1, 0], [c0, c0, c1, c1]);
    if (arc) {
      for (let i = 0; i < arc.length - 1; i++) {
        const a = arc[i], b = arc[i + 1];
        S.quadO(wk.key, [a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], -rev], [a[0], a[1], -rev],
          [acx - (a[0] + b[0]) / 2, acy - (a[1] + b[1]) / 2, 0], [c0, c0, c1, c1]);
      }
    } else S.quadO(wk.key, [x0, yT, 0], [x1, yT, 0], [x1, yT, -rev], [x0, yT, -rev], [0, -1, 0], [c0, c0, c1, c1]);
    if (kind === 'void') return;
  }
  const zg = overlay ? 0.02 : -rev, zf = zg + 0.035;
  const gk = p.lit ? 'lit' : 'glass', G = [1, 1, 1];
  const fc = p.frame || TRIM.white;
  const R = (xa, xb, ya, yb, z, col, key = 'fine') => S.quad(key, [xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z], col);
  const arcFan = (key, z, col) => S.fan(key, arc.map((q) => [q[0], q[1], z]), [0, 0, 1], col);
  if (kind === 'door' || kind === 'garage') {
    const dc = p.doorCol || TRIM.brown;
    R(x0, x1, y, ys, zg, dc, 'paint');   // the leaf itself stays in the coarse mesh (never hidden)
    const nc = kind === 'garage' ? 4 : 2, nr = kind === 'garage' ? 2 : 3, pc = mul(dc, 0.68), m = 0.1;
    const pw = (w - 2 * 0.09 - m * (nc + 1)) / nc, ph = (ys - y - 0.09 - m * (nr + 1)) / nr;
    for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) {
      const px = x0 + 0.09 + m + i * (pw + m), py = y + m + j * (ph + m);
      const glazed = p.glazed && j === nr - 1;
      R(px, px + pw, py, py + ph, zg + 0.012, glazed ? G : pc, glazed ? gk : 'fine');
    }
    if (arc) arcFan(gk, zg, G);
  } else {
    R(x0, x1, y, ys, zg, G, gk);
    if (arc) arcFan(gk, zg, G);
    // drawn-back curtains / a half-lowered blind behind some panes
    if (w > 0.7 && p.curtain !== false) {
      const cr = V.rng();
      if (cr < 0.4) {
        const cw = w * V.rng.range(0.14, 0.24), cc = mul(CURTAIN[(cr * 30) % CURTAIN.length | 0], p.lit ? 0.95 : 0.8);
        R(x0, x0 + cw, y, ys, zg + 0.012, cc); R(x1 - cw, x1, y, ys, zg + 0.012, cc);
      } else if (cr < 0.55) R(x0, x1, ys - (ys - y) * V.rng.range(0.25, 0.5), ys, zg + 0.012, mul(CURTAIN[0], p.lit ? 0.9 : 0.72));
    }
  }
  // frame
  const fw = p.fw ?? 0.07;
  R(x0, x0 + fw, y, ys, zf, fc); R(x1 - fw, x1, y, ys, zf, fc);
  if (kind === 'win') R(x0 + fw, x1 - fw, y, y + fw, zf, fc);
  if (arc) {
    R(x0 + fw, x1 - fw, ys - 0.03, ys + 0.03, zf, fc);
    for (let i = 0; i < arc.length - 1; i++) {
      const a = arc[i], b = arc[i + 1];
      const ia = inset(a, acx, acy, fw), ib = inset(b, acx, acy, fw);
      S.quadO('fine', [a[0], a[1], zf], [b[0], b[1], zf], [ib[0], ib[1], zf], [ia[0], ia[1], zf], [0, 0, 1], fc);
    }
    R(u - 0.022, u + 0.022, ys, yT - fw, zf, fc);
  } else R(x0 + fw, x1 - fw, yT - fw, yT, zf, fc);
  if (kind === 'win') {
    const nv = p.bars?.[0] ?? (w > 1.45 ? 2 : 1), nh = p.bars?.[1] ?? (ys - y > 1.45 ? 2 : 1), bw = 0.022;
    for (let k = 1; k <= nv; k++) { const bx = x0 + (w * k) / (nv + 1); R(bx - bw, bx + bw, y + fw, ys - (arc ? 0 : fw), zf, fc); }
    for (let k = 1; k <= nh; k++) { const by = y + ((ys - y) * k) / (nh + 1); R(x0 + fw, x1 - fw, by - bw, by + bw, zf, fc); }
    if (p.sill !== false) S.box('fine', x0 - 0.1, x1 + 0.1, y - 0.1, y, overlay ? 0 : -0.03, 0.1, p.sillCol || STONE, 'bd');
  }
  if (p.surround) {
    const sc = p.surround, sw = p.sw ?? 0.15, z = 0.03;
    R(x0 - sw, x0, y, ys, z, sc); R(x1, x1 + sw, y, ys, z, sc);
    if (arc) {
      for (let i = 0; i < arc.length - 1; i++) {
        const a = arc[i], b = arc[i + 1];
        const oa = inset(a, acx, acy, -sw), ob = inset(b, acx, acy, -sw);
        S.quadO('fine', [a[0], a[1], z], [b[0], b[1], z], [ob[0], ob[1], z], [oa[0], oa[1], z], [0, 0, 1], sc);
      }
    } else R(x0 - sw, x1 + sw, yT, yT + sw * (p.lintel ?? 1), z, sc);
  }
  if (p.shutters) {
    const sc = p.shutters, sw = w / 2 - 0.03, z = 0.04;
    for (const sg of [-1, 1]) {
      const xa = sg < 0 ? x0 - sw - 0.04 : x1 + 0.04;
      R(xa, xa + sw, y, yT, z, sc);
      R(xa + 0.06, xa + sw - 0.06, y + 0.08, y + h * 0.48, z + 0.01, mul(sc, 0.72));
      R(xa + 0.06, xa + sw - 0.06, y + h * 0.54, yT - 0.08, z + 0.01, mul(sc, 0.72));
    }
  }
}
function inset(a, cx, cy, d) {
  const dx = cx - a[0], dy = cy - a[1], l = Math.hypot(dx, dy) || 1;
  return [a[0] + (dx / l) * d, a[1] + (dy / l) * d];
}

/**
 * Wall in the canonical frame (along +X from 0 to len, z = 0, facing +Z), from y0 to y1, with openings cut out.
 * o: { key, col, bands: [[yTop, key, col], ...] (ascending, below the main material), open: [...], gy (ground line for AO),
 *      ao, aoTop, ivy: { rng, cover, hmax } }
 */
export function wall(V, len, y0, y1, o) {
  const S = V.S, open = o.open || [], key = o.key || 'stucco', col = o.col, bands = o.bands;
  const gy = o.gy ?? y0, ao = o.ao !== false;
  let us = [0, len], ys = [y0, y1];
  for (const p of open) { if (p.overlay) continue; us.push(p.u - p.w / 2, p.u + p.w / 2); ys.push(p.y, p.y + p.h); }
  if (bands) for (const b of bands) ys.push(b[0]);
  if (ao) ys.push(gy, gy + 1.0, y1 - 0.6);
  us = uniq(us, 0, len); ys = uniq(ys, y0, y1);
  const bandAt = (y) => { if (bands) for (const b of bands) if (y < b[0]) return { key: b[1], col: b[2] }; return { key, col }; };
  const topK = o.aoTop ?? 0.7;
  const aoK = (y) => {
    if (!ao) return 1;
    let k = 1;
    if (y <= gy + 0.01) k = 0.58; else if (y < gy + 1.0) k = 0.58 + 0.42 * (y - gy);
    if (y >= y1 - 0.01) k *= topK;
    return k;
  };
  for (let j = 0; j < ys.length - 1; j++) {
    const ya = ys[j], yb = ys[j + 1], yc = (ya + yb) / 2, bd = bandAt(yc);
    const ca = mul(bd.col, aoK(ya)), cb = mul(bd.col, aoK(yb));
    let run = -1;
    const flush = (i) => { if (run >= 0) { S.quad(bd.key, [us[run], ya, 0], [us[i], ya, 0], [us[i], yb, 0], [us[run], yb, 0], [ca, ca, cb, cb]); run = -1; } };
    for (let i = 0; i < us.length - 1; i++) {
      const uc = (us[i] + us[i + 1]) / 2;
      let hole = false;
      for (const p of open) if (!p.overlay && Math.abs(uc - p.u) < p.w / 2 && yc > p.y && yc < p.y + p.h) { hole = true; break; }
      if (hole) flush(i); else if (run < 0) run = i;
    }
    flush(us.length - 1);
  }
  for (const p of open) opening(V, p, bandAt(p.y + p.h / 2));
  if (o.ivy) ivy(V, len, Math.max(y0, gy - 0.1), y1, open, o.ivy);
}

/**
 * Ivy (爬山虎): one leaf sheet hugging the wall on a 0.4 m grid that also carries the opening edges, so the creeper runs
 * right up to the window frames. The outline comes from a smooth height profile; the edge is dissolved leaf by leaf
 * through VERTEX ALPHA against the per-leaf alpha thresholds of the leaf texture (see makeIvyTexture in villas.js).
 */
function ivy(V, len, y0, y1, open, iv) {
  const S = V.S, r = iv.rng, cw = 0.4, z = 0.105, T = 1.6;
  const top = Math.min(iv.hmax ?? 6, y1 - y0 - 0.2);
  if (len < 1.6 || top < 1.2) return;
  const holes = [];
  for (const p of open) {
    if (p.overlay) continue;
    const mx = 0.04 + (p.shutters ? p.w / 2 + 0.02 : 0);
    holes.push([p.u - p.w / 2 - mx, p.u + p.w / 2 + mx, p.y - (p.kind && p.kind !== 'win' ? 0.5 : 0.12), p.y + p.h + 0.04]);
  }
  let us = [], ys = [];
  for (let u = 0; u < len - 0.1; u += cw) us.push(u);
  us.push(len);
  for (let y = y0; y < y0 + top + cw; y += cw) ys.push(y);
  const yMax = ys[ys.length - 1];
  for (const h of holes) { us.push(h[0], h[1]); ys.push(h[2], h[3]); }
  us = uniq(us, 0, len); ys = uniq(ys, y0, yMax);
  // smooth 1D profile: a mound around c, modulated by cosine-interpolated knots (a few of them shoot up as tendrils)
  const c = r.range(0.12, 0.88) * len, half = Math.max(2.2, (iv.cover ?? 0.6) * len * 0.75), ks = 1.3;
  const kn = Array.from({ length: Math.ceil(len / ks) + 2 }, () => (r.chance(0.2) ? r.range(0.95, 1.15) : r.range(0.4, 0.9)));
  const sm = (t) => t * t * (3 - 2 * t);
  const prof = (u) => {
    const d = Math.abs(u - c) / half; if (d >= 1) return 0;
    const q = u / ks, i = Math.floor(q), f = sm(q - i);
    return Math.min(top, top * Math.pow(1 - d * d, 1.6) * (kn[i] + (kn[i + 1] - kn[i]) * f));
  };
  // patch-scale colour lattice
  const lw = Math.ceil(len / 1.5) + 2, lh = Math.ceil((yMax - y0) / 1.5) + 2;
  const lat = Array.from({ length: lw * lh }, () => r());
  const hue = (u, y) => {
    const a = u / 1.5, b = (y - y0) / 1.5, i = Math.floor(a), j = Math.floor(b), fa = sm(a - i), fb = sm(b - j);
    const g = (ii, jj) => lat[Math.min(lh - 1, jj) * lw + Math.min(lw - 1, ii)];
    return (g(i, j) * (1 - fa) + g(i + 1, j) * fa) * (1 - fb) + (g(i, j + 1) * (1 - fa) + g(i + 1, j + 1) * fa) * fb;
  };
  const tone = r.range(0.92, 1.2), nu = us.length, nv = ys.length;
  const inHole = (u, y, e) => { for (const h of holes) if (u > h[0] - e && u < h[1] + e && y > h[2] - e && y < h[3] + e) return true; return false; };
  const vert = new Array(nu * nv);
  for (let i = 0; i < nu; i++) {
    const u = us[i], pt = prof(u);
    for (let j = 0; j < nv; j++) {
      const y = ys[j], s = (pt - (y - y0)) / 0.75;
      let al = s <= 0 ? 0 : Math.min(1, 0.26 + 0.74 * s + r.range(-0.1, 0.12));
      if (al > 0.6 && r.chance(0.07)) al *= 0.6;                       // small gaps showing the wall
      if (al > 0 && inHole(u, y, 0.01)) al = Math.min(al, r.range(0.5, 1));
      const hv = Math.min(1, Math.max(0, hue(u, y) * 1.5 - 0.25 + r.range(-0.12, 0.12)));
      const k = tone * (0.5 + 0.5 * Math.min(1, (y - y0) / 1.8)) * r.range(0.82, 1.12);
      // wine -> scarlet -> orange (in the green seasons the same tints read as dark blue-green -> fresh green)
      const cr = hv < 0.5 ? 0.72 + 0.56 * hv : 1.0 + 0.3 * (hv - 0.5), cg = hv < 0.5 ? 0.55 + 0.9 * hv : 1.0 + 2.2 * (hv - 0.5), cb = 1.2 - 0.5 * hv;
      vert[i * nv + j] = [k * cr, k * cg, k * cb, al];
    }
  }
  const uo = r.range(0, T), vo = r.range(0, T);
  for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
    const ua = us[i], ub = us[i + 1], ya = ys[j], yb = ys[j + 1];
    const c00 = vert[i * nv + j], c10 = vert[(i + 1) * nv + j], c11 = vert[(i + 1) * nv + j + 1], c01 = vert[i * nv + j + 1];
    if (Math.max(c00[3], c10[3], c11[3], c01[3]) < 0.3) continue;
    if (inHole((ua + ub) / 2, (ya + yb) / 2, 0)) continue;
    S.quad('ivy', [ua, ya, z], [ub, ya, z], [ub, yb, z], [ua, yb, z], [c00, c10, c11, c01],
      [[(ua + uo) / T, (ya - y0 + vo) / T], [(ub + uo) / T, (ya - y0 + vo) / T], [(ub + uo) / T, (yb - y0 + vo) / T], [(ua + uo) / T, (yb - y0 + vo) / T]]);
  }
}

/** Wall between plan points a -> b ([x, z]); the outward normal is (-dz, dx): walk the outline with the house on your left... */
export function wallAB(V, a, b, y0, y1, o) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const nx = -dz / len, nz = dx / len;
  const gy = o.gy ?? Math.max(y0, Math.min(0, V.gy((a[0] + b[0]) / 2 + nx * 0.4, (a[1] + b[1]) / 2 + nz * 0.4)));
  V.S.frame(a[0], 0, a[1], Math.atan2(-dz, dx), () => wall(V, len, y0, y1, { ...o, gy }));
}

export const rectOutline = (x0, x1, z0, z1) => [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]; // faces: 0 front, 1 right, 2 back, 3 left

/** evenly spaced bay centres along a wall of length len */
export const bays = (len, n, margin = 0.6) => Array.from({ length: n }, (_, k) => margin + ((len - 2 * margin) * (k + 0.5)) / n);

/** window row helper: us -> openings */
export function winRow(V, us, y, w, h, extra = {}) {
  return us.map((u) => ({ u, y, w, h, lit: V.rng.chance(0.35), ...extra }));
}

/**
 * All walls of a plan outline from the plinth bottom (V.yb) to yTop.
 * spec(i, len) -> { open, ivy, key, col ... } per edge (or null to skip the edge).
 * base: { top (granite band top, >= 0), col } ; a stone ledge is run along the band top.
 */
export function shell(V, outline, yTop, base, def, spec) {
  const S = V.S, n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i], b = outline[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const sp = spec ? spec(i, len) : {};
    if (sp === null) continue;
    const dx = (b[0] - a[0]) / (len || 1), dz = (b[1] - a[1]) / (len || 1), nx = -dz, nz = dx;
    const open = sp.open ? sp.open.slice() : [];
    // tall podium on the downhill side: basement lights under the ground-floor windows + a projecting base course
    const gAt = (u) => V.gy(a[0] + dx * u + nx * 0.4, a[1] + dz * u + nz * 0.4);
    const gm = len > 0.3 ? gAt(len / 2) : 0;
    if (base && base.podium !== false && len > 2.4 && gm < -1.15) {
      const blocked = open.filter((p) => !p.overlay && p.y < 0.3 && p.kind && p.kind !== 'win');
      const seen = [];
      for (const p of open.slice()) {
        if (p.overlay || p.y > 2 || p.y < 0.3 || (p.kind && p.kind !== 'win')) continue;
        if (p.u < 0.8 || p.u > len - 0.8 || seen.some((u) => Math.abs(u - p.u) < 1.4) || blocked.some((q) => Math.abs(q.u - p.u) < q.w / 2 + 1.6)) continue;
        const g = gAt(p.u); if (g > -1.05) continue;
        seen.push(p.u);
        open.push({ u: p.u, y: g * 0.5 - 0.2, w: 0.72, h: 0.4, lit: false, curtain: false, sill: false, rev: 0.13, frame: IRON, bars: [3, 0], fw: 0.035,
          surround: mul(STONE, 0.92), sw: 0.09, podium: true });
      }
      const yt = Math.min(-0.5, gm + 0.42), h = yt - V.yb, o = 0.07, e = 0.08;
      if (h > 0.2) {
        S.beam('granite', [a[0] - dx * e, V.yb + h / 2, a[1] - dz * e], [b[0] + dx * e, V.yb + h / 2, b[1] + dz * e], o * 2, h, mul(base.col, 0.86), true);
        S.beam('paint', [a[0] - dx * e, yt + 0.03, a[1] - dz * e], [b[0] + dx * e, yt + 0.03, b[1] + dz * e], o * 2 + 0.05, 0.06, mul(STONE, 0.9), true);
      }
    }
    wallAB(V, a, b, V.yb, sp.yTop ?? yTop, { ...def, bands: base ? [[base.top, 'granite', base.col]] : null, ...sp, open });
    if (base && base.ledge !== false && len > 0.3) {
      // the ledge stops at every opening that crosses the band top (doors, French windows, arcades)
      const o = 0.03, cuts = [];
      for (const p of open) {
        if (p.overlay || !(p.y < base.top - 0.01 && p.y + p.h > base.top + 0.01)) continue;
        const m = p.surround ? (p.sw ?? 0.15) : 0;
        cuts.push([p.u - p.w / 2 - m, p.u + p.w / 2 + m]);
      }
      cuts.sort((p, q) => p[0] - q[0]);
      let u0 = 0;
      const seg = (ua, ub) => {
        if (ub - ua < 0.06) return;
        S.beam('paint', [a[0] + dx * ua + nx * o, base.top, a[1] + dz * ua + nz * o], [a[0] + dx * ub + nx * o, base.top, a[1] + dz * ub + nz * o],
          0.12, 0.1, base.ledgeCol || STONE, cuts.length > 0);
      };
      for (const cu of cuts) { seg(u0, Math.min(len, cu[0])); u0 = Math.max(u0, cu[1]); }
      seg(u0, len);
    }
  }
}

/** horizontal moulding (cornice / string course) around an outline */
export function band(V, outline, y, w, h, col, closed = true, key = 'paint') {
  const n = outline.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = outline[i], b = outline[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, e = w / 2;
    V.S.beam(key, [a[0] - dx * e, y, a[1] - dz * e], [b[0] + dx * e, y, b[1] + dz * e], w, h, col, true);
  }
}

/** alternating corner stones on the two faces meeting at a convex right-angle corner; dA, dB: unit [x,z] along each wall away from the corner */
export function quoins(V, c, dA, dB, y0, y1, col) {
  const S = V.S, o = 0.03;
  let k = 0;
  for (let y = y0; y < y1 - 0.2; y += 0.42, k++) {
    const la = k % 2 ? 0.62 : 0.36, lb = k % 2 ? 0.36 : 0.62, yt = Math.min(y1, y + 0.36);
    const A0 = [c[0] - dB[0] * o, c[1] - dB[1] * o], B0 = [c[0] - dA[0] * o, c[1] - dA[1] * o];
    S.quadO('granite', [A0[0], y, A0[1]], [A0[0] + dA[0] * la, y, A0[1] + dA[1] * la], [A0[0] + dA[0] * la, yt, A0[1] + dA[1] * la], [A0[0], yt, A0[1]], [-dB[0], 0, -dB[1]], col);
    S.quadO('granite', [B0[0], y, B0[1]], [B0[0] + dB[0] * lb, y, B0[1] + dB[1] * lb], [B0[0] + dB[0] * lb, yt, B0[1] + dB[1] * lb], [B0[0], yt, B0[1]], [-dA[0], 0, -dA[1]], col);
  }
}

// ----------------------------------------------------------------------------------------------------------------------
// roofs (canonical frames, centred on the origin)
// ----------------------------------------------------------------------------------------------------------------------

/** gable end wall in a frame where the wall is at z = 0 facing +Z, x in [-hs, hs] */
function gableWall(V, hs, y, rise, clip, tp, g) {
  const S = V.S, top = mul(g.col, 0.74);
  const pts = [[-hs, y, 0], [hs, y, 0]], cols = [g.col, g.col];
  if (clip < rise - 1e-3) { const xx = hs - clip / tp; pts.push([xx, y + clip, 0], [-xx, y + clip, 0]); cols.push(top, top); }
  else { pts.push([0, y + rise, 0]); cols.push(top); }
  S.fan(g.key || 'stucco', pts, [0, 0, 1], cols);
  const lineY = (x) => y + Math.min(clip, (hs - Math.abs(x)) * tp);
  if (g.timber) {
    const tc = g.timber, z = 0.03, sp = g.sp || 0.95, w = 0.17;
    strip(S, 'fine', -hs, y + 0.1, hs, y + 0.1, 0.22, z, tc);
    const yc = y + Math.min(clip, rise) * 0.52, xc = hs - (yc - y) / tp;
    strip(S, 'fine', -xc, yc, xc, yc, w, z, tc);
    for (let x = 0; x < hs - 0.25; x += sp) for (const sg of x === 0 ? [1] : [-1, 1]) strip(S, 'fine', sg * x, y + 0.1, sg * x, lineY(x) - 0.04, w, z, tc);
    for (const sg of [-1, 1]) {
      strip(S, 'fine', sg * 0.08, y + 0.2, sg * (sp - 0.08), yc - 0.05, w * 0.85, z, tc);
      if (xc > sp * 1.5) strip(S, 'fine', sg * (sp * 2 - 0.08), y + 0.2, sg * (sp + 0.08), yc - 0.05, w * 0.85, z, tc);
      if (clip < rise - 1e-3) strip(S, 'fine', sg * (hs - 0.1), y + 0.05, sg * (hs - clip / tp - 0.1), y + clip, w, z, tc);
      else strip(S, 'fine', sg * (hs - 0.1), y + 0.05, 0, y + rise - 0.12, w, z, tc);
    }
  }
  if (g.win) opening(V, { overlay: true, lit: V.rng.chance(0.3), ...g.win, y: y + (g.win.y ?? 0.6) }, { key: g.key || 'stucco', col: g.col });
  if (g.vent) { const r = 0.34, yy = y + rise * (g.ventY ?? 0.5); disc(S, 0, yy, 0.03, r, g.ventCol || TRIM.white, 'fine'); disc(S, 0, yy, 0.045, r - 0.08, [1, 1, 1], 'glass'); }
}

/** flat disc in the plane z facing +Z */
export function disc(S, x, y, z, r, col, key = 'paint', seg = 12) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * PI * 2, a1 = ((i + 1) / seg) * PI * 2;
    S.tri(key, [x, y, z], [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], col);
  }
}

/**
 * Gable roof, ridge along X. o: { len, span, y (wall-plate height), pitch (rad), over, rake | rakeL / rakeR,
 *   jerkin: [fracL, fracR], gable: [specL, specR] ({ key, col, timber, win }), roof (override of V.roof) }
 */
export function gableRoof(V, o) {
  const S = V.S, R = o.roof || V.roof, { len, span, y } = o, tp = Math.tan(o.pitch);
  const over = o.over ?? 0.5, hs = span / 2, rise = hs * tp, yR = y + rise, zf = hs + over, yE = y - over * tp;
  const rakeL = o.rakeL ?? o.rake ?? 0.4, rakeR = o.rakeR ?? o.rake ?? 0.4;
  const xl = -len / 2 - rakeL, xr = len / 2 + rakeR;
  const jL = (o.jerkin?.[0] || 0) * rise, jR = (o.jerkin?.[1] || 0) * rise, jlR = jR / tp;
  // cutL = [xEave, xRidge]: the left end dies into another roof along a valley
  const xle = o.cutL ? o.cutL[0] : xl, jlL = o.cutL ? o.cutL[1] - xl : jL / tp;
  for (const sg of [1, -1]) {
    const pts = [[xle, yE, sg * zf], [xr, yE, sg * zf]], edges = [0, 1];
    if (jR > 0) { pts.push([xr, yR - jR, (sg * jR) / tp]); edges.push(2); }
    pts.push([xr - jlR, yR, 0]);
    pts.push([xl + jlL, yR, 0]); edges.push(pts.length - 1);
    if (jL > 0) { pts.push([xl, yR - jL, (sg * jL) / tp]); edges.push(pts.length - 1); }
    S.slab(R.key, pts, R.t, R.col, 'paint', R.soff, R.fascia, edges);
  }
  if (jR > 0) {
    S.slab(R.key, [[xr, yR - jR, jR / tp], [xr, yR - jR, -jR / tp], [xr - jlR, yR, 0]], R.t, R.col, 'paint', R.soff, R.fascia, [0]);
    for (const sg of [-1, 1]) S.beam(R.key, [xr - jlR, yR + 0.03, 0], [xr, yR - jR + 0.03, (sg * jR) / tp], 0.24, 0.14, R.ridge, false);
  }
  if (jL > 0) {
    S.slab(R.key, [[xl, yR - jL, -jL / tp], [xl, yR - jL, jL / tp], [xl + jlL, yR, 0]], R.t, R.col, 'paint', R.soff, R.fascia, [0]);
    for (const sg of [-1, 1]) S.beam(R.key, [xl + jlL, yR + 0.03, 0], [xl, yR - jL + 0.03, (sg * jL) / tp], 0.24, 0.14, R.ridge, false);
  }
  S.beam(R.key, [xl + jlL, yR + 0.04, 0], [xr - jlR, yR + 0.04, 0], 0.3, 0.18, R.ridge, true);
  const g = o.gable || [];
  if (g[0]) S.frame(-len / 2, 0, 0, -PI / 2, () => gableWall(V, hs, y, rise, jL > 0 ? Math.min(rise, rise - jL + rakeL * tp) : rise, tp, g[0]));
  if (g[1]) S.frame(len / 2, 0, 0, PI / 2, () => gableWall(V, hs, y, rise, jR > 0 ? Math.min(rise, rise - jR + rakeR * tp) : rise, tp, g[1]));
  return { yR, rise, tp };
}

/**
 * Hip roof (or a truncated hip = mansard stage) over a lx x lz rectangle centred on the origin.
 * o: { lx, lz, y, pitch, over, maxRise, roof, ridge: true }. Returns { yT, tx, tz } (top rectangle half sizes).
 */
export function hipRoof(V, o) {
  const S = V.S, R = o.roof || V.roof, tp = Math.tan(o.pitch), over = o.over ?? 0.5;
  const ox = o.lx / 2 + over, oz = o.lz / 2 + over, yE = o.y - over * tp;
  const full = Math.min(ox, oz) * tp, r = Math.min(full, o.maxRise ?? 1e9), ins = r / tp;
  const tx = Math.max(0, ox - ins), tz = Math.max(0, oz - ins), yT = yE + r;
  S.slab(R.key, [[-ox, yE, oz], [ox, yE, oz], [tx, yT, tz], [-tx, yT, tz]], R.t, R.col, 'paint', R.soff, R.fascia, [0]);
  S.slab(R.key, [[ox, yE, -oz], [-ox, yE, -oz], [-tx, yT, -tz], [tx, yT, -tz]], R.t, R.col, 'paint', R.soff, R.fascia, [0]);
  S.slab(R.key, [[ox, yE, oz], [ox, yE, -oz], [tx, yT, -tz], [tx, yT, tz]], R.t, R.col, 'paint', R.soff, R.fascia, [0]);
  S.slab(R.key, [[-ox, yE, -oz], [-ox, yE, oz], [-tx, yT, tz], [-tx, yT, -tz]], R.t, R.col, 'paint', R.soff, R.fascia, [0]);
  if (o.ridge !== false) {
    const w = o.hipW ?? 0.22;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.beam(R.key, [sx * ox, yE + 0.03, sz * oz], [sx * tx, yT + 0.03, sz * tz], w, 0.13, R.ridge, false);
    if (r >= full - 1e-6) {
      if (tx > 0.05) S.beam(R.key, [-tx, yT + 0.04, 0], [tx, yT + 0.04, 0], 0.3, 0.18, R.ridge, true);
      else if (tz > 0.05) S.beam(R.key, [0, yT + 0.04, -tz], [0, yT + 0.04, tz], 0.3, 0.18, R.ridge, true);
    }
  }
  return { yT, tx, tz, yE };
}

/**
 * Dormer. Frame: origin at the foot of the dormer face ON the roof surface, face towards +Z, main roof rising behind
 * with slope tan `tp`. o: { w, h, tp, pitch, key, col, win, style: 'gable' | 'shed' }
 */
export function dormer(V, o) {
  const S = V.S, R = o.roof || V.roof, { w, h } = o, hw = w / 2, tpm = o.tp, D = h / tpm;
  const col = o.col, sh = mul(col, 0.8);
  S.quad(o.key, [-hw, 0, 0], [hw, 0, 0], [hw, h, 0], [-hw, h, 0], [col, col, sh, sh]);
  S.fan(o.key, [[hw, 0, 0], [hw, h, -D], [hw, h, 0]], [1, 0, 0], sh);
  S.fan(o.key, [[-hw, 0, 0], [-hw, h, -D], [-hw, h, 0]], [-1, 0, 0], sh);
  const ov = 0.16, fr = 0.22, t = 0.1;
  if (o.style === 'seg') {
    // segmental (curved-head) dormer: a barrel strip running back into the roof, with a curved head moulding
    const wo = w + 2 * ov, yC = h + 0.17 * wo, arc = archPts(0, yC, wo, 'seg', 6), fa = archPts(0, h + 0.17 * w + 0.03, w, 'seg', 6);
    S.fan(o.key, [...fa.map((q) => [q[0], q[1], 0])], [0, 0, 1], sh);
    const mc = o.head || TRIM.white;
    for (let i = 0; i < arc.length - 1; i++) {
      const a = arc[i], b = arc[i + 1], ya = a[1] + 0.05, yb2 = b[1] + 0.05;
      S.quadO(R.key, [a[0], ya, fr], [b[0], yb2, fr], [b[0], yb2, -yb2 / tpm], [a[0], ya, -ya / tpm], [(a[0] + b[0]) * 0.4, 1, 0.1], R.col);
      S.quadO('paint', [a[0], ya, fr], [b[0], yb2, fr], [b[0], yb2, 0], [a[0], ya, 0], [0, -1, 0], R.soff);
      S.quadO('paint', [a[0], ya, fr], [b[0], yb2, fr], [b[0] * 0.9, yb2 - 0.17, fr], [a[0] * 0.9, ya - 0.17, fr], [0, 0, 1], mc);
    }
    for (const sg of [-1, 1]) S.quadO('paint', [sg * (hw + ov), h + 0.05, fr], [sg * (hw + ov), h + 0.05, -h / tpm], [sg * (hw + ov), h - 0.08, -h / tpm], [sg * (hw + ov), h - 0.08, fr], [sg, 0, 0], mc);
    for (const sg of [-1, 1]) S.quadO('paint', [sg * hw, 0, 0.02], [sg * (hw - 0.13), 0, 0.02], [sg * (hw - 0.13), h, 0.02], [sg * hw, h, 0.02], [0, 0, 1], mc);
  } else if (o.style === 'shed') {
    const tq = Math.tan(o.pitch ?? 0.2), yF = h - fr * tq + 0.02, back = (h + 0.02) / (tpm - tq);
    S.slab(R.key, [[-hw - ov, yF, fr], [hw + ov, yF, fr], [hw + ov, h + 0.02 + back * tq, -back], [-hw - ov, h + 0.02 + back * tq, -back]], t, R.col, 'paint', R.soff, R.fascia, [0, 1, 3]);
  } else {
    const tq = Math.tan(o.pitch ?? 0.75), yE = h - ov * tq, yR = h + hw * tq;
    S.fan(o.key, [[-hw, h, 0], [hw, h, 0], [0, yR, 0]], [0, 0, 1], sh);
    for (const sg of [-1, 1]) {
      S.slab(R.key, [[sg * (hw + ov), yE, fr], [sg * (hw + ov), yE, -yE / tpm], [0, yR, -yR / tpm], [0, yR, fr]], t, R.col, 'paint', R.soff, R.fascia, [0, 3]);
    }
    S.beam(R.key, [0, yR + 0.03, fr], [0, yR + 0.03, -yR / tpm], 0.2, 0.12, R.ridge, true);
  }
  if (o.win !== false) {
    opening(V, { overlay: true, u: 0, y: 0.22, w: w - 0.5, h: h - 0.36, lit: V.rng.chance(0.35), sill: false, bars: [1, 1], ...(o.win || {}) }, { key: o.key, col });
  }
}

/** chimney stack with a corbelled cap and clay pots */
export function chimney(V, x, z, yb, yt, w, d, key, col, capCol) {
  const S = V.S, hw = w / 2, hd = d / 2, cc = capCol || mul(col, 0.9);
  S.box(key, x - hw, x + hw, yb, yt - 0.3, z - hd, z + hd, col, 'dt');
  S.box(key, x - hw - 0.07, x + hw + 0.07, yt - 0.3, yt - 0.15, z - hd - 0.07, z + hd + 0.07, cc, '');
  S.box(key, x - hw - 0.14, x + hw + 0.14, yt - 0.15, yt, z - hd - 0.14, z + hd + 0.14, cc, '');
  const n = Math.max(1, Math.round(Math.max(w, d) / 0.45)), alongX = w >= d;
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n - 0.5) * (Math.max(w, d) - 0.1);
    S.cyl('paint', x + (alongX ? t : 0), z + (alongX ? 0 : t), yt, yt + 0.42, 0.13, 0.1, POT, { seg: 6, top: true, col1: mul(POT, 0.8) });
  }
}

/** entrance steps going down towards +Z from (x, z) at floor level; g = ground height (local, negative) at the foot */
export function steps(V, x, z, w, o = {}) {
  const S = V.S, land = o.landing ?? 1.0;
  const g = Math.min(-0.3, V.gy(x, z + land + 1.2));
  const n = Math.max(3, Math.min(11, Math.ceil(-g / 0.17))), rise = -g / n, tread = Math.min(0.32, 2.3 / n);
  const yb = g - 0.5, hw = w / 2, col = o.col || STONE;
  S.box('paint', x - hw, x + hw, yb, 0, z, z + land, col, 'bd');
  for (let i = 1; i < n; i++) {
    const za = z + land + (i - 1) * tread, k = 1 - (i % 2) * 0.06;
    S.box('paint', x - hw, x + hw, yb, -i * rise, za, za + tread, mul(col, k), 'bd');
  }
  const zEnd = z + land + (n - 1) * tread;
  if (o.cheeks !== false) {
    const gc = o.cheekCol || [1, 1, 1];
    for (const sg of [-1, 1]) {
      const xa = x + sg * (hw + 0.19);
      S.box('granite', xa - 0.19, xa + 0.19, yb, 0.4, z, z + land, gc, 'bd');
      S.box('granite', xa - 0.19, xa + 0.19, yb, g * 0.5 + 0.4, z + land, zEnd + 0.1, gc, 'bd');
      S.box('paint', xa - 0.24, xa + 0.24, 0.4, 0.5, z - 0.02, z + land + 0.05, col, 'd');
      S.box('paint', xa - 0.24, xa + 0.24, g * 0.5 + 0.4, g * 0.5 + 0.5, z + land + 0.05, zEnd + 0.15, col, 'd');
    }
  }
  return { zEnd, g };
}

/** railing / balustrade from plan point a to b at height y. o: { h, col, sp, rw, bw, posts } */
export function railing(V, a, b, y, o = {}) {
  const S = V.S, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const h = o.h ?? 0.95, col = o.col || IRON, rw = o.rw ?? 0.05, bw = o.bw ?? 0.028, sp = o.sp ?? 0.16;
  S.frame(a[0], y, a[1], Math.atan2(-dz, dx), () => {
    S.beam('fine', [0, h, 0], [len, h, 0], rw, rw, col, true);
    const low = o.low ?? 0.1;
    S.beam('fine', [0, low, 0], [len, low, 0], rw * 0.8, rw * 0.8, col, false);
    const n = Math.max(1, Math.round(len / sp));
    for (let i = 1; i < n; i++) { const x = (len * i) / n; S.quad2('fine', [x - bw / 2, low, 0], [x + bw / 2, low, 0], [x + bw / 2, h, 0], [x - bw / 2, h, 0], col); }
    if (o.posts) for (const x of [0, len]) S.beam('fine', [x, 0, 0], [x, h + 0.08, 0], o.posts, o.posts, col, true);
  });
}

/** flat roof deck + parapet (inner faces, coping) on a CONVEX outline; optional crenellations */
export function parapet(V, outline, yDeck, yTop, thick, key, col, o = {}) {
  const S = V.S, n = outline.length, inner = [];
  for (let i = 0; i < n; i++) {
    const p = outline[(i + n - 1) % n], c = outline[i], q = outline[(i + 1) % n];
    const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1, l2 = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1;
    const n1 = [-(c[1] - p[1]) / l1, (c[0] - p[0]) / l1], n2 = [-(q[1] - c[1]) / l2, (q[0] - c[0]) / l2];
    const k = thick / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    inner.push([c[0] - (n1[0] + n2[0]) * k, c[1] - (n1[1] + n2[1]) * k]);
  }
  S.fan('paint', inner.map((p) => [p[0], yDeck, p[1]]), [0, 1, 0], o.deckCol || lin('#77736c'));
  const cop = o.copCol || STONE, sh = mul(col, 0.7);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = outline[i], b = outline[j], ia = inner[i], ib = inner[j];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.02) continue;
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    S.quadO(key, [ia[0], yDeck, ia[1]], [ib[0], yDeck, ib[1]], [ib[0], yTop, ib[1]], [ia[0], yTop, ia[1]], [-nx, 0, -nz], [sh, sh, col, col]);
    S.quadO(o.copKey || 'paint', [a[0], yTop, a[1]], [b[0], yTop, b[1]], [ib[0], yTop, ib[1]], [ia[0], yTop, ia[1]], [0, 1, 0], o.copKey ? col : cop);
    if (o.crenel && len > 0.8) {
      const m = Math.max(1, Math.round(len / 1.5)), mw = (len / m) * 0.5, mh = o.crenel;
      S.frame(a[0], yTop, a[1], Math.atan2(-(b[1] - a[1]), b[0] - a[0]), () => {
        for (let q = 0; q < m; q++) { const u = (len * (q + 0.5)) / m; S.box(key, u - mw / 2, u + mw / 2, 0, mh, -thick, 0, col, 'd'); }
      });
    }
  }
}

/** simple round or square column */
export function column(V, x, z, y0, y1, r, col, round = true) {
  const S = V.S;
  if (round) {
    S.cyl('paint', x, z, y0 + 0.14, y1 - 0.14, r, r * 0.86, col, { seg: 8 });
    S.box('paint', x - r * 1.25, x + r * 1.25, y0, y0 + 0.14, z - r * 1.25, z + r * 1.25, col, 'd');
    S.box('paint', x - r * 1.2, x + r * 1.2, y1 - 0.14, y1, z - r * 1.2, z + r * 1.2, col, 't');
  } else S.box('paint', x - r, x + r, y0, y1, z - r, z + r, col, 'dt');
}

/** continuous corner boards / pilaster strips on both faces of a convex right-angle corner */
export function cornerBoards(V, c, dA, dB, y0, y1, w, col) {
  const S = V.S, o = 0.035;
  const A0 = [c[0] - dB[0] * o, c[1] - dB[1] * o], B0 = [c[0] - dA[0] * o, c[1] - dA[1] * o];
  S.quadO('fine', [A0[0], y0, A0[1]], [A0[0] + dA[0] * w, y0, A0[1] + dA[1] * w], [A0[0] + dA[0] * w, y1, A0[1] + dA[1] * w], [A0[0], y1, A0[1]], [-dB[0], 0, -dB[1]], col);
  S.quadO('fine', [B0[0], y0, B0[1]], [B0[0] + dB[0] * w, y0, B0[1] + dB[1] * w], [B0[0] + dB[0] * w, y1, B0[1] + dB[1] * w], [B0[0], y1, B0[1]], [-dA[0], 0, -dA[1]], col);
}

/** where a wing roof (wall plate yW, slope tW, half span hs, eave overhang ov) meets a main roof plane (plate yM at its wall face, slope tM):
 *  distances BEHIND the main wall face of the valley at the wing's eave and at its ridge */
export function valley(yW, tW, hs, ov, yM, tM, mainOver = 0.5) {
  return [Math.max(-mainOver, (yW - ov * tW - yM) / tM), (yW + hs * tW - yM) / tM];
}

/** exposed rafter tails under the eaves of a hip roof (same frame / parameters as hipRoof) */
export function rafterTails(V, o, col, sp = 0.85) {
  const S = V.S, tp = Math.tan(o.pitch), over = o.over ?? 0.5, t = (o.roof || V.roof).t;
  const hx = o.lx / 2, hz = o.lz / 2, d = 0.13 * tp;
  const y0 = o.y - t - 0.07, y1 = o.y - over * tp - t - 0.07 + d;
  for (const sg of [-1, 1]) {
    const nx = Math.max(2, Math.round(o.lx / sp)), nz = Math.max(2, Math.round(o.lz / sp));
    for (let i = 0; i <= nx; i++) { const x = -hx + (o.lx * i) / nx; S.beam('fine', [x, y0, sg * (hz - 0.02)], [x, y1, sg * (hz + over - 0.13)], 0.09, 0.13, col, false); }
    for (let i = 0; i <= nz; i++) { const z = -hz + (o.lz * i) / nz; S.beam('fine', [sg * (hx - 0.02), y0, z], [sg * (hx + over - 0.13), y1, z], 0.09, 0.13, col, false); }
  }
}
