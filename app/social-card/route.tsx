import { ImageResponse } from 'next/og'
import SocialCard from '@/components/social/SocialCard'
import siteMetadata from '@/data/siteMetadata'
import {
  normalizeSocialCardBackgroundForImageResponse,
  SOCIAL_CARD_FALLBACK,
} from '@/lib/social-card'

export const runtime = 'nodejs'

const size = { width: 1200, height: 630 }

function safeText(value: string | null, fallback: string, maxLength: number) {
  return (value?.trim() || fallback).slice(0, maxLength)
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const title = safeText(searchParams.get('title'), siteMetadata.title, 100)
  const summary = safeText(searchParams.get('summary'), siteMetadata.description, 220)
  const background = await normalizeSocialCardBackgroundForImageResponse({
    kind: 'fallback',
    value: SOCIAL_CARD_FALLBACK,
  })

  return new ImageResponse(
    <SocialCard
      siteName={siteMetadata.title}
      title={title}
      summary={summary}
      background={background}
    />,
    {
      ...size,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  )
}
