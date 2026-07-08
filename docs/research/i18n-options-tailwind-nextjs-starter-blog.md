# i18n Options For Tailwind Nextjs Starter Blog

Date: 2026-07-08

Scope: research only. This ignores the old `myblog` language-switching logic and looks for approaches that fit the current `tailwind-nextjs-starter-blog` / Next App Router base.

## Findings

1. The upstream starter does not ship built-in i18n in the main template, but its README points to a community i18n variation:
   - Demo: `https://tailwind-nextjs-starter-blog-i18n.vercel.app/`
   - Source: `https://github.com/PxlSyl/tailwind-nextjs-starter-blog-i18n`

2. The community i18n fork uses App Router locale segments and an i18next stack:
   - `app/[locale]/...`
   - `app/[locale]/i18n/locales/{en,fr}/...json`
   - `i18next`
   - `i18next-browser-languagedetector`
   - `i18next-resources-to-backend`
   - `react-i18next`
   - server/client helpers such as `createTranslation` and `useTranslation`

3. Next.js official App Router guidance recommends locale-aware routing with either:
   - subpaths, for example `/en/...` and `/zh-TW/...`
   - domains, for example `example.com/...` and `example.tw/...`

4. For App Router static rendering, Next recommends nesting pages/layouts under `app/[lang]` and using `generateStaticParams` for supported locales.

## Practical Options

### Option A: Adopt The Community Fork Pattern

Use `app/[locale]`, i18next, JSON dictionaries, and localized copies of app routes.

Pros:

- Closest existing `tailwind-nextjs-starter-blog` ecosystem example.
- Has a working demo and source code.
- Supports server and client component translation helpers.

Cons:

- Big structural migration because current legacy routes live at root paths.
- Could disturb existing SEO/Giscus URLs unless old root URLs remain canonical or redirect rules are designed very carefully.

### Option B: Minimal Next App Router Dictionary Pattern

Use `app/[lang]`, `dictionaries/{en,zh-TW}.json`, and server-only `getDictionary` helpers, following Next's official guide.

Pros:

- Smallest dependency footprint.
- Keeps most translations server-rendered.
- Easier to reason about than a full i18next setup.

Cons:

- Less feature-rich than i18next.
- Client components still need explicit dictionary prop passing or a small client provider.

### Option C: Keep Current Legacy Routes As Default, Add Locale Subpaths Later

Preserve existing root legacy URLs as canonical Chinese/default-language pages, then add optional English routes under `/en/YYYY/MM/DD/slug/` or `/en/blog/...`.

Pros:

- Safest for existing comments and SEO-sensitive URLs.
- Lets the migration finish before introducing language URL decisions.

Cons:

- Requires duplicated route generation and hreflang/canonical policy later.
- Translation pairing needs new content metadata.

## Current Recommendation

Do not add i18n during the visual/content migration. When ready, prefer Option C with a small official Next-style dictionary layer first. Use the community fork as an implementation reference, not as a direct wholesale merge, because preserving root dated URLs is more important than adopting its full route structure.

Sources:

- Upstream README: `https://github.com/timlrx/tailwind-nextjs-starter-blog`
- Community i18n fork: `https://github.com/PxlSyl/tailwind-nextjs-starter-blog-i18n`
- Next.js App Router i18n guide: `https://nextjs.org/docs/app/guides/internationalization`
