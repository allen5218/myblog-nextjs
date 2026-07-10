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

  // 首頁、封存與標籤索引的內容完全由文章推導,所以它們的 lastmod 就是最新文章的日期。
  // 用 new Date() 等於每次部署都告訴爬蟲「這幾頁今天變了」,是在喊狼來了。
  const latestPostDate = blogRoutes
    .map((route) => route.lastModified)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]

  // 不收 /blog/(已永久導向 /)與 /pageN/(從首頁 pager 直接可達,且無獨立內容價值);
  // 單一標籤頁刻意 noindex,見 app/tags/[tag]/page.tsx。
  const routes = ['', 'archive', 'tags'].map((route) => ({
    url: pageUrl(route),
    lastModified: latestPostDate,
  }))

  const aboutAlternates = {
    languages: {
      'zh-TW': localizedUrl('zh-TW', '/about/'),
      en: localizedUrl('en', '/about/'),
      'x-default': localizedUrl('zh-TW', '/about/'),
    },
  }

  // about 的內容不隨文章變動,也沒有可靠的修改時間,寧可省略 lastmod 也不要編一個。
  const localizedRoutes = [
    {
      url: localizedUrl('zh-TW', '/about/'),
      alternates: aboutAlternates,
    },
    {
      url: localizedUrl('en', '/about/'),
      alternates: aboutAlternates,
    },
  ]

  return [...routes, ...localizedRoutes, ...blogRoutes]
}
