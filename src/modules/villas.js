// Package "villas": the 64 generic parametric villas of Badaguan (eight archetypes, docs/DESIGN.md 2.4), one per MAP.lots
// entry, plus a few garages. Geometry is generated in src/modules/villas/ and merged per material per spatial cluster:
// 6 clusters x (stucco, granite, clay roof, coarse painted trim) + global glass / lit windows / slate / brown-tile / ivy meshes
// + 130 m cells of fine trim (window frames, glazing bars, shutters, balusters, half-timbering). The fine trim
// is 40 % of the triangles and thinner than a shadow texel: it never casts, and its cells are hidden beyond FINE_OFF metres.
// All colour variety comes from vertex colours over shared white-base materials.
import * as THREE from 'three';
import { buildVillas, SHARED_KEYS, CELL_KEYS } from './villas/build.js';
import { toGeometry } from './villas/sink.js';

// The leaf texture's mean colour (linear); the material colour is divided by it so env.current.ivy stays the mean hue.
const IVY_MEAN = [0.8, 0.55, 0.68];
// Fine-trim cells further than this from the eye are not drawn (a 7 cm frame is 0.3 px there at 720p; the glass, the
// door leaves and all massing stay). The band between OFF and ON is hysteresis so a cell does not flicker at the limit.
const FINE_ON = 205, FINE_OFF = 225;

/**
 * Tileable leaf sheet (256 px = 1.6 m). RGB: overlapping three-lobed creeper leaves, dark ones underneath, each with its
 * own hue shift. ALPHA: a per-leaf threshold (0.33 .. 1, the topmost leaf wins), so that multiplying by a vertex alpha
 * and alpha-testing at 0.3 removes the cover leaf by leaf towards the edge of a patch instead of along a straight line.
 */
function makeIvyTexture(ctx) {
  const N = 256, rand = ctx.rng.makeRng('villas:ivy-tex');
  const C = ctx.tex.makeCanvas(N, N), A = ctx.tex.makeCanvas(N, N);
  const srgb = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
  C.g.fillStyle = `rgb(${srgb(0.45 * IVY_MEAN[0])},${srgb(0.45 * IVY_MEAN[1])},${srgb(0.45 * IVY_MEAN[2])})`; C.g.fillRect(0, 0, N, N);
  A.g.fillStyle = '#000'; A.g.fillRect(0, 0, N, N);
  const path = (g, x, y, r, rot) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath();
    g.moveTo(0, r); g.quadraticCurveTo(-r * 0.5, r * 0.35, -r * 1.05, r * 0.2); g.quadraticCurveTo(-r * 0.6, -r * 0.15, -r * 0.55, -r * 0.55);
    g.quadraticCurveTo(-r * 0.2, -r * 0.45, 0, -r * 1.1); g.quadraticCurveTo(r * 0.2, -r * 0.45, r * 0.55, -r * 0.55);
    g.quadraticCurveTo(r * 0.6, -r * 0.15, r * 1.05, r * 0.2); g.quadraticCurveTo(r * 0.5, r * 0.35, 0, r);
    g.fill();
  };
  const n = 1000;
  for (let i = 0; i < n; i++) {
    const depth = i / n, x = rand.range(0, N), y = rand.range(0, N), r = rand.range(7, 12.5), rot = rand.range(-0.9, 0.9) + Math.PI;
    const L = Math.min(1, 0.26 + depth * 0.62 + rand.range(-0.1, 0.12));
    const hr = rand.range(0.62, 0.98), hg = 0.3 + 0.65 * Math.pow(rand(), 1.6), hb = rand.range(0.48, 0.88);
    const col = `rgb(${srgb(L * hr)},${srgb(L * hg)},${srgb(L * hb)})`;
    const t = Math.round(255 * (0.33 + 0.67 * depth)), ac = `rgb(${t},${t},${t})`;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      const px = x + ox, py = y + oy;
      if (px < -14 || px > N + 14 || py < -14 || py > N + 14) continue;
      C.g.fillStyle = col; path(C.g, px, py, r, rot);
      C.g.strokeStyle = 'rgba(0,0,0,0.25)'; C.g.lineWidth = 1; C.g.beginPath(); C.g.moveTo(0, r * 0.8); C.g.lineTo(0, -r * 0.8); C.g.stroke();
      C.g.restore();
      A.g.fillStyle = ac; path(A.g, px, py, r, rot); A.g.restore();
    }
  }
  const ci = C.g.getImageData(0, 0, N, N), ai = A.g.getImageData(0, 0, N, N);
  for (let o = 0; o < N * N * 4; o += 4) ci.data[o + 3] = Math.max(16, ai.data[o]);   // never 0: keeps the RGB of empty texels for the mips
  C.g.putImageData(ci, 0, 0);
  return ctx.tex.canvasTexture(C.canvas, { srgb: true, repeat: 1 });
}

export async function create(ctx) {
  const { map, mats, world } = ctx;
  const group = ctx.group('villas');
  const built = buildVillas({ map, world, makeRng: ctx.rng.makeRng });

  // ---- materials (shared ones are read-only; the two we tweak are our own) -------------------------------------------
  const granite = mats.get('granite').clone();
  granite.vertexColors = true; granite.name = 'villas:granite';
  const ivyTex = makeIvyTexture(ctx);
  const ivyMat = new THREE.MeshStandardMaterial({ map: ivyTex, alphaTest: 0.3, vertexColors: true, roughness: 0.82, metalness: 0, name: 'villas:ivy' });
  const vc = { vertexColors: true };
  const M = {
    stucco: mats.stucco('#ffffff', vc), granite, roof: mats.roof('#b5482e', vc), roofBrown: mats.roof('#6a4b3e', vc), slate: mats.roof('#5b5f66', vc),
    paint: mats.paint('#ffffff', vc), fine: mats.paint('#ffffff', vc), glass: mats.get('glass'), lit: mats.get('windowLit'), ivy: ivyMat,
  };
  const noCast = new Set(['glass', 'lit', 'ivy', 'fine']);
  const geos = [];
  let tris = 0;
  const add = (key, buf, name) => {
    if (!buf.pos.length || !M[key]) return;
    const geo = toGeometry(buf, key !== 'glass' && key !== 'lit');
    geos.push(geo); tris += buf.pos.length / 9;
    const mesh = ctx.geo.staticMesh(geo, M[key], { cast: !noCast.has(key), receive: key !== 'glass' && key !== 'lit', name });
    group.add(mesh);
    return mesh;
  };
  built.clusters.forEach((bufs, i) => { for (const [key, buf] of bufs) add(key, buf, `villas-${key}-${i}`); });
  for (const key of SHARED_KEYS) if (built.shared.has(key)) add(key, built.shared.get(key), `villas-${key}`);
  const fineCells = [];   // { mesh, box }: distance-culled in update()
  for (const [id, bufs] of built.cells) for (const key of CELL_KEYS) {
    const mesh = bufs.has(key) && add(key, bufs.get(key), `villas-${key}-${id}`);
    if (mesh && key === 'fine') fineCells.push({ mesh, box: mesh.geometry.boundingBox });
  }

  for (const o of built.outs) ctx.collision.addBox(o.x, o.z, o.hw, o.hd, o.rot, 'villa-out');
  if (ctx.params.debug) console.log(`[villas] ${map.lots.length} villas, ${built.outs.length} outbuildings, ${group.children.length} meshes, ${Math.round(tris)} triangles`);

  const ivyCol = new THREE.Color(), eye = new THREE.Vector3();
  const fineScale = ctx.quality.tier === 'low' ? 0.5 : 1;   // phones: window bars and railings only within ~110 m
  const update = () => {
    // fine trim only near the eye. In shot mode core copies the walker into the camera after the module updates, so the
    // eye is taken from the walker there (the camera would be one frame late), and without hysteresis (reproducible).
    const shot = !!(ctx.state?.shot && ctx.player);
    if (shot) eye.set(ctx.player.pos.x, ctx.player.pos.y + ctx.player.eyeHeight, ctx.player.pos.z);
    else eye.copy(ctx.camera.position);
    for (let i = 0; i < fineCells.length; i++) {
      const c = fineCells[i];
      c.mesh.visible = c.box.distanceToPoint(eye) < (c.mesh.visible || shot ? FINE_OFF : FINE_ON) * fineScale;
    }
    // creeper follows the season: red in autumn, green otherwise (blended by core during preset changes)
    const c = ctx.env.current.ivy;
    ivyCol.setRGB(c.r / IVY_MEAN[0], c.g / IVY_MEAN[1], c.b / IVY_MEAN[2]);
    ivyMat.color.copy(ivyCol);
  };
  update();

  return {
    update,
    onPreset() {},
    dispose() {
      ctx.scene.remove(group);
      for (const g of geos) g.dispose();
      granite.dispose(); ivyMat.dispose(); ivyTex.dispose();
      ctx.collision.removeTag('villa-out');
    },
  };
}
