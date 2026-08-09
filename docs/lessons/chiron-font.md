# Chiron 站字型:管線陷阱與不變量

> **什麼時候該讀這份**:動到字型 seed、`scripts/site-font-*.mjs`、`font-data/chiron/`
> 的產物,或 `check:site-font` 因文章預算失敗時。**單純寫文章不必讀** —— 預算由必過的
> `check` job 強制,超標時失敗訊息會直接指出是哪一頁。
>
> 從 `AGENTS.md` 搬出來(2026-08-09)。`AGENTS.md` 是 schema 層(操作規則),這份是
> **教訓層**:實測數字、日期與機制。pipeline 怎麼運作、CI/Vercel 差異與所需 CLI 完整
> 清單在 [`openwiki/operations/runbook.md`](../../openwiki/operations/runbook.md) ——
> 那份從 source 生成、可重生成,這份不行。

## 產物與分派

- **Chiron 站字型的產物必須整組一起 commit**(`public/static/fonts/chiron/*.woff2`、manifest、
  `css/chiron-font.generated.css`、`font-data/chiron/{core-codepoints.txt,
  supplemental-assignments.json,assignment-epoch.txt}`),**不要手改 generated CSS/manifest**。
  既有 code point 不得被普通更新重排、core 不得縮減;產物過期時跑 `yarn update:site-font`
  (只有刻意擴張 core 才加 `--rebuild-core`)。pipeline 細節、CI/Vercel 差異與所需 CLI 見
  `openwiki/operations/runbook.md`。

## 預算與分桶

- **字型預算的成本模型是「每頁碰到的桶整包下載」**(`bytes = core + Σ碰到的桶`、
  `requests = 1 + 碰到的桶數`)。所以**碰幾個桶**遠比用了幾個字重要:實測過一篇文章
  只為了 33 個既有字元就多付 4 個桶、256KB。診斷預算超標時**先看每頁碰桶數**,
  不要先看 bucket 大小 —— 「某個 bucket 太胖」通常是症狀不是根因。
- **往既有文章加字前先量碰桶數,出界就改用詞,不要動 `--rebalance`。** `check:site-font`
  讀的是整份原始 markdown、**不剝 code fence**,所以連 mermaid 標籤裡的中文都算進該頁預算。
  查法:比對 `font-data/chiron/supplemental-assignments.json`(key 是大寫 hex code point、
  value 是 bucket 編號)與 `font-data/chiron/core-codepoints.txt`,確認新字都落在該頁已經
  碰到的桶或 core 裡。2026-07-25 實測:OpenWiki 那篇本來就卡在 3 requests / 532,448 bytes
  (上限 3 / 550,000),補一張 mermaid 圖只因為 `貌`(未分派)和 `忙`(bucket 2)兩個字就變成
  4 requests / 601,968 bytes;換掉那兩個詞後 footprint 一個 byte 都沒變,零產物重生成。
- **`yarn update:site-font --rebalance` 是刻意的一次性重排**,會改派既有 code point、
  遞增 `font-data/chiron/assignment-epoch.txt`,並讓所有讀者的字型快取失效。只在
  `check:site-font` 因文章預算失敗、且確認不是單純 corpus 過期時才用。CI 的
  `validateAssignmentHistory` 只在 epoch 未變時比對;epoch 遞增時改由
  `validateRebalancedAssignments` 要求分派**逐字等於確定性重排的產物**(重算約 1 秒),
  所以單獨手動 bump epoch 現在會直接失敗,不再是讓歷史保護靜默失效的後門。漏傳
  `--base-epoch` 也一律退回比對(fail-closed),不會因為少一個旗標就跳過。
  重排若新增了 fixed UI seed 字元,要同時加 `--rebuild-core`(seed 必須在 core)。

## 驗證

- **動到字型 seed 或產物後,本機一定要跑 `yarn check:site-font --full`**。不帶 `--full` 會
  略過 glyph shaping、cmap 與 axis 驗證,而 CI 的必過 `check` job 跑的正是 `--full`
  —— 2026-07-25 就因此讓 `.notdef` 一路過關到 CI 才爆。
- **seed 只能列來源字型真的有字形的字元**。seed 一律進 core,`--full` 會對 core 做 shaping,
  字型沒有的字元會變成 `.notdef` 直接讓必過檢查失敗。要確認某字元有沒有字形:
  `hb-info --list-unicodes <來源 TTF>`(來源快取在 `$TMPDIR/chiron-site-font/<sha256>.ttf`,
  由 `ensureSourceFont` 下載)。
- **`check:site-font` 只讀 markdown,看不到「渲染才出現」的字元**。元件寫死的符號
  (HuxPager 的 `←`、返回頂部的 `↑`、SideCatalog 的 `−`/`+`)不在任何 markdown 裡,
  必須明列在 `scripts/site-font-text.mjs` 的 `SHARED_UI_TEXT`。漏掉時靜態檢查照樣綠燈,
  只有 `tests/playwright/site-font-loading.spec.ts` 的 production 量測抓得到 —— 該測試
  **必須涵蓋全部 production-reachable 文章**(draft 的 404 由
  `tests/playwright/publication-policy.spec.ts` 負責),原則仍是不可抽測,只是「全部」
  現在排除掉本來就進不去 production 的頁面。
- **判斷「要不要 seed」看的是字型鏈,不是字元有沒有出現在 DOM。** 2026-07-25 實測:KaTeX 的
  輸出字元(`\times` → `×`、減號 → U+2212、`≈` 等)雖然出現在 DOM,但 `.katex-html` 與
  MathML 都自訂 `font-family`(`KaTeX_Main` / `math`),**Chiron 不在它們的字型鏈上**,
  所以完全不會觸發 Chiron 子集下載,不需要也不該 seed。用瀏覽器的 `getComputedStyle`
  確認實際 font-family,不要從「這個字元在頁面上」推論它會造成字型請求。

## 相關:非 ASCII 傳給 CLI

- 對 HarfBuzz(或任何 CLI)傳非 ASCII 文字**一律用 `--text-file`/stdin,不要走 argv**
  — argv 會經過呼叫端 locale 的編碼轉換,在沒設 UTF-8 locale 的 shell(CI、
  非互動環境)會直接炸。build 所需的 HarfBuzz/woff2 CLI 完整清單見
  `openwiki/operations/runbook.md`(手寫清單曾漏掉 `hb-info`)。
