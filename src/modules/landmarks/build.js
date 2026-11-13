// Builds every landmark into one Builder (pure geometry, no DOM: also runs under Node for offline checks).
// Material keys: clusters 'e:' (花石楼, east) and 'w:' (the four western landmarks) + global 'glass', 'lit', 'text'.
import { Builder, mul, site } from './kit.js';
import { buildHuashilou } from './huashilou.js';
import { buildGongzhulou } from './gongzhulou.js';
import { buildHudielou } from './hudielou.js';
import { buildYuanshuailou } from './yuanshuailou.js';
import { buildBinguan } from './binguan.js';

export const GLOBAL_KEYS = ['glass', 'lit', 'text', 'water'];
const BUILDERS = { huashilou: buildHuashilou, gongzhulou: buildGongzhulou, hudielou: buildHudielou, yuanshuailou: buildYuanshuailou, binguan: buildBinguan };
/** canvas atlas layout for the name boulders: one row per landmark */
export const TEXT_ROWS = 5;

/** env: { map, heightAt, makeRng, collision (optional) } -> { geos: Map<key, BufferGeometry>, stats } */
export function buildAll(env) {
  const B = new Builder(GLOBAL_KEYS);
  const stats = {};
  env.map.landmarks.forEach((L, row) => {
    const fn = BUILDERS[L.id];
    if (!fn) return;
    const before = B.tris();
    B.prefix = L.id === 'huashilou' ? 'e:' : 'w:';
    const info = fn(B, L, env) || {};
    nameBoulder(B, L, env, row, info);
    stats[L.id] = B.tris() - before;
  });
  return { geos: B.finish(), stats, total: B.tris(), flags: B.flags };
}

/** granite name boulder just inside the gate, beside the path, with the engraved red name facing the gate */
function nameBoulder(B, L, env, row, info) {
  const S = site(L, 0, env.heightAt), g = L.gate;
  // gate in local coordinates (on the +Z axis)
  const dx = g.x - L.x, dz = g.z - L.z, c = Math.cos(L.rot), s = Math.sin(L.rot);
  const gz = dx * s + dz * c, gx = dx * c - dz * s;
  const n = L.name.length, w = 0.62 * n + 0.75, hw = w / 2;
  let side = L.id === 'gongzhulou' || L.id === 'yuanshuailou' ? -1 : 1, lx = 0, lz = 0;
  for (let tries = 0; tries < 2; tries++) {
    lx = gx + side * (1.5 + hw + 0.45); lz = gz - 4.4;
    // shallow plot: keep at least 2 m between the stone and the house front (it would sit under a window otherwise)
    if (info.clear != null && lz < info.clear + 2.1) lz = Math.min(gz - 2.3, info.clear + 2.1);
    const wx = S.wx(lx, lz), wz = S.wz(lx, lz);
    if (!env.map.trees.some((t) => Math.hypot(t.x - wx, t.z - wz) < hw + 0.9)) break;
    side = -side;
  }
  const wx = S.wx(lx, lz), wz = S.wz(lx, lz), gy = Math.min(S.gy(lx, lz), S.gy(lx - hw, lz), S.gy(lx + hw, lz));
  B.rng = env.makeRng(`landmarks:boulder:${L.id}`);
  B.frame(wx, gy, wz, L.rot - side * 0.38, () => {
    const tone = L.id === 'huashilou' ? [1.0, 0.93, 0.86] : [0.97, 0.95, 0.92];
    B.rock('stone', 0, 0.42, 0, hw, 0.62, 0.36, row * 7.3 + 1.7, (x, y) => mul(tone, 0.55 + 0.45 * Math.min(1, Math.max(0, (y + 0.05) / 0.5))), { power: 4.2, amp: 0.07, detail: 2 });
    B.rock('stone', -hw * 0.75, 0.05, 0.3, 0.42, 0.26, 0.3, row * 3.1 + 9, mul(tone, 0.85), { power: 2.4, amp: 0.2 });
    B.rock('stone', hw * 0.9, 0.02, -0.1, 0.36, 0.22, 0.3, row * 5.3 + 4, mul(tone, 0.85), { power: 2.4, amp: 0.2 });
    // engraved name (decal quad just proud of the front face)
    const tw = 0.62 * n, th = 0.62, y0 = 0.42 - th / 2 + 0.04, z = 0.36 * 1.04 + 0.012;
    const v0 = 1 - (row + 1) / TEXT_ROWS, v1 = 1 - row / TEXT_ROWS, u1 = n / 5;
    B.poly('text', [[-tw / 2, y0, z], [tw / 2, y0, z], [tw / 2, y0 + th, z], [-tw / 2, y0 + th, z]], [1, 1, 1],
      { uvf: (p) => [((p[0] + tw / 2) / tw) * u1, v0 + ((p[1] - y0) / th) * (v1 - v0)] });
  });
  if (env.collision) env.collision.addCircle(wx, wz, Math.min(1.1, hw * 0.75), `landmark:${L.id}`);
}
