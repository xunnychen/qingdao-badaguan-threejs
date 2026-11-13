// Package "ui-audio": the procedural soundscape. WebAudio synthesis only, no files.
//
//   ctx.audio = { volume, muted, music, available, setVolume(v), setMuted(on), setMusic(on) }
//   persisted with ctx.store: 'vol' (0..1), 'mute' ('1'/'0'), 'music' ('1'/'0'); ?mute=1 starts muted.
//
// The AudioContext is created inside the 'start' / 'resume' events (user gesture) and suspended on 'pause'. The graph
// lives in audio/engine.js, the layers in audio/layers.js. This file samples the world at about 10 Hz (shore distance,
// nearby trees, gusts, the blended preset mix) and hands that to the layers. In screenshot mode nothing is created.
// `?shot=0&audiotest=1` renders every layer through an OfflineAudioContext and draws the envelopes (audio/selftest.js).
import { createEngine } from './audio/engine.js';
import { createLayers } from './audio/layers.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const CONIFER = { cedar: 1, pine: 1, juniper: 0.6 };
const TICK = 0.1;

export async function create(ctx) {
  const { events, env, world, player, params, store, state } = ctx;

  const savedVol = parseFloat(store.get('vol'));
  const audio = {
    volume: Number.isFinite(savedVol) ? clamp(savedVol, 0, 1) : 0.8,
    muted: params.mute || store.get('mute') === '1',
    music: store.get('music') === '1',
    available: !params.shot && typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext),
    setVolume(v) {
      audio.volume = clamp(+v || 0, 0, 1);
      if (!params.shot) store.set('vol', audio.volume.toFixed(2));
      applyMaster(0.08);
    },
    setMuted(on) {
      audio.muted = !!on;
      if (!params.shot) store.set('mute', audio.muted ? '1' : '0');
      applyMaster(0.12);
    },
    setMusic(on) {
      audio.music = !!on;
      if (!params.shot) store.set('music', audio.music ? '1' : '0');
    },
    /** live node estimate, for debugging */
    get nodes() { return engine ? engine.nodes : 0; },
  };
  ctx.audio = audio;

  let ac = null, engine = null, layers = null, failed = false, suspendTimer = 0;

  /** `silent` forces the gain to 0 (tab hidden while playing), so a following suspend never cuts a live waveform. */
  function applyMaster(tc, silent = false) {
    if (!engine) return;
    const live = state.started && !state.paused && !silent && !document.hidden;
    const v = audio.muted || !live ? 0 : audio.volume * audio.volume * 1.5;   // squared: an even-feeling slider
    try { engine.master.gain.setTargetAtTime(v, ac.currentTime, tc); } catch { /* context closed */ }
  }

  if (params.shot) return { update() {}, onPreset() {}, dispose() { if (ctx.audio === audio) ctx.audio = undefined; } };

  function ensure() {
    if (ac || failed) return !!ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      const rand = ctx.rng.makeRng('audio:engine');
      engine = createEngine(ac, rand);
      layers = createLayers(engine, ctx.rng.makeRng('audio:layers'));
    } catch (e) {
      failed = true; audio.available = false;
      console.warn('[audio] unavailable', e);
      try { ac?.close(); } catch { /* ignore */ }
      ac = engine = layers = null;
    }
    return !!ac;
  }

  function wake() {
    clearTimeout(suspendTimer);
    if (!ensure()) return;
    try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    applyMaster(0.6);
  }
  function sleep() {
    if (!ac) return;
    applyMaster(0.05, true);
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => {
      if (ac && (state.paused || document.hidden)) { try { const p = ac.suspend(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
    }, 260);
  }
  function onVisibility() {
    if (document.hidden) sleep();
    else if (state.started && !state.paused && ac) wake();
  }

  // ---- listener state, sampled at 10 Hz --------------------------------------------------------------------------------
  const s = { a: env.current.audio, preset: env.name, prox: 0, conifer: 0, decid: 0, gust: 0, yaw: 0, music: false };
  const near = [];
  let acc = TICK, treeAcc = 1, conifer = 0, decid = 0;

  function sample(dt) {
    const x = player.pos.x, z = player.pos.z;
    s.a = env.current.audio; s.preset = env.name; s.yaw = player.yaw; s.music = audio.music;
    s.gust = ctx.wind ? ctx.wind.gust : 0;
    s.prox = Math.exp(-Math.max(0, world.shoreDist(x, z)) / 75);
    treeAcc += dt;
    if (treeAcc >= 0.5) {
      treeAcc = 0;
      world.treesNear(x, z, 20, near);
      let c = 0, d = 0;
      for (let i = 0; i < near.length; i++) {
        const t = near[i], w = 1 - Math.hypot(t.x - x, t.z - z) / 20;
        if (CONIFER[t.species]) c += w * CONIFER[t.species]; else d += w;
      }
      conifer = clamp(c / 3, 0, 1); decid = clamp(d / 3.5, 0, 1);
    }
    // ease so walking out from under a cedar does not step the wind
    s.conifer += (conifer - s.conifer) * 0.2; s.decid += (decid - s.decid) * 0.2;
  }

  function update(dt) {
    if (!ac || ac.state !== 'running') return;
    acc += dt;
    if (acc < TICK) return;
    const step = acc; acc = 0;
    try {
      sample(step);
      const now = ac.currentTime, a = s.a;
      engine.lowpass.frequency.setTargetAtTime(clamp(a.lowpass, 400, ac.sampleRate * 0.45), now, 0.5);
      engine.revOut.gain.setTargetAtTime(clamp(a.reverb * 2.2, 0, 1.4), now, 0.5);
      layers.tick(now, s);
    } catch (e) {
      if (!failed) { failed = true; console.warn('[audio] update failed', e); }
    }
  }

  const st = {};
  function onFootstep(e) {
    if (!ac || ac.state !== 'running' || audio.muted) return;
    try {
      let crunch = 0;
      if (e.surface === 'road' || e.surface === 'sidewalk' || e.surface === 'path') {
        const r = world.nearestStreet(e.x, e.z, st);
        if (r) crunch = env.current.litter[r.street.tree] || 0;
      }
      layers.footstep(e, ac.currentTime, crunch);
    } catch (err) {
      if (!failed) { failed = true; console.warn('[audio] footstep failed', err); }
    }
  }

  const offs = [
    events.on('start', wake), events.on('resume', wake), events.on('pause', sleep),
    events.on('footstep', onFootstep),
  ];
  document.addEventListener('visibilitychange', onVisibility);

  if (/[?&]audiotest=/.test(location.search)) {
    // dry-run the live path too (the context stays suspended without a gesture, but every node gets built and scheduled)
    if (ensure()) {
      try {
        treeAcc = 1; sample(0.5);
        layers.tick(ac.currentTime, { ...s, a: { ...s.a, cicadas: 0.4, foghorn: 0.5, drips: 0.4 }, music: true });
        for (const surface of ['road', 'sidewalk', 'boardwalk', 'sand', 'lawn', 'garden', 'water', 'rock', 'promenade', 'path']) layers.footstep({ surface, running: false, foot: 0 }, ac.currentTime, 1);
        console.log(`[audiotest] live graph ok: state ${ac.state}, ${engine.nodes} nodes, prox ${s.prox.toFixed(2)}`);
      } catch (e) { console.error('[audiotest] live graph failed', e); }
    }
    import('./audio/selftest.js').then((m) => m.run(ctx)).catch((e) => console.error('[audio] selftest failed', e));
  }

  return {
    update,
    onPreset() {},
    dispose() {
      offs.forEach((f) => f());
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(suspendTimer);
      try { layers?.dispose(); engine?.dispose(); ac?.close(); } catch { /* ignore */ }
      ac = engine = layers = null;
      if (ctx.audio === audio) ctx.audio = undefined;
    },
  };
}
