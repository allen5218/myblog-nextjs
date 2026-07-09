import { slug } from 'github-slugger'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import HuxListLayout from '@/layouts/HuxListLayout'
import { allBlogs } from 'contentlayer/generated'
import tagData from 'app/tag-data.json'
import { genPageMetadata } from 'app/seo'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

const POSTS_PER_PAGE = 5

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
    const postCount = tagCounts[tag]
    const totalPages = Math.max(1, Math.ceil(postCount / POSTS_PER_PAGE))
    return Array.from({ length: totalPages }, (_, i) => ({
      tag: encodeURI(tag),
      page: (i + 1).toString(),
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
  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE)

  // Return 404 for invalid page numbers or empty pages
  if (pageNumber <= 0 || pageNumber > totalPages || isNaN(pageNumber)) {
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
      basePath={`tags/${params.tag}`}
      title={title}
    />
  )
}
