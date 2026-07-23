# Allen’s Blog — engineering quickstart

This is a personal technical/life blog at `blog.allenspace.de`: a Next.js App Router migration of a Jekyll/Hux site. The project deliberately preserves legacy post URLs and Giscus discussion mapping while retaining the Hux visual language. Content is compiled from Markdown/MDX by Contentlayer; the application produces static-friendly pages, search/tag artifacts, feeds, metadata, and a PWA service worker.

## Start here

```bash
yarn install
yarn dev                     # Contentlayer build + watcher, then Next dev
yarn test:unit               # fast Node-level tests
yarn test:parity             # production build/serve + Playwright
```

`yarn dev` is not a substitute for interaction/performance verification: Playwright deliberately starts a production build on `127.0.0.1:3012` ([`playwright.config.ts`](../playwright.config.ts)). Before running standalone type checking in a clean checkout, generate Contentlayer output with `yarn contentlayer2 build`.

The repository uses Yarn 3.6.1 and Node 24 in CI ([`package.json`](../package.json), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)). Read the relevant portion of [`AGENTS.md`](../AGENTS.md) before modifying build, fonts, routing, PWA, or visual behavior: it records intentional constraints and environment pitfalls.

## Architecture at a glance

```text
MDX + author profiles in data/
  └─ Contentlayer schema/plugins ──> .contentlayer/generated
                                      ├─ app/ App Router pages and metadata routes
                                      ├─ layouts/ + components/ Hux rendering shell
                                      └─ generated app/tag-data.json and public/search.json

Build validation → Next/Turbopack → RSS/tag feeds → deployment
```

The public post identity is the legacy date URL `/:year/:month/:day/:slug/`; it is derived from front matter `date`, not merely from a file name. This is an SEO, inbound-link, feed, and comments compatibility contract—not a cosmetic route choice. See [architecture overview](architecture/overview.md) and [content and publishing](workflows/content-and-publishing.md).

## Guide map

- **[Architecture overview](architecture/overview.md)** — route topology, rendering shell, Hux layout, localized About page, metadata, social cards, and PWA.
- **[Content and publishing](workflows/content-and-publishing.md)** — post schema, authoring rules, MDX transforms, legacy URLs, generated search/tag/feed outputs.
- **[Operations runbook](operations/runbook.md)** — build sequence, font and Mermaid asset workflows, security/integration boundaries, deployment modes, and maintenance cautions.
- **[Quality contracts](testing/quality-contracts.md)** — CI gates, unit-test scope, and browser regressions that pin compatibility and rendering behavior.

The human-facing comprehensive reference is the [English functionality and settings manual](../docs/functionality-settings-manual.md) (also available [in Traditional Chinese](../docs/functionality-settings-manual.zh-TW.md)). This wiki is a navigation and change-impact layer, not a replacement for it.

## Practical source map

| Need | Start with |
| --- | --- |
| Write/change a post | `data/blog/`, [`contentlayer.config.ts`](../contentlayer.config.ts), [publishing guide](workflows/content-and-publishing.md) |
| Change pages or route behavior | `app/`, [`lib/pagination.ts`](../lib/pagination.ts), [`lib/legacy-url.ts`](../lib/legacy-url.ts) |
| Change the visual shell | `layouts/`, `components/hux/`, [`css/tailwind.css`](../css/tailwind.css) |
| Change site-wide config/integrations | [`data/siteMetadata.js`](../data/siteMetadata.js), [`next.config.mjs`](../next.config.mjs) |
| Change generated fonts/diagrams | `font-data/chiron/`, `scripts/site-font-*.mjs`, `scripts/mermaid-*.mjs`; read the runbook first |
| Understand expected behavior | `tests/unit/`, `tests/playwright/`, [quality contracts](testing/quality-contracts.md) |
| Change automated delivery | `.github/workflows/`; `ci.yml` and `og-font-check.yml` are protected-branch gates |

## High-value invariants

1. **Preserve legacy URLs.** Keep trailing-slash behavior and date-derived post paths consistent across routes, redirects, RSS, sitemap, Open Graph, and Giscus pathname mapping.
2. **Treat generated artifacts as a set.** Chiron fonts, CSS, manifest, and assignment/core inputs are coordinated outputs; Mermaid SVGs are committed cache artifacts. Do not hand-edit generated outputs.
3. **Keep security allowlists narrow.** CSP, remote images, iframes, and hero embeds are intentionally restrictive. A new third-party integration generally requires coordinated config and test changes.
4. **Test production behavior.** Navigation, responsive article width, table of contents, offline fallback, comments, social cards, and font loading are protected by Playwright—not by a dev-server smoke test.
5. **`AGENTS.md` outranks this wiki.** It is the human-maintained source of truth for rules, environment pitfalls, and the reasoning behind them; this wiki documents how the codebase works and is regenerated from source. When the two disagree, `AGENTS.md` wins.

## Recent direction

Recent commits show the active maintenance themes: restoring Hux article widths at tablet/narrow-desktop breakpoints (`cae7df1`), making desktop and mobile article navigation reliable (`c92afc9`, `8b9208c`), preserving the About hero during locale switches (`23e84bd`), and lowering initial payload through deferred comments, AVIF preload, narrow PWA precache, and Chiron subsets (`f7fcb9f`, `4621494`, `fad9629`). When touching these areas, find the corresponding Playwright test before changing implementation.

## Backlog

- **Newsletter endpoint** — [`app/api/newsletter/route.ts`](../app/api/newsletter/route.ts): intentionally deferred because it is a small isolated endpoint; document it in depth if its provider/configuration becomes active or changes.
