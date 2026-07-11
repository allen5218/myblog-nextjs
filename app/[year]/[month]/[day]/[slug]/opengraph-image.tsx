import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { allBlogs } from 'contentlayer/generated'
import SocialCard from '@/components/social/SocialCard'
import siteMetadata from '@/data/siteMetadata'
import {
  normalizeSocialCardBackgroundForImageResponse,
  selectSocialCardBackground,
  selectSocialCardSummary,
} from '@/lib/social-card'

type LegacyParams = {
  year: string
  month: string
  day: string
  slug: string
}

export const alt = `${siteMetadata.title} post social card`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function routePath(params: LegacyParams) {
  return `${params.year}/${params.month}/${params.day}/${params.slug}`
}

export const generateStaticParams = async () => {
  return allBlogs.map((post) => {
    const [year, month, day, slug] = post.legacyPath.split('/')
    return { year, month, day, slug }
  })
}

export default async function Image({ params }: { params: Promise<LegacyParams> }) {
  const resolvedParams = await params
  const post = allBlogs.find((candidate) => candidate.legacyPath === routePath(resolvedParams))

  if (!post) {
    notFound()
  }

  const background = await normalizeSocialCardBackgroundForImageResponse(
    selectSocialCardBackground(
      { headerImg: post.headerImg, headerBgCss: post.headerBgCss },
      siteMetadata.siteUrl
    )
  )
  const summary = selectSocialCardSummary(post.subtitle, post.preview)

  return new ImageResponse(
    <SocialCard
      siteName={siteMetadata.title}
      title={post.title}
      summary={summary}
      background={background}
    />,
    size
  )
}
