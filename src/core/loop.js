// Main loop. One place advances time, blends the environment, updates modules (in load order) and renders.
import * as THREE from 'three';

export function createLoop(ctx, order) {
  const { renderer, state, env, wind, mats, camera, player } = ctx;
  const timer = new THREE.Timer();
  timer.connect(document); // pauses the clock while the tab is hidden
  let simTime = 0;
  let pausedAcc = 0, pausedSkip = 0;

  // ---- shadow-caster culling -------------------------------------------------------------------------------------
  // Static geometry is merged into a few large spatial clusters, so three's per-cascade frustum test passes nearly all
  // of it and every cluster is drawn again in each shadow cascade. A caster further from the eye than the shadow range
  // (plus the reach of a long low-sun shadow) cannot put a shadow on screen: switch its castShadow off while it is away.
  // Covers the packages that build static clusters; trees and life manage their own shadow LOD.
  const CULL_GROUPS = ['villas', 'landmarks', 'streetscape', 'coast', 'terrain'];
  const casters = [];
  let collected = false;
  function collectCasters() {
    collected = true;
    casters.length = 0;
    for (const g of ctx.scene.children) {
      if (!CULL_GROUPS.includes(g.name)) continue;
      g.traverse((o) => {
        if (!o.isMesh || !o.castShadow) return;
        let box = o.isInstancedMesh ? o.boundingBox : o.geometry.boundingBox;
        if (!box) { if (o.isInstancedMesh) { o.computeBoundingBox(); box = o.boundingBox; } else { o.geometry.computeBoundingBox(); box = o.geometry.boundingBox; } }
        if (!box || box.isEmpty()) return;
        o.updateWorldMatrix(true, false);
        // small detail (painted trim, furniture, ironwork) only matters in the near cascade
        // (never on the low tier)
        const detail = /paint|furniture|ironwork|lamp|bench/.test(o.name) ? (ctx.quality.tier === 'low' ? 0 : 0.55) : 1;
        casters.push({ o, box: box.clone().applyMatrix4(o.matrixWorld), detail });
      });
    }
  }
  function cullCasters() {
    const sun = ctx.lights?.sun;
    // SunLight: shadow.camera.far is the cascaded range from the eye (the sky package grows it with altitude);
    // the single-box fallback keeps its box within quality.shadowDistance of the camera
    const range = sun?.isSunLight ? sun.shadow.camera.far : ctx.quality.shadowDistance;
    const reach = 14 / Math.max(0.12, Math.tan(Math.asin(Math.max(0.02, Math.min(0.99, env.sunDir.y)))));   // shadow of a 14 m house
    for (let i = 0; i < casters.length; i++) {
      const k = casters[i];
      // a mesh may narrow the test itself: userData.castWhen(cameraPosition, range) -> boolean (e.g. the whole-coast reef instances)
      const when = k.o.userData.castWhen;
      k.o.castShadow = k.box.distanceToPoint(camera.position) < (range + Math.min(120, reach)) * k.detail && (!when || when(camera.position, range));
    }
  }

  function frame(dt, t) {
    state.dt = dt; state.time = t; state.frame++;
    env.update(dt);
    wind.update(dt, t);
    const cur = env.current;
    ctx.setFog(cur.fogColor, cur.fogDensity, cur.fogFalloff);   // baseline; the sky module may refine afterwards
    renderer.toneMappingExposure = cur.exposure;
    mats.update(cur, t);
    for (let i = 0; i < order.length; i++) {
      const m = ctx.modules[order[i]];
      if (m && m.update) {
        try { m.update(dt, t); } catch (e) { if (!m._failed) { m._failed = true; console.error(`[${order[i]}] update failed`, e); } }
      }
    }
    if (state.shot) player.applyToCamera(camera);
    camera.updateMatrixWorld();
    if (!collected) collectCasters();
    if (casters.length) cullCasters();
    renderer.info.reset();
    ctx.render.fn(dt);
  }

  return {
    frame,
    /** real-time loop */
    start() {
      renderer.setAnimationLoop((ms) => {
        timer.update(ms);
        // clamp long frames at 0.1 s: down to 10 fps the world still runs in real time (walking speed, cross-fades,
        // wind and waves); collision.move sub-steps every 0.25 m and the walker uses exponential damping, so it is stable
        let dt = Math.min(timer.getDelta(), 0.1);
        // Behind the pause panel the scene is only a backdrop under a veil: draw every third frame (the title screen
        // keeps the full rate for its attract pan). The skipped time is carried over, so wind, waves and cross-fades
        // still run in real time. The longer frame interval is not a slow GPU: keep the adaptive resolution settled.
        if (state.started && state.paused) {
          pausedAcc += dt;
          if (++pausedSkip % 3 !== 0) return;
          dt = Math.min(pausedAcc, 0.1); pausedAcc = 0;
          ctx.post?.adaptive?.settle?.(1);
        } else if (pausedAcc > 0 || pausedSkip) { pausedAcc = 0; pausedSkip = 0; ctx.post?.adaptive?.settle?.(1); }
        simTime += dt;
        frame(dt, simTime);
      });
    },
    stop() { renderer.setAnimationLoop(null); },
    /** deterministic stepping for screenshots: n frames of 1/30 s ending at time t */
    stepFrames(n, t) {
      const dt = 1 / 30;
      for (let i = 0; i < n; i++) frame(dt, t - (n - 1 - i) * dt);
      simTime = t;
    },
  };
}
