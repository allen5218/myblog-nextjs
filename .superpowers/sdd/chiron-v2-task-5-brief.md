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

Always validate schema v2, source/assignment agreement, existence/hash/bytes, CSS references, exact disjoint sets, five ordered buckets, authoritative assignment equality, historical-core/history-assignment invariants, no-rebalance stability and corpus freshness. Single-snapshot consistency cannot prove no-rebalance history: Task 7 CI must extract `origin/main`'s assignment JSON and pass it through `--base-assignments=<path>` when present. Only the initial schema-v2 rollout may omit this anchor because the base has no v2 map. Then discover `hb-shape`, `woff2_compress`, `woff2_decompress` and inspection support. Only `VERCEL=1` may skip missing dynamic tools; local/CI must fail with install guidance. Full mode shapes UTF-8 text files, rejects `.notdef`, verifies cmap and `wght` min/max, and enforces homepage/all-15-page byte budgets. Warn, but do not fail, if core exceeds 341,550 bytes (297,000 × 1.15).

Budget validation requires a freshly generated, valid `.contentlayer/generated/Blog/_index.json` containing exactly the 15 current article models. Task 7 runs Contentlayer before the full checker. Article `body.raw` is intentionally conservative and may count Markdown, code, or monospaced content not carried by Chiron in the rendered DOM; keep the hard CI gate because the committed artifacts pass it, while Task 6 production DOM/network measurement remains final acceptance.

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
