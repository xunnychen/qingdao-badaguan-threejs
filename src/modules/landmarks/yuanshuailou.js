// 元帅楼: Japanese-style two-storey villa, horizontal emphasis: tall granite rubble ground storey, buff stucco above
// with dark timber framing and window bands, a low hipped roof with deep eaves on exposed rafters, a flat-canopy porch;
// garden with rockery, a small pond, a stone lantern and bamboo.
import { lin, mul, mix, WHITE, site, rect } from './kit.js';
import { chimney } from './parts.js';

const PI = Math.PI;
const BUFF = lin('#D9CBB0'), TIMBER = lin('#3B2E25'), ROOFJ = [0.44, 0.98, 1.4], RUB = [0.93, 0.92, 0.9], STONE = [0.9, 0.88, 0.84];
const SOFFIT = lin('#5a4636'), BAMBOO = lin('#7d9440'), LEAVES = [lin('#4f7a35'), lin('#6a9440'), lin('#3f6a30'), lin('#86a84c')];

export function buildYuanshuailou(B, L, env) {
  const g0 = site(L, 0, env.heightAt).range(-7.6, -5, 7.6, 6, 6);
  const F = g0.hi + 0.3, S = site(L, F, env.heightAt);
  const rng = env.makeRng('landmarks:yuanshuailou');
  B.rng = rng; B.litShare = 0.4;
  const X0 = -7.6, X1 = 7.6, Z0 = -5, Z1 = 3.6, G = 3.2, E = 6.2, PITCH = 27, TAN = Math.tan((PITCH * PI) / 180);
  const lo = S.range(-8, -5.5, 8, 6.5, 6).lo;
  const Wb = (u, y, w, h, n = 3) => ({ u, y, w, h, frame: TIMBER, fw: 0.075, bars: [n, 1], sill: TIMBER, sillKey: 'trim', rev: 0.14 });
  const mat = (u, y) => (y < G ? { key: 'rubble', col: y < 0 ? mul(RUB, 0.8) : RUB } : null);
  const timber = (len, posts) => {
    B.box('trim', 0, G - 0.13, 0, len, G + 0.1, 0.07, TIMBER, { skip: 'b' });
    B.box('trim', 0, E - 0.2, 0, len, E, 0.05, TIMBER, { skip: 'b' });
    B.box('trim', 0, G + 0.82, 0, len, G + 0.93, 0.04, TIMBER, { skip: 'b' });
    B.box('trim', 0, G + 2.32, 0, len, G + 2.43, 0.04, TIMBER, { skip: 'b' });
    for (const u of posts) B.box('trim', u - 0.08, G + 0.1, 0, u + 0.08, E - 0.2, 0.04, TIMBER, { skip: 'bu' });
  };
  const rafters = (len, yE, ov) => {
    for (let u = 0.22; u < len - 0.1; u += 0.56) {
      B.beam('trim', [u, yE - 0.14, 0.02], [u, yE - 0.14 - (ov - 0.06) * TAN, ov - 0.04], 0.075, 0.11, mul(TIMBER, 1.25), { anchor: 't' });
    }
  };
  const cols = [];

  B.frame(L.x, F, L.z, L.rot, () => {
    const faces = [
      { posts: [0.08, 5.0, 10.0, 15.12], ops: [{ u: 8.0, y: 0, w: 1.45, h: 2.25, kind: 'door', doorCol: mul(TIMBER, 1.5), frame: TIMBER, glazed: true }, Wb(12.3, 1.0, 2.6, 1.3),
        Wb(2.5, G + 0.93, 2.8, 1.39), Wb(7.5, G + 0.93, 2.8, 1.39), Wb(12.5, G + 0.93, 2.8, 1.39)] },
      { posts: [0.08, 4.3, 8.52], ops: [Wb(4.3, 1.0, 2.4, 1.3), Wb(2.15, G + 0.93, 2.4, 1.39, 2), Wb(6.45, G + 0.93, 2.4, 1.39, 2)] },
      { posts: [0.08, 5.0, 10.0, 15.12], ops: [Wb(2.6, 1.0, 2.2, 1.3), Wb(7.6, 1.0, 2.2, 1.3), Wb(12.6, 1.0, 2.2, 1.3), Wb(2.5, G + 0.93, 2.8, 1.39), Wb(7.5, G + 0.93, 2.8, 1.39), Wb(12.5, G + 0.93, 2.8, 1.39)] },
      { posts: [0.08, 4.3, 8.52], ops: [Wb(4.3, 1.0, 2.4, 1.3), Wb(2.15, G + 0.93, 2.4, 1.39, 2), Wb(6.45, G + 0.93, 2.4, 1.39, 2)] },
    ];
    B.outline(rect(X0, Z0, X1, Z1), 0, true, (i, len) => {
      B.wall({ key: 'stucco', col: BUFF, u0: 0, u1: len, y0: lo - 0.5, y1: E, ops: faces[i].ops, aoTop: 0.4, lines: { y: [0, G] }, mat, du: 5 });
      timber(len, faces[i].posts);
      rafters(len, E, 0.9);
    });
    B.hipRoof(X0, Z0, X1, Z1, E, PITCH, 0.9, { axis: 'x', col: ROOFJ, uc: SOFFIT, ec: TIMBER, t: 0.12, capCol: mul(ROOFJ, 0.7) });

    // single-storey front room with its own low hip
    const QX0 = -7.6, QX1 = -2.6, QZ = 6.0;
    B.outline([[QX0, Z1], [QX0, QZ], [QX1, QZ], [QX1, Z1]], 0, false, (i, len) => {
      B.wall({ key: 'stucco', col: BUFF, u0: 0, u1: len, y0: lo - 0.5, y1: G, aoTop: 0.4, lines: { y: [0, 0.95] }, du: 5,
        mat: (u, y) => (y < 0.95 ? { key: 'rubble', col: y < 0 ? mul(RUB, 0.8) : RUB } : null), ops: i === 1 ? [Wb(len / 2, 0.95, 3.4, 1.45, 4)] : [] });
      B.box('trim', 0, 0.84, 0, len, 0.95, 0.05, TIMBER, { skip: 'b' });
      B.box('trim', 0, G - 0.2, 0, len, G, 0.05, TIMBER, { skip: 'b' });
      for (const u of [0.08, len - 0.08]) B.box('trim', u - 0.08, 0.95, 0, u + 0.08, G - 0.2, 0.04, TIMBER, { skip: 'bu' });
      rafters(len, G, 0.7);
    });
    B.hipRoof(QX0, Z1 - 1.6, QX1, QZ, G, PITCH, 0.7, { axis: 'x', col: ROOFJ, uc: SOFFIT, ec: TIMBER, t: 0.1, capCol: mul(ROOFJ, 0.7) });

    // flat-canopy porch
    const PX0 = -1.3, PX1 = 2.1, PZ = 5.9;
    const pg = S.range(PX0, Z1, PX1, PZ + 2, 3).lo;
    B.box('rubble', PX0, pg - 0.4, Z1, PX1, -0.12, PZ, RUB, { skip: 'bu' });
    B.box('stone', PX0 - 0.05, -0.12, Z1, PX1 + 0.05, 0, PZ + 0.05, STONE, { skip: 'bu' });
    B.box('trim', PX0 - 0.35, 2.62, Z1, PX1 + 0.35, 2.8, PZ + 0.4, mul(TIMBER, 1.3), { skip: 'b' });
    B.box('trim', PX0 - 0.42, 2.8, Z1, PX1 + 0.42, 2.86, PZ + 0.47, lin('#5c5550'), { skip: 'b' });
    for (const x of [PX0 + 0.12, PX1 - 0.12]) {
      B.beam('trim', [x, 0, PZ - 0.14], [x, 2.62, PZ - 0.14], 0.16, 0.16, TIMBER, { caps: false });
      B.beam('trim', [x, 2.5, Z1], [x, 2.5, PZ + 0.3], 0.1, 0.16, TIMBER);
    }
    for (let x = PX0 + 0.5; x < PX1 - 0.3; x += 0.55) B.beam('trim', [x, 2.56, Z1], [x, 2.56, PZ + 0.3], 0.06, 0.09, mul(TIMBER, 1.2), { caps: false });
    let run = 0;
    B.frame((PX0 + PX1) / 2, 0, PZ, 0, () => { run = B.stairs('stone', 2.6, (z) => S.gy((PX0 + PX1) / 2, PZ + z), STONE); });
    chimney(B, 4.4, -1.4, 5.3, -0.6, 6.6, 9.3, { key: 'rubble', col: RUB, pots: 1 });

    // ---- garden: pond, rockery, stone lantern, bamboo ------------------------------------------------------------------------
    // the water sits just above the HIGHEST rim ground (so the lawn never covers it); a stone skirt runs down the low side
    const PCX = 6.4, PCZ = 7.7, pr = S.range(PCX - 2.1, PCZ - 1.5, PCX + 2.1, PCZ + 1.5, 6), py = pr.hi + 0.04;
    const pond = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * PI * 2, r = 1 + 0.16 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 5); pond.push([PCX + Math.sin(a) * 1.75 * r, py, PCZ + Math.cos(a) * 1.15 * r]); }
    B.slab('water', pond, pr.hi - pr.lo + 0.5, WHITE, { noUnder: true, ek: 'stone', ec: mul(RUB, 0.55) });
    pond.forEach((p, k) => {
      const sz = 0.2 + 0.16 * rng();
      B.rock('stone', p[0] + (p[0] - PCX) * 0.1, py + sz * 0.1, p[2] + (p[2] - PCZ) * 0.1, sz * 1.35, sz * 0.9, sz * 1.1, k * 3.7 + 2, mul(RUB, 0.8 + 0.2 * rng()), { detail: 0, amp: 0.25, rotY: rng() * 6 });
      const q = pond[(k + 1) % 12];
      B.rock('stone', (p[0] + q[0]) / 2 + ((p[0] + q[0]) / 2 - PCX) * 0.06, py, (p[2] + q[2]) / 2 + ((p[2] + q[2]) / 2 - PCZ) * 0.06, 0.34, 0.2, 0.26, k * 1.9 + 40, mul(RUB, 0.75), { detail: 0, amp: 0.2, rotY: rng() * 6 });
    });
    const RK = [[8.9, 6.3, 1.0, 1.25, 0.8], [9.9, 7.2, 0.8, 0.8, 0.7], [8.2, 5.7, 0.7, 0.6, 0.6], [9.5, 5.6, 0.55, 0.95, 0.5], [7.6, 6.4, 0.45, 0.35, 0.4]];
    RK.forEach((r, k) => B.rock('stone', r[0], S.gy(r[0], r[1]) + r[3] * 0.55, r[1], r[2], r[3], r[4], k * 11.3 + 5, (x, y) => mul(mix([0.42, 0.45, 0.38], [0.8, 0.78, 0.74], Math.min(1, Math.max(0, (y - S.gy(r[0], r[1])) / r[3]))), 1), { power: 2.2, amp: 0.3, rotY: k * 1.3 }));
    // stone lantern
    const LX = 3.9, LZ = 6.7, ly = S.gy(LX, LZ);
    B.box('stone', LX - 0.28, ly - 0.2, LZ - 0.28, LX + 0.28, ly + 0.12, LZ + 0.28, STONE, { skip: 'u' });
    B.column('stone', LX, ly + 0.12, LZ, 0.11, 0.75, STONE, 8, 0.09);
    B.box('stone', LX - 0.26, ly + 0.87, LZ - 0.26, LX + 0.26, ly + 0.96, LZ + 0.26, STONE);
    B.box('stone', LX - 0.17, ly + 0.96, LZ - 0.17, LX + 0.17, ly + 1.26, LZ + 0.17, mul(STONE, 0.9), { skip: 'u' });
    for (let k = 0; k < 4; k++) B.frame(LX, ly + 1.0, LZ, (k * PI) / 2, () => B.q('lit', [-0.09, 0, 0.175], [0.09, 0, 0.175], [0.09, 0.2, 0.175], [-0.09, 0.2, 0.175], WHITE));
    const capY = ly + 1.26;
    const cp = [[-0.36, -0.36], [0.36, -0.36], [0.36, 0.36], [-0.36, 0.36]];
    for (let k = 0; k < 4; k++) { const a = cp[k], b = cp[(k + 1) % 4]; B.polyOut('stone', [[LX + a[0], capY, LZ + a[1]], [LX + b[0], capY, LZ + b[1]], [LX, capY + 0.3, LZ]], [LX, capY, LZ], mul(STONE, 0.85)); }
    B.poly('stone', cp.map((p) => [LX + p[0], capY, LZ + p[1]]), mul(STONE, 0.6));
    B.sphere('stone', LX, capY + 0.34, LZ, 0.07, STONE, 6);
    // bamboo clumps
    const clump = (cx, cz, n, hgt) => {
      for (let k = 0; k < n; k++) {
        const a = rng() * PI * 2, d = rng() * 0.75, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, gy = S.gy(x, z), h = hgt * (0.7 + 0.45 * rng());
        const lean = 0.05 + 0.12 * rng(), tx = x + Math.cos(a) * h * lean, tz = z + Math.sin(a) * h * lean;
        const mid = [x + (tx - x) * 0.4, gy + h * 0.55, z + (tz - z) * 0.4], tip = [tx, gy + h, tz];
        B.beam('trim', [x, gy - 0.1, z], mid, 0.055, 0.055, BAMBOO, { caps: false });
        B.beam('trim', mid, tip, 0.035, 0.035, mul(BAMBOO, 1.1), { caps: false });
        const nl = 26;
        for (let j = 0; j < nl; j++) {
          const t = 0.38 + 0.62 * rng(), bx = x + (tx - x) * t * t, by = gy + h * t, bz = z + (tz - z) * t * t;
          const la = rng() * PI * 2, ll = 0.5 + 0.5 * rng(), droop = 0.15 + 0.5 * rng(), w = 0.07 + 0.05 * rng();
          const dx = Math.cos(la), dz2 = Math.sin(la), c = LEAVES[(rng() * 4) | 0], c2 = mul(c, 0.8 + 0.4 * rng());
          const ox = bx + dx * 0.25 * rng(), oz = bz + dz2 * 0.25 * rng();
          B.poly('foliage', [[ox - dz2 * w, by, oz + dx * w], [ox + dz2 * w, by, oz - dx * w], [ox + dx * ll, by - ll * droop, oz + dz2 * ll]], c2, { nor: [[0, 1, 0], [0, 1, 0], [dx * 0.4, 0.9, dz2 * 0.4]] });
          B.poly('foliage', [[ox + dx * ll * 0.5 - dz2 * w * 1.6, by - ll * droop * 0.35, oz + dz2 * ll * 0.5 + dx * w * 1.6], [ox, by + 0.02, oz], [ox + dx * ll * 1.25, by - ll * droop * 1.3, oz + dz2 * ll * 1.25]], mul(c2, 0.85), { nor: [[0, 1, 0], [0, 1, 0], [0, 1, 0]] });
        }
      }
      cols.push([cx, cz, 0.7]);
    };
    clump(10.2, 3.6, 13, 5.6);
    clump(-9.4, 6.6, 11, 5.0);
    clump(11.2, 5.2, 7, 4.4);
    cols.push([PCX, PCZ, 1.35], [9.0, 6.3, 1.3], [LX, LZ, 0.4]);

    const col = env.collision, tag = `landmark:${L.id}`;
    if (col) {
      col.removeTag(tag);
      const box = (x0, z0, x1, z1) => col.addBox(S.wx((x0 + x1) / 2, (z0 + z1) / 2), S.wz((x0 + x1) / 2, (z0 + z1) / 2), (x1 - x0) / 2, (z1 - z0) / 2, L.rot, tag);
      box(X0 - 0.1, Z0 - 0.1, X1 + 0.1, Z1 + 0.1); box(QX0 - 0.1, Z1, QX1 + 0.1, QZ + 0.1); box(PX0, Z1, PX1, PZ + run);
      for (const c of cols) col.addCircle(S.wx(c[0], c[1]), S.wz(c[0], c[1]), c[2], tag);
    }
  });
  return { F, S };
}
