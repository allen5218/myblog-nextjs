import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import HuxHero from '../../components/hux/HuxHero'
import PostSeriesLink from '../../components/hux/PostSeriesLink'
import SeriesLink from '../../components/hux/SeriesLink'

describe('series rendering', () => {
  test('does not render links for blank or invalid names', () => {
    expect(renderToStaticMarkup(createElement(SeriesLink, { series: '   ' }))).toBe('')
    expect(renderToStaticMarkup(createElement(SeriesLink, { series: '!!!' }))).toBe('')
  })

  test('does not render collection links for hidden or draft posts', () => {
    for (const visibility of [{ listed: false }, { draft: true }]) {
      const html = renderToStaticMarkup(
        createElement(PostSeriesLink, {
          placement: 'bottom',
          post: {
            date: '2026-07-25',
            path: 'fixture',
            title: 'Fixture article',
            series: 'Fixture Series',
            ...visibility,
          },
        })
      )
      expect(html).toBe('')
    }
  })

  test('keeps Updated, Posted, then Series order in the Hux hero', () => {
    const html = renderToStaticMarkup(
      createElement(HuxHero, {
        title: 'Fixture article',
        update: '2026-07-28',
        date: '2026-07-25',
        seriesPost: {
          date: '2026-07-25',
          path: 'fixture',
          title: 'Fixture article',
          series: 'Fixture Series',
        },
      })
    )

    expect(html.indexOf('Updated on')).toBeLessThan(html.indexOf('Posted by'))
    expect(html.indexOf('Posted by')).toBeLessThan(html.indexOf('Part of the'))
    expect(html).toMatch(
      /Part of the <a [^>]*href="\/series\/fixture-series"[^>]*>Fixture Series<\/a> series/
    )
  })

  test.each([
    ['PostLayout.tsx', 'seriesPost={content}'],
    ['PostSimple.tsx', 'placement="top"'],
    ['PostBanner.tsx', 'placement="top"'],
  ])('%s includes eligible top and bottom series placements', (layout, topContract) => {
    const source = readFileSync(resolve(process.cwd(), 'layouts', layout), 'utf8')

    expect(source).toContain(topContract)
    expect(source).toContain('placement="bottom"')
    expect(source).toContain('PostSeriesLink')
  })
})
