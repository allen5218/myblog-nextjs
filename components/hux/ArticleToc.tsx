type TocItem = {
  value: string
  url: string
  depth: number
}

type TocNode = TocItem & {
  children: TocNode[]
}

type ArticleTocProps = {
  toc?: TocItem[]
  enabled?: boolean
}

function buildTocTree(toc: TocItem[]) {
  const roots: TocNode[] = []
  const stack: TocNode[] = []

  toc
    .filter((item) => item.url && item.value && item.depth >= 2 && item.depth <= 4)
    .forEach((item) => {
      const node: TocNode = { ...item, children: [] }

      while (stack.at(-1) && stack.at(-1)!.depth >= item.depth) {
        stack.pop()
      }

      if (item.depth === 2) {
        roots.push(node)
      } else {
        stack.at(-1)?.children.push(node)
      }

      stack.push(node)
    })

  return roots
}

function TocList({ items }: { items: TocNode[] }) {
  return (
    <ol className="article-toc-list">
      {items.map((item) => (
        <li className={`article-toc-depth-${item.depth}`} key={item.url}>
          <a href={item.url} rel="nofollow">
            {item.value}
          </a>
          {item.children.length > 0 && <TocList items={item.children} />}
        </li>
      ))}
    </ol>
  )
}

export default function ArticleToc({ toc, enabled = true }: ArticleTocProps) {
  const items = enabled && toc ? buildTocTree(toc) : []

  if (!items.length) return null

  return (
    <nav className="article-toc" aria-label="Table of contents">
      <details>
        <summary>TABLE OF CONTENTS</summary>
        <TocList items={items} />
      </details>
    </nav>
  )
}
