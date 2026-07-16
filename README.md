# Allen's Blog

對世界保持好奇,並親手驗證。這裡是我探索技術、分享知識、記錄生活的實驗場。

Allen's personal blog — a full Next.js migration of the old Jekyll/Hux site at
[blog.allenspace.de](https://blog.allenspace.de), keeping every legacy URL, comment thread,
and the Hux visual language intact.

## 📖 操作說明書 / Manuals

- **[功能與設定操作說明書(繁體中文)](./docs/functionality-settings-manual.zh-TW.md)**
- **[Functionality and Settings Manual (English)](./docs/functionality-settings-manual.md)**

兩份說明書涵蓋:文章撰寫與 front matter 全欄位、Markdown/MDX 能力、站點設定、搜尋/留言/
分析、feed 與 SEO、動態社群卡片(OG 圖片)、PWA、資安(CSP 與允許清單)、主題字體、指令與
部署模式、測試慣例。
The manuals cover post authoring and every front matter field, MDX capabilities, site
configuration, search/comments/analytics, feeds and SEO, dynamic social cards (OG images),
PWA, security (CSP and allowlists), theming, commands, deployment modes, and testing
conventions.

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack by default) + TypeScript
- [Contentlayer2](https://github.com/timlrx/contentlayer2) for MDX content
- [Tailwind CSS v4](https://tailwindcss.com/) with the [Hux Blog](https://github.com/Huxpro/huxpro.github.io) visual language ported on top
- [Pliny](https://github.com/timlrx/pliny) — KBar search, giscus comments, GA4 analytics
- [Serwist](https://serwist.pages.dev/) — PWA with offline fallback
- KaTeX math, Prism code highlighting, Medium Zoom images, Chiron Sung HK typography

## Highlights

- **Legacy-compatible URLs** — posts keep the Jekyll-era `/YYYY/MM/DD/slug/` permalinks
  (driven by front matter `date`), preserving SEO, feeds, inbound links, and giscus
  comment threads.
- **Bilingual about page** — `/about/` (繁體中文) and `/en/about/`, dictionary-driven,
  with permanent redirects from the old `?lang=` URLs.
- **Dynamic social cards** — every page gets an auto-generated 1200×630 `og:image`/Twitter
  card (post hero image or brand gradient background, locally subsetted Chiron Sung HK
  font) — no manually authored social images.
- **PWA** — visited pages readable offline; unvisited navigations fall back to a styled
  `/offline/` page.
- **Mermaid diagrams** — build-time rendering to committed light/dark SVGs, instant
  client-side theme switching, and horizontal scroll on mobile instead of compression.
- **Hardened by default** — strict CSP (no `unsafe-eval` in production), iframe host
  allowlist, scoped dependency resolutions, security headers.
- **Verified** — Vitest unit tests plus a Playwright parity suite that pins the legacy-URL,
  i18n, KaTeX, and Hux-visual-shell contracts.

## Quick Start

```bash
yarn install
yarn dev          # http://localhost:3000
```

| Command            | Purpose                            |
| ------------------ | ---------------------------------- |
| `yarn dev`         | Contentlayer watcher + dev server  |
| `yarn start`       | Same flow as `yarn dev`            |
| `yarn build`       | Contentlayer + production build + RSS/tag feeds |
| `yarn serve`       | Serve the production build         |
| `yarn lint`        | ESLint + Prettier (`--fix`)        |
| `yarn test:unit`   | Vitest unit tests                  |
| `yarn test:parity` | Playwright end-to-end parity suite |
| `yarn analyze`     | Webpack build with bundle analyzer |

寫新文章:在 `data/blog/` 放 `YYYY-MM-DD-slug.md`,front matter 至少要有 `title` 與
`date` — 其餘欄位見說明書 §1。
To write a post: drop `YYYY-MM-DD-slug.md` into `data/blog/` with at least `title` and
`date` in the front matter — see the manual §1 for every field.

## Project Layout

```text
data/blog/            posts (MDX)
data/authors/         author profiles
data/siteMetadata.js  central site configuration
dictionaries/         about-page i18n (zh-TW / en)
app/                  App Router routes (incl. sw.ts, manifest.ts)
components/hux/       Hux visual components (hero, sidebar, catalog, …)
layouts/              post/list layouts
lib/                  pagination, iframe allowlist, social-card generation
scripts/              postbuild feeds + OG/site-font subsetting and validation tools
docs/                 manuals and maintenance docs
faq/                  upstream starter guides (MDX components, KBar, Docker)
tests/                unit + Playwright parity suites
```

## License

Apache-2.0 (see [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md)). Based on
[timlrx/tailwind-nextjs-starter-blog](https://github.com/timlrx/tailwind-nextjs-starter-blog)
(MIT, preserved in [licenses/](./licenses/)), with the visual design adapted from
[Hux Blog](https://github.com/Huxpro/huxpro.github.io).
