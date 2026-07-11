# 功能與設定操作說明書

> English version: [functionality-settings-manual.md](./functionality-settings-manual.md)

本說明書描述 Allen's Blog(`blog.allenspace.de` 從 Jekyll/Hux 遷移到 Next.js 後的新站)的
操作、設定與維護方式,對象是內容撰寫與站點維護,不涉及應用程式碼修改。

技術棧概觀:Next.js 15(App Router)+ Contentlayer2 + Tailwind CSS v4 + Pliny,上面移植了
Hux Blog 的視覺語言,並以 Serwist 提供 PWA 支援。

## 1. 撰寫文章

文章放在 `data/blog/**/*.md` 或 `*.markdown`,以 MDX 處理。

### 檔名與網址規則

- 檔名的日期前綴(如 `2025-10-13-my-post.md`)會被剝除,產生 slug(`my-post`)。
- 公開網址是 `/YYYY/MM/DD/slug/` — 由 **front matter 的 `date`** 決定,不是檔名日期。全站
  強制結尾斜線(`trailingSlash: true`)。
- 已遷移文章的日期務必保持穩定:網址同時餵給 giscus 留言對應、SEO、feed 與舊站外部連結。

### Front matter 欄位

| 欄位           | 型別        | 必填 | 行為                                                                           |
| -------------- | ----------- | ---- | ------------------------------------------------------------------------------ |
| `title`        | string      | ✅   | 顯示/SEO/搜尋/feed 標題與結構化資料 headline。                                 |
| `date`         | date        | ✅   | 發佈日期;決定 `/YYYY/MM/DD/` 網址前綴。                                        |
| `tags`         | string list |      | 標籤頁、archive 篩選、feed、文章頁首。標籤頁使用 slug 化名稱。                 |
| `update`       | date        |      | 顯示為更新日期;同時作為 sitemap/SEO 的 `lastmod`。                             |
| `draft`        | boolean     |      | 草稿在 production build 排除於列表、sitemap、RSS 與標籤計數。                  |
| `subtitle`     | string      |      | 顯示副標;也是 SEO/feed 的 `summary` 後備值。                                   |
| `images`       | string/list |      | JSON-LD `image` 後備值(順位在 `headerImg` 之後)與 `PostBanner` 版面背景。**不會**用於自動產生的 `og:image`/Twitter 卡片 — 見 §6。 |
| `authors`      | string list |      | 以檔名引用 `data/authors/*.mdx`;預設 `default`。                               |
| `author`       | string      |      | 舊制單作者欄位;版面主要看 `authors`。                                          |
| `layout`       | string      |      | `PostLayout`(預設)、`PostSimple`、`PostBanner`;未知值退回 `PostLayout`。       |
| `bibliography` | string      |      | `rehype-citation` 用的 BibTeX 檔(參考 `data/references-data.bib`)。            |
| `canonicalUrl` | string      |      | 僅存在於 schema;文章路由一律輸出生成的 legacy canonical 路徑。                 |
| `headerImg`    | string      |      | Hero 圖;同時餵給 JSON-LD `image` 與自動產生的社群卡片背景(§6)。                |
| `headerBgCss`  | string      |      | Hero 的自訂 CSS 背景(`headerImg` 的替代方案)。                                 |
| `headerMask`   | number/json |      | Hero 遮罩不透明度。                                                            |
| `iframe`       | string      |      | 全版 hero iframe(投影片/keynote 文章)。來源必須通過 `lib/iframe.ts` 允許清單。 |
| `catalog`      | boolean     |      | 在文章頁顯示黏性目錄側欄(桌面 ≥1200px)。                                       |
| `hidden`       | boolean     |      | 見下方「隱藏文章」。                                                           |
| `mathjax`      | boolean     |      | 純遷移相容旗標 — **絕不**載入 MathJax;數學一律由 KaTeX 渲染。                  |
| `mermaid`      | boolean     |      | 純遷移相容旗標 — 沒有客戶端 Mermaid runtime。                                  |

以下欄位自動計算(不要手動設定):閱讀時間、目錄、摘要預覽(取內文約 200 字)、JSON-LD
結構化資料。

### 草稿 vs. 隱藏

- `draft: true` — 未發佈。production 全面排除。
- `hidden: true` — 已發佈但不列出。直接網址 `/YYYY/MM/DD/slug/` 可讀,但排除於首頁、
  文章列表、標籤、archive、搜尋索引、sitemap 與 RSS。注意:網址本身不是秘密,不要把
  `hidden` 當成保密機制。

## 2. Markdown / MDX 能力

- **GFM**(表格、任務清單、刪除線)加 GitHub 風格警示引言(`> [!NOTE]`、`> [!WARNING]` 等)。
- **數學**:KaTeX(`remark-math` + `rehype-katex`)。行內 `$...$`、區塊 `$$...$$`。
  不得重新引入 MathJax。
- **程式碼區塊**:Prism 高亮(`rehype-prism-plus`),支援行號/行高亮,預設語言 `js`。
  ` ```lang:標題 ` 可加程式碼標題列。
- **引用文獻**:`rehype-citation`,配 front matter `bibliography` 或
  `data/references-data.bib`。
- **圖片**:已知尺寸時轉為 `next/image`;所有文章圖片都有客戶端 Medium Zoom(縮放背景
  跟隨明暗主題)。
- **iframe**:YouTube / YouTube nocookie / youtu.be / Vimeo 來源自動包進 16:9 響應式容器
  (`lib/iframe.ts` 做主機比對)。其他 iframe 來源不處理 — 且除非加入允許清單,會被 CSP
  `frame-src` 擋下(見 §8)。
- **表格**:自動包進手機可橫向捲動的容器。
- **標題**:自動產生 slug 錨點 — hover 時在標題文字**後方**顯示純文字 `#`(AnchorJS 風格,
  照搬自 Jekyll 舊站;不是前置圖標)。
- MDX 可以執行程式碼。`data/` 底下一律視為受信任的作者內容;沒有另行安全設計前,絕不
  接受不受信任的 MDX 投稿。

## 3. 站點設定

### `data/siteMetadata.js`

中央設定檔:站名/描述、`siteUrl`(`https://blog.allenspace.de`)、預設主題(`dark`)、
語言(`zh-TW`)、社群連結、分析、留言、搜尋。重點:

- **社群連結**(`github`、`linkedin`、`x`、`facebook`、`reddit`、`buymeacoffee` 等):由
  `components/hux/HuxSocial.tsx` 渲染成 Hux 風格圓形圖標(自訂 SVG,不依賴 icon font)。
  **空字串 = 隱藏該圖標。** RSS 固定顯示,連到 `/feed.xml`。
- **分析**:GA4(`googleAnalytics.googleAnalyticsId` = `G-M2HR0MGKVL`,沿用舊站)。
  Umami/Plausible/PostHog 保留為註解範例 — 切換供應商時必須同步更新 `next.config.mjs`
  的 CSP(見 §8)。Google Search Console 驗證 meta 已設在根 layout。
- **電子報**:`provider` 刻意留白。留白時 `/api/newsletter` 回傳
  `404 Newsletter is not configured`。除非刻意設定並審查過,否則保持留白。

### 導覽、側欄、作者

- **導覽連結**:`data/headerNavLinks.ts`(Home / Archive / Tags / About)。
- **友站清單**(側欄 FRIENDS 區):寫死在 `components/hux/HuxSidebar.tsx` 頂部的
  `friends` 陣列。
- **側欄 Featured Tags**:由標籤計數自動產生。
- **作者檔案**:`data/authors/*.mdx`(front matter:name、avatar、occupation、company、
  email、github、linkedin 等)。`default.mdx` 是站主;其他作者由文章的 `authors` 清單引用。
- **About 頁內容**:不在作者檔 — 來自 i18n 字典(`dictionaries/zh-TW.json`、
  `dictionaries/en.json`)。**兩個檔案都要改**,讓 `/about/`(zh-TW)與 `/en/about/`
  保持一致。舊制 `?lang=` 網址會 308 轉址到正確路由。

## 4. 路由

| 路由                      | 用途                                                 |
| ------------------------- | ---------------------------------------------------- |
| `/`                       | 首頁,同時**就是分頁列表的第 1 頁**                   |
| `/pageN/`(N≥2)            | 分頁列表第 2 頁起(「Older Posts」翻頁)               |
| `/YYYY/MM/DD/slug/`       | 文章頁(相容舊站的 canonical 網址)                    |
| `/blog/`、`/blog/page/N/` | 舊網址,308 永久導向 `/` 或 `/pageN/`                 |
| `/archive/`               | Archive 時間軸,含標籤篩選                            |
| `/tags/`、`/tags/[tag]/`  | 標籤索引與各標籤列表(noindex;第 2 頁起才有 `page/N`) |
| `/about/`、`/en/about/`   | 中英文 about 頁                                      |
| `/offline/`               | PWA 離線後備頁                                       |
| `/api/newsletter`         | 未設定供應商時停用(404)                              |
| `/projects/`              | 刻意移除 — 404                                       |

分頁網址由 `lib/pagination.ts` 單一決定(`blogPageHref` / `tagPageHref` /
`parseBlogPageSegment`),對齊原站 jekyll-paginate 的語意:**第 1 頁沒有獨立網址**。
不要在頁面元件裡拼分頁路徑 —— 過去 `/` 與 `/blog/` 各自切前 5 篇,悄悄變成同一頁,
使用者按「Older Posts」得按兩次才會真的翻頁。

`/pageN/` 實作在 `app/[year]/page.tsx`:App Router 不允許同一層有兩個名字不同的
dynamic segment,而根層已被文章網址的 `[year]` 佔用,因此分頁共用該 slot,只接受
`pageN`,其餘(含真正的年份 `/2025/`)一律 404。

## 5. 搜尋、留言、分析

- **搜尋**:Pliny KBar(`⌘K` / `Ctrl+K`)。索引在 `/search.json`,build 時產生,排除隱藏
  文章。索引是公開的 — 列出的文章絕不可含機密。選中結果的高亮色是品牌青色
  (`--color-primary-600`,`#4db8d1`)。
- **留言**:giscus(`allen5218/myblog` 的 GitHub Discussions),讀者按「Load Comments」
  才載入。對應方式是 `pathname` — 留言串綁定確切的 `/YYYY/MM/DD/slug/` 路徑,這是網址
  必須穩定的另一個原因。設定來自 `NEXT_PUBLIC_GISCUS_*` 環境變數(有已提交的後備值)。
  語言 `zh-TW`;明暗主題跟隨站點主題。
- **分析**:GA4(見 §3)。CSP 已允許 googletagmanager / google-analytics 端點。

## 6. Feed、Sitemap、SEO 與社群卡片

- `feed.xml` — 主 RSS(已列出、非草稿文章),由 `scripts/rss.mjs` 在 postbuild 產生。
  各標籤 feed 在 `/tags/<tag>/feed.xml`(標籤沒有已列出文章時跳過)。
- `sitemap.xml` — 首頁、`/archive/`、`/tags/`、兩個 about 頁(含語言 alternates)、已列出的
  非草稿文章。**不收會轉址的網址**(如 `/blog/`),也不收 `/pageN/` 與各標籤頁(前者從
  首頁 pager 直接可達,後者刻意 noindex)。首頁/封存/標籤索引的 `lastmod` 取自**最新
  文章的日期**,不要改成 `new Date()` —— 那會讓每次部署都對爬蟲謊稱內容變動過。
- `robots.ts` — 標準 allow-all 加 sitemap 指標。
- 文章頁輸出 JSON-LD `BlogPosting` 結構化資料與 OpenGraph/Twitter meta。

### 社群卡片(OpenGraph 圖片)

每個路由都會自動產生 1200×630 的 `og:image` / Twitter 卡片 — 整個倉庫沒有任何手工製作的
社群分享圖。

- **首頁**(`app/opengraph-image.tsx`)與**其餘所有非文章頁**(archive、tags、about、分頁
  列表、404、offline)透過 `app/social-card/route.tsx`(`GET /social-card?title=&summary=`)
  產生品牌漸層卡片,由 `app/seo.tsx` 的 `genPageMetadata()` 自動接上。要跳過此行為,
  在呼叫 `genPageMetadata()` 時明確傳入 `image` 即可。
- **文章頁**(`app/[year]/[month]/[day]/[slug]/opengraph-image.tsx`)輸出文章的 `title` 與
  `subtitle`(沒有 `subtitle` 時退回摘要預覽)。背景由 `lib/social-card.ts` 的
  `selectSocialCardBackground()` 決定:文章 `headerImg`(抓取後裁切成 1200×630)→
  `headerBgCss`(若符合 `linear-gradient(...)` 格式)→ 品牌漸層後備。front matter 的
  **`images` 在此不會被使用** — 它只餵給 JSON-LD `image` 與 `PostBanner` 版面背景(見 §1)。
- 以 `next/og` 的 `ImageResponse` 在 Node runtime 渲染(`runtime = 'nodejs'`,非 edge —
  因為要用 `sharp` 把漸層/圖片轉成 PNG data URL)。
- **字體**:卡片使用本機託管、經過字符子集化的 Chiron Sung HK
  (`public/static/fonts/ChironSungHK-OG-{Regular,Bold}.ttf`),由 `lib/social-card-font.ts`
  載入。子集只涵蓋卡片實際會出現的文字(文章標題/副標、字典字串、固定 UI 文案),由
  `scripts/og-font-text.mjs` 蒐集。
  - `yarn build` 會先跑 `yarn check:og-font`(見 §10),用 `hb-shape` 確認目前所有卡片
    文字都有對應字符;缺字時以 `.notdef` 錯誤讓 build 失敗。
  - `yarn update:og-font` 會從 Google Fonts 重新下載完整可變字體,並用 `hb-subset`
    依目前文字重新子集化。
  - 兩者都需要本機安裝 HarfBuzz CLI(`hb-shape`、`hb-subset`,例如
    `brew install harfbuzz`)。在 Vercel 上,因為沒有 `hb-shape`,`check:og-font` 會跳過
    字符檢查而不是讓 build 失敗(`scripts/og-font-check-policy.mjs`,以 `VERCEL=1` 判斷)。
- 新增文章或字典文案時,若引入子集外的字符(罕見 CJK 字、emoji 等),會在 build 時讓
  `check:og-font` 失敗 — 執行 `yarn update:og-font` 並提交重新產生的 `.ttf` 檔。

## 7. PWA(Serwist)

- Service worker 原始碼:`app/sw.ts`,由 `@serwist/next` 建置為 `public/sw.js`
  (gitignore)。runtime 註冊由 `app/layout.tsx` 的 `SerwistProvider` 負責。
- 行為:Next.js 感知的 runtime 快取(`defaultCache`);看過的頁面離線可讀;沒看過的導航
  退回 `/offline/`(precache,revision = git commit hash)。
- Manifest:`app/manifest.ts`(Next 自動注入 `<link rel="manifest">`)。圖標是藍色「A」
  logo(192/512 px),在 `public/static/favicons/`,沿用舊站的 PWA 圖標。
- Favicon:全套由同一個 logo 重新生成(`favicon.ico` 另複製一份到站點根目錄,因為瀏覽器
  一律會直接請求 `/favicon.ico`)。已知且接受的例外:`safari-pinned-tab.svg` 仍是舊的
  starter 圖案(Safari 已棄用的功能;刻意不重製)。
- SW/TS 注意:`app/sw.ts` 與 `public/sw.js` 排除於 `tsconfig.json` 和 ESLint(webworker
  lib 與應用的 `dom` lib 衝突;Serwist 的 webpack 插件會獨立打包 SW)。

## 8. 資安

- **CSP** 定義在 `next.config.mjs`,經 `headers()` 套用到所有路由:
  - `script-src`:`'self'` + giscus + googletagmanager。`'unsafe-eval'` **僅 dev** 加入
    (Fast Refresh 需要);production 沒有 `unsafe-eval`。`'unsafe-inline'` 是決策保留
    (Next App Router 的 inline hydration script;nonce 方案會強制全站動態渲染、失去
    SSG — 沒有新前提不要重開)。
  - `img-src`:self + `img.allenspace.de` + GA 端點 + blob/data。starter 的
    `picsum.photos` 與 `media-src` S3 萬用字元**已停用**(設定檔內有註解與風險說明 —
    重新啟用前先讀)。
  - `frame-src`:僅 giscus、`slide.allenspace.de`、YouTube nocookie、Vimeo。
  - **新增第三方 script/嵌入/圖床時,必須在同一次修改中更新 CSP**,圖片還要同步
    `images.remotePatterns`。
- **Hero iframe 允許清單**:`lib/iframe.ts` — front matter `iframe` 的來源只解析
  `https://slide.allenspace.de`。擴充時允許清單與 CSP `frame-src` 要一起改。
- 其他 header:HSTS、X-Content-Type-Options、Referrer-Policy、X-Frame-Options DENY +
  `frame-ancestors 'none'`、Permissions-Policy(相機/麥克風/定位關閉)。
- **依賴鎖定**(`package.json` resolutions):`pliny/js-yaml: 4.3.0`(merge-key DoS 修補;
  範圍限定,不動 gray-matter 的 v3 線)與 `mdx-bundler/uuid: 11.1.1`(buffer 邊界修補;
  只有 11.x 有修)。未來新增 resolution 請沿用「依賴者範圍」寫法。已知且接受的 audit
  項:`@opentelemetry/core`(經 contentlayer2,僅 build 時使用、零暴露;等上游)。
- 信任邊界:`data/` 底下的 MDX/front matter 是受信任的作者內容。

## 9. 主題與字體

- 明暗主題用 `next-themes`;預設 **dark**。切換選單在導覽列(太陽/月亮/螢幕)。
- 全站字體:**Chiron Sung HK(昭源宋體)**(CJK 襯線,可變字重 200–900),經
  `next/font/google` 在 build 時自我託管 — `font-src 'self'` 維持有效,runtime 不會
  請求 Google Fonts。
- 焦點外框:品牌青色,**僅鍵盤導航(Tab)時顯示**,滑鼠點擊隱藏
  (`components/FocusVisibleFix.tsx` + `user-is-tabbing` class)。

## 10. 指令、環境變數、部署

### 指令

| 指令               | 用途                                                            |
| ------------------ | --------------------------------------------------------------- |
| `yarn dev`            | 開發伺服器 `http://localhost:3000`                              |
| `yarn build`          | `check:og-font` + production build + postbuild(RSS/標籤 feed)   |
| `yarn serve`          | 服務 production build(`next start`)                             |
| `yarn lint`           | ESLint(+prettier)含 `--fix`                                     |
| `yarn test:unit`      | Vitest 單元測試(`tests/unit/`)                                  |
| `yarn test:parity`    | Playwright parity 套件(`tests/playwright/`,綁 `127.0.0.1:3012`) |
| `yarn check:og-font`  | 檢查 OG/社群卡片字體子集是否涵蓋目前所有卡片文字(§6);`yarn build` 前自動執行 |
| `yarn update:og-font` | 依目前內容重新下載並子集化 Chiron Sung HK OG 字體;需要 HarfBuzz CLI(§6) |
| `yarn analyze`        | 帶 bundle analyzer 的 build                                     |

操作注意:

- **不要**同時跑 `yarn build` 和 `yarn dev`/`yarn test:parity` — 會在 `.next` 上競爭。
- dev 限定的怪象:冷路由(尚未編譯)的第一次點擊可能看似沒反應約 1.5 秒,在這個空窗內
  連點兩下會卡住 dev router。這是 `next dev` 的按需編譯特性,不是 bug;production 導航
  只要 ~15ms。永遠不要用 dev server 判斷互動延遲。
- `yarn build` / `yarn check:og-font` / `yarn update:og-font`需要本機安裝 HarfBuzz CLI
  (`hb-shape`、`hb-subset`,例如 `brew install harfbuzz`)。Vercel build 會跳過字符檢查
  而不是失敗(見 §6)— 因為 Vercel 上沒有 HarfBuzz。

### 環境變數

| 變數                                                                        | 用途                           |
| --------------------------------------------------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_GISCUS_REPO` / `_REPOSITORY_ID` / `_CATEGORY` / `_CATEGORY_ID` | giscus 覆寫(有已提交的後備值)  |
| `BASE_PATH`                                                                 | 選配的子路徑部署前綴           |
| `EXPORT=1`                                                                  | 靜態匯出輸出                   |
| `UNOPTIMIZED=1`                                                             | 停用圖片最佳化(與 EXPORT 搭配) |
| `ANALYZE=true`                                                              | Bundle analyzer                |

### 部署模式

- **Node 伺服器 / Vercel(預設)**:全功能 — `next.config.mjs` 的安全 header、
  `/about/?lang=` 轉址 middleware、圖片最佳化都有效。
- **靜態匯出(`EXPORT=1 UNOPTIMIZED=1`)**:`headers()`、`redirects()` 與 `middleware.ts`
  **都不會**生效。CSP/安全 header 必須改在網頁伺服器(nginx/CDN)宣告;舊制 `?lang=`
  轉址與 `/blog/*` → `/pageN/` 的分頁轉址也要改成伺服器層規則。PWA 仍可運作(SW 是
  靜態檔案)。
- **GitHub Pages workflow**(`.github/workflows/pages.yml`):仍存在但改為手動觸發
  (`workflow_dispatch`)— push 到 `main` 不會再觸發 Pages build。實際部署目標是 Vercel。

## 11. 測試與維護

- `tests/unit/iframe.test.ts` — 16 個測試,涵蓋 iframe 主機允許清單(精確與子網域比對、
  惡意主機拒絕)。
- `tests/unit/pagination.test.ts` — 8 個測試,釘住分頁網址契約(第 1 頁沒有獨立網址、
  `/pageN/` 從 2 起算、不接受 `page1` 與前導零)。
- `tests/unit/social-card.test.ts` — 10 個測試,涵蓋社群卡片背景選擇邏輯(`headerImg` >
  `headerBgCss` 漸層 > 品牌後備)、遠端網址原樣保留、漸層/圖片轉 PNG data URL、摘要後備
  (`subtitle` > preview),以及文章/一般頁社群卡片網址產生器。
- `tests/unit/social-card-font.test.ts` — 1 個測試,確認 Chiron Sung HK 一般/粗體字體
  buffer 能正確載入給 `ImageResponse` 使用。
- `tests/unit/og-font-text.test.ts` — 3 個測試,釘住 OG 字體文字蒐集的涵蓋範圍(文章 +
  字典 + 固定 UI 文案,排除 emoji),以及僅限 Vercel 才能跳過缺少 `hb-shape` 的政策。
- `tests/playwright/blog-parity.spec.ts` — 9 個端到端契約:legacy 網址行為、隱藏文章排除、
  KaTeX 無 MathJax、i18n about 路由、Hux 視覺外殼 parity、文章 hero/導覽幾何、MDX 增強器
  (響應式媒體 + Medium Zoom)、手機版 keynote/pager 尺寸與配色、service worker 的跨網域
  hero 圖。
- `tests/playwright/pagination.spec.ts` — 7 個契約:「Older Posts」一次點擊抵達真正不同的
  一頁、舊 `/blog/*` 轉址、sitemap 的內容與 `lastmod` 誠實性。
- `tests/playwright/code-block-and-back-top.spec.ts` — 5 個契約,釘住還原後的 code block
  配色、手機版滿版出血,以及返回頂部按鈕的形狀、位置與明暗 hover 配色。
- `tests/playwright/social-card.spec.ts` — 4 個契約,涵蓋首頁、漸層背景文章、header 圖片
  文章,以及品牌化的 hub/分頁社群卡片。
- 出貨前的完整驗證慣例:`yarn tsc --noEmit && yarn lint && yarn build && yarn test:unit
&& yarn test:parity`。
- `faq/` 目錄保留三份上游 starter 指南(自訂 MDX 元件、KBar 客製、Docker 部署)作為參考。

## 12. 授權

本倉庫採 Apache-2.0(見 `LICENSE`、`NOTICE.md`);基於
[timlrx/tailwind-nextjs-starter-blog](https://github.com/timlrx/tailwind-nextjs-starter-blog)
(MIT,保存於 `licenses/tailwind-nextjs-starter-blog-MIT.txt`),並移植了
[Hux Blog](https://github.com/Huxpro/huxpro.github.io) 的視覺語言。
