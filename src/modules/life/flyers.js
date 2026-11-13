// Gulls over the bay and butterflies in the parks: one mesh, one shader. Each flyer is a handful of triangles whose
// flight path, banking and wing beat are evaluated in the vertex shader from per-flyer constants + time.
import * as THREE from 'three';

const GULLS = 8, BUTTERFLIES = 12;
// env.current.gulls / butterflies are "how lively", read as a count per place: the bay is wide and there are two parks,
// so the number actually drawn is gulls x 1.5 + 1.5 over the whole bay and butterflies x 4 over both parks.
const GULL_K = 1.5, GULL_PLUS = 1.5, BUTTERFLY_K = 4;

export function createFlyers(ctx, S) {
  const { map: MAP, world, rng } = ctx;
  const pos = [], col = [], wing = [], orb = [], mot = [], kin = [];
  let cur = null;
  // v: local x (right), y (up), z (forward); w = [side, inner length, outer length] for wing vertices
  const vert = (x, y, z, c, w = [0, 0, 0]) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); wing.push(w[0], w[1], w[2]); orb.push(...cur.orb); mot.push(...cur.mot); kin.push(...cur.kin); };
  const tri = (a, b, c) => { vert(...a); vert(...b); vert(...c); };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const C = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };

  function gull() {
    const white = C('#f4f4f0'), grey = C('#b9c0c6'), tip = C('#2a2c2e'), bill = C('#e0a020');
    // body: stretched octahedron
    const nose = [0, 0, 0.3, white], tail = [0, 0.01, -0.3, grey], R = [[0.08, 0, 0.04, white], [0, 0.075, 0.04, white], [-0.08, 0, 0.04, white], [0, -0.07, 0.04, white]];
    for (let i = 0; i < 4; i++) { tri(nose, R[i], R[(i + 1) % 4]); tri(tail, R[(i + 1) % 4], R[i]); }
    tri([0, 0, 0.3, bill], [0.012, 0, 0.3, bill], [0, -0.012, 0.37, bill]);
    // tail fan
    tri([0, 0.01, -0.22, white], [0.07, 0.01, -0.4, white], [-0.07, 0.01, -0.4, white]);
    // wings: inner panel (root -> wrist) and outer panel (wrist -> tip), swept back toward the tip
    for (const s of [1, -1]) {
      const L1 = 0.34, L2 = 0.42;
      const r0 = [s * 0.05, 0.02, 0.12, grey, [s, 0, 0]], r1 = [s * 0.05, 0.02, -0.1, grey, [s, 0, 0]];
      const m0 = [s * 0.05, 0.02, 0.14, grey, [s, L1, 0]], m1 = [s * 0.05, 0.02, -0.06, grey, [s, L1, 0]];
      const t0 = [s * 0.05, 0.02, 0.0, tip, [s, L1, L2]], t1 = [s * 0.05, 0.02, -0.07, tip, [s, L1, L2]];
      const h0 = [s * 0.05, 0.02, 0.09, grey, [s, L1, L2 * 0.55]], h1 = [s * 0.05, 0.02, -0.075, grey, [s, L1, L2 * 0.55]];
      quad(r0, m0, m1, r1); quad(m0, h0, h1, m1); quad(h0, t0, t1, h1);
    }
  }
  const polyHas = (park, x, z, m = 0) => world.polySignedDist(park.poly, x, z) < m;
  function butterfly(c1, c2) {
    const body = C('#2a241e');
    tri([0.004, 0, 0.012, body], [-0.004, 0, 0.012, body], [0, 0, -0.014, body]);
    for (const s of [1, -1]) {
      const a = [s * 0.002, 0, 0.008, c1, [s, 0, 0]], b = [s * 0.002, 0, 0.03, c1, [s, 0.036, 0]], c = [s * 0.002, 0, -0.004, c2, [s, 0.04, 0]];
      const d = [s * 0.002, 0, -0.03, c2, [s, 0.026, 0]], e = [s * 0.002, 0, -0.008, c1, [s, 0, 0]];
      tri(a, b, c); tri(a, c, e); tri(e, c, d);
    }
  }

  // ---- gull orbits: around the bay / headland (60,200), a couple that swing in over the promenade and 花石楼 -----------------
  const rand = rng.makeRng('life:gulls');
  const ORBITS = [
    [60, 196, 88, 66, 22], [96, 164, 50, 42, 15], [18, 132, 84, 46, 17], [70, 210, 112, 64, 34],
    [-60, 126, 92, 44, 19], [118, 138, 72, 56, 25], [30, 222, 66, 48, 13], [-140, 132, 80, 40, 21],
  ];
  for (let i = 0; i < GULLS; i++) {
    const o = ORBITS[i], speed = 8 + 3.5 * rand(), dir = rand() < 0.5 ? 1 : -1;
    cur = { orb: [o[0], o[1], o[2], o[3]], mot: [o[4], 3 + 5 * rand(), (dir * speed) / ((o[2] + o[3]) / 2), rand() * 6.283], kin: [i, 0, 2.1 + 0.5 * rand(), rand()] };
    gull();
  }
  // ---- butterflies: a few metres of lazy wandering over the park lawns --------------------------------------------------
  const brand = rng.makeRng('life:butterflies');
  const WINGS = [['#fffdf2', '#f4f0d8'], ['#ffd92e', '#f2a81a'], ['#fffdf2', '#ffe98a'], ['#ff9a2e', '#d9601a']];
  // most of them keep to the flower beds beside the park paths (where people walk), a few wander the open lawn
  const spots = MAP.parks.map(() => []);
  MAP.parks.forEach((park, pi) => {
    const want = BUTTERFLIES / MAP.parks.length, list = spots[pi], p = {};
    const far = (x, z, d) => list.every((q) => Math.hypot(q[0] - x, q[1] - z) > d);
    // the named look-outs inside a park always have a pair fluttering a few steps ahead
    for (const id in MAP.views) {
      const v = MAP.views[id];
      if ((v.h ?? 0) > 4 || !polyHas(park, v.x, v.z)) continue;
      const a = (v.yaw * Math.PI) / 180, fx = Math.sin(a), fz = -Math.cos(a);
      for (const [f, r] of [[5.5, -1.6], [8.5, 2.4]]) {
        const x = v.x + fx * f - fz * r, z = v.z + fz * f + fx * r;
        if (polyHas(park, x, z, -1) && !S.treeNear(x, z, 1.5) && list.length < want - 2) list.push([x, z, 1]);
      }
    }
    for (const path of MAP.paths) {
      if (path.kind !== 'gravel') continue;
      for (let tries = 0; tries < 40 && list.length < want - 1; tries++) {
        world.pointAt(path, brand.range(3, Math.max(4, path.len - 3)), p);
        const side = brand() < 0.5 ? 1 : -1, off = path.half + 1.5 + 3 * brand();
        const x = p.x + p.nx * side * off, z = p.z + p.nz * side * off;
        if (!polyHas(park, x, z, -3) || world.surfaceAt(x, z) !== 'lawn') continue;
        if (S.treeNear(x, z, 2.5) || !far(x, z, 7)) continue;
        list.push([x, z]);
      }
    }
    const xs = park.poly.map((q) => q[0]), zs = park.poly.map((q) => q[1]);
    for (let tries = 0; list.length < want && tries < 200; tries++) {
      const x = brand.range(Math.min(...xs), Math.max(...xs)), z = brand.range(Math.min(...zs), Math.max(...zs));
      if (!polyHas(park, x, z, -7) || S.treeNear(x, z, 3) || !far(x, z, 6)) continue;
      list.push([x, z]);
    }
  });
  // interleave the parks so the first few shown are spread over both
  const order = [];
  for (let i = 0; i < BUTTERFLIES; i++) for (const list of spots) if (list[i]) order.push(list[i]);
  order.forEach(([x, z, tight], i) => {
    const w = WINGS[i % WINGS.length], r = tight ? 1.2 + 0.8 * brand() : 1.8 + 2.4 * brand();
    cur = { orb: [x, z, r, r * (0.6 + 0.5 * brand())], mot: [world.heightAt(x, z) + 0.8 + 0.5 * brand(), 0.3, (brand() < 0.5 ? 1 : -1) * (0.9 + 0.5 * brand()) / r, brand() * 6.283], kin: [i, 1, 2.5 + 0.5 * brand(), brand()] };
    butterfly(C(w[0], 1.25), C(w[1], 1.25));
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 3));
  geo.setAttribute('aOrb', new THREE.Float32BufferAttribute(orb, 4));
  geo.setAttribute('aMot', new THREE.Float32BufferAttribute(mot, 4));
  geo.setAttribute('aKin', new THREE.Float32BufferAttribute(kin, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uCount: { value: new THREE.Vector2(3, 0) }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
  }]);
  uniforms.uTime = S.U.uTime; uniforms.uSunDir = S.U.uSunDir;
  const mat = new THREE.ShaderMaterial({
    name: 'life:flyers', uniforms, fog: true, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute vec3 aWing; attribute vec4 aOrb; attribute vec4 aMot; attribute vec4 aKin;
      uniform float uTime; uniform vec2 uCount;
      varying vec3 vCol; varying vec3 vView;
      #include <fog_pars_vertex>
      vec3 pathAt( float th, float bf ) {
        vec3 p;
        p.x = aOrb.x + aOrb.z * ( cos( th ) + 0.16 * cos( 2.3 * th + aMot.w * 3.0 ) + bf * 0.35 * sin( 3.1 * th ) );
        p.z = aOrb.y + aOrb.w * ( sin( th ) + 0.16 * sin( 1.7 * th + aMot.w * 5.0 ) + bf * 0.35 * cos( 2.3 * th ) );
        p.y = aMot.x + aMot.y * sin( th * mix( 0.7, 4.3, bf ) + aMot.w * 5.0 );
        return p;
      }
      void main() {
        float bf = aKin.y;                               // 0 gull, 1 butterfly
        float show = clamp( ( bf > 0.5 ? uCount.y : uCount.x ) - aKin.x, 0.0, 1.0 );
        float th = aMot.w + uTime * aMot.z;
        vec3 c = pathAt( th, bf );
        vec3 fw = normalize( pathAt( th + 0.02 * sign( aMot.z ), bf ) - c );
        vec3 fw2 = normalize( pathAt( th + 0.06 * sign( aMot.z ), bf ) - c );
        vec3 rt = normalize( cross( fw, vec3( 0.0, 1.0, 0.0 ) ) );
        // bank into the turn
        float turn = clamp( dot( fw2 - fw, rt ) * mix( 11.0, 4.0, bf ), -0.55, 0.55 );
        vec3 up = normalize( cross( rt, fw ) );
        vec3 rt2 = normalize( rt * cos( turn ) - up * sin( turn ) );
        up = normalize( cross( rt2, fw ) );
        // wing beat: gulls alternate flapping and gliding, butterflies never stop
        float ph = aKin.w * 6.283;
        float flap = smoothstep( -0.25, 0.45, sin( uTime * 0.31 + ph * 3.0 ) + 0.5 * sin( uTime * 0.13 + ph ) );
        float beat = uTime * mix( 19.0, 60.0, bf ) * ( 0.85 + 0.3 * aKin.w ) + ph;
        float a1 = mix( 0.3 + flap * 0.6 * sin( beat ), 0.25 + 1.05 * sin( beat ), bf );
        float a2 = mix( a1 - 0.62 + flap * 0.55 * sin( beat - 1.1 ), a1, bf );
        vec3 lp = position;
        lp.x += aWing.x * ( aWing.y * cos( a1 ) + aWing.z * cos( a2 ) );
        lp.y += aWing.y * sin( a1 ) + aWing.z * sin( a2 );
        lp.y += ( 1.0 - bf ) * - 0.035 * flap * sin( beat );       // the body bobs against the wing stroke
        c.y += bf * 0.22 * sin( uTime * 5.3 + ph * 2.0 );
        lp *= aKin.z * show;
        vec3 world = c + rt2 * lp.x + up * lp.y + fw * lp.z;
        vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        vCol = aCol; vView = mvPosition.xyz;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uSunCol, uSky, uGround;
      varying vec3 vCol; varying vec3 vView;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize( cross( dFdx( vView ), dFdy( vView ) ) );
        vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
        vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
        float ndl = abs( dot( n, sunV ) );
        float hemi = 0.5 + 0.5 * dot( n, upV ) * sign( dot( n, - vView ) );
        vec3 light = uSunCol * ( 0.25 + 0.75 * ndl ) + mix( uGround, uSky, hemi );
        gl_FragColor = vec4( vCol * light * RECIPROCAL_PI, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'life:flyers'; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
  S.group.add(mesh);

  return {
    update() {
      const e = ctx.env.current;
      uniforms.uCount.value.set(Math.min(GULLS, e.gulls > 0 ? e.gulls * GULL_K + GULL_PLUS : 0), Math.min(BUTTERFLIES, e.butterflies * BUTTERFLY_K));
      uniforms.uSunCol.value.copy(e.sunColor).multiplyScalar(e.sunIntensity);
      uniforms.uSky.value.copy(e.hemiSky).multiplyScalar(e.hemiIntensity);
      uniforms.uGround.value.copy(e.hemiGround).multiplyScalar(e.hemiIntensity);
    },
    dispose() { S.group.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
