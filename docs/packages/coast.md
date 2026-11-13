# Package: coast

Files owned: src/modules/coast.js, src/modules/coast/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no downloaded models or photo textures). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB.

READ FIRST: docs/DESIGN.md (all of it: art direction and presets §1, world map §2, terrain §3, palette §4, MODULE CONTRACT §5), AGENTS.md (Lessons), then src/core/context.js, src/world/map.js, src/world/query.js, src/world/height.js, src/core/presets.js and the core helpers you use (src/core/textures.js, materials.js, geo.js, fog.js, collision.js). docs/RESEARCH.md is the factual research (Part 3 §1 sea, sand and rock; Part 4 §5 ocean technique).

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres, sea level y=0. Ground is ALWAYS ctx.world.heightAt(x,z). Compass yaw 0 = north. `rot` = rotation.y with local +Z as front (rot = atan2(dirX, dirZ)).
4. Deterministic: never Math.random(); use ctx.rng.makeRng('coast:purpose'). The scene must look finished at any time t with no warm-up. In ctx.params.shot mode: no input, no DOM, no audio.
5. MeshStandardMaterial only for lit solids; shared ctx.mats / ctx.tex are read-only (clone before changing, never dispose); UVs in METRES; sRGB only on albedo canvases; every material must fog (custom ShaderMaterial: fog:true + THREE.UniformsLib.fog + `vec4 mvPosition` + the four fog chunks, ending with tonemapping_fragment and colorspace_fragment).
6. Read live blended ambience from ctx.env.current every frame (colours are THREE.Color); sun direction is ctx.env.sunDir.
7. No network requests, no external assets.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/coast-a.png "view=beach&preset=autumn" shots/coast-b.png "view=reef&preset=dusk"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h (eye height); preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool) and iterate. The script prints draw calls and triangles and exits non-zero on page errors. Final report: what you built, measured budget, anything you need from core.

=== PACKAGE: coast (ocean, shore foam, reef rocks, boardwalk, far silhouettes) ===
OWNS: src/modules/coast.js (entry, replaces the stub) and src/modules/coast/**.

BUILD
1. Ocean: a custom ShaderMaterial (NOT the Water addon: no mirror pass) on plane(s) reaching the horizon (at least 3 km), dense near shore (ctx.quality.oceanSegments), surface at y=0.
   - Vertex: 3 to 4 summed Gerstner or sine waves, amplitude env.current.waveHeight, damped in shallow water. A sheltered bay: 0.3 to 0.6 m swell.
   - Depth: bake heightAt into a DataTexture (512², about x -420..420, z -40..480, NoColorSpace, linear filter; outside = deep) and sample it by world XZ.
   - Colour: mix(env.current.seaShallow, env.current.seaDeep, 1 - exp(-depth*k)). Yellow Sea milky jade green-teal; NEVER tropical cyan or ultramarine.
   - Normals: 2 to 3 scrolling octaves of your own tiling normal canvas.
   - Reflection: Schlick Fresnel of an analytic sky from env.current.skyHorizon and skyZenith.
   - Sun glitter path along ctx.env.sunDir, colour env.current.seaSpec, strength env.current.seaGlitter (strong in autumn and dusk, zero in fog).
   - Foam: shoreline foam from depth + noise; thin white swash lace sliding up and down the sand on a 7 to 10 s period; a foam ring around rocks; all scaled by env.current.foam.
   - Soft water edge (alpha fade as depth goes to 0, no hard z-fight line on the sand). No shadow receiving.
   - In the fog preset the horizon must disappear (the height fog does it if the fog chunks are right).
2. Reef rocks: low-poly stratified boulders and outcrops (displaced icosahedra or box clusters, 0.5 to 5 m), instanced with at most 4 base geometries. Place them at MAP.coast.reefClusters ([x, z, radius]), along the rocky shore between the boardwalk and the water (world.surfaceAt === 'rock', x 70..250), the headland point near (88,186), the west rocks near (-242,148), and a few skerries standing in the water. Colour: weathered reddish-brown and ochre granite `#8A5F4A` / `#9C6B4E` / `#B08A62`, dark algae and barnacle band `#2A2622` near y 0..0.5. Seated on heightAt, castShadow. Register ctx.collision.addCircle(x, z, r, 'reef') for boulders taller than 0.9 m, but keep walkable shelves: a wedding couple stands on the reef at (131.5, 133.5).
3. Boardwalk 海滨木栈道: timber deck 2.6 m wide along MAP.boardwalk.pts (raw polyline; the ground strip is flat at 3.5 m). Deck top at y 3.55 (the walker's feet are at 3.5), planks across (ctx.mats.get('boardwalk')), joists and posts down to the rock. Timber post-and-rope or rail handrail 1.05 m high on the seaward side, posts every 2 m, with a 3 m opening about every 25 m so the walker can step onto the reef. Add ctx.collision.addSegment for the rails (tag 'boardwalk-rail'). A short timber landing where it meets the promenade at (70,149).
4. Details: a dark seaweed wrack line on the sand; small orange and white buoys bobbing along MAP.coast.buoyLine; 1 or 2 slow distant ship silhouettes on the horizon; on the far headlands (the terrain package draws the land) a pale hotel slab on 汇泉角 near (-590,330) and pine silhouettes on 太平角 near (640,330), all simple shapes that fog fades.

NOT YOURS: sand and rock ground (terrain), seawall and promenade (terrain), gulls and people (life).
BUDGET: at most 12 draw calls, at most 90k triangles.
CHECK VIEWS: beach, huashiSea, boardwalk, reef, promenade, downhill, overview, aerialSE in autumn; reef and beach in dusk (glitter path from the west); beach and boardwalk in fog (pewter water, no horizon line).
