# Chiron Sung HK Site Font Subsetting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `next/font/google`'s generic Chiron Sung HK shards with committed, same-origin variable WOFF2 core and reusable supplemental subsets while preserving Chiron Sung HK 200–900 site-wide.

**Architecture:** A committed monotonic core contains fixed UI text, intentionally promoted cross-document high-frequency characters and current homepage-card characters. All other supported characters use five stable buckets selected by a schema v2 authoritative committed assignment map; local tooling never rebalances existing assignments and atomically commits assignment/core/WOFF2/CSS/manifest. Vercel performs static integrity checks while GitHub's required `check` job performs full glyph, axis, assignment-stability and exact-byte budget checks.

**Tech Stack:** Node.js 24 ESM, HarfBuzz CLI (`hb-subset`, `hb-shape`), `woff2_compress` (Homebrew/Ubuntu package `woff2`), Next.js 16 App Router, Tailwind CSS 4, Vitest 4, Playwright 1.61, GitHub Actions, Serwist 9.

## Global Constraints

- 全站 computed font 仍是 Chiron Sung HK，並保留 `wght` 200–900。
- 首頁載入一個核心 WOFF2；只有實際出現低頻字時才下載補充分片。
- 任一應由 Chiron 承載的站內可見字元缺字時，GitHub required check 必須失敗，不得靠系統 fallback 靜默通過；emoji 與 control characters 明確不屬於 Chiron coverage。
- 新增文章不會重排既有字元，也不會讓所有字型檔同時 cache bust。
- Vercel build 不需要 HarfBuzz 或網路下載字型。
- 核心 = 固定 UI seed + 至少五份文件使用的高頻字，且只透過 `--rebuild-core` 單調擴充。
- Supplemental 使用五個固定 buckets 與 `font-data/chiron/supplemental-assignments.json` schema v2 authoritative map；既有 assignment 永不由普通 update 重算。
- 首頁 card 字元單調 promotion 入 core；移出首頁不 prune。
- hard budgets：首頁 ≤350,000 bytes 且 ≤2 requests；目前全部 15 個 article models 各 ≤550,000 bytes。候選依 worst bytes、mean bytes、requests 排序。
- 網頁產物為 committed variable WOFF2；OG 固定字重 TTF 維持獨立。
- Vercel 不生成字型；GitHub required `check` 補完整 HarfBuzz 驗證。
- 字型同源、自訂 `@font-face`、`unicode-range` 與 hashed immutable URLs；不依賴圖片 CDN。
- `img.allenspace.de` Cloudflare CDN 四小時 TTL 固定且不在本案範圍。
- 完整保留 shared worktree 現有首頁 `prefetch={false}`、pagination test、Serwist `globPatterns: []`、precache test 與中英文手冊修改。
- `next-env.d.ts` 一律排除 staging；不得 reset、checkout 或覆寫任何既有未提交內容。

---

## File map

- `scripts/site-font-source.mjs`: pinned source metadata validation, download/cache, SHA-256 verification.
- `scripts/site-font-text.mjs`: visible-text collection, NFC normalization, per-document occurrence provenance.
- `scripts/site-font-plan.mjs`: monotonic core/homepage promotion, schema v2 assignment parsing/placement/migration, stable five buckets, range compression, manifest data model.
- `scripts/update-site-font.mjs`: CLI orchestration, staged HarfBuzz variable-TTF subsetting, `woff2_compress`, validation, atomic artifact replacement.
- `scripts/check-site-font.mjs`: static checks everywhere and full HarfBuzz checks outside Vercel.
- `scripts/site-font-check-policy.mjs`: narrow Vercel-only dynamic-check skip policy.
- `font-data/chiron/source.json`: authoritative pinned revision, URL, SHA-256, family, axis, license.
- `font-data/chiron/core-codepoints.txt`: authoritative sorted committed core.
- `font-data/chiron/supplemental-assignments.json`: authoritative schema v2 sorted uppercase-hex `codePoint -> bucket` map (`bucketCount: 5`, values `0`–`4`).
- `public/static/fonts/chiron/manifest.json`: artifact schema and integrity inventory.
- `public/static/fonts/chiron/*.woff2`: content-addressed variable subsets.
- `css/chiron-font.generated.css`: generated faces and root CSS variable.
- `app/layout.tsx`: import generated CSS and remove Google font loader.
- `next.config.mjs`: immutable header for hashed site-font files.
- `tests/unit/site-font-*.test.ts`: collector/planner/policy/static-check contracts.
- `tests/playwright/site-font-loading.spec.ts`: production computed-font and request-selection contract.
- `.github/workflows/og-font-check.yml`: retain required `check` context and add full site-font validation.
- Documentation/package files: expose commands and preserve bilingual operational guidance.

### Task 1: Define source integrity and Vercel check policy

**Files:**

- Create: `font-data/chiron/source.json`
- Create: `scripts/site-font-source.mjs`
- Create: `scripts/site-font-check-policy.mjs`
- Create: `tests/unit/site-font-source.test.ts`
- Create: `tests/unit/site-font-check-policy.test.ts`

**Interfaces:**

- Produces: `loadSourceMetadata(root): Promise<SourceMetadata>`, `verifySha256(bytes, expected): void`, `ensureSourceFont(root): Promise<string>`, `canSkipDynamicSiteFontChecks(env, missingCommands): boolean`.
- `SourceMetadata` shape: `{ schemaVersion: 1, family: 'Chiron Sung HK', revision: string, url: string, sha256: string, axes: { wght: { min: 200, max: 900 } }, license: 'OFL-1.1' }`.

- [ ] **Step 1: Write failing source/policy tests**

```ts
expect(metadata.url).toContain(metadata.revision)
expect(() => verifySha256(Buffer.from('wrong'), metadata.sha256)).toThrow(/SHA-256/)
expect(canSkipDynamicSiteFontChecks({ VERCEL: '1' }, ['hb-shape'])).toBe(true)
expect(canSkipDynamicSiteFontChecks({}, ['hb-shape'])).toBe(false)
expect(canSkipDynamicSiteFontChecks({ VERCEL: '1' }, [])).toBe(false)
```

- [ ] **Step 2: Verify red**

Run: `yarn vitest run tests/unit/site-font-source.test.ts tests/unit/site-font-check-policy.test.ts`  
Expected: FAIL because both modules do not exist.

- [ ] **Step 3: Implement metadata and narrow helpers**

Resolve the current Google Fonts commit that contains `ofl/chironsunghk/ChironSungHK[wght].ttf` with `git ls-remote https://github.com/google/fonts.git refs/heads/main`, put that 40-character commit in both `revision` and the raw URL, download that exact URL to `/tmp/ChironSungHK-source.ttf`, then run `shasum -a 256 /tmp/ChironSungHK-source.ttf` and put its 64-character result in `sha256`. Verify `revision` against `/^[0-9a-f]{40}$/` and `sha256` against `/^[0-9a-f]{64}$/`; a floating `main` URL or dummy all-zero hash must make the test fail. `ensureSourceFont` stores in the OS temp directory, verifies cached bytes every time, downloads only when absent/invalid, verifies downloaded bytes before rename, and never writes repo outputs.

```js
export function verifySha256(bytes, expected) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) throw new Error(`Chiron source SHA-256 mismatch: ${actual}`)
}
export function canSkipDynamicSiteFontChecks(env, missing) {
  return env.VERCEL === '1' && missing.length > 0
}
```

- [ ] **Step 4: Verify green and lint**

Run: `yarn vitest run tests/unit/site-font-source.test.ts tests/unit/site-font-check-policy.test.ts && yarn eslint scripts/site-font-source.mjs scripts/site-font-check-policy.mjs`  
Expected: all tests PASS and ESLint exits 0.

Also run: `node -e "const m=require('./font-data/chiron/source.json'); if(!/^[0-9a-f]{40}$/.test(m.revision)||!/^[0-9a-f]{64}$/.test(m.sha256)||m.url.includes('/main/')) process.exit(1)"`  
Expected: exits 0, proving committed metadata has concrete pinned values rather than placeholders.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add font-data/chiron/source.json scripts/site-font-source.mjs scripts/site-font-check-policy.mjs tests/unit/site-font-source.test.ts tests/unit/site-font-check-policy.test.ts
git commit -m "feat: pin Chiron site font source"
```

### Task 2: Collect and normalize site-font corpus

**Files:**

- Create: `scripts/site-font-text.mjs`
- Create: `tests/unit/site-font-text.test.ts`

**Interfaces:**

- Produces: `collectSiteFontCorpus(root): Promise<{ fixedSeed: Set<number>, documents: Map<string, Set<number>>, occurrences: Map<number, Set<string>>, excluded: Map<string, Set<number>> }>`.
- Consumers must treat code points as numbers and serialize as uppercase hexadecimal only at file boundaries.

- [ ] **Step 1: Write fixtures inside a temporary root and failing tests**

```ts
expect(corpus.fixedSeed).toContain('A'.codePointAt(0))
expect(corpus.documents.get('data/blog/one.md')).toContain('臺'.codePointAt(0))
expect(corpus.occurrences.get('共'.codePointAt(0))?.size).toBe(2)
expect(corpus.excluded.get('emoji')).toContain('😀'.codePointAt(0))
```

Fixture inputs must cover site metadata, both dictionaries, nested `.md`/`.mdx` files, repeated characters in one document, NFC-equivalent text, emoji, variation selectors and controls.

- [ ] **Step 2: Verify red**

Run: `yarn vitest run tests/unit/site-font-text.test.ts`  
Expected: FAIL with module-not-found for `site-font-text.mjs`.

- [ ] **Step 3: Implement minimal collector**

Reuse the recursive Markdown discovery and dictionary traversal concepts from `scripts/og-font-text.mjs`, but collect complete Markdown text and source provenance. Normalize with `.normalize('NFC')`; count each code point at most once per document. Explicit categories are supported (`L`, `N`, `P`, `Sm`, `Zs`) or excluded (`emoji`, `control`, `variation-selector`); do not silently discard unknown categories.

- [ ] **Step 4: Verify green**

Run: `yarn vitest run tests/unit/site-font-text.test.ts && yarn eslint scripts/site-font-text.mjs`  
Expected: tests PASS and ESLint exits 0.

- [ ] **Step 5: Commit explicit files**

```bash
git add scripts/site-font-text.mjs tests/unit/site-font-text.test.ts
git commit -m "feat: collect Chiron site font corpus"
```

### Task 3: Migrate and plan monotonic core, committed assignments, and Unicode ranges

**Files:**

- Create: `scripts/site-font-plan.mjs`
- Create: `font-data/chiron/core-codepoints.txt`
- Create: `font-data/chiron/supplemental-assignments.json`
- Create: `tests/unit/site-font-plan.test.ts`

**Interfaces:**

- Consumes: `collectSiteFontCorpus` result.
- Produces: `parseCodepoints(text): Set<number>`, `serializeCodepoints(set): string`, `parseAssignments(json): Map<number, number>`, `serializeAssignments(map): string`, `placeNewAssignments({ corpus, core, committedAssignments, artifactBytes }): Map<number, number>`, `buildFontPlan({ corpus, homepage, committedCore, committedAssignments, artifactBytes, rebuildCore }): FontPlan`, `migrateAssignmentsV2({ corpus, homepage, committedCore }): AssignmentMigration`, `compressUnicodeRanges(set): string`.
- `FontPlan`: `{ core: Set<number>, buckets: Map<number, Set<number>>, assignments: Map<number, number>, promoted: Set<number>, newlyAssigned: Set<number> }`; buckets always have keys `0`–`4`.
- `AssignmentMigration`: `{ schemaVersion: 2, bucketCount: 5, core: Set<number>, assignments: Map<number, number> }`; migration refuses to overwrite an existing v2 map.

- [ ] **Step 1: Write failing planner tests**

```ts
expect(planWithoutRebuild.promoted.size).toBe(0)
expect(planWithFiveDocuments.core.has(shared)).toBe(true)
expect(planWithFourDocuments.core.has(shared)).toBe(false)
expect(rebuilt.core.has(oldCoreCharacter)).toBe(true)
expect(rebuilt.core.has(previousHomepageCharacter)).toBe(true)
expect(plan.assignments.get(existingCodePoint)).toBe(previousBucket)
expect(plan.assignments.get(newCodePoint)).toBe(expectedTieBrokenBucket)
expect(compressUnicodeRanges(new Set([0x41, 0x42, 0x44]))).toBe('U+0041-0042,U+0044')
```

Also assert assignment schema/key/value validation, sorted serialization, pairwise disjointness, current-corpus coverage, historical core and historical assignment extras, empty buckets, ordinary update preserving core, homepage rebuild only adding to core, promoted characters leaving assignments, and adding documents/new characters never changing any existing bucket. Test placement tie-breaks independently: maximum co-occurrence, maximum touched pages, minimum committed artifact bytes, then lowest bucket ID. Process multiple new characters in ascending code-point order and prove two runs byte-identical.

- [ ] **Step 2: Verify red**

Run: `yarn vitest run tests/unit/site-font-plan.test.ts`  
Expected: FAIL because planner exports do not exist.

- [ ] **Step 3: Implement exact stability policy**

```js
const BUCKET_COUNT = 5
const HIGH_FREQUENCY_DOCUMENTS = 5
```

When `rebuildCore` is false, core equals committed core. When true, union committed core, fixed seed, current homepage-card model and characters occurring in at least five distinct blog documents; never subtract. Existing supplemental characters use their authoritative assignments unchanged. For each genuinely new non-homepage character in ascending code-point order, choose `max co-occurrence`, then `max touched pages`, then `min committed artifact bytes`, then lowest bucket ID. Retain historical assignments absent from corpus; remove one only when its character is promoted into core.

- [ ] **Step 4: Seed committed core intentionally**

Generate core from the existing core union fixed seed, current ≥5-document candidates and current five-card homepage model. Run the explicit initial migration once: group remaining characters by identical 15-page incidence signature, sort by descending group size then signature/code point, scan buckets `0`–`4` with the optimizer report's deterministic dominance-biased rule, and commit the exact sorted assignment. Do not expose batch rebalancing through normal update.

Run: `node scripts/site-font-plan.mjs --migrate-assignments-v2 --write-core --write-assignments`

Expected: reports core `627 -> 755`, 128 homepage promotions and bucket counts `[134,120,119,121,378]`; writes `{ schemaVersion: 2, bucketCount: 5, assignments }` and refuses a second overwrite.

- [ ] **Step 5: Verify green and determinism**

Run twice against clean temporary fixtures and hash both committed data files.

Expected: hashes are identical, the assignment map matches the approved optimizer fixture, overwrite protection works, and `yarn vitest run tests/unit/site-font-plan.test.ts` PASS.

- [ ] **Step 6: Commit explicit files**

```bash
git add scripts/site-font-plan.mjs font-data/chiron/core-codepoints.txt font-data/chiron/supplemental-assignments.json tests/unit/site-font-plan.test.ts
git commit -m "feat: define stable Chiron font partitions"
```

### Task 4: Generate atomic WOFF2 artifacts, manifest, and CSS

**Files:**

- Create: `scripts/update-site-font.mjs`
- Create: `tests/unit/site-font-generation.test.ts`
- Generate: `public/static/fonts/chiron/manifest.json`
- Generate: `public/static/fonts/chiron/*.woff2`
- Generate: `css/chiron-font.generated.css`
- Modify: `package.json`

**Interfaces:**

- Consumes source, corpus and planner interfaces from Tasks 1–3.
- Produces CLI `yarn update:site-font` and `yarn update:site-font --rebuild-core`; manifest schema v2 `{ schemaVersion: 2, sourceSha256, assignmentSha256, policy: { core: 'committed-monotonic-homepage', bucketCount: 5, assignment: 'committed-cooccurrence-v2', newCharacterPlacement: ['max-cooccurrence','max-touched-pages','min-artifact-bytes','lowest-bucket-id'] }, core, buckets, artifacts }`. Each artifact records role, bucket, file, sha256, bytes and sorted code points.

- [ ] **Step 1: Write failing generation tests using a fake command runner**

Assert each artifact invokes `hb-subset`, `woff2_compress`, then `woff2_decompress`; subset arguments contain `--text-file=` and `--layout-features=*`, preserve the variable axis without `--variations`, never contain corpus text in argv, write both formats to temp first, reject bad WOFF2 magic/decompression, and leave all old outputs intact when generation or commit-phase fault injection fails.

```ts
expect(args.some((arg) => arg.startsWith('--text-file='))).toBe(true)
expect(args).not.toContain('繁體中文')
await expect(generate({ runner: failSecond })).rejects.toThrow(/hb-subset/)
expect(await readFile(oldManifest, 'utf8')).toBe(originalManifest)
```

- [ ] **Step 2: Verify red**

Run: `yarn vitest run tests/unit/site-font-generation.test.ts`  
Expected: FAIL because generation module does not exist.

- [ ] **Step 3: Implement atomic generator**

Generate every nonempty set with `hb-subset` arguments `[sourcePath, \`--text-file=${textFile}\`, \`--output-file=${stagedTtf}\`, '--layout-features=_', '--no-layout-closure', '--no-bidi-closure', '--name-IDs=_', '--name-languages=\*', '--glyph-names']`. Retain layout tables/features while disabling GSUB glyph closure and bidi mirrored-pair closure so supplemental cmap stays exactly equal to its plan (notably U+300A/U+300B remain in their planned sets); preserve variable `wght`200–900 by not instantiating`--variations`. Then invoke `woff2_compress`and structurally validate magic plus`woff2_decompress`. Task 4 owns container validity; Task 5 owns exact cmap, complete glyph/shaping and axis semantics and must reject any closure-policy regression. Stage fonts, manifest, CSS, updated assignment map and optional rebuilt core, then transactionally replace all applicable outputs with unique backups and full reverse rollback. Cleanup backups only after consistent commit and never let cleanup failure start a partial rollback. Remove orphan hashes only inside the replaced Chiron output directory.

Generated CSS must contain:

```css
:root {
  --font-chiron-sung-hk: 'Chiron Sung HK';
}
@font-face {
  font-family: 'Chiron Sung HK';
  src: url('/static/fonts/chiron/core.a1b2c3d4e5f60718.woff2') format('woff2');
  font-style: normal;
  font-weight: 200 900;
  font-display: swap;
  unicode-range: U+0020-007E, U+4E00-4E02;
}
```

- [ ] **Step 4: Add package command and verify unit green**

Add `"update:site-font": "node ./scripts/update-site-font.mjs"` without changing existing scripts.  
Run: `yarn vitest run tests/unit/site-font-generation.test.ts && yarn eslint scripts/update-site-font.mjs`  
Expected: PASS.

- [ ] **Step 5: Generate real committed artifacts**

Run: `yarn update:site-font`  
Expected: one core plus five supplemental WOFF2, manifest/CSS/assignment hashes valid, core unchanged in ordinary mode. Confirm schema v2, axis 200–900 and five buckets. For the approved migration corpus exact real sizes are core `294108` and supplemental `[72136,65404,57840,63444,177316]`; fail if page budgets are exceeded.

- [ ] **Step 6: Commit explicit Task 4 files**

```bash
git add package.json scripts/update-site-font.mjs tests/unit/site-font-generation.test.ts css/chiron-font.generated.css public/static/fonts/chiron font-data/chiron/core-codepoints.txt font-data/chiron/supplemental-assignments.json
git commit -m "feat: generate Chiron variable font subsets"
```

### Task 5: Implement static and full font checks

**Files:**

- Create: `scripts/check-site-font.mjs`
- Create: `tests/unit/site-font-check.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes manifest/source/corpus/plan interfaces.
- Produces `checkSiteFont({ root, full, env, runner }): Promise<CheckResult>` and CLI `yarn check:site-font`; `CheckResult` records skipped dynamic checks and artifact bytes.

- [ ] **Step 1: Write failing static/full check tests**

Cover missing assignment/file, bad assignment or artifact hash, schema v1/stale schema, out-of-range bucket, duplicate/core overlap, CSS reference mismatch, stale corpus, changed existing assignment, nondeterministic placement, `.notdef`, wrong axis, hard budget overflow, Vercel missing HarfBuzz (dynamic skip only), and Vercel bad manifest (must fail).

```ts
await expect(checkSiteFont({ root: badHashRoot })).rejects.toThrow(/SHA-256/)
await expect(checkSiteFont({ root: badManifestRoot, env: { VERCEL: '1' } })).rejects.toThrow()
expect((await checkSiteFont({ root: validRoot, env: { VERCEL: '1' } })).skipped).toContain('glyph')
```

- [ ] **Step 2: Verify red**

Run: `yarn vitest run tests/unit/site-font-check.test.ts`  
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement static checks before command discovery**

Always validate schema v2, source/assignment agreement, existence/hash/bytes, CSS references, exact disjoint sets, five ordered buckets, authoritative assignment equality, historical-core/history-assignment invariants, no-rebalance stability and corpus freshness. Then discover `hb-shape`, `woff2_compress`, `woff2_decompress` and inspection support. Only `VERCEL=1` may skip missing dynamic tools; local/CI must fail with install guidance. Full mode shapes UTF-8 text files, rejects `.notdef`, verifies cmap and `wght` min/max, and enforces homepage/all-15-page byte budgets. Warn, but do not fail, if core exceeds 341,550 bytes (297,000 × 1.15).

- [ ] **Step 4: Wire command into build**

Add `"check:site-font": "node ./scripts/check-site-font.mjs"`; change `build` to run `yarn check:og-font && yarn check:site-font && ...`. Do not reorder Contentlayer/Next/postbuild beyond inserting this check.

- [ ] **Step 5: Verify green in static and full modes**

Run: `yarn vitest run tests/unit/site-font-check.test.ts && yarn check:site-font --full`  
Expected: tests PASS; full check reports no missing glyphs, cmap mismatches or axis errors.

- [ ] **Step 6: Commit explicit files**

```bash
git add package.json scripts/check-site-font.mjs tests/unit/site-font-check.test.ts
git commit -m "test: verify Chiron site font artifacts"
```

### Task 6: Switch the website to generated faces and immutable caching

**Files:**

- Modify: `app/layout.tsx`
- Modify: `next.config.mjs`
- Modify only if required: `css/tailwind.css`
- Create: `tests/playwright/site-font-loading.spec.ts`

**Interfaces:**

- Consumes generated `css/chiron-font.generated.css` and URLs from its manifest.
- Preserves public CSS variable `--font-chiron-sung-hk` and existing Tailwind fallback stack.

- [ ] **Step 1: Write failing production Playwright tests**

Tests must inspect source/network rather than assume exact hashes:

```ts
expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
  'Chiron Sung HK'
)
expect(fontRequests.every((url) => url.includes('/static/fonts/chiron/'))).toBe(true)
expect(fontRequests.length).toBeLessThanOrEqual(2)
```

Add all-current-page assertions: homepage ≤2 requests and ≤350,000 bytes; every current 15 article model selects artifacts totaling ≤550,000 bytes; requested roles equal code-point-to-manifest expectations; 400, 550 and 700 elements share Chiron family; service-worker install does not request every WOFF2.

- [ ] **Step 2: Verify red against current Google-font build**

Run: `yarn playwright test tests/playwright/site-font-loading.spec.ts --config=playwright.config.ts`  
Expected: FAIL because requests use Next-generated font URLs rather than `/static/fonts/chiron/`.

- [ ] **Step 3: Make minimal layout switch**

Remove `Chiron_Sung_HK` import/initializer and its `html` class token; import `css/chiron-font.generated.css` next to `css/tailwind.css`. Preserve `scroll-smooth`, fallback stack, CSP and all unrelated layout code.

- [ ] **Step 4: Add narrow immutable header**

In `next.config.mjs` add a header entry scoped to `/static/fonts/chiron/:file*.woff2` with `Cache-Control: public, max-age=31536000, immutable`. Do not change `font-src 'self'` and do not touch image CDN headers.

- [ ] **Step 5: Verify production behavior**

Run: `yarn build && yarn playwright test tests/playwright/site-font-loading.spec.ts tests/playwright/serwist-precache.spec.ts tests/playwright/pagination.spec.ts --config=playwright.config.ts`  
Expected: build PASS; computed font/axis/request tests PASS; existing prefetch and Serwist tests remain PASS.

- [ ] **Step 6: Commit only switch files**

```bash
git add app/layout.tsx next.config.mjs tests/playwright/site-font-loading.spec.ts
git add css/tailwind.css  # only if its existing variable/fallback declaration actually required a change
git commit -m "perf: serve stable Chiron font subsets"
```

### Task 7: Integrate required CI and bilingual operations documentation

**Files:**

- Modify: `.github/workflows/og-font-check.yml`
- Verify only: `.github/workflows/pages.yml`
- Modify: `docs/functionality-settings-manual.md`
- Modify: `docs/functionality-settings-manual.zh-TW.md`
- Modify only if inaccurate: `README.md`

**Interfaces:**

- Required GitHub job/context remains exactly `check`.
- Operational commands are exactly `yarn check:site-font`, `yarn check:site-font --full`, `yarn update:site-font`, `yarn update:site-font --rebuild-core`; `--migrate-assignments-v2` is a one-time guarded developer migration command, not routine maintenance.

- [ ] **Step 1: Add CI full check without path filters**

After existing `yarn check:og-font`, add:

```yaml
- run: yarn check:site-font --full
```

Do not rename workflow job `check` or add `paths:`. Install Ubuntu packages `libharfbuzz-bin` and `woff2` (the latter provides `woff2_compress`) in the required workflow; confirm Pages tooling separately and only change it if its verified generation requirements demand it.

- [ ] **Step 2: Update both manuals in lockstep**

Document architecture, intentional core rebuild, normal supplemental update, pinned source, committed WOFF2, Vercel skip boundary, GitHub full coverage, immutable same-origin cache, OG independence and rollback. Explicitly state image CDN TTL is unrelated/fixed and Serwist must not precache all fonts.

- [ ] **Step 3: Check README accuracy**

Run: `rg -n "Chiron|font|字體|字型" README.md`  
Expected: if no source/loading claim exists, leave README unchanged; otherwise replace only inaccurate `next/font/google` wording.

- [ ] **Step 4: Validate YAML, docs, and command names**

Run: `yarn prettier --check .github/workflows/og-font-check.yml docs/functionality-settings-manual.md docs/functionality-settings-manual.zh-TW.md README.md && rg -n "check:site-font|update:site-font" package.json .github/workflows/og-font-check.yml docs/functionality-settings-manual*.md`  
Expected: Prettier PASS and all documented commands match package scripts.

- [ ] **Step 5: Commit explicit files while preserving existing manual edits**

Before staging, inspect `git diff` and retain the existing Serwist paragraphs; add font documentation around them without reverting or overwriting them.

```bash
git add .github/workflows/og-font-check.yml docs/functionality-settings-manual.md docs/functionality-settings-manual.zh-TW.md
git add README.md  # only if changed for an inaccurate existing claim
git commit -m "docs: explain Chiron site font maintenance"
```

### Task 8: Full regression, performance gate, rollout, and handoff

**Files:**

- Verify all implementation files above.
- Do not modify/stage: `next-env.d.ts`.
- Preserve/stage separately as their existing performance scope dictates: `components/hux/HuxPostCard.tsx`, `tests/playwright/pagination.spec.ts`, `app/serwist/[path]/route.ts`, `tests/playwright/serwist-precache.spec.ts`, existing manual changes.

**Interfaces:**

- Final schema v2 manifest provides `assignmentSha256`, `artifacts[].bytes` and roles for transfer-budget calculation.

- [ ] **Step 1: Run complete local gates**

Run: `yarn check:og-font && yarn check:site-font --full && yarn contentlayer2 build && yarn eslint app components lib layouts scripts && yarn tsc --noEmit && yarn test:unit && yarn build`  
Expected: every command exits 0. Ignore `next-env.d.ts` working-tree churn; do not restore or stage it.

- [ ] **Step 2: Run targeted production browser regressions**

Run: `yarn playwright test tests/playwright/site-font-loading.spec.ts tests/playwright/serwist-precache.spec.ts tests/playwright/pagination.spec.ts --config=playwright.config.ts`  
Expected: all PASS using production build/serve, with homepage ≤2 font requests and ≤350,000 bytes, and every current article model ≤550,000 bytes.

- [ ] **Step 3: Inspect artifact budgets and diff scope**

Run: `node -e "const m=require('./public/static/fonts/chiron/manifest.json'); console.log(m.artifacts.map(a=>[a.role,a.bytes]))"`  
Expected: homepage ≤350,000 bytes and ≤2 requests; all current 15 article models ≤550,000 bytes. Print lexicographic metrics and confirm approved migration worst `543560`, mean `526016.53`; core warning threshold remains advisory at 341,550 bytes. Run `git diff --check` and `git status --short`; confirm `next-env.d.ts` is unstaged.

- [ ] **Step 4: Request code review before publishing**

Use `superpowers:requesting-code-review`; reviewer must check source integrity, core monotonicity, bucket stability, atomic writes, Vercel skip boundary, CSP/cache headers, Serwist non-precache behavior and explicit staging safety. Address findings with `superpowers:receiving-code-review` and rerun affected gates.

- [ ] **Step 5: Follow repository PR flow without auto-merge**

Before any final commit/push: `git fetch origin main` and `git rev-list --left-right --count main...origin/main`; expected right/behind count is `0`. Stage only named files, explicitly excluding `next-env.d.ts`. Push feature branch, open PR, wait for required `ci` and `check`, then manually merge; never enable auto-merge.

- [ ] **Step 6: Production rollout verification**

On Vercel preview and production verify CSP allows same-origin WOFF2, hashed WOFF2 responds with one-year immutable header, homepage and all current article-model computed-font/network budgets pass, Serwist install does not fetch all buckets, and no tofu appears. After production deployment rerun PageSpeed desktop and record FCP, LCP, total transfer and font requests; PageSpeed score itself is observational, not a merge gate.

- [ ] **Step 7: Roll back if acceptance fails**

Revert the layout/font-switch commit to restore `next/font/google`; for schema migration failure revert core, assignment map, manifest, generated CSS and WOFF2 as one unit. Never feed schema v2 assignments to the old modulo planner or partially reassign buckets. Leave unreferenced hashed files harmlessly cached and do not hand-edit generated CSS/manifest in production. Re-run build and all-page checks before redeploying rollback.

## Subagent-Driven handoff

The user selected Subagent-Driven execution. The parent agent should use `superpowers:subagent-driven-development`, dispatch a fresh implementation subagent for each task, and perform the required spec-compliance then code-quality review gates between tasks. Because the current shared worktree already contains uncommitted prefetch/Serwist work, execution must begin with a status/diff audit and must not create a worktree or move changes unless the user explicitly authorizes it.
