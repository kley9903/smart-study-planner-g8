# 程式碼地圖：每個部分做甚麼、要改哪裡

這是 Smart Study Planner 的前端原型。**`dist/` 就是可修改的網站原始碼，不是編譯後不能改的成品。** 目前用 HTML、CSS、原生 JavaScript，沒有 build 步驟。

下載及交件方式見 [組員指南](../CONTRIBUTING.md)。

## 先按工作內容找位置

| 想改的部分 | 主要位置 |
|---|---|
| 顏色、字體、間距、圓角 | `dist/css/tokens.css` |
| 某一頁的文字、內容和畫面結構 | `dist/js/views/` 對應的頁面 |
| 時間表的方格、時段外觀 | `dist/js/planner.js` 與 `dist/css/planner.css` |
| 按鈕點擊後做甚麼、切換頁面 | `dist/js/app.js` |
| 新增功課、確認計劃、回報進度、保存資料等動作 | `dist/js/store.js` |
| 根據已有資料算出空檔、每日畫面、建議變動 | `dist/js/model.js` |
| 自動排程的規則 | `dist/js/scheduler.js` |
| 示範課程、功課、時段 | `dist/js/demo-data.js` |
| AI 助手的預先寫好回覆 | `dist/js/scenarios.js`（目前不是 AI API） |
| 中英文切換 | `dist/js/i18n.js`，以及各頁面的 `L('中文', 'English')` |
| 真正的後端、登入、資料庫、AI API | **尚未建立**；接駁方向見下方說明 |

## 網站入口與外觀

| 檔案 | 用途 |
|---|---|
| `dist/index.html` | 網站入口；頁首、導覽、主要容器、SVG 圖示定義，載入 CSS 和 JavaScript |
| `dist/favicon.svg` | 瀏覽器分頁的小圖示 |
| `dist/css/tokens.css` | 共用顏色、字體和尺寸變數，整體風格優先從這裡改 |
| `dist/css/base.css` | 基本排版、頁首及手機導覽 |
| `dist/css/components.css` | 共用按鈕、標籤、彈出框、提示等元件外觀 |
| `dist/css/planner.css` | 時間格、讀書時段、沒空背景、建議與確認狀態的外觀 |
| `dist/css/figma.css` | Figma 版外觀與版面覆寫；導覽、白色細框區塊、各頁比例及手機排版 |
| `dist/css/pages.css` | 各頁版面、首次使用流程、導覽與不同螢幕寬度的排版 |

## 每一個頁面

頁面檔案主要把資料畫成畫面；按鈕事件通常由 `app.js` 接收，再呼叫 `store.js` 修改資料。

| 檔案 | 對應畫面／用途 |
|---|---|
| `dist/js/views/start.js` | 歡迎頁及首次使用的設定步驟 |
| `dist/js/views/week.js` | 本週時間表、任務摘要、遠方截止日期；「改沒空的時間」模式時讀書時段變淡，右欄由 AI 助手換成沒空時間清單 |
| `dist/js/views/month.js` | 共用任務與忙碌資料的月曆、跨月切換及日期選擇 |
| `dist/js/views/task-editor.js` | 新增／編輯任務表單、子任務與附件入口；新增頁右邊的「建議拆法」（`suggestSteps`，示範用固定範本，未接 AI；接 AI 時改這裡） |
| `dist/js/views/tasks.js` | 任務列表、任務細節、步驟和進度 |
| `dist/js/views/import.js` | 課程資料匯入及核對畫面；示範模式用預寫的抽取結果，自己的計劃只把 PDF 存在瀏覽器（`ownPanel`）；真正的 PDF／Canvas 抽取尚未接通 |
| `dist/js/views/availability.js` | 「改沒空的時間」的說明行和右欄（睡眠、上課時間、你自己加的）；拖拉新增、右鍵移除、手機按空白處新增的處理在 `app.js`；不再是獨立頁面，由本週按「改沒空的時間」打開（`ui.editBusy`），舊網址 `#/time` 會轉到這裡 |
| `dist/js/views/margin.js` | AI 助手的對話內容、建議及選擇方案的畫面（放在右下角角色展開的面板裡） |
| `dist/js/views/dock.js` | 每頁右下角的角色入口：名牌狀態、有事時的泡泡（可直接回答）、展開／縮小；名字在 `assistantName` 改 |
| `dist/img/mascot.webp`、`mascot.png` | 角色待機動畫（12 fps、62 格）和第一格靜止圖（「減少動態效果」時用） |
| `dist/js/views/about.js` | 原型說明與使用說明頁 |

## 資料與功能邏輯

| 檔案 | 用途 |
|---|---|
| `dist/js/app.js` | JavaScript 入口（含獨立 `#/monthly` 月曆及 `#/add-task` 新增頁）；按網址切頁、更新畫面、接收點擊與表單等操作 |
| `dist/js/store.js` | 管理目前狀態與修改資料的動作；自己的計劃存在瀏覽器 localStorage，示範狀態主要存在記憶體 |
| `dist/js/attachments.js` | 附件保存在本瀏覽器 IndexedDB；沒有伺服器上傳或 AI 文件分析 |
| `dist/js/model.js` | 從狀態推算每日畫面、空檔、課程／任務資料和 AI 建議疊加結果 |
| `dist/js/scheduler.js` | 固定規則排程：按截止時間找空檔、避開沒空時段、限制每日讀書量等；不是 AI 模型 |
| `dist/js/planner.js` | 多頁共用的時間表繪製元件、時段和變動箭嘴 |
| `dist/js/demo-data.js` | 虛構課程、功課、時間表和匯入結果，供示範使用 |
| `dist/js/scenarios.js` | 預先寫好的對話情境、AI 示範回覆和選項 |
| `dist/js/tour.js` | 聚光燈式新手導覽與步驟定位 |
| `dist/js/i18n.js` | 語言選擇、中英文文字選用及固定文字切換 |
| `dist/js/time.js` | 日期、分鐘數、時間區間和顯示格式的小工具 |
| `dist/js/ui.js` | 提示、彈出框、圖示、文字跳脫及瀏覽器儲存的小工具 |

## 啟動、檢查和專案說明

| 檔案 | 用途／組員需不需要改 |
|---|---|
| `serve.mjs` | 在本機提供 `dist/` 檔案的預覽伺服器；沒有業務 API，**不是應用程式後端**。一般畫面修改不用改它 |
| `package.json` | 定義 `npm start`、`npm run check` 等命令；目前沒有第三方套件依賴 |
| `scripts/check.mjs` | 檢查 JS 語法、檔案引用、網站回應及 MIME；加新功能時可視需要擴充 |
| `scripts/check-planner.mjs` | 檢查月曆邊界、排程確認、編輯後失效處理及本機資料保存 |
| `scripts/start-preview.mjs` | 舊雲端流程的預覽助手；下載後本機開發用 `npm start` 就好 |
| `CONTRIBUTING.md` | 下載、執行、修改及交件步驟 |
| `CONTRIBUTORS.md` | 小組角色、實際貢獻及 GitHub 自動署名的說明 |
| `README.md` | 組員的修改入口：按想改的 UI／功能找到對應檔案，以及下載與本機預覽步驟 |
| `docs/code-map.md` | 本檔：程式各部分的位置 |
| `.gitignore` | 指定不要提交的本機檔案，例如環境變數、快取與憑證 |
| `.gitattributes` | 文字換行規則，以及下載 ZIP 時略過的管理設定 |

GitHub 倉庫還保留以下管理設定，普通組員不用處理；下載 ZIP 會略過它們：

| 位置 | 用途 |
|---|---|
| `.devcontainer/devcontainer.json` | 先前設定的 Codespaces 環境；不代表必須使用或一直執行 |
| `.github/workflows/check.yml` | GitHub 上的自動程式檢查 |
| `.github/workflows/deploy.yml` | 負責人手動觸發及批准後，發布到 Cloudflare |
| `.github/pull_request_template.md` | 修改申請的說明範本，普通組員直接交檔案不需要用 |
| `docs/deployment.md` | 發布管理者的設定說明 |

## 後端目前在哪裡？

**目前沒有真正的後端程式、登入 API、共用資料庫或 AI API。** Cloudflare Pages 只是提供這份靜態網站；自己的資料儲存在自己的瀏覽器。組員下載原始碼，不會下載到其他人的 localStorage 計劃。

日後有人負責後端時，先約定 API 路徑、請求與回傳格式，再新增獨立的 `backend/` 目錄（這是建議位置，現在尚不存在）。前端接駁點主要在 `store.js`：把直接修改狀態或產生示範結果的相關動作接到後端 API，再按需要調整 `model.js` 與頁面。

- 登入、跨裝置保存：需要後端驗證、資料庫，以及前端的登入／載入／儲存動作。
- AI 對話：需要真正的後端 AI 呼叫；`scenarios.js` 目前只供示範。
- PDF／Canvas 匯入：需要實際解析或外部資料接駁；`views/import.js` 目前主要是展示與核對介面。
- API 金鑰只放後端安全設定，不放在 `dist/`。前端檔案會被瀏覽器下載。
