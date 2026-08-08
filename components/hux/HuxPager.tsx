import Link from '@/components/Link'

type PagerLink = {
  href: string
  title: string
}

// href 一律是完整路徑,由 lib/pagination 產生。不要在這裡拼接前綴 ——
// 「第 1 頁就是 /」這種事只有 lib/pagination 知道。
export default function HuxPager({
  next,
  prev,
  variant,
}: {
  next?: PagerLink
  prev?: PagerLink
  variant: 'article' | 'list'
}) {
  if (!next && !prev) return null

  return (
    <ul className={`pager pager-${variant}`}>
      {prev && (
        <li className="previous">
          {variant === 'article' ? (
            <Link href={prev.href}>
              <span className="pager-label">Previous</span>
              <span className="pager-title">{prev.title}</span>
            </Link>
          ) : (
            <Link href={prev.href}>← {prev.title}</Link>
          )}
        </li>
      )}
      {next && (
        <li className="next">
          {variant === 'article' ? (
            <Link href={next.href}>
              <span className="pager-label">Next</span>
              <span className="pager-title">{next.title}</span>
            </Link>
          ) : (
            <Link href={next.href}>{next.title} →</Link>
          )}
        </li>
      )}
    </ul>
  )
}
