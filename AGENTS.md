# myblog-nextjs 開發守則

Hux 主題部落格移植到 Next.js App Router 的版本(production:blog.allenspace.de,
Vercel 自動部署 `main`)。完整的功能與設定手冊在
`docs/functionality-settings-manual.zh-TW.md` — **動手前先讀相關章節**,大部分
「看起來像 bug」的行為(路由語意、CSP、OG 字體、PWA)都是有意為之且記錄在案。

## 這份文件的定位與維護規則

這個 repo 有**兩個 LLM wiki 和兩個 schema**:

| | schema(人工維護,不可重生成) | wiki(衍生知識) | 誰在寫 |
| --- | --- | --- | --- |
| 功能 / 機制 | `openwiki/INSTRUCTIONS.md` | `openwiki/*.md` | `openwiki code --update` |
| 教訓 / 坑 | **本章節** | `docs/lessons/*.md` | 每個 session 的 agent |

**本檔是 schema 層,不是 wiki**:放操作規則與往兩個 wiki 的路由,不放衍生知識。
**教訓 ≠ 規則** —— 規則通常是教訓的結論:案例本體留在 wiki,萃取出的祈使句升上 schema。

關鍵不對稱:`openwiki/` 寫壞了下次 `--update` 會重寫,**`docs/lessons/` 沒有生成器、
不可重生成**,寫壞了沒有東西會回來修。所以判準刻意設計成**可從文字表面判斷**。

### 得到新教訓時,依序問三個問題

**問 0 — 已經有機器擋住了嗎?**(測試、CI、lint、型別、腳本的失敗訊息)
**有就兩邊都不寫** —— 重複「測試已經會說的事」是純成本。

**問 1 — 這條是「怎麼操作」,還是「發生過什麼」?**
含實測數字、日期、案例敘事、機制解釋 → **wiki 內容** → `docs/lessons/<subsystem>.md`。
純祈使句、拿掉所有案例仍然成立 → **schema** → 留在本檔。
一條規則只要寫得出「2026-08-08 實測…」,它幾乎必然是 wiki 內容。
**例外:一行以內的內嵌舉例不搬。** 它們讓祈使句可操作(「最便宜的實驗」很模糊,
「⌘K 繞過漢堡直開 kbar,30 秒否證」不模糊),搬走只省幾十 bytes 卻讓規則變鈍,
還多一次跳轉。要搬的是**成段的敘事**,不是括號裡的舉例。

**問 2 —(邊界情形)不知道這條的 agent,會在打開任何相關檔案之前就犯錯嗎?**
會 → 留在本檔(**沒有觸發點可掛**,agent 不會知道自己需要查它)。
不會、一定要先動到某個子系統 → `docs/lessons/`(**子系統名稱就是觸發點**)。
**這問的是「可路由性」不是「重要性」**:「重不重要?」永遠答「重要」,那樣什麼都會留下
—— 那正是本檔一度長到 422 行的成因。

### 什麼時候兩邊都不寫

- 還沒做過**鑑別實驗**的假設,不管它多能解釋症狀(見除錯守則第 1 條)。
- 可以從 source 推導出來的東西 —— 那是 `openwiki/` 的範圍,讓它生成。

### 搬出去時,pointer 的三個必要成分

1. **祈使句**,不是「詳見」:明確命令在對應場景**先讀完再動手**。
2. **觸發條件**:具體到檔案路徑或情境,不是主題名稱。
3. **反向邊界**:明寫「什麼時候不必讀」。少了它,agent 會保險起見每次都讀,等於沒搬。

沒寫觸發條件的 pointer 等於刪除 —— 沒有 inbound link 的文件被翻到的機率不到 10%。

**搬完一定要檢查指涉**:原文的「上述」「下節」「見下」「同上」,指涉對象很可能跟著被搬走。
逐行比對「移除的行有沒有出現在別處」**在結構上看不到這種缺陷** —— 兩邊的行都在,只是不再
指到彼此。2026-08-09 那次搬遷連續踩到兩處。

### 護欄

`tests/unit/agents-md-contract.test.ts`(在必過的 `ci` 裡)守:本檔 ≤ 24 KiB、每個
`docs/lessons/*.md` 都有 inbound link、本檔連出的路徑都存在。**預算滿了不要調高上限**
—— 上限就是強迫分流的機制。**也不要用 `@path` import 或新增巢狀 `AGENTS.md` 繞過** ——
那些一樣進每個 session 的 context,只是護欄量不到(前者 30 bytes 就能換進 5 KB)。


## 指令與環境陷阱

- 指令清單與 `yarn build` 的階段順序見 `openwiki/operations/runbook.md`。
- **`next-env.d.ts` 會在 dev/build 交替後反覆翻動**(typed routes 產出位置分家,誰最後跑
  誰贏)。這不是任何人的改動:**不用調查、不要 checkout 還原、commit 時一律排除**(用明確的
  `git add <檔案清單>`)。**也不能 gitignore** —— CI 乾淨 checkout 直接跑 `tsc --noEmit`,
  沒這檔案全專案 CSS/圖片 import 的型別會炸。
- `next/og` 的 `ImageResponse` 只支援 CSS 子集;全版 absolute overlay **不要用
  `inset: 0` shorthand** — Satori 的 inline-style layout 不會把它展開,元素會沒有面積而
  靜默消失。要明寫 `top`/`right`/`bottom`/`left: 0`,並用實際渲染 PNG 的像素測試驗證;
  只測傳入 opacity 數值抓不到這類 renderer 相容性問題。
- **Chiron 站字型的管線陷阱與不變量在
  [`docs/lessons/chiron-font.md`](docs/lessons/chiron-font.md)。**
  動到字型 seed、`scripts/site-font-*.mjs`、`font-data/chiron/` 的產物,或 `check:site-font`
  因文章預算失敗之前**先讀它**。九條,含成本模型(碰幾個桶遠比用幾個字重要)與
  `--rebalance` 的一次性代價。**單純寫文章不必讀** —— 預算由必過的 `check` job 強制。
- **不要用 dev server 判斷互動行為或量任何數字**;互動類驗證一律跑 production build。
  dev 與 build 可並行,但 lockfile 會擋同類重複程序 —— **不要為了繞過它硬啟第二個同類程序**。
- **量測與互動驗證的環境陷阱在
  [`docs/lessons/verification-environment.md`](docs/lessons/verification-environment.md)。**
  跑 `yarn dev` / `next start` / Playwright、量版面幾何,或 Codex 沙箱裡 build 像是卡住、
  `gh auth status` 說憑證過期時**先讀它**。六條的共同性質是**錯了會給出看似正常的結果,
  而不是報錯** —— 包含兩條「沙箱在說謊」。**只讀原始碼、不跑東西時不必讀。**
- **`BLOG_PUBLICATION_MODE` 只管 contentlayer 衍生產物**(`app/tag-data.json`、
  `public/search.json`),**不管路由**——文章頁、`/opengraph-image`、`/blog/...` 別名
  各自讀 `NODE_ENV === 'development'`,完全不讀這個變數。`yarn dev` 與 `yarn build`
  下兩者剛好一致(前者都是 preview,後者都是 production),差異平時看不出來;**不要在
  這兩個入口以外手動設它**——例如在 Vercel Preview Deployment 手動設 `preview`:
  `next build` 仍強制 `NODE_ENV=production`,頁面/OG/別名照樣 404,但 draft 的標題與
  標籤會悄悄寫進這兩個產物,比兩種模式單獨出錯更糟。未設 = production(fail-closed ——
  漏設環境變數不能讓 draft 外洩);非 `production`/`preview` 的值會讓
  `yarn contentlayer2 build` 直接失敗。行為細節見
  `docs/functionality-settings-manual.zh-TW.md` 的「草稿 vs. 隱藏」。
- 乾淨 checkout(CI runner、新 clone)單獨跑 `tsc --noEmit` 或其他型別檢查前,**必須先跑
  `yarn contentlayer2 build`**,否則會炸一片 `TS2307: Cannot find module 'contentlayer/generated'`。
- **擴充 i18n 時,語系間不變的視覺外殼要放在共同 layout**(現況:Hero 由 `app/(about)/`
  route group 的 `layout.tsx` 持有)。重複放回各語系 page 會因 page segment 切換重掛載背景
  圖層,iPhone 上即使離線且圖片已快取仍會閃底色;語系特有內容才留在 page。
- Next 16 已移除 `next lint`。core-web-vitals 規則必須從 `eslint-config-next/core-web-vitals`
  的 flat config 匯入,**不要改回 FlatCompat 的 legacy `next` extends**。
- Serwist 的 service worker 由 `app/serwist/[path]/route.ts` 產生。`app/sw.ts` 因 webworker
  型別排除於主 tsconfig/ESLint,但**該 route handler 是一般 app 程式碼,不得排除**。
- **固定浮動控制項要用專屬中性 class**(現況 `.hux-elevator-control`),無障礙名稱用
  `sr-only` 內文提供。**不要用 `.back-top` 或 `aria-label="Back to top"`** —— 內容阻擋器
  的通用 selector 認得它們,會讓按鈕在部分瀏覽器與 WebView 整個消失。
- **Mermaid 管線的環境陷阱與不變量在
  [`docs/lessons/mermaid-pipeline.md`](docs/lessons/mermaid-pipeline.md)。**
  動到 `scripts/mermaid-*.mjs`、`lib/rehype-mermaid.mjs`、`public/mermaid/` 的產物、
  mermaid 測試,或排查「圖沒出來 / 圖跑掉」之前**先讀它**。裡面有六個會靜默失敗的坑
  (`mermaid-check` 只比對檔名、`.contentlayer` 快取、Playwright 的 service worker
  預設值等),每一個都是實際踩過才寫下來的。**單純在文章裡寫 mermaid fence 不必讀** ——
  該擋的都有測試機器強制。
- **CSS 的版面尺寸陷阱與樣式不變量在
  [`docs/lessons/css-pitfalls.md`](docs/lessons/css-pitfalls.md)。**
  動到高度/寬度規則、`aspect-ratio`、`min-*`/`max-*`、文章容器斷點、顏色斷言、**新增固定
  浮動控制項**,或把視覺效果從 CSS 烘進圖檔之前**先讀它**。三則深入解剖加八條速查規則
  (`vw` 不可用於水平尺寸、Hux 的四段行寬、`lab()` 顏色、全域 `scroll-behavior` 等)。
  **寫一般樣式不必讀。**
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
  - **必過檢查不能有條件跳過。** 用 `paths:` 過濾的 workflow 條件不符時根本不會觸發,
    就永遠不會回報狀態,PR 會卡死在 pending。**要嘛每次都跑,要嘛就不能設為必過。**
  - 這兩個都**只是 PR 合併閘門**,不影響 Vercel 部署節奏 — Vercel 仍照自己的
    邏輯部署 `main` 的每個 commit。
- **發現合併後 production 沒動時,直接補觸發,不要排查專案設定。** 這是偶發的 webhook
  掉包,**不必每次合併都主動確認**。補法:Vercel dashboard → Deployments → **Create
  Deployment** 選 `main`(**不要**用舊部署的 Redeploy,那會重建舊 commit)。
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
  - **一次開多個 PR 時,排隊的會卡在 `BEHIND` 動不了**(必過檢查設了 `strict: true`,
    repo 沒開 `allow_update_branch`)。目前選擇**不處理** —— 等 Mend 下一輪 rebase 會自己
    解開。遇到「PR 一直不合併但檢查都綠燈」先查
    `gh pr view <N> --json mergeStateStatus`,不用重新從頭診斷。
  - **不要走回自架 `renovatebot/github-action`** —— 2026-07-12 已改用官方 App 並移除自架版。
  - 第三方 action(非 `actions/*`、`github/*`)一律釘 commit SHA,版本號用註解
    (供應鏈安全慣例;`sha_pinning_required` 目前是 false,不代表可以省略)。
- **`openwiki --init` / `--update` 每次執行都會重跑 repo setup,有兩件事不要試圖手動修正**:
  它把同一段 OpenWiki 區塊同時寫進 `AGENTS.md` 與 `CLAUDE.md`(**絕對不要整個刪掉
  `CLAUDE.md`** —— 檔案不存在時它會新建一個只含該區塊的檔),並無條件覆寫
  `.github/workflows/openwiki-update.yml`(已列入 `.gitignore`)。
  **`openwiki/INSTRUCTIONS.md` 是唯一該由人手動維護的 OpenWiki 檔案** —— 生成內容跑偏要在
  那裡加約束,不要去改 `openwiki/` 底下的生成頁。
- **跑在你控制之外的流程,其案例與機制在
  [`docs/lessons/deploy-and-automation.md`](docs/lessons/deploy-and-automation.md)。**
  合併後 production 沒動、Renovate PR 全綠卻不合併、要動必過檢查的觸發條件,或要跑
  `openwiki --update` 之前**先讀它**。**平常開 PR、合併不必讀。**

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

7. **新斷言一律做突變測試。** 寫完斷言後,**刻意把它宣稱要防的那個東西弄壞,確認它真的
   變紅**;抓不到就代表斷言在測一個不可能成立的狀態,是空包彈。**CSS 斷言尤其容易寫成
   空包彈**:比對絕對值容易在重構時誤綠,要斷言的是「跟參照元素相同/不同」這種關係。
   寫「掃原始碼/AST 找某個字串」這類斷言前,先問:**有沒有一種改法保留了這個字串,
   卻讓它不再生效?**

8. **突變測試證明不了涵蓋面 —— 那是另一條正交的失效軸。** 它的取樣母體就是既有斷言,
   在結構上看不見母體之外的東西。**動共用基底規則時,先列出全部呼叫點再改**,不要指望
   測試網撈到 —— 這類重構的受害者依定義就是「還沒被收編進 variant 的舊呼叫點」。

9. **突變鷹架本身也要先驗證會生效,再相信它的紅綠。** 跨多次導覽的樣式突變要用
   `page.addInitScript` 注入(每次導覽都跑,繞開 HTTP 快取),並先用探針確認突變在
   **每一個**受測條件下都真的套用了。

   以上三條背後的六次實際踩坑(空包彈的四種長相、涵蓋面失效的實例、鷹架自身失效)在
   [`docs/lessons/test-assertions.md`](docs/lessons/test-assertions.md) ——
   **寫新的 CSS / 版面類斷言之前先讀它**。改實作、跑既有測試不必讀。

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
3. **新教訓落地**:這次除錯或實作有沒有得到新教訓(環境陷阱、架構決策、驗證方式)?
   有就跑「這份文件的定位與維護規則」的三問決定去處 —— **答案可能是「哪裡都不寫」**。
   教訓不落地,下一個 session 就會重付學費;但落錯層,這個檔案會再長回 400 行。若寫進
   本檔後 `test:unit` 因預算失敗,那不是叫你調高上限,是叫你搬一組出去。
4. **OpenWiki wiki**:這次改動有沒有讓 `openwiki/` 的描述過時?**先 commit 你的變更,
   再**無頭跑 `openwiki code --update --print`,把 wiki 的更新併進同一個 PR。**順序不能
   顛倒** —— noop 判斷要求乾淨工作樹,工作樹髒的話它一律做完整(付費)重生成;反之若
   自上次更新後只有 `openwiki/` 路徑異動,會自動 skip、零模型呼叫。首次需在互動終端
   登入(憑證存 `~/.openwiki/.env`;`openai-chatgpt` 的守門 key 是
   `OPENAI_CHATGPT_ACCESS_TOKEN`,**不是** `OPENAI_API_KEY`)。

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
