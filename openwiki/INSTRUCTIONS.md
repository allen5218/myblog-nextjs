A code wiki for this local repository. Prioritize a concise quickstart, architecture overview, source map, key workflows, domain concepts, operations/runbook notes, testing guidance, and integration points. Inspect git history to understand reasoning behind code changes and the progression of the repository. Keep pages grounded in the repository structure and recent code changes. Prefer practical navigation for engineers over generic summaries.

Hard constraints:

- **Document only durable repository properties.** Never record transient run-time or working-tree state: which files happen to be modified, staged, or untracked during a documentation run, the status of the OpenWiki setup itself, or anything that becomes false once the run is committed. Such state is not a repository invariant and must never appear in an invariants list.
- **Do not restate `AGENTS.md` at length.** It is the human-maintained source of truth for rules, environment pitfalls, and the reasoning behind them. Link to it, and focus this wiki on what is derived from source code: structure, contracts, test coverage, and change impact.
- **Prefer facts verifiable from code, config, and tests** over prose summaries. Cite concrete file paths so a reader can check every claim.
- **Use the repository's exact OpenWiki refresh procedure.** After source changes are committed
  and the worktree is clean, the local refresh command is
  `openwiki code --update --print`; generated updates are reviewed and included in the normal PR.
  Do not shorten this to `openwiki --update`, and do not claim that the ignored generated
  `.github/workflows/openwiki-update.yml` is the repository's supported refresh path.
- **Map behavior to the tests that actually cover it.** Do not attribute mobile hamburger
  navigation to the Series spec: `tests/playwright/series.spec.ts` covers desktop Series order,
  while `tests/playwright/kbar-touch.spec.ts` covers the mobile hamburger order. When one
  behavior spans specs, cite every relevant spec rather than collapsing the mapping.
- **Historical decisions must use stable evidence.** Never describe an older behavior change as
  being in “current HEAD”; HEAD changes after every commit. Cite the durable commit hash, source,
  or test that establishes the claim.

Required corrections for existing generated pages:

- In `openwiki/operations/runbook.md`, the local refresh instruction must use the exact command
  `openwiki code --update --print` after source changes are committed. Replace any existing
  `openwiki --update` wording; do not leave both forms.
- In `openwiki/workflows/content-and-publishing.md`, the reading-width history must not say
  “current HEAD restored reading widths.” Attribute the restoration to stable commit `cae7df1`
  and the article-width browser tests instead.

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

- **Mermaid image dimensions.** `normalizeSvg` already writes `width`/`height` onto the `<svg>` root from the viewBox, so the intrinsic size is present in every committed SVG and **there is no manifest in the Mermaid pipeline** — do not propose persisting dimensions into one. The remaining gap is in `lib/rehype-mermaid.mjs`: the emitted `<img>` carries only `className`, `src`, `alt`, and `loading`, and `css/tailwind.css` sets `max-width:none; height:auto` with no width, so no box is reserved before the SVG loads (CLS). Both theme variants also carry `loading="lazy"`, including the `display:none` one, which can briefly blank the diagram when switching themes on a slow connection.
- **Mermaid render is fail-loud.** A single syntax error aborts the entire `yarn mermaid:render` run. Nothing is written until every diagram renders successfully, so a failed run never corrupts the existing committed cache.
- **Gantt `today` marker makes render output date-dependent.** Re-running `yarn mermaid:render` rewrites the gantt SVG's `today` line x-coordinate even when the diagram source is unchanged, producing churn in `public/mermaid/`. The marker sits far outside the viewBox and is not visible.
