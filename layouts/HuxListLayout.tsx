import type { Blog } from 'contentlayer/generated'
import { CoreContent } from 'pliny/utils/contentlayer'
import siteMetadata from '@/data/siteMetadata'
import HuxHero from '@/components/hux/HuxHero'
import HuxPostCard from '@/components/hux/HuxPostCard'
import HuxPager from '@/components/hux/HuxPager'
import HuxSidebar from '@/components/hux/HuxSidebar'

interface HuxListLayoutProps {
  // 全部文章:供側欄計算 featured tags
  posts: CoreContent<Blog>[]
  // 本頁切片:實際列出的文章
  displayPosts: CoreContent<Blog>[]
  pagination: { currentPage: number; totalPages: number }
  // 分頁 URL 前綴:'blog'(預設)或 `tags/${tag}`,決定 pager 連到哪組路由。
  basePath?: string
  // 標籤頁用來標示目前篩選的標籤名(顯示在 masthead 副標),blog 頁不傳。
  title?: string
}

// Hux 風格的分頁列表(取代 starter 的 ListLayoutWithTags),與首頁 Main.tsx 同一套版型:
// masthead + .post-preview 列表 + 側欄 + 雙向 pager(← Newer / Older →),對齊 huangxuan.me 的 /pageN。
// /blog 與 /tags/[tag] 都用它,差別只在 basePath(pager 指向)與 title(標籤名)。
export default function HuxListLayout({
  posts,
  displayPosts,
  pagination,
  basePath = 'blog',
  title,
}: HuxListLayoutProps) {
  const { currentPage, totalPages } = pagination

  // Newer = 較新的一頁(往上);第 2 頁回到 basePath 首頁,第 3 頁以後回前一頁;第 1 頁無 Newer。
  const newerPath =
    currentPage === 2
      ? basePath
      : currentPage > 2
        ? `${basePath}/page/${currentPage - 1}`
        : undefined
  // Older = 較舊的一頁(往下);最後一頁無 Older。
  const olderPath = currentPage < totalPages ? `${basePath}/page/${currentPage + 1}` : undefined
  // 標籤頁在 masthead 副標標示目前標籤;blog 頁沿用站點描述。
  const heroSubtitle = title ? `標籤 · ${title}` : siteMetadata.description

  return (
    <>
      <HuxHero variant="home" title={siteMetadata.title} subtitle={heroSubtitle} />
      <div className="hux-home-layout">
        <div className="postlist-container">
          <div className="hux-post-list">
            {!displayPosts.length && 'No posts found.'}
            {displayPosts.map((post) => (
              <HuxPostCard key={post.path} post={post} />
            ))}
          </div>
          <HuxPager
            prev={newerPath ? { path: newerPath, title: 'Newer Posts' } : undefined}
            next={olderPath ? { path: olderPath, title: 'Older Posts' } : undefined}
          />
        </div>
        <HuxSidebar posts={posts} />
      </div>
    </>
  )
}
