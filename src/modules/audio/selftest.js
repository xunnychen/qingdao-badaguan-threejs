// Developer check, loaded only by `?shot=0&audiotest=1`: renders the soundscape through an OfflineAudioContext (the same
// engine and layers as the live one), prints peak / RMS per case and draws each loudness envelope, so levels and wave /
// call shapes can be reviewed in a headless screenshot where nothing can be heard.
import { createEngine } from './engine.js';
import { createLayers } from './layers.js';

const SR = 32000;
const CONIFER = { cedar: 1, pine: 1, juniper: 0.6 };
const SILENT = { surf: 0, wind: 0, rustle: 0, birds: 0, gulls: 0, cicadas: 0, foghorn: 0, horn: 0, drips: 0 };

async function render(ctx, c) {
  const seconds = c.seconds || 24;
  const oc = new OfflineAudioContext(2, SR * seconds, SR);
  const E = createEngine(oc, ctx.rng.makeRng('audio:engine'));
  const L = createLayers(E, ctx.rng.makeRng('audio:layers'));
  E.master.gain.value = 1.5;                                    // volume 1
  const preset = ctx.env.presets[c.preset];
  const view = ctx.map.views[c.view];
  const a = c.solo ? { ...preset.audio, ...SILENT, ...c.solo } : { ...preset.audio };
  let conifer = 0, decid = 0;
  for (const t of ctx.world.treesNear(view.x, view.z, 20, [])) {
    const w = 1 - Math.hypot(t.x - view.x, t.z - view.z) / 20;
    if (CONIFER[t.species]) conifer += w * CONIFER[t.species]; else decid += w;
  }
  const s = {
    a, preset: c.preset, yaw: ((view.yaw || 0) * Math.PI) / 180, music: !!c.music, gust: 0,
    prox: Math.exp(-Math.max(0, ctx.world.shoreDist(view.x, view.z)) / 75),
    conifer: Math.min(1, conifer / 3), decid: Math.min(1, decid / 3.5),
  };
  E.lowpass.frequency.value = Math.min(a.lowpass, SR * 0.45);
  E.revOut.gain.value = Math.min(1.4, a.reverb * 2.2);
  let foot = 0, nextStep = 0.5;
  for (let t = 0; t < seconds - 0.2; t += 0.1) {
    s.gust = ctx.wind.gustAt(t);
    E.voices = 0; E.voiceNodes = 0;                             // nothing ends before rendering starts
    L.tick(t, s);
    if (c.step && t >= nextStep) { foot ^= 1; L.footstep({ surface: c.step, running: false, foot }, t, c.crunch || 0); nextStep += 0.54; }
  }
  const buf = await oc.startRendering();
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  const win = Math.floor(SR * 0.05), env = [];
  let peak = 0, sum = 0;
  for (let i = 0; i + win <= l.length; i += win) {
    let e = 0;
    for (let j = i; j < i + win; j++) {
      const v = (l[j] + r[j]) * 0.5, m = Math.max(Math.abs(l[j]), Math.abs(r[j]));
      e += v * v; if (m > peak) peak = m;
    }
    sum += e; env.push(Math.sqrt(e / win));
  }
  const db = (v) => 20 * Math.log10(Math.max(v, 1e-6));
  return { env, peak: db(peak), rms: db(Math.sqrt(sum / (env.length * win))), seconds, s };
}

export async function run(ctx) {
  const cases = [
    { name: 'autumn spawn (full mix)', preset: 'autumn', view: 'spawn' },
    { name: 'autumn beach (full mix)', preset: 'autumn', view: 'beach' },
    { name: 'fog promenade (full mix)', preset: 'fog', view: 'promenade', seconds: 40 },
    { name: 'dusk crape (full mix)', preset: 'dusk', view: 'crape' },
    { name: 'spring crabapple (full mix)', preset: 'spring', view: 'crabapple' },
    { name: 'autumn cedar (full mix)', preset: 'autumn', view: 'cedar' },
    { name: 'surf solo, on the sand', preset: 'autumn', view: 'beach', solo: { surf: 0.5 } },
    { name: 'surf solo, at spawn', preset: 'autumn', view: 'spawn', solo: { surf: 0.5 } },
    { name: 'wind solo, cedars', preset: 'autumn', view: 'cedar', solo: { wind: 0.4 }, seconds: 40 },
    { name: 'wind solo, ginkgo', preset: 'autumn', view: 'ginkgo', solo: { wind: 0.4 }, seconds: 40 },
    { name: 'rustle solo, ginkgo', preset: 'autumn', view: 'ginkgo', solo: { rustle: 0.4 }, seconds: 40 },
    { name: 'birds solo, spring', preset: 'spring', view: 'crabapple', solo: { birds: 0.6 } },
    { name: 'birds solo, autumn', preset: 'autumn', view: 'spawn', solo: { birds: 0.3 } },
    { name: 'gulls solo, beach', preset: 'autumn', view: 'beach', solo: { gulls: 0.6 }, seconds: 40 },
    { name: 'ship horn solo', preset: 'autumn', view: 'promenade', solo: { horn: 0.12 }, seconds: 60 },
    { name: 'foghorn solo', preset: 'fog', view: 'promenade', solo: { foghorn: 0.5 }, seconds: 40 },
    { name: 'drips solo', preset: 'fog', view: 'cedar', solo: { drips: 0.4 } },
    { name: 'cicadas solo', preset: 'dusk', view: 'crape', solo: { cicadas: 0.45 } },
    { name: 'music box solo', preset: 'autumn', view: 'spawn', solo: {}, music: true },
    { name: 'steps: road', preset: 'autumn', view: 'spawn', solo: {}, step: 'road', seconds: 6 },
    { name: 'steps: road + leaf crunch', preset: 'autumn', view: 'spawn', solo: {}, step: 'road', crunch: 1, seconds: 6 },
    { name: 'steps: boardwalk', preset: 'autumn', view: 'boardwalk', solo: {}, step: 'boardwalk', seconds: 6 },
    { name: 'steps: sand', preset: 'autumn', view: 'beach', solo: {}, step: 'sand', seconds: 6 },
    { name: 'steps: lawn', preset: 'autumn', view: 'park', solo: {}, step: 'lawn', seconds: 6 },
    { name: 'steps: water', preset: 'autumn', view: 'beach', solo: {}, step: 'water', seconds: 6 },
  ];
  const W = 1280, ROW = 28, H = cases.length * ROW + 8;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:500;background:#101a1d';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.font = '12px ui-monospace, monospace'; g.textBaseline = 'middle';
  const X0 = 250, X1 = 1060;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i], y = 4 + i * ROW;
    let res;
    try { res = await render(ctx, c); } catch (e) { console.error('[audiotest]', c.name, e); g.fillStyle = '#f66'; g.fillText(`${c.name}: ${e.message}`, 8, y + ROW / 2); continue; }
    g.fillStyle = '#16262b'; g.fillRect(X0, y + 1, X1 - X0, ROW - 2);
    // 0 .. -48 dB, grid lines at -16 and -32
    g.fillStyle = 'rgba(243,239,228,.14)';
    for (const d of [-16, -32]) g.fillRect(X0, y + 1 + (-d / 48) * (ROW - 2), X1 - X0, 1);
    g.fillStyle = '#e2b32e';
    const n = res.env.length, bw = (X1 - X0) / n;
    for (let k = 0; k < n; k++) {
      const d = Math.max(-48, 20 * Math.log10(Math.max(res.env[k], 1e-6)));
      const h = ((d + 48) / 48) * (ROW - 2);
      g.fillRect(X0 + k * bw, y + ROW - 1 - h, Math.max(1, bw), h);
    }
    g.fillStyle = '#f3efe4';
    g.fillText(c.name, 8, y + ROW / 2);
    g.fillText(`${res.seconds}s  rms ${res.rms.toFixed(1)}  peak ${res.peak.toFixed(1)}  prox ${res.s.prox.toFixed(2)}`, X1 + 8, y + ROW / 2);
    console.log(`[audiotest] ${c.name.padEnd(28)} rms ${res.rms.toFixed(1)} dB  peak ${res.peak.toFixed(1)} dB  prox ${res.s.prox.toFixed(2)} conifer ${res.s.conifer.toFixed(2)} decid ${res.s.decid.toFixed(2)}`);
  }
  window.__audiotest = true;
  console.log('[audiotest] done');
}
