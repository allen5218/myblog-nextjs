A code wiki for this local repository. Prioritize a concise quickstart, architecture overview, source map, key workflows, domain concepts, operations/runbook notes, testing guidance, and integration points. Inspect git history to understand reasoning behind code changes and the progression of the repository. Keep pages grounded in the repository structure and recent code changes. Prefer practical navigation for engineers over generic summaries.

Hard constraints:

- **Document only durable repository properties.** Never record transient run-time or working-tree state: which files happen to be modified, staged, or untracked during a documentation run, the status of the OpenWiki setup itself, or anything that becomes false once the run is committed. Such state is not a repository invariant and must never appear in an invariants list.
- **Do not restate `AGENTS.md` at length.** It is the human-maintained source of truth for rules, environment pitfalls, and the reasoning behind them. Link to it, and focus this wiki on what is derived from source code: structure, contracts, test coverage, and change impact.
- **Prefer facts verifiable from code, config, and tests** over prose summaries. Cite concrete file paths so a reader can check every claim.

- **Keep these page paths stable.** `AGENTS.md` links directly to `openwiki/quickstart.md`, `openwiki/architecture/overview.md`, and `openwiki/operations/runbook.md`, and relies on them covering the build/command sequence, the Chiron font pipeline and its required CLIs, the article width breakpoints, and the Mermaid troubleshooting checklist. Do not rename, merge, or drop these pages, and do not move that material elsewhere — the rules file deliberately delegates it here instead of duplicating it.

Known issues to keep tracked in the backlog:

- **Mermaid image dimensions.** The rendered Mermaid `<img>` elements are emitted without `width`/`height`, so diagrams cause layout shift (CLS) while loading, and the non-active theme variant carries `loading="lazy"`, which can briefly blank the diagram when switching themes on a slow connection. The renderer already computes viewBox dimensions during `yarn mermaid:render`; the fix is to persist them into the manifest and have the rehype plugin emit explicit dimensions and drop `lazy` on the hidden variant.
- **Mermaid render is fail-loud.** A single syntax error aborts the entire `yarn mermaid:render` run. Nothing is written until every diagram renders successfully, so a failed run never corrupts the existing committed cache.
