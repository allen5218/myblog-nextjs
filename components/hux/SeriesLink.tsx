import Link from '@/components/Link'
import { seriesHref, seriesIdentity } from '@/lib/series'

type SeriesLinkProps = {
  series: string
  className?: string
}

export default function SeriesLink({ series, className }: SeriesLinkProps) {
  const identity = seriesIdentity(series)
  if (!identity) return null

  return (
    <div className={className}>
      <span>Series:</span> <Link href={seriesHref(identity.name)}>{identity.name}</Link>
    </div>
  )
}
