# CSS 常見陷阱

> **什麼時候該讀這份**:動到版面尺寸規則(高度、寬度、`aspect-ratio`、`min-*`/`max-*`)、
> 把視覺效果從 CSS 烘進圖檔,或排查「規則明明寫對了、算出來的值卻不是預期」時。
> 寫一般的樣式**不需要**讀。
>
> 這裡只放**踩過的坑**:每一條都附實測數字與最小重現條件。規則性的描述
> (斷點、token 命名、hero 模式)在 `AGENTS.md` 與
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

## 相關條目(仍在 `AGENTS.md`,尚未搬過來)

- **水平尺寸不要用 `vw` 量** —— `100vw` 含傳統捲軸寬,百分比 / auto margin 不含。
- **headless Chromium 一律 overlay 捲軸** —— 量不到「捲軸佔版面」才會出現的版面 bug,
  這類不變量的護欄放在 `tests/unit/css-viewport-width-contract.test.ts`。
- **Tailwind v4 色盤編譯後 `getComputedStyle` 會回傳 `lab()`** —— 顏色斷言一律走
  `tests/helpers/color.ts`。
- **全域 `scroll-behavior: smooth`** —— Playwright 捲動輔助要用 `behavior: 'instant'`
  蓋掉,再等兩輪 `requestAnimationFrame`。
- **Tailwind v4 會掃 `docs/` 底下的 markdown** —— 在 spec 裡提到一個 class name,它就會
  變成 production 的死 CSS。**這份文件也在掃描範圍內**:上面程式碼區塊裡的
  `.intro-header-archive` 是實作真的在用的 class,不會憑空產生新的死 CSS;但未來往這裡
  加「假想的」class name 前要先想到這件事。
