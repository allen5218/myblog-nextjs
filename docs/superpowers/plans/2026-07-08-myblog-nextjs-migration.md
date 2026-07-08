# Myblog Next.js Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Allen's Jekyll blog into this fresh Next.js/Tailwind repository while preserving existing article content, legacy URLs, Giscus pathname identity, and the live site's visual appearance.

**Architecture:** Contentlayer is the single content model and computes legacy Jekyll paths from front matter dates. Next App Router serves both list pages and dated post routes, while Tailwind components recreate the old Hux/Clean Blog visual shell. Runtime JavaScript is kept only where it is behaviorally necessary: theme switching, mobile nav, Giscus, Medium Zoom, search overlay, and scroll affordances.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, Contentlayer2, Pliny MDX renderer, KaTeX, rehype/remark plugins, Playwright parity checks.

## Global Constraints

- Public post URLs must remain `https://blog.allenspace.de/YYYY/MM/DD/slug/`.
- URL generation must use the effective front matter `date`, including the `2025-10-13-ai-learning-community.md` file whose valid live URL is `/2025/10/12/ai-learning-community/`.
- Do not route public posts to `/blog/<slug>` except as optional redirects after legacy URLs work.
- Giscus uses `pathname`; comments must receive the legacy pathname.
- Do not map old `hidden: true` to `draft: true`; hidden posts remain directly readable by URL but are excluded from article listing surfaces.
- Keep Medium Zoom as a client-side enhancer.
- Replace MathJax with `remark-math` + `rehype-katex`.
- Prefer build-time Mermaid SVG rendering; do not add client Mermaid initialization unless build-time rendering proves blocked.
- Reimplement the old live styles with Tailwind/components rather than copying compiled old CSS.
- Use the live-site baseline in `../docs/research/live-site-style-baseline-summary.md` as visual source of truth.
- Development subagents must be spawned with `model: gpt-5.5` and `reasoning_effort: medium`.

---

### Task 1: Repository Baseline And Licensing

**Files:**

- Modify: `package.json`
- Create: `NOTICE.md`
- Create: `licenses/tailwind-nextjs-starter-blog-MIT.txt`

**Interfaces:**

- Produces: clean git baseline commit in a new `myblog-nextjs` repository.

- [x] **Step 1: Copy starter worktree without `.git`**

Run: `rsync -a --exclude .git ../tailwind-nextjs-starter-blog/ ./`

- [x] **Step 2: Initialize new git history**

Run: `git init && git branch -m main`

- [x] **Step 3: Preserve licensing**

Use Allen's Apache-2.0 `LICENSE` as the project license, preserve the starter MIT text at `licenses/tailwind-nextjs-starter-blog-MIT.txt`, and document provenance in `NOTICE.md`.

- [x] **Step 4: Commit baseline**

Run: `git add . && git commit -m "chore: initialize next blog migration"`

### Task 2: Content Import And Legacy URL Model

**Files:**

- Create: `data/blog/**`
- Modify: `contentlayer.config.ts`
- Modify: `data/authors/default.mdx`
- Create: `lib/legacy-url.ts`

**Interfaces:**

- Produces: `legacyPathFromDateAndSlug(date: string | Date, slug: string): string`
- Produces on Blog documents: `legacyPath`, `url`, `slug`, `summary`, `subtitle`, `heroImage`, `headerImg`, `headerBgCss`, `headerMask`, `catalog`, `iframe`, `hidden`, `listed`, `author`

- [ ] **Step 1: Import Jekyll posts**

Copy all files from `../myblog/_posts/**` into `data/blog/**`, preserving the `hidden/` folder.

- [ ] **Step 2: Add legacy URL helper**

Create `lib/legacy-url.ts`:

```ts
export function stripPostDatePrefix(fileName: string) {
  return fileName.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(md|mdx|markdown)$/, '')
}

export function legacyPathFromDateAndSlug(dateInput: string | Date, slug: string) {
  const date = new Date(dateInput)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}/${month}/${day}/${slug}`
}
```

- [ ] **Step 3: Update Contentlayer to read old Markdown**

Set `Blog.filePathPattern` to `blog/**/*.{md,markdown}` and `contentType` to `mdx`. Convert unsupported hyphenated Jekyll front matter keys to camelCase in the migrated content, then add fields including `subtitle`, `update`, `author`, `headerImg`, `headerBgCss`, `headerMask`, `catalog`, `mathjax`, `mermaid`, `iframe`, and `hidden`.

- [ ] **Step 4: Compute legacy paths**

Set `slug` to the date-stripped source filename slug. Set `path`, `legacyPath`, and `url` to `YYYY/MM/DD/slug` using the front matter `date`. Structured data URL must use `${siteMetadata.siteUrl}/${legacyPath}`.

- [ ] **Step 5: Compute listing visibility**

Set `listed` to `doc.hidden !== true`. Routes must still render hidden posts by URL; homepage, blog list, archive, search, and feed surfaces should use only listed posts unless explicitly testing a hidden URL.

- [ ] **Step 6: Verify URL mismatch case**

Run a Contentlayer build and verify the AI learning community document has `legacyPath === "2025/10/12/ai-learning-community"`.

### Task 3: Legacy Routes, Feeds, Sitemap, Search, And Comments

**Files:**

- Create: `app/[year]/[month]/[day]/[slug]/page.tsx`
- Modify: `app/blog/[...slug]/page.tsx`
- Modify: `app/page.tsx`
- Modify: `app/blog/page.tsx`
- Modify: `app/blog/page/[page]/page.tsx`
- Modify: `app/tags/**`
- Modify: `app/sitemap.ts`
- Modify: `scripts/rss.mjs`
- Modify: `components/Comments.tsx`

**Interfaces:**

- Consumes: Blog `legacyPath`, `url`, and `slug` from Task 2.
- Produces: all public links, canonical/OG URLs, feed links, sitemap entries, search docs, and Giscus slugs using legacy paths.

- [ ] **Step 1: Add dated route**

Create `app/[year]/[month]/[day]/[slug]/page.tsx` that finds `allBlogs.find((p) => p.legacyPath === routePath)` and renders the selected Hux post layout.

- [ ] **Step 2: Generate dated static params**

Return `{ year, month, day, slug }` from `post.legacyPath.split('/')` for every Blog document.

- [ ] **Step 3: Preserve list links**

Replace every `/blog/${slug}` post href with `/${post.legacyPath}` or `/${post.path}` after Task 2 makes `path` legacy-compatible.

- [ ] **Step 4: Preserve RSS and sitemap**

Update RSS `<guid>` and `<link>` and sitemap `url` to use `${siteUrl}/${post.legacyPath}`.

- [ ] **Step 5: Preserve Giscus pathname**

Pass `/${post.legacyPath}/` or `post.legacyPath` consistently to `Comments` so pathname mapping hits the old discussion.

### Task 4: Hux Shell, Hero, And Tailwind Visual Parity

**Files:**

- Modify: `components/Header.tsx`
- Modify: `components/Footer.tsx`
- Modify: `components/LayoutWrapper.tsx`
- Create: `components/hux/HuxHero.tsx`
- Create: `components/hux/HuxPostCard.tsx`
- Create: `components/hux/HuxPager.tsx`
- Create: `components/hux/BackTop.tsx`
- Modify: `css/tailwind.css`
- Modify: `app/Main.tsx`
- Modify: `layouts/PostLayout.tsx`
- Create: `layouts/KeynoteLayout.tsx`

**Interfaces:**

- Consumes: Blog metadata from Task 2.
- Produces: Hux-compatible home, post, page, archive, and keynote visual structure.

- [ ] **Step 1: Add Tailwind theme tokens**

Add CSS variables/classes for dark background `rgb(45,45,45)`, article text `rgb(224,224,224)`, muted text `rgb(136,136,136)`, hero nav white state, and old post typography.

- [ ] **Step 2: Recreate hero variants**

Implement image hero, CSS-gradient hero, page hero, and keynote iframe hero. Keynote hero height is `calc(100vh - 85px)`.

- [ ] **Step 3: Recreate post typography**

Match live baseline for `.post-container` widths, paragraph spacing, headings, blockquote, inline code, pre/code overflow, image margins, and mobile code width.

- [ ] **Step 4: Recreate home list**

Render old `.post-preview` cards with title, subtitle, italic excerpt, Lora-style metadata, tags, and legacy links.

- [ ] **Step 5: Recreate nav/footer/back-top**

Implement mobile nav toggle, old desktop nav sizing, footer social/copyright area, and client-side back-to-top visibility.

### Task 5: Archive, Search, Catalog, And Client Enhancers

**Files:**

- Create: `app/archive/page.tsx`
- Create: `components/hux/ArchiveFilter.tsx`
- Create: `components/hux/SearchOverlay.tsx`
- Create: `components/hux/SideCatalog.tsx`
- Create: `components/hux/MediumZoomClient.tsx`
- Modify: `components/MDXComponents.tsx`
- Modify: `components/LayoutWrapper.tsx`

**Interfaces:**

- Consumes: all core Blog documents and generated search JSON.
- Produces: archive `?tag=` filtering, search overlay, side catalog, table/video wrappers, and Medium Zoom client behavior.

- [x] **Step 1: Build archive page**

Render `/archive/` with the old hero image, tag cloud, mini post list, and client `?tag=` filtering parity.

- [x] **Step 2: Build search overlay**

Use generated `search.json` with legacy paths. Keep overlay open/close and body scroll locking client-side.

- [x] **Step 3: Build side catalog**

Render a desktop-only TOC from `post.toc`, including fixed/fold behavior after scroll.

- [ ] **Step 4: Build Medium Zoom enhancer**

Initialize `medium-zoom` on `.post-container img`; update background color when theme changes.

- [ ] **Step 5: Move table/video wrapping to render time**

Use MDX component mappings so tables are rendered inside responsive wrappers and YouTube/Vimeo iframes get responsive containers.

### Task 6: Math, Mermaid, CSP, Assets, And Verification

**Files:**

- Modify: `contentlayer.config.ts`
- Modify: `next.config.js`
- Modify: `package.json`
- Create: `lib/remark-mermaid-build.ts` or `lib/rehype-mermaid-build.ts`
- Create: `tests/playwright/blog-parity.spec.ts`

**Interfaces:**

- Consumes: MDX body and old front matter flags.
- Produces: KaTeX rendering, build-time Mermaid SVG output if feasible, CSP/image domain compatibility, and visual parity checks.

- [ ] **Step 1: Confirm KaTeX path**

Keep `remark-math`, `rehype-katex`, `rehype-katex-notranslate`, and import `katex/dist/katex.css` in post routes.

- [ ] **Step 2: Add build-time Mermaid if feasible**

Research and implement build-time Mermaid SVG rendering for fenced `mermaid` blocks. If a headless browser dependency blocks local build, document the blocker and leave code blocks styled instead of adding client Mermaid.

- [ ] **Step 3: Configure remote assets and frames**

Allow `img.allenspace.de` images and `slide.allenspace.de` frames in `next.config.js` CSP/image config.

- [ ] **Step 4: Add parity checks**

Create Playwright checks for `/`, `/archive/`, `/2025/11/08/deploying-openwebui-for-free-with-cloudflare-tunnel/`, `/2021/04/30/typora-latex-mathjax/`, `/2025/10/12/ai-learning-community/`, and the invalid `/2025/10/13/ai-learning-community/` 404 case.

- [ ] **Step 5: Build and verify**

Run `yarn build`. Then run Playwright parity checks against the local build and compare screenshots to `docs/research/live-screenshots/`.
