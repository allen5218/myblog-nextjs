import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import { formatHuxDate } from '../../lib/hux-date'

type HuxPostCardProps = {
  post: {
    path: string
    title: string
    subtitle?: string
    summary?: string
    preview?: string
    date: string
    tags?: string[]
    author?: string
  }
}

export default function HuxPostCard({ post }: HuxPostCardProps) {
  const preview = post.preview || (post.summary !== post.subtitle ? post.summary : undefined)

  return (
    <div className="post-preview">
      <Link href={`/${post.path}/`}>
        <h2 className="post-title">{post.title}</h2>
        {post.subtitle && <h3 className="post-subtitle">{post.subtitle}</h3>}
        {preview && <div className="post-content-preview">{preview}</div>}
      </Link>
      <p className="post-meta">
        Posted by {post.author || siteMetadata.author} on {formatHuxDate(post.date)}
      </p>
      {!!post.tags?.length && (
        <div className="tags">
          {post.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
