import { MetadataRoute } from 'next'
import { allBlogs } from 'contentlayer/generated'
import siteMetadata from '@/data/siteMetadata'
import { localizedUrl } from '@/lib/i18n'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteMetadata.siteUrl
  const pageUrl = (route = '') => `${siteUrl}/${route}`.replace(/\/?$/, '/')

  const blogRoutes = allBlogs
    .filter((post) => !post.draft && post.listed !== false)
    .map((post) => ({
      url: pageUrl(post.legacyPath),
      lastModified: post.lastmod || post.date,
    }))

  const routes = ['', 'blog', 'tags'].map((route) => ({
    url: pageUrl(route),
    lastModified: new Date().toISOString().split('T')[0],
  }))

  const aboutAlternates = {
    languages: {
      'zh-TW': localizedUrl('zh-TW', '/about/'),
      en: localizedUrl('en', '/about/'),
      'x-default': localizedUrl('zh-TW', '/about/'),
    },
  }

  const localizedRoutes = [
    {
      url: localizedUrl('zh-TW', '/about/'),
      lastModified: new Date().toISOString().split('T')[0],
      alternates: aboutAlternates,
    },
    {
      url: localizedUrl('en', '/about/'),
      lastModified: new Date().toISOString().split('T')[0],
      alternates: aboutAlternates,
    },
  ]

  return [...routes, ...localizedRoutes, ...blogRoutes]
}
