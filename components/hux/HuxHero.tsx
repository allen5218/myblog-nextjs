import siteMetadata from '@/data/siteMetadata'

type HuxHeroProps = {
  variant?: 'home' | 'post'
  title: string
  subtitle?: string
  author?: string
  date?: string
  tags?: string[]
  headerImg?: string
  headerBgCss?: string
  headerMask?: number | string
  iframe?: string
}

function resolveHeaderImage(src?: string) {
  if (!src) return '/img/home-bg.webp'
  if (src.startsWith('http') || src.startsWith('/')) return src
  return `/${src}`
}

function formatPostDate(date?: string) {
  if (!date) return ''
  return new Date(date).toLocaleDateString(siteMetadata.locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function HuxHero({
  variant = 'post',
  title,
  subtitle,
  author,
  date,
  tags,
  headerImg,
  headerBgCss,
  headerMask,
  iframe,
}: HuxHeroProps) {
  const maskOpacity = headerMask == null || headerMask === '' ? undefined : Number(headerMask)
  const hasIframe = Boolean(iframe)
  const style = hasIframe
    ? undefined
    : headerBgCss
      ? { background: headerBgCss }
      : { backgroundImage: `url(${resolveHeaderImage(headerImg)})` }

  return (
    <header
      className={`hux-full-bleed intro-header ${variant === 'home' ? 'intro-header-home' : 'intro-header-post'} ${
        hasIframe ? 'intro-header-keynote' : ''
      }`}
      style={style}
    >
      {maskOpacity !== undefined && !Number.isNaN(maskOpacity) && (
        <div className="header-mask" style={{ backgroundColor: `rgba(0, 0, 0, ${maskOpacity})` }} />
      )}
      {hasIframe && (
        <iframe
          className="keynote-frame"
          src={iframe?.startsWith('//') ? `https:${iframe}` : iframe}
          title={title}
          loading="lazy"
          allowFullScreen
        />
      )}
      <div className={hasIframe ? 'sr-only' : 'intro-header-content'}>
        {variant === 'home' ? (
          <div className="site-heading">
            <h1>{title}</h1>
            {subtitle && <span className="subheading">{subtitle}</span>}
          </div>
        ) : (
          <div className="post-heading">
            <h1>{title}</h1>
            {subtitle && <h2 className="subheading">{subtitle}</h2>}
            {date && (
              <span className="meta">
                Posted by {author || siteMetadata.author} on {formatPostDate(date)}
              </span>
            )}
            {!!tags?.length && (
              <div className="tags">
                {tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
