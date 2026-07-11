# myblog-nextjs 開發守則

Hux 主題部落格移植到 Next.js App Router 的版本(production:blog.allenspace.de,
Vercel 自動部署 `main`)。完整的功能與設定手冊在
`docs/functionality-settings-manual.zh-TW.md` — **動手前先讀相關章節**,大部分
「看起來像 bug」的行為(路由語意、CSP、OG 字體、PWA)都是有意為之且記錄在案。

## 指令與環境陷阱

- `yarn dev` / `yarn build` / `yarn serve` / `yarn lint`(帶 `--fix`)/
  `yarn test:unit` / `yarn test:parity`(Playwright,自動 build + serve 於 3012)
- **不要**同時跑 `yarn build` 和 `yarn dev`/`yarn test:parity` — 會在 `.next` 上競爭,
  產生無樣式頁面等假 bug。
- **永遠不要用 dev server 判斷互動行為**:冷路由第一次點擊會停 ~1.5 秒,是按需編譯
  不是 bug;production 導航只要 ~15ms。互動類驗證一律跑 production build。
- build 需要 HarfBuzz CLI(`hb-shape`/`hb-subset`,`brew install harfbuzz`)。
  對 HarfBuzz(或任何 CLI)傳非 ASCII 文字**一律用 `--text-file`/stdin,不要走 argv**
  — argv 會經過呼叫端 locale 的編碼轉換,在沒設 UTF-8 locale 的 shell(CI、
  非互動環境)會直接炸。

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
- 修改會影響手冊內容的行為時,同步更新 `docs/functionality-settings-manual.zh-TW.md`。
