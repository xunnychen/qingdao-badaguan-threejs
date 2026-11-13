# Package: player

Files owned: src/modules/player.js, src/modules/player/**

PROJECT: 青岛八大关 (Badaguan, Qingdao): a beautiful, atmospheric, walkable, fully procedural three.js scene (three@0.187.0, Vite, plain ES modules, no TypeScript). Repo: /root/github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc. A working scaffold exists; your package REPLACES A STUB (the stub already walks with pointer lock + WASD; read it).

READ FIRST: docs/DESIGN.md (all of it; §5 MODULE CONTRACT: ctx.player, ctx.app, events), AGENTS.md (Lessons), then src/core/context.js (player state, app, events), src/core/collision.js (move, resolve, walkable, MAX_WADE_DEPTH), src/core/loop.js, src/core/params.js, src/world/query.js (surfaceAt), src/world/map.js (WALK, views), src/main.js (shot mode). docs/RESEARCH.md Part 4 §12 and §13 cover walking and touch.

COMMON RULES
1. Edit ONLY the files you own. Never touch core (src/core, src/world, src/main.js, src/modules/index.js, index.html, scripts, docs, package.json, AGENTS.md) or another package's files. If you need a core change, do not make it: describe it in your final report. Do not git commit.
2. Module shape: `export async function create(ctx)` returning `{ update(dt, t), onPreset(target, prev), dispose() }`. It must work while every other module is still a stub; never import another module's files.
3. Axes: +x east, +z SOUTH (sea), +y up, metres. Ground is ALWAYS ctx.world.heightAt(x,z). Compass yaw (radians in ctx.player.yaw): 0 = north (-z), +PI/2 = east. Forward vector = (sin yaw, 0, -cos yaw). Camera rotation order YXZ: rotation.set(pitch, -yaw, 0), done by ctx.player.applyToCamera().
4. Deterministic where it shows: never Math.random().
5. In ctx.params.shot mode: attach no listeners, create no DOM, and leave the camera exactly at ctx.player state (update only calls player.applyToCamera(); no bob, no drift, no smoothing).
6. No network requests, no external assets. DOM for touch controls goes into ctx.uiRoot.

VERIFY: `npm run build` must pass. Put the motion maths in DOM-free functions (for example src/modules/player/motion.js) and test them with a small Node script against src/core/collision.js and src/world (both run under Node). Pointer lock cannot be exercised headless, but confirm nothing breaks with screenshots, always through the memory gate, with run_in_background: true, never under `timeout`, one browser at a time:
`~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/player-a.png "view=spawn" shots/player-b.png "shot=0" --delay=1500`
(`shot=0` captures the normal interactive page.) LOOK at each PNG (Read tool). The script exits non-zero on page errors. Final report: what you built, how you tested it, anything you need from core.

=== PACKAGE: player (first-person walking) ===
OWNS: src/modules/player.js (entry, replaces the stub) and src/modules/player/**.
Mood: a stroll. Walking speed 1.7 m/s; a brisk pace (Shift) 4.6 m/s at most. No jumping.

STATE: you own writes to ctx.player during play: pos (FEET; pos.y = ground), yaw, pitch, eyeHeight (1.65), bob, vel, speed, moving, running, surface, locked. Call player.applyToCamera() every frame. Reset your smoothing on the 'teleport' event.

1. Desktop: pointer lock on ctx.canvas.
   - Request it synchronously inside the 'start' and 'resume' events (they are emitted from the UI's click handler).
   - Catch rejection (Chrome refuses re-lock for about 1.3 s after Esc): stay paused and let the next click retry.
   - On pointerlockchange lost: ctx.app.pause(). Set player.locked accordingly.
   - Mouse look: own handler, clamp |movementX/Y| < 200 (spikes), pitch clamped to ±1.45 rad, sensitivity persisted in ctx.store ('sens').
   - Keys: WASD and arrows move, Shift brisk. Only while ctx.state.started && !ctx.state.paused. Clear held keys on blur and on pause.
2. Touch (ctx.quality.isTouch): no pointer lock. Left half = virtual joystick (pointer events, setPointerCapture, 60 px radius, a translucent ring in ctx.uiRoot); right half = drag look (yaw += dx * 0.004, pitch ±1.4); stick pushed to the edge = brisk. Keep the top corners free for the UI package's buttons. player.locked = true while playing.
3. Movement: smooth acceleration and deceleration (damp, lambda about 10). Each frame: ctx.collision.move(fromX, fromZ, toX, toZ, player.radius, out) (it sub-steps, slides along walls, clamps to MAP.WALK and refuses water deeper than 0.45 m). pos.y damps toward heightAt (lambda 12 to 16). Speed factors: sand 0.8; wading (heightAt < 0) 0.55; slopes steeper than 35 % slow; rises steeper than 100 % block (the seawall stairs are a 48 % ramp and must stay walkable). player.surface = world.surfaceAt(x, z).
4. Feel: head bob 2.5 cm or less plus a tiny sway tied to step cadence (step about 0.72 m walking, 1.1 m brisk); subtle breathing when idle; optional FOV ease 62 to 65 when brisk (respect ctx.params.fov).
5. Events: emit `footstep` `{ surface, running, x, z }` at each step (the audio package listens). Emit `boundary` `{ x, z }` (rate-limited) when move() reports out.blocked at the edge of MAP.WALK.
6. Before start (ctx.state.started false, title screen up): a slow attract drift, yaw panning ±12° around the spawn heading with no translation; stop on 'start' and ease back.
7. Tooling: `window.__setView(x, z, yawDeg, pitchDeg, h)` calling player.teleport. With ctx.params.debug only: F toggles fly/no-clip (Q/E down/up), T cycles MAP.views.
8. dispose() removes every listener and DOM node.

BUDGET: zero draw calls; no per-frame allocations in update().
