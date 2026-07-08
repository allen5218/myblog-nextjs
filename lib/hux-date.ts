export function formatHuxDate(dateInput?: string) {
  if (!dateInput) return ''
  return new Date(dateInput).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
