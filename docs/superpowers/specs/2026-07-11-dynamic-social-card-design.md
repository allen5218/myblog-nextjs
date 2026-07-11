# Dynamic Social Card Design

## Goal

Generate a dedicated 1200×630 social sharing image for the home page and every published blog post. Discord, Open Graph consumers, and Twitter/X should receive a large card containing readable title and summary text over a background derived from the page or post.

## Scope

- Add one generated social image for the home page.
- Add one generated social image for each legacy dated post route.
- Point both Open Graph and Twitter metadata at the generated images.
- Preserve the current canonical URLs, page titles, descriptions, and other metadata.
- Do not change the visible page hero or article content.

## Rendering Rules

### Home page

The home image contains:

- `siteMetadata.title` as the primary title.
- `siteMetadata.description` as the summary.
- A stable branded fallback background.

### Blog posts

The post image contains:

- The post title.
- The post subtitle when present; otherwise the generated post preview. Long text is visually constrained so it cannot overflow the card.
- The site name as a small brand label.

The background is chosen in this priority order:

1. A non-empty `headerImg`, resolved to an absolute URL when necessary.
2. A supported `headerBgCss` gradient after whitespace and trailing semicolons are removed.
3. The branded fallback background.

When an image is used, a dark overlay keeps the foreground text legible. Gradient backgrounds retain their configured colors and receive only the contrast treatment required for readable text.

## CSS Compatibility and Fallbacks

`ImageResponse` supports only a subset of browser CSS. The renderer will accept the gradient form currently used by this repository: `linear-gradient(...)`. An empty, malformed, or unsupported `headerBgCss` value falls back to the branded background instead of causing image generation to fail.

Remote and local `headerImg` values are supported. If an image cannot be fetched at request time, social image generation must still return a valid card using the fallback background.

## Architecture

Use Next.js dynamic Open Graph image routes backed by `ImageResponse`:

- A root `opengraph-image` route renders the home card.
- A post-level `opengraph-image` route uses the dated route parameters to locate the same Contentlayer post used by the page.
- Shared rendering and background-selection logic lives in a focused social-card module so the home and post routes use one visual system.
- Existing metadata functions reference the generated route URLs for both `openGraph.images` and `twitter.images`.

The generated routes declare 1200×630 dimensions and PNG output. Their URLs remain stable for Discord caching while their rendered content follows the current site metadata and post frontmatter after deployment.

## Error Handling

- Unknown post parameters return the framework's not-found behavior rather than another post's card.
- Missing subtitle uses the post preview.
- Missing image and gradient use the branded fallback.
- Unsupported CSS never passes unchecked into the image renderer.
- Image URLs are normalized through `siteMetadata.siteUrl` so Discord receives publicly reachable absolute URLs.

## Verification

Automated tests cover:

- Background priority: `headerImg` over `headerBgCss` over fallback.
- Removal of trailing semicolons from gradients.
- Rejection of unsupported CSS values.
- Summary selection: subtitle before preview.
- Absolute URL resolution for local image paths.

Build/type verification confirms the new routes compile with the existing Next.js and Contentlayer setup. Runtime verification renders at least:

- The home social image.
- `/2026/04/26/learning-how-to-learn/opengraph-image`, proving its `headerBgCss` gradient appears.
- A post with `headerImg`, proving the image background and overlay appear.

The final HTML metadata is inspected to confirm that both Open Graph and Twitter image tags point to the generated large-card images.

## Acceptance Criteria

- Sharing the home page produces a large image card containing the site title and description.
- Sharing any published post produces a large image card containing that post's title and summary.
- `2026-04-26-learning-how-to-learn.md` renders its configured purple-gray linear gradient as the card background.
- Posts with `headerImg` render that image as their card background.
- Missing or invalid visual frontmatter cannot break the social image endpoint.
- Existing visible pages and non-image SEO metadata remain unchanged.
