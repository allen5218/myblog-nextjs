import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { allBlogs } from 'contentlayer/generated'
import { genPageMetadata } from 'app/seo'
import HuxHero from '@/components/hux/HuxHero'
import SeriesPostList from '@/components/hux/SeriesPostList'
import { collectSeries, findSeriesBySlug } from '@/lib/series'

type SeriesPageProps = {
  params: Promise<{ series: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return collectSeries(allBlogs).map((group) => ({ series: group.slug }))
}

export async function generateMetadata({ params }: SeriesPageProps): Promise<Metadata> {
  const { series } = await params
  const group = findSeriesBySlug(allBlogs, series)

  if (!group) return {}

  return genPageMetadata({
    title: group.name,
    description: `Posts in the ${group.name} series.`,
  })
}

export default async function SeriesDetailPage({ params }: SeriesPageProps) {
  const { series } = await params
  const group = findSeriesBySlug(allBlogs, series)

  if (!group) notFound()

  return (
    <>
      <HuxHero
        variant="archive"
        title={group.name}
        subtitle="Series"
        headerImg="/img/bg-flamingo-lagoon.webp"
      />
      <SeriesPostList series={group} />
    </>
  )
}
