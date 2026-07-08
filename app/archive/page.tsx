import { Suspense } from 'react'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import { allBlogs } from 'contentlayer/generated'
import { genPageMetadata } from 'app/seo'
import HuxHero from '@/components/hux/HuxHero'
import ArchiveFilter from '@/components/hux/ArchiveFilter'
import ArchiveContent from '@/components/hux/ArchiveContent'

export const metadata = genPageMetadata({ title: 'Archive' })

export default async function ArchivePage() {
  const posts = allCoreContent(sortPosts(allBlogs.filter((post) => post.listed !== false)))
  const tagCounts = posts.reduce<Record<string, number>>((counts, post) => {
    post.tags?.forEach((tag) => {
      counts[tag] = (counts[tag] || 0) + 1
    })
    return counts
  }, {})
  const tags = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return (
    <>
      <HuxHero
        variant="archive"
        title="Archive"
        subtitle="If you don't know, the thing to do is not to get scared, but to learn."
        headerImg="/img/bg-little-universe.jpg"
      />
      <Suspense fallback={<ArchiveContent posts={posts} tags={tags} />}>
        <ArchiveFilter posts={posts} tags={tags} />
      </Suspense>
    </>
  )
}
