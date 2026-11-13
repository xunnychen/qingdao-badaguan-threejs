// Small things that make the shore read as a real place: the seaweed wrack lines on the sand, the float line of the
// bathing beach, slow ships out in the haze, and simple silhouettes on the two far headlands.
import * as THREE from 'three';
import { waveY, waveSlope, shallowDamp } from './waves.js';

// ---- seaweed wrack ---------------------------------------------------------------------------------------------------
function wrackTexture(ctx) {
  const W = 1024, H = 256;
  const { canvas, g } = ctx.tex.makeCanvas(W, H);
  const rand = ctx.rng.makeRng('coast:wrack:tex');
  g.clearRect(0, 0, W, H);
  const wrap = (fn) => { for (const ox of [-W, 0, W]) fn(ox); };
  const dens = (x) => 0.5 + 0.5 * Math.sin((x / W) * Math.PI * 2 * 2 + 1.2) * Math.sin((x / W) * Math.PI * 2 * 3 + 0.4);
  // the damp stain under it all, so the strands never sit on clean sand
  for (let n = 0; n < 150; n++) {
    const x = rand.range(0, W), d = dens(x);
    if (rand() > 0.25 + d) continue;
    const y = H / 2 + rand.gauss() * H * 0.07, rx = rand.range(24, 70), ry = rand.range(10, 26) * (0.6 + 0.6 * d);
    wrap((ox) => {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
      gr.addColorStop(0, 'rgba(96,86,62,0.22)'); gr.addColorStop(1, 'rgba(96,86,62,0)');
      g.save(); g.translate(0, y * (1 - ry / rx)); g.scale(1, ry / rx);
      g.fillStyle = gr; g.fillRect(x + ox - rx, y - rx, rx * 2, rx * 2); g.restore();
    });
  }
  // fine dark debris: the stain the tide leaves
  for (let n = 0; n < 11000; n++) {
    const x = rand.range(0, W), d = dens(x);
    if (rand() > 0.15 + d) continue;
    const y = H / 2 + rand.gauss() * H * (0.08 + 0.1 * d);
    g.globalAlpha = rand.range(0.18, 0.5);
    g.fillStyle = rand.pick(['#5c553e', '#6a5f44', '#52543f', '#7a6b4c', '#857a5e']);
    g.fillRect(x, y, rand.range(1, 3.2), rand.range(1, 2.4));
  }
  // eelgrass strands and kelp ribbons, mostly lying along the line
  g.lineCap = 'round'; g.lineJoin = 'round';
  const cols = ['#6a6246', '#766a4a', '#5e6248', '#84704e', '#666e4c', '#795a42', '#585b46'];
  for (let n = 0; n < 1700; n++) {
    const x = rand.range(0, W), d = dens(x);
    if (rand() > 0.06 + d * 0.95) continue;
    const y = H / 2 + rand.gauss() * H * (0.06 + 0.08 * d);
    const blade = rand.chance(0.05);
    const len = blade ? rand.range(18, 40) : rand.range(10, 46);
    const a = rand.gauss() * 0.35 + (rand.chance(0.12) ? rand.range(-1.3, 1.3) : 0);
    const bend = rand.range(-0.5, 0.5) * len;
    g.strokeStyle = rand.pick(cols);
    g.globalAlpha = blade ? rand.range(0.3, 0.45) : rand.range(0.32, 0.7);
    g.lineWidth = blade ? rand.range(3, 4.5) : rand.range(0.9, 2.2);
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
    wrap((ox) => {
      g.beginPath(); g.moveTo(x + ox, y);
      g.quadraticCurveTo(x + ox + ex * 0.5 - Math.sin(a) * bend, y + ey * 0.5 + Math.cos(a) * bend, x + ox + ex, y + ey);
      g.stroke();
    });
  }
  // bleached shells and bits of driftwood
  for (let n = 0; n < 90; n++) {
    const x = rand.range(0, W), y = H / 2 + rand.gauss() * H * 0.13;
    g.globalAlpha = 0.9;
    g.fillStyle = rand.pick(['#d9d2c0', '#c9bfa6', '#8a7658', '#e6e0d2']);
    g.beginPath(); g.ellipse(x, y, rand.range(1.4, 3.4), rand.range(1, 2.4), rand.range(0, 3), 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  const t = ctx.tex.canvasTexture(canvas, { srgb: true, wrap: false });
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function buildWrack(ctx, group) {
  const { world, map } = ctx;
  const rand = ctx.rng.makeRng('coast:wrack');
  const wl = map.coast.waterline;
  const zOfWater = (x) => { for (let i = 0; i < wl.length - 1; i++) if (x >= wl[i][0] && x <= wl[i + 1][0]) return wl[i][1] + ((x - wl[i][0]) / (wl[i + 1][0] - wl[i][0])) * (wl[i + 1][1] - wl[i][1]); return 0; };
  const pos = [], uv = [], idx = [], rgba = [];
  // each line follows a height contour of the sand (the reach of the last high tides)
  const lines = [{ level: 0.42, width: 2.0, wob: 0.07, seed: 3, v0: 0, v1: 1 }, { level: 0.8, width: 1.3, wob: 0.07, seed: 9, v0: 0.1, v1: 0.9 }];
  for (const ln of lines) {
    const pts = [];
    for (let x = -236; x <= 56; x += 1.25) {
      const target = ln.level + (ctx.rng.valueNoise2(x * 0.06, ln.seed, 5) - 0.5) * 2 * ln.wob;
      let z = zOfWater(x) - 0.2, ok = false;
      for (let k = 0; k < 320; k++) { if (world.heightAt(x, z) >= target) { ok = true; break; } z -= 0.2; }
      const dn = ctx.rng.valueNoise2(x * 0.043, ln.seed + 20, 6);
      if (!ok || world.surfaceAt(x, z) !== 'sand' || dn < 0.27) { pts.push(null); continue; }
      pts.push([x, z, Math.min(1, (dn - 0.27) / 0.2)]);
    }
    // every run thins out over its first and last few metres instead of stopping on a line
    for (let i = 0; i < pts.length; i++) {
      if (!pts[i]) continue;
      let d = 4;
      for (let k = 1; k <= 3; k++) if (!pts[i - k] || !pts[i + k]) { d = k; break; }
      pts[i][3] = Math.min(1, (d - 1) / 3) * (0.5 + 0.5 * pts[i][2]);
    }
    let arc = rand.range(0, 6), prev = null, base = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p) { prev = null; base = -1; continue; }
      const a = pts[i - 1] || p, b = pts[i + 1] || p;
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      if (prev) arc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      const start = pos.length / 3;
      for (let k = 0; k < 3; k++) {
        const o = (k / 2 - 0.5) * ln.width;
        const x = p[0] - tz * o, z = p[1] + tx * o;
        pos.push(x, world.heightAt(x, z) + 0.07, z);
        uv.push(arc / 8, ln.v0 + (ln.v1 - ln.v0) * (k / 2));
        rgba.push(1, 1, 1, p[3]);
      }
      if (base >= 0) for (let k = 0; k < 2; k++) idx.push(base + k, start + k, base + k + 1, base + k + 1, start + k, start + k + 1);
      base = start; prev = p;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4));   // alpha: the soft ends of each run
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // make sure the ribbon faces up whatever the winding came out as
  const nor = geo.attributes.normal;
  let flip = false;
  for (let i = 0; i < nor.count; i++) if (nor.getY(i) < 0) { flip = true; break; }
  if (flip) { const ix = geo.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } geo.computeVertexNormals(); }
  const tex = wrackTexture(ctx);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, vertexColors: true, depthWrite: false, roughness: 0.9, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.name = 'coast:wrack';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'wrack'; mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  group.add(mesh);
  return { mesh, triangles: idx.length / 3, dispose() { geo.dispose(); mat.dispose(); tex.dispose(); } };
}

// ---- float line --------------------------------------------------------------------------------------------------------
export function buildBuoys(ctx, group) {
  const { world, map } = ctx;
  const [a, b] = map.coast.buoyLine;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / 3.4));
  const rand = ctx.rng.makeRng('coast:buoys');
  const geo = new THREE.SphereGeometry(0.21, 6, 4);
  geo.scale(1, 0.82, 1);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0 });
  mat.name = 'coast:buoy';
  const mesh = new THREE.InstancedMesh(geo, mat, n + 1);
  mesh.name = 'buoys';
  const items = [];
  const orange = new THREE.Color('#e8662a'), white = new THREE.Color('#efeadd'), c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a[0] + (b[0] - a[0]) * t + rand.range(-0.25, 0.25), z = a[1] + (b[1] - a[1]) * t + rand.range(-0.25, 0.25);
    const end = i === 0 || i === n || i === Math.round(n / 2);
    items.push({ x, z, s: end ? 2.4 : rand.range(0.9, 1.1), damp: shallowDamp(-world.heightAt(x, z)), ph: rand.range(0, 6.28), rot: rand.range(0, 6.28) });
    c.copy(end || i % 2 === 0 ? orange : white).multiplyScalar(rand.range(0.9, 1.05));
    mesh.setColorAt(i, c);
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  group.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), sl = [0, 0];
  function update(t) {
    const H = ctx.env.current.waveHeight;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const y = waveY(it.x, it.z, t, H) * it.damp + 0.035 * it.s * Math.sin(t * 1.9 + it.ph);
      waveSlope(it.x, it.z, t, H, sl);
      e.set(sl[1] * 2.5 + 0.1 * Math.sin(t * 1.3 + it.ph), it.rot, -sl[0] * 2.5 + 0.1 * Math.cos(t * 1.1 + it.ph), 'YXZ');
      m4.compose(p.set(it.x, y + 0.045 * it.s, it.z), q.setFromEuler(e), s.set(it.s, it.s, it.s));
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(ctx.state.time || 0);
  return { mesh, update, triangles: (geo.index.count / 3) * (n + 1), dispose() { geo.dispose(); mat.dispose(); mesh.dispose(); } };
}

// ---- ships ---------------------------------------------------------------------------------------------------------------
function hull(geo, len, h, beam, color, bow = 0.55) {
  // a box whose ends taper in plan: bow at +x
  const g = new THREE.BoxGeometry(len, h, beam, 6, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (len / 2);
    let k = 1;
    if (x > 0.5) k = 1 - bow * Math.pow((x - 0.5) / 0.5, 1.6) * 1.7; else if (x < -0.8) k = 0.86;
    pos.setZ(i, pos.getZ(i) * Math.max(0.04, k));
    if (pos.getY(i) < 0) pos.setZ(i, pos.getZ(i) * 0.8);
    if (pos.getY(i) > 0 && x > 0.6) pos.setY(i, pos.getY(i) + h * 0.22 * (x - 0.6) / 0.4); // sheer at the bow
  }
  g.translate(0, h / 2, 0);
  return geo.tint(geo.normalize(g), color);
}

export function buildShips(ctx, group) {
  const { geo } = ctx;
  const mat = ctx.mats.plain('#ffffff', 0.95, 0, { vertexColors: true });
  const rand = ctx.rng.makeRng('coast:ships');
  const B = (w, h, d, x, y, z, color) => geo.tint(geo.box(w, h, d, { x, y, z }), color);

  // a bulk carrier standing off the port approaches: long dark hull, white house aft, hatch covers
  const cargoParts = [hull(geo, 118, 7.5, 17, '#2d343c'), B(118 * 0.93, 0.9, 16.4, -2, -0.2, 0, '#6e2f25')];
  cargoParts.push(B(13, 13, 14, -46, 7.5, 0, '#e4e2da'), B(15, 1.2, 17, -46, 20.5, 0, '#d2d0c8'), B(4.5, 6, 4.5, -49, 21.7, 0, '#c2572c'));
  for (let i = 0; i < 5; i++) cargoParts.push(B(14, 1.6, 12.5, -28 + i * 17, 7.5, 0, i % 2 ? '#7a4a38' : '#8a5a40'));
  cargoParts.push(B(0.7, 12, 0.7, 44, 7.5, 0, '#b9b4a8'), B(0.6, 9, 0.6, -19.5, 9, 0, '#b9b4a8'));
  // a wooden trawler working the bay: green hull, white wheelhouse, mast with a steadying sail boom
  const trawlParts = [hull(geo, 21, 2.3, 5.6, '#2c5348', 0.6), B(20, 0.35, 5.3, -0.2, 2.1, 0, '#b9b3a2'),
    B(4.6, 2.5, 3.6, -4.5, 2.3, 0, '#ece8dc'), B(5.2, 0.25, 4.2, -4.5, 4.8, 0, '#3e5560'), B(0.22, 6.5, 0.22, 2.2, 2.3, 0, '#4a3a2c'),
    B(0.18, 4.2, 0.18, -7.6, 2.3, 0, '#4a3a2c'), B(6.5, 0.16, 0.16, 4.6, 7.2, 0, '#4a3a2c'), B(2.4, 1.0, 2.2, 5.6, 2.3, 0, '#c9662e')];

  const make = (parts, name) => {
    const g = geo.merge(parts);
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = false; m.receiveShadow = false;
    group.add(m);
    return m;
  };
  const ships = [make(cargoParts, 'ship-cargo'), make(trawlParts, 'ship-trawler')];
  const ph = rand.range(0, 6.28);
  // The carrier crosses far out (deep water all along z = 1180); its track wraps 2.8 km to either side, inside the haze,
  // and it shrinks to nothing over the last 250 m so nothing ever pops. The trawler works a long oval in the open bay
  // (deep water all the way round, clear of both headlands), so it never wraps at all.
  const CARGO = { z: 1180, x0: 560, v: -2.6, span: 5600, draft: 1.2 };
  const TRAWL = { cx: 90, cz: 545, a: 430, b: 62, w: 1.1 / 430, th0: 0.48, draft: 0.5 };
  function update(t) {
    const H = ctx.env.current.waveHeight;
    {
      const s = CARGO, half = s.span / 2, m = ships[0];
      const x = ((((s.x0 + s.v * (t - 12) + half) % s.span) + s.span) % s.span) - half;
      const k = Math.min(1, Math.max(0, (half - Math.abs(x)) / 250));
      m.visible = k > 0.002;
      m.scale.setScalar(Math.max(0.002, k * k * (3 - 2 * k)));
      m.position.set(x, -s.draft, s.z);
      m.rotation.set(0, s.v > 0 ? 0 : Math.PI, 0);
    }
    {
      const s = TRAWL, m = ships[1], th = s.th0 + s.w * (t - 12);
      const x = s.cx + s.a * Math.sin(th), z = s.cz + s.b * Math.cos(th);
      const dx = s.a * Math.cos(th), dz = -s.b * Math.sin(th);
      m.position.set(x, -s.draft + waveY(x, z, t, H) * 0.7, z);
      m.rotation.set(0.035 * Math.sin(t * 0.9 + ph), Math.atan2(-dz, dx), 0.03 * Math.sin(t * 0.7 + ph * 2), 'YXZ');
    }
  }
  update(ctx.state.time || 0);
  const tris = ships.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
  return { update, triangles: tris, dispose() { for (const m of ships) m.geometry.dispose(); } };
}

// ---- far headlands -------------------------------------------------------------------------------------------------------
export function buildFarSilhouettes(ctx, group) {
  const { geo, world, map } = ctx;
  const rand = ctx.rng.makeRng('coast:far');
  const parts = [];
  const col = new THREE.Color();
  const B = (w, h, d, x, z, rotY, color, y) => geo.tint(geo.box(w, h, d, { x, y: y ?? world.heightAt(x, z) - 1.5, z, rotY }), color);

  // 汇泉角: the pale hotel slab that closes the bay to the south-west, a podium and lower neighbours.
  // From 550 m across the bay these are silhouettes inside the haze: every colour is pulled well toward the horizon
  // (the scene fog does the rest per preset), and what gives them scale is the ruling of the floors, a stepped crown
  // and hipped roofs, not surface detail.
  const hq = map.coast.farHeadlands.find((h) => h.id === 'huiquanjiao') || { x: -560, z: 430 };
  const hx = hq.x - 30, hz = hq.z - 100;
  const rot = 0.42;
  const HAZE = new THREE.Color('#c3cfd6');
  const hazed = (hex, k = 0.46) => new THREE.Color(hex).lerp(HAZE, k);
  const ux = Math.cos(rot), uz = -Math.sin(rot);
  // a block with floors: wall body, a recessed dark window strip on every floor, a parapet lip and optional roof plant
  const block = (w, h, d, x, z, r, wall, { floor = 3.3, lip = true, plant = 0 } = {}) => {
    const y0 = world.heightAt(x, z) - 1.5, cw = hazed(wall), cg = hazed('#5f6d78', 0.4), cl = hazed(wall, 0.52).multiplyScalar(1.04);
    parts.push(B(w - 0.5, h, d - 0.5, x, z, r, cg, y0));                                      // the glazing line
    const n = Math.max(2, Math.round((h - 4) / floor)), fh = (h - 4) / n;
    parts.push(B(w, 4.6, d, x, z, r, cw, y0));                                                // ground floor
    for (let i = 0; i < n; i++) parts.push(B(w, fh * 0.52, d, x, z, r, cw, y0 + 4 + i * fh + fh * 0.48));   // spandrels
    for (const e of [-1, 1]) parts.push(B(1.6, h, d + 0.1, x + Math.cos(r) * e * (w / 2 - 0.8), z - Math.sin(r) * e * (w / 2 - 0.8), r, cw, y0));   // solid end walls
    if (lip) parts.push(B(w + 0.8, 1.1, d + 0.8, x, z, r, cl, y0 + h));
    if (plant) parts.push(B(w * plant, 3.4, d * 0.6, x - Math.cos(r) * w * 0.12, z + Math.sin(r) * w * 0.12, r, hazed('#8f9496'), y0 + h + 1.1));
    return y0 + h;
  };
  const hip = (w, d, x, z, r, y, rise, color) => {      // a low hipped roof: a 4-sided pyramid frustum, eaves overhanging
    const g = new THREE.CylinderGeometry(0.34, 1, rise, 4, 1, false, Math.PI / 4);
    g.scale((w + 1.6) / Math.SQRT2, 1, (d + 1.6) / Math.SQRT2);
    g.translate(0, rise / 2, 0);
    parts.push(geo.tint(geo.transform(geo.normalize(g), { x, y, z, rotY: r }), color));
  };
  block(46, 38, 14, hx, hz, rot, '#a9adab', { plant: 0.34 });
  block(26, 29, 13.4, hx + ux * 34, hz + uz * 34, rot, '#a2a6a5', { plant: 0.4 });
  block(20, 20, 12.8, hx - ux * 31, hz - uz * 31, rot, '#abaeaa');
  {                                                                                             // podium with a canopy line
    const px = hx + ux * 2, pz = hz + uz * 2 + 3, y0 = world.heightAt(px, pz) - 1.5;
    parts.push(B(98, 7, 22, px, pz, rot, hazed('#9c9e98'), y0), B(99, 0.9, 23, px, pz, rot, hazed('#b4b5ae', 0.5), y0 + 7));
    parts.push(B(96, 2.2, 22.3, px, pz, rot, hazed('#5f6d78', 0.42), y0 + 2.4));
  }
  for (const [dx, dz, w, h, d, r, wall] of [[78, -42, 34, 17, 14, 0.15, '#aeaa9d'], [-70, 38, 26, 13, 13, 0.7, '#b0ab9e'], [40, 62, 22, 10, 12, 0.3, '#a9a396']]) {
    const top = block(w, h, d, hx + dx, hz + dz, r, wall, { lip: false });
    hip(w, d, hx + dx, hz + dz, r, top, 4.2, hazed('#8d4f3f', 0.4));
  }
  // red roofs low on the slope, as everywhere in this town
  for (let i = 0; i < 9; i++) {
    const x = hq.x + rand.range(-110, 110), z = hq.z + rand.range(-150, 40);
    if (world.heightAt(x, z) < 6 || world.shoreDist(x, z) < 25) continue;
    const w = rand.range(11, 17), d = rand.range(9, 12), r = rand.range(0, 3.1), y = world.heightAt(x, z);
    parts.push(B(w, 6.5, d, x, z, r, hazed('#b9b19e', 0.4)), B(w - 0.6, 1.3, d + 0.15, x, z, r, hazed('#5f6d78', 0.42), y + 1.6));
    hip(w, d, x, z, r, y + 5, 3.4, hazed('#96503c', 0.38));
  }

  // 太平角: wind-bent black pines along the capes to the east
  const pineCol = ['#22382b', '#2a4332', '#1d3126', '#2f4a36'];
  const pine = (x, z, h) => {
    const y = world.heightAt(x, z), lean = rand.range(-0.16, 0.22), r = h * rand.range(0.36, 0.5);
    const trunk = new THREE.CylinderGeometry(h * 0.018, h * 0.03, h * 0.72, 4, 1, true);
    trunk.translate(0, h * 0.36, 0);
    parts.push(geo.tint(geo.transform(trunk, { x, y: y - 0.3, z, rotZ: lean }), '#3a2e27'));
    const tx = x - Math.sin(lean) * h * 0.7;
    for (let k = 0; k < 2; k++) {                 // flat, layered crown
      const c = new THREE.IcosahedronGeometry(1, 0);
      col.set(rand.pick(pineCol));
      parts.push(geo.tint(geo.transform(c, { x: tx + rand.range(-0.25, 0.25) * r + (k ? r * 0.35 : 0), y: y + h * (0.74 + 0.14 * k), z: z + rand.range(-0.3, 0.3) * r,
        rotY: rand.range(0, 6), scale: [r * (k ? 0.72 : 1), h * (k ? 0.14 : 0.2), r * (k ? 0.7 : 0.95)] }), col));
    }
  };
  const tp = map.coast.farHeadlands.find((h) => h.id === 'taipingjiao') || { x: 640, z: 330 };
  // tight groves of 5 to 8 with overlapping crowns: a dark ragged tree line, not isolated umbrellas
  const grove = (cx, cz, n) => {
    const hb = rand.range(8.5, 12.5), R = 2.6 * Math.sqrt(n);
    for (let k = 0; k < n; k++) {
      const a = rand.range(0, 6.283), d = R * Math.sqrt(rand());
      const x = cx + Math.cos(a) * d * 1.5, z = cz + Math.sin(a) * d;
      if (world.heightAt(x, z) < 2 || world.shoreDist(x, z) < 3) continue;
      pine(x, z, hb * rand.range(0.8, 1.18));
    }
  };
  let made = 0;
  for (let i = 0; i < 900 && made < 13; i++) {
    const near = rand.chance(0.5);
    const x = near ? tp.x + rand.gauss() * 85 : rand.range(330, 800), z = near ? tp.z + rand.gauss() * 85 : rand.range(-20, 500);
    if (x < 322 || world.shoreDist(x, z) < 8 || world.heightAt(x, z) < 2.6) continue;
    if (world.backDist(x, z) > 150) continue; // keep to the coastal fringe: the terrain tint carries the inland woods
    grove(x, z, rand.int(5, 8));
    made++;
  }
  // 汇泉角 is wooded: a continuous dark canopy along its crest and round the hotel (low rounded masses that overlap
  // into one ragged tree line), with pine groves standing out of it. Never lone umbrellas on bare grass.
  const canopyCol = ['#2c4636', '#324d3a', '#283f33', '#3a5540', '#4a5a3c'];
  const clearOfHotel = (x, z) => {
    const ex = x - hx, ez = z - hz, al = ex * ux + ez * uz, ac = Math.abs(ex * uz - ez * ux);
    return !(Math.abs(al) < 54 && ac < 15);
  };
  const canopy = (x, z, r) => {
    if (world.heightAt(x, z) < 3.2 || world.shoreDist(x, z) < 10 || !clearOfHotel(x, z)) return false;
    const c = new THREE.IcosahedronGeometry(1, 1), hgt = r * rand.range(0.5, 0.72);
    col.set(rand.pick(canopyCol)).lerp(HAZE, 0.2).multiplyScalar(rand.range(0.88, 1.1));
    parts.push(geo.tint(geo.transform(c, { x, y: world.heightAt(x, z) + hgt * 0.38, z, rotY: rand.range(0, 6), scale: [r * rand.range(0.9, 1.25), hgt, r * rand.range(0.85, 1.1)] }), col));
    return true;
  };
  let woods = 0;
  for (let i = 0; i < 700 && woods < 26; i++) {       // clumps of three to five crowns
    const cx = hq.x + rand.gauss() * 95, cz = hq.z - 30 + rand.gauss() * 85;
    if (world.heightAt(cx, cz) < 5 || world.shoreDist(cx, cz) < 14) continue;
    let ok = 0;
    const n = rand.int(3, 5);
    for (let k = 0; k < n; k++) {
      const a = rand.range(0, 6.283), dd = rand.range(0, 11);
      if (canopy(cx + Math.cos(a) * dd * 1.3, cz + Math.sin(a) * dd, rand.range(6.5, 10.5))) ok++;
    }
    if (ok) { woods++; if (rand.chance(0.55)) grove(cx + rand.range(-6, 6), cz + rand.range(-6, 6), rand.int(4, 6)); }
  }
  // and groves on its seaward slope
  for (let i = 0; i < 400 && made < 20; i++) {
    const x = hq.x + rand.gauss() * 80, z = hq.z + rand.range(-60, 110);
    if (world.shoreDist(x, z) < 9 || world.heightAt(x, z) < 3 || !clearOfHotel(x, z)) continue;
    grove(x, z, rand.int(5, 8));
    made++;
  }

  const merged = geo.merge(parts);
  const mat = ctx.mats.plain('#ffffff', 0.95, 0, { vertexColors: true });
  const mesh = geo.staticMesh(merged, mat, { cast: false, receive: false, name: 'far-headlands' });
  group.add(mesh);
  return { mesh, triangles: merged.attributes.position.count / 3, dispose() { merged.dispose(); } };
}
