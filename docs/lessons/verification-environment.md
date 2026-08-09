# 驗證環境:量測之前必須確認的事

> **什麼時候該讀這份**:要跑 Playwright、量版面幾何,或用瀏覽器判斷互動行為之前。
> **改一般程式碼不必讀。**
>
> 這幾條的共同性質是**錯了會給出全綠的假結果,而不是報錯** —— 這也是它們值得一份
> 獨立文件的唯一理由。2026-08-08 有一次 96 組量測全部打在別的分支上,仍然「乾淨地」
> 全綠。
>
> 從 `AGENTS.md` 搬出來(2026-08-09)。`AGENTS.md` 是 schema 層,這份是教訓層。

- Next 16 的 dev 與 build 可並行,但 lockfile 會擋同類重複程序。**不要為了繞過 lockfile
  硬啟第二個同類程序**;互動驗證一律用 production build。
- **永遠不要用 dev server 判斷互動行為**:冷路由第一次點擊會停 ~1.5 秒,是按需編譯
  不是 bug;production 導航只要 ~15ms。互動類驗證一律跑 production build。
- **驗證前先確認 port 上的伺服器真的是自己那一份。** 2026-08-08 實測:本機另一個 worktree
  (`/private/tmp/myblog-nextjs-unified-accent/`)佔著 3012,`next start` 靜默吃到
  `EADDRINUSE` 退出,而 `curl` 照樣回 200 —— 96 組量測全部打在別人的分支上,還「乾淨地」
  給出全綠。**`playwright.config.ts` 預設 port 3012 且 `reuseExistingServer: true`,會放大
  這個坑**。查法:`lsof -nP -iTCP:<port> -sTCP:LISTEN` 看 PID 的執行路徑,或直接抓
  `/_next/static/chunks/*.css` 比對本次改動的字串。多 worktree 並行時一律用
  `PLAYWRIGHT_BASE_URL` 明確指向自己的 port,不要依賴預設值。
- **headless Chromium 一律是 overlay 捲軸,量不到「捲軸佔版面」才會出現的版面 bug。**
  2026-08-08 實測 `innerWidth - clientWidth`:headless(含
  `--disable-features=OverlayScrollbar,FluentOverlayScrollbar`)一律 `0`,只有
  `headless: false` 給 `15`。`html::-webkit-scrollbar { width: 15px }` 這個常見手法在
  headless 下**完全無效**。因此 `100vw`(含捲軸寬)與 `clientWidth`(不含)的落差類
  bug,既有 `tests/playwright/*` 在結構上不可能重現 —— 2026-07-10 那次修 full-bleed 溢出
  跑遍 6 種寬度兩種引擎仍漏掉,就是這個原因。這類不變量的護欄要放在 `test:unit`
  (見 `tests/unit/css-viewport-width-contract.test.ts`);需要實測時用 headed Chromium。
