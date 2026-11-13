# Package: landmarks

Files owned: src/modules/landmarks.js, src/modules/landmarks/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no downloaded models or photo textures). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB.

READ FIRST: docs/DESIGN.md (all of it; §2.3 landmarks, §4 palette, §5 MODULE CONTRACT), AGENTS.md (Lessons), then src/core/context.js, src/world/map.js (landmarks, gates, rectCorners, toLocal), src/core/materials.js, src/core/textures.js, src/core/geo.js, src/core/collision.js. docs/RESEARCH.md Part 2 §1 and §2 hold the sourced facts and the landmark specs.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres. Ground is ALWAYS ctx.world.heightAt(x,z). `rot` = rotation.y with local +Z as the FRONT (facing the street). Local to world: x = cx + lx*cos(rot) + lz*sin(rot); z = cz - lx*sin(rot) + lz*cos(rot).
4. Deterministic: never Math.random(); use ctx.rng.makeRng('landmarks:purpose'). In ctx.params.shot mode: no input, no DOM, no audio.
5. MeshStandardMaterial only; shared ctx.mats / ctx.tex are read-only (clone before changing, never dispose); UVs in METRES (ctx.geo.applyMetricUV); a `{ vertexColors: true }` variant needs a `color` attribute or it renders black. In-scene text is Simplified Chinese (landmark.name).
6. Read live blended ambience from ctx.env.current every frame (colours are THREE.Color).
7. No network requests, no external assets.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/landmarks-a.png "view=huashi&preset=autumn" shots/landmarks-b.png "view=princess"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h (eye height); preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool) and iterate. The script prints draw calls and triangles and exits non-zero on page errors. Final report: what you built, measured budget, anything you need from core.

=== PACKAGE: landmarks (花石楼, 公主楼, 蝴蝶楼, 元帅楼, 八大关宾馆) ===
OWNS: src/modules/landmarks.js (entry, replaces the stub) and src/modules/landmarks/**.

DATA: MAP.landmarks / MAP.landmarkById: `{ id, name, nameT, address, x, z, w, d, rot, baseY, floorY, y, height, street, gate {x, z, rot, width, open:true} }`. Core registered a w x d box collider tagged `landmark:<id>`; if your massing differs (tower, L-plan, terrace) call ctx.collision.removeTag('landmark:<id>') and add your own boxes and circles. The streetscape package builds the street wall and gate piers; everything inside the plot is yours.

1. 花石楼 `huashilou` at (102,113), the hero. A small granite castle on a knoll above the sea.
   - Plan: asymmetric L/T, about 16 x 14 m, on a granite terrace 1 to 1.5 m above the garden.
   - Main block: 3 storeys (about 3.6 m each), 11 to 12 m to a flat roof terrace behind a low crenellated parapet.
   - Round tower on the SEAWARD corner (the footprint corner with the largest world z): diameter 5.5 to 6 m, 17 to 18 m high (5 levels), engaged about three-quarters proud; crenellated top on a slightly corbelled ring (merlons 0.6 wide x 0.7 high, 0.5 gaps); narrow round-arched windows, one per level, staggered; flagpole.
   - Secondary volume: a lower half-octagon bay or stair turret, 2 storeys, with parapet.
   - Entrance: round-arched porch on stubby granite columns with a balustraded balcony above, facing the gate.
   - Walls, the signature: a patchwork of random-coursed rock-faced granite (ctx.mats.get('granite') and 'graniteWarm') and panels or bands of pebble-dash (ctx.mats.get('pebble')), with recessed darker joints. Granite `#B9B2A3` / `#9C9485` / `#7A7469`, pink-buff `#C2A893`.
   - Windows: tall, narrow, some paired under round arches, dark frames `#4A3A2C`; stained-glass accents in amber `#C8962E`, green `#3F7F5A`, red `#9C2F2A`; copper details `#5E8F7E`.
   - Setting: lawn terrace, low granite garden wall toward the sea, path from the gate, a few steps. Keep the south-west lawn open (the wedding couple stands at (86,131); MAP.views.huashi looks from (78,136)).
2. 公主楼 `gongzhulou` at (-150,-68): Danish fairy-tale villa.
   - Compact 12 x 10, 2 storeys + tall attic, on a grey granite plinth 0.8 m (`#8F8A80`).
   - Roof: very steep 55 to 60° cross-gable in red clay tile (`#A8452F` to `#8C3A2A`), eaves low to the first-floor window heads, ridge 12 to 13 m, gabled dormers, one tall chimney.
   - Spire: slender square or octagonal corner turret to 16 to 18 m with a green needle spire `#3E7F6C` and finial.
   - Walls: sea-green teal stucco `#5FA79B` (shadow side `#4C8C84`), white surrounds and corner trim `#F3EFE4`, small multi-pane white casements, small timber balcony, entrance porch with its own steep gablet, door `#6B3F26`.
   - Front faces 居庸关路 to the south; the spawn view sees it ahead-left, so the spire must read against the sky above the ginkgos.
3. 蝴蝶楼 `hudielou`: modest 2-storey villa 18 x 9; central block with two slightly angled projecting wings (butterfly plan); low hipped red roof 30 to 35° `#B4502F`; cream-yellow stucco `#E6D3A1` on a rusticated granite base; central recessed loggia with simple columns; green joinery `#3F5E4A`.
4. 元帅楼 `yuanshuailou`: Japanese-style, 2 storeys, 16 x 11, horizontal emphasis; low hip 25 to 30° with 0.9 m eaves and exposed rafters in `#7A4A3A` or `#5C5550`; tall granite rubble ground storey with buff stucco `#D9CBB0` above; horizontal window bands with dark timber `#3B2E25`; flat-canopy porch; garden with rockery, small pond and a bamboo clump.
5. 八大关宾馆 `binguan`: long 2 to 3 storey hotel block 40 x 16 in cream stucco on a granite base, red hipped roof with dormers, central porte-cochère, flagpoles, lawn.

Windows use ctx.mats.get('glass') with a share of ctx.mats.get('windowLit') (glows at dusk and in fog). Baked vertex-colour AO under eaves and at bases. Near each gate a granite name boulder with red engraved Simplified characters (landmark.name, `#B3261E`) from a canvas texture.

BUDGET: at most 25 draw calls, at most 90k triangles total (花石楼 up to 35k, 公主楼 up to 20k, others up to 12k each). Everything casts and receives shadows except glass.
CHECK VIEWS: huashi, huashiSea, boardwalk, aerialSE, princess, spawn in autumn; huashi in dusk and fog; plus `pos=-158,30&yaw=350` (宾馆), `pos=-221,70&yaw=320` (元帅楼), `pos=-233,90&yaw=165` (蝴蝶楼).
