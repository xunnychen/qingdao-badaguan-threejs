// Shared material library (ctx.mats). All MeshStandardMaterial, metalness 0 unless noted, UVs in metres.
// Materials are CACHED AND SHARED: never mutate one you got from here (clone() first), and never dispose them.
//
// Fixed names (mats.get(name)):
//   'granite'      rock-faced ashlar, natural colour            'graniteWarm'  same, pink-buff tint (花石楼)
//   'rubble'       garden-wall rubble                           'pebble'       pebble-dash panel
//   'coping'       smooth granite coping / sills / steps        'kerb'         granite kerb
//   'asphalt'      road                                         'paving'       sidewalk slabs
//   'sand'         beach sand                                   'concrete'     plain concrete
//   'iron'         black wrought iron                           'ironGreen'    dark green cast iron (lamps)
//   'glass'        dark reflective window glass                 'windowLit'    window glass that glows with env.windowGlow
//   'lampGlass'    lantern glass that glows with env.lampsOn    'boardwalk'    weathered deck planks
// Parametric (cached by arguments):
//   mats.stucco(hex)   拉毛 render, tinted          mats.roof(hex)     clay tile, baked colour (default '#b5482e')
//   mats.paint(hex)    smooth painted timber/trim   mats.wood(hex)     planks, tinted
//   mats.grass(hex)    lawn, tinted                 mats.bark(hex)     bark, tinted
//   mats.plain(hex, roughness = 0.8, metalness = 0)  untextured
// Any of the parametric calls accept a trailing options object { vertexColors: true, side: THREE.DoubleSide } -> separate cached variant.
// vertexColors variants REQUIRE a `color` attribute on the geometry (missing attribute renders black).
import * as THREE from 'three';

const SHEEN = new THREE.Color(), WARM = new THREE.Color(), WINDOW_WARM = new THREE.Color('#ffb866');

export function createMaterials(tex) {
  const cache = new Map();
  const std = (key, make) => { if (!cache.has(key)) { const m = make(); m.name = key; cache.set(key, m); } return cache.get(key); };
  const withTex = (kind, o = {}, topts) => {
    const t = tex.get(kind, topts);
    const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.9, metalness: 0, ...o });
    if (t.normalMap && o.normalScale === undefined) m.normalScale.set(1, 1);
    return m;
  };
  const optKey = (o) => (o ? `|vc${o.vertexColors ? 1 : 0}|s${o.side ?? 0}` : '');
  const optProps = (o) => (o ? { vertexColors: !!o.vertexColors, side: o.side ?? THREE.FrontSide } : {});

  const fixed = {
    granite: () => withTex('granite', { roughness: 0.92 }),
    graniteWarm: () => withTex('granite', { roughness: 0.92, color: new THREE.Color('#f3dccb') }),
    rubble: () => withTex('rubble', { roughness: 0.95 }),
    pebble: () => withTex('pebble', { roughness: 0.9 }),
    coping: () => withTex('concrete', { roughness: 0.85, color: new THREE.Color('#aaa59b') }),
    kerb: () => withTex('concrete', { roughness: 0.85, color: new THREE.Color('#a7a198') }),
    asphalt: () => withTex('asphalt', { roughness: 0.93 }),
    paving: () => withTex('paving', { roughness: 0.88 }),
    sand: () => withTex('sand', { roughness: 0.96 }),
    concrete: () => withTex('concrete', { roughness: 0.9, color: new THREE.Color('#b8b2a6') }),
    boardwalk: () => withTex('wood', { roughness: 0.85, color: new THREE.Color('#8c7a66') }),
    iron: () => new THREE.MeshStandardMaterial({ color: '#1f2321', roughness: 0.55, metalness: 0.35 }),
    ironGreen: () => new THREE.MeshStandardMaterial({ color: '#1e2b25', roughness: 0.5, metalness: 0.35 }),
    // glass: a non-metal reflects only ~4 % of the sky head-on, which reads as a black hole. core adds a faint
    // sky-tinted emissive every frame (update() below) so panes read as glass in every preset and on the low tier.
    glass: () => new THREE.MeshStandardMaterial({ color: '#232f37', roughness: 0.1, metalness: 0.0, envMapIntensity: 2.2, emissive: '#000000' }),
    windowLit: () => new THREE.MeshStandardMaterial({ color: '#232f37', roughness: 0.2, metalness: 0, emissive: '#000000', emissiveIntensity: 1, envMapIntensity: 1.6 }),
    lampGlass: () => new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.35, metalness: 0, emissive: '#ffd9a0', emissiveIntensity: 0 }),
  };

  const mats = {
    get(name) {
      if (!fixed[name]) throw new Error(`[mats] unknown material "${name}"`);
      return std(name, fixed[name]);
    },
    names: Object.keys(fixed),
    stucco: (hex = '#eadfc4', o) => std(`stucco:${hex}${optKey(o)}`, () => withTex('stucco', { color: new THREE.Color(hex), roughness: 0.93, ...optProps(o) })),
    roof: (hex = '#b5482e', o) => std(`roof:${hex}${optKey(o)}`, () => withTex('rooftile', { roughness: 0.82, ...optProps(o) }, { color: hex })),
    paint: (hex = '#f2eee2', o) => std(`paint:${hex}${optKey(o)}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0, ...optProps(o) })),
    wood: (hex = '#7a5230', o) => std(`wood:${hex}${optKey(o)}`, () => withTex('wood', { color: new THREE.Color(hex), roughness: 0.8, ...optProps(o) })),
    grass: (hex = '#7c8a3e', o) => std(`grass:${hex}${optKey(o)}`, () => withTex('grass', { color: new THREE.Color(hex), roughness: 0.95, ...optProps(o) })),
    bark: (hex = '#4a4038', o) => std(`bark:${hex}${optKey(o)}`, () => withTex('bark', { color: new THREE.Color(hex), roughness: 0.95, ...optProps(o) })),
    plain: (hex = '#888888', roughness = 0.8, metalness = 0, o) => std(`plain:${hex}:${roughness}:${metalness}${optKey(o)}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, ...optProps(o) })),
    /** Called by core every frame: drives the emissive "night" materials from the live environment. */
    update(cur, t) {
      const win = cache.get('windowLit'), lamp = cache.get('lampGlass'), glass = cache.get('glass');
      // sky sheen: 5.5 % of the sky light colour (linear) as if the pane mirrored the open sky
      SHEEN.copy(cur.hemiSky).lerp(cur.skyHorizon, 0.35).multiplyScalar(0.055 * Math.min(1.4, cur.hemiIntensity));
      if (glass) glass.emissive.copy(SHEEN);
      // lit windows: warm lamp light behind curtains, kept under the ACES shoulder so it stays amber, not white
      if (win) { const g = Math.min(1, cur.windowGlow); win.emissive.copy(SHEEN).multiplyScalar(1 - g).add(WARM.copy(WINDOW_WARM).multiplyScalar(g * 0.8)); }
      if (lamp) lamp.emissiveIntensity = cur.lampsOn * 4.0 * (0.96 + 0.04 * Math.sin(t * 13.7));
    },
  };
  return mats;
}
