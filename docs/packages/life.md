# Package: life

Files owned: src/modules/life.js, src/modules/life/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no downloaded models or photo textures). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB.

READ FIRST: docs/DESIGN.md (all of it; §1.1 presets: litter, particles, motes, gulls, butterflies, lawn, hedge, ivy; §2 map; §5 MODULE CONTRACT), AGENTS.md (Lessons), then src/core/context.js, src/world/map.js (walls, trees, figures, parks, lots, streets), src/world/query.js (treesNear, surfaceAt, nearestStreet, parkAt), src/core/presets.js, src/core/wind.js. docs/RESEARCH.md Part 3 §2 (particles and extras) and Part 2 §5 (people) are the background.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres. Ground is ALWAYS ctx.world.heightAt(x,z). `rot` = rotation.y with local +Z as the front.
4. Deterministic: never Math.random(); use ctx.rng.makeRng('life:purpose'). The scene must look finished at ANY time t with no warm-up (drive particles from per-instance seeds + time in the vertex shader). In ctx.params.shot mode: no input, no DOM, no audio.
5. MeshStandardMaterial for lit solids; foliage, leaves and petals alpha-TESTED; additive points allowed for motes; every material must fog (custom ShaderMaterial: fog:true + THREE.UniformsLib.fog + `vec4 mvPosition` + the four fog chunks, ending with tonemapping_fragment and colorspace_fragment); shared ctx.mats / ctx.tex are read-only.
6. Read live blended ambience from ctx.env.current every frame (colours are THREE.Color); wind from ctx.wind (dir, power, gust, uniforms) and the 'gust' event.
7. No network requests, no external assets.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/life-a.png "view=ginkgo&preset=autumn" shots/life-b.png "view=peach&preset=spring"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h (eye height); preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool) and iterate. The script prints draw calls and triangles and exits non-zero on page errors. Final report: what you built, measured budget, anything you need from core.

=== PACKAGE: life (hedges, shrubs, grass, leaf litter, falling leaves and petals, gulls, people) ===
OWNS: src/modules/life.js (entry, replaces the stub) and src/modules/life/**.

1. Hedges: on every MAP.walls run with top === 'hedge', a clipped box or holly hedge about 0.7 m high x 0.5 m thick sitting on the wall base (wall top y = heightAt + w.h), slightly irregular, leafy texture of your own, colour env.current.hedge. Merged in spatial chunks. Casts shadows.
2. Garden planting: rounded shrubs and flower clumps (instanced) between wall and house on lots (MAP.lots; keep clear of the house footprint w x d and of the gate-to-door line), a few in parks. Hydrangea heads in the fog preset (`#8FA6C8`, `#C9A6C4`). Creeper spilling over some wall runs, colour env.current.ivy.
3. Grass tufts (only when ctx.quality.grass): instanced alpha-tested tufts in MAP.parks and on the lawn behind the promenade, within about 40 m of the player (recycled grid), colour env.current.lawn, no shadows.
4. Leaf litter, driven by env.current.litter { ginkgo, maple, plane, petals } (0..1, scale counts or fade smoothly):
   - Instanced flat leaves; dense drifts along kerbs (street.half ± 0.4 from the centre line) and wall bases (street.wallOff - 0.4) under street trees of that species (MAP.trees with t.street set), sparse on the carriageway.
   - y = heightAt + 0.03 on the road, + 0.16 on the sidewalk. No shadows.
   - Colours: ginkgo `#E2B32E`; maple `#B8452A` / `#D9A21E`; plane russet `#8F6A2C`.
   - Petal carpets `#F2B6C6` / `#FFD9E2` under the peach trees (韶关路) and crabapples (宁武关路) in spring.
5. Falling particles by env.current.particles, count = base x ctx.quality.particles x env.current.particleAmount:
   - 'leaves' (base about 600): fan-shaped ginkgo and maple leaves in a volume about 35 m around the player, only under or near deciduous trees (world.treesNear), starting at canopy height, slow spiral 0.6 to 1 m/s with tumbling; gusts (ctx.wind.gust) release bursts and push along ctx.wind.dir.
   - 'petals' (base about 500): pink and white, fluttering sideways drift.
   - 'drips' (sparse): drops under cedars in the fog preset.
6. Motes (env.current.motes): tiny bright additive points near the camera that read as dust in sun shafts in autumn and as back-lit midges at dusk.
7. Birds: env.current.gulls gulls with flapping and gliding wings (vertex-animated, a few triangles each) circling over the bay and headland (around (60,200), radius 60 to 120 m, altitude 12 to 40 m), sometimes passing over the promenade; in fog they appear and vanish. env.current.butterflies butterflies in the parks in spring. Optional magpies or sparrows hopping in the streets.
8. People from MAP.figures (9): `{ id, kind, dress, x, y, z, rot }`; rot is the direction the subject faces.
   - 'wedding': bride (white gown `#F4F1EA` with a long train, or red qipao `#B3261E` when dress === 'red') and groom (dark suit `#1E2230`), plus a photographer about 5 m in front of them (crouching, camera raised) and an assistant holding a round silver reflector Ø1 m (`#D8D8D2`).
   - 'stroller': one person standing, looking at the sea. 'elder': with a cane.
   - Stylised low-poly (lathe or capsule bodies, no faces, at most 600 triangles each), static poses with a slight sway of hem and train in the wind. Cast shadows. Register ctx.collision.addCircle(x, z, 0.35, 'figure') for each person.
   - These couples are the signature human presence; a distant white dress under the ginkgo or on the reef should read at 60 m.

NOT YOURS: trees (trees package), wall bases and railings (streetscape), sea and rocks (coast).
BUDGET: at most 30 draw calls, at most 120k triangles. Only hedges, shrubs and figures cast shadows.
CHECK VIEWS: ginkgo and spawn in autumn (leaf fall, litter, couple on 居庸关路); peach and crabapple in spring (petals, carpets); beach and huashi (couples, gulls); park; cedar in fog (drips); maple; wall (hedge on a wall).
