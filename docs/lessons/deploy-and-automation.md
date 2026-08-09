# 部署與自動化:兩件已經查到底的事

> **什麼時候該讀這份**:合併後 production 沒動、Renovate PR 檢查全綠卻不合併,或想調整
> Renovate 的範圍與自動合併設定時。**平常開 PR、合併不必讀。**
>
> 這兩件事的共同點是**已經完整排查過一輪,而結論就是「不要再排查一次」**。祈使結論留在
> `AGENTS.md`,案例留在這裡 —— 你需要的是結論,只有結論不管用時才需要案例。
>
> 從 `AGENTS.md` 搬出來(2026-08-09)。`AGENTS.md` 是 schema 層,這份是教訓層。

## Vercel 合併後完全沒有部署(2026-08-01,PR #68)

- **合併後確認 Vercel 真的有部署 —— 這件事會靜默失敗。** 2026-08-01 合併 PR #68 後
  production 完全沒動:Vercel 一筆部署紀錄都沒建(不是 build 失敗、不是 skip 後留一筆),
  `9b228d3` 的 commit status 是空的,而前幾次合併都有 `Vercel` 這個 context。當時已排除
  `[skip ci]` 類標記、`git.deploymentEnabled`(repo 沒有 `vercel.json`/`vercel.ts`)、
  配額(24 小時內只有 3 筆)、平台故障(status 全綠)與設定漂移(專案 `updatedAt` 停在
  合併之前),而同一個 GitHub App 在合併前 5 分鐘才剛建過該分支的 preview。最可能是那次
  push 的 webhook 掉了(GitHub App 的 delivery 失敗**不會自動重送**)。**補救**:Vercel
  dashboard → Deployments → **Create Deployment** 選 `main`(**不要**用舊部署的 Redeploy,
  那會重建舊 commit);手動建的部署 meta 會少 `repoPushedAt` 但仍帶正確 `githubCommitSha`。
  排查時 `gh api repos/<owner>/<repo>/commits/<sha>/status` 看有沒有 `Vercel` context 最快。
  **已證實是偶發,不是設定問題**:下一次合併(PR #69,`737bcce`)在 71 秒內自動部署完成。
  **所以再遇到請直接補觸發,不要重新排查專案設定** —— 那條路上次已經全部走完且全部乾淨。

## Renovate:一次開多個 PR 時,排隊的會卡在 `BEHIND`

  - **一次開多個 PR 時,排隊的會卡在 `BEHIND` 動不了**:必過檢查設了
    `strict: true`(分支要跟 base 同步才能合併),repo 沒開自動更新分支
    (`allow_update_branch`)。2026-07-12 手動觸發「一次全開」7 個 PR 時實測:
    每合併一個進 main,其餘還在排隊的 PR 分支立刻落後,卡在
    `mergeStateStatus: BEHIND`,自己不會動——等 Mend 下一輪重新 rebase 才會
    解開(實測約數分鐘到十幾分鐘)。目前選擇**不處理**(單人 repo、Renovate
    平時一次頂多開一兩個 PR,不太會撞到這個情境);真的常卡再考慮開 GitHub
    merge queue 或把 `strict` 關掉。遇到「PR 一直不合併但檢查都綠燈」先查
    `gh pr view <N> --json mergeStateStatus`,不用重新從頭診斷。

## Renovate:為什麼不走回自架 action

  - 2026-07-12 前曾自架在 repo 自己的 Actions 裡跑 `renovatebot/github-action`,
    改用官方 App 後已移除 —— 自架版需要自己追 Renovate 本體版本、還需要開
    repo 層「Allow Actions to create and approve pull requests」這個範圍比
    實際需求廣的開關;App 版兩者都不需要。除非 App 被移除,否則不要走回自架
    這條路。
