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

- [x] **Step 1: Write the failing test**

Add a test that measures the rendered boxes at 1440 x 900 and 390 x 844. Assert a 15 px tags-to-title gap, desktop brand `x = 0`, desktop links `right = 1440`, mobile brand `x = 0`, mobile tools `right = 390`, mobile hero height between 300 and 320 px, heading top near 85 px, and a visible standalone theme switch while the hamburger is collapsed.

- [x] **Step 2: Run the focused test to verify it fails**

Run:

```bash
yarn test:parity tests/playwright/blog-parity.spec.ts --grep "post hero and navigation geometry"
```

Expected: FAIL because the current gap is 0 px, desktop/mobile navigation is inset 15 px, and the mobile hero is 402 px.

- [x] **Step 3: Commit the red regression test**

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

- [x] **Step 1: Apply the minimal CSS implementation**

In the base mobile rules, compensate the padded `.navbar-inner` with edge margins on `.navbar-brand` and `.navbar-mobile`, change `.intro-header-post` from a fixed minimum height to content-driven height, give its content the original mobile vertical padding, and restore a 15 px gap before the post title. At the desktop breakpoint, apply the same edge compensation to `.navbar-brand` and `.navbar-links` while retaining the existing 150 px hero padding.

- [x] **Step 2: Run the focused test to verify it passes**

Run:

```bash
yarn test:parity tests/playwright/blog-parity.spec.ts --grep "post hero and navigation geometry"
```

Expected: PASS with all desktop and mobile geometry assertions satisfied.

- [x] **Step 3: Run the complete parity suite**

Run:

```bash
yarn test:parity
```

Expected: all Playwright parity tests pass.

- [x] **Step 4: Run formatting and build verification**

Run:

```bash
yarn prettier --check css/tailwind.css tests/playwright/blog-parity.spec.ts
yarn build
```

Expected: both commands exit 0 without formatting or build errors.

- [x] **Step 5: Inspect the local rendered DOM at both viewports**

Use Playwright against the local production server to remeasure the navigation edges, tags-to-title gap, mobile hero height, and standalone theme switch at 1440 x 900 and 390 x 844.

- [x] **Step 6: Commit the implementation**

```bash
git add css/tailwind.css
git commit -m "fix: align post hero and navigation geometry"
```

---

## Status: complete (2026-07-10, merged and deployed)

Commits: `d1a93b7` (red test) → `720f8d7` (implementation). Merged into `main`
via fast-forward and pushed; live on the Vercel deployment.

### Independent verification

The red-then-green order was confirmed by rebuilding `d1a93b7` in a throwaway
worktree and running the focused test: it fails on `brandLeft` with
`Expected: 0, Received: 15`, matching the 15 px inset this plan predicted in
Task 1 Step 2.

Geometry was re-measured from the rendered DOM against a local production
server, independently of the spec assertions. All ten targets hit exactly:

| Contract                                             | Desktop 1440 | Mobile 390 |
| ---------------------------------------------------- | ------------ | ---------- |
| `.navbar-brand` left                                 | 0            | 0          |
| `.navbar-links` right / `.navbar-mobile` right       | 1440         | 390        |
| tags-to-title gap                                    | 15           | 15         |
| hero height (300–320)                                | —            | 304.39     |
| `.post-heading` top                                  | —            | 85         |
| standalone theme switch visible, hamburger collapsed | —            | yes        |

`prettier --check`, `yarn build`, and the full `test:parity` suite (8/8) all
pass.

### Deviations from the plan

- **`9e2c943` is outside every task here.** It widens the CSP `connect-src`
  to `https://img.allenspace.de` so the service worker can fetch cross-origin
  post hero images. That origin was already trusted in `img-src`, so no new
  origin is introduced. It fixes a separately reported bug and carries its own
  regression test.
- **The "do not commit or push to `main`" constraint no longer holds.** The
  branch was merged to `main` on request once the suite was verified green.
- **Follow-up `103d8b9` removes three now-dead rules.** Relaxing the base
  `.intro-header-post` height and adding a base `.post-heading` margin made the
  768 px block restate them verbatim. Removal is a proven no-op: computed
  geometry is byte-identical across 15 elements at 390/768/1440.

### Trap worth remembering

Two separate failures in this repo present as "every geometry assertion is off
by a constant": the CSP `upgrade-insecure-requests` directive upgrades
`http://localhost` assets to `https://` and they fail to load, and a `.next`
built twice leaves prerendered HTML pointing at stale CSS hashes. Both render
the page unstyled, and `body` falls back to the UA `margin: 8px` — which reads
exactly like an 8 px layout regression. Assert `getComputedStyle(document.body)
.margin === '0px'` before trusting any measurement.
