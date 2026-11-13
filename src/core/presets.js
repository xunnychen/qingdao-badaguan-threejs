// Ambience presets: THE art direction, as data. Core-owned; modules only read.
// Every '#rrggbb' string becomes a THREE.Color in ctx.env.current (linear working space), numbers are blended,
// arrays are blended element-wise (all palettes have exactly 4 entries), anything else switches at the half-way point.
//
// Angles: sunAzimuth / windAzimuth are compass degrees (0 north, 90 east, 180 south = out to sea).
// windAzimuth is the direction the wind blows TOWARD.
// fogDensity is the extinction coefficient at sea level in 1/m; fogFalloff is its exponential decay with height (1/m).
export const PRESET_ORDER = ['autumn', 'fog', 'dusk', 'spring'];
export const DEFAULT_PRESET = 'autumn';

// prettier-ignore
export const PRESETS = {
  // A — 秋日午後: early November 14:30. Ginkgo + maple peak, clearest air of the year, low sun over the sea.
  autumn: {
    id: 'autumn', label: '秋日午後', sub: '十一月 · 午後二時半', season: 'autumn',
    sunElevation: 26, sunAzimuth: 220, sunColor: '#ffe2b0', sunIntensity: 3.0,
    hemiSky: '#c8d6e6', hemiGround: '#a88a5c', hemiIntensity: 1.3,
    skyZenith: '#3d7cc4', skyHorizon: '#cfe0ea', skySunGlow: '#f3e3c2', skyAntiSolar: '#c3d6e6', sunDisc: 1.0, horizonHaze: 0.35,
    cloudCoverage: 0.28, cloudDensity: 0.6, cloudLit: '#ffffff', cloudShade: '#a9b9cc', cloudSpeed: 0.006,
    fogColor: '#d9e2e6', fogDensity: 0.0012, fogFalloff: 0.012,
    shadowStrength: 0.85, shadowRadius: 1.5,
    seaShallow: '#5fa79a', seaDeep: '#2c6d77', seaSpec: '#fff1cf', seaGlitter: 1.0, waveHeight: 0.35, foam: 0.8,
    exposure: 1.0, bloomStrength: 0.35, bloomThreshold: 0.92, bloomRadius: 0.6,
    saturation: 1.06, contrast: 1.02, gradeTint: '#fff4e6', vignette: 0.25, godrays: 0.55,
    lawn: '#7c8a3e', hedge: '#44602f', ivy: '#a23b2a',
    lampsOn: 0, windowGlow: 0,
    windStrength: 0.55, windAzimuth: 160,
    foliage: {
      ginkgo:    ['#f2c21b', '#e8a80c', '#f7d84a', '#eeb81a'],
      maple:     ['#e9742b', '#d9a21e', '#c8402a', '#a8a83a'],
      plane:     ['#b88a3a', '#8f6a2c', '#a9a04a', '#7f8a3a'],
      cedar:     ['#476446', '#557550', '#4d6a50', '#405840'],
      juniper:   ['#38573a', '#314c33', '#3f5f40', '#2b442e'],
      pine:      ['#3f5a3a', '#4a663e', '#364e34', '#557042'],
      peach:     ['#a89a44', '#b8943a', '#8f8a3c', '#c0843a'],
      crabapple: ['#b5622e', '#a8843a', '#c47a2c', '#8f7a38'],
      crape:     ['#c9662e', '#b5522e', '#d98a2e', '#a8642c'],
    },
    leafFill: { ginkgo: 0.92, maple: 0.9, plane: 0.8, peach: 0.75, crabapple: 0.85, crape: 0.6 },
    particles: 'leaves', particleAmount: 1.0, litter: { ginkgo: 1, maple: 1, plane: 0.8, petals: 0 },
    motes: 0.5, fogWisps: 0, gulls: 3, butterflies: 0,
    audio: { surf: 0.5, wind: 0.4, rustle: 0.4, birds: 0.3, gulls: 0.15, cicadas: 0, foghorn: 0, horn: 0.12, drips: 0, lowpass: 20000, reverb: 0.18 },
  },

  // B — 清晨海霧: June 06:30. Advection fog off the Yellow Sea, shadowless pearl grey, lamps still lit.
  fog: {
    id: 'fog', label: '清晨海霧', sub: '六月 · 清晨六時半', season: 'summer',
    sunElevation: 18, sunAzimuth: 80, sunColor: '#e9eef0', sunIntensity: 0.6,
    hemiSky: '#cfd6d8', hemiGround: '#7b8078', hemiIntensity: 1.7,
    skyZenith: '#b9c4c8', skyHorizon: '#d5dadb', skySunGlow: '#e6ebec', skyAntiSolar: '#c9d0d2', sunDisc: 0.35, horizonHaze: 1.0,
    cloudCoverage: 0.9, cloudDensity: 0.3, cloudLit: '#dfe4e5', cloudShade: '#b4bdc0', cloudSpeed: 0.003,
    fogColor: '#cdd4d5', fogDensity: 0.018, fogFalloff: 0.085,
    shadowStrength: 0.15, shadowRadius: 4.0,
    seaShallow: '#9aaba6', seaDeep: '#7d908f', seaSpec: '#c9d2d2', seaGlitter: 0.0, waveHeight: 0.2, foam: 0.5,
    exposure: 0.9, bloomStrength: 0.15, bloomThreshold: 0.95, bloomRadius: 0.8,
    saturation: 0.72, contrast: 0.96, gradeTint: '#f1f5f5', vignette: 0.18, godrays: 0,
    lawn: '#66786a', hedge: '#3c5044', ivy: '#3f6b3a',
    lampsOn: 1, windowGlow: 0.8,
    windStrength: 0.2, windAzimuth: 10,
    foliage: {
      ginkgo:    ['#5f8a52', '#6b9558', '#547d4a', '#739c5c'],
      maple:     ['#4f7d4c', '#5a8852', '#467244', '#628f58'],
      plane:     ['#557f50', '#4c7448', '#5f8a58', '#6a9160'],
      cedar:     ['#3c4f48', '#445a50', '#36483f', '#4a6156'],
      juniper:   ['#34483f', '#2d4038', '#3a5046', '#283a32'],
      pine:      ['#3a4f44', '#43594c', '#32463c', '#4b6152'],
      peach:     ['#5a8450', '#648e58', '#507848', '#6e965e'],
      crabapple: ['#557f4e', '#5f8956', '#4b7446', '#69925c'],
      crape:     ['#5d8752', '#67915a', '#537b4a', '#719a60'],
    },
    leafFill: { ginkgo: 1, maple: 1, plane: 1, peach: 1, crabapple: 1, crape: 1 },
    particles: 'drips', particleAmount: 0.4, litter: { ginkgo: 0, maple: 0, plane: 0, petals: 0 },
    motes: 0, fogWisps: 1, gulls: 2, butterflies: 0,
    audio: { surf: 0.35, wind: 0.15, rustle: 0.08, birds: 0.05, gulls: 0.1, cicadas: 0, foghorn: 0.5, horn: 0.1, drips: 0.4, lowpass: 3500, reverb: 0.45 },
  },

  // C — 夏末黃昏: late August 18:10. Sun 6° above the western roofs, long violet shadows, lamps come on, cicadas.
  dusk: {
    id: 'dusk', label: '夏末黃昏', sub: '八月 · 傍晚六時', season: 'summer',
    sunElevation: 6, sunAzimuth: 278, sunColor: '#ffa868', sunIntensity: 2.8,
    hemiSky: '#869cb4', hemiGround: '#7a5a48', hemiIntensity: 1.2,   // warm bounce: streets under dense canopy must not crush to black
    skyZenith: '#44608f', skyHorizon: '#f4a964', skySunGlow: '#e98a6a', skyAntiSolar: '#8a88a8', sunDisc: 1.0, horizonHaze: 0.6,
    cloudCoverage: 0.4, cloudDensity: 0.5, cloudLit: '#ffc79a', cloudShade: '#6a6788', cloudSpeed: 0.004,
    fogColor: '#e6b48c', fogDensity: 0.0028, fogFalloff: 0.03,
    shadowStrength: 0.85, shadowRadius: 3.0,
    seaShallow: '#6f8f93', seaDeep: '#2f5560', seaSpec: '#ffb070', seaGlitter: 0.9, waveHeight: 0.3, foam: 0.7,
    exposure: 1.1, bloomStrength: 0.6, bloomThreshold: 0.85, bloomRadius: 0.75,
    saturation: 1.02, contrast: 1.06, gradeTint: '#fff0e0', vignette: 0.34, godrays: 0.8,
    lawn: '#4d7a33', hedge: '#2f5229', ivy: '#3f6b3a',
    lampsOn: 1, windowGlow: 1,
    windStrength: 0.35, windAzimuth: 330,
    foliage: {
      ginkgo:    ['#4f7a35', '#5a853a', '#456f2f', '#648f40'],
      maple:     ['#4a7032', '#557b38', '#40652c', '#5f863e'],
      plane:     ['#3f6b2d', '#5a8a35', '#4a762f', '#8f9a3e'],
      cedar:     ['#325a42', '#3e684c', '#2b4e39', '#477354'],
      juniper:   ['#2b513b', '#244632', '#345c43', '#1f3e2d'],
      pine:      ['#355c42', '#406a4a', '#2d5139', '#4c7854'],
      peach:     ['#4c7434', '#567e3a', '#426a2e', '#608840'],
      crabapple: ['#487032', '#527a38', '#3e662c', '#5c843e'],
      crape:     ['#c44f9a', '#d98ac0', '#b8408c', '#5a8438'],
    },
    leafFill: { ginkgo: 1, maple: 1, plane: 1, peach: 1, crabapple: 1, crape: 1 },
    particles: 'leaves', particleAmount: 0.12, litter: { ginkgo: 0, maple: 0, plane: 0.15, petals: 0 },
    motes: 0.9, fogWisps: 0, gulls: 4, butterflies: 0,
    audio: { surf: 0.5, wind: 0.25, rustle: 0.2, birds: 0.25, gulls: 0.15, cicadas: 0.45, foghorn: 0, horn: 0.15, drips: 0, lowpass: 20000, reverb: 0.22 },
  },

  // D — 春日花季: mid April 10:00. Peach on 韶关路 and crabapple on 宁武关路 in full bloom, milky spring light.
  spring: {
    id: 'spring', label: '春日花季', sub: '四月 · 上午十時', season: 'spring',
    sunElevation: 50, sunAzimuth: 125, sunColor: '#fff4e0', sunIntensity: 2.8,
    hemiSky: '#d4e6f5', hemiGround: '#8a8a72', hemiIntensity: 1.15,
    skyZenith: '#6fa6d8', skyHorizon: '#dfe9ee', skySunGlow: '#f6f1e2', skyAntiSolar: '#d3e2ec', sunDisc: 0.9, horizonHaze: 0.55,
    cloudCoverage: 0.38, cloudDensity: 0.5, cloudLit: '#ffffff', cloudShade: '#b6c4d2', cloudSpeed: 0.005,
    fogColor: '#e3ebee', fogDensity: 0.0022, fogFalloff: 0.02,
    shadowStrength: 0.9, shadowRadius: 2.5,
    seaShallow: '#6bb5a6', seaDeep: '#3a8088', seaSpec: '#fffbe8', seaGlitter: 0.45, waveHeight: 0.3, foam: 0.8,
    exposure: 1.05, bloomStrength: 0.3, bloomThreshold: 0.92, bloomRadius: 0.6,
    saturation: 0.98, contrast: 1.0, gradeTint: '#fbfbf3', vignette: 0.2, godrays: 0.2,
    lawn: '#64884a', hedge: '#466a38', ivy: '#4f8a3a',
    lampsOn: 0, windowGlow: 0,
    windStrength: 0.45, windAzimuth: 40,
    foliage: {
      ginkgo:    ['#9dbb62', '#a8c46a', '#8fb058', '#b4cc78'],
      maple:     ['#9cc45a', '#a8cf62', '#b9a862', '#8fb850'],
      plane:     ['#8fae5a', '#9ab862', '#84a252', '#b6c47a'],
      cedar:     ['#3f5c42', '#496a4a', '#38523c', '#527452'],
      juniper:   ['#38573a', '#314c33', '#3f5f40', '#2b442e'],
      pine:      ['#3f5c3c', '#496842', '#364f36', '#56764a'],
      peach:     ['#f29bb4', '#ffd9e2', '#ea7f9c', '#ffeef2'],
      crabapple: ['#f7c6d0', '#fbdde4', '#e0607e', '#fbe3ea'],
      crape:     ['#7fa050', '#8aa858', '#76964a', '#9ab062'],
    },
    leafFill: { ginkgo: 0.6, maple: 0.8, plane: 0.55, peach: 1, crabapple: 1, crape: 0.6 },
    particles: 'petals', particleAmount: 0.7, litter: { ginkgo: 0, maple: 0, plane: 0, petals: 0.6 },
    motes: 0.3, fogWisps: 0, gulls: 3, butterflies: 3,
    audio: { surf: 0.4, wind: 0.25, rustle: 0.25, birds: 0.6, gulls: 0.12, cicadas: 0, foghorn: 0, horn: 0.08, drips: 0, lowpass: 20000, reverb: 0.16 },
  },
};
