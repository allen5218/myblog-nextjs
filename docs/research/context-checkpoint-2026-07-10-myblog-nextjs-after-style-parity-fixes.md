# Context Checkpoint: myblog-nextjs after code block, back-to-top, and heading-anchor parity fixes

Date: 2026-07-10
Workspace: `/Users/allen/Dev/blog_Refactoring`
Project: `/Users/allen/Dev/blog_Refactoring/myblog-nextjs`

**This checkpoint supersedes**
`context-checkpoint-2026-07-10-myblog-nextjs-after-pagination-and-sitemap.md`, which stopped at
`8da9c96`.

## Current State

- Branch: `main`, **not yet pushed** (user asked to commit but hold push).
- Working tree: clean except for `openwebui-localhost.png`, `post-parity-desktop.png`,
  `post-parity-mobile.png` deleted (were untracked, user asked to clean up) and `tsconfig.tsbuildinfo`
  (now gitignored, no longer tracked/untracked-nagging).
- Commits this session, newest first:
  - `4ad0cff` chore: add local dev launch config, a hidden style-QA post, and ignore tsbuildinfo
  - `0f56396` test: cover code block and back-to-top parity
  - `d542c54` fix: restore original Hux styling for code blocks, back-to-top, and heading anchors
- Full suite green: `yarn tsc --noEmit`, `yarn lint`, `yarn build`, all 20 Playwright specs
  (15 pre-existing + 5 new in `tests/playwright/code-block-and-back-top.spec.ts`).

## What happened before this session (up to `8da9c96`)

Not covered by any prior checkpoint's "current state" — see the superseded checkpoint for full
detail. Summary: fixed the "Older Posts needs two clicks" bug (content-duplication root cause,
`lib/pagination.ts` introduced as the single pagination-URL authority), corrected the sitemap.

## This session

### Trigger

User asked to revert two Hux-era style customizations back toward the originals: the article
code-block theming (back to upstream `tailwind-nextjs-starter-blog`) and the back-to-top button
(back to the original Jekyll/Hux site's look and hover). Went through
`superpowers:brainstorming` first; design doc at
`docs/superpowers/specs/2026-07-10-code-block-and-back-to-top-parity-design.md`.

### A. Code block revert (`css/tailwind.css`)

Deleted the custom `.post-container .prose :where(code):not(pre code)` rule (pink inline-code
background) and the `--hux-code-bg`/`--hux-code-text` variables. Stripped `.post-container .prose
pre` down to only the properties needed for the mobile full-bleed layout (`width: calc(100vw)`,
`max-width: none`, `margin-left: -15px`, `border-radius: 0`), removing the light-gray
background/color/font overrides so `pre` falls back to `@tailwindcss/typography`'s dark
`--tw-prose-pre-bg`/`--tw-prose-invert-pre-bg`. Desktop breakpoint override simplified to just
`width: 100%; margin-left: 0` (typography's default border-radius is already ~6px, no visible
change from dropping the explicit override there).

### B. Back-to-top button (`components/hux/BackTop.tsx` styling, `css/tailwind.css`)

`.back-top` rewritten to match the original: square corners (`border-radius: 0`), position
`right: 20px; bottom: 110px` on mobile / `right: 4%` from 768px up (mobile-first, matching this
file's existing breakpoint convention rather than the old site's desktop-first one), light
background `rgba(255,255,255,.7)` with `#bfbfbf` border/text, dark `rgba(45,45,45,.9)`. Hover
reuses the site's existing `.pager a:hover` accent pair (`#0085a1` light / `#66c7e0` dark) rather
than the button's own original dark hover (`#4db8d1`) — a deliberate, user-approved deviation for
site-wide consistency. Icon stays the Unicode `↑`; show/hide stays the existing
`scrollY > 250` + opacity-transition mechanism (not the old site's Web Animations API fade).

**Found mid-implementation and fixed as part of the same commit:** `Footer.tsx` (rendered
site-wide via `app/layout.tsx`) already renders `<BackTop />`; `PostLayout.tsx` rendered a second,
fully-overlapping copy on every post page. Removed the redundant one from `PostLayout.tsx`. A
Playwright strict-mode locator error (`resolved to 2 elements`) is what surfaced this.

### C. Two bugs found and fixed along the way (not part of the original brainstormed scope)

1. **`.tag` / Prism `.token.tag` class collision.** `css/tailwind.css`'s tag-chip styles
   (`.tag { border-radius: 999px; ... }`) were unscoped class selectors. rehype-prism-plus emits
   `class="token tag"` for JSX tag tokens in code blocks, so the chip pill styling (white border,
   999px radius, padding, `display: inline-block`) bled onto syntax-highlighted `<Tag>` names —
   visible as a white capsule outline around things like `<PageTitle>` in code samples. Confirmed
   both usages of the real chip (`HuxPostCard.tsx`, `HuxHero.tsx`) are always wrapped in a `.tags`
   container, so scoped the CSS to `.tags .tag` / `.post-preview .tags .tag` /
   `.post-container .tags .tag` / `.side-catalog .tags .tag`. `#tag_cloud .tag` didn't need
   changing — `#tag_cloud` itself already carries the `tags` class.
2. **Duplicate back-to-top button** — see section B above.

### D. Heading anchor links restored to the original `#` style

User flagged (with side-by-side screenshots of production vs. local) that the small SVG
link-icon prepended before headings didn't match the original site's bold `#`, and that this had
apparently been raised before without landing a fix. Root cause: the original Jekyll site uses
AnchorJS (`less/hux-blog.less` / `_layouts/post.html` in the `myblog` repo) with
`icon: '#', placement: 'right'`; myblog-nextjs's `rehypeAutolinkHeadings` config
(`contentlayer.config.ts`) instead prepended a heroicon-style SVG chain-link span with a
`margin-left: -24px` hack.

Changed:
- `contentlayer.config.ts`: the `icon` fragment is now `<span class="content-header-link">#</span>`
  instead of the SVG; `behavior: 'prepend'` → `'append'` so the `#` follows the heading text in
  DOM order (matters at narrow widths — a prepended, negative-margin-pulled `#` clips off the left
  edge of the viewport below roughly 800px, which is exactly why the old site's own CSS gated its
  `position: absolute; left: -0.75em` trick behind `@media (min-width: 800px)`. Appending sidesteps
  needing that trick entirely.)
- `css/tailwind.css` `.content-header-link`: plain inline text (no `display: inline-block` /
  `vertical-align: middle` — those two together threw off baseline alignment with the heading text
  by a couple of px; removing both let normal inline baseline alignment do the right thing),
  `margin-left: 0.4em`, `font-size: 1.1em`, color `#337ab7` light / `#4db8d1` dark, hover
  `#0085a1` light / `#66c7e0` dark (same `--post-link`/`--post-link-hover` values the original
  site's global `.post-container a` rule gave it, since `.anchorjs-link` was just a plain `<a>`
  with no color override of its own). Opacity-on-heading-hover behavior unchanged. Deleted the now
  -unused `.linkicon` rule.
- Visually confirmed at 390px and 1280px viewports in the running dev server: `#` sits right after
  the heading text, baseline-aligned, not clipped.

This fix (D) was **not** part of the brainstormed design doc — it was a separate, directly-scoped
request handled without a full brainstorming pass, since it was a small, concrete, well-evidenced
visual bug with a clear original-site reference.

## Verification

`rm -rf .next` before the final full-suite run (per the twice-built-`.next` trap).
`yarn tsc --noEmit`, `yarn lint`, `yarn playwright test` (20/20) all green after every round of
changes, most recently after the heading-anchor fix.

## Bookkeeping

- Deleted three untracked screenshots at the user's request:
  `openwebui-localhost.png`, `post-parity-desktop.png`, `post-parity-mobile.png`.
- Added `tsconfig.tsbuildinfo` to `.gitignore` (build artifact, was untracked-and-nagging since at
  least the prior checkpoint).
- Design spec: `docs/superpowers/specs/2026-07-10-code-block-and-back-to-top-parity-design.md`
  (covers A and B only — see note in section D above about C and D being out-of-band fixes).
- New hidden post `data/blog/hidden/2021-08-07-new-features-in-v1.md` — upstream
  tailwind-nextjs-starter-blog's own MDX-features demo post, `hidden: true`, used as a live
  reference for "what does unstyled/upstream typography look like" (it renders via `PostSimple`,
  the one layout that never got the Hux `.post-container` treatment). Kept; not asked to be
  removed.
- `.claude/launch.json` (top-level, `/Users/allen/Dev/blog_Refactoring/.claude/launch.json`) added
  so the preview tooling can start `yarn dev` for this nested project (`cd myblog-nextjs && yarn
  dev`, since the tool looks for the launch config at the workspace root, not per-project).

## Remaining / explicitly out of scope

Same "closed, do not resurrect" list as the prior checkpoint still applies:
`safari-pinned-tab.svg`, Hux parity round 2, BMC ridge lines, "revert the layout reformat before
committing", uuid resolution on radar. Nothing new was added to this list this session.

Not pushed yet — user explicitly asked to commit without pushing this round. A later turn in the
same session asked to commit **and push**; push had not yet been confirmed as executed at the time
this checkpoint was written (see git log / `git status` for the authoritative current state,
this document is a point-in-time snapshot of intent and prior work, not a live status).

## Last User-Facing Summary To Preserve

Reverted the article code-block theming and the back-to-top button back toward their originals
(upstream `tailwind-nextjs-starter-blog` typography defaults for code blocks; the Jekyll/Hux site's
square button, position, and hover colors for back-to-top), going through a brainstorming pass
first since these were open-ended "make it look like the old one" requests. Found and fixed two
unrelated bugs surfaced while doing that work: a `.tag`/Prism `.token.tag` class-name collision
that put a white pill outline around JSX tags in code samples, and a duplicate back-to-top button
(`Footer.tsx` and `PostLayout.tsx` were each rendering one). Separately, restored the heading
anchor links to a plain `#` matching the original AnchorJS `icon: '#'` config — the small SVG
link-icon that had replaced it was a previously-raised, never-actually-fixed regression; moving it
from prepend to append (before → after the heading text) both matched the original's DOM order and
avoided a viewport-edge clipping bug the prepend approach had at narrow widths.
