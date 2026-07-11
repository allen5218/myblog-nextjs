import { Metadata } from 'next'
import siteMetadata from '@/data/siteMetadata'
import { pageSocialImagePath } from '@/lib/social-card'

interface PageSEOProps {
  title: string
  description?: string
  image?: string
  locale?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export function genPageMetadata({
  title,
  description,
  image,
  locale = siteMetadata.locale,
  ...rest
}: PageSEOProps): Metadata {
  const pageDescription = description || siteMetadata.description
  const socialImage = image || pageSocialImagePath(title, pageDescription)

  return {
    title,
    description: pageDescription,
    openGraph: {
      title: `${title} | ${siteMetadata.title}`,
      description: pageDescription,
      url: './',
      siteName: siteMetadata.title,
      images: [socialImage],
      locale,
      type: 'website',
    },
    twitter: {
      title: `${title} | ${siteMetadata.title}`,
      card: 'summary_large_image',
      images: [socialImage],
    },
    ...rest,
  }
}
