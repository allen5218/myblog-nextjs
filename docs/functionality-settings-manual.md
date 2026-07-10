# Functionality and Settings Manual

> 繁體中文版:[functionality-settings-manual.zh-TW.md](./functionality-settings-manual.zh-TW.md)

This manual describes how to operate, configure, and maintain Allen's Blog (the Next.js
migration of the old Jekyll/Hux site at `blog.allenspace.de`). It is written for site
maintenance and content authoring, not for application-code changes.

Stack overview: Next.js 15 (App Router) + Contentlayer2 + Tailwind CSS v4 + Pliny, with the
Hux Blog visual language ported on top and PWA support via Serwist.

## 1. Writing Posts

Posts live under `data/blog/**/*.md` or `*.markdown` and are processed as MDX.

### Filename and URL rules

- A filename date prefix like `2025-10-13-my-post.md` is stripped to produce the slug
  (`my-post`).
- The public URL is `/YYYY/MM/DD/slug/` — generated from the **front matter `date`**, not
  the filename date. Trailing slash is mandatory site-wide (`trailingSlash: true`).
- Keep migrated post dates stable: the URL feeds giscus comment mapping, SEO, feeds, and
  legacy inbound links.

### Front matter fields

| Field          | Type        | Required | Behavior                                                                                         |
| -------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------ |
| `title`        | string      | ✅       | Display/SEO/search/feed title and structured-data headline.                                      |
| `date`         | date        | ✅       | Publication date; determines the `/YYYY/MM/DD/` URL prefix.                                      |
| `tags`         | string list |          | Tag pages, archive filter, feeds, post header. Tag pages use slugified names.                    |
| `update`       | date        |          | Shown as the updated date; becomes `lastmod` for sitemap/SEO.                                    |
| `draft`        | boolean     |          | Drafts are excluded from listings, sitemap, RSS, and tag counts in production builds.            |
| `subtitle`     | string      |          | Visible subtitle; also the fallback `summary` for SEO/feeds.                                     |
| `images`       | string/list |          | SEO/social images when no `headerImg` is present.                                                |
| `authors`      | string list |          | References `data/authors/*.mdx` by filename; defaults to `default`.                              |
| `author`       | string      |          | Legacy single-author field; layouts mainly use `authors`.                                        |
| `layout`       | string      |          | `PostLayout` (default), `PostSimple`, or `PostBanner`; unknown values fall back to `PostLayout`. |
| `bibliography` | string      |          | BibTeX file for `rehype-citation` (see `data/references-data.bib`).                              |
| `canonicalUrl` | string      |          | Schema field only; the post route emits the generated legacy canonical path regardless.          |
| `headerImg`    | string      |          | Hero image; also the SEO image fallback.                                                         |
| `headerBgCss`  | string      |          | Custom CSS background for the hero (alternative to `headerImg`).                                 |
| `headerMask`   | number/json |          | Hero mask opacity.                                                                               |
| `iframe`       | string      |          | Full-hero iframe (slide/keynote posts). Source must pass the allowlist in `lib/iframe.ts`.       |
| `catalog`      | boolean     |          | Shows the sticky table-of-contents sidebar (desktop ≥1200px) on the post page.                   |
| `hidden`       | boolean     |          | See "Hidden posts" below.                                                                        |
| `mathjax`      | boolean     |          | Legacy migration flag only — MathJax is **never** loaded; math renders via KaTeX regardless.     |
| `mermaid`      | boolean     |          | Legacy migration flag only — no client Mermaid runtime exists.                                   |

Computed automatically (do not set manually): reading time, table of contents, excerpt
preview (~200 chars from body), and JSON-LD structured data.

### Draft vs. hidden

- `draft: true` — unpublished. Excluded everywhere in production.
- `hidden: true` — published but unlisted. The direct `/YYYY/MM/DD/slug/` URL works, but the
  post is excluded from homepage, blog listing, tags, archive, search index, sitemap, and
  RSS. Note: the URL itself is not secret; do not rely on `hidden` for confidentiality.

## 2. Markdown / MDX Capabilities

- **GFM** (tables, task lists, strikethrough) plus GitHub-style alert blockquotes
  (`> [!NOTE]`, `> [!WARNING]`, …).
- **Math**: KaTeX via `remark-math` + `rehype-katex`. Write `$inline$` and `$$block$$`.
  MathJax must not be reintroduced.
- **Code blocks**: Prism highlighting (`rehype-prism-plus`), line numbers/highlighting
  supported, default language `js`. ` ```lang:title ` adds a code title bar.
- **Citations**: `rehype-citation` with `bibliography` front matter or
  `data/references-data.bib`.
- **Images**: converted to `next/image` where sizes are known; every post image gets
  client-side Medium Zoom (zoom background follows light/dark theme).
- **Iframes**: YouTube / YouTube nocookie / youtu.be / Vimeo sources are auto-wrapped in
  responsive 16:9 containers (host-checked in `lib/iframe.ts`). Other iframe sources are
  left alone — and will be blocked by CSP `frame-src` unless allowlisted (see §8).
- **Tables**: wrapped in horizontally scrollable containers for mobile.
- **Headings**: get slug anchors with a prepended link icon on hover.
- MDX is code-capable. Treat everything under `data/` as trusted author content; never
  accept untrusted MDX submissions without a separate security design.

## 3. Site Configuration

### `data/siteMetadata.js`

The central config: site title/description, `siteUrl` (`https://blog.allenspace.de`),
default theme (`dark`), language/locale (`zh-TW`), social links, analytics, comments,
search. Highlights:

- **Social links** (`github`, `linkedin`, `x`, `facebook`, `reddit`, `buymeacoffee`, …):
  rendered by `components/hux/HuxSocial.tsx` as the Hux-style circular icons (custom SVGs,
  no icon-font dependency). **Empty string = icon hidden.** RSS is always shown and links
  to `/feed.xml`.
- **Analytics**: GA4 via `googleAnalytics.googleAnalyticsId` (`G-M2HR0MGKVL`, carried over
  from the old site). Umami/Plausible/PostHog remain as commented examples — switching
  providers also requires updating the CSP in `next.config.mjs` (see §8). Google Search
  Console verification meta is set in the root layout.
- **Newsletter**: `provider` is intentionally blank. The `/api/newsletter` route returns
  `404 Newsletter is not configured` while blank. Leave it blank unless a provider is
  deliberately configured and reviewed.

### Navigation, sidebar, authors

- **Nav links**: `data/headerNavLinks.ts` (Home / Archive / Tags / About).
- **Friends list** (sidebar "FRIENDS" section): hardcoded `friends` array at the top of
  `components/hux/HuxSidebar.tsx`.
- **Sidebar Featured Tags**: derived automatically from tag counts.
- **Author profiles**: `data/authors/*.mdx` (front matter: name, avatar, occupation,
  company, email, github, linkedin, …). `default.mdx` is the site owner; posts reference
  others via the `authors` front matter list.
- **About page content**: NOT in authors files — it comes from the i18n dictionaries
  (`dictionaries/zh-TW.json`, `dictionaries/en.json`). Edit **both** files to keep `/about/`
  (zh-TW) and `/en/about/` aligned. Legacy `?lang=` URLs 308-redirect to the right route.

## 4. Routes

| Route                     | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `/`                       | Home — and **page 1 of the paginated listing**                 |
| `/pageN/` (N≥2)           | Paginated listing from page 2 on ("Older Posts" pager)         |
| `/YYYY/MM/DD/slug/`       | Post pages (legacy-compatible canonical URLs)                  |
| `/blog/`, `/blog/page/N/` | Legacy URLs; 308 permanent redirect to `/` or `/pageN/`        |
| `/archive/`               | Archive timeline with tag filtering                            |
| `/tags/`, `/tags/[tag]/`  | Tag index and per-tag listings (noindex; `page/N` starts at 2) |
| `/about/`, `/en/about/`   | Localized about pages                                          |
| `/offline/`               | PWA offline fallback                                           |
| `/api/newsletter`         | Disabled (404) while no provider configured                    |
| `/projects/`              | Intentionally removed — 404                                    |

Pagination URLs come from `lib/pagination.ts` alone (`blogPageHref`, `tagPageHref`,
`parseBlogPageSegment`), matching jekyll-paginate's semantics: **page 1 has no URL of its
own**. Never assemble a pagination path inside a page component — `/` and `/blog/` each
used to slice the first 5 posts independently, silently becoming the same page, so "Older
Posts" advanced zero pages and users had to click it twice.

`/pageN/` lives in `app/[year]/page.tsx`: the App Router forbids two differently-named
dynamic segments at the same level, and the root level is already taken by `[year]` from
the post URLs. Pagination therefore shares that slot, accepts only `pageN`, and 404s
everything else (including real years such as `/2025/`).

## 5. Search, Comments, Analytics

- **Search**: Pliny KBar (`⌘K` / `Ctrl+K`). Index at `/search.json`, generated at build,
  excludes hidden posts. The index is public — never put secrets in listed posts. Active
  result highlight uses the brand cyan (`--color-primary-600`, `#4db8d1`).
- **Comments**: giscus (GitHub Discussions on `allen5218/myblog`), loaded only after the
  reader clicks "Load Comments". Mapping is `pathname` — comment threads are tied to the
  exact `/YYYY/MM/DD/slug/` path, another reason URLs must stay stable. Config comes from
  `NEXT_PUBLIC_GISCUS_*` env vars with committed fallbacks. Language `zh-TW`; light/dark
  theme follows the site theme.
- **Analytics**: GA4 (see §3). CSP already allows googletagmanager / google-analytics
  endpoints.

## 6. Feeds, Sitemap, SEO

- `feed.xml` — main RSS (listed, non-draft posts), generated by `scripts/rss.mjs` during
  postbuild. Tag feeds at `/tags/<tag>/feed.xml` (skipped when a tag has no listed posts).
- `sitemap.xml` — home, `/archive/`, `/tags/`, both about pages (with language alternates),
  and listed non-draft posts. **Redirecting URLs are never listed** (e.g. `/blog/`), nor are
  `/pageN/` and per-tag pages (the former is linked straight from the home pager, the latter
  is deliberately noindex). `lastmod` for home/archive/tag-index is the **newest post's
  date** — do not switch it back to `new Date()`, which tells crawlers these pages changed
  on every deploy.
- `robots.ts` — standard allow-all with sitemap pointer.
- Post pages emit JSON-LD `BlogPosting` structured data and OpenGraph/Twitter meta.

## 7. PWA (Serwist)

- Service worker source: `app/sw.ts`, built by `@serwist/next` to `public/sw.js`
  (gitignored). Runtime registration happens via `SerwistProvider` in `app/layout.tsx`.
- Behavior: Next.js-aware runtime caching (`defaultCache`); previously visited pages work
  offline; unvisited navigations fall back to `/offline/` (precached, revision = git commit
  hash).
- Manifest: `app/manifest.ts` (Next auto-injects the `<link rel="manifest">`). Icons are the
  blue "A" logo (192/512 px) under `public/static/favicons/`, reused from the old site's
  PWA icons.
- Favicons: full set regenerated from the same logo (`favicon.ico` also copied to site root
  because browsers request `/favicon.ico` unconditionally). Known accepted exception:
  `safari-pinned-tab.svg` still carries the old starter mark (deprecated Safari feature;
  deliberately not regenerated).
- SW/TS note: `app/sw.ts` and `public/sw.js` are excluded from `tsconfig.json` and ESLint
  (webworker lib conflicts with the app's `dom` lib; the Serwist webpack plugin bundles the
  SW independently).

## 8. Security

- **CSP** is defined in `next.config.mjs` and applied via `headers()` to all routes:
  - `script-src`: `'self'` + giscus + googletagmanager. `'unsafe-eval'` is included **in dev
    only** (Fast Refresh needs it); production has no `unsafe-eval`. `'unsafe-inline'` is
    kept by decision (Next App Router inline hydration scripts; nonce-based CSP would force
    the whole site dynamic and kill SSG — do not revisit without new premises).
  - `img-src`: self + `img.allenspace.de` + GA endpoints + blob/data. The starter's
    `picsum.photos` and `media-src` S3 wildcard are **disabled** (commented with risk notes
    in the config — read those before re-enabling anything).
  - `frame-src`: giscus, `slide.allenspace.de`, YouTube nocookie, Vimeo only.
  - **Adding a third-party script/embed/image host requires updating the CSP** in the same
    change, and (for images) `images.remotePatterns`.
- **Hero iframe allowlist**: `lib/iframe.ts` — front matter `iframe` sources resolve only
  against `https://slide.allenspace.de`. Extend the allowlist and CSP `frame-src` together.
- Other headers: HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options DENY +
  `frame-ancestors 'none'`, Permissions-Policy (camera/mic/geolocation off).
- **Dependency pinning** (`package.json` resolutions): `pliny/js-yaml: 4.3.0` (merge-key DoS
  fix; scoped so gray-matter's v3 line is untouched) and `mdx-bundler/uuid: 11.1.1`
  (buffer bounds fix; patched only in 11.x). Keep the dependent-scoped form when adding
  future resolutions. Known accepted audit item: `@opentelemetry/core` via contentlayer2
  (build-time only, zero exposure; waiting on upstream).
- Trust boundary: MDX/front matter under `data/` is trusted author content.

## 9. Theming and Typography

- Dark/light theme via `next-themes`; default is **dark**. The switch lives in the navbar
  (sun/moon/monitor menu).
- Site-wide font: **Chiron Sung HK** (CJK serif, variable 200–900) via `next/font/google`,
  self-hosted at build time — `font-src 'self'` stays valid, no runtime Google Fonts
  requests.
- Focus outline: brand cyan, visible **only for keyboard navigation** (Tab), hidden for
  mouse clicks (`components/FocusVisibleFix.tsx` + `user-is-tabbing` class).

## 10. Commands, Environment Variables, Deployment

### Commands

| Command            | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `yarn dev`         | Dev server at `http://localhost:3000`                                 |
| `yarn build`       | Production build + postbuild (RSS/tag feeds)                          |
| `yarn serve`       | Serve the production build (`next start`)                             |
| `yarn lint`        | ESLint (+prettier) with `--fix`                                       |
| `yarn test:unit`   | Vitest unit tests (`tests/unit/`)                                     |
| `yarn test:parity` | Playwright parity suite (`tests/playwright/`, binds `127.0.0.1:3012`) |
| `yarn analyze`     | Build with bundle analyzer                                            |

Operational caveats:

- Do **not** run `yarn build` and `yarn dev`/`yarn test:parity` concurrently — they race on
  `.next`.
- Dev-only quirk: the first click on a cold (not-yet-compiled) route can appear dead for
  ~1.5s and double-clicking into that window stalls the dev router. This is `next dev`
  on-demand compilation, not a bug; production navigates in ~15ms. Never judge interaction
  latency from the dev server.

### Environment variables

| Variable                                                                    | Purpose                                      |
| --------------------------------------------------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_GISCUS_REPO` / `_REPOSITORY_ID` / `_CATEGORY` / `_CATEGORY_ID` | giscus overrides (committed fallbacks exist) |
| `BASE_PATH`                                                                 | Optional subpath deployment prefix           |
| `EXPORT=1`                                                                  | Static export output                         |
| `UNOPTIMIZED=1`                                                             | Disable image optimization (pair w/ EXPORT)  |
| `ANALYZE=true`                                                              | Bundle analyzer                              |

### Deployment modes

- **Node server / Vercel (default)**: everything works — security headers from
  `next.config.mjs`, the `/about/?lang=` redirect middleware, image optimization.
- **Static export (`EXPORT=1 UNOPTIMIZED=1`)**: `headers()`, `redirects()` and
  `middleware.ts` do **not** apply. CSP/security headers must be re-declared on the web
  server (nginx/CDN); the legacy `?lang=` redirects and the `/blog/*` → `/pageN/`
  pagination redirects need server-level rules. The PWA still works (the SW is a static
  file).

## 11. Testing and Maintenance

- `tests/unit/iframe.test.ts` — 16 tests covering the iframe host allowlist (exact and
  subdomain matching, malicious-host rejection).
- `tests/unit/pagination.test.ts` — 8 tests pinning the pagination URL contract (page 1 has
  no URL of its own; `/pageN/` starts at 2; no `page1` or leading zeros).
- `tests/playwright/blog-parity.spec.ts` — 8 end-to-end contracts: legacy URL behavior,
  hidden-post exclusion, KaTeX-without-MathJax, i18n about routes, Hux visual shell parity,
  post hero/nav geometry, MDX enhancers (responsive media + Medium Zoom), and the service
  worker's cross-origin hero image.
- `tests/playwright/pagination.spec.ts` — 7 contracts: one-click "Older Posts" reaching a
  genuinely different page, the legacy `/blog/*` redirects, and the sitemap's contents and
  `lastmod` honesty.
- Full verification convention before shipping: `yarn tsc --noEmit && yarn lint && yarn
build && yarn test:unit && yarn test:parity`.
- The `faq/` directory keeps three upstream starter guides (custom MDX components, KBar
  customization, Docker deploys) as reference material.

## 12. Licensing

Apache-2.0 for this repository (see `LICENSE`, `NOTICE.md`); based on
[timlrx/tailwind-nextjs-starter-blog](https://github.com/timlrx/tailwind-nextjs-starter-blog)
(MIT, preserved at `licenses/tailwind-nextjs-starter-blog-MIT.txt`) with the visual language
of [Hux Blog](https://github.com/Huxpro/huxpro.github.io) ported onto it.
