// Audio engine: the fixed part of the graph plus helpers for one-shot voices. Works on a real AudioContext and on an
// OfflineAudioContext (audio/selftest.js renders the layers offline to check levels and envelopes).
//
//   layers ──► amb ──► lowpass ──► master ──► compressor ──► destination
//      └─send─► revIn ─► convolver ─► revOut ─┘ (also low-passed: fog muffles the tail too)
//   footsteps ──► fx ──────────────► master          (bypasses the fog low-pass)
//
// Every time argument is an explicit context time so nothing here reads ac.currentTime behind the caller's back.

const TAU = Math.PI * 2;
export const MAX_VOICES = 5;      // concurrent one-shot voices (birds, gulls, horns, drips, music box)
export const VOICE_NODES = 16;    // node budget for those voices together; ornamental ones are skipped beyond it

/** 4 s loops. Filters run twice over the periodic white input so the loop point is seamless. */
export function buildLoops(sr, rand, seconds = 4) {
  const n = Math.floor(sr * seconds);
  const white = new Float32Array(n), pink = new Float32Array(n), brown = new Float32Array(n);
  const rustle = new Float32Array(n), cicada = new Float32Array(n);
  for (let i = 0; i < n; i++) white[i] = rand() * 2 - 1;

  // pink: Paul Kellet's filter
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const w = white[i];
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      pink[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  }
  // brown: leaky integrator
  let last = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { last = (last + 0.02 * white[i]) / 1.02; brown[i] = last; }

  // leaf rustle: high-passed white with a shallow 6-12 Hz flutter baked in (frequencies are multiples of 1/seconds)
  const a = Math.exp((-TAU * 2600) / sr);
  let lp = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      lp = a * lp + (1 - a) * white[i];
      const t = i / sr;
      const am = 0.72 + 0.14 * Math.sin(TAU * 7.25 * t) + 0.09 * Math.sin(TAU * 9.5 * t + 1.3) + 0.05 * Math.sin(TAU * 11.75 * t + 2.1);
      rustle[i] = (white[i] - lp) * am;
    }
  }
  // cicada: 4.5 / 5.2 kHz partials chopped by a ~104 Hz pulse train, roughened with noise
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const p = 0.5 + 0.5 * Math.sin(TAU * 104 * t);
    const c = Math.sin(TAU * 4500 * t) + 0.7 * Math.sin(TAU * 5200 * t + 1) + 0.35 * Math.sin(TAU * 6100 * t + 2) + 0.25 * Math.sin(TAU * 3800 * t);
    cicada[i] = c * p * p * p * (0.7 + 0.6 * white[i]);
  }
  const out = { white, pink, brown, rustle, cicada };
  for (const k in out) {
    const d = out[k];
    let peak = 1e-6;
    for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
    const s = 0.95 / peak;
    for (let i = 0; i < n; i++) d[i] *= s;
  }
  return out;
}

/** Stereo impulse: noise with an RT60 of about 1.8 s that darkens as it decays, after a short pre-delay. */
function buildImpulse(ac, rand, seconds = 2.4, rt60 = 1.8) {
  const sr = ac.sampleRate, n = Math.floor(sr * seconds), pre = Math.floor(sr * 0.012);
  const buf = ac.createBuffer(2, n, sr);
  const tau = rt60 / 6.91;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const k = 0.25 + 0.6 * Math.min(1, t / 1.2);          // one-pole coefficient grows: the tail loses its highs
      lp = k * lp + (1 - k) * (rand() * 2 - 1);
      d[i] = lp * Math.exp(-t / tau) * Math.min(1, t / 0.004);
    }
  }
  return buf;
}

export function createEngine(ac, rand) {
  const sr = ac.sampleRate;
  const loops = buildLoops(sr, rand);
  const buffers = {};
  for (const k in loops) {
    const b = ac.createBuffer(1, loops[k].length, sr);
    b.getChannelData(0).set(loops[k]);
    buffers[k] = b;
  }

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 3.5; comp.attack.value = 0.012; comp.release.value = 0.3;
  const master = ac.createGain(); master.gain.value = 0;
  const lowpass = ac.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.Q.value = 0.5; lowpass.frequency.value = Math.min(20000, sr * 0.45);
  const amb = ac.createGain();
  const fx = ac.createGain();
  const revIn = ac.createGain();
  const conv = ac.createConvolver(); conv.buffer = buildImpulse(ac, rand);
  const revOut = ac.createGain(); revOut.gain.value = 0.4;
  amb.connect(lowpass); lowpass.connect(master); master.connect(comp); comp.connect(ac.destination);
  revIn.connect(conv); conv.connect(revOut); revOut.connect(lowpass);
  fx.connect(master);
  const fxSend = ac.createGain(); fxSend.gain.value = 0.1; fx.connect(fxSend); fxSend.connect(revIn);

  const persistent = [];
  const engine = {
    ac, sr, buffers, master, lowpass, amb, fx, revIn, revOut, comp,
    voices: 0,          // live one-shot voices
    voiceNodes: 0,      // nodes held by those voices
    nodes: 10,          // rough live node count (for the debug overlay / report)

    gain(v = 1) { const g = ac.createGain(); g.gain.value = v; return g; },
    filter(type, freq, q = 0.7) { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; },
    panner(pan = 0) {
      if (!ac.createStereoPanner) return ac.createGain();
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); return p;
    },
    osc(type, freq) { const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; return o; },

    /** A looping noise source that runs for the life of the engine (or until .stop()). */
    loop(kind, offset = 0, rate = 1) {
      const s = ac.createBufferSource();
      s.buffer = buffers[kind]; s.loop = true; s.playbackRate.value = rate;
      s.start(0, offset % s.buffer.duration);
      persistent.push(s); engine.nodes++;
      return s;
    },
    /** A noise burst from t0 for dur seconds, starting at a random place in the loop. */
    burst(kind, t0, dur, rate = 1) {
      const s = ac.createBufferSource();
      s.buffer = buffers[kind]; s.loop = true; s.playbackRate.value = rate;
      s.start(t0, rand() * 3.5); s.stop(t0 + dur);
      return s;
    },

    /**
     * Output strip for a one-shot ambient voice: pan -> amb (+ reverb send). The voice's own envelope gain carries its
     * level, so the strip is two nodes. `cost` is the voice's total node count; returns null when the voice or node
     * budget is spent (`must` voices, the horns, only respect the voice count). Call done(lastSource, ...nodes) so
     * everything is disconnected when that source ends.
     */
    voice(pan = 0, send = 0.3, cost = 6, must = false) {
      if (engine.voices >= MAX_VOICES || (!must && engine.voiceNodes + cost > VOICE_NODES)) return null;
      const p = engine.panner(pan);
      p.connect(amb);
      const all = [p];
      if (send > 0) { const s = engine.gain(send); p.connect(s); s.connect(revIn); all.push(s); }
      engine.voices++;
      let n = all.length;
      return {
        in: p,
        done(last, ...nodes) {
          n += nodes.length + 1; engine.nodes += n; engine.voiceNodes += n;
          last.onended = () => {
            engine.voices--; engine.nodes -= n; engine.voiceNodes -= n;
            for (const x of all) { try { x.disconnect(); } catch { /* already gone */ } }
            for (const x of nodes) { try { x.disconnect(); } catch { /* already gone */ } }
            try { last.disconnect(); } catch { /* already gone */ }
          };
        },
      };
    },
    /** Disconnect `nodes` when `last` ends (footsteps: no voice budget). */
    free(last, ...nodes) {
      const n = nodes.length + 1; engine.nodes += n;
      last.onended = () => {
        engine.nodes -= n;
        for (const x of nodes) { try { x.disconnect(); } catch { /* already gone */ } }
        try { last.disconnect(); } catch { /* already gone */ }
      };
    },
    dispose() {
      for (const s of persistent) { try { s.stop(); s.disconnect(); } catch { /* not started */ } }
      persistent.length = 0;
      for (const x of [amb, fx, fxSend, revIn, conv, revOut, lowpass, master, comp]) { try { x.disconnect(); } catch { /* gone */ } }
    },
  };
  return engine;
}
