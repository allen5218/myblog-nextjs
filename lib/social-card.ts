export const SOCIAL_CARD_FALLBACK = 'linear-gradient(135deg, #111827 0%, #164e63 55%, #0891b2 100%)'

export type SocialCardBackground =
  | { kind: 'image'; value: string }
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

export function postSocialImagePath(legacyPath: string) {
  return `/${legacyPath.replace(/^\/+|\/+$/g, '')}/opengraph-image`
}
