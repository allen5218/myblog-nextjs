import HuxListLayout from '@/layouts/HuxListLayout'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import { allBlogs } from 'contentlayer/generated'
import { genPageMetadata } from 'app/seo'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

const POSTS_PER_PAGE = 5

export async function generateMetadata(props: {
  params: Promise<{ page: string }>
}): Promise<Metadata> {
  const params = await props.params
  return genPageMetadata({ title: `Blog - Page ${params.page}` })
}

export const generateStaticParams = async () => {
  const totalPages = Math.ceil(
    allBlogs.filter((post) => post.listed !== false).length / POSTS_PER_PAGE
  )
  const paths = Array.from({ length: totalPages }, (_, i) => ({ page: (i + 1).toString() }))

  return paths
}

export default async function Page(props: { params: Promise<{ page: string }> }) {
  const params = await props.params
  const posts = allCoreContent(sortPosts(allBlogs.filter((post) => post.listed !== false)))
  const pageNumber = parseInt(params.page as string)
  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE)

  // Return 404 for invalid page numbers or empty pages
  if (pageNumber <= 0 || pageNumber > totalPages || isNaN(pageNumber)) {
    return notFound()
  }
  const displayPosts = posts.slice(POSTS_PER_PAGE * (pageNumber - 1), POSTS_PER_PAGE * pageNumber)

  return (
    <HuxListLayout
      posts={posts}
      displayPosts={displayPosts}
      pagination={{ currentPage: pageNumber, totalPages }}
    />
  )
}
