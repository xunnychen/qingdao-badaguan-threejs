# Package: trees

Files owned: src/modules/trees.js, src/modules/trees/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no downloaded models or photo textures). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB.

READ FIRST: docs/DESIGN.md (all of it; §1.1 foliage palettes, §2 map, §5 MODULE CONTRACT), AGENTS.md (Lessons), then src/core/context.js, src/world/map.js (trees, SPECIES), src/core/presets.js (foliage, leafFill), src/core/wind.js, src/core/textures.js, src/core/materials.js. docs/RESEARCH.md Part 1 §3, Part 3 §1 and Part 4 §8 cover the species and the instancing technique.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres. Ground is ALWAYS ctx.world.heightAt(x,z) (each tree record already carries y).
4. Deterministic: never Math.random(); use ctx.rng.makeRng(...) or tree.seed. The scene must look finished at any time t. In ctx.params.shot mode: no input, no DOM, no audio.
5. MeshStandardMaterial (patched with onBeforeCompile where needed); foliage is alpha-TESTED (alphaTest, optionally alphaToCoverage), never alpha-blended; sRGB only on albedo canvases; bleed leaf colour into transparent pixels of leaf atlases; shared ctx.mats / ctx.tex are read-only.
6. Read live blended ambience from ctx.env.current every frame (colours are THREE.Color). ctx.env.sunDir is the live sun direction.
7. No network requests, no external assets.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/trees-a.png "view=ginkgo&preset=autumn" shots/trees-b.png "view=peach&preset=spring"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h (eye height); preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool) and iterate. The script prints draw calls and triangles and exits non-zero on page errors. Final report: what you built, measured budget, anything you need from core.

=== PACKAGE: trees (street trees per species, garden trees, wind, instancing) ===
OWNS: src/modules/trees.js (entry, replaces the stub) and src/modules/trees/**.
一路一树: each street has its own species, so each street must have its own canopy shape, colour and light. This is the main thing that separates 八大关 from a generic park.

DATA: MAP.trees (about 1200): `{ x, y, z, species, h, r, trunk, rot, seed, tone 0..3, street, garden }` (h = height, r = canopy radius, trunk = trunk radius). MAP.SPECIES gives the form per species. Core already registered trunk colliders.

SPECIES (2 to 3 geometry variants each)
- ginkgo 银杏 (居庸关路): upright, 12 to 16 m, fan-leaf clusters, trunk `#4A4038`. Pure gold in autumn; the avenue must glow when back-lit.
- maple 五角枫 (嘉峪关路): round crown 9 to 12 m; several tones on ONE tree (vary tone per leaf card): yellow, orange, russet, a little scarlet, some green.
- plane 法国梧桐 (山海关路): tall vase 15 to 19 m, mottled cream-olive camouflage bark (own canvas, `#C9C4A8` / `#8C9070` patches), broad canopy meeting over the road, lowest limbs 4.5 m or more above the ground.
- cedar 雪松 (紫荆关路): conical 15 to 20 m, tiered drooping blue-green boughs; lowest tier at least 2.6 m above the sidewalk so the walker passes under; rows on both sides form a dark tunnel.
- juniper 龙柏 (临淮关路): dark flame-shaped twisted column to the ground, 5.5 to 7.5 m, dense; a green corridor.
- pine 黑松 (coast, 黄海路, 花石楼 headland): wind-bent trunk leaning inland (away from the sea, 5 to 20°), flat irregular cloud pads, dark.
- peach 碧桃 (韶关路): small vase about 4 m; in spring dense blossom, pink, white and deep red mixed even on one tree; sparse yellow-green otherwise.
- crabapple 海棠 (宁武关路): rounded about 5 m; pale pink-white blossom in spring.
- crape myrtle 紫薇 (正阳关路): multi-stem, smooth pale bark, 3 to 4.5 m; magenta panicles at the branch tips in the dusk (late summer) preset.

TECHNIQUE
- Per tree: merged low-poly trunk and limbs (bark from ctx.mats.bark(hex) or your own) plus 12 to 30 alpha-tested leaf-cluster cards with normals bent toward a sphere. Leaf atlases are your own canvases, drawn in neutral light tones so colour comes from the palette.
- Colour: env.current.foliage[species] is a live array of 4 THREE.Color; tree.tone picks one. Use a per-instance attribute (tone + brightness jitter) and a `uniform vec3 uPalette[4]` per species material, updated every frame while ctx.env.transitioning, so presets cross-fade smoothly. In bloom seasons the palette IS the blossom colour.
- env.current.leafFill[species] (0..1, present for deciduous species) thins the canopy (discard cards by per-card hash).
- Back-light: add a cheap transmission term (palette colour * max(dot(-N, sunDir), 0) * k) so leaves glow against the sun.
- Wind: ctx.wind.apply(material, { sway, flutter }) or your own code on ctx.wind.uniforms (uTime, uWind, uGust). A matching customDepthMaterial only if sway exceeds about 5 cm.
- LOD by spatial cell (about 80 to 125 m cells): near 300 to 700 triangles, mid 100 to 200, far crossed cards (4 to 12 triangles, no shadow). Switch whole cells by distance with hysteresis using ctx.quality.treeLodNear / treeLodFar. One InstancedMesh per species x part x LOD x cell; computeBoundingSphere() after writing matrices; setColorAt before first render if you use it.
- Shadows: near and mid canopies and trunks cast (alpha-tested). Dappled shade on the roads is essential.
- Backdrop belt: about 250 extra far-LOD trees of mixed species on land 300 to 420 m from the centre (outside MAP.EXTENT, heightAt > 1, world.backDist > 10) to hide the world edge. No colliders.
- ctx.quality.treeDensity < 1: drop garden trees by hash, never street trees.

BUDGET: at most 70 draw calls, at most 500k visible triangles.
CHECK VIEWS: ginkgo, cedar, plane, juniper, maple, spawn, overview in autumn; peach and crabapple in spring; crape in dusk; downhill in fog; boardwalk (pines).
