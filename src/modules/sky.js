// Package "sky": sky dome (gradient, sun, two cloud layers, horizon haze), sun + hemisphere lights, cascaded shadows,
// PMREM environment map, fog colour refinement and drifting sea-fog wisps.
//
//   sky/noise.js   tileable FBM texture shared by clouds and wisps
//   sky/dome.js    the dome shader (drawn at the far plane after the opaque scene)
//   sky/sun.js     makeSun(): SunLight (2 cascades) or the single-box DirectionalLight fallback
//   sky/wisps.js   instanced fog billboards
//
// Publishes ctx.lights = { sun, hemi, kind }. Draw calls: dome 1 (+ wisps 1 in the fog preset); 2.3 k triangles.
// Debug query params: ?sun=dir (fallback shadow rig), ?wispdbg=1 (magenta wisps).
import * as THREE from 'three';
import { makeNoiseTexture } from './sky/noise.js';
import { createDome } from './sky/dome.js';
import { makeSun } from './sky/sun.js';
import { createWisps } from './sky/wisps.js';

// Light balance on top of the preset numbers (reported to the architect):
const HEMI_GAIN = 1.1;        // hemisphere intensity multiplier
const ENV_INTENSITY = 0.5;    // scene.environmentIntensity when the PMREM sky is active
const NO_ENV_HEMI = 1.6;      // extra hemisphere gain on the low tier (no environment map) so shade stays readable
// Low sun (dusk): nearly everything is in shadow, so the picture is carried by sky light alone. lowSun = 1 at <= 3 deg,
// 0 at >= 20 deg of elevation; it lifts the ambient terms and turns the sky light violet.
const LOW_SUN_HEMI = 1.4;     // hemisphere x (1 + 1.4 lowSun)
const LOW_SUN_ENV = 0.45;     // environmentIntensity + 0.45 lowSun
const LOW_SUN_NO_ENV = 0.6;   // low tier: NO_ENV_HEMI x (1 + 0.6 lowSun)
// r187's PMREM filters a 256 px cube (its hard minimum) with 256 GGX samples per texel: a visible hitch on integrated
// GPUs and tens of seconds in a software rasteriser. Rebake once in the middle of a 3.5 s cross-fade and once when it lands.
const ENV_REBAKE = 1.7;
const LOW_SUN_VIOLET = 0.4;   // hemiSky -> skyAntiSolar by 0.4 lowSun (0.6 turned the dusk sand pink)
const FOG_SUN_BIAS = 0.08;    // global fog colour leans at most this far toward the sun glow when facing the sun
const FOG_ANTI_BIAS = 0.05;   // ... and toward the anti-solar tint with the sun behind
const SUN_KIND = 'sun';       // 'sun' = SunLight cascades, 'dir' = fallback box

export async function create(ctx) {
  const { scene, env, camera, quality, renderer } = ctx;
  const group = ctx.group('sky');
  scene.background = null;

  const noise = makeNoiseTexture(ctx, 256);
  const dome = createDome(ctx, noise);
  group.add(dome.mesh);
  const U = dome.uniforms;

  // ---- lights ----------------------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  hemi.name = 'hemi';
  let sunRig;
  // ?sun=dir forces the fallback rig (debugging)
  // the low tier takes the single-box fallback: one shadow pass instead of two cascades (about a quarter fewer triangles)
  let wantKind = quality.tier === 'low' ? 'dir' : SUN_KIND;
  try { const k = new URLSearchParams(location.search).get('sun'); if (k === 'dir' || k === 'sun') wantKind = k; } catch { /* no location */ }
  try { sunRig = makeSun(ctx, wantKind); } catch (e) { console.warn('[sky] SunLight unavailable, using the fallback', e); sunRig = makeSun(ctx, 'dir'); }
  const sun = sunRig.light;
  group.add(hemi, sun);
  if (sun.target) group.add(sun.target);
  ctx.lights = { sun, hemi, kind: sunRig.kind };

  // ---- fog wisps -------------------------------------------------------------------------------------------------------
  let wispDebug = false;   // ?wispdbg=1 tints the wisps magenta (A/B check of where the banks are)
  try { wispDebug = new URLSearchParams(location.search).get('wispdbg') === '1'; } catch { /* no location */ }
  const wisps = createWisps(ctx, noise);
  group.add(wisps.mesh);

  // ---- environment map -------------------------------------------------------------------------------------------------
  let pmrem = null, envRT = null, envScene = null, envTimer = 0, envDirty = false;
  if (quality.envMap) {
    pmrem = new THREE.PMREMGenerator(renderer);
    envScene = new THREE.Scene();
    envScene.fog = scene.fog;               // the dome material reads the scene fog uniforms
    envScene.add(dome.envMesh);
  }
  const fogKeep = new THREE.Color();
  function bakeEnv() {
    if (!pmrem) return;
    U.uEnv.value = 1;
    const camY = U.uCamY.value;
    U.uCamY.value = 9;                      // a street-level horizon whatever the current camera is doing
    fogKeep.copy(scene.fog.color);
    scene.fog.color.copy(env.current.fogColor);   // the unbiased preset colour: the bake must not depend on the heading
    const rt = pmrem.fromScene(envScene, 0, 0.1, 10);
    scene.fog.color.copy(fogKeep);
    U.uEnv.value = 0;
    U.uCamY.value = camY;
    scene.environment = rt.texture;
    if (envRT) envRT.dispose();
    envRT = rt;
  }

  // ---- per-frame --------------------------------------------------------------------------------------------------------
  const drift = new THREE.Vector4();
  let driftStarted = false;
  const fogCol = new THREE.Color();
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Color();

  function apply(dt, t) {
    const c = env.current, sd = env.sunDir, wd = env.windDir;

    // dome
    U.uZenith.value.copy(c.skyZenith); U.uHorizon.value.copy(c.skyHorizon);
    U.uGlow.value.copy(c.skySunGlow); U.uAnti.value.copy(c.skyAntiSolar);
    U.uSunColor.value.copy(c.sunColor);
    U.uCloudLit.value.copy(c.cloudLit); U.uCloudShade.value.copy(c.cloudShade);
    U.uGround.value.copy(c.hemiGround).multiplyScalar(0.55);
    U.uSunDir.value.copy(sd);
    U.uHaze.value = c.horizonHaze; U.uDisc.value = c.sunDisc;
    U.uCover.value = c.cloudCoverage; U.uDens.value = c.cloudDensity;
    U.uCamY.value = camera.position.y;
    U.uWind.value.set(wd.x, wd.z);

    // cloud drift: accumulated so a wind change during a cross-fade never jumps; seeded from t so any t looks the same
    const sp = c.cloudSpeed;
    if (!driftStarted) { drift.set(wd.x * sp * t, wd.z * sp * t, sp * 0.5 * t, 0); driftStarted = true; }
    else { drift.x += wd.x * sp * dt; drift.y += wd.z * sp * dt; drift.z += sp * 0.5 * dt; }
    // clouds move WITH the wind, so the pattern offset is the opposite sign
    U.uDrift.value.set(-drift.x, -drift.y, -drift.z, 0);

    // fog colour: the preset baseline, leaning toward the sun glow when you face the sun and toward the anti-solar
    // tint when it is behind you (cheap directional in-scattering). The dome reads the same uniform, so they match.
    camera.getWorldDirection(fwd);
    const fl = Math.hypot(fwd.x, fwd.z), sl = Math.hypot(sd.x, sd.z);
    const facing = fl > 1e-4 && sl > 1e-4 ? (fwd.x * sd.x + fwd.z * sd.z) / (fl * sl) : 0;
    const level = Math.min(1, fl * 1.3);                       // looking straight down: no directional bias
    const low = 1 - Math.min(0.75, Math.max(0, sd.y) * 1.1);
    fogCol.copy(c.fogColor);
    if (facing > 0) fogCol.lerp(c.skySunGlow, FOG_SUN_BIAS * facing * facing * low * level);
    else fogCol.lerp(c.skyAntiSolar, FOG_ANTI_BIAS * facing * facing * level);
    ctx.setFog(fogCol);

    // lights
    const ls = Math.min(1, Math.max(0, (sd.y - 0.05) / 0.3));
    const lowSun = 1 - ls * ls * (3 - 2 * ls);
    hemi.color.copy(c.hemiSky).lerp(c.skyAntiSolar, LOW_SUN_VIOLET * lowSun);
    hemi.groundColor.copy(c.hemiGround);
    hemi.intensity = c.hemiIntensity * HEMI_GAIN * (1 + LOW_SUN_HEMI * lowSun) * (pmrem ? 1 : NO_ENV_HEMI * (1 + LOW_SUN_NO_ENV * lowSun));
    if (pmrem) scene.environmentIntensity = ENV_INTENSITY + LOW_SUN_ENV * lowSun;
    sun.color.copy(c.sunColor); sun.intensity = c.sunIntensity;
    sunRig.update(sd, camera, c.shadowRadius, c.shadowStrength,
      camera.position.y - ctx.world.heightAt(camera.position.x, camera.position.z));

    wisps.update(dt, t, c.fogWisps, camera, wd, wispDebug ? tmp.set(1, 0.1, 0.8) : tmp.copy(fogCol));

    // environment map: rebake a few times during a cross-fade and once when it lands
    if (pmrem) {
      if (env.transitioning) { envDirty = true; envTimer += dt; if (envTimer > ENV_REBAKE) { envTimer = 0; bakeEnv(); } }
      else if (envDirty) { envDirty = false; envTimer = 0; bakeEnv(); }
    }
  }

  if (pmrem) scene.environmentIntensity = ENV_INTENSITY;
  apply(0, ctx.params.shot ? ctx.params.t : 0);
  driftStarted = false;       // the first real frame re-seeds the drift from its own t
  bakeEnv();

  return {
    update(dt, t) { apply(dt, t); },
    onPreset() { envDirty = true; },
    dispose() {
      scene.remove(group);
      if (scene.environment === envRT?.texture) scene.environment = null;
      envRT?.dispose(); pmrem?.dispose();
      dome.dispose(); wisps.dispose(); sunRig.dispose(); hemi.dispose(); noise.dispose();
      if (ctx.lights && ctx.lights.sun === sun) ctx.lights = undefined;
    },
  };
}
