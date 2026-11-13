// Environment (ambience preset) state with cross-fade. ctx.env.
import * as THREE from 'three';
import { PRESETS, PRESET_ORDER, DEFAULT_PRESET } from './presets.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
function resolve(v) {
  if (typeof v === 'string') return HEX.test(v) ? new THREE.Color(v) : v;
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = resolve(v[k]); return o; }
  return v;
}
function clone(v) {
  if (v && v.isColor) return v.clone();
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = clone(v[k]); return o; }
  return v;
}
function blend(out, a, b, t, key) {
  for (const k in b) {
    const va = a[k], vb = b[k];
    if (vb && vb.isColor) out[k].copy(va).lerp(vb, t);
    else if (typeof vb === 'number') {
      if (k === 'sunAzimuth' || k === 'windAzimuth') { const d = ((vb - va + 540) % 360) - 180; out[k] = va + d * t; }
      else out[k] = va + (vb - va) * t;
    } else if (Array.isArray(vb) || (vb && typeof vb === 'object')) blend(out[k], va, vb, t, k);
    else out[k] = t < 0.5 ? va : vb;
  }
}

/** Unit vector pointing TOWARD the sun for compass azimuth/elevation in degrees (north = -z, east = +x). */
export function sunDirection(elevationDeg, azimuthDeg, out = new THREE.Vector3()) {
  const el = THREE.MathUtils.degToRad(elevationDeg), az = THREE.MathUtils.degToRad(azimuthDeg);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export function createEnv(events, initialName) {
  const resolved = {};
  for (const id of PRESET_ORDER) resolved[id] = resolve(PRESETS[id]);
  const start = resolved[initialName] ? initialName : DEFAULT_PRESET;
  const env = {
    names: PRESET_ORDER, presets: PRESETS, resolved,
    name: start,
    target: resolved[start],
    prev: resolved[start],
    current: clone(resolved[start]),   // live, blended every frame. READ THIS in update().
    blend: 1, transitioning: false, duration: 3.5,
    sunDir: new THREE.Vector3(),       // unit vector toward the sun (live)
    windDir: new THREE.Vector3(),      // unit horizontal vector the wind blows toward (live)
    /** Switch preset. opts.instant skips the cross-fade. Emits 'preset' (target, prev) and calls module.onPreset. */
    set(name, opts = {}) {
      if (!resolved[name] || (name === env.name && !opts.force)) return false;
      env._from = clone(env.current);
      env.prev = env.target; env.target = resolved[name]; env.name = name;
      env.duration = opts.duration ?? 3.5;
      env.blend = opts.instant ? 1 : 0; env.transitioning = !opts.instant;
      if (opts.instant) { blend(env.current, env._from, env.target, 1); refresh(); }
      events.emit('preset', env.target, env.prev);
      return true;
    },
    next(dir = 1) { const i = PRESET_ORDER.indexOf(env.name); return env.set(PRESET_ORDER[(i + dir + PRESET_ORDER.length) % PRESET_ORDER.length]); },
    update(dt) {
      if (!env.transitioning) return;
      env.blend = Math.min(1, env.blend + dt / env.duration);
      const t = env.blend * env.blend * (3 - 2 * env.blend);
      blend(env.current, env._from, env.target, t);
      refresh();
      if (env.blend >= 1) env.transitioning = false;
    },
  };
  function refresh() {
    sunDirection(env.current.sunElevation, env.current.sunAzimuth, env.sunDir);
    const az = THREE.MathUtils.degToRad(env.current.windAzimuth);
    env.windDir.set(Math.sin(az), 0, -Math.cos(az));
  }
  refresh();
  return env;
}
