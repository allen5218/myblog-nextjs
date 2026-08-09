A code wiki for this local repository. Prioritize a concise quickstart, architecture overview, source map, key workflows, domain concepts, operations/runbook notes, testing guidance, and integration points. Inspect git history to understand reasoning behind code changes and the progression of the repository. Keep pages grounded in the repository structure and recent code changes. Prefer practical navigation for engineers over generic summaries.

Hard constraints:

- **Document only durable repository properties.** Never record transient run-time or working-tree state: which files happen to be modified, staged, or untracked during a documentation run, the status of the OpenWiki setup itself, or anything that becomes false once the run is committed. Such state is not a repository invariant and must never appear in an invariants list.
- **Do not restate `AGENTS.md` at length.** It is the human-maintained source of truth for rules, environment pitfalls, and the reasoning behind them. Link to it, and focus this wiki on what is derived from source code: structure, contracts, test coverage, and change impact.
- **`docs/lessons/` is a second wiki, parallel to this one — lessons, not rules.** Its pages hold experience-derived knowledge: measured numbers, dates, and the mechanism behind a past failure. They are routed out of `AGENTS.md`, which keeps a pointer carrying the trigger condition. The two wikis differ in provenance, not in standing: this one is generated from source and can be regenerated, `docs/lessons/` is written from debugging sessions and cannot. `AGENTS.md` is the schema layer for both — it holds operating rules and the routes, not derived knowledge. Treat `docs/lessons/` exactly as `AGENTS.md`: link, never restate at length, and never rewrite from generated content. **Do not enumerate its files here** — the set changes, and a snapshot of it is exactly the transient state the first constraint forbids.
- **Prefer facts verifiable from code, config, and tests** over prose summaries. Cite concrete file paths so a reader can check every claim.
- **Use the repository's exact OpenWiki refresh procedure.** After source changes are committed
  and the worktree is clean, the local refresh command is
  `openwiki code --update --print`; generated updates are reviewed and included in the normal PR.
  Do not shorten this to `openwiki --update`, and do not claim that the ignored generated
  `.github/workflows/openwiki-update.yml` is the repository's supported refresh path.
- **Map behavior to the tests that actually cover it.** Do not attribute mobile hamburger
  navigation to the Series spec: `tests/playwright/series.spec.ts` covers desktop Series order,
  while `tests/playwright/kbar-touch.spec.ts` covers the mobile hamburger order. When one
  behavior spans specs, cite every relevant spec rather than collapsing the mapping. Verify each
  claimed contract against the test's actual assertions: in particular, the post-body `Series:`
  label is asserted by `tests/playwright/series.spec.ts`, not
  `tests/unit/series-rendering.test.ts`.
- **Historical decisions must use stable evidence.** Never describe an older behavior change as
  being in “current HEAD”; HEAD changes after every commit. Cite the durable commit hash, source,
  or test that establishes the claim.

Required corrections for existing generated pages:

- In `openwiki/architecture/overview.md`, keep `layouts/HuxListLayout.tsx` and
  `layouts/PostLayout.tsx` as two separate bullet items under the Hux layout-components
  overview. Each layout owns a distinct surface and contract; never merge both descriptions
  into one bullet or paragraph.
- In `openwiki/operations/runbook.md`, the local refresh instruction must use the exact command
  `openwiki code --update --print` after source changes are committed. Replace any existing
  `openwiki --update` wording; do not leave both forms.
- In `openwiki/workflows/content-and-publishing.md`, the reading-width history must not say
  “current HEAD restored reading widths.” Attribute the restoration to stable commit `cae7df1`
  and the article-width browser tests instead.
- When documenting Series post-hero typography, distinguish the base/mobile rule (16px) from
  the `min-width: 768px` desktop rule (20px). Both use the same italic style, weight, and line
  height as Posted/Updated metadata. Do not describe “base” and “mobile” as separate breakpoints,
  and cite viewport coverage only when the Series browser test measures both 375px and 1200px.
  The hero sentence's own link is part of that shared treatment: its color and weight match
  Posted/Updated and only an underline marks it as a link. Do not describe the hero Series
  metadata as translucent, accent-colored, or bold — that was the earlier treatment, and the
  article-body `Series:` link (which does keep its accent color and bold weight) is a separate
  rule set that this alignment deliberately leaves untouched.

- **Keep these page paths stable.** `AGENTS.md` links directly to `openwiki/quickstart.md`, `openwiki/architecture/overview.md`, and `openwiki/operations/runbook.md`, and relies on them covering the build/command sequence, the Chiron font pipeline and its required CLIs, the article width breakpoints, and the Mermaid troubleshooting checklist. Do not rename, merge, or drop these pages, and do not move that material elsewhere — the rules file deliberately delegates it here instead of duplicating it.

Chiron site font — facts that must not be misstated:

- **`font-data/chiron/assignment-epoch.txt` is an authoritative committed input**, alongside `core-codepoints.txt`, `source.json`, and `supplemental-assignments.json`. Any enumeration of the coordinated commit set must include it: `check-site-font.mjs` hard-fails when it is missing, cross-checks it against `manifest.policy.assignmentEpoch`, and the CI font gate reads a base copy from `origin/main`.
- **The CI font gate fetches three base artifacts**, not two: assignments, core, and epoch (`--base-assignments`, `--base-core`, `--base-epoch`).
- **The epoch gate means assignment history is not unconditionally protected.** `validateCoreHistory` always runs when a base core is supplied, but `validateAssignmentHistory` runs only while the committed epoch equals the base epoch. Advancing the epoch deliberately skips it and reports a warning. Do not describe the gate as preventing all silent reassignment.
- **`--rebalance` reassigns every non-core code point**, and artifact filenames are content hashes, so all five supplemental URLs change and every returning reader re-pays the full supplemental cost. Do not describe the cache impact as limited to "affected" buckets.
- **A rebalance that introduces new fixed-UI seed characters must also pass `--rebuild-core`**, because `validateFixedSeedCore` requires every seed character to be in core.
- **The static font corpus is not Markdown-only.** `collectSiteFontCorpus` seeds printable ASCII, `SHARED_UI_TEXT`, the dictionaries, and `siteMetadata` in addition to article Markdown. What the production Playwright measurement catches is glyphs missing from that hand-maintained seed list, not the absence of any seeding.
- **KaTeX output characters are not part of the font budget.** `.katex-html` and the MathML copy both set their own `font-family` (`KaTeX_Main` / `math`), so Chiron is not in their chain and those characters never trigger a Chiron subset download. Do not describe them as needing to be seeded, and do not treat presence in the DOM as evidence that a character costs a font request.

Known issues to keep tracked in the backlog:

- **Mermaid image dimensions — fixed 2026-08-01.** The emitted `<img>` now carries `width`/`height` read from the committed SVG root and rounded to integers, so a box is reserved before the SVG arrives. **There is still no manifest in the Mermaid pipeline** — do not propose persisting dimensions into one; the root element already declares them. The remaining gap is narrower: both theme variants carry `loading="lazy"`, including the `display:none` one, so switching themes on a slow connection can briefly leave a correctly-sized but empty box.
- **Mermaid render is fail-loud.** A single syntax error aborts the entire `yarn mermaid:render` run. Nothing is written until every diagram renders successfully, so a failed run never corrupts the existing committed cache.

Mermaid facts that must not be misstated:

- **A cache miss and an unusable cached file are different failure modes.** `ENOENT` still degrades gracefully to a code block, because `runCheck` reports missing files. A file that exists whose root has no usable `width`/`height` **fails loudly** at both ends — `renderVariant` refuses to write it and `rehype-mermaid` throws — because `runCheck` compares filenames only and would never report that state. Do not describe the invalid case as degrading gracefully.
- **Producer and consumer deliberately share `parseSvgRootDimensions`.** Two parsers would accept two different sets, leaving a gap where render-time validation passes but the consumer still fails. Do not describe the render-time check as an independent second opinion.
- **Static gantt diagrams must declare `todayMarker off`**, enforced across all of `data/blog` by `tests/unit/mermaid-gantt-contract.test.ts`. A build-time-rendered gantt otherwise freezes "today" at render time.
- **The `CACHE_VERSION` bump rule has an exception that must be stated wherever the rule is stated.** The trigger is a change that alters _rendered output_ — Mermaid version, theme variables, `normalizeSvg`. Adding a validation-only gate to the renderer that writes no different bytes does **not** require a bump, and bumping anyway would force all twenty artifacts to be regenerated on a different machine or date, manufacturing exactly the spurious diff the rule exists to prevent. Do not summarise the trigger as "rendering behavior" without carrying this exception.
