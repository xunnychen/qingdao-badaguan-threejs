// Staged people from MAP.figures: wedding couples with their photographer and reflector assistant, strollers looking
// at the sea, an elder with a cane. Stylised, faceless, lathe-and-limb bodies; each staged group (a couple with
// its crew, a stroller) is one mesh with vertex colours, drawn within 230 m and shadowed within 60 m. uv.x carries a "cloth" weight so
// hems, veils and trains stir in the wind.
import * as THREE from 'three';

const SKIN = '#e2b796', HAIR = '#1c1714';
const GOWN = '#F4F1EA', QIPAO = '#B3261E', SUIT = '#1E2230', SILVER = '#D8D8D2';

export function createFigures(ctx, S) {
  const { map: MAP, rng, geo: G } = ctx;
  const cells = new Map();
  let all = null;
  let tris = 0, people = 0;
  const _c = new THREE.Color(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  /** make a part mergeable: non-indexed, vertex colour, cloth weight in uv.x */
  function prep(g, hex, sway = 0) {
    g = G.normalize(g);
    const pos = g.attributes.position, n = pos.count, uv = g.attributes.uv, col = new Float32Array(n * 3);
    _c.set(hex);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      uv.setXY(i, typeof sway === 'function' ? sway(pos.getX(i), pos.getY(i), pos.getZ(i)) : sway, 0);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  const limb = (a, b, r0, r1, hex, segs = 6, sway = 0) => {
    const d = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, segs, 1, true);
    _q.setFromUnitVectors(UP, d.normalize());
    g.applyMatrix4(_m.compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, new THREE.Vector3(1, 1, 1)));
    return prep(g, hex, sway);
  };
  const ball = (c, r, hex, sc = [1, 1, 1], ws = 5, hs = 3) => prep(new THREE.SphereGeometry(r, ws, hs).scale(sc[0], sc[1], sc[2]).translate(c[0], c[1], c[2]), hex);
  const box = (c, w, h, d, hex, rotY = 0) => prep(new THREE.BoxGeometry(w, h, d).rotateY(rotY).translate(c[0], c[1], c[2]), hex);
  const lathe = (profile, hex, segs = 10, zs = 1, sway = 0) => prep(new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), segs).scale(1, 1, zs), hex, sway);
  const disc = (c, r, t, hex, rx = 0, segs = 16) => prep(new THREE.CylinderGeometry(r, r, t, segs).rotateX(rx).translate(c[0], c[1], c[2]), hex);

  function head(L, y, z = 0, o = {}) {
    const hair = o.hair || HAIR;
    L.push(ball([0, y, z], 0.105, SKIN, [0.92, 1.1, 1], 7, 5));
    L.push(limb([0, y - 0.21, z * 0.5], [0, y - 0.06, z], 0.05, 0.047, SKIN));
    if (!o.bald) L.push(ball([0, y + 0.03, z - 0.024], 0.112, hair, [0.96, 1.0, 1.0], 7, 4));
    if (o.bun) L.push(ball([0, y + 0.11, z - 0.075], 0.056, hair));
    if (o.long) L.push(ball([0, y - 0.1, z - 0.085], 0.1, hair, [1.0, 1.7, 0.6]));
    if (o.flower) L.push(ball([0.07, y + 0.1, z - 0.03], 0.035, o.flower));
    if (o.cap) { L.push(disc([0, y + 0.105, z + 0.01], 0.118, 0.05, o.cap)); L.push(box([0, y + 0.085, z + 0.12], 0.15, 0.015, 0.09, o.cap)); }
    if (o.hat) { L.push(disc([0, y + 0.095, z], 0.2, 0.014, o.hat, 0, 14)); L.push(disc([0, y + 0.14, z], 0.1, 0.085, o.hat, 0, 10)); }
  }
  function legs(L, hipY, hex, shoe = '#15130f', spread = 0.095) {
    for (const s of [1, -1]) {
      L.push(limb([s * (spread + 0.005), 0.06, 0], [s * spread, hipY + 0.02, 0], 0.06, 0.09, hex));
      L.push(box([s * (spread + 0.005), 0.035, 0.045], 0.095, 0.07, 0.25, shoe));
    }
  }
  function arm(L, s, sh, el, ha, sleeve, hand = SKIN, r = 0.05) {
    const m = (p) => [p[0] * s, p[1], p[2]];
    L.push(limb(m(sh), m(el), r, r * 0.86, sleeve));
    L.push(limb(m(el), m(ha), r * 0.84, r * 0.7, sleeve));
    L.push(ball(m(ha), 0.045, hand));
    L.push(ball(m(sh), r * 1.12, sleeve));
  }
  const ARM_DOWN = [[0.235, 1.43, 0], [0.275, 1.15, 0.0], [0.255, 0.9, 0.07]];

  function man(L, o) {
    legs(L, 0.9, o.trousers);
    L.push(lathe([[0.185, 0.84], [0.2, 0.98], [0.19, 1.14], [0.215, 1.34], [0.2, 1.44], [0.1, 1.5], [0.05, 1.52]], o.top, 10, 0.62));
    for (const s of [1, -1]) { const a = (s > 0 ? o.armR : o.armL) || ARM_DOWN; arm(L, s, a[0], a[1], a[2], o.sleeve || o.top, o.hand); }
    if (o.shirt) { L.push(box([0, 1.375, 0.118], 0.085, 0.2, 0.03, o.shirt)); L.push(box([0, 1.37, 0.128], 0.03, 0.17, 0.025, o.tie || '#5a1a1a')); }
    head(L, 1.665, 0, o.head);
  }
  function brideWhite(L) {
    const hem = (x, y) => 0.55 * (1 - Math.min(1, y / 1.06)) ** 2;
    L.push(lathe([[0.6, 0.0], [0.585, 0.06], [0.47, 0.36], [0.31, 0.72], [0.175, 0.98], [0.118, 1.06]], GOWN, 11, 1, hem));
    L.push(lathe([[0.118, 1.06], [0.135, 1.14], [0.152, 1.25], [0.148, 1.315]], GOWN, 10, 0.8));
    L.push(ball([0, 1.37, 0], 0.165, SKIN, [1.05, 0.42, 0.66], 6, 4));
    for (const s of [1, -1]) arm(L, s, [0.165, 1.385, 0], [0.215, 1.16, 0.06], [0.055, 1.05, 0.2], SKIN, SKIN, 0.04);
    L.push(ball([0, 1.04, 0.25], 0.1, '#f7f3ee'));
    L.push(ball([0.05, 1.09, 0.28], 0.05, '#f2a0b8')); L.push(ball([-0.05, 1.06, 0.3], 0.05, '#e8455e')); L.push(ball([0, 0.98, 0.24], 0.07, '#4f7a35'));
    head(L, 1.55, 0, { bun: true });
    // veil falling from the bun down the back
    const veil = new THREE.CylinderGeometry(0.04, 0.27, 0.85, 8, 1, true).rotateX(-0.2).translate(0, 1.23, -0.19);
    L.push(prep(veil, '#fbfaf6', (x, y) => 0.45 * Math.max(0, (1.6 - y) / 0.8)));
  }
  function brideRed(L) {
    L.push(lathe([[0.125, 0.14], [0.14, 0.3], [0.165, 0.62], [0.19, 0.9], [0.15, 1.06], [0.155, 1.2], [0.17, 1.3], [0.165, 1.36], [0.1, 1.42], [0.055, 1.45], [0.052, 1.475]], QIPAO, 10, 0.74,
      (x, y) => 0.25 * Math.max(0, 1 - y / 0.7) ** 2));
    for (const s of [1, -1]) {
      L.push(limb([s * 0.06, 0.05, 0], [s * 0.06, 0.16, 0], 0.035, 0.04, SKIN));
      L.push(box([s * 0.06, 0.03, 0.04], 0.07, 0.06, 0.21, '#8a1a16'));
    }
    arm(L, 1, [0.17, 1.37, 0], [0.22, 1.15, 0.03], [0.12, 1.0, 0.16], SKIN, SKIN, 0.04);
    arm(L, -1, [0.17, 1.37, 0], [0.2, 1.17, 0.1], [0.06, 1.14, 0.24], SKIN, SKIN, 0.04);
    for (const s of [1, -1]) L.push(ball([s * 0.17, 1.365, 0], 0.062, QIPAO));
    // round silk fan (团扇)
    L.push(disc([-0.05, 1.28, 0.27], 0.13, 0.01, '#f4e3d0', Math.PI / 2 - 0.15, 12));
    L.push(limb([-0.055, 1.02, 0.25], [-0.05, 1.16, 0.262], 0.008, 0.008, '#5a3b28', 4));
    head(L, 1.55, 0, { bun: true, flower: '#d6355f' });
  }
  function photographer(L) {
    const tr = '#3a3f4a', vest = '#5b5f45', shirt = '#8a8f7a';
    L.push(limb([0.14, 0.06, 0.18], [0.14, 0.5, 0.25], 0.06, 0.075, tr)); L.push(limb([0.14, 0.5, 0.25], [0.1, 0.52, -0.12], 0.078, 0.092, tr));
    L.push(limb([-0.13, 0.07, -0.4], [-0.13, 0.09, 0.03], 0.058, 0.075, tr)); L.push(limb([-0.13, 0.09, 0.03], [-0.1, 0.52, -0.12], 0.078, 0.092, tr));
    L.push(box([0.14, 0.035, 0.22], 0.095, 0.07, 0.25, '#2a2622')); L.push(box([-0.13, 0.06, -0.43], 0.095, 0.12, 0.09, '#2a2622'));
    L.push(ball([0.14, 0.5, 0.25], 0.08, tr)); L.push(ball([0, 0.52, -0.12], 0.17, tr, [1.1, 0.8, 0.9], 6, 4));
    L.push(limb([0, 0.5, -0.12], [0, 1.0, 0.03], 0.175, 0.2, vest, 8)); L.push(ball([0, 1.0, 0.03], 0.2, vest, [1.08, 0.5, 0.75], 6, 4));
    for (const s of [1, -1]) arm(L, s, [0.21, 0.97, 0.03], [0.21, 0.9, 0.26], [0.075, 1.13, 0.3], shirt, SKIN, 0.046);
    head(L, 1.17, 0.1, { cap: '#22262b' });
    L.push(box([0, 1.155, 0.275], 0.155, 0.105, 0.085, '#16171a'));
    L.push(prep(new THREE.CylinderGeometry(0.045, 0.04, 0.14, 8).rotateX(Math.PI / 2).translate(0, 1.15, 0.385), '#0e0f11'));
    L.push(disc([0, 1.15, 0.457], 0.036, 0.004, '#4a5a78', Math.PI / 2, 8));
  }
  function assistant(L) {
    man(L, { trousers: '#4a5a78', top: '#c9c2b2', head: { long: true },
      armR: [[0.235, 1.43, 0], [0.33, 1.32, 0.22], [0.43, 1.46, 0.4]], armL: [[0.235, 1.43, 0], [0.33, 1.32, 0.22], [0.43, 1.46, 0.4]] });
    const rx = Math.PI / 2 - 0.28;
    L.push(disc([0, 1.52, 0.45], 0.5, 0.016, SILVER, rx, 14));
    L.push(prep(new THREE.TorusGeometry(0.5, 0.014, 3, 14).rotateX(-0.28).translate(0, 1.52, 0.45), '#2a2c2e'));
  }
  function stroller(L, rand) {
    const coat = rand.pick(['#8a6f52', '#4d5d6e', '#7a2f3a', '#3f5a4a', '#b9a078']), accent = rand.pick(['#c9462e', '#e8dcc0', '#3a5a8a', '#d9a21e']);
    legs(L, 0.9, rand.pick(['#2a2c33', '#3a3a3a', '#4a5a78']));
    L.push(lathe([[0.205, 0.6], [0.2, 0.9], [0.185, 1.12], [0.212, 1.33], [0.198, 1.43], [0.1, 1.49], [0.05, 1.51]], coat, 10, 0.64, (x, y) => 0.2 * Math.max(0, 1 - (y - 0.6) / 0.4)));
    for (const s of [1, -1]) arm(L, s, [0.232, 1.42, 0], [0.275, 1.16, -0.02], [0.215, 0.93, 0.08], coat, coat);
    L.push(prep(new THREE.CylinderGeometry(0.078, 0.092, 0.075, 8).translate(0, 1.49, 0.005), accent));
    head(L, 1.655, 0, rand() < 0.5 ? { hat: '#d9c08a' } : { long: rand() < 0.6 });
  }
  function elder(L) {
    man(L, { trousers: '#4a4a48', top: '#39424e', head: { hair: '#b9b6ae', cap: '#5a5a55' }, armR: [[0.235, 1.43, 0], [0.27, 1.16, 0.1], [0.27, 0.9, 0.3]] });
    // stoop: lean everything above the hips forward
    for (const g of L) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.9) { const k = y - 0.9; p.setZ(i, p.getZ(i) + k * k * 0.42); p.setY(i, y - k * 0.06); } }
    }
    L.push(limb([0.29, 0.0, 0.42], [0.27, 0.9, 0.3], 0.012, 0.012, '#4a3220', 5));
    L.push(limb([0.27, 0.9, 0.24], [0.27, 0.905, 0.36], 0.014, 0.014, '#4a3220', 5));
  }

  /** place a finished person: local +Z is the facing direction */
  function place(L, x, z, rot, scale = 1, r = 0.35) {
    const g = G.merge(L);
    const y = standY(x, z);
    g.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _q.setFromAxisAngle(UP, rot), new THREE.Vector3(scale, scale, scale)));
    all.push(g);
    ctx.collision.addCircle(x, z, r, 'figure');
    people++;
  }
  /** the train of the gown: a narrow pleated fan trailing behind the bride over the real ground */
  function train(x, z, rot, len) {
    const A = 11, R = 5, SPAN = 1.8, HEM = 0.6, pos = [], uv = [], idx = [], y0 = standY(x, z), c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < A; i++) for (let k = 0; k < R; k++) {
      const th = ((i / (A - 1)) - 0.5) * SPAN, f = k / (R - 1);
      // full length only straight behind; at the edges of the fan it is back at the hem of the skirt
      const far = HEM + 0.03 + (len - HEM) * Math.max(0, Math.cos((th / SPAN) * Math.PI)) ** 1.5, rad = 0.46 + (far - 0.46) * f;
      const lx = Math.sin(th) * rad, lz = -Math.cos(th) * rad;
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      // radial pleats: every other spoke is a ridge, flattening out toward the end of the train
      const pleat = (i % 2 ? 0.075 : 0) * Math.sin(Math.PI * Math.min(1, f * 1.15)) ** 0.8 * Math.min(1, (far - HEM) / 0.5);
      const lift = 0.34 * (1 - f) ** 2.2 + 0.02 + pleat;
      pos.push(wx, (k === 0 ? y0 : Math.max(standY(wx, wz), y0 - 0.25)) + lift, wz);
      uv.push(0.25 + 0.75 * f, 0);
    }
    for (let i = 0; i < A - 1; i++) for (let k = 0; k < R - 1; k++) { const a = i * R + k, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g = g.toNonIndexed();
    // shade the valleys a little so the pleats read in flat light
    const P = g.attributes.position, n = P.count, col = new Float32Array(n * 3);
    _c.set(GOWN);
    for (let i = 0; i < n; i++) {
      const h = P.getY(i) - y0, k = 0.86 + 0.14 * Math.min(1, Math.max(0, (h - 0.02) / 0.07));
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    all.push(g);
  }

  // ---- where people can stand ---------------------------------------------------------------------------------------------
  // The coast package (created before this one) puts rocks and shelves on the reef that heightAt knows nothing about:
  // find their tops with a ray so that nobody kneels inside a boulder. Without a coast module this is just groundY.
  const solids = [];
  const coast = ctx.scene.getObjectByName('coast');
  if (coast) {
    coast.updateMatrixWorld(true);
    coast.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position && /rock|reef|boulder|shelf|stone/i.test(`${o.name} ${o.material?.name || ''}`)) solids.push(o); });
  }
  const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), hits = [];
  const topCache = new Map();
  function standY(x, z) {
    const g = S.groundY(x, z);
    if (!solids.length) return g;
    const surf = ctx.world.surfaceAt(x, z);
    if (surf !== 'rock' && surf !== 'sand' && surf !== 'water') return g;
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    let y = topCache.get(key);
    if (y !== undefined) return y;
    y = g;
    try {
      hits.length = 0;
      ray.set(_v.set(x, g + 5, z), DOWN); ray.far = 6.5;
      ray.intersectObjects(solids, false, hits);
      for (const h of hits) if (h.point.y > y) y = h.point.y;
    } catch { /* a mesh that cannot be ray-tested: keep the terrain height */ }
    topCache.set(key, y);
    return y;
  }
  const _r = {};
  /** how bad a spot is for a crew member (0 = fine): camera spots, solid things, water, steps in the ground */
  function badness(x, z, refY, deepRoad = false) {
    let bad = 0;
    for (const id in MAP.views) { const v = MAP.views[id]; if (Math.hypot(v.x - x, v.z - z) < 3.6) bad += 4; }
    if (ctx.collision.resolve(x, z, 0.75, _r).hit) bad += 3;
    const surf = ctx.world.surfaceAt(x, z);
    if (surf === 'water') bad += 6;
    const g = S.groundY(x, z);
    let lump = 0;
    for (const [dx, dz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) lump = Math.max(lump, Math.abs(standY(x + dx, z + dz) - g));
    if (lump > 0.12) bad += 1 + lump * 4;                 // on or against a rock
    if (Math.abs(g - refY) > 0.6) bad += 2;              // well above or below the couple
    if (deepRoad && ctx.world.onRoad(x, z, -1.5)) bad += 0.6;   // the reflector holder keeps to the kerb side of the lane
    return bad;
  }

  for (const f of MAP.figures) {
    const rand = rng.makeRng(`life:figure:${f.id}`);
    cells.set(f.id, (all = []));
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    const W = (lx, lz) => [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
    if (f.kind === 'wedding') {
      // keep the crew out of the named camera spots (and the spawn point): try the mirrored arrangement first
      const flip = rand() < 0.5 ? 1 : -1;
      const refY = S.groundY(f.x, f.z);
      const pick = (cands, deepRoad) => {
        let best = null, bb = Infinity;
        for (let i = 0; i < cands.length; i++) { const w = W(cands[i][0], cands[i][1]), b = badness(w[0], w[1], refY, deepRoad) + i * 0.01; if (b < bb) { bb = b; best = w; } if (b < 0.5) break; }
        return best;
      };
      let L = [];
      const [bx, bz] = W(-0.3 * flip, 0), brot = f.rot + 0.22 * flip;
      if (f.dress === 'red') { brideRed(L); place(L, bx, bz, brot, 0.99 + 0.03 * rand(), 0.35); }
      else { brideWhite(L); place(L, bx, bz, brot, 0.99 + 0.03 * rand(), 0.55); train(bx, bz, brot - 0.3 * flip, 1.9 + 0.5 * rand()); }
      L = [];
      const near = [[0.235, 1.43, 0], [0.3, 1.17, 0.07], [0.2, 1.06, 0.2]];
      man(L, { trousers: SUIT, top: SUIT, shirt: '#f4f1ea', tie: f.dress === 'red' ? '#8a1a16' : '#3a3f4a', [flip > 0 ? 'armL' : 'armR']: near });
      const [gx, gz] = W(0.34 * flip, -0.03);
      place(L, gx, gz, f.rot - 0.18 * flip, 1.0 + 0.03 * rand());
      L = []; photographer(L);
      const [px, pz] = pick([[0.35 * flip, 5.0], [-1.6 * flip, 5.6], [1.8 * flip, 5.6], [-0.8 * flip, 4.3], [1.3 * flip, 4.4], [0.2 * flip, 6.4], [-2.8 * flip, 6.2], [2.9 * flip, 6.2], [0.3 * flip, 3.7], [0.3 * flip, 8], [-1.9 * flip, 3.9], [2.2 * flip, 4.0]]);
      place(L, px, pz, Math.atan2(f.x - px, f.z - pz), 1.0, 0.42);
      L = []; assistant(L);
      const [ax, az] = pick([[-2.5 * flip, 2.7], [2.5 * flip, 2.7], [-3 * flip, 1.2], [3 * flip, 1.2], [-2.2 * flip, 3.7], [2.2 * flip, 3.7], [-3.6 * flip, 2.2], [3.6 * flip, 2.2],
        [-3.2 * flip, 0.45], [3.2 * flip, 0.45], [-2.6 * flip, 0.3], [2.6 * flip, 0.3]], true);
      place(L, ax, az, Math.atan2(f.x - ax, f.z - az), 0.94 + 0.04 * rand());
    } else if (f.kind === 'elder') {
      const L = []; elder(L); place(L, f.x, f.z, f.rot, 0.95);
    } else {
      const L = []; stroller(L, rand); place(L, f.x, f.z, f.rot, 0.96 + 0.07 * rand());
    }
  }

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'life:figures';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: S.U.uTime, uWind: S.U.uWind });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uWind;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        {
          float fPh = position.x * 2.3 + position.z * 1.9 + position.y * 1.1;
          transformed.xz += uWind.xz * uv.x * ( 0.07 + 0.06 * sin( uTime * 1.9 + fPh ) + 0.025 * sin( uTime * 4.7 + fPh * 2.3 ) );
          transformed.y += uv.x * 0.012 * length( uWind ) * sin( uTime * 3.1 + fPh * 1.7 );
        }`);
  };
  mat.customProgramCacheKey = () => 'life:figures:v1';
  const meshes = [];
  for (const list of cells.values()) {
    const geo = G.merge(list);
    tris += geo.attributes.position.count / 3;
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'life:figures'; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    S.group.add(mesh); meshes.push(mesh);
  }
  cells.clear();

  return {
    stats: { people, tris, meshes: meshes.length },
    update() {
      const cam = ctx.camera.position, sd = Math.min(ctx.quality.shadowDistance, 60);
      for (const m of meshes) { const b = m.geometry.boundingSphere, d = b.center.distanceTo(cam) - b.radius; m.visible = d < 230; m.castShadow = d < sd; }
    },
    dispose() { for (const m of meshes) { S.group.remove(m); m.geometry.dispose(); } mat.dispose(); ctx.collision.removeTag('figure'); },
  };
}
