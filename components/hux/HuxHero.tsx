import siteMetadata from '@/data/siteMetadata'
import Link from '@/components/Link'
import { formatHuxDate } from '../../lib/hux-date'
import { resolveHeroIframeSrc } from '@/lib/iframe'

type HuxHeroProps = {
  variant?: 'archive' | 'home' | 'post'
  title: string
  subtitle?: string
  author?: string
  date?: string
  update?: string
  tags?: string[]
  headerImg?: string
  headerBgCss?: string
  headerMask?: number | string
  iframe?: string
}

function resolveHeaderImage(src?: string) {
  if (!src) return '/img/home-bg.avif'
  if (src.startsWith('http') || src.startsWith('/')) return src
  return `/${src}`
}

export default function HuxHero({
  variant = 'post',
  title,
  subtitle,
  author,
  date,
  update,
  tags,
  headerImg,
  headerBgCss,
  headerMask,
  iframe,
}: HuxHeroProps) {
  const maskOpacity = headerMask == null || headerMask === '' ? undefined : Number(headerMask)
  const iframeSrc = resolveHeroIframeSrc(iframe)
  const hasIframe = Boolean(iframeSrc)
  // frontmatter 的 headerBgCss 常帶著從 CSS 片段複製貼上留下的尾隨分號(如
  // "linear-gradient(...);");當成純 HTML style 屬性字串沒問題,但 React 走
  // client 端渲染(SPA 導覽、非 SSR hydration)時是透過 CSSOM setter 賦值,分號
  // 會讓整個值被判定無效而整個跳過不套用 —— 這正是「站內連結進來背景消失、重新
  // 整理才正常」的成因,先在這裡把它清乾淨,不管資料來源有沒有分號都能用。
  const cleanedBgCss = headerBgCss?.trim().replace(/;+\s*$/, '')
  const style = hasIframe
    ? undefined
    : cleanedBgCss
      ? { background: cleanedBgCss }
      : {
          backgroundColor: headerImg ? undefined : '#2D2D2D',
          backgroundImage: `url(${resolveHeaderImage(headerImg)})`,
        }

  return (
    <header
      className={`hux-full-bleed intro-header ${
        variant === 'home'
          ? 'intro-header-home'
          : variant === 'archive'
            ? 'intro-header-archive'
            : 'intro-header-post'
      } ${hasIframe ? 'intro-header-keynote' : ''}`}
      style={style}
    >
      {maskOpacity !== undefined && !Number.isNaN(maskOpacity) && (
        <div className="header-mask" style={{ backgroundColor: `rgba(0, 0, 0, ${maskOpacity})` }} />
      )}
      {hasIframe && (
        <iframe
          className="keynote-frame"
          src={iframeSrc}
          title={title}
          loading="lazy"
          allowFullScreen
        />
      )}
      <div className={hasIframe ? 'sr-only' : 'intro-header-content'}>
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
          </div>
        )}
      </div>
    </header>
  )
}
