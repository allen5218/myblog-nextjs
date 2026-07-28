import { slug } from 'github-slugger'

export type SeriesPost = {
  date: string
  lastmod?: string
  path: string
  title: string
  subtitle?: string
  series?: string
  listed?: boolean
  draft?: boolean
}

export type SeriesIdentity = {
  name: string
  slug: string
}

export type SeriesGroup<T extends SeriesPost = SeriesPost> = {
  name: string
  slug: string
  posts: T[]
}

export function seriesSlug(name: string): string {
  return slug(name.trim())
}

export function seriesIdentity(name?: string): SeriesIdentity | undefined {
  const normalizedName = name?.trim()
  if (!normalizedName) return

  const normalizedSlug = seriesSlug(normalizedName)
  if (!normalizedSlug) return

  return { name: normalizedName, slug: normalizedSlug }
}

export function seriesHref(name: string): string {
  const identity = seriesIdentity(name)
  if (!identity) {
    throw new Error(`Series name "${name}" must normalize to a non-empty slug`)
  }
  return `/series/${identity.slug}/`
}

export function seriesIdentityForPost(post: SeriesPost): SeriesIdentity | undefined {
  if (post.listed === false || post.draft === true) return
  return seriesIdentity(post.series)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function latestSeriesLastModified(posts: SeriesPost[]): string | undefined {
  return posts
    .map((post) => post.lastmod || post.date)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]
}

export function collectSeries<T extends SeriesPost>(posts: T[]): SeriesGroup<T>[] {
  const groups = new Map<string, SeriesGroup<T>>()

  for (const post of posts) {
    const name = post.series?.trim()
    if (!name) continue

    const identity = seriesIdentity(name)
    if (!identity) {
      throw new Error(`Series name "${name}" must normalize to a non-empty slug`)
    }
    if (!seriesIdentityForPost(post)) continue

    const seriesSlugValue = identity.slug
    const existing = groups.get(seriesSlugValue)
    if (existing && existing.name !== name) {
      throw new Error(
        `Series slug collision for "${seriesSlugValue}" between "${existing.name}" and "${name}"`
      )
    }

    if (existing) {
      existing.posts.push(post)
    } else {
      groups.set(seriesSlugValue, { name, slug: seriesSlugValue, posts: [post] })
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      posts: [...group.posts].sort(
        (left, right) => compareText(left.date, right.date) || compareText(left.path, right.path)
      ),
    }))
    .sort((left, right) => compareText(left.name, right.name))
}

export function findSeriesBySlug<T extends SeriesPost>(
  posts: T[],
  value: string
): SeriesGroup<T> | undefined {
  let decodedValue = value
  try {
    decodedValue = decodeURIComponent(value)
  } catch {
    // Keep malformed route input unmatched instead of throwing during rendering.
  }

  return collectSeries(posts).find((group) => group.slug === decodedValue)
}
