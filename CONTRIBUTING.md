# 組員第一次改程式

每人用自己的 GitHub 帳戶。這個網站是原型：AI 回覆和匯入仍有示範內容；自己的計劃存在自己的瀏覽器，不會因為一起寫程式就共享資料。

## 1. 打開雲端工作空間

在 GitHub 專案頁按綠色 **Code（程式碼）→ Codespaces → Create codespace on main（建立工作空間）**。第一次需要等環境準備。

打開後，網站預覽會嘗試自動開啟。沒有出現時，在底部 **Ports（連接埠）** 找 **5173**，按 **Open in Browser（在瀏覽器開啟）**。先保持連接埠為 Private；要分享自己的預覽時再確認分享範圍。

每個人的 Codespace 是各自的版本。你改壞自己的版本，不會即時改動正式網站。Codespaces 有免費額度；用完請停止，不需要設定付費額度。

## 2. 先建立自己的修改分支

按編輯器左下角的 **main**，選 **Create new branch（建立分支）**，填 `你的名字/修改內容`，例如 `alex/help-text`。如果選單不同，用頂部搜尋框輸入 `Git: Create Branch`。

第一次建議只做一個小修改，例如在 `dist/js/views/about.js` 改一行說明。先跟其他組員說自己改哪一塊。

| 要改甚麼 | 檔案 |
|---|---|
| 說明頁 | `dist/js/views/about.js` |
| 歡迎及首次使用 | `dist/js/views/start.js` |
| 本週時間表頁面 | `dist/js/views/week.js` |
| 顏色、字體、尺寸 | `dist/css/tokens.css` |
| 示範課程和功課 | `dist/js/demo-data.js` |
| 自動排程規則 | `dist/js/scheduler.js` |

程式裡的介面文字使用 `L('中文', 'English')`，兩個語言一起改。不要放入真實學生資料或 API 金鑰。

## 3. 看自己的預覽

檔案會自動儲存，回到自己的預覽按重新整理。這個專案沒有自動熱更新；儲存之後要重新整理才會看到修改。試一次修改的功能，確認沒有明顯問題。

## 4. 提交給小組看

1. 左邊 **Source Control（原始碼管理，分支圖示）** 會列出修改。
2. 點檔名可以看修改前後；填一句說明，例如「改善說明頁文字」。
3. 按 **Commit（建立版本）**；如果詢問 Stage changes（加入本次版本），確認自己要提交的檔案。
4. 按 **Publish Branch（上傳新分支）** 或 **Sync Changes（同步修改）**。
5. 回 GitHub 專案頁，按 **Compare & pull request（比較並提出修改申請）**，填改了甚麼、怎樣檢查，再按 **Create pull request**。

不是直接改 main。組員完成審核、綠色 Project checks 通過後，管理者才合併。遇到紅色檢查或衝突，先把 PR 連結交給負責整合的人，不要刪專案或強制覆蓋。

如果還沒被邀請為協作者，你無法直接上傳分支到這個倉庫；可以先 Fork（複製到自己的帳戶），在自己的倉庫建立 Codespace，再從自己的版本提交 PR。

## 5. 收工與下次繼續

先確認修改已 Commit 並同步，再到 https://github.com/codespaces 按工作空間旁的 `… → Stop codespace`。只關瀏覽器分頁未必立即停止計費時數；停止後仍會保留工作空間儲存量。

下次從同一頁重新打開自己的工作空間，不必每次建立新的。開始新任務前先確認上一個 PR 已處理；回 main 同步最新修改後，再開新分支。若 main 有未提交修改，先停下來處理，不要強制切換。

## 只有發布負責人需要操作

合併程式不會自動更新正式網站。要上架時，打開 GitHub **Actions → Publish website → Run workflow**，分支選 **main**，再按 **Run workflow**。發布會先檢查程式，再更新現有 Cloudflare 網址。

首次使用前，管理者要在 GitHub 的 `production` Environment 設定部署憑證，見 [部署設定](docs/deployment.md)。普通組員不需要 Cloudflare 帳號或部署 Token。
