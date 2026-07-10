import { sortPosts, allCoreContent } from 'pliny/utils/contentlayer'
import { allBlogs } from 'contentlayer/generated'
import HuxListLayout from '@/layouts/HuxListLayout'
import { POSTS_PER_PAGE, blogPageHref, totalPagesFor } from '@/lib/pagination'

// 首頁「就是」分頁列表的第 1 頁,和 jekyll-paginate 的 index.html 一樣。
// 不要另外做一個只列前 N 篇的首頁版型 —— 那會讓 / 與第 1 頁悄悄分家。
export default async function Page() {
  const posts = allCoreContent(sortPosts(allBlogs.filter((post) => post.listed !== false)))

  return (
    <HuxListLayout
      posts={posts}
      displayPosts={posts.slice(0, POSTS_PER_PAGE)}
      pagination={{ currentPage: 1, totalPages: totalPagesFor(posts.length) }}
      pageHref={blogPageHref}
    />
  )
}
