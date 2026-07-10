import Link from '@/components/Link'
import HuxHero from '@/components/hux/HuxHero'
import { genPageMetadata } from 'app/seo'

export const metadata = genPageMetadata({
  title: '404',
  description: '找不到這個頁面。',
  robots: { index: false, follow: true },
})

export default function NotFound() {
  return (
    <>
      <HuxHero variant="archive" title="404" subtitle="Oops! 404:(" headerImg="/img/404-bg.webp" />
      <div className="mx-auto max-w-md px-4 py-8 text-center">
        <p className="mb-8">這個頁面不存在,可能已被移動或刪除。</p>
        <ul className="pager">
          <li>
            <Link href="/">回首頁 →</Link>
          </li>
        </ul>
      </div>
    </>
  )
}
