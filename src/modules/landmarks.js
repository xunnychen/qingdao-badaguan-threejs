// Package "landmarks": 花石楼, 公主楼, 八大关宾馆, 元帅楼, 蝴蝶楼 + a granite name boulder inside each gate.
//
//   landmarks/kit.js           geometry builder (walls with openings on flat and cylindrical surfaces, roofs, beams ...)
//   landmarks/parts.js         dormer / chimney / plinth shared by the stucco villas
//   landmarks/<id>.js          one builder per landmark (also registers its colliders)
//   landmarks/build.js         runs them all into per-material buffers (pure geometry, also runs under Node)
//
// Everything is merged per material into two spatial clusters (east = 花石楼, west = the other four) plus three global
// meshes (glass, lit windows, engraved names) + the 元帅楼 pond water, the 花石楼 terrace turf and one small animated mesh
// for the four flags: 18 draw calls, about 60 k triangles.
import * as THREE from 'three';
import { buildAll, TEXT_ROWS } from './landmarks/build.js';

const CJK_SERIF = '"Noto Serif CJK SC","Source Han Serif SC","Songti SC","STSong","SimSun","KaiTi","STKaiti","WenQuanYi Zen Hei","Microsoft YaHei","PingFang SC",serif';

/** canvas atlas with the engraved red names, one row per landmark (Simplified, as on the real stones) */
function nameAtlas(ctx) {
  const size = 1024, cell = size / TEXT_ROWS;
  const { canvas, g } = ctx.tex.makeCanvas(size, size);
  g.clearRect(0, 0, size, size);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(cell * 0.8)}px ${CJK_SERIF}`;
  ctx.map.landmarks.forEach((L, row) => {
    [...L.name].forEach((ch, i) => {
      const x = (i + 0.5) * cell, y = (row + 0.5) * cell + cell * 0.03;
      g.fillStyle = '#3d0f0b'; g.fillText(ch, x + 3, y + 4);       // chisel shadow
      g.fillStyle = '#B3261E'; g.fillText(ch, x, y);
      g.fillStyle = 'rgba(214,72,56,0.55)'; g.fillText(ch, x - 1.5, y - 2);
      g.fillStyle = '#B3261E'; g.fillText(ch, x, y);
    });
  });
  const t = ctx.tex.canvasTexture(canvas, { srgb: true, wrap: false });
  t.repeat.set(1, 1);
  return t;
}

/** leaded stained glass: amber quarries with green and red accents (one tile = 0.9 m) */
function stainedTexture(ctx) {
  const size = 256, { canvas, g } = ctx.tex.makeCanvas(size, size), rand = ctx.rng.makeRng('landmarks:stained');
  const pal = ['#C8962E', '#C8962E', '#d9aa3c', '#b8842a', '#3F7F5A', '#9C2F2A', '#C8962E', '#e0bd5a', '#3F7F5A', '#9C2F2A'];
  g.fillStyle = '#16120e'; g.fillRect(0, 0, size, size);
  const n = 4, c = size / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * c, y = j * c, cx = x + c / 2, cy = y + c / 2;
    const tri = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
    const m = 3;
    // a lozenge in every cell, four corner pieces around it
    tri([[cx, y + m], [x + c - m, cy], [cx, y + c - m], [x + m, cy]], rand.pick(pal));
    const corner = (i + j) % 2 ? '#C8962E' : rand.pick(['#b8842a', '#d9aa3c', '#3F7F5A', '#C8962E', '#9C2F2A']);
    tri([[x + m, y + m], [cx - m, y + m], [x + m, cy - m]], corner);
    tri([[x + c - m, y + m], [x + c - m, cy - m], [cx + m, y + m]], corner);
    tri([[x + m, y + c - m], [x + m, cy + m], [cx - m, y + c - m]], corner);
    tri([[x + c - m, y + c - m], [cx + m, y + c - m], [x + c - m, cy + m]], corner);
  }
  // soft mottling so the panes are not flat
  const img = g.getImageData(0, 0, size, size), d = img.data, nz = ctx.tex.tileNoise(size, 16, 77);
  for (let k = 0; k < size * size; k++) { const f = 0.78 + 0.44 * nz[k]; d[k * 4] = Math.min(255, d[k * 4] * f); d[k * 4 + 1] = Math.min(255, d[k * 4 + 1] * f); d[k * 4 + 2] = Math.min(255, d[k * 4 + 2] * f); }
  g.putImageData(img, 0, 0);
  const t = ctx.tex.canvasTexture(canvas, { srgb: true });
  t.repeat.set(1, 1);
  return t;
}

/** flag atlas, two rows: 0 = national flag (red, yellow stars), 1 = white house flag with jade bands */
function flagAtlas(ctx) {
  const W = 256, H = 256, { canvas, g } = ctx.tex.makeCanvas(W, H), rh = H / 2;
  g.fillStyle = '#c8231c'; g.fillRect(0, 0, W, rh);
  const star = (cx, cy, r, rot) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = rot + (k * Math.PI) / 5, q = k % 2 ? r * 0.39 : r; g.lineTo(cx + Math.sin(a) * q, cy - Math.cos(a) * q); }
    g.closePath(); g.fill();
  };
  g.fillStyle = '#f6d12c';
  star(42, 34, 21, 0);
  for (const [x, y] of [[84, 13], [101, 28], [101, 49], [84, 63]]) star(x, y, 7, Math.atan2(42 - x, y - 34));
  g.fillStyle = '#f4f0e6'; g.fillRect(0, rh, W, rh);
  g.fillStyle = '#3f8f84'; g.fillRect(0, rh + 22, W, 20); g.fillRect(0, rh + 86, W, 20);
  g.fillStyle = '#c9a24a'; g.fillRect(0, rh + 58, W, 12);
  const t = ctx.tex.canvasTexture(canvas, { srgb: true, wrap: false });
  t.repeat.set(1, 1);
  return t;
}

const FLAG_N = 8;
/** one indexed strip per flag; positions and normals are rewritten every frame (no allocation) */
function flagMesh(flags, material) {
  const per = (FLAG_N + 1) * 2, n = flags.length;
  const pos = new Float32Array(n * per * 3), nor = new Float32Array(n * per * 3), uv = new Float32Array(n * per * 2), idx = [];
  flags.forEach((f, k) => {
    const v0 = 1 - f.row / 2 - 0.012, v1 = 1 - (f.row + 1) / 2 + 0.012;
    for (let i = 0; i <= FLAG_N; i++) {
      const o = (k * per + i * 2) * 2, u = 0.01 + 0.98 * (i / FLAG_N);
      uv[o] = u; uv[o + 1] = v0; uv[o + 2] = u; uv[o + 3] = v1;
      if (i < FLAG_N) { const a = k * per + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'landmarks:flags'; mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
  return mesh;
}
function waveFlags(mesh, flags, wind, t) {
  const pos = mesh.geometry.attributes.position.array, nor = mesh.geometry.attributes.normal.array;
  const dx = wind.dir.x, dz = wind.dir.z, pw = Math.min(1.5, wind.power);
  const lift = Math.min(1, 0.42 + 0.6 * pw);                  // how far the fly stands out from the pole
  let o = 0;
  for (let k = 0; k < flags.length; k++) {
    const f = flags[k];
    for (let i = 0; i <= FLAG_N; i++) {
      const s = i / FLAG_N, ph = s * 5.4 - t * (3.2 + 2.2 * pw) + k * 1.7, amp = 0.14 * (0.35 + 0.65 * pw) * s;
      const along = 0.06 + s * f.w * lift, lat = Math.sin(ph) * amp;
      const sag = s * s * f.w * (1 - lift) * 0.95 + Math.sin(ph * 0.6 + 1.3) * 0.035 * s;
      const x = f.x + dx * along - dz * lat, z = f.z + dz * along + dx * lat, y = f.y - sag;
      const q = (Math.cos(ph) * 5.4 * amp) / (f.w * lift), il = 1 / Math.hypot(1, q);
      const nx = (-dz - dx * q) * il, nz = (dx - dz * q) * il, back = sag * 0.25;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; nor[o] = nx; nor[o + 1] = 0; nor[o + 2] = nz;
      pos[o + 3] = x - dx * back; pos[o + 4] = y - f.h; pos[o + 5] = z - dz * back; nor[o + 3] = nx; nor[o + 4] = 0; nor[o + 5] = nz;
      o += 6;
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.normal.needsUpdate = true;
}

export async function create(ctx) {
  const { mats, geo } = ctx;
  const group = ctx.group('landmarks');
  const owned = [], ownedTex = [];
  const vc = (name) => { const m = mats.get(name).clone(); m.vertexColors = true; m.name = `landmarks:${name}`; owned.push(m); return m; };

  const { geos, flags } = buildAll({ map: ctx.map, heightAt: ctx.world.heightAt, makeRng: ctx.rng.makeRng, collision: ctx.collision });

  const stainedMap = stainedTexture(ctx), textMap = nameAtlas(ctx);
  ownedTex.push(stainedMap, textMap);
  const stained = new THREE.MeshStandardMaterial({ map: stainedMap, emissiveMap: stainedMap, color: 0x8a8a8a, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.28, metalness: 0, name: 'landmarks:stained' });
  const text = new THREE.MeshStandardMaterial({ map: textMap, alphaTest: 0.35, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'landmarks:text' });
  // pond water: dark jade, glossy (picks up the sky through the scene environment)
  const water = new THREE.MeshStandardMaterial({ color: 0x2f5a55, roughness: 0.06, metalness: 0, envMapIntensity: 1.8, name: 'landmarks:water' });
  const flagMap = flagAtlas(ctx);
  ownedTex.push(flagMap);
  const flagMat = new THREE.MeshStandardMaterial({ map: flagMap, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, name: 'landmarks:flag' });
  owned.push(stained, text, water, flagMat);
  const M = {
    granite: vc('granite'), pebble: vc('pebble'), rubble: vc('rubble'), stone: vc('coping'),
    stucco: mats.stucco('#ffffff', { vertexColors: true }),
    roof: mats.roof('#b5482e', { vertexColors: true }),
    trim: mats.plain('#ffffff', 0.62, 0, { vertexColors: true }),
    foliage: mats.plain('#ffffff', 0.8, 0, { vertexColors: true, side: THREE.DoubleSide }),
    grass: mats.grass(undefined, { vertexColors: true }),
    glass: mats.get('glass'), lit: mats.get('windowLit'), stained, text, water,
  };
  const noCast = new Set(['glass', 'lit', 'stained', 'text', 'water']);
  for (const [key, g] of geos) {
    const base = key.replace(/^[ew]:/, '');
    if (!M[base]) throw new Error(`[landmarks] no material for "${key}"`);
    group.add(geo.staticMesh(g, M[base], { cast: !noCast.has(base), receive: base !== 'text', name: `landmarks:${key}` }));
  }

  const flagM = flags.length ? flagMesh(flags, flagMat) : null;
  if (flagM) { waveFlags(flagM, flags, ctx.wind, 0); group.add(flagM); }

  return {
    update(dt, t) {
      if (flagM) waveFlags(flagM, flags, ctx.wind, t);
      // stained glass: a jewel-like hint by day, glowing from within at dusk and in fog
      stained.emissiveIntensity = 0.05 + 1.5 * ctx.env.current.windowGlow;
    },
    onPreset() {},
    dispose() {
      ctx.scene.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of owned) m.dispose();
      for (const t of ownedTex) t.dispose();
    },
  };
}
