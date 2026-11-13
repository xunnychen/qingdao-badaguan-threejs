# Package: ui-audio

Files owned: src/modules/ui.js, src/modules/ui/**, src/modules/audio.js, src/modules/audio/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript, no asset files). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES TWO STUBS (ui.js: click-to-start overlay; audio.js: silent).

READ FIRST: docs/DESIGN.md (all of it; §1 art direction and presets incl. the audio mix rows, §2 map, §5 MODULE CONTRACT: ctx.app, ctx.state, events), AGENTS.md (Lessons), then src/core/context.js, src/core/presets.js, src/core/env.js, src/world/map.js (pois, intro, streets, SPECIES, landmarks, coast, lots, parks), src/world/query.js, index.html (boot overlay, #ui-root, font stack), src/main.js. docs/RESEARCH.md Part 3 §3 is the full procedural-audio recipe and §4 the captions.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape, for BOTH entry files: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. Each must work while every other module is still a stub; ui.js and audio.js talk to each other only through ctx (ctx.audio) and events.
3. Axes: +x east, +z SOUTH (sea), +y up, metres. Compass yaw in ctx.player.yaw (radians): 0 = north, +PI/2 = east.
4. In ctx.params.shot mode: ui.js creates NO DOM and audio.js creates NO AudioContext.
5. UI text in Traditional Chinese (繁體中文): use nameT fields, MAP.pois and MAP.intro (already Traditional). The UI face is a SELF-HOSTED Noto Serif TC subset (src/modules/ui/fonts, about 400 characters, OFL; `npm run check:fonts` fails the build when new copy falls outside it: then `node src/modules/ui/fonts/subset.mjs --write` and `fonts/build.py`), with the system stack ("Source Han Serif TC", "Songti TC", PMingLiU, serif) as fallback. No third-party network requests, no audio or image files: WebAudio synthesis and CSS/canvas only. CSS is imported from your JS (`import './ui/ui.css'`).
6. Read live blended ambience from ctx.env.current every frame.
7. Never Math.random() for anything visible; audio timing may use ctx.rng.makeRng.

VERIFY: `npm run build` must pass, and normal shots must still exit 0. For UI visuals capture the interactive page with `shot=0` (add your own `uitest=title|play|pause|caption|minimap` parameter, read from location.search inside ui.js, to force a state without a user gesture). Always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time:
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/ui-title.png "shot=0" shots/ui-play.png "shot=0&uitest=play" shots/ui-ok.png "view=spawn" --delay=2500`
Also shoot a phone size with `--size=390x844`. LOOK at each PNG (Read tool) and iterate. The script exits non-zero on page errors. Audio cannot be heard headless: review node graphs carefully, guard every scheduling path, and confirm no errors with `shot=0&uitest=play`. Final report: what you built, how you checked it, anything you need from core.

=== PACKAGE: ui-audio (title screen, HUD, captions, minimap, help + procedural soundscape) ===
OWNS: src/modules/ui.js, src/modules/ui/**, src/modules/audio.js, src/modules/audio/**.

UI (DOM inside ctx.uiRoot; its children get pointer-events:auto, so keep the play HUD click-through)
Style: sparse, quiet, nostalgic 1930s seaside. Ink `#F3EFE4` on deep sea `#16262B`, accents roof red `#B5482E` and ginkgo gold `#E2B32E`, serif type, generous letter-spacing. It must work on a phone.
1. Title screen (shown once core emits 'ready' and the boot overlay fades): 八大關, 「紅瓦綠樹，碧海藍天」, MAP.intro.text; four preset cards (label and sub from ctx.env.presets, current one marked; choosing calls ctx.app.setPreset(id)); a 開始漫步 button that calls ctx.app.start() INSIDE its click handler (the player locks the pointer and audio resumes in that gesture); controls help that differs for touch (ctx.quality.isTouch); quality selector 低/中/高 (ctx.app.setQuality(tier) reloads); sound toggle.
2. Pause overlay on the 'pause' event (pointer lock lost): 繼續 button calling ctx.app.resume() inside the click handler; preset switcher; help; quality; volume slider. Hide on 'resume'.
3. HUD while playing: the current street (world.nearestStreet within street.half + street.sidewalk: street.nameT and its tree's SPECIES nameT) fading in when it changes; a small compass; a preset toast (label and sub) on the 'preset' event; key hints that fade after 8 s. Keys: 1 to 4 choose a preset, P next preset, M minimap, H help, N mute.
4. POI captions from MAP.pois: kind 'place' (x, z, r) fires when the walker first comes within r (again only after leaving beyond 2r); kind 'street' fires after about 2 s on that street, once per session. Card shows title, sub, the quote in large serif and the text; auto-hides after about 9 s; one at a time. Emit ctx.events.emit('poi', poi).
5. Minimap (toggle M; about 170 px, larger on desktop): a static layer pre-rendered once from MAP (sea and MAP.coast.waterline, beach sand, streets at their widths, promenade and boardwalk, parks, lots as roof-red rectangles, landmarks highlighted with nameT labels), north up, plus the player arrow (ctx.player.pos, yaw) redrawn at about 15 fps.
6. Optional hint on the 'boundary' event: 「前方已是八大關之外」.
7. Touch: small buttons for presets, minimap and pause in the TOP corners only (the player package uses the lower-left for a joystick and the right half for drag-look).
8. Respect prefers-reduced-motion; buttons focusable; throttle DOM writes (no layout work every frame).

AUDIO (WebAudio only; follow docs/RESEARCH.md Part 3 §3)
- Create or resume the AudioContext on the 'start' and 'resume' events (user gesture); suspend on 'pause'. Chain: master gain, compressor, destination. One generated convolver reverb (stereo noise x exp(-t/1.8 s)). Shared 4 s looping white, pink and brown noise buffers.
- Publish `ctx.audio = { setVolume(v), setMuted(on), volume, muted }`; persist with ctx.store ('vol', 'mute'); honour ctx.params.mute.
- Mix from env.current.audio, live and smoothed: surf, wind, rustle, birds, gulls, cicadas, foghorn, horn, drips, lowpass (master low-pass on everything except footsteps: 3.5 kHz in fog), reverb (send level).
- Layers:
  - surf: two overlapping swell-crash-retreat voices on a 7 to 11 s period; gain and low-pass cutoff driven by world.shoreDist(player) so the sea swells as you walk downhill.
  - wind in pines and cedars (松濤): band-passed pink noise with slow LFOs, boosted near cedar and pine (world.treesNear).
  - deciduous rustle: synced to ctx.wind.gust.
  - gulls: gliding formant calls, heavy reverb, every 15 to 40 s, louder near the shore.
  - sparrows and magpies.
  - cicadas: a wall of sound in the dusk preset.
  - distant ship horn: every 60 to 150 s.
  - foghorn 「海牛」: 85 Hz, 5 s, about every 30 s, fog preset only.
  - drips: fog preset.
- Footsteps on the 'footstep' event `{ surface, running, x, z }`: road, sidewalk, promenade, path = granite thump; boardwalk = hollow wood knock; sand = soft hiss; lawn and garden = grass; water = splash; add leaf crunch when env.current.litter for the nearest street's species is above 0.3.
- Optional very sparse pentatonic music-box bed, off by default, with a toggle.
- Keep at most about 40 live nodes; stop and disconnect one-shot voices; never throw if the context is unavailable.

BUDGET: zero draw calls; no per-frame layout thrash; audio parameter updates at about 10 Hz.
