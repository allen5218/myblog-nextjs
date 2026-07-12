import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import { allBlogs } from 'contentlayer/generated'
import { genPageMetadata } from 'app/seo'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import HuxListLayout from '@/layouts/HuxListLayout'
import { POSTS_PER_PAGE, blogPageHref, parseBlogPageSegment, totalPagesFor } from '@/lib/pagination'

// 分頁的第 2 頁起住在根層的 /page2/、/page3/…(對齊 jekyll-paginate 的預設 paginate_path)。
//
// 為什麼這個檔案在 [year] 底下而不是 [page]?App Router 不允許同一層出現兩個名字不同的
// dynamic segment,而根層已經被文章網址 /[year]/[month]/[day]/[slug] 佔用了 [year]。
// 新增 app/[page] 會讓 build 直接失敗。用 rewrites 把 /page2/ 改寫到別處也可以,但
// rewrites 在 EXPORT=1 靜態匯出模式下會整個消失(和 headers()、proxy 一樣)。
//
// 因此這裡共用 [year] 這個 slot:只接受 pageN,其餘(含真正的年份 /2025/)一律 404,
// 與加入本檔案之前的行為一致。
const listedPosts = () =>
  allCoreContent(sortPosts(allBlogs.filter((post) => post.listed !== false)))

export const generateStaticParams = async () => {
  const totalPages = totalPagesFor(listedPosts().length)

  // 從 2 開始:第 1 頁是 /,沒有 /page1/。
  return Array.from({ length: totalPages - 1 }, (_, index) => ({
    year: `page${index + 2}`,
  }))
}

export async function generateMetadata(props: {
  params: Promise<{ year: string }>
}): Promise<Metadata> {
  const { year } = await props.params
  const page = parseBlogPageSegment(year)

  return page ? genPageMetadata({ title: `Page ${page}` }) : {}
}

export default async function BlogPaginationPage(props: { params: Promise<{ year: string }> }) {
  const { year } = await props.params
  const page = parseBlogPageSegment(year)
  const posts = listedPosts()
  const totalPages = totalPagesFor(posts.length)

  if (!page || page > totalPages) {
    return notFound()
  }

  return (
    <HuxListLayout
      posts={posts}
      displayPosts={posts.slice(POSTS_PER_PAGE * (page - 1), POSTS_PER_PAGE * page)}
      pagination={{ currentPage: page, totalPages }}
      pageHref={blogPageHref}
    />
  )
}
