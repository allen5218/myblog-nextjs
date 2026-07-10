# Code block revert and back-to-top button parity design

## Goal

Undo the Hux-specific code block re-theming so post code blocks match the upstream
tailwind-nextjs-starter-blog appearance again, and restyle the back-to-top button to match the
original Jekyll/Hux site's shape, position, and hover behavior.

## Scope

### A. Code block revert (`css/tailwind.css`)

- Delete the `.post-container .prose :where(code):not(pre code)` rule (inline code) entirely, and
  the now-unused `--hux-code-bg` / `--hux-code-text` custom properties. Inline code falls back to
  whatever `.prose code` already resolves to elsewhere in the stylesheet.
- `.post-container .prose pre`: keep only the mobile full-bleed layout properties (`width: calc(100vw)`,
  `max-width: none`, `margin-left: -15px`, `border-radius: 0`). Remove `background`, `color`,
  `font-size`, `line-height`, `padding`, `overflow-x` so `pre` falls back to
  `@tailwindcss/typography`'s `--tw-prose-pre-bg` / `--tw-prose-pre-code` (dark background in both
  themes via `dark:prose-invert`, already applied in `PostLayout.tsx`).
- Delete `.post-container .prose pre code { color: inherit }` — typography's own `pre code` reset
  already does this.
- Desktop override (`@media (min-width: 768px)`): keep only `width: 100%; margin-left: 0;` (undoes
  the mobile bleed). Drop `border-radius: 6px` — typography's default pre radius is visually
  identical.
- Net effect: code blocks get the Night Owl `prism.css` token colors on the dark background they
  were designed for (currently mismatched against a light-gray background). Mobile full-bleed is
  preserved; desktop is unaffected.

### B. Back-to-top button (`components/hux/BackTop.tsx` CSS in `css/tailwind.css`)

Rewrite `.back-top` / `.back-top-visible` to match the original Hux button:

- Position: `right: 4%; bottom: 110px`, with `right: 20px` under `max-width: 768px` (was
  `right/bottom: 24px` fixed).
- Shape: `border-radius: 0` (sharp square, was `5px`).
- Colors: light `background: rgba(255,255,255,.7)`, `border: 1px solid #bfbfbf`, `color: #bfbfbf`;
  dark `background: rgba(45,45,45,.9)` (border/text color unchanged between themes).
- Hover/focus: background and border switch to `#0085a1` (light) / `#66c7e0` (dark), text white —
  reusing the existing `.pager a:hover` accent pair for site-wide consistency, which is *not* the
  button's own original dark hover (`#4db8d1`); this is a deliberate, user-approved deviation from
  pixel-exact parity in favor of matching the pager convention.
- Add `display: flex; align-items: center; justify-content: center;` so the `↑` glyph is reliably
  centered (the old button had no explicit centering).
- Keep the existing React-driven show/hide mechanism (`scrollY > 250`, opacity/pointer-events
  toggle) — only the CSS declarations inside `.back-top` and a new `.back-top:hover` /
  `.dark .back-top` / `.dark .back-top:hover` change.

## Non-goals

- Changing the back-to-top icon (stays the Unicode `↑`, not Font Awesome or an SVG redraw).
- Changing the show/hide animation mechanism (stays CSS opacity transition, not the old site's Web
  Animations API fade).
- Touching `ScrollTopAndComment.tsx` (`PostSimple.tsx` / `PostBanner.tsx`'s button) — out of scope,
  untouched by this change.
- Any change to `prism.css` — confirmed byte-identical to upstream already, not touched.
- The unrelated `.tag` / `.token.tag` class-name collision (white pill outline around JSX tags in
  code blocks) — already found and fixed separately in this session.

## Regression coverage

No existing automated test covers code block or back-to-top visuals. Add Playwright checks:

- A post's `pre` computed `background-color` is dark (matches `--tw-prose-pre-bg`) in both light and
  dark theme, and mobile `pre` still spans full viewport width with `border-radius: 0`.
- Inline `code` no longer has the custom pink background/color.
- `.back-top` computed styles: `border-radius: 0`, position values, and hover-triggered
  `background-color` swap to `#0085a1` (light) / `#66c7e0` (dark).

Tests are written first against the current (unreverted) styles so they fail for the right reason,
then the CSS changes land, then the full suite (`yarn tsc --noEmit`, `yarn lint`, `yarn build`,
Playwright) runs before calling this done.
