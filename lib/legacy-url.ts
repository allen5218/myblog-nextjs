export function stripPostDatePrefix(fileName: string) {
  return fileName.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(md|mdx|markdown)$/, '')
}

export function legacyPathFromDateAndSlug(dateInput: string | Date, slug: string) {
  const date = new Date(dateInput)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}/${month}/${day}/${slug}`
}

export type LegacyParams = {
  year: string
  month: string
  day: string
  slug: string
}

export function legacyParamsFromPath(legacyPath: string): LegacyParams {
  const [year, month, day, ...rest] = legacyPath.split('/')
  return { year, month, day, slug: rest.join('/') }
}

export function legacyPathFromParams(params: LegacyParams): string {
  return `${params.year}/${params.month}/${params.day}/${params.slug}`
}
