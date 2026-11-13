# Package: sky

Files owned: src/modules/sky.js, src/modules/sky/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no downloaded models or photo textures). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB.

READ FIRST: docs/DESIGN.md (all of it: art direction and presets §1, world map §2, MODULE CONTRACT §5, especially §5.6 height fog), AGENTS.md (Lessons), then src/core/context.js, src/core/presets.js, src/core/env.js, src/core/fog.js, src/core/loop.js. docs/RESEARCH.md Part 3 (atmosphere) and Part 4 §4, §6, §7 (sky, fog, shadows) are the background.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres. Compass azimuth 0 = north (-z), 90 = east. ctx.env.sunDir is the live unit vector toward the sun; ctx.env.windDir the wind direction.
4. Deterministic: never Math.random(); use ctx.rng.makeRng('sky:purpose'). The scene must look finished at any time t with no warm-up. In ctx.params.shot mode: no input, no DOM, no audio.
5. Custom ShaderMaterials that draw to screen end with tonemapping_fragment and colorspace_fragment. The sky dome itself is NOT fogged (fog:false); fog wisps are.
6. Read live blended ambience from ctx.env.current every frame (colours are THREE.Color). Preset switches cross-fade over 3.5 s; everything you drive must follow smoothly.
7. No network requests, no external assets.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/sky-a.png "view=spawn&preset=autumn" shots/sky-b.png "view=beach&preset=dusk"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h; preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool) and iterate. The script prints draw calls and triangles and exits non-zero on page errors. Final report: what you built, measured budget, anything you need from core.

=== PACKAGE: sky (sky dome, sun, clouds, lights, shadows, environment, fog wisps) ===
OWNS: src/modules/sky.js (entry, replaces the stub) and src/modules/sky/**.
You are the ONLY package that creates directional or hemisphere lights. Publish them as `ctx.lights = { sun, hemi }`.

BUILD
1. Sky dome: a custom ShaderMaterial on a camera-centred inverted sphere or box (inside camera.far = 4000, depthWrite false, drawn first); set scene.background to null. Do NOT use the `Sky` addon: the presets give exact art-directed colours and exposure 1.0 is the reference.
   - Vertical gradient env.current.skyHorizon to skyZenith; horizonHaze sets how thick the pale horizon band is.
   - Sun-side glow lobe in skySunGlow around env.sunDir; opposite side tinted skyAntiSolar.
   - Sun disc scaled by sunDisc, HDR-bright so bloom catches it in autumn and dusk; in the fog preset a pale disc you could look at.
   - Below the horizon: the fog colour, so far terrain and sea melt into the sky.
2. Clouds in the same shader: tileable FBM, two layers (high streaks and low cumulus) drifting at cloudSpeed along env.windDir; coverage and density from cloudCoverage / cloudDensity; lit side cloudLit, shaded side cloudShade, a silver lining near the sun; near-overcast in fog.
3. Lights: one sun (colour sunColor, intensity sunIntensity, direction env.sunDir) and a HemisphereLight (hemiSky, hemiGround, hemiIntensity).
4. Shadows (renderer is PCFShadowMap): put the sun behind a `makeSun()` factory. Preferred: the `SunLight` addon (three/addons/lights/SunLight.js, 2 cascades; read its source in node_modules first; it has no .target and defaults to bias 0). Fallback: a texel-snapped DirectionalLight that follows the camera. Use ctx.quality.shadowMapSize and ctx.quality.shadowDistance. Tune bias and normalBias: no acne on roads, no peter-panning at wall bases. shadow.radius = env.current.shadowRadius, shadow.intensity = env.current.shadowStrength. If SunLight misbehaves under software GL screenshots, ship the fallback and say so. Never import three/addons/csm/CSM.js.
5. Environment map (when ctx.quality.envMap): PMREM of the dome with the sun disc hidden, regenerated at start and when a preset blend finishes; scene.environmentIntensity about 0.3 to 0.5.
6. Fog: core applies the preset baseline every frame before your update (ctx.setFog). You may refine the colour so it matches the dome's horizon exactly. Never replace scene.fog.
7. Fog wisps when env.current.fogWisps > 0: 30 to 50 large soft billboards (instanced, noise alpha, depthWrite false, fog-coloured) drifting inland from the sea at 0.3 to 0.8 m/s around the player (recycle within about 150 m), denser near the shore and low ground, fading with fogWisps. Pre-distributed so any t looks right.

LOOK TARGETS
- autumn: clear deep-blue zenith, pale hazy horizon, crisp long slightly blue shadows across the streets; the sun sits over the sea to the SSW.
- fog: shadowless pearl grey, no visible blue, treetops and turrets float.
- dusk: orange horizon band under slate blue, very long soft violet shadows.
- spring: milky pale blue, soft medium shadows.
- In every preset shaded asphalt and north-facing walls must stay readable (not black) while sunlit surfaces do not blow out. The current stub is too contrasty; balance with the hemisphere light and environment map, keeping the preset numbers as the baseline (report any multiplier you apply).

BUDGET: at most 6 draw calls and 5k triangles of your own; shadow passes are shared.
CHECK VIEWS: spawn, downhill, cedar, beach, overview in all four presets; wall (close-up shadow quality).
