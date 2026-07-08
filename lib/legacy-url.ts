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
