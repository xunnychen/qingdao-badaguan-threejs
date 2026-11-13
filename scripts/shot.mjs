#!/usr/bin/env node
// Headless screenshot(s) of the BUILT site (dist/). Run `npm run build` first.
//
//   node scripts/shot.mjs <out.png> "<query>" [<out2.png> "<query2>" ...] [--size=1280x720] [--timeout=420] [--delay=0] [--verbose]
//
// <query> is the URL query without "?": e.g. "view=ginkgo&preset=autumn" or "pos=-20,28&yaw=180&pitch=-3&preset=fog&q=high".
// (shot=1 is added automatically; see src/core/params.js for every parameter and MAP.views in src/world/map.js for view ids.)
// Pass shot=0 explicitly to capture the normal interactive page (title screen / HUD); combine with --delay=<ms> to wait
// after window.__ready before the capture (real-time rendering under software GL is slow: a few fps).
// Several out/query pairs are taken one after another in ONE browser (always closed in `finally`).
//
// ON THIS MACHINE every browser launch MUST go through the memory gate and run in the background, e.g.
//   ~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/a.png "view=spawn"
// Exit code: 0 ok; 1 page errors / console errors / module failures; 2 usage or infrastructure failure.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.SHOT_DIST || 'dist');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const rest = args.filter((a) => !a.startsWith('--'));
if (rest.length < 2 || rest.length % 2) {
  console.error('usage: node scripts/shot.mjs <out.png> "<query>" [<out2.png> "<query2>" ...] [--size=1280x720] [--timeout=420]');
  process.exit(2);
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('dist/index.html not found: run `npm run build` first'); process.exit(2); }
const [W, H] = (flags.size || '1280x720').split('x').map(Number);
const TIMEOUT = (Number(flags.timeout) || 420) * 1000;
const DELAY = Number(flags.delay) || 0;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.map': 'application/json' };
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

let failed = false;
let browser;
try {
  const { chromium } = await import('playwright');
  const launchArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-gpu-vsync', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox'];
  const tries = [{ channel: 'chromium' }, {}, { channel: 'chrome' }];
  let lastErr;
  for (const t of tries) {
    try { browser = await chromium.launch({ headless: true, args: launchArgs, ...t }); break; } catch (e) { lastErr = e; }
  }
  if (!browser) throw lastErr;
  for (let i = 0; i < rest.length; i += 2) {
    const out = path.resolve(ROOT, rest[i]);
    let query = rest[i + 1].replace(/^\?/, '');
    if (!/(^|&)shot=/.test(query)) query = 'shot=1' + (query ? '&' + query : '');
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (m) => {
      const type = m.type(), text = m.text();
      if (type === 'error') { errors.push(text); console.log('[page error]', text); }
      else if (type === 'warning') console.log('[page warn]', text);
      else if (flags.verbose) console.log('[page]', text);
    });
    page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
    const t0 = Date.now();
    try {
      await page.goto(base + '?' + query, { waitUntil: 'load', timeout: TIMEOUT });
      await page.waitForFunction('window.__ready === true', null, { timeout: TIMEOUT, polling: 250 });
      const { info, errs, gl } = await page.evaluate(() => {
        let gl = '';
        try { const c = window.__badaguan?.renderer?.getContext(); gl = c ? `${c.getParameter(c.VERSION)}` : 'no context'; } catch (e) { gl = String(e); }
        return { info: window.__info || null, errs: window.__errors || [], gl };
      });
      for (const e of errs) if (!errors.includes(e)) errors.push(e);
      if (DELAY) await page.waitForTimeout(DELAY);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out });
      console.log(`shot ${path.relative(ROOT, out)}  ?${query}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${gl}`);
      if (info?.groups) console.log('  per group (calls/tris, shadow pass included): ' + Object.entries(info.groups).map(([k, v]) => `${k} ${v[0]}/${Math.round(v[1] / 1000)}k`).join('  '));
      if (info?.families) console.log('  mesh families (whole scene): ' + info.families.join(' | '));
      if (info) console.log(`  draw calls ${info.calls}  triangles ${info.triangles}  geometries ${info.geometries}  textures ${info.textures}  preset ${info.preset}  q ${info.quality}  cam ${info.camera}`);
    } catch (e) {
      errors.push(String(e.message || e));
      console.log(`[shot failed] ?${query}: ${e.message || e}`);
    }
    if (errors.length) { failed = true; console.log(`  ${errors.length} error(s) on ?${query}`); }
    await page.close();
  }
} catch (e) {
  console.error('[shot] infrastructure failure:', e);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}
if (failed && !process.exitCode) process.exitCode = 1;
