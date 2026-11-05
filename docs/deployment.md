# 部署設定（管理者）

正式網址：https://smart-study-planner-g8.pages.dev

這是 Cloudflare Pages Direct Upload 專案，保留原網址，使用 GitHub Actions + Wrangler 發布。只有手動執行 Publish website 才會部署；推送分支、開 PR、合併都只執行檢查。

## 第一次設定

1. 在 Cloudflare 使用者的 API Tokens 頁建立自訂 Token。只授予目標帳戶的 **Account → Cloudflare Pages → Edit** 權限，設定適當到期日。若帳戶內有多個 Pages 專案，這個帳戶級權限可能涵蓋它們，並非單一網站權限。
2. 在 Cloudflare 確認持有 `smart-study-planner-g8` 的 Account ID。
3. 在 GitHub 倉庫 **Settings → Environments → production → Environment secrets**，加入 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。不要貼到聊天、程式或 README。
4. production 的 Deployment branches 限定 main；可加 Required reviewers，只讓指定發布負責人批准。
5. 執行 **Actions → Publish website → Run workflow → main**。如果設定了審批，發布負責人還要批准該次 deployment。

## 大綱 AI（Dify）的金鑰

「課程資料」頁的「用 AI 找出項目」經 `functions/api/syllabus.js` 呼叫 Dify 工作流程。這支程式隨 `wrangler pages deploy` 一起發布，需要一個環境變數：

1. 在 Dify 工作流程的「存取點 → 後端服務 API → API 金鑰」取得金鑰（`app-` 開頭）。
2. Cloudflare → Workers & Pages → `smart-study-planner-g8` → Settings → Variables and Secrets → Production，新增 **Secret** `DIFY_API_KEY`，貼上金鑰。不要貼到聊天、程式或 README。
3. 重新發布一次（Publish website），新設定才會生效。
4. 選填：自架 Dify 時加 `DIFY_API_BASE`（預設 `https://api.dify.ai/v1`）。

沒有設定時，網站其他部分照常運作，按「用 AI 找出項目」會顯示「AI 還沒在伺服器設定好」。本機試用：先在終端機設定 `DIFY_API_KEY` 環境變數，再 `node serve.mjs`。

這個轉接只接受同一網站發出的請求、單檔 15 MB 以內；任何打開網站的人都可以使用，會用到 Dify 帳戶的額度。

## 排程 AI（Dify）的金鑰

「本週」頁的「自動排程」經 `functions/api/plan.js` 呼叫另一個 Dify 工作流程「排程｜Study Planner」，用另一個金鑰：

1. 在「排程｜Study Planner」的「存取點 → 後端服務 API → API 金鑰」取得金鑰（`app-` 開頭；跟大綱用的不是同一把）。
2. 在同一個 Cloudflare 頁面新增 **Secret** `DIFY_PLAN_KEY`，貼上金鑰。不要貼到聊天、程式或 README。
3. 重新發布一次（Publish website）。

沒有設定時，按「自動排程」會顯示「AI 暫時連不上」，網站其他部分照常運作；Dify 連不上時也一樣，網站不會自己用另一套規則排（見專案的 ADR 0001）。本機試用：設定 `DIFY_PLAN_KEY` 環境變數，再 `node serve.mjs`。

## 協作保護

目前由負責人統一整合組員交回的檔案。main 要求 Pull Request 及 **Project checks** 通過；不強制另一位成員審核，負責人可以自行合併。禁止強制推送及刪除分支，規則也套用到管理者。

普通組員下載後本機修改、交回檔案即可，不需要操作上述 GitHub 整合流程。正式發布仍由指定負責人批准。

## 出問題時

- 程式合併錯誤：用 GitHub PR 的 **Revert** 建立撤回 PR，檢查後合併。撤回提交不會抹去歷史。
- 正式網站有問題：先在 Cloudflare Pages Deployments 選上一個已知正常的正式部署，使用可用的 Rollback 操作；再撤回／修正程式，避免下次發布又把錯誤帶回去。
- 自動檢查通過只代表語法、檔案引用和基本 HTTP 回應正常，仍需要手動測試使用者流程。

參考：[Cloudflare CI 上傳](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)、[GitHub 分支保護](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。

## AI 助手（Dify Chatflow）的金鑰

AI 助手面板（自己的計劃）經 `functions/api/chat.js` 呼叫 Dify「AI 助手｜Study Planner」Chatflow，用第三把金鑰：

1. 在「AI 助手｜Study Planner」的「存取點 → 後端服務 API → API 金鑰」取得金鑰（`app-` 開頭）。
2. 在同一個 Cloudflare 頁面新增 **Secret** `DIFY_CHAT_KEY`，貼上金鑰。不要貼到聊天、程式或 README。
3. 重新發布一次（Publish website）。

沒有設定時，在 AI 助手打字會回「AI 助手暫時連不上」，網站其他部分照常運作。示範導覽不經 Dify，仍用預先寫好的回覆。
