# 部署與自動化:跑在你控制之外的流程

> **什麼時候該讀這份**:合併後 production 沒動、Renovate PR 檢查全綠卻不合併、要動
> `.github/workflows/` 的必過檢查條件,或發現 `openwiki` 覆寫了你沒改的檔案時。
> **平常開 PR、合併、例行跑 `openwiki --update` 都不必讀。**
>
> 收錄的共同性質是**流程在你看不見的地方自作主張**:webhook 會掉、required check 過濾
> 條件會讓 PR 永遠 pending、`openwiki` 每次執行都會覆寫某些檔案。祈使結論留在
> `AGENTS.md`,案例與機制留在這裡。
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

## 必過檢查為什麼不能用 `paths:` 過濾(PR #5)

  - **必過檢查不能有條件跳過**:GitHub 對 required status check 的語意是
    「等到它回報結果為止」;workflow 用 `paths:` 過濾、條件不符時根本不會
    觸發,就永遠不會回報狀態,PR 會卡死在 pending 動彈不得(PR #5 上真的踩過
    這個坑,才把 og-font-check 的 paths 過濾拿掉)。要嘛必過檢查每次都跑,
    要嘛就不能設為必過 —— 兩者只能選一個,不要試圖用 paths 過濾 + required
    check 兩者兼得。

## OpenWiki 兩個「不要試圖手動修正」的行為

- **OpenWiki(`openwiki` CLI,code 模式)有兩個「不要試圖手動修正」的行為** —— 都寫死在
  原始碼、沒有設定開關,且 `--init` 與 `--update` **每次執行都會重跑** repo setup:
  ① 它把**同一段 `<!-- OPENWIKI:START/END -->` 區塊同時寫進 `AGENTS.md` 與 `CLAUDE.md`**
  (`CODE_MODE_AGENT_FILES` 寫死這兩個檔名)。手動刪掉 `CLAUDE.md` 那份下次會原地長回來;
  **絕對不要整個刪掉 `CLAUDE.md`** —— 檔案不存在時它會「新建」一個只含 OpenWiki 區塊的檔,
  把 `@AGENTS.md` import 弄丟。重複約 500 B,接受即可,不要「順手修正」。
  ② `.github/workflows/openwiki-update.yml` **每次執行被無條件覆寫**(`writeFile`),手改必被
  蓋掉;而它用 `peter-evans/create-pull-request` 從 Actions 開 PR,需要開 repo 層
  「Allow Actions to create and approve pull requests」—— 本專案刻意不開這個開關
  (理由見本檔「Renovate:為什麼不走回自架 action」一節)。
  故該檔已列入 `.gitignore`:本機任它覆寫、但永不入庫;要更新 wiki 就本機跑
  `openwiki --update`,產物照常走 PR。

- **`openwiki/INSTRUCTIONS.md` 是唯一該由人手動維護的 OpenWiki 檔案**。它是「wiki 範圍與
  優先序」的 brief,OpenWiki 只讀不覆寫。生成內容跑偏(實測過:它會把「這次執行當下哪些
  檔案未被追蹤」寫成 repo 的永久不變量)要在這裡加約束,不要去改 `openwiki/` 底下的生成頁
  —— 那些下次 `--update` 會被重寫。
