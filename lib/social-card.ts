import sharp from 'sharp'

export const SOCIAL_CARD_FALLBACK = 'linear-gradient(135deg, #111827 0%, #164e63 55%, #0891b2 100%)'

export type SocialCardBackground =
  | { kind: 'image'; value: string }
  | { kind: 'gradient-image'; value: string }
  | { kind: 'gradient'; value: string }
  | { kind: 'fallback'; value: typeof SOCIAL_CARD_FALLBACK }

type SocialCardBackgroundInput = {
  headerImg?: string
  headerBgCss?: string
}

export function selectSocialCardBackground(
  input: SocialCardBackgroundInput,
  siteUrl: string
): SocialCardBackground {
  const image = input.headerImg?.trim()
  if (image) {
    return { kind: 'image', value: new URL(image, `${siteUrl}/`).href }
  }

  const gradient = input.headerBgCss?.trim().replace(/;+\s*$/, '')
  if (gradient && /^linear-gradient\([^\r\n]+\)$/i.test(gradient)) {
    return { kind: 'gradient', value: gradient }
  }

  return { kind: 'fallback', value: SOCIAL_CARD_FALLBACK }
}

export function selectSocialCardSummary(subtitle?: string, preview?: string) {
  return subtitle?.trim() || preview?.trim() || ''
}

export async function normalizeSocialCardBackgroundForImageResponse(
  background: SocialCardBackground,
  fetcher: (url: string) => Promise<Response> = fetch
): Promise<SocialCardBackground> {
  if (background.kind === 'gradient' || background.kind === 'fallback') {
    return rasterizeGradient(background.value)
  }

  try {
    const response = await fetcher(background.value)
    if (!response.ok) {
      return rasterizeGradient(SOCIAL_CARD_FALLBACK)
    }

    const source = Buffer.from(await response.arrayBuffer())
    const png = await sharp(source).resize(1200, 630, { fit: 'cover' }).png().toBuffer()
    return { kind: 'image', value: `data:image/png;base64,${png.toString('base64')}` }
  } catch {
    return rasterizeGradient(SOCIAL_CARD_FALLBACK)
  }
}

async function rasterizeGradient(gradient: string): Promise<SocialCardBackground> {
  const svg = linearGradientSvg(gradient)
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return { kind: 'gradient-image', value: `data:image/png;base64,${png.toString('base64')}` }
}

function linearGradientSvg(gradient: string): string {
  const match = gradient.match(/^linear-gradient\(\s*(to right|135deg)\s*,\s*(.+)\)$/i)
  if (!match) {
    return linearGradientSvg(SOCIAL_CARD_FALLBACK)
  }

  const direction = match[1].toLowerCase()
  const stops = match[2].split(',').map((stop, index, allStops) => {
    const stopMatch = stop.trim().match(/^(#[\da-f]{3,8})(?:\s+(\d+(?:\.\d+)?%))?$/i)
    if (!stopMatch) return null
    const offset = stopMatch[2] || `${Math.round((index / (allStops.length - 1)) * 100)}%`
    return `<stop offset="${offset}" stop-color="${stopMatch[1]}"/>`
  })

  if (stops.some((stop) => !stop)) {
    return linearGradientSvg(SOCIAL_CARD_FALLBACK)
  }

  const coordinates =
    direction === 'to right' ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="1" y2="1"'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="background" ${coordinates}>${stops.join('')}</linearGradient></defs><rect width="1200" height="630" fill="url(#background)"/></svg>`
  return svg
}

export function postSocialImagePath(legacyPath: string) {
  return `/${legacyPath.replace(/^\/+|\/+$/g, '')}/opengraph-image`
}
