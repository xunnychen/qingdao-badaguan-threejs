// Quality tiers. Fixed at load (ctx.quality is frozen); changing tier reloads the page with ?q=<tier>.
export const TIERS = {
  low: {
    tier: 'low', maxPixelRatio: 1, shadowMapSize: 1024, shadowDistance: 70, msaa: 0, bloom: false, godrays: false,
    treeDensity: 0.65, treeLodNear: 38, treeLodFar: 100, grass: false, particles: 0.4, anisotropy: 2, texSize: 512,
    oceanSegments: 96, terrainStep: 3, lampLights: 0, envMap: false,
  },
  medium: {
    tier: 'medium', maxPixelRatio: 1.5, shadowMapSize: 2048, shadowDistance: 120, msaa: 4, bloom: true, godrays: false,
    treeDensity: 1, treeLodNear: 52, treeLodFar: 140, grass: true, particles: 0.7, anisotropy: 4, texSize: 512,
    oceanSegments: 160, terrainStep: 2, lampLights: 4, envMap: true,
  },
  high: {
    tier: 'high', maxPixelRatio: 2, shadowMapSize: 2048, shadowDistance: 170, msaa: 4, bloom: true, godrays: true,
    treeDensity: 1, treeLodNear: 68, treeLodFar: 180, grass: true, particles: 1, anisotropy: 8, texSize: 1024,
    oceanSegments: 224, terrainStep: 2, lampLights: 6, envMap: true,
  },
};

export function pickQuality(params) {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const isMobile = coarse || (typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  let tier = params.q;
  if (!TIERS[tier]) {
    let saved = null;
    try { saved = localStorage.getItem('badaguan.q'); } catch { /* storage may be blocked */ }
    tier = TIERS[saved] ? saved : params.shot ? 'medium' : isMobile ? 'low' : guessDesktopTier();
  }
  const q = { ...TIERS[tier], isMobile, isTouch: coarse || (typeof window !== 'undefined' && 'ontouchstart' in window) };
  // A phone on the low tier is bound by geometry, not by fill: at pixel ratio 1 a 3x panel shows the scene upscaled 3x
  // under a crisp DOM HUD. Let it render up to ratio 2 within a 1.5 MP budget (390x844 -> 2, a 820x1180 tablet -> 1.25);
  // the post package's adaptive controller steps back down within a window or two if the GPU cannot hold it.
  // A desktop software rasteriser on `low` stays at 1.
  if (tier === 'low' && isMobile && typeof innerWidth !== 'undefined') {
    q.maxPixelRatio = Math.max(1, Math.min(2, Math.sqrt(1.5e6 / Math.max(1, innerWidth * innerHeight))));
  }
  if (params.shot) q.maxPixelRatio = 1; // software GL: keep screenshots cheap and deterministic
  return Object.freeze(q);
}

/**
 * First visit on a desktop: `medium` unless the driver names a discrete (or big Apple) GPU; a software rasteriser gets
 * `low`. Integrated laptop graphics cannot hold the `high` tier (pixel ratio 2, 170 m of shadows, god rays), and the
 * adaptive resolution in the post package can only lower the pixel count, not the geometry load. A probe context is
 * created and released at once; the choice is NOT stored, so a saved tier or ?q= always wins.
 */
function guessDesktopTier() {
  let name = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* no WebGL info: stay on medium */ }
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(name)) return 'low';
  if (/NVIDIA|GeForce|Quadro|RTX|GTX|Radeon\s*(RX|Pro|R9|VII)|\bArc\(TM\)\s*[AB]\d|Apple M\d+ (Pro|Max|Ultra)/i.test(name)) return 'high';
  return 'medium';
}
