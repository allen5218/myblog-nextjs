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
  // 第 n 頁的網址。用函式而非字串前綴,因為第 1 頁不見得是 `${prefix}/page/1`
  // —— 部落格的第 1 頁是 `/`,標籤的第 1 頁是 `/tags/x/`。
  pageHref: (page: number) => string
  // 標籤頁用來標示目前篩選的標籤名(顯示在 masthead 副標),blog 頁不傳。
  title?: string
}

// Hux 風格的分頁列表:masthead + .post-preview 列表 + 側欄 + 雙向 pager(← Newer / Older →),
// 對齊 huangxuan.me 的 /pageN。首頁(第 1 頁)、/pageN/ 與 /tags/[tag] 都用它。
export default function HuxListLayout({
  posts,
  displayPosts,
  pagination,
  pageHref,
  title,
}: HuxListLayoutProps) {
  const { currentPage, totalPages } = pagination

  // Newer = 較新的一頁(往上);第 1 頁無 Newer。Older = 較舊的一頁;最後一頁無 Older。
  const newerHref = currentPage > 1 ? pageHref(currentPage - 1) : undefined
  const olderHref = currentPage < totalPages ? pageHref(currentPage + 1) : undefined
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
            prev={newerHref ? { href: newerHref, title: 'Newer Posts' } : undefined}
            next={olderHref ? { href: olderHref, title: 'Older Posts' } : undefined}
          />
        </div>
        <HuxSidebar posts={posts} />
      </div>
    </>
  )
}
