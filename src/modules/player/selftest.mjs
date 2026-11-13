// Node self-test of the walking maths against the real world plan + core collision:
//   node src/modules/player/selftest.mjs
import { createCollision, MAX_WADE_DEPTH } from '../../core/collision.js';
import { world } from '../../world/query.js';
import { MAP } from '../../world/map.js';
import { makeRng } from '../../core/rng.js';
import { createWalker, resetWalker, createStepper, WALK_SPEED, BRISK_SPEED, BOB_MAX } from './motion.js';

const collision = createCollision();
const step = createStepper({ world, collision, walk: MAP.WALK });
const DT = 1 / 60;
const st2 = {};
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${info}`); if (!ok) fails++; };
const rad = (d) => (d * Math.PI) / 180;

function run(w, secs, yawDeg, { f = 1, r = 0, brisk = 0, dt = DT } = {}) {
  const s = { steps: 0, dist: 0, maxBob: 0, maxSpeed: 0, edge: false, steep: false, blocked: false, maxDepth: 0, surfaces: new Set() };
  for (let t = 0; t < secs; t += dt) {
    const x = w.x, z = w.z;
    step(w, f, r, brisk, rad(yawDeg), dt, t);
    const d = Math.hypot(w.x - x, w.z - z);
    s.dist += d; s.maxSpeed = Math.max(s.maxSpeed, d / dt); s.maxBob = Math.max(s.maxBob, Math.abs(w.bob));
    if (w.stepped) s.steps++;
    s.edge ||= w.edge; s.steep ||= w.steep; s.blocked ||= w.blocked; s.maxDepth = Math.max(s.maxDepth, w.depth);
    s.surfaces.add(w.surface);
    if (!isFinite(w.x + w.y + w.z + w.bob + w.sway)) throw new Error('NaN');
  }
  return s;
}
const at = (x, z) => resetWalker(createWalker(), x, z, world);

// 1 stroll along 居庸关路
{
  const sp = MAP.spawn, w = at(sp.x, sp.z), s = run(w, 20, sp.yaw);
  check('stroll speed', s.maxSpeed <= WALK_SPEED + 1e-6 && s.dist > 20 && s.dist < 34.1, `dist ${s.dist.toFixed(1)} m max ${s.maxSpeed.toFixed(2)}`);
  check('stride 0.72 m', Math.abs(s.dist / s.steps - 0.72) < 0.05, `${(s.dist / s.steps).toFixed(3)} m/step, ${s.steps} steps`);
  check('bob <= 2.5 cm peak to peak', s.maxBob <= BOB_MAX && s.maxBob > 0.008, `${(s.maxBob * 100).toFixed(2)} cm`);
  const s2 = run(w, 3, sp.yaw, { f: 0 });
  check('stops', w.speed === 0 && !w.moving && s2.dist < 0.4, `glide ${s2.dist.toFixed(2)} m, bob ${(w.bob * 1000).toFixed(1)} mm`);
}
// 2 brisk
{
  const sp = MAP.spawn, w = at(sp.x, sp.z), s = run(w, 10, sp.yaw, { brisk: 1 });
  check('brisk speed', s.maxSpeed <= BRISK_SPEED + 1e-6 && s.maxSpeed > 4, `max ${s.maxSpeed.toFixed(2)} dist ${s.dist.toFixed(1)}`);
  check('brisk stride', s.dist / s.steps > 0.95 && s.dist / s.steps < 1.12, `${(s.dist / s.steps).toFixed(3)}`);
  check('brisk bob', s.maxBob <= BOB_MAX, `${(s.maxBob * 100).toFixed(2)} cm`);
  const d = at(sp.x, sp.z), sd = run(d, 5, sp.yaw, { f: 1, r: 1 });
  check('diagonal not faster', sd.maxSpeed <= WALK_SPEED + 1e-6, sd.maxSpeed.toFixed(3));
}
// 3 frame-rate independence
{
  const sp = MAP.spawn, a = at(sp.x, sp.z), b = at(sp.x, sp.z);
  const sa = run(a, 8, sp.yaw, { dt: 1 / 144 }), sb = run(b, 8, sp.yaw, { dt: 1 / 20 });
  check('dt independent', Math.abs(sa.dist - sb.dist) < 0.35, `${sa.dist.toFixed(2)} vs ${sb.dist.toFixed(2)}`);
}
// 4 beach stairs both ways, seawall face blocks
for (const [sx, sz] of MAP.coast.beachSteps) {
  // seaward = down the gradient of the signed distance to the coast path
  const gx = world.backDist(sx + 0.5, sz) - world.backDist(sx - 0.5, sz), gz = world.backDist(sx, sz + 0.5) - world.backDist(sx, sz - 0.5);
  const sea = (Math.atan2(-gx, gz) * 180) / Math.PI;
  const w = at(sx, sz);
  const s = run(w, 6, sea);
  check(`stairs down (${sx},${sz})`, w.y < 1.75 && w.y > -0.1 && !s.steep, `y ${w.y.toFixed(2)} surface ${w.surface} steep ${s.steep}`);
  const u = run(w, 8, sea + 180);
  check(`stairs up   (${sx},${sz})`, w.y > 3.4 && !u.steep, `y ${w.y.toFixed(2)} at ${w.x.toFixed(1)},${w.z.toFixed(1)}`);
}
{
  const w = at(-60, 100); // on the sand; walk north into the seawall
  const y0 = w.y, s = run(w, 40, 0);
  check('seawall blocks from the sand', w.y < 2.2 && s.steep, `start y ${y0.toFixed(2)} end y ${w.y.toFixed(2)} at z ${w.z.toFixed(1)}`);
}
// 5 wading
{
  const w = at(-40, 100), s = run(w, 60, 180);
  check('wade limit', s.maxDepth <= MAX_WADE_DEPTH + 1e-6 && s.maxDepth > 0.3 && s.blocked && !s.edge, `depth ${s.maxDepth.toFixed(3)} z ${w.z.toFixed(1)} surf ${[...s.surfaces]}`);
  const sp0 = w.speed; run(w, 2, 0);
  check('wading is slow', w.speed < WALK_SPEED * 0.9 || w.depth === 0, `speed ${w.speed.toFixed(2)} depth ${w.depth.toFixed(2)} (was ${sp0.toFixed(2)})`);
}
// 6 edge of the playable area
{
  let z0 = null;
  for (let z = -200; z < 60 && z0 == null; z += 0.5) if (world.surfaceAt(-238, z) === 'road' && world.surfaceAt(-245, z) === 'road') z0 = z;
  const w = at(-238, z0), s = run(w, 12, 270, { brisk: 1 });
  check('west edge', s.edge && Math.abs(w.x - MAP.WALK.minX) < 0.05, `x ${w.x.toFixed(2)} z ${w.z.toFixed(1)} edge ${s.edge}`);
}
// 7 nobody gets stuck: random wanderers, then each must still be able to move
{
  const rng = makeRng('player:selftest');
  let stuck = 0, n = 0, wet = 0, far = 0; const worst = [];
  const starts = Object.values(MAP.views).filter((v) => !v.h || v.h < 3).map((v) => [v.x, v.z]);
  for (const st of MAP.coast.beachSteps) starts.push(st);
  for (let x = -230; x <= 230; x += 46) for (const z of [60, 80, 100, 120, 140]) if (collision.walkable(x, z)) starts.push([x, z]);
  for (const [x, z] of starts) {
    collision.resolve(x, z, 0.35, st2);
    const w = at(st2.x, st2.z);
    for (let leg = 0; leg < 24; leg++) run(w, 4 + rng() * 6, rng() * 360, { brisk: rng() < 0.5 ? 1 : 0, dt: 1 / 30 });
    n++;
    if (w.depth > 0) wet++;
    let best = 0;
    for (let a = 0; a < 360; a += 30) { const c = Object.assign(createWalker(), w); const s = run(c, 4, a, { dt: 1 / 30 }); best = Math.max(best, Math.hypot(c.x - w.x, c.z - w.z)); }
    if (best < 1.5) { stuck++; worst.push(`${w.x.toFixed(1)},${w.z.toFixed(1)} y ${w.y.toFixed(2)} ${w.surface} best ${best.toFixed(2)}`); }
    if (!collision.walkable(w.x, w.z)) far++;
  }
  check('no stuck wanderers', stuck === 0 && far === 0, `${n} walkers, ${wet} ended wading, stuck ${stuck} ${worst.join(' | ')}`);
}
// 8 cost
{
  const sp = MAP.spawn, w = at(sp.x, sp.z), N = 200000, t0 = performance.now();
  for (let i = 0; i < N; i++) step(w, 1, 0.2, i & 1024 ? 1 : 0, i * 0.0005, DT, i * DT);
  const us = ((performance.now() - t0) / N) * 1000;
  check('step cost', us < 60, `${us.toFixed(2)} us per step`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
