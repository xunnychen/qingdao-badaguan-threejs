// Minimap: a static plan pre-rendered from MAP into a canvas (north up) and a player arrow that is only ever moved with
// a CSS transform, so walking costs no canvas work and no layout.
const INK = '#f3efe4', SEA = '#1b3238', LAND = '#2b4038', PARK = '#48683f', ROCK = '#7b6858';   // sand is #cdbb8c, see draw()
const ROAD = '#ded8c6', ROOF = '#b5482e', GOLD = '#e2b32e', WOOD = '#b98f5e';

export function createMinimap(ctx, cssWidth) {
  const { map, env, world } = ctx;
  const B = map.BOUNDS, spanX = B.maxX - B.minX, spanZ = B.maxZ - B.minZ;
  const cssHeight = Math.round((cssWidth * spanZ) / spanX);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const k = cssWidth / spanX;                                     // css px per metre

  const el = document.createElement('div');
  el.className = 'ui-map';
  el.style.width = `${cssWidth}px`; el.style.height = `${cssHeight}px`;
  const cv = document.createElement('canvas');
  cv.width = Math.round(cssWidth * dpr); cv.height = Math.round(cssHeight * dpr);
  cv.setAttribute('aria-hidden', 'true');
  const arrow = document.createElement('div');
  arrow.className = 'ui-map-arrow';
  arrow.innerHTML = '<svg viewBox="-20 -20 40 40" width="48" height="48" aria-hidden="true">'
    + '<path d="M0 0 L-14 -18 A23 23 0 0 1 14 -18 Z" fill="rgba(255,244,214,.3)"/>'
    + '<path d="M0 -7.5 L5 5.5 L0 3 L-5 5.5 Z" fill="#fff6dc" stroke="#16262b" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  el.append(cv, arrow);

  const X = (x) => (x - B.minX) * k, Z = (z) => (z - B.minZ) * k;
  const line = (g, pts) => { g.beginPath(); for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(X(pts[i][0]), Z(pts[i][1])); else g.moveTo(X(pts[i][0]), Z(pts[i][1])); } };

  function draw() {
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    // sea, with a slightly lighter shelf near the shore
    g.fillStyle = SEA; g.fillRect(0, 0, cssWidth, cssHeight);
    const wl = map.coast.waterline, bl = map.coast.backline;
    line(g, wl); g.strokeStyle = 'rgba(111,170,160,.16)'; g.lineWidth = 26 * k; g.stroke();
    line(g, wl); g.strokeStyle = 'rgba(140,196,184,.2)'; g.lineWidth = 9 * k; g.stroke();
    // land north of the waterline
    line(g, wl); g.lineTo(X(1200), Z(-1200)); g.lineTo(X(-1200), Z(-1200)); g.closePath();
    g.fillStyle = LAND; g.fill();
    // shore zone between the waterline and the coast path: rock, sand on the bathing beach
    const shore = () => { line(g, bl); for (let i = wl.length - 1; i >= 0; i--) g.lineTo(X(wl[i][0]), Z(wl[i][1])); g.closePath(); };
    shore(); g.fillStyle = ROCK; g.fill();
    // sand where the world says the shore is beach: world.beachness(x) sampled into a west-east gradient, so the map
    // follows the coast package and the sand feathers into the rock instead of stopping at a ruled line
    if (world && world.beachness) {
      const grad = g.createLinearGradient(0, 0, cssWidth, 0), N = 96;
      for (let i = 0; i <= N; i++) {
        const b = Math.max(0, Math.min(1, world.beachness(B.minX + (spanX * i) / N)));
        grad.addColorStop(i / N, `rgba(205,187,140,${(b * b * (3 - 2 * b)).toFixed(3)})`);
      }
      shore(); g.fillStyle = grad; g.fill();
    }
    line(g, wl); g.strokeStyle = 'rgba(243,239,228,.5)'; g.lineWidth = 0.8; g.stroke();   // surf line

    // parks
    g.fillStyle = PARK;
    for (const p of map.parks) { line(g, p.poly); g.closePath(); g.fill(); }

    // street trees in the colours of the current season: 一路一樹 reads straight off the plan
    const foliage = env.target.foliage || {};
    const hex = (c) => (c && c.isColor ? `#${c.getHexString()}` : c);
    for (const t of map.trees) {
      const pal = foliage[t.species];
      g.fillStyle = (pal && hex(pal[t.tone % pal.length])) || '#4f7a45';
      const r = Math.max(1.5, t.r * k * (t.garden ? 0.7 : 1));
      g.globalAlpha = t.garden ? 0.5 : 1;
      g.beginPath(); g.arc(X(t.x), Z(t.z), r, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;

    // footpaths, then streets (casing first so junctions merge)
    g.strokeStyle = 'rgba(222,216,198,.55)';
    for (const p of map.paths) { line(g, p.pts); g.lineWidth = Math.max(0.8, p.width * k * 0.7); g.stroke(); }
    g.strokeStyle = 'rgba(22,38,43,.55)';
    for (const s of map.streets) { line(g, s.pts); g.lineWidth = Math.max(1.6, s.width * k) + 1.4; g.stroke(); }
    g.strokeStyle = ROAD;
    for (const s of map.streets) { line(g, s.pts); g.lineWidth = Math.max(1.2, s.width * k * 0.9); g.stroke(); }
    // promenade and boardwalk
    line(g, map.promenade.pts); g.strokeStyle = '#efe6cf'; g.lineWidth = Math.max(1.4, map.promenade.width * k * 0.9); g.stroke();
    g.save();
    line(g, map.boardwalk.pts); g.strokeStyle = WOOD; g.lineWidth = Math.max(1.4, map.boardwalk.width * k * 1.3); g.setLineDash([3, 2]); g.lineCap = 'butt'; g.stroke();
    g.restore();

    // villas: roof-red rectangles
    const rect = (r, inflate, fill, stroke) => {
      g.save();
      g.translate(X(r.x), Z(r.z)); g.rotate(-(r.rot || 0));
      const w = Math.max(2.4, (r.w + inflate) * k), d = Math.max(2.4, (r.d + inflate) * k);
      g.fillStyle = fill; g.fillRect(-w / 2, -d / 2, w, d);
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(-w / 2, -d / 2, w, d); }
      g.restore();
    };
    for (const l of map.lots) rect(l, 0, ROOF, 'rgba(22,38,43,.45)');
    for (const l of map.landmarks) rect(l, 3, GOLD, '#16262b');

    // labels
    g.textBaseline = 'middle';
    const fs = cssWidth >= 220 ? 11 : 10;
    g.font = `500 ${fs}px "Noto Serif TC","Source Han Serif TC","Songti TC",PMingLiU,serif`;
    g.lineWidth = 3; g.strokeStyle = 'rgba(16,28,32,.85)';
    const label = (text, x, y, align, fill = INK) => {
      g.textAlign = align; g.strokeText(text, x, y); g.fillStyle = fill; g.fillText(text, x, y);
    };
    for (const l of map.landmarks) {
      const px = X(l.x), py = Z(l.z), off = Math.max(l.w, l.d) * k * 0.5 + 5;
      const right = px < cssWidth - fs * (l.nameT.length + 1.5);
      label(l.nameT, right ? px + off : px - off, py, right ? 'left' : 'right');
    }
    g.font = `${fs}px "Noto Serif TC","Source Han Serif TC","Songti TC",PMingLiU,serif`;
    label('太 平 灣', X(-40), Z(196), 'center', 'rgba(190,222,214,.78)');
    // north mark
    g.font = `500 ${fs}px "Noto Serif TC","Source Han Serif TC","Songti TC",PMingLiU,serif`;
    const nx = cssWidth - 13, ny = 15;
    g.beginPath(); g.moveTo(nx, ny - 9); g.lineTo(nx + 3.4, ny - 2); g.lineTo(nx - 3.4, ny - 2); g.closePath();
    g.fillStyle = ROOF; g.strokeStyle = 'rgba(16,28,32,.85)'; g.lineWidth = 2; g.stroke(); g.fill();
    g.lineWidth = 3; label('北', nx, ny + 6, 'center');
  }
  draw();

  let lastX = NaN, lastZ = NaN, lastYaw = NaN;
  return {
    el, width: cssWidth, height: cssHeight,
    redraw: draw,
    /** Move the arrow (compass yaw in radians). Writes a transform only when something visibly changed. */
    setPlayer(x, z, yaw) {
      const px = Math.round(Math.max(0, Math.min(cssWidth, X(x))) * 2) / 2, pz = Math.round(Math.max(0, Math.min(cssHeight, Z(z))) * 2) / 2;
      const deg = Math.round((yaw * 180) / Math.PI);
      if (px === lastX && pz === lastZ && deg === lastYaw) return;
      lastX = px; lastZ = pz; lastYaw = deg;
      arrow.style.transform = `translate3d(${px}px,${pz}px,0) rotate(${deg}deg)`;
    },
  };
}
