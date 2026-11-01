# Smart Study Planner

協助學生整理功課、截止日期及讀書時間的網站原型。**組員想改前端 UI，先從下面找畫面檔案及樣式檔案。**

## 我想改甚麼，應該打開哪個檔案？

**UI 通常要看兩部分：頁面內容在 `dist/js/views/`，外觀樣式在 `dist/css/`。點下表的檔名就能查看程式。**

| 我想修改… | 先打開這個檔案 | 需要調整外觀時，再看… |
|---|---|---|
| 歡迎頁、首次使用流程 | [start.js](dist/js/views/start.js) | [pages.css](dist/css/pages.css) |
| 本週頁面、任務摘要、遠方截止日期 | [week.js](dist/js/views/week.js) | [pages.css](dist/css/pages.css) |
| 月曆總覽及日期操作 | [month.js](dist/js/views/month.js) | [pages.css](dist/css/pages.css) |
| 任務編輯表單、子任務及附件入口 | [task-editor.js](dist/js/views/task-editor.js) | [pages.css](dist/css/pages.css) |
| 時間表方格、讀書時段、沒空背景 | [planner.js](dist/js/planner.js) | [planner.css](dist/css/planner.css) |
| 任務列表、任務詳情及進度畫面 | [tasks.js](dist/js/views/tasks.js) | [pages.css](dist/css/pages.css) |
| 課程資料匯入及核對畫面 | [import.js](dist/js/views/import.js) | [pages.css](dist/css/pages.css) |
| 沒空時段、睡眠設定畫面 | [availability.js](dist/js/views/availability.js) | [planner.css](dist/css/planner.css)、[pages.css](dist/css/pages.css) |
| AI 助手的對話區及建議卡片 | [margin.js](dist/js/views/margin.js) | [pages.css](dist/css/pages.css) |
| 原型說明頁 | [about.js](dist/js/views/about.js) | [pages.css](dist/css/pages.css) |
| Figma 版面、細框白色區塊、導覽與手機排版 | [figma.css](dist/css/figma.css) | [pages.css](dist/css/pages.css) |
| 整體顏色、字體、間距、圓角 | [tokens.css](dist/css/tokens.css) | — |
| 按鈕、標籤、彈出框等共用元件外觀 | [components.css](dist/css/components.css) | [tokens.css](dist/css/tokens.css) |
| 頁首、導覽及全站基本排版 | [index.html](dist/index.html)、[base.css](dist/css/base.css) | — |

**例如要改「任務頁面的卡片」：先改 `dist/js/views/tasks.js` 的內容，再到 `dist/css/pages.css` 調整卡片外觀；只有按鈕行為需要變更時，才繼續找下面的功能檔案。**

## 如果我要改功能，而不是畫面？

| 想修改的功能 | 對應檔案 |
|---|---|
| 按鈕點擊、表單操作、切換頁面 | [app.js](dist/js/app.js) |
| 新增功課、確認計劃、更新進度、保存資料 | [store.js](dist/js/store.js) |
| 計算空檔、每日資料及建議變動 | [model.js](dist/js/model.js) |
| 自動排程的規則 | [scheduler.js](dist/js/scheduler.js) |
| 示範課程、功課、截止日期及時段 | [demo-data.js](dist/js/demo-data.js) |
| 預先寫好的 AI 示範回覆 | [scenarios.js](dist/js/scenarios.js) |
| 中英文切換 | [i18n.js](dist/js/i18n.js)，以及頁面內的 `L('中文', 'English')` |

**目前沒有真正的後端、登入 API、資料庫或 AI API。** `serve.mjs` 只負責本機預覽，不是業務後端。未來接後端主要從 `store.js` 的資料操作開始；完整檔案用途與接駁說明見 [程式碼地圖](docs/code-map.md)。

## 下載後，怎樣看到自己修改的效果？

1. 按 GitHub 綠色 **Code → Download ZIP**，或 [直接下載最新程式](https://github.com/kley9903/smart-study-planner-g8/archive/refs/heads/main.zip)，解壓縮。
2. 安裝 Node.js 22 或更新版本，在包含 `package.json` 的資料夾打開終端機。
3. 執行 `npm start`，再在瀏覽器打開 http://localhost:5173 。
4. 修改檔案並儲存，回瀏覽器重新整理，就能看效果。收工按 **Ctrl+C** 停止預覽。

不需要 `npm install`，也沒有 build 步驟。**`dist/` 就是可以修改的網站原始碼**；因為使用 JavaScript 模組，請用上面的方式預覽，不要直接雙擊 `index.html`。

[看目前的網上版](https://smart-study-planner-g8.pages.dev) 可以了解網站，但你在本機修改的內容只會出現在自己的本機預覽。

## 改好後交甚麼？

先實際操作修改的功能，再執行 `npm run check`。交回**改過的檔案（保留路徑）＋修改說明＋效果截圖**，由專案負責人比較並整合。組員不用先學 Git 分支或 PR。

- 完整交件步驟與格式：[CONTRIBUTING.md](CONTRIBUTING.md)
- 每個檔案的詳細用途：[程式碼地圖](docs/code-map.md)
- 人員角色與 GitHub 署名：[CONTRIBUTORS.md](CONTRIBUTORS.md)

## 修改 UI 時的共用約定

- 中英文一起改：JavaScript 使用 `L('中文', 'English')`；`index.html` 的固定文字使用 `data-en`。
- 虛線代表尚未確認的建議，實色代表已確認的計劃；灰色代表沒空的時間。
- 共用樣式優先修改對應 CSS，避免同一個元件在不同頁面出現不同風格。
