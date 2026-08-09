# CSS 常見陷阱

> **什麼時候該讀這份**:動到版面尺寸規則(高度、寬度、`aspect-ratio`、`min-*`/`max-*`)、
> 文章容器斷點、顏色斷言、新增固定浮動控制項、把視覺效果從 CSS 烘進圖檔,或排查
> 「規則明明寫對了、算出來的值卻不是預期」時。寫一般的樣式**不需要**讀。
>
> 這裡只放**踩過的坑**:每一條都附實測數字與最小重現條件。規則性的描述
> (token 命名、hero 模式)在 `AGENTS.md` 與
> [`openwiki/architecture/overview.md`](../../openwiki/architecture/overview.md)。

---

## `min-height`/`max-height` 會透過 `aspect-ratio` 反向傳遞成寬度限制

**症狀**:給一個滿版區塊綁 `aspect-ratio` 再加高度上下限,結果**寬度**莫名其妙不滿版了 ——
寬視窗被截短、窄視窗反而溢出產生水平捲軸。

**機制**:CSS Sizing 4 的 *transferred size suggestion*。當一個軸的尺寸是 `auto` 而元素有
preferred aspect ratio 時,**另一軸的 `min`/`max` 會依比例換算後套到這一軸**。所以
`max-height` 實際上同時是一條 `max-width`,`min-height` 同時是一條 `min-width`。

2026-08-09 在 archive/series hero(`.intro-header-archive`)實測,底圖 1816×864
(比例 2.1019):

```css
/* 這樣寫,寬度會被高度綁架 */
.intro-header-archive {
  height: auto;
  aspect-ratio: 1816 / 864;
  min-height: 228px;   /* → 實際等於 min-width: 479px */
  max-height: 520px;   /* → 實際等於 max-width: 1093px */
}
```

| 視窗寬 | 期望 hero 寬 | 實際 hero 寬 | 後果 |
| --- | --- | --- | --- |
| 375px | 375 | **479** | 左右溢出,多一條水平捲軸 |
| 1280px | 1280 | **1093** | 滿版失效,右側露出頁面底色 |
| 1920px | 1920 | **1093** | 同上,更明顯 |

479 = 228 × 2.1019、1093 = 520 × 2.1019 —— 數字逐位對得上,不是巧合。

**解法**:讓被綁架的那一軸變成**明確值**,比例就只會單向推導。

```css
width: 100%;   /* 寬度確定後,ratio 只用來算高度,傳遞不會發生 */
```

用 `%` 不用 `100vw`:理由同 `AGENTS.md` 那條「水平尺寸不要用 `vw` 量」(`100vw` 含傳統
捲軸寬)。

**現況**:hero 最後**沒有**採用 `aspect-ratio` 方案 —— 改成與 `.intro-header-home` 共用
固定高度(270 / 418px),讓 About ↔ archive ↔ series ↔ 404 ↔ `/offline` 切換時不跳。
這條仍然記著,因為「綁底圖比例」是個很自然會再被想到的做法。

**怎麼自己驗**:量 `getBoundingClientRect().width` 跟 `documentElement.clientWidth` 比,
不要只看高度對不對。寬度被傳遞綁架時**不會有任何錯誤或警告**,規則照樣「生效」。

---

## 黑色半透明遮罩要烘進圖檔時,係數是 `1 - α`(sRGB 非線性空間)

CSS 的 `rgba(0, 0, 0, α)` 疊加**預設在 sRGB 非線性空間**做 source-over 合成,結果就是
每個通道 `c' = c × (1 - α)`。所以「把 `headerMask: 0.5` 烘進圖檔」等價於:

```bash
ffmpeg -i in.png -vf "colorchannelmixer=rr=0.5:gg=0.5:bb=0.5" out.png
```

**不要**先轉線性光再乘 —— 那會得到比瀏覽器實際畫出來更亮的結果。驗證方式是取同一座標的
像素比對:`0x3b`(59)× 0.5 = 29.5 → `0x1e`(30)。差 1 以內是 webp 有損編碼,差更多就是
色彩空間搞錯了。

烘進圖檔 vs. 留在 CSS 的取捨:烘進去少一層 DOM 元素、也讓壓暗後的圖壓縮得更小
(實測 q=90 的 1816×864 從 74 KB 掉到 30 KB),代價是**改遮罩要重新產生圖檔**,而且
社群卡片、OG 圖等其他消費者會一併吃到已經壓暗的版本。

---

## 版面與樣式的其他不變量

> 2026-08-09 從 `AGENTS.md` 搬入。上面兩節是深入解剖,這節是規則速查。

- **水平尺寸不要用 `vw` 量。** `100vw` 依規範包含傳統捲軸寬度,百分比 / auto margin /
  `left:right:0` 讀的 containing block 不含。macOS「顯示捲軸」預設「依滑鼠或觸控板自動
  決定」,**接上滑鼠就會全系統切成佔版面的傳統捲軸**,於是同一份程式碼時好時壞、
  Edge 與 Safari 都中、Playwright 測不出來。症狀是整組元素左偏半個捲軸寬、右側溢出同量
  (LTR 下左側溢出不產生捲軸,所以只看得到「多一條水平捲軸」)。`.hux-full-bleed` /
  `.hux-home-layout` / `.post-shell` 已於 2026-08-08 改掉;新增規則由 `tests/unit/css-viewport-width-contract.test.ts` 擋。
- **文章正文必須保留 Hux 的中間斷點行寬**(768 / 992 / 1200 四段)。**不能只留 1200px
  斷點**,否則平板與窄桌面會退化成 `viewport - 30px`。所有文章專用的 breakpoint selector
  (含 `≥1200px` grid)**都必須排除 `.about-shell`**(About 是獨立置中的 780px 窄欄)。
  斷點數值見 `openwiki/architecture/overview.md`;調整文章容器必須跑
  `tests/playwright/article-width.spec.ts`。
- **文章標題的 hash 落點必須保留 80px 上方空間**:`h1`–`h6` 的 `scroll-margin-top` 與
  SideCatalog observer 邊界要**一起**維持(否則向上跳轉會被導覽列蓋住、下個標題被誤判為
  active);catalog 回歸測試必須同時驗證向上與向下跳轉。
- **`.icon-bar { background: var(--navbar-fg) }` 目前只是媒體查詢位置湊巧安全。** `.is-fixed`
  的 token 重新賦值寫在 `min-width: 768px` 區塊內,而 `.navbar-toggle` 與 `.navbar-mobile`
  在那個斷點是 `display: none`。把這組 token 搬出媒體查詢的話,手機漢堡選單會在 fixed
  狀態悄悄變暗。
- **Tailwind v4 的色盤編譯後,Chromium 的 `getComputedStyle` 會回傳 `lab()`。** 任何顏色斷言
  都要走 `tests/helpers/color.ts`(支援 hex / rgb / rgba / oklch / lab,其餘一律拋錯)。用
  數字 regex 讀顏色字串會同時誤判 `oklch()` 與 `lab()`,而且是靜默算錯,不會報錯。
- **站台設了全域 `scroll-behavior: smooth`。** Playwright 的捲動輔助函式必須用
  `behavior: 'instant'` 蓋掉它,再等兩輪 `requestAnimationFrame`,否則會同時被 easing 動畫
  與 `Header.tsx` 的 scroll 監聽器捲進競態 —— 症狀是測試靜默量到頂部狀態,而不是報錯。
- **`Header.tsx` 只在 `scrollY` 恰好等於 `0` 時才移除 `is-fixed`。** 想測「捲回接近頂端」
  狀態的測試要用一個小的非零 offset,並把 class 與 `scrollY` 都當前置斷言驗證。
- **Tailwind v4 會掃 `docs/` 底下的 markdown。** `css/tailwind.css` 只有 `@import 'tailwindcss'`
  加一條 `@source '../node_modules/pliny'`,沒有限制掃描範圍,所以 v4 的預設行為(從專案根
  目錄掃所有 git 追蹤的檔案)會把設計文件也算進去。**在 spec 裡「提到」一個 class name,
  它就會變成 production 的死 CSS。** 2026-08-01 實測:`edc01cb` 的 bundle 裡有
  `.bg-\[var\(--hux-interactive\)\]`,但該 commit 的程式碼沒有這個 class、連
  `--hux-interactive` 都還不存在 —— 來源是 PR #67 一起合併的 spec 裡的一行 markdown 表格。
  因此**不要用「CSS bundle 裡有沒有某個 token」判斷 production 跑的是哪個 commit**(這次
  就差點誤判成已部署);要用只有實作才會產生的東西:手寫的 custom property(`--hero-fg`)、
  語意 class(`.navbar-tool-trigger`),或直接比對 `/_next/static/chunks/*.css` 的 hash。

- **固定浮動控制項要避開內容阻擋器的通用 selector**:實測 AdGuard 啟用的
  Fanboy's Annoyances 同時以 `##.back-top` 與 `##[aria-label="Back to top"]` 隱藏返回頂部
  按鈕,造成 Safari、Discord WebView 與部分主畫面 Web App 消失,而 LINE WebView 仍
  正常。排查時用 Safari 無痕模式、單站關閉內容阻擋器,再逐組停用 filter
  做鑑別;AdGuard iOS 沒有 filtering log。站內控制項保留專屬中性 class
  `.hux-elevator-control`,無障礙名稱用 `sr-only` 內文提供,不要改回上述兩個屬性。

**注意:這份文件本身也在 Tailwind 的掃描範圍內。** 上面程式碼區塊裡的
`.intro-header-archive` 是實作真的在用的 class,不會憑空產生新的死 CSS;但未來往這裡
加「假想的」class name 前要先想到這件事。

---

## 相關條目(在別的文件)

- **headless Chromium 一律是 overlay 捲軸** —— 量不到「捲軸佔版面」才會出現的版面 bug。
  搬到 [`verification-environment.md`](verification-environment.md),因為它是量測環境的
  性質,不是 CSS 的性質。這類不變量的護欄放在
  `tests/unit/css-viewport-width-contract.test.ts`。
