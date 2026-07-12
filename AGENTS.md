# myblog-nextjs 開發守則

Hux 主題部落格移植到 Next.js App Router 的版本(production:blog.allenspace.de,
Vercel 自動部署 `main`)。完整的功能與設定手冊在
`docs/functionality-settings-manual.zh-TW.md` — **動手前先讀相關章節**,大部分
「看起來像 bug」的行為(路由語意、CSP、OG 字體、PWA)都是有意為之且記錄在案。

## 指令與環境陷阱

- `yarn dev` / `yarn build` / `yarn serve` / `yarn lint`(帶 `--fix`)/
  `yarn test:unit` / `yarn test:parity`(Playwright,自動 build + serve 於 3012)/
  `yarn mermaid:render`(`--check` 為驗證模式,不寫檔)
- **不要**同時跑 `yarn build` 和 `yarn dev`/`yarn test:parity` — 會在 `.next` 上競爭,
  產生無樣式頁面等假 bug。
- **永遠不要用 dev server 判斷互動行為**:冷路由第一次點擊會停 ~1.5 秒,是按需編譯
  不是 bug;production 導航只要 ~15ms。互動類驗證一律跑 production build。
- build 需要 HarfBuzz CLI(`hb-shape`/`hb-subset`,`brew install harfbuzz`)。
  對 HarfBuzz(或任何 CLI)傳非 ASCII 文字**一律用 `--text-file`/stdin,不要走 argv**
  — argv 會經過呼叫端 locale 的編碼轉換,在沒設 UTF-8 locale 的 shell(CI、
  非互動環境)會直接炸。
- Vercel 上沒有 HarfBuzz,`check:og-font` 在那裡跳過(`VERCEL=1`);缺口由 GitHub
  Action `og-font-check` 補(push/PR 動到內容/字體時跑同一道檢查,只警報不擋部署)。
  GitHub Actions 的 runner 用 `apt-get install -y libharfbuzz-bin` 裝 HarfBuzz —
  任何會跑 `yarn build` 的新 workflow 都要記得裝。
- `app/`、`layouts/` 多處 `import` 自 `contentlayer/generated`(`.contentlayer/`,
  gitignore),這是 `contentlayer2` 在 `next dev`/`next build` 時才產生的模組,
  乾淨 checkout(CI runner、新 clone)沒有這個目錄。在 CI 裡單獨跑 `tsc --noEmit`
  或任何不經過 `next build`/`next dev` 的型別檢查前,先跑 `yarn contentlayer2 build`
  產生型別,否則會炸一片 `TS2307: Cannot find module 'contentlayer/generated'`。
- Mermaid 圖表渲染需 headless Chromium,和 HarfBuzz 同理**不能在 Vercel build 跑**;
  渲染 offload 到 `yarn mermaid:render`(本機 / GitHub Action),產出的淺/深雙 SVG 快取
  commit 在 `public/mermaid/`;任何會跑渲染的新 workflow 記得
  `yarn playwright install --with-deps chromium`。
- 改 mermaid 主題或升級 mermaid 版本時,bump `scripts/mermaid-shared.mjs` 的
  `CACHE_VERSION` 並重跑 `yarn mermaid:render` 後 commit。
- `mermaid-check`(`.github/workflows/mermaid-check.yml`,job 名 `mermaid`)是**警告級
  非必過**檢查,不在 branch protection 的 required contexts;快取過期只標紅提醒,忘了
  重渲染時圖會暫時退化成程式碼區塊,不會壞站。

## Git 工作流程(2026-07-12 起)

- **main 分支保護,不直接 push main** — 一律開分支 → PR → 合併。不需要別人核准
  (單人專案,required_approving_review_count=0),但 PR 必須等必過檢查(CI、
  OG font check,見下)綠燈才能合併,且對 admin 也生效(`enforce_admins`)。
- **必過檢查**(GitHub context 名稱:`ci`、`check`;branch protection 的
  `required_status_checks.contexts` 認的是這兩個字面字串,workflow/job 改名
  要記得同步改 protection 設定):
  - `CI`(`.github/workflows/ci.yml`,job 名 `ci`)— 每次 push/PR 都跑:
    lint(不帶 `--fix`,要真的能失敗)、先 `yarn contentlayer2 build` 再
    `tsc --noEmit`、`test:unit`。
  - `OG font check`(`.github/workflows/og-font-check.yml`,job 名 `check`)—
    每次 push/PR 都跑,**故意不用 paths 過濾**。
  - **必過檢查不能有條件跳過**:GitHub 對 required status check 的語意是
    「等到它回報結果為止」;workflow 用 `paths:` 過濾、條件不符時根本不會
    觸發,就永遠不會回報狀態,PR 會卡死在 pending 動彈不得(PR #5 上真的踩過
    這個坑,才把 og-font-check 的 paths 過濾拿掉)。要嘛必過檢查每次都跑,
    要嘛就不能設為必過 —— 兩者只能選一個,不要試圖用 paths 過濾 + required
    check 兩者兼得。
  - 這兩個都**只是 PR 合併閘門**,不影響 Vercel 部署節奏 — Vercel 仍照自己的
    邏輯部署 `main` 的每個 commit。
- **Renovate**:官方 Mend App(https://github.com/apps/renovate,人類手動安裝在
  這個 repo 上,agent 沒有能力自己走 App 安裝/授權流程)。組態是 repo 根目錄的
  `renovate.json`,範圍**只限 GitHub Actions 版本**
  (`enabledManagers: ["github-actions"]`)— 只有 `.github/workflows/*.yml` 裡
  釘死的 action 版本(如 `actions/checkout@v4`)有新版時會自動開 PR,**不動
  npm/yarn 依賴**。這是刻意的範圍限制,擴大範圍前要先跟人類確認。
  - **自動合併**(`renovate.json` 的 `packageRules`,`matchManagers:
    ["github-actions"]`)已開啟,靠 repo 層 `allow_auto_merge` + GitHub 原生
    auto-merge:兩個必過檢查(`ci`、`check`)綠燈就自動合,不需要人看著。
    這條規則刻意限定在 `matchManagers: ["github-actions"]`,不是全域
    `automerge: true` —— 未來若擴大 Renovate scope 到 npm/yarn,新 manager
    不會連坐繼承自動合併,要另外決定。
  - **一次開多個 PR 時,排隊的會卡在 `BEHIND` 動不了**:必過檢查設了
    `strict: true`(分支要跟 base 同步才能合併),repo 沒開自動更新分支
    (`allow_update_branch`)。2026-07-12 手動觸發「一次全開」7 個 PR 時實測:
    每合併一個進 main,其餘還在排隊的 PR 分支立刻落後,卡在
    `mergeStateStatus: BEHIND`,自己不會動——等 Mend 下一輪重新 rebase 才會
    解開(實測約數分鐘到十幾分鐘)。目前選擇**不處理**(單人 repo、Renovate
    平時一次頂多開一兩個 PR,不太會撞到這個情境);真的常卡再考慮開 GitHub
    merge queue 或把 `strict` 關掉。遇到「PR 一直不合併但檢查都綠燈」先查
    `gh pr view <N> --json mergeStateStatus`,不用重新從頭診斷。
  - 2026-07-12 前曾自架在 repo 自己的 Actions 裡跑 `renovatebot/github-action`,
    改用官方 App 後已移除 —— 自架版需要自己追 Renovate 本體版本、還需要開
    repo 層「Allow Actions to create and approve pull requests」這個範圍比
    實際需求廣的開關;App 版兩者都不需要。除非 App 被移除,否則不要走回自架
    這條路。
  - 第三方 action(非 `actions/*`、`github/*`)一律釘 commit SHA,版本號用註解
    (供應鏈安全慣例;`sha_pinning_required` 目前是 false,不代表可以省略)。

## 除錯守則

背景:本 repo 付過兩次同型學費 — pagination「Older Posts 要按兩次」(先誤診為
dev-only 現象,真因是 `/` 與 `/blog` 內容重複)與 kbar「手機點文章要按兩次」
(先誤診為 kbar 內部 pointerdown 重渲染,真兇是 HeadlessUI 漢堡選單殘留在 kbar
底下吃掉第一次 tap)。兩次的共同失誤:**假設只做到「能解釋症狀」就當成定論**。

1. **鑑別實驗優先於修復。** 「能解釋症狀」的假設通常不只一個;一致的證據可以無限
   收集,否證實驗一個就夠。提出假設後先問:「有什麼最便宜的實驗,在我的理論是錯的
   時候會給出不同結果?」(kbar 案:⌘K 繞過漢堡直開 kbar,30 秒否證)。沒做過至少
   一個這種實驗前,不動手修、不寫「根因是 X」。

2. **觀察完整的狀態差,不只看理論預測的訊號。**「沒反應」幾乎從來不是真的沒反應。
   失敗互動的前後各抓完整快照(截圖 + a11y tree)去 diff,問「**還有什麼變了?**」
   (kbar 案:第一次 tap 其實關掉了漢堡選單 — 儀器只對準 kbar 就看不到)。

3. **列出事件路徑上的所有元件,由外往內二分。** 不要直奔最深最炫的嫌疑犯。讀原始碼
   讀到的可疑模式只是**候選**機制,不是診斷 — 執行期的事件記錄才能證明哪個真的在
   作怪(kbar 案:事件記錄顯示 click 根本有正常發出,直接推翻靜態閱讀的結論)。

4. **重現保真度優先於重現速度。** 滑鼠合成事件 ≠ 觸控(pointermove 會提前設好
   hover 狀態)、dev ≠ production、Playwright WebKit ≠ 真 Safari。先用最貼近使用者
   的方式(觸控模擬 `hasTouch: true` + production build)復現,復現不了再降級;
   每個環境捷徑都會憑空製造假假設。

5. **主動要使用者的微觀觀察。** 兩次破案的關鍵線索都來自使用者的精確描述(「第一次
   點 A、第二次點 B 才有反應」「選單在 kbar 底下被關掉」)。遇到「沒反應」類 bug,
   第一個問題應該是:「失敗的那一下,畫面上*有沒有任何東西*動了?」

6. **修復前先寫會失敗的回歸測試**(`tests/playwright/`),用它證明 bug、再用它證明
   修好;測試環境的保真度同第 4 條。

## 提交慣例

- Commit message:英文、conventional(`fix:`/`feat:`/`docs:`),body 寫清楚因果鏈
  (參考 `git log` 的既有風格)。
- 新增第三方 script/嵌入/圖床時,CSP(`next.config.mjs`)必須在同一次修改中更新。

### 提交前檢查清單(功能有變動時逐項過)

1. **兩份說明書**:這次改動有沒有動到
   `docs/functionality-settings-manual.zh-TW.md` 與
   `docs/functionality-settings-manual.md`(**中英文都要查**,改一份就要同步
   另一份)描述的行為、指令、路由、設定?有就在同一次提交裡更新。
2. **README**:`README.md` 描述的功能與特性清單是否仍然正確?新增/移除/改變
   使用者可見的功能時,README 要跟著動。
3. **AGENTS.md 本身**:這次除錯或實作有沒有得到新教訓、或造成 AGENTS.md 未提到
   的重大變化(新的環境陷阱、新的架構決策、新的驗證方式)?有就順手把守則
   更新在對應章節 — 教訓不落地,下一個 session 就會重付學費。
