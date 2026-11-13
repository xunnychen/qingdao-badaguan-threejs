// The sun, behind a factory so the shadow technique can be swapped in one place.
//
//   kind 'sun'  (preferred)  three/addons/lights/SunLight.js: 2 cascades fitted to the view frustum by the renderer
//                            (r187 core has the shader support). No .target: the light shines from its position toward
//                            the origin, so position = sunDir. mapSize is PER CASCADE (the atlas is 2 x 1).
//   kind 'dir'  (fallback)   one texel-snapped DirectionalLight shadow box that follows the camera.
//
// Both expose the same handle: { light, kind, update(sunDir, camera, radius, strength), dispose() }.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';

const _fwd = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _o = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function makeSun(ctx, kind = 'sun') {
  const { quality } = ctx;
  const size = quality.shadowMapSize;
  const dist = quality.shadowDistance;
  return kind === 'dir' ? makeDirectional(size, dist) : makeCascaded(size, dist);
}

function makeCascaded(size, dist) {
  const light = new SunLight(0xffffff, 3);
  light.name = 'sun';
  light.castShadow = true;
  const sh = light.shadow;
  sh.mapSize.set(size, size);
  sh.camera.near = 0.5;
  sh.camera.far = dist;          // shadow range from the eye; the cascades split it (about 27 % / 100 %)
  // Texel sizes at 2048: about 3 cm in the near cascade and 10 cm in the far one. The depth bias is in units of the
  // cascade's depth range (hundreds of metres), the normal bias in world metres.
  const scale = 2048 / size;
  const baseBias = -0.00012 * scale;
  const baseNormal = 0.035 * scale;
  sh.bias = baseBias;
  sh.normalBias = baseNormal;
  return {
    light, kind: 'sun',
    update(sunDir, camera, radius, strength, altitude = 0) {
      light.position.copy(sunDir);
      sh.radius = radius;
      sh.intensity = strength;
      // from the air the shadow range grows with the height above the ground (coarser texels, seen from further away)
      const far = Math.min(900, dist + Math.max(0, altitude - 4) * 4.2);
      sh.camera.far = far;
      const k = far / dist;
      // softer filter kernels and grazing light both need more offset; a low sun needs most
      const graze = 1 - Math.min(1, Math.max(0, sunDir.y) / 0.45);
      sh.normalBias = baseNormal * k * (0.75 + 0.22 * radius + 0.9 * graze);
      sh.bias = baseBias * (1 + 0.6 * graze) * Math.sqrt(k);
      light.castShadow = strength > 0.01;
    },
    dispose() { light.dispose(); },
  };
}

function makeDirectional(size, dist) {
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.name = 'sun';
  light.castShadow = true;
  const sh = light.shadow;
  sh.mapSize.set(size, size);
  const R = dist * 0.62;
  const cam = sh.camera;
  cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = 700;
  cam.updateProjectionMatrix();
  const texel = (2 * R) / size;
  sh.bias = -0.00035;
  const baseNormal = texel * 0.9;
  sh.normalBias = baseNormal;
  return {
    light, kind: 'dir',
    update(sunDir, camera, radius, strength) { // (altitude is ignored: the box is fixed)
      // centre the box a little ahead of the viewer, then snap it to whole texels in light space (no shimmer)
      camera.getWorldDirection(_fwd); _fwd.y = 0;
      if (_fwd.lengthSq() > 1e-6) _fwd.normalize();
      _c.copy(camera.position).addScaledVector(_fwd, R * 0.55);
      _m.lookAt(sunDir, _o.set(0, 0, 0), _up);
      _q.setFromRotationMatrix(_m); _qi.copy(_q).invert();
      _c.applyQuaternion(_qi);
      _c.x = Math.round(_c.x / texel) * texel;
      _c.y = Math.round(_c.y / texel) * texel;
      _c.applyQuaternion(_q);
      light.target.position.copy(_c);
      light.target.updateMatrixWorld();
      light.position.copy(_c).addScaledVector(sunDir, 350);
      sh.radius = radius;
      sh.intensity = strength;
      const graze = 1 - Math.min(1, Math.max(0, sunDir.y) / 0.45);
      sh.normalBias = baseNormal * (0.8 + 0.2 * radius + 0.8 * graze);
      light.castShadow = strength > 0.01;
    },
    dispose() { light.dispose(); },
  };
}
