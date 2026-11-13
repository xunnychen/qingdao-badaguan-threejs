// Touch controls: a floating virtual joystick on the left half of the screen and drag-look on the right half.
// One transparent layer at the bottom of ctx.uiRoot receives the pointers (so the UI package's buttons, which are
// later siblings, stay on top and keep the top corners). All state is plain numbers: nothing allocates per event.

const RADIUS = 60;          // px: stick travel
const DEADZONE = 0.14;
const BRISK_AT = 0.93;      // stick pushed to the edge = brisk pace
const LOOK_RATE = 0.004;    // rad per CSS px
const PITCH_MAX = 1.4;

const CSS = `
.bdg-touch{position:absolute;inset:0;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;display:none;overflow:hidden}
.bdg-touch.on{display:block}
.bdg-stick{position:absolute;left:0;top:0;width:${RADIUS * 2}px;height:${RADIUS * 2}px;margin:-${RADIUS}px 0 0 -${RADIUS}px;border-radius:50%;
  border:1.5px solid rgba(243,239,228,.42);background:radial-gradient(circle,rgba(243,239,228,.05) 0%,rgba(243,239,228,.1) 62%,rgba(22,38,43,.2) 100%);
  box-shadow:0 2px 18px rgba(8,16,18,.22),inset 0 0 22px rgba(243,239,228,.06);opacity:.42;pointer-events:none;will-change:transform,opacity;
  transition:opacity .28s ease,border-color .2s ease;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.bdg-stick.held{opacity:.95}
.bdg-stick.brisk{border-color:rgba(217,138,78,.95)}
.bdg-stick::before,.bdg-stick::after{content:"";position:absolute;left:50%;top:50%;background:rgba(243,239,228,.28);transform:translate(-50%,-50%)}
.bdg-stick::before{width:1px;height:14px}.bdg-stick::after{width:14px;height:1px}
.bdg-knob{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
  background:radial-gradient(circle at 50% 38%,rgba(243,239,228,.82),rgba(243,239,228,.46));box-shadow:0 2px 10px rgba(8,16,18,.35);will-change:transform;transition:background .2s ease}
.bdg-stick.brisk .bdg-knob{background:radial-gradient(circle at 50% 38%,rgba(246,214,170,.95),rgba(217,138,78,.7))}
@media (prefers-reduced-motion:reduce){.bdg-stick{transition:none}}
`;

/**
 * @param {{ uiRoot: HTMLElement, onLook: (dx:number, dy:number)=>void }} opts  onLook receives radians (yaw right +, pitch up +)
 */
export function createTouchControls({ uiRoot, onLook }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  const layer = document.createElement('div');
  layer.className = 'bdg-touch';
  layer.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('div');
  ring.className = 'bdg-stick';
  const knob = document.createElement('div');
  knob.className = 'bdg-knob';
  ring.appendChild(knob);
  layer.appendChild(ring);
  uiRoot.insertBefore(layer, uiRoot.firstChild);
  uiRoot.insertBefore(style, layer);

  const api = {
    x: 0, y: 0,          // stick: x right, y forward, -1..1 (deadzone removed)
    run: 0,              // 1 when the stick is at the edge
    active: false,
    pitchMax: PITCH_MAX,
    setActive, release, dispose,
  };

  let stickId = -1, lookId = -1, ox = 0, oy = 0, lx = 0, ly = 0, brisk = false;

  function restPosition() {
    const w = layer.clientWidth || innerWidth, h = layer.clientHeight || innerHeight;
    const m = Math.max(28, Math.min(w, h) * 0.06);
    ox = m + RADIUS + 8; oy = h - m - RADIUS - 14;
    ring.style.transform = `translate3d(${ox}px,${oy}px,0)`;
  }
  function setStick(dx, dy) {
    let d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; d = RADIUS; }
    knob.style.transform = `translate3d(${dx}px,${dy}px,0)`;
    const m = d / RADIUS;
    if (m < DEADZONE) { api.x = api.y = 0; api.run = 0; }
    else {
      const k = ((m - DEADZONE) / (1 - DEADZONE)) / d;
      api.x = dx * k; api.y = -dy * k; // already clamped to the ring, so |(x,y)| <= 1
      api.run = m >= BRISK_AT ? 1 : 0;
    }
    const b = api.run > 0;
    if (b !== brisk) { brisk = b; ring.classList.toggle('brisk', b); }
  }
  function releaseStick() {
    stickId = -1; api.x = api.y = 0; api.run = 0;
    knob.style.transform = 'translate3d(0,0,0)';
    ring.classList.remove('held', 'brisk'); brisk = false;
    restPosition();
  }

  function onDown(e) {
    if (!api.active) return;
    const w = layer.clientWidth || innerWidth;
    if (e.clientX < w * 0.5 && stickId < 0 && e.clientY > 72) {
      stickId = e.pointerId;
      const h = layer.clientHeight || innerHeight;
      ox = Math.max(RADIUS + 10, Math.min(w * 0.5 - 10, e.clientX));
      oy = Math.max(RADIUS + 10, Math.min(h - RADIUS - 10, e.clientY));
      ring.style.transform = `translate3d(${ox}px,${oy}px,0)`;
      ring.classList.add('held');
      setStick(e.clientX - ox, e.clientY - oy);
    } else if (lookId < 0) {
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    } else return;
    try { layer.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerId === stickId) setStick(e.clientX - ox, e.clientY - oy);
    else if (e.pointerId === lookId) {
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (api.active) onLook(dx * LOOK_RATE, -dy * LOOK_RATE);
    } else return;
    e.preventDefault();
  }
  function onUp(e) {
    if (e.pointerId === stickId) releaseStick();
    else if (e.pointerId === lookId) lookId = -1;
  }
  const onContext = (e) => e.preventDefault();
  const onResize = () => { if (stickId < 0) restPosition(); };

  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp);
  layer.addEventListener('lostpointercapture', onUp);
  layer.addEventListener('contextmenu', onContext);
  addEventListener('resize', onResize);
  restPosition();

  function release() { releaseStick(); lookId = -1; }
  function setActive(on) {
    if (on === api.active) return;
    api.active = on;
    layer.classList.toggle('on', on);
    release();
  }
  function dispose() {
    layer.removeEventListener('pointerdown', onDown);
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerup', onUp);
    layer.removeEventListener('pointercancel', onUp);
    layer.removeEventListener('lostpointercapture', onUp);
    layer.removeEventListener('contextmenu', onContext);
    removeEventListener('resize', onResize);
    layer.remove(); style.remove();
  }
  return api;
}
