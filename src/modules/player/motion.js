// Walking maths for the player package. DOM-free and three-free so it runs under Node (see player/selftest.mjs).
// One `step()` advances a walker: smoothed velocity, surface + slope speed factors, collision (core), steep-rise
// blocking with contour sliding, ground following, stride phase (head bob, sway, footsteps).
//
// Axes: +x east, +z south. Compass yaw: 0 = north (-z), +PI/2 = east. Forward = (sin yaw, -cos yaw) in (x, z).

export const WALK_SPEED = 1.7;       // m/s, a stroll
export const BRISK_SPEED = 4.6;      // m/s, Shift
export const STEP_WALK = 0.72;       // metres per footfall when strolling
export const STEP_BRISK = 1.1;       // metres per footfall at a brisk pace
export const ACCEL_LAMBDA = 10;      // velocity damping (1/s)
export const GROUND_LAMBDA = 14;     // feet-to-ground damping (1/s)
export const SLOPE_SLOW = 0.35;      // grades steeper than this slow the walker
export const SLOPE_BLOCK = 1.0;      // rises (and drops) steeper than this stop the walker
export const BOB_MAX = 0.0125;       // metres; hard cap on the bob amplitude (2.5 cm peak to peak)
const PROBE = 0.35;                  // baseline (m) over which a grade is measured
const TAU = Math.PI * 2;

export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Speed multiplier of a surface. depth = metres of water over the feet (0 on dry land). */
export function surfaceFactor(surface, depth) {
  let k = 1;
  if (surface === 'sand') k = 0.8;
  else if (surface === 'rock') k = 0.85;
  else if (surface === 'lawn' || surface === 'garden') k = 0.94;
  if (depth > 0) k = Math.min(k, 1 - 0.45 * clamp01(depth / 0.12)); // wading: 0.55
  return k;
}

/** Speed multiplier of a grade (rise / run along the direction of travel; + uphill). */
export function slopeFactor(grade) {
  if (grade > SLOPE_SLOW) return 1 - 0.5 * clamp01((grade - SLOPE_SLOW) / (SLOPE_BLOCK - SLOPE_SLOW));
  if (grade < -SLOPE_SLOW) return 1 - 0.3 * clamp01((-grade - SLOPE_SLOW) / (SLOPE_BLOCK - SLOPE_SLOW));
  return 1;
}

export function createWalker() {
  return {
    x: 0, y: 0, z: 0,            // feet; y is the smoothed ground height
    vx: 0, vz: 0,                // smoothed intent velocity (m/s)
    ax: 0, az: 0,                // actual velocity over the last step (after collision)
    speed: 0,                    // actual horizontal speed (m/s), lightly smoothed
    moving: false, running: false,
    run: 0,                      // 0 stroll .. 1 brisk (smoothed; drives stride length, bob size, FOV)
    gait: 0,                     // 0 standing .. 1 walking (smoothed; fades the bob in and out)
    phase: 0,                    // stride phase in footfalls; integer crossings are footfalls
    foot: 0,                     // 0 left, 1 right (alternates per footfall)
    stepped: false,              // a footfall happened during the last step()
    bob: 0, sway: 0, roll: 0,    // metres up, metres to the right, radians
    surface: 'road', depth: 0, grade: 0,
    hit: false,                  // touched a collider
    blocked: false,              // stopped by the playable bounds or deep water (core)
    edge: false,                 // ...specifically by the rectangle MAP.WALK
    steep: false,                // stopped by a rise or drop steeper than SLOPE_BLOCK
  };
}

/** Put the walker somewhere and forget all smoothing. */
export function resetWalker(w, x, z, world) {
  w.x = x; w.z = z; w.y = world.heightAt(x, z);
  w.vx = w.vz = w.ax = w.az = 0; w.speed = 0; w.moving = w.running = false;
  w.run = 0; w.gait = 0; w.phase = 0; w.foot = 0; w.stepped = false;
  w.bob = w.sway = w.roll = 0; w.grade = 0;
  w.surface = world.surfaceAt(x, z); w.depth = Math.max(0, -w.y);
  w.hit = w.blocked = w.edge = w.steep = false;
  return w;
}

/**
 * @param {{world, collision, walk}} env  world: heightAt + surfaceAt; collision: move(); walk: MAP.WALK
 * @returns {(w, fwd, strafe, run, yaw, dt, t) => w} step function; fwd/strafe in -1..1 (analogue), run 0..1,
 *          yaw compass radians, dt seconds, t seconds (idle breathing only). Allocation-free.
 */
export function createStepper({ world, collision, walk, radius = 0.35 }) {
  const out = { x: 0, z: 0, hit: false, blocked: false };
  const { heightAt, surfaceAt } = world;

  // grade from (x,z) along the unit direction (ux,uz), measured over PROBE metres
  const gradeAlong = (x, z, h, ux, uz) => (heightAt(x + ux * PROBE, z + uz * PROBE) - h) / PROBE;

  return function step(w, fwd, strafe, run, yaw, dt, t = 0) {
    w.stepped = false;
    if (!(dt > 0)) return w;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let ix = sin * fwd + cos * strafe, iz = -cos * fwd + sin * strafe; // world-space intent
    let mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; mag = 1; }
    const h0 = heightAt(w.x, w.z);
    const depth = h0 < 0 ? -h0 : 0;

    // ---- target velocity ---------------------------------------------------------------------------------------------
    let tvx = 0, tvz = 0;
    if (mag > 0.02) {
      const ux = ix / mag, uz = iz / mag;
      const g = gradeAlong(w.x, w.z, h0, ux, uz);
      const sp = (WALK_SPEED + (BRISK_SPEED - WALK_SPEED) * clamp01(run)) * surfaceFactor(w.surface, depth) * slopeFactor(g) * mag;
      tvx = ux * sp; tvz = uz * sp;
      w.grade = g;
    } else w.grade = 0;
    w.vx = damp(w.vx, tvx, ACCEL_LAMBDA, dt); w.vz = damp(w.vz, tvz, ACCEL_LAMBDA, dt);
    if (mag <= 0.02 && w.vx * w.vx + w.vz * w.vz < 1e-4) w.vx = w.vz = 0;

    // ---- move + collide ----------------------------------------------------------------------------------------------
    let nx = w.x, nz = w.z;
    w.hit = w.blocked = w.edge = w.steep = false;
    const mx = w.vx * dt, mz = w.vz * dt, md = Math.hypot(mx, mz);
    if (md > 1e-6) {
      collision.move(w.x, w.z, w.x + mx, w.z + mz, radius, out);
      nx = out.x; nz = out.z; w.hit = out.hit; w.blocked = out.blocked;
      let edge = !!out.edge;       // core: stopped by the walk limit itself (not a rectangle on the east coast)
      const dx = nx - w.x, dz = nz - w.z, d = Math.hypot(dx, dz);
      if (d > 1e-6) {
        // too steep? (seawall face, rock steps). Measured over a fixed baseline so frame rate does not matter.
        const g = gradeAlong(w.x, w.z, h0, dx / d, dz / d);
        if (g > SLOPE_BLOCK || g < -SLOPE_BLOCK) {
          w.steep = true;
          // slide along the contour: drop the component of the move that goes up/down the fall line
          let gx = heightAt(w.x + 0.2, w.z) - heightAt(w.x - 0.2, w.z), gz = heightAt(w.x, w.z + 0.2) - heightAt(w.x, w.z - 0.2);
          const gl = Math.hypot(gx, gz);
          nx = w.x; nz = w.z;
          if (gl > 1e-6) {
            gx /= gl; gz /= gl;
            const along = dx * gx + dz * gz;
            const sx = dx - gx * along, sz = dz - gz * along, sd = Math.hypot(sx, sz);
            if (sd > 1e-5) {
              const g2 = gradeAlong(w.x, w.z, h0, sx / sd, sz / sd);
              if (g2 <= SLOPE_BLOCK && g2 >= -SLOPE_BLOCK) {
                collision.move(w.x, w.z, w.x + sx, w.z + sz, radius, out);
                nx = out.x; nz = out.z; w.hit = w.hit || out.hit; w.blocked = w.blocked || out.blocked; edge = edge || !!out.edge;
              }
            }
            // do not keep pushing into the slope
            const va = w.vx * gx + w.vz * gz;
            w.vx -= gx * va * 0.8; w.vz -= gz * va * 0.8;
          }
        }
      }
      if (w.blocked) {
        const e = 0.02;
        w.edge = edge || nx <= walk.minX + e || nx >= walk.maxX - e || nz <= walk.minZ + e || (walk.maxZ != null && nz >= walk.maxZ - e);
      }
    }
    const ddx = nx - w.x, ddz = nz - w.z, dist = Math.hypot(ddx, ddz);
    w.ax = ddx / dt; w.az = ddz / dt;
    w.x = nx; w.z = nz;
    const h1 = dist > 0 ? heightAt(nx, nz) : h0;
    w.y = damp(w.y, h1, GROUND_LAMBDA, dt);
    w.depth = h1 < 0 ? -h1 : 0;
    if (dist > 0) w.surface = surfaceAt(nx, nz);

    // ---- gait ---------------------------------------------------------------------------------------------------------
    const actual = dist / dt;
    w.speed = damp(w.speed, actual, 18, dt);
    if (w.speed < 0.005) w.speed = 0;
    w.moving = actual > 0.12;
    const runNow = clamp01((actual - WALK_SPEED * 1.15) / (BRISK_SPEED * 0.8 - WALK_SPEED * 1.15));
    w.run = damp(w.run, runNow, 6, dt);
    w.running = w.moving && actual > WALK_SPEED * 1.35;
    w.gait = damp(w.gait, w.moving ? 1 : 0, w.moving ? 7 : 5, dt);

    const stride = STEP_WALK + (STEP_BRISK - STEP_WALK) * w.run;
    if (dist > 0) {
      const p0 = Math.floor(w.phase);
      w.phase += dist / stride;
      if (Math.floor(w.phase) > p0) { w.stepped = true; w.foot ^= 1; }
      if (w.phase > 4096) w.phase -= 4096; // keep precision; even number keeps left/right in sync
    } else if (w.gait < 0.02) {
      // standing: settle so the first step lands after about a third of a stride (feels responsive)
      w.phase = Math.floor(w.phase) + 0.62;
    }

    // head: lowest at each footfall (integer phase), highest mid-stride; sway once per two footfalls
    // the brief's 2.5 cm is peak-to-peak travel: +/-1.2 cm strolling, and SMALLER at a brisk pace, where the cadence
    // rises to about 4 footfalls a second and a big bob would read as shaking
    const amp = (0.012 - 0.004 * w.run) * w.gait * (w.depth > 0.05 ? 0.7 : 1);
    const breathe = (1 - w.gait) * 0.0035 * Math.sin(t * 1.35);
    let bob = -Math.cos(w.phase * TAU) * amp + breathe;
    if (bob > BOB_MAX) bob = BOB_MAX; else if (bob < -BOB_MAX) bob = -BOB_MAX;
    w.bob = bob;
    const lat = Math.sin(w.phase * Math.PI);
    w.sway = lat * 0.009 * w.gait;   // constant with pace: only the cadence changes
    w.roll = lat * 0.002 * w.gait;
    return w;
  };
}
