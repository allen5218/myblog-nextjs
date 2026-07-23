# Quality contracts and testing

The test suite protects migration and user-facing behavior, not only isolated implementation details. Treat a failing regression spec as evidence of an intentional contract unless source/history proves it is obsolete.

## Required CI checks

[`ci.yml`](../../.github/workflows/ci.yml) runs on pushes to `main` and pull requests:

1. install dependencies with cached Yarn;
2. `yarn contentlayer2 build` so generated imports exist;
3. non-mutating `yarn eslint app components lib layouts scripts`;
4. `yarn tsc --noEmit`;
5. `yarn test:unit`.

[`og-font-check.yml`](../../.github/workflows/og-font-check.yml) is a separate required check. It installs HarfBuzz/woff2, validates social-card glyph coverage, generates Contentlayer models, retrieves base font assignment/core data from `origin/main`, and runs full Chiron validation. It must run on every PR rather than use `paths` filtering, because a required check that never starts leaves GitHub branch protection permanently pending.

The Mermaid workflow is intentionally advisory. It checks generated cache structure without redraw because SVG output can vary by platform.

## Unit tests: deterministic policies and transforms

Vitest is node-only and includes only `tests/unit/**/*.test.ts` ([`vitest.config.ts`](../../vitest.config.ts)). The main clusters are:

| Area | Representative coverage |
| --- | --- |
| Embed policy | [`iframe.test.ts`](../../tests/unit/iframe.test.ts) rejects deceptive suffixes, subdomains, ports, and unsupported protocols/hosts. |
| Content/Mermaid transform | [`rehype-mermaid.test.ts`](../../tests/unit/rehype-mermaid.test.ts) covers hash/cache lookup and fallback behavior. |
| Social cards | font loading and card rendering paths. |
| Pagination | URL/page-count semantics. |
| Font pipeline | source metadata, code-point planning, generation, command parsing, validation policy, and rollback/failure behavior in `site-font-*.test.ts`. |

Add unit coverage when changing a pure policy, parser/transform, cache key, or transactional generation invariant. In particular, security allowlists and font assignment behavior must not rely only on end-to-end coverage.

## Browser parity suite

Playwright runs Chromium against a production build/server by default ([`playwright.config.ts`](../../playwright.config.ts)); suites are not fully parallel, retry twice in CI, and retain a trace on first retry. This makes it the authoritative test layer for visual and client-navigation behavior.

Important contract groups include:

| Behavior | Specs to inspect before changing it |
| --- | --- |
| Legacy post URLs, redirect/search/feed/sitemap semantics, i18n | [`blog-parity.spec.ts`](../../tests/playwright/blog-parity.spec.ts) |
| Home/tag pagination | [`pagination.spec.ts`](../../tests/playwright/pagination.spec.ts) |
| Hux visual shell and responsive post widths | [`article-width.spec.ts`](../../tests/playwright/article-width.spec.ts), `blog-parity.spec.ts` |
| Article hash/catalog/mobile ToC | [`catalog.spec.ts`](../../tests/playwright/catalog.spec.ts) |
| About hero stays mounted across locale navigation | [`about-hero-persistence.spec.ts`](../../tests/playwright/about-hero-persistence.spec.ts) |
| Hero preload and lazy comments | [`home-hero-preload.spec.ts`](../../tests/playwright/home-hero-preload.spec.ts), [`comments-lazy-loading.spec.ts`](../../tests/playwright/comments-lazy-loading.spec.ts) |
| Mermaid cached rendering/theme/overflow | [`mermaid.spec.ts`](../../tests/playwright/mermaid.spec.ts) |
| OG images | [`social-card.spec.ts`](../../tests/playwright/social-card.spec.ts) |
| PWA precache/offline behavior | [`serwist-precache.spec.ts`](../../tests/playwright/serwist-precache.spec.ts) |
| Chiron request/byte budgets | [`site-font-loading.spec.ts`](../../tests/playwright/site-font-loading.spec.ts) |

## Change matrix

| If you change… | Minimum validation |
| --- | --- |
| post schema, canonical URLs, pagination, tag/search/feed filtering | Contentlayer build, related unit tests, `pagination`/`blog-parity` browser specs |
| Hux CSS, hero, article layout, catalog | targeted Playwright specs at desktop and mobile; use production build |
| About locales/layout | `about-hero-persistence` plus parity URL metadata checks |
| PWA/service-worker caching | `serwist-precache`; verify offline fallback hydration if chunk strategy changes |
| social-card layout/font/background choice | unit coverage plus `social-card`; inspect rendered PNG behavior rather than only props |
| Mermaid renderer/plugin/theme | `mermaid:render`, `--check`, unit transform tests, browser theme/mobile tests |
| site/OG font generation | unit font tests, full local check where tooling exists, and rely on CI’s required font gate |
| CSP/iframe/remote image policy | allowlist unit tests and a production browser case for the intended integration |

## Recent regression rationale

Recent history reinforces the purpose of these tests. `cae7df1` added concrete viewport-width assertions after a layout simplification made tablet/narrow desktop articles too wide. `8b9208c` added a mobile table of contents, while `c92afc9` fixed catalog navigation reliability—both require checking hash position and active state. `23e84bd` introduced a shared route-group layout and a browser test because the About hero visually disappeared during client locale transitions. The earlier performance work added tests for deferred comments, prioritized AVIF hero loading, service-worker precache scope, and Chiron budget limits.

## Before opening a PR

1. Check `git status`; do not absorb unrelated changes (notably generated `next-env.d.ts` churn).
2. Run targeted tests first, then the suite appropriate to the risk.
3. For UI interaction, run the production-backed Playwright case instead of treating dev latency as failure.
4. For content/font/Mermaid changes, ensure generated artifacts are present and intentional.
5. Keep CI workflow names/job status contexts stable unless branch protection is updated with them.
