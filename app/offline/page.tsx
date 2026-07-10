import Link from '@/components/Link'
import HuxHero from '@/components/hux/HuxHero'
import { genPageMetadata } from 'app/seo'

export const metadata = genPageMetadata({
  title: '離線',
  description: '目前沒有網路連線,已瀏覽過的頁面仍可離線閱讀。',
  robots: { index: false, follow: true },
})

export default function OfflinePage() {
  return (
    <>
      <HuxHero
        variant="archive"
        title="離線"
        subtitle="閱讀過的頁面可以在離線時訪問哦 ;)"
        headerImg="/img/404-bg.webp"
      />
      <div className="mx-auto max-w-md px-4 py-8 text-center">
        <p className="mb-8">已瀏覽過的頁面仍會從快取顯示,重新連線後即可繼續閱讀其他文章。</p>
        <ul className="pager">
          <li>
            <Link href="/">回首頁 →</Link>
          </li>
        </ul>
      </div>
    </>
  )
}
