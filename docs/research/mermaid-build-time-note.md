# Mermaid Build-Time Rendering Note

Build-time Mermaid rendering is feasible for this stack, but it is not safe to wire in this slice without adding a new rendering dependency.

The practical option is `@mermaid-js/mermaid-cli`, which renders Mermaid definitions to SVG and can transform Markdown fences. Its documented renderer depends on a browser/Puppeteer path, and the package notes that its Node API is not covered by semver. The current project does not have Mermaid, Mermaid CLI, Puppeteer, or a browser renderer installed, and the sandbox could not fetch new dependencies.

Decision for this slice: keep Mermaid fences as code blocks and do not add client-side Mermaid initialization. This avoids reintroducing runtime Mermaid JavaScript while leaving a clear path to add build-time SVG once the dependency and browser-rendering environment are approved.
