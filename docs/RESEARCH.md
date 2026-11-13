# 八大关 research notes

Four research reports gathered before the build, kept verbatim (headings demoted one level). They are the factual
grounding for `docs/DESIGN.md`. Where a report and DESIGN.md disagree, **DESIGN.md wins** (it records the decisions
the architect took, e.g. small coordinate adjustments and the custom sky dome instead of the `Sky` addon).

Contents:

- Part 1 — Layout and geography
- Part 2 — Architecture and street-level material culture
- Part 3 — Atmosphere, presets, audio, captions
- Part 4 — three.js technique (r187)

---

# Part 1 — Layout and geography

## Badaguan (青岛八大关): real geography and a proposed 500 m x 450 m walkable map

The street layout below comes from OpenStreetMap geometry I pulled and converted to local metres, so the topology is solid. Tree species are weaker: the web sources name a tree for only eight of the ten roads, and several rest on a single source or on my memory.

Conventions throughout: x = east, z = south, metres. "Real" coordinates use origin 36.0500 N, 120.3500 E. OSM in China can carry a constant offset of up to a few hundred metres, but relative geometry is reliable.

### 1. Big picture

- **Setting:** Badaguan lies in Shinan District on the south foot of 太平山, between two headlands: 汇泉角 to the west/south-west and 太平角 to the east/south-east. The bay between them is 太平湾.
- **Sea direction:** the sea is to the south. 第二海水浴场 is a crescent of sand at the head of the bay, facing south to south-south-east.
- **Size:** about 66.6 ha, designated 1931-37 as a special villa district. Rules were building coverage of 50% or less, open (透空) fences and protected greenery. It holds 200+ villas in the styles of 20-odd countries ("万国建筑博览会").
- **Roads:** ten, named after passes; 武胜关路 and 山海关路 were the later additions. 正阳关路 is the east-west spine separating a north zone from the sea-facing south zone, which is the scenic core.
- **North boundary:** 香港西路, a busy arterial running diagonally south-west to north-east.
- **Traffic:** the southern roads (山海关路, 居庸关路, 临淮关路, 宁武关路 south section, 紫荆关路 south section, 黄海路, the 正阳关 branch roads) are tagged pedestrian asphalt in OSM. That gives quiet, car-free lanes about 6-8 m wide, with granite kerbs and low rubble-granite garden walls (wall details are from memory).

### 2. Streets (real geometry)

| Street | Orientation | Real polyline (x, z) | Length | Connects |
|---|---|---|---|---|
| 正阳关路 | E-W, almost straight | (-759,-352) → (-563,-382) → (-322,-376) → (-79,-372) → (173,-364) | 935 m | 武昌路/南海路 (W) to 香港西路 (E); crosses 韶关路, 宁武关路, 紫荆关路 |
| 函谷关路 | E-W, north of 正阳关路 | (-505,-485) → (-321,-468) → (-61,-448) → (83,-435) | 590 m | 韶关路 to 太平角一路 |
| 嘉峪关路 | E-W | (-455,-582) → (-281,-556) → (-43,-525) → (70,-529) | 535 m | 韶关路 to 香港西路 |
| 武胜关路 | E-W, northernmost | (-503,-692) → (-238,-651) → (-49,-617) | 460 m | 荣成路 eastwards |
| 临淮关路 | E-W, shallow arc bowed north | (-418,-255) → (-322,-301) → (-242,-291) → (-105,-259) → (24,-221) | 465 m | forks off 居庸关路 (W), crosses 宁武关路 and 紫荆关路, ends at 黄海路 (E) |
| 居庸关路 | Diagonal, WNW to ESE, descending toward the sea eastwards | (-564,-226) → (-479,-232) → (-418,-255) → (-321,-241) → (-248,-207) → (-133,-137) → (-80,-109) | 526 m | 韶关路 south end (W) to 黄海路 (E); crosses 宁武关路 and 紫荆关路 |
| 山海关路 | Southernmost, arc parallel to the beach, 50-100 m inland | (-853,60) → (-735,35) → (-635,-36) → (-548,-93) → (-319,-121) → (-246,-107) → (-158,-34) | 770 m | 汇泉路 (W) to 黄海路/紫荆关路 south end by 花石楼 (E) |
| 宁武关路 | N-S (x ≈ -322), bends north-east above 函谷关路 | (-319,-121) → (-322,-376) → (-321,-468) → (-238,-651) → (-185,-760) | 670 m (cited 668 m) | 山海关路 (S) to 香港西路 (N) |
| 紫荆关路 | N-S, tilted NNE | (-148,-42) → (-133,-137) → (-105,-259) → (-79,-372) → (-43,-525) → (-22,-607) | 579 m | 花石楼/黄海路 (S) to 香港西路 (N) |
| 韶关路 | NNE diagonal, with a hook at its south end | (-564,-226) → (-609,-263) → (-563,-382) → (-505,-485) → (-408,-676) → (-287,-883) | 766 m | 居庸关路 west end (S) to 香港西路 (N) |
| 黄海路 (not a "pass") | SW-NE, follows the coast east of 花石楼 | (-189,19) → (-158,-34) → (-80,-109) → (24,-221) → (104,-243) | 411 m | 花石楼 headland to 太平角一路 |
| 正阳关一/二/三支路 | Short N-S lanes at x = -553, -479, -400 | 一支路 and 二支路 run 山海关路 → 正阳关路; 三支路 runs 临淮关路 → 正阳关路 | 292 / 278 / 112 m | cross-links |

Topology: the south zone is a fan, not a grid. 山海关路, 居庸关路 and 临淮关路 are three sub-parallel curves that converge eastwards onto 黄海路 near 花石楼. 宁武关路 and 紫荆关路 are the two north-south ribs, 290 m apart at 正阳关路 and 170 m apart at 山海关路. North of 正阳关路 the layout is a regular ladder: 函谷关路, 嘉峪关路 and 武胜关路 at roughly 90-100 m spacing.

### 3. Signature street trees

| Street | Tree | Season look | Confidence |
|---|---|---|---|
| 韶关路 | 碧桃 (flowering peach) | Spring, a ribbon of pink ("粉红如带") | Confirmed (zh.wikipedia, People's Daily app) |
| 正阳关路 | 紫薇 (crape myrtle) | Summer, magenta-pink; small multi-stem trees with smooth pale bark | Confirmed by zh.wikipedia only |
| 宁武关路 | 海棠 (crabapple), nicknamed "花街" | Spring pink-white; also noted for autumn "梧桐" leaf-fall, so plane trees are probably mixed in | Confirmed |
| 紫荆关路 | 雪松 (deodar cedar) | Evergreen, tiered, drooping blue-green boughs; rows on both sides | Confirmed |
| 临淮关路 | 龙柏 (dragon juniper) | Dark, flame-shaped, twisted columns forming a green corridor | Confirmed |
| 嘉峪关路 | 五角枫 (Acer mono) | Autumn red-orange tunnel | Confirmed by a local quote in People's Daily app |
| 居庸关路 | 银杏 (ginkgo) | Autumn gold, next to 公主楼 | Confirmed by current media. The older canonical text (zh.wikipedia) says 五角枫 for this road, and the page contradicts itself; use ginkgo |
| 山海关路 | 法国梧桐 / 法桐 (London plane) | Mottled cream-olive bark, broad canopy, a listed autumn "落叶景观大道" | One source |
| 函谷关路 | Unknown; possibly 法桐 | n/a | Uncertain, no source found |
| 武胜关路 | Unknown; possibly 法桐 | n/a | Uncertain, no source found |
| 紫荆关路 x 嘉峪关路, NE corner | A grove of 水杉 (dawn redwood) | Russet in autumn | One source |

Other vegetation: large lawns, and paired cypress in the south-west corner ("爱情角"). 黑松 (Japanese black pine), wind-bent on the headlands and along the coast path, is characteristic of Qingdao; that is my recollection, not sourced here.

### 4. Landmarks (real coordinates)

| Place | Real (x, z) | Notes |
|---|---|---|
| 花石楼, 黄海路18号 | (-144, 1); footprint about 15 x 15 m, rotated about 45° | At the east end of 第二海水浴场 on a small rocky headland. The south end of 紫荆关路, the east end of 山海关路 and 黄海路 all meet about 40 m north of it. The beach is immediately west; the rocky coast is to the east. |
| 第二海水浴场 (beach polygon) | x -640..-218; back edge z ≈ -53..-14; waterline z ≈ -14 at centre, +35..+80 at the horns | About 420 m wide and only 25-50 m deep. A concave crescent, with the sea bulging north at the centre. |
| 海滨步行街 (seawall promenade, paved) | (-582,-33) → (-484,-48) → (-360,-69) → (-310,-69) → (-224,-7) → (-213,15) | Runs along the back of the beach, with steps down to the sand. A path links (-310,-69) to the 宁武关路/山海关路 junction at (-319,-121). |
| 海滨木栈道 (wooden boardwalk) | (-187,57) → (-137,50) → (-79,-18) → (-16,-75) → (78,-174) → (264,-183) → (339,-142), then on to 太平角 | Wraps the 花石楼 headland and runs north-east along the rocky shore. |
| 公主楼, 居庸关路10号 | (-499,-254); about 15 x 14 m | North side of 居庸关路, just west of 正阳关二支路. About 360 m west and 255 m north of 花石楼. |
| 元帅楼, 山海关路17号 | (-624,-67) | South (sea) side of 山海关路, behind the west end of the beach. |
| 八大关宾馆 | Grounds (-517,-162); another building tagged (-758,-40) | A large compound between 山海关路 and 居庸关路. |
| 八大关小礼堂 | (-646,-178) | West of the 宾馆. |
| 蝴蝶楼 | (-806,35) | Far west end of 山海关路 near 汇泉路, about 660 m west of 花石楼. |
| 汇泉角 | Around (-1075,480) | South-west headland, wooded, with 东海饭店 at (-916,159). It closes the bay on the west. |
| 太平湾 | Centre around (-30,320) | The water south of the beach and 花石楼. |
| 太平角 | Park around (470,-300); headland tip around (850,550) | East and south-east. A string of small rocky capes and coves, 500-1000 m east of 花石楼. |
| West-end rocks | bare_rock polygon x -732..-634, z 34..111 | Rock platform closing the beach on the west. |
| Shark-net lines | (-262,80) → (-384,228), (-634,66) → (-551,175) | Offshore float lines (tagged as breakwaters in OSM); optional buoy detail. |

### 5. Terrain and materials

- **Slope:** the ground falls gently north to south. SRTM samples include tree canopy, so they read about 5-8 m high. Raw values: 香港西路 21-24 m, 正阳关路 19-26 m (9 m at its west end), 居庸关路 16-22 m, 山海关路 11-17 m, 花石楼 13 m.
- **My ground estimates (uncertain):** 嘉峪关路 about 16 m, 正阳关路 about 13 m, 居庸关路 about 9 m, 山海关路 about 6 m, promenade/seawall top about 3.5 m, beach 0-2 m. The 花石楼 knoll is about 6-7 m, and the ground rises slightly toward the north-west around 韶关路/公主楼. Average slope is about 3-4%: rolling, not steep.
- **Coast rock:** east of the beach (花石楼 headland onward) the shore is jagged reef, with wedge-shaped coves between small capes. Colour is from memory, not verified by search: Qingdao granite weathering warm ochre to reddish-brown, darker and near black with algae at the tide line.
- **Beach:** fine pale-gold sand, backed by a granite-block seawall with the promenade on top. Changing cabins and rows of beach umbrellas are an optional, unverified detail.
- **花石楼:** completed about 1930-32 (sources vary; 1932 is most cited). Design is credited to 刘耀郴; a White-Russian owner is often cited, but that is uncertain. It has a five-level main block and a round corner tower with a crenellated parapet and viewing platform. Walls are grey-buff rough granite with pebble (鹅卵石) inlay, which gives the name. Style is a Gothic/castle mix, with stained glass, a garden and a low stone wall.
- **公主楼:** Danish/Nordic fairy-tale style (the "Danish princess" story is legend). From memory, uncertain: turquoise-green walls, a steep dark-red roof and a slender pointed spire.
- **General fabric (memory plus general descriptions):** detached 2-3 storey villas set back in gardens, with red and orange clay-tile roofs ("红瓦绿树碧海蓝天"). Walls are cream, yellow or grey stucco over rusticated granite bases, with dormers and chimneys. Fences are low granite piers with iron railings; lamps are cast-iron.

### 6. Proposed compressed map (500 m x 450 m)

Scene axes: x in [-250, 250] east, z in [-225, 225] south. The mapping from real coordinates is uniform in the south zone:

- x_scene = 0.68 * (x_real + 290)
- z_scene = 0.68 * z_real + 110

North of 正阳关路 the map is compressed further: 函谷关路 is dropped and 嘉峪关路 is pulled in as the north edge street. Buildings and road widths stay at true size, not scaled.

#### Streets (centre-line polylines; 7 m carriageway plus 2 m verges)

| Street | Tree | Scene polyline (x, z) |
|---|---|---|
| 嘉峪关路 (north edge) | 五角枫, about 9 m spacing | (-250,-205) → (-112,-207) → (-22,-203) → (168,-198) → (250,-196) |
| 正阳关路 | 紫薇, about 6 m spacing, small | (-250,-140) → (-186,-150) → (-22,-146) → (143,-143) → (250,-138) |
| 临淮关路 | 龙柏, about 5 m spacing, dense | (-87,-63) → (-50,-85) → (-22,-95) → (33,-88) → (126,-66) → (214,-40) |
| 居庸关路 | 银杏, about 8 m spacing | (-186,-44) → (-129,-48) → (-87,-63) → (-21,-54) → (29,-31) → (61,-7) → (107,17) → (143,36) |
| 山海关路 | 法桐, about 10 m spacing, large | (-250,95) → (-235,86) → (-175,47) → (-124,41) → (-20,28) → (2,29) → (46,49) → (90,87) |
| 宁武关路 (N-S) | 海棠, about 6 m spacing | (-20,28) → (-21,-54) → (-22,-95) → (-22,-146) → (-22,-203) → (-15,-225) |
| 紫荆关路 (N-S, tilted) | 雪松, about 10 m spacing | (97,81) → (107,17) → (126,-66) → (143,-143) → (168,-198) → (175,-225) |
| 韶关路 (west, hooked) | 碧桃, about 5 m spacing | (-186,-44) → (-205,-50) → (-217,-69) → (-205,-100) → (-186,-150) → (-140,-190) → (-112,-207) → (-100,-225) |
| 黄海路 (coast lane) | Black pine or mixed (uncertain) | (69,123) → (90,87) → (143,36) → (214,-40) → (250,-55) |
| 正阳关二支路 (optional) | Mixed | (-124,41) → (-129,-48) → (-131,-148) |
| 正阳关一支路 (optional) | Mixed | (-175,47) → (-179,-44) → (-186,-150) |

Junctions preserved:

- 居庸关路 and 韶关路 share the west node (-186,-44).
- 临淮关路 forks from 居庸关路 at (-87,-63).
- 居庸关路 crosses 宁武关路 at (-21,-54) and 紫荆关路 at (107,17).
- 临淮关路 crosses 宁武关路 at (-22,-95) and 紫荆关路 at (126,-66).
- 山海关路 meets 宁武关路 at its south end (-20,28).
- 山海关路, 紫荆关路 and 黄海路 converge at about (90-97, 81-87), directly north of 花石楼.

#### Landmarks

| Item | Scene (x, z) | Notes |
|---|---|---|
| 花石楼 | (99,111); 16 x 16 m, rotated 45°, about 20 m to the tower top | On a knoll with ground about 6 m; garden wall; round crenellated tower on the seaward (S/SW) corner (corner uncertain). An entry lane runs from (90,87). |
| 公主楼 | (-142,-63); 15 x 14 m | North side of 居庸关路, west of 二支路; ginkgo in front. |
| 八大关宾馆 (large hotel block plus lawn) | (-154,0) | Between 山海关路 and 居庸关路. |
| 元帅楼 | (-227,64) | South side of 山海关路, west end. |
| 蝴蝶楼 | Off-map in reality (would be x ≈ -350) | Optionally place a token at (-240,105) and mark it relocated. |
| Small parks/lawns | (-60,-120) and (40,-60) to (90,-20) | Real park polygons lie between 临淮关路 and 正阳关路 and around 居庸关路/紫荆关路. |
| Generic villas | About 25-35, on 30-45 m plots along all streets | Set back 8-12 m. |

#### Coast

- **Seawall promenade** (top about 3.5 m, 5 m wide, granite balustrade): (-250,140) → (-199,88) → (-132,77) → (-48,63) → (-14,63) → (45,105) → (52,120). Steps down to the sand at about (-199,90), (-90,70), (-14,66) and (50,118). A link path runs (-14,63) → (-20,28) up to 宁武关路.
- **Beach** (sand, 第二海水浴场):
  - Back edge follows the promenade.
  - Waterline: (-231,132) → (-162,104) → (-92,100) → (-38,117) → (-6,139) → (19,164).
  - Sand polygon is roughly x in [-240,50], 25-45 m deep; the sea bulges north at the centre.
- **花石楼 headland rocks** (reddish-brown/ochre granite reef, 1-5 m high): a cluster within about 35 m of (85,150), tip at (82,160). Further rocky shore strip runs north-east: (104,144) → (143,123) → (186,75) → (235,19) → (250,0), 15-30 m wide, with tide pools.
- **Wooden boardwalk** (海滨木栈道, 2.5 m wide, on the rocks 2-3 m above the water): (70,149) → (104,144) → (124,127) → (143,98) → (186,59) → (199,35) → (250,-8).
- **West rocks** (stand-in for the real platform at x ≈ -300): cluster at (-240,150), radius about 20 m.
- **Sea:** everything south of the waterline to z = +225 and beyond. For the horizon, add far silhouettes: 汇泉角 as a wooded headland with a hotel tower to the south-west at about (-600..-450, 300..450), and the 太平角 rocky capes with pines to the east/south-east at about (350..700, 100..400). An optional buoy/shark-net line runs (19,164) → (-65,225).

#### Terrain heights for the scene (estimates)

Suggested height function: h ≈ clamp(3.5 + (63 - z) * 0.05, ...) north of the seawall, plus a west bump of +2 m around x < -120 and a knoll of +3 m at 花石楼.

| z | Height |
|---|---|
| -225 | 17 m |
| -145 | 13 m |
| -55 | 9 m |
| +30 | 6 m |
| Promenade | 3.5 m |
| Beach | 2 → 0 m |

#### Player and lighting

- **Spawn:** on 山海关路 at (-20,30) looking south-east toward 花石楼, or on 居庸关路 near 公主楼.
- **Sun:** low afternoon sun from the south-west backlights the sea and throws long shadows across the north-south streets.
- **Haze:** Qingdao sea fog (平流雾) drifts in from the south. This is a known local phenomenon, not searched.

### 7. Uncertainties

- Trees on 函谷关路 and 武胜关路 are unknown.
- 居庸关路 is ginkgo in current media but 五角枫 in the older canonical text.
- 正阳关路 紫薇 and 山海关路 法桐 each rest on a single source.
- Ground elevations are estimates.
- Rock colour, the tower corner of 花石楼, 公主楼 colours and the generic villa styling are from memory.
- 花石楼 build year and owner vary by source.
- Road widths, wall heights and tree spacings are design suggestions, not measured.

### Sources

- OpenStreetMap via Overpass API (street, beach, coastline and building geometry): https://overpass-api.de/api/interpreter. Raw data saved at /tmp/claude-0/-root-github-com-Recursive-Self-Improving-qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc/94f5454a-27aa-4a34-8d02-77e3813d8884/scratchpad/osm/o.json and /tmp/claude-0/-root-github-com-Recursive-Self-Improving-qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc/94f5454a-27aa-4a34-8d02-77e3813d8884/scratchpad/osm/b.json
- https://zh.wikipedia.org/wiki/八大关
- https://www.peopleapp.com/article/6907057/6769417
- https://www.ourchinastory.com/cn/16993
- https://c.m.163.com/news/a/FMI7MVG20543B6OX.html
- https://epaper.guanhai.com.cn/conpaper/qdzb/resfile/2024-09-11/A04/qdzb-20240911-A04.pdf
- https://regional.chinadaily.com.cn/shandong/qingdao/2021-04/16/c_612091.htm
- https://chinatripedia.com/huashi-villa-qingdao-ticket-opening-hours-location-and-highlights
- https://api.opentopodata.org (SRTM30 elevations)

---

# Part 2 — Architecture and street-level material culture

## Badaguan (青岛八大关) — visual spec for a procedural modeller

**Reliability note.** Web search returned little physical detail. Only the items in section 1 are sourced. Every dimension, every hex value, and most descriptions of roofs, walls and street furniture are my own estimates from general knowledge of the district and Qingdao vernacular. They are not measured data, so treat them as art direction.

### 1. Sourced facts

- **District:** about 66.6 ha, 200+ villas, mostly built in the 1930s, in styles of 20+ countries. There are ten roads, eight named after passes.
- **1930s planning rules:** building density under 50%; garden walls must be see-through ("花式铁栏、木栅或砖石砌成空花"); paint, stucco, tile and stone colours must harmonise.
- **Trees per road:**
  - 韶关路: 碧桃 (pink peach blossom, spring)
  - 正阳关路: 紫薇 (crape myrtle, summer)
  - 居庸关路: 五角枫, with 银杏 turning gold in autumn (the source is inconsistent between the two)
  - 紫荆关路: 雪松 (deodar cedar, both sides, evergreen)
  - 宁武关路: 海棠 (crabapple)
  - South-west corner: paired cypresses
- **花石楼 (黄海路18号):**
  - Built around 1930–32 for a White Russian; the date and architect are disputed (刘耀宸 or Grasimov, with some claims of 1903/1906).
  - "European castle" style with Gothic, Roman and Russian traces.
  - 5 levels including a roof sea-viewing platform; floor area 753.7 m²; plot 4.5 mu (about 3000 m²).
  - Walls are granite with pebbles, in stone of visibly different textures; the tower top has a crenellated parapet (雉堞式女儿墙); windows have stained glass.
  - It faces the sea beside 第二海水浴场.
- **公主楼 (居庸关路10号):**
  - Danish / Nordic-country style, built around 1940–41.
  - Sources say 2 storeys plus attic plus basement, or 3 storeys plus basement.
  - Irregular steep pitched roofs, pointed spire, dormers (老虎窗), wooden balcony.
  - Described as "绿墙红瓦" or "blue walls, red roof", so read the wall as blue-green teal.
- **元帅楼 (山海关路17号):** Japanese-style 2-storey villa of 1940, with a garden of rockery, small pond and bamboo. It is viewed only from outside the wall. No source describes its exterior.
- **蝴蝶楼 (山海关路21号):** confirmed only as an open "famous house" at that address. No source describes its exterior.
- **山海关路1号 (1933, Renaissance villa):** rough-stone base over 1 m high, pale yellow stucco, black iron gate with shield motif, wooden fence inside iron railings, garden with pool and fountain.
- **山海关路3号 (1934):** irregular plan on a granite foundation, yellow stucco, red-tile pitched roof with a four-cornered wooden pavilion on top, carved timber eaves, stone quoins, arched door with steps, roof terrace with balusters.
- **山海关路5号 (1936):** "Japanese modern", faced in green glazed tiles, 604 m² floor area on a 1.69 mu plot, wisteria in the courtyard.
- **韩复榘别墅 (山海关路13号):** 2-storey house plus a single-storey service row, 800+ m².
- **Atmosphere:** wedding couples year-round, with the shore by 花石楼 called a "wedding-photo street"; almost no pedestrians on the inner streets; asphalt roads that shine after rain.

### 2. Landmark specs (estimates)

#### 花石楼
- **Footprint:** about 16 × 14 m, an asymmetric L/T plan, on a granite terrace 1–1.5 m above the garden.
- **Main block:** 3 storeys, about 11–12 m to parapet, with a flat roof terrace behind a low crenellated parapet. Storey heights about 3.6 m.
- **Round tower:** on the sea-facing corner, engaged about three-quarters proud of the block.
  - Diameter about 5.5–6 m, height about 17–18 m (5 levels).
  - Crenellated top: merlons about 0.6 m wide × 0.7 m high with 0.5 m gaps, on a slightly corbelled ring.
  - Narrow round-arched windows, one per level, staggered; flagpole on top.
- **Secondary volume:** a lower polygonal (half-octagon) bay or stair turret, 2 storeys, also with a parapet.
- **Entrance:** round-arched porch on stubby granite columns, with a balustraded balcony above.
- **Walls:** random-coursed rock-faced granite ashlar in warm grey to buff with recessed darker joints. Add panels or bands of small rounded pebbles (pebble-dash) between the stone, in mottled grey, ochre and rust. The patchwork of two textures is the signature.
- **Windows:** tall, narrow, some paired under round arches, with dark frames and stained-glass accents (amber, green, red).
- **Setting:** lawn, black pines, low granite wall, sea directly behind.
- **Colours:**
  - granite light `#B9B2A3`, mid `#9C9485`, dark `#7A7469`
  - pink-buff granite `#C2A893`
  - pebble panel `#A89C86` with speckles `#6E6A62`, `#C9B48C`, `#8A5F4A`
  - joints `#5E5A54`
  - window frames `#4A3A2C` or `#F1ECE0`
  - stained glass `#C8962E`, `#3F7F5A`, `#9C2F2A`
  - copper details `#5E8F7E`

#### 公主楼
- **Footprint:** about 12 × 10 m, compact, 2 storeys plus a tall attic.
- **Roof:** very steep, 55–60°, cross-gabled, clay tile, with eaves low to the first-floor window heads. Ridge at about 12–13 m.
- **Spire:** a slender square or octagonal turret on one corner, rising to about 16–18 m, with a needle spire (pitch about 75–80°) and finial, clad in green.
- **Details:** gabled dormers, one tall chimney, a small wooden balcony, and an entrance porch with its own steep gablet.
- **Walls:** smooth or lightly textured stucco in sea-green/teal, with white window surrounds and corner trim, on a grey granite plinth about 0.8 m high. Small multi-pane white casements.
- **Colours:**
  - wall `#5FA79B` (shadow side `#4C8C84`; a bluer alternative is `#6FB1B5`)
  - trim `#F3EFE4`
  - roof `#A8452F` to `#8C3A2A`
  - spire `#3E7F6C`
  - plinth `#8F8A80`
  - door `#6B3F26`

#### 蝴蝶楼
- **Massing:** modest 2-storey villa, about 18 × 9 m. A symmetrical central block with two slightly angled or projecting side wings gives the "butterfly" reading in plan.
- **Roof:** low hipped, red tile, 30–35°.
- **Walls:** cream-yellow stucco on a rusticated granite base.
- **Details:** central recessed loggia or balcony with simple columns; green or brown window joinery.
- **Colours:** wall `#E6D3A1`, base `#958F84`, roof `#B4502F`, woodwork `#3F5E4A`.

#### 元帅楼
- **Massing:** 2 storeys, about 16 × 11 m, with a horizontal emphasis.
- **Roof:** low hipped, 25–30°, with deep eaves (0.9 m overhang) and exposed rafters, in dark grey-brown or dull red tile.
- **Walls:** a tall granite rubble ground storey or base, with buff or cream stucco above.
- **Details:** horizontal window bands with dark timber frames; entry porch with a flat canopy; garden with rockery, small pond and bamboo clump.
- **Colours:** wall `#D9CBB0`, stone `#8C877C`, roof `#7A4A3A` or `#5C5550`, timber `#3B2E25`.

### 3. Generic villa vocabulary (estimates)

- **Massing:**
  - Footprint 10–18 m × 8–14 m, on plots of 800–2500 m².
  - Set back 6–15 m from the wall. Because coverage is under 50% (usually far less), there is always garden on all sides.
  - 2 storeys plus attic is typical. Ground storey 3.4–3.8 m, upper storey 3.0–3.3 m, eaves at 7–8 m, ridge at 10–13 m.
  - Asymmetry is the rule: projecting gable bay, corner turret, side porch.
- **Base (蘑菇石):** rock-faced granite blocks with bulging faces, 0.6–1.5 m high, sometimes the full ground storey. Blocks are about 30–60 × 20–30 cm with deep joints. Stone quoins and stone window sills are common.
- **Walls:**
  - Stucco, often rough 拉毛 texture.
  - Colours: cream `#EADFC4`, ochre-yellow `#E0C27A`, pale yellow `#EBD9A0`, warm grey `#B8B2A6`, blush `#D9B8A0`, off-white `#EFEADD`.
  - Weathering: darker streaks under sills and at the base, patches of ivy (爬山虎) in `#3F6B3A`, turning red `#A23B2A` in autumn.
- **Roofs:**
  - Qingdao red clay tile (flat interlocking or 牛舌瓦), in a base of `#B5482E` with per-tile variation between `#C65A38`, `#9E3F2A`, `#8A3A2B` and lichen-dulled `#7F4A3A`.
  - Pitches 35–50°.
  - Forms: hip, half-hip (jerkinhead), cross-gable, mansard with dormers, occasional conical turret cap.
  - Eaves overhang 0.4–0.7 m with a white or brown boxed soffit.
  - Chimneys: 1–3 per house, 0.6–0.9 m square, in stucco or granite, with a corbelled cap and clay pots, rising 1–1.5 m above the ridge.
  - Dormers: gabled, hipped or eyebrow, 1.2 m wide.
- **Openings:**
  - Timber casements with glazing bars (2×3 or 2×4 panes), 0.9–1.2 m wide × 1.5–1.8 m high.
  - Frame colours: white `#F2EEE2`, dark green `#2F5341`, oxblood `#7A2E25`, brown `#5A3B28`.
  - Louvred shutters on some.
  - Round-arched ground-floor windows or doors with stone voussoirs.
  - Bay windows: canted, 2.4 m wide, 1–2 storeys.
  - Entrance: 4–6 granite steps, panelled door, small tiled canopy on brackets or a columned porch.
- **Outdoor rooms:** arcaded verandas or loggias (2–3 arches); first-floor balconies with turned balusters (white, 0.9 m) or iron rails; roof terraces with balustrades; timber-framed sun rooms.
- **Garden:** lawn `#5E8B3E`, clipped box or holly hedges, black pine, cedar, magnolia, wisteria pergola, flagpole base, and a small garage or gatehouse of the same materials.

### 4. Eight villa archetypes (estimates)

| # | Name | Footprint (m) | Storeys / heights | Roof | Walls | Trim and features |
|---|---|---|---|---|---|---|
| A | German Jugendstil villa | L-shape, 14×11 + 5×5 wing | 2 + attic; eaves 7.5, ridge 12.5 | Half-hip (jerkinhead) 48°, red `#B5482E`; 2 gabled dormers; 2 chimneys | Ochre 拉毛 `#DDBE78`; granite base 1.2 m `#928C80` | Stone quoins; half-timbered gable `#5A3B28` on `#EFE6CF`; canted bay; arched stone door; green shutters `#2F5341` |
| B | Castle / tower villa (花石楼 kin) | 13×11 + round tower Ø4.5 | 2–3; flat parapet 10.5; tower 14 | Flat with crenellations; or conical red cap 60° on tower | Full rock-faced granite `#A69F91` / `#8C857A` | Round-arched windows, loggia, balustraded terrace |
| C | Nordic steep-roof cottage (公主楼 kin) | 11×9 | 2 + attic; eaves 5.5, ridge 12 | Cross-gable 55–60°, `#A8452F`; spire turret to 16 | Teal `#5FA79B`, or pale blue `#9DBFCB`, or mint `#A9CDB5` | White trim `#F3EFE4`, dormers, timber balcony |
| D | Spanish / Mediterranean | 16×10 | 2; eaves 7, ridge 9.5 | Low hip 22–25°, barrel tile `#C2603A`, shallow eaves | White / cream `#F1E9D6` | 3-arch ground loggia, twisted columns, iron balconies `#22211F`, small tower stair, round vent in gable |
| E | French mansard | 14×12 symmetrical | 2 + mansard; cornice 7.5, top 11 | Mansard (lower slope 70°, upper 20°) in dark red `#8C3A2A` or slate-grey `#5B5F66`; segmental dormers | Warm grey `#C4BDAF` or blush `#D9B8A0` | White cornice and pilasters, central porch with balcony over, tall french windows, shutters |
| F | Japanese-modern (元帅楼 / 山海关路5号 kin) | 17×10 | 2; eaves 6.5, ridge 9 | Hip 28°, deep eaves 0.9 m, tile `#6A4B3E` or `#5C5550` | Buff `#D9CBB0` over granite ground storey; or green glazed tile `#5E8468` | Horizontal window bands, flat-canopy porch, bamboo and rockery |
| G | English / American country house | T-shape, 18×9 + 7×6 | 2 + attic; eaves 7, ridge 11.5 | Cross-gable 42°, red `#B5482E`; tall chimneys; shed dormers | Pale yellow `#EBD9A0`; granite base 0.8 m | White sash windows, timber-columned veranda across the front (2.5 m deep), sun-room bay, green door `#2F5341` |
| H | Art Deco / modernist 1930s | 14×10, curved corner R=3 | 2–3; parapet 8–10 | Flat or very low hip behind parapet; roof terrace with pipe rail | Off-white `#EFEADD` or grey `#B8B2A6`; smooth stucco with horizontal grooves | Corner strip windows, porthole window, cantilevered slab canopy, steel railings `#2B2B2B` |

Randomise per instance: mirror the plan, wall colour from the palette, roof tile hue ±8%, number of chimneys and dormers, ivy coverage 0–40%, and shutters on or off.

### 5. Street-level material culture (estimates, except where section 1 covers it)

- **Roads:**
  - Quiet two-lane asphalt, carriageway 6–9 m, in `#3D3F42` with older, greyer patches `#55575A`.
  - Faint or absent centre line; white edge markings are rare.
  - Gentle slopes and curves; streets are not perfectly gridded, with Y-junctions and small triangular green islands.
  - A few parked cars (black or white sedans), an occasional tour bus on the edge roads, and electric sightseeing carts.
- **Kerb:** granite, 15 cm wide × 12–15 cm upstand, `#A7A198`.
- **Sidewalk:** 2–3.5 m wide. Use either granite slabs (60×30 cm, flamed grey `#9A968E` / `#B0AAA0`, staggered bond) or small square concrete or granite setts in grey with a reddish band. Tree pits are 1.2–1.5 m square with granite edging, some with cast-iron grates, and roots heave the slabs. Leaf litter is important: gold ginkgo `#E2B32E`, maple red `#B8452A`, peach petals `#F2B6C6`.
- **Street trees:** spaced 6–8 m, with canopies meeting over the road to make the tunnel effect that defines the place. Beyond the sourced species in section 1, from memory: 嘉峪关路 has maples, 山海关路 plane trees, 临淮关路 dragon cypress.
- **Garden walls (the continuous street edge, critical for feel):**
  - Random granite rubble or rock-faced blocks, 0.8–1.2 m high, 0.4–0.5 m thick, in `#9C968A`, `#857F74` and `#B3A995`, with raised (凸缝) grey cement pointing `#6B6862` and a flat or half-round coping.
  - On top, either a black or dark-green wrought-iron railing 0.8–1.0 m high (spear or scroll pickets at 12 cm centres, `#1F2321` or `#27402F`), a clipped hedge behind, or pierced masonry.
  - Stone piers every 3–4 m, 0.5 m square × 1.6–1.9 m high, with a pyramidal or ball cap.
  - Moss at the base `#5C6B3E`; ivy and climbing roses spilling over.
- **Gates:** two granite piers, 0.6–0.7 m square × 2.2–2.6 m high, capped, sometimes with lantern globes. Double wrought-iron leaves 3–3.6 m wide in black, with scroll or shield motifs, plus a 1 m pedestrian wicket. Add a blue enamel house-number plate and a black or bronze heritage plaque (优秀历史建筑 / former-resident plaque) about 40×60 cm on the pier.
- **Street lamps:** European cast-iron style in black or dark green `#1E2B25`, 4–5 m tall, with a fluted post and flared base. The head is a single lantern (four-sided glass, small roof and finial) or a twin-arm bracket with frosted globes, in warm white 2700–3000 K (`#FFD9A0`). Space them 25–30 m apart, alternating sides. Taller plain cobra-head lamps stand on the edge roads.
- **Street name signs:** standard Chinese blue plate, about 100×30 cm, in blue `#1F5FA8` with white text and border. Chinese characters sit over pinyin (for example 居庸关路 / JUYONGGUAN LU), with direction letters at the ends (东/西, 南/北), on a grey steel pole at 2.5 m. Brown tourist signs `#7A4A22` point to 花石楼, 公主楼 and 第二海水浴场.
- **Benches:** timber slats in `#7A5230` (weathered `#8C7A66`) on black cast-iron scroll ends, 1.5–1.8 m long, in pocket parks and wide sidewalks. Also granite block seats.
- **Other clutter:** green or grey paired litter bins, engraved granite boulder name stones (red-filled characters `#B3261E`), grey utility boxes, overhead wires on a few lanes, low bollards, and shared-bike clusters at edges.
- **People:**
  - Wedding couples are the signature. The bride wears a white gown with a long train (or a red qipao/秀禾), the groom a black or navy suit. With them are a photographer, an assistant holding a round silver or gold reflector (Ø 80–110 cm), and sometimes a light stand.
  - They pose in the middle of an empty road under the tree tunnel, at granite walls and gates, on the lawn at 花石楼, and on the rocks by the sea.
  - Add a few strollers and an elderly resident. Density is low.
- **Light and mood:** maritime haze and soft sea fog (平流雾, late spring to summer), dappled light through the canopy, a pale blue-grey sea horizon `#8FB3C4`, and a cool neutral fog tint `#C9D3D6`. Golden hour light on red roofs against dark cedar green `#2E4A3A` is the iconic palette: 红瓦绿树、碧海蓝天.

### 6. Master palette

| Element | Hex |
|---|---|
| Roof red tile | `#B5482E`, `#C65A38`, `#9E3F2A`, `#8A3A2B` |
| Granite | `#B9B2A3`, `#9C968A`, `#857F74`, `#C2A893` |
| Mortar | `#6B6862` |
| Stucco | `#EADFC4`, `#E0C27A`, `#EBD9A0`, `#D9B8A0`, `#B8B2A6`, `#EFEADD`, `#5FA79B` |
| Woodwork | `#F2EEE2`, `#2F5341`, `#7A2E25`, `#5A3B28` |
| Iron | `#1F2321` |
| Asphalt | `#3D3F42` |
| Paving | `#9A968E` |
| Kerb | `#A7A198` |
| Foliage | cedar `#2E4A3A`, plane `#5C7F3A`, ginkgo `#E2B32E`, maple `#C0522B`, peach blossom `#F2A9BD`, crape myrtle `#C75C9A`, crabapple `#F6CAD3` |
| Sign blue | `#1F5FA8` |
| Lamp glow | `#FFD9A0` |
| Sea | `#4F8FA8` |
| Sky haze | `#C9D3D6` |

Sources:
- [maigoo — 八大关 building entries](https://m.maigoo.com/citiao/138365.html)
- [zh.wikipedia — 八大关](https://zh.wikipedia.org/wiki/八大关)
- [ourchinastory — 漫游青岛八大关](https://www.ourchinastory.com/cn/16993)
- [cncn — 青岛八大关建筑的特别之处](https://lxs.cncn.com/80867/n396048)
- [sohu — 公主楼](https://m.sohu.com/n/390787906/)
- [chinatripedia — Marshal House](https://chinatripedia.com/?p=29820)
- [dreamofacity — A Random Wander through the Eight Passes Villa District](https://dreamofacity.com/2014/10/18/a-random-wander-through-the-eight-passes-villa-district-%e5%85%ab%e5%a4%a7%e5%85%b3-qingdao/)
- [ctrip travelogue](https://gs.ctrip.com/html5/you/travels/5/4058861.html)

---

# Part 3 — Atmosphere, presets, audio, captions

## 八大關 (Badaguan) atmosphere and art direction

**Sourcing caveat:** web search returned thin results (mostly travelogues). Items tagged **[S]** are search-confirmed; **[K]** are from my background knowledge, not verified this session. Sun angles are my own calculation for Qingdao (36.05°N, 120.35°E), good to about ±3°.

**Conventions:** azimuth is degrees clockwise from north. The Badaguan coast (太平灣) faces south/south-east, so put the sea on the south side of the map. Fog density is for `THREE.FogExp2` in metre units.

### 1. What the place actually feels like

#### Layout and materials [K unless marked]
- **Streets:** ten quiet, gently curving residential roads named after Great Wall passes, sloping south to the sea, with almost no shopfronts or signage.
- **Villas:** each sits back in a garden behind a low rough-cut granite wall (蘑菇石) with iron railings or a clipped hedge on top.
- **Roofs:** steep red clay tile with dormers, chimneys and the odd turret or half-timbered gable.
- **Walls:** stucco in ochre-yellow, cream, pale grey-green or dusty pink over a pinkish-buff Laoshan granite plinth; window frames dark green or white.
- **Signature rule:** each road has its own tree species, so every street needs a distinct canopy shape and colour. This is the main thing separating it from a generic park.
- **Slogan:** 「紅瓦綠樹、碧海藍天」 is popularly attributed to 康有為. Palette logic: warm red-orange roofs against dark conifers, with a cool teal sea strip closing the downhill vistas.
- **People:** wedding-photo couples are everywhere; a distant white-dress silhouette on the reef or under the ginkgo is an authentic touch.

#### Road-to-tree mapping

| Road | Tree | Season | Confidence |
|---|---|---|---|
| 韶關路 | 碧桃 (flowering peach; pink, white, deep red, sometimes mixed on one tree) | mid/late April | [S] |
| 寧武關路 | 海棠 (crabapple), nicknamed 「花街」 | April | [S] |
| 正陽關路 | 紫薇 (crape myrtle, magenta/lilac) | July to September | [K] |
| 居庸關路 | 銀杏 (ginkgo), pure gold | early to late November | [S] |
| 嘉峪關路 | 五角楓 (maple), "a dozen colours on one tree" | November | [S] |
| 紫荊關路 | 雪松 (deodar cedar), drooping tiers forming a dark tunnel | evergreen | [K] |
| 臨淮關路 | 龍柏 (dragon juniper), flame-shaped dark columns | evergreen | [K] |
| 山海關路 and others | 法國梧桐 (plane), mottled camouflage bark | russet leaves in autumn | [K] |

- **Maple colour:** the classic official text assigns 五角楓 to 居庸關路; current visitor reports put ginkgo there and maples on 嘉峪關路, so use the visitor version. 五角楓 turns yellow, orange and russet with only some scarlet [K], so do not render Japanese-maple crimson.
- **Leaf carpets:** a 22 November travelogue reports gold ginkgo, multicoloured maples and a rustling leaf carpet [S]. Leaves pile in drifts against granite kerbs and wall bases.
- **Cedar tunnel:** light arrives as a few hard shafts in dusty air, over a floor of brown needles.
- **Plane trees:** large, soft-edged coin-shaped dapples that sway slowly.

#### Light [K, with solar geometry computed]
- **Autumn:** the clearest air of the year (dry northerlies). Noon sun reaches only about 37°, so it sits over the sea all day. Streets running downhill are backlit: glowing translucent leaves, long shadows toward the viewer, a glitter path on the water.
- **Spring:** soft, slightly milky and hazy, with cool wind and pastel colours.
- **Early summer:** fog season, shadowless pearl-grey.
- **High summer:** humid white-blue sky, deep green shade, strong contrast.
- **Winter:** crisp and bare; plane-tree seed balls, with the conifers carrying the scene.

#### Sea fog
- **Type and cause:** advection fog. Warm, humid southerly air crosses the cold Yellow Sea surface (about 15 °C in June) [S].
- **Season:** April to July, peaking June and July [S, partly inferred from neighbouring Weihai data].
- **Daily rhythm:** thickest in the morning, thinning between about 11:00 and 15:00 [S, travel-guide grade].
- **Behaviour:** fog days fall off inland from the coast, and fog lifts into low stratus as it moves over land [S]. A density gradient from sea to inland therefore looks correct.
- **Look:** not uniform. Tongues slide in from the sea, the horizon vanishes, treetops and turrets float, and the sun is a pale disc you can look at. Red roofs desaturate to salmon-grey.

#### Sea, sand and rock [K]
- **Water:** Yellow Sea green-teal with a slightly milky, jade quality from silt. Deep water is grey-teal, shallows celadon, and it turns pewter under fog. Never tropical cyan or ultramarine.
- **Surf:** small, a 0.3 to 0.6 m swell in a sheltered bay, with thin white lace.
- **Sand:** 第二海水浴場 is a crescent of fine pale-gold sand, with a darker wet band and seaweed wrack lines.
- **Reefs:** 太平角 has reddish-brown weathered granite reefs with dark seaweed/barnacle bands at the waterline, and wind-bent black pines (黑松) on the headlands.

#### Soundscape [K]
- **Sea:** low, slow surf on a 7 to 10 s period, plus pebble hiss at the reefs.
- **Wind:** a soft "松濤" hiss in pines and cedars, distinct from the papery rattle of plane leaves.
- **Birds:** magpies (喜鵲) and sparrows are the everyday birds. Gulls are present all year but numerous from November to April.
- **Cicadas:** a wall of sound in July and August.
- **Ships:** distant horns from the Qingdao port approaches and periodic foghorns on fog days. Old Qingdao's 團島 foghorn was nicknamed 「海牛」 for its cow-like moan.
- **Underfoot:** leaf crunch, and occasionally a bicycle or a camera shutter.

#### Mood
Quiet, slow and nostalgic: a 1930s European seaside villa suburb grown over by eighty-year-old Chinese street trees. Walk speed should be a stroll (about 1.4 m/s; a sprint feels wrong), and the UI should stay sparse.

### 2. Default and ambience presets

**Default: 秋日午後, early November, about 14:30.** It is the most photographed moment (ginkgo and maple peak) and has the clearest air. The low sun over the sea gives backlit leaves, long shadows and water glitter at once, with leaf-fall as built-in motion. Spawn at the top of 居庸關路 looking downhill toward the sea, 公主樓 on one side.

| | A 秋日午後 (default) | B 清晨海霧 | C 夏末黃昏 | D 春日花季 |
|---|---|---|---|---|
| Date / time | Nov 8, 14:30 | Jun 10, 06:30 | Aug 25, 18:10 | Apr 18, 10:00 |
| Sun elevation / azimuth | 26° / 220° (SSW, over sea) | 18° / 80° (pale disc) | 6° / 278° (W) | 50° / 125° (SE) |
| Sky zenith / horizon | `#3d7cc4` / `#cfe0ea`, warm `#f3e3c2` near sun | `#b9c4c8` / `#d5dadb`, no visible blue | `#44608f` / `#f4a964`, band `#e98a6a`, anti-solar `#8f86a8` | `#6fa6d8` / `#dfe9ee` (milky) |
| Sun colour / temp / intensity | `#ffe2b0`, ~4500 K, 3.0 | `#e9eef0`, ~6500 K, 0.6 | `#ff9d5c`, ~2800 K, 2.2 | `#fff4e0`, ~5500 K, 2.8 |
| Hemisphere sky / ground | `#bcd6f0` / `#8a6a3c`, 0.55 | `#cfd6d8` / `#7b8078`, 1.1 | `#7f8fc0` / `#6a4a38`, 0.45 | `#d4e6f5` / `#7d8a5a`, 0.7 |
| Shadows | crisp, long, slightly blue (`#5a6a8c` tint) | nearly none (radius max, opacity 0.15) | very long, soft, violet | medium, soft-edged |
| Fog colour / density | `#d9e2e6` / 0.0012 | `#cdd4d5` / 0.018 at shore, 0.007 inland; height fog below ~12 m | `#e6b48c` / 0.0028 | `#e3ebee` / 0.0022 |
| Sea shallow / deep / spec | `#5fa79a` / `#2c6d77` / `#fff1cf` strong glitter | `#9aaba6` / `#7d908f` / none; no horizon line | `#6f8f93` / `#2f5560` / `#ffb070` path | `#6bb5a6` / `#3a8088` / mild |
| Exposure / bloom | 1.0 / 0.35 | 0.9 / 0.15 | 1.1 / 0.6 | 1.05 / 0.3 |

**Foliage palettes**

| Element | A 秋日午後 | B 清晨海霧 | C 夏末黃昏 | D 春日花季 |
|---|---|---|---|---|
| Ginkgo | `#f2c21b` `#e8a80c` `#f7d84a`; trunk `#4a4038` | `#5f8a52` (fresh green) | `#4f7a35` | new leaf `#a9cf5e` |
| Maple (五角楓) | `#e9742b` `#d9a21e` `#c8402a` `#9a3a22`, 10% green `#8a9a3a` | `#4f7d4c` | `#4a7032` | `#9cc45a` + red samara tint `#c9806a` |
| Plane | `#b88a3a` `#8f6a2c` `#a9a04a` | `#557f50` | `#3f6b2d` `#5a8a35`, rim-lit `#b7c24a` | `#a6c95c`; bark `#c9c4a8` / `#8c9070` |
| Cedar | `#2f4a3c` `#3d5d4a` | `#3c4f48` | `#24402f` | `#2f4f3e` |
| Juniper | `#2a4a34` | `#34483f` | `#1f3a2a` | `#2a4a34` |
| Flowers | none | hydrangea `#8fa6c8` `#c9a6c4` (species is my suggestion) | crape myrtle `#c44f9a` `#d98ac0` | peach `#f29bb4` `#ffd9e2` `#d6355f` `#ffffff`; crabapple `#f7c6d0` buds `#e0607e` |
| Lawn | `#7c8a3e` (tired) | `#6f8f62` | `#4d7a33` | `#7fb04a` |
| Roof / wall response | `#b5482f` / `#e6c98a` | `#a8776a` / `#cfc6ae` (desaturate ~40%) | `#d2532f` / `#f0b877` | `#bf5238` / `#ecd9a6` |

**Particles and extras**

- **A 秋日午後**
  - Fan-shaped ginkgo leaves (about 600) falling in a slow spiral at 0.6 to 1 m/s, with a gust every 20 to 40 s.
  - Maple leaves tumbling; leaf-litter decals and instanced ground leaves, dense at kerbs.
  - Dust motes in sun shafts; 2 to 3 gulls far out over the sea.
- **B 清晨海霧**
  - 30 to 50 large soft fog-wisp billboards drifting inland from the sea at 0.3 to 0.8 m/s, with noise-scrolled alpha.
  - Dew sparkle off; drip particles under cedars.
  - Lit villa windows and lamp posts (`#ffd9a0`) with halos.
  - Gulls appear out of the fog and vanish; a ship silhouette is optional.
- **C 夏末黃昏**
  - Backlit midges and motes in orange shafts.
  - Lamp posts flicker on, window glow.
  - Gulls and swallows in silhouette; a few early plane leaves falling.
- **D 春日花季**
  - Pink and white petals (about 500) with fluttering sideways drift; petal carpets under the peach trees.
  - Butterflies (2 to 3); poplar/willow fluff motes are optional.
  - A few gulls.

**Transitions and shafts:** crossfade all uniforms over 3 to 4 s on preset change. God-rays are worth doing only in A and C, specifically in the cedar tunnel on 紫荊關路 and the plane avenues.

### 3. Procedural audio (WebAudio only)

Start the `AudioContext` on the first click or pointer-lock. Route master, then a compressor, then the destination. Build one shared reverb from a `ConvolverNode` whose impulse is generated in code as stereo white noise × exp(−t/τ), with τ ≈ 1.8 s.

**Noise source:** fill a 4 s looping `AudioBuffer` with white noise. Derive pink (Paul Kellet filter) and brown (leaky integrator) versions offline and reuse them everywhere.

**Layers**
- **Surf:** brown noise through a lowpass at 500 Hz, plus pink noise through a bandpass at 1.8 kHz (Q 0.7) for swash. Each wave is a scheduled envelope: 2.5 s swell, a crash peak, then a 4 to 6 s decay in which the bandpass centre sweeps 2.5 kHz → 900 Hz (retreating hiss). Randomise the period between 7 and 11 s and overlap two voices panned L/R. Scale gain and lowpass cutoff with distance to the shoreline (or use a `PannerNode` on the nearest shore point) so the sea swells as you walk downhill.
- **Wind in pines/cedars:** pink noise through a bandpass at 600 to 1400 Hz (Q about 1.2), with centre and gain driven by slow smoothed-random LFOs (0.05 to 0.2 Hz). Boost near cedar and pine zones.
- **Deciduous rustle:** a highpass at 3 kHz with a faster flutter (6 to 12 Hz AM, shallow). Sync gust peaks to the leaf-particle gusts.
- **Gulls:** a triangle + sawtooth oscillator through bandpass formants at about 1.6 and 2.8 kHz. Per call, glide pitch 900 → 1500 → 800 Hz over 0.35 s; repeat 3 to 6 times with accelerating gaps ("kyaa-kya-kya-kya"); add 8% pitch jitter. Random pan, heavy reverb, quiet, every 15 to 40 s.
- **Songbirds / magpie:**
  - Sparrow chirp: an FM sine (carrier 3 to 5 kHz, modulator 30 to 60 Hz) in 60 ms blips.
  - Magpie: 5 to 8 harsh "chak" bursts made from noise through a bandpass at 2.2 kHz (Q 4), 40 ms each.
- **Cicadas (preset C; mid-volume, fading as the sun sets):** a 4.5 kHz and a 5.2 kHz square oscillator through a bandpass, amplitude-modulated by a 90 to 120 Hz square. Apply a slow 6 to 10 s swell envelope ("wee-----wee") and run 3 detuned voices at different pan positions.
- **Ship horn:** two saws at 110 Hz and 138.6 Hz (or 87 + 110 for a big ship) through a lowpass at 350 Hz. Use a 0.3 s attack, 2.5 to 4 s sustain, 1 s release, a slight downward pitch droop at the end, long reverb and very low gain, panned toward the sea. Trigger every 60 to 150 s.
- **Foghorn 「海牛」 (preset B only):** a single 85 Hz saw + sine with a slow vibrato, 5 s long, repeating regularly about every 30 s.
- **Footsteps (driven by walk cadence and ground type):**
  - Leaf litter: a 90 ms burst of white noise through a highpass at 2 kHz with 3 to 4 randomised micro-grains (crunch).
  - Granite/asphalt: a 40 ms thump (lowpassed noise at 250 Hz plus a click at 1.8 kHz).
  - Sand: soft pink noise at 700 Hz, 150 ms.
  - Grass: quieter, bandpassed at 1.2 kHz.
- **Fog acoustics (preset B):** put a master lowpass at about 3.5 kHz on everything except footsteps, raise the reverb send, and add occasional drip plinks (a sine at 1.2 to 2 kHz with a 30 ms exponential decay).
- **Optional music bed:** a very sparse pentatonic or major-7th "music-box/piano" generator (sine + triangle, 2 s decay, one note every 3 to 8 s). A distant old piano suits the nostalgia. Default it to off or very quiet, with a toggle.

**Per-preset mix**

| Preset | Surf | Other layers |
|---|---|---|
| A 秋日午後 | 0.5 | wind 0.4 with rustle gusts, magpies, sparse gulls, rare horn |
| B 清晨海霧 | 0.35 (muffled) | foghorn, drips, almost no birds |
| C 夏末黃昏 | 0.5 | cicadas, swallow chirps, horn |
| D 春日花季 | 0.4 | lively songbirds, light breeze |

### 4. Captions (繁體中文) for points of interest

Facts in the captions are tagged [S] or [K] in the notes below each one.

1. **花石樓 · 黃海路18號**
   「花崗岩與鵝卵石砌成的小小城堡,守著太平灣的潮聲。」
   建於1930年代初,融合多種歐洲風格的古堡式別墅,因外牆以花崗岩和鵝卵石砌築而得名;是八大關離海最近的別墅之一。
   *Notes:* [S]. The "蔣介石樓" legend lacks documentary support, so avoid stating it as fact.

2. **公主樓 · 居庸關路10號**
   「藍綠色的尖頂,像一則沒有等到主角的北歐童話。」
   建於1930年代的丹麥式別墅;相傳為丹麥公主而建,公主卻始終未曾到來,名字倒留了下來。
   *Notes:* the legend and decade are [S]; the address and the blue-green colour are [K].

3. **居庸關路 · 銀杏**
   「十一月,整條路被陽光與銀杏染成一種顏色。」
   八大關一路一樹,居庸關路以銀杏著稱;每年十一月葉色金黃,落葉鋪滿路面。
   *Notes:* [S] from a travelogue.

4. **嘉峪關路 · 五角楓**
   「一樹之間,由綠而黃、由橙入紅,秋天在這裡慢慢調色。」
   路旁遍植五角楓,深秋一棵樹上可見十餘種顏色;十一月為最佳觀賞期。
   *Notes:* [S].

5. **紫荊關路 · 雪松**
   「雪松垂下層層枝葉,把正午也過濾成幽暗的綠。」
   兩側成排雪松四季常青,是八大關中唯一終年濃蔭如隧道的路。
   *Notes:* the cedar rows are [K]. "唯一" is my own flourish and is unverified; drop it to be safe.

6. **韶關路 · 碧桃 / 寧武關路 · 海棠**
   「四月,花比行人多;風一過,整條街都在落粉色的雪。」
   韶關路植碧桃,寧武關路植海棠,花期在四月;寧武關路因此有「花街」之稱。
   *Notes:* [S].

7. **第二海水浴場 · 太平灣**
   「一彎淺金色的沙,盛著黃海特有的青綠。」
   緊鄰八大關與花石樓,位於匯泉角與太平角之間的太平灣內,以沙細、水清、浪緩聞名。
   *Notes:* the adjacency is [S]; the bay geography is [K].

8. **太平角 · 礁石**
   「赤褐的礁石伸進海裡,黑松在風中側著身子。」
   八大關東側的岬角,岸線曲折、礁石嶙峋,是青島著名的婚紗攝影地。
   *Notes:* [K].

**Optional intro card:**
**八大關**
「紅瓦綠樹,碧海藍天。」
1930年代起建設的海濱別墅區,道路以長城關隘命名(初為八條,今為十條),匯集二十餘國風格的建築,有「萬國建築博覽會」之稱;2001年列為全國重點文物保護單位。
*Notes:* the 2001 listing is [S]; the rest is [K].

### Sources

- [新浪旅遊: 青島海霧 (advection fog, timing)](https://travel.sina.cn/2026-06-18/detail-inicvrtm6469698.d.html?vt=4)
- [山東氣象 / qikan: 青島 4–7 月海霧分布](https://www.qikan.com.cn/article/sdqx20250303.html)
- [Springtime sea fog penetration in Qingdao](https://katalog.lib.cas.cz/KNAV/EdsRecord/edsdoj,edsdoj.7596fae138b74a35b1a54247ccaca367)
- [威海 4–9 月平流低雲](https://www.163.com/dy/article/IQRETRG5051492EO.html)
- [漫遊青島八大關 藏在紅瓦綠樹裡的海濱風情](https://www.ourchinastory.com/cn/16993)
- [攜程遊記: 11 月銀杏與五角楓](https://gs.ctrip.com/html5/you/travels/5/4118258.html)
- [攜程遊記: 四月海棠與碧桃](https://gs.ctrip.com/html5/you/travels/5/4047525.html)
- [攜程遊記: 花石樓](https://gs.ctrip.com/html5/you/travels/5/4124296.html)
- [cncn 八大關指南](https://www.cncn.com/guide/e7a10024ad6cb753a3ed3bf6befac64e.html)
- [網易: 花石樓 / 公主樓](https://c.m.163.com/news/a/FMI7MVG20543B6OX.html)
- [chinatripedia: 青島浴場](https://chinatripedia.com/?p=30754)

---

# Part 4 — three.js technique (r187)

## three.js technical approach for 八大关 (verified against three@0.187.0)

### 0. How this was verified

- `npm view three version` gives **0.187.0** (r187, published 2026-10-30).
- I unpacked the npm tarball and read the actual source, then ran a DOM-free Node import check; nothing was rendered and no browser was launched.
- Context7 and web search were not used; the published package source is the authority for every API claim below.
- Unpacked source for reference: `/tmp/claude-0/-root-github-com-Recursive-Self-Improving-qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc/94f5454a-27aa-4a34-8d02-77e3813d8884/scratchpad/three-pkg/package`
- Shader snippets below are written against the verified chunk names and injection points, but have not been compiled in a browser.

### 1. r187 facts that differ from older habits

| Item | Status in r187 (from source) |
|---|---|
| `PCFSoftShadowMap` | Deprecated in r186; at runtime it warns "has been removed" and falls back to `PCFShadowMap`. Use `PCFShadowMap`. |
| PCF filter | Uses native depth textures with `sampler2DShadow`: 5 Vogel-disk taps with per-pixel rotation and hardware 4-tap filtering. `shadow.radius` controls softness. |
| `THREE.Clock` | Deprecated since r183 and warns. Use `THREE.Timer`. |
| `SunLight` addon | `three/addons/lights/SunLight.js` gives cascaded shadows built into WebGLRenderer's core shader chunks (`NUM_SUN_LIGHTS`, `getSunShadow`). Fixed at 2 cascades. |
| `Sky` addon | Now has built-in procedural clouds: `cloudScale, cloudSpeed, cloudCoverage, cloudDensity, cloudElevation, time`, plus `showSunDisc`. |
| `renderer.setEffects([...])` | Native post chain; requires `new WebGLRenderer({ outputBufferType: THREE.HalfFloatType })`. Applies tone mapping and sRGB automatically and warns if given an `OutputPass`. |
| `PointerLockControls` | No `getObject()`. Use `controls.object` or the camera directly. `lock(unadjustedMovement = false)`. |
| Legacy `three/addons/csm/CSM.js` | Still shipped, but it overwrites `ShaderChunk.lights_fragment_begin` and `lights_pars_begin` globally. Do not use it. |
| `Matrix3.scale/rotate/translate` | Deprecated in r185. |
| `Source` | Renamed `TextureSource` in r186. |
| `MeshDepthMaterial.depthPacking` | Defaults to `BasicDepthPacking`. No `RGBADepthPacking` is needed for shadows any more. |
| Build layout | `three.module.js` imports `three.core.js`; both must be served. |

Package exports: `three`, `three/addons/*` (maps to `examples/jsm/*`), `three/webgpu`, `three/tsl`.

**Decision: WebGLRenderer, not WebGPURenderer/TSL.** `onBeforeCompile`, `Sky`, `Water`, `EffectComposer` and the SwiftShader headless path are all WebGL-only or WebGL-proven. WebGPU under headless software rendering is not dependable.

### 2. Delivery and imports

Use Vite (`npm i three@0.187.0`, `npm i -D vite`), or zero-build with an import map:

```html
<script type="importmap">{ "imports": {
  "three": "./node_modules/three/build/three.module.js",
  "three/addons/": "./node_modules/three/examples/jsm/" } }</script>
```

Pin exactly `0.187.0`; the APIs below move between releases.

### 3. Renderer setup

```js
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
// antialias:false because the scene renders into the composer's own MSAA target
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;      // default, stated explicitly
renderer.toneMapping = THREE.ACESFilmicToneMapping;    // applied by OutputPass when using the composer
renderer.toneMappingExposure = 0.55;                   // my starting value for the Sky addon's HDR output; tune 0.4-0.7
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;          // not PCFSoftShadowMap
const timer = new THREE.Timer(); timer.connect(document);  // pauses on tab hide
renderer.setAnimationLoop((t) => { timer.update(t); const dt = Math.min(timer.getDelta(), 0.05); /* ... */ });
```

- **Tone mapping:** ACES Filmic as default. It gives warm highlights on red roofs and granite at golden hour.
- **Alternative:** `AgXToneMapping` suits a soft, misty maritime look but desaturates reds; pair it with a saturation boost of about 1.15 in the grade pass. Make it switchable per preset.
- **VSM:** avoid it. Every receiver also casts, and it leaks light under tree canopies.

### 4. Sky: use the `Sky` addon

A custom gradient dome would mean reimplementing sun-coupled scattering, sun disc and clouds. The addon now does all three, and the hazy Qingdao horizon maps directly onto `turbidity` and `mieCoefficient`.

```js
import { Sky } from 'three/addons/objects/Sky.js';
const sky = new Sky(); sky.scale.setScalar(camera.far);   // BoxGeometry(1): faces at 0.5*far, corners at 0.866*far
scene.add(sky);
const U = sky.material.uniforms, sunDir = new THREE.Vector3();
function applyPreset(p) {
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - p.elevation), THREE.MathUtils.degToRad(p.azimuth));
  U.sunPosition.value.copy(sunDir);
  U.turbidity.value = p.turbidity; U.rayleigh.value = p.rayleigh;
  U.mieCoefficient.value = p.mie; U.mieDirectionalG.value = p.mieG;
  U.cloudCoverage.value = p.cloudCoverage; U.cloudDensity.value = p.cloudDensity;
  sun.position.copy(sunDir);            // SunLight: direction is position -> origin
  // also set sun.color/intensity, hemi colours, scene.fog.color/density, water uniforms, exposure
  updateEnvironment();
}
// per frame: sky.position.copy(camera.position); U.time.value = timer.getElapsed();
```

Environment lighting (regenerate only on preset change):

```js
const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); let envRT;
function updateEnvironment() {
  U.showSunDisc.value = 0; envScene.add(sky);
  envRT?.dispose(); envRT = pmrem.fromScene(envScene, 0, 0.1, camera.far);  // (scene, sigma, near, far, options)
  scene.environment = envRT.texture; scene.environmentIntensity = 0.6;
  scene.add(sky); U.showSunDisc.value = 1;
}
```

Suggested presets (my starting values, to be tuned on screen):

| Preset | Elevation | Turbidity | Rayleigh | Mie | Cloud coverage | Fog |
|---|---|---|---|---|---|---|
| Sea-mist morning | 12° | 8 | 1.2 | 0.02 | 0.55 | Dense |
| Clear autumn noon | 50° | 2.5 | 1 | 0.005 | 0.25 | Light |
| Golden hour | 6° | 6 | 2.5 | 0.01 | 0.4 | Medium, warm |
| Overcast | 35° | 12 | 0.6 | 0.03 | 0.85 | Dense, grey |

The sky ignores scene fog, so hand-tune `scene.fog.color` per preset to match the horizon colour.

### 5. Ocean: custom ShaderMaterial, not `Water`

- `Water.js` re-renders the whole scene into a 512² mirror target every frame from `onBeforeRender`. With about 1500 trees and 40 villas that roughly doubles main-pass cost.
- It has no shoreline foam, no depth colour and no vertex waves, and it needs an external `waterNormals` texture.
- Its options, for reference: `textureWidth, textureHeight, clipBias, alpha, time, waterNormals, sunDirection, sunColor, waterColor, eye, distortionScale, side, fog`.

Recommended custom ocean:

- **Geometry:** a plane of about 3 km with dense tessellation near shore (or two planes: near detailed, far coarse).
- **Vertex:** 3–4 summed Gerstner or sine waves, with amplitude scaled down by shallow depth.
- **Depth:** bake the terrain heightfield into a `DataTexture` (R float or 8-bit, 256–512², `NoColorSpace`, linear filter) and sample it by world XZ. No depth pre-pass is needed, and it works under MSAA and in headless.
- **Colour:** `mix(shallowTurquoise, deepBlueGreen, 1 - exp(-depth * k))`. Qingdao water is grey-green jade (roughly `#2f6f6a` to `#0f3a44`), not tropical blue.
- **Normals:** 2–3 scrolling procedural normal octaves from a tiling `CanvasTexture` normal map (`NoColorSpace`, `RepeatWrapping`).
- **Reflection:** Schlick Fresnel times an analytic sky colour (horizon and zenith uniforms from the preset), plus sun glint `pow(max(dot(reflect(-V,N), sunDir),0), 400.)`.
- **Foam:** `smoothstep(foamDepth, 0., depth + noise*0.3)` plus animated swash bands `sin(depth*freq - time*speed)` on the beach edge, plus crest foam from wave height.
- **Fog and output:** construct with `fog: true`, merge `THREE.UniformsLib.fog` into uniforms, and include `<fog_pars_vertex>`, `<fog_vertex>`, `<fog_pars_fragment>`, `<fog_fragment>`. The vertex shader must define `mvPosition`. End the fragment with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`.
- **Shadows:** `receiveShadow` is not needed on water.
- **Wet sand:** darken the sand albedo and lower roughness near sea level in the terrain material. This is cheap and sells the shoreline.

### 6. Fog: FogExp2 plus a global height and sea-mist chunk override

Plain `FogExp2` is uniform in height and looks generic. Override the fog chunks once, before any material is created. Every built-in material, and any ShaderMaterial that includes the chunks, then gets height fog with no per-material work. `scene.fog = new THREE.FogExp2(color, density)` keeps driving `fogColor` and `fogDensity`.

The stock chunks, for reference: `fog_vertex` sets `vFogDepth = - mvPosition.z;`, and `fog_fragment` computes `1.0 - exp(-fogDensity*fogDensity*vFogDepth*vFogDepth)`.

```js
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth; varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );   // = transpose(R) * viewPos, valid with instancing/sprites
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    const float FOG_H0 = 2.0;        // sea-level reference (m)
    const float FOG_FALLOFF = 0.045; // 1/m; mist hugs the shore and thins uphill
    vec3 fogRay = vFogWorld - cameraPosition; float fogLen = length( fogRay );
    float fogDy = fogRay.y; float fogA = exp( -FOG_FALLOFF * ( cameraPosition.y - FOG_H0 ) );
    float fogInt = abs( fogDy ) > 1e-3 ? ( 1.0 - exp( -FOG_FALLOFF * fogDy ) ) / ( FOG_FALLOFF * fogDy ) : 1.0;
    float fogFactor = 1.0 - exp( - fogDensity * fogLen * fogA * fogInt );
    fogFactor = clamp( fogFactor, 0.0, 1.0 );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
```

- `cameraPosition` and `viewMatrix` are auto-declared for `ShaderMaterial` and built-ins, but not for `RawShaderMaterial`.
- Density is now linear rather than squared. Start around `fogDensity ≈ 0.004–0.02`.
- The height constants are baked into the chunk. For a sun-tinted in-scatter term, add a shared uniform through a small `onBeforeCompile` helper in the material factory (`shader.uniforms.uSunDir = shared.uSunDir`). That is optional.
- Why not per-material `onBeforeCompile` for the fog itself: it would have to be repeated on every material and is easy to miss on one.

### 7. Shadows: `SunLight` (2 cascades) as primary, follow-the-player DirectionalLight as fallback

**Why `SunLight`:** a single 2048² orthographic shadow over the 160 m needed for avenue views gives about 8 cm per texel, which is too blurry for leaf dapple. `SunLight` fits two cascades to the view frustum automatically. It is texel-snapped, blends between cascades, and lives in core chunks, so `onBeforeCompile` and `customDepthMaterial` keep working.

```js
import { SunLight } from 'three/addons/lights/SunLight.js';
const sun = new SunLight(0xfff1dc, 3.0);
sun.position.copy(sunDir);            // direction only: shines from position toward origin; there is no .target
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);   // per cascade -> 4096x2048 atlas (default is 1024)
sun.shadow.camera.far = 180;          // shadow distance = min(shadow.camera.far, viewCamera.far); default 500
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;   // defaults are 0/0 -> acne; tune
sun.shadow.radius = 1.5;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x6b5a45, 0.6));
```

- **Split position:** `0.5 * (uniform + log)`. With near 0.1 and far 180 that is about 47 m, so by my estimate cascade 0 is roughly 3–4 cm per texel and cascade 1 roughly 13 cm.
- **Fixed parameters:** cascade count is hard-coded to 2 in both the JS and the GLSL (`SUN_LIGHT_CASCADES 2`); `shadow.camera.left/right/top/bottom` are ignored.
- **Cost:** shadow casters are drawn twice (once per cascade, frustum-culled per cascade).
- **Maturity:** this addon is recent and I could not test it at runtime here. Hide it behind a `makeSun()` factory so the fallback is a one-line switch.
- **Custom lit shaders:** a ShaderMaterial with `lights: true` picks up sun uniforms through `UniformsLib.lights`. A hand-written lit shader that only reads `directionalLights[]` would get no sun.

Fallback, texel-snapped single map:

```js
const dl = new THREE.DirectionalLight(0xfff1dc, 3); dl.castShadow = true;
dl.shadow.mapSize.set(4096, 4096); const R = 70;
Object.assign(dl.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 400 });
dl.shadow.camera.updateProjectionMatrix(); dl.shadow.bias = -0.0005; dl.shadow.normalBias = 0.05;
scene.add(dl, dl.target);
function followShadow(p) {                      // snap in light space to stop shimmer
  const texel = (2 * R) / dl.shadow.mapSize.x;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), sunDir), qi = q.clone().invert();
  const c = p.clone().applyQuaternion(qi); c.x = Math.round(c.x / texel) * texel; c.y = Math.round(c.y / texel) * texel;
  c.applyQuaternion(q); dl.target.position.copy(c); dl.position.copy(c).addScaledVector(sunDir, 200);
}
```

For a static sun and a stationary player you could set `renderer.shadowMap.autoUpdate = false`, but wind sway and walking need updates. Lower the cost by setting `castShadow = false` on grass, small props and far impostors.

### 8. Instanced vegetation

**Batching:** `InstancedMesh` culls as a single bounding sphere, so split instances into spatial cells (for example a 4×4 grid of ~125 m). That gives one `InstancedMesh` per species × part × LOD × cell. Call `mesh.computeBoundingSphere()` after writing matrices, otherwise culling uses the base geometry sphere and trees pop out.

**Species that carry the place's identity:**

| Species | Road / location |
|---|---|
| Layered deodar cedar (雪松) | 紫荆关路 |
| Pale-barked plane, London plane (法桐) | Avenue planting |
| Ginkgo, yellow in autumn | 居庸关路 |
| Maple, red | 嘉峪关路 |
| Peach and crabapple blossom | 韶关路 / 宁武关路 |
| Crape myrtle | 正阳关路 |
| Black pine | Coast |

**Geometry per tree:**

- **Trunk and limbs:** one merged low-poly geometry (6–8-sided tapered cylinders).
- **Canopy:** 12–30 alpha-tested leaf-cluster cards merged into one geometry. Bend card normals toward a sphere around the canopy centre for soft, non-flat lighting.
- **Far LOD:** 2–3 crossed quads using the same atlas.
- **Variation:** per-instance tint via `setColorAt`; the material colour multiplies it.

**Leaf material:**

```js
const leafMat = new THREE.MeshStandardMaterial({
  map: leafTex,                // CanvasTexture with alpha, colorSpace = SRGBColorSpace
  alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
  alphaToCoverage: true,       // smooth edges; needs an MSAA target (composer RT samples: 4)
});
```

`alphaToCoverage` is verified in `alphatest_fragment`. The shadow pass substitutes `alphaTest = 0.5` automatically when it is on.

**Wind via `onBeforeCompile`:** inject at `#include <begin_vertex>`, which declares `vec3 transformed = vec3( position );`. The instance transform is applied later in `project_vertex`, so the instance origin is `instanceMatrix[3].xyz`.

```js
const wind = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3(1, 0, 0.3) } };
function addWind(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime; shader.uniforms.uWind = wind.uWind;   // shared uniform objects
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iOrigin = instanceMatrix[3].xyz;
        #else
          vec3 iOrigin = modelMatrix[3].xyz;
        #endif
        float wPhase = dot( iOrigin.xz, vec2( 0.11, 0.07 ) );
        float wH = max( position.y, 0.0 );                       // sway grows with local height
        float wSway = sin( uTime * 1.3 + wPhase ) * 0.5 + sin( uTime * 2.7 + wPhase * 1.7 ) * 0.25;
        float wFlutter = sin( uTime * 6.0 + position.x * 3.1 + position.z * 2.3 + wPhase ) * 0.03;
        transformed.xz += uWind.xz * ( wSway * 0.012 * wH * wH * 0.1 + wFlutter * step( 1.5, wH ) );`);
  };
  material.customProgramCacheKey = () => 'wind-v1';
}
```

The displacement is in local space before `instanceMatrix`, so sway rotates with each instance. That is fine for trees; multiply by `transpose(mat3(instanceMatrix))` if strict world-direction wind is wanted.

**Shadows that match the sway:** in `WebGLShadowMap.getDepthMaterial` the built-in depth material already handles alpha-tested `map` cut-outs (`material.map && material.alphaTest > 0` clones a variant). `customDepthMaterial` is needed only so the shadow follows the wind displacement.

```js
const leafDepth = new THREE.MeshDepthMaterial({ map: leafTex, alphaTest: 0.5 });  // BasicDepthPacking default is fine
addWind(leafDepth);
instanced.customDepthMaterial = leafDepth;     // set on the Mesh, not the material
instanced.castShadow = true; instanced.receiveShadow = true;
```

- The renderer overwrites `map`, `alphaMap`, `alphaTest` and `side` on the custom depth material from the visible material every frame. Still set `map` and `alphaTest` at construction so the first compiled program has `USE_MAP` and `USE_ALPHATEST`.
- Shadow side is `shadowSide ?? {Front→Back, Back→Front, Double→Double}`. Use `DoubleSide` for leaf cards. For thin single-sided walls and roofs set `material.shadowSide = THREE.DoubleSide` or give them thickness.
- The depth vertex shader has `begin_vertex` and `project_vertex` (with `USE_INSTANCING`) and UV chunks, so the same injection compiles. It has no normal chunks unless a displacement map is present, so do not reference `objectNormal` in the wind code.
- If sway amplitude stays under about 5 cm, skip `customDepthMaterial` entirely.

**Grass and ground cover:** use `InstancedMesh` tufts only within about 40 m of paths, with `castShadow = false`, or just a good grass canvas texture. Villa gardens are mostly hedges, lawn and granite walls.

### 9. Merged static geometry

```js
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
const merged = mergeGeometries(geoms, false);   // returns null (with console error) on mismatch
```

- All inputs must have the identical attribute set and all be indexed or all non-indexed. A mixed-index merge returning `null` was reproduced in Node.
- Normalise in the builder: every part gets `position, normal, uv` (plus `color` if used), and call `.toNonIndexed()` or keep the index consistently.
- Bake transforms with `geom.applyMatrix4(m)` before merging, and dispose the sources.
- Merge by material and spatial cluster (for example one mesh per material per block of 4–6 villas), not one giant mesh, so frustum culling and shadow-cascade culling still work.
- Bake cheap ambient occlusion into vertex colours (`vertexColors: true`): darken under eaves, at wall bases, in window recesses. This replaces GTAO.
- `mergeGeometries(geoms, true)` creates groups for multi-material meshes at one draw call per group. Per-material merges are simpler.

### 10. Procedural CanvasTexture materials

```js
function canvasTex(canvas, { srgb = true, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;  // default is NoColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;   // mipmaps on by default (LinearMipmapLinearFilter)
}
```

- **Colour space:** `SRGBColorSpace` for albedo and emissive only. Normal, roughness, bump, AO, alpha-only and the ocean depth `DataTexture` stay `NoColorSpace`. Getting this wrong gives washed-out or too-dark materials.
- **Normal maps:** build a height canvas, then Sobel into an RGB normal canvas in JS. `bumpMap` costs extra fragment derivatives.
- **Resolution:** 512² tiling for most, 1024² for roof tiles and granite. Drive UVs in metres from the geometry builder.
- **Tiling:** break repetition with vertex-colour tint or a second low-frequency multiply.
- **Leaf atlas:** draw leaf clusters with transparent background. Bleed the leaf colour into transparent pixels (fill the background with leaf green at alpha 0) to avoid dark mip halos. Keep `premultiplyAlpha` false.

**Material palette:**

| Surface | Look |
|---|---|
| Roof tiles | Red-orange clay 牛舌瓦 / pantile rows with per-tile hue jitter and moss streaks; also slate-grey and green-glazed variants |
| Granite | 崂山 granite, buff-pink with grey speckle, rough-cut ashlar with recessed mortar for walls, plinths and gate posts |
| Stucco | Cream, ochre and pale-yellow sprayed render with fine noise and rain streaks |
| Asphalt | Dark road with fine aggregate, leaf litter and patch seams, between granite curbs |
| Paving | 花岗岩 slabs |
| Sand | Fine warm sand with ripple normals and a wet band at the waterline |

All should be `MeshStandardMaterial`, roughness 0.7–0.95, metalness 0. Avoid `MeshPhysicalMaterial` because of its cost.

### 11. Post-processing

Use the classic `EffectComposer` as primary, because it gives full control of pass order (grade and anti-aliasing after tone mapping).

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';   // constructor takes no args in r187
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';   // new FXAAPass()

const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });  // MSAA + HDR
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.7, 0.95);
composer.addPass(bloom);                       // (resolution, strength, radius, threshold), in linear HDR
composer.addPass(new OutputPass());            // applies renderer.toneMapping/exposure + sRGB
composer.addPass(new ShaderPass(GradeVignetteShader));  // display-referred: lift/gamma/gain, saturation, vignette, dither
// low tier (no MSAA): composer.addPass(new SMAAPass()) or new FXAAPass() as the very last pass
// loop: composer.render(dt)   -- do not also call renderer.render
// resize: renderer.setSize(w,h); composer.setSize(w,h); bloom.setSize(w/2,h/2)
```

**Ordering rules:**

- **RenderPass → bloom → OutputPass:** bloom runs in linear HDR. With a composer, materials render un-tone-mapped into the target and `OutputPass` does tone mapping and sRGB exactly once.
- **Never use both** `OutputPass` and a manual gamma pass.
- **After OutputPass:** colour grade, vignette and film grain operate on display values.
- **Last:** FXAA or SMAA needs perceptual (sRGB) input, so it must come after OutputPass.

**Anti-aliasing:** MSAA ×4 on the composer target plus `alphaToCoverage` foliage beats SMAA for leaf cards. On the low or mobile tier use `samples: 0`, plain `alphaTest` and `FXAAPass`.

**Vignette and grade:** write one combined ShaderPass. The shipped `VignetteShader` has uniforms `tDiffuse, offset, darkness`; fold its logic in to save a fullscreen pass. Add ±0.5/255 noise dither to kill sky and fog banding.

**GTAO:** off by default.

- `GTAOPass(scene, camera, width, height, parameters, aoParameters, pdParameters)` re-renders the entire scene with a `MeshNormalMaterial` override (verified `_renderOverride`), then runs the AO pass and a Poisson denoise.
- That is roughly double the draw calls and vertex work, plus 2–3 fullscreen passes.
- The override ignores alpha test and wind, so leaf cards become solid quads and produce blocky AO halos around foliage.
- If offered as an "ultra" toggle: half resolution, inserted between RenderPass and bloom, with foliage on a layer hidden from it. Otherwise rely on baked vertex AO, hemisphere light and soft contact shadows.

**Alternative native path:** `new WebGLRenderer({ antialias: true, outputBufferType: THREE.HalfFloatType })` plus `renderer.setEffects([bloom])` gives an MSAA scene target with automatic tone mapping and sRGB, and you call plain `renderer.render()`. Effects there run before tone mapping, so a display-space grade or FXAA cannot be placed correctly. It is newer; I would not use it as primary.

### 12. First-person walking

```js
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
const controls = new PointerLockControls(camera, renderer.domElement);   // domElement required for events
controls.pointerSpeed = 0.8; controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI - 0.15;
overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', hideOverlay); controls.addEventListener('unlock', showOverlay);
// per frame (when controls.isLocked):
vel.x = THREE.MathUtils.damp(vel.x, input.x * speed, 10, dt); vel.z = THREE.MathUtils.damp(vel.z, input.z * speed, 10, dt);
const prev = camera.position.clone();
controls.moveRight(vel.x * dt); controls.moveForward(vel.z * dt);     // both move on the XZ plane only
resolveCollisions(camera.position, prev, 0.35);                        // radius in metres
const gy = terrainHeight(camera.position.x, camera.position.z) + 1.65;
camera.position.y = THREE.MathUtils.damp(camera.position.y, gy, 12, dt);
```

- **Verified API:** `constructor(camera, domElement = null)`, `lock(unadjustedMovement = false)`, `unlock()`, `isLocked`, `moveForward(d)`, `moveRight(d)`, `getDirection(v)`, `pointerSpeed`, `minPolarAngle`, `maxPolarAngle`; events `lock`, `unlock`, `change`. No `update()` is needed and there is no `getObject()`.
- **Speeds:** walk about 1.6–2 m/s, Shift run about 5 m/s. Add subtle head-bob (≤ 2 cm) and smooth acceleration; a contemplative pace is part of the mood.
- **Terrain following:** use one analytic `terrainHeight(x, z)` (bilinear sample of the same `Float32Array` heightfield that built the terrain mesh). Do not raycast merged meshes; there is no BVH and it is slow.
- **Collision:** 2D only. Circle against a spatial-hash grid (cell ~8 m) of colliders: villa footprints and garden walls as OBB or AABB, tree trunks and lamp posts as circles. Push out along minimum penetration and iterate twice to get wall sliding. Clamp to world bounds and to water depth of about 0.3 m. Block slopes steeper than about 45° by rejecting moves where `Δh/Δxz` is too large.
- **Pointer-lock quirks:** Chrome rejects re-lock for about 1.25 s after Esc, so catch the promise rejection or `pointerlockerror` and keep the overlay up. Ignore `movementX/Y` spikes (clamp `|movement| < 200`).
- **Headless and debug:** pointer lock is not available. Add `?cam=x,y,z,yaw,pitch&preset=golden` URL parsing and a `window.__setView()` hook.

### 13. Mobile and touch fallback

- Detect with `matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window`, and skip PointerLockControls.
- Own controller: `camera.rotation.order = 'YXZ'`, keep `yaw` and `pitch` scalars.
  - Left half: virtual joystick (pointer events with `setPointerCapture`, 60 px radius) feeding the move vector.
  - Right half: drag-look, `yaw -= dx * 0.004`, pitch clamped ±1.4.
- Set `touch-action: none` on the canvas and `user-select: none`; use `100dvh`.
- Reuse the same movement and collision code by computing forward and right from yaw.
- **Mobile quality tier:**
  - pixel ratio ≤ 1.5
  - composer `samples: 0` plus FXAA
  - shadow map 1024 per cascade, `shadow.camera.far` 90
  - bloom at quarter resolution or off
  - tree count halved, far impostors sooner
  - no grass
- Add an adaptive step: if average frame time exceeds 22 ms over 2 s, drop pixel ratio by 0.25.
- Handle `webglcontextlost` with `preventDefault()` and a reload prompt.

### 14. Performance budgets

These are my engineering targets for a ~500 m scene with ~40 villas and ~1500 trees, not measured values.

| Item | Target |
|---|---|
| Main-pass draw calls | ≤ 150–200 |
| Shadow pass draw calls | ≤ ~150 per cascade, casters only |
| Visible triangles, main | 0.8–1.5 M desktop, ≤ 500 k mobile |
| Villas | 3–6 k tris each (~200 k total); 6–8 shared materials; merged per material per cluster → 30–50 calls |
| Trees, near (< 60 m) | 300–700 tris |
| Trees, mid | 100–200 tris |
| Trees, far (> 150 m) | 4–12 tri crossed cards, no shadow cast |
| Tree draw calls | ~6 species × 2 parts × 2–3 LODs × visible cells ≈ 40–80 |
| Terrain | 256² grid (~130 k tris) or 2 LOD rings; one material with vertex-colour and world-position blending |
| Ocean | 1–2 calls, ≤ 40 k tris |
| Textures | ~15 canvases, mostly 512², with mipmaps |
| Shadow atlas | 4096×2048 |
| Fullscreen passes | ≤ 4 (bloom internals count as about 11 small ones) |
| Frame time | 60 fps on an integrated or mid GPU at DPR ≤ 1.5 |

- **LOD:** bucket by cell and swap whole `InstancedMesh` visibility by cell distance, with a hysteresis band. `THREE.LOD` does not work per instance.
- **Static objects:** set `matrixAutoUpdate = false` on static meshes. Keep the default `StaticDrawUsage` for instance matrices.
- **Startup hitches:** call `renderer.compile(scene, camera)` (or `compileAsync`) behind the loading overlay; first-look shader compilation otherwise stutters.
- **Monitoring:** `renderer.info.render.calls/triangles` behind `?debug`. With a composer, set `renderer.info.autoReset = false` and call `renderer.info.reset()` once per frame to get whole-frame totals.

### 15. Headless screenshots on this machine

**Installed (nothing launched):**

| Component | Found |
|---|---|
| Playwright cache `~/.cache/ms-playwright/` | `chromium-1223`, `chromium-1243`, `chromium_headless_shell-1223`, `chromium_headless_shell-1243`, `ffmpeg-1011` |
| `chromium-1243/chrome-linux64/` | Bundles `libEGL.so`, `libGLESv2.so`, `libvk_swiftshader.so`, `libvulkan.so.1`, `vk_swiftshader_icd.json` (ANGLE + SwiftShader present) |
| System Chrome | `/usr/bin/google-chrome` and `/usr/bin/google-chrome-stable`, version 156.0.8078.79, also ships `libvk_swiftshader.so` |
| `chromium`, `chromium-browser` | Not installed |
| GPU | None usable: no `nvidia-smi`, `/dev/dri` has only `card0`. Software rendering only. |
| Other | `xvfb-run` available (not needed); Node 24.22.1, npm 12.2.1 |
| Playwright npm package | Not in the repo; no Python playwright |

**Version match:** revision 1243 corresponds to **playwright 1.63.0** (Chromium 153), checked against `browsers.json`. Latest playwright 1.65.0 wants revision 1254 and would trigger a download. Install `npm i -D playwright@1.63.0` to reuse the cache, or use `playwright-core` with `channel: 'chrome'` or `executablePath: '/usr/bin/google-chrome'`.

**Script (must go through the heavy-gate):**

```js
// tools/shot.mjs -- one browser, closed in finally
import { chromium } from 'playwright';
const browser = await chromium.launch({
  channel: 'chromium',            // full build in new-headless mode (has the ANGLE/SwiftShader libs listed above)
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--hide-scrollbars'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('[page]', m.type(), m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(process.argv[2], { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  await page.screenshot({ path: process.argv[3] });
} finally { await browser.close(); }
```

Run it with `run_in_background: true` and never under `timeout`:

```
~/.claude/bin/heavy-gate -n 1 -l badaguan-shot -- node tools/shot.mjs "http://127.0.0.1:5173/?shot=1&preset=golden&cam=..." out.png
```

- **Gate state when checked:** slot-0 busy (another session's Chrome), slot-1 free, MemAvailable about 8.2 GiB (the gate needs 4.5 GiB). The hook also blocks bare `google-chrome` and inline interpreter one-liners.
- **Dev server:** bind to `127.0.0.1` (`vite --host 127.0.0.1`).
- **Flag notes:** `--enable-unsafe-swiftshader` is the opt-in recent Chrome versions need for software WebGL, and `--use-angle=swiftshader` selects it explicitly. I expect it to be required on these Chrome 153/156 builds but did not test it. If WebGL context creation fails, try `--use-angle=swiftshader-webgl`, or `--use-gl=egl` with `--use-angle=vulkan` and `--enable-features=Vulkan`. Log `gl.getParameter(gl.VERSION)` to confirm.
- **Shot mode in the app (`?shot=1`):**
  - fixed time and wind
  - no pointer-lock overlay
  - pixel ratio 1
  - shadow map 1024
  - render about 3 frames (shadow, then env map, then final), then set `window.__ready = true`
- **Speed:** SwiftShader is CPU rasterisation, so expect seconds per frame and 10–60 s of shader compilation. Do not wait for `networkidle` with a running render loop.
- **Capture:** `page.screenshot` captures the compositor, so `preserveDrawingBuffer` is not needed. It is only needed for `canvas.toDataURL`.
- **MSAA:** if multisampled HalfFloat targets misbehave under SwiftShader, have shot mode fall back to `samples: 0` plus FXAA.
- **Parallelism:** one browser at a time. Tell any subagent that launches browsers to use the gate.

### 16. Pitfall checklist for r187

1. `PCFSoftShadowMap` warns and falls back; use `PCFShadowMap` with `shadow.radius`.
2. `THREE.Clock` warns; use `THREE.Timer` (`timer.update()` every frame before `getDelta()`).
3. `CanvasTexture.colorSpace` defaults to `NoColorSpace`; set sRGB on albedo only.
4. With `EffectComposer`, add `OutputPass` or the image is linear, dark and un-tone-mapped; never add a second gamma pass. With `setEffects`, do not add `OutputPass`.
5. A custom `ShaderMaterial` drawn to screen needs `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`. `Sky` already has both.
6. Passing your own target to `EffectComposer` makes `_width` the raw target width; always call `composer.setPixelRatio()` and `composer.setSize()` right after construction and on resize.
7. `renderer.antialias` does nothing for composer targets; use `samples: 4` on the target. `alphaToCoverage` needs that MSAA target.
8. `mergeGeometries` returns `null` on attribute or index mismatch; check the result.
9. `InstancedMesh`: call `computeBoundingSphere()` after setting matrices, and set `instanceMatrix.needsUpdate` / `instanceColor.needsUpdate` after writes. Call `setColorAt` at least once before first render, or the program compiles without instance colour.
10. `onBeforeCompile`: assign it before first render. Changing it later needs `material.needsUpdate = true` and a distinct `customProgramCacheKey`. Keep the `shader` reference or use shared uniform objects to animate. `material.clone()` copies `onBeforeCompile` but not your closure uniforms.
11. `customDepthMaterial` goes on the mesh. The renderer overwrites its `map`, `alphaTest`, `alphaMap` and `side` each frame; pre-set `map` and `alphaTest` at construction.
12. `SunLight` has no `.target`, is fixed at 2 cascades, defaults to bias 0 and normalBias 0 (acne until tuned), and its shadow distance is `shadow.camera.far` (default 500; lower it).
13. Do not import `three/addons/csm/CSM.js` alongside `SunLight` or the fog chunk overrides; it replaces core light chunks globally.
14. Do global `ShaderChunk` overrides (fog) before any material compiles. `RawShaderMaterial` and addons with their own fog code are unaffected; `Water` includes `fog_vertex`, so it would need `mvPosition`, which it has.
15. `Sky`: keep the box inside `camera.far` and centred on the camera. Hide the sun disc while baking PMREM. Its output is very bright HDR and my bloom threshold assumes exposure around 0.5; raise the threshold if the whole sky blooms.
16. `PointerLockControls` has no `getObject()`; `moveForward` and `moveRight` ignore pitch, which is what walking wants.
17. Depth precision: near 0.1–0.2, far ≤ 4000. Do not enable the logarithmic depth buffer (it breaks MSAA early-z and costs fragment work). `reversedDepthBuffer: true` exists but is unnecessary here.
18. Transparent or alpha-blended foliage causes sorting artefacts; use `alphaTest` (with `alphaToCoverage`) and keep `transparent: false`.
19. `scene.environment` from PMREM adds strong ambient; balance it with `scene.environmentIntensity` and the hemisphere light, or shadows wash out.
20. Serve `three.core.js` next to `three.module.js` if vendoring files manually.

### 17. Suggested lessons for the repo-level `AGENTS.md`

I did not write `AGENTS.md`, to avoid colliding with parallel agents. Suggested lines:

- three pinned at 0.187.0 (r187): use `PCFShadowMap`, `THREE.Timer`, `SunLight` addon for cascaded shadows, and `Sky` addon built-in clouds.
- playwright@1.63.0 matches the cached chromium-1243; browser runs go through `~/.claude/bin/heavy-gate -n 1` in the background.
- Software WebGL flags: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
