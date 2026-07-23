# Content and publishing workflow

## Content is the product model

Blog posts are Markdown/MDX files under `data/blog/`; author profiles are MDX under `data/authors/`. The required post front matter is `title` and `date` ([`contentlayer.config.ts`](../../contentlayer.config.ts)). New posts conventionally use `YYYY-MM-DD-slug.md`, but URL computation uses the front matter date together with the date-stripped source filename.

### Important post fields

| Field | Effect |
| --- | --- |
| `title`, `date` | Required; identify the post and derive its legacy URL. |
| `tags` | Drives tag pages, tag counts, tag feeds, and search metadata. |
| `draft` | Excluded from production-facing derived outputs such as feeds. |
| `hidden` | Sets computed `listed: false`; excludes the post from listing/search/tag count surfaces. |
| `update`, `subtitle`, `images`, `canonicalUrl` | Feed/metadata/preview support; `update` becomes `lastmod` when available. |
| `headerImg`, `headerBgCss`, `headerMask` | Hux hero and social-card presentation. |
| `catalog` | Defaults to visible; set false to suppress desktop/mobile article navigation. |
| `bibliography`, `mathjax`, `mermaid`, `iframe` | Content capability/configuration fields. |

The schema also computes reading time, table-of-contents headings, summary/preview, hero image, structured data, `legacyPath`, and trailing-slash `url`. Review the full field description in the [manual](../../docs/functionality-settings-manual.md); this page focuses on change impact.

## Compilation pipeline

[`contentlayer.config.ts`](../../contentlayer.config.ts) is the canonical content compiler. It applies:

- remark plugins for front matter extraction, GFM, code titles, math, image JSX conversion, GitHub-style alerts, and responsive iframe normalization;
- rehype plugins for **Mermaid before Prism**, heading IDs/anchors, KaTeX, citations sourced from `data/`, Prism highlighting, and minification;
- post-success generation of `app/tag-data.json` and `public/search.json` (when local KBar search is selected).

Mermaid must precede Prism: Prism rewrites code markup, after which the Mermaid plugin cannot recognize the original fence and silently falls back to a normal code block. Responsive iframes are only wrapped when their source passes the allowlist in [`lib/iframe.ts`](../../lib/iframe.ts).

## Publish a post safely

1. Add the Markdown file to `data/blog/` with at least `title` and `date`.
2. Use the manual for MDX, alert, math, citation, image, and embed syntax. Keep external iframe hosts within the approved policy—do not broaden it casually.
3. If the post includes Mermaid fences, run `yarn mermaid:render` and commit the generated paired SVG cache artifacts under `public/mermaid/`.
4. If new text needs glyphs absent from the social-card font, run `yarn update:og-font`; if it changes site Chiron coverage, use the site-font workflow in the [runbook](../operations/runbook.md).
5. Run `yarn contentlayer2 build`, then `yarn test:unit`. For visible publishing/routing/rendering changes, run `yarn test:parity`.
6. Check the generated legacy URL, tags/search visibility, feed inclusion, ToC/catalog, hero, social image, and any responsive embed in a production build.

## Publication outputs

| Output | Producer | Inclusion rule |
| --- | --- | --- |
| canonical route/metadata | App post route plus Contentlayer computed fields | every generated post route |
| `app/tag-data.json` | Contentlayer `onSuccess` | tags from listed posts; drafts additionally excluded in production |
| `public/search.json` | Contentlayer `onSuccess` | listed posts |
| `feed.xml`, `tags/<tag>/feed.xml` | [`scripts/rss.mjs`](../../scripts/rss.mjs) after Next build | only non-draft, listed posts; fields are XML-escaped |
| sitemap | [`app/sitemap.ts`](../../app/sitemap.ts) | canonical posts and core hubs; not pagination combinations |
| post Open Graph PNG | post `opengraph-image` route + shared social-card renderer | derived from post metadata/header configuration |

`yarn build` is intentionally sequenced as font checks → Contentlayer → site-font validation → Next build → RSS. It is not equivalent to calling `next build` directly.

## Legacy URL and visibility rules

Legacy compatibility is end-to-end. A route must agree with generated `legacyPath`, `url`, post lookup/redirect behavior, RSS URL, sitemap entry, social metadata, and Giscus `pathname` mapping. Changing date/slug semantics can break inbound links and disconnect existing discussion threads.

The current homepage is the first paginated list. `/blog` and legacy list pagination redirect to `/` or `/pageN/` in server-capable deployments. Do not introduce a second home/list interpretation or reuse a conflicting root dynamic segment without checking the post route.

## Change-oriented source map

- **Schema or content transform:** [`contentlayer.config.ts`](../../contentlayer.config.ts), then unit tests that cover the transform.
- **Post route/rendering:** [`app/[year]/[month]/[day]/[slug]/page.tsx`](../../app/%5Byear%5D/%5Bmonth%5D/%5Bday%5D/%5Bslug%5D/page.tsx), [`layouts/PostLayout.tsx`](../../layouts/PostLayout.tsx).
- **Pagination:** [`lib/pagination.ts`](../../lib/pagination.ts), home/tag pages, and [`tests/playwright/pagination.spec.ts`](../../tests/playwright/pagination.spec.ts).
- **RSS:** [`scripts/rss.mjs`](../../scripts/rss.mjs) and legacy-path tests.
- **Search/tag behavior:** schema success hooks, `app/tag-data.json`, and `data/siteMetadata.js` search configuration.

## What recent history explains

The migration prioritizes observable legacy parity rather than a generic starter-blog design. Recent UI work added a mobile TOC and hardened hash/catalog navigation; current HEAD restored reading widths at middle breakpoints after the large-screen grid approach regressed tablets. The related browser tests are the best specification when changing content presentation.
