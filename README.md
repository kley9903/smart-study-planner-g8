# Smart Study Planner · 第一代 UI 原型

## 小組雲端協作

**第一次參與：先讀 [組員入門指南](CONTRIBUTING.md)。**

- 每人用自己的 GitHub 帳戶，在自己的分支改程式。
- GitHub 專案頁 → **Code → Codespaces → Create codespace on main**，即可建立雲端開發環境；首次啟動會檢查專案，連線後自動啟動 5173 網站預覽。
- 本機或雲端都可以用 `npm start` 啟動，用 `npm run check` 檢查；這兩個命令不需要安裝 npm 套件。
- 推送修改、提出 PR 會自動檢查，審核後才合併；正式網站由 **Actions → Publish website → Run workflow** 手動發布。
- Codespaces 有免費額度與儲存限制，收工請停止工作空間。雲端預覽與正式網站各自的瀏覽器資料不會自動同步。
- 發布負責人的初次設定見 [部署說明](docs/deployment.md)。

給組員討論用的前端原型。頁面可以切換、主要互動可以操作；所有課程、功課和 AI 回覆都是預先寫好的示範資料，沒有連接 AI、帳戶、資料庫或 Canvas，也不會上傳任何檔案。

## 怎樣打開

- 網上版：https://smart-study-planner-g8.pages.dev （Cloudflare Pages）；後備：https://smart-study-planner.leepsschool.chatgpt.site （Sites，較舊的斜線版）。發布紀錄見專案 `logs/`。
- 本機：在這個資料夾執行 `node serve.mjs`（不用安裝任何套件），再打開 http://localhost:5173 。
  程式用了 JavaScript 模組，所以不能直接雙擊 `dist/index.html`。

沒有 build 步驟：`dist/` 就是網站原始碼，改完重新整理瀏覽器即可。

更新網上版：在這個資料夾執行 `npx wrangler@4.153.0 pages deploy dist --project-name smart-study-planner-g8 --branch main`（要先用擁有這個 Pages 專案的 Cloudflare 帳戶執行 `npx wrangler@4.153.0 login`）。Sites 後備版發布的也是 `dist/`（見 `.openai/hosting.json`）。

## 兩個入口

- **直接開始**：自己的計劃。一開始空白，資料存在這個瀏覽器（localStorage `ssp:mine`）。可以新增功課、標記沒空、按「自動排程」（`js/scheduler.js`，固定規則，不靠 AI）、確認、回報進度。AI 對話和大綱抽取未接上。
- **新手導覽**：示範資料加聚光燈導覽（`js/tour.js`；`#/week?tour=1` 直接開始）。頂部「離開」回到自己的計劃。

## 中英文

預設英文，右上角 EN／中 切換（`js/i18n.js`）。程式裡的文字一律寫成 `L('中文', 'English')`；`index.html` 的固定文字用 `data-en` 屬性。新增文字時兩個語言都要寫。

## 示範怎樣走

1. 歡迎頁 →「開始示範」：首次使用 5 步（放入大綱 → 核對 → 睡眠 → 沒空的時間 → AI 排計劃）。每一步只有右下角一個主要按鈕。
2. 本週頁頂的「示範導覽」：回報昨晚進度 → 告訴 AI「明天要全日幫家人搬屋」→ 時間不夠時選一個做法並確認。
3. 其他頁：任務、課程資料、不可用時段、說明。

## 設計規則（改畫面前先讀）

1. **虛線是建議，實色是計劃**：AI 產生的東西（抽出的 deadline、估算時數、排好的時段、從對話理解到的時間）先用虛線顯示，學生按「確認」才變成實色（課程顏色）。學生自己做的改動和回報的進度，直接生效。介面文字一律用「確認／不要」，不用比喻詞。
2. **灰色＝沒空的時間**：預設全部時間可以讀書。沒空的時間是很淺的灰色塊，頂端一條細線標出開始（程式裡叫 `hatch`），標籤前的圖示分辨每週重複和只限這天；睡眠是深一點的灰色並預設收起。它只是背景資訊，不可以比讀書時段搶眼。AI 一定避開灰色時間；要動睡眠必須問學生，而且只限當晚。
3. **近 7 日具體，遠方看 deadline**：只排未來 7 日的具體時段，今天永遠在最左邊；7 日之後的 deadline 放在「遠方」，每份功課一行。
4. **時間不夠要講清楚**：說明差多少、在哪個截止前；每個做法寫明「換來甚麼、代價是甚麼」。學生先選做法（①），看改動（②），再確認或不要（③）；未選做法不能確認。
5. **畫面不要擠**：AI 建議移走的時段只留虛線外框和「移走」小標籤；新建議剛好放在原位置時只顯示新建議；箭嘴只在點選某項改動時才畫。

## 檔案

```
dist/
├─ index.html              頁首、導覽、圖示（SVG sprite）
├─ favicon.svg
├─ css/
│  ├─ tokens.css           顏色、字體、尺寸（改視覺先改這裡）
│  ├─ base.css             基本排版、頁首、手機底部導覽
│  ├─ components.css       按鈕、標籤、彈出框、提示
│  ├─ planner.css          時間格、沒空的時間（灰色）、已確認／建議的時段、遠方
│  └─ pages.css            各頁版面、示範導覽、決定卡與響應式
└─ js/
   ├─ app.js               切頁、畫面更新、所有按鈕動作
   ├─ store.js             狀態與動作（確認、不要、回報進度、標記沒空的時間）
   ├─ model.js             由狀態推算畫面資料（空檔、統計、AI 建議疊加、導覽進度）
   ├─ demo-data.js         示範課程、功課、時段、大綱抽取結果
   ├─ scenarios.js         AI 助手的示範回覆、取捨做法
   ├─ planner.js           時間格元件（本週、不可用時段、首次使用共用）
   ├─ time.js / ui.js      日期時間、提示與彈出框小工具
   └─ views/               每頁一個檔案：start、week、margin（AI 助手）、tasks、import、availability、about
serve.mjs                  本機預覽伺服器（不會發布）
```

## 頁面

| 網址 | 頁面 |
|---|---|
| `#/start` | 歡迎頁；`#/start/1`–`5` 是首次使用流程 |
| `#/week` | 本週：示範導覽、7 日時間表、下一段、遠方；闊螢幕右邊是 AI 助手，窄螢幕底部有「等你決定」列 |
| `#/margin` | AI 助手（窄螢幕）：AI 回覆、① 選做法 ② 看改動 ③ 確認 |
| `#/tasks`、`#/tasks/ps4` | 任務：拆解步驟、預計時數、進度 |
| `#/import` | 課程資料：大綱抽取結果、核對確認 |
| `#/time` | 不可用時段：拖拉標記沒空的時間、移除、睡眠 |
| `#/about` | 原型說明 |

示範情境可以直接用網址打開，方便討論：`#/week?try=hero`（明天全日搬屋 → 時間不夠）、`#/week?try=hero.A`（同上並選了「今晚遲 1 小時睡」，B／C／D 是其他做法）、`#/week?try=essay`（Essay 延後）。

## 之後接後端時

目前所有資料都在 `demo-data.js`，畫面只透過 `store.js` 的動作改資料。接 AI 或資料庫時，替換 `store.js` 裡的動作（例如 `runScenario`、`inkProposal`），畫面檔案不用大改。
