import { compressUnicodeRanges } from './site-font-plan.mjs'

export function renderSiteFontCss(artifacts) {
  const faces = artifacts
    .map(
      (artifact) => `@font-face {
  font-family: 'Chiron Sung HK';
  src: url('/static/fonts/chiron/${artifact.file}') format('woff2');
  font-style: normal;
  font-weight: 200 900;
  font-display: swap;
  unicode-range: ${compressUnicodeRanges(artifact.codePoints.map((value) => Number.parseInt(value, 16)))};
}`
    )
    .join('\n\n')
  return `:root { --font-chiron-sung-hk: 'Chiron Sung HK'; }\n\n${faces}\n`
}
