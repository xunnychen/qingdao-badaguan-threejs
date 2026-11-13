// Terrain height + coast geometry. Pure JS, no three.js. THE single source of truth for ground level.
// Axes: +x = east, +z = SOUTH (toward the sea), +y = up. Units: metres. Sea level y = 0.
//
// Two hand-authored polylines (both sorted by ascending x, single-valued in x) define the coast:
//   WATERLINE  y = 0 contour (mean sea level)
//   BACKLINE   the 3.5 m coast path: seawall promenade (x -250..70) then the wooden boardwalk (x 70..250),
//              continued outside the playable area as a line ~15 m inland of the water.
// Between them is the shore zone (sand on the beach section, sloping rock elsewhere). Inland of BACKLINE the
// land rises 5 % with distance from the coast, so every street slopes gently toward the sea.
import { valueNoise2, clamp, lerp, smoothstep } from '../core/rng.js';

export const SEA_LEVEL = 0;
export const PROM_Y = 3.5;        // promenade / boardwalk ground level
export const HALF_PROM = 2.5;     // half width of the flat coast-path strip
export const SAND_TOP = 1.6;      // sand level at the foot of the seawall
export const SEAWALL_W = 0.6;     // horizontal width of the seawall drop
export const STEP_RUN = 4.0;      // horizontal run of the stairs from promenade to sand
export const BOARD_HALF_SEA = 0.9; // boardwalk: the flat strip is only this wide on the seaward side (the deck overhangs)
export const BOARD_DROP = 0.6;    // ... and the rock falls this far within 1.2 m beyond it, so the walk reads as raised

// prettier-ignore
export const WATERLINE = [
  [-1200,150],[-900,200],[-760,300],[-680,440],[-600,540],[-520,560],[-460,520],[-430,430],[-380,330],[-330,230],[-290,172],
  [-250,146],[-231,132],[-162,104],[-92,100],[-38,113],[-6,130],[22,150],[46,168],[66,182],[88,186],[106,176],[120,158],[143,128],
  [186,84],[235,28],[250,10],
  [290,-12],[330,0],[370,45],[420,70],[470,150],[540,200],[600,300],[680,420],[760,500],[800,300],[860,-100],[1000,-400],
];
// prettier-ignore
export const BACKLINE = [
  [-1200,132],[-895,182],[-748,288],[-666,430],[-596,522],[-524,542],[-476,508],[-446,424],[-396,326],[-346,238],[-304,180],
  [-250,140],[-199,88],[-132,77],[-48,63],[-14,63],[45,105],[56,124],[70,149],
  [104,144],[124,127],[143,98],[186,59],[199,35],[250,-8],
  [288,-30],[332,-18],[382,30],[428,52],[486,138],[552,186],[616,290],[694,408],[752,476],[786,300],[845,-100],[985,-400],
];
/** x-range of BACKLINE that is the paved seawall promenade (sand below it) */
export const PROMENADE_X = [-250, 70];
/** x-range of BACKLINE that carries the wooden boardwalk (rock below it) */
export const BOARDWALK_X = [70, 250];
/** Stairs from the promenade down to the sand: points on BACKLINE. */
export const BEACH_STEPS = [[-199, 88], [-90, 70], [-14, 63], [50, 113.6]];

// Knoll under 花石楼 and far-field hills (outside the playable area; silhouettes only).
const KNOLL = { x: 102, z: 113, h: 1.6, r: 20 };
const HILLS = [
  { x: -60, z: -820, h: 95, r: 230 },  // 太平山 (north)
  { x: -560, z: 430, h: 26, r: 75 },   // 汇泉角 (south-west headland)
  { x: 640, z: 330, h: 14, r: 70 },    // 太平角 capes (east / south-east)
  { x: 520, z: -60, h: 10, r: 110 },   // 太平角 park rise
];

let _px = 0, _pz = 0; // nearest point scratch

/** 1 along the timber boardwalk (x of the nearest BACKLINE point), 0 on the granite promenade and in the far field. */
export function boardness(px) {
  return px <= 74 || px >= 290 ? 0 : smoothstep(74, 84, px) * (1 - smoothstep(280, 290, px));
}

function polyZ(pts, x) {
  const n = pts.length;
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= x) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
}

/** Unsigned distance from (x,z) to an open polyline [[x,z],...]. Nearest point left in _px,_pz. */
function polyDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    // cheap reject: segment bbox farther than current best
    if (best < Infinity) {
      const r = Math.sqrt(best);
      if ((ax < bx ? ax : bx) - r > x || (ax > bx ? ax : bx) + r < x) continue;
    }
    const dx = bx - ax, dz = bz - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t, qz = az + dz * t;
    const d = (x - qx) * (x - qx) + (z - qz) * (z - qz);
    if (d < best) { best = d; _px = qx; _pz = qz; }
  }
  return Math.sqrt(best);
}

/** Signed distance (m) to the waterline: > 0 on land, < 0 at sea. */
export function shoreDist(x, z) {
  const d = polyDist(WATERLINE, x, z);
  return z < polyZ(WATERLINE, x) ? d : -d;
}

/** Signed distance (m) to the coast path centre line (BACKLINE): > 0 inland, < 0 on the seaward side. */
export function backDist(x, z) {
  const d = polyDist(BACKLINE, x, z);
  return z < polyZ(BACKLINE, x) ? d : -d;
}

/** Like backDist but also returns the nearest point on BACKLINE: {b, x, z}. */
export function backInfo(x, z, out = {}) {
  const d = polyDist(BACKLINE, x, z);
  out.b = z < polyZ(BACKLINE, x) ? d : -d; out.x = _px; out.z = _pz;
  return out;
}

/** 1 where the shore below the coast path is sandy beach (第二海水浴场), 0 where it is rock. Arg: x of nearest BACKLINE point. */
export function beachness(px) {
  return smoothstep(-249, -234, px) * (1 - smoothstep(54, 70, px));
}

// Stair frames. Each flight is a rectangle in its own frame: origin on BACKLINE, u along the seaward axis f (the
// segment normal, or the bisector of the two normals when the stair sits on a polyline vertex), w across it.
// The terrain package builds the visible flights from the same numbers (src/modules/terrain/promenade.js):
//   landing (flat, PROM_Y) for u < d0, 12 steps from d0 to d1, half width hw, cheek walls 0.35 m outside +-hw.
export const STEP_OPEN_HALF = 2.2;  // half width of the gap in the seawall parapet, measured along the centre line
export const STEP_CHEEK = 0.35;     // thickness of the cheek walls beside each flight
export const BEACH_STAIRS = BEACH_STEPS.map(([sx, sz]) => {
  let fx = 0, fz = 1, phi = 0;
  const vi = BACKLINE.findIndex((p) => Math.hypot(p[0] - sx, p[1] - sz) < 0.4);
  const nrm = (i) => { const dx = BACKLINE[i + 1][0] - BACKLINE[i][0], dz = BACKLINE[i + 1][1] - BACKLINE[i][1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
  if (vi > 0 && vi < BACKLINE.length - 1) {
    const a = nrm(vi - 1), b = nrm(vi);
    fx = -a[1] - b[1]; fz = a[0] + b[0];
    const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    phi = Math.max(0, Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) / 2);
  } else {
    for (let i = 0; i < BACKLINE.length - 1; i++) {
      const d = nrm(i), t = (sx - BACKLINE[i][0]) * d[0] + (sz - BACKLINE[i][1]) * d[1];
      const L = Math.hypot(BACKLINE[i + 1][0] - BACKLINE[i][0], BACKLINE[i + 1][1] - BACKLINE[i][1]);
      const off = Math.abs((sx - BACKLINE[i][0]) * -d[1] + (sz - BACKLINE[i][1]) * d[0]);
      if (t > 0 && t < L && off < 0.5) { fx = -d[1]; fz = d[0]; break; }
    }
  }
  const cosP = Math.cos(phi), tanP = Math.tan(phi);
  const hw = (STEP_OPEN_HALF - HALF_PROM * tanP) * cosP;
  return { x: sx, z: sz, fx, fz, phi, hw, d0: HALF_PROM / cosP + hw * tanP, d1: (HALF_PROM + STEP_RUN) / cosP };
});

let _su = 0; // u of the last stairAt hit
/** The stair whose flight (plus cheek walls and a 2 m run-out on the sand) contains (x,z), or null. Leaves u in _su. */
function stairAt(x, z) {
  for (let i = 0; i < BEACH_STAIRS.length; i++) {
    const S = BEACH_STAIRS[i], dx = x - S.x, dz = z - S.z;
    if (dx * dx + dz * dz > 100) continue;
    const u = dx * S.fx + dz * S.fz;
    if (u < 0 || u > S.d1 + 2) continue;
    const w = dx * S.fz - dz * S.fx;
    if (w < -S.hw - STEP_CHEEK || w > S.hw + STEP_CHEEK) continue;
    _su = u;
    return S;
  }
  return null;
}

/**
 * Ground height in metres at world (x,z). Defined for ANY x,z (far field included).
 * Negative values are sea bed (water surface is y = 0). Deterministic, allocation-free, ~1 µs.
 * The seawall is a 0.6 m wide ramp from 3.5 m to 1.6 m in this function (a wall mesh hides it); at the four
 * BEACH_STEPS it is a 4 m long walkable ramp instead.
 */
export function heightAt(x, z) {
  const s = shoreDist(x, z);
  const bd = polyDist(BACKLINE, x, z);
  const px = _px, pz = _pz;
  const b = z < polyZ(BACKLINE, x) ? bd : -bd;

  // the boardwalk deck overhangs the rock on its seaward side: narrower flat strip there
  const bw = b < 0 ? boardness(px) : 0;
  const halfSea = HALF_PROM - (HALF_PROM - BOARD_HALF_SEA) * bw;
  if (b >= -halfSea) {
    if (b <= HALF_PROM) return PROM_Y;
    const d = b - HALF_PROM;
    let h = PROM_Y + (d < 300 ? 0.05 * d : 15 + 0.02 * (d - 300));
    const w = smoothstep(0, 30, d);
    // rolling ground: west rise around 韶关路 / 公主楼, soft undulation
    h += 2.0 * smoothstep(-100, -190, x) * smoothstep(10, 80, d) * (1 - smoothstep(-330, -420, x));
    h += (valueNoise2(x * 0.016 + 11.3, z * 0.016 - 4.1, 7) - 0.5) * 0.7 * w;
    // 花石楼 knoll
    const kx = x - KNOLL.x, kz = z - KNOLL.z;
    h += KNOLL.h * Math.exp(-(kx * kx + kz * kz) / (2 * KNOLL.r * KNOLL.r)) * smoothstep(0, 8, d);
    // far-field hills, zero inside the playable area
    const far = Math.max(smoothstep(-235, -330, z), smoothstep(260, 340, Math.abs(x)));
    if (far > 0) {
      for (let i = 0; i < HILLS.length; i++) {
        const H = HILLS[i], hx = x - H.x, hz = z - H.z;
        h += far * H.h * Math.exp(-(hx * hx + hz * hz) / (2 * H.r * H.r)) * smoothstep(0, 40, d);
      }
    }
    return h;
  }

  const beach = beachness(px);
  if (s > 0) {
    const e = -b - halfSea; // metres seaward of the strip edge
    // rocky profile: concave slope with lumpy rock
    const tr = s / (s + e);
    let h = PROM_Y * Math.pow(tr, 0.7);
    h += (valueNoise2(x * 0.11, z * 0.11, 3) - 0.45) * 1.6 * Math.sin(Math.PI * tr) * (1 - beach);
    if (bw > 0) h -= BOARD_DROP * bw * smoothstep(0, 1.2, e) * smoothstep(0, 0.5, tr);
    if (beach > 0) {
      let hb;
      if (e < SEAWALL_W) hb = lerp(PROM_Y, SAND_TOP, smoothstep(0, SEAWALL_W, e));
      else { const tt = s / (s + (e - SEAWALL_W)); hb = SAND_TOP * Math.pow(tt, 0.85); }
      const S = stairAt(x, z);
      if (S) {
        const u = _su;
        if (u <= S.d0) hb = PROM_Y;
        else if (u <= S.d1) hb = lerp(PROM_Y, SAND_TOP, (u - S.d0) / (S.d1 - S.d0));
        else hb = lerp(SAND_TOP, Math.min(hb, SAND_TOP), (u - S.d1) / 2);
      }
      h = lerp(h, hb, beach);
    }
    return h < 0.001 ? 0.001 : h;
  }

  // sea bed
  const a = -s, D = 14, k = lerp(0.14, 0.04, beach);
  return -D * (1 - Math.exp((-k * a) / D));
}

/** Unit ground normal (finite differences). Returns [nx, ny, nz] in `out`. */
export function normalAt(x, z, out = [0, 1, 0]) {
  const e = 0.6;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  return out;
}

/** Ground slope as rise/run (0 = flat). */
export function slopeAt(x, z) {
  const e = 0.6;
  const hx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const hz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(hx, hz);
}

export { clamp, lerp, smoothstep };
