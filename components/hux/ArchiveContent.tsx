import Link from '@/components/Link'

export type ArchivePost = {
  path: string
  title: string
  subtitle?: string
  date: string
  tags?: string[]
}

export type ArchiveTag = {
  name: string
  count: number
}

type ArchiveContentProps = {
  activeTag?: string
  onSelectTag?: (tag: string) => void
  posts: ArchivePost[]
  tags: ArchiveTag[]
}

function postYear(post: ArchivePost) {
  return new Date(post.date).getUTCFullYear().toString()
}

function archiveHref(tag: string) {
  return tag ? `/archive/?tag=${encodeURIComponent(tag)}` : '/archive/'
}

export default function ArchiveContent({
  activeTag = '',
  onSelectTag,
  posts,
  tags,
}: ArchiveContentProps) {
  const visiblePosts = activeTag ? posts.filter((post) => post.tags?.includes(activeTag)) : posts
  const groupedPosts = visiblePosts.reduce<Record<string, ArchivePost[]>>((groups, post) => {
    const year = postYear(post)
    groups[year] ||= []
    groups[year].push(post)
    return groups
  }, {})

  const renderTag = (tag: ArchiveTag | null) => {
    const tagName = tag?.name || ''
    const label = tag ? (
      <>
        {tag.name} <sup>{tag.count}</sup>
      </>
    ) : (
      <>
        Show All <sup>{posts.length}</sup>
      </>
    )
    const className = `tag ${tag ? 'tag-button' : 'tag-button--all'} ${
      activeTag === tagName ? 'focus' : ''
    }`

    if (onSelectTag) {
      return (
        <button
          className={className}
          key={tagName || 'all'}
          type="button"
          title={tagName || 'Show All'}
          onClick={() => onSelectTag(tagName)}
        >
          {label}
        </button>
      )
    }

    return (
      <Link
        className={className}
        href={archiveHref(tagName)}
        key={tagName || 'all'}
        title={tagName || 'Show All'}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="archive-wrap">
      <div id="tag_cloud" className="tags tags-sup">
        {renderTag(null)}
        {tags.map((tag) => renderTag(tag))}
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
                  <Link href={`/${post.path}/`}>
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
