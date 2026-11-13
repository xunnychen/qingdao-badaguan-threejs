// The soundscape layers (docs/RESEARCH.md Part 3 §3). createLayers(engine, rand) -> { tick(now, s), footstep(e, now, crunch) }.
//
// tick() runs at about 10 Hz with the listener state
//   s = { a: env.current.audio, preset, prox (0..1 shore proximity), conifer (0..1), decid (0..1), gust (0..1),
//         yaw (rad, compass), music (bool) }
// Continuous layers follow s with setTargetAtTime; event layers (waves, birds, gulls, horns, drips, music box) keep a
// "next" time each and schedule one voice slightly ahead of `now`. Nothing here reads the wall clock.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Calibrated with audio/selftest.js (offline renders; RMS in dBFS at volume 1).
const K = {
  surf: 1.25, wind: 0.36, rustle: 0.2, cicadas: 0.5,
  sparrow: 0.1, magpie: 0.18, dove: 0.13, gull: 0.19, horn: 0.5, foghorn: 0.24, drip: 0.09, music: 0.085, step: 0.4,
};
// which birds call in which ambience (weights)
const BIRDS = {
  autumn: { sparrow: 0.45, magpie: 0.38, dove: 0.17 },
  fog: { dove: 0.6, sparrow: 0.32, magpie: 0.08 },
  dusk: { swallow: 0.5, sparrow: 0.3, magpie: 0.12, dove: 0.08 },
  spring: { sparrow: 0.55, dove: 0.22, magpie: 0.13, swallow: 0.1 },
};
// D major pentatonic over two octaves (music box)
const SCALE = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98, 1760];

export function createLayers(E, rand) {
  const tgt = (param, v, now, tc = 0.25) => param.setTargetAtTime(v, now, tc);

  // ---- surf: two overlapping swell / crash / retreat voices ----------------------------------------------------------
  const surfBus = E.gain(0), surfLP = E.filter('lowpass', 900, 0.4), surfSend = E.gain(0.2);
  surfBus.connect(surfLP); surfLP.connect(E.amb); surfLP.connect(surfSend); surfSend.connect(E.revIn);
  const windSrc = E.loop('pink', 1.1);
  const waves = [0, 1].map((i) => {
    const base = i ? 0.45 : -0.45;
    const lp = E.filter('lowpass', 480, 0.6), g = E.gain(0.12), bp = E.filter('bandpass', 1300, 0.7), h = E.gain(0.03), pan = E.panner(base);
    // the first swash borrows the wind's pink loop to save a node (different bands, so the correlation is inaudible);
    // the bodies and the second swash keep their own sources so the two breakers stay decorrelated and wide
    E.loop('brown', i * 1.9).connect(lp); lp.connect(g); g.connect(pan);
    (i ? E.loop('pink', 2.7) : windSrc).connect(bp); bp.connect(h); h.connect(pan);
    pan.connect(surfBus);
    return { lp, g, bp, h, pan, base, next: i ? 4.6 : 0.4 };
  });
  E.nodes += 13;
  function wave(v, t0) {
    const period = rand.range(7, 11), swell = rand.range(2.2, 2.9), decay = rand.range(4, 6), size = rand.range(0.55, 1);
    const tc = t0 + swell;
    // low body: builds, breaks, drains
    v.g.gain.setTargetAtTime(0.3 * size, t0, swell / 2.2);
    v.g.gain.setTargetAtTime(size, tc, 0.09);
    v.g.gain.setTargetAtTime(0.055, tc + 0.4, decay / 3.6);
    v.lp.frequency.setTargetAtTime(430, t0, 0.8);
    v.lp.frequency.setTargetAtTime(950, tc, 0.08);
    v.lp.frequency.setTargetAtTime(460, tc + 0.5, decay / 3);
    // swash: silent while the swell gathers, bright at the break, then a hiss sliding down as the water runs back
    v.h.gain.setTargetAtTime(0.06, t0, swell / 2);
    v.h.gain.setTargetAtTime(0.95 * size, tc, 0.06);
    v.h.gain.setTargetAtTime(0.015, tc + 0.35, decay / 3.2);
    v.bp.frequency.setTargetAtTime(1300, t0, swell / 3);
    v.bp.frequency.setTargetAtTime(2500, tc, 0.05);
    v.bp.frequency.setTargetAtTime(900, tc + 0.3, decay / 2.4);
    return period;
  }

  // ---- wind in the pines and cedars (松濤) -----------------------------------------------------------------------------
  // the low band goes straight to windOut; its fixed 0.6 is folded into WIND_LO below
  const WIND_LO = 0.6;
  const windOut = E.gain(0), windHi = E.filter('bandpass', 900, 1.2), windHiG = E.gain(1), windLo = E.filter('bandpass', 240, 0.5);
  windSrc.connect(windHi); windHi.connect(windHiG); windHiG.connect(windOut);
  windSrc.connect(windLo); windLo.connect(windOut);
  windOut.connect(E.amb);
  E.nodes += 4;

  // ---- deciduous rustle ------------------------------------------------------------------------------------------------
  const rustleHP = E.filter('highpass', 3000, 0.6), rustleG = E.gain(0);
  E.loop('rustle', 0.7).connect(rustleHP); rustleHP.connect(rustleG); rustleG.connect(E.amb);
  E.nodes += 2;

  // ---- cicadas (built only while the preset wants them) ----------------------------------------------------------------
  let cic = null, cicQuiet = 0;
  function cicadasOn(now) {
    const bus = E.gain(0), bp = E.filter('bandpass', 4900, 1.1);
    bus.connect(bp); bp.connect(E.amb);                       // dry: a wall of insects needs no reverb tail
    const voices = [-0.7, 0.1, 0.75].map((pan, i) => {
      const src = E.ac.createBufferSource();
      src.buffer = E.buffers.cicada; src.loop = true; src.playbackRate.value = [0.94, 1, 1.07][i];
      const g = E.gain(0.09), p = i === 1 ? null : E.panner(pan);          // the middle voice needs no panner
      src.connect(g); if (p) { g.connect(p); p.connect(bus); } else g.connect(bus);
      src.start(now, i * 1.3);
      return { src, g, p, next: now + i * 2.7 };
    });
    E.nodes += 10;
    cic = { bus, bp, voices };
  }
  function cicadasOff() {
    for (const v of cic.voices) { try { v.src.stop(); } catch { /* never started */ } v.src.disconnect(); v.g.disconnect(); v.p?.disconnect(); }
    cic.bus.disconnect(); cic.bp.disconnect();
    E.nodes -= 10; cic = null;
  }

  // ---- one-shot voices ---------------------------------------------------------------------------------------------------
  function sparrow(t0, s, high) {
    const far = rand();
    const L = K.sparrow * (0.3 + 0.7 * (1 - far) * (1 - far)) * (high ? 0.8 : 1);
    const v = E.voice(rand.range(-0.9, 0.9), 0.2 + 0.45 * far, 6);
    if (!v) return;
    const f0 = high ? rand.range(5200, 6800) : rand.range(3200, 5000), n = high ? rand.int(3, 9) : rand.int(2, 7);
    const car = E.osc('sine', f0), mod = E.osc('sine', rand.range(30, 60)), md = E.gain(f0 * 0.06), g = E.gain(0);
    mod.connect(md); md.connect(car.frequency); car.connect(g); g.connect(v.in);
    let t = t0;
    for (let i = 0; i < n; i++) {
      const f = f0 * rand.range(0.9, 1.12), d = high ? rand.range(0.03, 0.05) : rand.range(0.045, 0.075);
      car.frequency.setValueAtTime(f * 1.22, t);
      car.frequency.exponentialRampToValueAtTime(f * (high ? 1.0 : 0.82), t + d);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(L, t + 0.006);
      g.gain.linearRampToValueAtTime(0, t + d);
      t += d + (rand.chance(0.18) ? rand.range(0.2, 0.34) : rand.range(0.05, 0.12));
    }
    car.start(t0); mod.start(t0); car.stop(t + 0.03); mod.stop(t + 0.03);
    v.done(car, mod, md, g);
  }
  function magpie(t0) {
    const far = rand();
    const L = K.magpie * (0.3 + 0.7 * (1 - far) * (1 - far));
    const v = E.voice(rand.range(-0.9, 0.9), 0.25 + 0.4 * far, 5);
    if (!v) return;
    const n = rand.int(5, 8), gap = rand.range(0.1, 0.13);
    const src = E.burst('white', t0, n * gap + 0.1), bp = E.filter('bandpass', rand.range(2000, 2500), 4), g = E.gain(0);
    src.connect(bp); bp.connect(g); g.connect(v.in);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * gap * (1 + 0.08 * (rand() - 0.5));
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime((i === 0 ? 0.8 : 1) * L, t + 0.004);
      g.gain.setTargetAtTime(0, t + 0.014, 0.012);
    }
    v.done(src, bp, g);
  }
  function dove(t0) {
    const far = rand();
    const L = K.dove * (0.35 + 0.65 * (1 - far));
    const v = E.voice(rand.range(-0.8, 0.8), 0.35 + 0.35 * far, 5);
    if (!v) return;
    const f = rand.range(470, 540);
    const o = E.osc('triangle', f), lp = E.filter('lowpass', 900, 0.5), g = E.gain(0);
    o.connect(lp); lp.connect(g); g.connect(v.in);
    const phrase = [[0, 0.17, 0.8 * L], [0.27, 0.36, L], [0.76, 0.22, 0.7 * L]];
    const reps = rand.int(1, 3);
    let end = t0;
    for (let r = 0; r < reps; r++) {
      for (const [at, d, lv] of phrase) {
        const t = t0 + r * 1.28 + at;
        o.frequency.setValueAtTime(f * 0.96, t);
        o.frequency.linearRampToValueAtTime(f * 1.03, t + d * 0.4);
        o.frequency.linearRampToValueAtTime(f * 0.93, t + d);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(lv, t + 0.04);
        g.gain.setValueAtTime(lv, t + d - 0.07);
        g.gain.linearRampToValueAtTime(0, t + d);
        end = t + d;
      }
    }
    o.start(t0); o.stop(end + 0.03);
    v.done(o, lp, g);
  }
  function gull(t0, s) {
    const L = K.gull * rand.range(0.45, 1) * (0.3 + 0.7 * s.prox);
    const v = E.voice(rand.range(-0.85, 0.85), rand.range(0.5, 0.8), 8);
    if (!v) return;
    const scale = rand.range(0.86, 1.14);
    const tri = E.osc('triangle', 900), saw = E.osc('sawtooth', 900), sawG = E.gain(0.35);
    const f1 = E.filter('bandpass', 1600 * scale, 4), f2 = E.filter('bandpass', 2800 * scale, 5), g = E.gain(0);
    tri.connect(f1); tri.connect(f2); saw.connect(sawG); sawG.connect(f1); sawG.connect(f2);
    f1.connect(g); f2.connect(g); g.connect(v.in);
    let t = t0;
    const call = (d, lo, hi, end, lv) => {
      const j = () => 1 + 0.08 * (rand() - 0.5);
      for (const o of [tri, saw]) {
        o.frequency.setValueAtTime(lo * scale * j(), t);
        o.frequency.exponentialRampToValueAtTime(hi * scale * j(), t + d * 0.35);
        o.frequency.exponentialRampToValueAtTime(end * scale * j(), t + d);
      }
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lv * L, t + 0.035);
      g.gain.setValueAtTime(lv * L, t + d * 0.7);
      g.gain.linearRampToValueAtTime(0, t + d);
    };
    if (rand.chance(0.3)) {
      // one long falling mew
      const d = rand.range(0.9, 1.3);
      call(d, 1050, 1350, 720, 1); t += d;
    } else {
      const n = rand.int(3, 6);
      let gap = rand.range(0.3, 0.42);
      for (let i = 0; i < n; i++) {
        const d = i === 0 ? rand.range(0.42, 0.58) : rand.range(0.2, 0.3);
        call(d, 900, 1500, 800, i === 0 ? 1 : 0.85 - 0.06 * i);
        t += d + gap; gap *= 0.72;
      }
    }
    tri.start(t0); saw.start(t0); tri.stop(t + 0.05); saw.stop(t + 0.05);
    v.done(tri, saw, sawG, f1, f2, g);
  }
  function horn(t0, s) {
    const L = K.horn * s.a.horn * rand.range(0.7, 1);
    const v = E.voice(clamp(0.65 * Math.sin(s.yaw), -0.8, 0.8), 0.9, 6, true);
    if (!v) return;
    const big = rand.chance(0.45);
    const fa = big ? 87.3 : 110, fb = big ? 110 : 138.6;
    const a = E.osc('sawtooth', fa), b = E.osc('sawtooth', fb), lp = E.filter('lowpass', 350, 0.5), g = E.gain(0);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(v.in);
    const blast = (t, sustain) => {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(L, t + 0.3);
      g.gain.setValueAtTime(L, t + 0.3 + sustain);
      g.gain.linearRampToValueAtTime(0, t + 1.3 + sustain);
      for (const [o, f] of [[a, fa], [b, fb]]) {
        o.frequency.setValueAtTime(f, t);
        o.frequency.setValueAtTime(f, t + 0.3 + sustain);
        o.frequency.linearRampToValueAtTime(f * 0.972, t + 1.3 + sustain);
      }
      return t + 1.3 + sustain;
    };
    let end = blast(t0, rand.range(2.5, 4));
    if (rand.chance(0.3)) end = blast(end + 0.9, 0.7);       // long + short
    a.start(t0); b.start(t0); a.stop(end + 0.05); b.stop(end + 0.05);
    v.done(a, b, lp, g);
  }
  function foghorn(t0, s) {
    // one low-passed sawtooth with a slow shudder (7 nodes with its strip); kept well behind the surf
    const L = K.foghorn * s.a.foghorn;
    const v = E.voice(clamp(0.5 * Math.sin(s.yaw), -0.7, 0.7), 0.6, 7, true);
    if (!v) return;
    const saw = E.osc('sawtooth', 85), lp = E.filter('lowpass', 300, 0.6), g = E.gain(0);
    const lfo = E.osc('sine', 3.4), lfoG = E.gain(0.9);
    lfo.connect(lfoG); lfoG.connect(saw.frequency);
    saw.connect(lp); lp.connect(g); g.connect(v.in);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(L, t0 + 0.45);
    g.gain.setValueAtTime(L, t0 + 4.3);
    g.gain.linearRampToValueAtTime(0, t0 + 5);
    saw.frequency.setValueAtTime(85, t0 + 4.2);   // the sagging grunt at the end that earned it the name 海牛
    saw.frequency.linearRampToValueAtTime(71, t0 + 5);
    for (const o of [saw, lfo]) { o.start(t0); o.stop(t0 + 5.05); }
    v.done(saw, lfo, lfoG, lp, g);
  }
  function drip(t0, s) {
    const L = K.drip * rand.range(0.35, 1) * Math.min(1, s.a.drips * 2.5);
    const v = E.voice(rand.range(-0.9, 0.9), 0.5, 4);
    if (!v) return;
    const f = rand.range(1200, 2000), o = E.osc('sine', f), g = E.gain(0);
    o.connect(g); g.connect(v.in);
    let t = t0;
    const n = rand.chance(0.25) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const fi = f * (i ? 1.18 : 1);
      o.frequency.setValueAtTime(fi * 0.86, t);
      o.frequency.exponentialRampToValueAtTime(fi * 1.12, t + 0.025);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime((i ? 0.6 : 1) * L, t + 0.002);
      g.gain.setTargetAtTime(0, t + 0.004, 0.03);
      t += rand.range(0.09, 0.16);
    }
    o.start(t0); o.stop(t + 0.2);
    v.done(o, g);
  }
  let degree = 4;
  function musicNote(t0, lv = 1) {
    const v = E.voice(rand.range(-0.35, 0.35), 0.55, 6);
    if (!v) return;
    degree = clamp(degree + rand.pick([-3, -2, -1, -1, 1, 1, 2, 3]), 0, SCALE.length - 1);
    const f = SCALE[degree];
    const a = E.osc('sine', f), b = E.osc('triangle', f * 2.005), bg = E.gain(0.2), g = E.gain(0);
    a.connect(g); b.connect(bg); bg.connect(g); g.connect(v.in);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(K.music * lv, t0 + 0.004);
    g.gain.setTargetAtTime(0, t0 + 0.01, 0.55);
    bg.gain.setTargetAtTime(0.06, t0, 0.12);       // the tine's bright ping dies first
    for (const o of [a, b]) { o.start(t0); o.stop(t0 + 3.2); }
    v.done(a, b, bg, g);
  }

  // ---- footsteps (dry bus, not affected by the fog low-pass) -------------------------------------------------------------
  // Footsteps are centred (a left/right pan of 0.1 was inaudible and cost a panner per hit).
  function noiseHit(kind, t, dur, type, freq, q, level, attack, tc) {
    const src = E.burst(kind, t, dur, rand.range(0.92, 1.08)), f = E.filter(type, freq, q), g = E.gain(0);
    src.connect(f); f.connect(g); g.connect(E.fx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.setTargetAtTime(0, t + attack, tc);
    E.free(src, f, g);
    return f;
  }
  function footstep(e, now, crunch = 0) {
    const t = now + 0.005;
    const lv = K.step * (e.running ? 1.25 : 1) * rand.range(0.8, 1.05);
    switch (e.surface) {
      case 'boardwalk': {
        // hollow plank: a low knock that drops in pitch plus a short woody resonance
        const o = E.osc('sine', 150), g = E.gain(0);
        const f0 = rand.range(128, 165);
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.09);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv * 0.5, t + 0.004); g.gain.setTargetAtTime(0, t + 0.006, 0.03);
        o.connect(g); g.connect(E.fx);
        o.start(t); o.stop(t + 0.3);
        E.free(o, g);
        noiseHit('pink', t, 0.16, 'bandpass', rand.range(380, 470), 3.5, lv * 0.8, 0.003, 0.018);
        break;
      }
      case 'sand':
        noiseHit('pink', t, 0.4, 'bandpass', rand.range(620, 780), 0.8, lv * 1.5, 0.03, 0.05);
        break;
      case 'lawn': case 'garden':
        noiseHit('pink', t, 0.3, 'bandpass', rand.range(1050, 1350), 1, lv * 0.85, 0.018, 0.035);
        noiseHit('brown', t, 0.12, 'lowpass', 180, 0.7, lv * 0.8, 0.004, 0.015);
        break;
      case 'water': {
        const f = noiseHit('white', t, 0.6, 'bandpass', 900, 0.9, lv * 0.5, 0.02, 0.09);
        f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
        noiseHit('brown', t, 0.25, 'lowpass', 300, 0.7, lv * 0.9, 0.006, 0.04);
        break;
      }
      default: {
        // granite setts / asphalt / rock: a dull thump with a small shoe click on top
        const hard = e.surface === 'rock' || e.surface === 'promenade' ? 1.25 : 1;
        noiseHit('brown', t, 0.16, 'lowpass', 250, 0.8, lv * 1.5, 0.003, 0.016);
        noiseHit('white', t, 0.06, 'bandpass', rand.range(1600, 2000), 2, lv * 0.13 * hard, 0.001, 0.006);
      }
    }
    if (crunch > 0.3 && e.surface !== 'water' && e.surface !== 'sand') {
      // dry leaves: a few micro-grains of high-passed noise
      const n = rand.int(3, 4), amp = lv * 0.62 * Math.min(1, crunch);
      const src = E.burst('white', t, 0.16), hp = E.filter('highpass', rand.range(1900, 2600), 0.7), g = E.gain(0);
      src.connect(hp); hp.connect(g); g.connect(E.fx);
      let tg = t + 0.004;
      for (let i = 0; i < n; i++) {
        g.gain.setValueAtTime(0, tg);
        g.gain.linearRampToValueAtTime(amp * rand.range(0.45, 1), tg + 0.003);
        g.gain.setTargetAtTime(0, tg + 0.004, rand.range(0.005, 0.011));
        tg += rand.range(0.018, 0.034);
      }
      E.free(src, hp, g);
    }
  }

  // ---- scheduler ----------------------------------------------------------------------------------------------------------
  const next = { bird: 1.5, gull: 7, horn: 0, fog: -1, drip: 0.5, music: 2.5 };
  next.horn = rand.range(22, 50);
  let started = false, phrase = 0;
  const ahead = (key, now) => next[key] <= now + 0.3;
  const at = (key, now) => Math.max(next[key], now + 0.03);

  function tick(now, s) {
    const a = s.a;
    if (!started) { started = true; for (const k in next) if (next[k] >= 0) next[k] += now; for (const v of waves) v.next += now; }

    // surf
    tgt(surfBus.gain, a.surf * K.surf * (0.1 + 0.9 * s.prox), now, 0.6);
    tgt(surfLP.frequency, 380 + 9000 * s.prox, now, 0.6);
    for (const v of waves) {
      if (v.pan.pan) tgt(v.pan.pan, clamp(v.base + 0.42 * Math.sin(s.yaw) * (1 - 0.5 * s.prox), -1, 1), now, 0.3);
      if (v.next <= now + 0.3) { const t0 = Math.max(v.next, now + 0.03); v.next = t0 + wave(v, t0); }
    }

    // wind: two slow wandering LFOs for level and colour
    const l1 = 0.5 + 0.3 * Math.sin(TAU * 0.07 * now + 1.3) + 0.2 * Math.sin(TAU * 0.173 * now);
    const l2 = 0.5 + 0.32 * Math.sin(TAU * 0.053 * now + 4.1) + 0.18 * Math.sin(TAU * 0.131 * now + 2.2);
    tgt(windOut.gain, WIND_LO * a.wind * K.wind * (0.5 + 0.5 * l1) * (1 + 0.9 * s.gust) * (1 + 0.8 * s.conifer), now, 0.35);
    tgt(windHi.frequency, 600 + 800 * l2 + 550 * s.conifer + 250 * s.gust, now, 0.35);
    tgt(windHiG.gain, (0.5 + 0.9 * s.conifer) / WIND_LO, now, 0.5);

    // rustle rides the shared gust envelope
    const flick = 0.5 + 0.5 * Math.sin(TAU * 0.31 * now + 0.7) * Math.sin(TAU * 0.11 * now);
    tgt(rustleG.gain, a.rustle * K.rustle * (0.16 + 0.22 * flick + 1.05 * s.gust) * (0.35 + 0.65 * s.decid), now, 0.3);

    // cicadas
    if (a.cicadas > 0.01) {
      if (!cic) cicadasOn(now + 0.03);
      cicQuiet = 0;
      tgt(cic.bus.gain, a.cicadas * K.cicadas, now, 0.5);
      for (const v of cic.voices) {
        if (v.next <= now + 0.3) {
          // "wee-----": a slow crescendo, a held buzz, a quick collapse
          const t0 = Math.max(v.next, now + 0.03), up = rand.range(2.5, 4.5), hold = rand.range(1.5, 3);
          v.g.gain.setTargetAtTime(1, t0, up / 2.5);
          v.g.gain.setTargetAtTime(0.09, t0 + up + hold, 0.4);
          v.next = t0 + up + hold + rand.range(2, 3.5);
        }
      }
    } else if (cic && ++cicQuiet > 40) cicadasOff();

    // birds
    if (a.birds > 0.02) {
      if (ahead('bird', now)) {
        const t0 = at('bird', now), kind = rand.weighted(BIRDS[s.preset] || BIRDS.autumn);
        if (kind === 'magpie') magpie(t0);
        else if (kind === 'dove') dove(t0);
        else sparrow(t0, s, kind === 'swallow');
        // sparrows answer each other in short flurries
        const mean = clamp(1.5 / a.birds, 1.2, 40);
        if (kind !== 'dove' && phrase < 2 && rand.chance(0.35)) { phrase++; next.bird = t0 + rand.range(0.5, 1.1); }
        else { phrase = 0; next.bird = t0 + mean * rand.range(0.4, 1.7); }
      }
    } else if (next.bird < now + 1) next.bird = now + 1;

    // gulls
    if (a.gulls > 0.01) {
      if (ahead('gull', now)) { const t0 = at('gull', now); gull(t0, s); next.gull = t0 + rand.range(15, 40) * clamp(0.15 / a.gulls, 0.6, 3); }
    } else if (next.gull < now + 2) next.gull = now + 2;

    // distant ship
    if (a.horn > 0.01) {
      if (ahead('horn', now)) { const t0 = at('horn', now); horn(t0, s); next.horn = t0 + rand.range(60, 150); }
    } else if (next.horn < now + 5) next.horn = now + 5;

    // foghorn: regular, as a real one is
    if (a.foghorn > 0.05) {
      if (next.fog < 0) next.fog = now + 3.5;
      if (ahead('fog', now)) { const t0 = at('fog', now); foghorn(t0, s); next.fog = t0 + 30; }
    } else next.fog = -1;

    // drips from the wet canopy
    if (a.drips > 0.02) {
      if (ahead('drip', now)) { const t0 = at('drip', now); drip(t0, s); next.drip = t0 + rand.range(0.25, 1.8) / clamp(a.drips * 2.5, 0.2, 2); }
    } else if (next.drip < now + 0.5) next.drip = now + 0.5;

    // music box
    if (s.music) {
      if (ahead('music', now)) {
        const t0 = at('music', now);
        musicNote(t0);
        if (rand.chance(0.4)) { musicNote(t0 + rand.pick([0.32, 0.48, 0.64]), 0.8); if (rand.chance(0.35)) musicNote(t0 + 0.96, 0.7); }
        next.music = t0 + rand.range(3, 8);
      }
    } else if (next.music < now + 1) next.music = now + 1;
  }

  return {
    tick, footstep, K,
    dispose() { if (cic) cicadasOff(); },
  };
}
