# Package: terrain

Files owned: src/modules/terrain.js, src/modules/terrain/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no downloaded models or photo textures). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB.

READ FIRST: docs/DESIGN.md (all of it: art direction and presets §1, world map §2, terrain §3, palette §4, MODULE CONTRACT §5), AGENTS.md (Lessons), then src/core/context.js, src/world/map.js, src/world/query.js, src/world/height.js, src/core/presets.js and the core helpers you use (src/core/textures.js, materials.js, geo.js, fog.js, collision.js). docs/RESEARCH.md is the factual research.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres, sea level y=0. Ground is ALWAYS ctx.world.heightAt(x,z). Compass yaw 0 = north. `rot` = rotation.y with local +Z as front (rot = atan2(dirX, dirZ)).
4. Deterministic: never Math.random(); use ctx.rng.makeRng('terrain:purpose'). The scene must look finished at any time t with no warm-up. In ctx.params.shot mode: no input, no DOM, no audio.
5. MeshStandardMaterial only; shared ctx.mats / ctx.tex are read-only (clone before changing, never dispose); UVs in METRES; sRGB only on albedo canvases; every material must fog (custom ShaderMaterial: fog:true + THREE.UniformsLib.fog + `vec4 mvPosition` + the four fog chunks, ending with tonemapping_fragment and colorspace_fragment).
6. Read live blended ambience from ctx.env.current every frame (colours are THREE.Color).
7. No network requests, no external assets.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/terrain-a.png "view=spawn&preset=autumn" shots/terrain-b.png "view=beach"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h (eye height); preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool) and iterate. The script prints draw calls and triangles and exits non-zero on page errors. Final report: what you built, measured budget, anything you need from core.

=== PACKAGE: terrain (ground, roads, sidewalks, paving, promenade and seawall) ===
OWNS: src/modules/terrain.js (entry, replaces the stub) and src/modules/terrain/**.

BUILD
1. Near ground mesh over x -300..300, z -272..240 on a grid of ctx.quality.terrainStep metres (2; 3 on low), y = heightAt. One material that blends surfaces crisply (edges sharp to about 0.5 m): recommended is a baked control texture (2048², 1024² on low, about 0.3 m per texel) built from world.surfaceAt + heightAt, sampled in an onBeforeCompile-patched standard material that mixes world-space tiling detail from ctx.tex ('grass', 'sand', and a rock texture of your own or 'rubble'). Surfaces: park lawn ('lawn') and private garden ground ('garden', slightly darker, bare earth under dense planting); both grass colours follow env.current.lawn LIVE through a uniform. Sand `#DCC898` with a darker, smoother wet band near the waterline (height < 0.35 m: `#B9A878`, lower roughness). Rock: weathered reddish-brown Qingdao granite `#8A5F4A` / `#9C6B4E` / `#B08A62` with a near-black algae band `#2A2622` at height 0..0.5 m. Sea bed continues under water (the coast package draws the water at y=0).
2. Far field: coarse rings from the near mesh out to about ±1400 m following heightAt (it already contains 太平山 to the north, 汇泉角 south-west, 太平角 east), dark wooded colour with faint roof-red speckle, skirts so there are no cracks. Far rings do not need to receive shadows.
3. Roads: for every MAP.streets entry an asphalt ribbon of width street.width along street.pts (2 m samples, at least 3 quads across, 2 cm crown), y = heightAt + 0.03, ctx.mats.get('asphalt'), metre UVs. Clean junction fills at MAP.junctions (no z-fighting: polygonOffset or render order). Faint worn centre line at most. Include the run-off beyond the playable bounds.
4. Kerbs: granite, 0.15 m wide, top 0.13 m above the road, both sides (ctx.mats.get('kerb')), dropped at junction mouths and at every gate (MAP.gates: street, side, s, width).
5. Sidewalks: slab ribbons (ctx.mats.get('paving')) from the kerb to street.wallOff - 0.22, y = heightAt + 0.14, with a 1.3 m square dark-earth tree pit with granite edging at every street tree (MAP.trees where t.street is set).
6. Depress the terrain MESH (never heightAt) by about 0.12 m inside road and sidewalk corridors so it cannot poke through.
7. Footpaths MAP.paths: kind 'paving' as slabs, 'gravel' as warm gravel `#C9B999` with soft edges. A 3 m path from every gate to its owner's front (lot or landmark centre + front direction * d/2).
8. Promenade (MAP.promenade: raw polyline pts, width 5, y 3.5): granite paving with mitred corners and a darker edge course. Seawall along the seaward edge (offset 2.5 m): rock-faced granite (ctx.mats.get('granite')) from 3.5 m down to 0.5 m below the sand, with coping and a low granite parapet (0.9 m high, 0.35 thick, piers every 4 m). Core already registered the parapet collider with openings at the stairs. Stairs at MAP.promenade.steps (x, z, width 4.4, run 4.0): about 12 granite steps from 3.5 m down to 1.6 m with cheek walls (heightAt already ramps there).

NOT YOURS: boardwalk deck and reef boulders (coast), garden walls, gates and lamps (streetscape), trees, hedges, leaf litter.

LIVE: lawn colour from env.current.lawn; optional wetter, darker asphalt in the fog preset.
BUDGET: about 30-45 frustum-culled draw calls (ground in 4x4 chunks, roads / kerbs / paving in 300 m cells; the original 14-call figure was an unculled whole-map mesh), at most 260k triangles in view on foot. Ground and roads receive shadows; seawall and parapet cast.
CHECK VIEWS: spawn, downhill, plane, junction, promenade, beach, park, overview, top (autumn); downhill and beach (fog).
