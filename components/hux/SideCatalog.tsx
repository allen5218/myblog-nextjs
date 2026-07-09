'use client'

import { useEffect, useMemo, useState } from 'react'

type TocItem = {
  value: string
  url: string
  depth: number
}

type SideCatalogProps = {
  toc?: TocItem[]
  enabled?: boolean
}

function headingIdFromUrl(url: string) {
  const id = url.replace(/^#/, '')
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}

export default function SideCatalog({ toc, enabled = true }: SideCatalogProps) {
  const [folded, setFolded] = useState(false)
  const [activeUrl, setActiveUrl] = useState(toc?.[0]?.url || '')

  const items = useMemo(
    () => (enabled ? toc?.filter((item) => item.url && item.value) || [] : []),
    [enabled, toc]
  )

  useEffect(() => {
    if (!items.length) return

    const headings = items
      .map((item) => document.getElementById(headingIdFromUrl(item.url)))
      .filter((heading): heading is HTMLElement => Boolean(heading))

    if (!headings.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]

        if (visible?.target.id) {
          setActiveUrl(`#${visible.target.id}`)
        }
      },
      { rootMargin: '-80px 0px -65% 0px', threshold: [0, 1] }
    )

    headings.forEach((heading) => observer.observe(heading))

    return () => observer.disconnect()
  }, [items])

  if (!items.length) return null

  return (
    <aside
      className={`catalog-container side-catalog ${folded ? 'fold' : ''}`}
      aria-label="Post catalog"
    >
      <hr />
      <h5>
        <button
          className="catalog-toggle"
          type="button"
          onClick={() => setFolded((value) => !value)}
        >
          CATALOG
        </button>
      </h5>
      <ul className="catalog-body">
        {items.map((item) => (
          <li
            className={`h${item.depth}_nav ${activeUrl === item.url ? 'active' : ''}`}
            key={`${item.url}-${item.value}`}
          >
            <a href={item.url} rel="nofollow">
              {item.value}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}
