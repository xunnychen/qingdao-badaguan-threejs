// Package "player": first-person stroll. Pointer lock + WASD on desktop, virtual joystick + drag-look on touch.
// When the browser refuses the pointer lock (an iframe without the permission, Chrome's cooldown after Esc) or has no
// such API, the walk carries on in DRAG-LOOK mode: hold a mouse button on the scene and drag to look, Esc pauses.
// The walking maths lives in player/motion.js (DOM-free, tested under Node by player/selftest.mjs); the touch layer in
// player/touch.js. Zero draw calls; update() does not allocate.
//
// Extras beyond the contract (all optional for other packages):
//   ctx.player.sensitivity            mouse-look multiplier (persisted as store 'sens'); emit 'sens' (number) to change it
//   footstep payload                  { surface, running, x, z, foot (0 left / 1 right), wading } - ONE reused object
//   boundary payload                  { x, z } - ONE reused object, at most every 2.5 s
//   [ and ]                           lower / raise the look sensitivity
//   ctx.player.lookMode               'lock' | 'drag' | 'touch' while playing; event 'lookmode' (same string) on change
//   ?debug=1: F fly / no-clip (Q down, E up, Shift fast), T next named view
import { createWalker, resetWalker, createStepper, damp } from './player/motion.js';
import { createTouchControls } from './player/touch.js';

const LOOK_RATE = 0.0022;            // rad per mouse count at sensitivity 1
const PITCH_MAX = 1.45;
const EYE = 1.65;
const ATTRACT_YAW = (12 * Math.PI) / 180;
const FOV_BRISK = 3;                 // degrees added at a brisk pace
const BOUNDARY_EVERY = 2.5;          // seconds between 'boundary' events
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export async function create(ctx) {
  const { player, canvas, camera, collision, world, state, params, app, events, store, map } = ctx;

  window.__setView = (x, z, yawDeg, pitchDeg, h) => player.teleport(+x || 0, +z || 0, yawDeg, pitchDeg, h);

  // Screenshot mode: no listeners, no DOM, the camera stays exactly where ctx.player says.
  if (params.shot) {
    return { update() { player.applyToCamera(); }, onPreset() {}, dispose() { delete window.__setView; } };
  }

  const walker = resetWalker(createWalker(), player.pos.x, player.pos.z, world);
  const step = createStepper({ world, collision, walk: map.WALK, radius: player.radius });
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionScale = reducedMotion ? 0.35 : 1;
  const baseFov = camera.fov;
  const easeFov = params.fov == null && !reducedMotion;
  const offs = [];
  const listeners = [];
  const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); };

  // ---- look sensitivity ---------------------------------------------------------------------------------------------
  const readSens = () => { const v = parseFloat(store.get('sens')); return isFinite(v) ? clamp(v, 0.2, 4) : 1; };
  player.sensitivity = readSens();
  const setSens = (v, persist) => {
    if (!isFinite(v)) return;
    player.sensitivity = clamp(+v, 0.2, 4);
    if (persist) store.set('sens', player.sensitivity.toFixed(2));
  };
  offs.push(events.on('sens', (v) => setSens(v, true)));

  // ---- input state --------------------------------------------------------------------------------------------------
  let kF = false, kB = false, kL = false, kR = false, kShiftL = false, kShiftR = false, kUp = false, kDown = false;
  let kW = false, kS = false, kA = false, kD = false; // letters and arrows tracked apart so releasing one keeps the other
  // which kind of input pressed "start" / "resume" decides the control scheme (a touch laptop reports isTouch too).
  // Until a pointer has been seen, and for a keyboard start (the UI focuses its button, so Enter fires no pointerdown),
  // go by whether the device has a mouse-class pointer at all.
  const mq = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const finePointer = () => mq('(any-pointer: fine)') || (mq('(pointer: fine)') && !mq('(any-pointer: coarse)'));
  let lastPointer = ctx.quality.isTouch && !finePointer() ? 'touch' : 'mouse';
  let touchMode = false, fly = false, viewIdx = 0;
  let attractOffYaw = 0, attractOffPitch = 0, attractT = 0;
  let restEye = player.eyeHeight;      // an aerial ?view keeps its height until the walker takes a step
  let lastBoundary = -1e9, fovNow = baseFov;
  const stepEvt = { surface: 'road', running: false, x: 0, z: 0, foot: 0, wading: false };
  const edgeEvt = { x: 0, z: 0 };
  const playing = () => state.started && !state.paused;

  function clearKeys() { kF = kB = kL = kR = kW = kS = kA = kD = kShiftL = kShiftR = kUp = kDown = false; }

  function setKey(code, down) {
    switch (code) {
      case 'KeyW': kW = down; break;
      case 'ArrowUp': kF = down; break;
      case 'KeyS': kS = down; break;
      case 'ArrowDown': kB = down; break;
      case 'KeyA': kA = down; break;
      case 'ArrowLeft': kL = down; break;
      case 'KeyD': kD = down; break;
      case 'ArrowRight': kR = down; break;
      case 'ShiftLeft': kShiftL = down; break;
      case 'ShiftRight': kShiftR = down; break;
      case 'KeyE': kUp = down; break;
      case 'KeyQ': kDown = down; break;
      default: return false;
    }
    return true;
  }

  function onKeyDown(e) {
    if (!playing()) {
      // a keyboard start or resume: with a mouse attached that means pointer lock, not the touch layer
      if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && finePointer()) lastPointer = 'mouse';
      return;
    }
    // with the lock held the browser eats Esc and drops the lock (-> onLockChange); without one it is ours to handle
    if (e.code === 'Escape' && !isLocked()) { e.preventDefault(); app.pause(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const used = setKey(e.code, true);
    if (used && e.code.startsWith('Arrow')) e.preventDefault(); // no page scroll
    if (e.repeat) return;
    if (e.code === 'BracketLeft') { setSens(player.sensitivity / 1.12, true); events.emit('sens', player.sensitivity); }
    else if (e.code === 'BracketRight') { setSens(player.sensitivity * 1.12, true); events.emit('sens', player.sensitivity); }
    else if (params.debug && e.code === 'KeyF') {
      fly = !fly;
      if (!fly) { restEye = EYE; resetWalker(walker, player.pos.x, player.pos.z, world); }
    } else if (params.debug && e.code === 'KeyT') {
      const ids = Object.keys(map.views);
      viewIdx = (viewIdx + 1) % ids.length;
      const v = map.views[ids[viewIdx]];
      player.teleport(v.x, v.z, v.yaw ?? 0, v.pitch ?? 0, v.h);
    }
  }
  function onKeyUp(e) { setKey(e.code, false); }

  // ---- pointer lock (desktop) ---------------------------------------------------------------------------------------
  const isLocked = () => document.pointerLockElement === canvas;
  let dragLook = false, dragId = -1, dragX = 0, dragY = 0;
  const cursor0 = canvas.style.cursor;
  function setLookMode(mode) {
    if (player.lookMode === mode) return;
    player.lookMode = mode;
    events.emit('lookmode', mode);
  }
  function endDrag() {
    if (dragId < 0) return;
    try { canvas.releasePointerCapture(dragId); } catch { /* already released */ }
    dragId = -1;
  }
  function syncCursor() { canvas.style.cursor = dragLook && !touchMode && playing() ? (dragId >= 0 ? 'grabbing' : 'grab') : cursor0; }
  function setDragLook(on) {
    dragLook = on;
    if (!on) endDrag();
    else if (playing() && !touchMode) { player.locked = true; setLookMode('drag'); }
    syncCursor();
  }
  function lockFailed() {
    // Refused (no permission in this frame, or Chrome's ~1.3 s cooldown after Esc): never bounce back to the menu.
    // Keep walking with drag-look; every click on the scene retries the lock and upgrades silently.
    if (!isLocked() && !touchMode) setDragLook(true);
  }
  let lastLockAsk = -1e9;
  function requestLock() {
    if (isLocked()) return;
    if (!canvas.requestPointerLock) { setDragLook(true); return; }
    const now = performance.now();
    if (dragLook && now - lastLockAsk < 250) return; // pointerup and click of one press both land here: ask once
    lastLockAsk = now;
    try {
      const p = canvas.requestPointerLock();
      if (p && typeof p.then === 'function') p.then(undefined, lockFailed);
    } catch { lockFailed(); }
    try { canvas.focus({ preventScroll: true }); } catch { /* not focusable */ }
  }
  function onLockChange() {
    const locked = isLocked();
    if (touchMode) return;
    if (locked) { setDragLook(false); player.locked = true; if (playing()) setLookMode('lock'); return; }
    if (dragLook) return;            // never had it (or a stray event): drag-look keeps the walk going
    player.locked = false;
    clearKeys(); app.pause();
  }
  function onMouseMove(e) {
    if (!isLocked() || !playing()) return;
    const k = LOOK_RATE * player.sensitivity;
    player.yaw += clamp(e.movementX || 0, -200, 200) * k;
    player.pitch = clamp(player.pitch - clamp(e.movementY || 0, -200, 200) * k, -PITCH_MAX, PITCH_MAX);
  }
  // clicking the scene while playing without the lock (refused earlier, or dropped silently) asks for it again
  function onCanvasClick() { if (playing() && !touchMode && !isLocked()) requestLock(); }

  // ---- drag-look (desktop without a pointer lock) -------------------------------------------------------------------
  function onDragDown(e) {
    if (!dragLook || touchMode || isLocked() || !playing() || dragId >= 0) return;
    dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY;
    try { canvas.setPointerCapture(dragId); } catch { /* synthetic pointer */ }
    try { canvas.focus({ preventScroll: true }); } catch { /* not focusable */ }
    syncCursor();
  }
  function onDragMove(e) {
    if (e.pointerId !== dragId) return;
    const dx = e.clientX - dragX, dy = e.clientY - dragY;
    dragX = e.clientX; dragY = e.clientY;
    if (isLocked() || !playing()) return;
    const k = LOOK_RATE * player.sensitivity;
    player.yaw += clamp(dx, -200, 200) * k;
    player.pitch = clamp(player.pitch - clamp(dy, -200, 200) * k, -PITCH_MAX, PITCH_MAX);
  }
  function onDragUp(e) {
    if (e.pointerId !== dragId) return;
    endDrag(); syncCursor();
    // releasing the button is a user gesture too: ask for the lock again, so the walk upgrades by itself as soon as
    // the browser allows it (a refusal just lands in lockFailed() and nothing changes)
    if (e.type === 'pointerup' && e.pointerType !== 'touch' && playing() && !touchMode) requestLock();
  }

  // ---- touch --------------------------------------------------------------------------------------------------------
  const touch = ctx.quality.isTouch
    ? createTouchControls({
      uiRoot: ctx.uiRoot,
      onLook(dYaw, dPitch) {
        if (!playing()) return;
        player.yaw += dYaw;
        player.pitch = clamp(player.pitch + dPitch, -touch.pitchMax, touch.pitchMax);
      },
    })
    : null;
  function onAnyPointerDown(e) { lastPointer = e.pointerType || 'mouse'; }

  function enter() {
    player.sensitivity = readSens();
    clearKeys();
    touchMode = !!touch && lastPointer !== 'mouse';
    if (touchMode) { endDrag(); touch.setActive(true); player.locked = true; setLookMode('touch'); syncCursor(); }
    else {
      touch?.setActive(false);
      if (dragLook) setDragLook(true); // refused before: playable at once, requestLock() below still tries to upgrade
      requestLock();
    }
  }
  function leave() {
    clearKeys();
    endDrag();
    if (touch) touch.setActive(false);
    if (touchMode || dragLook) player.locked = false;
    if (!touchMode && isLocked()) document.exitPointerLock?.();
    syncCursor();
  }
  function onBlur() { clearKeys(); endDrag(); syncCursor(); touch?.release(); }
  function onVisibility() { if (document.hidden) { onBlur(); if (touchMode) app.pause(); } }

  listen(window, 'keydown', onKeyDown);
  listen(window, 'keyup', onKeyUp);
  listen(window, 'blur', onBlur);
  listen(window, 'pointerdown', onAnyPointerDown, true);
  listen(document, 'visibilitychange', onVisibility);
  listen(document, 'mousemove', onMouseMove);
  listen(document, 'pointerlockchange', onLockChange);
  listen(document, 'pointerlockerror', lockFailed);
  listen(canvas, 'click', onCanvasClick);
  listen(canvas, 'pointerdown', onDragDown);
  listen(canvas, 'pointermove', onDragMove);
  listen(canvas, 'pointerup', onDragUp);
  listen(canvas, 'pointercancel', onDragUp);
  listen(canvas, 'lostpointercapture', onDragUp);
  offs.push(events.on('start', enter), events.on('resume', enter), events.on('pause', leave));
  offs.push(events.on('teleport', () => {
    resetWalker(walker, player.pos.x, player.pos.z, world);
    attractOffYaw = attractOffPitch = 0;
    restEye = player.eyeHeight;
  }));

  // ---- per frame ----------------------------------------------------------------------------------------------------
  function updateFly(dt) {
    const f = (kW || kF ? 1 : 0) - (kS || kB ? 1 : 0), r = (kD || kR ? 1 : 0) - (kA || kL ? 1 : 0), u = (kUp ? 1 : 0) - (kDown ? 1 : 0);
    const sp = (kShiftL || kShiftR ? 60 : 14) * dt;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw), cp = Math.cos(player.pitch), spn = Math.sin(player.pitch);
    const x = player.pos.x + (sin * cp * f + cos * r) * sp, z = player.pos.z + (-cos * cp * f + sin * r) * sp;
    const eyeY = player.pos.y + player.eyeHeight + (spn * f + u) * sp;
    const g = world.heightAt(x, z);
    player.pos.set(x, g, z);
    player.eyeHeight = Math.max(0.3, eyeY - g);
    player.bob = 0; player.vel.set(0, 0, 0); player.speed = 0; player.moving = player.running = false;
    player.surface = world.surfaceAt(x, z);
    walker.x = x; walker.z = z; walker.y = g;
    restEye = player.eyeHeight; // pausing runs the walking path: it must not ease the eye back to the ground
  }

  function update(dt, t) {
    const live = playing();

    // title screen: slow pan around the spawn heading; eases back once the walk starts
    if (!state.started) {
      attractT += dt;
      const ny = ATTRACT_YAW * Math.sin(attractT * 0.11), np = 0.02 * Math.sin(attractT * 0.073 + 0.6);
      player.yaw += ny - attractOffYaw; player.pitch += np - attractOffPitch;
      attractOffYaw = ny; attractOffPitch = np;
    } else if (attractOffYaw !== 0 || attractOffPitch !== 0) {
      let ny = damp(attractOffYaw, 0, 2.2, dt), np = damp(attractOffPitch, 0, 2.2, dt);
      if (Math.abs(ny) < 1e-4) ny = 0;
      if (Math.abs(np) < 1e-4) np = 0;
      player.yaw += ny - attractOffYaw; player.pitch = clamp(player.pitch + np - attractOffPitch, -PITCH_MAX, PITCH_MAX);
      attractOffYaw = ny; attractOffPitch = np;
    }

    if (fly && live) {
      updateFly(dt);
      player.applyToCamera();
      return;
    }

    // someone moved the walker without teleport(): follow, do not fight
    if (player.pos.x !== walker.x || player.pos.z !== walker.z) resetWalker(walker, player.pos.x, player.pos.z, world);

    let f = 0, r = 0, run = 0;
    if (live) {
      f = (kW || kF ? 1 : 0) - (kS || kB ? 1 : 0);
      r = (kD || kR ? 1 : 0) - (kA || kL ? 1 : 0);
      run = kShiftL || kShiftR ? 1 : 0;
      if (touchMode && touch && (touch.x !== 0 || touch.y !== 0)) { f = touch.y; r = touch.x; run = touch.run; }
    }
    const y0 = walker.y;
    step(walker, f, r, run, player.yaw, dt, t);

    player.pos.set(walker.x, walker.y, walker.z);
    player.vel.set(walker.ax, dt > 0 ? (walker.y - y0) / dt : 0, walker.az);
    player.speed = walker.speed; player.moving = walker.moving; player.running = walker.running;
    player.surface = walker.surface;
    player.bob = walker.bob * motionScale;
    if (walker.moving && player.eyeHeight !== EYE && restEye !== EYE) restEye = EYE;
    if (player.eyeHeight !== restEye) {
      player.eyeHeight = damp(player.eyeHeight, restEye, 2.2, dt);
      if (Math.abs(player.eyeHeight - restEye) < 0.002) player.eyeHeight = restEye;
    }

    if (walker.stepped) {
      stepEvt.surface = walker.depth > 0.03 ? 'water' : walker.surface;
      stepEvt.running = walker.running; stepEvt.x = walker.x; stepEvt.z = walker.z;
      stepEvt.foot = walker.foot; stepEvt.wading = walker.depth > 0.03;
      events.emit('footstep', stepEvt);
    }
    if (walker.edge && t - lastBoundary > BOUNDARY_EVERY) {
      lastBoundary = t;
      edgeEvt.x = walker.x; edgeEvt.z = walker.z;
      events.emit('boundary', edgeEvt);
    }

    player.applyToCamera();
    // step sway: a few millimetres sideways and a breath of roll, in the camera only (ctx.player stays clean)
    if (!reducedMotion && walker.gait > 0.001) {
      camera.position.x += Math.cos(player.yaw) * walker.sway;
      camera.position.z += Math.sin(player.yaw) * walker.sway;
      camera.rotation.z = -walker.roll;
    }
    if (easeFov) {
      const target = baseFov + FOV_BRISK * walker.run;
      if (Math.abs(target - fovNow) > 0.005) {
        fovNow = damp(fovNow, target, 4, dt);
        camera.fov = fovNow; camera.updateProjectionMatrix();
      }
    }
  }

  return {
    update,
    onPreset() {},
    dispose() {
      for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
      listeners.length = 0;
      for (const off of offs) off();
      offs.length = 0;
      touch?.dispose();
      endDrag();
      canvas.style.cursor = cursor0;
      if (isLocked()) document.exitPointerLock?.();
      player.locked = false;
      delete player.lookMode;
      if (camera.fov !== baseFov) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
      delete window.__setView;
    },
  };
}
