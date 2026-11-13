// Adaptive resolution controller. Pure logic (no three.js, no DOM) so it can be driven with synthetic frame times.
//
//   frame(ms)   feed one rAF interval; may call setRatio() and, at most once, onStruggle()
//   settle(n)   ignore the next n windows (load, 'start', preset change, our own ratio change)
//
// Rules:
// - Frame times are clamped to 250 ms instead of being thrown away, so a machine running at 3 fps still fills a window
//   and the ratio still drops. Only an ISOLATED spike (more than 4x the running average, not repeated on the next frame)
//   is left out: that is a shader compile / shadow upload / GC hitch, not the fill rate.
// - The floor is a pixel budget, not a fixed ratio: 0.75 x CSS pixels on a laptop, less on a 4K panel.
// - A window averaging above `panicMs` jumps straight to the floor; above `slowMs` it steps down by 0.25.
// - Still above `struggleMs` at the floor for `struggleWindows` windows in a row: report it once (lower tier needed).
// - Frame time is the rAF interval, which vsync floors at the display's refresh period (16.7 ms at 60 Hz), so "fast
//   enough to raise" is judged against the refresh period actually observed, not against an absolute number.

const WINDOW_MS = 2000;
const CLAMP_MS = 250;
const PIXEL_BUDGET = 1.6e6;   // device pixels at the floor (about 1690 x 950)
const FLOOR_RATIO = 0.75;     // never go below this when the budget allows it
const ABS_MIN_RATIO = 0.4;    // below this the image is mush whatever the budget says

/** Lowest pixel ratio the controller may choose for a CSS viewport of w x h, never above `max`. */
export function floorRatio(w, h, max) {
  const budget = Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h));
  return Math.min(max, Math.max(ABS_MIN_RATIO, Math.min(FLOOR_RATIO, budget)));
}

export function createAdaptive({
  max, getSize, getRatio, setRatio, onStruggle,
  slowMs = 22, panicMs = 45, struggleMs = 33, struggleWindows = 3,
}) {
  const s = {
    acc: 0, n: 0, good: 0,
    ema: 0,               // running average of accepted frame times (ms)
    spiked: false,        // the previous frame was left out as a spike
    refresh: 16.7,        // smallest stable window average seen so far (ms): the display's refresh period
    needGood: 3,          // consecutive windows at the refresh rate required before stepping up
    settle: 2,            // windows still to ignore
    justRaised: false,
    slowAtFloor: 0, reported: false,
  };

  function minRatio() { const z = getSize(); return floorRatio(z.width, z.height, max); }

  function window_(avg) {
    if (s.settle > 0) { s.settle--; return; }
    // 6.9 ms = 144 Hz: never believe anything faster, so one odd window cannot make the raise test unreachable
    if (avg < s.refresh) s.refresh = Math.max(6.9, avg);
    const pr = getRatio();
    const min = minRatio();
    const atFloor = pr <= min + 1e-3;
    if (avg > slowMs && !atFloor) {
      // stepping down right after stepping up means the higher ratio does not hold: wait twice as long next time
      if (s.justRaised) s.needGood = Math.min(s.needGood * 2, 48);
      s.justRaised = false; s.good = 0; s.settle = 1; s.slowAtFloor = 0;
      setRatio(avg > panicMs ? min : Math.max(min, pr - 0.25));
      return;
    }
    if (atFloor && avg > struggleMs) {
      s.good = 0;
      if (++s.slowAtFloor >= struggleWindows && !s.reported) {
        s.reported = true;
        onStruggle?.({ avgMs: avg, pixelRatio: pr });
      }
      return;
    }
    s.slowAtFloor = 0;
    if (avg < Math.min(s.refresh * 1.12, 20) && pr < max - 1e-3) {
      // holding the refresh rate: no dropped frames at this ratio
      if (++s.good >= s.needGood) {
        s.good = 0; s.settle = 1; s.justRaised = true;
        setRatio(Math.min(max, pr + 0.25));
      }
    } else {
      s.good = 0;
      if (avg < 18) s.justRaised = false;   // the current ratio holds comfortably
    }
  }

  return {
    state: s,
    minRatio,
    settle(n = 1) { s.settle = Math.max(s.settle, n); },
    /** Feed one frame interval in milliseconds. */
    frame(msRaw) {
      if (!(msRaw > 0)) return;
      const ms = Math.min(msRaw, CLAMP_MS);
      if (s.ema > 0 && msRaw > s.ema * 4 && !s.spiked) { s.spiked = true; return; }   // isolated hitch
      s.spiked = false;
      s.ema = s.ema > 0 ? s.ema + (ms - s.ema) * 0.1 : ms;
      s.acc += ms; s.n++;
      if (s.acc < WINDOW_MS) return;
      const avg = s.acc / s.n;
      s.acc = 0; s.n = 0;
      window_(avg);
    },
  };
}
