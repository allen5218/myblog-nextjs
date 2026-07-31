import siteMetadata from '@/data/siteMetadata'
import Link from '@/components/Link'
import PostSeriesLink from '@/components/hux/PostSeriesLink'
import type { SeriesPost } from '@/lib/series'
import { formatHuxDate } from '../../lib/hux-date'
import { parseHeroConfiguration } from '@/lib/hero-config'
import { resolveHeroSurface } from '@/lib/hero-mode'

type HuxHeroBaseProps = {
  title: string
  subtitle?: string
  author?: string
  date?: string
  update?: string
  tags?: string[]
  seriesPost?: SeriesPost
  headerImg?: string
  headerBgCss?: string
  headerMask?: number | string
  iframe?: string
}

/**
 * 首頁與 archive 不支援 text 模式(兩者都寫死 headerImg),用 headerStyle?: never
 * 把「非目標」的組合從型別上封死,而不是靠註解約束。
 */
type HuxHeroProps = HuxHeroBaseProps &
  (
    | { variant: 'home' | 'archive'; headerStyle?: never }
    | { variant?: 'post'; headerStyle?: 'text' }
  )

export default function HuxHero({
  variant = 'post',
  title,
  subtitle,
  author,
  date,
  update,
  tags,
  seriesPost,
  headerImg,
  headerBgCss,
  headerMask,
  iframe,
  headerStyle,
}: HuxHeroProps) {
  const { mode, maskOpacity } = resolveHeroSurface(
    parseHeroConfiguration({ headerStyle, headerImg, headerBgCss, headerMask, iframe })
  )

  // text 模式必須完全不產生 style —— inline style 贏過任何 class 規則,
  // 純 CSS 蓋不掉 backgroundImage 的 fallback。
  const style =
    mode.kind === 'keynote' || mode.kind === 'text'
      ? undefined
      : mode.kind === 'css-background'
        ? { background: mode.background }
        : {
            backgroundColor: mode.fallbackColor ?? undefined,
            backgroundImage: `url(${mode.url})`,
          }

  const variantClass =
    variant === 'home'
      ? 'intro-header-home'
      : variant === 'archive'
        ? 'intro-header-archive'
        : 'intro-header-post'

  const modeClass =
    mode.kind === 'keynote'
      ? 'intro-header-keynote'
      : mode.kind === 'text'
        ? 'intro-header-text'
        : ''

  return (
    <header className={`hux-full-bleed intro-header ${variantClass} ${modeClass}`} style={style}>
      {maskOpacity !== null && (
        <div className="header-mask" style={{ backgroundColor: `rgba(0, 0, 0, ${maskOpacity})` }} />
      )}
      {mode.kind === 'keynote' && (
        <iframe
          className="keynote-frame"
          src={mode.iframeSrc}
          title={title}
          loading="lazy"
          allowFullScreen
        />
      )}
      <div className={mode.kind === 'keynote' ? 'sr-only' : 'intro-header-content'}>
        {variant === 'home' || variant === 'archive' ? (
          <div className="site-heading">
            <h1>{title}</h1>
            {subtitle && <span className="subheading">{subtitle}</span>}
          </div>
        ) : (
          <div className="post-heading">
            {!!tags?.length && (
              <div className="tags">
                {tags.map((tag) => (
                  <Link className="tag" href={`/archive/?tag=${encodeURIComponent(tag)}`} key={tag}>
                    {tag}
                  </Link>
                ))}
              </div>
            )}
            <h1>{title}</h1>
            {subtitle && <h2 className="subheading">{subtitle}</h2>}
            {update && <span className="meta">Updated on {formatHuxDate(update)}</span>}
            {date && (
              <span className="meta">
                Posted by {author || siteMetadata.author} on {formatHuxDate(date)}
              </span>
            )}
            {seriesPost && (
              <PostSeriesLink className="series-meta" placement="top" post={seriesPost} />
            )}
          </div>
        )}
      </div>
    </header>
  )
}
