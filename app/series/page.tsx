import { allBlogs } from 'contentlayer/generated'
import { genPageMetadata } from 'app/seo'
import HuxHero from '@/components/hux/HuxHero'
import SeriesIndex from '@/components/hux/SeriesIndex'
import { collectSeries } from '@/lib/series'

export const metadata = genPageMetadata({
  title: 'Series',
  description: 'Collections of related posts.',
})

export default function SeriesPage() {
  return (
    <>
      <HuxHero
        variant="archive"
        title="Series"
        subtitle="Collections of related posts."
        headerImg="/img/bg-little-universe.jpg"
      />
      <SeriesIndex series={collectSeries(allBlogs)} />
    </>
  )
}
