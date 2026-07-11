import { ImageResponse } from 'next/og'
import SocialCard from '@/components/social/SocialCard'
import siteMetadata from '@/data/siteMetadata'
import {
  normalizeSocialCardBackgroundForImageResponse,
  SOCIAL_CARD_FALLBACK,
} from '@/lib/social-card'

export const alt = `${siteMetadata.title} social card`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const background = await normalizeSocialCardBackgroundForImageResponse({
    kind: 'fallback',
    value: SOCIAL_CARD_FALLBACK,
  })

  return new ImageResponse(
    <SocialCard
      siteName={siteMetadata.title}
      title={siteMetadata.title}
      summary={siteMetadata.description}
      background={background}
    />,
    size
  )
}
