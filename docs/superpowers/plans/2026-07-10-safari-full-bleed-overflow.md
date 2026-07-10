# Safari Full-Bleed Overflow and Blockquote Spacing

**Goal:** Remove the horizontal scrollbar and the left gutter that Safari (desktop
and iOS) shows on every page, and restore the intended zero paragraph margin
inside post blockquotes.

**Architecture:** Both defects are CSS cascade/layout bugs, not markup bugs. Fix
them at the rule that is actually wrong rather than compensating downstream.

**Tech Stack:** Next.js 15, Tailwind CSS v4, Playwright

## Status: complete (2026-07-10, merged and deployed)

Commits: `dc4f8ab` (blockquote), `4d3bcb0` (full-bleed), `103d8b9` (dead-rule
cleanup). On `main`, pushed, live.

---

## Defect 1: blockquote paragraphs keep a 30 px margin on desktop

- [x] **Root cause**

`css/tailwind.css` reset the margin with `.post-container .prose blockquote
:where(p)`. `:where()` contributes no specificity, so the rule scored `(0,2,1)`
— a tie with `.post-container .prose p { margin: 30px 0 }` inside
`@media (min-width: 768px)`. Source order handed the win to the later rule, so
the reset never applied above 768 px. The rule's intent and comment were right;
only the selector was wrong. Media queries add no specificity.

- [x] **Fix**

Drop `:where()`. `.post-container .prose blockquote p` scores `(0,2,2)` and wins
regardless of source order.

- [x] **Verify**

Measured on the live page before the fix: `p` computed `margin-top: 30px`, first
paragraph sat 45 px below the blockquote's top (15 px padding + 30 px margin).
Narrowing below 768 px dropped it to 0 px / 15 px, confirming the media query was
the winner. Injecting the corrected selector at 1280 px collapsed the blockquote
from 275 px to 185 px.

---

## Defect 2: full-bleed shell overflows the viewport on Safari

- [x] **Root cause**

`.hux-full-bleed` (navbar, hero, footer) escapes to the viewport edges with
`left: 50%` + `margin-left: -50vw`. That resolves to `x = 0` only when the
element's containing block is **centred in the viewport** — not merely when it
starts at the left edge.

`SectionContainer` wrapped the shell in `px-4 sm:px-6`. `.hux-home-layout` and
`.post-shell` declare `width: min(1170px, 100vw)`, a definite width, which floors
`<main>`'s min-content at `100vw`. Safari therefore sizes the `<section>` to
`100vw + padding` and drops `<main>` at the padding edge instead of centring it,
so the shell lands one padding-width to the right and the document scrolls.

At `vw = 658`: `section [0, 706, 706]`, `main [24, 682, 658]`,
`.intro-header.left = 24`, `scrollWidth − clientWidth = 48` (the 24 px right
overhang plus the section's 24 px right padding, which the scrollable overflow
region includes).

Chromium folds `.hux-home-layout`'s negative percentage margin into the intrinsic
contribution and lands on `0` by coincidence, so it never surfaced there. Neither
engine is "correct" — the layout was standing on `<main>` having no definite
width.

- [x] **Fix**

Strip the horizontal padding and max-width from `SectionContainer`; give the
three pages that depended on it (`app/tags`, `app/offline`, `app/not-found`)
their own wrapper. `app/archive` already has `.archive-wrap`, and the remaining
routes size themselves via `.hux-home-layout` / `.post-shell`.

Also drop `pl-[calc(100vw-100%)]` from `<body>`. It pads only the left, so under
classic scrollbars it decentres the body box and breaks full-bleed the same way.
It computes to `0` under overlay scrollbars, which is why it was invisible here.

- [x] **Reproduce locally**

Playwright's WebKit build does **not** reproduce Safari — it sizes `<main>` to
`50vw`, like Chromium. Forcing `main { min-width: 100vw }` in Chromium recreates
Safari's condition and reproduces its exact numbers on the old build.

- [x] **Verify**

Old build under the simulation: `intro.left = 24`, `overflow = 48` at 658 px, and
`16 / 32` at 390 px — matching both the Safari console dump and pixel
measurements taken from the reported screen recording. New build: `intro.left = 0`
and `overflow = 0` at 390 / 572 / 658 / 1000 / 1280 / 1440 across home, post,
tags, archive, about and blog-list, in both engines. Re-checked against the live
deployment after push.

- [x] **Guard the gutters**

`tags`, `offline` and `not-found` keep their side margins: content starts at
16 px below the `sm` breakpoint and 24 px above it, and centres on wide screens.

---

## Defect 3: three dead rules in the 768 px block

- [x] **Root cause and fix**

`.intro-header-archive`, `.intro-header-post` and `.intro-header-post
.post-heading` restated their base-layer counterparts byte for byte. The latter
two only became dead in `720f8d7`. Removal is safe because the block declares no
bare `.intro-header` rule, so the base `.intro-header-post` still wins the height
cascade unaided.

- [x] **Verify as a no-op**

Computed `height`, `min-height`, all four margins, all four paddings, `display`
and bounding rect are identical before and after, across 15 elements on the post
and archive pages at 390 / 768 / 1440. The parity suite stays 8/8.

---

## Verification traps hit along the way

Both of these produce "every geometry assertion is off by a constant" and are
easy to misread as layout regressions:

1. **CSP `upgrade-insecure-requests`.** It upgrades `http://localhost` static
   assets to `https://`, which fails, leaving the page unstyled. Playwright's
   `bypassCSP: true` stops this in Chromium but **not** in WebKit; strip the
   `content-security-policy` response header via `page.route` instead.
2. **A twice-built `.next`.** `playwright.config.ts` runs `yarn build` in its
   `webServer` command. Running `yarn build` manually beforehand leaves
   prerendered HTML pointing at stale CSS hashes, and that stylesheet returns
   HTTP 400.

In both cases `body` falls back to the UA `margin: 8px`, so a `toBeCloseTo(0)`
assertion receives `8` and looks like an 8 px layout bug. **Assert
`getComputedStyle(document.body).margin === '0px'` before trusting any
measurement.**
