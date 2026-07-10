# Post Hero and Navigation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore original desktop and mobile post-hero spacing and navigation alignment while retaining the intentional fonts and standalone mobile theme switch.

**Architecture:** Keep the existing React markup and encode parity as responsive CSS rules at the current 768 px breakpoint. Add browser-level geometry assertions to the existing Playwright parity suite so the layout contracts are measured from rendered DOM boxes rather than screenshots.

**Tech Stack:** Next.js 15, React 19, CSS, Playwright

## Global Constraints

- Do not change the selected font families or weights.
- Keep the mobile theme switch visible beside the hamburger button.
- Keep the existing navigation items, order, and Headless UI menu implementation.
- Do not change unrelated post body, footer, or third-party widget styling.
- Work only on `fix/post-hero-nav-parity`; do not commit or push to `main`.

---

### Task 1: Add rendered geometry regression coverage

**Files:**
- Modify: `tests/playwright/blog-parity.spec.ts`

**Interfaces:**
- Consumes: existing post route `/2026/04/26/learning-how-to-learn/` and rendered selectors `.navbar-brand`, `.navbar-links`, `.navbar-mobile`, `.intro-header-post`, `.post-heading`, and `.post-heading .tags + h1`
- Produces: Playwright assertions that specify desktop and mobile parity geometry

- [ ] **Step 1: Write the failing test**

Add a test that measures the rendered boxes at 1440 x 900 and 390 x 844. Assert a 15 px tags-to-title gap, desktop brand `x = 0`, desktop links `right = 1440`, mobile brand `x = 0`, mobile tools `right = 390`, mobile hero height between 300 and 320 px, heading top near 85 px, and a visible standalone theme switch while the hamburger is collapsed.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
yarn test:parity tests/playwright/blog-parity.spec.ts --grep "post hero and navigation geometry"
```

Expected: FAIL because the current gap is 0 px, desktop/mobile navigation is inset 15 px, and the mobile hero is 402 px.

- [ ] **Step 3: Commit the red regression test**

```bash
git add tests/playwright/blog-parity.spec.ts
git commit -m "test: capture post hero nav parity geometry"
```

### Task 2: Restore responsive parity CSS

**Files:**
- Modify: `css/tailwind.css`
- Test: `tests/playwright/blog-parity.spec.ts`

**Interfaces:**
- Consumes: geometry contracts introduced in Task 1
- Produces: responsive navigation edge compensation and content-driven post hero geometry

- [ ] **Step 1: Apply the minimal CSS implementation**

In the base mobile rules, compensate the padded `.navbar-inner` with edge margins on `.navbar-brand` and `.navbar-mobile`, change `.intro-header-post` from a fixed minimum height to content-driven height, give its content the original mobile vertical padding, and restore a 15 px gap before the post title. At the desktop breakpoint, apply the same edge compensation to `.navbar-brand` and `.navbar-links` while retaining the existing 150 px hero padding.

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```bash
yarn test:parity tests/playwright/blog-parity.spec.ts --grep "post hero and navigation geometry"
```

Expected: PASS with all desktop and mobile geometry assertions satisfied.

- [ ] **Step 3: Run the complete parity suite**

Run:

```bash
yarn test:parity
```

Expected: all Playwright parity tests pass.

- [ ] **Step 4: Run formatting and build verification**

Run:

```bash
yarn prettier --check css/tailwind.css tests/playwright/blog-parity.spec.ts
yarn build
```

Expected: both commands exit 0 without formatting or build errors.

- [ ] **Step 5: Inspect the local rendered DOM at both viewports**

Use Playwright against the local production server to remeasure the navigation edges, tags-to-title gap, mobile hero height, and standalone theme switch at 1440 x 900 and 390 x 844.

- [ ] **Step 6: Commit the implementation**

```bash
git add css/tailwind.css
git commit -m "fix: align post hero and navigation geometry"
```
