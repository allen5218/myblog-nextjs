import SeriesLink from '@/components/hux/SeriesLink'
import { seriesIdentityForPost, type SeriesPost } from '@/lib/series'

type PostSeriesLinkProps = {
  post: SeriesPost
  placement: 'top' | 'bottom'
  className?: string
}

export default function PostSeriesLink({ post, placement, className }: PostSeriesLinkProps) {
  const identity = seriesIdentityForPost(post)
  if (!identity) return null

  const classes = ['post-series-link', `post-series-link-${placement}`, className]
    .filter(Boolean)
    .join(' ')
  return (
    <SeriesLink
      className={classes}
      series={identity.name}
      variant={placement === 'top' ? 'sentence' : 'label'}
    />
  )
}
