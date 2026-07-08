'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from '@/components/Link'

type ArchivePost = {
  path: string
  title: string
  subtitle?: string
  date: string
  tags?: string[]
}

type ArchiveFilterProps = {
  posts: ArchivePost[]
  tags: { name: string; count: number }[]
}

function postYear(post: ArchivePost) {
  return new Date(post.date).getUTCFullYear().toString()
}

export default function ArchiveFilter({ posts, tags }: ArchiveFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTag = searchParams.get('tag') || ''

  const visiblePosts = useMemo(() => {
    if (!activeTag) return posts
    return posts.filter((post) => post.tags?.includes(activeTag))
  }, [activeTag, posts])

  const groupedPosts = useMemo(() => {
    return visiblePosts.reduce<Record<string, ArchivePost[]>>((groups, post) => {
      const year = postYear(post)
      groups[year] ||= []
      groups[year].push(post)
      return groups
    }, {})
  }, [visiblePosts])

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

  return (
    <div className="archive-wrap">
      <div id="tag_cloud" className="tags tags-sup">
        <button
          className={`tag tag-button--all ${activeTag ? '' : 'focus'}`}
          type="button"
          onClick={() => selectTag('')}
        >
          Show All <sup>{posts.length}</sup>
        </button>
        {tags.map((tag) => (
          <button
            className={`tag tag-button ${activeTag === tag.name ? 'focus' : ''}`}
            key={tag.name}
            type="button"
            title={tag.name}
            onClick={() => selectTag(tag.name)}
          >
            {tag.name} <sup>{tag.count}</sup>
          </button>
        ))}
      </div>

      <div className="mini-post-list">
        {!visiblePosts.length && <p className="archive-empty">No posts found.</p>}
        {Object.keys(groupedPosts)
          .sort((a, b) => Number(b) - Number(a))
          .map((year) => (
            <section key={year}>
              <span className="listing-seperator">
                <span className="tag-text">{year}</span>
              </span>
              {groupedPosts[year].map((post) => (
                <div className="post-preview item" key={post.path}>
                  <Link href={`/${post.path}`}>
                    <h2 className="post-title">{post.title}</h2>
                    {post.subtitle && <h3 className="post-subtitle">{post.subtitle}</h3>}
                  </Link>
                  <hr />
                </div>
              ))}
            </section>
          ))}
      </div>
    </div>
  )
}
