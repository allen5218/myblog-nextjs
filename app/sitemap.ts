import { MetadataRoute } from 'next'
import { allBlogs } from 'contentlayer/generated'
import siteMetadata from '@/data/siteMetadata'

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

  const routes = ['', 'blog', 'projects', 'tags'].map((route) => ({
    url: pageUrl(route),
    lastModified: new Date().toISOString().split('T')[0],
  }))

  return [...routes, ...blogRoutes]
}
