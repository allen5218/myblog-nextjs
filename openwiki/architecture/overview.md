# Architecture overview

## Runtime model

The project is a Next.js 16 App Router site with TypeScript, React 19, Tailwind v4, Pliny integrations, and Contentlayer2 ([`package.json`](../../package.json)). Contentlayer generates typed `Blog` and `Authors` documents before Next consumes them; generated modules live in ignored `.contentlayer/`, so application code imports `contentlayer/generated` rather than parsing Markdown at request time.

The root layout ([`app/layout.tsx`](../../app/layout.tsx)) composes the global runtime in this order:

1. Serwist provider registering `/serwist/sw.js`.
2. client fixes for document language and focus styling.
3. theme provider, configured analytics, and local KBar search provider.
4. full-width `SectionContainer`, Header, route content, and Footer.

The full-width shell is intentional. `SectionContainer` must not add a horizontal max-width or padding: navbar, hero, and footer already fill its containing block. The full-bleed shells and the home/post frames deliberately use container-relative width (`100%`, auto margins, or `left: 0; right: 0` for the positioned navbar), not `vw` horizontal measurements, because `vw` includes classic scrollbar width and can create page-wide overflow. Keep narrow-page spacing in the page-specific wrappers; [`tests/unit/css-viewport-width-contract.test.ts`](../../tests/unit/css-viewport-width-contract.test.ts) rejects new unapproved viewport-width horizontal sizing.

## Routes and compatibility

| Public surface | Implementation and contract |
| --- | --- |
| `/` and `/pageN/` | Home is page 1 of a single paginated list, not a separate featured view ([`app/page.tsx`](../../app/page.tsx), [`app/[year]/page.tsx`](../../app/%5Byear%5D/page.tsx), [`lib/pagination.ts`](../../lib/pagination.ts)). |
| `/:year/:month/:day/:slug/` | Canonical legacy-style post route. It statically generates only production-reachable posts, selects a content layout, emits post metadata/JSON-LD, and calculates neighbors from the separately listed view ([`app/[year]/[month]/[day]/[slug]/page.tsx`](../../app/%5Byear%5D/%5Bmonth%5D/%5Bday%5D/%5Bslug%5D/page.tsx), [`lib/post-publication.ts`](../../lib/post-publication.ts)). Thus a production draft 404s, while a hidden post remains directly reachable but has no pager neighbors. |
| `/blog/...` | Compatibility lookup and permanent redirect to a canonical legacy URL, restricted to the same reachable view as the canonical route ([`app/blog/[...slug]/page.tsx`](../../app/blog/%5B...slug%5D/page.tsx), [`lib/post-publication.ts`](../../lib/post-publication.ts)). |
| `/tags/`, `/archive/` | Contentlayer-derived discovery pages. Tag list pagination follows its own first-page semantics. Tag sublists are `noindex` to avoid duplicate listing combinations. |
| `/series/`, `/series/:series/` | Static Contentlayer-derived collection index and detail pages. Only visible, non-draft posts with valid, collision-free normalized series names participate; detail pages are pre-enumerated and unknown slugs 404. Entries are in oldest-to-newest reading order, and sitemap `lastModified` uses the latest date or `lastmod` among a collection’s members. See [`lib/series.ts`](../../lib/series.ts) and [`app/sitemap.ts`](../../app/sitemap.ts). |
| `/about/`, `/en/about/` | The only localized content surface. A route-group layout keeps the shared hero mounted while language content changes. |
| metadata endpoints | `manifest`, `robots`, `sitemap`, root/per-post Open Graph images, and a generic social card are App Router metadata/route handlers. |
| offline/service worker | `/offline/`, [`app/sw.ts`](../../app/sw.ts), and [`app/serwist/[path]/route.ts`](../../app/serwist/%5Bpath%5D/route.ts) implement PWA behavior. |

`next.config.mjs` enforces trailing slashes and redirects obsolete `/blog` list routes to the home/page convention. Those Next redirects do **not** execute in static-export mode; a static host must provide equivalent behavior if it needs it.

### About localization

[`lib/i18n.ts`](../../lib/i18n.ts) defines `zh-TW` as the unprefixed default and `en` as `/en`. The two pages load server-side dictionaries and render a shared About component. The `(about)` route-group layout is a behavioral boundary: it owns the hero to avoid a background/hero flash on language navigation. Legacy About `?lang=` URLs are redirected by [`proxy.ts`](../../proxy.ts); proxy behavior is unavailable to static exports.

## Rendering and visual composition

The Hux port is organized around reusable layout components:

- [`layouts/HuxListLayout.tsx`](../../layouts/HuxListLayout.tsx) renders the home/tag listing surfaces with hero, cards, a list pager, and sidebar.
- [`layouts/PostLayout.tsx`](../../layouts/PostLayout.tsx) renders hero metadata, article body, mobile TOC, desktop catalog, the adjacent-post pager, and lazily loaded comments. The post layouts put an eligible series link after the article and before the pager; the hero places it after update/date metadata.
- [`components/hux/HuxPager.tsx`](../../components/hux/HuxPager.tsx) deliberately has two variants: list pagination keeps the one-line arrow labels, while article navigation uses two lines (`Previous`/`Next` plus title), two 48%-width boundary slots separated by a 4% gap, and full-slot links. On mobile, article pager insets are relative to the post container; do not substitute viewport-derived pixel geometry.
- [`components/hux/HuxHero.tsx`](../../components/hux/HuxHero.tsx) is the shared hero primitive for posts and hubs. Post hero inputs are parsed once by [`lib/hero-config.ts`](../../lib/hero-config.ts), then [`lib/hero-mode.ts`](../../lib/hero-mode.ts) resolves keynote, text-only, CSS-background, or image presentation. `headerStyle: text` removes image, gradient, and mask so the title sits on the page background; its navbar and hero foreground tokens follow the active theme. It is build-invalid with `headerImg`, `headerBgCss`, `iframe`, any `headerMask` (including `0`), or `PostSimple`/`PostBanner`, and invalid `headerStyle` values fail rather than silently falling back. The shared primitive otherwise supports mask opacity, allowlisted presentation iframe modes, and the post-level series link. Archive supplies `public/img/bg-gull-facade.webp`; the Series index and detail route supply `public/img/bg-flamingo-lagoon.webp` ([`app/archive/page.tsx`](../../app/archive/page.tsx), [`app/series/page.tsx`](../../app/series/page.tsx), [`app/series/[series]/page.tsx`](../../app/series/%5Bseries%5D/page.tsx)).
- [`components/hux/SeriesIndex.tsx`](../../components/hux/SeriesIndex.tsx), [`components/hux/SeriesPostList.tsx`](../../components/hux/SeriesPostList.tsx), and [`components/hux/PostSeriesLink.tsx`](../../components/hux/PostSeriesLink.tsx) render the collection index, ordered parts, and article entry points; [`components/Header.tsx`](../../components/Header.tsx) makes Series a primary route. `PostSeriesLink` uses the sentence `Part of the [series] series` immediately after Hero Updated/Posted metadata, while its unchanged post-body entry point retains the `Series:` label. The hero sentence has no additional top margin and shares Posted/Updated typography in [`css/tailwind.css`](../../css/tailwind.css): the base/mobile rule is 16px, italic, weight 300, with 17.6px line height; the `min-width: 768px` desktop rule is 20px with 22px line height and retains that italic/weight treatment. Its link inherits the same color and weight and is distinguished at rest only by an underline; hover changes its color. This Hero-only override intentionally leaves the article-body `Series:` link’s distinct accent color and bold weight unchanged.
- [`components/hux/SideCatalog.tsx`](../../components/hux/SideCatalog.tsx) tracks desktop headings; [`components/hux/ArticleToc.tsx`](../../components/hux/ArticleToc.tsx) provides the native mobile equivalent.
- [`css/tailwind.css`](../../css/tailwind.css) contains the responsive Hux geometry and is a high-risk behavior file, not merely styling.

### Article layout contracts

The current CSS restores the Hux intermediate widths: full-width mobile, a 750px outer frame around 768px, a 970px frame/`col-md-10`-like reading width from 992px, then a 1170px grid with desktop catalog at 1200px+. About shares base post-shell classes but stays an independent centered narrow column; article-specific grid selectors must exclude `.about-shell`.

Hub heroes intentionally share their height across the `home` and `archive` variants: 270px below 768px and 418px at `min-width: 768px` ([`css/tailwind.css`](../../css/tailwind.css)). This keeps About, Archive, both Series surfaces, the 404 page, and `/offline/` from shifting vertically during navigation; [`tests/playwright/blog-parity.spec.ts`](../../tests/playwright/blog-parity.spec.ts) compares all of those archive-variant call sites with About at 375px and 1280px. Before changing hero dimensions, `aspect-ratio`, or image-baked presentation, read the scoped human-maintained [CSS pitfalls lesson](../../docs/lessons/css-pitfalls.md).

Article heading scroll margins and catalog observer boundaries are paired: hash jumps need clearance for the reappearing navigation bar, and active-heading state must agree with that offset. Production tests in [`tests/playwright/article-width.spec.ts`](../../tests/playwright/article-width.spec.ts) and [`tests/playwright/catalog.spec.ts`](../../tests/playwright/catalog.spec.ts) pin those contracts.

## Metadata, social cards, and PWA

Site metadata comes from [`data/siteMetadata.js`](../../data/siteMetadata.js). The root layout defines baseline RSS, SEO, and social metadata; routes refine it.

Social images use `next/og` plus local fonts and a shared card renderer. Post cards select `headerImg`, then an accepted gradient, then a fallback. Keep [`lib/social-card.ts`](../../lib/social-card.ts) and the relevant PNG/browser tests aligned: `ImageResponse` supports only a CSS subset, including an explicit-positioning requirement for full-card overlays.

The PWA intentionally does not precache every asset. [`app/serwist/[path]/route.ts`](../../app/serwist/%5Bpath%5D/route.ts) precaches the offline presentation dependencies; [`app/sw.ts`](../../app/sw.ts) gives hashed Next scripts a bounded CacheFirst policy and warms the current offline page’s hydration chunks at activation. Offline document navigations fall back to `/offline/`.

## Extension points and cautions

- **New external service:** update `siteMetadata` as applicable, CSP/remote image/iframe allowlists in [`next.config.mjs`](../../next.config.mjs) or [`lib/iframe.ts`](../../lib/iframe.ts), then add focused tests.
- **New top-level route:** consider sitemap/robots/canonical/OG behavior, trailing slashes, legacy route collisions, and static-export compatibility.
- **New localized area:** put locale-invariant visual layers in a route-group layout; leave language-specific content in pages.
- **New client-only feature:** preserve server rendering for content pages and avoid adding initial homepage payload. The recent history intentionally disabled eager post prefetch, deferred comments, and optimized the hero/font path.
