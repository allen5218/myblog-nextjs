# Quality contracts and testing

The test suite protects migration and user-facing behavior, not only isolated implementation details. Treat a failing regression spec as evidence of an intentional contract unless source/history proves it is obsolete.

## Required CI checks

[`ci.yml`](../../.github/workflows/ci.yml) runs on pushes to `main` and pull requests:

1. install dependencies with cached Yarn;
2. `yarn contentlayer2 build` so generated imports exist;
3. non-mutating `yarn eslint app components lib layouts scripts`;
4. `yarn tsc --noEmit`;
5. `yarn test:unit`.

[`og-font-check.yml`](../../.github/workflows/og-font-check.yml) is a separate required check. It installs HarfBuzz/woff2, validates social-card glyph coverage, generates Contentlayer models, retrieves base Chiron assignment, core, and epoch data from `origin/main`, and runs full Chiron validation. Core history is checked whenever a base core exists; assignment history is checked only when the committed epoch equals the base epoch, so an intentional epoch advance is reported as a warning instead. It must run on every PR rather than use `paths` filtering, because a required check that never starts leaves GitHub branch protection permanently pending.

The Mermaid workflow is intentionally advisory. It checks generated cache structure without redraw because SVG output can vary by platform.

## Unit tests: deterministic policies and transforms

Vitest is node-only and includes only `tests/unit/**/*.test.ts` ([`vitest.config.ts`](../../vitest.config.ts)). The main clusters are:

| Area | Representative coverage |
| --- | --- |
| Embed policy | [`iframe.test.ts`](../../tests/unit/iframe.test.ts) rejects deceptive suffixes, subdomains, ports, and unsupported protocols/hosts. |
| Content/Mermaid transform | [`rehype-mermaid.test.ts`](../../tests/unit/rehype-mermaid.test.ts) distinguishes an `ENOENT` cache miss (code-block fallback) from an existing corrupt SVG or another read failure (throw), requires both theme variants to be checked, and pins per-variant rounded image dimensions; [`mermaid-shared.test.ts`](../../tests/unit/mermaid-shared.test.ts) covers the shared root-dimension parser’s strict SVG-number, document-root `<svg>` anchor, duplicate-attribute, quoted-value, and malformed-tag rejection. [`mermaid-gantt-contract.test.ts`](../../tests/unit/mermaid-gantt-contract.test.ts) scans every Mermaid Gantt under `data/blog/` for `todayMarker off` and verifies its committed variants have no `today` element. |
| Social cards | font loading and card rendering paths. |
| Pagination | URL/page-count semantics. |
| Publication policy and derived outputs | [`post-publication.test.ts`](../../tests/unit/post-publication.test.ts) defines the production/preview reachable-and-listed truth table, deterministic navigation ordering, static params, aliases, and hidden-pager behavior; [`content-outputs.test.ts`](../../tests/unit/content-outputs.test.ts) and [`content-writers.test.ts`](../../tests/unit/content-writers.test.ts) verify explicit-mode content-output orchestration and writers that do not re-filter their inputs; [`route-publication-wiring.test.ts`](../../tests/unit/route-publication-wiring.test.ts) guards canonical, OG, and legacy-route policy wiring. |
| Series domain/rendering | [`series.test.ts`](../../tests/unit/series.test.ts) covers normalized identities, visibility, collision rejection, locale-independent reading order, encoded route lookup, and member-wide modification dates; [`series-rendering.test.ts`](../../tests/unit/series-rendering.test.ts) pins link eligibility, top/bottom placement, and the rendered Hero sentence/order. |
| Hero front matter and rendering | [`hero-config.test.ts`](../../tests/unit/hero-config.test.ts) defines parse/coercion and build-validation failures for `headerStyle: text`, including every conflicting field and a transparent (`0`) mask; [`hero-mode.test.ts`](../../tests/unit/hero-mode.test.ts) pins surface precedence and text-mode mask suppression; [`hero-rendering.test.tsx`](../../tests/unit/hero-rendering.test.tsx) checks the rendered text-hero class, no-inline-style requirement, retained post metadata, and no mask. |
| Hero/navbar CSS-token wiring | [`css-token-contract.test.ts`](../../tests/unit/css-token-contract.test.ts) parses `css/tailwind.css` to pin the declaration scopes and winning consumer declarations of hero/navbar custom properties, and renders all navbar triggers to require their semantic class. It also requires the paired popup focus tokens to occur together in focus branches. This required-CI check guards wiring only: computed colours, contrast, breakpoint gaps, and higher-specificity overrides remain browser-test concerns. |
| Full-width CSS geometry | [`css-viewport-width-contract.test.ts`](../../tests/unit/css-viewport-width-contract.test.ts) rejects unapproved `vw` values in horizontal sizing/offset declarations, pinning the one safe mobile code-block exception by exact selector and value. It protects classic-scrollbar overflow that headless Playwright cannot reproduce. |
| Layout reachability | [`layout-reachability.test.ts`](../../tests/unit/layout-reachability.test.ts) requires every `layouts/*.tsx` candidate to survive TypeScript emission as a direct runtime import of an `app/**/page.tsx`, using the compiler’s own import elision and module resolution rather than a hand-written approximation. |
| Agent-instruction routing | [`agents-md-contract.test.ts`](../../tests/unit/agents-md-contract.test.ts) caps the human-authored [`AGENTS.md`](../../AGENTS.md) schema/router at 24 KiB, rejects `@` imports that bypass that budget, and requires every lesson route to be a resolving inline Markdown link after comments and fenced blocks are excluded. Keep generated OpenWiki material separate: link to the schema/router rather than reproducing its rules or session-authored lessons. |
| Font pipeline | source metadata, code-point planning, generation, command parsing, validation policy, and rollback/failure behavior in `site-font-*.test.ts`; epoch-advance checks also require the exact deterministic rebalance output, and a missing base epoch remains history-protected. |

Add unit coverage when changing a pure policy, parser/transform, cache key, or transactional generation invariant. In particular, security allowlists and font assignment behavior must not rely only on end-to-end coverage.

## Browser parity suite

Playwright runs Chromium against a production build/server by default ([`playwright.config.ts`](../../playwright.config.ts)); suites are not fully parallel, retry twice in CI, and retain a trace on first retry. This makes it the authoritative test layer for visual and client-navigation behavior.

Important contract groups include:

| Behavior | Specs to inspect before changing it |
| --- | --- |
| Legacy post URLs, redirect/search/feed/sitemap semantics, i18n | [`blog-parity.spec.ts`](../../tests/playwright/blog-parity.spec.ts) |
| Production draft gates; hidden canonical/OG/alias reachability and pager exclusion | [`publication-policy.spec.ts`](../../tests/playwright/publication-policy.spec.ts) |
| Home/tag pagination | [`pagination.spec.ts`](../../tests/playwright/pagination.spec.ts) |
| Series index/detail routes, sitemap, Hero sentence/link/order and its zero added metadata gap, post-body `Series:` label/placement, light/dark contrast, **post-hero Series metadata and its link matching Posted/Updated in color, size, italic style, and weight at 375px and 1200px** (the link is underlined at rest and has theme-independent hover color), the body link retaining distinct bold/accent treatment, and **desktop** primary-navigation order | [`series.spec.ts`](../../tests/playwright/series.spec.ts) |
| **Mobile** hamburger navigation order (and Search’s one-tap KBar transition) | [`kbar-touch.spec.ts`](../../tests/playwright/kbar-touch.spec.ts) |
| Hux visual shell and responsive post widths | [`article-width.spec.ts`](../../tests/playwright/article-width.spec.ts), [`blog-parity.spec.ts`](../../tests/playwright/blog-parity.spec.ts); the latter compares Archive, both Series surfaces, 404, and `/offline/` archive-variant hero heights with About at 375px and 1280px. |
| Split list/article pager markup, container-relative responsive geometry, and article pager rest/active styling | [`unified-control-accent.spec.ts`](../../tests/playwright/unified-control-accent.spec.ts), [`blog-parity.spec.ts`](../../tests/playwright/blog-parity.spec.ts) |
| Shared hover/focus control accent across article pager, Back to top, KBar results/label, ThemeSwitch options, and mobile-menu Link/Search items | [`unified-control-accent.spec.ts`](../../tests/playwright/unified-control-accent.spec.ts) covers ThemeSwitch hover and keyboard focus in both themes; [`header-style-text.spec.ts`](../../tests/playwright/header-style-text.spec.ts) scopes the approved white-on-accent contrast exception to the two navbar dropdowns and measures mobile-menu Link and Search hover plus keyboard focus in both themes; [`css-token-contract.test.ts`](../../tests/unit/css-token-contract.test.ts) pins the paired MobileNav source classes; [`blog-parity.spec.ts`](../../tests/playwright/blog-parity.spec.ts) covers the search active result |
| Article hash/catalog/mobile ToC | [`catalog.spec.ts`](../../tests/playwright/catalog.spec.ts) |
| About hero stays mounted across locale navigation | [`about-hero-persistence.spec.ts`](../../tests/playwright/about-hero-persistence.spec.ts) |
| Text-only post hero | [`header-style-text.spec.ts`](../../tests/playwright/header-style-text.spec.ts) covers light/dark foreground and contrast tokens across hero and navbar consumers at desktop/mobile viewports, absence of background/mask, responsive hero spacing, tag interaction, fixed-header transitions, and keyboard focus visibility; it uses an image post as a white-on-photo control. |
| Hero preload and lazy comments | [`home-hero-preload.spec.ts`](../../tests/playwright/home-hero-preload.spec.ts), [`comments-lazy-loading.spec.ts`](../../tests/playwright/comments-lazy-loading.spec.ts) |
| Mermaid cached rendering/theme/overflow and load-time layout reservation | [`mermaid.spec.ts`](../../tests/playwright/mermaid.spec.ts) verifies light/dark switching, narrow-screen overflow, usable intrinsic SVGs, and—while the displayed SVG response is held—the rounded `<img>` dimensions, reserved geometry, and root-size/viewBox contract before load. |
| OG images | [`social-card.spec.ts`](../../tests/playwright/social-card.spec.ts) |
| PWA precache/offline behavior | [`serwist-precache.spec.ts`](../../tests/playwright/serwist-precache.spec.ts) |
| Chiron request/byte budgets and rendered glyph selection | [`site-font-loading.spec.ts`](../../tests/playwright/site-font-loading.spec.ts) measures the homepage and every generated article against the manifest; this catches glyphs omitted from the hand-maintained static seeds (printable ASCII, shared UI text, dictionaries, and site metadata) or not discoverable from article Markdown. KaTeX output is excluded because its HTML and MathML font chains bypass Chiron, so its DOM presence does not create a Chiron request. |

## Change matrix

| If you change… | Minimum validation |
| --- | --- |
| post schema, publication policy, canonical URLs, pagination, tag/search/feed filtering | Contentlayer build; publication-policy/output/wiring unit tests when visibility changes; `publication-policy`, `pagination`, and/or `blog-parity` browser specs as applicable |
| series front matter, collection grouping/routes, or collection styling | Contentlayer build, `series.test.ts` and `series-rendering.test.ts`, then production-backed `series.spec.ts`; preserve hidden/draft exclusion, static 404 behavior, accessible hover/focus states in both themes, the 375px/1200px Hero metadata/link alignment with Posted/Updated, and the distinct article-body link treatment |
| Hux CSS, hero, article layout, catalog | targeted production-backed Playwright specs at desktop and mobile; use `header-style-text` for text-hero foreground/background, responsive spacing, interaction, or navbar-token changes. When changing protected hero/navbar token declarations or consumers, also run `css-token-contract.test.ts`; it complements rather than replaces browser checks. |
| About locales/layout | `about-hero-persistence` plus parity URL metadata checks |
| PWA/service-worker caching | `serwist-precache`; verify offline fallback hydration if chunk strategy changes |
| social-card layout/font/background choice | unit coverage plus `social-card`; inspect rendered PNG behavior rather than only props |
| Mermaid renderer/plugin/theme | `mermaid:render`, `--check`, `mermaid-shared`, `rehype-mermaid`, and all-Gantt contract unit tests, then browser theme/mobile/intrinsic-layout tests; preserve fail-loud rejection for an existing cache without usable root dimensions, the code-block fallback for a true cache miss, and the shared producer/consumer dimension parser. |
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
