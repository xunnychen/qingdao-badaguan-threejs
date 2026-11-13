// Package "post": the image pipeline. Everything the eye reads as "atmosphere" after the scene is drawn.
//
//   RenderPass  -> linear HDR half-float scene target, MSAA x quality.msaa (+ sampleable depth when god rays are on)
//   HdrBloomPass   half resolution, 5 mips, soft-knee bright pass in linear HDR             (quality.bloom)
//   GodRaysPass    half resolution, one 28-tap radial march masked by scene depth           (quality.godrays)
//   FinalPass      the single full-screen draw: scene + bloom + rays -> tone mapping -> sRGB -> grade/vignette/grain/dither
//   FXAAPass       only when the scene target has no MSAA (low tier, or the software-GL fallback)
//
// Full-screen passes: 1 (2 with FXAA) plus the half-resolution bloom chain and the half-resolution ray march.
// See post/final.js for why OutputPass and the grade pass are one shader.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { HdrBloomPass } from './post/bloom.js';
import { GodRaysPass } from './post/godrays.js';
import { FinalPass } from './post/final.js';
import { makeSceneTarget, probeTarget } from './post/probe.js';
import { inverseToneMap } from './post/fogmatch.js';
import { createAdaptive } from './post/adaptive.js';

// Preset bloomStrength is authored for "how much of the over-threshold light spreads"; UnrealBloom's composite sums five
// mips and multiplies by 3, so scale it down to keep a wide bright sky from gaining more than about its own excess.
const BLOOM_GAIN = 0.7;
const RAY_GAIN = 0.75;       // linear HDR added at the centre of an unobstructed sun for godrays = 1
const GRAIN = 0.010;         // peak-to-peak display-space grain in the mid-tones
const FADE_SECONDS = 0.8;
const TINT_AMOUNT = 0.7;     // share of the preset gradeTint applied to warm / neutral mid-tones

export async function create(ctx) {
  const { renderer, scene, camera, quality, env, events, viewport, params } = ctx;
  const defaultRender = ctx.render.fn;
  const offs = [];
  let debugView = 0;
  let fogMatch = true;       // see post/fogmatch.js (?pp=nofog turns it off for comparison)
  try {
    const pp = new URLSearchParams(location.search).get('pp');
    debugView = pp === 'bloom' ? 1 : pp === 'rays' ? 2 : pp === 'none' ? 3 : 0;
    if (pp === 'nofog') fogMatch = false;
  } catch { /* no location */ }

  // ---- pick a scene target that really works on this GL ---------------------------------------------------------------
  const wantRays = !!quality.godrays;
  const wantBloom = !!quality.bloom;
  const tries = [];
  if (quality.msaa > 0) {
    if (wantRays) tries.push({ samples: quality.msaa, depth: true });
    tries.push({ samples: quality.msaa, depth: false });
  }
  if (wantRays) tries.push({ samples: 0, depth: true });
  tries.push({ samples: 0, depth: false });
  let config = null;
  for (const t of tries) { if (probeTarget(renderer, t)) { config = t; break; } }

  const info = {
    samples: config ? config.samples : 0, bloom: false, godrays: false, fxaa: false, bypass: !config,
    fallback: !config || config.samples !== quality.msaa || config.depth !== wantRays,
  };

  if (!config) {
    // no usable half-float target at all: leave core's direct render (tone mapping on the renderer) in place
    console.warn('[post] no usable HDR render target: post-processing bypassed');
    ctx.post = { composer: null, setEnabled() {}, setFogMatch() {}, info };
    return { update() {}, onPreset() {}, dispose() { ctx.post = undefined; } };
  }
  if (info.fallback) console.warn(`[post] render target fallback: samples ${config.samples}, depth ${config.depth}`);

  // ---- targets + composer --------------------------------------------------------------------------------------------
  const pr0 = viewport.pixelRatio;
  const pw = () => Math.max(2, Math.round(viewport.width * viewport.pixelRatio));
  const ph = () => Math.max(2, Math.round(viewport.height * viewport.pixelRatio));
  const useFxaa = config.samples === 0;
  const sceneRT = makeSceneTarget(pw(), ph(), config);
  // The second composer buffer only ever holds the graded display image on its way to FXAA: 8-bit, no MSAA, no depth.
  const auxRT = new THREE.WebGLRenderTarget(useFxaa ? pw() : 1, useFxaa ? ph() : 1, { depthBuffer: false });
  auxRT.texture.name = 'post.display';
  auxRT.texture.generateMipmaps = false;

  const composer = new EffectComposer(renderer, auxRT);
  composer.renderTarget2.dispose();      // the clone EffectComposer made of auxRT (never allocated on the GPU)
  composer.renderTarget1 = sceneRT;
  composer.renderTarget2 = auxRT;
  composer._width = viewport.width; composer._height = viewport.height; composer._pixelRatio = viewport.pixelRatio;

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let bloom = null;
  if (wantBloom) {
    bloom = new HdrBloomPass(pw(), ph());
    composer.addPass(bloom);
    info.bloom = true;
  }
  let rays = null;
  if (wantRays && config.depth) {
    rays = new GodRaysPass({ camera, env, getDepthTexture: () => sceneRT.depthTexture });
    composer.addPass(rays);
    info.godrays = true;
  }
  const final = new FinalPass({ bloom: !!bloom, rays: !!rays });
  final.uniforms.uDebug.value = debugView;
  if (bloom) final.uniforms.tBloom.value = bloom.texture;
  if (rays) final.uniforms.tRays.value = rays.texture;
  composer.addPass(final);
  let fxaa = null;
  if (useFxaa) {
    fxaa = new FXAAPass();
    composer.addPass(fxaa);
    info.fxaa = true;
  }

  function applySize() {
    composer.setPixelRatio(viewport.pixelRatio);
    composer.setSize(viewport.width, viewport.height);   // scene target, bloom mips, god-ray target, FXAA texel size
    if (!useFxaa) auxRT.setSize(1, 1);                   // unused on the MSAA path: do not keep a full-size buffer
  }
  applySize();
  offs.push(events.on('resize', applySize));

  // ---- frame ---------------------------------------------------------------------------------------------------------
  const rayColor = final.uniforms.uRayColor.value;
  const fogColor0 = new THREE.Color();
  function renderFrame(dt) {
    // the two buffers are not interchangeable (only one is HDR + MSAA): pin their roles every frame
    composer.readBuffer = sceneRT;
    composer.writeBuffer = auxRT;
    if (rays) rayColor.setRGB(0, 0, 0);
    const fog = scene.fog;
    if (!fogMatch || !fog || !fog.isFog) { composer.render(dt); return; }
    // keep the fog looking the way the direct path draws it (post/fogmatch.js); restored right after the frame
    fogColor0.copy(fog.color);
    const near0 = fog.near;
    inverseToneMap(fog.color, renderer.toneMapping, renderer.toneMappingExposure);
    fog.near = -Math.abs(near0);   // HDR-target flag: core/fog.js turns the display-space fraction into a linear one
    try { composer.render(dt); } finally { fog.color.copy(fogColor0); fog.near = near0; }
  }
  // the ray colour depends on what GodRaysPass measured with the final camera of this frame
  if (rays) {
    const rayRender = rays.render.bind(rays);
    rays.render = (r, w, rd, dt, m) => {
      rayRender(r, w, rd, dt, m);
      if (rays.amount > 0) {
        const s = env.current.sunColor;
        const k = (rays.amount * RAY_GAIN) / Math.max(s.r, s.g, s.b, 1e-3);
        rayColor.setRGB(s.r * k, s.g * k, s.b * k);
      }
    };
  }

  let enabled = true;
  ctx.render.set(renderFrame);
  ctx.post = {
    composer, info,
    /** fog matching on/off (default on): see post/fogmatch.js */
    setFogMatch(on) { fogMatch = !!on; },
    setEnabled(on) {
      enabled = !!on;
      ctx.render.set(enabled ? renderFrame : defaultRender);
    },
  };

  // ---- fade from black on start + adaptive resolution (never in shot mode) ------------------------------------------
  let fade = 1;
  if (!params.shot) offs.push(events.on('start', () => { fade = 0; adapt.settle(1); }));

  // Controller in post/adaptive.js: clamps slow frames instead of discarding them (so it engages below 10 fps), floors
  // the ratio at a pixel budget, jumps to the floor when a window averages above 45 ms, and reports once when even the
  // floor cannot hold 30 fps.
  const LOWER = { high: 'medium', medium: 'low' };
  const adapt = createAdaptive({
    max: pr0,
    getSize: () => viewport,
    getRatio: () => viewport.pixelRatio,
    setRatio: (pr) => ctx.setPixelRatio(pr),
    onStruggle({ avgMs, pixelRatio }) {
      // 'perf:low' { tier, suggest, avgMs, pixelRatio, handled }: a listener (the UI) that offers the switch itself sets
      // detail.handled = true. Unhandled and worse than 20 fps at the floor: change tier once (stores it and reloads).
      const suggest = LOWER[quality.tier] || null;
      const detail = { tier: quality.tier, suggest, avgMs, pixelRatio, handled: false };
      events.emit('perf:low', detail);
      console.warn(`[post] ${avgMs.toFixed(0)} ms/frame at pixel ratio ${pixelRatio.toFixed(2)}`
        + (suggest ? `: quality "${suggest}" recommended` : ''));
      if (!detail.handled && suggest && avgMs > 50) ctx.app?.setQuality?.(suggest);
    },
  });
  ctx.post.adaptive = adapt;
  let lastFrame = 0;
  function adaptive() {
    const now = performance.now();
    const ms = now - lastFrame;
    const first = lastFrame === 0;
    lastFrame = now;
    if (first || document.hidden || !ctx.state.ready) return;
    adapt.frame(ms);
  }

  // ---- per-frame uniforms --------------------------------------------------------------------------------------------
  const tint = new THREE.Color();
  const u = final.uniforms;
  function update(dt, t) {
    const cur = env.current;
    if (bloom) {
      // dense fog scatters a lamp's light into a wide halo: the same emitter blooms more as the air thickens
      // (x1 in clear air, x8 in the sea-fog preset, whose emitters are only a few pixels wide; pale fog itself stays under the narrow neutral knee)
      const haze = 1 + 7 * THREE.MathUtils.smoothstep(cur.fogDensity || 0, 0.003, 0.016);
      bloom.strength = Math.max(0, cur.bloomStrength) * BLOOM_GAIN * haze;
      bloom.threshold = cur.bloomThreshold;
      bloom.exposure = renderer.toneMappingExposure;
      bloom.radius = cur.bloomRadius;
      bloom.enabled = bloom.strength > 0.002;
      u.uBloom.value = bloom.enabled ? 1 : 0;
    }
    u.uSaturation.value = cur.saturation;
    u.uContrast.value = cur.contrast;
    // the tint is a colour cast, not an exposure change: normalise so its strongest channel is 1
    tint.copy(cur.gradeTint).convertLinearToSRGB();
    const tm = Math.max(tint.r, tint.g, tint.b, 1e-3);
    u.uTint.value.setRGB(tint.r / tm, tint.g / tm, tint.b / tm);
    u.uTintAmount.value = TINT_AMOUNT;
    u.uVignette.value = cur.vignette;
    u.uGrain.value = GRAIN;
    u.uSeed.value = params.shot ? 7 : Math.floor(t * 24) % 997;   // film cadence; fixed frame in screenshots
    if (fade < 1) fade = Math.min(1, fade + dt / FADE_SECONDS);
    u.uFade.value = fade * fade * (3 - 2 * fade);
    if (!params.shot && enabled) adaptive();
  }
  update(0, 0);

  return {
    update,
    onPreset() { adapt.settle(1); },   // shader / shadow hitches of the switch do not count
    dispose() {
      for (const off of offs) { try { off && off(); } catch { /* ignore */ } }
      ctx.render.set(defaultRender);
      ctx.post = undefined;
      bloom?.dispose();
      rays?.dispose();
      final.dispose();
      fxaa?.dispose();
      renderPass.dispose?.();
      sceneRT.depthTexture?.dispose();
      composer.dispose();   // sceneRT + auxRT + copy pass
    },
  };
}
