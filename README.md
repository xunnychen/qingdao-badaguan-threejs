# 青島八大關 · 漫步（three.js 可行走景觀）

純程序化生成、可在瀏覽器裡第一人稱漫步的青島八大關三維景觀。**沒有任何外部 3D 模型、沒有照片貼圖**——所有幾何體、材質、植被卡牌、天空與海面全部由 Canvas 2D 與 GLSL 在運行時生成。

> **本倉庫是一份存檔副本（archive copy）**
>
> - 原始倉庫：[Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc](https://github.com/Recursive-Self-Improving/qingdao-badaguan-threejs-fable-5-2-meidum-dynamic-workflow-cc)
> - 原始作者：`Recursive-Self-Improving`
> - 原始提交：單個 commit `feat(scene): add walkable three.js recreation of Qingdao Badaguan`（2026-11-13T13:46:36Z）
> - 生產模型：**fable 5.2 × medium 檔 × dynamic workflow × cc 腳手架**（據倉庫命名與 `AGENTS.md` 中的 `~/.claude/bin/heavy-gate` 工具鏈推定）
> - 本倉庫僅做本地部署、實景截圖與在線預覽發布，**源碼未作任何邏輯修改**
> - 原始倉庫未附帶 LICENSE 文件；此處僅作技術研究與演示存檔，權利歸原作者所有

## 在線預覽

啟用 GitHub Pages 後可直接訪問（Settings → Pages）。本地跑：

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # 產物在 dist/，1.32 MB JS（gzip 408 KB），構建約 188 ms
npm run preview
```

## 操作

| 鍵 | 作用 |
|---|---|
| `W A S D` | 行走（1.7 m/s 漫步速度） |
| `Shift` | 快走 |
| 滑鼠 | 環顧 |
| `1 2 3 4` | 切換時節：秋日午後 / 清晨海霧 / 夏末黃昏 / 春日花季 |
| `P` | 下一個時節 |
| `M` 地圖 · `H` 說明 · `N` 靜音 · `Esc` 暫停 | — |

URL 參數：`?view=<名稱>&preset=<時節>&q=<low|medium|high>&shot=0`

23 個預置視角：`spawn ginkgo princess cedar plane juniper peach crabapple maple crape downhill huashi huashiSea beach promenade boardwalk reef wall junction park overview top aerialSE`

## 技術要點

- `three@0.187.0`(r187) + `vite@8.3.7` + `playwright@1.63.0`，純 ES Module，無框架、無 TypeScript
- 12 個功能模組包，各自導出 `async create(ctx) → { update(dt,t), onPreset(), dispose() }`：
  `player 步履 / sky 天光 / terrain 地勢與街道 / coast 海與礁石 / villas 紅瓦別墅 / landmarks 花石樓·公主樓 / streetscape 石牆與街燈 / trees 行道樹 / life 花葉與海鷗 / post 光影 / audio 潮聲 / ui 導覽`
- 世界平面在 import 時由 `src/world/map.js` 決定性生成（約 100 ms，可在 Node 下跑）：10 條街道、2208 棵樹、23 個視角
- 霧效把 `scene.fog` 的 `near/far` 挪用為密度與高度衰減兩個全局浮點（復用 `refreshFogUniforms` 只上傳 `fogNear/fogFar/fogColor` 的機制）
- 美術方向：「一路一樹」（每條街一個樹種，冠形、色彩、光線各異）、「紅瓦綠樹、碧海藍天」、黃海玉青綠（明確排除熱帶青與群青）

## 實測性能（Apple M4）

1600×1000 / `q=high` / 最密的 `view=ginkgo`：

| 指標 | 數值 |
|---|---|
| 渲染器 | ANGLE Metal Renderer: Apple M4（真 GPU，非 SwiftShader） |
| 幀率 | **60.2 fps** |
| Draw calls | 293 |
| 三角形 | 1,719,368 |
| Geometry / Texture / Program | 280 / 72 / 74 |
| 頁面錯誤 | 0 |

## 截圖

見 `screenshots/` 目錄：

| 文件 | 內容 |
|---|---|
| `01-title-autumn.png` | 標題頁 · 秋日午後（預設）・居庸關路銀杏大道 |
| `02-title-ginkgo.png` | 標題頁 · 銀杏視角 · 紅瓦別墅 |
| `03-preset-fog.png` | 時節 2 ・清晨海霧 |
| `04-preset-dusk.png` | 時節 3 ・夏末黃昏 |
| `05-preset-spring.png` | 時節 4 ・春日花季 |
| `06-huashilou.png` | 花石樓 · 城堡式石構與婚紗攝影人群 |
| `07-princess-house.png` | 公主樓 · 青綠牆面、紅瓦、八角尖塔與文物銘牌 |
| `08-promenade.png` | 海濱步行道 · 花崗岩護欄與沙灘 |
| `09-beach.png` | 第二海水浴場 |
| `10-reef.png` | 太平角礁石 · 玉青綠海色與海平線貨輪 |
| `11-shanhaiguan-road.png` | 山海關路 · 法國梧桐斑駁樹皮 |
| `12-overview.png` | 俯瞰 · 紅瓦綠樹與街區肌理 |
| `13-top-map.png` | 正上方平面 · 各路樹種分佈 |

## 目錄

```
src/core/      引擎核心：著色器補丁、幾何合併、霧、風、隨機、材質、品質檔
src/world/     世界平面（map.js 923 行）、地形高度、查詢
src/modules/   12 個功能模塊包
scripts/       check-map.mjs（免瀏覽器出平面圖）、shot.mjs、test-interact.mjs
docs/          DESIGN.md（模組契約）、RESEARCH.md（1145 行資料研究）、packages/ 11 篇分包任務書
```
