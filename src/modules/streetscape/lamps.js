// Street lamps: dark green cast iron, 4.5 m. 'lantern' = four-sided glazed lantern with a roof and finial,
// 'twin' = two swan-neck arms with frosted globes. All lamps are merged into one iron mesh and one glass mesh.
import * as THREE from 'three';
import { strut, place, template } from './parts.js';

function post(topY) {
  const P = [[0.2, 0], [0.2, 0.07], [0.15, 0.13], [0.112, 0.43], [0.132, 0.48], [0.082, 0.6], [0.07, 1.02], [0.09, 1.08],
    [0.06, 1.16], [0.046, topY - 0.14], [0.072, topY - 0.07], [0.042, topY]];
  const g = new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 7);
  return g;
}
const rot45 = (g) => g.rotateY(Math.PI / 4);

function lanternTemplates() {
  const iron = [post(3.62)];
  iron.push(new THREE.BoxGeometry(0.56, 0.026, 0.026).translate(0, 3.3, 0));                               // ladder bar
  iron.push(new THREE.SphereGeometry(0.03, 4, 3).translate(0.28, 3.3, 0), new THREE.SphereGeometry(0.03, 4, 3).translate(-0.28, 3.3, 0));
  iron.push(rot45(new THREE.CylinderGeometry(0.155, 0.05, 0.13, 4, 1, true)).translate(0, 3.685, 0));       // cradle
  const b = 0.15, t = 0.245, y0 = 3.75, y1 = 4.2;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
    iron.push(strut({ x: c * b, y: y0, z: s * b }, { x: c * t, y: y1, z: s * t }, 0.024));
  }
  iron.push(new THREE.BoxGeometry(0.24, 0.025, 0.24).translate(0, y0 - 0.005, 0));
  iron.push(new THREE.BoxGeometry(0.375, 0.03, 0.375).translate(0, y1 + 0.005, 0));
  iron.push(rot45(new THREE.ConeGeometry(0.325, 0.2, 4, 1, true)).translate(0, y1 + 0.12, 0));              // roof
  iron.push(rot45(new THREE.CylinderGeometry(0.325, 0.325, 0.012, 4)).translate(0, y1 + 0.02, 0));
  iron.push(new THREE.CylinderGeometry(0.05, 0.065, 0.07, 6).translate(0, y1 + 0.235, 0));
  iron.push(new THREE.SphereGeometry(0.042, 5, 3).translate(0, y1 + 0.3, 0));
  iron.push(new THREE.ConeGeometry(0.018, 0.14, 4).translate(0, y1 + 0.4, 0));
  const glass = [rot45(new THREE.CylinderGeometry(t - 0.012, b - 0.012, y1 - y0, 4, 1, false)).translate(0, (y0 + y1) / 2, 0)];
  return { iron: template(iron), glass: template(glass), heads: [[0, 3.98, 0]], glow: 1.5 };
}

function twinTemplates() {
  const iron = [post(3.86)];
  iron.push(new THREE.SphereGeometry(0.06, 5, 4).translate(0, 3.92, 0), new THREE.ConeGeometry(0.022, 0.16, 4).translate(0, 4.05, 0));
  const glass = [], heads = [];
  for (const sg of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.03 * sg, 3.12, 0), new THREE.Vector3(0.26 * sg, 3.1, 0), new THREE.Vector3(0.5 * sg, 3.25, 0), new THREE.Vector3(0.52 * sg, 3.56, 0)]);
    iron.push(new THREE.TubeGeometry(curve, 6, 0.022, 4, false));
    // small scroll under the arm
    iron.push(new THREE.TorusGeometry(0.075, 0.012, 3, 7, Math.PI * 1.5).rotateZ(sg > 0 ? Math.PI * 0.6 : -Math.PI * 0.1).translate(0.2 * sg, 3.23, 0));
    iron.push(new THREE.CylinderGeometry(0.085, 0.035, 0.09, 7).translate(0.52 * sg, 3.6, 0));
    glass.push(new THREE.SphereGeometry(0.17, 8, 5).translate(0.52 * sg, 3.79, 0));
    iron.push(new THREE.SphereGeometry(0.03, 4, 3).translate(0.52 * sg, 3.975, 0));
    heads.push([0.52 * sg, 3.79, 0]);
  }
  return { iron: template(iron), glass: template(glass), heads, glow: 1.25 };
}

export function buildLamps(ctx, S) {
  const { map } = ctx;
  const kinds = { lantern: lanternTemplates(), twin: twinTemplates() };
  for (const l of map.lamps) {
    const K = kinds[l.kind] || kinds.lantern;
    place(S.lampIron, K.iron, l.x, l.y - 0.02, l.z, l.rot);
    place(S.lampGlass, K.glass, l.x, l.y - 0.02, l.z, l.rot);
    const c = Math.cos(l.rot), s = Math.sin(l.rot);
    for (const h of K.heads) S.glows.push({ x: l.x + h[0] * c + h[2] * s, y: l.y + h[1], z: l.z - h[0] * s + h[2] * c, size: K.glow });
    S.lampHeads.push({ x: l.x, y: l.y + 3.95, z: l.z, ground: l.y, lamp: l });
  }
  for (const k in kinds) { kinds[k].iron.dispose(); kinds[k].glass.dispose(); }
}
