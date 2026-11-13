# 青岛八大关 — design and module contract

A walkable, fully procedural three.js landscape of Badaguan, Qingdao. No downloaded models, no photo textures: canvas
and shader generated only. This file records every decision that parallel builders would otherwise make differently.
Facts and their confidence are in `docs/RESEARCH.md`; where the two disagree, this file wins.

Contents: 1 Art direction · 2 World map · 3 Terrain height · 4 Palette · 5 MODULE CONTRACT · 6 Packages · 7 Tooling

---

## 1. Art direction

**What must come across.** Not a generic park. Badaguan is a 1930s European seaside villa suburb grown over by
eighty-year-old Chinese street trees:

1. **一路一树**: every street has its own species, so every street has its own canopy shape, colour and light.
2. **红瓦绿树、碧海蓝天**: warm red-orange clay roofs against dark conifers, a cool jade sea closing the downhill vistas.
3. **The continuous granite garden wall** (蘑菇石 rubble, iron railings or hedge on top, stone piers, iron gates) is the
   street edge everywhere. Villas sit back behind it in gardens; you see roofs and gables over the wall.
4. **Quiet.** Almost no traffic, no shopfronts. Walk speed is a stroll (1.7 m/s). Wedding-photo couples are the people.
5. **Maritime light**: haze toward the sea, sea fog in early summer, long low sun in autumn.
6. **Yellow Sea colour**: milky jade green-teal. Never tropical cyan, never ultramarine.

**Default moment: 秋日午後** (early November, 14:30). Ginkgo and maple at peak, clearest air of the year, sun at 26°
over the sea to the south-south-west so every southward street is back-lit: translucent gold leaves, long shadows
toward the viewer, glitter on the water. Spawn at the west end of 居庸关路 looking east down the ginkgo avenue with
公主楼 ahead on the left.

### 1.1 Ambience presets (exact numbers; the data lives in `src/core/presets.js`)

Angles are compass degrees (0 north, 90 east, 180 south = out to sea). `fogDensity` is extinction at sea level in 1/m,
`fogFalloff` its exponential decay per metre of height (see §5.6). Light intensities are three.js r187 units.

| Field | `autumn` 秋日午後 (default) | `fog` 清晨海霧 | `dusk` 夏末黃昏 | `spring` 春日花季 |
|---|---|---|---|---|
| Date / time | Nov 8, 14:30 | Jun 10, 06:30 | Aug 25, 18:10 | Apr 18, 10:00 |
| sunElevation / sunAzimuth | 26 / 220 | 18 / 80 | 6 / 278 | 50 / 125 |
| sunColor / sunIntensity | `#ffe2b0` / 3.0 | `#e9eef0` / 0.6 | `#ff9d5c` / 2.2 | `#fff4e0` / 2.8 |
| hemiSky / hemiGround / hemiIntensity (research values ×≈1.8 for r187 light units, so shade stays readable) | `#bcd6f0` / `#8a6a3c` / 1.0 | `#cfd6d8` / `#7b8078` / 1.7 | `#7f8fc0` / `#6a4a38` / 0.85 | `#d4e6f5` / `#8a8a72` / 1.15 |
| skyZenith / skyHorizon | `#3d7cc4` / `#cfe0ea` | `#b9c4c8` / `#d5dadb` | `#44608f` / `#f4a964` | `#6fa6d8` / `#dfe9ee` |
| skySunGlow / skyAntiSolar | `#f3e3c2` / `#c3d6e6` | `#e6ebec` / `#c9d0d2` | `#e98a6a` / `#8f86a8` | `#f6f1e2` / `#d3e2ec` |
| sunDisc / horizonHaze | 1.0 / 0.35 | 0.35 (pale disc) / 1.0 | 1.0 / 0.6 | 0.9 / 0.55 |
| cloudCoverage / cloudDensity | 0.28 / 0.6 | 0.9 / 0.3 | 0.4 / 0.5 | 0.38 / 0.5 |
| cloudLit / cloudShade | `#ffffff` / `#a9b9cc` | `#dfe4e5` / `#b4bdc0` | `#ffc79a` / `#6a6788` | `#ffffff` / `#b6c4d2` |
| fogColor / fogDensity / fogFalloff | `#d9e2e6` / 0.0012 / 0.012 | `#cdd4d5` / 0.018 / 0.085 | `#e6b48c` / 0.0028 / 0.03 | `#e3ebee` / 0.0022 / 0.02 |
| shadowStrength / shadowRadius | 1.0 / 1.5 (crisp, long) | 0.15 / 4.0 (nearly none) | 0.85 / 3.0 (very long, soft) | 0.9 / 2.5 |
| seaShallow / seaDeep / seaSpec | `#5fa79a` / `#2c6d77` / `#fff1cf` | `#9aaba6` / `#7d908f` / `#c9d2d2` | `#6f8f93` / `#2f5560` / `#ffb070` | `#6bb5a6` / `#3a8088` / `#fffbe8` |
| seaGlitter / waveHeight / foam | 1.0 / 0.35 / 0.8 | 0 / 0.2 / 0.5 | 0.9 / 0.3 / 0.7 | 0.45 / 0.3 / 0.8 |
| exposure | 1.0 | 0.9 | 1.1 | 1.05 |
| bloomStrength / Threshold / Radius | 0.35 / 0.92 / 0.6 | 0.15 / 0.95 / 0.8 | 0.6 / 0.85 / 0.75 | 0.3 / 0.92 / 0.6 |
| saturation / contrast / gradeTint | 1.06 / 1.05 / `#fff4e6` | 0.72 / 0.96 / `#f1f5f5` | 1.08 / 1.06 / `#ffe9d2` | 1.04 / 1.0 / `#fbfbf3` |
| vignette / godrays | 0.25 / 0.55 | 0.18 / 0 | 0.34 / 0.8 | 0.2 / 0.2 |
| lawn / hedge / ivy | `#7c8a3e` / `#44602f` / `#a23b2a` | `#6f8f62` / `#3f5c40` / `#3f6b3a` | `#4d7a33` / `#2f5229` / `#3f6b3a` | `#709f46` / `#4f7a35` / `#4f8a3a` |
| lampsOn / windowGlow | 0 / 0 | 1 / 0.8 | 1 / 1 | 0 / 0 |
| windStrength / windAzimuth (blows toward) | 0.55 / 160 | 0.2 / 10 | 0.35 / 330 | 0.45 / 40 |
| particles / particleAmount | `leaves` / 1.0 | `drips` / 0.4 | `leaves` / 0.12 | `petals` / 1.0 |
| litter (ginkgo / maple / plane / petals) | 1 / 1 / 0.8 / 0 | 0 | 0 / 0 / 0.15 / 0 | 0 / 0 / 0 / 1 |
| motes / fogWisps / gulls / butterflies | 0.5 / 0 / 3 / 0 | 0 / 1 / 2 / 0 | 0.9 / 0 / 4 / 0 | 0.3 / 0 / 3 / 3 |
| audio surf / wind / rustle / birds / gulls | 0.5 / 0.4 / 0.4 / 0.3 / 0.15 | 0.35 / 0.15 / 0.08 / 0.05 / 0.1 | 0.5 / 0.25 / 0.2 / 0.25 / 0.15 | 0.4 / 0.25 / 0.25 / 0.6 / 0.12 |
| audio cicadas / foghorn / horn / drips | 0 / 0 / 0.12 / 0 | 0 / 0.5 / 0.1 / 0.4 | 0.45 / 0 / 0.15 / 0 | 0 / 0 / 0.08 / 0 |
| audio lowpass (Hz) / reverb | 20000 / 0.18 | 3500 / 0.45 | 20000 / 0.22 | 20000 / 0.16 |

**Foliage palettes** (`env.current.foliage[species]`, always 4 colours; `MAP.trees[i].tone` 0..3 picks one):

| Species | autumn | fog | dusk | spring |
|---|---|---|---|---|
| ginkgo | `#f2c21b #e8a80c #f7d84a #eeb81a` | `#5f8a52 #6b9558 #547d4a #739c5c` | `#4f7a35 #5a853a #456f2f #648f40` | `#a9cf5e #b4d868 #9cc454 #bfe072` |
| maple (五角枫: yellow-orange-russet, little scarlet) | `#e9742b #d9a21e #c8402a #a8a83a` | `#4f7d4c #5a8852 #467244 #628f58` | `#4a7032 #557b38 #40652c #5f863e` | `#9cc45a #a8cf62 #b9a862 #8fb850` |
| plane | `#b88a3a #8f6a2c #a9a04a #7f8a3a` | `#557f50 #4c7448 #5f8a58 #6a9160` | `#3f6b2d #5a8a35 #4a762f #8f9a3e` | `#a6c95c #b0d264 #98bc52 #bcd970` |
| cedar | `#2f4a3c #3d5d4a #35534a #2a4236` | `#3c4f48 #445a50 #36483f #4a6156` | `#24402f #2c4a36 #1f3829 #33523c` | `#2f4f3e #385a46 #294636 #42644e` |
| juniper | `#2a4a34 #24402d #30513a #1f3828` | `#34483f #2d4038 #3a5046 #283a32` | `#1f3a2a #1a3224 #254230 #162c20` | as autumn |
| pine | `#2f4a34 #3a5638 #28402e #44603c` | `#3a4f44 #43594c #32463c #4b6152` | `#26422f #2e4c35 #203a29 #36563c` | `#2f4c36 #38583c #284230 #456644` |
| peach | `#a89a44 #b8943a #8f8a3c #c0843a` (sparse) | green | green | **bloom** `#f29bb4 #ffd9e2 #d6355f #ffffff` |
| crabapple | `#b5622e #a8843a #c47a2c #8f7a38` (sparse) | green | green | **bloom** `#f7c6d0 #fbdde4 #e0607e #fff1f4` |
| crape myrtle | `#c9662e #b5522e #d98a2e #a8642c` | green | **bloom** `#c44f9a #d98ac0 #b8408c` + leaf `#5a8438` | fresh green |

`leafFill[species]` (0..1) thins deciduous canopies out of season (autumn peach 0.55, spring plane 0.7 ...).
Preset changes cross-fade over 3.5 s; modules read the blended values from `ctx.env.current` every frame.

### 1.2 Decisions that deviate from the research

- **Sky**: a custom gradient dome shader driven by the exact preset colours above (plus analytic sun disc/halo and FBM
  clouds), not the `Sky` addon. The addon's physically based output cannot hit art-directed colours and needs exposure
  ~0.5; here `exposure` 1.0 is the reference for every material.
- **Fog**: `THREE.Fog` object whose `near`/`far` floats are re-purposed as density/height-falloff by a global shader-chunk
  override (two free global uniforms on every material, see §5.6).
- **Tone mapping** ACES Filmic everywhere; `renderer.toneMappingExposure = env.current.exposure` is set by core.
- 正阳关一支路 is dropped; 函谷关路 and 武胜关路 are compressed away (嘉峪关路 is the north edge street).
- 花石楼 moved 3 m (to 102,113), 公主楼 to (-150,-68), 元帅楼 to (-227,58) so gardens fit between the roads.
  蝴蝶楼 is relocated onto the map at (-228,101) (really 280 m further west).
- The 花石楼 headland waterline is pushed out to z = 186 so there is a real rocky point to walk onto.

---

## 2. World map

Axes: **+x east, +z south (sea), +y up**, metres, sea level y = 0. North is −z. Playable area x ∈ [−250, 250],
z ∈ [−225, sea]; the walker is clamped to `MAP.WALK` (x ±246, z ≥ −221; along the east coast, z > −14, the limit
pulls in to x = 225 where the reef dressing ends: `walkMaxX(z)`, and `collision.move` reports `out.edge`). Walls, lamps
and villas continue to `MAP.EXTENT` (x ±292, z ≥ −266) as visual run-off. Every street that leaves the map runs on
another ~130 m past its last hand-placed point (`RUNOFF` in `src/world/map.js`: asphalt, kerbs, sidewalks and a wider
spaced tree row; `tree.runoff`), bending 30° so no street visibly ends at the boundary. `street.sA`/`street.sB` bracket
the hand-placed part of `street.pts`; `street.ctrl` is still only the hand-placed points.
Real → scene: x = 0.68·(x_real + 290), z = 0.68·z_real + 110 (OSM geometry, origin 36.05 N 120.35 E); buildings and
road widths are true size. **The data is `src/world/map.js` (`MAP`), generated deterministically; `npm run check:map --
shots/map.png` prints the counts and rasterises the plan.** Never hard-code coordinates that exist in `MAP`.

### 2.1 Streets (`MAP.streets`, control points; centre lines are centripetal Catmull-Rom through them, resampled at 2 m)

| id | Sign (简体) | Tree (signature) | spacing | carriageway / sidewalk | Control points (x,z) |
|---|---|---|---|---|---|
| `juyongguan` | 居庸关路 | 银杏 ginkgo | 8 m | 7 / 2.4 | (-186,-44) (-129,-48) (-87,-63) (-21,-54) (29,-31) (61,-7) (107,17) (143,36) |
| `shanhaiguan` | 山海关路 | 法国梧桐 plane | 10 m | 8 / 3.0 | (-300,125) (-250,95) (-235,86) (-175,47) (-124,41) (-20,28) (2,29) (46,49) (90,87) |
| `zhengyangguan` | 正阳关路 | 紫薇 crape myrtle | 6 m | 7.5 / 2.6 | (-300,-133) (-250,-140) (-186,-150) (-131,-149) (-22,-146) (143,-143) (250,-138) (300,-135) |
| `jiayuguan` | 嘉峪关路 | 五角枫 maple | 9 m | 7 / 2.4 | (-300,-204) (-250,-205) (-112,-207) (-22,-203) (168,-198) (250,-196) (300,-194) |
| `linhuaiguan` | 临淮关路 | 龙柏 dragon juniper | 5 m | 6.5 / 2.2 | (-87,-63) (-50,-85) (-22,-95) (33,-88) (126,-66) (214,-40) |
| `ningwuguan` | 宁武关路 | 海棠 crabapple | 6 m | 7 / 2.4 | (-20,28) (-21,-54) (-22,-95) (-22,-146) (-22,-203) (-15,-225) (-8,-270) |
| `zijingguan` | 紫荆关路 | 雪松 deodar cedar | 10 m | 7 / 2.4 | (90,87) (107,17) (126,-66) (143,-143) (168,-198) (175,-225) (186,-270) |
| `shaoguan` | 韶关路 | 碧桃 flowering peach | 5 m | 7 / 2.4 | (-186,-44) (-205,-50) (-217,-69) (-205,-100) (-186,-150) (-140,-190) (-112,-207) (-100,-225) (-78,-270) |
| `huanghai` | 黄海路 | 黑松 black pine | 9 m | 6 / 2.0 | (60,130) (90,87) (143,36) (214,-40) (250,-55) (300,-68) |
| `zhengyang2` | 正阳关二支路 | mixed plane/ginkgo/maple | 11 m | 5 / 1.6 (lane) | (-124,41) (-129,-48) (-131,-149) |

Topology: the south zone is a **fan** (山海关路, 居庸关路, 临淮关路 converge eastwards onto 黄海路 by 花石楼); the north is a
ladder. 19 junctions, all at shared control points (`MAP.junctions`). Per street: `half` (carriageway half width),
`treeOff` (tree-pit line), `lampOff`, `wallOff` (garden wall centre line = half + sidewalk + 0.25), all measured from the
centre line. Street cross-section, from the centre: asphalt → 12–15 cm granite kerb → sidewalk slabs with tree pits →
garden wall.

### 2.2 Coast (`MAP.coast`, `MAP.promenade`, `MAP.boardwalk`; raw polylines, NOT smoothed)

- **Waterline** (y = 0), playable part: (-250,146) (-231,132) (-162,104) (-92,100) (-38,113) (-6,130) (22,150) (46,168)
  (66,182) (88,186) (106,176) (120,158) (143,128) (186,84) (235,28) (250,10). It continues to ±1200 for the far field
  (汇泉角 headland south-west around (-560,430), 太平角 capes east around (640,330)).
- **Coast path / "backline"** (ground 3.5 m, flat strip 5 m wide):
  - 海滨步行道 seawall promenade, granite, x −250…70: (-250,140) (-199,88) (-132,77) (-48,63) (-14,63) (45,105) (56,124) (70,149)
  - 海滨木栈道 wooden boardwalk, x 70…250: (70,149) (104,144) (124,127) (143,98) (186,59) (199,35) (250,-8)
- **第二海水浴场**: the sand between the promenade seawall and the waterline (x ≈ −240…60, 22–55 m deep, crescent).
  Four stairs through the seawall at (-199,88), (-90,70), (-14,63), (50,113.6), each 4.4 m wide with a 4 m run.
- **Rock**: everything seaward of the boardwalk (15–40 m of sloping reef, reddish-brown granite, dark algae band at the
  tide line), the headland point south of 花石楼 (tip ≈ (88,186)), and the west end x < −240.
  `MAP.coast.reefClusters` lists [x, z, radius] for boulder clusters.
- **Sea** to the south, to the horizon. Buoy line (19,190)→(-65,235).

### 2.3 Buildings, gardens, parks

| Landmark (`MAP.landmarks`) | Centre (x,z) | Footprint w×d | Faces / gate on | Notes |
|---|---|---|---|---|
| 花石楼 `huashilou` | (102,113) | 16×15 | 黄海路 | knoll (ground ≈ 6 m), round crenellated tower on the seaward (max z) corner, ≈ 18 m |
| 公主楼 `gongzhulou` | (-150,-68) | 12×10 | 居庸关路 (to its south) | teal walls, steep red roof, green needle spire ≈ 17 m |
| 八大关宾馆 `binguan` | (-162,-2) | 40×16 | 山海关路 | long hotel block + lawn |
| 元帅楼 `yuanshuailou` | (-227,58) | 16×11 | 山海关路 | Japanese-style, deep eaves |
| 蝴蝶楼 `hudielou` | (-228,101) | 18×9 | 山海关路 (to its north) | relocated token |

- **Generic villas** `MAP.lots` (64, 57 inside the playable area): `{id, x, z, w, d, rot, arch 'A'..'H', seed, mirror,
  street, side, setback, baseY, floorY, gate, playable}`. `w × d` is the bounding footprint (also the collider);
  `rot` makes local +Z face the street; `floorY` is the ground-floor level (highest ground under the footprint + 0.45),
  `baseY` the lowest ground (the plinth must reach below it).
- **Gates** `MAP.gates`: one per lot/landmark, in the wall line, 3.4–5 m wide. `open: true` only for landmarks.
- **Garden walls** `MAP.walls` (144 runs, 5.8 km): polylines offset `wallOff` from every street on both sides, cut at
  junctions, gates, footpaths and park frontages. `top` is `rail` (iron railing), `hedge` or `pierced` (masonry).
- **Parks** `MAP.parks`: `park1` polygon (-72,-139) (-30,-139) (-30,-102) (-56,-88) (-72,-84); `park2` (44,-78)
  (114,-62) (101,2) (48,-28). Open lawn, no wall on their street frontage, gravel paths (`MAP.paths`).
- **Footpaths** `MAP.paths`: `beach-link` (-14,63)→(-20,28) granite paving 4 m; three gravel park paths 2.2 m.
- **Trees** `MAP.trees` (≈2200: ≈820 street trees + run-off rows, gardens and shrubs, parks, coast pines, and ≈500 block-interior fill trees tagged `interior`; `FILL_CLEAR` in `src/world/map.js` keeps the two 花石楼 lawn views open): `{x, y, z, species, h, r, trunk, rot,
  seed, tone, street, side, s, garden}`. **Lamps** `MAP.lamps` (≈120, kinds `lantern`/`twin`), **benches** `MAP.benches`,
  **figures** `MAP.figures` (5 wedding couples, strollers, an elder), **POIs** `MAP.pois` (繁體 captions),
  **views** `MAP.views` (named cameras: spawn, ginkgo, princess, cedar, plane, juniper, peach, crabapple, maple, crape,
  downhill, huashi, huashiSea, beach, promenade, boardwalk, reef, wall, junction, park, overview, top, aerialSE).

### 2.4 Villa archetypes (`MAP.ARCHETYPES`, details in RESEARCH Part 2 §4)

| | Style | Bounding w×d | Heights | Roof | Walls |
|---|---|---|---|---|---|
| A | German Jugendstil | 16×13 (L-plan) | eaves 7.5, ridge 12.5 | jerkinhead 48°, 2 dormers, 2 chimneys | ochre 拉毛 `#DDBE78`, granite base 1.2 m, half-timbered gable |
| B | Castle / tower | 14×12 | parapet 10.5, tower 14 | flat + crenellations or conical cap | full rock-faced granite |
| C | Nordic steep-roof | 12×10 | eaves 5.5, ridge 12 | cross-gable 55–60° | teal / pale blue / mint, white trim |
| D | Spanish | 16×10 | eaves 7, ridge 9.5 | low hip 22–25° `#C2603A` | white-cream, 3-arch loggia |
| E | French mansard | 14×12 | cornice 7.5, top 11 | mansard `#8C3A2A` or slate `#5B5F66` | warm grey / blush, white cornice |
| F | Japanese-modern | 17×10 | eaves 6.5, ridge 9 | hip 28°, deep eaves, `#6A4B3E` | buff over granite ground storey |
| G | English country | 18×13 (T-plan) | eaves 7, ridge 11.5 | cross-gable 42°, tall chimneys | pale yellow, timber veranda |
| H | Art Deco | 14×10, curved corner | parapet 8–10 | flat behind parapet | off-white / grey smooth stucco |

---

## 3. Terrain height function

`heightAt(x, z)` in `src/world/height.js` is the single source of truth (pure JS, ~0.7 µs, defined for any x,z).
Everything that touches the ground samples it; nothing raycasts.

Let `s` = signed distance to the waterline (+ on land) and `b` = signed distance to the coast path centre line
(+ inland). With `PROM_Y = 3.5`:

| Zone | Condition | Height |
|---|---|---|
| Coast path strip | \|b\| ≤ 2.5 (boardwalk, x 84…280: only 0.9 m on the seaward side) | 3.5 (flat: promenade paving / boardwalk). Seaward of the boardwalk strip the rock drops a further 0.6 m within 1.2 m, so the 2.6 m deck overhangs it on piles |
| Inland | b > 2.5, d = b − 2.5 | 3.5 + 0.05·d (0.02·(d−300) + 15 beyond 300 m) + west rise 2 m (x < −100…−190) + ±0.35 m undulation (60 m wavelength) + 花石楼 knoll 1.6 m·gauss(r = 20 m at (102,113)) + far hills outside the play area (太平山 95 m at (-60,-820), 汇泉角 26 m, 太平角 14 m) |
| Beach (x of nearest path point in −249…54, fading to rock by 70) | b < −2.5, s > 0, e = −b − 2.5 | seawall: e < 0.6 → smooth drop 3.5 → 1.6. The four stairs are fixed rectangles (`BEACH_STAIRS` in `height.js`, mirrored in `MAP.promenade.steps`: seaward axis `fx,fz`, half width `hw`, run `d0…d1`; on a polyline vertex the axis is the bisector): flat landing to `d0`, linear 3.5 → 1.6 to `d1`, 2 m run-out onto the sand; core registers the cheek walls as colliders. Sand: 1.6·(s / (s + e − wall))^0.85 |
| Rock shore | elsewhere between path and water | 3.5·(s/(s+e))^0.7 + lumpy noise (±0.8 m, 9 m wavelength) |
| Sea bed | s ≤ 0 | −14·(1 − exp(−k·\|s\|/14)), k = 0.04 off the beach, 0.14 off rock |

Resulting street levels: 嘉峪关路 ≈ 16.5 m, 正阳关路 ≈ 13.7, 居庸关路 ≈ 9–11.5, 山海关路 ≈ 5–6, promenade 3.5, sand 1.6 → 0.
Average slope 5 % toward the coast. Also exported: `normalAt`, `slopeAt`, `shoreDist`, `backDist`, `backInfo`,
`beachness`. The walker may wade until the sea bed is 0.45 m below the surface.

A terrain mesh on a 2 m grid reproduces this within a few centimetres except at the seawall, which a wall mesh covers.
Roads are not cut into the terrain: road/sidewalk ribbons sample `heightAt` and float a few centimetres above it.

---

## 4. Palette (sRGB hex)

| Element | Colours |
|---|---|
| Roof clay tile | `#B5482E` base, per-tile `#C65A38` `#9E3F2A` `#8A3A2B`, lichen `#7F4A3A`; Spanish `#C2603A`; mansard `#8C3A2A`; slate `#5B5F66`; Japanese `#6A4B3E` |
| Granite (崂山, buff-pink-grey) | `#B9B2A3` `#9C968A` `#857F74` `#C2A893`; mortar `#6B6862`; raised pointing `#77736C` |
| Stucco | cream `#EADFC4`, ochre `#E0C27A` / `#DDBE78`, pale yellow `#EBD9A0`, blush `#D9B8A0`, warm grey `#B8B2A6`, off-white `#EFEADD`, 公主楼 teal `#5FA79B` |
| Woodwork / trim | white `#F2EEE2`, dark green `#2F5341`, oxblood `#7A2E25`, brown `#5A3B28` |
| Iron | `#1F2321`; lamp green `#1E2B25` |
| Road | asphalt `#3D3F42` (patches `#55575A`), kerb `#A7A198`, paving `#9A968E` / `#B0AAA0` |
| Sand / rock | sand `#DCC898` (wet `#B9A878`), reef `#8A5F4A` / `#9C6B4E` / `#B08A62`, tide-line algae `#2A2622` |
| Signage | street-sign blue `#1F5FA8`, tourist brown `#7A4A22`, engraved red `#B3261E` |
| Light | lamp glow `#FFD9A0` |
| Wedding figures | gown `#F4F1EA`, qipao red `#B3261E`, suit `#1E2230`, reflector silver `#D8D8D2` |

Sky, sea, fog, lawn and foliage colours are per preset (§1.1).

---

## 5. MODULE CONTRACT

### 5.1 Shape

Each feature module is one entry file `src/modules/<name>.js` (plus a private folder `src/modules/<name>/`):

```js
export async function create(ctx) {
  // build everything, add it to ctx.scene (or a ctx.group('name')), register colliders you invented
  return {
    update(dt, t) {},        // every frame; dt seconds (≤ 0.1), t simulation seconds
    onPreset(target, prev) {}, // when a preset switch STARTS (discrete changes); continuous values: read ctx.env.current in update
    dispose() {},
  };
}
```

Load order = update order: `player, sky, terrain, coast, villas, landmarks, streetscape, trees, life, post, audio, ui`
(`src/modules/index.js`). A module must work when every other module is still a stub, and must never import another
module's files: communicate only through `ctx`, `MAP` and events.

### 5.2 `ctx`

| Field | What |
|---|---|
| `THREE, renderer, scene, camera, canvas, viewport{width,height,pixelRatio}` | camera: fov 62, near 0.15, far 4000, rotation order YXZ, already in the scene |
| `params` | parsed URL params (`shot, view, pos, h, yaw, pitch, fov, preset, q, t, frames, only, skip, debug, mute`) |
| `quality` | frozen tier: `tier, maxPixelRatio, shadowMapSize, shadowDistance, msaa, bloom, godrays, treeDensity, treeLodNear, treeLodFar, grass, particles, anisotropy, texSize, oceanSegments, terrainStep, lampLights, envMap, isMobile, isTouch`. Tier: `?q=` > the stored choice > first visit: `low` on mobile or a software rasteriser, `high` on a discrete GPU, otherwise `medium` |
| `events` | `on(name, fn) → off`, `emit(name, a, b)`; synchronous |
| `state` | `started, paused, shot, time, dt, frame, ready` |
| `app` | `start()`, `pause()`, `resume()`, `setPreset(id, {instant})`, `nextPreset(dir)`, `setQuality(tier)` |
| `env` | `name, names, presets, target, prev, current (LIVE blended), blend, transitioning, sunDir (unit Vector3 toward the sun), windDir, set(), next()` |
| `world` / `map` | `world.heightAt, normalAt, slopeAt, shoreDist, backDist, backInfo, beachness, surfaceAt, nearestStreet, nearestPath, onRoad, treesNear, parkAt, inBounds, pointAt, distToLine, toLocal, rectCorners, polySignedDist`; `map` = `MAP` |
| `collision` | `addCircle(x,z,r,tag)`, `addBox(x,z,hw,hd,rot,tag)`, `addSegment(x1,z1,x2,z2,r,tag)`, `addPolyline(pts,r,tag)`, `removeTag(tag)`, `setTagEnabled(tag,on)`, `resolve(x,z,r,out)`, `move(fx,fz,tx,tz,r,out)`, `walkable(x,z)` |
| `tex` | `get(kind, opts) → {map, normalMap, metres}`; `makeCanvas, canvasTexture, tileNoise, tileFbm, normalFromHeight` |
| `mats` | `get(name)`; `stucco(hex)`, `roof(hex)`, `paint(hex)`, `wood(hex)`, `grass(hex)`, `bark(hex)`, `plain(hex, rough, metal)` |
| `geo` | `normalize, merge, transform, applyMetricUV, box, tint, bakeGroundAO, staticMesh` |
| `rng` | `makeRng(seed)`, `hash2`, `valueNoise2`, `fbm2`, `clamp`, `lerp`, `smoothstep` |
| `wind` | `uniforms {uTime, uWind, uGust}` (shared objects), `dir, strength, gust, power, gustAt(t), apply(material, opts)` |
| `player` | `pos` (FEET, Vector3), `yaw`/`pitch` (radians, compass yaw), `eyeHeight, bob, radius, vel, speed, moving, running, surface, locked, forward(out), teleport(x,z,yawDeg,pitchDeg,eye), applyToCamera()` |
| `render` | `fn(dt)` draws the frame; the post package calls `ctx.render.set(fn)` |
| `setFog(color, density, falloff)`, `group(name)`, `setPixelRatio(pr)`, `uiRoot`, `store`, `modules` | helpers |
| `lights`, `post`, `audio` | set by their modules for others to use: `ctx.lights = {sun, hemi}` (sky), `ctx.post = {composer, setEnabled(on)}` (post), `ctx.audio = {setVolume(v), setMuted(on), volume, muted}` (audio). May be undefined while that module is a stub: always guard. |

### 5.3 Events

| Event | Emitted by | Payload |
|---|---|---|
| `start` / `pause` / `resume` | `ctx.app` (UI calls it from a user gesture; player calls `app.pause()` when pointer lock is lost) | — |
| `preset` | `env.set` | `(target, prev)` resolved presets; core also calls every module's `onPreset` |
| `gust` | core wind | `{time, duration}` |
| `resize` | core | `viewport` |
| `teleport` | `player.teleport` | `player` |
| `footstep` | player package | `{surface, running, x, z}` |
| `poi` | ui package | the POI entered |
| `boundary` | player package | `{x, z}` when the walker is stopped by the edge of the playable area |
| `lookmode` | player package | `'lock'` \| `'drag'` \| `'touch'`: how the view is turned. `'drag'` = the browser refused pointer lock and the walker falls back to hold-and-drag (the UI shows a hint). Current value: `ctx.player.lookMode` |
| `perf:low` | post package | `{tier, suggest, avgMs, pixelRatio, handled}` once, when the lowest render resolution still cannot hold 30 fps. The UI sets `handled = true` and offers the `suggest` tier (Q / tap); unhandled and under 20 fps, post switches tier itself |
| `ready`, `contextlost` | core | — |

### 5.4 Conventions (non-negotiable)

1. **Coordinates**: +x east, +z south, +y up, metres. Compass yaw: 0 north, 90 east. `rot` = `rotation.y` with local +Z
   as the front: `rot = atan2(dirX, dirZ)`. Local→world: `x = cx + lx·cos(rot) + lz·sin(rot)`, `z = cz − lx·sin(rot) + lz·cos(rot)`.
2. **Ground**: always `ctx.world.heightAt(x, z)`. Never raycast, never assume flat.
3. **Determinism**: never `Math.random()`. Use `ctx.rng.makeRng('yourmodule:purpose')`. The scene must look finished at
   any `t` with no warm-up (pre-distribute particles), because screenshots render a handful of frames at fixed `t`.
4. **Screenshot mode** (`ctx.params.shot`): no input, no DOM overlays, no audio, no async pop-in after `create()` resolves.
5. **Materials**: `MeshStandardMaterial` (never Physical), metalness 0 unless metal. Use `ctx.mats` / `ctx.tex` for
   anything shared (granite, stucco, roof tile, iron, glass...). Shared materials and textures are read-only: clone
   before changing, never dispose. **UVs are in metres** (`ctx.geo.applyMetricUV`).
6. **Colour space**: `SRGBColorSpace` on albedo/emissive canvas textures only; data textures stay `NoColorSpace`.
   Custom `ShaderMaterial`s that draw to screen end with `#include <tonemapping_fragment>` and
   `#include <colorspace_fragment>`.
7. **Fog**: every material must fog. Built-ins do automatically. Custom shaders: `fog: true`, merge
   `THREE.UniformsLib.fog`, define `vec4 mvPosition` in the vertex shader, include the four fog chunks (§5.6).
8. **Shadows**: `renderer.shadowMap.type = PCFShadowMap`. Set `castShadow` only on things that matter (buildings, walls,
   trunks, canopies, lamps, figures); never on grass, litter, particles, far LODs, water. Foliage is alpha-tested
   (`alphaTest`, optionally `alphaToCoverage`), never alpha-blended.
9. **Draw calls**: merge static geometry per material per spatial cluster (`ctx.geo.merge`), instance repeated things
   (`InstancedMesh`, split into spatial cells so culling works, `computeBoundingSphere()` after writing matrices,
   `setColorAt` before first render if used). `matrixAutoUpdate = false` on static meshes.
10. **Lights**: only the sky package creates directional/hemisphere lights. Point lights are capped
    (`quality.lampLights`, streetscape only); everything else glows with emissive + bloom. Lit windows use
    `ctx.mats.get('windowLit')`, lantern glass `ctx.mats.get('lampGlass')`: core drives their emissive from
    `env.current.windowGlow` / `lampsOn`.
11. **Text**: UI strings in Traditional Chinese (繁體); in-scene signage in Simplified (`street.name`, `landmark.name`),
    exactly as on the real signs. The UI face is a self-hosted Noto Serif TC subset (`src/modules/ui/fonts`, checked by
    `npm run check:fonts`, which `npm run build` runs first) over a system serif stack; no third-party requests at runtime.
12. **Ownership**: edit only the files your package owns. Need a core change (map data, ctx field, shared texture)?
    Do not make it: write it in your report.
13. **three r187**: `THREE.Timer` not `Clock`; `PCFShadowMap` not `PCFSoftShadowMap`; `PointerLockControls` has no
    `getObject()`; do not import `three/addons/csm/CSM.js`; `mergeGeometries` returns null on attribute mismatch.

### 5.5 Budgets (whole scene, medium/high tier, typical street view)

| Package | Draw calls | Triangles (visible) |
|---|---|---|
| terrain | ≤ 45 (ground in 4×4 chunks, streets in 300 m cells, frustum-culled) | ≤ 260 k |
| coast | ≤ 12 | ≤ 90 k |
| sky | ≤ 6 (+ shadow passes) | ≤ 5 k |
| villas | ≤ 45 | ≤ 320 k total |
| landmarks | ≤ 25 | ≤ 90 k total |
| streetscape | ≤ 30 | ≤ 220 k total |
| trees | ≤ 70 | ≤ 500 k visible |
| life | ≤ 30 | ≤ 120 k |
| post | ≤ 4 fullscreen passes + bloom mips | — |
| **Total** | **≤ 230** | **≤ 1.5 M** (≤ 0.6 M on `low`) |

Check with `?debug=1` (overlay) or the `draw calls / triangles` line that `scripts/shot.mjs` prints; `&stats=1` in a
shot query adds a per-group breakdown (shadow passes included) and a whole-scene mesh inventory.

**Shadow-caster culling (core, `src/core/loop.js`).** Static meshes of terrain / coast / villas / landmarks /
streetscape that cast shadows are collected on the first frame; each frame `castShadow` is switched off for those whose
world bounding box is further from the camera than the shadow range plus the reach of a low-sun shadow (small detail:
0.55 of that). Merge static geometry in spatial chunks (≤ 170 m) or this cannot help; never animate `castShadow` on
those meshes yourself.

### 5.6 Height fog

`scene.fog` is a `THREE.Fog`; core overrides the fog shader chunks so the linear-fog branch computes

```
density(y) = fogNear · exp(−fogFar · (y − 2))           // fogNear = density at sea level, fogFar = falloff
fogFactor  = 1 − exp(−∫ density along the eye ray)        // analytic, in the fragment shader
```

**HDR flag:** the post package renders the scene into a linear HDR target, where the same fog fraction lifts dark
surfaces far more than the display-space mix the presets were tuned for. While its composer renders, it flips the sign
of `fog.near`; the chunk (and the sky dome) read `fogNear < 0` as "linear target" and use `fogFactor^2.2`. Custom
shaders that read `fogNear` directly must use `abs(fogNear)`.

Set it with `ctx.setFog(color, density, falloff)` (core applies the preset baseline every frame before modules update;
the sky package may refine the colour afterwards). `src/core/fog.js` exports `fogAmount(fog, camPos, point)` as a JS
mirror for sprites and UI. `clear` presets: visibility kilometres; `fog` preset: e⁻¹ at ≈ 55 m on the shore, ≈ 140 m
up on 正阳关路, treetops and turrets float.

---

## 6. Packages (disjoint file ownership)

| # | Package | Owns |
|---|---|---|
| 1 | terrain | `src/modules/terrain.js`, `src/modules/terrain/**` |
| 2 | coast | `src/modules/coast.js`, `src/modules/coast/**` |
| 3 | sky | `src/modules/sky.js`, `src/modules/sky/**` |
| 4 | villas | `src/modules/villas.js`, `src/modules/villas/**` |
| 5 | landmarks | `src/modules/landmarks.js`, `src/modules/landmarks/**` |
| 6 | streetscape | `src/modules/streetscape.js`, `src/modules/streetscape/**` |
| 7 | trees | `src/modules/trees.js`, `src/modules/trees/**` |
| 8 | life | `src/modules/life.js`, `src/modules/life/**` |
| 9 | player | `src/modules/player.js`, `src/modules/player/**` |
| 10 | post | `src/modules/post.js`, `src/modules/post/**` |
| 11 | ui-audio | `src/modules/ui.js`, `src/modules/ui/**`, `src/modules/audio.js`, `src/modules/audio/**` |

Core (architect-owned, do not edit): `index.html`, `package.json`, `vite.config.js`, `src/main.js`, `src/core/**`,
`src/world/**`, `src/modules/index.js`, `scripts/**`, `docs/**`, `AGENTS.md`.

---

## 7. Tooling

- `npm run dev` (Vite on 127.0.0.1:5173) · `npm run build` → `dist/` · `npm run check:map -- shots/map.png`.
- Screenshots (built site, software GL, one browser, closed in `finally`), **always through the memory gate and in the
  background on this machine**:

  ```
  npm run build && ~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node scripts/shot.mjs shots/a.png "view=ginkgo&preset=autumn" shots/b.png "pos=-20,28&yaw=180&pitch=-3&preset=fog"
  ```

  Query parameters: `view=<MAP.views id>` or `pos=x,z` + `yaw` + `pitch` + `h` (eye height), `preset`, `q`, `t`,
  `frames`, `fov`, `only=a,b` / `skip=a,b` (load a subset of modules). The script prints draw calls and triangles and
  exits non-zero on any page error. Several `out.png "query"` pairs share one browser.
  `shot=0` in the query captures the normal interactive page (title screen, HUD); add `--delay=<ms>` to wait after ready.
- URL parameters work the same in the dev server (`?view=cedar&debug=1`).
