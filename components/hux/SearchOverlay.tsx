'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'

type SearchDocument = {
  title: string
  date?: string
  tags?: string[]
  subtitle?: string
  summary?: string
  path?: string
  url?: string
}

type SearchOverlayProps = {
  open: boolean
  onClose: () => void
}

const MAX_RESULTS = 20
const searchDocumentsPath =
  (siteMetadata.search?.provider === 'kbar' &&
    siteMetadata.search.kbarConfig.searchDocumentsPath) ||
  `${process.env.BASE_PATH || ''}/search.json`

function getSearchHref(post: SearchDocument) {
  if (post.url) return post.url
  return post.path ? `/${post.path.replace(/^\/|\/$/g, '')}/` : '/'
}

function searchableText(post: SearchDocument) {
  return [post.title, post.subtitle, post.summary, ...(post.tags || [])].filter(Boolean).join(' ')
}

export default function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [documents, setDocuments] = useState<SearchDocument[]>([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!open || documents.length || loadError) return

    const controller = new AbortController()

    fetch(searchDocumentsPath, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load search index')
        return response.json()
      })
      .then((searchDocuments: SearchDocument[]) => setDocuments(searchDocuments))
      .catch((error) => {
        if (error.name !== 'AbortError') setLoadError(true)
      })

    return () => controller.abort()
  }, [documents.length, loadError, open])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return documents.slice(0, MAX_RESULTS)

    return documents
      .filter((post) => searchableText(post).toLowerCase().includes(normalizedQuery))
      .slice(0, MAX_RESULTS)
  }, [documents, query])

  if (!open) return null

  return (
    <div className="hux-search-overlay" role="dialog" aria-modal="true" aria-label="Search posts">
      <button
        className="hux-search-backdrop"
        type="button"
        aria-label="Close search"
        onClick={onClose}
      />
      <div className="hux-search-panel">
        <button
          className="hux-search-close"
          type="button"
          onClick={onClose}
          aria-label="Close search"
        >
          &times;
        </button>
        <label className="sr-only" htmlFor="hux-search-input">
          Search posts
        </label>
        <input
          ref={inputRef}
          id="hux-search-input"
          className="hux-search-input"
          type="search"
          placeholder="Search..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="hux-search-results mini-post-list">
          {loadError && <p className="hux-search-status">Search index could not be loaded.</p>}
          {!loadError && !documents.length && <p className="hux-search-status">Loading posts...</p>}
          {!!documents.length && !results.length && (
            <p className="hux-search-status">No results found.</p>
          )}
          {results.map((post) => {
            const href = getSearchHref(post)
            return (
              <div className="post-preview item" key={href}>
                <Link href={href} onClick={onClose}>
                  <h2 className="post-title">{post.title}</h2>
                  {post.subtitle && <h3 className="post-subtitle">{post.subtitle}</h3>}
                </Link>
                {!!post.tags?.length && <p className="hux-search-tags">{post.tags.join(', ')}</p>}
                <hr />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
