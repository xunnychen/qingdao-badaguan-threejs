// Entry point: builds the context, loads the feature modules in order, then either starts the real-time loop or,
// in screenshot mode (?shot=1), renders a few deterministic frames and raises window.__ready.
import { createContext } from './core/context.js';
import { createLoop } from './core/loop.js';
import { MODULES, ORDER, LABELS } from './modules/index.js';

window.__ready = false;
window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message || e.error || e)));
addEventListener('unhandledrejection', (e) => window.__errors.push('unhandledrejection: ' + String(e.reason?.stack || e.reason)));

const bootEl = document.getElementById('boot');
const barEl = document.getElementById('boot-bar');
const labelEl = document.getElementById('boot-label');
const progress = (f, label) => { barEl.style.width = `${Math.round(f * 100)}%`; if (label) labelEl.textContent = label; };
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  const ctx = createContext();
  window.__badaguan = ctx;
  const { params, map, player } = ctx;

  // initial camera: ?pos / ?view / default spawn
  const view = map.views[params.view] || map.spawn;
  const px = params.pos ? params.pos.x : view.x, pz = params.pos ? params.pos.z : view.z;
  player.teleport(px, pz, params.yaw ?? view.yaw ?? 0, params.pitch ?? view.pitch ?? 0, params.h ?? view.h);
  if (params.fov == null && view.fov && params.view) { ctx.camera.fov = view.fov; ctx.camera.updateProjectionMatrix(); }

  const order = ORDER.filter((n) => (!params.only || params.only.includes(n)) && !(params.skip && params.skip.includes(n)));
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    progress(i / order.length, LABELS[name] || name);
    if (!params.shot) await nextPaint();
    const t0 = performance.now();
    try {
      ctx.modules[name] = (await MODULES[name].create(ctx)) || {};
    } catch (e) {
      console.error(`[${name}] create failed`, e);
      window.__errors.push(`[${name}] create failed: ${e?.stack || e}`);
      ctx.modules[name] = {};
    }
    if (params.debug) console.log(`[boot] ${name} ${(performance.now() - t0).toFixed(0)} ms`);
  }
  progress(1, '');

  const loop = createLoop(ctx, order);
  ctx.loop = loop;

  if (params.debug) installDebugOverlay(ctx);

  if (params.shot) {
    bootEl.remove();
    loop.stepFrames(params.frames, params.t);
    await nextPaint();
    loop.stepFrames(1, params.t);
    await nextPaint();
    const info = ctx.renderer.info;
    window.__info = { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
      preset: ctx.env.name, quality: ctx.quality.tier, camera: ctx.camera.position.toArray().map((v) => +v.toFixed(2)) };
    // ?stats=1: per-group cost (draw calls / triangles incl. the shadow pass), measured by drawing each top-level group
    // alone next to the sky group (which owns the lights). Printed by scripts/shot.mjs.
    if (params.stats) {
      const groups = ctx.scene.children.filter((c) => c.isGroup && c.name);
      const vis = groups.map((g) => g.visible), per = {};
      const measure = () => { ctx.renderer.info.reset(); ctx.render.fn(0); return [ctx.renderer.info.render.calls, ctx.renderer.info.render.triangles]; };
      for (const g of groups) g.visible = g.name === 'sky';
      const base = measure();
      per.sky = base;
      for (const g of groups) {
        if (g.name === 'sky' || !g.visible && !vis[groups.indexOf(g)]) continue;
        g.visible = true;
        const m = measure();
        per[g.name] = [m[0] - base[0], m[1] - base[1]];
        g.visible = false;
      }
      groups.forEach((g, i) => { g.visible = vis[i]; });
      loop.stepFrames(1, params.t);
      window.__info.groups = per;
      // static inventory: triangles per mesh family (name before ':' or '-digits'), whether it casts, how many meshes
      const fam = {};
      for (const g of groups) g.traverse((o) => {
        if (!o.isMesh && !o.isPoints) return;
        const geo = o.geometry, n = geo.index ? geo.index.count : geo.attributes.position?.count || 0;
        const dr = geo.drawRange, cnt = Math.min(n, isFinite(dr.count) ? dr.count : n);
        const tris = Math.round(cnt / 3) * (o.isInstancedMesh ? o.count : 1);
        const key = `${g.name}/${(o.name || o.material?.name || '?').replace(/[:\-_]?[-\d,.|]+$/, '').replace(/:.*$/, '')}`;
        const f = fam[key] || (fam[key] = { meshes: 0, tris: 0, cast: 0, visible: 0 });
        f.meshes++; f.tris += tris; if (o.castShadow) f.cast++; if (o.visible) f.visible++;
      });
      window.__info.families = Object.entries(fam).sort((a, b) => b[1].tris - a[1].tris).slice(0, 40)
        .map(([k, f]) => `${k} x${f.meshes} ${Math.round(f.tris / 1000)}k${f.cast ? ' cast' + (f.cast < f.meshes ? f.cast : '') : ''}`);
    }
    ctx.state.ready = true;
    window.__ready = true;
    return;
  }

  try { await warmUp(ctx); } catch (e) { if (params.debug) console.warn('[boot] warm-up skipped', e); }
  loop.start();
  ctx.state.ready = true;
  window.__ready = true;
  bootEl.classList.add('done');
  ctx.events.emit('ready');
}

/**
 * Shader warm-up behind the loading screen, so that neither the first frame, nor the first street corner, nor the first
 * live switch to a lamp-lit preset (fog, dusk) links programs synchronously in the middle of a walk or a cross-fade.
 *  - Programs are keyed by where they draw (tone mapping + output colour space): compile against the post package's
 *    scene target when there is one, not against the canvas.
 *  - Programs are also keyed by the number of lights. The streetscape package keeps its pooled lamp PointLights
 *    invisible until a lit preset is asked for; compile that second light state too. three keeps every variant in the
 *    material's program map, so arming the lamps later is a cache hit. A module may expose prewarm(on) to switch its own
 *    lazily shown lights; otherwise every hidden point/spot light in the scene is shown for the lit pass.
 *    prewarm(true) means "show the light state the page did NOT boot in" (streetscape HIDES its lamps when the page boots
 *    in fog or dusk), prewarm(false) "back to the real state": the passes below are "the other state", then "this state".
 *  - A compiled program is not a usable one: three fetches its uniforms and link status on FIRST DRAW, a synchronous
 *    round trip that waits for the driver (measured: 13 to 19 s in SwiftShader, a visible hitch on a real GPU). So each
 *    state is also DRAWN once, with frustum culling off (materials that are behind the spawn camera count too, and their
 *    vertex buffers and textures are uploaded here instead of at the first glance) and with the effect meshes that only
 *    appear in the lamp-lit presets shown.
 *  - UNLIT materials (MeshBasicMaterial, ShaderMaterial without lights) do not change program when the light count
 *    changes: they stay on whatever the LAST compile() left as their current program. That is the daytime variant, so
 *    the daytime pass must draw the lazy effect meshes as well, or their first appearance pays the round trip after all.
 */
const LAZY_MESH = /^(sky-wisps|lamp-glow|lamp-pools)$/;   // hidden until fog / lamps come on (sky and streetscape packages)
async function warmUp(ctx) {
  const { renderer, scene, camera } = ctx;
  const target = ctx.post?.composer?.renderTarget1 || null;
  const compile = () => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    let done;
    try { done = renderer.compileAsync(scene, camera); } finally { renderer.setRenderTarget(prev); }   // compile() itself is synchronous
    return done;
  };
  await compile();

  const hooks = Object.values(ctx.modules).filter((m) => m && typeof m.prewarm === 'function');
  const shown = [], lazy = [], unculled = [];
  const showLazy = () => scene.traverse((o) => { if (o.isMesh && !o.visible && LAZY_MESH.test(o.name)) { o.visible = true; lazy.push(o); } });
  try {
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && o.frustumCulled) { o.frustumCulled = false; unculled.push(o); } });
    // ---- lit state (lamp lights on) ----
    if (!hooks.length) scene.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && !o.visible) { o.visible = true; shown.push(o); } });
    if (hooks.length || shown.length) {
      for (const m of hooks) m.prewarm(true);
      await compile();
      ctx.loop?.frame(1 / 60, 0);          // an ordinary frame (module updates hide the lazy meshes again) ...
      showLazy();
      if (lazy.length) ctx.render.fn(1 / 60);   // ... then once more with them
      for (const m of hooks) m.prewarm(false);
      for (const o of shown) o.visible = false;
      shown.length = 0;
    }
    // ---- the state the walk starts in: leaves every material on the variant of the lights that are really on ----
    await compile();
    showLazy();
    ctx.render.fn(1 / 60);
  } finally {
    for (const m of hooks) m.prewarm(false);
    for (const o of shown) o.visible = false;
    for (const o of lazy) o.visible = false;
    for (const o of unculled) o.frustumCulled = true;
  }
}

function installDebugOverlay(ctx) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:11px/1.4 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:4px;white-space:pre;pointer-events:none';
  document.body.appendChild(el);
  let frames = 0, last = performance.now();
  ctx.events.on('resize', () => {});
  setInterval(() => {
    const now = performance.now(), fps = ((ctx.state.frame - frames) * 1000) / (now - last);
    frames = ctx.state.frame; last = now;
    const i = ctx.renderer.info, p = ctx.player;
    el.textContent = `${fps.toFixed(0)} fps  calls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k  geo ${i.memory.geometries} tex ${i.memory.textures}\n` +
      `pos ${p.pos.x.toFixed(1)}, ${p.pos.z.toFixed(1)}  y ${p.pos.y.toFixed(1)}  yaw ${(((p.yaw * 180) / Math.PI) % 360).toFixed(0)}  ${p.surface}  ${ctx.env.name}  q:${ctx.quality.tier}`;
  }, 500);
}

boot().catch((e) => {
  console.error('[boot] failed', e);
  window.__errors.push(`boot failed: ${e?.stack || e}`);
  bootEl.classList.add('failed');
  labelEl.textContent = '載入失敗：' + (e?.message || e);
  window.__ready = true; // let the screenshot script finish and report the error
});
