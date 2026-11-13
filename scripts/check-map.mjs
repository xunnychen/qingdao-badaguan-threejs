// Sanity-check + rasterise the world plan without a browser.
//   node scripts/check-map.mjs            -> prints stats
//   node scripts/check-map.mjs out.png    -> also writes a plan image (2 px per metre, north up, sea at the bottom)
import zlib from 'node:zlib';
import fs from 'node:fs';
import { MAP, rectCorners } from '../src/world/map.js';
import { world } from '../src/world/query.js';

const m = MAP;
const count = (arr, key) => arr.reduce((a, o) => ((a[o[key]] = (a[o[key]] || 0) + 1), a), {});
console.log('streets  ', m.streets.map((s) => `${s.name} ${s.len.toFixed(0)}m ${s.tree}`).join(' | '));
console.log('junctions', m.junctions.length);
console.log('lots     ', m.lots.length, 'playable', m.lots.filter((l) => l.playable).length, JSON.stringify(count(m.lots, 'arch')));
console.log('walls    ', m.walls.length, 'runs,', m.walls.reduce((a, w) => a + w.len, 0).toFixed(0), 'm', JSON.stringify(count(m.walls, 'top')));
console.log('trees    ', m.trees.length, JSON.stringify(count(m.trees, 'species')));
console.log('lamps    ', m.lamps.length, 'benches', m.benches.length, 'gates', m.gates.length, 'figures', m.figures.length);
console.log('castles  ', m.lots.filter((l) => l.arch === 'B').map((l) => `${l.id} (${l.x.toFixed(0)},${l.z.toFixed(0)})`).join(' '), '| shrubs', m.trees.filter((t) => t.shrub).length, '| run-off trees', m.trees.filter((t) => t.runoff).length);
for (const [k, v] of Object.entries(m.views)) console.log(`view ${k.padEnd(10)} ground ${world.heightAt(v.x, v.z).toFixed(2)} m  surface ${world.surfaceAt(v.x, v.z)}`);

const out = process.argv[2];
if (out) {
  const S = 2, X0 = -430, X1 = 430, Z0 = -400, Z1 = 240;
  const W = (X1 - X0) * S, H = (Z1 - Z0) * S;
  const px = new Uint8Array(W * H * 3);
  const set = (x, z, r, g, b) => {
    const i = Math.round((x - X0) * S), j = Math.round((z - Z0) * S);
    if (i < 0 || j < 0 || i >= W || j >= H) return;
    const o = (j * W + i) * 3; px[o] = r; px[o + 1] = g; px[o + 2] = b;
  };
  const COL = { water: [70, 130, 150], sand: [226, 205, 150], rock: [150, 105, 80], promenade: [200, 195, 185], boardwalk: [150, 110, 70],
    road: [70, 72, 76], sidewalk: [165, 160, 150], path: [205, 190, 160], lawn: [120, 165, 80], garden: [95, 135, 70] };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = X0 + i / S, z = Z0 + j / S;
    const c = COL[world.surfaceAt(x, z)];
    const h = world.heightAt(x, z);
    const shade = h < 0 ? Math.max(0.55, 1 + h * 0.03) : 0.85 + Math.min(0.3, h * 0.012) - (Math.floor(h / 2) !== Math.floor(world.heightAt(x + 0.5, z + 0.5) / 2) ? 0.2 : 0);
    const o = (j * W + i) * 3; px[o] = Math.min(255, c[0] * shade); px[o + 1] = Math.min(255, c[1] * shade); px[o + 2] = Math.min(255, c[2] * shade);
  }
  const line = (a, b, col) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * S * 1.5) || 1; for (let k = 0; k <= n; k++) set(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, ...col); };
  for (const w of m.walls) for (let i = 0; i < w.pts.length - 1; i++) line(w.pts[i], w.pts[i + 1], w.top === 'hedge' ? [30, 80, 30] : w.top === 'rail' ? [235, 235, 235] : [250, 200, 120]);
  for (const r of [...m.lots, ...m.landmarks]) {
    const cs = rectCorners(r); const col = r.arch ? [190, 75, 50] : [250, 60, 200];
    for (let k = 0; k < 4; k++) line(cs[k], cs[(k + 1) % 4], col);
    line([r.x, r.z], [r.x + Math.sin(r.rot) * r.d / 2, r.z + Math.cos(r.rot) * r.d / 2], col);
  }
  const TC = { ginkgo: [240, 195, 30], maple: [220, 100, 40], plane: [170, 150, 60], cedar: [20, 70, 50], juniper: [10, 50, 30], pine: [40, 90, 50], peach: [245, 150, 180], crabapple: [250, 200, 215], crape: [200, 90, 160], shrub: [60, 110, 60] };
  for (const t of m.trees) { const r = Math.max(0.5, t.r * 0.35); for (let a = -r; a <= r; a += 0.5) for (let b = -r; b <= r; b += 0.5) if (a * a + b * b <= r * r) set(t.x + a, t.z + b, ...TC[t.species]); }
  for (const l of m.lamps) { set(l.x, l.z, 255, 255, 120); set(l.x + 0.5, l.z, 255, 255, 120); }
  for (const g of m.gates) for (let a = -1; a <= 1; a += 0.5) set(g.x + g.tx * a, g.z + g.tz * a, ...(g.open ? [0, 255, 255] : [20, 20, 20]));
  for (const b of m.benches) set(b.x, b.z, 255, 0, 0);
  for (const f of m.figures) for (let a = -0.5; a <= 0.5; a += 0.5) set(f.x + a, f.z, 255, 255, 255);
  for (const x of [m.BOUNDS.minX, m.BOUNDS.maxX]) line([x, m.BOUNDS.minZ], [x, 235], [255, 0, 0]);
  line([m.BOUNDS.minX, m.BOUNDS.minZ], [m.BOUNDS.maxX, m.BOUNDS.minZ], [255, 0, 0]);
  // minimal PNG encoder
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let j = 0; j < H; j++) { raw[j * (W * 3 + 1)] = 0; Buffer.from(px.buffer, j * W * 3, W * 3).copy(raw, j * (W * 3 + 1) + 1); }
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.mkdirSync(new URL('.', new URL(out, `file://${process.cwd()}/`)), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log('wrote', out, `${W}x${H}`);
}
