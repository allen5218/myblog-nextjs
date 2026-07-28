import Link from '@/components/Link'
import { seriesHref, type SeriesGroup } from '@/lib/series'

type SeriesIndexProps = {
  series: SeriesGroup[]
}

export default function SeriesIndex({ series }: SeriesIndexProps) {
  return (
    <div className="archive-wrap">
      <div className="mini-post-list series-index-list">
        {series.map((group) => {
          const count = group.posts.length

          return (
            <section className="series-index-item" key={group.slug}>
              <Link className="series-index-link" href={seriesHref(group.name)}>
                {group.name}
              </Link>
              <span className="series-post-count">
                {count} {count === 1 ? 'post' : 'posts'}
              </span>
            </section>
          )
        })}
      </div>
    </div>
  )
}
