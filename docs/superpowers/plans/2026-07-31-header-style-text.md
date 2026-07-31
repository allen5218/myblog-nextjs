# 文章純文字 hero(`headerStyle: text`)實作計畫(PR2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓文章 frontmatter 支援 `headerStyle: text`(無底圖、無漸層、無遮罩,標題落在頁面底色
上),並消除 14 個編碼「hero 背景永遠是深色」這個即將失效假設的色值常數。

**Architecture:** 三層。`lib/hero-config.ts` 是唯一做 coercion 的地方(raw frontmatter →
parsed domain object)並提供 build-time validator;`lib/hero-mode.ts` 把 parsed config 解析成
discriminated union `HeroSurface`;`components/hux/HuxHero.tsx` 只依 union 渲染。顏色由
`.intro-header` / `.navbar-custom` 上的 CSS 變數承載,text 模式只是重新賦值;導覽列 tone 用
`:has()` 做反向 DOM 查詢(`<Header/>` 與 `<main>` 是兄弟節點,React 無 prop 路徑)。

**Tech Stack:** Next.js 16 App Router、contentlayer2 0.5.8、Tailwind CSS v4、vitest(unit,
含 `renderToStaticMarkup`)、Playwright(parity,非 CI gate)。

**規範來源:** `docs/superpowers/specs/2026-07-30-header-style-text-design.md`

## Global Constraints

- 語言:程式碼註解與文件用**繁體中文**;commit message 用**英文** conventional 格式,結尾
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
- **`next-env.d.ts` 一律排除在 commit 外**,永遠用明確的 `git add <檔案清單>`,**不得用
  `git add -A` 或 `git add .`**。
- **不得執行任何帶 `--fix` 的 lint**(含 `yarn lint`,它內建 `--fix`)。只用 `yarn eslint <paths>`。
- 每個 commit 都必須是**綠色可部署**狀態(Vercel 部署 main 的每個 commit)。
- 必過 CI 只跑:`yarn contentlayer2 build`、`yarn eslint app components lib layouts scripts`、
  `yarn tsc --noEmit`、`yarn test:unit`。**Playwright 不是 gate**,出貨前手動跑 `yarn test:parity`。
- 互動驗證**一律用 production build**,不得用 dev server。production server 綁 `127.0.0.1:3012`,
  **驗證完必須關閉該程序**。用下面的標準流程,不要自己臨場拼指令。

### 啟動與關閉 production server(標準流程)

**啟動**(build 必須先在**前景**跑完 —— zsh 的 `A && B &` 會把整個 AND-list 背景化,
造成它與 Playwright 的 `webServer` 並行 build 而撞 lockfile):

```bash
yarn build
```

```bash
yarn serve -H 127.0.0.1 -p 3012 > /tmp/blog-server.log 2>&1 &
echo $! > /tmp/blog-server.pid
for _ in $(seq 1 90); do
  kill -0 "$(cat /tmp/blog-server.pid)" 2>/dev/null || { echo "SERVER DIED"; tail -30 /tmp/blog-server.log; exit 1; }
  curl -sf -o /dev/null http://127.0.0.1:3012/ && { echo "ready (pid $(cat /tmp/blog-server.pid))"; exit 0; }
  sleep 1
done
echo "TIMEOUT after 90s"; tail -30 /tmp/blog-server.log; exit 1
```

**關閉**:

```bash
kill "$(cat /tmp/blog-server.pid)" 2>/dev/null; rm -f /tmp/blog-server.pid
sleep 1; lsof -ti:3012 || echo "port 3012 free"
```

> 三個細節都是必要的:① 迴圈有 **90 秒上限**,啟動失敗時不會永遠等下去;
> ② 每輪先 `kill -0` 確認程序還活著,server 一崩就立刻印 log 收工,而不是空轉到 timeout;
> ③ 關閉用**自己記下的 PID**,不是 `kill $(lsof -ti:3012)` —— 後者會誤殺任何剛好占用該埠的
> 程序(例如另一個 session 的 dev server)。PID 寫檔是因為 shell 變數**不跨 Bash 呼叫保存**。

- `vitest` 只收 `tests/unit/**/*.test.ts`。單元測試風格:
  `import { describe, expect, test } from 'vitest'`,相對路徑 import,工廠函式建 fixture。
- **所有新 CSS 規則必須留在未分層區**(不得放進 `@layer`)。未分層作者樣式贏過任何 `@layer`
  內規則,與 specificity 無關 —— 但**只適用於 normal declaration**,`!important` 會反轉。
- **`.navbar-tools button` / `.navbar-tools svg` 這類包含式 selector 會命中 HeadlessUI popup
  內部元素**(選單行內渲染於 `.navbar-tools` 子樹)。新 token 的 consumer 一律**正面列舉**。
- 對比門檻:文字 **4.5**(WCAG 1.4.3)、非文字/邊界 **3:1**(WCAG 1.4.11)。
- **不得在手冊或 README 寫「全站符合 WCAG」** —— 全域 focus outline 仍是 2.31,屬另案。
- fixture 內容**全 ASCII**,避免新增 Chiron 字型 bucket。

---

## File Structure

| 檔案                                                                          | 責任                                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/helpers/color.ts`(新增)                                                | **唯一**的顏色 parser / compositor / 對比計算。支援 `#hex`、`rgb()`、`rgba()`、`oklch()`,其餘格式**明確拋錯**                        |
| `tests/unit/color.test.ts`(新增)                                              | 上者的 golden tests(**必須在 `tests/unit/`** 才會被必過的 `ci` job 執行)                                                             |
| `lib/hero-config.ts`(新增)                                                    | `parseHeaderStyle()`、`parseHeroConfiguration()`(唯一 coercion 點)、`validateHeroConfiguration()`、`assertValidHeroConfigurations()` |
| `lib/hero-mode.ts`(新增)                                                      | `resolveHeroSurface()`:parsed config → `HeroSurface` discriminated union                                                             |
| `components/hux/HuxHero.tsx`(修改)                                            | 改用 `resolveHeroSurface`;text 模式**不產生 inline `style`**、不渲染遮罩;加 `intro-header-text`                                      |
| `layouts/PostLayout.tsx`(修改)                                                | 多解一個 `headerStyle` 並傳給 `HuxHero`                                                                                              |
| `components/ThemeSwitch.tsx` / `SearchButton.tsx` / `MobileNavMenu.tsx`(修改) | 加 `.navbar-tool-trigger`;popup focus 改成對 token;**刪除** trigger 上的 `text-gray-*` 系列 utility                                  |
| `css/tailwind.css`(修改)                                                      | hero token、navbar token + popup 正規化、`--hux-interactive` 成對 token、text 模式、`:has()` tone                                    |
| `contentlayer.config.ts`(修改)                                                | `headerStyle` enum 欄位;`onSuccess` 的 `deps` 加 `assertValidHeroConfigurations`                                                     |
| `data/blog/hidden/2026-07-31-header-style-text-test.md`(新增)                 | 全 ASCII fixture,正文含一條 internal markdown link                                                                                   |
| `tests/unit/hero-config.test.ts`(新增)                                        | coercion characterization + `parseHeaderStyle` + validator 錯誤路徑                                                                  |
| `tests/unit/hero-mode.test.ts`(新增)                                          | 優先序窮舉表                                                                                                                         |
| `tests/unit/hero-rendering.test.ts`(新增)                                     | `PostLayout → HuxHero` 的 static rendering 契約                                                                                      |
| `tests/unit/content-outputs.test.ts`(修改)                                    | 補 validator 注入與失敗時的呼叫數                                                                                                    |
| `tests/playwright/header-style-text.spec.ts`(新增)                            | 狀態表 E2E                                                                                                                           |
| `tests/playwright/series.spec.ts`(修改)                                       | 改用共用 color helper;註解措辭;補 focus 契約                                                                                         |
| `docs/functionality-settings-manual.zh-TW.md` / `.md`、`README.md`(修改)      | `headerStyle` + 互斥規則 + OG 策略                                                                                                   |

**Commit 對應:** Task 1–4 → commit A;Task 5 → B;Task 6 → C;Task 7 → D;Task 8–9 → E;
Task 10 → F;Task 11 → G;Task 12 開 PR。

**A、B、D 的驗收是「改了很多行、輸出零像素差異」**;**C 刻意有像素變動**,必須逐一說明。
**E 不可再拆** —— text hero 先落地而 navbar tone 在下個 commit 的話,中間有一個 production
狀態是白字白底。

---

## Task 0: 準備分支(已完成)

分支 `feat/header-style-text` 已從合併後的 `main`(`edc01cb`,含 PR #67)開出。
`git rev-list --left-right --count main...origin/main` 右側為 `0`。

**確認 PR1 的 seam 已存在且形狀正確**(PR2 只擴充,不得新建):

```bash
grep -n "assertValidHeroConfigurations" lib/content-outputs.ts
```

Expected: 找得到 `assertValidHeroConfigurations?: (posts: readonly T[]) => void` 與
`deps.assertValidHeroConfigurations?.(posts)`。

---

## Task 1: 顏色 helper 與 golden tests

**Files:**

- Create: `tests/helpers/color.ts`
- Test: `tests/unit/color.test.ts`(新增)

**Interfaces:**

- Consumes: 無
- Produces:
  - `type Rgb = { r: number; g: number; b: number; a: number }`
  - `parseColor(value: string): Rgb`
  - `compositeOver(top: Rgb, bottom: Rgb): Rgb`
  - `flattenLayers(layers: string[]): Rgb` —— 由上而下合成到不透明
  - `relativeLuminance(color: Rgb): number`
  - `contrastRatio(foreground: Rgb, background: Rgb): number`
  - `contrastOf(foreground: string, backgroundLayers: string[]): number`

**背景:** `tests/playwright/series.spec.ts` 目前用 `.match(/\d+(?:\.\d+)?/g)?.slice(0, 3)` ——
**直接丟掉 alpha**,會把 `rgba(0,0,0,.05)` 當純黑;而且會把 `oklch(0.656 0.241 354.308)` 誤讀成
RGB(靜默算錯,比拋錯糟得多)。本專案的 `--color-primary-*` 與 Tailwind 的 `gray-*` 多為 oklch,
popup panel(`dark:bg-gray-800`)的計算色可能就是 oklch,所以**必須支援**而非拒絕。

- [ ] **Step 1: 寫會失敗的測試**

Create `tests/unit/color.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  compositeOver,
  contrastOf,
  contrastRatio,
  flattenLayers,
  parseColor,
  relativeLuminance,
} from '../helpers/color'

describe('parseColor', () => {
  test('hex 三碼、六碼與帶 alpha 的八碼', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('#2d2d2d')).toEqual({ r: 45, g: 45, b: 45, a: 1 })
    expect(parseColor('#00000080').a).toBeCloseTo(0.502, 3)
  })

  test('rgb 與 rgba,rgba 的 alpha 不得被丟掉', () => {
    expect(parseColor('rgb(64, 64, 64)')).toEqual({ r: 64, g: 64, b: 64, a: 1 })
    expect(parseColor('rgba(0, 0, 0, 0.05)')).toEqual({ r: 0, g: 0, b: 0, a: 0.05 })
  })

  test('oklch 的無彩度端點可逐值驗證', () => {
    const black = parseColor('oklch(0 0 0)')
    expect(black.r).toBeCloseTo(0, 1)
    expect(black.g).toBeCloseTo(0, 1)
    expect(black.b).toBeCloseTo(0, 1)

    const white = parseColor('oklch(1 0 0)')
    expect(white.r).toBeCloseTo(255, 1)
    expect(white.g).toBeCloseTo(255, 1)
    expect(white.b).toBeCloseTo(255, 1)
  })

  // 這條專門擋「把 oklch 的三個數字當成 RGB 讀」這個靜默錯誤 —— 那會得到
  // r=0.656, g=0.241, b=354.308,而 354.308 根本不是合法通道值。
  test('oklch 不得被當成 RGB 逐數字讀取', () => {
    const parsed = parseColor('oklch(0.656 0.241 354.308)')
    for (const channel of [parsed.r, parsed.g, parsed.b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
    }
    expect(parsed).not.toEqual({ r: 0.656, g: 0.241, b: 354.308, a: 1 })
  })

  test('oklch 的色相真的有作用', () => {
    const magenta = parseColor('oklch(0.7 0.2 0)')
    const green = parseColor('oklch(0.7 0.2 145)')
    expect(magenta).not.toEqual(green)
  })

  test('oklch 的斜線 alpha', () => {
    expect(parseColor('oklch(0.5 0 0 / 0.4)').a).toBeCloseTo(0.4, 5)
  })

  test('其他格式一律拋錯,不得靜默猜測', () => {
    expect(() => parseColor('hsl(200 50% 50%)')).toThrow(/Unsupported colou?r/i)
    expect(() => parseColor('color(display-p3 1 0 0)')).toThrow(/Unsupported colou?r/i)
    expect(() => parseColor('red')).toThrow(/Unsupported colou?r/i)
  })

  // 只有 3/4/6/8 位是合法 hex 長度。用 {3,8} 的話 5 位值會被收下,
  // 而切割邏輯會用 size=2 去讀它,靜默算出一個看似合理的錯誤顏色。
  test('非法長度的 hex 必須拋錯,不得靜默切錯', () => {
    expect(() => parseColor('#12345')).toThrow(/Unsupported colou?r/i)
    expect(() => parseColor('#1234567')).toThrow(/Unsupported colou?r/i)
    expect(() => parseColor('#12')).toThrow(/Unsupported colou?r/i)
  })
})

describe('alpha compositing', () => {
  test('5% 黑疊在白底上', () => {
    const result = compositeOver(parseColor('rgba(0, 0, 0, 0.05)'), parseColor('#fff'))
    expect(result.r).toBeCloseTo(242.25, 2)
    expect(result.a).toBe(1)
  })

  test('alpha 0 完全不影響底色;alpha 1 完全覆蓋', () => {
    expect(compositeOver(parseColor('rgba(0, 0, 0, 0)'), parseColor('#fff')).r).toBeCloseTo(255, 5)
    expect(compositeOver(parseColor('rgba(0, 0, 0, 1)'), parseColor('#fff')).r).toBeCloseTo(0, 5)
  })

  test('兩層半透明由上而下合成', () => {
    // 下層:50% 黑疊白 → 127.5;上層:50% 白疊 127.5 → 191.25
    const result = flattenLayers(['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)', '#fff'])
    expect(result.r).toBeCloseTo(191.25, 2)
  })

  test('遇到第一個不透明層就停止', () => {
    expect(flattenLayers(['rgba(0,0,0,0)', '#2d2d2d', '#fff']).r).toBeCloseTo(45, 5)
  })

  test('整疊都沒有不透明層時拋錯,不得默默當黑或白', () => {
    expect(() => flattenLayers(['rgba(0,0,0,0.5)'])).toThrow(/opaque/i)
  })
})

describe('contrast', () => {
  test('白對黑是 21,同色是 1', () => {
    expect(contrastRatio(parseColor('#fff'), parseColor('#000'))).toBeCloseTo(21, 5)
    expect(contrastRatio(parseColor('#777'), parseColor('#777'))).toBeCloseTo(1, 5)
  })

  test('--hux-text 的淺色值對白底是 10.36', () => {
    expect(contrastRatio(parseColor('rgb(64, 64, 64)'), parseColor('#fff'))).toBeCloseTo(10.36, 2)
  })

  test('相對亮度與順序無關', () => {
    const a = parseColor('#00677d')
    const b = parseColor('#fff')
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
    expect(relativeLuminance(parseColor('#000'))).toBeCloseTo(0, 10)
    expect(relativeLuminance(parseColor('#fff'))).toBeCloseTo(1, 10)
  })

  test('contrastOf 會先把背景疊層攤平', () => {
    // popup 現況:白字對 #4db8d1 = 2.31(規範表列值)
    expect(contrastOf('#fff', ['#4db8d1'])).toBeCloseTo(2.31, 2)
    // --hux-on-interactive 對 --hux-interactive 的淺色值 = 6.49
    expect(contrastOf('#fff', ['#00677d'])).toBeCloseTo(6.49, 2)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/color.test.ts`
Expected: FAIL —— `Failed to load ../helpers/color`(檔案不存在)

- [ ] **Step 3: 實作**

Create `tests/helpers/color.ts`:

```ts
/**
 * 兩套測試共用的唯一顏色實作。分散成兩份的話,其中一份丟掉 alpha 的錯誤會持續存在
 * —— series.spec.ts 原本那份就是這樣。
 */
export type Rgb = { r: number; g: number; b: number; a: number }

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function parseHex(value: string): Rgb {
  const hex = value.slice(1)
  const expand = (chunk: string) => parseInt(chunk.length === 1 ? chunk + chunk : chunk, 16)
  const size = hex.length <= 4 ? 1 : 2
  const at = (index: number) => hex.slice(index * size, index * size + size)
  const alpha = hex.length === 4 || hex.length === 8 ? expand(at(3)) / 255 : 1
  return { r: expand(at(0)), g: expand(at(1)), b: expand(at(2)), a: alpha }
}

function parseRgb(value: string): Rgb {
  const parts = value
    .slice(value.indexOf('(') + 1, value.lastIndexOf(')'))
    .split(/[,/\s]+/)
    .filter(Boolean)
    .map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) {
    throw new Error(`Unsupported color: ${value}`)
  }
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

/** oklch → oklab → linear sRGB → gamma-encoded sRGB。 */
function parseOklch(value: string): Rgb {
  const body = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'))
  const [coords, alphaPart] = body.split('/')
  const parts = coords.trim().split(/\s+/).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) {
    throw new Error(`Unsupported color: ${value}`)
  }
  const [lightness, chroma, hueDegrees] = parts
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => {
    const clamped = clamp01(channel)
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
    return clamp01(encoded) * 255
  })

  const alpha = alphaPart === undefined ? 1 : Number(alphaPart.trim())
  if (Number.isNaN(alpha)) throw new Error(`Unsupported color: ${value}`)
  return { r: linear[0], g: linear[1], b: linear[2], a: alpha }
}

export function parseColor(value: string): Rgb {
  const normalized = value.trim().toLowerCase()
  // 只有 3/4/6/8 位是合法的 hex 長度。寫成 {3,8} 會收下 #12345 這種 5 位值,
  // 而 parseHex 會用 size=2 去切它,靜默算出一個看似合理的錯誤顏色。
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(normalized)) return parseHex(normalized)
  if (normalized.startsWith('rgb')) return parseRgb(normalized)
  if (normalized.startsWith('oklch')) return parseOklch(normalized)
  throw new Error(`Unsupported color: ${value}`)
}

export function compositeOver(top: Rgb, bottom: Rgb): Rgb {
  const alpha = top.a + bottom.a * (1 - top.a)
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const blend = (topChannel: number, bottomChannel: number) =>
    (topChannel * top.a + bottomChannel * bottom.a * (1 - top.a)) / alpha
  return {
    r: blend(top.r, bottom.r),
    g: blend(top.g, bottom.g),
    b: blend(top.b, bottom.b),
    a: alpha,
  }
}

/**
 * layers 由上而下。必須以一個不透明層收尾 —— 沒有的話拋錯而不是猜一個底色,
 * 因為猜錯會讓對比數字看起來合理卻是錯的。
 */
export function flattenLayers(layers: string[]): Rgb {
  let result: Rgb | null = null
  for (const layer of layers) {
    const parsed = parseColor(layer)
    result = result === null ? parsed : compositeOver(result, parsed)
    if (result.a >= 1) return { ...result, a: 1 }
  }
  throw new Error(`Layer stack never reaches an opaque background: ${layers.join(' over ')}`)
}

export function relativeLuminance(color: Rgb): number {
  const [r, g, b] = [color.r, color.g, color.b]
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left
  )
  return (lighter + 0.05) / (darker + 0.05)
}

/** 前景色對「一疊背景攤平後的實際顏色」的對比。 */
export function contrastOf(foreground: string, backgroundLayers: string[]): number {
  const background = flattenLayers(backgroundLayers)
  const parsedForeground = parseColor(foreground)
  const effective =
    parsedForeground.a >= 1 ? parsedForeground : compositeOver(parsedForeground, background)
  return contrastRatio(effective, background)
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/color.test.ts`
Expected: PASS(16 tests)

若 oklch 的端點測試差距超過容忍值,先檢查 gamma 編碼那一段,不要放寬 `toBeCloseTo` 的精度。

---

## Task 2: `lib/hero-config.ts` 的 parse 管線

**Files:**

- Create: `lib/hero-config.ts`
- Test: `tests/unit/hero-config.test.ts`(新增)

**Interfaces:**

- Consumes: 無
- Produces:
  - `type RawHeroConfiguration` / `type ParsedHeroConfiguration`
  - `parseHeaderStyle(value: unknown): 'text' | null`(非法值拋錯)
  - `parseHeroConfiguration(raw: RawHeroConfiguration): ParsedHeroConfiguration`

**背景(P0):** contentlayer2 0.5.8 的 `enum` **不做執行期驗證**
(`parseFieldData.ts` 是 `enum: zod.string(), // TODO`,`mapping/index.ts` 是
`case 'enum': // TODO validate enum value`)。`headerStyle: txt` **會被接受**,而生成的型別宣稱
它是 `'text'` —— 型別在說謊,resolver 拿到 `'txt'` 會靜默落到 image mode。
`parseHeaderStyle` 是唯一真實閘門。

- [ ] **Step 1: 寫會失敗的測試**

Create `tests/unit/hero-config.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseHeaderStyle, parseHeroConfiguration } from '../../lib/hero-config'

describe('parseHeaderStyle', () => {
  test('未設視為未啟用', () => {
    expect(parseHeaderStyle(undefined)).toBeNull()
    expect(parseHeaderStyle(null)).toBeNull()
  })

  test('唯一合法字面值', () => {
    expect(parseHeaderStyle('text')).toBe('text')
  })

  // schema 的 enum 不做執行期驗證,這裡是唯一的閘門。
  test('拼錯、大小寫不符、空字串、純空白都必須拋錯', () => {
    expect(() => parseHeaderStyle('txt')).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle('TEXT')).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle('')).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle('   ')).toThrow(/headerStyle/)
  })

  test('非字串型別也必須拋錯', () => {
    expect(() => parseHeaderStyle(true)).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle(1)).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle({})).toThrow(/headerStyle/)
  })
})

// 下表逐項複製現況行為。唯一刻意的改變是 headerImg 純空白那一列。
describe('parseHeroConfiguration coercion characterization', () => {
  test('headerImg 純空白視為未設 —— 這是刻意的行為改變', () => {
    // 現況 resolveHeaderImage('  ') 會產生 "/  " 這種壞路徑,沒有理由保留。
    expect(parseHeroConfiguration({ headerImg: '  ' }).headerImg).toBeNull()
  })

  test('headerImg 空字串與未設同義,有值時保留原字串', () => {
    expect(parseHeroConfiguration({ headerImg: '' }).headerImg).toBeNull()
    expect(parseHeroConfiguration({}).headerImg).toBeNull()
    expect(parseHeroConfiguration({ headerImg: '/img/a.jpg' }).headerImg).toBe('/img/a.jpg')
  })

  test('headerBgCss 去頭尾空白並移除尾隨分號', () => {
    expect(parseHeroConfiguration({ headerBgCss: 'linear-gradient(a, b);  ' }).headerBgCss).toBe(
      'linear-gradient(a, b)'
    )
    expect(parseHeroConfiguration({ headerBgCss: '   ' }).headerBgCss).toBeNull()
  })

  test('headerMask: 0 是有效值,不可用 truthy 判斷', () => {
    expect(parseHeroConfiguration({ headerMask: 0 }).headerMask).toBe(0)
  })

  test('Number() 會變成 0 的輸入維持等值(空白字串、false、空陣列)', () => {
    expect(parseHeroConfiguration({ headerMask: ' ' }).headerMask).toBe(0)
    expect(parseHeroConfiguration({ headerMask: false }).headerMask).toBe(0)
    expect(parseHeroConfiguration({ headerMask: [] }).headerMask).toBe(0)
  })

  test('NaN、null、未設、空字串都不渲染遮罩', () => {
    expect(parseHeroConfiguration({ headerMask: {} }).headerMask).toBeNull()
    expect(parseHeroConfiguration({ headerMask: null }).headerMask).toBeNull()
    expect(parseHeroConfiguration({ headerMask: '' }).headerMask).toBeNull()
    expect(parseHeroConfiguration({}).headerMask).toBeNull()
  })

  test('iframe 與 layout 去空白後保留,空值為 null', () => {
    expect(parseHeroConfiguration({ iframe: ' https://slide.allenspace.de/a ' }).iframe).toBe(
      'https://slide.allenspace.de/a'
    )
    expect(parseHeroConfiguration({ iframe: '  ' }).iframe).toBeNull()
    expect(parseHeroConfiguration({ layout: 'PostSimple' }).layout).toBe('PostSimple')
    expect(parseHeroConfiguration({ layout: '' }).layout).toBeNull()
  })

  test('headerStyle 的錯誤會從 parseHeroConfiguration 傳播出來', () => {
    expect(() => parseHeroConfiguration({ headerStyle: 'txt' })).toThrow(/headerStyle/)
    expect(parseHeroConfiguration({ headerStyle: 'text' }).headerStyle).toBe('text')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/hero-config.test.ts`
Expected: FAIL —— `Failed to load ../../lib/hero-config`

- [ ] **Step 3: 實作**

Create `lib/hero-config.ts`:

```ts
/**
 * hero 相關 frontmatter 的**唯一** coercion 點。
 *
 * 為什麼要有這一層:validator 與 resolver 若都收 raw frontmatter,coercion 就會在
 * validator、resolver、renderer 三處各自實作而漂移。用型別強制單一 parse 點才守得住。
 *
 * 每個欄位各自 parse 成 domain value,不用一顆泛用的「trim 後判空」函式 —— 三者空值語意
 * 不同:headerMask: 0 是有效值、headerImg: "" 等於未設、headerStyle 只有一個合法字面值。
 */
export type RawHeroConfiguration = {
  headerStyle?: unknown
  headerImg?: unknown
  headerBgCss?: unknown
  headerMask?: unknown
  iframe?: unknown
  layout?: unknown
}

export type ParsedHeroConfiguration = {
  headerStyle: 'text' | null
  headerImg: string | null
  headerBgCss: string | null
  headerMask: number | null
  iframe: string | null
  layout: string | null
}

/**
 * 唯一的執行期閘門。contentlayer2 0.5.8 的 `enum` 欄位只產生 TypeScript union,
 * **不驗證值**(原始碼裡是兩個 TODO),所以 `headerStyle: txt` 會被 schema 放行、
 * 生成的型別卻宣稱它是 'text'。少了這個函式,拼錯會靜默落回圖片模式。
 */
export function parseHeaderStyle(value: unknown): 'text' | null {
  if (value === undefined || value === null) return null
  if (value === 'text') return 'text'
  throw new Error(`headerStyle must be "text" when present (received ${JSON.stringify(value)})`)
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function parseHeaderImg(value: unknown): string | null {
  // 純空白視為未設是**刻意的行為改變**:現況會產生 "/  " 這種壞路徑。
  return parseOptionalString(value)
}

function parseHeaderBgCss(value: unknown): string | null {
  const trimmed = parseOptionalString(value)
  if (trimmed === null) return null
  // frontmatter 常帶著從 CSS 片段複製留下的尾隨分號。當成 HTML style 字串沒問題,
  // 但 React 走 client 端渲染時是透過 CSSOM setter 賦值,分號會讓整個值被判定無效
  // —— 這正是「站內連結進來背景消失、重新整理才正常」的成因。
  const cleaned = trimmed.replace(/;+\s*$/, '')
  return cleaned === '' ? null : cleaned
}

function parseHeaderMask(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function parseHeroConfiguration(raw: RawHeroConfiguration): ParsedHeroConfiguration {
  return {
    headerStyle: parseHeaderStyle(raw.headerStyle),
    headerImg: parseHeaderImg(raw.headerImg),
    headerBgCss: parseHeaderBgCss(raw.headerBgCss),
    headerMask: parseHeaderMask(raw.headerMask),
    iframe: parseOptionalString(raw.iframe),
    layout: parseOptionalString(raw.layout),
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/hero-config.test.ts`
Expected: PASS(12 tests)

---

## Task 3: `lib/hero-mode.ts` 的優先序解析

**Files:**

- Create: `lib/hero-mode.ts`
- Test: `tests/unit/hero-mode.test.ts`(新增)

**Interfaces:**

- Consumes: Task 2 的 `ParsedHeroConfiguration`;既有的 `resolveHeroIframeSrc`(`lib/iframe.ts`)
- Produces:
  - `type HeroMode` / `type HeroSurface`
  - `resolveHeroSurface(config: ParsedHeroConfiguration): HeroSurface`

**沿用既定慣例:** 決策邏輯放 `lib/`、元件保持薄、配同名單元測試
(`lib/iframe.ts` 的 `resolveHeroIframeSrc` + `tests/unit/iframe.test.ts`)。
`HuxHero` 內聯的 `resolveHeaderImage` 與優先序三元是**例外,不是常態**。

- [ ] **Step 1: 寫會失敗的測試**

Create `tests/unit/hero-mode.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseHeroConfiguration } from '../../lib/hero-config'
import { resolveHeroSurface } from '../../lib/hero-mode'
import type { RawHeroConfiguration } from '../../lib/hero-config'

const surfaceOf = (raw: RawHeroConfiguration) => resolveHeroSurface(parseHeroConfiguration(raw))

const keynoteSrc = 'https://slide.allenspace.de/deck/'

describe('hero mode priority: keynote > text > css-background > image', () => {
  test('keynote 勝過 text', () => {
    expect(surfaceOf({ iframe: keynoteSrc, headerStyle: 'text' }).mode).toEqual({
      kind: 'keynote',
      iframeSrc: keynoteSrc,
    })
  })

  test('keynote 勝過 headerBgCss 與 headerImg', () => {
    expect(
      surfaceOf({ iframe: keynoteSrc, headerBgCss: 'red', headerImg: '/img/a.jpg' }).mode.kind
    ).toBe('keynote')
  })

  // 執行期順序必須正確,即使 build 已經擋掉這些並存組合。
  test('text 勝過 headerBgCss 與 headerImg', () => {
    expect(surfaceOf({ headerStyle: 'text', headerBgCss: 'red' }).mode).toEqual({ kind: 'text' })
    expect(surfaceOf({ headerStyle: 'text', headerImg: '/img/a.jpg' }).mode).toEqual({
      kind: 'text',
    })
  })

  test('headerBgCss 勝過 headerImg,且尾隨分號已清掉', () => {
    expect(
      surfaceOf({ headerBgCss: 'linear-gradient(a, b);', headerImg: '/img/a.jpg' }).mode
    ).toEqual({ kind: 'css-background', background: 'linear-gradient(a, b)' })
  })

  test('不在允許來源的 iframe 不構成 keynote', () => {
    expect(surfaceOf({ iframe: 'https://example.com/deck' }).mode.kind).toBe('image')
  })
})

describe('image mode fallback colour', () => {
  // 這兩個狀態的 URL 相同、呈現不同:未填 headerImg 時會額外上一層 #2D2D2D 底色,
  // 明填同一 URL 則沿用 class 的 #777。fallbackColor 設成 optional 的話漏填時
  // TypeScript 不會抗議,而症狀(圖片載入前底色改變)在測試裡幾乎看不出來。
  test('未填 headerImg 時用預設圖並帶 #2D2D2D 底色', () => {
    expect(surfaceOf({}).mode).toEqual({
      kind: 'image',
      url: '/img/home-bg.avif',
      fallbackColor: '#2D2D2D',
    })
  })

  test('明填同一個預設 URL 時不帶 fallback 底色', () => {
    expect(surfaceOf({ headerImg: '/img/home-bg.avif' }).mode).toEqual({
      kind: 'image',
      url: '/img/home-bg.avif',
      fallbackColor: null,
    })
  })

  test('相對路徑補上前導斜線,絕對網址原樣保留', () => {
    expect(surfaceOf({ headerImg: 'img/a.jpg' }).mode).toEqual({
      kind: 'image',
      url: '/img/a.jpg',
      fallbackColor: null,
    })
    expect(surfaceOf({ headerImg: 'https://cdn.example.com/a.jpg' }).mode).toEqual({
      kind: 'image',
      url: 'https://cdn.example.com/a.jpg',
      fallbackColor: null,
    })
  })
})

// commit A 是等值重構:遮罩行為逐項複製現況,**不分模式**。
// 「text 模式抑制遮罩」是行為改變,留到功能 commit 才做。
describe('mask opacity is unchanged in commit A', () => {
  test('有效數字在任何模式都回傳', () => {
    expect(surfaceOf({ headerMask: 0.6 }).maskOpacity).toBe(0.6)
    expect(surfaceOf({ headerMask: 0 }).maskOpacity).toBe(0)
    expect(surfaceOf({ iframe: keynoteSrc, headerMask: 0.6 }).maskOpacity).toBe(0.6)
    expect(surfaceOf({ headerStyle: 'text', headerMask: 0.6 }).maskOpacity).toBe(0.6)
  })

  test('未設或無法轉成數字時為 null', () => {
    expect(surfaceOf({}).maskOpacity).toBeNull()
    expect(surfaceOf({ headerMask: {} }).maskOpacity).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/hero-mode.test.ts`
Expected: FAIL —— `Failed to load ../../lib/hero-mode`

- [ ] **Step 3: 實作**

Create `lib/hero-mode.ts`:

```ts
import type { ParsedHeroConfiguration } from './hero-config'
import { resolveHeroIframeSrc } from './iframe'

/**
 * kind 用 css-background 而非 gradient:頁面端接受任意 CSS background 值,
 * 只有社群卡限定 linear-gradient。命名要反映實情。
 */
export type HeroMode =
  | { kind: 'keynote'; iframeSrc: string }
  | { kind: 'text' }
  | { kind: 'css-background'; background: string }
  | { kind: 'image'; url: string; fallbackColor: string | null }

export type HeroSurface = {
  mode: HeroMode
  maskOpacity: number | null
}

const DEFAULT_HEADER_IMAGE = '/img/home-bg.avif'
const DEFAULT_HEADER_FALLBACK_COLOR = '#2D2D2D'

function resolveHeaderImage(src: string | null) {
  if (src === null) return DEFAULT_HEADER_IMAGE
  if (src.startsWith('http') || src.startsWith('/')) return src
  return `/${src}`
}

/**
 * 優先序 keynote > text > css-background > image。
 * keynote 排最前是沿用既有 hasIframe 短路的先例;text 必須先於 headerBgCss 判斷,
 * 即使 build 已擋掉並存,執行期順序仍要正確。
 */
export function resolveHeroSurface(config: ParsedHeroConfiguration): HeroSurface {
  const maskOpacity = config.headerMask
  const iframeSrc = resolveHeroIframeSrc(config.iframe ?? undefined)

  if (iframeSrc) return { mode: { kind: 'keynote', iframeSrc }, maskOpacity }
  if (config.headerStyle === 'text') return { mode: { kind: 'text' }, maskOpacity }
  if (config.headerBgCss !== null) {
    return { mode: { kind: 'css-background', background: config.headerBgCss }, maskOpacity }
  }

  return {
    mode: {
      kind: 'image',
      url: resolveHeaderImage(config.headerImg),
      // 未填圖時額外鋪一層底色;明填 URL 時沿用 class 的 #777。
      fallbackColor: config.headerImg === null ? DEFAULT_HEADER_FALLBACK_COLOR : null,
    },
    maskOpacity,
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/hero-mode.test.ts`
Expected: PASS(10 tests)

---

## Task 4: `HuxHero` 接線與 static characterization(commit A)

**Files:**

- Modify: `components/hux/HuxHero.tsx`
- Modify: `layouts/PostLayout.tsx`
- Test: `tests/unit/hero-rendering.test.ts`(新增)

**Interfaces:**

- Consumes: Task 2/3 的全部 exports
- Produces: 無新 API(元件內部改用 union 渲染)

**注意:** 本 task **只做等值重構**。`headerStyle` 還沒有 frontmatter 欄位(Task 8 才加),
所以 `PostLayout` 這一版從 `content` 取到的會是 `undefined`,text 分支在真實內容上不會被觸發
—— 但單元測試會直接驅動它。

- [ ] **Step 1: 寫會失敗的測試**

Create `tests/unit/hero-rendering.test.ts`:

```ts
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import HuxHero from '../../components/hux/HuxHero'

// 刻意不 import contentlayer 產物:那會讓 test:unit 依賴先跑過 contentlayer2 build,
// 引入測試順序耦合。改用手工建構的 props。
const render = (props: Parameters<typeof HuxHero>[0]) => renderToStaticMarkup(<HuxHero {...props} />)

describe('image hero static rendering', () => {
  test('未填 headerImg 時 inline style 同時帶預設圖與 #2D2D2D 底色', () => {
    const html = render({ title: 'Image Post' })
    expect(html).toContain('/img/home-bg.avif')
    expect(html.toLowerCase()).toContain('#2d2d2d')
  })

  // resolver 回傳正確不代表 renderer 真的用了它,所以 fallbackColor 要在這一層另外斷言。
  test('明填同一個 URL 時 inline style 不含 background-color', () => {
    const html = render({ title: 'Image Post', headerImg: '/img/home-bg.avif' })
    expect(html).toContain('/img/home-bg.avif')
    expect(html.toLowerCase()).not.toContain('background-color')
  })

  test('headerBgCss 的尾隨分號已清掉', () => {
    const html = render({ title: 'Gradient Post', headerBgCss: 'linear-gradient(a, b);' })
    expect(html).toContain('linear-gradient(a, b)')
    expect(html).not.toContain('/img/home-bg.avif')
  })

  test('有效遮罩會渲染 header-mask,含 0', () => {
    expect(render({ title: 'Masked', headerMask: 0.6 })).toContain('header-mask')
    expect(render({ title: 'Masked', headerMask: 0 })).toContain('header-mask')
    expect(render({ title: 'Unmasked' })).not.toContain('header-mask')
  })

  test('keynote 渲染 iframe 並保留 intro-header-keynote', () => {
    const html = render({ title: 'Deck', iframe: 'https://slide.allenspace.de/deck/' })
    expect(html).toContain('intro-header-keynote')
    expect(html).toContain('keynote-frame')
  })
})

describe('text hero static rendering', () => {
  test('帶 intro-header-text、完全沒有 style 屬性', () => {
    const html = render({ title: 'Text Post', headerStyle: 'text' })
    expect(html).toContain('intro-header-text')
    // inline style 贏過任何 class 規則,純 CSS 蓋不掉 backgroundImage 的 fallback,
    // 所以 text 模式必須讓元件根本不產生 style 屬性。
    expect(html).not.toContain('style=')
  })

  // ⚠️ 這裡**刻意不斷言** text + headerMask 沒有遮罩。commit A 是等值重構,遮罩行為
  // 逐項複製現況(不分模式),所以此時 text + mask **仍然會**渲染遮罩。抑制遮罩是行為
  // 改變,連同它的斷言一起放在 Task 8。在這裡寫 not.toContain('header-mask') 會讓
  // commit A 不可能全綠。

  test('圖片模式仍然帶 inline style —— 證明上一條有鑑別力', () => {
    expect(render({ title: 'Image Post' })).toContain('style=')
  })

  test('text 模式仍然渲染標題、副標、tags 與 metadata', () => {
    const html = render({
      title: 'Text Post',
      subtitle: 'Sub',
      tags: ['alpha'],
      author: 'Allen',
      date: '2026-07-31',
      headerStyle: 'text',
    })
    expect(html).toContain('Text Post')
    expect(html).toContain('Sub')
    expect(html).toContain('alpha')
    expect(html).toContain('Posted by Allen')
  })
})
```

> 這個測試檔含 JSX,**副檔名必須是 `.tsx`**。`vitest.config.ts` 的 include 是
> `tests/unit/**/*.test.ts`,**收不到 `.tsx`**。Step 3 會一併調整 include。

- [ ] **Step 2: 調整 vitest include 並確認測試失敗**

把 `vitest.config.ts` 的 include 改成:

```ts
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
```

把測試檔命名為 `tests/unit/hero-rendering.test.tsx`。

Run: `yarn vitest run tests/unit/hero-rendering.test.tsx`
Expected: FAIL —— text 相關斷言失敗(`headerStyle` 還不是 `HuxHero` 的 prop)

- [ ] **Step 3: 改 `HuxHero`**

把 `components/hux/HuxHero.tsx` 的 props 型別與渲染邏輯換成:

```tsx
import siteMetadata from '@/data/siteMetadata'
import Link from '@/components/Link'
import PostSeriesLink from '@/components/hux/PostSeriesLink'
import type { SeriesPost } from '@/lib/series'
import { formatHuxDate } from '../../lib/hux-date'
import { parseHeroConfiguration } from '@/lib/hero-config'
import { resolveHeroSurface } from '@/lib/hero-mode'

type HuxHeroBaseProps = {
  title: string
  subtitle?: string
  author?: string
  date?: string
  update?: string
  tags?: string[]
  seriesPost?: SeriesPost
  headerImg?: string
  headerBgCss?: string
  headerMask?: number | string
  iframe?: string
}

/**
 * 首頁與 archive 不支援 text 模式(兩者都寫死 headerImg),用 headerStyle?: never
 * 把「非目標」的組合從型別上封死,而不是靠註解約束。
 */
type HuxHeroProps = HuxHeroBaseProps &
  (
    | { variant: 'home' | 'archive'; headerStyle?: never }
    | { variant?: 'post'; headerStyle?: 'text' }
  )

export default function HuxHero({
  variant = 'post',
  title,
  subtitle,
  author,
  date,
  update,
  tags,
  seriesPost,
  headerImg,
  headerBgCss,
  headerMask,
  iframe,
  headerStyle,
}: HuxHeroProps) {
  const { mode, maskOpacity } = resolveHeroSurface(
    parseHeroConfiguration({ headerStyle, headerImg, headerBgCss, headerMask, iframe })
  )

  // text 模式必須完全不產生 style —— inline style 贏過任何 class 規則,
  // 純 CSS 蓋不掉 backgroundImage 的 fallback。
  const style =
    mode.kind === 'keynote' || mode.kind === 'text'
      ? undefined
      : mode.kind === 'css-background'
        ? { background: mode.background }
        : {
            backgroundColor: mode.fallbackColor ?? undefined,
            backgroundImage: `url(${mode.url})`,
          }

  const variantClass =
    variant === 'home'
      ? 'intro-header-home'
      : variant === 'archive'
        ? 'intro-header-archive'
        : 'intro-header-post'

  const modeClass =
    mode.kind === 'keynote' ? 'intro-header-keynote' : mode.kind === 'text' ? 'intro-header-text' : ''

  return (
    <header
      className={`hux-full-bleed intro-header ${variantClass} ${modeClass}`}
      style={style}
    >
      {maskOpacity !== null && (
        <div className="header-mask" style={{ backgroundColor: `rgba(0, 0, 0, ${maskOpacity})` }} />
      )}
      {mode.kind === 'keynote' && (
        <iframe
          className="keynote-frame"
          src={mode.iframeSrc}
          title={title}
          loading="lazy"
          allowFullScreen
        />
      )}
      <div className={mode.kind === 'keynote' ? 'sr-only' : 'intro-header-content'}>
```

`<div className={...}>` 之後的內容(`site-heading` / `post-heading` 兩個分支)**完全不動**。
刪掉檔案頂端原本的 `resolveHeaderImage` 與 `resolveHeroIframeSrc` import(已搬到 `lib/hero-mode.ts`)。

- [ ] **Step 4: 改 `PostLayout` 把 `headerStyle` 傳下去**

在 `layouts/PostLayout.tsx` 的解構加一個欄位(`headerMask` 之後):

```ts
    headerMask,
    headerStyle,
```

並在 `<HuxHero ... />` 的 `headerMask` 之後加:

```tsx
          headerStyle={headerStyle as 'text' | undefined}
```

> `headerStyle` 這時還不在 `Blog` 型別上,所以解構會是 `undefined`。若 `tsc` 因為
> `CoreContent<Blog>` 沒有這個屬性而報錯,**暫時**用與 `iframe` 同樣的既有寫法取值:
> `(content as CoreContent<Blog> & { headerStyle?: 'text' }).headerStyle`。Task 8 加了 schema
> 欄位之後再把這個 cast 拿掉。

- [ ] **Step 5: 跑測試確認通過**

Run: `yarn vitest run tests/unit/hero-rendering.test.tsx tests/unit/hero-mode.test.ts tests/unit/hero-config.test.ts tests/unit/color.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: 全套檢查(commit A 的驗收:不碰 CSS、既有測試組全綠)**

```bash
yarn contentlayer2 build && yarn tsc --noEmit && yarn eslint app components lib layouts scripts && yarn test:unit && git diff --stat css/
```

Expected: 全部通過,且 `git diff --stat css/` **無輸出**(commit A 不碰 CSS)。

- [ ] **Step 7: production 目視確認零像素變動**

依 Global Constraints 的「啟動與關閉 production server(標準流程)」啟動。

比對圖片文章、keynote 文章、首頁、archive 的 hero 外觀與改動前一致。
**驗證完依同一節的關閉流程收工。**

- [ ] **Step 8: Commit(commit A)**

```bash
git add lib/hero-config.ts lib/hero-mode.ts components/hux/HuxHero.tsx layouts/PostLayout.tsx vitest.config.ts tests/helpers/color.ts tests/unit/color.test.ts tests/unit/hero-config.test.ts tests/unit/hero-mode.test.ts tests/unit/hero-rendering.test.tsx
git commit -m "refactor: resolve hero surface from a parsed domain object

The hero read raw front matter in three places -- HuxHero coerced headerMask
with Number(), trimmed headerBgCss inline, and decided its mode with a nested
ternary. A validator added later would have to repeat every one of those
coercions, and the two copies would drift.

Parsing now happens once. lib/hero-config.ts turns unknown front-matter values
into a domain object, lib/hero-mode.ts turns that into a discriminated union,
and the component only renders the union. The characterization tests pin the
current coercion table value by value, including headerMask: 0 being a valid
opacity rather than an absent one.

One behaviour deliberately changes: a headerImg of pure whitespace used to
produce the broken path \"/  \" and now counts as unset.

parseHeaderStyle exists because contentlayer's enum field does not validate at
runtime -- its source carries two TODOs saying so -- while the generated type
claims the value is 'text'. Nothing sets headerStyle yet; the field arrives
with the feature.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: hero 顏色 token(commit B)

**Files:**

- Modify: `css/tailwind.css`
- Test: `tests/playwright/header-style-text.spec.ts` 尚未存在;本 task 用既有 parity 套件把關

**Interfaces:**

- Consumes: 無
- Produces: CSS 變數 `--hero-fg`、`--hero-border`、`--hero-link-hover`(供 Task 8 的 text 模式賦值)

**驗收:零像素變動。**

- [ ] **Step 1: 執行刪除前的驗證閘(不可跳過)**

要把 `.site-heading h1`(425)、`.site-heading .subheading`(433)、`.post-heading h1`(448)、
`.post-heading .subheading`(456)四條的 `color: #fff` 改成繼承,必須先證明沒有其他規則
**直接命中**這些元素。

```bash
grep -n "site-heading\|post-heading\|\bh1\b\|subheading" css/tailwind.css | grep -v "^\s*/\*"
```

逐條檢查是否有直接宣告 `color` 的規則(含元素選擇器、該元素身上任何其他 class、`.dark` 變體)。
**不是只看 `@layer base`** —— 已知反例就在未分層區。**直接宣告永遠贏過繼承,與 layer 和
specificity 高低都無關**;繼承只在該元素完全沒有 `color` 宣告時才生效。

**已知必須保留的反例**:`.post-heading .meta, .post-heading .series-meta`(468-469)。該元素同時
帶 `.post-series-link-top`,而後者在 878 行**直接宣告** `color: #666`;884 行的
`.dark .post-series-link-top:not(.series-meta)` 就是兩 class 共存的鐵證。刪掉 468-469 之後
`#666` 這個直接宣告會贏過從 `.intro-header` 繼承的顏色,結果是 series 那句話變灰、其 `<a>`
因 `color: inherit` 一起變灰,**直接破壞現有 image hero**。

任一條有反例就保留為 `color: var(--hero-fg)`。

- [ ] **Step 2: 加 token 並改為繼承**

在 `css/tailwind.css` 的 `.intro-header`(327)區塊中,把 `color: #fff;` 換成:

```css
--hero-fg: #fff;
--hero-border: rgba(255, 255, 255, 0.8);
--hero-link-hover: #66c7e0;
color: var(--hero-fg);
```

刪除下列四條規則裡的 `color: #fff;`(其餘宣告保留):

- `.site-heading h1`(425)
- `.site-heading .subheading`(433)
- `.post-heading h1`(448)
- `.post-heading .subheading`(456)

把 `.post-heading .meta, .post-heading .series-meta`(468-469)的 `color: #fff;` 改成:

```css
color: var(--hero-fg);
```

把 `.intro-header-post .series-meta a:hover, .intro-header-post .series-meta a:focus`(420-422)
的 `color: #66c7e0;` 改成:

```css
color: var(--hero-link-hover);
```

> 這一條是 `--hero-link-hover` 的**唯一 consumer**,必須明列否則它是死 token。
> 這個 `#66c7e0` **就是 `--series-interactive` 的深色值**,被釘死是因為 hero 永遠是深色照片。

- [ ] **Step 3: 加 hero scope 的 tag 邊框(全域 shorthand 不動)**

在 `.tags .tag`(487)那條**之後**新增:

```css
/* 全域的 .tags .tag 用 border shorthand,文章列表卡片、文章內文都在用。把它改成消費
   hero token 會讓 hero 外變數未定義 → 整條宣告在 computed-value time 失效 →
   border-style 回到 none,而後面針對列表的規則只覆寫 border-color,補不回 border-style。 */
.intro-header .tags .tag {
  border-color: var(--hero-border);
}
```

**`.tags .tag`(487)的 `border: 1px solid rgba(255, 255, 255, 0.8)` 一個字都不要動。**

- [ ] **Step 4: 成對互動色 token**

在 `:root`(180)區塊加兩行、`.dark`(191)區塊加兩行,並讓既有的 `--series-interactive` 指向它:

```css
:root {
  /* ...既有宣告... */
  --hux-interactive: #00677d;
  --hux-on-interactive: #fff;
  --series-interactive: var(--hux-interactive);
}

.dark {
  /* ...既有宣告... */
  --hux-interactive: #66c7e0;
  --hux-on-interactive: #2d2d2d;
  --series-interactive: var(--hux-interactive);
}
```

原本的 `--series-interactive: #00677d;` / `#66c7e0;` 兩行被上面取代,**值不變、零像素**。

> **必須是成對 token。** 同一個值不能同時擔任「頁面底色上的 accent 前景」與「承載文字的
> focus 背景」—— `--hux-interactive` 隨主題翻轉深淺,白字對它的深色值只有 **1.94**。
> 自訂屬性宣告**必須寫在 selector 內**,裸在頂層是無效 CSS。

- [ ] **Step 5: 檢查與零像素驗收**

```bash
yarn eslint app components lib layouts scripts
```

然後依 Global Constraints 的「啟動與關閉 production server(標準流程)」啟動。

比對範圍:**圖片文章、首頁、archive、series、about、404、offline、文章列表卡片**,兩個主題。
任一處有位移就停手 —— 等值替換不等值。

- [ ] **Step 6: 跑既有 parity 套件當守門員**

```bash
set -o pipefail
yarn test:parity 2>&1 | tail -30
```

Expected: 全綠(基準:PR1 合併時是 80 passed)。

> **這一步守得住什麼、守不住什麼,必須講清楚。** `series.spec.ts` 既有的「兩主題 hover 同色」
> 只守住 **hero 專屬 consumer 沒被刪除** —— 刪掉之後會遞補到隨主題翻轉的 `--series-interactive`,
> 兩主題不再同色,測試變紅。
> 它**守不住** `--hero-link-hover` 被改回硬編碼 `#66c7e0`:在 image hero 上那個值本來就是對的,
> 兩主題仍然同色,照樣全綠。**真正守住硬編碼的是 Task 9 的 text harness**(`#66c7e0` 對淺色底
> 只有 1.94)。也就是說 **commit B 落地時,`--hero-link-hover` 還沒有防硬編碼的 oracle**,
> 那個保護隨 Task 9 一起到位。這是刻意接受的順序,不是遺漏。

**驗證完關閉 server**(見下方「啟動與關閉 production server」的標準流程)。

- [ ] **Step 7: Commit(commit B)**

```bash
git add css/tailwind.css
git commit -m "refactor: carry hero colours on inherited custom properties

Eight constants in the hero encoded the same fact -- that the header background
is always a dark photograph -- and a text-mode header is the first thing that
makes it false. They now resolve through --hero-fg, --hero-border and
--hero-link-hover declared on .intro-header, so a mode only has to reassign
three variables instead of shadowing eight rules that can drift apart.

Two rules deliberately keep an explicit declaration. .post-heading .meta and
.series-meta must, because that element also carries .post-series-link-top,
which declares color: #666 directly; a direct declaration beats inheritance
regardless of layer or specificity, so dropping it would grey out the series
sentence on every existing image hero. The global .tags .tag border shorthand
must, because it also serves post cards and article bodies -- consuming a hero
token there would leave the variable undefined outside the hero, invalidating
the whole declaration and resetting border-style to none, which the later
border-color rules cannot restore. Hero tags get their own scoped rule instead.

--hux-interactive and --hux-on-interactive arrive as a pair because one value
cannot serve both as an accent foreground on the page background and as a focus
background carrying text; the token flips across themes, so white on its dark
value is 1.94. --series-interactive now points at it at identical values.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: navbar token 與 popup cascade 正規化(commit C)

**Files:**

- Modify: `css/tailwind.css`
- Modify: `components/ThemeSwitch.tsx`、`components/SearchButton.tsx`、`components/MobileNavMenu.tsx`

**Interfaces:**

- Consumes: Task 5 的 `--hux-interactive` / `--hux-on-interactive`
- Produces: `--navbar-fg` / `--navbar-fg-hover`(供 Task 8 的 `:has()` tone 賦值)、
  共用語意 class `.navbar-tool-trigger`

**⚠️ 這個 commit 刻意有像素變動**,必須逐一說明每一處變動的理由。

**順序不可顛倒:先移除污染源,再刪補償規則。** 反過來做的話中間會有一個 popup 外觀壞掉的狀態。

- [ ] **Step 1: 三個 trigger 加上共用 class**

`components/ThemeSwitch.tsx` 的 `MenuButton`(68):

```tsx
          <MenuButton aria-label="Theme switcher" className="theme-switch-button navbar-tool-trigger">
```

`components/MobileNavMenu.tsx` 的 `MenuButton`:

```tsx
      <MenuButton aria-label="Toggle navigation" className="navbar-toggle navbar-tool-trigger">
```

`components/SearchButton.tsx` 的 `SearchButtonWrapper`:

```tsx
      <SearchButtonWrapper aria-label="Search" className={`${className ?? ''} navbar-tool-trigger`.trim()}>
```

> 加 class 而不是在 CSS 列舉三個不相關的既有 class 名,正是為了消除那種脆弱性。

- [ ] **Step 2: 刪除 trigger 上的顏色 utility**

`components/SearchButton.tsx` 的 `<svg>` className,把
`hover:text-primary-500 dark:hover:text-primary-400 h-6 w-6 text-gray-900 dark:text-gray-100`
改成:

```tsx
className = 'h-6 w-6'
```

`components/ThemeSwitch.tsx` 的三個圖示元件(20、34、48 行)className
`group:hover:text-gray-100 h-6 w-6` 改成:

```tsx
className = 'h-6 w-6'
```

以及 67 行外層 `<div>` 的 `hover:text-primary-500 dark:hover:text-primary-400 flex items-center justify-center`
改成:

```tsx
        <div className="flex items-center justify-center">
```

> **這些 utility 現在就是死的**,不是「會復活」。`.navbar-tool-trigger svg { color: currentColor }`
> 是未分層規則,會壓過 layered 的 `text-gray-*`。直接刪掉,讓「顏色由 token 決定」在程式碼上是
> 明確的,而不是靠另一條規則繼續靜默蓋住。**popup 內部的顏色 utility 保留**(那是 popup 自己的契約)。

- [ ] **Step 3: popup focus 改用成對 token**

`components/ThemeSwitch.tsx` 有三處 `MenuItem`(95、109、123 附近)、
`components/MobileNavMenu.tsx` 有 `SearchMenuItem` 與導覽項,把所有

```
focus ? 'bg-primary-600 text-white' : 'text-gray-700! dark:text-gray-200!'
```

改成:

```
focus
  ? 'bg-[var(--hux-interactive)] text-[var(--hux-on-interactive)]'
  : 'text-gray-700! dark:text-gray-200!'
```

> `--color-primary-600` 被單獨覆寫成 `#4db8d1`(青色),白字對它只有 **2.31**,兩個主題都不合格。
> 改成成對 token 之後是淺 **6.49** / 深 **7.09**。
> **不可只用 `--hux-interactive` 配白字** —— 深色模式會是 **1.94**。

- [ ] **Step 4: 加 navbar token 並正面列舉 consumer**

在 `.navbar-brand`(231)之前新增:

```css
.navbar-custom {
  --navbar-fg: #fff;
  --navbar-fg-hover: rgba(255, 255, 255, 0.8);
}
```

把下列規則的顏色改成讀 token:

- `.navbar-brand`(231):`color: #fff;` → `color: var(--navbar-fg);`
- `.navbar-brand:hover, .navbar-links a:hover`(241-243):
  `color: rgba(255, 255, 255, 0.8);` → `color: var(--navbar-fg-hover);`
- `.icon-bar`(254):`background: #fff;` → `background: var(--navbar-fg);`(**注意是 `background`**)

把 `.navbar-links a, .navbar-tools button`(284-292)拆成兩條 —— **排版與 padding 一起搬**:

```css
.navbar-links a,
.navbar-tool-trigger {
  color: var(--navbar-fg);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  line-height: 20px;
  text-transform: uppercase;
}

/* SVG 一律繼承 trigger 的 token;元件不得自帶顏色 utility。 */
.navbar-tool-trigger svg {
  color: currentColor;
}
```

**刪除** `.navbar-tools svg { color: #fff; }`(300-302)整條。

- [ ] **Step 4b: 先把補償規則提供的排版契約還給元件(順序不可顛倒)**

`.navbar-custom [role='menu'] button` 目前同時提供 `font-weight: 600` 與
`letter-spacing: 0.025em`。**`components/ThemeSwitch.tsx` 的三個 MenuItem 只有 `text-sm`,
沒有 `font-semibold tracking-wide`** —— 也就是說它們的 600/0.025em **完全來自那條補償規則**。
直接刪掉會讓它們退成 400/normal,與 commit C「popup 字體不變」的宣稱矛盾。
(`components/MobileNavMenu.tsx` 兩處已經自帶 `font-semibold tracking-wide`,不用動。)

把 ThemeSwitch 三個 MenuItem 的 className 從

```
group flex w-full items-center rounded-md px-2 py-2 text-sm
```

改成

```
group flex w-full items-center rounded-md px-2 py-2 text-sm font-semibold tracking-wide
```

- [ ] **Step 5: 刪除補償規則(污染源與排版契約都已移除)**

**刪除**下列三處:

1. `.navbar-custom [role='menu'] button { text-transform: none; font-size: 0.875rem; font-weight: 600; letter-spacing: 0.025em; }`(277-282)及其上方註解
2. `.navbar-custom [role='menu'] svg { color: inherit; }`(307-309)及其上方註解
3. 桌面斷點內的 `.navbar-custom [role='menu'] button { padding: 0.5rem; }`(1530-1532)及其上方註解

> 這三條之所以能刪,是因為污染源(`.navbar-tools button` 的排版/padding、
> `.navbar-tools svg` 的顏色)已經在 Step 4 移除。

- [ ] **Step 6: 桌面斷點與 is-fixed 的 token 化**

桌面斷點內的 `.navbar-links a, .navbar-tools button { padding: 20px; }`(1522-1525)改成:

```css
.navbar-links a,
.navbar-tool-trigger {
  padding: 20px;
}
```

`.navbar-custom.is-fixed` 的兩組後代顏色宣告(1570-1575、1582-1587)整組**刪除**,改成在
`.navbar-custom.is-fixed`(1557)與 `.dark .navbar-custom.is-fixed`(1577)區塊內賦值:

```css
.navbar-custom.is-fixed {
  position: fixed;
  top: -61px;
  background-color: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid #f2f2f2;
  transition: transform 0.3s;
  --navbar-fg: #2d2d2d;
  /* 等值:複製「fixed 狀態 hover 不變色」的現況 */
  --navbar-fg-hover: #2d2d2d;
}
```

```css
.dark .navbar-custom.is-fixed {
  background-color: rgba(45, 45, 45, 0.9);
  border-bottom-color: #535353;
  --navbar-fg: #fff;
  --navbar-fg-hover: #fff;
}
```

> **`--navbar-fg-hover` 若漏掉就不是等值替換。** 目前淺色 fixed navbar 文字 hover 時仍是深色,
> 純粹因為 `.navbar-custom.is-fixed .navbar-brand`(0,3,0)壓過 `.navbar-brand:hover`(0,2,0)。
> 收斂成祖先變數後,後者重新生效並讀到基底的 `rgba(255,255,255,.8)` —— 疊在 90% 白底上就是
> **白底白字**。

- [ ] **Step 7: 檢查**

```bash
yarn tsc --noEmit && yarn eslint app components lib layouts scripts && yarn test:unit
```

Expected: 全部通過。

- [ ] **Step 8: production 逐項截圖說明變動**

依 Global Constraints 的「啟動與關閉 production server(標準流程)」啟動,必須逐一確認並說明:

| 位置                                 | 預期                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 頂欄 brand / 連結 / 圖示,兩主題      | 與改動前**相同**                                                                                                                                                                                                                                                                                                |
| 桌面 fixed 浮動列(向上捲觸發),兩主題 | 與改動前**相同**,且 hover 時**顏色不變**                                                                                                                                                                                                                                                                        |
| 展開 ThemeSwitch popup               | 字體/padding 與改動前**相同**。**用 `getComputedStyle` 逐項量**,不要只看截圖:`fontWeight === '600'`、`letterSpacing === '0.35px'`(0.025em × 14px)、`fontSize === '14px'`、`textTransform === 'none'`、`padding === '8px'`。這五項原本由補償規則提供,Step 4b 才剛搬進元件 —— 漏搬時目視幾乎看不出來,量了才會現形 |
| popup focus 態                       | **刻意改變**:白字青底(2.31)→ `--hux-on-interactive` 對 `--hux-interactive`(淺 6.49 / 深 7.09)                                                                                                                                                                                                                   |
| 手機展開漢堡 popup                   | 同上                                                                                                                                                                                                                                                                                                            |

用 `getComputedStyle` 量實際值,不從 CSS 原始碼推論。**驗證完依 Global Constraints 的關閉流程收工。**

- [ ] **Step 9: 跑 parity 套件**

```bash
set -o pipefail
yarn test:parity 2>&1 | tail -30
```

Expected: 全綠。

- [ ] **Step 10: Commit(commit C)**

```bash
git add css/tailwind.css components/ThemeSwitch.tsx components/SearchButton.tsx components/MobileNavMenu.tsx
git commit -m "fix: give the navbar tokens and hand the popup back to its component

.navbar-tools button and .navbar-tools svg also match elements *inside* the
HeadlessUI menus, which render inline within that subtree. Two compensating
rules existed solely to undo that -- one resetting popup typography, one
resetting popup icon colour -- and the fixed-state descendant selector (0,3,1)
outranked the icon compensation (0,2,1), so it failed exactly when the navbar
was floating.

The three real triggers now carry a shared .navbar-tool-trigger class, and the
colour, typography, padding and SVG colour all move onto it. Removing the
pollution is what makes the compensations deletable; doing it in the other
order would leave a commit where the popup renders as 12px uppercase text with
20px padding.

Popup focus changes on purpose. It was bg-primary-600 with white text, and
--color-primary-600 is overridden to #4db8d1 in this repo, so the contrast was
2.31 in both themes. It is now the paired --hux-on-interactive on
--hux-interactive: 6.49 light, 7.09 dark. Using the single token with white
text would have been 1.94 in dark mode, which is why the pair exists.

The fixed navbar keeps a hover token even though it equals its resting colour.
Without it, collapsing the descendant selectors revives .navbar-brand:hover,
which reads the base rgba(255,255,255,.8) -- white on a 90% white bar.

Colour utilities on the trigger components are deleted rather than left in
place. They were already dead, and an unlayered rule silently overriding a
layered utility is worse than no utility at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: build-time validator 與 seam 注入(commit D)

**Files:**

- Modify: `lib/hero-config.ts`
- Modify: `contentlayer.config.ts`(只加 `deps` 的一個鍵)
- Test: `tests/unit/hero-config.test.ts`(追加)、`tests/unit/content-outputs.test.ts`(追加)

**Interfaces:**

- Consumes: Task 2 的 parse 管線;PR1 既有的 `runContentDerivedOutputs`
- Produces:
  - `validateHeroConfiguration(raw: RawHeroConfiguration, sourceFilePath: string): void`
  - `assertValidHeroConfigurations(posts: readonly unknown[]): void`

**⚠️ 絕對不要新建 `lib/content-outputs.ts`,也不要改 `runContentDerivedOutputs` 的簽章。**
改成 `runContentDerivedOutputs(blogs, deps)` 或把 raw posts 傳給 tag/search
**會把 PR1 的 draft gate 倒退回去**。本 task 只做兩件事:實作 validator、把它加進 `deps`。

- [ ] **Step 1: 寫會失敗的測試**

Append to `tests/unit/hero-config.test.ts`(import 補上兩個新名稱):

```ts
describe('validateHeroConfiguration', () => {
  const validate = (raw: Record<string, unknown>) =>
    validateHeroConfiguration(raw, 'blog/example.md')

  test('沒有 headerStyle 時什麼都不擋', () => {
    expect(() => validate({ headerImg: '/img/a.jpg', headerMask: 0.6 })).not.toThrow()
    expect(() => validate({ iframe: 'https://slide.allenspace.de/a' })).not.toThrow()
  })

  test('text 單獨使用是合法的', () => {
    expect(() => validate({ headerStyle: 'text' })).not.toThrow()
  })

  test.each([
    ['headerImg', { headerImg: '/img/a.jpg' }],
    ['headerBgCss', { headerBgCss: 'linear-gradient(a, b)' }],
    ['iframe', { iframe: 'https://slide.allenspace.de/a' }],
  ])('text 併用 %s 必須失敗,並指出檔名與衝突欄位', (field, extra) => {
    expect(() => validate({ headerStyle: 'text', ...extra })).toThrow(
      new RegExp(`blog/example\\.md[\\s\\S]*${field}`)
    )
  })

  // headerMask: 0 是有效值,truthy 判斷會漏掉它。
  test('text 併用 headerMask 必須失敗,含 headerMask: 0', () => {
    expect(() => validate({ headerStyle: 'text', headerMask: 0.6 })).toThrow(/headerMask/)
    expect(() => validate({ headerStyle: 'text', headerMask: 0 })).toThrow(/headerMask/)
  })

  test.each(['PostSimple', 'PostBanner'])('text 併用 layout %s 必須失敗', (layout) => {
    expect(() => validate({ headerStyle: 'text', layout })).toThrow(/layout/)
  })

  test('text 併用預設 layout 是合法的', () => {
    expect(() => validate({ headerStyle: 'text', layout: 'post' })).not.toThrow()
    expect(() => validate({ headerStyle: 'text' })).not.toThrow()
  })

  test('一次列出所有衝突欄位,不是只報第一個', () => {
    const message = (() => {
      try {
        validate({ headerStyle: 'text', headerImg: '/a.jpg', headerMask: 0 })
        return ''
      } catch (error) {
        return (error as Error).message
      }
    })()
    expect(message).toContain('headerImg')
    expect(message).toContain('headerMask')
  })
})

describe('assertValidHeroConfigurations', () => {
  test('對每一篇都驗證,錯誤訊息帶得出是哪一篇', () => {
    expect(() =>
      assertValidHeroConfigurations([
        { _raw: { sourceFilePath: 'blog/ok.md' }, headerStyle: 'text' },
        { _raw: { sourceFilePath: 'blog/bad.md' }, headerStyle: 'text', headerImg: '/a.jpg' },
      ])
    ).toThrow(/blog\/bad\.md/)
  })

  test('全部合法時不拋錯', () => {
    expect(() =>
      assertValidHeroConfigurations([
        { _raw: { sourceFilePath: 'blog/ok.md' }, headerImg: '/a.jpg' },
      ])
    ).not.toThrow()
  })
})
```

Append to `tests/unit/content-outputs.test.ts`:

```ts
describe('hero validation gates every derived output', () => {
  test('validator 拋錯時 collect/tag/search 一次都不會被呼叫', async () => {
    const d = deps()
    d.assertValidHeroConfigurations.mockImplementation(() => {
      throw new Error('invalid hero configuration')
    })

    await expect(runContentDerivedOutputs([normal], 'production', d)).rejects.toThrow(
      'invalid hero configuration'
    )

    expect(d.collectSeries).not.toHaveBeenCalled()
    expect(d.createTagCount).not.toHaveBeenCalled()
    expect(d.createSearchIndex).not.toHaveBeenCalled()
  })
})

describe('contentlayer config injects the hero validator', () => {
  const source = readFileSync('./contentlayer.config.ts', 'utf8')

  // 必須錨定在 deps 物件實字上。只寫 /assertValidHeroConfigurations[,\s}]/ 會連
  // import 那一行一起匹配 —— 刪掉 deps 注入之後 import 還在,斷言照樣綠。
  test('deps 物件實字裡帶著 assertValidHeroConfigurations', () => {
    expect(source).toMatch(
      /runContentDerivedOutputs\([\s\S]*?\{[^}]*assertValidHeroConfigurations[^}]*\}/
    )
  })

  // 這條擋住「順手把 seam 換成舊簽章」——那會讓 tag/search 重新收到未過濾的 allBlogs。
  test('沒有把 seam 改回收 raw posts 的舊簽章', () => {
    expect(source).toContain('resolvePublicationMode(process.env.BLOG_PUBLICATION_MODE)')
    expect(source).not.toMatch(/runContentDerivedOutputs\(\s*allBlogs\s*,\s*\{/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/hero-config.test.ts tests/unit/content-outputs.test.ts`
Expected: FAIL —— `validateHeroConfiguration is not defined` 等

- [ ] **Step 3: 實作 validator**

Append to `lib/hero-config.ts`:

```ts
/** 不 render HuxHero 的版面。denylist 的已知限制:未來新增其他不支援 hero 的 layout 仍會漏掉。 */
const LAYOUTS_WITHOUT_HERO = ['PostSimple', 'PostBanner']

/**
 * build 時的互斥組合閘門。收 raw frontmatter 而非 parsed object,是因為它必須連
 * 「headerStyle 拼錯」這種 parse 期錯誤一起回報,並附上檔名。
 */
export function validateHeroConfiguration(raw: RawHeroConfiguration, sourceFilePath: string): void {
  let config: ParsedHeroConfiguration
  try {
    config = parseHeroConfiguration(raw)
  } catch (error) {
    throw new Error(`${sourceFilePath}: ${(error as Error).message}`)
  }

  if (config.headerStyle !== 'text') return

  const conflicts: string[] = []
  if (config.headerImg !== null) conflicts.push('headerImg')
  if (config.headerBgCss !== null) conflicts.push('headerBgCss')
  if (config.iframe !== null) conflicts.push('iframe')
  // headerMask: 0 是有效值 —— 不可用 truthy 判斷。
  if (config.headerMask !== null) conflicts.push('headerMask')
  if (config.layout !== null && LAYOUTS_WITHOUT_HERO.includes(config.layout)) {
    conflicts.push(`layout: ${config.layout}`)
  }

  if (conflicts.length > 0) {
    throw new Error(
      `${sourceFilePath}: headerStyle: text cannot be combined with ${conflicts.join(', ')}`
    )
  }
}

type ValidatablePost = RawHeroConfiguration & { _raw?: { sourceFilePath?: string } }

/**
 * 針對**全部文章**(不是 listed view)且在 orchestration 中**第一個執行**:無效 frontmatter
 * 不該因為文章剛好是 draft/hidden 就放行,而且必須在任何 project-owned 產物寫出前擋下。
 */
export function assertValidHeroConfigurations(posts: readonly unknown[]): void {
  for (const post of posts) {
    const typed = post as ValidatablePost
    validateHeroConfiguration(typed, typed._raw?.sourceFilePath ?? '<unknown source file>')
  }
}
```

- [ ] **Step 4: 注入 PR1 既有的 seam,並把 schema 欄位一起加進來**

在 `contentlayer.config.ts` 頂部加 import:

```ts
import { assertValidHeroConfigurations } from './lib/hero-config'
```

在 `headerMask`(271)之後加上 enum 欄位:

```ts
    headerStyle: { type: 'enum', options: ['text'] },
```

> **這個欄位必須在本 task 就加,不能留到 Task 8。** contentlayer 只把
> `documentTypeDef.fieldDefs` 裡宣告過的欄位放進文件物件 —— 欄位不存在時,Step 7 那個
> 帶 `headerStyle: text` 的 probe 檔案會被**整個丟掉**該欄位,validator 看到的是「沒有
> headerStyle」,於是沒有衝突、build 成功,而 Step 7 期待的是失敗。**驗證失敗路徑的實驗
> 會反過來證明驗證不存在。**
>
> 提早加是安全的:欄位本身只產生 TypeScript union,沒有任何文章使用它,commit D 的
> 零像素要求不受影響。

把 `onSuccess`(373-380)整段換成下面這樣 —— 唯一的差別是 `deps` 物件多了第一個鍵:

```ts
  onSuccess: async (importData) => {
    const { allBlogs } = await importData()
    await runContentDerivedOutputs(
      allBlogs,
      resolvePublicationMode(process.env.BLOG_PUBLICATION_MODE),
      { assertValidHeroConfigurations, collectSeries, createTagCount, createSearchIndex }
    )
  },
```

> 這裡刻意寫出**完整呼叫**而不是只貼那個物件。裸寫 `{ a, b, c, d }` 會被 prettier 解讀成
> **block statement 內的 comma expression** 並重排成 `{ ;(a, b, c, d) }` —— 貼進第三個參數
> 是語法錯誤。這份計畫本身就被這樣改壞過一次。

- [ ] **Step 5: 跑測試確認通過**

Run: `yarn vitest run tests/unit/hero-config.test.ts tests/unit/content-outputs.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: 全套檢查 + 產物零 diff**

```bash
yarn contentlayer2 build && yarn tsc --noEmit && yarn eslint app components lib layouts scripts && yarn test:unit && git diff --stat app/tag-data.json
```

Expected: 全部通過,且 `git diff --stat app/tag-data.json` **無輸出**。

> **注意順序陷阱:** `yarn test:unit` 會跑 `tests/unit/content-writers.test.ts`,它會寫真實的
> `app/tag-data.json` 再於 `afterAll` 還原。若 diff 非空,先看內容 —— 出現 `hidden-sentinel-tag`
> 是測試沒還原,出現真實 tag 才是 validator 或 seam 接錯。

- [ ] **Step 7: 手動證明錯誤路徑真的會讓 build 失敗**

```bash
printf -- '---\ntitle: "Conflict Probe"\ndate: 2026-07-31\nheaderStyle: text\nheaderImg: /img/home-bg.avif\n---\n\nprobe\n' > data/blog/hidden/zz-conflict-probe.md
yarn contentlayer2 build; echo "exit=$?"
rm data/blog/hidden/zz-conflict-probe.md
yarn contentlayer2 build && git diff --stat app/tag-data.json
```

Expected: 第一次 `exit` **非 0**,錯誤訊息含 `zz-conflict-probe.md` 與 `headerImg`;
刪掉後重建成功且 `app/tag-data.json` 零 diff。**這一步是唯一能證明失敗真的會傳播到 build
的實驗** —— 單元測試只證明函式會拋錯。

- [ ] **Step 8: Commit(commit D)**

```bash
git add lib/hero-config.ts contentlayer.config.ts tests/unit/hero-config.test.ts tests/unit/content-outputs.test.ts
git commit -m "feat: reject conflicting hero front matter at build time

headerStyle: text has no meaning alongside a header image, a background
gradient, a keynote iframe or a mask, and two of the post layouts never render
the hero at all. Rather than resolve those silently by priority, the build now
refuses them and names the file and the fields.

The validator runs first in the existing PR1 orchestration, on every document
rather than the listed view: invalid front matter should not pass merely
because a post happens to be a draft, and the check has to land before
tag-data.json and search.json are written, or a failing build still leaves the
working tree modified.

headerMask is tested against 0 explicitly, because a truthy check would let the
one mask value that renders a fully transparent overlay through.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 原子功能實作(commit E 的產品端)

**Files:**

- Modify: `contentlayer.config.ts`(`headerStyle` 欄位)
- Modify: `css/tailwind.css`(text surface + navbar tone)
- Modify: `lib/hero-mode.ts`(text 模式抑制遮罩)
- Modify: `layouts/PostLayout.tsx`(拿掉 Task 4 的暫時 cast)
- Create: `data/blog/hidden/2026-07-31-header-style-text-test.md`
- Modify: `tests/unit/hero-mode.test.ts`、`tests/unit/hero-rendering.test.tsx`
- Modify: `docs/functionality-settings-manual.zh-TW.md`、`docs/functionality-settings-manual.md`、`README.md`

**⚠️ 本 task 與 Task 9 落在同一個 commit。** 不得先 commit 產品端:若 text hero 先落地而 navbar
tone 在下個 commit,中間會有一個 production 狀態是**白字白底**。

- [ ] **Step 1: 確認 schema 欄位已在 Task 7 加好**

```bash
grep -n "headerStyle" contentlayer.config.ts
```

Expected: 找得到 `headerStyle: { type: 'enum', options: ['text'] },`。

> 欄位在 **Task 7** 就加了(見該 task 的說明:欄位不存在時,驗證失敗路徑的 build probe
> 會反過來證明驗證不存在)。它**只**產生 TypeScript union 與編輯器提示,執行期驗證完全靠
> `parseHeaderStyle`。

- [ ] **Step 2: 拿掉 PostLayout 的暫時 cast**

`layouts/PostLayout.tsx` 的解構已含 `headerStyle`;把 `<HuxHero>` 上的
`headerStyle={headerStyle as 'text' | undefined}` 簡化為:

```tsx
headerStyle = { headerStyle }
```

若 Task 4 用了 `(content as CoreContent<Blog> & { headerStyle?: 'text' })`,改回直接從
`content` 解構。

- [ ] **Step 3: text 模式抑制遮罩(行為改變)**

`lib/hero-mode.ts` 的 `resolveHeroSurface`,把 text 那一行改成:

```ts
// text 模式強制沒有遮罩:沒有底圖就沒有東西需要壓暗,而遮罩會在頁面底色上疊一層灰。
if (config.headerStyle === 'text') return { mode: { kind: 'text' }, maskOpacity: null }
```

在 `tests/unit/hero-mode.test.ts` 把 commit A 那條 text + mask 的斷言**改成**:

```ts
expect(surfaceOf({ headerStyle: 'text', headerMask: 0.6 }).maskOpacity).toBeNull()
```

並把該 describe 的名稱從 `mask opacity is unchanged in commit A` 改成
`mask opacity`,同時保留 keynote + mask 仍渲染的斷言(既有行為)。

- [ ] **Step 4: text surface CSS**

在 `css/tailwind.css` 的 `.intro-header-keynote`(350)那條之後新增:

```css
/* 純文字 hero:沒有底圖、沒有漸層、沒有遮罩,標題直接落在頁面底色上。
   background 用 shorthand 是刻意的 —— 它一併把 background-color 重置為 transparent,
   清掉 .intro-header 的 #777。 */
.intro-header-text {
  background: none;
  --hero-fg: var(--hux-text);
  --hero-border: var(--hux-text);
  --hero-link-hover: var(--hux-interactive);
}

/* Hux 的 style-text 在所有斷點都是 85/20。padding 不是變數,仍需權重:
   單一 class 會跟桌面規則 .intro-header-post .intro-header-content(0,2,0)平手而輸在順序。 */
.intro-header-post.intro-header-text .intro-header-content {
  padding: 85px 15px 20px;
}

/* tag hover 的深色變體是必要的:Hux 的 rgba(0,0,0,.05) 是淺色專用,
   往 rgb(45,45,45) 疊 5% 黑會更暗,回饋直接消失。 */
.intro-header-text .tags .tag:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.dark .intro-header-text .tags .tag:hover {
  background-color: rgba(255, 255, 255, 0.08);
}
```

- [ ] **Step 5: navbar tone(`:has()`)**

在 `.navbar-custom` token 區塊(Task 6 Step 4 新增的那個)之後新增:

```css
/* <Header/> 與 <main>{children}</main> 是兄弟節點,拿不到 frontmatter —— 資訊在下、需求在上,
   React 單向資料流無 prop 路徑可走。:has() 讓瀏覽器做反向查詢,純宣告式:DOM 一變樣式立刻
   跟著變,無 effect、無時序、無殘留狀態。
   刻意不用 main > article > ... 的直接子選擇器鏈 —— 那會把 CSS 綁死在確切 DOM 嵌套上,
   日後多包一層 wrapper 就靜默失效(tone 不再套用且無任何錯誤)。
   加 .intro-header-post 限定:正文 raw HTML 出現同名 class 不會誤觸,並自然排除首頁與 archive。

   桌面的 :not(.is-fixed) 是必要的:fixed 有自己的實心底,而 :has() 權重等於其參數,
   整條是 (0,4,2) 會壓過 .navbar-custom.is-fixed 的 (0,2,0)。用 :not() 讓兩者以 class
   互斥,比賭權重穩健。 */
body:has(main .intro-header-post.intro-header-text) .navbar-custom:not(.is-fixed) {
  --navbar-fg: var(--hux-text);
  --navbar-fg-hover: var(--hux-interactive);
}

/* 手機:JS 在所有 viewport 都會加 is-fixed,但手機沒有 fixed 視覺狀態(那組規則全在
   min-width:768px 內),導覽列始終是 position:absolute 的透明疊層。因此不能被 is-fixed
   排除,否則捲動回頂端途中(scrollY 僅數 px、導覽列已部分可見而 is-fixed 尚未移除)
   會是白字白底。 */
@media (max-width: 767px) {
  body:has(main .intro-header-post.intro-header-text) .navbar-custom {
    --navbar-fg: var(--hux-text);
    --navbar-fg-hover: var(--hux-interactive);
  }
}
```

- [ ] **Step 6: 建 fixture**

Create `data/blog/hidden/2026-07-31-header-style-text-test.md`:

```markdown
---
layout: post
title: 'Header Style Text Test'
subtitle: 'A hero with no image, no gradient and no mask'
date: 2026-07-31
author: 'Claude'
tags: ['Test']
headerStyle: text
hidden: true
---

This fixture exists to exercise the text hero in a real production build.

Everything here is ASCII on purpose. `site-font-text.mjs` recurses into `hidden/`, so this
page counts against the Chiron font budget; printable ASCII already lives in the core subset,
so this page touches exactly one bucket and regenerates no font artifacts.

The link below is required, not decorative. The SPA navigation test needs an internal link
to click, and this fixture has no pager and no series because hidden posts are excluded from
both: [read the OpenWiki article](/2026/07/25/openwiki-tame-agents-md/).

The filler that follows is also required. The navbar has three scroll states, and reaching
the fixed one needs the document to be taller than the viewport by a wide margin. A short
fixture silently degrades those tests: the page cannot scroll past the threshold, the navbar
never gains `is-fixed`, and the assertions pass against the ordinary top-of-page rule instead
of the state they were written for.

Filler paragraph one. This text exists purely to give the document height, and every
character in it is printable ASCII so the font subset gains nothing. The quick brown fox
jumps over the lazy dog, and does so repeatedly, because repetition is what produces pixels.

Filler paragraph two. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph three. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph four. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph five. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph six. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph seven. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph eight. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.
```

> **執行時必須核對兩件事:**
>
> 1. 那條連結指向的文章仍然存在:`ls data/blog/2026-07-25-openwiki-tame-agents-md.md`。
> 2. **fixture 夠高**。build 後在 375×812 與 1280×900 兩個 viewport 量
>    `document.documentElement.scrollHeight - window.innerHeight`,兩者都必須 **> 600**。
>    不夠就再加 filler 段落 —— Task 9 的捲動測試有前置斷言會擋住,但在這裡先確認比較省時間。

- [ ] **Step 7: 補 static rendering 斷言**

Append to `tests/unit/hero-rendering.test.tsx`:

```tsx
describe('text hero suppresses the mask', () => {
  test('即使明確給了 headerMask 也不渲染遮罩', () => {
    expect(render({ title: 'T', headerStyle: 'text', headerMask: 0.6 })).not.toContain(
      'header-mask'
    )
  })

  test('keynote 仍然渲染遮罩 —— 證明抑制是 text 專屬的', () => {
    const html = render({
      title: 'Deck',
      iframe: 'https://slide.allenspace.de/deck/',
      headerMask: 0.6,
    })
    expect(html).toContain('header-mask')
  })
})
```

- [ ] **Step 8: 更新兩份手冊與 README**

兩份手冊的 frontmatter 表格加一列(中英文各一份,內容等義):

- `headerStyle` — 唯一合法值 `text`。啟用純文字 hero:無底圖、無漸層、無遮罩。
- **互斥規則**:與 `headerImg`、`headerBgCss`、`iframe`、`headerMask`、
  `layout: PostSimple` / `PostBanner` 併用會**讓 build 失敗**並指出檔名與衝突欄位。
- **OG 卡策略**:text 模式的社群卡使用預設漸層(`SOCIAL_CARD_FALLBACK`),因為互斥規則
  保證 `headerImg`/`headerBgCss` 兩欄皆空。
- 值拼錯(如 `txt`)也會讓 build 失敗 —— schema 的 `enum` 不做執行期驗證,閘門是
  `lib/hero-config.ts` 的 `parseHeaderStyle`。

`README.md` 的功能清單加一行,描述純文字 hero。**不得寫「全站符合 WCAG」。**

- [ ] **Step 9: 全套檢查**

```bash
yarn contentlayer2 build && yarn tsc --noEmit && yarn eslint app components lib layouts scripts && yarn test:unit && yarn check:site-font --full && git diff --stat app/tag-data.json font-data/ public/static/fonts/
```

Expected: 全部通過;`check:site-font --full` 通過且**零字型產物變動**。
**`app/tag-data.json` 必須零 diff。** fixture 設了 `hidden: true`,而 PR1 的 orchestration
只把 `views.listed` 餵給 tag writer,hidden 一律排除 —— 所以那個 `Test` tag **不可能**進得去。
**任何 diff 都是 publication policy 的回歸,不是預期變動**,出現就停手診斷。

- [ ] **Step 10: 不 commit,交給 Task 9**

Task 9 補完 E2E 測試後一起 commit。

---

## Task 9: text hero 的 E2E 與 commit E

**Files:**

- Create: `tests/playwright/header-style-text.spec.ts`

**Interfaces:**

- Consumes: Task 8 的 fixture(`/2026/07/31/header-style-text-test/`)、Task 1 的 color helper
- Produces: 無

**狀態表(不可寫成笛卡兒積)** —— 斷言並非每格都適用,硬套會逼出 `if (isVisible)` /
`.count()` 防衛式判斷,那是假綠溫床:

| 狀態                               | 驗證(每一項都必須有對應斷言)                                                                                                 | 不適用                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| mobile / top                       | `.icon-bar` 的 **background**、hero 的 `h1`/`.subheading`/`.meta`                                                            | `.navbar-links`(`display:none`)       |
| mobile / near-top-with-`is-fixed`  | navbar 仍套 text tone;**前置斷言 `is-fixed` 仍在且 `scrollY === 5`**                                                         | hero(已捲出)                          |
| mobile / 展開漢堡 + focus `Search` | popup focus 對比 ≥ 4.5                                                                                                       | —                                     |
| desktop / top                      | `.navbar-brand`、`.navbar-links a`、`.theme-switch-text`、trigger SVG、hero 的 `h1`/`.subheading`/`.meta` 全部 `===` body 色 | `.icon-bar`(`display:none`)           |
| desktop / top + 展開 ThemeSwitch   | popup focus 對比 ≥ 4.5、focus surface 對 panel ≥ 3:1                                                                         | —                                     |
| desktop / fixed-visible            | 前景 `=== rgb(45,45,45)`、**hover 等值**                                                                                     | 「brand `===` body 色」**刻意不成立** |
| desktop / fixed-hidden             | `is-fixed` 有、`is-visible` 無、`top === '-61px'`,**不做 hover**                                                             | 元素不可見,hover 會失敗               |

**「hero 全部元素」不是修辭。** #64/#65 連續兩次只斷言父層或只斷言部分屬性,child 的顏色與
字重照樣漂移到 production,#66 才補上。這裡每個 consumer 都要逐一列進 selector 陣列,
而且**圖片文章的對照組要跑同一組 selector** —— 沒有對照組就證明不了斷言有鑑別力。

**捲動狀態一律用 `scrollTo()` helper**,它內含「文件夠不夠高」的前置斷言。
用 `page.mouse.wheel()` + `waitForTimeout()` 的話,fixture 不夠高時捲動量會被夾住,
測試會**靜默退化**成在測 top 狀態 —— 而 `@media (max-width: 767px)` 那條被刪掉照樣綠。

- [ ] **Step 1a: 把既有的 `focusWithKeyboard` 抽成共用 helper**

`tests/playwright/series.spec.ts` 第 44 行已經有一個真正走 Tab 的實作。新 spec 需要同一個
行為,**不要寫第二份** —— 那正是 color helper 那條教訓要避免的。

Create `tests/helpers/focus.ts`,把該函式原封不動搬過來(型別改成從 `@playwright/test` import):

```ts
import type { Locator, Page } from '@playwright/test'

/**
 * 真正用鍵盤 Tab 走到目標元素。
 *
 * 不要用 locator.focus() 取代:那是程式化 focus,規則若哪天收緊成 :focus-visible,
 * 程式化 focus 不會觸發,測試會靜默失去鑑別力而不是變紅。
 */
export async function focusWithKeyboard(page: Page, target: Locator) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let attempts = 0; attempts < 200; attempts += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => document.activeElement === element)) return
  }
  throw new Error('Target did not receive keyboard focus')
}
```

**`series.spec.ts` 的本地版本先留著不動** —— Task 10 才會刪掉它並改為 import,那樣本 task 的
diff 只增不減,`series.spec.ts` 也不會在兩個 commit 之間處於半改狀態。

- [ ] **Step 1b: 寫測試**

Create `tests/playwright/header-style-text.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { contrastOf, contrastRatio, flattenLayers, parseColor } from '../helpers/color'
import { focusWithKeyboard } from '../helpers/focus'

const textPost = '/2026/07/31/header-style-text-test/'
const imagePost = '/2026/07/25/openwiki-tame-agents-md/'

/**
 * ⚠️ **必須在 goto 之後呼叫。** class 是設在當前文件的 <html> 上,導航會換掉整份文件。
 * 而且光靠 emulateMedia 不夠:siteMetadata.theme 是 'dark',next-themes 的 defaultTheme
 * 因此是明確值而不是 'system',新 profile 一律解析成深色 —— 兩輪都會變成在測深色,
 * 而「切換主題必須變色」那條會直接失敗。這也是 series.spec.ts 既有的呼叫順序。
 */
async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme })
  await page.locator('html').evaluate((html, value) => {
    html.classList.toggle('dark', value === 'dark')
  }, theme)
}

async function open(page: Page, path: string, theme: 'light' | 'dark') {
  await page.goto(path)
  await setTheme(page, theme)
}

const colorOf = (page: Page, selector: string, property = 'color') =>
  page
    .locator(selector)
    .first()
    .evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property)

/** 捲到指定位置並等待生效。前置斷言確保文件真的夠高,否則測試會靜默退化成 top 狀態。 */
async function scrollTo(page: Page, y: number) {
  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  )
  expect(
    maxScroll,
    `fixture 不夠高(可捲 ${maxScroll}px),捲不到 ${y}px —— 測試會靜默退化成 top 狀態。請加 filler。`
  ).toBeGreaterThan(y + 100)

  await page.evaluate((target) => window.scrollTo(0, target), y)
  await page.waitForFunction((target) => Math.abs(window.scrollY - target) <= 1, y)
}

// hero 內每個顏色 consumer 都要驗 —— 只驗 h1 正是 #64/#65 踩過的坑:
// 父層看似正確,child 的顏色與字重仍然漂移。
const HERO_CONSUMERS = [
  '.intro-header-text h1',
  '.intro-header-text .subheading',
  '.intro-header-text .meta',
]

// 導覽列的 consumer 同理。.icon-bar 讀的是 background 不是 color。
const NAVBAR_TEXT_CONSUMERS = ['.navbar-brand', '.navbar-links a']

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:text hero 的每個 consumer 都等於 body 色,圖片文章則都是白色`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    const bodyColor = await colorOf(page, 'body')
    for (const selector of [...HERO_CONSUMERS, ...NAVBAR_TEXT_CONSUMERS]) {
      expect(await colorOf(page, selector), selector).toBe(bodyColor)
    }
    // ThemeSwitch 桌面是文字版,也必須跟著 token。
    expect(await colorOf(page, '.theme-switch-text')).toBe(bodyColor)
    expect(await colorOf(page, '.navbar-tool-trigger svg')).toBe(bodyColor)

    // 對照組:圖片文章的同一組 selector 必須是白色 —— 證明上面每一條都有鑑別力。
    await open(page, imagePost, theme)
    for (const selector of [
      '.intro-header-post h1',
      '.intro-header-post .subheading',
      '.intro-header-post .meta',
      ...NAVBAR_TEXT_CONSUMERS,
    ]) {
      expect(await colorOf(page, selector), selector).toBe('rgb(255, 255, 255)')
    }
  })

  test(`${theme}:手機的 .icon-bar 與 hero consumer 一樣跟著 token`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, textPost, theme)

    const bodyColor = await colorOf(page, 'body')
    // .icon-bar 讀的是 background,漏掉它等於漏掉手機唯一的導覽視覺元素。
    expect(await colorOf(page, '.icon-bar', 'background-color')).toBe(bodyColor)
    for (const selector of HERO_CONSUMERS) {
      expect(await colorOf(page, selector), selector).toBe(bodyColor)
    }

    await open(page, imagePost, theme)
    expect(await colorOf(page, '.icon-bar', 'background-color')).toBe('rgb(255, 255, 255)')
  })

  test(`${theme}:text hero 沒有背景圖也沒有遮罩,桌面 padding 是 85/20`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    expect(await colorOf(page, '.intro-header-text', 'background-image')).toBe('none')
    await expect(page.locator('.intro-header-text .header-mask')).toHaveCount(0)

    const content = page.locator('.intro-header-text .intro-header-content')
    expect(await content.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('85px')
    expect(await content.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('20px')

    // 對照組:圖片文章仍有背景圖,且桌面 padding 是 150。
    await open(page, imagePost, theme)
    expect(await colorOf(page, '.intro-header-post', 'background-image')).not.toBe('none')
    expect(
      await page
        .locator('.intro-header-post .intro-header-content')
        .evaluate((el) => getComputedStyle(el).paddingTop)
    ).toBe('150px')
  })
}

test('切換主題時 text hero 的顏色必須跟著變', async ({ page }) => {
  await open(page, textPost, 'light')
  const lightColor = await colorOf(page, '.intro-header-text h1')

  // 同一份文件上切換,不重新導航 —— 這才是使用者實際會做的事。
  await setTheme(page, 'dark')
  const darkColor = await colorOf(page, '.intro-header-text h1')

  // 抄了硬值(例如把 var(--hux-text) 改回 #404040)的話這條會紅。
  expect(darkColor).not.toBe(lightColor)
})

test('hero 外的 tag 邊框仍然完整 —— 不只是 border-color', async ({ page }) => {
  await page.goto('/')
  const tag = page.locator('.post-preview .tags .tag').first()
  await expect(tag).toBeVisible()

  const box = await tag.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      style: style.borderTopStyle,
      widths: [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ],
      color: style.borderTopColor,
      background: getComputedStyle(document.body).backgroundColor,
    }
  })

  // shorthand 失效時 border-color 仍生效、computed 值照樣有,只有 style 變 none、width 變 0。
  expect(box.style).not.toBe('none')
  for (const width of box.widths) expect(parseFloat(width)).toBeGreaterThan(0)
  // 非文字用 WCAG 1.4.11 的 3:1,不是 4.5。
  expect(contrastRatio(parseColor(box.color), parseColor(box.background))).toBeGreaterThanOrEqual(3)
})

// 沒有這條的話,commit B 新增的 `.intro-header .tags .tag { border-color: var(--hero-border) }`
// **完全沒有 oracle**:刪掉它之後淺色 text hero 的 tag 會退回全域 shorthand 的
// rgba(255,255,255,.8),白邊疊在白底上直接看不見,而既有測試(hero 外的 shorthand、
// tag hover 背景)全部照樣綠。
for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:text hero 的 tag 邊框讀 --hero-border 且對底色可見`, async ({ page }) => {
    await open(page, textPost, theme)
    const tag = page.locator('.intro-header-text .tags .tag').first()
    await expect(tag).toBeVisible()

    const measured = await tag.evaluate((el) => ({
      borderColor: getComputedStyle(el).borderTopColor,
      heroBorder: getComputedStyle(el.closest('.intro-header') as HTMLElement)
        .getPropertyValue('--hero-border')
        .trim(),
      page: getComputedStyle(document.body).backgroundColor,
    }))

    expect(parseColor(measured.borderColor)).toEqual(parseColor(measured.heroBorder))
    // 非文字用 WCAG 1.4.11 的 3:1。
    expect(contrastOf(measured.borderColor, [measured.page])).toBeGreaterThanOrEqual(3)
  })

  // 對照組:image hero 的 tag 邊框必須仍是白色半透明,證明上一條測的是 text 專屬的賦值。
  test(`${theme}:image hero 的 tag 邊框仍是白色系`, async ({ page }) => {
    await open(page, imagePost, theme)
    const tag = page.locator('.intro-header-post .tags .tag').first()
    await expect(tag).toBeVisible()

    const borderColor = await tag.evaluate((el) => getComputedStyle(el).borderTopColor)
    const parsed = parseColor(borderColor)
    expect(parsed.r).toBeGreaterThan(200)
    expect(parsed.g).toBeGreaterThan(200)
    expect(parsed.b).toBeGreaterThan(200)
  })
}

test('text hero 的 tag hover:可讀性與方向性是兩個契約', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await open(page, textPost, theme)
    const tag = page.locator('.intro-header-text .tags .tag').first()
    await expect(tag).toBeVisible()

    const read = () =>
      tag.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        page: getComputedStyle(document.body).backgroundColor,
      }))

    const resting = await read()
    await tag.hover()
    const hovered = await read()

    // 契約一:可讀性 —— 文字對合成後的有效背景。
    expect(contrastOf(hovered.color, [hovered.background, hovered.page])).toBeGreaterThanOrEqual(
      4.5
    )

    // 契約二:方向性 —— 合成後實際差異只有 1.12:1 / 1.29:1,本來就不該以 4.5 判定。
    const restingLuminance = flattenLayers([resting.background, resting.page])
    const hoveredLuminance = flattenLayers([hovered.background, hovered.page])
    if (theme === 'light') {
      expect(hoveredLuminance.r).toBeLessThan(restingLuminance.r)
    } else {
      expect(hoveredLuminance.r).toBeGreaterThan(restingLuminance.r)
    }
  }
})

// fixed 狀態的前景在兩個主題**不同**(淺 #2d2d2d / 深 #fff),所以兩輪都必須跑 ——
// 只跑 light 的話 .dark .navbar-custom.is-fixed 那組 token 被刪掉照樣全綠。
const FIXED_FOREGROUND = { light: 'rgb(45, 45, 45)', dark: 'rgb(255, 255, 255)' } as const

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:桌面 fixed-visible 前景正確,hover 完全不變色,popup 對比仍合格`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    // Header.tsx:向下捲且 scrollY > headerHeight(61) 才加 is-fixed;
    // 之後向上捲且 scrollY > 0 才加 is-visible。scrollY 一旦回到 0 就整組移除。
    await scrollTo(page, 500)
    await scrollTo(page, 400)
    await expect(page.locator('.navbar-custom.is-fixed.is-visible')).toBeVisible()

    const brand = page.locator('.navbar-brand')
    const resting = await brand.evaluate((el) => getComputedStyle(el).color)
    // fixed 有自己的實心底,所以 text tone 刻意**不**套用 —— 此時不等於 body 色。
    expect(resting).toBe(FIXED_FOREGROUND[theme])

    await brand.hover()
    // 直接斷言相等比「對比合格」強 —— 後者抓不到 #2d2d2d 漂到 #333。
    expect(await brand.evaluate((el) => getComputedStyle(el).color)).toBe(resting)

    // fixed 狀態下展開 popup:.navbar-custom.is-fixed .navbar-tools svg(0,3,1)原本
    // 壓過 [role='menu'] svg(0,2,1),補償規則在浮動狀態失效 —— 這是本 PR 要修的
    // 既有 cascade 問題,只在 top 狀態測 popup 抓不到它。
    await page.locator('.theme-switch-button').click()
    const item = page.locator('[role="menu"] button').first()
    await item.focus()
    const measured = await item.evaluate((el) => {
      const panel = el.closest('[role="menu"]') as HTMLElement
      return {
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        panel: getComputedStyle(panel).backgroundColor,
      }
    })
    expect(
      contrastOf(measured.color, [measured.background, measured.panel])
    ).toBeGreaterThanOrEqual(4.5)
  })

  test(`${theme}:桌面 fixed-hidden 只驗 class 與位置,不做 hover(元素不可見)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    await scrollTo(page, 500)
    const navbar = page.locator('.navbar-custom')
    await expect(navbar).toHaveClass(/is-fixed/)
    await expect(navbar).not.toHaveClass(/is-visible/)
    // 藏在視窗上緣。hover() 在這個狀態會因不可見而失敗,那是環境問題不是顏色問題。
    expect(await navbar.evaluate((el) => getComputedStyle(el).top)).toBe('-61px')
  })

  test(`${theme}:桌面 top 的 hover 必須真的變色 —— 否則 consumer 不存在時 fixed 那條也會綠`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    const brand = page.locator('.navbar-brand')
    const resting = await brand.evaluate((el) => getComputedStyle(el).color)
    await brand.hover()
    expect(await brand.evaluate((el) => getComputedStyle(el).color)).not.toBe(resting)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:手機 near-top-with-is-fixed 導覽列仍套 text tone 且可讀`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, textPost, theme)

    // 手機沒有 fixed 的視覺狀態(那組規則全在 min-width:768px 內),導覽列始終是
    // position:absolute 的透明疊層。這個狀態就是規範說的「捲回接近頂端」:
    // scrollY 僅數 px、導覽列已部分可見,而 is-fixed 尚未被移除(移除只發生在 scrollY === 0)。
    await scrollTo(page, 500)
    await scrollTo(page, 5)

    // 前置斷言:沒有這兩條的話,scrollY 被夾到 0 會讓 is-fixed 消失,
    // 測試就變成在測一般的 top 規則,@media (max-width:767px) 那條被刪掉也照樣綠。
    await expect(page.locator('.navbar-custom')).toHaveClass(/is-fixed/)
    expect(await page.evaluate(() => window.scrollY)).toBe(5)

    const measured = await page.locator('.navbar-brand').evaluate((el) => ({
      color: getComputedStyle(el).color,
      page: getComputedStyle(document.body).backgroundColor,
    }))
    expect(contrastOf(measured.color, [measured.page])).toBeGreaterThanOrEqual(4.5)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:桌面展開 ThemeSwitch 的 focus 態對比`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    await page.locator('.theme-switch-button').click()
    const item = page.locator('[role="menu"] button').first()
    await item.focus()

    const measured = await item.evaluate((el) => {
      const panel = el.closest('[role="menu"]') as HTMLElement
      return {
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        panel: getComputedStyle(panel).backgroundColor,
      }
    })

    // 文字對 focus 背景(WCAG 1.4.3)。
    expect(
      contrastOf(measured.color, [measured.background, measured.panel])
    ).toBeGreaterThanOrEqual(4.5)
    // focus surface 對 panel(WCAG 1.4.11)—— 只量前者會漏掉「focus 指示器本身看不出來」。
    expect(contrastOf(measured.background, [measured.panel])).toBeGreaterThanOrEqual(3)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:手機展開漢堡後 Search 按鈕的 focus 態對比`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, textPost, theme)

    await page.locator('.navbar-toggle').click()
    // 必須明確 focus Search 按鈕 —— 其他選單項是 <a>,抓不到 button 相關的回歸。
    const search = page.locator('[role="menu"] button', { hasText: 'Search' })
    await search.focus()

    const measured = await search.evaluate((el) => {
      const panel = el.closest('[role="menu"]') as HTMLElement
      return {
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        panel: getComputedStyle(panel).backgroundColor,
      }
    })
    expect(
      contrastOf(measured.color, [measured.background, measured.panel])
    ).toBeGreaterThanOrEqual(4.5)
  })
}

test('SPA 導覽:text → 圖片 → 上一頁,樣式都要跟著切換', async ({ page }) => {
  await page.goto(textPost)

  // full reload 時 URL 與樣式斷言一樣會通過,而 full reload 恰好繞過這條測試要驗的東西。
  await page.evaluate(() => {
    ;(window as unknown as { __spaMarker?: boolean }).__spaMarker = true
  })

  await page.locator('article .prose a[href^="/2026/"]').first().click()
  await page.waitForURL(imagePost)

  expect(
    await page.evaluate(() => (window as unknown as { __spaMarker?: boolean }).__spaMarker)
  ).toBe(true)
  expect(await colorOf(page, '.intro-header-post h1')).toBe('rgb(255, 255, 255)')
  expect(await colorOf(page, '.intro-header-post', 'background-image')).not.toBe('none')

  await page.goBack()
  await page.waitForURL(textPost)
  expect(await colorOf(page, '.intro-header-text', 'background-image')).toBe('none')
  expect(await colorOf(page, '.intro-header-text h1')).toBe(await colorOf(page, 'body'))
})

// ⚠️ 計算色相等**證明不了** utility 已被刪除:.navbar-tool-trigger svg 是未分層規則,
// 本來就會壓過 layered 的 text-gray-*,兩種寫法量到的顏色完全相同。要抓「元件留著
// 顏色 utility」這個突變,只能直接看 class list。
test('trigger 元件不得自帶顏色 utility', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, textPost, 'light')

  // ① 正面存在斷言。只用 `.navbar-tool-trigger` 當 locator 的話,漏加語意 class 的元件
  //    會直接從集合裡消失,測試反而更綠 —— 必須先釘住三個 trigger 都在。
  await expect(page.locator('.theme-switch-button.navbar-tool-trigger')).toHaveCount(1)
  await expect(page.locator('.navbar-toggle.navbar-tool-trigger')).toHaveCount(1)
  await expect(page.locator('.navbar-search-tool.navbar-tool-trigger')).toHaveCount(1)

  // ② popup 內的 Sun/Moon/Monitor 圖示只有展開後才在 DOM 裡。關著的話 evaluateAll
  //    根本看不到它們,而那正是 text-gray utility 的所在地。
  await page.locator('.theme-switch-button').click()
  await expect(page.locator('[role="menu"]')).toBeVisible()

  // locator 刻意**不含** [role="menu"] button:那些按鈕的 text-gray-700! /
  // dark:text-gray-200! 是 popup 自己的契約,規範明訂保留。這裡只管 trigger 與圖示 ——
  // Sun/Moon/Monitor 三個圖示元件在 trigger 與 popup 兩處共用同一份 className。
  const classNames = await page
    .locator('.navbar-tool-trigger, .navbar-tool-trigger svg, [role="menu"] svg')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('class') ?? ''))

  expect(classNames.length).toBeGreaterThan(3)
  for (const className of classNames) {
    // ③ 任意前綴都要擋。實際存在的是 `group:hover:text-gray-100`,
    //    只寫 (dark:)?(hover:)? 的話抓不到 group: 這個前綴。
    expect(className, className).not.toMatch(/(^|\s)[\w:-]*text-gray-\d/)
    expect(className, className).not.toMatch(/(^|\s)[\w:-]*text-primary-\d/)
  }
})

test('trigger 的 SVG 顏色確實跟著 --navbar-fg', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, textPost, 'light')

  const svgColor = await colorOf(page, '.navbar-tool-trigger svg')
  const navbarFg = await page
    .locator('.navbar-custom')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--navbar-fg').trim())

  expect(parseColor(svgColor)).toEqual(parseColor(navbarFg))
})

// ── text hero 的 series 連結:CSS consumer harness ──────────────────────────
// hidden fixture 進不了系列(series 收集會跳過 listed === false),所以真實 text
// fixture 頁面上**沒有 .series-meta 元素**。注入同形元素補這一層。
//
// 注入位置必須是 .intro-header-text .post-heading 內 —— 放在 hero 任意位置的話
// 選擇器根本不匹配。class list 必須完整:省略 .post-series-link-top 會製造
// production 不存在的 cascade。
//
// oracle 分工:刪掉 hero 專屬 consumer **不會**讓這裡變紅(--hero-link-hover 就是
// --series-interactive,遞補後同值),那由既有的 image-series E2E 負責。
// 這個 harness 專門守「--hero-link-hover 沒被改回硬編碼 #66c7e0」——
// 那個值對淺色底的對比只有 1.94。
async function injectSeriesHarness(page: Page) {
  await page.locator('.intro-header-text .post-heading').evaluate((heading) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'post-series-link post-series-link-top series-meta'
    const link = document.createElement('a')
    link.href = '/series/harness/'
    link.textContent = 'harness series'
    wrapper.append(link)
    heading.append(wrapper)
  })
  return page.locator('.intro-header-text .series-meta a')
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:text hero 的 series 連結 hover 可讀且真的變色`, async ({ page }) => {
    await open(page, textPost, theme)
    const link = await injectSeriesHarness(page)

    const read = () =>
      link.evaluate((el) => ({
        color: getComputedStyle(el).color,
        page: getComputedStyle(document.body).backgroundColor,
      }))

    const resting = await read()
    await link.hover()
    const hovered = await read()

    expect(hovered.color).not.toBe(resting.color)
    // 改回硬編碼 #66c7e0 的話,淺色這一輪會是 1.94。
    expect(contrastOf(hovered.color, [hovered.page])).toBeGreaterThanOrEqual(4.5)
  })

  test(`${theme}:text hero 的 series 連結 focus 可讀且真的變色`, async ({ page }) => {
    await open(page, textPost, theme)
    const link = await injectSeriesHarness(page)

    const resting = await link.evaluate((el) => getComputedStyle(el).color)
    // 必須是**真的鍵盤** focus。link.focus() 是程式化 focus,規則若哪天收緊成
    // :focus-visible,程式化 focus 不會觸發而測試會靜默失去鑑別力。
    // 規則同時宣告 hover 與 focus,只測 hover 的話刪掉 focus arm 照樣綠。
    await focusWithKeyboard(page, link)
    const focused = await link.evaluate((el) => ({
      color: getComputedStyle(el).color,
      page: getComputedStyle(document.body).backgroundColor,
    }))

    expect(focused.color).not.toBe(resting)
    expect(contrastOf(focused.color, [focused.page])).toBeGreaterThanOrEqual(4.5)
  })
}
```

- [ ] **Step 2: 跑 production build 與新測試**

先確認 3012 沒有殘留程序,再讓 build 在**前景**跑完:

```bash
test -f /tmp/blog-server.pid && kill "$(cat /tmp/blog-server.pid)" 2>/dev/null; rm -f /tmp/blog-server.pid
lsof -ti:3012 || echo "port free"
```

```bash
yarn build
```

```bash
set -o pipefail
yarn playwright test tests/playwright/header-style-text.spec.ts 2>&1 | tail -30
```

> 三段分開跑。`yarn build && yarn playwright ... &` 之類的寫法在 zsh 會把整個 AND-list
> 背景化,而 `playwright.config.ts` 的 `webServer` 又會自己跑一次 build —— 兩個 contentlayer
> 同時執行會被 lockfile 擋住。這裡讓 build 在前景跑完,webServer 的重建就是增量的。
> Playwright 自己管理它啟動的 server,所以這一步不需要手動啟動。

Expected: 全部 PASS。若 `.post-preview .tags .tag` 找不到,先確認首頁確實有帶 tag 的文章卡片;
**不要**改成 count-based 跳過(那是假綠)。

- [ ] **Step 3: 跑完整 parity 套件**

```bash
set -o pipefail
yarn test:parity 2>&1 | tail -30
```

Expected: 全綠。**驗證完依 Global Constraints 的關閉流程收工,並確認 `lsof -ti:3012` 為空。**

- [ ] **Step 4: production 目視驗收**

兩主題 × mobile/desktop 截圖;兩個捲動狀態(含手機「捲回接近頂端」);手機展開漢堡、桌面展開
ThemeSwitch(含 focus 態);**在頁面上實際切換主題(非重載)**確認顏色即時跟著變。

- [ ] **Step 5: 自檢**

```bash
git diff | grep -nE "^\+.*#[0-9a-fA-F]{3,6}\b" | grep -v "test\|spec"
```

Expected: **產品端的 diff 不應出現任何新的十六進位色碼**。有的話代表 commit B/C 沒做乾淨,
先停下檢查。(fixture、測試與手冊裡的色碼是可以的。)

- [ ] **Step 6: Commit(commit E)**

```bash
git add contentlayer.config.ts css/tailwind.css lib/hero-mode.ts layouts/PostLayout.tsx data/blog/hidden/2026-07-31-header-style-text-test.md tests/unit/hero-mode.test.ts tests/unit/hero-rendering.test.tsx tests/playwright/header-style-text.spec.ts docs/functionality-settings-manual.zh-TW.md docs/functionality-settings-manual.md README.md
git commit -m "feat: add a text-only post hero

headerStyle: text drops the header image, the gradient and the mask, and puts
the title straight on the page background, matching the upstream Hux theme's
style-text.

The navbar has to change with it, which is why this is one commit rather than
two. A text hero leaves the navbar sitting on the page background, so shipping
the hero first would put a production deploy in a state where the brand is
white on white. The tone switch is a :has() rule rather than a prop, because
Header and main are siblings -- the information is below and the requirement is
above, and React's data flow offers no path between them. It matches on
main .intro-header-post.intro-header-text rather than a child chain, so adding
a wrapper cannot silently disable it.

The mobile rule is not excluded by :is-fixed, unlike the desktop one. The
script adds that class at every viewport, but the fixed visual state exists
only above 768px, so excluding it would make the navbar white on white while
scrolling back toward the top.

Tag hover gets a dark variant because Hux's rgba(0,0,0,.05) is light-mode only;
layering 5% black over rgb(45,45,45) darkens it further and the feedback
disappears.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: `series.spec.ts` 統一與教訓記錄(commit F)

**Files:**

- Modify: `tests/playwright/series.spec.ts`
- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: Task 1 的 color helper
- Produces: 無

- [ ] **Step 1: 改用共用 color 與 focus helper**

刪除 `tests/playwright/series.spec.ts` 頂端自己那份 `relativeLuminance` 與 `contrastRatio`
(8-24 行),**以及第 44 行的本地 `focusWithKeyboard`**(Task 9 已把它搬到
`tests/helpers/focus.ts`),改成:

```ts
import { contrastOf, contrastRatio, parseColor } from '../helpers/color'
import { focusWithKeyboard } from '../helpers/focus'
```

把檔內所有 `contrastRatio(a, b)` 的呼叫改成 `contrastRatio(parseColor(a), parseColor(b))`,
或在需要合成背景的地方改用 `contrastOf(fg, [bg, pageBg])`。

> 它目前保留著自己那份**丟掉 alpha** 的 parser(`.match(/\d+(?:\.\d+)?/g)?.slice(0, 3)`),
> 留著就是留一份已知錯誤的第二實作。

- [ ] **Step 2: 修正註解措辭**

搜尋 `series.spec.ts` 裡宣稱「Hero 永遠是深色照片」的註解,改成限定於**該 image hero fixture**:

```ts
// 這個 fixture 的 hero 是深色照片,所以 hover 色在兩個主題必須相同。
// (headerStyle: text 的文章不適用 —— 那裡的 hero 就是頁面底色,會隨主題翻轉。)
```

- [ ] **Step 3: 補 image hero 的 focus 契約**

`:focus` 目前**完全沒有 oracle** —— 規則宣告 hover+focus,但兩邊測試都只測 hover,
只刪 focus arm 全部照樣綠。在 `series.spec.ts` 既有的 hover 測試旁補一條:

```ts
test('image hero 的 series 連結 focus 色在兩個主題必須相同', async ({ page }) => {
  const measure = async (theme: 'light' | 'dark') => {
    // goto 先、setTheme 後 —— 這是本檔既有的順序,反過來的話 class 會被導航沖掉。
    await page.goto('/2026/07/25/openwiki-tame-agents-md/')
    await setTheme(page, theme)
    const link = page.locator('.intro-header-post .series-meta a').first()
    // 真的鍵盤 focus,與 text harness 同一個 helper。程式化 focus 在規則收緊成
    // :focus-visible 時不會觸發,測試會靜默失去鑑別力。
    await focusWithKeyboard(page, link)
    return link.evaluate((el) => getComputedStyle(el).color)
  }

  expect(await measure('light')).toBe(await measure('dark'))
})
```

> **路徑必須寫成字面值** —— 這個檔案沒有 `articlePath` 常數,文章路徑是在既有測試裡逐處
> 硬編碼的(例如第 89 行)。執行時確認該路徑仍存在。
>
> 這條的鑑別力來自「**這個 fixture 的** hero 是深色照片,所以 focus 色不隨主題翻轉」;
> hero 專屬 consumer 被刪掉(遞補到隨主題翻轉的 `--series-interactive`)或 focus arm
> 被刪掉,都會讓它紅。

- [ ] **Step 4: 記錄教訓到 `AGENTS.md`**

在環境陷阱那一節加入(繁體中文,維持該檔既有的條列風格):

- **`.navbar-tools button` / `.navbar-tools svg` 這類包含式 selector 會命中 HeadlessUI popup
  內部**(選單行內渲染於該子樹)。頂欄 trigger 的樣式一律綁 `.navbar-tool-trigger`,
  **不要**用容器後代選擇器 —— 那需要一組 `[role='menu']` 補償規則,而 `.is-fixed` 的
  descendant 宣告權重更高,補償在浮動狀態會失效。
- **contentlayer2 的 `type: 'enum'` 不做執行期驗證**(原始碼是兩個 TODO),生成的型別會說謊。
  任何 enum 欄位都必須另外寫執行期 parser,例如 `lib/hero-config.ts` 的 `parseHeaderStyle`。
- **顏色斷言一律用 `tests/helpers/color.ts`**,不要在 spec 裡自己寫 parser。半透明色必須沿
  祖先鏈合成到第一個不透明背景;`oklch()` 要真的轉換,用數字 regex 讀會靜默算錯。
- **Playwright 切主題必須 `goto` 先、`setTheme` 後。** class 設在當前文件的 `<html>` 上,
  導航會換掉整份文件。而且**光靠 `emulateMedia` 不夠** —— `siteMetadata.theme` 是 `'dark'`,
  next-themes 的 `defaultTheme` 因此是明確值而非 `'system'`,新 profile 一律解析成深色。
  順序寫反時「兩個主題各跑一輪」會**靜默變成跑兩輪深色**,而不是報錯。
- **捲動狀態的測試必須有前置斷言**:先確認文件高度足夠(`scrollHeight - innerHeight`),
  再斷言 `window.scrollY` 與 `is-fixed` / `is-visible` class 確實到位。fixture 不夠高時
  捲動量會被夾住,測試**靜默退化**成在測 top 狀態 —— 手機那條 `@media (max-width: 767px)`
  的 override 被刪掉照樣綠。`Header.tsx` 只在 `scrollY === 0` 時移除 `is-fixed`,所以
  「捲回接近頂端」要用小的非零 offset(例如 5px),不是回捲到底。
- **`A && B &` 在 zsh 會把整個 AND-list 背景化。** `yarn build && yarn serve ... &` 會讓
  build 在背景跑,而 Playwright 的 `webServer` 又會啟一次自己的 build —— 兩個 contentlayer
  同時跑會被 lockfile 擋住。build 一律前景跑完,只把 server 放背景並輪詢等 port ready。

- [ ] **Step 5: 檢查**

```bash
set -o pipefail
yarn eslint app components lib layouts scripts && yarn tsc --noEmit && yarn test:unit && yarn test:parity 2>&1 | tail -30
```

Expected: 全部通過。**驗證完依 Global Constraints 的關閉流程收工。**

- [ ] **Step 6: Commit(commit F)**

```bash
git add tests/playwright/series.spec.ts AGENTS.md
git commit -m "test: share one colour implementation and give focus an oracle

series.spec.ts kept its own parser that read the first three numbers out of a
colour string, which discards alpha and silently misreads oklch as RGB. It now
uses the shared helper, so there is one implementation to keep correct.

The focus arm of the series link rule had no test at all -- both suites
asserted hover only, so deleting :focus left everything green. The new
assertion pins that the focus colour is identical across themes, which holds
because this fixture's hero really is a dark photograph. The comment claiming
that of every hero is now scoped to this fixture, since a text hero is the page
background and does flip.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: OpenWiki 重生成(commit G)

**Files:**

- Modify: `openwiki/**`(生成產物,**不得手改**)

- [ ] **Step 1: 從已提交的狀態建乾淨 worktree**

```bash
WT=$(mktemp -d)/openwiki-pr2
git worktree add --detach "$WT" HEAD
git -C "$WT" status --short
echo "WORKTREE=$WT"
```

Expected: `git status` **無輸出**(worktree 乾淨),最後一行印出實際路徑。

> **把印出來的 `WORKTREE=` 路徑抄下來,後續每一步都用那個字面路徑。** shell 變數
> **不跨 Bash 呼叫保存**(每次呼叫是獨立的 shell),所以下一步再寫 `$WT` 會展開成空字串,
> 而 `git -C "" ...` 會落到當前目錄 —— 那正是主工作樹,等於整個 worktree 隔離失效。
> 用 `mktemp -d` 而不是寫死路徑,是因為 session 專屬的暫存目錄不保證存在。

Expected: 第二個指令**無輸出**(worktree 乾淨)。

> **必須用 `--detach`** —— 分支已被主工作區佔用,`git worktree add <path> <branch>` 會失敗。
> **必須用 worktree** —— `next-env.d.ts` 會反覆翻動而守則同時禁止 checkout 還原與 gitignore 它,
> 所以主工作樹永遠不是乾淨的,直接跑會每次觸發付費完整重生成。

- [ ] **Step 2: 重生成**

```bash
cd <WORKTREE> && openwiki code --update --print
```

**必須帶 `--print`** —— 這是本專案唯一支援的完整命令。

- [ ] **Step 3: 帶回並 review**

```bash
cd /Users/allen/Dev/blog_Refactoring/myblog-nextjs
cp -R <WORKTREE>/openwiki/. openwiki/
git diff --stat openwiki
git diff openwiki
```

逐一 review。**確認它沒有改到 `AGENTS.md` / `CLAUDE.md` / `.github/`** ——
`openwiki --update` 每次執行都會重跑 repo setup。

- [ ] **Step 4: Commit 並清理**

```bash
git add openwiki && git commit -m "docs: regenerate OpenWiki for the text hero

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git worktree remove --force <WORKTREE>
git worktree list
```

- [ ] **Step 5: 確認 `next-env.d.ts` 沒有被誤入庫**

```bash
git log --name-only --format="" origin/main..HEAD | grep -c "next-env.d.ts" || echo "clean"
```

Expected: `0` 或 `clean`。

---

## Task 12: 開 PR

- [ ] **Step 1: 最後確認基底沒有落後**

```bash
git fetch origin main && git rev-list --left-right --count main...origin/main
```

Expected: 右側為 `0`。若不為 0,先同步再繼續。

- [ ] **Step 2: 推分支並開 PR**

```bash
git push -u origin feat/header-style-text
```

```bash
gh pr create --title "feat: text-only post hero (headerStyle: text)" --body "$(cat <<'BODY'
支援 `headerStyle: text`:文章 hero 不放底圖、不放漸層、不放遮罩,標題與 metadata 直接落在頁面底色上(對齊 Hux 原始主題的 `style-text`)。

## 為什麼不是窄改法

hero 的 8 個色值常數加上導覽列的 6 個,**全部在編碼同一個事實:「hero 背景永遠是深色」**。`headerStyle: text` 是第一個讓它變成假的東西。窄改法會留下 14 個原常數 + 一組平行覆寫,兩種模式可無聲漂移;token 化讓 text 模式縮成數行變數賦值。

## 怎麼做的

- `lib/hero-config.ts` 是**唯一**做 coercion 的地方(raw frontmatter → parsed domain object),validator 與 resolver 共用**解析後的物件**而不是一組 helper 慣例
- `lib/hero-mode.ts` 把它解析成 discriminated union;元件只依 union 渲染
- 顏色改由 `.intro-header` / `.navbar-custom` 上的 CSS 變數承載
- 導覽列 tone 用 `:has()` 反向查詢 —— `<Header/>` 與 `<main>` 是兄弟節點,React 無 prop 路徑

## 順帶修掉的既有缺陷

- **popup focus 的對比是 2.31**(白字對 `--color-primary-600`,而該 token 被單獨覆寫成青色 `#4db8d1`),兩個主題都不合格。改成成對 token 後是淺 **6.49** / 深 **7.09**
- `.navbar-tools button` / `svg` 會命中 HeadlessUI popup **內部**,原本靠兩組 `[role='menu']` 補償規則抵銷,而 `.is-fixed` 的 descendant 宣告權重更高,補償在浮動狀態失效。改用 `.navbar-tool-trigger` 正面列舉後補償規則整組刪除
- `series.spec.ts` 自己那份顏色 parser **丟掉 alpha**、且會把 `oklch()` 誤讀成 RGB。統一到 `tests/helpers/color.ts`
- `:focus` 原本**完全沒有 oracle**:規則宣告 hover+focus,但兩邊測試都只測 hover,只刪 focus arm 全部照樣綠

## 驗證

- `yarn test:unit` 全綠(新增 5 支 unit spec,含顏色 helper 的 golden tests)
- `yarn test:parity` 手動跑過全綠(Playwright 不是 CI gate)
- `yarn check:site-font --full` 通過,**零字型產物重生成**(fixture 全 ASCII)
- commit A/B/D 的驗收是**零像素變動**;**commit C 刻意有變動**,已逐項確認

## 已知未處理(刻意)

- `layout: PostSimple` / `PostBanner` 的組合由 validator 在 build 時拒絕,但那是 **denylist** —— 未來新增其他不 render `HuxHero` 的 layout 仍會漏掉(capability registry 屬另案)
- keynote(`iframe`)+ `headerMask` 會把遮罩渲染在 iframe 上。既有行為,未觀察到有文章使用
- `text` + `images` frontmatter 時 JSON-LD 仍會用 `images[0]`。`images` 不是自動 OG 欄位,不影響 hero
- series + text 沒有真實內容路徑的測試覆蓋(hidden fixture 進不了系列),僅有 CSS consumer harness
- **全域 focus outline 仍是 2.31**,是獨立的第三件事。因此**沒有**宣稱全站符合 WCAG

設計文件:`docs/superpowers/specs/2026-07-30-header-style-text-design.md`
實作計畫:`docs/superpowers/plans/2026-07-31-header-style-text.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: 等必過檢查綠燈**

```bash
gh pr checks --watch
```

Expected: `ci` 與 `check` 兩個都綠。卡在 pending 先查 `gh pr view --json mergeStateStatus`。

---

## Self-Review 結果

**Spec coverage:** spec 的 5 個目標對應 —— 目標 1(frontmatter + build 閘門)→ Task 2/7/8;
目標 2(本 PR 觸及介面的 WCAG)→ Task 6 的成對 token + Task 9 的對比斷言;目標 3(逐值複製 Hux
淺色外觀)→ Task 8 Step 4;目標 4(消除 14 個常數)→ Task 5 + Task 6;目標 5(popup 正規化)→
Task 6。spec 的突變測試矩陣共 24 條:`parseHeaderStyle`/validator/orchestration 共 5 條由
Task 2/7 覆蓋,resolver 與 renderer 共 4 條由 Task 3/4/8 覆蓋,CSS 與導覽列共 13 條由 Task 9
覆蓋,顏色 helper 2 條由 Task 1 覆蓋。

**已知的計畫層限制(刻意,不是遺漏):**

1. **`hero-rendering.test.tsx` 需要改 `vitest.config.ts` 的 include**(現況只收 `.ts`)。
   這是計畫新增的必要調整,不是既有設定的缺陷。
2. **Task 9 的兩個路徑常數必須在執行時核對** —— `imagePost` 取決於 `data/blog/` 的實際內容,
   fixture 正文的 internal link 也指向它。計畫中已標註。
3. **`.post-preview .tags .tag` 這個 locator 假設首頁至少有一篇帶 tag 的文章**。實測過側邊目錄
   與文章正文都沒有 tag producer,所以不要為不存在的 locator 寫 count-based 跳過。
4. **commit E 的 `app/tag-data.json` 必須零 diff。** fixture 是 `hidden: true`,而 PR1 的
   orchestration 只把 `views.listed` 餵給 tag writer,所以 `Test` tag 進不去。這是 PR1 的
   直接好處:**任何 diff 都代表可見性政策回歸**。因此它也不在 commit E 的 `git add` 清單裡
   —— 列進去只會讓別的東西被誤 stage。
5. **`ContentOutputDeps` 的 `assertValidHeroConfigurations` 維持 optional。** PR1 這樣定義是
   因為當時沒有實作可注入。PR2 落地後它就永遠會被注入,理論上可以收緊成 required —— 但那會
   改到 PR1 剛穩定下來的公開型別,而現有的「validator 拋錯時三個 writer 呼叫數為 0」加上
   config wiring 的錨定斷言已經覆蓋了「忘記注入」這個突變。**列為後續改善,不在本 PR。**

**外部審查(2026-07-31)後修正的七項,記錄在此避免再犯:**

| 問題                                                                                                   | 修正                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Task 4 要求 text 模式無遮罩,但抑制遮罩排在 Task 8 → commit A 不可能全綠                                | Task 4 的 text 測試不再設 `headerMask`;抑制斷言留在 Task 8                                                                    |
| 規範要求的 text-Series harness 整段漏掉,而 Self-Review 宣稱有                                          | Task 9 補上 `injectSeriesHarness`,hover 與 focus 各一輪 × 兩主題                                                              |
| `setTheme` 在 `goto` 之前呼叫 → class 被導航沖掉;`defaultTheme` 是 `dark`,兩輪其實都在測深色           | 新增 `open(page, path, theme)`,強制 goto 先、setTheme 後                                                                      |
| fixture 太短,捲不到 fixed threshold;mobile 回捲會夾到 0 而移除 `is-fixed`                              | fixture 加 ASCII filler;`scrollTo()` 內含高度前置斷言;狀態用明確 offset 與 class 前置斷言                                     |
| 狀態表寫「全部元素」,測試只驗 `h1` 與 brand                                                            | 改成明列 selector 陣列,含 `.subheading`、`.meta`、`.navbar-links a`、`.theme-switch-text`、`.icon-bar`,並補 fixed-hidden 狀態 |
| Task 10 用了不存在的 `articlePath` 常數                                                                | 改成字面路徑                                                                                                                  |
| `yarn build && yarn serve ... &` 在 zsh 會把整個 AND-list 背景化,與 Playwright 的 webServer 並行 build | build 前景跑完,只把 server 放背景並輪詢等待 ready                                                                             |

**第三輪外部審查(2026-07-31)後修的八項 P1:**

| 問題                                                                                                                                                                                                                                     | 修正                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 7 的 build probe 期待失敗,但 `headerStyle` 到 Task 8 才進 schema。contentlayer 只把 `fieldDefs` 宣告過的欄位放進文件物件,probe 的該欄位會被整個丟掉 → validator 看不到衝突 → build 成功。**驗證失敗路徑的實驗反過來證明驗證不存在** | enum 欄位移到 Task 7 Step 4,probe 之前就位;Task 8 改為確認它已存在                                                                                      |
| `deps` 範例被 prettier 重排成 `{ ;(a, b, c, d) }` —— 那是 block statement 加 comma expression,貼進第三個參數是語法錯誤(這是我自己跑 prettier 造成的)                                                                                     | 改寫成**完整的 `onSuccess` 呼叫**,prettier 無法把它誤判成 block                                                                                         |
| 刪掉 `[role='menu'] button` 補償規則會讓 ThemeSwitch 三個 MenuItem 退成 400/normal —— 它們只有 `text-sm`,`font-weight: 600` 與 `letter-spacing: .025em` **完全來自那條規則**(MobileNavMenu 則自帶)                                       | 新增 Step 4b:先把 `font-semibold tracking-wide` 搬進元件再刪規則;驗收表改成用 `getComputedStyle` 逐項量五個屬性                                         |
| 狀態矩陣沒落實「每個狀態各跑淺/深兩輪」:fixed-visible、fixed-hidden、mobile near-top、mobile Search 都只跑 light,mobile top 漏 brand 與 ThemeSwitch 圖示,fixed-visible 沒測 popup,圖片對照組漏 `theme-switch-text` 與搜尋 SVG            | 四組測試全部改成雙主題迴圈;fixed 前景改用 `FIXED_FOREGROUND[theme]` 對照表;fixed-visible 補 popup 對比(既有的 fixed-popup cascade 缺陷只在這個狀態現形) |
| commit B 新增的 `.intro-header .tags .tag { border-color: var(--hero-border) }` **完全沒有 oracle** —— 刪掉後淺色 text hero 會是白邊疊白底而不可見,所有測試照樣綠                                                                        | 新增雙主題斷言:border-color `===` `--hero-border`,且對底色 ≥ 3:1;另加 image hero 對照組                                                                 |
| utility mutation test 假綠三重:regex 抓不到實際存在的 `group:hover:text-gray-100`;locator 只收**已經帶** `.navbar-tool-trigger` 的元素,漏加 class 的元件會從集合消失反而更綠;popup 關著時 Sun/Moon/Monitor 根本不在 DOM                  | 先做三個 trigger 的**正面存在斷言**,展開 popup 後再收集,regex 改成允許任意前綴                                                                          |
| `yarn test:parity 2>&1 \| tail -N` 在未開 pipefail 的 zsh 回傳 tail 的 0,Playwright 紅燈仍會繼續往下走(Task 5/6/9/10 同一模式)                                                                                                           | 五處全部改為 `set -o pipefail` 獨立一行在前                                                                                                             |
| 宣稱 commit E 的 `app/tag-data.json` 會因 fixture 的 `Test` tag 變動 —— 但 fixture 是 `hidden: true`,PR1 只把 `views.listed` 餵給 tag writer,那個 tag **進不去**                                                                         | 改成「必須零 diff,任何 diff 都是可見性政策回歸」,並把它從 commit E 的 `git add` 清單移除                                                                |

另修三個次要項:validator wiring 的 regex 錨定到 deps 物件實字(原本會匹配到 import 行);
trigger utility 的刪除改用 **class list** 斷言(計算色相等證明不了 —— 未分層 CSS 本來就會蓋掉
utility);OpenWiki worktree 改用 `mktemp -d`。

**第二輪外部審查(2026-07-31)後再修的五項 P2:**

| 問題                                                                                                                                                    | 修正                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenWiki 的 `$SP` 不跨 Bash 呼叫保存,展開成空字串會讓 `git -C ""` 落到主工作樹,隔離失效;指令也沒印出實際路徑                                            | Step 1 改印 `WORKTREE=`,後續步驟一律用抄下來的字面路徑(計畫裡寫成 `<WORKTREE>` 佔位)                                                                      |
| server readiness 迴圈無上限、無存活檢查,啟動失敗會永久等待;`kill $(lsof -ti:3012)` 會誤殺剛好占用該埠的其他程序                                         | Global Constraints 新增「啟動與關閉 production server(標準流程)」:90 秒上限、每輪 `kill -0` 檢查存活、PID 寫檔並用 PID 關閉。三處臨場指令全部改為引用該節 |
| Series focus 測試註解宣稱鍵盤 focus,實際用 `link.focus()`(程式化);而 `series.spec.ts:44` 已有真正走 Tab 的 `focusWithKeyboard()`                        | Task 9 Step 1a 先把它抽到 `tests/helpers/focus.ts`,新 spec 直接 import;Task 10 才刪掉 `series.spec.ts` 的本地版本                                         |
| hex parser 的 `/^#[0-9a-f]{3,8}$/` 會收下 5/7 位值,再用 `size=2` 切成看似合理的錯誤顏色                                                                 | 收緊成 `{3,4}`\|`{6}`\|`{8}`,並補三條非法長度必須拋錯的 golden test                                                                                       |
| Task 5 Step 6 宣稱既有 image test 是 `--hero-link-hover` 的守門員 —— 它只守 consumer 的**刪除**,守不住改回硬編碼 `#66c7e0`(image hero 上那個值本來就對) | 改寫成明確的「守得住什麼、守不住什麼」,並載明 **commit B 落地時該保護尚未到位**,隨 Task 9 的 text harness 才補齊                                          |

**Type consistency:** `RawHeroConfiguration`、`ParsedHeroConfiguration`、`HeroMode`、
`HeroSurface`、`Rgb` 五個型別在 Task 1/2/3 定義,Task 4/7/8/9 使用時名稱與參數順序一致。
函式名 `parseHeaderStyle`、`parseHeroConfiguration`、`resolveHeroSurface`、
`validateHeroConfiguration`、`assertValidHeroConfigurations`、`parseColor`、`compositeOver`、
`flattenLayers`、`relativeLuminance`、`contrastRatio`、`contrastOf` 已逐一對照。

**PR1 seam 的不可退化保證:** Task 7 只往 `deps` 加一個鍵,並用一條**反向**斷言
(`not.toMatch(/runContentDerivedOutputs\(\s*allBlogs\s*,\s*\{/)`)擋住「順手改回舊簽章」——
那會讓 tag/search 重新收到未過濾的 `allBlogs`,把 PR1 的 draft gate 倒退回去。
