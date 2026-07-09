import siteMetadata from '@/data/siteMetadata'
import { Rss, Github, X, Facebook, Linkedin, Reddit, Buymeacoffee } from '../social-icons/icons'

// 舊站(Hux)的 SNS 圖標:圓形反色 + hover 浮動,改用自訂 SVG 重現(不再依賴 Fork Awesome)。
// 只顯示有設定連結的項目;RSS 固定連到 /feed.xml。
const links = [
  { kind: 'rss', href: '/feed.xml', Icon: Rss, label: 'RSS' },
  { kind: 'github', href: siteMetadata.github, Icon: Github, label: 'GitHub' },
  { kind: 'x', href: siteMetadata.x, Icon: X, label: 'X' },
  { kind: 'facebook', href: siteMetadata.facebook, Icon: Facebook, label: 'Facebook' },
  { kind: 'linkedin', href: siteMetadata.linkedin, Icon: Linkedin, label: 'LinkedIn' },
  { kind: 'reddit', href: siteMetadata.reddit, Icon: Reddit, label: 'Reddit' },
  {
    kind: 'buymeacoffee',
    href: siteMetadata.buymeacoffee,
    Icon: Buymeacoffee,
    label: 'Buy Me a Coffee',
  },
] as const

export default function HuxSocial({ className = '' }: { className?: string }) {
  const shown = links.filter((link) => link.href)
  if (!shown.length) return null

  return (
    <ul className={`hux-sns ${className}`.trim()}>
      {shown.map(({ kind, href, Icon, label }) => {
        const external = href.startsWith('http')
        return (
          <li key={kind}>
            <a
              href={href}
              aria-label={label}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
            >
              <span className="sr-only">{label}</span>
              <Icon className="hux-sns-glyph" />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
