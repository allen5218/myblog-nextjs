import Link from '@/components/Link'

type PagerLink = {
  href: string
  title: string
}

// href 一律是完整路徑,由 lib/pagination 產生。不要在這裡拼接前綴 ——
// 「第 1 頁就是 /」這種事只有 lib/pagination 知道。
export default function HuxPager({ next, prev }: { next?: PagerLink; prev?: PagerLink }) {
  if (!next && !prev) return null

  return (
    <ul className="pager">
      {prev && (
        <li className="previous">
          <Link href={prev.href}>← {prev.title}</Link>
        </li>
      )}
      {next && (
        <li className="next">
          <Link href={next.href}>{next.title} →</Link>
        </li>
      )}
    </ul>
  )
}
