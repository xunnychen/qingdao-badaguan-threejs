// Package "ui-audio": title screen, pause menu, walking HUD (street name, compass, minimap, captions, toasts, help).
// DOM only, inside ctx.uiRoot; zero draw calls. Text is Traditional Chinese. In screenshot mode nothing is created.
//
// Keys: 1-4 choose a preset, P next preset, M minimap, H help, N mute. Touch: three small buttons in the top-right corner.
// Developer aid: `?shot=0&uitest=title|play|pause|caption|minimap|help` forces a state without a user gesture
// (`uitest=caption:<poi id>` picks the caption, `uitest=caption:<poi id>:map` adds the minimap; `uitouch=1` previews the
// touch layout on a desktop browser).
import './ui/ui.css';
import { createMinimap } from './ui/minimap.js';

const NOOP = { update() {}, onPreset() {}, dispose() {} };
const CAPTION_SECONDS = 9;
const HINT_SECONDS = 8;
const CAPTION_GRACE = HINT_SECONDS + 2;     // no cards while the key hints are up, right after 開始漫步
const CAPTION_GAP = 8;                      // quiet seconds between two cards

/** h('div.a.b', {attrs}, ...children) */
function h(spec, attrs, ...kids) {
  const [tag, ...cls] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs) for (const k in attrs) { if (attrs[k] != null) el.setAttribute(k, attrs[k]); }
  for (const kid of kids) if (kid != null) el.append(kid);
  return el;
}

export async function create(ctx) {
  const { app, env, events, params, uiRoot, map, world, player, quality, store, state } = ctx;
  if (params.shot || !uiRoot) return NOOP;

  const query = new URLSearchParams(location.search);
  const uitest = (query.get('uitest') || '').split(':');
  const forceTouch = query.get('uitouch') === '1';                       // developer aid: preview the touch layout
  const fine = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
  const isTouch = quality.isTouch || forceTouch;
  const touchOnly = forceTouch || (quality.isTouch && !fine);
  const narrow = () => innerWidth <= 700;
  const offs = [];
  let mode = 'boot';                    // boot | title | play | pause

  // =====================================================================================================================
  // menu (title + pause share one panel)
  // =====================================================================================================================
  const presetBtns = {};
  const presetGrid = h('div.ui-presets', { role: 'group', 'aria-label': '時節' });
  env.names.forEach((id, i) => {
    const p = env.presets[id];
    const thumb = h('span.ui-thumb');
    // a tiny sky-over-sea picture built from the preset's own colours
    thumb.style.background = `linear-gradient(180deg, ${p.skyZenith} 0%, ${p.skyHorizon} 62%, ${p.seaShallow} 62%, ${p.seaDeep} 100%)`;
    const sun = h('i');
    sun.style.cssText = `left:${[68, 30, 80, 50][i % 4]}%;top:${Math.round(58 - Math.min(50, p.sunElevation) * 0.95)}%;background:${p.sunColor};box-shadow:0 0 10px 3px ${p.skySunGlow}`;
    if (p.sunDisc < 0.6) sun.style.opacity = '0.55';
    thumb.append(sun);
    const b = h('button.ui-preset', { type: 'button', 'aria-pressed': 'false' }, thumb, h('b', null, p.label), h('small', null, p.sub), touchOnly ? null : h('kbd', null, String(i + 1)));
    b.addEventListener('click', () => app.setPreset(id));
    presetBtns[id] = b;
    presetGrid.append(b);
  });

  const goBtn = h('button.ui-go', { type: 'button' }, '開始漫步');
  goBtn.addEventListener('click', () => { if (state.started) app.resume(); else app.start(); });

  const key = (k, label) => h('li', null, ...[].concat(k).map((x) => h('kbd', null, x)), label);
  const keyList = h('ul.ui-keys');
  if (isTouch) {
    keyList.append(h('li', null, '左側拖曳 · 行走（推到底為快步）'), h('li', null, '右側拖曳 · 環顧'), h('li', null, '右上角 · 時節／地圖／暫停'));
  }
  if (!touchOnly) {
    keyList.append(key(['W', 'A', 'S', 'D'], '行走'), key('Shift', '快步'), key('滑鼠', '環顧'), key('1–4', '時節'), key('P', '下一時節'),
      key('M', '地圖'), key('H', '說明'), key('N', '靜音'), key('Esc', '暫停'));
  }

  // settings
  const seg = (items, current, onPick) => {
    const wrap = h('span.ui-seg', { role: 'group' });
    for (const [id, label] of items) {
      const b = h('button', { type: 'button', 'aria-pressed': String(id === current) }, label);
      b.addEventListener('click', () => { if (id !== current) onPick(id); });
      wrap.append(b);
    }
    return wrap;
  };
  const qualitySeg = seg([['low', '低'], ['medium', '中'], ['high', '高']], quality.tier, (tier) => app.setQuality(tier));
  const soundBtn = h('button.ui-toggle', { type: 'button', 'aria-pressed': 'true' }, '開');
  const musicBtn = h('button.ui-toggle', { type: 'button', 'aria-pressed': 'false' }, '關');
  const volume = h('input.ui-range', { type: 'range', min: '0', max: '100', step: '1', value: '80', 'aria-label': '音量' });
  const soundSet = h('span.ui-set', null, '聲音', soundBtn);
  soundSet.append(volume);
  const musicSet = h('span.ui-set', null, '音樂盒', musicBtn);
  soundBtn.addEventListener('click', () => { ctx.audio?.setMuted(!ctx.audio.muted); syncMenu(); });
  musicBtn.addEventListener('click', () => { ctx.audio?.setMusic?.(!ctx.audio.music); syncMenu(); });
  volume.addEventListener('input', () => {
    ctx.audio?.setVolume(volume.value / 100);
    if (ctx.audio?.muted && volume.value > 0) ctx.audio.setMuted(false);
    syncMenu();
  });
  // look sensitivity (the player package owns the value: store 'sens', event 'sens', range 0.2..4; [ and ] also change it)
  const sens = h('input.ui-range', { type: 'range', min: '20', max: '300', step: '5', value: '100', 'aria-label': '視角靈敏度' });
  const syncSens = () => {
    const v = Math.round((ctx.player.sensitivity ?? (parseFloat(store.get('sens')) || 1)) * 100);
    sens.value = String(v);
    sens.style.setProperty('--v', `${((Math.min(300, Math.max(20, v)) - 20) / 280) * 100}%`);
  };
  sens.addEventListener('input', () => { events.emit('sens', sens.value / 100); syncSens(); });
  const sensSet = h('span.ui-set.ui-set-sens', null, '視角靈敏度', sens);
  if (touchOnly) sensSet.hidden = true;
  const settings = h('div.ui-settings', null, h('span.ui-set', null, '畫質', qualitySeg), soundSet, musicSet, sensSet);

  const titleEl = h('h1.ui-title', { id: 'ui-title' }, map.intro.title);
  const whereEl = h('p.ui-where');
  const panel = h('div.ui-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ui-title' },
    h('div.ui-kicker', null, '青島 · 太平灣畔 · 一九三〇年代'),
    h('div.ui-headline', null, titleEl, h('div.ui-seal', { 'aria-hidden': 'true' }, h('span', null, '青'), h('span', null, '島'))),
    h('p.ui-quote', null, `「${map.intro.quote.replace(/。$/, '')}」`),
    whereEl,
    h('p.ui-intro', null, map.intro.text),
    h('h2.ui-label', null, '時節'),
    presetGrid,
    goBtn,
    h('h2.ui-label.ui-label-keys', null, '操作'),
    keyList,
    h('h2.ui-label', null, '設定'),
    settings);
  const veil = h('div.ui-veil');
  veil.addEventListener('click', () => { if (mode === 'pause') app.resume(); });
  const menu = h('div.ui-menu', { 'data-mode': 'title' }, veil, panel);
  if (touchOnly) menu.classList.add('touch-only');   // short landscape phones drop the 操作 list (see ui.css)

  function syncMenu() {
    syncSens();
    for (const id in presetBtns) presetBtns[id].setAttribute('aria-pressed', String(id === env.name));
    const a = ctx.audio, has = !!a && a.available !== false;
    soundSet.hidden = !has;
    musicSet.hidden = !has || !a.setMusic;
    if (has) {
      soundBtn.setAttribute('aria-pressed', String(!a.muted)); soundBtn.textContent = a.muted ? '關' : '開';
      musicBtn.setAttribute('aria-pressed', String(!!a.music)); musicBtn.textContent = a.music ? '開' : '關';
      const v = Math.round((a.volume ?? 0.8) * 100);
      if (document.activeElement !== volume) volume.value = String(v);
      volume.style.setProperty('--v', `${a.muted ? 0 : v}%`);
    }
  }
  function fillWhere() {
    whereEl.replaceChildren();
    if (place.name) whereEl.append(h('b', null, place.name), place.sub ? ` · ${place.sub}` : '', ` · ${env.target.label}`);
    else whereEl.append(env.target.label);
  }
  function showMenu(which) {
    mode = which;
    menu.dataset.mode = which;
    titleEl.textContent = which === 'pause' ? '稍歇' : map.intro.title;
    goBtn.textContent = which === 'pause' ? '繼續漫步' : '開始漫步';
    fillWhere();
    syncMenu();
    menu.classList.add('on');
    hud.classList.remove('on');
    setHelp(false);
    panel.scrollTop = 0;
    focusGo();
  }
  // The menu becomes visible in this very tick, and a browser may still treat it as hidden when focus() runs (the focus is
  // then dropped silently), so the request is repeated on the next two frames until it sticks.
  function focusGo(tries = 3) {
    if (mode !== 'title' && mode !== 'pause') return;
    const a = document.activeElement;
    if (a && a !== goBtn && menu.contains(a)) return;            // the user already moved focus inside the menu
    try { goBtn.focus({ preventScroll: true }); } catch { /* not focusable yet */ }
    if (document.activeElement !== goBtn && tries > 1) requestAnimationFrame(() => focusGo(tries - 1));
  }
  function enterPlay(first) {
    mode = 'play';
    menu.classList.remove('on');
    hud.classList.add('on');
    if (first) { hintsEl.classList.add('on'); hintsLeft = HINT_SECONDS; captionCool = Math.max(captionCool, CAPTION_GRACE); }
    lastMs = performance.now();
    if (document.activeElement && menu.contains(document.activeElement)) document.activeElement.blur();
  }

  // =====================================================================================================================
  // HUD
  // =====================================================================================================================
  const streetName = h('div.ui-street-name'), streetTree = h('div.ui-street-tree');
  const streetEl = h('div.ui-street', { 'aria-hidden': 'true' }, streetName, streetTree);

  const north = h('span', null, '北');
  const rose = h('div.ui-rose', null, north);
  for (let i = 1; i < 8; i++) {
    const tick = h(i % 2 ? 'i' : 'i.c');
    tick.style.transform = `rotate(${i * 45}deg) translateY(${i % 2 ? -21 : -22}px)`;
    rose.append(tick);
  }
  const compass = h('div.ui-compass', { 'aria-hidden': 'true' }, rose);

  const tbtn = (label, title, fn) => {
    const b = h('button.ui-tbtn', { type: 'button', 'aria-label': title, title }, label);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  const tbtns = h('div.ui-tbtns', null,
    tbtn('時', '下一時節', () => app.nextPreset(1)),
    tbtn('圖', '地圖', () => toggleMap()),
    tbtn('停', '暫停', () => app.pause()));
  const topRight = h('div.ui-tr', null, compass, tbtns);

  let minimap = null;
  let mapOn = store.get('map') != null ? store.get('map') === '1' : !touchOnly;
  function ensureMap() {
    if (minimap) return minimap;
    try {
      // a phone held either way gets the small map (its short side decides: 844 x 390 is not "narrow")
      const small = Math.min(innerWidth, innerHeight) <= 520;
      minimap = createMinimap(ctx, small ? 150 : narrow() ? 170 : innerWidth >= 1500 ? 280 : 240);
      hud.insertBefore(minimap.el, toastEl);
      // the caption stack keeps clear of the map by these two lengths (ui.css)
      hud.style.setProperty('--ui-map-w', minimap.el.style.width);
      hud.style.setProperty('--ui-map-h', minimap.el.style.height);
      minimap.setPlayer(player.pos.x, player.pos.z, player.yaw);
    } catch (e) { console.warn('[ui] minimap failed', e); minimap = null; }
    return minimap;
  }
  function applyMap() {
    if (mapOn) ensureMap();
    // let the element exist for a frame before the fade-in
    requestAnimationFrame(() => { minimap?.el.classList.toggle('on', mapOn); hud.classList.toggle('map-on', mapOn); });
  }
  function toggleMap(on = !mapOn) { mapOn = on; store.set('map', on ? '1' : '0'); applyMap(); }

  const toastTitle = h('b'), toastSub = h('small');
  const toastEl = h('div.ui-toast', { role: 'status', 'aria-live': 'polite' }, toastTitle, toastSub);
  let toastLeft = 0;
  function toast(title, sub = '', seconds = 3.6, plain = false) {
    toastTitle.textContent = title; toastSub.textContent = sub;
    toastEl.classList.toggle('plain', plain);
    toastEl.classList.remove('act'); perfLeft = 0;
    toastEl.classList.add('on');
    toastLeft = seconds;
  }

  const hintsEl = h('div.ui-hints', { 'aria-hidden': 'true' });
  const hint = (k, label) => h('span', null, ...[].concat(k || []).map((x) => h('kbd', null, x)), label);
  if (touchOnly) hintsEl.append(hint(null, '左側拖曳行走'), hint(null, '右側拖曳環顧'));
  else hintsEl.append(hint(['W', 'A', 'S', 'D'], '行走'), hint('Shift', '快步'), hint('M', '地圖'), hint('H', '說明'), hint('Esc', '暫停'));
  // shown only while the browser refuses pointer lock and the player package falls back to drag-look ('lookmode' event)
  const dragHint = hint(null, '按住滑鼠拖曳以環顧');
  dragHint.classList.add('ui-hint-drag');
  if (!touchOnly) hintsEl.prepend(dragHint);
  let hintsLeft = 0;
  function setLookMode(m) {
    const drag = m === 'drag';
    if (drag === hintsEl.classList.contains('drag')) return;
    hintsEl.classList.toggle('drag', drag);
    if (drag && mode === 'play') { hintsEl.classList.add('on'); hintsLeft = Math.max(hintsLeft, HINT_SECONDS); }
  }

  // 'perf:low' from the post package: even the lowest render resolution cannot hold 30 fps. Offer the next tier down
  // (one key / one tap; the page reloads) instead of letting post switch on its own.
  const TIER_LABEL = { low: '低', medium: '中', high: '高' };
  let perfOffer = null, perfLeft = 0, perfPending = false;
  function offerQuality(detail) {
    if (!detail || !detail.suggest || mode === 'boot') return;
    detail.handled = true;
    perfOffer = detail.suggest;
    perfPending = true;                          // shown by update() once the walk is on and no other toast is up
  }
  function showPerfOffer() {
    perfPending = false;
    toast('畫面略顯遲滯', touchOnly ? `輕觸此處，改用「${TIER_LABEL[perfOffer]}」畫質` : `按 Q 改用「${TIER_LABEL[perfOffer]}」畫質`, 12, true);
    perfLeft = 12;
    toastEl.classList.add('act');
  }
  toastEl.addEventListener('click', () => { if (perfOffer && perfLeft > 0) app.setQuality(perfOffer); });

  const capTitle = h('span'), capSub = h('small'), capQuote = h('blockquote'), capText = h('p');
  const captionEl = h('div.ui-caption', { role: 'status', 'aria-live': 'polite' }, h('h3', null, capTitle, capSub), capQuote, capText);
  let captionLeft = 0, captionCool = 0, captionTimer = 0;
  function showCaption(poi) {
    capTitle.textContent = poi.title; capSub.textContent = poi.sub || '';
    capQuote.textContent = `「${poi.quote}」`; capText.textContent = poi.text || '';
    clearTimeout(captionTimer);
    captionEl.classList.add('show');
    void captionEl.offsetWidth;                       // one reflow, on show only, so the fade-in runs
    captionEl.classList.add('on');
    captionLeft = CAPTION_SECONDS;
    events.emit('poi', poi);
  }
  function hideCaption() {
    captionEl.classList.remove('on');
    captionCool = CAPTION_GAP;
    captionTimer = setTimeout(() => captionEl.classList.remove('show'), 900);
  }
  const stack = h('div.ui-stack', null, hintsEl, captionEl);

  const helpEl = h('div.ui-help', { 'aria-hidden': 'true' }, h('h3', null, '操作說明'));
  {
    const dl = h('dl');
    const row = (keys, label) => dl.append(h('dt', null, ...[].concat(keys).flatMap((k, i) => (i ? [' ', h('kbd', null, k)] : [h('kbd', null, k)]))), h('dd', null, label));
    row(['W', 'A', 'S', 'D'], '行走（方向鍵亦可）'); row('Shift', '快步'); row('滑鼠', '環顧'); row(['[', ']'], '滑鼠靈敏度');
    row(['1', '2', '3', '4'], '秋日 · 海霧 · 黃昏 · 花季'); row('P', '下一時節'); row('M', '地圖'); row('N', '靜音'); row('H', '關閉說明'); row('Esc', '暫停');
    helpEl.append(dl);
  }

  const hud = h('div.ui-hud', null, streetEl, topRight, toastEl, stack, helpEl);
  // while help is open the toast is suppressed and the panel sits clear of the caption card (see .help-on in ui.css)
  function setHelp(on) { helpEl.classList.toggle('on', on); hud.classList.toggle('help-on', on); }
  if (isTouch) hud.classList.add('touch');
  if (touchOnly) hud.classList.add('touch-only');   // captions keep clear of the walk stick (bottom-left)

  uiRoot.append(hud, menu);
  syncMenu();

  // Webfont (ui.css): canvas text does not wait for a font, so the minimap labels are redrawn once the face is in.
  let disposed = false;
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('400 16px "Noto Serif TC"', '八'), document.fonts.load('500 16px "Noto Serif TC"', '八')])
      .then(() => { if (!disposed && minimap) minimap.redraw(); }, () => {});
  }
  // Development only: warn when on-screen copy falls outside the font subset (same test as fonts/subset.mjs).
  if (import.meta.env && import.meta.env.DEV) {
    import('./ui/fonts/charset.txt?raw').then((m) => {
      const have = new Set(m.default);
      const texts = [uiRoot.textContent, JSON.stringify(map.pois), JSON.stringify(map.intro), ...env.names.map((id) => env.presets[id].label + env.presets[id].sub),
        ...map.streets.map((s) => s.nameT), ...map.landmarks.map((l) => l.nameT), ...map.parks.map((p) => p.nameT || ''), ...Object.values(map.SPECIES).map((s) => s.nameT)];
      const missing = [...new Set(texts.join(''))].filter((c) => c.codePointAt(0) > 0x7e && !have.has(c));
      if (missing.length) console.warn(`[ui] ${missing.length} character(s) outside the Noto Serif TC subset: ${missing.join('')} (run node src/modules/ui/fonts/subset.mjs)`);
    }).catch(() => {});
  }

  // =====================================================================================================================
  // where am I: street label + POI captions (checked a few times a second)
  // =====================================================================================================================
  const place = { key: null, name: '', sub: '' };       // what the label shows
  const seen = { key: null, name: '', sub: '', street: null };
  const stOut = {};
  let pendingKey = null, pendingN = 0, swapTimer = 0, streetKey = null, streetTime = 0, awayTime = 0;
  const fired = new Set();          // street POIs shown this session
  const inside = new Set();         // place POIs the walker is currently "in" (re-arm beyond 2r)
  const placePois = map.pois.filter((p) => p.kind === 'place');
  const streetPois = {};
  for (const p of map.pois) if (p.kind === 'street') streetPois[p.street] = p;

  function locate() {
    const x = player.pos.x, z = player.pos.z;
    seen.street = null;
    const r = world.nearestStreet(x, z, stOut);
    if (r && r.d <= r.street.half + r.street.sidewalk) {
      const s = r.street;
      seen.key = s.id; seen.name = s.nameT; seen.sub = map.SPECIES[s.tree]?.nameT || ''; seen.street = s;
      return;
    }
    const surf = world.surfaceAt(x, z);
    if (surf === 'promenade') { seen.key = 'promenade'; seen.name = map.promenade.nameT; seen.sub = '太平灣'; return; }
    if (surf === 'boardwalk') { seen.key = 'boardwalk'; seen.name = map.boardwalk.nameT; seen.sub = '太平角'; return; }
    if (surf === 'sand' || surf === 'water') { seen.key = 'beach'; seen.name = '第二海水浴場'; seen.sub = '太平灣'; return; }
    if (surf === 'rock') { seen.key = 'rock'; seen.name = '礁石'; seen.sub = '太平角'; return; }
    const park = surf === 'lawn' || surf === 'path' ? world.parkAt(x, z) : null;
    if (park && park.nameT) { seen.key = park.id; seen.name = park.nameT; seen.sub = ''; return; }
    seen.key = null;
  }

  // One block per character: upright vertical text without relying on a font's vertical metrics.
  function vertical(el, text) { el.replaceChildren(...[...text].map((c) => h('span', null, c))); }
  function setPlace() {
    place.key = seen.key; place.name = seen.name; place.sub = seen.sub;
    streetEl.classList.remove('on');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      vertical(streetName, place.name); vertical(streetTree, place.sub);
      streetEl.classList.add('on');
    }, streetName.firstChild ? 480 : 30);
  }

  function checkPlace(step) {
    locate();
    // label: needs two consecutive agreeing samples; lingers a few seconds after stepping off every street
    if (seen.key === place.key) { pendingKey = null; awayTime = 0; }
    else if (seen.key == null) {
      awayTime += step;
      if (awayTime > 4 && place.key != null) { place.key = null; place.name = place.sub = ''; clearTimeout(swapTimer); streetEl.classList.remove('on'); }
    } else if (seen.key === pendingKey) { if (++pendingN >= 2) { setPlace(); pendingKey = null; awayTime = 0; } }
    else { pendingKey = seen.key; pendingN = 1; }

    // street POIs: about 2 s on the street, once per session
    const sid = seen.street ? seen.street.id : null;
    if (sid !== streetKey) { streetKey = sid; streetTime = 0; } else if (sid) streetTime += step;

    const free = captionLeft <= 0 && captionCool <= 0;
    const x = player.pos.x, z = player.pos.z;
    let shown = false;
    for (const p of placePois) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (inside.has(p.id)) { if (d > 2 * p.r) inside.delete(p.id); } else if (d < p.r && free && !shown) { inside.add(p.id); showCaption(p); shown = true; }
    }
    if (!shown && free && sid && streetTime >= 2 && streetPois[sid] && !fired.has(sid)) { fired.add(sid); showCaption(streetPois[sid]); }
  }

  // =====================================================================================================================
  // events + keys
  // =====================================================================================================================
  let wasStarted = false;
  offs.push(
    events.on('ready', () => {
      const [what, arg] = uitest;
      if (!what || what === 'title') { showMenu('title'); return; }
      if (what === 'pause') { locate(); setPlace(); showMenu('pause'); return; }
      enterPlay(true);
      locate(); setPlace();
      if (what === 'minimap' || uitest[2] === 'map') toggleMap(true);
      if (what === 'help') { setHelp(true); if (arg) { captionCool = 0; showCaption(map.pois.find((p) => p.id === arg) || map.pois[0]); captionLeft = 1e9; toast(env.target.label, env.target.sub, 1e9); } }
      if (what === 'caption') { captionCool = 0; showCaption(map.pois.find((p) => p.id === arg) || map.pois[0]); captionLeft = 1e9; }
      if (what === 'toast') toast(env.target.label, env.target.sub, 1e9);
    }),
    events.on('start', () => { wasStarted = true; enterPlay(true); setLookMode(player.lookMode); locate(); if (seen.key) setPlace(); }),
    events.on('resume', () => enterPlay(!wasStarted)),
    events.on('pause', () => showMenu('pause')),
    events.on('preset', (target) => {
      syncMenu();
      if (mode === 'play') toast(target.label, target.sub);
      else fillWhere();
      if (minimap) setTimeout(() => minimap.redraw(), 60);
    }),
    events.on('lookmode', (m) => setLookMode(m)),
    events.on('perf:low', (detail) => offerQuality(detail)),
    events.on('boundary', () => { if (mode === 'play' && toastLeft <= 0) toast('前方已是八大關之外', '', 2.8, true); }),
  );
  applyMap();

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    switch (e.code) {
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Numpad1': case 'Numpad2': case 'Numpad3': case 'Numpad4': {
        const id = env.names[+e.code.slice(-1) - 1];
        if (id) app.setPreset(id);
        break;
      }
      case 'Enter': case 'NumpadEnter': case 'Space': {
        // safety net: with focus on nothing (body), Enter / Space still starts or resumes the walk
        if (mode !== 'title' && mode !== 'pause') break;
        const a = document.activeElement;
        if (a && a !== document.body && a !== document.documentElement) break;   // a focused control handles its own key
        e.preventDefault();
        goBtn.click();
        break;
      }
      case 'KeyQ': if (perfOffer && perfLeft > 0 && mode === 'play') app.setQuality(perfOffer); break;
      case 'KeyP': app.nextPreset(1); break;
      case 'KeyM': toggleMap(); break;
      case 'KeyH': if (mode === 'play') setHelp(!helpEl.classList.contains('on')); break;
      case 'KeyN':
        if (ctx.audio && ctx.audio.available !== false) {
          ctx.audio.setMuted(!ctx.audio.muted); syncMenu();
          if (mode === 'play') toast(ctx.audio.muted ? '靜音' : '聲音開啟', '', 1.8, true);
        }
        break;
      default:
    }
  }
  addEventListener('keydown', onKey);

  // =====================================================================================================================
  // per frame: timers and two transform writes at most; everything else is throttled
  // =====================================================================================================================
  // Timers run on wall-clock time, not the simulation dt (which the loop clamps to 0.05 s, so at low frame rates a 9 s
  // card would linger for much longer). Capped at 0.5 s per frame to survive tab switches; frozen outside play.
  let placeAcc = 0, mapAcc = 0, lastRose = NaN, lastMs = performance.now();
  function update() {
    const ms = performance.now();
    const dt = Math.min(0.5, Math.max(0, (ms - lastMs) / 1000));
    lastMs = ms;
    if (mode !== 'play') return;
    if (toastLeft > 0 && (toastLeft -= dt) <= 0) toastEl.classList.remove('on');
    if (perfLeft > 0 && (perfLeft -= dt) <= 0) toastEl.classList.remove('act');
    if (perfPending && toastLeft <= 0 && hintsLeft <= 0) showPerfOffer();
    if (hintsLeft > 0 && (hintsLeft -= dt) <= 0) hintsEl.classList.remove('on');
    if (captionLeft > 0 && (captionLeft -= dt) <= 0) hideCaption();
    if (captionCool > 0) captionCool -= dt;

    const deg = Math.round(((player.yaw * 180) / Math.PI) * 2) / 2;
    if (deg !== lastRose) {
      lastRose = deg;
      rose.style.transform = `rotate(${-deg}deg)`;
      north.style.transform = `translateY(-13px) rotate(${deg}deg)`;      // the glyph stays upright as the rose turns
    }

    mapAcc += dt;
    if (mapAcc >= 1 / 15) { mapAcc = 0; if (mapOn && minimap) minimap.setPlayer(player.pos.x, player.pos.z, player.yaw); }

    placeAcc += dt;
    if (placeAcc >= 0.25) { const step = placeAcc; placeAcc = 0; checkPlace(step); }
  }

  return {
    update,
    onPreset() {},
    dispose() {
      disposed = true;
      offs.forEach((f) => f());
      removeEventListener('keydown', onKey);
      clearTimeout(swapTimer); clearTimeout(captionTimer);
      hud.remove(); menu.remove();
    },
  };
}
