# 部署設定（管理者）

正式網址：https://smart-study-planner-g8.pages.dev

這是 Cloudflare Pages Direct Upload 專案，保留原網址，使用 GitHub Actions + Wrangler 發布。只有手動執行 Publish website 才會部署；推送分支、開 PR、合併都只執行檢查。

## 第一次設定

1. 在 Cloudflare 使用者的 API Tokens 頁建立自訂 Token。只授予目標帳戶的 **Account → Cloudflare Pages → Edit** 權限，設定適當到期日。若帳戶內有多個 Pages 專案，這個帳戶級權限可能涵蓋它們，並非單一網站權限。
2. 在 Cloudflare 確認持有 `smart-study-planner-g8` 的 Account ID。
3. 在 GitHub 倉庫 **Settings → Environments → production → Environment secrets**，加入 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。不要貼到聊天、程式或 README。
4. production 的 Deployment branches 限定 main；可加 Required reviewers，只讓指定發布負責人批准。
5. 執行 **Actions → Publish website → Run workflow → main**。如果設定了審批，發布負責人還要批准該次 deployment。

## 協作保護

目前由負責人統一整合組員交回的檔案。main 要求 Pull Request 及 **Project checks** 通過；不強制另一位成員審核，負責人可以自行合併。禁止強制推送及刪除分支，規則也套用到管理者。

普通組員下載後本機修改、交回檔案即可，不需要操作上述 GitHub 整合流程。正式發布仍由指定負責人批准。

## 出問題時

- 程式合併錯誤：用 GitHub PR 的 **Revert** 建立撤回 PR，檢查後合併。撤回提交不會抹去歷史。
- 正式網站有問題：先在 Cloudflare Pages Deployments 選上一個已知正常的正式部署，使用可用的 Rollback 操作；再撤回／修正程式，避免下次發布又把錯誤帶回去。
- 自動檢查通過只代表語法、檔案引用和基本 HTTP 回應正常，仍需要手動測試使用者流程。

參考：[Cloudflare CI 上傳](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)、[GitHub 分支保護](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。
