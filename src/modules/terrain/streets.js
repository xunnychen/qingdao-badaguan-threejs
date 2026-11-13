// Streets: asphalt ribbons with a crown, granite kerbs (dropped at gates, cut cleanly at junction mouths), slab
// sidewalks with driveway aprons and tree pits, and the paved footpaths. Everything samples world.heightAt.
//
// Junctions: carriageways simply overlap (the asphalt uses world-space UVs so the overlap is seamless); each street
// gets a small height "layer" different from every street it meets, so overlapping surfaces never z-fight. Kerbs and
// sidewalks are clipped where they would run into another street's carriageway, with the cut found per edge so the
// clip follows the other road's edge even at oblique junctions. Where a kerb of one street meets a kerb of another the
// corner is rounded: both kerbs stop a tangent length short and an arc of kerb, a fan of paving behind it and a fan of
// asphalt in front of it fill the corner (acute corners get a smaller radius, which blunts the tip).
// Streets that run off the map (no junction at the end) dive under the ground over their last 26 m.
import { Buf, V, UP, makeSampler, streetTools } from './util.js';

const KERB_W = 0.15, ROAD_Y = 0.03, CROWN = 0.02, KERB_TOP = 0.16, WALK_Y = 0.14, LAYER = 0.012;

function finish(pts) {
  const cum = new Float64Array(pts.length);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (i) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    minX = Math.min(minX, pts[i][0]); maxX = Math.max(maxX, pts[i][0]); minZ = Math.min(minZ, pts[i][1]); maxZ = Math.max(maxZ, pts[i][1]);
  }
  return { pts, cum, len: cum[pts.length - 1], bbox: { minX, maxX, minZ, maxZ } };
}

/** Paved footpaths (slab ribbons): MAP.paths of kind 'paving' + a 3 m path from every landmark gate to its front door. */
export function pavedLines(ctx) {
  const { map: MAP, world } = ctx, out = [];
  // A path is authored from street control point to promenade centre line: keep only the stretch that lies off the
  // promenade strip and behind the street's sidewalk (it tucks 0.3 m under the back of the paving, which is higher),
  // with the cut interpolated so the slab ends square on the edge instead of at the nearest 1.5 m sample.
  const free = (x, z) => {
    if (world.backDist(x, z) <= 2.35) return false;
    for (const st of MAP.streets) { const r = st.wallOff - 0.52; if (world.distToLine(st, x, z, r + 1).d < r) return false; }
    return true;
  };
  const cut = (a, b) => { // a is free, b is not: last free point on a -> b
    let lo = 0, hi = 1;
    for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (free(a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m)) lo = m; else hi = m; }
    return [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo];
  };
  for (const p of MAP.paths) {
    if (p.kind !== 'paving') continue;
    const ok = p.pts.map((q) => free(q[0], q[1]));
    let best = [], run = [];
    for (let i = 0; i < p.pts.length; i++) {
      if (ok[i]) {
        if (!run.length && i > 0) run.push(cut(p.pts[i], p.pts[i - 1]));
        run.push(p.pts[i]);
        if (i + 1 < p.pts.length && !ok[i + 1]) run.push(cut(p.pts[i], p.pts[i + 1]));
      }
      if (!ok[i] || i === p.pts.length - 1) { if (run.length > best.length) best = run; run = []; }
    }
    const pts = best.filter((q, i) => i === 0 || Math.hypot(q[0] - best[i - 1][0], q[1] - best[i - 1][1]) > 0.05);
    if (pts.length > 1) out.push({ line: finish(pts), half: p.half, id: p.id });
  }
  for (const l of MAP.landmarks) {
    const g = l.gate; if (!g) continue;
    const fx = l.x + Math.sin(l.rot) * (l.d / 2), fz = l.z + Math.cos(l.rot) * (l.d / 2);
    const dx = fx - g.x, dz = fz - g.z, d = Math.hypot(dx, dz);
    if (d < 1) continue;
    const x0 = g.x - (dx / d) * 0.5, z0 = g.z - (dz / d) * 0.5, n = Math.max(2, Math.ceil((d + 0.5) / 1.5));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([x0 + ((fx - x0) * i) / n, z0 + ((fz - z0) * i) / n]);
    out.push({ line: finish(pts), half: 1.5, id: `gatepath-${l.id}` });
  }
  return out;
}

export function buildStreets(ctx, paved) {
  const { world, map: MAP } = ctx;
  const { fbm2, hash2, clamp, lerp, smoothstep } = ctx.rng;
  const T = streetTools(ctx);
  const road = new Buf(true), kerb = new Buf(true), pave = new Buf(true);
  const hAt = world.heightAt, P = {}, Q = {}, R = {};
  const nAt = (x, z) => world.normalAt(x, z, [0, 1, 0]);

  // ---- layers: greedy colouring so streets that share a junction never share a height ---------------------------------
  const layer = {};
  for (const st of MAP.streets) {
    const used = new Set();
    for (const j of MAP.junctions) if (j.streets.includes(st.id)) for (const o of j.streets) if (o !== st.id && layer[o] !== undefined) used.add(layer[o]);
    let l = 0; while (used.has(l)) l++;
    layer[st.id] = l;
  }

  // ---- gates per street side -----------------------------------------------------------------------------------------
  const gates = new Map();
  for (const g of MAP.gates) {
    const k = `${g.street}|${g.side}`;
    if (!gates.has(k)) gates.set(k, []);
    gates.get(k).push([g.s - g.width / 2 - 0.2, g.s + g.width / 2 + 0.2]);
  }
  const RAMP = 0.6;
  const dropAt = (list, s) => {
    let v = 0;
    for (const g of list) { const d = Math.max(g[0] - s, s - g[1], 0); if (d < RAMP) v = Math.max(v, 1 - d / RAMP); }
    return v;
  };

  function freeIntervals(blocked, len) {
    const out = [];
    let prevS = 0, prevB = blocked(0), start = prevB ? null : 0;
    for (let s = 0.5; ; s += 0.5) {
      const ss = Math.min(s, len), b = blocked(ss);
      if (b !== prevB) {
        let lo = prevS, hi = ss;
        for (let k = 0; k < 9; k++) { const m = (lo + hi) / 2; if (blocked(m) === prevB) lo = m; else hi = m; }
        if (prevB) start = hi; else { out.push([start, lo]); start = null; }
      }
      prevB = b; prevS = ss;
      if (ss >= len) break;
    }
    if (start !== null) out.push([start, len]);
    return out.filter((iv) => iv[1] - iv[0] > 0.3);
  }
  /** cut position for another offset line, searched around the cut found on the reference line */
  function edgeCut(blk, cut, dir, len) {
    if (cut <= 0.001 || cut >= len - 0.001) return cut;
    let sIn = cut - dir * 0.05, sOut = cut + dir * 0.05, k = 0;
    while (blk(sIn)) { sIn -= dir * 0.5; if (++k > 18 || sIn < 0 || sIn > len) return cut; }
    k = 0;
    while (!blk(sOut)) { sOut += dir * 0.5; if (++k > 18 || sOut < 0 || sOut > len) return cut; }
    for (let i = 0; i < 9; i++) { const m = (sIn + sOut) / 2; if (blk(m)) sOut = m; else sIn = m; }
    return sIn;
  }
  function rowsFor(a, b, extra) {
    const out = [a, b];
    for (let s = Math.ceil(a / 2) * 2; s < b; s += 2) out.push(s);
    for (const e of extra) if (e > a && e < b) out.push(e);
    out.sort((x, y) => x - y);
    return out.filter((s, i) => i === 0 || s - out[i - 1] > 0.04);
  }

  const stats = { roadTris: 0 }, fillets = [];
  const samp = {};
  for (const st of MAP.streets) { const E = T.end(st); samp[st.id] = makeSampler(st, E.mitre0, E.mitre1); }
  // kerb faces stand square to the low sun and would glow orange next to the grey paving: darker and cooler
  const face = (c) => [c * 0.95, c, c * 1.1];
  for (const st of MAP.streets) {
    const E = T.end(st), S = samp[st.id], len = st.len, half = st.half, L = layer[st.id] * LAYER;
    const startJ = !E.openStart, endJ = !E.openEnd, order = MAP.streets.indexOf(st);
    const sink = (s) => 0.55 * (1 - smoothstep(6, 26, T.openDist(st, s)));
    // A rounded corner is ONE surface shared by two streets: towards it the kerb and the paving of each street ease from
    // the street's own layer height to the corner's (the higher of the two), so nothing steps where they meet.
    const lift = (s, a, b, ca, cb) => {
      let v = L;
      if (ca) v = lerp(ca.Lc, v, smoothstep(0, 2.5, s - a));
      if (cb) v = lerp(cb.Lc, v, smoothstep(0, 2.5, b - s));
      return v;
    };
    const dropStubs = (ivs) => {
      if (startJ && ivs.length > 1 && ivs[0][1] < 14) ivs.shift();
      if (endJ && ivs.length > 1 && ivs[ivs.length - 1][0] > len - 14) ivs.pop();
      return ivs;
    };

    // ---- carriageway -------------------------------------------------------------------------------------------------
    let prev = null;
    for (let i = 0; i < st.pts.length; i++) {
      const s = st.cum[i], row = [];
      for (let k = 0; k < 5; k++) {
        const f = k / 2 - 1; // -1..1
        S.at(s, f * half, P);
        const y = hAt(P.x, P.z) + ROAD_Y + CROWN * (1 - f * f) + L - sink(s);
        let c = 0.9 + 0.2 * fbm2(P.x * 0.045, P.z * 0.045, 3, 17);
        if (Math.abs(f) === 1 && !world.onRoad(P.x, P.z, -0.45)) c *= 0.78;        // gutter grime (not across a junction)
        else if (Math.abs(f) === 0.5) c *= 1.04;                                     // wheel tracks polish lighter
        row.push(V(P.x, y, P.z, P.x, P.z, c, nAt(P.x, P.z)));
      }
      if (prev) for (let k = 0; k < 4; k++) road.quad(prev[k], prev[k + 1], row[k + 1], row[k], UP);
      prev = row;
    }
    // faint, worn centre line
    if (!st.lane) {
      const rand = ctx.rng.makeRng(`terrain:centreline:${st.id}`);
      for (let s = 5; s < len - 8; s += 9) {
        S.at(s + 1.5, 0, P);
        const worn = rand.range(0.25, 1);
        if (MAP.junctions.some((j) => Math.hypot(j.x - P.x, j.z - P.z) < 12) || worn < 0.34) continue;
        const cl = [lerp(1, 2.3, worn), lerp(1, 2.15, worn), lerp(1, 1.75, worn)];
        let pr = null;
        for (let k = 0; k <= 2; k++) {
          const ss = s + k * 1.5, pair = [];
          for (const o of [-0.065, 0.065]) { S.at(ss, o, Q); pair.push(V(Q.x, hAt(Q.x, Q.z) + ROAD_Y + CROWN + L + 0.012 - sink(ss), Q.z, Q.x, Q.z, cl, nAt(Q.x, Q.z))); }
          if (pr) road.quad(pr[0], pr[1], pair[1], pair[0], UP);
          pr = pair;
        }
      }
    }

    for (const side of [1, -1]) {
      const gl = gates.get(`${st.id}|${side}`) || [];
      const breaks = [];
      for (const g of gl) breaks.push(g[0] - RAMP, g[0], g[1], g[1] + RAMP);
      const rand = ctx.rng.makeRng(`terrain:kerb:${st.id}:${side}`), seed = Math.floor(rand() * 1000);

      // ---- kerb ------------------------------------------------------------------------------------------------------
      const kOff = side * (half + KERB_W / 2), wA = st.wallOff - 0.22 - half;
      let ivs = dropStubs(freeIntervals((s) => { S.at(s, kOff, P); return !!T.onRoad(P.x, P.z, 0.02, st); }, len));
      // rounded corner where this kerb interval stops against another street (dir = +1: interval start, -1: its end)
      const corner = (sc, dir, room) => {
        S.at(sc - dir * 0.4, kOff, P);
        const B = T.onRoad(P.x, P.z, 0.1, st);
        if (!B) return null;
        S.at(sc, side * half, P);
        const dAx = dir * P.tx, dAz = dir * P.tz, nAx = side * P.tz, nAz = -side * P.tx;
        const q = world.distToLine(B, P.x, P.z, 40), d0 = q.d, i = q.i;
        let bx = B.pts[i + 1][0] - B.pts[i][0], bz = B.pts[i + 1][1] - B.pts[i][1];
        const bl = Math.hypot(bx, bz); bx /= bl; bz /= bl;
        if (bx * nAx + bz * nAz < 0) { bx = -bx; bz = -bz; }
        const cos = dAx * bx + dAz * bz, sin = Math.abs(dAx * bz - dAz * bx);
        if (sin < 0.34) return null;
        const th = Math.atan2(sin, cos), hs = Math.sin(th / 2), tn = Math.tan(th / 2), wB = B.wallOff - 0.22 - B.half;
        let r = Math.min(lerp(0.95, 3, smoothstep(0.7, 1.5, th)), (0.7 * Math.min(wA, wB)) / (1 - hs));
        const t = Math.min(r / tn, 7); r = t * tn;
        const lam = (B.half - d0) / sin;
        if (r < 0.45 || lam + t > room * 0.45) return null;
        const Cx = P.x + dAx * lam, Cz = P.z + dAz * lam;
        const c = { s0: sc, dir, sT: sc + dir * (lam + t), sC: sc + dir * lam, Cx, Cz, dAx, dAz, bx, bz, nAx, nAz, th, r, t, sin, wB, B, Lc: Math.max(L, layer[B.id] * LAYER), f: null };
        // unit normal of B's edge on this corner's side
        let nBx = dAx - cos * bx, nBz = dAz - cos * bz; const nl = Math.hypot(nBx, nBz); nBx /= nl; nBz /= nl;
        c.nBx = nBx; c.nBz = nBz;
        // the other street came first and has already built this corner: end exactly where its arc ends
        const f = fillets.find((g) => g.B === st && Math.hypot(g.Cx - Cx, g.Cz - Cz) < 0.9);
        if (f) { c.f = f; c.Wx = f.Wx; c.Wz = f.Wz; if (f.sB !== null) c.sT = f.sB; }
        else {
          // wall corner: the point at sidewalk width from both carriageways (two Newton steps take the curve of the
          // streets into account; the closed form is for straight edges)
          const x0 = Cx + (wB * dAx + wA * bx) / sin, z0 = Cz + (wB * dAz + wA * bz) / sin, cn = nAx * nBx + nAz * nBz, det = 1 - cn * cn;
          let wx = x0, wz = z0;
          for (let it = 0; it < 3 && det > 0.05; it++) {
            const eA = st.wallOff - 0.22 - world.distToLine(st, wx, wz, 80).d, eB = B.wallOff - 0.22 - world.distToLine(B, wx, wz, 80).d;
            const u = (eA - cn * eB) / det, v = (eB - cn * eA) / det;
            wx += u * nAx + v * nBx; wz += u * nAz + v * nBz;
          }
          if (!(Math.hypot(wx - x0, wz - z0) < 0.6)) { wx = x0; wz = z0; }
          c.Wx = wx; c.Wz = wz;
        }
        c.sW = world.distToLine(st, c.Wx, c.Wz, 80).s;
        return c;
      };
      const corners = [];
      ivs = ivs.map(([a, b]) => {
        const ca = a > 0.01 ? corner(a, 1, b - a) : null, cb = b < len - 0.01 ? corner(b, -1, b - a) : null;
        if (ca) corners.push(ca);
        if (cb) corners.push(cb);
        return [ca ? ca.sT : a, cb ? cb.sT : b, ca, cb];
      });
      for (const [a, b, fa, fb] of ivs) {
        const rows = rowsFor(a, b, breaks);
        let pr = null;
        rows.forEach((s, ri) => {
          S.at(s, side * half, P); S.at(s, side * (half + KERB_W), Q);
          const dn = sink(s), hA = hAt(P.x, P.z) - dn, hB = hAt(Q.x, Q.z) - dn, top = lerp(KERB_TOP, 0.05, dropAt(gl, s)) + lift(s, a, b, fa, fb);
          const c = 0.9 + 0.16 * hash2(Math.floor(s / 0.9), seed, 3);
          // the face is a separate, darker strip: a sun-lit kerb face must not out-shine the paving behind it
          const r = [V(P.x, hA - 0.1, P.z, s, 0, face(c * 0.42)), V(P.x, hA + top, P.z, s, 0.26, c), V(Q.x, hB + top - 0.025, Q.z, s, 0.41, c), V(P.x, hA + top, P.z, s, 0.26, face(c * 0.6))];
          if (pr) {
            kerb.quad(pr[0], pr[3], r[3], r[0], [-side * P.tz, 0, side * P.tx]);
            kerb.quad(pr[1], pr[2], r[2], r[1], UP);
          }
          const cap = (ri === 0 && a > 0.01 && !fa) ? -1 : (ri === rows.length - 1 && b < len - 0.01 && !fb) ? 1 : 0;
          if (cap) kerb.quad(r[0], r[3], r[2], V(Q.x, hB - 0.1, Q.z, s, 0.5, face(c * 0.42)), [cap * P.tx, 0, cap * P.tz]);
          pr = r;
        });
      }
      // The arc itself is built once, by whichever of the two streets gets there first. Its ends are welded to the real
      // kerb lines of both streets (the circle is fitted to straight edges, and a curving street is centimetres off it
      // at the tangent point, which showed as a sliver of lawn): the second street then stops its kerb at `sB`.
      for (const c of corners) {
        if (c.f) continue;
        const B = c.B, SB = samp[B.id], Lm = c.Lc, top = KERB_TOP + Lm;
        let ux = c.dAx + c.bx, uz = c.dAz + c.bz; const ul = Math.hypot(ux, uz); ux /= ul; uz /= ul;
        const od = c.r / Math.sin(c.th / 2), Ox = c.Cx + ux * od, Oz = c.Cz + uz * od;
        const a0 = Math.atan2(c.dAz * c.t - uz * od, c.dAx * c.t - ux * od), a1 = Math.atan2(c.bz * c.t - uz * od, c.bx * c.t - ux * od);
        let da = a1 - a0; if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
        const n = Math.max(4, 2 * Math.ceil(Math.abs(da) / 0.48));
        const ri = c.r - KERB_W, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a0 + da), s1 = Math.sin(a0 + da);
        // weld offsets at both ends, for the kerb face (f) and the kerb back (b)
        S.at(c.sT, side * half, P); S.at(c.sT, side * (half + KERB_W), Q);
        const wf0 = [P.x - (Ox + c0 * c.r), P.z - (Oz + s0 * c.r)], wb0 = [Q.x - (Ox + c0 * ri), Q.z - (Oz + s0 * ri)];
        let wf1 = [0, 0], wb1 = [0, 0], sB = null, sg = 1;
        {
          const q = world.distToLine(B, c.Cx + c.bx * c.t, c.Cz + c.bz * c.t, 80), qs = q.s, qside = q.side;
          SB.at(qs, qside * B.half, P); SB.at(qs, qside * (B.half + KERB_W), Q);
          const f1 = [P.x - (Ox + c1 * c.r), P.z - (Oz + s1 * c.r)], b1 = [Q.x - (Ox + c1 * ri), Q.z - (Oz + s1 * ri)];
          if (Math.hypot(f1[0], f1[1]) < 0.7 && Math.hypot(b1[0], b1[1]) < 0.7) { wf1 = f1; wb1 = b1; sB = qs; }
          sg = P.tx * c.bx + P.tz * c.bz < 0 ? -1 : 1;
          c.sBu = qs;
        }
        fillets.push({ Ox, Oz, r: c.r, Cx: c.Cx, Cz: c.Cz, t: c.t, B, sB, Wx: c.Wx, Wz: c.Wz });
        // paving UVs: the half of the corner next to each street carries on that street's slab courses, so the two
        // patterns meet on one clean mitre from the wall corner to the middle of the arc
        const uvA = (x, z) => [c.sC + c.dir * ((x - c.Cx) * c.dAx + (z - c.Cz) * c.dAz), (x - c.Cx) * c.nAx + (z - c.Cz) * c.nAz - KERB_W];
        const uvB = (x, z) => [c.sBu + sg * ((x - c.Cx) * c.bx + (z - c.Cz) * c.bz - c.t), (x - c.Cx) * c.nBx + (z - c.Cz) * c.nBz - KERB_W];
        const paveV = (x, z, g, uv) => { const q = uv(x, z); return V(x, hAt(x, z) + WALK_Y + Lm, z, q[0], q[1], g * (0.9 + 0.2 * fbm2(x * 0.11, z * 0.11, 3, 23)), nAt(x, z)); };
        const WA = paveV(c.Wx, c.Wz, 0.8, uvA), WB = paveV(c.Wx, c.Wz, 0.8, uvB);
        // asphalt in front of the arc: laid just under both carriageways with its apex pushed into the junction, so no
        // sliver of ground can show along a curved road edge
        const ax = c.Cx - ux * 1.6, az = c.Cz - uz * 1.6;
        const C0 = V(ax, hAt(ax, az) + ROAD_Y - 0.012, az, ax, az, 0.9 + 0.2 * fbm2(ax * 0.045, az * 0.045, 3, 17), nAt(ax, az));
        let pr = null;
        for (let k = 0; k <= n; k++) {
          const f = k / n, ang = a0 + da * f, cx = Math.cos(ang), cz = Math.sin(ang), u = Math.abs(da) * c.r * f;
          const x0 = Ox + cx * c.r + lerp(wf0[0], wf1[0], f), z0 = Oz + cz * c.r + lerp(wf0[1], wf1[1], f);
          const x1 = Ox + cx * ri + lerp(wb0[0], wb1[0], f), z1 = Oz + cz * ri + lerp(wb0[1], wb1[1], f);
          const h0 = hAt(x0, z0), h1 = hAt(x1, z1), kc = 0.9 + 0.16 * hash2(Math.floor(u / 0.9), seed, 7);
          const r = {
            k: [V(x0, h0 - 0.1, z0, u, 0, face(kc * 0.42)), V(x0, h0 + top, z0, u, 0.26, kc), V(x1, h1 + top - 0.025, z1, u, 0.41, kc), V(x0, h0 + top, z0, u, 0.26, face(kc * 0.6))],
            road: V(x0, h0 + ROAD_Y - 0.012, z0, x0, z0, 0.74 * (0.9 + 0.2 * fbm2(x0 * 0.045, z0 * 0.045, 3, 17)), nAt(x0, z0)),
            pA: paveV(x1, z1, 0.95, uvA), pB: paveV(x1, z1, 0.95, uvB),
          };
          if (pr) {
            kerb.quad(pr.k[0], pr.k[3], r.k[3], r.k[0], [cx, 0, cz]);
            kerb.quad(pr.k[1], pr.k[2], r.k[2], r.k[1], UP);
            road.tri(C0, pr.road, r.road, UP);
            if (k <= n / 2) pave.tri(WA, pr.pA, r.pA, UP); else pave.tri(WB, pr.pB, r.pB, UP);
          }
          pr = r;
        }
      }

      // ---- sidewalk --------------------------------------------------------------------------------------------------
      const inner = half + KERB_W, outer = st.wallOff - 0.22, mid = (inner + outer) / 2;
      const offs = [inner, inner + Math.min(0.75, (outer - inner) * 0.4), outer];
      const blk = (off) => (s) => { S.at(s, side * off, P); return !!T.onRoad(P.x, P.z, 0.12, st); };
      const bI = blk(inner + 0.01), bO = blk(outer);
      ivs = dropStubs(freeIntervals(blk(mid), len));
      for (const [a, b] of ivs) {
        let aI = edgeCut(bI, a, -1, len), eI = edgeCut(bI, b, 1, len);
        const aO0 = edgeCut(bO, a, -1, len), eO0 = edgeCut(bO, b, 1, len);
        // a rounded corner owns its paving: the strip stops on the straight line from the arc's tangent point (kerb side)
        // to the wall corner, where the corner fan and the other street's strip take over
        const ca = corners.find((c) => c.dir === 1 && Math.abs(c.s0 - a) < 9), cb = corners.find((c) => c.dir === -1 && Math.abs(c.s0 - b) < 9);
        let aO = aO0, eO = eO0;
        if (ca) { aI = ca.sT; aO = ca.sW; }
        if (cb) { eI = cb.sT; eO = cb.sW; }
        if (eI - aI < 0.2 && eO - aO < 0.2) continue;
        const f1 = (offs[1] - inner) / (outer - inner);
        const lo = [aI, lerp(aI, aO, f1), aO], hi = [Math.max(aI, eI), Math.max(lerp(aI, aO, f1), lerp(eI, eO, f1)), Math.max(aO, eO)];
        const rows = rowsFor(Math.min(aI, aO, a), Math.max(eI, eO, b), [...breaks, aI, aO, a, eI, eO, b]);
        let pr = null;
        for (const s of rows) {
          const r = [];
          for (let k = 0; k < 3; k++) {
            const sk = clamp(s, lo[k], hi[k]);
            S.at(sk, side * offs[k], P);
            const cc = ca && sk <= lo[k] + 1e-9 ? ca : cb && sk >= hi[k] - 1e-9 ? cb : null;
            if (cc && k > 0) { // on the corner's edge: exactly on the line tangent point -> wall corner
              const f = k === 2 ? 1 : f1;
              S.at(cc.sT, side * inner, Q);
              P.x = lerp(Q.x, cc.Wx, f); P.z = lerp(Q.z, cc.Wz, f);
            }
            const h = hAt(P.x, P.z) - sink(sk);
            const y = h + lift(sk, lo[k], hi[k], ca, cb) + (k === 0 ? lerp(WALK_Y, 0.03, dropAt(gl, sk)) : WALK_Y);
            const grime = (k === 2 ? 0.8 : k === 0 ? 0.95 : 1) * (0.9 + 0.2 * fbm2(P.x * 0.11, P.z * 0.11, 3, 23));
            r.push(V(P.x, y, P.z, sk, offs[k] - inner, grime, nAt(P.x, P.z)));
          }
          S.at(clamp(s, lo[2], hi[2]), side * offs[2], R);
          r.push(V(r[2].x, r[2].y - 0.4, r[2].z, r[2].u, offs[2] - inner + 0.4, 0.6));
          r.nx = side * R.tz; r.nz = -side * R.tx;
          if (pr) {
            pave.quad(pr[0], pr[1], r[1], r[0], UP);
            pave.quad(pr[1], pr[2], r[2], r[1], UP);
            const t0 = V(pr[2].x, pr[2].y, pr[2].z, pr[2].u, pr[2].v, 0.6), t1 = V(r[2].x, r[2].y, r[2].z, r[2].u, r[2].v, 0.6);
            pave.quad(t0, t1, r[3], pr[3], [r.nx, 0, r.nz]);
          }
          pr = r;
        }
      }
    }
  }
  stats.roadTris = road.triangles;

  // ---- tree pits: dark earth in a granite frame, flush with the paving --------------------------------------------------
  const EARTH = [0.31, 0.24, 0.175], FRAME = 0.11;   // linear; 0.2 read as a black hole in shade
  for (const t of MAP.trees) {
    const st = t.street && MAP.streetById[t.street];
    if (!st || t.s === undefined) continue;
    const inner = st.half + KERB_W, outer = st.wallOff - 0.22, off = Math.abs(world.distToLine(st, t.x, t.z, 12).d);
    const hs = Math.min(0.65, Math.min(off - inner, outer - off) - 0.03);
    if (!(hs > 0.3)) continue;
    // no pit where a rounded corner has taken the paving away from under it
    if (fillets.some((f) => Math.hypot(t.x - f.Cx, t.z - f.Cz) < f.t + 1.2 && Math.hypot(t.x - f.Ox, t.z - f.Oz) > f.r - 1.1)) continue;
    world.pointAt(st, t.s, P);
    const tx = P.tx, tz = P.tz, L = layer[st.id] * LAYER - 0.55 * (1 - smoothstep(6, 26, T.openDist(st, t.s)));
    const corner = (a, b, lift, c) => { const x = t.x + tx * a + tz * b, z = t.z + tz * a - tx * b; return V(x, hAt(x, z) + WALK_Y + L + lift, z, a, b, c); };
    const hi = hs - FRAME;
    kerb.quad(corner(-hi, -hi, 0.012, EARTH), corner(hi, -hi, 0.012, EARTH), corner(hi, hi, 0.012, EARTH), corner(-hi, hi, 0.012, EARTH), UP);
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % 4];
      kerb.quad(corner(a[0] * hs, a[1] * hs, 0.022, 0.95), corner(b[0] * hs, b[1] * hs, 0.022, 0.95), corner(b[0] * hi, b[1] * hi, 0.022, 0.88), corner(a[0] * hi, a[1] * hi, 0.022, 0.88), UP);
    }
  }

  // ---- paved footpaths ---------------------------------------------------------------------------------------------------
  for (const pl of paved) {
    const S = makeSampler(pl.line), len = pl.line.len, half = pl.half;
    const n = Math.max(1, Math.ceil(len / 1.6));
    let pr = null;
    for (let i = 0; i <= n; i++) {
      const s = (len * i) / n, r = [];
      for (const f of [-1, 0, 1]) {
        S.at(s, f * half, P);
        const c = (f === 0 ? 1 : 0.86) * (0.92 + 0.16 * fbm2(P.x * 0.13, P.z * 0.13, 3, 29));
        r.push(V(P.x, hAt(P.x, P.z) + 0.075, P.z, s, f * half, c, nAt(P.x, P.z)));
      }
      r.tx = P.tx; r.tz = P.tz;
      if (pr) {
        pave.quad(pr[0], pr[1], r[1], r[0], UP); pave.quad(pr[1], pr[2], r[2], r[1], UP);
        for (const [k, sg] of [[0, -1], [2, 1]]) {
          const a = pr[k], b = r[k];
          pave.quad(V(a.x, a.y, a.z, a.u, 0, 0.6), V(b.x, b.y, b.z, b.u, 0, 0.6), V(b.x, b.y - 0.35, b.z, b.u, 0.35, 0.6), V(a.x, a.y - 0.35, a.z, a.u, 0.35, 0.6), [sg * r.tz, 0, -sg * r.tx]);
        }
      }
      pr = r;
    }
  }

  return { road, kerb, pave, stats };
}
