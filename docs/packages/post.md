# Package: post

Files owned: src/modules/post.js, src/modules/post/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB (currently no post-processing: core's default ctx.render.fn calls renderer.render with ACES tone mapping).

READ FIRST: docs/DESIGN.md (all of it; §1.1 presets: exposure, bloom*, saturation, contrast, gradeTint, vignette, godrays; §5 MODULE CONTRACT), AGENTS.md (Lessons), then src/core/context.js (render, viewport, setPixelRatio, resize event), src/core/loop.js, src/core/quality.js, src/core/presets.js, src/main.js (shot mode). docs/RESEARCH.md Part 4 §11 is the post-processing technique and ordering rules.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Read live blended ambience from ctx.env.current every frame (colours are THREE.Color); ctx.env.sunDir is the live unit vector toward the sun. Core sets renderer.toneMapping (ACES Filmic) and renderer.toneMappingExposure = env.current.exposure every frame; do not fight it.
4. Deterministic: never Math.random() (hash-based grain is fine; in ctx.params.shot mode use a fixed grain seed). In shot mode: no input, no DOM.
5. No network requests, no external assets.

VERIFY: `npm run build` must pass. Then screenshot the BUILT site, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time (if the gate waits, wait; never bypass):
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/post-a.png "view=spawn&preset=autumn" shots/post-off.png "view=spawn&preset=autumn&skip=post"`
Query: view=<MAP.views id> or pos=x,z + yaw + pitch + h; preset=autumn|fog|dusk|spring; q=low|medium|high; only=a,b / skip=a,b. LOOK at each PNG (Read tool), compare with skip=post, and iterate. Screenshots run on software GL (SwiftShader): your pipeline MUST work there. The script prints draw calls and exits non-zero on page errors. Final report: what you built, measured cost, anything you need from core.

=== PACKAGE: post (post-processing) ===
OWNS: src/modules/post.js (entry, replaces the stub) and src/modules/post/**.

PIPELINE (classic EffectComposer from three/addons/postprocessing; install it with `ctx.render.set((dt) => composer.render(dt))`; never also call renderer.render):
1. RenderPass(scene, camera) into a HalfFloat render target with `samples: ctx.quality.msaa` (4 on medium and high).
2. Bloom (when ctx.quality.bloom): UnrealBloomPass at half resolution, in linear HDR; strength, threshold and radius from env.current.bloomStrength / bloomThreshold / bloomRadius, live.
3. God rays (when ctx.quality.godrays and env.current.godrays > 0): screen-space radial blur from the sun's screen position (project camera.position + sunDir * far), 24 to 32 taps at half resolution, occluded by scene depth or by a bright-sky mask; only while the sun is in or near the frustum; fade out toward the edges; intensity env.current.godrays. Target look: shafts through the cedar tunnel on 紫荆关路 and the plane and ginkgo avenues in autumn and dusk. It must never wash out the whole frame.
4. OutputPass (tone mapping + sRGB, exactly once; never add a manual gamma pass).
5. One combined display-space ShaderPass: saturation (env.current.saturation), contrast (contrast), multiply tint (gradeTint), vignette (vignette), fine film grain and ±0.5/255 dither against sky and fog banding.
6. FXAA (FXAAPass) as the very last pass only when msaa is 0.

RULES AND FALLBACKS
- Call composer.setPixelRatio(ctx.viewport.pixelRatio) and composer.setSize(width, height) right after construction and on the 'resize' event (also resize the bloom and god-ray targets).
- low tier (ctx.quality.msaa === 0 and !ctx.quality.bloom): either bypass the composer (leave core's default render) or run grade + FXAA only; keep it cheap.
- Software GL: if a multisampled HalfFloat target fails (incomplete framebuffer, GL errors or a black frame), fall back to samples 0 + FXAA automatically and say so in the report.
- Adaptive resolution (not in shot mode): if the average frame time exceeds 22 ms over 2 s, lower the pixel ratio by 0.25 (floor 0.75) with ctx.setPixelRatio; raise it again slowly when under 12 ms. Hysteresis so it does not oscillate.
- A 0.8 s fade from black on the 'start' event.
- No SSAO or GTAO (the scene uses baked vertex AO), no depth of field, no motion blur.
- Publish `ctx.post = { composer, setEnabled(on) }`.
- dispose() restores the default render function and frees targets.

LOOK TARGETS: autumn = warm highlights on red roofs and granite, a gentle glow on back-lit gold leaves, clean blue sky with no banding; fog = desaturated (0.72), soft, lamp halos blooming gently; dusk = strongest bloom and warm grade, deepest vignette; spring = light and milky. The grade must be subtle: compare against skip=post and avoid crushed shadows.

BUDGET: at most 4 full-screen passes plus the bloom mip chain.
CHECK VIEWS: spawn, ginkgo, cedar, huashiSea, beach in autumn; cedar and beach in dusk; downhill in fog; peach in spring; each with q=medium and at least spawn with q=high and q=low.
