# Package: villas

Files owned: src/modules/villas.js, src/modules/villas/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no downloaded models or photo textures). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB.

READ FIRST: docs/DESIGN.md (all of it; §2.3 lots, §2.4 archetypes, §4 palette, §5 MODULE CONTRACT), AGENTS.md (Lessons), then src/core/context.js, src/world/map.js (lots, ARCHETYPES, rectCorners, toLocal), src/core/materials.js, src/core/textures.js, src/core/geo.js. docs/RESEARCH.md Part 2 §3 and §4 hold the villa vocabulary and the eight archetypes in full.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres. Ground is ALWAYS ctx.world.heightAt(x,z). `rot` = rotation.y with local +Z as the FRONT (facing the street). Local to world: x = cx + lx*cos(rot) + lz*sin(rot); z = cz - lx*sin(rot) + lz*cos(rot).
4. Deterministic: never Math.random(); use ctx.rng.makeRng(lot.seed). In ctx.params.shot mode: no input, no DOM, no audio.
5. MeshStandardMaterial only; shared ctx.mats / ctx.tex are read-only (clone before changing, never dispose); UVs in METRES (ctx.geo.applyMetricUV); a `{ vertexColors: true }` material variant needs a `color` attribute on the geometry or it renders black.
6. Read live blended ambience from ctx.env.current every frame (colours are THREE.Color).
7. No network requests, no external assets.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/villas-a.png "view=wall&preset=autumn" shots/villas-b.png "view=aerialSE"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h (eye height); preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool) and iterate. The script prints draw calls and triangles and exits non-zero on page errors. Final report: what you built, measured budget, anything you need from core.

=== PACKAGE: villas (generic parametric villas) ===
OWNS: src/modules/villas.js (entry, replaces the stub) and src/modules/villas/**.

DATA: MAP.lots (64): `{ id, x, z, w, d, rot, arch 'A'..'H', seed, mirror, street, side, setback, baseY, floorY, gate, playable }`. `w x d` is the bounding footprint (core already registered it as the collider): keep all solid massing inside it; steps and porches may project up to 2 m toward the street. `floorY` is the ground-floor level, `baseY` the lowest ground under the footprint.

BUILD one villa per lot from its archetype, mirrored in local X when lot.mirror, varied from makeRng(lot.seed):
- A German Jugendstil: L-plan 14x11 + 5x5 wing; eaves 7.5, ridge 12.5; jerkinhead roof 48°; 2 gabled dormers, 2 chimneys; ochre 拉毛 stucco `#DDBE78`; granite base 1.2 m; stone quoins; half-timbered gable (`#5A3B28` on `#EFE6CF`); canted bay; arched stone door; green shutters `#2F5341`.
- B Castle / tower: 13x11 + round tower Ø4.5; flat crenellated parapet at 10.5, tower 14 (or a conical red cap 60°); full rock-faced granite; round-arched windows; loggia.
- C Nordic steep-roof: 11x9; eaves 5.5, ridge 12; cross-gable 55 to 60°; small spire turret to 16; pale blue `#9DBFCB` or mint `#A9CDB5` (NOT the 公主楼 teal); white trim; dormers; timber balcony.
- D Spanish: 16x10; eaves 7, ridge 9.5; low hip 22 to 25° in `#C2603A`; white-cream `#F1E9D6`; 3-arch ground loggia; iron balconies; small stair tower.
- E French mansard: 14x12 symmetrical; cornice 7.5, top 11; mansard (lower slope 70°, upper 20°) in `#8C3A2A` or slate `#5B5F66`; segmental dormers; warm grey `#C4BDAF` or blush `#D9B8A0`; white cornice and pilasters; central porch with balcony.
- F Japanese-modern: 17x10; eaves 6.5, ridge 9; hip 28° with 0.9 m eaves in `#6A4B3E`; buff `#D9CBB0` over a granite ground storey; horizontal window bands; flat-canopy porch.
- G English country: T-plan 18x9 + 7x6; eaves 7, ridge 11.5; cross-gable 42°; tall chimneys; pale yellow `#EBD9A0`; granite base 0.8 m; white sashes; timber veranda 2.5 m deep across the front.
- H Art Deco: 14x10 with a curved corner R=3; parapet 8 to 10; flat roof with pipe rail; off-white `#EFEADD` or grey `#B8B2A6` smooth stucco; corner strip windows; a porthole; slab canopy.

COMMON PARTS
- Plinth: rock-faced granite 蘑菇石 (ctx.mats.get('granite')) from baseY - 0.4 up to floorY.
- Storeys 3.4 to 3.8 m (ground) and 3.0 to 3.3 m (upper).
- Roofs: real thickness, 0.4 to 0.7 m eaves with soffit, closed gable ends; tile UVs with V up the slope and U along the eaves. Use at most 5 roof colours overall via ctx.mats.roof(hex): `#b5482e`, `#c2603a`, `#8c3a2a`, `#6a4b3e`, `#5b5f66`.
- Chimneys: 1 to 3, corbelled cap, clay pots.
- Windows: recessed, 0.9 to 1.2 wide x 1.5 to 1.8 high, frames with glazing bars in white `#F2EEE2`, dark green `#2F5341`, oxblood `#7A2E25` or brown `#5A3B28`. Glass = ctx.mats.get('glass'); about 35 % of windows use ctx.mats.get('windowLit') (core makes it glow at dusk and in fog).
- Entrance: 4 to 6 granite steps toward the gate, panelled door, canopy or porch.
- Stucco from ctx.mats.stucco(hex), palette: cream `#EADFC4`, ochre `#E0C27A`, pale yellow `#EBD9A0`, blush `#D9B8A0`, warm grey `#B8B2A6`, off-white `#EFEADD`.
- Ivy patches on 0 to 40 % of some walls, colour following env.current.ivy (one shared material updated in update()).
- Baked vertex-colour AO: under eaves, at wall bases, in window reveals (ctx.geo.tint / bakeGroundAO with `{ vertexColors: true }` variants).
- About 30 % of lots get a small garage or outbuilding in the same materials, beside or behind the house (register ctx.collision.addBox, tag 'villa-out').
- Run-off lots (lot.playable === false) may use a cheaper version.

The red roofs seen over granite walls and through trees are half of 红瓦绿树: silhouettes (gables, dormers, chimneys, turrets) matter more than small ornament.

MERGE: per material per spatial cluster (about 6 clusters). BUDGET: at most 45 draw calls, at most 320k triangles total (about 5k per villa). Walls and roofs cast and receive shadows; glass does not cast.
CHECK VIEWS: wall, spawn, junction, plane, overview, aerialSE in autumn; junction in dusk (lit windows); spawn in fog. Also shoot individual lots: `pos=<lot.gate.x>,<lot.gate.z>` with yaw facing the lot, at least one of every archetype.
