#!/usr/bin/env node
// Interaction test of the BUILT site (dist/): real key presses, mouse movement and touches against the normal
// interactive page. One browser, closed in `finally`. ALWAYS through the memory gate, in the background:
//
//   ~/.claude/bin/heavy-gate -n 1 -l interact -- node scripts/test-interact.mjs [phases] [--out=shots/review1-interaction]
//
// phases: comma list of  full,collide,walk,nolock,touch,fade  (default: all six)
//   full     default page (no query): title screen, start click, pointer lock, WASD / arrows / Shift, mouse look, HUD keys,
//            caption, pause / resume, resize
//   collide  ?q=low, all modules: offline sweeps of the real ctx.collision set over the whole plan (villas, walls, streets,
//            sea, bounds, stairs, boardwalk); no rendering needed
//   walk     light scene (player, sky, terrain, ui: the plan colliders are core) at 640x360 so software GL gives enough
//            frames: full key matrix, then real-key walks into a tree, a wall, a villa, the sea and the map edges
//   nolock   pointer lock refused / missing: is the walk still usable?
//   fade     ?q=low, all modules, HUD forced (uitest=play): a whole preset cross-fade driven by the 3 / 2 keys, with
//            screenshots at the middle and the end, then three key presses in quick succession
//   touch    phone portrait + landscape: title, tap start, stick, drag look, corner buttons
// Software GL runs at a few fps and the loop clamps dt to 0.1 s, so waits are counted in simulation frames.
// Exit code: 0 all checks passed, 1 some failed, 2 infrastructure failure.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.SHOT_DIST || 'dist');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const PHASES = (args.find((a) => !a.startsWith('--')) || 'full,collide,walk,nolock,touch,fade').split(',');
const OUT = path.resolve(ROOT, flags.out || 'shots/review1-interaction');
const LITE = 'q=low&only=player,sky,terrain,ui,audio&mute=1';
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('dist/index.html not found'); process.exit(2); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(DIST, p));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

let fails = 0, passes = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${typeof info === 'string' ? info : JSON.stringify(info)}`); if (ok) passes++; else fails++; };
const note = (name, info = '') => console.log(`note ${name}  ${typeof info === 'string' ? info : JSON.stringify(info)}`);
const GO = 'button.ui-go';
const T = 600000;

const snap = (page) => page.evaluate(() => {
  const c = window.__badaguan, p = c.player, r = (v, n = 3) => +v.toFixed(n);
  return { x: r(p.pos.x), y: r(p.pos.y), z: r(p.pos.z), ground: r(c.world.heightAt(p.pos.x, p.pos.z)), camY: r(c.camera.position.y), eye: r(p.eyeHeight), bob: r(p.bob, 4),
    yaw: r(p.yaw, 4), pitch: r(p.pitch, 4), speed: r(p.speed, 2), moving: p.moving, running: p.running, locked: p.locked, surface: p.surface,
    started: c.state.started, paused: c.state.paused, lockEl: document.pointerLockElement === c.canvas, frame: c.state.frame, preset: c.env.name,
    mode: document.querySelector('.ui-menu')?.dataset.mode, menuOn: !!document.querySelector('.ui-menu.on'), hudOn: !!document.querySelector('.ui-hud.on'),
    touchLayer: !!document.querySelector('.bdg-touch.on'), errors: window.__errors.length };
});
const frames = async (page, n) => {
  const f0 = await page.evaluate(() => window.__badaguan.state.frame);
  await page.waitForFunction((f) => window.__badaguan.state.frame >= f, f0 + n, { timeout: T, polling: 50 });
};
const ready = async (page, query) => {
  const t0 = Date.now();
  await page.goto(base + (query ? '?' + query : ''), { waitUntil: 'load', timeout: T });
  await page.waitForFunction('window.__ready === true', null, { timeout: T, polling: 250 });
  const f0 = await page.evaluate(() => window.__badaguan.state.frame), t1 = Date.now();
  await page.waitForTimeout(4000);
  const f1 = await page.evaluate(() => window.__badaguan.state.frame);
  const info = await page.evaluate(() => { const c = window.__badaguan; return { q: c.quality.tier, isTouch: c.quality.isTouch, pr: c.viewport.pixelRatio, modules: Object.keys(c.modules).length, errs: window.__errors }; });
  note(`loaded ?${query}`, { loadSec: +((t1 - t0) / 1000).toFixed(1), fps: +((f1 - f0) / 4).toFixed(2), ...info });
};
const watch = (page, label) => {
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.log(`[pageerror ${label}]`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log(`[console.error ${label}]`, m.text()); } else if (m.type() === 'warning' && flags.verbose) console.log(`[warn ${label}]`, m.text()); });
  return errs;
};
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name), timeout: T }); console.log(`shot ${path.relative(ROOT, path.join(OUT, name))}`); };
// hold keys for n frames; returns the displacement split into forward / right components of the heading at the start
async function hold(page, keys, n) {
  const a = await snap(page);
  for (const k of keys) await page.keyboard.down(k);
  await frames(page, n);
  const b = await snap(page);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
  const dx = b.x - a.x, dz = b.z - a.z, s = Math.sin(a.yaw), c = Math.cos(a.yaw);
  return { fwd: +(dx * s - dz * c).toFixed(2), right: +(dx * c + dz * s).toFixed(2), dist: +Math.hypot(dx, dz).toFixed(2), speed: b.speed, running: b.running, a, b };
}
const clickAt = async (page, sel) => {
  const b = await page.evaluate((s2) => { const e = document.querySelector(s2); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  if (!b) throw new Error(`no element ${sel}`);
  await page.mouse.click(b.x, b.y);
};
const waitClass = (page, sel, on, c = 'on') => page.waitForFunction(([s2, c2, o2]) => !!document.querySelector(s2)?.classList.contains(c2) === o2, [sel, c, on], { timeout: 60000, polling: 100 }).then(() => true, () => false);
const settle = async (page) => { await frames(page, 12); };
// start the walk with a real click; if pointer lock is not granted, say so and continue without it
async function start(page) {
  await clickAt(page, GO);
  await page.waitForTimeout(800);
  let s = await snap(page);
  if (!s.started) throw new Error('clicking 開始漫步 did not start the walk');
  if (!s.lockEl) {
    note('pointer lock NOT granted by this browser after the click', { paused: s.paused, mode: s.mode });
    await page.evaluate(() => { const c = window.__badaguan; c.canvas.requestPointerLock = undefined; c.app.resume(); });
    s = await snap(page);
  }
  return s;
}

// ======================================================================================================================
async function phaseFull(browser) {
  console.log('\n===== full: default page, desktop 1280x720 =====');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = watch(page, 'full');
  await ready(page, '');
  // ---- title
  const title = await page.evaluate(() => {
    const m = document.querySelector('.ui-menu'), p = document.querySelector('.ui-panel'), go = document.querySelector('button.ui-go'), r = go.getBoundingClientRect();
    const last = p.lastElementChild.getBoundingClientRect();
    return { on: m.classList.contains('on'), mode: m.dataset.mode, go: go.textContent, focus: document.activeElement === go, active: document.activeElement?.tagName + '.' + document.activeElement?.className, goBottom: Math.round(r.bottom), vh: innerHeight,
      scrollH: p.scrollHeight, clientH: p.clientHeight, lastBottom: Math.round(last.bottom), title: document.title, lang: document.documentElement.lang,
      fonts: getComputedStyle(document.querySelector('.ui-title')).fontFamily, bootHidden: getComputedStyle(document.getElementById('boot')).visibility };
  });
  check('title screen is up, start button on screen', title.on && title.mode === 'title' && title.go === '開始漫步' && title.goBottom < title.vh, title);
  check('start button has keyboard focus (Enter starts the walk)', title.focus, { active: title.active });
  check('title panel fits 1280x720 without scrolling', title.scrollH <= title.clientH + 1, { scrollH: title.scrollH, clientH: title.clientH, lastBottom: title.lastBottom });
  await shot(page, 'title-1280x720.png');
  const a0 = await snap(page); await frames(page, 2); const a1 = await snap(page);
  check('title: scene is live behind the menu (attract pan, no translation)', a1.frame > a0.frame && a1.yaw !== a0.yaw && a1.x === a0.x, { frames: a1.frame - a0.frame });
  await page.keyboard.down('KeyW'); await frames(page, 2); await page.keyboard.up('KeyW');
  check('title: W does not move the walker before the start', (await snap(page)).x === a0.x);
  // presets from the title
  await page.keyboard.press('Digit2'); await page.waitForTimeout(200);
  const pf = await snap(page);
  check('title: key 2 selects 海霧', pf.preset === 'fog', pf.preset);
  await clickAt(page, '.ui-preset:nth-child(3)'); await page.waitForTimeout(200);
  const pd = await snap(page);
  check('title: clicking the third card selects 黃昏', pd.preset === 'dusk' && (await page.evaluate(() => document.querySelector('.ui-preset:nth-child(3)').getAttribute('aria-pressed'))) === 'true', pd.preset);
  await page.keyboard.press('Digit1'); await page.waitForTimeout(200);
  // other desktop sizes (also exercises resize)
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await frames(page, 2);
    const r = await page.evaluate(() => { const c = window.__badaguan, p = document.querySelector('.ui-panel'); return { cw: c.canvas.width, ch: c.canvas.height, aspect: +c.camera.aspect.toFixed(4), pr: c.viewport.pixelRatio, scrollH: p.scrollHeight, clientH: p.clientHeight }; });
    check(`resize to ${w}x${h}: canvas + camera follow`, r.cw === Math.round(w * r.pr) && r.ch === Math.round(h * r.pr) && Math.abs(r.aspect - w / h) < 0.002, r);
    check(`title panel fits ${w}x${h} without scrolling`, r.scrollH <= r.clientH + 1, { scrollH: r.scrollH, clientH: r.clientH });
    await shot(page, `title-${w}x${h}.png`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await frames(page, 2);

  // ---- start
  await clickAt(page, GO);
  await page.waitForTimeout(800);
  let s = await snap(page);
  await page.evaluate(() => { window.__pois = []; window.__badaguan.events.on('poi', (p) => window.__pois.push(p.id)); });
  check('click 開始漫步 starts the walk', s.started, { paused: s.paused, lockEl: s.lockEl, mode: s.mode });
  const locked = s.lockEl;
  check('pointer lock granted on the start click', locked && !s.paused && s.locked, { lockEl: s.lockEl, paused: s.paused });
  if (!locked) { await page.evaluate(() => { const c = window.__badaguan; c.canvas.requestPointerLock = undefined; c.app.resume(); }); s = await snap(page); }
  check('HUD replaces the menu', s.hudOn && !s.menuOn, { hudOn: s.hudOn, menuOn: s.menuOn });
  await frames(page, 3);
  const hud = await page.evaluate(() => ({ hints: document.querySelector('.ui-hints').classList.contains('on'), hintText: document.querySelector('.ui-hints').textContent,
    map: !!document.querySelector('.ui-map.on'), compass: !!document.querySelector('.ui-compass'), crosshair: !!document.querySelector('[class*=cross],[class*=reticle]') }));
  check('key hints + minimap + compass shown on entering', hud.hints && hud.map && hud.compass, hud);
  await page.waitForTimeout(700);
  const street = await page.evaluate(() => ({ on: document.querySelector('.ui-street').classList.contains('on'), name: document.querySelector('.ui-street-name').textContent, tree: document.querySelector('.ui-street-tree').textContent }));
  check('street label names the spawn street', street.on && street.name === '居庸關路', street);
  await shot(page, 'hud-start.png');

  // ---- keys
  const w = await hold(page, ['KeyW'], 12);
  check('W walks forward along the heading', w.fwd > 0.4 && Math.abs(w.right) < 0.2 && !w.running && w.speed <= 1.75, { fwd: w.fwd, right: w.right, speed: w.speed });
  check('camera follows the ground (feet on heightAt, eye 1.65 m above)', Math.abs(w.b.y - w.b.ground) < 0.06 && Math.abs(w.b.camY - w.b.y - 1.65) < 0.03, { y: w.b.y, ground: w.b.ground, camY: w.b.camY });
  const run = await hold(page, ['ShiftLeft', 'KeyW'], 12);
  check('Shift + W is a brisk pace', run.running && run.speed > 3 && run.fwd > w.fwd, { speed: run.speed, fwd: run.fwd });
  // (the full key matrix runs in the `walk` phase, where frames are cheap)

  // ---- mouse look
  if (locked) {
    await page.mouse.move(640, 360); await page.waitForTimeout(150);   // the jump from the start button is a look movement too
    const m0 = await snap(page);
    await page.mouse.move(740, 360); await page.waitForTimeout(150);
    const m1 = await snap(page);
    check('mouse right turns right (yaw +, 100 px = 0.22 rad)', Math.abs(m1.yaw - m0.yaw - 0.22) < 0.03 && Math.abs(m1.pitch - m0.pitch) < 0.01, { dyaw: +(m1.yaw - m0.yaw).toFixed(3) });
    await page.mouse.move(740, 300); await page.waitForTimeout(150);
    const m2 = await snap(page);
    check('mouse up looks up (pitch +)', m2.pitch - m1.pitch > 0.05, { dpitch: +(m2.pitch - m1.pitch).toFixed(3) });
    // movementY is clamped to +/-200 per event: four 175 px steps down, then one 700 px jump back up (counts as -200)
    await page.mouse.move(740, 10);
    for (let i = 0; i < 4; i++) { for (const y of [185, 360, 535, 710]) await page.mouse.move(740, y); await page.mouse.move(740, 10); }
    await page.waitForTimeout(150);
    const m3 = await snap(page);
    // each loop ends on the clamped upward jump, so a pitch held at the limit reads -1.45 + 200 * 0.0022 = -1.01
    note('pitch after repeated downward sweeps (limit 1.45, expected -1.01 after the last jump back)', { pitch: m3.pitch });
    check('pitch is clamped at the limit', Math.abs(m3.pitch + 1.01) < 0.03, { pitch: m3.pitch });
    // restore a level heading down the avenue
    await page.evaluate(() => { const p = window.__badaguan.player; p.pitch = 0.05; });
    const t0 = await snap(page);
    await page.mouse.move(640, 360); await page.mouse.move(540, 360); await page.waitForTimeout(150);
    const t1 = await snap(page);
    const wt = await hold(page, ['KeyW'], 8);
    check('W follows the new heading after a mouse turn', t1.yaw < t0.yaw && wt.fwd > 0.25 && Math.abs(wt.right) < 0.25, { dyaw: +(t1.yaw - t0.yaw).toFixed(3), fwd: wt.fwd, right: wt.right });
  } else note('mouse look skipped: no pointer lock in this browser');
  // mouse drag WITHOUT lock is covered in the nolock phase

  // ---- HUD keys
  const cls = (sel, c = 'on') => page.evaluate(([s2, c2]) => !!document.querySelector(s2)?.classList.contains(c2), [sel, c]);
  await page.keyboard.press('KeyM');
  const mapOff = await waitClass(page, '.ui-map', false);
  await page.keyboard.press('KeyM');
  check('M toggles the minimap', mapOff && (await waitClass(page, '.ui-map', true)));
  await page.keyboard.press('KeyH'); await page.waitForTimeout(600);
  check('H opens the help panel', await cls('.ui-help'));
  await shot(page, 'hud-help.png');
  await page.keyboard.press('KeyH'); await page.waitForTimeout(300);
  check('H closes the help panel', !(await cls('.ui-help')));
  await page.keyboard.press('KeyP'); await page.waitForTimeout(300);
  const p1 = await snap(page);
  const toast = await page.evaluate(() => ({ on: document.querySelector('.ui-toast').classList.contains('on'), text: document.querySelector('.ui-toast').textContent }));
  check('P goes to the next preset and announces it', p1.preset === 'fog' && toast.on && toast.text.length > 1, { preset: p1.preset, toast: toast.text });
  await frames(page, 2); await shot(page, 'hud-preset-toast.png');
  await page.keyboard.press('Digit4'); await page.waitForTimeout(300);
  check('4 selects 花季', (await snap(page)).preset === 'spring');
  const fadeFrames = await page.evaluate(() => { const e = window.__badaguan.env; return { blend: e.blend ?? e.t ?? null, keys: Object.keys(e).slice(0, 20) }; });
  note('env object (for the cross-fade)', fadeFrames);
  await page.keyboard.press('Digit1'); await page.waitForTimeout(200);
  const mu0 = await page.evaluate(() => window.__badaguan.audio?.muted);
  await page.keyboard.press('KeyN'); await page.waitForTimeout(200);
  const mu1 = await page.evaluate(() => window.__badaguan.audio?.muted);
  check('N toggles mute', mu0 !== mu1, { before: mu0, after: mu1 });
  await page.keyboard.press('KeyN');
  const au0 = await page.evaluate(() => { const a = window.__badaguan.audio; return a ? { available: a.available, muted: a.muted, volume: a.volume, nodes: a.nodes } : null; });
  note('audio state while walking', au0);

  // ---- caption: a street card should appear some seconds into the walk
  const gotPoi = await page.waitForFunction(() => window.__pois.length > 0, null, { timeout: 240000, polling: 500 }).then(() => true, () => false);
  const pois = await page.evaluate(() => ({ ids: window.__pois, text: document.querySelector('.ui-caption').textContent.slice(0, 40), on: document.querySelector('.ui-caption').classList.contains('on') }));
  check('a caption card appears on the first street', gotPoi && pois.ids[0] === 'juyongguan', pois);
  if (pois.on) { await page.waitForTimeout(1500); await shot(page, 'hud-caption.png'); }

  // ---- resize while walking
  await page.setViewportSize({ width: 1000, height: 620 });
  await frames(page, 2);
  const rs = await page.evaluate(() => { const c = window.__badaguan; return { cw: c.canvas.width, ch: c.canvas.height, pr: c.viewport.pixelRatio, aspect: +c.camera.aspect.toFixed(4), lock: document.pointerLockElement === c.canvas, paused: c.state.paused }; });
  check('resize while walking keeps the walk going', rs.cw === Math.round(1000 * rs.pr) && Math.abs(rs.aspect - 1000 / 620) < 0.002 && !rs.paused, rs);
  await shot(page, 'hud-resized-1000x620.png');
  await page.setViewportSize({ width: 1280, height: 720 });
  await frames(page, 2);

  // ---- pause / resume
  await page.keyboard.down('KeyW');
  await frames(page, 3);
  await page.evaluate(() => (document.pointerLockElement ? document.exitPointerLock() : window.__badaguan.app.pause()));   // what Esc does
  await frames(page, 6);
  const pz = await snap(page);
  await frames(page, 3);
  const pz2 = await snap(page);
  check('leaving pointer lock (Esc) pauses, shows 稍歇, clears held keys', pz.paused && pz.menuOn && pz.mode === 'pause' && Math.hypot(pz2.x - pz.x, pz2.z - pz.z) < 0.05, { mode: pz.mode, speed: pz2.speed });
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(800);
  await shot(page, 'pause-1280x720.png');
  const pausePanel = await page.evaluate(() => { const p = document.querySelector('.ui-panel'); return { scrollH: p.scrollHeight, clientH: p.clientHeight, title: document.querySelector('.ui-title').textContent, go: document.querySelector('button.ui-go').textContent, where: document.querySelector('.ui-where').textContent }; });
  check('pause panel fits without scrolling', pausePanel.scrollH <= pausePanel.clientH + 1, pausePanel);
  await page.waitForTimeout(1200);
  await clickAt(page, GO);
  await page.waitForTimeout(800);
  const rz = await snap(page);
  check('繼續漫步 resumes (and re-locks the pointer)', !rz.paused && rz.hudOn && (!locked || rz.lockEl), { paused: rz.paused, lockEl: rz.lockEl });
  // Escape key itself (headless chrome may not route it to the lock; informational)
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  note('after a synthetic Escape key', await page.evaluate(() => ({ lock: !!document.pointerLockElement, paused: window.__badaguan.state.paused })));
  const end = await snap(page);
  check('no page / console errors in the full walk', errs.length === 0 && end.errors === 0, { console: errs.slice(0, 3), windowErrors: end.errors });
  await page.close();
}

// ======================================================================================================================
async function phaseCollide(browser) {
  console.log('\n===== collide: ?q=low, all modules =====');
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errs = watch(page, 'collide');
  await ready(page, 'q=low&mute=1');

  // ---- offline sweeps over the real collider set (no rendering needed) ----------------------------------------------
  const sweep = await page.evaluate(() => {
    const c = window.__badaguan, { collision, world, map } = c, W = map.WALK, R = 0.35, out = {};
    const H = world.heightAt;
    // one emulated stroll: straight intent, 0.085 m per step (1.7 m/s at dt 0.05), with the player's steep-rise block
    function walk(x, z, ux, uz, dist, stepLen = 0.085, onStep) {
      let far = 0, maxDh = 0, steep = 0, blocked = false, minH = 1e9;
      for (let d = 0; d < dist; d += stepLen) {
        collision.move(x, z, x + ux * stepLen, z + uz * stepLen, R, out);
        const dx = out.x - x, dz = out.z - z, dd = Math.hypot(dx, dz);
        blocked = blocked || out.blocked;
        if (dd > 1e-6) {
          const h0 = H(x, z), g = (H(x + (dx / dd) * 0.35, z + (dz / dd) * 0.35) - h0) / 0.35;
          if (g > 1 || g < -1) { steep++; continue; }
          const dh = Math.abs(H(out.x, out.z) - h0);
          if (dh > maxDh) maxDh = dh;
          if (onStep) onStep(x, z, out.x, out.z);
          x = out.x; z = out.z;
          const h = H(x, z); if (h < minH) minH = h;
        }
      }
      return { x, z, maxDh, steep, blocked, minH };
    }
    const inBox = (l, x, z, shrink = 0.05) => { const dx = x - l.x, dz = z - l.z, cs = Math.cos(l.rot), sn = Math.sin(l.rot); const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; return Math.abs(lx) < l.w / 2 - shrink && Math.abs(lz) < l.d / 2 - shrink; };
    const res = {};

    // (a) villas and landmarks: approach every footprint from 16 directions
    const builds = map.lots.filter((l) => l.playable !== false);   // landmarks replace their box with their own shapes
    let pen = [], tried = 0; const lmInside = {};
    for (const l of map.landmarks) for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2, r0 = Math.hypot(l.w, l.d) / 2 + 6;
      const sx = l.x + Math.cos(a) * r0, sz = l.z + Math.sin(a) * r0;
      collision.resolve(sx, sz, R, out);
      const e = walk(out.x, out.z, -Math.cos(a), -Math.sin(a), r0 + 2, 0.23);
      const dx = e.x - l.x, dz = e.z - l.z, cs = Math.cos(l.rot), sn = Math.sin(l.rot), lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const depth = Math.min(l.w / 2 - Math.abs(lx), l.d / 2 - Math.abs(lz));
      if (depth > 0.3) (lmInside[l.id] || (lmInside[l.id] = [])).push({ k, x: +e.x.toFixed(1), z: +e.z.toFixed(1), depth: +depth.toFixed(1), h: +H(e.x, e.z).toFixed(1) });
    }
    res.landmarkInside = lmInside;
    for (const l of builds) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, r0 = Math.hypot(l.w, l.d) / 2 + 3;
      const sx = l.x + Math.cos(a) * r0, sz = l.z + Math.sin(a) * r0;
      if (!collision.walkable(sx, sz)) continue;
      collision.resolve(sx, sz, R, out);
      const e = walk(out.x, out.z, -Math.cos(a), -Math.sin(a), r0 + 2, 0.23); // brisk step length
      tried++;
      if (inBox(l, e.x, e.z)) pen.push({ id: l.id, k, x: +e.x.toFixed(1), z: +e.z.toFixed(1) });
    }
    res.buildings = { count: builds.length, tried, penetrated: pen.length, sample: pen.slice(0, 5) };

    // (b) every street, walked end to end along its centre line (both kerb-side lanes too)
    const streets = [];
    for (const s of map.streets) {
      for (const off of [0, s.half - 0.6, -(s.half - 0.6), s.half + s.sidewalk * 0.5, -(s.half + s.sidewalk * 0.5)]) {
        let stuck = [], pushed = 0, n = 0, maxGrade = 0, outside = 0;
        for (let i = 0; i < s.pts.length - 1; i++) {
          const ax = s.pts[i][0], az = s.pts[i][1], bx = s.pts[i + 1][0], bz = s.pts[i + 1][1];
          const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
          for (let d = 0; d < L; d += 0.5) {
            const x = ax + ux * d + nx * off, z = az + uz * d + nz * off;
            if (x < W.minX || x > W.maxX || z < W.minZ) { outside++; continue; }
            n++;
            collision.resolve(x, z, R, out);
            const disp = Math.hypot(out.x - x, out.z - z);
            // (the staged figures of MAP.figures, e.g. the wedding couple and its photographer on 紫荊關路, are meant to stand in the road)
            if (disp > 0.01 && !map.figures.some((f) => Math.hypot(f.x - x, f.z - z) < 8)) { pushed++; if (stuck.length < 4 && off === 0) stuck.push({ x: +x.toFixed(1), z: +z.toFixed(1), disp: +disp.toFixed(2) }); }
            const g = Math.abs(H(x + ux * 0.35, z + uz * 0.35) - H(x, z)) / 0.35;
            if (g > maxGrade) maxGrade = g;
          }
        }
        streets.push({ id: s.id, off: +off.toFixed(1), n, outside, pushed, maxGrade: +maxGrade.toFixed(2), stuck });
      }
    }
    res.streets = streets;

    // (c) the sea: walk due south (and along each stair axis) from the promenade / sand / reef
    const sea = [];
    for (let x = -240; x <= 240; x += 12) {
      // find the first walkable dry point walking down from z = 40
      let z0 = null;
      for (let z = 40; z < 260; z += 1) if (H(x, z) > 0.2 && H(x, z + 6) < 0.2) { z0 = z; break; }
      if (z0 == null) continue;
      collision.resolve(x, z0, R, out);
      const e = walk(out.x, out.z, 0, 1, 260, 0.23);
      sea.push({ x, z0, endZ: +e.z.toFixed(1), endH: +H(e.x, e.z).toFixed(2), minH: +e.minH.toFixed(2), steep: e.steep });
    }
    res.sea = { n: sea.length, deepest: Math.min(...sea.map((q) => q.minH)), anyBelowWade: sea.filter((q) => q.minH < -0.46).length, sample: sea.filter((_, i) => i % 5 === 0) };

    // (d) bounds: run in 32 directions from 30 start points for 700 m
    let leak = 0, worst = null; const starts = [];
    for (const s of map.streets) for (const f of [0.1, 0.5, 0.9]) { const p = s.pts[Math.floor(f * (s.pts.length - 1))]; if (p[0] > W.minX + 1 && p[0] < W.maxX - 1 && p[1] > W.minZ + 1) starts.push(p); }
    let wallCross = 0; const crossSample = [];
    const segs = [];
    for (const w of map.walls) for (let i = 0; i < w.pts.length - 1; i++) segs.push([w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1], w.id]);
    const cross = (ax, az, bx, bz, s) => {
      const d1x = bx - ax, d1z = bz - az, d2x = s[2] - s[0], d2z = s[3] - s[1], den = d1x * d2z - d1z * d2x;
      if (Math.abs(den) < 1e-12) return false;
      const t = ((s[0] - ax) * d2z - (s[1] - az) * d2x) / den, u = ((s[0] - ax) * d1z - (s[1] - az) * d1x) / den;
      return t >= 0 && t <= 1 && u >= 0.02 && u <= 0.98;
    };
    let maxDh = 0, dhAt = null, insideEnd = 0;
    for (const p of starts) for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2 + 0.05;
      collision.resolve(p[0], p[1], R, out);
      const sx = out.x, sz = out.z;
      const e = walk(sx, sz, Math.cos(a), Math.sin(a), 700, 0.23, (x0, z0, x1, z1) => {
        for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (Math.min(s[0], s[2]) - 1 > Math.max(x0, x1) || Math.max(s[0], s[2]) + 1 < Math.min(x0, x1)) continue; if (cross(x0, z0, x1, z1, s)) { wallCross++; if (crossSample.length < 6) crossSample.push({ wall: s[4], x: +x1.toFixed(1), z: +z1.toFixed(1) }); } }
      });
      if (e.x < W.minX - 0.01 || e.x > W.maxX + 0.01 || e.z < W.minZ - 0.01 || H(e.x, e.z) < -0.46) { leak++; worst = { x: e.x, z: e.z, h: H(e.x, e.z) }; }
      if (e.maxDh > maxDh) { maxDh = e.maxDh; dhAt = { from: [+sx.toFixed(0), +sz.toFixed(0)], dir: k }; }
      for (const l of builds) if (inBox(l, e.x, e.z)) insideEnd++;
    }
    res.bounds = { starts: starts.length, walks: starts.length * 32, leaks: leak, worst, wallCrossings: wallCross, crossSample, endedInsideBuilding: insideEnd, maxHeightJumpPerBriskStep: +maxDh.toFixed(2), dhAt };

    // (e) trees and lamps: can a walker stand inside a trunk?
    let inTrunk = 0;
    for (const t of map.trees) { collision.resolve(t.x, t.z, R, out); if (Math.hypot(out.x - t.x, out.z - t.z) < t.trunk) inTrunk++; }
    res.trees = { n: map.trees.length, standableInsideTrunk: inTrunk };

    // (f) landmark approach: from the gate toward the footprint, how close to the wall line does one get, and is the gate open
    res.landmarks = map.landmarks.map((l) => {
      const g = l.gate, ux = l.x - g.x, uz = l.z - g.z, L = Math.hypot(ux, uz);
      const st = world.nearestStreet(g.x, g.z, {});
      // start on the street centre nearest the gate, walk toward the building
      let sx = g.x, sz = g.z;
      if (st) { const s = st.street, i = st.i, ax = s.pts[i][0], az = s.pts[i][1], bx = s.pts[i + 1][0], bz = s.pts[i + 1][1], l2 = (bx - ax) ** 2 + (bz - az) ** 2, t = Math.max(0, Math.min(1, ((g.x - ax) * (bx - ax) + (g.z - az) * (bz - az)) / l2)); sx = ax + (bx - ax) * t; sz = az + (bz - az) * t; }
      const vx = l.x - sx, vz = l.z - sz, VL = Math.hypot(vx, vz);
      const e = walk(sx, sz, vx / VL, vz / VL, VL + 5);
      const half = Math.min(l.w, l.d) / 2;
      return { id: l.id, gateOpen: g.open, startToCentre: +VL.toFixed(1), endToCentre: +Math.hypot(e.x - l.x, e.z - l.z).toFixed(1), halfMin: half, steepStops: e.steep, endH: +H(e.x, e.z).toFixed(2), floorY: +l.floorY.toFixed(2) };
    });
    // (g) beach stairs: walk down each flight from the promenade
    res.stairs = map.promenade.steps.map((S) => {
      const e = walk(S.x, S.z, S.fx, S.fz, 14);
      return { x: S.x, z: S.z, endAlong: +((e.x - S.x) * S.fx + (e.z - S.z) * S.fz).toFixed(1), topH: +H(S.x, S.z).toFixed(2), endH: +H(e.x, e.z).toFixed(2), steep: e.steep, maxDh: +e.maxDh.toFixed(2) };
    });
    // and back up
    res.stairsUp = map.promenade.steps.map((S) => {
      const bx = S.x + S.fx * 12, bz = S.z + S.fz * 12;
      const e = walk(bx, bz, -S.fx, -S.fz, 14);
      return { endAlong: +((e.x - S.x) * S.fx + (e.z - S.z) * S.fz).toFixed(1), steep: e.steep, endH: +H(e.x, e.z).toFixed(2) };
    });
    // (h) boardwalk: walk its whole length, and try to step off sideways at a few points
    {
      const b = map.boardwalk; let pushed = 0, n = 0, maxG = 0, off = [];
      for (let i = 0; i < b.pts.length - 1; i++) {
        const ax = b.pts[i][0], az = b.pts[i][1], bx = b.pts[i + 1][0], bz = b.pts[i + 1][1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let d = 0; d < L; d += 0.5) { const x = ax + ux * d, z = az + uz * d; n++; collision.resolve(x, z, R, out); if (Math.hypot(out.x - x, out.z - z) > 0.01) pushed++; const g = Math.abs(H(x + ux * 0.35, z + uz * 0.35) - H(x, z)) / 0.35; if (g > maxG) maxG = g; }
        if (i % 6 === 3) for (const sg of [-1, 1]) { const e = walk(ax, az, -uz * sg, ux * sg, 8); off.push({ x: +ax.toFixed(0), z: +az.toFixed(0), side: sg, left: +Math.hypot(e.x - ax, e.z - az).toFixed(1), surf: world.surfaceAt(e.x, e.z), h: +H(e.x, e.z).toFixed(2), steep: e.steep }); }
      }
      res.boardwalk = { n, pushed, maxGrade: +maxG.toFixed(2), width: b.width, stepOff: off };
    }
    // (i) reachability: flood fill on a 0.5 m grid from the spawn, moving with the real collision.move and the steep rule
    {
      const st = 0.5, X0 = W.minX, Z0 = W.minZ, NX = Math.round((W.maxX - W.minX) / st) + 1, NZ = Math.round((230 - W.minZ) / st) + 1;
      const seen = new Uint8Array(NX * NZ), q = new Int32Array(NX * NZ);
      const sp = map.spawn, si = Math.round((sp.x - X0) / st), sj = Math.round((sp.z - Z0) / st);
      let head = 0, tail = 0; q[tail++] = sj * NX + si; seen[sj * NX + si] = 1;
      const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (head < tail) {
        const c0 = q[head++], i = c0 % NX, j = (c0 / NX) | 0, x = X0 + i * st, z = Z0 + j * st, h0 = H(x, z);
        for (const [di, dj] of D) {
          const i2 = i + di, j2 = j + dj;
          if (i2 < 0 || j2 < 0 || i2 >= NX || j2 >= NZ || seen[j2 * NX + i2]) continue;
          const tx = X0 + i2 * st, tz = Z0 + j2 * st;
          collision.move(x, z, tx, tz, R, out);
          if (Math.hypot(out.x - tx, out.z - tz) > 0.05) continue;
          const g = (H(x + di * 0.35, z + dj * 0.35) - h0) / 0.35;
          if (g > 1 || g < -1) continue;
          seen[j2 * NX + i2] = 1; q[tail++] = j2 * NX + i2;
        }
      }
      const near = (x, z, r) => { const n = Math.ceil(r / st); const i0 = Math.round((x - X0) / st), j0 = Math.round((z - Z0) / st);
        for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) { const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < NX && j < NZ && seen[j * NX + i] && Math.hypot(di, dj) * st <= r) return true; } return false; };
      const targets = [];
      for (const s of map.streets) for (const f of [0.08, 0.3, 0.5, 0.7, 0.92]) { const p = s.pts[Math.floor(f * (s.pts.length - 1))]; if (p[0] > W.minX + 2 && p[0] < W.maxX - 2 && p[1] > W.minZ + 2) targets.push([`street ${s.id} @${f}`, p[0], p[1], 1.5]); }
      for (const pth of map.paths) { const p = pth.pts[Math.floor(pth.pts.length / 2)]; if (p[0] > W.minX + 2 && p[0] < W.maxX - 2 && p[1] > W.minZ + 2) targets.push([`path ${pth.id || ''}`, p[0], p[1], 2]); }
      for (const f of [0.05, 0.5, 0.95]) { const p = map.promenade.pts[Math.floor(f * (map.promenade.pts.length - 1))]; targets.push([`promenade @${f}`, Math.max(W.minX + 2, Math.min(W.maxX - 2, p[0])), p[1], 3]); }
      for (const f of [0.05, 0.5, 0.95]) { const p = map.boardwalk.pts[Math.floor(f * (map.boardwalk.pts.length - 1))]; targets.push([`boardwalk @${f}`, p[0], p[1], 1.5]); }
      map.promenade.steps.forEach((S, i) => targets.push([`sand below stair ${i}`, S.x + S.fx * 11, S.z + S.fz * 11, 1.5]));
      for (const p of map.pois) if (p.kind === 'place') targets.push([`poi ${p.id} (within its radius)`, p.x, p.z, p.r]);
      for (const l of map.landmarks) { const g = l.gate, ux = l.x - g.x, uz = l.z - g.z, L = Math.hypot(ux, uz); targets.push([`inside the gate of ${l.id}`, g.x + (ux / L) * 3, g.z + (uz / L) * 3, 1.5]);
        targets.push([`within 2.5 m of the ${l.id} plan rectangle`, l.x, l.z, Math.hypot(l.w, l.d) / 2 + 2.5]); }
      for (const pk of map.parks) { let cx = 0, cz = 0; for (const p of pk.poly) { cx += p[0]; cz += p[1]; } targets.push([`park ${pk.id}`, cx / pk.poly.length, cz / pk.poly.length, 3]); }
      for (const f of map.figures) targets.push([`figure ${f.id} (to within 2 m)`, f.x, f.z, 2]);
      const surf = {};
      for (let k = 0; k < tail; k++) { if (k % 7) continue; const c0 = q[k], sname = world.surfaceAt(X0 + (c0 % NX) * st, Z0 + ((c0 / NX) | 0) * st); surf[sname] = (surf[sname] || 0) + 1; }
      for (const k in surf) surf[k] = Math.round(surf[k] * 7 * st * st);
      res.reach = { cells: tail, areaM2: Math.round(tail * st * st), bySurfaceM2: surf, targets: targets.length, unreachable: targets.filter((t) => !near(t[1], t[2], t[3])).map((t) => `${t[0]} (${t[1].toFixed(0)},${t[2].toFixed(0)})`) };
    }
    res.colliders = collision.all.length;
    return res;
  });
  console.log('sweep buildings', JSON.stringify(sweep.buildings));
  check('no walk ends inside a villa footprint', sweep.buildings.penetrated === 0 && sweep.bounds.endedInsideBuilding === 0, { penetrated: sweep.buildings.penetrated, ended: sweep.bounds.endedInsideBuilding });
  note('walks that end more than 0.3 m inside a LANDMARK plan rectangle (they use their own collider shapes; inspect visually)', sweep.landmarkInside);
  const centre = sweep.streets.filter((s) => s.off === 0), lanes = sweep.streets.filter((s) => s.off !== 0);
  console.log('sweep streets (centre)', JSON.stringify(centre));
  console.log('sweep streets (lanes/sidewalks, pushed>0)', JSON.stringify(lanes.filter((s) => s.pushed > 0).map((s) => ({ id: s.id, off: s.off, pushed: s.pushed, n: s.n }))));
  check('street centre lines are free of colliders and never too steep to walk', centre.every((s) => s.pushed === 0 && s.maxGrade < 1), centre.filter((s) => s.pushed || s.maxGrade >= 1));
  console.log('sweep sea', JSON.stringify(sweep.sea));
  check('the sea stops the walker at wading depth (0.45 m)', sweep.sea.anyBelowWade === 0, { deepest: sweep.sea.deepest });
  console.log('sweep bounds', JSON.stringify(sweep.bounds));
  check('no straight run leaves the playable bounds', sweep.bounds.leaks === 0, sweep.bounds.worst || '');
  check('no straight run crosses a garden wall', sweep.bounds.wallCrossings === 0, { crossings: sweep.bounds.wallCrossings, sample: sweep.bounds.crossSample });
  check('tree trunks are solid', sweep.trees.standableInsideTrunk === 0, sweep.trees);
  console.log('sweep landmarks', JSON.stringify(sweep.landmarks));
  console.log('sweep stairs down', JSON.stringify(sweep.stairs));
  console.log('sweep stairs up', JSON.stringify(sweep.stairsUp));
  check('all four beach stairs can be walked down and back up', sweep.stairs.every((s) => s.endAlong > 9 && s.endH < s.topH - 1.5) && sweep.stairsUp.every((s) => s.endAlong < 1.5), '');
  console.log('sweep boardwalk', JSON.stringify(sweep.boardwalk));
  check('boardwalk centre line is walkable end to end', sweep.boardwalk.pushed === 0 && sweep.boardwalk.maxGrade < 1, { pushed: sweep.boardwalk.pushed, maxGrade: sweep.boardwalk.maxGrade });
  console.log('sweep reach', JSON.stringify(sweep.reach));
  check('every street, the promenade, the beach, the boardwalk, the parks and every landmark gate can be reached on foot from the spawn', sweep.reach.unreachable.length === 0, sweep.reach.unreachable);
  note('max ground height change in one brisk step (0.23 m) over all runs', { dh: sweep.bounds.maxHeightJumpPerBriskStep, at: sweep.bounds.dhAt });

  check('no page / console errors while loading the full scene', errs.length === 0, errs.slice(0, 3));
  await page.close();
}

// ======================================================================================================================
async function phaseWalk(browser) {
  console.log('\n===== walk: light scene, 640x360, real keys =====');
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const errs = watch(page, 'walk');
  await ready(page, LITE);
  await start(page);
  // ---- key matrix
  {
    const w = await hold(page, ['KeyW'], 24);
    check('W walks forward along the heading', w.fwd > 1.0 && Math.abs(w.right) < 0.25 && !w.running && w.speed <= 1.75, { fwd: w.fwd, right: w.right, speed: w.speed });
    await settle(page);
    const sb = await hold(page, ['KeyS'], 20);
    check('S walks backward', sb.fwd < -0.8 && Math.abs(sb.right) < 0.25, { fwd: sb.fwd, right: sb.right });
    await settle(page);
    const ka = await hold(page, ['KeyA'], 20);
    check('A strafes left', ka.right < -0.8 && Math.abs(ka.fwd) < 0.25, { fwd: ka.fwd, right: ka.right });
    await settle(page);
    const kd = await hold(page, ['KeyD'], 20);
    check('D strafes right', kd.right > 0.8 && Math.abs(kd.fwd) < 0.25, { fwd: kd.fwd, right: kd.right });
    await settle(page);
    const au = await hold(page, ['ArrowUp'], 20);
    check('ArrowUp walks forward', au.fwd > 0.8, { fwd: au.fwd, right: au.right });
    await settle(page);
    const al = await hold(page, ['ArrowLeft'], 20);
    await settle(page);
    const ar = await hold(page, ['ArrowRight'], 20);
    check('ArrowLeft / ArrowRight strafe', al.right < -0.8 && ar.right > 0.8, { left: al.right, right: ar.right });
    await settle(page);
    const ad = await hold(page, ['ArrowDown'], 20);
    check('ArrowDown walks backward', ad.fwd < -0.8, { fwd: ad.fwd });
    await settle(page);
    const diag = await hold(page, ['KeyW', 'KeyD'], 20);
    check('W + D walks diagonally at the same speed (normalised)', diag.fwd > 0.5 && diag.right > 0.5 && diag.speed <= 1.75, { fwd: diag.fwd, right: diag.right, speed: diag.speed });
    await settle(page);
    const run = await hold(page, ['ShiftLeft', 'KeyW'], 30);
    check('Shift + W is a brisk pace (faster than the stroll)', run.running && run.speed > 3 && run.speed <= 4.65 && run.fwd > w.fwd, { speed: run.speed, fwd: run.fwd });
    await settle(page);
    const idle = await snap(page);
    check('releasing the keys stops the walker', !idle.moving && idle.speed < 0.05, { speed: idle.speed });
    // keys that a first-time visitor will try
    const sp0 = await snap(page);
    await page.keyboard.press('Space'); await frames(page, 3);
    const sp1 = await snap(page);
    note('Space (jump) while walking', { dy: +(sp1.camY - sp0.camY).toFixed(3), paused: sp1.paused });
  }
  const tp = (x, z, yaw, pitch = 0) => page.evaluate(([x2, z2, y2, p2]) => window.__setView(x2, z2, y2, p2), [x, z, yaw, pitch]);
  const trackWalk = async (keys, n, every = 10) => {
    const pts = [await snap(page)];
    for (const k of keys) await page.keyboard.down(k);
    for (let i = 0; i < n; i += every) { await frames(page, every); pts.push(await snap(page)); }
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
    return pts;
  };
  // tree: walk straight into the first street tree
  const tree = await page.evaluate(() => { const t = window.__badaguan.map.trees[0]; return { x: t.x, z: t.z, trunk: t.trunk }; });
  await tp(tree.x - 2.5, tree.z, 90);
  let pts = await trackWalk(['KeyW'], 60);
  let minD = Math.min(...pts.map((p) => Math.hypot(p.x - tree.x, p.z - tree.z)));
  check('W into a tree trunk: stopped / deflected at the bark', minD >= tree.trunk + 0.35 && pts.at(-1).x !== pts[0].x, { minDist: +minD.toFixed(2), trunk: +tree.trunk.toFixed(2), end: [pts.at(-1).x, pts.at(-1).z] });
  // garden wall south of the spawn (wall0 runs from (-183.4,-50.3) to (-151.4,-51.6))
  await tp(-170, -46, 0);
  pts = await trackWalk(['ShiftLeft', 'KeyW'], 50);
  const minZ = Math.min(...pts.map((p) => p.z));
  check('Shift+W into a garden wall: does not pass', minZ > -50.9 && minZ < -48, { minZ, end: pts.at(-1) && [pts.at(-1).x, pts.at(-1).z], speed: pts.at(-1).speed });
  // villa: nearest playable lot to the spawn, approached from its gate side
  const lot = await page.evaluate(() => { const c = window.__badaguan, m = c.map; const l = m.lots.filter((q) => q.playable !== false).sort((a, b) => Math.hypot(a.x + 150, a.z + 30) - Math.hypot(b.x + 150, b.z + 30))[0];
    const g = l.gate; return { id: l.id, x: l.x, z: l.z, w: l.w, d: l.d, rot: l.rot, gx: g ? g.x : null, gz: g ? g.z : null, open: g ? g.open : null }; });
  note('nearest villa lot', lot);
  {
    // start 2.5 m outside the footprint on the gate side (inside the garden), face the house
    const ux = (lot.gx ?? lot.x + 10) - lot.x, uz = (lot.gz ?? lot.z) - lot.z, L = Math.hypot(ux, uz), r0 = Math.hypot(lot.w, lot.d) / 2 + 2.5;
    const sx = lot.x + (ux / L) * r0, sz = lot.z + (uz / L) * r0, yaw = (Math.atan2(-ux, uz) * 180) / Math.PI;
    await tp(sx, sz, yaw);
    pts = await trackWalk(['ShiftLeft', 'KeyW'], 60);
    const inside = pts.filter((p) => { const dx = p.x - lot.x, dz = p.z - lot.z, cs = Math.cos(lot.rot), sn = Math.sin(lot.rot); return Math.abs(dx * cs - dz * sn) < lot.w / 2 - 0.05 && Math.abs(dx * sn + dz * cs) < lot.d / 2 - 0.05; }).length;
    check('Shift+W into a villa: never inside the footprint', inside === 0, { lot: lot.id, start: [+sx.toFixed(1), +sz.toFixed(1)], end: [pts.at(-1).x, pts.at(-1).z] });
  }
  // sea: from the sand straight south
  await tp(-60, 104, 180);
  pts = await trackWalk(['ShiftLeft', 'KeyW'], 180, 20);
  const last = pts.at(-1), prev = pts.at(-2);
  check('Shift+W into the sea: wades, then stops at 0.45 m depth', Math.min(...pts.map((p) => p.ground)) >= -0.47 && Math.abs(last.z - prev.z) < 0.3 && last.ground < -0.2, { slideX: +(last.x - prev.x).toFixed(2), endZ: last.z, ground: last.ground, y: last.y, camY: last.camY, surface: last.surface });
  // terrain following: downhill on 紫荊關路 (cedar view)
  await tp(133, -100, 192);
  pts = await trackWalk(['ShiftLeft', 'KeyW'], 80, 10);
  const follow = Math.max(...pts.slice(1).map((p) => Math.abs(p.y - p.ground))), drop = pts[0].ground - pts.at(-1).ground;
  check('camera follows the terrain on a slope', follow < 0.12 && Math.abs(drop) > 0.3 && pts.every((p) => Math.abs(p.camY - p.y - 1.65) < 0.03), { maxLag: +follow.toFixed(3), heightChange: +drop.toFixed(2), dist: +Math.hypot(pts.at(-1).x - pts[0].x, pts.at(-1).z - pts[0].z).toFixed(1) });
  // map edge: west end of the spawn street
  await tp(-243, -44.8, 270);
  pts = await trackWalk(['ShiftLeft', 'KeyW'], 50, 10);
  const edge = pts.at(-1);
  const toast = await page.evaluate(() => ({ on: document.querySelector('.ui-toast').classList.contains('on'), text: document.querySelector('.ui-toast').textContent }));
  check('map edge: clamped at WALK.minX and announced', edge.x >= -246.001 && edge.x < -245.5 && toast.text.includes('八大關之外'), { x: edge.x, toast });
  await tp(0, -219, 0);
  pts = await trackWalk(['ShiftLeft', 'KeyW'], 40, 10);
  check('map edge: clamped at WALK.minZ', pts.at(-1).z >= -221.001, { z: pts.at(-1).z });
  await tp(244, -100, 90);
  pts = await trackWalk(['ShiftLeft', 'KeyW'], 40, 10);
  check('map edge: clamped at WALK.maxX', pts.at(-1).x <= 246.001, { x: pts.at(-1).x });
  check('no page / console errors in the collision walk', errs.length === 0 && (await snap(page)).errors === 0, errs.slice(0, 3));
  await page.close();
}

// ======================================================================================================================
async function phaseNoLock(browser) {
  console.log('\n===== nolock: pointer lock refused / missing =====');
  for (const variant of ['rejects', 'missing']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript((v) => {
      if (v === 'rejects') HTMLCanvasElement.prototype.requestPointerLock = Element.prototype.requestPointerLock = function () { return Promise.reject(new DOMException('The root document of this element is not valid for pointer lock.', 'SecurityError')); };
      else { Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined, configurable: true, writable: true }); }
    }, variant);
    const page = await context.newPage();
    const errs = watch(page, `nolock-${variant}`);
    await ready(page, LITE);
    if (variant === 'missing') {
      const act = await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className);
      await page.keyboard.press('Enter'); await page.waitForTimeout(600);
      const k = await snap(page);
      check('[missing] Enter on the title starts the walk (keyboard only)', k.started, { activeElement: act });
      if (k.started) {
        await page.keyboard.press('Escape'); await page.waitForTimeout(500);
        const e = await snap(page);
        check('[missing] Esc pauses when there is no pointer lock to drop', e.paused, { paused: e.paused });
        if (!e.paused) await page.evaluate(() => window.__badaguan.app.pause());
        await page.waitForTimeout(300);
      }
    }
    await clickAt(page, GO);
    await page.waitForTimeout(900);
    const s1 = await snap(page);
    note(`[${variant}] after the first click on 開始漫步`, { started: s1.started, paused: s1.paused, mode: s1.mode, menuOn: s1.menuOn });
    let s = s1;
    for (let i = 0; i < 2 && s.paused; i++) { await page.waitForTimeout(1500); await clickAt(page, GO); await page.waitForTimeout(900); s = await snap(page); }
    check(`[${variant}] the walk is enterable when pointer lock is unavailable`, s.started && !s.paused, { paused: s.paused, mode: s.mode });
    if (s.paused) {
      const hint = await page.evaluate(() => document.querySelector('.ui-panel').innerText.replace(/\s+/g, ' ').slice(0, 160));
      note(`[${variant}] stuck on the pause panel; panel text`, hint);
    } else {
      const w = await hold(page, ['KeyW'], 20);
      check(`[${variant}] W walks`, w.fwd > 0.8, { fwd: w.fwd });
    }
    // drag-to-look fallback?
    const y0 = (await snap(page)).yaw, p0 = (await snap(page)).pitch;
    await page.mouse.move(700, 300); await page.mouse.down(); await page.mouse.move(820, 330, { steps: 6 }); await page.mouse.move(900, 380, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const y1 = await snap(page);
    check(`[${variant}] mouse drag looks around without pointer lock (fallback)`, !y1.paused && Math.abs(y1.yaw - y0) > 0.05, { paused: y1.paused, dyaw: +(y1.yaw - y0).toFixed(3), dpitch: +(y1.pitch - p0).toFixed(3) });
    check(`[${variant}] no errors`, errs.length === 0 && y1.errors === 0, errs.slice(0, 3));
    await shot(page, `nolock-${variant}.png`);
    await context.close();
  }
}

// ======================================================================================================================
async function phaseFade(browser) {
  console.log('\n===== fade: preset cross-fade, ?q=low, all modules =====');
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errs = watch(page, 'fade');
  await ready(page, 'q=low&mute=1&uitest=play&view=princess');
  const env = () => page.evaluate(() => { const c = window.__badaguan, e = c.env; return { name: e.name, blend: +e.blend.toFixed(3), transitioning: e.transitioning, exposure: +c.renderer.toneMappingExposure.toFixed(3),
    sun: +(c.lights?.sun?.intensity ?? -1).toFixed(2), hemi: +(c.lights?.hemi?.intensity ?? -1).toFixed(2), fog: +c.scene.fog.near.toFixed(5), frame: c.state.frame }; });
  const until = (b) => page.waitForFunction((b2) => { const e = window.__badaguan.env; return !e.transitioning || e.blend >= b2; }, b, { timeout: T, polling: 100 });
  await frames(page, 3);
  note('autumn', await env()); await shot(page, 'fade-0-autumn.png');
  await page.keyboard.press('Digit3');
  await until(0.5); await frames(page, 1);
  const mid = await env(); note('autumn -> dusk, middle', mid); await shot(page, 'fade-1-autumn-dusk-mid.png');
  await until(1); await frames(page, 12);
  const dusk = await env(); note('dusk', dusk); await shot(page, 'fade-2-dusk.png');
  check('key 3 cross-fades to 黃昏 and finishes', dusk.name === 'dusk' && !dusk.transitioning && mid.blend >= 0.5 && mid.blend < 1, { mid: mid.blend });
  await page.keyboard.press('Digit2');
  await until(0.5); await frames(page, 1);
  note('dusk -> fog, middle', await env()); await shot(page, 'fade-3-dusk-fog-mid.png');
  await until(1); await frames(page, 12);
  const fog = await env(); note('fog', fog); await shot(page, 'fade-4-fog.png');
  check('key 2 cross-fades to 海霧 and finishes', fog.name === 'fog' && !fog.transitioning);
  // three presses within one frame: must not pop
  await page.keyboard.press('Digit4'); await page.keyboard.press('Digit3'); await page.keyboard.press('Digit1');
  await frames(page, 2);
  const rapid = await env(); note('fog, then 4 3 1 pressed at once, 2 frames later', rapid); await shot(page, 'fade-5-rapid-2-frames-later.png');
  check('rapid presses keep the live values continuous (no jump)', Math.abs(rapid.exposure - fog.exposure) < 0.08 && Math.abs(rapid.sun - fog.sun) < 0.3, { before: fog, after: rapid });
  await until(1); await frames(page, 12);
  note('autumn again', await env()); await shot(page, 'fade-6-autumn-again.png');
  check('no page / console errors during the cross-fades', errs.length === 0, errs.slice(0, 3));
  await page.close();
}

// ======================================================================================================================
async function phaseTouch(browser) {
  console.log('\n===== touch: phone portrait 390x844 and landscape 844x390 =====');
  for (const [w, h, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const page = await context.newPage();
    const errs = watch(page, `touch-${tag}`);
    await ready(page, '');
    const t = await page.evaluate(() => { const p = document.querySelector('.ui-panel'), go = document.querySelector('button.ui-go').getBoundingClientRect(), ti = document.querySelector('.ui-title').getBoundingClientRect();
      return { scrollH: p.scrollHeight, clientH: p.clientHeight, goTop: Math.round(go.top), goBottom: Math.round(go.bottom), vh: innerHeight, vw: innerWidth, titleRight: Math.round(ti.right), docW: document.documentElement.scrollWidth,
        keys: [...document.querySelectorAll('.ui-keys li')].map((li) => li.textContent).join(' | '), sensHidden: [...document.querySelectorAll('.ui-set')].some((e) => e.hidden && e.textContent.includes('靈敏度')) }; });
    note(`[${tag}] title metrics`, t);
    check(`[${tag}] 開始漫步 is visible without scrolling`, t.goBottom <= t.vh && t.goTop >= 0, { goTop: t.goTop, goBottom: t.goBottom, vh: t.vh });
    check(`[${tag}] title shows touch instructions, not keyboard ones`, /拖曳/.test(t.keys) && !/WASD/.test(t.keys), t.keys);
    await shot(page, `touch-${tag}-title.png`);
    await page.evaluate(() => { const p = document.querySelector('.ui-panel'); p.scrollTop = p.scrollHeight; });
    await page.waitForTimeout(200);
    if (t.scrollH > t.clientH + 1) await shot(page, `touch-${tag}-title-scrolled.png`);
    await page.evaluate(() => { document.querySelector('.ui-panel').scrollTop = 0; });
    const box = await page.locator(GO).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(900);
    const s = await snap(page);
    check(`[${tag}] tap starts the walk with the touch layer (no pointer lock)`, s.started && !s.paused && s.touchLayer && !s.lockEl, { started: s.started, paused: s.paused, touchLayer: s.touchLayer });
    await frames(page, 2);
    const lay = await page.evaluate(() => {
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
      return { stick: r('.bdg-stick'), hints: r('.ui-hints'), stack: r('.ui-stack'), map: document.querySelector('.ui-map.on') ? r('.ui-map') : null, tbtns: r('.ui-tbtns'), compass: r('.ui-compass'), street: r('.ui-street'),
        hintText: document.querySelector('.ui-hints').textContent, btns: [...document.querySelectorAll('.ui-tbtn')].map((b) => b.textContent + ':' + b.getAttribute('aria-label')) };
    });
    note(`[${tag}] HUD layout`, lay);
    check(`[${tag}] touch buttons 時 / 圖 / 停 are present`, lay.btns.length === 3 && lay.tbtns && lay.tbtns[2] <= w && lay.tbtns[0] >= 0, lay.btns);
    await shot(page, `touch-${tag}-hud.png`);
    const cdp = await context.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
    const sx = Math.round(w * 0.22), sy = Math.round(h * 0.72), lx = Math.round(w * 0.75), ly = Math.round(h * 0.45);
    await touch('touchStart', [[sx, sy, 1]]);
    await touch('touchMove', [[sx, sy - 30, 1]]);
    await frames(page, 10);
    const t1 = await snap(page);
    check(`[${tag}] left stick half-way strolls forward`, t1.moving && !t1.running && Math.hypot(t1.x - s.x, t1.z - s.z) > 0.3, { speed: t1.speed, moved: +Math.hypot(t1.x - s.x, t1.z - s.z).toFixed(2) });
    await touch('touchMove', [[sx, sy - 70, 1]]);
    await frames(page, 12);
    await touch('touchStart', [[sx, sy - 70, 1], [lx, ly, 2]]);
    await touch('touchMove', [[sx, sy - 70, 1], [lx + 40, ly - 10, 2]]);
    await touch('touchMove', [[sx, sy - 70, 1], [lx + 80, ly - 20, 2]]);
    await frames(page, 3);
    const t2 = await snap(page);
    check(`[${tag}] stick at the rim is brisk`, t2.running && t2.speed > 2.5, { speed: t2.speed });
    check(`[${tag}] right-side drag looks (while walking, second finger)`, Math.abs(t2.yaw - t1.yaw - 0.32) < 0.03 && Math.abs(t2.pitch - t1.pitch - 0.08) < 0.03, { dyaw: +(t2.yaw - t1.yaw).toFixed(3), dpitch: +(t2.pitch - t1.pitch).toFixed(3) });
    await shot(page, `touch-${tag}-walking.png`);
    await touch('touchEnd', []);
    await frames(page, 14);
    const t3 = await snap(page);
    check(`[${tag}] releasing stops`, !t3.moving && t3.speed < 0.05, { speed: t3.speed });
    // corner buttons
    const tapBtn = async (i) => { const b = await page.locator('.ui-tbtn').nth(i).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500); };
    const m0 = await page.evaluate(() => !!document.querySelector('.ui-map.on'));
    await tapBtn(1);
    const m1 = await waitClass(page, '.ui-map', !m0);
    check(`[${tag}] 圖 toggles the minimap`, m1, { before: m0 });
    if (m0) { await tapBtn(1); await waitClass(page, '.ui-map', true); }
    await page.waitForTimeout(600);
    const lay2 = await page.evaluate(() => { const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; return { map: r('.ui-map'), stick: r('.bdg-stick'), stack: r('.ui-stack'), toast: r('.ui-toast') }; });
    note(`[${tag}] layout with the map open`, lay2);
    await shot(page, `touch-${tag}-map.png`);
    const pr0 = (await snap(page)).preset;
    await tapBtn(0);
    const pr1 = (await snap(page)).preset;
    check(`[${tag}] 時 switches to the next preset`, pr0 !== pr1, { from: pr0, to: pr1 });
    await frames(page, 2);
    await shot(page, `touch-${tag}-preset.png`);
    // force a caption to see where the card sits against the stick and the map
    const capOk = await page.evaluate(() => { const c = window.__badaguan; c.player.teleport(-150, -47, 0, 5); return true; });
    let cap = null;
    for (let i = 0; i < 200 && !cap; i++) { await page.waitForTimeout(1000); cap = await page.evaluate(() => { const e = document.querySelector('.ui-caption'); if (!e.classList.contains('on')) return null; const b = e.getBoundingClientRect(); return { text: e.textContent.slice(0, 20), box: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] }; }); }
    note(`[${tag}] caption card`, cap || 'none within 200 s');
    if (cap) { await page.waitForTimeout(900); await shot(page, `touch-${tag}-caption.png`); }
    await tapBtn(2);
    const pz = await snap(page);
    check(`[${tag}] 停 pauses`, pz.paused && pz.mode === 'pause', { paused: pz.paused });
    await page.waitForTimeout(700);
    await shot(page, `touch-${tag}-pause.png`);
    const pp = await page.evaluate(() => { const p = document.querySelector('.ui-panel'), go = document.querySelector('button.ui-go').getBoundingClientRect(); return { scrollH: p.scrollHeight, clientH: p.clientHeight, goTop: Math.round(go.top), goBottom: Math.round(go.bottom), vh: innerHeight }; });
    check(`[${tag}] 繼續漫步 visible on the pause panel`, pp.goBottom <= pp.vh && pp.goTop >= 0, pp);
    const b2 = await page.locator(GO).boundingBox();
    await page.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height / 2);
    await page.waitForTimeout(700);
    const rz = await snap(page);
    check(`[${tag}] tap 繼續漫步 resumes with the touch layer`, !rz.paused && rz.touchLayer, { paused: rz.paused, touchLayer: rz.touchLayer });
    check(`[${tag}] no errors`, errs.length === 0 && rz.errors === 0, errs.slice(0, 3));
    await context.close();
  }
}

// ======================================================================================================================
let browser;
try {
  const { chromium } = await import('playwright');
  const launchArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-gpu-vsync', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox'];
  let lastErr;
  for (const t of [{ channel: 'chromium' }, {}]) { try { browser = await chromium.launch({ headless: true, args: launchArgs, ...t }); break; } catch (e) { lastErr = e; } }
  if (!browser) throw lastErr;
  const run = { full: phaseFull, collide: phaseCollide, walk: phaseWalk, nolock: phaseNoLock, touch: phaseTouch, fade: phaseFade };
  for (const p of PHASES) {
    if (!run[p]) { console.log(`unknown phase ${p}`); continue; }
    try { await run[p](browser); } catch (e) { console.log(`FAIL phase ${p} aborted: ${e?.stack || e}`); fails++; }
    // a phase that threw must not leave its page rendering behind the next one
    for (const c of browser.contexts()) { for (const pg of c.pages()) await pg.close().catch(() => {}); }
  }
} catch (e) {
  console.error('[test-interact] infrastructure failure:', e);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}
console.log(`\n${passes} passed, ${fails} failed`);
if (fails && !process.exitCode) process.exitCode = 1;
