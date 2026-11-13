// URL parameters (all optional). Parsed once; exposed as ctx.params.
//   shot=1            screenshot mode: no title screen, fixed time, renders N frames then sets window.__ready
//   view=<id>         camera from MAP.views (spawn, ginkgo, cedar, huashi, beach, overview, top, ...)
//   pos=x,z           camera ground position in metres (overrides view)
//   h=<m>             eye height above the ground (default 1.65; use e.g. 80 for aerial shots)
//   yaw=<deg>         compass heading: 0 north, 90 east, 180 south (sea), 270 west
//   pitch=<deg>       + looks up, - looks down
//   fov=<deg>         vertical field of view (default 62)
//   preset=<id>       autumn | fog | dusk | spring
//   q=<tier>          low | medium | high
//   t=<s>             simulation time used in shot mode (default 12)
//   frames=<n>        frames rendered before __ready in shot mode (default 6)
//   only=a,b / skip=a,b   load only / skip these feature modules (debugging)
//   debug=1           show draw-call / triangle overlay
//   mute=1            start with audio muted
//   stats=1           shot mode: also measure draw calls / triangles per top-level scene group (printed by shot.mjs)
export function parseParams(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search);
  const num = (k, d) => (q.has(k) && q.get(k) !== '' && isFinite(+q.get(k)) ? +q.get(k) : d);
  const list = (k) => (q.get(k) ? q.get(k).split(',').map((s) => s.trim()).filter(Boolean) : null);
  let pos = null;
  if (q.get('pos')) { const a = q.get('pos').split(',').map(Number); if (a.length >= 2 && a.every(isFinite)) pos = { x: a[0], z: a[a.length - 1] }; }
  return {
    shot: q.get('shot') === '1',
    view: q.get('view') || null,
    pos, h: num('h', null), yaw: num('yaw', null), pitch: num('pitch', null), fov: num('fov', null),
    preset: q.get('preset') || null,
    q: q.get('q') || null,
    t: num('t', 12), frames: Math.max(1, Math.min(120, num('frames', 6))),
    only: list('only'), skip: list('skip'),
    debug: q.get('debug') === '1', mute: q.get('mute') === '1', stats: q.get('stats') === '1',
  };
}
