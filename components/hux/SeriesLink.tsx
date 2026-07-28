import Link from '@/components/Link'
import { seriesHref } from '@/lib/series'

type SeriesLinkProps = {
  series: string
  className?: string
}

export default function SeriesLink({ series, className }: SeriesLinkProps) {
  return (
    <div className={className}>
      <span>Series:</span> <Link href={seriesHref(series)}>{series}</Link>
    </div>
  )
}
