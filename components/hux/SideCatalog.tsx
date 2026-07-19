'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type TocItem = {
  value: string
  url: string
  depth: number
}

type SideCatalogProps = {
  toc?: TocItem[]
  enabled?: boolean
}

type TocSection = {
  parent: TocItem
  children: TocItem[]
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
  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(() => new Set())
  const containerRef = useRef<HTMLElement>(null)

  const items = useMemo(
    () => (enabled ? toc?.filter((item) => item.url && item.value) || [] : []),
    [enabled, toc]
  )
  const sections = useMemo(
    () =>
      items.reduce<TocSection[]>((grouped, item) => {
        if (item.depth === 2) {
          grouped.push({ parent: item, children: [] })
        } else if (item.depth > 2) {
          grouped.at(-1)?.children.push(item)
        }
        return grouped
      }, []),
    [items]
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

  // 目錄框身在長文章 + 矮視窗時會超出視窗高度(見 css/tailwind.css 的 max-height),
  // 用 overflow:hidden 裁切超出的部分,不讓使用者用滑鼠滾輪操控(避免重現攔截頁面
  // 捲動的舊 bug)。改成這裡手動捲動:目前閱讀到的標題一改變,就把目錄容器自己的
  // scrollTop 調整到剛好露出那一項——只動這個容器的 scrollTop,不用 scrollIntoView
  // (它可能連帶捲動外層文件),所以不會影響頁面本身的捲動位置。
  useEffect(() => {
    if (!activeUrl) return
    const container = containerRef.current
    const active = container?.querySelector<HTMLElement>('li.active')
    if (!container || !active) return

    // 用 getBoundingClientRect 算相對位置,不用 offsetTop——.catalog-body 是
    // position:relative,li 的 offsetParent 會是它而不是這個容器,offsetTop 會漏算
    // 上面 <hr>/<h5> 的高度。
    const containerRect = container.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const overflowTop = activeRect.top - containerRect.top
    const overflowBottom = activeRect.bottom - containerRect.bottom

    if (overflowTop < 0) {
      container.scrollTop += overflowTop
    } else if (overflowBottom > 0) {
      container.scrollTop += overflowBottom
    }
  }, [activeUrl])

  if (!sections.length) return null

  return (
    <aside
      className={`catalog-container side-catalog ${folded ? 'fold' : ''}`}
      aria-label="Post catalog"
      ref={containerRef}
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
        {sections.map(({ parent, children }, sectionIndex) => {
          const expanded = expandedUrls.has(parent.url)
          const containsActive =
            activeUrl === parent.url || children.some((item) => item.url === activeUrl)
          const parentIsActive = activeUrl === parent.url || (!expanded && containsActive)
          const childListId = `catalog-children-${sectionIndex}`

          return (
            <li
              className={`h${parent.depth}_nav ${parentIsActive ? 'active' : ''}`}
              key={`${parent.url}-${parent.value}`}
            >
              <div className="catalog-item-row">
                <a href={parent.url} rel="nofollow">
                  {parent.value}
                </a>
                {children.length > 0 && (
                  <button
                    aria-controls={childListId}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? '收合' : '展開'}「${parent.value}」的子目錄`}
                    className="catalog-expand"
                    type="button"
                    onClick={() =>
                      setExpandedUrls((current) => {
                        const next = new Set(current)
                        if (next.has(parent.url)) {
                          next.delete(parent.url)
                        } else {
                          next.add(parent.url)
                        }
                        return next
                      })
                    }
                  >
                    <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                  </button>
                )}
              </div>
              {expanded && (
                <ul className="catalog-children" id={childListId}>
                  {children.map((item) => (
                    <li
                      className={`h${item.depth}_nav ${activeUrl === item.url ? 'active' : ''}`}
                      key={`${item.url}-${item.value}`}
                    >
                      <div className="catalog-item-row">
                        <a href={item.url} rel="nofollow">
                          {item.value}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
