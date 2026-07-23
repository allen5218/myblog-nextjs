# Operations runbook

## Commands and build order

| Command | Use | Notes |
| --- | --- | --- |
| `yarn dev` / `yarn start` | local development | blocking Contentlayer build, then Contentlayer watcher and Next dev via [`scripts/dev.mjs`](../../scripts/dev.mjs) |
| `yarn build` | production artifact | OG-font check → Contentlayer → site-font check → Next build → RSS postbuild |
| `yarn serve` | serve built output | use for production-like manual verification |
| `yarn lint` | local autofix lint | includes `--fix`; CI intentionally invokes ESLint directly without fixing |
| `yarn test:unit` | Node tests | no browser/server required |
| `yarn test:parity` | production browser suite | build + local server unless `PLAYWRIGHT_BASE_URL` is given |
| `yarn mermaid:render` | generate Mermaid cache | `--check` verifies structure without writing/rerendering |
| `yarn update:og-font` | regenerate social-card font subset | needs HarfBuzz |
| `yarn update:site-font` | regenerate Chiron outputs | needs HarfBuzz and woff2; use `--rebuild-core` only for deliberate core expansion |

Do not run a second same-kind Next dev/build process to work around a lockfile. Next 16 separates dev/build type output, so `next-env.d.ts` can change depending on the last process; this is generated churn and should not be committed as an unrelated change.

## Font maintenance

There are two distinct font concerns.

### Social-card font

`next/og` uses a local font subset. [`scripts/check-og-font.mjs`](../../scripts/check-og-font.mjs) shapes current social-card text with HarfBuzz and fails on missing glyphs; `update:og-font` rebuilds fixed 400/700 subsets from the pinned source. The check is enforced in GitHub Actions because Vercel does not provide HarfBuzz.

### Site Chiron font

The visible site uses a committed Chiron core plus five supplemental Unicode buckets. Authoritative inputs are `font-data/chiron/core-codepoints.txt`, `font-data/chiron/source.json`, and `font-data/chiron/supplemental-assignments.json`. Generated outputs are `public/static/fonts/chiron/*.woff2`, its manifest, and `css/chiron-font.generated.css`.

The assignment history is deliberately stable: ordinary content additions must not rebalance existing code points between buckets, and core must not shrink. The checker validates source/manifest/CSS consistency, glyph coverage, shaping, bucket history, and per-page byte/request budgets. Never hand-edit the generated CSS or manifest; regenerate and commit the complete output set.

Local full checking/regeneration needs `hb-shape`, `hb-subset`, `hb-info` (HarfBuzz) and `woff2_compress`/`woff2_decompress`. Use file/stdin-based Unicode input for HarfBuzz rather than non-ASCII command-line arguments. CI installs both packages for the full check; Vercel uses a narrowed policy because those binaries are unavailable.

## Mermaid maintenance

Mermaid diagrams are pre-rendered into committed light/dark SVGs under `public/mermaid/`. This avoids a browser-rendering dependency in deployment and permits immediate theme switching. The cache key incorporates the diagram, theme settings, and `CACHE_VERSION` in [`scripts/mermaid-shared.mjs`](../../scripts/mermaid-shared.mjs).

When changing Mermaid version, themes, normalization, or rendering behavior:

1. bump `CACHE_VERSION`;
2. run `yarn mermaid:render` locally with Chromium available;
3. inspect representative diagrams in both themes and at mobile width;
4. commit the cache artifacts.

`yarn mermaid:render --check` is intentionally structural only—hash/file coverage, no byte-for-byte redraw—because browser text measurement differs across platforms. The GitHub Mermaid workflow is advisory, not a required merge check. A missing/invalid cache degrades gracefully to a code block, so common causes of a “diagram disappeared” are forgotten render artifacts, stale `.contentlayer` output, an invalid `mermaid:title` fence (only exact `mermaid` is recognized), or a fence outside `data/blog/`.

## Security and integrations

[`next.config.mjs`](../../next.config.mjs) defines a deliberately narrow CSP and security headers. Production excludes `unsafe-eval`; configured external allowances cover only GA/GTM, Giscus, the image host, and specific iframe providers. Remote images are similarly restricted.

Configured integration points:

- **GA4** through Pliny analytics in [`data/siteMetadata.js`](../../data/siteMetadata.js).
- **Giscus** comments mapped by pathname; public environment overrides exist for repository/category values.
- **KBar** local search, compiled to `public/search.json`.
- **Serwist** PWA and offline fallback.
- **Social cards** generated locally with `next/og`.
- **Newsletter** isolated in [`app/api/newsletter/route.ts`](../../app/api/newsletter/route.ts).

Any new service must be evaluated across configuration, CSP, `next/image` remote patterns, iframe policy, generated metadata, static export, and tests. Do not add wildcard sources merely to make an embed work.

## Deployments

The normal production target is Vercel deployment of `main` (per [`AGENTS.md`](../../AGENTS.md)). Vercel builds cannot perform the complete HarfBuzz/woff2 validation, so GitHub Actions supplies the enforcing font gate.

[`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) is a manually triggered static-export fallback. It builds with `EXPORT=1`, `UNOPTIMIZED=1`, and a configured `BASE_PATH`; server redirects and proxy behavior do not operate there. It installs HarfBuzz because the regular build includes the OG-font check.

## CI workflow cautions

- `ci.yml` is the baseline required status: Contentlayer generation, non-mutating lint, typecheck, unit tests.
- `og-font-check.yml` is the other required status. It intentionally has **no paths filter**: a skipped required workflow never reports a result, leaving a PR pending forever.
- The font gate fetches `origin/main` to ensure existing Chiron assignments/core code points are not silently moved or reduced.
- The generated OpenWiki workflow is deliberately git-ignored. It opens pull requests from Actions, which would require the repository-wide "Allow Actions to create and approve pull requests" setting this project intentionally declines. Refresh the wiki by running `openwiki --update` locally, then open a normal pull request.

## Failure triage

| Symptom | First checks |
| --- | --- |
| `contentlayer/generated` module missing | run `yarn contentlayer2 build`; do this before standalone `tsc` in a clean checkout |
| build seems frozen | ensure no concurrent build; sandboxed Next production builds can be misleading—verify with a normal production environment before diagnosing a code regression |
| missing social-card glyph | run `yarn check:og-font`, then `yarn update:og-font` if it reports a gap |
| Chiron check fails after new content | run `yarn update:site-font`; commit all coordinated inputs/outputs, not just a WOFF2 file |
| diagram renders as code | follow Mermaid checklist above; never assume a client renderer should repair a missing cache |
| external embed/image blocked | inspect CSP, `images.remotePatterns`, and [`lib/iframe.ts`](../../lib/iframe.ts) together |
| browser behavior differs from dev | reproduce through `yarn test:parity` or `yarn build && yarn serve`, not cold dev navigation |
