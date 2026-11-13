// THE WORLD PLAN for 青岛八大关. Pure data + pure JS (no three.js, no DOM): also runs under Node (npm run check:map).
// Every feature module reads this; nobody but core edits it. Everything here is deterministic.
//
// Axes: +x = east, +z = SOUTH (sea), +y = up; metres. Playable area x in [-250,250], z in [-225, sea].
// Headings ("yaw") are compass degrees: 0 = north (-z), 90 = east (+x), 180 = south (+z).
// Object rotations ("rot") are THREE rotation.y in radians for an object whose local +Z is its FRONT:
//   rot = Math.atan2(dirX, dirZ) makes the front face the direction (dirX, dirZ).
// In-scene signage uses Simplified Chinese (name); UI text uses Traditional (nameT).
import { makeRng, hash2 } from '../core/rng.js';
import { heightAt, backDist, backInfo, shoreDist, BACKLINE, WATERLINE, BEACH_STEPS, BEACH_STAIRS, PROMENADE_X, BOARDWALK_X, PROM_Y } from './height.js';

export const BOUNDS = { minX: -250, maxX: 250, minZ: -225, maxZ: 225 };      // nominal map
export const WALK = { minX: -246, maxX: 246, minZ: -221, maxZ: 400 };         // player clamp (sea stops you to the south)
export const EXTENT = { minX: -292, maxX: 292, minZ: -266, maxZ: 400 };       // walls/lots/lamps exist out to here (visual run-off)
/**
 * East limit of the walk at a given z. Inland it is WALK.maxX; along the coast (z > -14) it pulls in to x = 225, where
 * the reef, boulder and boardwalk dressing ends (beyond it the shore is bare far-field ground).
 */
export function walkMaxX(z) {
  const t = (z + 14) / 24;
  return WALK.maxX - 21 * (t < 0 ? 0 : t > 1 ? 1 : t);
}
// Streets that leave the map keep running RUNOFF_LEN past their last hand-placed point (asphalt, kerbs, sidewalks and
// the avenue trees only: no walls, lots or lamps), bending away so the far end is hidden behind the trees.
const RUNOFF_LEN = 75;

// ---------------------------------------------------------------------------------------------------------------------
// Species table (shared by trees, life, audio, minimap). Heights/radii in metres.
// ---------------------------------------------------------------------------------------------------------------------
export const SPECIES = {
  ginkgo:    { nameT: '銀杏',   name: '银杏',   h: [12, 16],  r: [3.4, 4.6], trunk: 0.30, evergreen: false, form: 'upright-broadleaf' },
  maple:     { nameT: '五角楓', name: '五角枫', h: [9, 12],   r: [4.0, 5.4], trunk: 0.28, evergreen: false, form: 'round-broadleaf' },
  plane:     { nameT: '法國梧桐', name: '法国梧桐', h: [15, 19], r: [6.0, 7.8], trunk: 0.45, evergreen: false, form: 'vase-broadleaf' },
  cedar:     { nameT: '雪松',   name: '雪松',   h: [15, 20],  r: [4.4, 5.8], trunk: 0.40, evergreen: true,  form: 'tiered-conifer' },
  juniper:   { nameT: '龍柏',   name: '龙柏',   h: [5.5, 7.5], r: [1.1, 1.5], trunk: 0.20, evergreen: true,  form: 'flame-column' },
  pine:      { nameT: '黑松',   name: '黑松',   h: [6, 10],   r: [3.0, 4.4], trunk: 0.25, evergreen: true,  form: 'windswept-pine' },
  peach:     { nameT: '碧桃',   name: '碧桃',   h: [3.6, 4.6], r: [2.0, 2.6], trunk: 0.14, evergreen: false, form: 'small-flowering' },
  crabapple: { nameT: '海棠',   name: '海棠',   h: [4.2, 5.5], r: [2.2, 2.8], trunk: 0.15, evergreen: false, form: 'small-flowering' },
  crape:     { nameT: '紫薇',   name: '紫薇',   h: [3.2, 4.5], r: [1.8, 2.4], trunk: 0.10, evergreen: false, form: 'multi-stem-flowering' },
};

// ---------------------------------------------------------------------------------------------------------------------
// Streets. ctrl = hand-placed control points (from OSM geometry, compressed 0.68x, see docs/DESIGN.md).
// Points outside BOUNDS are visual run-off. Junctions are exact shared control points.
// ---------------------------------------------------------------------------------------------------------------------
// prettier-ignore
const STREET_SRC = [
  { id: 'juyongguan',   name: '居庸关路', nameT: '居庸關路', pinyin: 'JUYONGGUAN LU',   ends: ['西', '东'], tree: 'ginkgo',    spacing: 8,  width: 7,   sidewalk: 2.4,
    ctrl: [[-186,-44],[-129,-48],[-87,-63],[-21,-54],[29,-31],[61,-7],[107,17],[143,36]] },
  { id: 'shanhaiguan',  name: '山海关路', nameT: '山海關路', pinyin: 'SHANHAIGUAN LU',  ends: ['西', '东'], tree: 'plane',     spacing: 10, width: 8,   sidewalk: 3.0,
    ctrl: [[-300,125],[-250,95],[-235,86],[-175,47],[-124,41],[-20,28],[2,29],[46,49],[90,87]] },
  { id: 'zhengyangguan',name: '正阳关路', nameT: '正陽關路', pinyin: 'ZHENGYANGGUAN LU',ends: ['西', '东'], tree: 'crape',     spacing: 6,  width: 7.5, sidewalk: 2.6,
    ctrl: [[-300,-133],[-250,-140],[-186,-150],[-131,-149],[-22,-146],[143,-143],[250,-138],[300,-135]] },
  { id: 'jiayuguan',    name: '嘉峪关路', nameT: '嘉峪關路', pinyin: 'JIAYUGUAN LU',    ends: ['西', '东'], tree: 'maple',     spacing: 9,  width: 7,   sidewalk: 2.4,
    ctrl: [[-300,-204],[-250,-205],[-112,-207],[-22,-203],[168,-198],[250,-196],[300,-194]] },
  { id: 'linhuaiguan',  name: '临淮关路', nameT: '臨淮關路', pinyin: 'LINHUAIGUAN LU',  ends: ['西', '东'], tree: 'juniper',   spacing: 5,  width: 6.5, sidewalk: 2.2,
    ctrl: [[-87,-63],[-50,-85],[-22,-95],[33,-88],[126,-66],[214,-40]] },
  { id: 'ningwuguan',   name: '宁武关路', nameT: '寧武關路', pinyin: 'NINGWUGUAN LU',   ends: ['南', '北'], tree: 'crabapple', spacing: 6,  width: 7,   sidewalk: 2.4,
    ctrl: [[-20,28],[-21,-54],[-22,-95],[-22,-146],[-22,-203],[-15,-225],[-8,-270]] },
  { id: 'zijingguan',   name: '紫荆关路', nameT: '紫荊關路', pinyin: 'ZIJINGGUAN LU',   ends: ['南', '北'], tree: 'cedar',     spacing: 10, width: 7,   sidewalk: 2.4,
    ctrl: [[90,87],[107,17],[126,-66],[143,-143],[168,-198],[175,-225],[186,-270]] },
  { id: 'shaoguan',     name: '韶关路',   nameT: '韶關路',   pinyin: 'SHAOGUAN LU',     ends: ['南', '北'], tree: 'peach',     spacing: 5,  width: 7,   sidewalk: 2.4,
    ctrl: [[-186,-44],[-205,-50],[-217,-69],[-205,-100],[-186,-150],[-140,-190],[-112,-207],[-100,-225],[-78,-270]] },
  { id: 'huanghai',     name: '黄海路',   nameT: '黃海路',   pinyin: 'HUANGHAI LU',     ends: ['南', '北'], tree: 'pine',      spacing: 9,  width: 6,   sidewalk: 2.0,
    ctrl: [[60,130],[90,87],[143,36],[214,-40],[250,-55],[300,-68]] },
  { id: 'zhengyang2',   name: '正阳关二支路', nameT: '正陽關二支路', pinyin: 'ZHENGYANGGUAN 2 ZHILU', ends: ['南', '北'], tree: 'plane', spacing: 11, width: 5, sidewalk: 1.6, lane: true,
    ctrl: [[-124,41],[-129,-48],[-131,-149]] },
];

// Footpaths (granite paving, no kerb, no street trees). width in metres.
// prettier-ignore
const PATH_SRC = [
  { id: 'beach-link',  kind: 'paving', width: 4.0, ctrl: [[-14,63],[-17,45],[-20,28]] },                 // 宁武关路 south end down to the promenade
  { id: 'park1-a',     kind: 'gravel', width: 2.2, ctrl: [[-31,-128],[-48,-120],[-62,-104],[-66,-88]] },
  { id: 'park2-a',     kind: 'gravel', width: 2.2, ctrl: [[52,-30],[70,-42],[92,-40],[108,-52]] },
  { id: 'park2-b',     kind: 'gravel', width: 2.2, ctrl: [[70,-42],[66,-60],[60,-76]] },
];

// Open green spaces (no garden wall along their street frontage; lawn + scattered trees + benches).
// prettier-ignore
export const PARKS = [
  { id: 'park1', nameT: '臨淮關路綠地', poly: [[-72,-139],[-30,-139],[-30,-102],[-56,-88],[-72,-84]] },
  { id: 'park2', nameT: '居庸關路綠地', poly: [[44,-78],[114,-62],[101,2],[48,-28]] },
];

// Landmark buildings (built by the landmarks package; generic villas keep out of `reserve` radius).
// w = footprint along the street, d = depth. Positions adjusted slightly from research so gardens fit.
// prettier-ignore
const LANDMARK_SRC = [
  { id: 'huashilou',  name: '花石楼',     nameT: '花石樓',     address: '黄海路18号',   x: 102,  z: 113,  w: 16, d: 15, reserve: 34, street: 'huanghai',    height: 18 },
  { id: 'gongzhulou', name: '公主楼',     nameT: '公主樓',     address: '居庸关路10号', x: -150, z: -68,  w: 12, d: 10, reserve: 26, street: 'juyongguan',  height: 17 },
  { id: 'binguan',    name: '八大关宾馆', nameT: '八大關賓館', address: '山海关路19号', x: -162, z: -2,   w: 40, d: 16, reserve: 46, street: 'shanhaiguan', height: 13 },
  { id: 'yuanshuailou', name: '元帅楼',   nameT: '元帥樓',     address: '山海关路17号', x: -227, z: 58,   w: 16, d: 11, reserve: 24, street: 'shanhaiguan', height: 9 },
  { id: 'hudielou',   name: '蝴蝶楼',     nameT: '蝴蝶樓',     address: '山海关路21号', x: -228, z: 101,  w: 18, d: 9,  reserve: 22, street: 'shanhaiguan', height: 9, relocated: true },
];

// Generic villa archetypes (see docs/DESIGN.md §Villas). w x d = bounding footprint the villa must stay inside.
export const ARCHETYPES = {
  A: { label: 'German Jugendstil', w: 16, d: 13, weight: 0.20 },
  B: { label: 'Castle / tower',    w: 14, d: 12, weight: 0.08 },
  C: { label: 'Nordic steep-roof', w: 12, d: 10, weight: 0.10 },
  D: { label: 'Spanish',           w: 16, d: 10, weight: 0.12 },
  E: { label: 'French mansard',    w: 14, d: 12, weight: 0.12 },
  F: { label: 'Japanese-modern',   w: 17, d: 10, weight: 0.10 },
  G: { label: 'English country',   w: 18, d: 13, weight: 0.16 },
  H: { label: 'Art Deco',          w: 14, d: 10, weight: 0.12 },
};

// ---------------------------------------------------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------------------------------------------------
function catmullRom(ctrl, step = 2) {
  const P = ctrl.map((p) => [p[0], p[1]]);
  const n = P.length;
  if (n < 3) {
    const out = [];
    const len = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
    const k = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= k; i++) out.push([P[0][0] + ((P[1][0] - P[0][0]) * i) / k, P[0][1] + ((P[1][1] - P[0][1]) * i) / k]);
    return out;
  }
  P.unshift([2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]]);
  P.push([2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1]]);
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
    const t2 = t1 + Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    const t3 = t2 + Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
    const k = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) {
      const t = t1 + ((t2 - t1) * j) / k;
      const o = [0, 0];
      for (let c = 0; c < 2; c++) {
        const A1 = ((t1 - t) / (t1 - t0)) * p0[c] + ((t - t0) / (t1 - t0)) * p1[c];
        const A2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
        const A3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
        const B1 = ((t2 - t) / (t2 - t0)) * A1 + ((t - t0) / (t2 - t0)) * A2;
        const B2 = ((t3 - t) / (t3 - t1)) * A2 + ((t - t1) / (t3 - t1)) * A3;
        o[c] = ((t2 - t) / (t2 - t1)) * B1 + ((t - t1) / (t2 - t1)) * B2;
      }
      out.push(o);
    }
  }
  out.push([ctrl[n - 1][0], ctrl[n - 1][1]]);
  return out;
}

function finishLine(obj) {
  const pts = obj.pts;
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  obj.cum = cum;
  obj.len = cum[pts.length - 1];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
  obj.bbox = { minX, maxX, minZ, maxZ };
  return obj;
}

/**
 * Point on a street/path at arc length s (metres from its first point).
 * Returns {x, z, tx, tz, nx, nz}: position, unit tangent, unit LEFT normal (n = (tz, -tx)).
 * side = +1 means the left of the direction of travel, -1 the right:  offset point = p + n * side * dist.
 */
export function pointAt(line, s, out = {}) {
  const { pts, cum } = line;
  const n = pts.length;
  s = s < 0 ? 0 : s > line.len ? line.len : s;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  const seg = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  // tangent smoothed over neighbours
  const p0 = pts[Math.max(0, lo - 1)], p3 = pts[Math.min(n - 1, hi + 1)];
  let tx = p3[0] - p0[0], tz = p3[1] - p0[1];
  const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
  out.tx = tx; out.tz = tz; out.nx = tz; out.nz = -tx;
  return out;
}

const _q = { d: 0, s: 0, side: 1, i: 0 };
/** Distance from (x,z) to a street/path centre line. Returns shared scratch {d, s, side, i} (copy what you keep). */
export function distToLine(line, x, z, maxD = Infinity) {
  const bb = line.bbox;
  _q.d = Infinity;
  if (x < bb.minX - maxD || x > bb.maxX + maxD || z < bb.minZ - maxD || z > bb.maxZ + maxD) return _q;
  const { pts, cum } = line;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az;
    const l2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (ax + dx * t), ez = z - (az + dz * t);
    const d = ex * ex + ez * ez;
    if (d < best) {
      best = d; _q.i = i; _q.s = cum[i] + Math.sqrt(l2) * t;
      _q.side = ex * dz - ez * dx >= 0 ? 1 : -1; // dot(e, n) with n = (dz, -dx)
    }
  }
  _q.d = Math.sqrt(best);
  return _q;
}

function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** Signed distance to polygon: negative inside. */
export function polySignedDist(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], az = poly[j][1], dx = poly[i][0] - ax, dz = poly[i][1] - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return pointInPoly(poly, x, z) ? -best : best;
}
/** Park containing (x,z) (optionally inflated by `margin` metres) or null. */
export function parkAt(x, z, margin = 0) {
  for (const p of PARKS) if (polySignedDist(p.poly, x, z) < margin) return p;
  return null;
}

/** Corners of an oriented rectangle {x,z,w,d,rot} (w along local X, d along local Z), optionally inflated. */
export function rectCorners(r, inflate = 0) {
  const c = Math.cos(r.rot), s = Math.sin(r.rot), hw = r.w / 2 + inflate, hd = r.d / 2 + inflate;
  // local (lx, lz) -> world: x = cx + lx*c + lz*s ; z = cz - lx*s + lz*c   (THREE rotation.y convention)
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [r.x + lx * c + lz * s, r.z - lx * s + lz * c]);
}
/** World -> local coords of an oriented rect / object with rotation.y = rot. Returns [lx, lz]. */
export function toLocal(r, x, z) {
  const c = Math.cos(r.rot), s = Math.sin(r.rot), dx = x - r.x, dz = z - r.z;
  return [dx * c - dz * s, dx * s + dz * c];
}
function inRect(r, x, z, inflate = 0) {
  const [lx, lz] = toLocal(r, x, z);
  return Math.abs(lx) <= r.w / 2 + inflate && Math.abs(lz) <= r.d / 2 + inflate;
}

// ---------------------------------------------------------------------------------------------------------------------
// build streets / paths
// ---------------------------------------------------------------------------------------------------------------------
// Run-off: [bend at the start, bend at the end] in compass degrees (+ = turning clockwise seen from above while
// travelling OUT of the map). Each open end gets two extra control points: first the mirror image of the last interior
// point (exactly the phantom point the spline used before, so the hand-placed part keeps its shape to the millimetre),
// then a second one RUNOFF_LEN further along the bent heading.
// prettier-ignore
const RUNOFF = {
  shanhaiguan: [30, null], zhengyangguan: [-30, -30], jiayuguan: [30, -30], ningwuguan: [null, 30], zijingguan: [null, 30],
  shaoguan: [null, -35], huanghai: [null, 30],
};
function runoffPoints(end, inner, bendDeg) {
  const p1 = [2 * end[0] - inner[0], 2 * end[1] - inner[1]];
  const head = Math.atan2(end[0] - inner[0], -(end[1] - inner[1])) + (bendDeg * Math.PI) / 180;
  return [p1, [Math.round(p1[0] + Math.sin(head) * RUNOFF_LEN), Math.round(p1[1] - Math.cos(head) * RUNOFF_LEN)]];
}
const streets = STREET_SRC.map((s, index) => {
  // `ctrl` stays the hand-placed list (junction detection reads it); `pts` is sampled from the extended one
  const full = s.ctrl.map((p) => [p[0], p[1]]), n = s.ctrl.length, ro = RUNOFF[s.id] || [null, null];
  if (ro[0] != null) { const e = runoffPoints(s.ctrl[0], s.ctrl[1], ro[0]); full.unshift(e[1], e[0]); }
  if (ro[1] != null) { const e = runoffPoints(s.ctrl[n - 1], s.ctrl[n - 2], ro[1]); full.push(e[0], e[1]); }
  const st = { ...s, index, lane: !!s.lane, pts: catmullRom(full, 2) };
  st.half = st.width / 2;                         // carriageway half width
  st.treeOff = st.half + Math.min(0.95, st.sidewalk * 0.42);   // tree pit centre from centre line
  st.lampOff = st.half + 0.45;                    // lamp post from centre line
  st.wallOff = st.half + st.sidewalk + 0.25;      // garden wall centre line from centre line
  finishLine(st);
  // [sA, sB] = arc-length range of the hand-placed part; everything the plan generates (lots, walls, lamps, the regular
  // tree rows) is laid out inside it, measured from sA, so the run-off never reshuffles the district
  const sOf = (q) => { let bi = 0, bd = Infinity; st.pts.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return st.cum[bi]; };
  st.sA = ro[0] != null ? sOf(s.ctrl[0]) : 0;
  st.sB = ro[1] != null ? sOf(s.ctrl[n - 1]) : st.len;
  st.runoff = [ro[0] != null, ro[1] != null];
  return st;
});
const streetById = Object.fromEntries(streets.map((s) => [s.id, s]));
const paths = PATH_SRC.map((p) => finishLine({ ...p, half: p.width / 2, pts: catmullRom(p.ctrl, 1.5) }));

const promenade = finishLine({ id: 'promenade', name: '海滨步行道', nameT: '海濱步行道', width: 5, y: PROM_Y,
  pts: BACKLINE.filter((p) => p[0] >= PROMENADE_X[0] && p[0] <= PROMENADE_X[1]).map((p) => [p[0], p[1]]),
  steps: BEACH_STAIRS.map((S) => ({ ...S, width: 4.4, run: 4.0 })) });
const boardwalk = finishLine({ id: 'boardwalk', name: '海滨木栈道', nameT: '海濱木棧道', width: 2.6, y: PROM_Y,
  pts: BACKLINE.filter((p) => p[0] >= BOARDWALK_X[0] && p[0] <= BOARDWALK_X[1]).map((p) => [p[0], p[1]]) });

const inExtent = (x, z, m = 0) => x > EXTENT.minX + m && x < EXTENT.maxX - m && z > EXTENT.minZ + m;
const inBounds = (x, z, m = 0) => x > BOUNDS.minX + m && x < BOUNDS.maxX - m && z > BOUNDS.minZ + m;

/** min over streets (optionally excluding one) of (distance - extra(street)); used for corridor tests during generation */
function clearOfStreets(x, z, extraFn, exclude = null) {
  for (const st of streets) {
    if (st === exclude) continue;
    const need = extraFn(st);
    if (distToLine(st, x, z, need + 1).d < need) return false;
  }
  return true;
}
function clearOfPaths(x, z, extra) {
  for (const p of paths) if (distToLine(p, x, z, p.half + extra + 1).d < p.half + extra) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// junctions (shared control points)
// ---------------------------------------------------------------------------------------------------------------------
const junctions = [];
for (let a = 0; a < streets.length; a++) {
  for (const p of streets[a].ctrl) {
    for (let b = a + 1; b < streets.length; b++) {
      if (!streets[b].ctrl.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5)) continue;
      let j = junctions.find((J) => Math.hypot(J.x - p[0], J.z - p[1]) < 0.5);
      if (!j) { j = { id: `j${junctions.length}`, x: p[0], z: p[1], streets: [] }; junctions.push(j); }
      for (const id of [streets[a].id, streets[b].id]) if (!j.streets.includes(id)) j.streets.push(id);
    }
  }
}
for (const j of junctions) j.y = heightAt(j.x, j.z);

// ---------------------------------------------------------------------------------------------------------------------
// landmarks, lots, gates
// ---------------------------------------------------------------------------------------------------------------------
const gates = [];
function makeGate(owner, st, s, side, width, open) {
  const p = pointAt(st, s);
  const g = {
    id: `gate-${owner}`, owner, street: st.id, side, s, width, open,
    x: p.x + p.nx * side * st.wallOff, z: p.z + p.nz * side * st.wallOff,
    // gate faces the street: front direction = -n*side
    rot: Math.atan2(-p.nx * side, -p.nz * side),
    tx: p.tx, tz: p.tz,
  };
  g.y = heightAt(g.x, g.z);
  gates.push(g);
  return g;
}
function groundLevels(rect) {
  const cs = rectCorners(rect);
  let lo = Infinity, hi = -Infinity;
  for (const [x, z] of [...cs, [rect.x, rect.z]]) { const h = heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  return { lo, hi };
}

const landmarks = LANDMARK_SRC.map((L) => {
  const st = streetById[L.street];
  const q = distToLine(st, L.x, L.z);
  const s = q.s, side = q.side;
  const p = pointAt(st, s);
  const lm = { ...L, side, s, rot: Math.atan2(p.x - L.x, p.z - L.z) };
  const g = groundLevels(lm);
  lm.baseY = g.lo; lm.floorY = g.hi + 0.6; lm.y = heightAt(L.x, L.z);
  lm.gate = makeGate(L.id, st, s, side, L.id === 'binguan' ? 5.0 : 3.6, true);
  return lm;
});

const lots = [];
(function generateLots() {
  const order = ['shanhaiguan', 'juyongguan', 'zijingguan', 'ningwuguan', 'linhuaiguan', 'zhengyangguan', 'huanghai', 'shaoguan', 'jiayuguan', 'zhengyang2'];
  const archKeys = Object.keys(ARCHETYPES);
  const weights = Object.fromEntries(archKeys.map((k) => [k, ARCHETYPES[k].weight]));
  for (const id of order) {
    const st = streetById[id];
    for (const side of [1, -1]) {
      const rand = makeRng(`lots:${id}:${side}`);
      let s = st.sA + rand.range(16, 30);
      while (s < st.sB - 14) {
        const arch = rand.weighted(weights);
        const A = ARCHETYPES[arch];
        const setback = rand.range(8, 12.5);
        const p = pointAt(st, s);
        const off = st.wallOff + setback + A.d / 2;
        const lot = {
          x: p.x + p.nx * side * off, z: p.z + p.nz * side * off, w: A.w, d: A.d,
          rot: Math.atan2(-p.nx * side, -p.nz * side), arch, street: id, side, s, setback,
        };
        let ok = inExtent(lot.x, lot.z, 6) && backDist(lot.x, lot.z) > 16 + A.d / 2;
        if (ok) for (const L of landmarks) if (Math.hypot(L.x - lot.x, L.z - lot.z) < L.reserve + 10) { ok = false; break; }
        if (ok && parkAt(lot.x, lot.z, 12)) ok = false;
        if (ok) {
          const cs = rectCorners(lot, 4.5);
          const probes = [...cs, [lot.x, lot.z]];
          for (let i = 0; i < 4; i++) probes.push([(cs[i][0] + cs[(i + 1) % 4][0]) / 2, (cs[i][1] + cs[(i + 1) % 4][1]) / 2]);
          for (const [x, z] of probes) {
            if (!clearOfStreets(x, z, (o) => o.wallOff + 1.5) || !clearOfPaths(x, z, 2) || backDist(x, z) < 9) { ok = false; break; }
          }
        }
        if (ok) for (const o of lots) {
          if (Math.hypot(o.x - lot.x, o.z - lot.z) < (Math.hypot(o.w, o.d) + Math.hypot(lot.w, lot.d)) / 2 + 9) { ok = false; break; }
        }
        if (!ok) { s += 7; continue; }
        lot.id = `lot${String(lots.length).padStart(2, '0')}`;
        lot.seed = `villa:${lot.id}`;
        lot.mirror = rand.chance(0.5);
        const g = groundLevels(lot);
        lot.baseY = g.lo; lot.floorY = g.hi + 0.45; lot.y = heightAt(lot.x, lot.z);
        lot.playable = inBounds(lot.x, lot.z, -8);
        const gs = Math.min(st.sB - 4, Math.max(st.sA + 4, s + rand.range(-1, 1) * (A.w / 2 - 2.5)));
        let gateOk = true;
        { const gp = pointAt(st, gs); const gx = gp.x + gp.nx * side * st.wallOff, gz = gp.z + gp.nz * side * st.wallOff;
          gateOk = clearOfStreets(gx, gz, (o) => o.wallOff + 3, st) && clearOfPaths(gx, gz, 3); }
        lot.gate = makeGate(lot.id, st, gateOk ? gs : s, side, 3.4, false);
        lots.push(lot);
        s += A.w + rand.range(26, 38);
      }
    }
  }
  // 花石楼 is THE castle of the district: at most two generic castle villas (archetype B) survive, and none within
  // 200 m of it, on 山海关路 or in sight of the beach. The rest become quieter houses on the same plot: the new footprint
  // keeps the front line and stays inside the envelope the castle was validated for, so nothing else moves.
  const hs = landmarks.find((L) => L.id === 'huashilou');
  const castles = lots.filter((l) => l.arch === 'B').map((l) => ({ l, dh: Math.hypot(l.x - hs.x, l.z - hs.z) }));
  const keep = castles.filter((c) => c.dh >= 200 && c.l.street !== 'shanhaiguan' && backDist(c.l.x, c.l.z) >= 100)
    .sort((a, b) => (b.l.x < WALK.maxX) - (a.l.x < WALK.maxX) || b.dh - a.dh).slice(0, 2).map((c) => c.l);
  const SUBST = ['G', 'E', 'A', 'D'];
  let k = 0;
  for (const { l } of castles) {
    if (keep.includes(l)) continue;
    const arch = SUBST[k++ % SUBST.length], A = ARCHETYPES[arch], shift = (l.d - A.d) / 2;   // + = toward the street
    l.x += Math.sin(l.rot) * shift; l.z += Math.cos(l.rot) * shift;
    l.arch = arch; l.w = A.w; l.d = A.d;
    const g = groundLevels(l);
    l.baseY = g.lo; l.floorY = g.hi + 0.45; l.y = heightAt(l.x, l.z);
  }
})();

// ---------------------------------------------------------------------------------------------------------------------
// garden walls: continuous street-edge walls (the defining street furniture of 八大关)
// ---------------------------------------------------------------------------------------------------------------------
const walls = [];
(function generateWalls() {
  const STEP = 1.0;
  for (const st of streets) {
    for (const side of [1, -1]) {
      const myGates = gates.filter((g) => g.street === st.id && g.side === side);
      let run = null;
      const flush = () => {
        if (run && run.length >= 4) {
          const pts = simplify(run, 0.07);
          const rand = makeRng(`wall:${st.id}:${side}:${walls.length}`);
          const w = finishLine({ id: `wall${walls.length}`, street: st.id, side, pts,
            top: rand.weighted({ rail: 0.58, hedge: 0.27, pierced: 0.15 }),
            h: +(rand.range(0.85, 1.2)).toFixed(2), thickness: 0.45 });
          w.pts = pts.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)]);
          walls.push(w);
        }
        run = null;
      };
      const p = {};
      for (let s = st.sA; s <= st.sB + 1e-6; s += STEP) {
        pointAt(st, s, p);
        const x = p.x + p.nx * side * st.wallOff, z = p.z + p.nz * side * st.wallOff;
        let keep = inExtent(x, z) && backDist(x, z) > 4.0;
        if (keep) keep = distToLine(st, x, z, st.wallOff + 1).d > st.wallOff - 0.3;        // inside-bend trim
        if (keep) keep = clearOfStreets(x, z, (o) => o.wallOff + 0.35, st) && clearOfPaths(x, z, 0.5);
        if (keep) for (const g of myGates) if (Math.abs(s - g.s) < g.width / 2 + 0.3) { keep = false; break; }
        if (keep) {
          const ax = p.x + p.nx * side * (st.wallOff + 3), az = p.z + p.nz * side * (st.wallOff + 3);
          const bx = p.x + p.nx * side * (st.wallOff + 8), bz = p.z + p.nz * side * (st.wallOff + 8);
          if (parkAt(ax, az) || parkAt(bx, bz)) keep = false;
        }
        if (keep) (run || (run = [])).push([x, z]); else flush();
      }
      flush();
    }
  }
  function simplify(pts, tol) {
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let worst = 0, wi = -1;
      const ax = pts[a][0], az = pts[a][1], dx = pts[b][0] - ax, dz = pts[b][1] - az, l = Math.hypot(dx, dz) || 1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / l;
        if (d > worst) { worst = d; wi = i; }
      }
      if (worst > tol) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
})();

// ---------------------------------------------------------------------------------------------------------------------
// trees
// ---------------------------------------------------------------------------------------------------------------------
// Named camera views: used for the spawn point and for screenshots (?view=<id>). yaw = compass heading in degrees
// (0 north, 90 east, 180 south/sea), pitch in degrees (+ up), h = eye height above ground (default 1.65).
const VIEW_SRC = {
  spawn:     { x: -180, z: -44.8, yaw: 84, pitch: 5, note: 'default spawn: west end of 居庸关路, 公主楼 ahead-left, ginkgo avenue' },
  ginkgo:    { x: -141, z: -47.3, yaw: 95, pitch: 6, note: '居庸关路 ginkgo tunnel' },
  princess:  { x: -152, z: -47, yaw: 352, pitch: 14, note: '公主楼 from its gate' },
  cedar:     { x: 133, z: -100, yaw: 192, pitch: 5, note: '紫荆关路 cedar tunnel, looking downhill (south)' },
  plane:     { x: -110, z: 39.5, yaw: 262, pitch: 8, note: '山海关路 plane avenue' },
  juniper:   { x: 20, z: -89.5, yaw: 78, pitch: 3, note: '临淮关路 dragon-juniper corridor' },
  peach:     { x: -214, z: -80, yaw: 20, pitch: 6, note: '韶关路 peach blossom (spring preset)' },
  crabapple: { x: -21.5, z: -20, yaw: 358, pitch: 6, note: '宁武关路 crabapple "flower street" (spring preset)' },
  maple:     { x: -60, z: -205, yaw: 88, pitch: 6, note: '嘉峪关路 maples' },
  crape:     { x: 40, z: -145.5, yaw: 90, pitch: 4, note: '正阳关路 crape myrtle (dusk preset)' },
  downhill:  { x: -21, z: -30, yaw: 180, pitch: -2, note: '宁武关路 looking south: sea closes the vista' },
  huashi:    { x: 78, z: 136, yaw: 48, pitch: 12, note: '花石楼 from the south-west lawn' },
  huashiSea: { x: 118, z: 150, h: 1.8, yaw: 318, pitch: 10, note: '花石楼 from the reef, tower against the sky' },
  beach:     { x: -40, z: 100, yaw: 110, pitch: 0, note: 'on the sand looking east to 花石楼 headland' },
  promenade: { x: -100, z: 72.5, yaw: 100, pitch: 0, note: 'seawall promenade' },
  boardwalk: { x: 150, z: 90, yaw: 215, pitch: -2, note: 'boardwalk over the reef, looking back to 花石楼' },
  reef:      { x: 190, z: 62, yaw: 150, pitch: -6, note: 'reef + sea' },
  wall:      { x: 20, z: 34, yaw: 300, pitch: 0, note: 'granite garden wall + gate close-up on 山海关路' },
  junction:  { x: 84, z: 82, yaw: 20, pitch: 4, note: 'three-way junction north of 花石楼' },
  park:      { x: 60, z: -24, yaw: 30, pitch: 2, note: 'park lawn' },
  overview:  { x: 0, z: 150, h: 140, yaw: 0, pitch: -38, note: 'aerial from over the bay looking north' },
  top:       { x: 0, z: -20, h: 520, yaw: 0, pitch: -89.9, fov: 55, note: 'plan view of the whole map' },
  aerialSE:  { x: 200, z: 170, h: 70, yaw: 305, pitch: -22, note: 'aerial from the south-east over 花石楼' },
};
const trees = [];
const treeGrid = new Map();
const tkey = (x, z) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
function treeNear(x, z, r) {
  const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = treeGrid.get(`${cx + i},${cz + j}`);
    if (list) for (const t of list) if (Math.hypot(t.x - x, t.z - z) < r) return true;
  }
  return false;
}
function addTree(x, z, species, rand, extra = {}) {
  const S = SPECIES[species];
  const k = rand();
  const t = {
    id: trees.length, x: +x.toFixed(2), z: +z.toFixed(2), y: +heightAt(x, z).toFixed(3), species,
    h: +(S.h[0] + (S.h[1] - S.h[0]) * k).toFixed(2), r: +(S.r[0] + (S.r[1] - S.r[0]) * (0.35 * rand() + 0.65 * k)).toFixed(2),
    trunk: S.trunk * (0.85 + 0.3 * k), rot: +(rand() * Math.PI * 2).toFixed(3), seed: Math.floor(rand() * 1e9),
    tone: Math.floor(rand() * 4), street: null, garden: false, ...extra,
  };
  trees.push(t);
  const key = tkey(x, z);
  if (!treeGrid.has(key)) treeGrid.set(key, []);
  treeGrid.get(key).push(t);
  return t;
}
const houseRects = () => [...lots, ...landmarks];
function clearOfHouses(x, z, m) {
  for (const r of houseRects()) if (Math.hypot(r.x - x, r.z - z) < 20 + m && inRect(r, x, z, m)) return false;
  return true;
}

(function streetTrees() {
  for (const st of streets) {
    for (const side of [1, -1]) {
      const rand = makeRng(`trees:${st.id}:${side}`);
      const myGates = gates.filter((g) => g.street === st.id && g.side === side);
      const p = {};
      for (let s = st.sA + st.spacing * (side > 0 ? 0.5 : 1.0); s < st.sB - 1; s += st.spacing) {
        const sj = s + rand.range(-0.5, 0.5);
        pointAt(st, sj, p);
        const x = p.x + p.nx * side * st.treeOff, z = p.z + p.nz * side * st.treeOff;
        if (!inExtent(x, z, 1) || backDist(x, z) < 4.5) { rand(); rand(); rand(); rand(); continue; }
        if (distToLine(st, x, z, st.treeOff + 1).d < st.treeOff - 0.3) continue;
        if (!clearOfStreets(x, z, (o) => o.half + o.sidewalk + 0.6, st) || !clearOfPaths(x, z, 1.2)) continue;
        if (myGates.some((g) => Math.abs(sj - g.s) < g.width / 2 + 1.3)) continue;
        let species = st.tree;
        if (st.lane) species = ['plane', 'ginkgo', 'maple'][Math.floor(rand() * 3)];
        addTree(x, z, species, rand, { street: st.id, side, s: +sj.toFixed(2) });
      }
    }
  }
})();

(function gardenTrees() {
  const gardenMix = { cedar: 0.22, pine: 0.18, plane: 0.1, ginkgo: 0.1, maple: 0.13, crabapple: 0.1, juniper: 0.09, peach: 0.05, crape: 0.03 };
  // open lawns that must stay free of garden trees (sight lines to landmarks, staged figures)
  const CLEARINGS = [[86, 130, 12], [-150, -59, 12], [-20.5, 46, 8.5]]; // last: the sea vista down 宁武关路
  // the approach from each landmark's gate to its front door stays open (2.6 m either side of the gate-to-house line)
  const inGateCorridor = (x, z) => landmarks.some((L) => {
    const g = L.gate, dx = L.x - g.x, dz = L.z - g.z, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - g.x) * dx + (z - g.z) * dz) / l2));
    return Math.hypot(x - (g.x + dx * t), z - (g.z + dz * t)) < 2.6;
  });
  const okSpot = (x, z, gap) => inExtent(x, z, 2) && backDist(x, z) > 5 && clearOfStreets(x, z, (o) => o.wallOff + 1.6) &&
    clearOfPaths(x, z, 1.5) && clearOfHouses(x, z, 3.0) && !treeNear(x, z, gap) && !CLEARINGS.some((c) => Math.hypot(x - c[0], z - c[1]) < c[2]) &&
    !inGateCorridor(x, z);
  // around each villa
  for (const lot of lots) {
    const rand = makeRng(`garden:${lot.id}`);
    const n = rand.int(3, 5);
    for (let k = 0, tries = 0; k < n && tries < 30; tries++) {
      const where = rand.int(0, 2);
      let lx, lz;
      if (where === 0) { lx = rand.sign() * (lot.w / 2 + rand.range(3.5, 9)); lz = rand.range(-lot.d / 2 - 4, lot.d / 2 + lot.setback - 2.5); }
      else if (where === 1) { lx = rand.range(-lot.w / 2 - 6, lot.w / 2 + 6); lz = -(lot.d / 2 + rand.range(3.5, 10)); }
      else { lx = rand.sign() * rand.range(lot.w / 2 - 1, lot.w / 2 + 7); lz = lot.d / 2 + rand.range(3, Math.max(3.5, lot.setback - 2.2)); }
      const c = Math.cos(lot.rot), s = Math.sin(lot.rot);
      const x = lot.x + lx * c + lz * s, z = lot.z - lx * s + lz * c;
      const species = rand.weighted(gardenMix);
      if (!okSpot(x, z, SPECIES[species].r[0] * 0.9 + 1.5) || parkAt(x, z, 1)) continue;
      addTree(x, z, species, rand, { garden: true, lot: lot.id });
      k++;
    }
  }
  // parks: open groves
  for (const park of PARKS) {
    const rand = makeRng(`park:${park.id}`);
    const xs = park.poly.map((p) => p[0]), zs = park.poly.map((p) => p[1]);
    const mix = park.id === 'park1' ? { ginkgo: 0.3, maple: 0.3, crabapple: 0.2, cedar: 0.2 } : { plane: 0.25, pine: 0.25, maple: 0.2, ginkgo: 0.15, crape: 0.15 };
    for (let k = 0, tries = 0; k < 16 && tries < 300; tries++) {
      const x = rand.range(Math.min(...xs), Math.max(...xs)), z = rand.range(Math.min(...zs), Math.max(...zs));
      if (polySignedDist(park.poly, x, z) > -3 || !okSpot(x, z, 8.5)) continue;
      addTree(x, z, rand.weighted(mix), rand, { garden: true, park: park.id });
      k++;
    }
  }
  // black pines: 花石楼 headland, the rocky coast strip behind the boardwalk, the lawn behind the promenade
  const rand = makeRng('pines:coast');
  const info = {};
  for (let x = -236; x < 286; x += rand.range(7, 12)) {
    for (let tries = 0; tries < 4; tries++) {
      const z0 = rand.range(-80, 170);
      backInfo(x, z0, info);
      const want = rand.range(4.5, 15);
      // slide the probe to the wanted distance inland of the coast path
      const dx = x - info.x, dz = z0 - info.z, l = Math.hypot(dx, dz) || 1;
      const sgn = info.b >= 0 ? 1 : -1;
      const px = info.x + (dx / l) * sgn * want, pz = info.z + (dz / l) * sgn * want;
      if (backDist(px, pz) < 4.2 || !okSpot(px, pz, 5.5)) continue;
      addTree(px, pz, rand.chance(px > 60 ? 0.9 : 0.6) ? 'pine' : rand.pick(['plane', 'juniper', 'cedar']), rand, { garden: true, coast: true });
      break;
    }
  }
  const hs = landmarks[0];
  const r2 = makeRng('pines:huashilou');
  for (let k = 0, tries = 0; k < 8 && tries < 300; tries++) {
    const a = r2.range(0, Math.PI * 2), d = r2.range(14, 31);
    if (Math.cos(a) < 0.3 && Math.sin(a) > -0.2) continue; // keep the south-west lawn (the classic view of the house) open
    const x = hs.x + Math.cos(a) * d, z = hs.z + Math.sin(a) * d;
    if (!okSpot(x, z, 5)) continue;
    addTree(x, z, r2.chance(0.8) ? 'pine' : 'cedar', r2, { garden: true, landmark: hs.id });
    k++;
  }
  // landmark gardens: a few specimen trees each (not in front of the facade)
  for (const L of landmarks.slice(1)) {
    const r3 = makeRng(`garden:${L.id}`);
    const mix = L.id === 'gongzhulou' ? { ginkgo: 0.5, cedar: 0.3, maple: 0.2 } : { cedar: 0.3, pine: 0.3, plane: 0.2, ginkgo: 0.2 };
    for (let k = 0, tries = 0; k < (L.id === 'binguan' ? 9 : 5) && tries < 120; tries++) {
      const lx = r3.range(-L.w / 2 - 12, L.w / 2 + 12), lz = r3.range(-L.d / 2 - 12, L.d / 2 + 10);
      if (Math.abs(lx) < L.w / 2 + 3 && lz > -L.d / 2 - 3) continue; // keep facade + front approach clear
      const c = Math.cos(L.rot), s = Math.sin(L.rot);
      const x = L.x + lx * c + lz * s, z = L.z - lx * s + lz * c;
      if (!okSpot(x, z, 6)) continue;
      addTree(x, z, r3.weighted(mix), r3, { garden: true, landmark: L.id });
      k++;
    }
  }
  // 爱情角: the paired cypresses in the south-west corner
  addTree(-214, 104, 'juniper', makeRng('lovers:a'), { garden: true, pair: 'lovers' });
  addTree(-212.4, 105.6, 'juniper', makeRng('lovers:b'), { garden: true, pair: 'lovers' });

  // ---- everything below is appended AFTER the plan above, so earlier tree ids and positions never change ---------------

  // Run-off avenues: the tree rows carry on (wider spaced) along the street extensions beyond EXTENT.
  for (const st of streets) {
    if (st.lane || !(st.runoff[0] || st.runoff[1])) continue;
    const step = Math.max(8, st.spacing * 1.5), p = {};
    for (const side of [1, -1]) {
      const rand = makeRng(`trees:runoff:${st.id}:${side}`);
      for (let s = step * (side > 0 ? 0.5 : 1.0); s < st.len - 6; s += step) {
        if (s > st.sA - 2 && s < st.sB + 2) continue;
        const sj = s + rand.range(-0.8, 0.8);
        pointAt(st, sj, p);
        const x = p.x + p.nx * side * st.treeOff, z = p.z + p.nz * side * st.treeOff;
        if (inExtent(x, z, 1) || backDist(x, z) < 8 || treeNear(x, z, 3)) continue;
        if (distToLine(st, x, z, st.treeOff + 1).d < st.treeOff - 0.3) continue;
        if (!clearOfStreets(x, z, (o) => o.half + o.sidewalk + 0.6, st)) continue;
        addTree(x, z, st.tree, rand, { street: st.id, side, s: +sj.toFixed(2), runoff: true });
      }
    }
  }

  // Garden shrubbery (红瓦绿树: the houses stand half hidden). A few broad evergreen masses per plot, just inside the
  // street wall beside the gate and along the side and back boundaries. species 'shrub' is the trees package's 3-card
  // thicket (a dozen triangles each), so this screens the lower storeys for next to nothing. No trunk, no collider.
  const gateClear = (lot, x, z) => {
    const g = lot.gate, dx = lot.x - g.x, dz = lot.z - g.z, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - g.x) * dx + (z - g.z) * dz) / l2));
    return Math.hypot(x - (g.x + dx * t), z - (g.z + dz * t)) > 3.4;
  };
  for (const lot of lots) {
    const rand = makeRng(`shrubs:${lot.id}`);
    const hw = lot.w / 2, hd = lot.d / 2, front = hd + lot.setback;      // local z of the street wall
    const sd = rand.sign();
    // [lx, lz] candidates in lot space (+z = toward the street), in order of how much they screen
    const cands = [
      [sd * (hw + rand.range(0.5, 4)), front - rand.range(2.9, 3.6)], [-sd * (hw + rand.range(0.5, 4)), front - rand.range(2.9, 3.6)],
      [sd * (hw + rand.range(5, 8)), rand.range(-hd, hd)], [-sd * (hw + rand.range(5, 8)), -(hd + rand.range(3, 7))],
      [sd * rand.range(0, hw), -(hd + rand.range(5.5, 8))], [-sd * (hw + rand.range(5, 8)), rand.range(0, front - 4)],
      [sd * (hw + rand.range(5.5, 8)), front - rand.range(3, 6)],
    ];
    const want = rand.int(4, 5);
    const c = Math.cos(lot.rot), s = Math.sin(lot.rot);
    let n = 0;
    for (const [lx, lz] of cands) {
      if (n >= want) break;
      const x = lot.x + lx * c + lz * s, z = lot.z - lx * s + lz * c;
      const h = rand.range(2.0, 3.1), r = rand.range(1.9, 2.8), rot = rand() * Math.PI * 2, seed = Math.floor(rand() * 1e9), tone = Math.floor(rand() * 4);
      if (!okSpot(x, z, 2.4) || parkAt(x, z, 2) || !gateClear(lot, x, z)) continue;
      if (lots.some((o) => o !== lot && inRect(o, x, z, 4))) continue;
      const t = { id: trees.length, x: +x.toFixed(2), z: +z.toFixed(2), y: +heightAt(x, z).toFixed(3), species: 'shrub', h: +h.toFixed(2), r: +r.toFixed(2),
        trunk: 0, rot: +rot.toFixed(3), seed, tone, street: null, garden: true, shrub: true, lot: lot.id };
      trees.push(t);
      const key = tkey(x, z);
      if (!treeGrid.has(key)) treeGrid.set(key, []);
      treeGrid.get(key).push(t);
      n++;
    }
  }

  // ---- canopy fill (红瓦绿树: the villas stand in old trees, roofs half hidden) ------------------------------------------
  // The per-lot pass above keeps its trees within about 10 m of each house, which leaves the 100 m block interiors and
  // the strip behind the promenade as bare lawn. Two appended passes close them:
  //  1. a second run of black pines along the coast between the west end and 花石楼 (the real pine belt);
  //  2. a jittered staggered grid over the whole plan, mostly tall evergreens, tagged { interior: true } so the trees
  //     package may draw them from its cheap LOD.
  // Both go through okSpot (streets + walls, paths, house clearance, CLEARINGS, landmark gate corridors) and also keep
  // off landmark facades, the parks' open lawns, lot gate approaches and the off-street camera spots.
  const crowded = (x, z, rTree, rShrub) => {
    const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = treeGrid.get(`${cx + i},${cz + j}`);
      if (list) for (const t of list) if (Math.hypot(t.x - x, t.z - z) < (t.shrub ? rShrub : rTree)) return true;
    }
    return false;
  };
  const facade = (x, z) => landmarks.some((L) => {
    if (Math.hypot(L.x - x, L.z - z) > 60) return false;
    const c = Math.cos(L.rot), sn = Math.sin(L.rot), dx = x - L.x, dz = z - L.z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;              // landmark space, +z = toward its street
    return Math.abs(lx) < L.w / 2 + 6 && lz > -L.d / 2 - 3 && lz < L.d / 2 + 30;
  });
  const camSpots = Object.values(VIEW_SRC).filter((v) => !v.h);
  const nearCam = (x, z) => camSpots.some((v) => Math.hypot(v.x - x, v.z - z) < 7);
  const FILL_CLEAR = [[84, 133, 26], [112, 134, 15]];   // the classic lawn view of 花石楼 (camera, tower and the sea beside it) and its seaward lawn (the tower from the reef)
  const fillOk = (x, z) => okSpot(x, z, 0) && !FILL_CLEAR.some((c) => Math.hypot(x - c[0], z - c[1]) < c[2]) && !crowded(x, z, 5.6, 2.0) && clearOfHouses(x, z, 4.5) && !parkAt(x, z, 1.5) &&
    !facade(x, z) && !nearCam(x, z) && lots.every((lot) => Math.hypot(lot.x - x, lot.z - z) > 45 || gateClear(lot, x, z));

  {
    const rand = makeRng('pines:coast2');
    const info = {};
    for (let x = -240; x < 60; x += rand.range(5, 8)) {
      for (let tries = 0; tries < 4; tries++) {
        const z0 = rand.range(-80, 170);
        backInfo(x, z0, info);
        const want = rand.range(5.5, 24);
        const dx = x - info.x, dz = z0 - info.z, l = Math.hypot(dx, dz) || 1;
        const sgn = info.b >= 0 ? 1 : -1;
        const px = info.x + (dx / l) * sgn * want, pz = info.z + (dz / l) * sgn * want;
        if (backDist(px, pz) < 5 || !fillOk(px, pz)) continue;
        addTree(px, pz, rand.chance(0.85) ? 'pine' : rand.pick(['cedar', 'juniper']), rand, { garden: true, coast: true });
        break;
      }
    }
  }
  {
    const rand = makeRng('trees:interior');
    const inland = { cedar: 0.35, pine: 0.3, plane: 0.2, ginkgo: 0.08, maple: 0.07 };
    const seaside = { pine: 0.75, cedar: 0.15, plane: 0.1 };
    const STEP = 11.5;
    let row = 0;
    for (let gz = EXTENT.minZ + 4; gz < 190; gz += STEP * 0.87, row++) {
      for (let gx = EXTENT.minX + 4 + (row & 1 ? STEP / 2 : 0); gx < EXTENT.maxX - 3; gx += STEP) {
        const x = gx + rand.range(-4.4, 4.4), z = gz + rand.range(-4.4, 4.4), pick = rand(), keep = rand();
        if (keep > 0.9 || !fillOk(x, z)) continue;
        const mix = backDist(x, z) < 45 ? seaside : inland;
        let acc = 0, species = 'cedar';
        for (const k in mix) { acc += mix[k]; if (pick < acc) { species = k; break; } }
        addTree(x, z, species, makeRng(`trees:interior:${row}:${Math.round(gx)}`), { garden: true, interior: true });
      }
    }
  }
})();

// ---------------------------------------------------------------------------------------------------------------------
// street lamps, benches, staged figures
// ---------------------------------------------------------------------------------------------------------------------
const lamps = [];
(function () {
  for (const st of streets) {
    const rand = makeRng(`lamps:${st.id}`);
    let side = rand.sign();
    const p = {};
    for (let s = st.sA + rand.range(8, 16); s < st.sB - 4; s += st.lane ? 34 : 27) {
      let placed = false;
      for (let k = 0; k < 4 && !placed; k++) {
        pointAt(st, s + k * 2.6, p);
        const x = p.x + p.nx * side * st.lampOff, z = p.z + p.nz * side * st.lampOff;
        if (!inExtent(x, z, 2) || backDist(x, z) < 3) break;
        if (!clearOfStreets(x, z, (o) => o.half + o.sidewalk + 0.3, st) || !clearOfPaths(x, z, 0.8)) continue;
        if (treeNear(x, z, 2.3)) continue;
        lamps.push({ id: lamps.length, x: +x.toFixed(2), z: +z.toFixed(2), y: +heightAt(x, z).toFixed(3), kind: st.id === 'shanhaiguan' || st.id === 'zhengyangguan' ? 'twin' : 'lantern',
          rot: +Math.atan2(-p.nx * side, -p.nz * side).toFixed(4), street: st.id, playable: inBounds(x, z) });
        placed = true;
      }
      side = -side;
    }
  }
  // promenade lamps on the landward edge
  const p = {};
  for (let s = 14; s < promenade.len - 6; s += 30) {
    pointAt(promenade, s, p);
    // landward = the normal that increases backDist
    const sgn = backDist(p.x + p.nx * 2, p.z + p.nz * 2) > 0 ? 1 : -1;
    const x = p.x + p.nx * sgn * 2.15, z = p.z + p.nz * sgn * 2.15;
    lamps.push({ id: lamps.length, x: +x.toFixed(2), z: +z.toFixed(2), y: PROM_Y, kind: 'lantern', rot: +Math.atan2(-p.nx * sgn, -p.nz * sgn).toFixed(4), street: 'promenade', playable: true });
  }
})();

const benches = [];
(function () {
  const p = {};
  for (let s = 28; s < promenade.len - 10; s += 44) {
    pointAt(promenade, s, p);
    const sgn = backDist(p.x + p.nx * 2, p.z + p.nz * 2) > 0 ? 1 : -1;
    const x = p.x + p.nx * sgn * 1.9, z = p.z + p.nz * sgn * 1.9;
    if (BEACH_STEPS.some((q) => Math.hypot(q[0] - x, q[1] - z) < 6) || !clearOfPaths(x, z, 2)) continue;
    benches.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: PROM_Y, rot: +Math.atan2(-p.nx * sgn, -p.nz * sgn).toFixed(4), where: 'promenade' }); // faces the sea
  }
  for (const path of paths.filter((q) => q.kind === 'gravel')) {
    for (const f of [0.3, 0.7]) {
      pointAt(path, path.len * f, p);
      const x = p.x + p.nx * (path.half + 0.7), z = p.z + p.nz * (path.half + 0.7);
      benches.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: +heightAt(x, z).toFixed(3), rot: +Math.atan2(-p.nx, -p.nz).toFixed(4), where: path.id });
    }
  }
})();

// Staged people. Wedding-photo couples are the signature of the place (research: "wedding-photo street").
// rot = direction the subject faces (they face their photographer). Built by the life package.
const figures = (function () {
  const out = [];
  const onStreet = (id, s, lateral, faceBack) => {
    const st = streetById[id]; const p = pointAt(st, s);
    return { x: p.x + p.nx * lateral, z: p.z + p.nz * lateral, rot: Math.atan2(faceBack ? -p.tx : p.tx, faceBack ? -p.tz : p.tz) };
  };
  out.push({ id: 'wed-ginkgo', kind: 'wedding', dress: 'white', ...onStreet('juyongguan', 64, -(streetById.juyongguan.half - 0.75), true), note: 'at the north kerb of 居庸关路 under the ginkgo, in sight of the spawn' });
  out.push({ id: 'wed-cedar', kind: 'wedding', dress: 'red', ...onStreet('zijingguan', 118, -(streetById.zijingguan.half - 0.75), true), note: 'at the kerb in the cedar tunnel on 紫荆关路' });
  out.push({ id: 'wed-reef', kind: 'wedding', dress: 'white', x: 131.5, z: 133.5, rot: Math.atan2(-0.6, -0.8), note: 'on the reef below the boardwalk' });
  out.push({ id: 'wed-beach', kind: 'wedding', dress: 'white', x: -22, z: 96, rot: Math.atan2(-1, -0.25), note: 'on the sand of 第二海水浴场 (in the beach view)' });
  out.push({ id: 'wed-huashi', kind: 'wedding', dress: 'white', x: 86, z: 131, rot: Math.atan2(-1, 0.2), note: 'lawn in front of 花石楼' });
  out.push({ id: 'stroll-prom-1', kind: 'stroller', x: -120, z: 75.6, rot: Math.atan2(0.2, 1) }); // looking out to sea
  out.push({ id: 'stroll-prom-2', kind: 'stroller', x: 8, z: 79.5, rot: Math.atan2(-0.8, -0.6) });
  out.push({ id: 'elder-ningwu', kind: 'elder', ...onStreet('ningwuguan', 60, 4.6, false) });
  out.push({ id: 'stroll-park2', kind: 'stroller', x: 71.5, z: -44, rot: 2.2 });
  for (const f of out) { f.x = +f.x.toFixed(2); f.z = +f.z.toFixed(2); f.y = +heightAt(f.x, f.z).toFixed(3); }
  return out;
})();

// ---------------------------------------------------------------------------------------------------------------------
// points of interest (UI captions; Traditional Chinese) and named views (spawn + screenshot cameras)
// ---------------------------------------------------------------------------------------------------------------------
const pois = [
  { id: 'huashilou', kind: 'place', x: 102, z: 113, r: 42, title: '花石樓', sub: '黃海路18號',
    quote: '花崗岩與鵝卵石砌成的小小城堡，守著太平灣的潮聲。',
    text: '建於1930年代初，融合多種歐洲風格的古堡式別墅，因外牆以花崗岩和鵝卵石砌築而得名；是八大關離海最近的別墅之一。' },
  { id: 'gongzhulou', kind: 'place', x: -150, z: -68, r: 30, title: '公主樓', sub: '居庸關路10號',
    quote: '藍綠色的尖頂，像一則沒有等到主角的北歐童話。',
    text: '建於1941年前後的丹麥式別墅；相傳為丹麥公主而建，公主卻始終未曾到來，名字倒留了下來。' },
  { id: 'juyongguan', kind: 'street', street: 'juyongguan', title: '居庸關路', sub: '銀杏',
    quote: '十一月，整條路被陽光與銀杏染成一種顏色。',
    text: '八大關一路一樹，居庸關路以銀杏著稱；每年十一月葉色金黃，落葉鋪滿路面。' },
  { id: 'jiayuguan', kind: 'street', street: 'jiayuguan', title: '嘉峪關路', sub: '五角楓',
    quote: '一樹之間，由綠而黃、由橙入紅，秋天在這裡慢慢調色。',
    text: '路旁遍植五角楓，深秋一棵樹上可見十餘種顏色；十一月為最佳觀賞期。' },
  { id: 'zijingguan', kind: 'street', street: 'zijingguan', title: '紫荊關路', sub: '雪松',
    quote: '雪松垂下層層枝葉，把正午也過濾成幽暗的綠。',
    text: '兩側成排雪松四季常青，濃蔭如隧道。' },
  { id: 'shaoguan', kind: 'street', street: 'shaoguan', title: '韶關路', sub: '碧桃',
    quote: '四月，花比行人多；風一過，整條街都在落粉色的雪。',
    text: '韶關路植碧桃，花期在四月，粉紅如帶。' },
  { id: 'ningwuguan', kind: 'street', street: 'ningwuguan', title: '寧武關路', sub: '海棠',
    quote: '海棠開時，這裡被喚作「花街」。',
    text: '寧武關路植海棠，四月花開，因此有「花街」之稱。' },
  { id: 'zhengyangguan', kind: 'street', street: 'zhengyangguan', title: '正陽關路', sub: '紫薇',
    quote: '盛夏的紫薇，把一整條路開成了晚霞的顏色。',
    text: '正陽關路植紫薇，夏季開花，是分隔南北兩區的東西向主幹道。' },
  { id: 'linhuaiguan', kind: 'street', street: 'linhuaiguan', title: '臨淮關路', sub: '龍柏',
    quote: '龍柏像一簇簇墨綠的火焰，把小路夾成一道綠廊。',
    text: '臨淮關路兩側遍植龍柏，四季常青。' },
  { id: 'shanhaiguan', kind: 'street', street: 'shanhaiguan', title: '山海關路', sub: '法國梧桐',
    quote: '斑駁的樹幹撐起整條路的濃蔭，海就在樹影的盡頭。',
    text: '山海關路與海岸平行，法國梧桐高大成蔭，秋日落葉鋪地。' },
  { id: 'beach', kind: 'place', x: -70, z: 92, r: 55, title: '第二海水浴場', sub: '太平灣',
    quote: '一彎淺金色的沙，盛著黃海特有的青綠。',
    text: '緊鄰八大關與花石樓，位於匯泉角與太平角之間的太平灣內，以沙細、水清、浪緩聞名。' },
  { id: 'reef', kind: 'place', x: 170, z: 76, r: 45, title: '太平角 · 礁石', sub: '海濱木棧道',
    quote: '赤褐的礁石伸進海裡，黑松在風中側著身子。',
    text: '八大關東側的岬角，岸線曲折、礁石嶙峋，是青島著名的婚紗攝影地。' },
];
const intro = {
  title: '八大關', quote: '紅瓦綠樹，碧海藍天。',
  text: '1930年代起建設的海濱別墅區，道路以長城關隘命名（初為八條，今為十條），匯集二十餘國風格的建築，有「萬國建築博覽會」之稱；2001年列為全國重點文物保護單位。',
};

const views = VIEW_SRC;

// ---------------------------------------------------------------------------------------------------------------------
export const MAP = {
  BOUNDS, WALK, EXTENT, SPECIES, ARCHETYPES,
  streets, streetById, paths, junctions,
  promenade, boardwalk,
  coast: { waterline: WATERLINE, backline: BACKLINE, beachSteps: BEACH_STEPS, promenadeX: PROMENADE_X, boardwalkX: BOARDWALK_X,
    // decorative rock clusters for the coast package: [x, z, radius]
    reefClusters: [[84, 168, 28], [112, 158, 15], [140, 122, 12], [168, 96, 12], [196, 62, 13], [226, 28, 12], [-242, 148, 20]],
    buoyLine: [[19, 190], [-65, 235]],
    farHeadlands: [{ id: 'huiquanjiao', nameT: '匯泉角', x: -560, z: 430 }, { id: 'taipingjiao', nameT: '太平角', x: 640, z: 330 }] },
  parks: PARKS, landmarks, landmarkById: Object.fromEntries(landmarks.map((l) => [l.id, l])),
  lots, gates, walls, trees, lamps, benches, figures,
  pois, intro, views, spawn: views.spawn,
};
export default MAP;
