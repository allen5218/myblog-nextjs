# Post hero and navigation parity design

## Goal

Restore the original blog's desktop and mobile alignment and spacing for post heroes and navigation while preserving the intentional Next.js font choices and the mobile theme switch placement.

## Scope

- Match the original 15 px vertical gap between the post tag row and `h1`.
- On desktop, align the brand and right navigation controls with the viewport edges as in the Bootstrap layout.
- On mobile, align the brand text with the post hero's 15 px content line and restore the right-side navigation control alignment.
- Preserve the standalone mobile theme switch beside the hamburger button.
- Restore the mobile post hero's content-driven height and original vertical padding instead of the current fixed 402 px height.
- Keep the current font families, font weights, navigation items, menu order, and menu implementation.

## Implementation approach

Use targeted CSS parity rules rather than rewriting the React navigation markup. Reintroduce the Bootstrap-style negative edge compensation around the padded navigation container, restore the original heading margins, and give mobile post headings the original top and bottom padding. Desktop and mobile rules remain separated at the existing 768 px breakpoint.

## Regression coverage

Playwright geometry assertions will cover both 1440 x 900 and 390 x 844 viewports:

- tag row to title gap is 15 px;
- desktop brand and right navigation reach the expected viewport edges;
- mobile brand text aligns with the post content line;
- mobile hero height and content coordinates match the original layout within a small subpixel tolerance;
- the mobile theme switch remains visible outside the hamburger menu.

Tests will be added and observed failing before production CSS is changed. After implementation, the focused parity test, full parity suite, build, and live local DOM measurements will be run.

## Non-goals

- Reverting the intentional font changes.
- Moving the mobile theme switch into the hamburger menu.
- Rebuilding the Next.js menu as Bootstrap `ul`/`li` markup.
- Matching unrelated post body, footer, or third-party widget differences.
