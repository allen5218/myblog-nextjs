import { slug } from 'github-slugger'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import HuxListLayout from '@/layouts/HuxListLayout'
import { allBlogs } from 'contentlayer/generated'
import tagData from 'app/tag-data.json'
import { genPageMetadata } from 'app/seo'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { POSTS_PER_PAGE, tagPageHref, totalPagesFor } from '@/lib/pagination'

export async function generateMetadata(props: {
  params: Promise<{ tag: string; page: string }>
}): Promise<Metadata> {
  const params = await props.params
  const tag = decodeURI(params.tag)
  return genPageMetadata({
    title: `${tag} - Page ${params.page}`,
    // 分頁的標籤頁同樣不索引,理由同 /tags/[tag]。
    robots: { index: false, follow: true },
  })
}

export const generateStaticParams = async () => {
  const tagCounts = tagData as Record<string, number>
  return Object.keys(tagCounts).flatMap((tag) => {
    const totalPages = totalPagesFor(tagCounts[tag])

    // 從第 2 頁開始:第 1 頁是 /tags/[tag]/ 本身,不再生一個 /page/1/ 分身。
    return Array.from({ length: totalPages - 1 }, (_, index) => ({
      tag: encodeURI(tag),
      page: (index + 2).toString(),
    }))
  })
}

export default async function TagPage(props: { params: Promise<{ tag: string; page: string }> }) {
  const params = await props.params
  const tag = decodeURI(params.tag)
  const title = tag[0].toUpperCase() + tag.split(' ').join('-').slice(1)
  const pageNumber = parseInt(params.page)
  const filteredPosts = allCoreContent(
    sortPosts(
      allBlogs.filter(
        (post) => post.listed !== false && post.tags && post.tags.map((t) => slug(t)).includes(tag)
      )
    )
  )
  const totalPages = totalPagesFor(filteredPosts.length)

  // 第 1 頁不是合法網址(它是 /tags/[tag]/,由 next.config 轉址過去),
  // 超出總頁數或非數字同樣 404。
  if (pageNumber <= 1 || pageNumber > totalPages || isNaN(pageNumber)) {
    return notFound()
  }
  const displayPosts = filteredPosts.slice(
    POSTS_PER_PAGE * (pageNumber - 1),
    POSTS_PER_PAGE * pageNumber
  )

  return (
    <HuxListLayout
      posts={filteredPosts}
      displayPosts={displayPosts}
      pagination={{ currentPage: pageNumber, totalPages }}
      pageHref={(page) => tagPageHref(params.tag, page)}
      title={title}
    />
  )
}
