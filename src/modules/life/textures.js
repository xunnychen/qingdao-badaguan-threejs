// Canvas textures of the life package. All of them are light, nearly neutral "value" maps: the hue comes from vertex /
// instance colours and live preset uniforms, so one texture serves every season.
// Alpha textures are pre-filled with white at alpha 2/255 so that bilinear / mip filtering never drags black into the
// leaf edges (canvas storage is premultiplied; fully transparent pixels would otherwise upload as black).

const TAU = Math.PI * 2;
/** litter atlas: pixels per tile, metres per tile for [drift, scatter] rows, and where the drift's straight edge sits (fraction of the tile from its centre) */
export const LITTER_TILE = 384, LITTER_M = [1.5, 2.0], LITTER_EDGE = 0.34;

/** unit leaf outlines, centred, stem toward +y (canvas down). Size about 1 unit across. */
export const LEAF_PATHS = {
  ginkgo(g) {
    g.beginPath(); g.moveTo(0, 0.5);
    const a0 = -Math.PI / 2 - 1.06, a1 = -Math.PI / 2 + 1.06, n = 14;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const r = (1 - 0.2 * Math.exp(-(((i - n / 2) / 1.1) ** 2))) * (0.965 + 0.035 * Math.cos(i * 2.6));
      g.lineTo(Math.cos(a) * r, 0.5 + Math.sin(a) * r);
    }
    g.closePath();
  },
  maple(g) { lobed(g, 0.36, 0.6); },
  plane(g) { lobed(g, 0.6, 0.56); },
  petal(g) { g.beginPath(); g.ellipse(0, 0, 0.3, 0.48, 0, 0, TAU); g.closePath(); },
};
function lobed(g, valley, k) {
  const P = [[180, 0.3], [-150, 0.5], [-108, 0.72], [-80, valley], [-52, 0.9], [-26, valley], [0, 1], [26, valley], [52, 0.9], [80, valley], [108, 0.72], [150, 0.5]];
  g.beginPath();
  P.forEach(([deg, r], i) => {
    const a = (deg * Math.PI) / 180, x = Math.sin(a) * r * k, y = -Math.cos(a) * r * k + 0.08;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  });
  g.closePath();
}
const KINDS = ['ginkgo', 'maple', 'plane', 'petal'];

export function createLifeTextures(ctx) {
  const { tex, rng } = ctx;
  const made = [];
  const finish = (canvas, { wrapS = false, wrapT = false } = {}) => {
    const t = tex.canvasTexture(canvas, { srgb: true, wrap: false });
    const T = ctx.THREE;
    t.wrapS = wrapS ? T.RepeatWrapping : T.ClampToEdgeWrapping;
    t.wrapT = wrapT ? T.RepeatWrapping : T.ClampToEdgeWrapping;
    made.push(t);
    return t;
  };
  const alphaCanvas = (w, h) => {
    const c = tex.makeCanvas(w, h);
    c.g.clearRect(0, 0, w, h);
    c.g.fillStyle = 'rgba(255,255,255,0.008)';
    c.g.fillRect(0, 0, w, h);
    return c;
  };
  const leaf = (g, kind, x, y, size, rot, fill, shadow) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(size, size);
    if (shadow) { g.save(); g.translate(0.07, 0.09); LEAF_PATHS[kind](g); g.fillStyle = shadow; g.fill(); g.restore(); }
    LEAF_PATHS[kind](g);
    g.fillStyle = fill; g.fill();
    g.restore();
  };
  const tone = (rand, lo = 0.74, warm = 0.16) => {
    const v = lo + (1 - lo) * rand(), w = 1 - warm * rand(), c = 1 - warm * 1.6 * rand();
    return `rgb(${Math.round(255 * v)},${Math.round(255 * v * w)},${Math.round(255 * v * w * c)})`;
  };

  // ---- 1. hedge / shrub foliage tile (opaque, tileable) --------------------------------------------------------------
  let leafy;
  {
    const N = 256, { canvas, g } = tex.makeCanvas(N, N), rand = rng.makeRng('life:tex:leafy');
    g.fillStyle = 'rgb(84,92,74)'; g.fillRect(0, 0, N, N);
    const leaves = [];
    for (let i = 0; i < 2300; i++) leaves.push({ x: rand() * N, y: rand() * N, rx: 3.6 + rand() * 3.6, a: rand() * TAU, v: 0.42 + 0.58 * Math.pow(rand(), 0.75), w: rand() });
    leaves.sort((a, b) => a.v - b.v);
    for (const l of leaves) {
      const v = Math.round(255 * l.v);
      for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
        const x = l.x + dx, y = l.y + dy;
        if (x < -8 || x > N + 8 || y < -8 || y > N + 8) continue;
        g.fillStyle = `rgb(${Math.round(v * (0.9 + 0.1 * l.w))},${v},${Math.round(v * (0.8 + 0.12 * l.w))})`;
        g.beginPath(); g.ellipse(x, y, l.rx, l.rx * 0.5, l.a, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.7;      // lit edge: reads as a glossy clipped leaf
        g.beginPath(); g.ellipse(x, y, l.rx * 0.9, l.rx * 0.42, l.a, Math.PI, Math.PI * 1.9); g.stroke();
      }
    }
    leafy = finish(canvas, { wrapS: true, wrapT: true });
    leafy.repeat.set(1 / 0.85, 1 / 0.85);
  }

  // ---- 2. creeper sheet: dense at the top, ragged tendrils below (alpha, tiles along u) -------------------------------
  let creeper;
  {
    const N = 256, { canvas, g } = alphaCanvas(N, N), rand = rng.makeRng('life:tex:creeper');
    const put = (x, y, s) => {
      for (const dx of [-N, 0, N]) {
        if (x + dx < -16 || x + dx > N + 16) continue;
        leaf(g, 'maple', x + dx, y, s, (rand() - 0.5) * 1.6 + Math.PI * 0.08, tone(rand, 0.55, 0.12), 'rgba(40,36,30,0.9)');
      }
    };
    for (let i = 0; i < 520; i++) put(rand() * N, N * 0.62 * Math.pow(rand(), 0.85), 15 + rand() * 9);
    for (let c = 0; c < 11; c++) {
      const x0 = rand() * N, end = N * (0.74 + 0.26 * rand()), ph = rand() * 9;
      for (let y = N * 0.5; y < end; y += 6 + rand() * 4) put(x0 + Math.sin(y * 0.05 + ph) * 9 + (rand() - 0.5) * 9, y, 12 + rand() * 8 * (1 - (y - N * 0.5) / N));
    }
    creeper = finish(canvas, { wrapS: true });
  }

  // ---- 3. litter atlas: 4 species x (kerb drift, loose scatter) -----------------------------------------------------------
  // Row 0 is a DRIFT: a ragged band of leaves banked against a straight edge (the kerb or the wall foot, toward the
  // bottom of the tile), thinning out toward the top; tiles overlap along the kerb into one continuous line.
  // Row 1 is loose scatter. The litter module lays row 0 at LITTER_M[0] metres per tile and row 1 at LITTER_M[1], and the
  // leaf sizes below are chosen so that a leaf has the same real size in both (ginkgo and maple about 9-10 cm, plane
  // about 14 cm, petals about 3 cm).
  let litter;
  {
    const C = LITTER_TILE, { canvas, g } = alphaCanvas(C * 4, C * 2), rand = rng.makeRng('life:tex:litter');
    const SPEC = [
      { kind: 'ginkgo', dense: 360, sparse: 105, size: [12.5, 16.5], small: [9.5, 12.5] },
      { kind: 'maple', dense: 330, sparse: 95, size: [18, 24], small: [13.5, 18] },
      { kind: 'plane', dense: 190, sparse: 58, size: [28, 36], small: [21, 27.5] },
      { kind: 'petal', dense: 1700, sparse: 460, size: [7, 10], small: [5.4, 7.4] },
    ];
    SPEC.forEach((S, col) => {
      for (let row = 0; row < 2; row++) {
        const n = row ? S.sparse : S.dense, cx = col * C + C / 2, cy = row * C + C / 2;
        const sz = row ? S.small : S.size, m = sz[1] * 0.95 + 3, edge = C * LITTER_EDGE;
        const p1 = rand() * TAU, p2 = rand() * TAU;
        g.save(); g.beginPath(); g.rect(col * C + 1, row * C + 1, C - 2, C - 2); g.clip();
        for (let i = 0; i < n; i++) {
          const x = (rand() - 0.5) * (C - 2 * m);
          let y;
          if (row || i % 11 === 0) {
            y = (rand() - 0.5) * (C - 2 * m);
            // loose leaves thin out toward the rim of the tile, so that a tile never shows as a square from above
            const r = Math.hypot(x, y) / C + 0.05 * Math.sin(Math.atan2(y, x) * 3 + p1) + 0.03 * Math.sin(Math.atan2(y, x) * 7 + p2);
            if (rand() < (r - 0.3) / 0.2) continue;
          } else {
            // the two ends of a drift taper off (neighbouring tiles overlap by a third and hide it; a last tile ends softly)
            if (rand() < (Math.abs(x) / (C / 2 - m) - 0.72) / 0.28 * 0.9) continue;
            // banked against the edge: exponential tail whose depth wanders along the kerb
            const depth = C * 0.105 * (0.55 + 0.5 * (1 + Math.sin(x * 0.021 + p1)) + 0.22 * Math.sin(x * 0.057 + p2));
            y = edge - m * 0.55 + Math.log(1 - rand() * 0.985) * depth;
            if (y < -C / 2 + m) continue;
          }
          const s = sz[0] + (sz[1] - sz[0]) * rand();
          leaf(g, S.kind, cx + x, cy + y, s, rand() * TAU, tone(rand, 0.7, S.kind === 'petal' ? 0.05 : 0.2), 'rgba(70,52,30,0.85)');
        }
        g.restore();
      }
    });
    litter = finish(canvas);
  }

  // ---- 4. single falling leaves: ginkgo, maple, plane, petal, water drop ------------------------------------------------
  let falling;
  {
    const C = 128, { canvas, g } = alphaCanvas(C * 8, C), rand = rng.makeRng('life:tex:falling');
    KINDS.forEach((kind, i) => {
      const cx = i * C + C / 2, cy = C / 2;
      leaf(g, kind, cx, cy, kind === 'petal' ? 104 : 108, 0, 'rgb(255,250,240)');
      // soft shading + veins so a tumbling leaf is not a flat sticker
      g.save(); g.translate(cx, cy); g.scale(108, 108); LEAF_PATHS[kind](g); g.clip();
      const gr = g.createLinearGradient(-0.5, -0.5, 0.5, 0.5);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(120,90,50,0.38)');
      g.fillStyle = gr; g.fillRect(-1, -1, 2, 2);
      g.strokeStyle = 'rgba(110,80,40,0.45)'; g.lineWidth = 0.018;
      const veins = kind === 'ginkgo' ? 9 : kind === 'petal' ? 1 : 5;
      for (let v = 0; v < veins; v++) {
        const a = veins === 1 ? 0 : ((v / (veins - 1)) - 0.5) * (kind === 'ginkgo' ? 1.9 : 3.3);
        g.beginPath(); g.moveTo(0, kind === 'ginkgo' ? 0.5 : 0.2); g.lineTo(Math.sin(a) * 0.9, (kind === 'ginkgo' ? 0.5 : 0.1) - Math.cos(a) * 0.9); g.stroke();
      }
      g.restore();
    });
    g.fillStyle = 'rgb(255,255,255)';
    g.beginPath(); g.ellipse(4 * C + C / 2, C / 2, 4.6, 58, 0, 0, TAU); g.fill();
    void rand;
    falling = finish(canvas);
  }

  // ---- 5. grass tuft -------------------------------------------------------------------------------------------------
  let tuft;
  {
    const N = 128, { canvas, g } = alphaCanvas(N, N), rand = rng.makeRng('life:tex:tuft');
    const blades = [];
    for (let i = 0; i < 34; i++) blades.push({ x: 30 + rand() * 68, lean: (rand() - 0.5) * 84, top: 6 + rand() * 70, w: 1.9 + rand() * 1.9, v: 0.78 + 0.22 * rand(), y: rand() });
    blades.sort((a, b) => b.top - a.top);
    for (const b of blades) {
      const v = Math.round(255 * b.v), tx = b.x + b.lean, mx = b.x + b.lean * 0.28, my = (N + b.top) / 2;
      g.fillStyle = `rgb(${Math.round(v * (0.92 + 0.08 * b.y))},${v},${Math.round(v * 0.86)})`;
      g.beginPath(); g.moveTo(b.x - b.w, N); g.quadraticCurveTo(mx - b.w * 0.7, my, tx, b.top);
      g.quadraticCurveTo(mx + b.w * 0.7, my, b.x + b.w, N); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, N, 0, N * 0.45);
    gr.addColorStop(0, 'rgba(40,46,24,0.42)'); gr.addColorStop(1, 'rgba(40,46,24,0)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'source-over';
    tuft = finish(canvas);
  }

  return { leafy, creeper, litter, falling, tuft, dispose() { for (const t of made) t.dispose(); } };
}
