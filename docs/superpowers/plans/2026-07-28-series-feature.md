# Series Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class blog Series feature with typed frontmatter, static collection routes, article-level links, desktop/mobile navigation, sitemap coverage, tests, and author-facing documentation.

**Architecture:** Contentlayer exposes one optional `series` string per post. A pure `lib/series.ts` module is the only place that normalizes names, creates slugs and URLs, excludes non-discoverable posts, detects collisions, and orders series posts. Static `/series/` and `/series/[series]/` App Router pages consume that module; article and navigation components link to those pages without changing Archive or legacy Tags behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Contentlayer2, Pliny, Tailwind CSS, Vitest, Playwright.

## Global Constraints

- The only new post frontmatter field is optional `series: string`; do not add `seriesOrder`, series descriptions, feeds, pagination, or configuration.
- Set `series: "AI 自維護的知識庫"` on `data/blog/2026-07-25-openwiki-tame-agents-md.md`.
- Public routes are exactly `/series/` and `/series/[series]/`, with the repository-wide trailing slash convention.
- The concrete series URL is `/series/ai-自維護的知識庫/`.
- Series discovery excludes every post with `listed === false` or `draft === true`.
- Posts within a series are ordered by `date` ascending, then `path` ascending for deterministic ties.
- Different display names that normalize to the same slug are a build-blocking error, not silently merged.
- `/series/[series]/` is statically generated with `generateStaticParams`; `dynamicParams = false`; unknown series return 404.
- Desktop and mobile navigation order is exactly `Home`, `About`, `Series`, `Archive`; mobile remains inside the hamburger menu.
- A series post shows a separate `Series: <linked name>` row between its tags and title, and another series link after the prose but before the existing global chronological pager.
- Existing Archive tag filtering, legacy `/tags/` routes, global previous/next post semantics, RSS feeds, comments, and non-series articles remain unchanged.
- Keep the implementation server-rendered except for existing client navigation components; Series pages must not require a new client-side filter.
- Preserve unrelated changes and never stage `next-env.d.ts`.
- Follow TDD: write and run the focused failing test before production code, then run it again green.
- Update both manuals and README when the user-facing feature is complete.

---

### Task 1: Series content model and domain helpers

**Files:**
- Create: `lib/series.ts`
- Create: `tests/unit/series.test.ts`
- Modify: `contentlayer.config.ts`
- Modify: `data/blog/2026-07-25-openwiki-tame-agents-md.md`

**Interfaces:**
- Produces:
  - `export type SeriesPost = { date: string; path: string; title: string; subtitle?: string; series?: string; listed?: boolean; draft?: boolean }`
  - `export type SeriesGroup<T extends SeriesPost = SeriesPost> = { name: string; slug: string; posts: T[] }`
  - `export function seriesSlug(name: string): string`
  - `export function seriesHref(name: string): string`
  - `export function collectSeries<T extends SeriesPost>(posts: T[]): SeriesGroup<T>[]`
  - `export function findSeriesBySlug<T extends SeriesPost>(posts: T[], value: string): SeriesGroup<T> | undefined`
- Consumers: Tasks 2 and 3 import these functions; do not duplicate slug, filter, collision, or ordering logic elsewhere.

- [ ] **Step 1: Write the failing domain tests**

Create `tests/unit/series.test.ts` with literal expectations covering:

```ts
import { describe, expect, test } from 'vitest'
import { collectSeries, findSeriesBySlug, seriesHref, seriesSlug } from '../../lib/series'

const post = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-07-25T00:00:00.000Z',
  path: '2026/07/25/openwiki-tame-agents-md',
  title: 'OpenWiki',
  ...overrides,
})

describe('series domain', () => {
  test('creates the canonical Chinese series slug and href', () => {
    expect(seriesSlug('AI 自維護的知識庫')).toBe('ai-自維護的知識庫')
    expect(seriesHref('AI 自維護的知識庫')).toBe('/series/ai-自維護的知識庫/')
  })

  test('excludes hidden, draft, blank, and missing series posts', () => {
    const groups = collectSeries([
      post({ series: 'AI 自維護的知識庫' }),
      post({ path: 'hidden', series: 'AI 自維護的知識庫', listed: false }),
      post({ path: 'draft', series: 'AI 自維護的知識庫', draft: true }),
      post({ path: 'blank', series: '   ' }),
      post({ path: 'none' }),
    ])
    expect(groups.map(({ name, posts }) => [name, posts.map(({ path }) => path)])).toEqual([
      ['AI 自維護的知識庫', ['2026/07/25/openwiki-tame-agents-md']],
    ])
  })

  test('orders series posts oldest first and breaks date ties by path', () => {
    const [group] = collectSeries([
      post({ date: '2026-07-26T00:00:00.000Z', path: 'third', series: 'S' }),
      post({ date: '2026-07-25T00:00:00.000Z', path: 'second', series: 'S' }),
      post({ date: '2026-07-25T00:00:00.000Z', path: 'first', series: 'S' }),
    ])
    expect(group.posts.map(({ path }) => path)).toEqual(['first', 'second', 'third'])
  })

  test('finds encoded or decoded route slugs', () => {
    const posts = [post({ series: 'AI 自維護的知識庫' })]
    expect(findSeriesBySlug(posts, 'ai-自維護的知識庫')?.name).toBe('AI 自維護的知識庫')
    expect(findSeriesBySlug(posts, encodeURI('ai-自維護的知識庫'))?.name).toBe(
      'AI 自維護的知識庫'
    )
  })

  test('rejects different names that collapse to one slug', () => {
    expect(() =>
      collectSeries([
        post({ path: 'one', series: 'Hello World' }),
        post({ path: 'two', series: 'hello-world' }),
      ])
    ).toThrow(/series slug collision.*hello-world/i)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
yarn vitest run tests/unit/series.test.ts
```

Expected: FAIL because `lib/series.ts` does not exist.

- [ ] **Step 3: Add the Contentlayer field and target frontmatter**

In `contentlayer.config.ts`, add this field immediately after `tags`:

```ts
series: { type: 'string' },
```

In the target post, add this immediately before `tags`:

```yaml
series:     "AI 自維護的知識庫"
```

- [ ] **Step 4: Implement the minimal pure domain module**

Use `github-slugger`'s stateless `slug` export. Trim names, ignore blank values, exclude `listed === false` and `draft === true`, avoid mutating the caller's array, sort posts by ascending date/path, sort groups by name, and throw an error naming the duplicate slug and both display names when a collision occurs. `findSeriesBySlug` must accept either encoded or decoded input.

- [ ] **Step 5: Verify GREEN and generated typing**

Run:

```bash
yarn vitest run tests/unit/series.test.ts
yarn contentlayer2 build
yarn tsc --noEmit
```

Expected: 5 tests pass, Contentlayer regenerates a `series?: string` Blog field, and TypeScript exits 0.

- [ ] **Step 6: Commit Task 1**

Stage only:

```bash
git add contentlayer.config.ts data/blog/2026-07-25-openwiki-tame-agents-md.md lib/series.ts tests/unit/series.test.ts
git commit -m "feat: add series content model"
```

---

### Task 2: Static Series routes, listings, and sitemap

**Files:**
- Create: `components/hux/SeriesIndex.tsx`
- Create: `components/hux/SeriesPostList.tsx`
- Create: `app/series/page.tsx`
- Create: `app/series/[series]/page.tsx`
- Create: `tests/playwright/series.spec.ts`
- Modify: `app/sitemap.ts`
- Modify: `css/tailwind.css`

**Interfaces:**
- Consumes from Task 1: `collectSeries`, `findSeriesBySlug`, `seriesHref`, `SeriesGroup`, and `SeriesPost`.
- Produces: static index/detail routes and reusable listing components; Task 3's article links target `seriesHref(series)`.

- [ ] **Step 1: Write the failing production route test**

Create `tests/playwright/series.spec.ts` with tests that:

```ts
import { expect, test } from '@playwright/test'

const seriesName = 'AI 自維護的知識庫'
const seriesPath = '/series/ai-自維護的知識庫/'
const encodedSeriesPath = encodeURI(seriesPath)
const articleTitle = '讓 OpenWiki 接手 AGENTS.md：守則檔不再無止盡膨脹'

test('Series index links to the statically generated collection', async ({ page }) => {
  await page.goto('/series/')
  await expect(page.locator('.site-heading h1')).toHaveText('Series')
  await expect(page.getByRole('link', { name: seriesName })).toHaveAttribute('href', seriesPath)
  await expect(page.getByText('1 post', { exact: true })).toBeVisible()
})

test('Series detail lists posts in reading order and unknown series is 404', async ({
  page,
  request,
}) => {
  await page.goto(encodedSeriesPath)
  await expect(page.locator('.site-heading h1')).toHaveText(seriesName)
  await expect(page.getByText('Part 1', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: articleTitle })).toHaveAttribute(
    'href',
    '/2026/07/25/openwiki-tame-agents-md/'
  )
  expect((await request.get('/series/not-a-series/')).status()).toBe(404)
})

test('sitemap contains the Series index and concrete collection URL', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text()
  expect(xml).toContain('<loc>https://blog.allenspace.de/series/</loc>')
  expect(xml).toContain(
    `<loc>https://blog.allenspace.de/series/${encodeURI('ai-自維護的知識庫')}/</loc>`
  )
})
```

- [ ] **Step 2: Verify the route test is RED**

Build and serve the current code using the repository's production flow, then run:

```bash
yarn playwright test tests/playwright/series.spec.ts
```

Expected: FAIL because `/series/` and `/series/[series]/` return 404 and sitemap lacks them.

- [ ] **Step 3: Implement server-rendered index and detail listing components**

`SeriesIndex` renders each group in an `.archive-wrap .mini-post-list` visual shell. Each group name is the link text and `<count> post` / `<count> posts` is visible subordinate text.

`SeriesPostList` renders an ordered list. Each item visibly labels `Part N`, links to `/${post.path}/`, shows the title, and shows `subtitle` when present. Do not group by year because this list represents reading order.

Add only the Series-specific CSS needed for spacing, counter labels, borders, mobile wrapping, and dark-mode variables. Reuse existing Hux colors and typography variables.

- [ ] **Step 4: Implement static App Router pages**

`/series/`:

- uses `collectSeries(allBlogs)`
- renders `HuxHero` with `variant="archive"`, title `Series`, subtitle `Collections of related posts.`, and `/img/bg-little-universe.jpg`
- uses `genPageMetadata({ title: 'Series', description: 'Collections of related posts.' })`

`/series/[series]/`:

- exports `dynamicParams = false`
- `generateStaticParams` returns encoded group slugs
- resolves route input only through `findSeriesBySlug`
- calls `notFound()` when absent
- metadata title is the display name and description is `Posts in the <name> series.`
- renders `HuxHero` with the series display name as title, `Series` as subtitle, and `/img/bg-little-universe.jpg`
- renders `SeriesPostList`

- [ ] **Step 5: Add sitemap entries**

Keep existing routes intact. Add `/series/` with the newest discoverable series post date and one entry per concrete series using that series' newest post date. Do not add query-string URLs.

- [ ] **Step 6: Verify GREEN**

Rebuild/restart production, then run:

```bash
yarn playwright test tests/playwright/series.spec.ts
yarn test:unit
```

Expected: all three Series tests pass and the full unit suite exits 0.

- [ ] **Step 7: Commit Task 2**

Stage only the Task 2 files and commit:

```bash
git commit -m "feat: add static series pages"
```

---

### Task 3: Article Series links, navigation, font seed, and documentation

**Files:**
- Create: `components/hux/SeriesLink.tsx`
- Modify: `components/hux/HuxHero.tsx`
- Modify: `layouts/PostLayout.tsx`
- Modify: `components/Header.tsx`
- Modify: `data/headerNavLinks.ts`
- Modify: `css/tailwind.css`
- Modify: `scripts/site-font-text.mjs`
- Modify: `tests/playwright/series.spec.ts`
- Modify: `tests/playwright/kbar-touch.spec.ts`
- Modify: `docs/functionality-settings-manual.zh-TW.md`
- Modify: `docs/functionality-settings-manual.md`
- Modify: `README.md`

**Interfaces:**
- Consumes from Task 1: `seriesHref`.
- Consumes from Task 2: the concrete static Series route.
- Produces: two article-level Series entry points and exact desktop/mobile navigation order.

- [ ] **Step 1: Extend tests first**

Before editing production UI, add tests that:

- load `/2026/07/25/openwiki-tame-agents-md/`
- assert a `.post-heading .series-meta` row is between `.post-heading .tags` and the `<h1>`
- assert that row contains exact visible label `Series:` and a link named `AI 自維護的知識庫` to `/series/ai-自維護的知識庫/`
- assert a `.post-series-link` after `.prose` and before `.pager` contains the same target
- load `/2026/07/14/kamiina-botan-anime-review/` and assert neither Series element exists
- at desktop width, assert primary navigation link order is `Home`, `About`, `Series`, `Archive`
- open the mobile hamburger and assert menuitem order is `Home`, `About`, `Series`, `Archive`, `Search`
- update the existing negative Tags assertion without weakening it

- [ ] **Step 2: Verify the UI tests are RED**

Run the focused production Playwright tests:

```bash
yarn playwright test tests/playwright/series.spec.ts tests/playwright/kbar-touch.spec.ts
```

Expected: FAIL because Series article UI and navigation are absent.

- [ ] **Step 3: Implement the shared Series link**

`SeriesLink` accepts `{ series: string; className?: string }`, renders visible `Series:` plus a `Link` whose text is the series display name, and builds its target only with `seriesHref(series)`.

In `HuxHero`, accept optional `series` and render the top row after `.tags` and before `<h1>`.

In `PostLayout`, pass `series` into `HuxHero`, then render the bottom `SeriesLink` immediately after `.prose` and before `HuxPager`. Do not alter global `next` / `prev`.

- [ ] **Step 4: Update navigation**

Set both navigation sources to:

```ts
[
  { href: '/', title: 'Home' },
  { href: '/about', title: 'About' },
  { href: '/series', title: 'Series' },
  { href: '/archive', title: 'Archive' },
]
```

Do not add a separate mobile-only Series implementation; `MobileNavMenu` continues consuming `data/headerNavLinks.ts`.

- [ ] **Step 5: Add focused styling and fixed UI font text**

Style `.series-meta` as a visually separate compact metadata row, not a tag pill. Style `.post-series-link` as a bordered/quiet callout that fits before the pager in light and dark modes. Keep selectors scoped so About is unaffected.

Add all new component-owned visible UI copy (`Series`, `Series:`, `Collections of related posts.`, `Part`, and the pluralized `post` copy) to `SHARED_UI_TEXT`; do not add the dynamic series name there because it already comes from Markdown frontmatter.

- [ ] **Step 6: Update author-facing documentation**

Update both manuals with:

- `series` as optional string
- exact syntax example
- `/series/` and `/series/[series]/`
- oldest-to-newest date-derived reading order
- top and bottom article links
- no manual ordering field
- desktop/mobile navigation sources
- sitemap inclusion

Update README Highlights with one concise Series bullet and keep the bilingual manuals claim accurate.

- [ ] **Step 7: Verify GREEN**

Rebuild/restart production and run:

```bash
yarn playwright test tests/playwright/series.spec.ts tests/playwright/kbar-touch.spec.ts
yarn contentlayer2 build
yarn tsc --noEmit
yarn lint
yarn test:unit
yarn check:site-font --full
```

Expected: focused Playwright tests, typecheck, lint, all unit tests, and full site-font checks exit 0. `next-env.d.ts` is excluded from staging.

- [ ] **Step 8: Commit Task 3**

Stage only the Task 3 files and commit:

```bash
git commit -m "feat: surface series navigation"
```

---

## Final Integration and Review Gate

After all tasks are individually reviewed:

- Run the full production build and complete Playwright parity suite.
- Inspect desktop navigation at 768px and 992px for overlap.
- Inspect mobile hamburger and both article Series placements.
- Confirm `/series/`, the concrete Series page, article links, unknown-series 404, sitemap, metadata, and static prerender output.
- Run OpenWiki update only after the implementation commits leave a clean worktree; review and commit generated wiki changes if any.
- Dispatch two fresh independent read-only reviewers concurrently. Both receive the full branch diff and this plan and are explicitly told to assume the implementation contains defects. One focuses on correctness/routing/data/SEO; the other focuses on UI/responsive/accessibility/tests/docs/regressions.
- Resolve every Critical or Important finding through one fix subagent and one scoped re-review, then rerun affected and full verification.
