// Builds the shared context object (ctx) that every feature module receives. See docs/DESIGN.md "MODULE CONTRACT".
import * as THREE from 'three';
import { parseParams } from './params.js';
import { pickQuality } from './quality.js';
import { createEvents } from './events.js';
import { createEnv } from './env.js';
import { installFog } from './fog.js';
import { createWind } from './wind.js';
import { createCollision } from './collision.js';
import { createTextures } from './textures.js';
import { createMaterials } from './materials.js';
import { geo } from './geo.js';
import * as rng from './rng.js';
import { world } from '../world/query.js';
import { MAP } from '../world/map.js';

const store = {
  get(k) { try { return localStorage.getItem(`badaguan.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`badaguan.${k}`, v); } catch { /* ignore */ } },
};

export function createContext() {
  installFog();
  const params = parseParams();
  const quality = pickQuality(params);
  const events = createEvents();
  const canvas = document.getElementById('scene');

  // ---- renderer ------------------------------------------------------------------------------------------------------
  // The post package draws the scene into its own (multisampled or FXAA'd) target and only a full-screen triangle to the
  // canvas, so a multisampled default framebuffer would be allocated and resolved every frame for nothing. Keep canvas
  // MSAA only when post is switched off by ?skip / ?only (the plain renderer.render path).
  const noPost = !!(params.skip?.includes('post') || (params.only && !params.only.includes('post')));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: noPost, powerPreference: 'high-performance', stencil: false });
  const viewport = { width: innerWidth, height: innerHeight, pixelRatio: Math.min(devicePixelRatio || 1, quality.maxPixelRatio) };
  renderer.setPixelRatio(viewport.pixelRatio);
  renderer.setSize(viewport.width, viewport.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is gone in r187; soften with light.shadow.radius
  renderer.info.autoReset = false;              // core resets once per frame so multi-pass totals are meaningful

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd9e2e6, 0.0012, 0.012); // height fog: near = density, far = falloff (see core/fog.js)
  scene.background = new THREE.Color(0xcfe0ea);

  const camera = new THREE.PerspectiveCamera(params.fov ?? 62, viewport.width / viewport.height, 0.15, 4000);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // ---- shared state --------------------------------------------------------------------------------------------------
  const env = createEnv(events, params.preset || (params.shot ? null : store.get('preset')));
  const wind = createWind(env, events);
  const collision = createCollision();
  const tex = createTextures(renderer, quality);
  const mats = createMaterials(tex);
  const state = { started: false, paused: true, shot: params.shot, time: 0, dt: 0, frame: 0, ready: false };

  const player = {
    pos: new THREE.Vector3(),     // FEET position; pos.y is ground height
    yaw: 0,                       // radians, compass heading: 0 north (-z), +PI/2 east (+x), PI south (+z)
    pitch: 0,                     // radians, + up
    eyeHeight: 1.65, bob: 0,      // camera y = pos.y + eyeHeight + bob
    radius: 0.35,
    vel: new THREE.Vector3(), speed: 0, moving: false, running: false,
    surface: 'road',              // world.surfaceAt under the feet (player module keeps it current)
    locked: false,                // pointer lock held / touch controls active
    /** unit horizontal forward vector for the current yaw */
    forward(out = new THREE.Vector3()) { return out.set(Math.sin(player.yaw), 0, -Math.cos(player.yaw)); },
    /** place the walker; yaw/pitch in DEGREES (compass); eye = optional eye height above ground */
    teleport(x, z, yawDeg, pitchDeg, eye) {
      player.pos.set(x, world.heightAt(x, z), z);
      if (yawDeg != null) player.yaw = THREE.MathUtils.degToRad(yawDeg);
      if (pitchDeg != null) player.pitch = THREE.MathUtils.degToRad(pitchDeg);
      player.eyeHeight = eye ?? 1.65;
      player.vel.set(0, 0, 0); player.speed = 0; player.bob = 0;
      player.surface = world.surfaceAt(x, z);
      player.applyToCamera();
      events.emit('teleport', player);
    },
    /** copy the walker state into the camera (position + YXZ rotation) */
    applyToCamera(cam = camera) {
      cam.position.set(player.pos.x, player.pos.y + player.eyeHeight + player.bob, player.pos.z);
      cam.rotation.set(player.pitch, -player.yaw, 0, 'YXZ');
    },
  };

  const ctx = {
    THREE, renderer, scene, camera, canvas, viewport,
    params, quality, events, state, store,
    env, wind, world, map: MAP, collision, tex, mats, geo, rng,
    player,
    modules: {},
    uiRoot: document.getElementById('ui-root'),
    /** Default frame renderer. The post package replaces it: ctx.render.set((dt) => composer.render(dt)). */
    render: { fn: () => renderer.render(scene, camera), set(fn) { ctx.render.fn = fn; } },
    /** Set the global height fog. color: THREE.Color | hex, density at sea level (1/m), falloff with height (1/m). */
    setFog(color, density, falloff) {
      if (color != null) scene.fog.color.set(color);
      if (density != null) scene.fog.near = density;
      if (falloff != null) scene.fog.far = falloff;
    },
    /** Create a named Group already added to the scene (one per module keeps the scene graph tidy). */
    group(name) { const g = new THREE.Group(); g.name = name; scene.add(g); return g; },
    app: {
      /** Called by the UI from a user gesture: enters the world. Emits 'start' synchronously. */
      start() { if (state.started) return; state.started = true; state.paused = false; events.emit('start'); },
      /** Called by the player module when pointer lock is lost (or by the UI for a menu). Emits 'pause'. */
      pause() { if (!state.started || state.paused) return; state.paused = true; events.emit('pause'); },
      /** Called by the UI from a user gesture. Emits 'resume' synchronously. */
      resume() { if (!state.started || !state.paused) return; state.paused = false; events.emit('resume'); },
      setPreset(name, opts) { const ok = env.set(name, opts); if (ok && !params.shot) store.set('preset', name); return ok; },
      nextPreset(dir = 1) { const ok = env.next(dir); if (ok && !params.shot) store.set('preset', env.name); return ok; },
      /** Quality is fixed per page load: stores the tier and reloads. */
      setQuality(tier) { store.set('q', tier); const u = new URL(location.href); u.searchParams.set('q', tier); location.href = u.toString(); },
    },
  };

  // preset change -> modules
  events.on('preset', (target, prev) => {
    for (const name in ctx.modules) {
      try { ctx.modules[name]?.onPreset?.(target, prev); } catch (e) { console.error(`[${name}] onPreset failed`, e); }
    }
  });

  // resize
  function resize() {
    viewport.width = innerWidth; viewport.height = innerHeight;
    camera.aspect = viewport.width / viewport.height; camera.updateProjectionMatrix();
    renderer.setSize(viewport.width, viewport.height, false);
    events.emit('resize', viewport);
  }
  addEventListener('resize', resize);
  ctx.resize = resize;
  /** Change the pixel ratio at runtime (adaptive resolution). Emits 'resize'. */
  ctx.setPixelRatio = (pr) => { viewport.pixelRatio = pr; renderer.setPixelRatio(pr); resize(); };

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); events.emit('contextlost'); });
  // static vertex data is released after upload (geo.staticMesh, trees), so a restored context cannot be refilled: start over
  canvas.addEventListener('webglcontextrestored', () => { if (!params.shot) location.reload(); });

  return ctx;
}
