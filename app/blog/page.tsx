import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import { allBlogs } from 'contentlayer/generated'
import { genPageMetadata } from 'app/seo'
import HuxListLayout from '@/layouts/HuxListLayout'

const POSTS_PER_PAGE = 5

export const metadata = genPageMetadata({ title: 'Blog' })

export default async function BlogPage() {
  const posts = allCoreContent(sortPosts(allBlogs.filter((post) => post.listed !== false)))
  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE)
  const displayPosts = posts.slice(0, POSTS_PER_PAGE)

  return (
    <HuxListLayout
      posts={posts}
      displayPosts={displayPosts}
      pagination={{ currentPage: 1, totalPages }}
    />
  )
}
