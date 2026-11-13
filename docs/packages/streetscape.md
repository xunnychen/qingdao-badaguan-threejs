# Package: streetscape

Files owned: src/modules/streetscape.js, src/modules/streetscape/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no downloaded models or photo textures). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB.

READ FIRST: docs/DESIGN.md (all of it; §2 map, §4 palette, §5 MODULE CONTRACT), AGENTS.md (Lessons), then src/core/context.js, src/world/map.js (walls, gates, lamps, benches, junctions, streets, pointAt), src/core/materials.js, src/core/textures.js, src/core/geo.js, src/core/collision.js. docs/RESEARCH.md Part 2 §5 is the street-level material culture.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres. Ground is ALWAYS ctx.world.heightAt(x,z). `rot` = rotation.y with local +Z as the front (rot = atan2(dirX, dirZ)).
4. Deterministic: never Math.random(); use ctx.rng.makeRng('streetscape:purpose'). In ctx.params.shot mode: no input, no DOM, no audio.
5. MeshStandardMaterial only; shared ctx.mats / ctx.tex are read-only (clone before changing, never dispose); UVs in METRES; sRGB only on albedo canvases; alpha-TESTED (never blended) panels for railings. In-scene text is Simplified Chinese exactly as on the real signs (street.name, street.pinyin, landmark.name).
6. Read live blended ambience from ctx.env.current every frame (lampsOn 0..1).
7. No network requests, no external assets; system fonts only on canvases.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/street-a.png "view=wall&preset=autumn" shots/street-b.png "view=junction&preset=dusk"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h (eye height); preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool) and iterate. The script prints draw calls and triangles and exits non-zero on page errors. Final report: what you built, measured budget, anything you need from core.

=== PACKAGE: streetscape (garden walls, railings, gates, lamps, signs, benches) ===
OWNS: src/modules/streetscape.js (entry, replaces the stub) and src/modules/streetscape/**.
The continuous granite garden wall is THE street edge of 八大关; it is the most important thing in this package.

1. Garden walls from MAP.walls (144 runs, 5.8 km): `{ pts [[x,z]...], top 'rail'|'hedge'|'pierced', h 0.85..1.2, thickness 0.45, street, side }`.
   - Base: random granite rubble with raised cement pointing (ctx.mats.get('rubble')), height w.h above ground, following heightAt (sample every 2 m or less; the bottom goes 0.4 m below ground), with a flat or half-round coping (ctx.mats.get('coping')).
   - Piers: 0.5 m square, 1.6 to 1.9 m high, every 3 to 4 m and at run ends, pyramidal or ball caps (ctx.mats.get('granite')), instanced.
   - Top by w.top: 'rail' = wrought-iron railing 0.8 to 1.0 m between piers, spear or scroll pickets at 12 cm, black `#1F2321` or dark green `#27402F`, as alpha-tested double-sided panels from your own canvas (NOT one mesh per picket). 'pierced' = 0.5 m open-work masonry (alpha-tested panel or block pattern). 'hedge' = base and piers only: leave the top free, the life package grows the hedge on it.
   - Moss and damp darkening at the base (vertex colours); slight per-run tint variety.
2. Gates from MAP.gates (69): `{ x, z, y, rot, width, open, owner, tx, tz }` (tx, tz = unit direction along the wall).
   - Two granite piers 0.65 m square x 2.4 m, capped; lantern globes on about 30 % (ctx.mats.get('lampGlass')).
   - Double wrought-iron leaves with scroll or shield motifs (alpha-tested): closed when !gate.open; swung inward about 80° when gate.open (landmarks).
   - On a pier: a blue enamel house-number plate and a dark heritage plaque (优秀历史建筑); landmark gates carry landmark.name and landmark.address (MAP.landmarkById[gate.owner]). One canvas atlas.
3. Street lamps from MAP.lamps (121): `{ x, y, z, rot, kind 'lantern'|'twin', street }`.
   - Cast iron, dark green `#1E2B25` (ctx.mats.get('ironGreen')), 4.5 m, fluted post with a flared base.
   - 'lantern' = four-sided glass lantern with a small roof and finial; 'twin' = two-arm bracket with frosted globes. Glass = ctx.mats.get('lampGlass') (core drives its emissive from env.current.lampsOn).
   - When lampsOn > 0.05: a pool of at most ctx.quality.lampLights PointLights (`#FFD9A0`, distance about 16, decay 2, no shadows) moved to the lamps nearest the player, intensity scaled by lampsOn; a soft glow billboard per lamp (instanced, additive, depthWrite false; larger halos in the fog preset); a warm light-pool decal on the ground under each lamp.
4. Street-name signs at MAP.junctions (19): for each junction and each street through it, a standard Chinese blue plate 1.0 x 0.3 m (`#1F5FA8`, white border and text: street.name over street.pinyin, direction characters street.ends at the plate ends) on a grey steel pole 2.5 m, at the corner (offset along the street by the crossing street's half width + 2.5 m, lateral street.half + 0.7), not inside a tree or lamp. One canvas atlas. Register ctx.collision.addCircle(x, z, 0.1, 'sign').
5. Brown tourist signs (`#7A4A22`, 3 to 5) pointing to 花石楼, 公主楼, 第二海水浴场.
6. Benches from MAP.benches (13): timber slats `#7A5230` on black cast-iron scroll ends, 1.7 m long, facing b.rot.
7. Sparse clutter: paired green and grey litter bins near a few benches and junctions; low bollards at both ends of the 'beach-link' path; an engraved granite boulder reading 八大关 in red (`#B3261E`) near the 居庸关路 west node (-186,-44) and at the 山海关路/宁武关路 junction (-20,28). Add small circle colliders for these.

Core already registered colliders for walls, gate piers, closed gates, lamps and benches.
LAMP LIGHTS: the pooled PointLights are visible (and so in every lit program's light count) only while a lit preset is
shown or being faded to; they are hidden again once a daytime preset has finished fading in. The module exposes
`prewarm(on)` for core's shader warm-up: `prewarm(true)` shows the light state the page did NOT boot in, `prewarm(false)`
returns to the real one, so both program variants are compiled and drawn whatever the boot preset.
SIGNS NEAR LAMPS: plates and finger posts keep 4.5 m from every lamp (relaxed to 3 m, then 0, only if no corner allows
it; today the closest is 5.4 m), and the plate material is matt (roughness 0.86, no metal): a plate 1.5 m from a lit lamp
head was washed to white by its PointLight and the bloom. `debug=1` logs each plate's nearest-lamp distance.
MERGE: rubble walls and ironwork merged per material in 340 m chunks; piers and coping in 120 m chunks, lamp posts in 170 m
chunks (these three are hidden beyond ~190 m of the camera, more from the air); lamp glass, signs and furniture are one mesh each.
BUDGET: at most 30 draw calls, at most 220k triangles (measured on foot: ~35 calls / 180k incl. the shadow pass). Only the
rubble walls and bench timber cast shadows: piers, coping, railings, lamp posts and furniture do not (a railing bar or lamp
post is under one shadow texel, and the wall run beside each pier throws the shadow that reads).
CHECK VIEWS: wall, spawn, junction, plane, princess, promenade in autumn; junction and spawn in dusk (lamps lit, pools of light); downhill in fog (halos).
