const responsiveIframeHosts = ['youtube.com', 'youtube-nocookie.com', 'youtu.be', 'vimeo.com']
const heroIframeOrigins = ['https://slide.allenspace.de']

function parseExternalUrl(src?: string) {
  if (!src) return null

  try {
    return new URL(src.startsWith('//') ? `https:${src}` : src)
  } catch {
    return null
  }
}

function matchesHost(hostname: string, allowedHost: string) {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
}

export function isResponsiveIframeSrc(src?: string) {
  const url = parseExternalUrl(src)
  if (!url) return false

  return responsiveIframeHosts.some((host) => matchesHost(url.hostname.toLowerCase(), host))
}

export function resolveHeroIframeSrc(src?: string) {
  const url = parseExternalUrl(src)
  if (!url) return undefined

  return heroIframeOrigins.includes(url.origin) ? url.href : undefined
}
