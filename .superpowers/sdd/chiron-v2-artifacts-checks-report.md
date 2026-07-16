# Chiron schema-v2 artifacts and checks report

Date: 2026-07-16

## RED / GREEN

- Generator RED: the schema-v2 manifest test failed against schemaVersion 1.
- Checker RED: all 15 schema-v2 checker fixtures failed at the old schemaVersion 1 gate.
- Focused GREEN: generation, checker and planner tests pass (40 tests).
- Full unit GREEN: 104 tests pass.

## Migration result

The generator and checker now consume the authoritative schema-v2 five-bucket assignment map. Normal updates retain committed assignments and only place genuinely new characters through the planner's ordered tie-break policy. The manifest records the assignment hash, policy, exact artifact code points, content hashes and bytes.

The v1 map contained collector-excluded emoji and variation selectors. They were removed from authoritative core/assignments instead of being hidden from artifact metadata. The committed Chiron core is now 754 code points and supplemental bucket counts are `[134, 120, 110, 121, 374]`.

Real artifact bytes are:

```text
core          294108
supplement-0   72136
supplement-1   65404
supplement-2   57652
supplement-3   63444
supplement-4  177420
total         730164
```

Full cmap, shaping, `.notdef`, WOFF2 structure and `wght` 200-900 checks pass.

## Page budgets

- Homepage: 294,108 bytes, 1 request (limit 350,000 / 2).
- Maximum article: `2026/07/13/cryosleep-hodl-economy`, 543,664 bytes, 3 requests (limit 550,000).
- All 15 deterministic article models pass.

## Verification

```text
yarn update:site-font
yarn check:site-font
yarn check:site-font --full
yarn vitest run tests/unit/site-font-generation.test.ts tests/unit/site-font-check.test.ts tests/unit/site-font-plan.test.ts
yarn test:unit
yarn eslint scripts/update-site-font.mjs scripts/check-site-font.mjs scripts/site-font-plan.mjs tests/unit/site-font-generation.test.ts tests/unit/site-font-check.test.ts
git diff --check
```

Unrelated Serwist, prefetch, pagination, documentation and `next-env.d.ts` worktree changes were preserved and excluded from the commit.

## Review follow-up

- Added explicit base-map history comparison. Removal or rebucketing fails; monotonic core promotion and new assignments pass. Task 7 must extract the base branch map and provide `--base-assignments`; the first v2 rollout is the sole no-map exception.
- Removed implicit budget-model fallback. The CLI requires fresh Contentlayer output with exactly 15 articles, and `build` now runs Contentlayer before the site-font check.
- Centralized included/excluded/unknown Unicode classification in the corpus module and reused it in planning, generation, and checking.
- Extended the atomic transaction test through `during-assignment-write`, including byte-exact assignment restoration.
- The homepage preview model now matches `HuxPostCard`: `preview || (summary !== subtitle ? summary : undefined)`.
- The raw article-body budget remains a conservative CI model. Task 6 production DOM/network verification is final acceptance and may show that raw Markdown or monospaced text was overcounted; the current hard gate remains unchanged.
