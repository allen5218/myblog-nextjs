import Link from '@/components/Link'

type PagerPost = {
  path: string
  title: string
}

export default function HuxPager({ next, prev }: { next?: PagerPost; prev?: PagerPost }) {
  if (!next && !prev) return null

  return (
    <ul className="pager">
      {prev?.path && (
        <li className="previous">
          <Link href={`/${prev.path}`}>← {prev.title}</Link>
        </li>
      )}
      {next?.path && (
        <li className="next">
          <Link href={`/${next.path}`}>{next.title} →</Link>
        </li>
      )}
    </ul>
  )
}
