// Browser check of the player package (desktop pointer lock + keys, touch joystick + drag look, dispose).
// Always through the memory gate, in the background:
//   SHOT_DIST=dist-player ~/.claude/bin/heavy-gate -n 1 -l shot-player -- node src/modules/player/e2e.mjs shots/player
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIST = path.resolve(ROOT, process.env.SHOT_DIST || 'dist');
const OUT = path.resolve(ROOT, process.argv[2] || 'shots/player');
const QUERY = process.argv[3] || 'q=low&only=player,sky,terrain,ui&mute=1&debug=1';
const DEBUG = /(^|&)debug=1/.test(QUERY);
const ONLY = (process.env.E2E_ONLY || 'desktop,nolock,touch,laptop').split(','); // sections to run
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(DIST, p));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/?${QUERY}`;
const GO = 'button.ui-go'; // the UI package's start / resume button
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${typeof info === 'string' ? info : JSON.stringify(info)}`); if (!ok) fails++; };
const snap = (page) => page.evaluate(() => {
  const c = window.__badaguan, p = c.player;
  return { x: +p.pos.x.toFixed(3), y: +p.pos.y.toFixed(3), z: +p.pos.z.toFixed(3), yaw: +p.yaw.toFixed(4), pitch: +p.pitch.toFixed(4), speed: +p.speed.toFixed(2),
    moving: p.moving, running: p.running, locked: p.locked, surface: p.surface, bob: +p.bob.toFixed(4), fov: +c.camera.fov.toFixed(2),
    started: c.state.started, paused: c.state.paused, lockEl: document.pointerLockElement === c.canvas, steps: window.__steps || 0, frame: c.state.frame,
    touchLayer: !!document.querySelector('.bdg-touch.on'), errors: window.__errors };
});
// software GL runs at a few fps and dt is capped at 0.1 s: wait in simulation frames, not wall time
const frames = async (page, n) => { const f0 = await page.evaluate(() => window.__badaguan.state.frame); await page.waitForFunction((f) => window.__badaguan.state.frame >= f, f0 + n, { timeout: 300000, polling: 100 }); };
const hook = (page) => page.evaluate(() => { window.__steps = 0; window.__badaguan.events.on('footstep', () => window.__steps++); });

let browser;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox'] });

  // ---- desktop ------------------------------------------------------------------------------------------------------
  if (ONLY.includes('desktop')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => { console.log('[pageerror]', e.message); fails++; });
    page.on('console', (m) => { if (m.type() === 'error') { console.log('[page error]', m.text()); fails++; } });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', null, { timeout: 300000, polling: 250 });
    await hook(page);
    const a = await snap(page);
    await page.waitForTimeout(2500);
    const b = await snap(page);
    check('attract drift pans, no translation', b.yaw !== a.yaw && b.x === a.x && b.z === a.z && !b.started, { yaw0: a.yaw, yaw1: b.yaw, frames: b.frame - a.frame });
    await page.click(GO); // the UI's start button: a real click, so the pointer lock request has its user gesture
    await page.waitForTimeout(600);
    let s = await snap(page);
    console.log('after click', JSON.stringify(s));
    if (!s.started) throw new Error(`clicking ${GO} did not start the walk (UI changed?)`);
    if (!s.lockEl) {
      console.log('note: pointer lock unavailable in this headless browser; checking the drag-look fallback, then driving keys without it');
      const mode = await page.evaluate(() => window.__badaguan.player.lookMode);
      check('lock refused -> keeps playing in drag-look', s.started && !s.paused && s.locked && mode === 'drag', { paused: s.paused, mode });
      await page.mouse.move(700, 300); await page.mouse.down(); await page.mouse.move(800, 320, { steps: 5 }); await page.mouse.up();
      const d = await snap(page);
      check('drag looks around', Math.abs(d.yaw - s.yaw - 100 * 0.0022) < 0.03 && Math.abs(d.pitch - s.pitch + 20 * 0.0022) < 0.02 && !d.paused, { dyaw: +(d.yaw - s.yaw).toFixed(3), dpitch: +(d.pitch - s.pitch).toFixed(3) });
      await page.keyboard.press('Escape');
      const esc = await snap(page);
      check('Esc pauses without a lock', esc.paused && !esc.locked, '');
      await page.click(GO); await page.waitForTimeout(600);
      s = await snap(page);
      check('resume without a lock', !s.paused && s.locked, '');
    } else check('lock taken', s.locked && s.started && !s.paused, '');
    await page.keyboard.down('KeyW');
    await frames(page, 40);
    const w1 = await snap(page);
    const d1 = Math.hypot(w1.x - s.x, w1.z - s.z), simT = (w1.frame - s.frame);
    // core clamps dt at 0.1 s, so 40 frames cover at most 40 * 0.1 s * 1.7 m/s whatever the frame rate
    check('W walks forward', d1 > 1.5 && d1 < simT * 0.1 * 1.71 + 0.2 && w1.moving && !w1.running && w1.speed <= 1.71 && w1.steps > 0, { dist: +d1.toFixed(2), frames: simT, speed: w1.speed, steps: w1.steps, bob: w1.bob });
    await page.screenshot({ path: path.join(OUT, 'e2e-walk.png') });
    await page.keyboard.down('ShiftLeft');
    await frames(page, 30);
    const w2 = await snap(page);
    check('Shift is brisk', w2.running && w2.speed > 2.5 && w2.speed <= 4.61 && w2.fov > w1.fov, { speed: w2.speed, fov: w2.fov });
    if (w2.lockEl) {
      await page.mouse.move(700, 360); await page.mouse.move(760, 350);
      await page.waitForTimeout(200);
      const w3 = await snap(page);
      check('mouse look', w3.yaw !== w2.yaw, { yaw0: w2.yaw, yaw1: w3.yaw, pitch: w3.pitch });
      await page.evaluate(() => document.exitPointerLock());
    } else await page.evaluate(() => window.__badaguan.app.pause());
    await frames(page, 45);
    const p1 = await snap(page);
    await frames(page, 6);
    const p2 = await snap(page);
    check('pause clears held keys', p2.paused && !p2.locked && !p2.moving && Math.hypot(p2.x - p1.x, p2.z - p1.z) < 0.01, { speed: p2.speed });
    await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
    await page.evaluate(() => window.__setView(-40, 100, 110, 0));
    const tv = await snap(page);
    check('__setView teleports', tv.x === -40 && tv.z === 100 && tv.surface === 'sand', { y: tv.y, surface: tv.surface });
    if (DEBUG && tv.lockEl === false) {
      // debug fly: pausing must not sink an aerial camera back to walking height
      await page.click(GO); await page.waitForTimeout(600);
      const eye = () => page.evaluate(() => +window.__badaguan.player.eyeHeight.toFixed(2));
      await page.keyboard.press('KeyF');
      await page.keyboard.down('KeyE'); await frames(page, 20); await page.keyboard.up('KeyE');
      const e1 = await eye();
      await page.evaluate(() => (document.pointerLockElement ? document.exitPointerLock() : window.__badaguan.app.pause()));
      await frames(page, 40);
      const e2 = await eye(), fp = await snap(page);
      check('fly: pause keeps the height', fp.paused && e1 > 5 && Math.abs(e2 - e1) < 0.01, { before: e1, after: e2 });
    }
    await page.evaluate(() => window.__badaguan.modules.player.dispose());
    const gone = await page.evaluate(() => ({ view: typeof window.__setView, layer: !!document.querySelector('.bdg-touch') }));
    check('dispose', gone.view === 'undefined' && !gone.layer, gone);
    await page.close();
  }

  // ---- desktop, pointer lock refused (an iframe without the permission) -----------------------------------------------
  if (ONLY.includes('nolock')) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => {
      window.__allowLock = false;
      const real = Element.prototype.requestPointerLock;
      Element.prototype.requestPointerLock = function () { if (window.__allowLock) { const r = real.call(this); r?.then?.(() => { window.__lockRes = 'granted'; }, (e) => { window.__lockRes = String(e); }); return r; } return Promise.reject(new DOMException('refused', 'SecurityError')); };
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => { console.log('[pageerror]', e.message); fails++; });
    page.on('console', (m) => { if (m.type() === 'error') { console.log('[page error]', m.text()); fails++; } });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', null, { timeout: 300000, polling: 250 });
    await page.evaluate(() => { window.__modes = []; window.__badaguan.events.on('lookmode', (m) => window.__modes.push(m)); });
    const look = () => page.evaluate(() => ({ mode: window.__badaguan.player.lookMode, modes: window.__modes.join(','), cursor: window.__badaguan.canvas.style.cursor }));
    await page.click(GO); await page.waitForTimeout(600);
    let s = await snap(page), l = await look();
    check('lock refused -> keeps playing in drag-look', s.started && !s.paused && s.locked && !s.lockEl && l.mode === 'drag' && l.modes === 'drag' && l.cursor === 'grab', l);
    await frames(page, 80);          // let the title menu fade out and the attract pan ease back to zero
    await page.waitForFunction(() => document.elementFromPoint(700, 300) === window.__badaguan.canvas, null, { timeout: 60000, polling: 100 });
    s = await snap(page);
    await page.mouse.move(700, 300); await page.mouse.move(760, 300);
    const h = await snap(page);
    check('hover without a button does not look', h.yaw === s.yaw && h.pitch === s.pitch, '');
    await page.mouse.down(); await page.mouse.move(800, 320, { steps: 5 });
    const held = await look();
    await page.mouse.up();
    const d = await snap(page);
    check('drag looks around', Math.abs(d.yaw - s.yaw - 40 * 0.0022) < 0.01 && Math.abs(d.pitch - s.pitch + 20 * 0.0022) < 0.01 && !d.paused && held.cursor === 'grabbing',
      { dyaw: +(d.yaw - s.yaw).toFixed(3), dpitch: +(d.pitch - s.pitch).toFixed(3), cursor: held.cursor });
    await page.keyboard.down('KeyW'); await frames(page, 20); await page.keyboard.up('KeyW');
    const w = await snap(page);
    check('W walks in drag-look', Math.hypot(w.x - d.x, w.z - d.z) > 0.8 && !w.paused, '');
    await page.screenshot({ path: path.join(OUT, 'e2e-draglook.png') });
    await page.keyboard.press('Escape');
    const esc = await snap(page); l = await look();
    check('Esc pauses without a lock', esc.paused && !esc.locked && l.cursor !== 'grab', l);
    await page.click(GO); await page.waitForTimeout(600);
    s = await snap(page);
    check('resume stays playable without a lock', !s.paused && s.locked && !s.lockEl, '');
    // the browser relents (Chrome's cooldown is over): the next click on the scene upgrades to a real lock
    await page.evaluate(() => { window.__allowLock = true; });
    // the pause menu is still hit-testable while it fades (0.7 s, longer at software-GL frame rates)
    await page.waitForFunction(() => document.elementFromPoint(640, 300) === window.__badaguan.canvas, null, { timeout: 60000, polling: 100 });
    await page.evaluate(() => { window.__clicks = 0; window.__badaguan.canvas.addEventListener('click', () => window.__clicks++); });
    await page.mouse.click(640, 300); await page.waitForTimeout(600);
    console.log('upgrade click', JSON.stringify(await page.evaluate(() => ({ clicks: window.__clicks, res: window.__lockRes, at: document.elementFromPoint(640, 300)?.tagName + '.' + document.elementFromPoint(640, 300)?.className }))));
    s = await snap(page); l = await look();
    if (s.lockEl) {
      check('click upgrades to pointer lock', !s.paused && s.locked && l.mode === 'lock' && l.cursor !== 'grab', l);
      await page.evaluate(() => document.exitPointerLock());
      await page.waitForFunction(() => window.__badaguan.state.paused, null, { timeout: 60000 });
      check('losing a real lock pauses', true, '');
    } else console.log('note: this headless browser granted no pointer lock, upgrade check skipped', JSON.stringify(l));
    await context.close();
  }

  // ---- touch --------------------------------------------------------------------------------------------------------
  if (ONLY.includes('touch')) {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (e) => { console.log('[pageerror]', e.message); fails++; });
    page.on('console', (m) => { if (m.type() === 'error') { console.log('[page error]', m.text()); fails++; } });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', null, { timeout: 300000, polling: 250 });
    await hook(page);
    const box = await page.locator(GO).boundingBox();
    if (!box) throw new Error(`${GO} is not on the touch title screen`);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    const s = await snap(page);
    if (!s.started) throw new Error(`tapping ${GO} did not start the walk (UI changed?)`);
    check('tap starts, touch layer on, no pointer lock', s.started && !s.paused && s.locked && s.touchLayer && !s.lockEl, '');
    await page.screenshot({ path: path.join(OUT, 'e2e-touch-rest.png') });
    const cdp = await context.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
    await touch('touchStart', [[170, 280, 1]]);
    await touch('touchMove', [[170, 250, 1]]);
    await frames(page, 30);
    const t1 = await snap(page);
    check('stick half-way strolls', t1.moving && !t1.running && t1.speed > 0.3 && t1.speed < 1.7, { speed: t1.speed });
    await touch('touchMove', [[170, 200, 1]]);
    await frames(page, 30);
    await touch('touchStart', [[170, 200, 1], [600, 200, 2]]);
    await touch('touchMove', [[170, 200, 1], [650, 190, 2]]);
    await touch('touchMove', [[170, 200, 1], [700, 180, 2]]);
    await frames(page, 3);
    const t2 = await snap(page);
    check('stick at the edge is brisk', t2.running && t2.speed > 2.5, { speed: t2.speed, steps: t2.steps });
    check('right-half drag looks', Math.abs(t2.yaw - t1.yaw - 0.4) < 0.02 && Math.abs(t2.pitch - t1.pitch - 0.08) < 0.02, { dyaw: +(t2.yaw - t1.yaw).toFixed(3), dpitch: +(t2.pitch - t1.pitch).toFixed(3) });
    await page.screenshot({ path: path.join(OUT, 'e2e-touch-brisk.png') });
    await touch('touchEnd', []);
    await frames(page, 45);
    const t3 = await snap(page);
    check('release stops', !t3.moving && t3.speed < 0.05, { speed: t3.speed });
    await page.evaluate(() => window.__badaguan.modules.player.dispose());
    check('dispose removes the layer', !(await page.evaluate(() => !!document.querySelector('.bdg-touch, .bdg-stick'))), '');
    await context.close();
  }

  // ---- touch laptop, started from the keyboard ------------------------------------------------------------------------
  if (ONLY.includes('laptop')) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
    // headless touch emulation reports a coarse pointer only; a real touch laptop also has a fine one (the trackpad)
    await context.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/any-pointer:\s*fine/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : real(q));
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => { console.log('[pageerror]', e.message); fails++; });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', null, { timeout: 300000, polling: 250 });
    const env = await page.evaluate(() => ({ isTouch: window.__badaguan.quality.isTouch, fine: matchMedia('(any-pointer: fine)').matches }));
    await page.focus(GO);
    const act = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className} menu=${document.querySelector('.ui-menu')?.className}`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const s = await snap(page);
    if (!s.started) console.log('note: focus before Enter was', act);
    if (!s.started) throw new Error(`Enter on ${GO} did not start the walk`);
    check('touch laptop + Enter -> pointer lock, no touch layer', env.isTouch && env.fine && !s.touchLayer && (s.lockEl || s.paused), { ...env, lockEl: s.lockEl, paused: s.paused });
    // the same machine, started with a finger instead: touch layer, no lock
    await page.evaluate(() => (document.pointerLockElement ? document.exitPointerLock() : window.__badaguan.app.pause()));
    await page.waitForFunction(() => window.__badaguan.state.paused, null, { timeout: 60000 });
    await page.waitForTimeout(1600);
    const box = await page.locator(GO).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    const s2 = await snap(page);
    check('touch laptop + tap -> touch layer, no lock', !s2.paused && s2.touchLayer && !s2.lockEl && s2.locked, { paused: s2.paused, touchLayer: s2.touchLayer, lockEl: s2.lockEl });
    await context.close();
  }
} catch (e) {
  console.error('[e2e] failure:', e);
  fails++;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
