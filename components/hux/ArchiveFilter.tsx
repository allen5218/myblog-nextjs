'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ArchiveContent, { ArchivePost, ArchiveTag } from './ArchiveContent'

type ArchiveFilterProps = {
  posts: ArchivePost[]
  tags: ArchiveTag[]
}

export default function ArchiveFilter({ posts, tags }: ArchiveFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTag = searchParams.get('tag') || ''

  function selectTag(tag: string) {
    const params = new URLSearchParams(searchParams)
    if (tag) {
      params.set('tag', tag)
    } else {
      params.delete('tag')
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return <ArchiveContent activeTag={activeTag} onSelectTag={selectTag} posts={posts} tags={tags} />
}
