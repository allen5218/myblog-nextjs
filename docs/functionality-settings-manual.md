# Functionality and Settings Manual

This manual describes the current Next.js blog behavior after the migration. It is written for site maintenance and deployment, not for application-code changes.

## Blog Content

Blog posts live under `data/blog/**/*.md` or `data/blog/**/*.markdown` and are processed as MDX.

Supported front matter fields:

- `title` required. Display title, SEO title, search title, feed title, and structured-data headline.
- `date` required. Publication date. The legacy public URL is generated from this date plus the filename slug: `/YYYY/MM/DD/slug/`.
- `tags` optional list of strings. Used for tag pages, archive filters, feeds, and post headers.
- `update` optional date. Used as `lastmod` and displayed as the updated date when present.
- `draft` optional boolean. Draft posts are excluded from sitemap and RSS. Tag counts exclude drafts in production.
- `subtitle` optional string. Used as the visible subtitle and fallback `summary`.
- `images` optional string or list. Used for SEO/social images when no `headerImg` is present.
- `authors` optional list and `author` optional string. Layouts mainly use `authors`, defaulting to `default`.
- `layout` optional string. Supported layouts are `PostLayout`, `PostSimple`, and `PostBanner`; unknown values fall back to `PostLayout`.
- `bibliography` optional string. Used by citation processing.
- `canonicalUrl` optional string. Defined in content schema, but the current post route emits the generated legacy canonical path.
- `headerImg` optional string. Hero image and SEO image fallback.
- `headerBgCss` optional string. Custom CSS background for the hero.
- `headerMask` optional number or JSON-compatible value. Controls hero mask opacity.
- `catalog` optional boolean. Preserved migration field for catalog/table-of-contents behavior.
- `mathjax` optional boolean. Legacy compatibility field only; MathJax is not loaded.
- `mermaid` optional boolean. Legacy compatibility field only; no client Mermaid runtime is initialized.
- `iframe` optional string. Renders a full hero iframe, currently used for slide/keynote-style posts.
- `hidden` optional boolean. When `true`, the post remains available at its direct legacy URL but is excluded from homepage, blog listing, tags, archive, search JSON, sitemap, and RSS.

Filename slug behavior:

- A filename date prefix like `2025-10-13-my-post.md` is stripped.
- The front matter `date`, not the filename date, controls `/YYYY/MM/DD/`.
- Keep migrated post dates stable to preserve comment, SEO, feed, and legacy inbound-link compatibility.

## About Page and i18n

The localized about pages are:

- `/about/` for `zh-TW`, the default locale.
- `/en/about/` for English.

Content comes from JSON dictionaries:

- `dictionaries/zh-TW.json`
- `dictionaries/en.json`

Each dictionary contains common language switcher labels plus the about page title, description, Open Graph locale, hero image, hero mask, profile fields, and body paragraphs. To update about content, edit both dictionaries so the two localized routes stay aligned.

Legacy compatibility:

- `/about/?lang=en` redirects permanently to `/en/about/`.
- `/about/?lang=zh` and `/about/?lang=zh-TW` redirect permanently to `/about/`.
- The redirect removes the query string.

The root HTML language starts as `zh-TW`; a client helper updates it to `en` on `/en/...` routes.

## Analytics

Analytics are rendered by Pliny's `Analytics` component from `siteMetadata.analytics`.

Currently configured:

- Umami is enabled structurally through `umamiAnalytics`.
- Set `NEXT_UMAMI_ID` to the Umami website ID.
- The CSP already allows `analytics.umami.is`.

Currently not active unless edited in `data/siteMetadata.js`:

- Google Analytics GA4 is only present as a commented example. To use GA4, set `googleAnalytics.googleAnalyticsId` in `siteMetadata.analytics` and update CSP for the script and connection endpoints used by GA.
- Plausible, Simple Analytics, and PostHog are also only commented examples.

## Comments

Comments use Giscus through Pliny. The user must click `Load Comments` before the Giscus widget loads.

Giscus settings come from environment variables with committed fallbacks:

- `NEXT_PUBLIC_GISCUS_REPO`
- `NEXT_PUBLIC_GISCUS_REPOSITORY_ID`
- `NEXT_PUBLIC_GISCUS_CATEGORY`
- `NEXT_PUBLIC_GISCUS_CATEGORY_ID`

Current behavior:

- Provider: `giscus`
- Mapping: `pathname`
- Language: `zh-TW`
- Reactions and metadata are disabled.

Because mapping is `pathname`, discussions are tied to exact URL paths. Preserving `/YYYY/MM/DD/slug/` is important for comment continuity. Redirect-only paths like `/blog/...` should not become the canonical comment path.

## Search

Search uses the starter/Pliny KBar provider.

- Public search index path: `/search.json`.
- Generated from Contentlayer during build.
- `hidden: true` posts are excluded.
- The selected/active search color is `#4db8d1` via the Tailwind primary color configuration.

The search JSON is public, so do not put private content, secrets, unpublished drafts, or sensitive hidden details in listed posts. Hidden posts are excluded from search, but their direct URLs still work.

## Feed, Sitemap, and URLs

The app uses `trailingSlash: true`. Public canonical post URLs should end with `/`.

Generated surfaces:

- `sitemap.xml` includes home, `/blog/`, `/tags/`, localized about pages, and listed non-draft posts.
- `feed.xml` includes listed non-draft posts.
- Tag feeds are written under `/tags/<tag>/feed.xml`.
- Hidden posts are excluded from sitemap and feeds.
- `/about/` and `/en/about/` are included in the sitemap with language alternates.

The old `/projects/` page has been removed and should 404.

## Math and Mermaid

Math:

- KaTeX is used through `remark-math`, `rehype-katex`, and `rehype-katex-notranslate`.
- Post routes import `katex/dist/katex.css`.
- MathJax must not be reintroduced.
- Legacy posts may mention MathJax in their article text, but no MathJax script should load.

Mermaid:

- The content schema preserves a `mermaid` flag for migrated posts.
- No Mermaid client runtime is initialized.
- Prefer build-time Mermaid rendering if support is added later. Do not add client-side Mermaid initialization without approval.

## MDX Runtime Enhancers

MDX rendering uses custom components for images, links, iframes, code blocks, tables, and the wrapper.

Current enhancer behavior:

- Medium Zoom is client-side only and attaches to `.post-container img`.
- Zoom background follows the current light/dark theme.
- Tables render in responsive wrappers.
- YouTube, YouTube nocookie, youtu.be, and Vimeo iframes are wrapped in responsive aspect-ratio containers after URL host matching.

MDX is code-capable content. Treat files under `data/` as trusted author content, not as untrusted user submissions.

## Deployment Settings

Site metadata:

- `siteUrl` is `https://blog.allenspace.de`.
- `language` and `locale` are `zh-TW`.
- The font behavior follows `tailwind-nextjs-starter-blog` with `Space_Grotesk` from `next/font/google` and `--font-space-grotesk`.

Build and hosting environment variables:

- `NEXT_UMAMI_ID`: Umami website ID.
- `NEXT_PUBLIC_GISCUS_REPO`: Giscus repository.
- `NEXT_PUBLIC_GISCUS_REPOSITORY_ID`: Giscus repository ID.
- `NEXT_PUBLIC_GISCUS_CATEGORY`: Giscus category.
- `NEXT_PUBLIC_GISCUS_CATEGORY_ID`: Giscus category ID.
- `BASE_PATH`: optional subpath deployment prefix.
- `EXPORT=1`: enables static export output.
- `UNOPTIMIZED=1`: disables Next image optimization, usually needed with static export.
- `ANALYZE=true`: enables bundle analyzer.

Security headers and CSP:

- CSP is defined in `next.config.js` and applied to all routes.
- Current `frame-src` allows Giscus, `slide.allenspace.de`, and YouTube nocookie domains.
- Current image optimization remote patterns allow `picsum.photos` and `img.allenspace.de`.
- Current CSP image policy allows images from any origin; tightening it requires auditing existing Markdown and remote images first.
- Current CSP connect policy allows all origins; tighten it before adding more third-party scripts.
- Current script policy includes `unsafe-inline` and `unsafe-eval` for compatibility with the current stack. Treat this as a deployment risk and avoid adding untrusted MDX or arbitrary inline scripts.

Iframe allowlist:

- The CSP allows only configured frame origins.
- Hero iframes are resolved through `lib/iframe.ts` and currently allow only `https://slide.allenspace.de`.
- Responsive MDX iframe wrapping also uses `lib/iframe.ts` for host matching, but it remains display logic rather than a complete content security policy.
- Only use trusted iframe sources, and keep CSP `frame-src` synchronized with approved embed hosts.

Newsletter:

- The newsletter API route exists, but `siteMetadata.newsletter.provider` is blank.
- When the provider is blank, the route returns `404` with `Newsletter is not configured`.
- Leave it blank unless a provider is intentionally configured and reviewed.
