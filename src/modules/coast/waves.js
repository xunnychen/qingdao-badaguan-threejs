// Swell description shared by the ocean shader (GLSL is generated from the same table) and by everything that floats
// on it in JS (buoys, the trawler). Pure JS, no three.js.
//
// A sheltered bay: four long, low swell trains running in from the open sea (south) toward the shore (north = -z).
// `share` is the fraction of env.current.waveHeight (crest-to-trough of the dominant swell) each train carries.

const TIME_SCALE = 0.62; // deep-water phase speeds look hurried from the shore; slow the whole field down

// [dirX, dirZ, wavelength (m), share, phase]
const SRC = [
  [-0.26, -0.97, 46, 0.42, 0.0],
  [0.34, -0.94, 27, 0.26, 1.7],
  [-0.62, -0.78, 17, 0.17, 4.1],
  [0.05, -1.0, 71, 0.3, 2.6],
];

export const WAVES = SRC.map(([dx, dz, len, share, phase]) => {
  const l = Math.hypot(dx, dz), k = (2 * Math.PI) / len;
  return { dx: dx / l, dz: dz / l, k, w: Math.sqrt(9.81 * k) * TIME_SCALE, a: share * 0.5, phase };
});

/** Vertical displacement of the open-water surface at (x,z), time t, for wave height H (before shallow damping). */
export function waveY(x, z, t, H) {
  let y = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    y += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.phase);
  }
  return y * H;
}

/** Surface slope (dy/dx, dy/dz) at (x,z); out = [sx, sz]. */
export function waveSlope(x, z, t, H, out = [0, 0]) {
  let sx = 0, sz = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const c = w.a * w.k * Math.cos(w.k * (w.dx * x + w.dz * z) - w.w * t + w.phase);
    sx += w.dx * c; sz += w.dz * c;
  }
  out[0] = sx * H; out[1] = sz * H;
  return out;
}

/** Shallow-water damping used by the shader: 0 at the shore, 1 in water deeper than 3 m. */
export function shallowDamp(depth) {
  const t = Math.min(1, Math.max(0, (depth - 0.15) / 2.85));
  return t * t * (3 - 2 * t);
}

const f = (v) => { const s = v.toFixed(5); return s.includes('.') ? s : s + '.0'; };

/** GLSL: vec3 coastWave(vec2 p, float t, float H) (Gerstner displacement) and vec2 coastWaveSlope(...). */
export const WAVE_GLSL = /* glsl */ `
vec3 coastWave(vec2 p, float t, float H) {
  vec3 d = vec3(0.0); float th;
${WAVES.map((w) => `  th = ${f(w.k)} * dot(p, vec2(${f(w.dx)}, ${f(w.dz)})) - ${f(w.w)} * t + ${f(w.phase)};
  d.y += ${f(w.a)} * sin(th); d.xz += vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.a * 0.75)} * cos(th));`).join('\n')}
  return d * H;
}
vec2 coastWaveSlope(vec2 p, float t, float H) {
  vec2 s = vec2(0.0); float th;
${WAVES.map((w) => `  th = ${f(w.k)} * dot(p, vec2(${f(w.dx)}, ${f(w.dz)})) - ${f(w.w)} * t + ${f(w.phase)};
  s += vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.a * w.k)} * cos(th));`).join('\n')}
  return s * H;
}
`;
