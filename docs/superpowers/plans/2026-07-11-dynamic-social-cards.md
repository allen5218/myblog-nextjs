# Dynamic Social Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate branded 1200×630 home and per-post social images whose backgrounds follow each post's `headerImg` or `headerBgCss`, and expose them through Open Graph and Twitter metadata.

**Architecture:** Pure helper functions in `lib/social-card.ts` normalize background and summary data. Shared JSX in `components/social/SocialCard.tsx` renders an `ImageResponse`-compatible card, while Next.js file-convention routes provide home and dated-post images. Existing metadata is updated to reference those stable generated endpoints.

**Tech Stack:** Next.js 15 App Router, `next/og` `ImageResponse`, React 19, Contentlayer2, TypeScript, Vitest, Playwright.

## Global Constraints

- Every generated image is exactly 1200×630 PNG.
- Post background priority is `headerImg`, then supported `headerBgCss`, then the branded fallback.
- Only normalized `linear-gradient(...)` values from `headerBgCss` are passed to `ImageResponse`.
- Post summary priority is subtitle, then generated preview.
- Existing visible page rendering and non-image SEO metadata remain unchanged.
- Both Open Graph and Twitter metadata use the generated image endpoints.

---

## File Structure

- Create `lib/social-card.ts`: pure normalization, background selection, summary selection, and URL helpers.
- Create `tests/unit/social-card.test.ts`: unit contract for all pure selection rules.
- Create `components/social/SocialCard.tsx`: shared 1200×630 image-compatible JSX.
- Create `app/opengraph-image.tsx`: home social image endpoint.
- Create `app/[year]/[month]/[day]/[slug]/opengraph-image.tsx`: post social image endpoint.
- Modify `app/layout.tsx`: point root Open Graph and Twitter metadata to `/opengraph-image`.
- Modify `app/[year]/[month]/[day]/[slug]/page.tsx`: point post metadata to its generated endpoint.
- Create `tests/playwright/social-card.spec.ts`: endpoint size/type and HTML metadata integration checks.

### Task 1: Social-card data rules

**Files:**
- Create: `lib/social-card.ts`
- Create: `tests/unit/social-card.test.ts`

**Interfaces:**
- Produces: `selectSocialCardBackground(input, siteUrl): SocialCardBackground`
- Produces: `selectSocialCardSummary(subtitle, preview): string`
- Produces: `postSocialImagePath(legacyPath): string`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/social-card.test.ts` with cases that assert:

```ts
expect(selectSocialCardBackground({ headerImg: '/img/post.jpg', headerBgCss: 'linear-gradient(red, blue)' }, siteUrl)).toEqual({
  kind: 'image',
  value: 'https://blog.allenspace.de/img/post.jpg',
})
expect(selectSocialCardBackground({ headerBgCss: ' linear-gradient(to right, #5d4e6d, #4a5568); ' }, siteUrl)).toEqual({
  kind: 'gradient',
  value: 'linear-gradient(to right, #5d4e6d, #4a5568)',
})
expect(selectSocialCardBackground({ headerBgCss: 'url(javascript:alert(1))' }, siteUrl)).toEqual({
  kind: 'fallback',
  value: SOCIAL_CARD_FALLBACK,
})
expect(selectSocialCardSummary('Subtitle', 'Preview')).toBe('Subtitle')
expect(selectSocialCardSummary('', 'Preview')).toBe('Preview')
expect(postSocialImagePath('2026/04/26/learning-how-to-learn')).toBe(
  '/2026/04/26/learning-how-to-learn/opengraph-image'
)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `yarn vitest run tests/unit/social-card.test.ts`

Expected: FAIL because `@/lib/social-card` does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

Create `lib/social-card.ts` with discriminated types and these exact rules:

```ts
export const SOCIAL_CARD_FALLBACK = 'linear-gradient(135deg, #111827 0%, #164e63 55%, #0891b2 100%)'

export type SocialCardBackground =
  | { kind: 'image'; value: string }
  | { kind: 'gradient'; value: string }
  | { kind: 'fallback'; value: typeof SOCIAL_CARD_FALLBACK }

export function selectSocialCardBackground(
  input: { headerImg?: string; headerBgCss?: string },
  siteUrl: string
): SocialCardBackground {
  const image = input.headerImg?.trim()
  if (image) return { kind: 'image', value: new URL(image, `${siteUrl}/`).href }

  const gradient = input.headerBgCss?.trim().replace(/;+\s*$/, '')
  if (gradient && /^linear-gradient\([^\r\n]+\)$/i.test(gradient)) {
    return { kind: 'gradient', value: gradient }
  }
  return { kind: 'fallback', value: SOCIAL_CARD_FALLBACK }
}

export function selectSocialCardSummary(subtitle?: string, preview?: string) {
  return subtitle?.trim() || preview?.trim() || ''
}

export function postSocialImagePath(legacyPath: string) {
  return `/${legacyPath.replace(/^\/+|\/+$/g, '')}/opengraph-image`
}
```

- [ ] **Step 4: Run the unit test and verify GREEN**

Run: `yarn vitest run tests/unit/social-card.test.ts`

Expected: all social-card unit tests PASS.

- [ ] **Step 5: Commit the pure contract**

```bash
git add lib/social-card.ts tests/unit/social-card.test.ts
git commit -m "test: define social card data rules"
```

### Task 2: Shared renderer and home image endpoint

**Files:**
- Create: `components/social/SocialCard.tsx`
- Create: `app/opengraph-image.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `SocialCardBackground`, `SOCIAL_CARD_FALLBACK`
- Produces: `SocialCard({ title, summary, siteName, background }): ReactElement`
- Produces: GET-compatible Next.js metadata image route at `/opengraph-image`

- [ ] **Step 1: Add the failing integration assertions**

Create the first portion of `tests/playwright/social-card.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('home exposes a generated 1200x630 large social card', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/opengraph-image/
  )
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image'
  )

  const response = await request.get('/opengraph-image')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('image/png')
  expect((await response.body()).subarray(16, 24).readUInt32BE(0)).toBe(1200)
  expect((await response.body()).subarray(16, 24).readUInt32BE(4)).toBe(630)
})
```

- [ ] **Step 2: Run the Playwright test and verify RED**

Run: `yarn playwright test tests/playwright/social-card.spec.ts --grep "home exposes"`

Expected: FAIL because `/opengraph-image` and the new metadata URL do not exist.

- [ ] **Step 3: Implement the shared card and home route**

Implement `SocialCard` as a 1200×630 flex layout compatible with `ImageResponse`. Apply `backgroundImage: background.value`; when `background.kind === 'image'`, use `backgroundSize: 'cover'`, `backgroundPosition: 'center'`, and add an absolute dark overlay. Render the site name, title, and a summary constrained to a fixed-height text region.

Create `app/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import siteMetadata from '@/data/siteMetadata'
import SocialCard from '@/components/social/SocialCard'
import { SOCIAL_CARD_FALLBACK } from '@/lib/social-card'

export const alt = `${siteMetadata.title} social card`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <SocialCard
      siteName={siteMetadata.title}
      title={siteMetadata.title}
      summary={siteMetadata.description}
      background={{ kind: 'fallback', value: SOCIAL_CARD_FALLBACK }}
    />,
    size
  )
}
```

Update root `openGraph.images` and `twitter.images` to use `'/opengraph-image'`.

- [ ] **Step 4: Run the home integration test and verify GREEN**

Run: `yarn playwright test tests/playwright/social-card.spec.ts --grep "home exposes"`

Expected: 1 test PASS and response dimensions 1200×630.

- [ ] **Step 5: Commit the home renderer**

```bash
git add components/social/SocialCard.tsx app/opengraph-image.tsx app/layout.tsx tests/playwright/social-card.spec.ts
git commit -m "feat: generate home social card"
```

### Task 3: Per-post image endpoint and metadata

**Files:**
- Create: `app/[year]/[month]/[day]/[slug]/opengraph-image.tsx`
- Modify: `app/[year]/[month]/[day]/[slug]/page.tsx`
- Modify: `tests/playwright/social-card.spec.ts`

**Interfaces:**
- Consumes: `selectSocialCardBackground`, `selectSocialCardSummary`, `postSocialImagePath`, `SocialCard`
- Produces: generated image for every `allBlogs` legacy path

- [ ] **Step 1: Add failing post integration tests**

Append tests that request `/2026/04/26/learning-how-to-learn/opengraph-image`, assert PNG 1200×630, and inspect the article HTML so `og:image` and `twitter:image` both end in that route. Add a second request for `/2025/11/08/deploying-openwebui-for-free-with-cloudflare-tunnel/opengraph-image` to exercise a remote `headerImg` post.

- [ ] **Step 2: Run post tests and verify RED**

Run: `yarn playwright test tests/playwright/social-card.spec.ts --grep "post"`

Expected: FAIL with 404 or old static social image metadata.

- [ ] **Step 3: Implement the post image route**

Use the same `routePath(params)` lookup semantics as the page. Export `generateStaticParams()` from `allBlogs`, declare `alt`, `size`, and `contentType`, and render:

```tsx
const background = selectSocialCardBackground(
  { headerImg: post.headerImg, headerBgCss: post.headerBgCss },
  siteMetadata.siteUrl
)
const summary = selectSocialCardSummary(post.subtitle, post.preview)

return new ImageResponse(
  <SocialCard
    siteName={siteMetadata.title}
    title={post.title}
    summary={summary}
    background={background}
  />,
  size
)
```

Call `notFound()` for unknown parameters. Update post `openGraph.images` and `twitter.images` to the absolute URL derived from `postSocialImagePath(post.legacyPath)`.

- [ ] **Step 4: Run post integration tests and verify GREEN**

Run: `yarn playwright test tests/playwright/social-card.spec.ts --grep "post"`

Expected: gradient and image-backed post endpoint tests PASS.

- [ ] **Step 5: Commit post generation**

```bash
git add 'app/[year]/[month]/[day]/[slug]/opengraph-image.tsx' 'app/[year]/[month]/[day]/[slug]/page.tsx' tests/playwright/social-card.spec.ts
git commit -m "feat: generate per-post social cards"
```

### Task 4: Full verification and visual inspection

**Files:**
- Modify only if verification reveals a scoped defect in files from Tasks 1–3.

**Interfaces:**
- Verifies all prior task outputs together.

- [ ] **Step 1: Run all unit tests**

Run: `yarn test:unit`

Expected: all unit suites PASS with zero failures.

- [ ] **Step 2: Run the focused Playwright suite**

Run: `yarn playwright test tests/playwright/social-card.spec.ts`

Expected: all social-card integration tests PASS.

- [ ] **Step 3: Run type and production-build verification**

Run: `yarn tsc --noEmit`

Expected: exit code 0.

Run: `yarn build`

Expected: exit code 0 and both `opengraph-image` routes listed in build output.

- [ ] **Step 4: Inspect actual rendered images**

Start the production server, open these endpoints in the in-app browser, and capture visual evidence:

- `/opengraph-image`
- `/2026/04/26/learning-how-to-learn/opengraph-image`
- `/2025/11/08/deploying-openwebui-for-free-with-cloudflare-tunnel/opengraph-image`

Confirm the home brand background, purple-gray `headerBgCss` gradient, remote header image, readable title/summary, and absence of clipping.

- [ ] **Step 5: Inspect final diff and commit any verification fix**

Run: `git diff --check` and `git status --short`.

If verification required changes, repeat the affected test before committing them with:

```bash
git add lib/social-card.ts components/social app/opengraph-image.tsx 'app/[year]/[month]/[day]/[slug]' tests
git commit -m "fix: harden social card rendering"
```
