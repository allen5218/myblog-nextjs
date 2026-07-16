# myblog-nextjs 開發守則

Hux 主題部落格移植到 Next.js App Router 的版本(production:blog.allenspace.de,
Vercel 自動部署 `main`)。完整的功能與設定手冊在
`docs/functionality-settings-manual.zh-TW.md` — **動手前先讀相關章節**,大部分
「看起來像 bug」的行為(路由語意、CSP、OG 字體、PWA)都是有意為之且記錄在案。

## 指令與環境陷阱

- `yarn dev` / `yarn build` / `yarn serve` / `yarn lint`(帶 `--fix`)/
  `yarn test:unit` / `yarn test:parity`(Playwright,自動 build + serve 於 3012)/
  `yarn mermaid:render`(`--check` 為驗證模式,不寫檔)
- Next.js 16 將 `next dev` 輸出改到 `.next/dev`,因此可與 `next build` 並行;同時它用
  lockfile 阻止同一專案重複執行多個 dev 或多個 build。不要因為 lockfile 而強行啟動第二個
  同類程序;互動驗證仍要由 production build 驗證。
- **`next-env.d.ts` 會在 dev/build 交替後反覆翻動**:typed routes 的產出位置分家了
  (`next dev` 寫 `import "./.next/dev/types/routes.d.ts"`,`next build` 寫
  `import "./.next/types/routes.d.ts"`),誰最後跑誰贏,`git status` 就永遠有這一行 diff。
  這不是任何人的改動,不用調查、不要 checkout 還原(下次又翻回來)、**commit 時一律排除**
  (用明確的 `git add <檔案清單>`)。也不能 gitignore:CI 在乾淨 checkout 直接跑
  `tsc --noEmit`,沒這個檔案,全專案 CSS/圖片 import 的型別會炸。
- **永遠不要用 dev server 判斷互動行為**:冷路由第一次點擊會停 ~1.5 秒,是按需編譯
  不是 bug;production 導航只要 ~15ms。互動類驗證一律跑 production build。
- **Codex 沙箱內的 Next 16 production build 可能假性卡住。** 2026-07-17 做過同碼鑑別:
  沙箱內 `yarn build` 停在 `Creating an optimized production build ...` 超過數分鐘且沒有
  新輸出;終止後以提升權限在沙箱外重跑,同一份程式碼約 4 秒完成 Turbopack compile、
  約 15 秒完成整個 build。遇到明顯超過平常約 120 秒的情況,先確認沒有第二個 build、
  lockfile 或真實編譯錯誤;若都沒有,不要把它診斷成 Next 16 效能退化,直接申請提升權限
  重跑 `yarn build`。production server 綁定 `127.0.0.1:3012` 若回 `listen EPERM` 也用
  同一方式在沙箱外啟動;驗證完成後必須關閉該程序。
- `next/og` 的 `ImageResponse` 只支援 CSS 子集;全版 absolute overlay **不要用
  `inset: 0` shorthand** — Satori 的 inline-style layout 不會把它展開,元素會沒有面積而
  靜默消失。要明寫 `top`/`right`/`bottom`/`left: 0`,並用實際渲染 PNG 的像素測試驗證;
  只測傳入 opacity 數值抓不到這類 renderer 相容性問題。
- build 需要 HarfBuzz CLI(`hb-shape`/`hb-subset`,`brew install harfbuzz`)。
  對 HarfBuzz(或任何 CLI)傳非 ASCII 文字**一律用 `--text-file`/stdin,不要走 argv**
  — argv 會經過呼叫端 locale 的編碼轉換,在沒設 UTF-8 locale 的 shell(CI、
  非互動環境)會直接炸。
- 網頁本體的 Chiron Sung HK 不再由 `next/font/google` 分片。`font-data/chiron/` 的
  committed 單調 core 加 schema v2 `supplemental-assignments.json` 是 authoritative
  input；五個 supplemental buckets 依頁面共現分配，既有 code point 不得由普通更新
  重排。產物是 `public/static/fonts/chiron/*.woff2`、manifest 與
  `css/chiron-font.generated.css`，全部必須一起 commit；不要手改 generated CSS/manifest。
  新內容使產物過期時執行 `yarn update:site-font`（命令會先 fresh build Contentlayer，
  不會讀取過期的 `.contentlayer`）；只有刻意擴張 core 才用
  `yarn update:site-font --rebuild-core`。本機更新/完整檢查還需要 Homebrew `woff2`
  (`woff2_compress`/`woff2_decompress`)；文字一樣只能透過 `--text-file` 傳 HarfBuzz。
- Vercel 上沒有 HarfBuzz/woff2；`check:og-font` 與 `check:site-font` 的動態部分在
  `VERCEL=1` 時依窄化 policy 跳過，但 manifest、assignment、hash、CSS、corpus 與頁面
  budget 靜態檢查仍必須通過。required GitHub Action `og-font-check` 會安裝
  `libharfbuzz-bin` + `woff2`，先生成 Contentlayer model，再跑
  `check:site-font --full`；它會用 `origin/main` 的 assignment map 驗證既有字元沒有換桶。
  任何新增會跑完整 site-font check 的 workflow 都要安裝兩個套件；只跑 `yarn build`
  則 site-font 不重產，只因 `check:og-font` 需要 HarfBuzz。
- `app/`、`layouts/` 多處 `import` 自 `contentlayer/generated`(`.contentlayer/`,
  gitignore)。Next 16 的 Turbopack 不會執行 `next-contentlayer2` webpack hook,所以此 repo
  改由 scripts 明確執行 `contentlayer2`:`yarn dev`/`yarn start` 先 blocking build 再併行
  watcher + Next dev,`yarn build` 在 Next build 前先 build。乾淨 checkout(CI runner、新
  clone)單獨跑 `tsc --noEmit` 或其他型別檢查前,仍要先跑 `yarn contentlayer2 build`,否則會
  炸一片 `TS2307: Cannot find module 'contentlayer/generated'`。
- Next 16 已移除 `next lint`;本機 `yarn lint` 與 CI 都直接使用 ESLint CLI。Next 的
  core-web-vitals 規則必須從 `eslint-config-next/core-web-vitals` 的 flat config 匯入,不要
  改回 FlatCompat 的 legacy `next` extends。
- Serwist 在 Turbopack 路線由 `@serwist/turbopack` 的
  `app/serwist/[path]/route.ts` 產生 service worker;註冊網址是 `/serwist/sw.js`,不再以
  webpack child compilation 寫入 `public/sw.js`。`app/sw.ts` 繼續因 webworker 型別排除於
  主 tsconfig/ESLint,但 route handler 是一般 app 程式碼,不得排除。
- **固定浮動控制項要避開內容阻擋器的通用 selector**:實測 AdGuard 啟用的
  Fanboy's Annoyances 同時以 `##.back-top` 與 `##[aria-label="Back to top"]` 隱藏返回頂部
  按鈕,造成 Safari、Discord WebView 與部分主畫面 Web App 消失,而 LINE WebView 仍
  正常。排查時用 Safari 無痕模式、單站關閉內容阻擋器,再逐組停用 filter
  做鑑別;AdGuard iOS 沒有 filtering log。站內控制項保留專屬中性 class
  `.hux-elevator-control`,無障礙名稱用 `sr-only` 內文提供,不要改回上述兩個屬性。
- **Codex 沙箱可能把有效的 GitHub CLI 登錄誤報為過期。** 2026-07-12 已做過
  鑑別實驗:同一份 macOS Keychain 憑證在 Codex 沙箱內執行 `gh auth status` 會顯示
  `The token in default is invalid`,但沙箱外執行同一命令及 `gh api user` 都成功,
  Claude Code 也正常。遇到這個訊息不要先 `gh auth logout/login`、撤銷 OAuth 或重建
  PAT;先申請沙箱外權限重跑 `gh auth status && gh api user --jq .login`。確認成功後,
  後續 `gh` 命令使用沙箱外執行;若仍無法使用,PR、Issue、CI、review 等 GitHub API
  操作可改走已安裝的 GitHub MCP,本機修改、commit、push 仍使用 Git/沙箱外 `gh`。
- Mermaid 圖表渲染需 headless Chromium,和 HarfBuzz 同理**不能在 Vercel build 跑**;
  渲染 offload 到 `yarn mermaid:render`(本機 / GitHub Action),產出的淺/深雙 SVG 快取
  commit 在 `public/mermaid/`;任何會跑渲染的新 workflow 記得
  `yarn playwright install --with-deps chromium`。
- **任何影響渲染輸出的改動**(升級 mermaid、改 `LIGHT_THEME`/`DARK_THEME`、改
  `normalizeSvg` 或 render 邏輯)都要 bump `scripts/mermaid-shared.mjs` 的 `CACHE_VERSION`,
  再重跑 `yarn mermaid:render` 後 commit。**這是唯一防線**:`mermaid-check` 改成結構檢查後
  (見下)不再比對 SVG 內容,只要 hash 沒變、檔案還在就綠燈 —— 忘了 bump,過時的 SVG 會
  悄悄留著、CI 抓不到。升級 mermaid 後另外**目視**確認幾張圖(結構檢查不會替你發現輸出跑掉)。
- `mermaid-check`(`.github/workflows/mermaid-check.yml`,job 名 `mermaid`)是**警告級
  非必過**檢查,不在 branch protection 的 required contexts;只警告不擋合併(快取沒對上
  時圖會暫時退化成程式碼區塊,不會壞站)。它跑的 `yarn mermaid:render --check` 是**純結構
  比對**(每個 mermaid fence 的內容 hash 是否都有對應 committed SVG、有無孤兒檔),**刻意
  不重新渲染**:mermaid 在不同平台(macOS 作者 vs Linux runner)的文字量測不同,byte 比對
  會跨平台永遠失敗(狼來了);hash 只由內容決定、跨平台一致。因此這個 job **不需要
  Chromium**,也很快。
- **mermaid fence 靜默退化成程式碼區塊**的排查順序(以下全都不報錯,是刻意的優雅降級,
  很容易誤當成渲染 bug):① 忘了 `yarn mermaid:render` + commit(`mermaid-check` 會警告,
  但非必過);② 本機 `.contentlayer/.cache` 卡著 render 前的 fallback HTML —— 刪掉
  `.contentlayer` 或 touch 該篇 `.md` 重建即可;③ fence 寫成 ` ```mermaid:標題 `(pliny
  code-title 語法)—— 渲染腳本 `node.lang === 'mermaid'` 嚴格比對,不吃 `:title` 後綴;
  ④ fence 不在 `data/blog/**`(例如作者頁 `data/authors/**`)—— 渲染腳本只掃 `data/blog`。
  遇到「圖沒出來」先照這四點查,不要直接當渲染 bug 追。
- 已知小瑕疵(可日後改進,非阻擋):兩個 `<img>` 沒帶 `width`/`height`,載入時有版面位移
  (CLS);非當前主題的那張帶 `loading="lazy"`,慢網路下切主題那一刻可能短暫空白。render
  時其實已算出 viewBox 尺寸,要修就存進 manifest 讓 rehype plugin 寫上 `width`/`height`、
  並拿掉隱藏變體的 `lazy`。另:單一 mermaid 語法錯誤會中止整個 `yarn mermaid:render`
  (fail-loud,但在全部渲染成功前不寫檔,不會寫壞既有快取)。

## Git 工作流程(2026-07-12 起)

- **改檔前與提交前都要確認本地基底沒有落後遠端** — 先跑 `git fetch origin main`,
  再用 `git rev-list --left-right --count main...origin/main` 確認右側(behind)為 `0`。
  若本地 `main` 落後,先同步到最新 `origin/main` 再開功能分支或繼續提交;不要從
  過期的本地 `main` 建分支,也不要等到 PR 被標成 `BEHIND` 才處理。工作樹已有修改時,
  先保全並釐清現有變更,不可為了同步而 reset、覆蓋或丟棄使用者內容。
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

## 通用工程守則

減少常見 LLM 寫程式失誤的行為準則。這些準則傾向謹慎而非速度;瑣碎任務可自行斟酌。

### 1. 動手前先想清楚

**不要假設、不要隱藏困惑、要把取捨攤開來。**

實作前:

- 明確說出你的假設;不確定就問。
- 存在多種解讀時,把它們列出來 — 不要默默選一個。
- 有更簡單的做法就直說;該反駁時要反駁。
- 有不清楚的地方就停下來,指名說出困惑點,發問。

### 2. 簡單優先

**用能解決問題的最少程式碼,不做任何投機性設計。**

- 不做超出需求的功能。
- 單次使用的程式碼不做抽象。
- 沒被要求的「彈性」「可配置性」一律不加。
- 不為不可能發生的情境寫錯誤處理。
- 寫了 200 行但 50 行能解決,就重寫。

自問:「資深工程師會不會說這太複雜?」會,就簡化。

### 3. 外科手術式修改

**只動必須動的地方;只清理自己製造的髒東西。**

改既有程式碼時:

- 不「順手改善」旁邊的程式碼、註解、格式。
- 沒壞的東西不重構。
- 遵循既有風格,即使你自己會用別種寫法。
- 發現無關的死程式碼,提出來就好 — 不要刪。

自己的改動產生孤兒時:

- 移除**因你的改動**而不再使用的 import/變數/函式。
- 原本就存在的死程式碼,沒被要求不要刪。

檢驗標準:每一行變更都要能直接對應到使用者的需求。

### 4. 目標導向執行

**先定義成功標準,再循環直到驗證通過。**

把任務轉成可驗證的目標:

- 「加驗證」→「先寫無效輸入的測試,再讓它們通過」
- 「修 bug」→「先寫能重現 bug 的測試,再讓它通過」
- 「重構 X」→「重構前後測試都要通過」

多步驟任務先列簡短計畫:

```
1. [步驟] → 驗證:[檢查方式]
2. [步驟] → 驗證:[檢查方式]
3. [步驟] → 驗證:[檢查方式]
```

強成功標準讓你能自主迭代;弱標準(「讓它能動」)會需要不斷回頭釐清。

**這些準則有效的跡象**:diff 裡不必要的變更變少、因過度複雜而重寫的情況變少、釐清問題發生在實作之前而不是犯錯之後。

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
