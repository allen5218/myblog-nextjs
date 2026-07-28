import Link from '@/components/Link'
import { seriesHref, seriesIdentity } from '@/lib/series'

type SeriesLinkProps = {
  series: string
  className?: string
  variant?: 'label' | 'sentence'
}

export default function SeriesLink({ series, className, variant = 'label' }: SeriesLinkProps) {
  const identity = seriesIdentity(series)
  if (!identity) return null

  return (
    <div className={className}>
      {variant === 'sentence' ? (
        <>
          Part of the <Link href={seriesHref(identity.name)}>{identity.name}</Link> series
        </>
      ) : (
        <>
          <span>Series:</span> <Link href={seriesHref(identity.name)}>{identity.name}</Link>
        </>
      )}
    </div>
  )
}
