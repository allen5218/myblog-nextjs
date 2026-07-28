import Link from '@/components/Link'
import type { SeriesGroup } from '@/lib/series'

type SeriesPostListProps = {
  series: SeriesGroup
}

export default function SeriesPostList({ series }: SeriesPostListProps) {
  return (
    <div className="archive-wrap">
      <ol className="mini-post-list series-post-list">
        {series.posts.map((post, index) => (
          <li className="series-post-item" key={post.path}>
            <span className="series-part-label">Part {index + 1}</span>
            <div className="post-preview item">
              <Link href={`/${post.path}/`}>
                <h2 className="post-title">{post.title}</h2>
                {post.subtitle && <h3 className="post-subtitle">{post.subtitle}</h3>}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
