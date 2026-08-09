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

## Codex 沙箱會給出兩種假訊號

以下兩條只在 Codex 沙箱內成立,Claude Code 與沙箱外都正常。共同結論是**不要把沙箱的
回報當成真相**,先申請提升權限在沙箱外重跑同一個命令做鑑別。

- **Codex 沙箱內的 Next 16 production build 可能假性卡住。** 2026-07-17 做過同碼鑑別:
  沙箱內 `yarn build` 停在 `Creating an optimized production build ...` 超過數分鐘且沒有
  新輸出;終止後以提升權限在沙箱外重跑,同一份程式碼約 4 秒完成 Turbopack compile、
  約 15 秒完成整個 build。遇到明顯超過平常約 120 秒的情況,先確認沒有第二個 build、
  lockfile 或真實編譯錯誤;若都沒有,不要把它診斷成 Next 16 效能退化,直接申請提升權限
  重跑 `yarn build`。production server 綁定 `127.0.0.1:3012` 若回 `listen EPERM` 也用
  同一方式在沙箱外啟動;驗證完成後必須關閉該程序。

- **Codex 沙箱可能把有效的 GitHub CLI 登錄誤報為過期。** 2026-07-12 已做過
  鑑別實驗:同一份 macOS Keychain 憑證在 Codex 沙箱內執行 `gh auth status` 會顯示
  `The token in default is invalid`,但沙箱外執行同一命令及 `gh api user` 都成功,
  Claude Code 也正常。遇到這個訊息不要先 `gh auth logout/login`、撤銷 OAuth 或重建
  PAT;先申請沙箱外權限重跑 `gh auth status && gh api user --jq .login`。確認成功後,
  後續 `gh` 命令使用沙箱外執行;若仍無法使用,PR、Issue、CI、review 等 GitHub API
  操作可改走已安裝的 GitHub MCP,本機修改、commit、push 仍使用 Git/沙箱外 `gh`。
