// Leaf-cluster atlas (4 x 4 tiles) and the plane-tree camouflage bark. Everything is drawn in neutral light greys with a
// slight warm/cool drift: the colour comes from the per-species palette in the shader. Transparent pixels get a light
// neutral RGB (colour bleed) so mip-mapping does not pull dark fringes into the leaf edges.
import * as THREE from 'three';

export const TILE = {
  ginkgoA: 0, ginkgoB: 1, mapleA: 2, mapleB: 3,
  planeA: 4, planeB: 5, cedarTop: 6, cedarSide: 7,
  juniper: 8, pineTop: 9, pineSide: 10, blossomA: 11,
  blossomB: 12, crapeLeaf: 13, panicle: 14, solid: 15,
};
export const ATLAS_N = 4;

const TAU = Math.PI * 2;
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
const grey = (l, warm = 0) => `rgb(${cl(l + warm)},${cl(l)},${cl(l - warm * 1.3)})`;

// ---- leaf shapes (drawn at the origin, pointing up = -y, size s in px) -------------------------------------------------
function leafGinkgo(g, s) {
  g.beginPath();
  g.moveTo(0, s * 0.5);
  g.lineTo(-s * 0.56, -s * 0.02);
  g.quadraticCurveTo(-s * 0.52, -s * 0.52, -s * 0.07, -s * 0.5);
  g.lineTo(0, -s * 0.26);
  g.lineTo(s * 0.07, -s * 0.5);
  g.quadraticCurveTo(s * 0.52, -s * 0.52, s * 0.56, -s * 0.02);
  g.closePath();
  g.fill();
}
function lobed(notch, tips) {
  const ang = [-128, -62, 0, 62, 128].map((d) => (d * Math.PI) / 180);
  return (g, s) => {
    g.beginPath();
    g.moveTo(0, s * 0.42);
    for (let i = 0; i < 5; i++) {
      const a = ang[i], r = s * tips[i] * 0.6;
      const a0 = i === 0 ? a - 0.5 : (ang[i - 1] + a) / 2;
      g.lineTo(Math.sin(a0) * s * notch * 0.6, -Math.cos(a0) * s * notch * 0.6 + s * 0.08);
      g.lineTo(Math.sin(a) * r, -Math.cos(a) * r + s * 0.08);
    }
    const a1 = ang[4] + 0.5;
    g.lineTo(Math.sin(a1) * s * notch * 0.6, -Math.cos(a1) * s * notch * 0.6 + s * 0.08);
    g.closePath();
    g.fill();
  };
}
const leafMaple = lobed(0.4, [0.72, 0.95, 1.0, 0.95, 0.72]);
const leafPlane = lobed(0.62, [0.8, 0.98, 1.0, 0.98, 0.8]);
function leafOval(g, s) { g.beginPath(); g.ellipse(0, 0, s * 0.27, s * 0.55, 0, 0, TAU); g.fill(); }
function flower(g, s) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    g.beginPath(); g.arc(Math.sin(a) * s * 0.29, Math.cos(a) * s * 0.29, s * 0.25, 0, TAU); g.fill();
  }
}

// ---- generic broadleaf cluster ------------------------------------------------------------------------------------------
function cluster(g, rand, { count, leaf, size, blobs = 4, spread = 30, reach = 50, dark = 128, twig = 3 }) {
  const cs = [], p1 = rand() * TAU, p2 = rand() * TAU, p3 = rand() * TAU;
  // ragged, lobed outline well inside the tile: no straight tile edge can survive on a card
  const limit = (a) => 100 + 13 * Math.sin(a * 3 + p1) + 8 * Math.sin(a * 5 + p2) + 5 * Math.sin(a * 9 + p3);
  for (let k = 0; k < blobs; k++) {
    const a = (k / blobs) * TAU + rand() * 1.2, r = reach * (0.45 + 0.55 * rand());
    cs.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r]);
  }
  g.lineCap = 'round';
  for (const c of cs) {
    g.strokeStyle = grey(66, 6); g.lineWidth = twig;
    g.beginPath(); g.moveTo(128 + rand.range(-8, 8), 140 + rand.range(-8, 20));
    g.quadraticCurveTo((128 + c[0]) / 2 + rand.range(-18, 18), (128 + c[1]) / 2 + rand.range(-18, 18), c[0], c[1]);
    g.stroke();
  }
  for (let i = 0; i < count; i++) {
    const c = cs[Math.floor(rand() * cs.length)];
    const x = c[0] + rand.gauss() * spread, y = c[1] + rand.gauss() * spread;
    const s = rand.range(size[0], size[1]);
    if (Math.hypot(x - 128, y - 128) > limit(Math.atan2(y - 128, x - 128)) - s * 0.4 + rand.range(-6, 6)) continue;
    const t = i / count;
    g.fillStyle = grey(dark + (252 - dark) * t + rand.range(-16, 14), rand.range(-7, 9));
    g.save(); g.translate(x, y); g.rotate(rand() * TAU); leaf(g, s); g.restore();
  }
}

function needles(g, rand, x0, y0, x1, y1, len, lo, hi) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  // feathery, forward-swept and irregular (an even perpendicular comb reads as a staircase / moire on screen)
  const n = Math.max(2, Math.floor(L / 2.6));
  for (let i = 0; i <= n; i++) {
    const t = Math.min(1, Math.max(0, (i + rand.range(-0.45, 0.45)) / n)), px = x0 + dx * t, py = y0 + dy * t;
    for (const sd of [-1, 1]) {
      const f = rand.range(0.7, 1.7), l = (len * rand.range(0.55, 1.5)) / Math.hypot(1, f * 0.7);
      g.lineWidth = rand.range(1.1, 1.9);
      g.strokeStyle = grey(rand.range(lo, hi), rand.range(-8, 2));
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + (nx * sd + (dx / L) * f) * l, py + (ny * sd + (dy / L) * f) * l); g.stroke();
    }
  }
}

// short needles in whorls along a twig (the look of 雪松 spur shoots): breaks the herringbone that two combs of swept
// needles make, which read as woven fabric from under the boughs
function rosettes(g, rand, x0, y0, x1, y1, r, lo, hi) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(L / (r * 0.95)));
  for (let i = 0; i <= n; i++) {
    const t = Math.min(1, Math.max(0, (i + rand.range(-0.4, 0.4)) / n));
    const px = x0 + (x1 - x0) * t + rand.range(-r, r) * 0.55, py = y0 + (y1 - y0) * t + rand.range(-r, r) * 0.55, a0 = rand() * TAU;
    for (let k = 0; k < 8; k++) {
      const a = a0 + (k / 8) * TAU + rand.range(-0.3, 0.3), l = r * rand.range(0.6, 1.15);
      g.lineWidth = rand.range(1.0, 1.7);
      g.strokeStyle = grey(rand.range(lo, hi), rand.range(-8, 2));
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke();
    }
  }
}

function cedarTop(g, rand) {
  g.lineCap = 'round';
  const yEnd = 128 + rand.range(-8, 8);
  const env = (t) => (t < 0.22 ? 0.4 + 0.6 * (t / 0.22) : 1 - 0.9 * ((t - 0.22) / 0.78) ** 1.15);
  const twigs = [];
  // irregular: uneven spacing, the two sides out of step, mixed angles and lengths, a few forked (an even comb of
  // parallel twigs read as a woven chevron fabric overhead)
  for (const sd of [-1, 1]) {
    for (let x = 12 + rand() * 10; x < 240; x += rand.range(8, 21)) {
      const t = (x - 8) / 240, y = 128 + (yEnd - 128) * t;
      const len = 100 * env(t) * rand.range(0.42, 1.1), a = rand.range(0.55, 1.3);
      const x1 = x + Math.cos(a) * len, y1 = y + sd * Math.sin(a) * len;
      twigs.push([x, y, x1, y1]);
      if (len > 45 && rand() < 0.55) {
        const f = rand.range(0.3, 0.6), a2 = a + (rand() < 0.5 ? -1 : 1) * rand.range(0.4, 0.75), l2 = len * rand.range(0.35, 0.6);
        const fx = x + (x1 - x) * f, fy = y + (y1 - y) * f;
        twigs.push([fx, fy, fx + Math.cos(a2) * l2, Math.max(6, Math.min(250, fy + sd * Math.sin(a2) * l2))]);
      }
    }
  }
  twigs.push([200, 128, 250, yEnd]);
  for (const w of twigs) { g.strokeStyle = grey(118, -5); g.lineWidth = 8; g.beginPath(); g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); g.stroke(); }
  for (const w of twigs) { g.strokeStyle = grey(96, -4); g.lineWidth = 4; g.beginPath(); g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); g.stroke(); }
  g.strokeStyle = grey(74, 6); g.lineWidth = 4.5; g.beginPath(); g.moveTo(4, 128); g.lineTo(246, yEnd); g.stroke();
  for (const w of twigs) needles(g, rand, w[0], w[1], w[2], w[3], 7.5, 120, 190);
  for (const w of twigs) rosettes(g, rand, w[0], w[1], w[2], w[3], 6.5, 150, 215);
  for (const w of twigs) rosettes(g, rand, w[0], w[1], w[2], w[3], 5.5, 195, 252);
}

function cedarSide(g, rand) {
  g.lineCap = 'round';
  const by = (x) => 52 + 40 * (x / 256) ** 1.6;
  const twigs = [];
  for (let x = 10; x < 246; x += 11) {
    const t = x / 256, len = (46 + 90 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7) * rand.range(0.7, 1.1);
    const lean = rand.range(-0.1, 0.35);
    twigs.push([x, by(x), x + lean * len, by(x) + len]);
    if (rand() < 0.5) twigs.push([x, by(x), x + rand.range(4, 12), by(x) - rand.range(8, 18)]);
  }
  for (const w of twigs) { g.strokeStyle = grey(114, -5); g.lineWidth = 7; g.beginPath(); g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); g.stroke(); }
  for (const w of twigs) { g.strokeStyle = grey(92, -4); g.lineWidth = 4; g.beginPath(); g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); g.stroke(); }
  g.strokeStyle = grey(72, 6); g.lineWidth = 5;
  g.beginPath(); g.moveTo(2, by(2)); for (let x = 12; x <= 250; x += 10) g.lineTo(x, by(x)); g.stroke();
  for (const w of twigs) needles(g, rand, w[0], w[1], w[2], w[3], 7, 112, 185);
  for (const w of twigs) rosettes(g, rand, w[0], w[1], w[2], w[3], 6, 145, 210);
  for (const w of twigs) rosettes(g, rand, w[0], w[1], w[2], w[3], 5, 190, 250);
}

function juniper(g, rand) {
  // a flame: pointed at the top, full at the bottom, ragged edge; fine upward scale-leaf strokes
  const half = (y) => { const t = Math.max(0, Math.min(1, (y - 8) / 240)); return 104 * Math.sin(Math.PI * t ** 0.62) ** 0.75 * (1 + 0.07 * Math.sin(y * 0.21) + 0.05 * Math.sin(y * 0.53 + 1)); };
  g.fillStyle = grey(134, -5);
  g.beginPath();
  for (let y = 8; y <= 248; y += 4) g.lineTo(128 - half(y) * 0.94, y);
  for (let y = 248; y >= 8; y -= 4) g.lineTo(128 + half(y) * 0.94, y);
  g.closePath();
  g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 3000; i++) {
    const y = 10 + 236 * rand(), x = 128 + (rand() * 2 - 1) * half(y), t = i / 3000;
    const h = rand.range(5, 11), bend = rand.range(-4, 4);
    g.strokeStyle = grey(122 + 124 * t * t + rand.range(-16, 12), rand.range(-9, 0));
    g.lineWidth = rand.range(1.2, 2.4);
    g.beginPath(); g.moveTo(x, y + h * 0.5); g.quadraticCurveTo(x + bend, y, x + bend * 0.4, y - h * 0.5); g.stroke();
  }
}

function tuft(g, rand, x, y, r, a0, a1, lo, hi) {
  g.lineWidth = 1.6;
  for (let i = 0; i < 20; i++) {
    const a = rand.range(a0, a1), l = r * rand.range(0.65, 1.1);
    g.strokeStyle = grey(rand.range(lo, hi), rand.range(-7, 3));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}
function pineTop(g, rand) {
  g.lineCap = 'round';
  const pts = [];
  for (let i = 0; i < 400 && pts.length < 34; i++) {
    const a = rand() * TAU, r = 94 * Math.sqrt(rand()) * (0.82 + 0.18 * Math.sin(a * 3 + 2));
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.92;
    if (pts.every((p) => Math.hypot(p[0] - x, p[1] - y) > 23)) pts.push([x, y]);
  }
  g.strokeStyle = grey(60, 8); g.lineWidth = 3;
  for (const p of pts) if (rand() < 0.5) { g.beginPath(); g.moveTo(128, 128); g.lineTo(p[0], p[1]); g.stroke(); }
  for (const p of pts) { g.fillStyle = grey(86, -4); g.beginPath(); g.arc(p[0], p[1], 15, 0, TAU); g.fill(); }
  for (const p of pts) tuft(g, rand, p[0], p[1], 21, 0, TAU, 96, 170);
  for (const p of pts) tuft(g, rand, p[0], p[1], 17, 0, TAU, 160, 245);
}
function pineSide(g, rand) {
  g.lineCap = 'round';
  const pts = [];
  for (let i = 0; i < 500 && pts.length < 30; i++) {
    const x = rand.range(26, 230), dome = Math.sqrt(Math.max(0, 1 - ((x - 128) / 108) ** 2));
    const y = 158 - dome * rand() * 78;
    if (pts.every((p) => Math.hypot(p[0] - x, p[1] - y) > 19)) pts.push([x, y]);
  }
  g.strokeStyle = grey(60, 8); g.lineWidth = 3.5;
  for (const p of pts) if (rand() < 0.45) { g.beginPath(); g.moveTo(128 + (p[0] - 128) * 0.3, 176); g.lineTo(p[0], p[1]); g.stroke(); }
  for (const p of pts) { g.fillStyle = grey(84, -4); g.beginPath(); g.arc(p[0], p[1], 14, 0, TAU); g.fill(); }
  for (const p of pts) tuft(g, rand, p[0], p[1], 22, -Math.PI - 0.5, 0.5, 92, 170);
  for (const p of pts) tuft(g, rand, p[0], p[1], 18, -Math.PI - 0.2, 0.2, 165, 245);
}

function sprigTwigs(g, rand, n, top = 30, radial = false) {
  const all = [];
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    // radial: a rounded spray growing out of the tile centre (blossom); otherwise a fan rising from the bottom edge
    const ra = (k / n) * TAU + rand.range(-0.3, 0.3), rr = rand.range(78, 108);
    const sx = radial ? 128 + rand.range(-8, 8) : 128 + rand.range(-10, 10), sy = radial ? 136 + rand.range(-8, 8) : 240;
    let x = sx, y = sy;
    const tx = radial ? 128 + Math.cos(ra) * rr : 128 + ((k + 0.5) / n - 0.5) * 210 + rand.range(-14, 14);
    const ty = radial ? 128 + Math.sin(ra) * rr : top + rand.range(0, 60) + Math.abs((k + 0.5) / n - 0.5) * 90;
    const segs = 5, pts = [[x, y]];
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      x = sx + (tx - sx) * t ** 0.8 + rand.range(-9, 9); y = sy + (ty - sy) * t + rand.range(-7, 7);
      pts.push([x, y]);
    }
    for (let i = 0; i < segs; i++) {
      g.strokeStyle = grey(58, 8); g.lineWidth = 4.2 - i * 0.55;
      g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke();
      if (i > 0 && rand() < 0.75) {   // side spur
        const sx = pts[i][0] + rand.range(-34, 34), sy = pts[i][1] - rand.range(14, 40);
        g.lineWidth = 2; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(sx, sy); g.stroke();
        all.push([pts[i], [sx, sy]]);
      }
      all.push([pts[i], pts[i + 1]]);
    }
  }
  return all;
}
function along(rand, segs, n, jitter, fn) {
  for (let i = 0; i < n; i++) {
    const s = segs[Math.floor(rand() * segs.length)], t = rand();
    const x = s[0][0] + (s[1][0] - s[0][0]) * t + rand.gauss() * jitter, y = s[0][1] + (s[1][1] - s[0][1]) * t + rand.gauss() * jitter;
    if (Math.hypot(x - 128, y - 128) > 116) continue;
    fn(x, y, i / n);
  }
}
function blossom(leaves) {
  return (g, rand) => {
    const segs = sprigTwigs(g, rand, 9, 30, true);
    if (leaves) along(rand, segs, leaves, 12, (x, y) => {
      g.fillStyle = grey(rand.range(135, 175), 4); g.save(); g.translate(x, y); g.rotate(rand() * TAU); leafOval(g, rand.range(12, 16)); g.restore();
    });
    along(rand, segs, 900, 11, (x, y, t) => {
      g.fillStyle = grey(160 + 92 * t + rand.range(-16, 10), rand.range(-3, 6));
      g.save(); g.translate(x, y); g.rotate(rand() * TAU); flower(g, rand.range(8, 12)); g.restore();
    });
  };
}
function crapeLeaf(g, rand) {
  const segs = sprigTwigs(g, rand, 6, 24);
  along(rand, segs, 380, 9, (x, y, t) => {
    g.fillStyle = grey(140 + 110 * t + rand.range(-14, 12), rand.range(-6, 8));
    g.save(); g.translate(x, y); g.rotate(rand() * TAU); leafOval(g, rand.range(13, 18)); g.restore();
  });
}
function panicle(g, rand) {
  // loose conical flower spike, base at the bottom of the tile, about 1 : 1.8, ragged with side sprays
  g.lineCap = 'round';
  const bend = rand.range(-14, 14), axisX = (t) => 128 + bend * t * t;        // t: 0 base .. 1 tip
  g.strokeStyle = grey(86, 8); g.lineWidth = 3;
  g.beginPath(); g.moveTo(128, 250); g.quadraticCurveTo(128, 150, axisX(1), 22); g.stroke();
  const sprays = [];
  for (let i = 0; i < 11; i++) {
    const t = 0.1 + 0.8 * (i / 10), sd = i % 2 ? 1 : -1, len = (58 * (1 - t) ** 0.8 + 9) * rand.range(0.7, 1.15);
    const x0 = axisX(t), y0 = 250 - 228 * t, x1 = x0 + sd * len, y1 = y0 - len * rand.range(0.25, 0.7);
    g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    sprays.push([x0, y0, x1, y1]);
  }
  sprays.push([128, 236, axisX(1), 22]);
  for (let i = 0; i < 520; i++) {
    const w = sprays[Math.floor(rand() * sprays.length)], t = rand() ** 0.7, u = i / 520;
    const x = w[0] + (w[2] - w[0]) * t + rand.gauss() * 5.5, y = w[1] + (w[3] - w[1]) * t + rand.gauss() * 5.5;
    if (y < 8 || y > 246 || x < 30 || x > 226) continue;
    g.fillStyle = grey(150 + 100 * u + rand.range(-18, 8), rand.range(-4, 5));
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + rand.range(-3, 3), y + rand.range(-3, 3), rand.range(2.6, 4.6), 0, TAU); g.fill(); }
  }
}
function solid(g) { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); }

const DRAW = [
  (g, r) => cluster(g, r, { count: 620, leaf: leafGinkgo, size: [12, 17], blobs: 7, spread: 25, reach: 66 }),
  (g, r) => cluster(g, r, { count: 560, leaf: leafGinkgo, size: [12, 18], blobs: 6, spread: 26, reach: 62 }),
  (g, r) => cluster(g, r, { count: 420, leaf: leafMaple, size: [16, 22], blobs: 6, spread: 27, reach: 66 }),
  (g, r) => cluster(g, r, { count: 380, leaf: leafMaple, size: [16, 23], blobs: 5, spread: 28, reach: 62 }),
  (g, r) => cluster(g, r, { count: 170, leaf: leafPlane, size: [23, 31], blobs: 6, spread: 26, reach: 64, twig: 3.5 }),
  (g, r) => cluster(g, r, { count: 150, leaf: leafPlane, size: [24, 33], blobs: 5, spread: 28, reach: 58, twig: 3.5 }),
  cedarTop, cedarSide, juniper, pineTop, pineSide, blossom(0), blossom(26), crapeLeaf, panicle, solid,
];

export function buildAtlas(ctx) {
  const S = ctx.quality.tier === 'low' ? 256 : 512, size = S * ATLAS_N;
  const { canvas, g } = ctx.tex.makeCanvas(size, size);
  g.clearRect(0, 0, size, size);
  DRAW.forEach((fn, i) => {
    g.save();
    g.translate((i % ATLAS_N) * S, Math.floor(i / ATLAS_N) * S);
    g.beginPath(); g.rect(0, 0, S, S); g.clip();
    g.scale(S / 256, S / 256);
    fn(g, ctx.rng.makeRng(`trees:atlas:${i}`));
    g.restore();
  });
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) { d[i] = 196; d[i + 1] = 198; d[i + 2] = 190; }
    else if (a < 255) {           // partially covered edge: pull toward the bleed colour so edges never go dark
      const k = a / 255;
      d[i] = d[i] * k + 196 * (1 - k); d[i + 1] = d[i + 1] * k + 198 * (1 - k); d[i + 2] = d[i + 2] * k + 190 * (1 - k);
    }
  }
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(4, ctx.quality.anisotropy || 1);
  tex.needsUpdate = true;
  tex.name = 'trees:atlas';
  return { texture: tex, size };
}

/** Mottled plane-tree bark: cream ground with olive / grey-green / pale flakes. Tiles in both directions (2 m tile). */
export function buildPlaneBark(ctx) {
  const S = 256;
  const { canvas, g } = ctx.tex.makeCanvas(S, S);
  const rand = ctx.rng.makeRng('trees:planebark');
  g.fillStyle = '#C9C4A8'; g.fillRect(0, 0, S, S);
  const cols = ['#8C9070', '#8C9070', '#a5a383', '#dcd7c0', '#7a7d60', '#b8b08e', '#e3dfcb', '#96987a'];
  for (let i = 0; i < 95; i++) {
    const cx = rand() * S, cy = rand() * S, rx = rand.range(7, 22), ry = rx * rand.range(1.3, 2.6), ph = rand() * TAU;
    g.fillStyle = cols[Math.floor(rand() * cols.length)];
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * TAU, r = 1 + 0.28 * Math.sin(a * 3 + ph) + 0.16 * Math.sin(a * 5 + ph * 2);
        const x = cx + ox + Math.cos(a) * rx * r, y = cy + oy + Math.sin(a) * ry * r;
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.fill();
    }
  }
  const tex = ctx.tex.canvasTexture(canvas, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.name = 'trees:planebark';
  return tex;
}
