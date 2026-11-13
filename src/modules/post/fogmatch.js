// Fog matching between the direct path and the HDR path.
//
// three's built-in shader order is  lighting -> tone mapping -> sRGB -> fog.  Drawn straight to the canvas (post stub,
// `skip=post`, the bypass fallback) the fog is therefore mixed in DISPLAY space with the preset colour untouched: that
// is the look every preset number (fogColor, fogDensity) and every other package was tuned against. Rendering into the
// HDR target, the same chunk mixes in LINEAR light and the whole result is tone mapped afterwards, which changes two
// things: (1) the fog colour itself goes through exposure + the ACES curve and comes out darker and greyer (the pearl
// sea fog #cdd4d5 lands near #b4b9ba), and (2) a linear mix lifts dark things far more than a display-space mix of the
// same fraction (roughly f_display = f_linear ^ (1/2.2)), so back-lit trees and far headlands drown in haze.
//
// While the composer renders, and only then, the scene fog is swapped for an equivalent:
//   colour  -> the inverse tone map of the preset colour, so pure fog lands exactly on the preset colour again;
//   density -> its sign is flipped. core/fog.js (and the sky dome) read a negative fogNear as "linear HDR target" and
//              apply f_linear = f_display ^ 2.2, which matches the display-space mix on dark and mid-tone surfaces.
// The values are restored right after the frame, so modules that read scene.fog (or core's fogAmount) see no change.
import * as THREE from 'three';

const IN = new THREE.Matrix3().set(
  0.59719, 0.35458, 0.04823,
  0.07600, 0.90834, 0.01566,
  0.02840, 0.13383, 0.83777);
const OUT = new THREE.Matrix3().set(
  1.60475, -0.53108, -0.07367,
  -0.10208, 1.10813, -0.00605,
  -0.00327, -0.07276, 1.07602);
const IN_INV = IN.clone().invert();
const OUT_INV = OUT.clone().invert();
const _v = new THREE.Vector3();

// inverse of RRTAndODTFit: v = (u (u + a1) - a0) / (u (b2 u + b1) + b0)
function unfit(v) {
  v = Math.min(Math.max(v, 0), 0.97);
  const A = 1 - 0.983729 * v, B = 0.0245786 - 0.432951 * v, C = -(0.000090537 + 0.238081 * v);
  return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
}

/**
 * Replace `color` (linear working space, a value meant to be SEEN as is) by the scene-linear colour that three's
 * ACESFilmicToneMapping maps back onto it at the given exposure. No-op for other tone mappings.
 */
export function inverseToneMap(color, toneMapping, exposure) {
  if (toneMapping !== THREE.ACESFilmicToneMapping) return color;
  _v.set(color.r, color.g, color.b).applyMatrix3(OUT_INV);
  _v.set(unfit(_v.x), unfit(_v.y), unfit(_v.z)).applyMatrix3(IN_INV);
  const k = 0.6 / Math.max(exposure, 1e-3);
  color.setRGB(Math.max(0, _v.x * k), Math.max(0, _v.y * k), Math.max(0, _v.z * k));
  return color;
}
