# Architecture overview

## Runtime model

The project is a Next.js 16 App Router site with TypeScript, React 19, Tailwind v4, Pliny integrations, and Contentlayer2 ([`package.json`](../../package.json)). Contentlayer generates typed `Blog` and `Authors` documents before Next consumes them; generated modules live in ignored `.contentlayer/`, so application code imports `contentlayer/generated` rather than parsing Markdown at request time.

The root layout ([`app/layout.tsx`](../../app/layout.tsx)) composes the global runtime in this order:

1. Serwist provider registering `/serwist/sw.js`.
2. client fixes for document language and focus styling.
3. theme provider, configured analytics, and local KBar search provider.
4. full-width `SectionContainer`, Header, route content, and Footer.

The full-width shell is intentional. Do not restore the upstream starter’s max-width/padding or scrollbar compensation hacks without checking Hux full-bleed geometry, especially in Safari.

## Routes and compatibility

| Public surface | Implementation and contract |
| --- | --- |
| `/` and `/pageN/` | Home is page 1 of a single paginated list, not a separate featured view ([`app/page.tsx`](../../app/page.tsx), [`app/[year]/page.tsx`](../../app/%5Byear%5D/page.tsx), [`lib/pagination.ts`](../../lib/pagination.ts)). |
| `/:year/:month/:day/:slug/` | Canonical legacy-style post route. It statically generates posts, selects a content layout, emits post metadata/JSON-LD, and calculates adjacent posts ([`app/[year]/[month]/[day]/[slug]/page.tsx`](../../app/%5Byear%5D/%5Bmonth%5D/%5Bday%5D/%5Bslug%5D/page.tsx)). |
| `/blog/...` | Compatibility lookup and permanent redirect to a canonical legacy URL ([`app/blog/[...slug]/page.tsx`](../../app/blog/%5B...slug%5D/page.tsx)). |
| `/tags/`, `/archive/` | Contentlayer-derived discovery pages. Tag list pagination follows its own first-page semantics. Tag sublists are `noindex` to avoid duplicate listing combinations. |
| `/about/`, `/en/about/` | The only localized content surface. A route-group layout keeps the shared hero mounted while language content changes. |
| metadata endpoints | `manifest`, `robots`, `sitemap`, root/per-post Open Graph images, and a generic social card are App Router metadata/route handlers. |
| offline/service worker | `/offline/`, [`app/sw.ts`](../../app/sw.ts), and [`app/serwist/[path]/route.ts`](../../app/serwist/%5Bpath%5D/route.ts) implement PWA behavior. |

`next.config.mjs` enforces trailing slashes and redirects obsolete `/blog` list routes to the home/page convention. Those Next redirects do **not** execute in static-export mode; a static host must provide equivalent behavior if it needs it.

### About localization

[`lib/i18n.ts`](../../lib/i18n.ts) defines `zh-TW` as the unprefixed default and `en` as `/en`. The two pages load server-side dictionaries and render a shared About component. The `(about)` route-group layout is a behavioral boundary: it owns the hero to avoid a background/hero flash on language navigation. Legacy About `?lang=` URLs are redirected by [`proxy.ts`](../../proxy.ts); proxy behavior is unavailable to static exports.

## Rendering and visual composition

The Hux port is organized around reusable layout components:

- [`layouts/HuxListLayout.tsx`](../../layouts/HuxListLayout.tsx) renders the home/tag listing surfaces with hero, cards, pager, and sidebar.
- [`layouts/PostLayout.tsx`](../../layouts/PostLayout.tsx) renders hero metadata, article body, mobile TOC, desktop catalog, adjacent-post pager, and lazily loaded comments.
- [`components/hux/HuxHero.tsx`](../../components/hux/HuxHero.tsx) is the shared hero primitive for posts and hubs. It supports image, a sanitized gradient-like CSS background, mask opacity, and allowlisted presentation iframe modes.
- [`components/hux/SideCatalog.tsx`](../../components/hux/SideCatalog.tsx) tracks desktop headings; [`components/hux/ArticleToc.tsx`](../../components/hux/ArticleToc.tsx) provides the native mobile equivalent.
- [`css/tailwind.css`](../../css/tailwind.css) contains the responsive Hux geometry and is a high-risk behavior file, not merely styling.

### Article layout contracts

The current CSS restores the Hux intermediate widths: full-width mobile, a 750px outer frame around 768px, a 970px frame/`col-md-10`-like reading width from 992px, then a 1170px grid with desktop catalog at 1200px+. About shares base post-shell classes but stays an independent centered narrow column; article-specific grid selectors must exclude `.about-shell`.

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
