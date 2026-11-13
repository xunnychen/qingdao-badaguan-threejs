// Tiny synchronous event bus (ctx.events). Listeners run in registration order, inside the emitter's call stack
// (so a 'start' listener may request pointer lock / resume an AudioContext within the user gesture).
export function createEvents() {
  const map = new Map();
  return {
    on(name, fn) { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); return () => map.get(name).delete(fn); },
    off(name, fn) { map.get(name)?.delete(fn); },
    emit(name, a, b, c) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) { try { fn(a, b, c); } catch (e) { console.error(`[events] listener for "${name}" failed`, e); } }
    },
  };
}
