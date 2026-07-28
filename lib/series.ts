import { slug } from 'github-slugger'

export type SeriesPost = {
  date: string
  path: string
  title: string
  subtitle?: string
  series?: string
  listed?: boolean
  draft?: boolean
}

export type SeriesGroup<T extends SeriesPost = SeriesPost> = {
  name: string
  slug: string
  posts: T[]
}

export function seriesSlug(name: string): string {
  return slug(name.trim())
}

export function seriesHref(name: string): string {
  return `/series/${seriesSlug(name)}/`
}

export function collectSeries<T extends SeriesPost>(posts: T[]): SeriesGroup<T>[] {
  const groups = new Map<string, SeriesGroup<T>>()

  for (const post of posts) {
    const name = post.series?.trim()
    if (!name || post.listed === false || post.draft === true) continue

    const seriesSlugValue = seriesSlug(name)
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
        (left, right) => left.date.localeCompare(right.date) || left.path.localeCompare(right.path)
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
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
