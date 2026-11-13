# AGENTS.md

青岛八大关: a procedural, walkable three.js landscape. Read `docs/DESIGN.md` first (art direction, world map, terrain
function, palette, and the MODULE CONTRACT). `docs/RESEARCH.md` holds the source research.

## Layout

- `src/core/**`, `src/world/**`, `src/main.js`, `src/modules/index.js`, `scripts/**`, `index.html`: core. Shared by
  everyone; changes here need the architect.
- `src/modules/<name>.js` + `src/modules/<name>/**`: one feature package each (terrain, coast, sky, villas, landmarks,
  streetscape, trees, life, player, post, ui, audio). Each exports `async create(ctx)` returning
  `{ update(dt, t), onPreset(target, prev), dispose() }`.
- Plain ES modules, no framework, no TypeScript. UI text is Traditional Chinese; in-scene signage is Simplified.

## Commands

- `npm run dev` (Vite, 127.0.0.1:5173), `npm run build`, `npm run check:map -- shots/map.png` (plan stats + PNG, no browser).
- Screenshot of the built site (always through the memory gate, in the background, never under `timeout`):
  `npm run build && ~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/a.png "view=ginkgo&preset=autumn"`
  Several `out.png "query"` pairs share one browser. It prints draw calls / triangles and exits 1 on any page error.

## Lessons

- **Versions (pinned)**: `three@0.187.0` (r187), `vite@8.3.7`, `playwright@1.63.0`. Playwright 1.63.0 matches the cached
  `~/.cache/ms-playwright/chromium-1243`, so nothing is downloaded; newer Playwright would want another browser build.
- **Headless WebGL here is software only** (SwiftShader). Launch flags that work: `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader --ignore-gpu-blocklist` with `channel: 'chromium'`. The stub scene takes about 5 s per shot;
  budget tens of seconds once real shaders compile. Do not wait for `networkidle`; wait for `window.__ready`.
- **Every browser launch goes through `~/.claude/bin/heavy-gate -n 1 -l <label> -- <cmd>` with `run_in_background`**; one
  browser per process, closed in `finally`. If the gate is busy it waits; never bypass it.
- **A missing favicon is a console error** (404) and fails the shot script; `index.html` carries `<link rel="icon" href="data:,">`.
- **r187 API**: `PCFSoftShadowMap` is gone (use `PCFShadowMap` + `light.shadow.radius`); `THREE.Clock` is deprecated
  (use `THREE.Timer`); `PointerLockControls` has no `getObject()`; `light.shadow.intensity` exists (used for
  `shadowStrength`); `three/addons/csm/CSM.js` overwrites core light chunks globally (do not import it);
  `mergeGeometries` returns `null` on attribute/index mismatch (use `ctx.geo.merge`, which normalises first).
- **Fog**: `scene.fog` is a `THREE.Fog` whose `near`/`far` are re-purposed as density / height falloff by the chunk
  override in `src/core/fog.js` (`WebGLMaterials.refreshFogUniforms` only uploads `fogNear`/`fogFar`/`fogColor`, which
  gives two free global floats on every material). Never replace `scene.fog`; call `ctx.setFog()`.
- **Light units**: in r187 a hemisphere light of intensity 0.55 next to a sun of 3.0 leaves shade nearly black after ACES.
  The presets carry hemisphere intensities about 1.8x the research table for that reason.
- **Vertex colours**: a material with `vertexColors: true` on a geometry without a `color` attribute renders black. Ask
  `ctx.mats` for the `{ vertexColors: true }` variant only when the geometry has colours.
- **Shared textures use metre UVs** (`texture.repeat = 1 / tileMetres` is preset): never change `repeat` on a texture from
  `ctx.tex`, clone it first.
- **Canvas textures**: `CanvasTexture.colorSpace` defaults to `NoColorSpace`; `ctx.tex.canvasTexture(canvas, { srgb })`
  sets it. With the default `flipY`, canvas top is v = 1.
- **Coordinates**: +z is SOUTH (the sea). Compass yaw 0 = north = −z. `rot = atan2(dirX, dirZ)` for local +Z as front.
- **World plan is generated at import** (`src/world/map.js`, ~100 ms, deterministic, runs under Node). Changing a street
  control point reshuffles lots, walls and trees: re-run `npm run check:map` and look at the PNG.
- **No `Math.random()`**: screenshots must be reproducible; use `ctx.rng.makeRng(seed)`.
- **Shot diagnostics**: add `&stats=1` to a shot query for draw calls / triangles per top-level group (shadow passes
  included) and a mesh-family inventory. `only=<module>` shots have no sky or lights (they render nearly black) and are
  useful only for counts; use `only=<module>,sky` to see anything.
- **Build while shots run**: `scripts/shot.mjs` serves `dist/` live, so `npm run build` during a batch mixes builds.
  Syntax-check with `npx vite build --outDir <scratch>/dist-test --emptyOutDir` instead, and never leave `dist-*` in the repo.
- **heavy-gate hook**: it blocks any Bash command that merely mentions a browser-launching script (even
  `node --check src/modules/player/e2e.mjs`), and the rest of that command silently does not run. Never wait on
  `pgrep -f <string>` inside a loop whose own command line contains that string (it matches itself); wait on a log line.
- **Fog in the HDR path**: `fog.near < 0` flags "linear HDR target" (post flips the sign while its composer renders);
  the fog chunk then uses `fogFactor^2.2`. Any shader reading `fogNear` directly must take `abs()`.
- **Shadow cost is about cluster size, not triangle count**: a merged whole-map mesh is redrawn in every shadow cascade.
  Core switches `castShadow` off by distance for static clusters (`src/core/loop.js`), which only works if the mesh is
  spatially chunked. `mesh.onBeforeShadow` / `onAfterShadow` + `geometry.setDrawRange` lets one mesh cast from a cheaper
  index range (trees, life) at no extra draw call.
- **`world.onRoad` has round end caps**: at T-junctions use a butt-ended test (terrain `streetTools().onRoad`). Junction
  kerbs are filleted (radius up to 3 m), so corner furniture must keep about 2 m from every *other* street's kerb.
- **Beach stairs / boardwalk are core geometry**: stair rectangles are `BEACH_STAIRS` (`MAP.promenade.steps` carries
  `fx, fz, hw, d0, d1`); the boardwalk's flat strip is 0.9 m wide on the seaward side. Build visible steps, decks and
  piles from those numbers, never from a radius around the stair point (it degenerates to a wedge at a polyline vertex).
- **Tints**: mid-tone material tints come out about half as bright and far more saturated after the stucco map,
  lighting and ACES, and the autumn sun pushes neutrals to tan. Pre-compensate and verify by sampling screenshot pixels
  (no PIL here; a 30-line zlib PNG reader in Node does it). Conifer palettes need a gain of 1.5-1.8 to read as green in shade.
- **Glass** is non-metal, so it reflects only ~4 % head-on and reads as a black hole: core adds a sky-tinted emissive to
  `glass` / `windowLit` every frame (`mats.update`). Lit windows stay under about 0.8 emissive or ACES + bloom turn them white.
- **r187 shader hooks**: a 4-component `color` attribute with `vertexColors: true` gives per-vertex alpha
  (`USE_COLOR_ALPHA`, cut by `alphaTest`); overriding `vMapUv` / `vNormalMapUv` after `<project_vertex>` gives world-space
  UVs on instanced meshes; `nonPerturbedNormal` exists after `<normal_fragment_maps>`; the SunLight loop in
  `lights_fragment_begin` is found with `'#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )'`.
- **Mirrored (triangle-wave) u round a tube needs an even side count**, or one facet gets constant u and bands.
- **Procedural rock**: a regular lattice of joints reads as paving from every distance. Gate each joint with noise so
  it fades in and out, vary its width, and put most of the relief into a ridged-noise normal map. Screen-space
  derivatives (`fwidth`) work in the patched standard material: the reef joints are anti-aliased and faded by pixel
  footprint with them. Warp the block coordinates by a metre-scale noise or every edge is ruler-straight.

- **Street run-off**: every street that leaves the map has two extra spline points per open end (`RUNOFF` in
  `src/world/map.js`); `street.pts`/`len` include them, `street.ctrl` does not, and `street.sA`/`sB` bracket the hand-placed
  part. Generate plan content from `sA` to `sB` only. The first extra point must stay the mirror of the last interior point
  or the whole district reshuffles. `tree.runoff` marks the avenue trees out there; `tree.shrub` (species `'shrub'`, not in
  `MAP.SPECIES`) marks garden shrubbery: index species tables defensively.
- **Walk limit is not a rectangle on the east coast**: use `walkMaxX(z)` from `src/world/map.js`; `collision.move` sets
  `out.edge` when the limit (not a collider or the sea) stopped the walker.
- **Shader warm-up** (`warmUp` in `src/main.js`): programs are keyed by render target (tone mapping / colour space), so
  `renderer.compile` must run with the post scene target bound, and by light count, so the hidden lamp PointLights are shown
  for a second pass. `compile()` visits hidden meshes too, but a compiled program is not a usable one: three fetches
  uniforms and link status on FIRST DRAW, synchronously (13-19 s in SwiftShader). Each state is therefore drawn once with
  frustum culling off and the lazily shown effect meshes (`LAZY_MESH`: `sky-wisps`, `lamp-glow`, `lamp-pools`) visible.
  Unlit materials do not switch program when the light count changes: they stay on whatever the LAST `compile()` set,
  so the daytime pass must draw the lazy meshes too. A new mesh that starts hidden must be added to `LAZY_MESH`.
  SwiftShader has no `KHR_parallel_shader_compile`.
- **Finding a stall**: wrap `gl.getProgramInfoLog` (one call per first-used program) and `renderer.render` in the page
  and log per frame; JS only blocks in `render()` on a synchronous GL call, whatever the GPU process is busy with.
- **The canvas has no MSAA** (`antialias` is on only with `skip=post`): anything drawn straight to the canvas needs its own AA.
- **Measuring colours in shots**: no PIL here; decode the PNG with `zlib` in Node (8-bit, filter types 0-4).
- **Shot output**: a failed module `create` or `update` only shows as a `[page error]` line (the picture still renders
  without that module): read the whole log, not its tail or just the exit code. Per-group cost needs `&stats=1`.
- **Parallel builds**: `SHOT_DIST=<dir>` makes `scripts/shot.mjs`, `scripts/test-interact.mjs` and the player e2e serve
  another build; build it with `npx vite build --outDir <scratch dir> --emptyOutDir` and delete it afterwards.
- **Chunk size is a trade**: smaller spatial chunks cut triangles but add draw calls (streetscape: 85 m chunks cost 68
  calls against 36 at 170 m). Measure both with `stats=1` before changing a chunk size.
- **Distance culling in `update()`**: in shot mode read the eye from `ctx.player` (core copies the walker into the camera
  after the module updates), and use no hysteresis there.
- **Static vertex arrays are released after upload** (`ctx.geo.staticMesh` and the tree cells set
  `attribute.onUpload(() => { this.array = null })`; bounds are computed first). Do not read, clone or merge such a
  geometry after its first frame (pass `{ keep: true }` if you must). A restored WebGL context reloads the page.
- **PMREM in r187** has a hard 256 px minimum and takes 256 GGX samples per texel: `pmrem.fromScene` is a visible hitch
  on integrated GPUs and tens of seconds in SwiftShader. The sky rebakes once mid cross-fade and once at the end only.
- **First-visit quality** (`src/core/quality.js`): desktop starts on `medium`, `high` only for a discrete GPU named by
  `WEBGL_debug_renderer_info`, `low` for a software rasteriser. So the headless default page is `low`: pass `q=` in
  interactive (`shot=0`) captures when the tier matters.
- **`perf:low`** (post) is answered by the UI (toast: Q / tap switches tier). With the UI skipped (`only=`/`skip=ui`) post
  reloads the page into the next tier down by itself after ~3 slow windows, which looks like a spontaneous navigation in tests.
- **Interaction tests**: after 開始漫步 / 繼續漫步 wait for `document.elementFromPoint(x, y) === canvas` before clicking the
  scene. `#ui-root > *` forces `pointer-events: auto`, so a click-through layer needs the `#ui-root > .x` selector.
- **Tree atlas is full** (16 tiles): a second look for one species is a second card set in an alternate palette / fill
  slot, not a new tile. Flat conifer sprays vanish edge-on: a canopy seen along the street needs vertical curtain cards.
- **Alpha-tested streaks a few texels wide vanish in the mips**: cut the outline analytically from the UV instead.
- **Bright warm colours cannot survive ACES**: `vec3(1.0, 0.45, 0.16) * 6` comes out (254,247,235), i.e. cream, and
  bloom / godrays lift it further. A setting sun reads by hue and a defined edge, not brightness: very saturated sources
  kept low on the curve (gold core about x2, deep orange limb about x1), replacing the sky under it instead of `max()`.
- **Lamp PointLights and nearby surfaces**: a 26 cd lamp light (decay 2) washes anything within about 2 m to white after
  bloom; street-name plates keep 4.5 m from lamps (`LAMP_GAPS` in `streetscape/signs.js`). The lights are hidden again
  after a fade back to daylight, and streetscape's `prewarm(true)` shows the light state the page did NOT boot in, so
  `warmUp` covers both variants whatever the boot preset.
- **Canopy fill**: `MAP.trees` carries about 500 `{ garden: true, interior: true }` trees (a jittered 11.5 m staggered grid
  appended after the shrubs, so earlier ids never move) plus a second coast pine run. They are backdrop: draw them from a
  cheap LOD. New off-street camera views (`VIEW_SRC`, defined above the tree pass) keep a 7 m tree-free circle automatically.
- **Paused frames**: with the 稍歇 panel up, `loop.start` renders every third rAF and keeps `ctx.post.adaptive` settled;
  tests that count `state.frame` while paused run three times slower. The title screen still runs at full rate.
- **Phone pixel ratio**: `low` on a mobile device gets `maxPixelRatio` up to 2 inside a 1.5 MP budget (`pickQuality`);
  desktop `low` (software GL) and every shot stay at 1.
- **Far terrain under run-off streets**: the coarse far mesh (12-100 m facets) rides up to 0.3 m above `heightAt`, so
  anything laid on `heightAt` beyond the near rectangle (street run-off, future paths) needs the far cells under it
  lowered (`src/modules/terrain/far.js` does this per street corridor), or lawn shows through the asphalt.
- **Butt-end street tests must be local**: a street that curls back (韶关路) falls on the wrong side of a global
  half-plane at its own start. Apply the end-cap test only when the nearest point on the street IS that end.
- **GLSL ES 3.0 reserved words**: `patch` (also `sample`, `filter`, `input`, `output`, `common`, `active`, `partition`)
  as a variable name fails the whole program, and the only symptom is one `[page error]` line.
- **Distant sparkle**: world-space glint textures average out in the mips a few tens of metres from an eye-height camera.
  Sea glitter beyond that lives in view-direction cells (about half a degree), gated by world-space ripple patches.
- **`toCreasedNormals`** (`BufferGeometryUtils`) gives smooth normals with hard creases on non-indexed geometry and keeps
  the `color` attribute: used for the reef boulders.
- **Canopy shadow gaps are keyed on the sun ray**, not per card: a dozen stacked cards along one ray make a solid
  shadow however thin each card is. The depth material drops fragments whose ray hits a noise patch on the plane y = 0
  (`GAP_*` / `uGap` in `trees/materials.js`), so every card along the ray agrees and sun pools reach the road.
- **Tree triangles are set by the LOD radii** (`treeLodNear` / `treeLodFar` in `src/core/quality.js`), not by the map: on
  居庸关路 near 60 -> 52 m took the tree group from 623k to 490k triangles (shadow pass included) with no visible change.
  Check `stats=1` on `view=ginkgo` (the densest view) after touching tree templates or these radii.
- **UI copy and the font subset**: the UI face is a ~400-character Noto Serif TC subset. New on-screen Traditional copy
  must pass `npm run check:fonts` (part of `npm run build`); if it fails run `node src/modules/ui/fonts/subset.mjs --write`
  and rebuild the woff2 files with `src/modules/ui/fonts/build.py`.
- **Palette accents**: one out-of-family tone in a 4-colour foliage palette (dusk plane lime, spring maple russet) reads as
  dead or lamp-lit clumps on whole cards, because a card takes ONE tone. Keep the four tones within one hue family
  unless the season really is mixed (autumn maple).
- **Looking at many shots**: write down what each PNG shows as soon as it is read; a long session drops old images from
  context and only the notes survive.
